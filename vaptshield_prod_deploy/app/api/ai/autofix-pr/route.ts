import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { Groq } from "groq-sdk"
import { decrypt } from "@/lib/utils/encryption"
import { sanitizeForLLM } from "@/lib/ai/sanitize"

export const maxDuration = 300 // Vercel max duration 5 mins

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    // Only admin and security_engineer can auto-fix PRs
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 })
    }

    const { scanId } = await req.json()
    if (!scanId) return NextResponse.json({ error: "scanId required" }, { status: 400 })

    // Fetch the scan and config (org-scoped)
    const { data: scan, error: scanErr } = await supabase
      .from("scan_history")
      .select("scan_target, branch_name")
      .eq("id", scanId)
      .eq("org_id", profile.org_id)
      .single()
    if (scanErr || !scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 })

    const { data: config, error: cfgErr } = await supabase
      .from("cicd_configs")
      .select("*")
      .eq("repo_url", scan.scan_target)
      .eq("org_id", profile.org_id)
      .single()
    
    if (cfgErr || !config) return NextResponse.json({ error: "Config not found" }, { status: 404 })
    if (!config.encrypted_pat) return NextResponse.json({ error: "No PAT configured. Auto-Fix requires a Personal Access Token with write access." }, { status: 400 })

    const pat = decrypt(config.encrypted_pat)
    const repoOwner = config.repo_owner
    const repoName = config.repo_name
    const baseBranch = scan.branch_name || config.branch || "main"

    // Fetch semgrep findings (org-scoped)
    const { data: findings } = await supabase
      .from("scan_findings")
      .select("id, title, raw_data")
      .eq("scan_id", scanId)
      .eq("org_id", profile.org_id)
      .eq("status", "pending")
    
    if (!findings || findings.length === 0) return NextResponse.json({ error: "No pending findings to fix" }, { status: 400 })

    const semgrepFindings = findings.filter(f => f.raw_data?.extra?.lines && f.raw_data?.path)
    if (semgrepFindings.length === 0) return NextResponse.json({ error: "Only source code vulnerabilities (like Semgrep) can be auto-fixed currently." }, { status: 400 })

    // Use Groq to fix files
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    
    // Group findings by file
    const fileFindings: Record<string, any[]> = {}
    semgrepFindings.forEach(f => {
      const path = f.raw_data.path
      if (!fileFindings[path]) fileFindings[path] = []
      fileFindings[path].push(f)
    })

    const fixedFiles: { path: string; content: string }[] = []

    for (const [path, vulns] of Object.entries(fileFindings)) {
      // 1. Fetch file content from GitHub
      const fileRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}?ref=${baseBranch}`, {
        headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" }
      })
      if (!fileRes.ok) continue
      const fileData = await fileRes.json()
      const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

      // 2. Build prompt
      const safePath = sanitizeForLLM(path, 500)
      const vulnerabilitiesList = vulns.map((v: any) => `- Title: ${sanitizeForLLM(v.title || "", 300)}\n  Code Snippet: ${sanitizeForLLM(v.raw_data.extra.lines || "", 2000)}`).join("\n\n")
      
      const prompt = `You are an expert DevSecOps engineer. 
I have a file named '${safePath}' with the following security vulnerabilities:
${vulnerabilitiesList}

Here is the original file content:
\`\`\`
${originalContent}
\`\`\`

Please provide the ENTIRE fixed file content that resolves these vulnerabilities. 
Do not include any explanations, markdown formatting, or code fences around the output. Just output the raw fixed file content exactly as it should be written to disk.`

      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.1,
      })

      let fixedContent = completion.choices[0]?.message?.content || ""
      fixedContent = fixedContent.replace(/^```[\w]*\n/, '').replace(/\n```$/, '')

      if (fixedContent && fixedContent !== originalContent) {
        fixedFiles.push({ path, content: fixedContent })
      }
    }

    if (fixedFiles.length === 0) return NextResponse.json({ error: "AI could not generate valid fixes." }, { status: 400 })

    // 3. Create PR via GitHub API
    // Get base branch SHA
    const refRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${baseBranch}`, {
      headers: { Authorization: `token ${pat}` }
    })
    const refData = await refRes.json()
    const baseSha = refData.object.sha

    // Create tree
    const treePayload = {
      base_tree: baseSha,
      tree: fixedFiles.map(f => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        content: f.content
      }))
    }
    const treeRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees`, {
      method: "POST",
      headers: { Authorization: `token ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify(treePayload)
    })
    const treeData = await treeRes.json()

    // Create commit
    const commitRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/commits`, {
      method: "POST",
      headers: { Authorization: `token ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Fix security vulnerabilities detected by VAPTShield",
        tree: treeData.sha,
        parents: [baseSha]
      })
    })
    const commitData = await commitRes.json()

    // Create branch
    const newBranchName = `vaptshield-fixes-${Date.now()}`
    await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/refs`, {
      method: "POST",
      headers: { Authorization: `token ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha: commitData.sha
      })
    })

    // Create PR
    const prRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls`, {
      method: "POST",
      headers: { Authorization: `token ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "🛡️ Auto-Fix Security Vulnerabilities (VAPTShield)",
        head: newBranchName,
        base: baseBranch,
        body: `This PR automatically fixes the following security vulnerabilities found by VAPTShield:\n\n${semgrepFindings.map(f => `- **${f.title}**`).join("\n")}\n\n*Please review the changes before merging.*`
      })
    })
    const prData = await prRes.json()

    if (!prRes.ok) {
      return NextResponse.json({ error: "Failed to create PR", detail: prData }, { status: 400 })
    }

    return NextResponse.json({ success: true, prUrl: prData.html_url })

  } catch (e: any) {
    console.error("AutoFix PR Error:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
