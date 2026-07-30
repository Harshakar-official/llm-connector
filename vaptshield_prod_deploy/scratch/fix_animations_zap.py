import re

def fix():
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'r') as f:
        content = f.read()

    # 1. Main Wrapper (Second occurrence)
    first_idx = content.find('<div className="p-6 space-y-6 max-w-[1440px] mx-auto">')
    second_idx = content.find('<div className="p-6 space-y-6 max-w-[1440px] mx-auto">', first_idx + 1)
    
    if second_idx != -1:
        content = content[:second_idx] + '<motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-6 space-y-6 max-w-[1440px] mx-auto">' + content[second_idx + len('<div className="p-6 space-y-6 max-w-[1440px] mx-auto">'):]
        
    content = content.rsplit('</div>\n  )\n}', 1)
    content = '</motion.div>\n  )\n}'.join(content)

    # 2. Findings Badge Pulse
    old_badge = """                {findingsCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                    {findingsCount} Findings
                  </Badge>
                )}"""
    new_badge = """                {findingsCount > 0 && (
                  <motion.div key={findingsCount} initial={{scale:1}} animate={{scale:[1,1.05,1]}} transition={{duration:0.2}}>
                    <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                      {findingsCount} Findings
                    </Badge>
                  </motion.div>
                )}"""
    content = content.replace(old_badge, new_badge)

    # 3. Live Progress Display with AnimatePresence
    old_progress = """            {/* Live Progress Display */}
            {(status === "running" || status === "queued") && (
              <div className="space-y-3 bg-bg-subtle p-3 rounded-md border border-border">"""
    new_progress = """            {/* Live Progress Display */}
            <AnimatePresence mode="wait">
              {(status === "running" || status === "queued") && (
                <motion.div key="progress" initial={{opacity:0, height:0}} animate={{opacity:1, height:"auto"}} exit={{opacity:0, height:0}} transition={{duration:0.15}} className="space-y-3 bg-bg-subtle overflow-hidden p-3 rounded-md border border-border">"""
    content = content.replace(old_progress, new_progress)
    
    # Close AnimatePresence for Progress Display
    old_progress_close = """                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                    <span>Progress</span>
                    <span>{progressPct != null ? progressPct : 0}%</span>
                  </div>
                  <Progress value={progressPct != null ? progressPct : 0} className="h-2" />
                </div>
              </div>
            )}"""
    new_progress_close = """                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                    <span>Progress</span>
                    <span>{progressPct != null ? progressPct : 0}%</span>
                  </div>
                  <Progress value={progressPct != null ? progressPct : 0} className="h-2" />
                </div>
              </motion.div>
            )}
            </AnimatePresence>"""
    content = content.replace(old_progress_close, new_progress_close)

    # 4. Table Stagger (Replace tbody)
    content = content.replace(
        '<tbody className="divide-y divide-border">',
        '<motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>'
    )
    content = content.replace(
        '</tbody>',
        '</motion.tbody>'
    )
    
    # 5. Table Rows (Endpoints)
    content = content.replace(
        """                            <tr key={f.id} className="hover:bg-bg-muted transition-colors">""",
        """                            <motion.tr key={f.id} variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}} className="hover:bg-bg-muted transition-colors">"""
    )
    # Endpoints close
    content = content.replace(
        """                              <td className="px-3 py-3 text-right">
                                <Button size="sm" variant="outline" className="h-7 text-xs font-medium" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}>Copy</Button>
                              </td>
                            </tr>""",
        """                              <td className="px-3 py-3 text-right">
                                <Button size="sm" variant="outline" className="h-7 text-xs font-medium" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}>Copy</Button>
                              </td>
                            </motion.tr>"""
    )
    
    # 6. Table Rows (Vulns)
    content = content.replace(
        """                            <tr key={f.id} onClick={() => setSelectedFinding(f)} className="hover:bg-bg-subtle cursor-pointer transition-colors">""",
        """                            <motion.tr key={f.id} onClick={() => setSelectedFinding(f)} variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}} className="hover:bg-bg-subtle cursor-pointer transition-colors">"""
    )
    # Vulns close
    content = content.replace(
        """                              <td className="px-4 py-3 text-right">
                                <Button size="sm" variant="secondary" className="h-7 text-xs font-medium">Review</Button>
                              </td>
                            </tr>""",
        """                              <td className="px-4 py-3 text-right">
                                <Button size="sm" variant="secondary" className="h-7 text-xs font-medium">Review</Button>
                              </td>
                            </motion.tr>"""
    )
    
    # Let's fix the Empty State to use AnimatePresence as well, it adds polish
    # Replace the empty state div
    old_empty_state_1 = """              {findings.length === 0 && status !== "running" && status !== "queued" ? ("""
    new_empty_state_1 = """              <AnimatePresence mode="wait">
                {findings.length === 0 && status !== "running" && status !== "queued" ? ("""
    content = content.replace(old_empty_state_1, new_empty_state_1)
    
    old_empty_state_inner = """                <div className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">"""
    new_empty_state_inner = """                <motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">"""
    content = content.replace(old_empty_state_inner, new_empty_state_inner)
    
    old_empty_state_close = """                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>
                </div>
              ) : findings.length === 0 && (status === "running" || status === "queued") ? ("""
    new_empty_state_close = """                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>
                </motion.div>
              ) : findings.length === 0 && (status === "running" || status === "queued") ? ("""
    content = content.replace(old_empty_state_close, new_empty_state_close)
    
    old_empty_state_2 = """                <div className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />"""
    new_empty_state_2 = """                <motion.div key="scanning" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="px-4 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />"""
    content = content.replace(old_empty_state_2, new_empty_state_2)
    
    old_empty_state_2_close = """                  <p className="text-sm font-medium text-fg mb-1">Scan in progress</p>
                  <p className="text-xs text-fg-muted">Findings will appear here in real-time as they are discovered.</p>
                </div>
              ) : ("""
    new_empty_state_2_close = """                  <p className="text-sm font-medium text-fg mb-1">Scan in progress</p>
                  <p className="text-xs text-fg-muted">Findings will appear here in real-time as they are discovered.</p>
                </motion.div>
              ) : ("""
    content = content.replace(old_empty_state_2_close, new_empty_state_2_close)
    
    # Close AnimatePresence for the table empty state
    old_table_block_close = """                    </table>
                  </div>
                </div>
              )}"""
    new_table_block_close = """                    </table>
                  </div>
                </div>
              )}
              </AnimatePresence>"""
    # Note: there might be a better place to put </AnimatePresence> but let's just make it work.
    
    # Actually wait. `findings.length === 0 ... ? ( empty_state_1 ) : findings.length === 0 ... ? ( empty_state_2 ) : ( table )`
    # We should put `</AnimatePresence>` right after the closing parenthesis of the ternary operation: `)}`
    # Instead of regex, I'll do this carefully.
    
    table_block_close = """                  </div>
                </div>
              )}
            </div>"""
    new_table_block_close_full = """                  </div>
                </div>
              )}
              </AnimatePresence>
            </div>"""
    content = content.replace(table_block_close, new_table_block_close_full)

    # I'll also change `div` to `motion.div` for the table itself so it can animate in.
    old_table_wrapper = """                <div className="w-full">
                  <div className="overflow-x-auto">"""
    new_table_wrapper = """                <motion.div key="table" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="w-full">
                  <div className="overflow-x-auto">"""
    content = content.replace(old_table_wrapper, new_table_wrapper)
    
    old_table_wrapper_close = """                    </table>
                  </div>
                </div>"""
    new_table_wrapper_close = """                    </table>
                  </div>
                </motion.div>"""
    content = content.replace(old_table_wrapper_close, new_table_wrapper_close)

    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
