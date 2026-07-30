import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { spawnZapContainer } from "@/lib/docker/manager"
import { checkDockerQuota } from "@/lib/docker/quota"
import { logAudit } from "@/lib/utils/audit-server"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { validateTargetUrl } from "@/lib/utils/ssrf-check"
import { encryptJson } from "@/lib/utils/encryption"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rawIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous"
    const ip = rawIp !== "anonymous" ? rawIp.split(',')[0].trim() : "anonymous"
    const rateResult = await slidingWindowRateLimit(`zap-start:${user.id}`, 3, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests. Max 3 ZAP scans per hour." }, { status: 429 })
    }

    const body = await req.json()
    const { project_id, target_url, auth_type, scan_type, auth_config, enable_js_crawl, enable_ajax_spider, auth_methods } = body
    if (!project_id || !target_url) {
      return NextResponse.json({ error: "project_id and target_url are required" }, { status: 400 })
    }

    const ssrfResult = await validateTargetUrl(target_url)
    if (!ssrfResult.safe) {
      const isFormatError = ssrfResult.error?.includes("Invalid URL") || ssrfResult.error?.includes("Could not resolve")
      return NextResponse.json(
        { error: ssrfResult.error || "Security restriction: target_url failed validation" },
        { status: isFormatError ? 400 : 403 }
      )
    }

    const ALLOWED_SCAN_TYPES = ["spider", "active", "full", "ajax-spider", "auth-scan"]
    if (!scan_type || !ALLOWED_SCAN_TYPES.includes(scan_type)) {
      return NextResponse.json({
        error: `Invalid scan_type "${scan_type || ""}". Must be one of: ${ALLOWED_SCAN_TYPES.join(", ")}`,
      }, { status: 400 })
    }

    // Backend validation: for auth-scan, verify enabled methods have required fields
    if (scan_type === "auth-scan") {
      if (!auth_methods || typeof auth_methods !== "object" || Object.keys(auth_methods).length === 0) {
        return NextResponse.json({
          error: "Auth scan requires at least one authentication method",
          detail: "Enable Form, Header, OAuth2, Keycloak, or SSO/SAML and provide the required credentials.",
        }, { status: 400 })
      }
      for (const [method, cfg] of Object.entries(auth_methods)) {
        const c = cfg as Record<string, string>
        switch (method) {
          case "form":
            if (!c.login_url) return NextResponse.json({ error: "Form auth: login_url is required" }, { status: 400 })
            break
          case "header":
            if (!c.header_value) return NextResponse.json({ error: "Header auth: header_value is required" }, { status: 400 })
            break
          case "oauth2":
            if (!c.token_url || !c.client_id)
              return NextResponse.json({ error: "OAuth2: token_url and client_id are required" }, { status: 400 })
            break
          case "keycloak":
            if (!c.base_url) return NextResponse.json({ error: "Keycloak: base_url is required" }, { status: 400 })
            break
          case "sso":
            if (!c.saml_metadata_url)
              return NextResponse.json({ error: "SSO/SAML: saml_metadata_url is required" }, { status: 400 })
            break
        }
      }
    }

    const { data: project } = await supabase
      .from("projects").select("scope, status").eq("id", project_id).eq("org_id", profile.org_id).single()
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    // Scope validation
    if (project.scope) {
      const scopeEntries = project.scope.split(/[\n,]+/).map((s: any) => s.trim()).filter(Boolean)
      const inScope = scopeEntries.some((entry: any) => {
        if (entry.startsWith("*.")) {
          const domain = entry.slice(2)
          try {
            const hostname = new URL(target_url).hostname
            return hostname === domain || hostname.endsWith("." + domain)
          } catch { return target_url.includes(domain) }
        }
        if (entry.endsWith("/*")) {
          const prefix = entry.slice(0, -2)
          return target_url.startsWith(prefix)
        }
        if (entry.includes("/")) {
          return target_url.startsWith(entry)
        }
        return target_url.includes(entry)
      })
      if (!inScope) {
        await logAudit({
          action: "scan.started",
          resource_type: "scan_history",
          resource_id: "out-of-scope",
          new_value: { target_url, project_id, warning: "Target not in project scope" },
        })
        return NextResponse.json({
          error: `Target "${target_url}" is not in project scope. Allowed: ${scopeEntries.join(", ")}`,
        }, { status: 403 })
      }
    }

    const scanId = crypto.randomUUID()
    const pool = getPool()

    // Z-L2 duplicate scan check
    const { rows: existing } = await pool.query(
      `SELECT id FROM scan_history WHERE org_id = $1 AND scan_target = $2 AND status IN ('queued', 'running') LIMIT 1`,
      [profile.org_id, target_url]
    )
    if (existing.length > 0) {
      return NextResponse.json({ error: "A scan for this target is already queued or running" }, { status: 409 })
    }

    // Build scan_config with sensitive credential fields (auth_config,
    // auth_methods) encrypted at rest. Non-sensitive fields stay plaintext so
    // they remain queryable. See lib/utils/encryption.ts (AES-256-GCM).
    const scanConfig = {
      scan_type: scan_type || "full",
      auth_type,
      auth_config: encryptJson(auth_config ?? null),
      enable_js_crawl,
      enable_ajax_spider,
      auth_methods: encryptJson(auth_methods ?? null),
    }

    // Check quota
    const quota = await checkDockerQuota(profile.org_id)

    if (!quota.available) {
      // Queue the scan
      await pool.query(
        `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by)
         VALUES ($1, $2, $3, $4, 'queued', $5::jsonb, $6)`,
        [
          scanId, profile.org_id, project_id, target_url,
          JSON.stringify(scanConfig),
          user.id,
        ]
      )
      await pool.query(
        `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, status, started_by)
         VALUES ($1, $2, $3, 'zap', $4, 'queued', $5)`,
        [scanId, profile.org_id, project_id, target_url, user.id]
      )
      await logAudit({
        action: "scan.started",
        resource_type: "scan_history",
        resource_id: scanId,
        new_value: { target_url, scan_type: "zap", project_id, queued: true, position: quota.queueLength + 1 },
      })
      return NextResponse.json({
        queued: true, scanId, position: quota.queueLength + 1,
        message: `Scan queued. Position: ${quota.queueLength + 1}. A slot will open when a current scan completes.`,
      })
    }

    // Slot available — start immediately
    // Insert scan_history row FIRST, then spawn container.
    // If container spawn fails (throws or returns !success), we clean up the scan row.
    await pool.query(
      `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, status, started_by)
       VALUES ($1, $2, $3, 'zap', $4, 'queued', $5)`,
      [scanId, profile.org_id, project_id, target_url, user.id]
    )

    let container: Awaited<ReturnType<typeof spawnZapContainer>>

    try {
      container = await spawnZapContainer(scanId, profile.org_id, user.id, target_url, scan_type, auth_config, enable_js_crawl, auth_methods, enable_ajax_spider, profile.role, ssrfResult.resolvedIp)
      if (!container.success) {
        // If the slot was taken between checkDockerQuota and acquireDockerSlot
        // (TOCTOU race), queue the scan instead of failing it. acquireDockerSlot
        // already does atomic FOR UPDATE + check + increment, so this is the only
        // race window — no need for a separate manual transaction.
        if (container.error?.includes("slot") || container.error?.includes("busy")) {
          await pool.query(
            `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by)
             VALUES ($1, $2, $3, $4, 'queued', $5::jsonb, $6)`,
            [scanId, profile.org_id, project_id, target_url,
             JSON.stringify(scanConfig),
             user.id]
          )
          await pool.query(`UPDATE scan_history SET status = 'queued' WHERE id = $1`, [scanId])
          const { rows: queueCount } = await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM zap_tasks WHERE org_id = $1 AND status = 'queued'`,
            [profile.org_id]
          )
          return NextResponse.json({
            queued: true, scanId, position: queueCount[0]?.cnt || 0,
            message: `All slots busy. Scan queued. A slot will open when a current scan completes.`,
          })
        }
        // Other spawn failure — fail the scan
        await pool.query(`UPDATE scan_history SET status = 'failed', error_message = $1 WHERE id = $2`, [container.error, scanId])
        return NextResponse.json({ error: container.error }, { status: 503 })
      }

      await pool.query(`UPDATE scan_history SET status = 'running' WHERE id = $1`, [scanId])
    } catch (err) {
      // spawnZapContainer threw an exception — clean up the scan row
      const errorMsg = err instanceof Error ? err.message : "Failed to start ZAP container"
      await pool.query(
        `UPDATE scan_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [errorMsg, scanId]
      )
      return NextResponse.json({ error: errorMsg }, { status: 503 })
    }

    await logAudit({
      action: "scan.started",
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: { target_url, scan_type: "zap", project_id },
    })

    return NextResponse.json({ scanId, containerId: container.containerId })
  } catch (e) {
    console.error("ZAP start error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
