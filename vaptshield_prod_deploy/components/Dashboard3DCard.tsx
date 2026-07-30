"use client"

import { useRef } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import Image from "next/image"
import { Terminal } from "lucide-react"

export default function Dashboard3DCard() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Motion values for X and Y mouse positions (normalized between -0.5 and 0.5)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Smooth springs to make the tilt feel heavy and premium
  const mouseXSpring = useSpring(x, { stiffness: 100, damping: 20 })
  const mouseYSpring = useSpring(y, { stiffness: 100, damping: 20 })

  // Map the mouse positions to rotation degrees (tilt up to 15 degrees)
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"])
  
  // Dynamic glow/glare effect based on mouse
  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"])
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    
    const width = rect.width
    const height = rect.height
    
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="mt-20 relative mx-auto max-w-6xl group cursor-crosshair"
      style={{ perspective: "2000px" }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="relative transition-all duration-200 ease-linear"
      >
        {/* Dynamic Glow Behind */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/30 to-blue-500/30 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-500" style={{ transform: "translateZ(-50px)" }} />
        
        {/* The Card */}
        <div className="relative rounded-2xl border border-border bg-panel shadow-2xl overflow-hidden aspect-[16/9] z-10" style={{ transform: "translateZ(0px)" }}>
          
          {/* Glare effect mapped to mouse */}
          <motion.div 
            className="absolute inset-0 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.15) 0%, transparent 60%)`,
            }}
          />

          {/* Window Header */}
          <div className="flex h-10 items-center justify-between border-b border-border bg-bg-subtle px-4 z-20 relative shadow-sm">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
              <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
            </div>
            <div className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest flex items-center gap-2">
              <Terminal className="h-3 w-3" /> VAPT-COMMAND-CENTER — NEXT-GEN ARCHITECTURE
            </div>
            <div className="w-12" />
          </div>

          {/* Dual-Theme Real Dashboard Images with 3D Pop */}
          <div className="relative w-full h-full bg-bg" style={{ transform: "translateZ(20px)" }}>
            <Image 
              src="/dashboardpic1.png" 
              alt="VAPTShield Dashboard Light" 
              fill
              className="object-contain dark:opacity-0 transition-opacity duration-1000 shadow-2xl"
              priority
            />
            <Image 
              src="/dashboard pic dark 1.png" 
              alt="VAPTShield Dashboard Dark" 
              fill
              className="object-contain opacity-0 dark:opacity-100 transition-opacity duration-1000 shadow-2xl"
              priority
            />
            
            {/* Holographic overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-transparent to-transparent z-10 pointer-events-none" style={{ transform: "translateZ(30px)" }} />
            <div className="absolute inset-0 bg-primary/10 mix-blend-overlay z-10 pointer-events-none opacity-50 group-hover:opacity-0 transition-opacity duration-700" />
            
            {/* Floating Scan Line */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/50 shadow-[0_0_10px_rgba(var(--primary),0.8)] z-20 opacity-0 group-hover:opacity-100 group-hover:animate-[scan_3s_ease-in-out_infinite]" style={{ transform: "translateZ(40px)" }} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
