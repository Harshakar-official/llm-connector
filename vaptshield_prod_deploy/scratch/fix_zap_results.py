import re

def fix():
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'r') as f:
        content = f.read()

    # 1. Imports
    content = content.replace(
        'AlertOctagon, Siren, Scan, ArrowRight, Shield, Copy, Info,\n} from "lucide-react"\nimport { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"',
        'AlertOctagon, Siren, Scan, ArrowRight, Shield, Copy, Info, ShieldCheck,\n} from "lucide-react"\nimport { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"\nimport { Progress } from "@/components/ui/progress"'
    )

    # 2. Results Engine
    engine_start = content.find('        {/* ── RIGHT: Scan Engine + Findings ── */}')
    findings_table_start = content.find('          {/* Findings Table */}', engine_start)
    
    new_engine = """        {/* ── RIGHT: Scan Engine + Findings ── */}
        <div className="space-y-3 flex flex-col h-[calc(100vh-140px)]">

          {/* 1. Results Header Card */}
          <div className="bg-panel border border-border rounded-md p-4 flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold text-fg">Scan Results</h2>
                {findingsCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                    {findingsCount} Findings
                  </Badge>
                )}
              </div>
              
              {/* Summary Bar inside Header if not scanning */}
              {status !== "running" && status !== "queued" && findingsCount > 0 && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  {severityCounts.critical > 0 && <span className="px-2 py-0.5 rounded-full bg-severity-critical/10 text-severity-critical border border-severity-critical/20">Critical: {severityCounts.critical}</span>}
                  {severityCounts.high > 0 && <span className="px-2 py-0.5 rounded-full bg-severity-high/10 text-severity-high border border-severity-high/20">High: {severityCounts.high}</span>}
                  {severityCounts.medium > 0 && <span className="px-2 py-0.5 rounded-full bg-severity-medium/10 text-severity-medium border border-severity-medium/20">Medium: {severityCounts.medium}</span>}
                  {severityCounts.low > 0 && <span className="px-2 py-0.5 rounded-full bg-severity-low/10 text-severity-low border border-severity-low/20">Low: {severityCounts.low}</span>}
                </div>
              )}
            </div>

            {/* Live Progress Display */}
            {(status === "running" || status === "queued") && (
              <div className="space-y-3 bg-bg-subtle p-3 rounded-md border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm font-medium text-fg">
                      {status === "queued" ? "Queued for execution" : scanMeta.label + (phase ? ` - ${phase}` : "")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {uptimeSeconds != null && <span className="text-xs font-mono text-fg-muted">{formatUptime(uptimeSeconds)}</span>}
                    <Button onClick={stopScan} disabled={!scanId} variant="destructive" size="sm" className="h-7 text-xs bg-severity-critical/10 text-severity-critical hover:bg-severity-critical/20 hover:text-severity-critical border border-severity-critical/30">
                      Cancel
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                    <span>Progress</span>
                    <span>{progressPct != null ? progressPct : 0}%</span>
                  </div>
                  <Progress value={progressPct != null ? progressPct : 0} className="h-2" />
                </div>
              </div>
            )}
            
            {/* Auth Warning & Tokens */}
            {(authWarning || authTokens) && (
              <div className="space-y-2 mt-2">
                {authWarning && (
                  <div className="rounded-md border border-severity-high-border bg-severity-high-bg px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-severity-high shrink-0" />
                    <span className="text-xs text-severity-high font-medium">Auth Warning:</span>
                    <span className="text-xs text-fg-muted">Proceeding unauthenticated. Only public endpoints will be scanned.</span>
                  </div>
                )}
                {authTokens && (
                  <div className="border border-border rounded-md bg-bg overflow-hidden">
                    <button onClick={() => setAuthTokensRevealed(!authTokensRevealed)}
                      className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono hover:bg-bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-severity-low" />
                        <span className="text-severity-low font-semibold">AUTH TOKENS</span>
                        {authVerified === true && <CheckCircle className="w-3 h-3 text-severity-low" />}
                      </div>
                      {authTokensRevealed ? <ChevronDown className="w-3 h-3 text-fg-muted" /> : <ChevronRight className="w-3 h-3 text-fg-muted" />}
                    </button>
                    {authTokensRevealed && (
                      <div className="px-3 pb-3 space-y-2 border-t border-border mt-1 pt-2">
                        <div className="flex items-center justify-end">
                          <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(authTokens, null, 2)); toast.success("Tokens copied") }}
                            className="text-[10px] font-mono px-2 py-1 rounded bg-bg-subtle border border-border hover:bg-panel-hover text-fg-muted flex items-center"
                          ><Copy className="w-3 h-3 mr-1" />Copy JSON</button>
                        </div>
                        {Object.entries(authTokens as Record<string, unknown>).filter(([k]) => k !== "cookies" && k !== "cookieCount").length > 0 && (
                          <TokenCopyHelper tokens={authTokens} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>\n\n"""
    
    content = content[:engine_start] + new_engine + content[findings_table_start:]

    # 3. Findings Table Flex
    content = content.replace(
        '<div className="bg-bg-subtle border border-border rounded-md overflow-hidden">',
        '<div className="bg-panel border border-border rounded-md overflow-hidden flex-1 flex flex-col">',
        1
    )

    # 4. Table Header and Empty State
    content = content.replace(
        '<div className="px-3 py-2 flex items-center justify-between border-b border-border">',
        '<div className="px-4 py-3 flex items-center justify-between border-b border-border bg-bg-subtle shrink-0">'
    )
    content = content.replace(
        '<div className="overflow-x-auto">',
        '<div className="flex-1 overflow-auto">'
    )
    content = content.replace(
        '                <div className="px-4 py-8 text-center">\n                  <Scan className="w-6 h-6 text-fg-disabled mx-auto mb-2" />\n                  <p className="text-xs font-mono text-fg-muted">No findings yet. Deploy a scan to begin.</p>\n                </div>',
        '                <div className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">\n                  <div className="w-12 h-12 rounded-full bg-bg-muted flex items-center justify-center mb-4">\n                    <ShieldCheck className="w-6 h-6 text-fg-disabled" />\n                  </div>\n                  <p className="text-sm font-medium text-fg mb-1">No findings yet</p>\n                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>\n                </div>'
    )
    
    # 5. Fix Endpoints table padding
    content = content.replace('<tr className="border-b border-border bg-bg-muted">', '<tr className="border-b border-border bg-bg-subtle">')
    content = content.replace('px-2 py-2', 'px-3 py-3')
    
    # 6. Fix Vuln table padding and Action Button
    content = content.replace('<td className="px-3 py-2">', '<td className="px-4 py-3">')
    content = content.replace('<td className="px-3 py-2 hidden sm:table-cell">', '<td className="px-4 py-3 hidden sm:table-cell">')
    content = content.replace('<td className="px-3 py-2 text-fg truncate max-w-[260px]">{f.title || "Untitled Finding"}</td>', '<td className="px-4 py-3 text-fg font-medium truncate max-w-[260px]">{f.title || "Untitled Finding"}</td>')
    content = content.replace('<td className="px-3 py-2 text-fg-muted hidden md:table-cell">', '<td className="px-4 py-3 text-fg-muted hidden md:table-cell">')
    content = content.replace('<td className="px-3 py-2 text-fg-muted truncate max-w-[180px] hidden sm:table-cell">{f.url || "—"}</td>', '<td className="px-4 py-3 text-fg-muted truncate max-w-[180px] hidden sm:table-cell">{f.url || "—"}</td>')
    content = content.replace('<td className="px-3 py-2 text-fg-muted truncate max-w-[120px] hidden lg:table-cell font-mono">{f.param || "—"}</td>', '<td className="px-4 py-3 text-fg-muted truncate max-w-[120px] hidden lg:table-cell font-mono">{f.param || "—"}</td>')
    content = content.replace(
        '<td className="px-3 py-2 text-right">\n                                <span className="text-xs text-primary hover:text-primary-hover cursor-pointer font-medium">INSPECT</span>\n                              </td>',
        '<td className="px-4 py-3 text-right">\n                                <Button size="sm" variant="secondary" className="h-7 text-xs font-medium">Review</Button>\n                              </td>'
    )
    
    # Wait, the endpoints Copy button wasn't explicitly mentioned, but let\'s make it nice
    content = content.replace(
        '<td className="px-3 py-3 text-right">\n                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}\n                                  className="text-xs text-primary hover:text-primary-hover font-medium">COPY</button>\n                              </td>',
        '<td className="px-3 py-3 text-right">\n                                <Button size="sm" variant="outline" className="h-7 text-xs font-medium" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}>Copy</Button>\n                              </td>'
    )
    
    # Remove the old severity counts from the table header since they moved to the summary bar
    old_counts_start = content.find('{vulnFindings.length > 0 && (')
    old_counts_end = content.find(')}', old_counts_start + 20) + 2
    # But wait, it\'s inside a div. Let\'s use regex for this if necessary, or just replace it.
    
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
