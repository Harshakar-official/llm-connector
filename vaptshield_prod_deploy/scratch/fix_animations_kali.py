import re

def fix():
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/terminal/page.tsx', 'r') as f:
        content = f.read()

    # 1. Main Wrapper
    content = content.replace(
        '<div className="p-6 space-y-6 max-w-[1440px] mx-auto">',
        '<motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-6 space-y-6 max-w-[1440px] mx-auto">',
        1
    )
    content = content.rsplit('</div>\n  )\n}', 1)
    content = '</motion.div>\n  )\n}'.join(content)

    # 2. Iframe States
    old_iframe_block = """              {session && !iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                  <div className="flex flex-col items-center gap-6 text-fg-muted max-w-xs w-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="w-full space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className={loadingStep >= 1 ? "text-fg" : "text-fg-subtle"}>Spawning container</span>
                        {loadingStep >= 1 && <Check className="w-4 h-4 text-success" />}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className={loadingStep >= 2 ? "text-fg" : "text-fg-subtle"}>Starting ttyd</span>
                        {loadingStep >= 2 && <Check className="w-4 h-4 text-success" />}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className={loadingStep >= 3 ? "text-fg" : "text-fg-subtle"}>Connecting</span>
                        {loadingStep >= 3 && <Check className="w-4 h-4 text-success" />}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {session ? (
                <iframe
                  key={session.wsUrl}
                  ref={iframeRef}
                  src={session.wsUrl}
                  className="w-full h-full"
                  title="Kali Terminal"
                  onLoad={() => setIframeLoaded(true)}
                />
              ) : !selectedProject ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-bg-subtle/30 bg-gradient-to-b from-transparent to-bg-subtle/50 text-fg-muted border-l border-border/50">
                  <div className="w-16 h-16 rounded-2xl bg-panel border border-border flex items-center justify-center shadow-sm mb-2">
                    <FolderKanban className="w-8 h-8 text-fg-subtle" />
                  </div>
                  <p className="text-lg font-medium text-fg">Select a project</p>
                  <p className="text-sm max-w-sm text-center">Choose a project above to begin your security testing session</p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-bg/50 text-fg-muted border-l border-border/50">
                  <div className="w-16 h-16 rounded-2xl bg-primary-subtle flex items-center justify-center mb-2">
                    <Terminal className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-lg font-medium text-fg">Ready to start</p>
                  <p className="text-sm max-w-sm text-center mb-4">Click Start Terminal to launch your Kali environment. Session auto-expires after 4 hours.</p>
                  <div className="flex flex-col gap-2 text-xs text-fg-subtle">
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Full Kali toolset</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Isolated Docker container</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Auto-cleanup on disconnect</div>
                  </div>
                </div>
              )}"""

    new_iframe_block = """              <AnimatePresence mode="wait">
                {session && !iframeLoaded && (
                  <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="absolute inset-0 flex items-center justify-center bg-black z-10">
                    <div className="flex flex-col items-center gap-6 text-fg-muted max-w-xs w-full">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <div className="w-full space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className={loadingStep >= 1 ? "text-fg" : "text-fg-subtle"}>Spawning container</span>
                          {loadingStep >= 1 && <Check className="w-4 h-4 text-success" />}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className={loadingStep >= 2 ? "text-fg" : "text-fg-subtle"}>Starting ttyd</span>
                          {loadingStep >= 2 && <Check className="w-4 h-4 text-success" />}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className={loadingStep >= 3 ? "text-fg" : "text-fg-subtle"}>Connecting</span>
                          {loadingStep >= 3 && <Check className="w-4 h-4 text-success" />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                {!session && !selectedProject && (
                  <motion.div key="noproject" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-subtle/30 bg-gradient-to-b from-transparent to-bg-subtle/50 text-fg-muted border-l border-border/50">
                    <div className="w-16 h-16 rounded-2xl bg-panel border border-border flex items-center justify-center shadow-sm mb-2">
                      <FolderKanban className="w-8 h-8 text-fg-subtle" />
                    </div>
                    <p className="text-lg font-medium text-fg">Select a project</p>
                    <p className="text-sm max-w-sm text-center">Choose a project above to begin your security testing session</p>
                  </motion.div>
                )}
                {!session && selectedProject && (
                  <motion.div key="idle" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}} className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/50 text-fg-muted border-l border-border/50">
                    <div className="w-16 h-16 rounded-2xl bg-primary-subtle flex items-center justify-center mb-2">
                      <Terminal className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-lg font-medium text-fg">Ready to start</p>
                    <p className="text-sm max-w-sm text-center mb-4">Click Start Terminal to launch your Kali environment. Session auto-expires after 4 hours.</p>
                    <div className="flex flex-col gap-2 text-xs text-fg-subtle">
                      <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Full Kali toolset</div>
                      <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Isolated Docker container</div>
                      <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-success" /> Auto-cleanup on disconnect</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {session && (
                <iframe
                  key={session.wsUrl}
                  ref={iframeRef}
                  src={session.wsUrl}
                  className="w-full h-full relative z-0"
                  title="Kali Terminal"
                  onLoad={() => setIframeLoaded(true)}
                />
              )}"""
    
    content = content.replace(old_iframe_block, new_iframe_block)

    # 3. Pulse Badge
    old_badge = """                {findings.length > 0 && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {findingsCount} total
                  </Badge>
                )}"""
    new_badge = """                {findings.length > 0 && (
                  <motion.div key={findingsCount} initial={{scale:1}} animate={{scale:[1,1.05,1]}} transition={{duration:0.2}}>
                    <Badge variant="outline" className="text-xs font-mono">
                      {findingsCount} total
                    </Badge>
                  </motion.div>
                )}"""
    content = content.replace(old_badge, new_badge)

    # 4. Table Stagger
    content = content.replace(
        '<tbody className="divide-y divide-border">',
        '<motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>'
    )
    content = content.replace(
        '</tbody>\n                  </table>',
        '</motion.tbody>\n                  </table>'
    )
    
    # 5. Table Rows (Only in tbody)
    tbody_start = content.find('<motion.tbody')
    tbody_end = content.find('</motion.tbody>', tbody_start)
    
    tbody_content = content[tbody_start:tbody_end]
    tbody_content = tbody_content.replace(
        """                        <tr
                          key={f.id}
                          className={`hover:bg-panel-hover transition-colors ${selectedIds.has(f.id) ? "bg-primary-subtle/40" : ""}`}
                        >""",
        """                        <motion.tr
                          key={f.id}
                          variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}}
                          className={`hover:bg-panel-hover transition-colors ${selectedIds.has(f.id) ? "bg-primary-subtle/40" : ""}`}
                        >"""
    )
    tbody_content = tbody_content.replace('</tr>', '</motion.tr>')
    
    content = content[:tbody_start] + tbody_content + content[tbody_end:]

    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/terminal/page.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
