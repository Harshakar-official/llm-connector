import re

def fix():
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'r') as f:
        content = f.read()

    # 1. Main wrapper -> motion.div
    content = content.replace(
        '<div className="p-4 space-y-3 max-w-[1440px] mx-auto select-none">',
        '<motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-4 space-y-3 max-w-[1440px] mx-auto select-none">'
    )
    content = content.replace(
        '      />\n    </div>\n  )\n}',
        '      />\n    </motion.div>\n  )\n}'
    )

    # 2. Text Sizes
    content = content.replace('text-[10px]', 'text-xs')
    content = content.replace('text-[11px]', 'text-xs')
    # Top bar exception: I can't easily revert the top bar, but the prompt says "except status indicators in the top bar which can stay text-[11px]".
    # Let's manually restore top bar:
    content = content.replace(
        'className="flex items-center gap-1.5 text-xs font-mono text-severity-high"',
        'className="flex items-center gap-1.5 text-[11px] font-mono text-severity-high"'
    )
    content = content.replace(
        'className="flex items-center gap-1.5 text-xs font-mono text-fg-subtle"',
        'className="flex items-center gap-1.5 text-[11px] font-mono text-fg-subtle"'
    )

    # Config form inputs
    content = content.replace('h-6', 'h-8').replace('h-7', 'h-8')
    # Fix the "h-8 w-8" back to something if needed?
    # Actually wait, `h-7` is used for action buttons inside the table too. Let's be careful.
    
    # Let's do a surgical replace for the layout:
    # 3. Widen left column
    content = content.replace('grid-cols-[320px_1fr]', 'grid-cols-[360px_1fr]')

    # 4. Config panel header
    content = content.replace(
        """          <div className="p-3 border-b border-border flex items-center justify-between bg-bg/50">
            <h2 className="text-sm font-semibold text-fg">Scan Config</h2>
            <Button size="sm" variant="ghost" onClick={resetConfig} disabled={status === "running" || status === "queued"} className="h-8 px-2 text-xs">Reset</Button>
          </div>""",
        """          <div className="p-3 border-b border-border flex items-center justify-between bg-bg-subtle">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-fg">Scan Configuration</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={resetConfig} disabled={status === "running" || status === "queued"} className="h-8 px-2 text-xs">Reset</Button>
          </div>"""
    )
    
    # Add Settings2 import
    if "Settings2" not in content:
        content = content.replace("Shield,", "Shield, Settings2,")

    # 5. Group sections (Target, Scan Type)
    content = content.replace(
        """              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-fg">Target URL</Label>""",
        """              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">TARGET</span>
                  </div>
                  <Label className="text-xs font-medium text-fg">Target URL</Label>"""
    )
    
    content = content.replace(
        """              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-fg">Scan Type</Label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-bg-subtle border border-border rounded-md">
                  <button onClick={() => setScanType("spider")} className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${scanType === "spider" ? "bg-panel text-fg shadow-sm border border-border" : "text-fg-muted hover:text-fg hover:bg-bg/50"}`}>Spider</button>
                  <button onClick={() => setScanType("ajax-spider")} className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${scanType === "ajax-spider" ? "bg-panel text-fg shadow-sm border border-border" : "text-fg-muted hover:text-fg hover:bg-bg/50"}`}>AJAX</button>
                  <button onClick={() => setScanType("active")} className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${scanType === "active" ? "bg-panel text-fg shadow-sm border border-border" : "text-fg-muted hover:text-fg hover:bg-bg/50"}`}>Active</button>
                </div>
              </div>""",
        """                <div className="pt-2 border-t border-border">
                  <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-2 block">SCAN TYPE</span>
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => setScanType("spider")} className={`flex flex-col text-left p-2.5 rounded-md border transition-colors ${scanType === "spider" ? "bg-primary-subtle/20 border-primary shadow-sm" : "bg-bg border-border hover:border-border-strong"}`}>
                      <span className="text-xs font-medium text-fg">Spider</span>
                      <span className="text-[10px] text-fg-muted mt-0.5">Fast crawler for mapping endpoints</span>
                    </button>
                    <button onClick={() => setScanType("ajax-spider")} className={`flex flex-col text-left p-2.5 rounded-md border transition-colors ${scanType === "ajax-spider" ? "bg-primary-subtle/20 border-primary shadow-sm" : "bg-bg border-border hover:border-border-strong"}`}>
                      <span className="text-xs font-medium text-fg">AJAX Spider</span>
                      <span className="text-[10px] text-fg-muted mt-0.5">Headless browser crawler for SPAs</span>
                    </button>
                    <button onClick={() => setScanType("active")} className={`flex flex-col text-left p-2.5 rounded-md border transition-colors ${scanType === "active" ? "bg-primary-subtle/20 border-primary shadow-sm" : "bg-bg border-border hover:border-border-strong"}`}>
                      <span className="text-xs font-medium text-fg">Active Scan</span>
                      <span className="text-[10px] text-fg-muted mt-0.5">Deep vulnerability scanning</span>
                    </button>
                  </div>
                </div>"""
    )
    
    # 6. Results Panel Header
    content = content.replace(
        """          {/* ── Main Panel Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-b border-border bg-bg/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-fg-muted" />
                <h2 className="text-sm font-semibold text-fg">Results</h2>
                {findingsCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                    {findingsCount} Findings
                  </Badge>
                )}
              </div>""",
        """          {/* ── Main Panel Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-b border-border bg-bg-subtle">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-semibold text-fg">Scan Results</h2>
                {findingsCount > 0 && (
                  <motion.div key={findingsCount} initial={{scale:1}} animate={{scale:[1,1.05,1]}} transition={{duration:0.2}}>
                    <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                      {findingsCount} Findings
                    </Badge>
                  </motion.div>
                )}
              </div>"""
    )
    
    if "ShieldCheck" not in content:
        content = content.replace("Settings2,", "Settings2, ShieldCheck,")
        
    # 7. Live Progress bar
    content = content.replace(
        """            {/* Live Progress Display */}
            {(status === "running" || status === "queued") && (
              <div className="space-y-3 bg-bg-subtle p-3 rounded-md border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm font-medium text-fg">{status === "queued" ? "Queued" : "Scanning..."}</span>
                  </div>
                  <Button size="sm" variant="destructive" onClick={cancelScan} className="h-7 text-xs px-2">Cancel</Button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                    <span>Progress</span>
                    <span>{progressPct != null ? progressPct : 0}%</span>
                  </div>
                  <Progress value={progressPct != null ? progressPct : 0} className="h-2" />
                </div>
              </div>
            )}""",
        """            {/* Live Progress Display */}
            <AnimatePresence mode="wait">
            {(status === "running" || status === "queued") && (
              <motion.div key="progress" initial={{opacity:0, height:0}} animate={{opacity:1, height:"auto"}} exit={{opacity:0, height:0}} transition={{duration:0.15}} className="space-y-3 bg-bg-subtle overflow-hidden p-4 rounded-md border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm font-medium text-fg">{status === "queued" ? "Queued..." : scanTypeLabel ? scanTypeLabel : "Scanning..."}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-fg-muted">{timeElapsed}</span>
                    <Button size="sm" variant="destructive" onClick={cancelScan} className="h-7 text-xs px-2">Cancel</Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                    <span>{status === "queued" ? "Waiting for slot" : "Phase Progress"}</span>
                    <span>{progressPct != null ? progressPct : 0}%</span>
                  </div>
                  <Progress value={progressPct != null ? progressPct : 0} className="h-2" />
                </div>
              </motion.div>
            )}
            </AnimatePresence>"""
    )
    
    # Add Progress import if needed
    if "Progress" not in content:
        content = content.replace('import { Badge }', 'import { Badge }\nimport { Progress }')
        
    # 8. Tables Animation
    content = content.replace(
        '<tbody className="divide-y divide-border">',
        '<motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>'
    )
    content = content.replace('</tbody>', '</motion.tbody>')
    
    # Table tr replacements
    content = content.replace(
        """                            <tr key={f.id} className="border-b border-border hover:bg-panel-hover transition-colors">""",
        """                            <motion.tr key={f.id} variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}} className="border-b border-border hover:bg-panel-hover transition-colors">"""
    )
    # endpoints closing tr
    content = content.replace(
        """                              <td className="px-3 py-2 text-right">
                                <span className="text-xs text-primary hover:text-primary-hover cursor-pointer font-medium" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}>COPY</span>
                              </td>
                            </tr>""",
        """                              <td className="px-4 py-3 text-right">
                                <Button size="sm" variant="outline" className="h-7 text-xs font-medium" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}>Copy</Button>
                              </td>
                            </motion.tr>"""
    )
    
    # Vulns tr
    content = content.replace(
        """                            <tr key={f.id} onClick={() => setSelectedFinding(f)} className="hover:bg-bg-muted cursor-pointer transition-colors">""",
        """                            <motion.tr key={f.id} onClick={() => setSelectedFinding(f)} variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}} className="hover:bg-bg-muted cursor-pointer transition-colors">"""
    )
    # Vulns close tr
    content = content.replace(
        """                              <td className="px-3 py-2 text-right">
                                <span className="text-xs text-primary hover:text-primary-hover cursor-pointer font-medium">INSPECT</span>
                              </td>
                            </tr>""",
        """                              <td className="px-4 py-3 text-right">
                                <Button size="sm" variant="secondary" className="h-7 text-xs font-medium">Review</Button>
                              </td>
                            </motion.tr>"""
    )
    
    # 9. Empty states
    content = content.replace(
        """              {findings.length === 0 && status !== "running" ? (
                <div className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                  <div className="w-12 h-12 rounded-full bg-bg-muted flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6 text-fg-disabled" />
                  </div>
                  <p className="text-sm font-medium text-fg mb-1">No findings yet</p>
                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to map out endpoints or discover vulnerabilities.</p>
                </div>
              ) : findings.length === 0 && status === "running" ? (
                <div className="px-4 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-fg-muted mx-auto mb-2 animate-spin" />
                  <p className="text-xs font-mono text-fg-muted">Awaiting findings...</p>
                </div>
              ) : (""",
        """              <AnimatePresence mode="wait">
              {findings.length === 0 && status !== "running" ? (
                <motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                  <div className="w-12 h-12 rounded-full bg-bg-muted flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-fg-disabled" />
                  </div>
                  <p className="text-sm font-medium text-fg mb-1">No findings yet</p>
                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>
                </motion.div>
              ) : findings.length === 0 && status === "running" ? (
                <motion.div key="scanning" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm font-medium text-fg mb-1">Scan in progress</p>
                  <p className="text-xs text-fg-muted">Findings will appear here in real-time as they are discovered.</p>
                </motion.div>
              ) : (
                <motion.div key="table" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}>"""
    )
    content = content.replace(
        """                </table>
              )}""",
        """                </table>
                </motion.div>
              )}
              </AnimatePresence>"""
    )

    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
