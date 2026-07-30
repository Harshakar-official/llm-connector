import re

def fix():
    # 1. Fix Kali page
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/terminal/page.tsx', 'r') as f:
        content = f.read()
    
    # Fix the Suspense fallback
    content = content.replace(
        '<motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-6 space-y-6 max-w-[1440px] mx-auto">\n        <div className="h-8 w-48 animate-pulse bg-bg-muted rounded" />\n      </div>',
        '<div className="p-6 space-y-6 max-w-[1440px] mx-auto">\n        <div className="h-8 w-48 animate-pulse bg-bg-muted rounded" />\n      </div>'
    )
    
    # Now replace the correct one in TerminalPageInner
    content = content.replace(
        '  return (\n    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">',
        '  return (\n    <motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-6 space-y-6 max-w-[1440px] mx-auto">'
    )
    
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/terminal/page.tsx', 'w') as f:
        f.write(content)
        
    # 2. Fix ZAP page
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'r') as f:
        content = f.read()
        
    # Fix the empty state closing div
    content = content.replace(
        """                  <p className="text-sm font-medium text-fg mb-1">No findings yet</p>
                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>
                </div>
              ) : findings.length === 0 && status === "running" ? (""",
        """                  <p className="text-sm font-medium text-fg mb-1">No findings yet</p>
                  <p className="text-xs text-fg-muted max-w-sm mb-4">Run a scan to see results here. Try a Spider scan to map out endpoints, or an Active scan to discover vulnerabilities.</p>
                </motion.div>
              ) : findings.length === 0 && status === "running" ? ("""
    )
    
    with open('/home/prangan/vaptshield/app/(dashboard)/scanner/zap/page.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
