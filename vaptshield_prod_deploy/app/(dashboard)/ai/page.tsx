export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getSafeSession } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { AIClient } from "./AIClient"

export default async function AIPage({ searchParams }: { searchParams: Promise<{ finding?: string }> }) {
  const { orgId, role, error } = await getSafeSession()

  if (error || !orgId) redirect("/login")

  // Guests are not allowed in AI Lab
  if (role === 'guest') redirect("/dashboard")

  const supabase = await getServerClient()

  // Fetch projects for selection
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_type")
    .eq("org_id", orgId)
    .order("name")

  const { finding: findingId } = await searchParams
  let initialFinding = null

  if (findingId) {
    const { data: f } = await supabase
      .from("scan_findings")
      .select("id, title, severity, raw_data")
      .eq("id", findingId)
      .eq("org_id", orgId)
      .single()
    
    if (f) {
      let codeSnippet = ""
      let lang = "javascript"
      const raw = f.raw_data as any || {}
      
      if (raw.tool === "semgrep" || f.title?.toLowerCase().includes("semgrep")) {
        codeSnippet = raw.extra?.lines || ""
        if (raw.path) {
          if (raw.path.endsWith('.ts') || raw.path.endsWith('.tsx')) lang = "typescript"
          else if (raw.path.endsWith('.py')) lang = "python"
          else if (raw.path.endsWith('.go')) lang = "go"
          else if (raw.path.endsWith('.java')) lang = "java"
          else if (raw.path.endsWith('.php')) lang = "php"
          else if (raw.path.endsWith('.rb')) lang = "ruby"
          else if (raw.path.endsWith('.rs')) lang = "rust"
          else if (raw.path.endsWith('.c') || raw.path.endsWith('.h')) lang = "c"
          else if (raw.path.endsWith('.cpp')) lang = "cpp"
        }
      } else if (raw.tool === "gitleaks" || f.title?.toLowerCase().includes("gitleaks") || raw.SecretHash) {
         codeSnippet = raw.Match || "Found a hardcoded secret."
      } else {
         // Fallback or SCA
         codeSnippet = `// Vulnerability: ${f.title}\n// Package: ${raw.PkgName || 'Unknown'}\n// Please update or patch the affected component.`
      }

      initialFinding = {
        title: f.title || "Security Vulnerability",
        code: codeSnippet,
        language: lang
      }
    }
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-fg">AI Security Lab</h1>
        <p className="text-fg-muted text-sm font-medium">
          Leverage advanced LLMs to generate findings, normalize reports, and suggest patches.
        </p>
      </div>

      <AIClient 
        projects={projects || []} 
        initialFinding={initialFinding}
      />
    </div>
  )
}
