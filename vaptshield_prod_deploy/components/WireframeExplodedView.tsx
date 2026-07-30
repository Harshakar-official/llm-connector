"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform, useSpring } from "framer-motion"
import { Cpu, Terminal, ShieldAlert, RefreshCw } from "lucide-react"

// Pure Wireframe Solid Block (Occludes behind it but looks like an outline)
const WireframeBlock = ({ x, y, w, h, d, z = 0, children }: any) => {
  return (
    <motion.div
      className="absolute"
      style={{
        width: w,
        height: h,
        left: x,
        top: y,
        z,
        transformStyle: 'preserve-3d',
      }}
    >
      <div 
        className="absolute inset-0 border border-primary/50 dark:border-fg/40 bg-bg flex items-center justify-center shadow-lg" 
        style={{ transform: `translateZ(${d}px)` }}
      >
        {children}
      </div>
      <div 
        className="absolute border border-primary/50 dark:border-fg/40 bg-bg" 
        style={{ width: w, height: d, top: '100%', transformOrigin: 'top', transform: 'rotateX(-90deg)' }} 
      />
      <div 
        className="absolute border border-primary/50 dark:border-fg/40 bg-bg" 
        style={{ width: d, height: h, left: '100%', transformOrigin: 'left', transform: 'rotateY(-90deg)' }} 
      />
    </motion.div>
  )
}

// Solid Glowing Node that expands/fades on scroll
const GlowingNode = ({ progress, color = "bg-fg", shadow = "rgba(255,255,255,0.6)" }: any) => {
  const scale = useTransform(progress, [0, 1], [1, 2.5])
  const opacity = useTransform(progress, [0, 1], [1, 0.2])
  
  return (
    <motion.div 
      className={`absolute rounded-full ${color}`}
      style={{ 
        width: 16, height: 16, 
        scale, opacity, 
        boxShadow: `0 0 25px ${shadow}`
      }} 
    />
  )
}

// Downward Expanding Ghost Layers (The Base Plates)
const BaseGhostLayers = ({ progress, count = 5 }: any) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
         // eslint-disable-next-line react-hooks/rules-of-hooks
         const layerZ = useTransform(progress, [0, 1], [-(i + 1) * 4, -(i + 1) * 45])
         return (
           <motion.div 
             key={i}
             className="absolute inset-0 border border-primary/30 dark:border-fg/20 rounded-3xl"
             style={{ z: layerZ, transformStyle: 'preserve-3d' }}
           />
         )
      })}
    </>
  )
}

// Screws that float up linearly
const Screw = ({ x, y, progress, targetZ = 100 }: any) => {
  const zOffset = useTransform(progress, [0, 1], [0, targetZ])
  const lineOpacity = useTransform(progress, [0, 0.2, 0.8, 1], [0, 0.3, 0.3, 0])
  
  return (
    <motion.div className="absolute" style={{ left: x, top: y, transformStyle: 'preserve-3d' }}>
      <motion.div 
        className="absolute w-[1px] bg-primary/50 dark:bg-fg/40" 
        style={{ 
          height: 1000, 
          left: 0, top: 0, 
          transform: `translateZ(0px) rotateX(90deg)`, 
          transformOrigin: 'top', 
          opacity: lineOpacity 
        }} 
      />
      <motion.div 
        className="absolute w-5 h-5 border-2 border-primary/60 dark:border-fg/60 rounded-full flex items-center justify-center bg-bg shadow-sm"
        style={{ marginLeft: -10, marginTop: -10, z: zOffset }}
      >
        <div className="w-2 h-[2px] bg-primary/60 dark:bg-fg/60 rotate-45" />
        <div className="w-[2px] h-2 bg-primary/60 dark:bg-fg/60 absolute rotate-45" />
      </motion.div>
    </motion.div>
  )
}

// Accordion Stacks that fly up, separate, and compress at different target heights
const AccordionStack = ({ x, y, progress, baseZ = 0, targetZ, count = 6, w = 40, h = 40 }: any) => {
  const centerZ = useTransform(progress, [0, 1], [baseZ, targetZ])
  // Small initial spread of 2.5px so layers are visible when closed
  const spread = useTransform(progress, [0, 0.5, 1], [2.5, 18, 2.5])
  const lineOpacity = useTransform(progress, [0, 0.2, 0.8, 1], [0, 0.5, 0.5, 0])
  
  return (
    <motion.div className="absolute" style={{ left: x, top: y, transformStyle: 'preserve-3d' }}>
      <motion.div 
        className="absolute w-[1px] bg-primary/50 dark:bg-fg/50" 
        style={{ 
          height: 1000,
          left: 0, top: 0,
          transform: `translateZ(${baseZ}px) rotateX(90deg)`,
          transformOrigin: 'top',
          opacity: lineOpacity 
        }} 
      />
       {Array.from({ length: count }).map((_, i) => {
          const offset = (i - (count - 1) / 2)
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const layerZ = useTransform([centerZ, spread], ([c, s]: any) => c + (offset * s))
         return (
           <motion.div 
             key={i} 
             className="absolute border border-primary/60 dark:border-fg/60 rounded-[8px] bg-bg/80 backdrop-blur-md" 
             style={{ width: w, height: h, marginLeft: -w/2, marginTop: -h/2, z: layerZ }} 
           >
              <div className="absolute inset-1.5 border border-primary/20 dark:border-fg/10 rounded-sm" />
           </motion.div>
         )
      })}
    </motion.div>
  )
}

// Hovering Gears (Cooling Fans / Crypto Rings)
const HoverGear = ({ x, y, progress, baseZ = 0, targetZ, size = 40, spinReverse = false }: any) => {
  const zOffset = useTransform(progress, [0, 1], [baseZ, targetZ])
  const lineOpacity = useTransform(progress, [0, 0.2, 0.8, 1], [0, 0.3, 0.3, 0])
  
  return (
    <motion.div className="absolute" style={{ left: x, top: y, transformStyle: 'preserve-3d' }}>
      <motion.div 
        className="absolute w-[1px] bg-primary/50 dark:bg-fg/40" 
        style={{ height: 1000, left: 0, top: 0, transform: `translateZ(${baseZ}px) rotateX(90deg)`, transformOrigin: 'top', opacity: lineOpacity }} 
      />
      <motion.div 
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${spinReverse ? 'animate-[spin_8s_linear_infinite_reverse]' : 'animate-[spin_10s_linear_infinite]'}`} 
        style={{ width: size, height: size, z: zOffset }}
      >
         <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" className="text-primary/70 dark:text-fg/60" strokeWidth="2">
           <circle cx="50" cy="50" r="40" strokeDasharray="4 8" />
           <circle cx="50" cy="50" r="25" />
           {[...Array(6)].map((_, i) => (
             <path key={i} d="M50 25 L50 10" transform={`rotate(${i * 60} 50 50)`} strokeWidth="4" />
           ))}
         </svg>
      </motion.div>
    </motion.div>
  )
}

export default function WireframeExplodedView() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  })

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60, 
    damping: 15,
    restDelta: 0.001
  })

  // 0.1 to 0.4: Explode
  // 0.4 to 0.7: Hold
  // 0.7 to 0.9: Assemble
  const progress = useTransform(smoothProgress, [0.1, 0.4, 0.7, 0.9], [0, 1, 1, 0])

  return (
    <section ref={containerRef} className="relative h-[400vh] w-full bg-transparent backdrop-blur-sm text-fg border-y border-border/30">
      
      <div className="sticky top-0 flex min-h-screen w-full items-center justify-between px-6 lg:px-20 overflow-hidden py-24">
        
        {/* Cinematic Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Text Content (Left) */}
        <div className="w-5/12 flex flex-col justify-center gap-8 z-20 pl-4 lg:pl-10 h-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest w-fit">
             <Cpu className="h-3 w-3" /> Hardware-Level Orchestration
          </div>
          
          <h3 className="text-4xl lg:text-5xl font-black tracking-tight text-fg">
            The Offensive <span className="text-primary italic">Arsenal</span>
          </h3>
          
          <p className="text-fg-muted text-base lg:text-lg font-medium leading-relaxed max-w-md">
            VAPTShield structurally unifies disparate security toolchains into a single, high-performance execution environment. Trigger scans, intercept traffic, and exploit vulnerabilities natively.
          </p>

          <div className="grid grid-cols-1 gap-6 mt-4">
             <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-lg bg-panel border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <Terminal className="text-primary h-5 w-5" />
               </div>
               <div>
                  <h4 className="font-bold text-fg">Cloud Kali Terminal</h4>
                  <p className="text-sm text-fg-muted font-medium">Full root-access Kali Linux environments spun up instantly via the browser for manual exploitation.</p>
               </div>
             </div>
             
             <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-lg bg-panel border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldAlert className="text-danger h-5 w-5" />
               </div>
               <div>
                  <h4 className="font-bold text-fg">ZAP Proxy Integration</h4>
                  <p className="text-sm text-fg-muted font-medium">Deep bi-directional sync with OWASP ZAP to intercept, manipulate, and analyze web traffic in real-time.</p>
               </div>
             </div>

             <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-lg bg-panel border border-border flex items-center justify-center shrink-0 shadow-sm">
                  <RefreshCw className="text-blue-500 h-5 w-5" />
               </div>
               <div>
                  <h4 className="font-bold text-fg">CI/CD Pipeline Scanner</h4>
                  <p className="text-sm text-fg-muted font-medium">Automated SAST & DAST orchestration natively injected into your DevOps deployment lifecycle.</p>
               </div>
             </div>
          </div>
        </div>

        {/* 3D Isometric Illustration (Right) */}
        <div className="w-7/12 h-full flex items-center justify-center relative perspective-[2000px] mt-16 2xl:mt-24">
          
          <div 
            className="relative w-[450px] h-[450px]"
            style={{ 
              transform: 'rotateX(60deg) rotateZ(-45deg)', 
              transformStyle: 'preserve-3d' 
            }}
          >
            {/* Base Outline Layers (Expand Downward) */}
            <BaseGhostLayers progress={progress} count={5} />

            {/* Top Base Plate (Fixed at Z=0) */}
            <div className="absolute inset-0 bg-bg border border-primary/50 dark:border-primary/10 dark:border-fg/50 rounded-3xl flex items-center justify-center shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]" style={{ transformStyle: 'preserve-3d' }}>
               <div className="w-[94%] h-[94%] border border-primary/20 dark:border-fg/10 rounded-2xl" />
               <div className="absolute w-[80%] h-[80%] border border-primary/10 dark:border-fg/5 rounded-xl" />
            </div>

            {/* 4 Corner Screws */}
            <Screw x={25} y={25} progress={progress} targetZ={150} />
            <Screw x={425} y={25} progress={progress} targetZ={150} />
            <Screw x={25} y={425} progress={progress} targetZ={150} />
            <Screw x={425} y={425} progress={progress} targetZ={150} />

            {/* CENTRAL CPU / AI CORE */}
            <WireframeBlock x={165} y={165} w={120} h={120} d={20}>
               <div className="w-20 h-20 border border-primary/40 rounded-full flex items-center justify-center relative">
                 <div className="absolute inset-2 border border-primary/30 rounded-full animate-[spin_4s_linear_infinite]" />
                 <div className="w-8 h-8 bg-primary rounded-full shadow-[0_0_40px_rgba(var(--primary),0.8)] animate-pulse" />
               </div>
            </WireframeBlock>
            
            <AccordionStack x={225} y={225} progress={progress} baseZ={20} targetZ={320} count={5} w={70} h={70} />

            {/* Memory Lanes */}
            <WireframeBlock x={330} y={100} w={15} h={140} d={30} />
            <WireframeBlock x={360} y={100} w={15} h={140} d={30} />
            <WireframeBlock x={390} y={100} w={15} h={140} d={30} />

            {/* Crypto Engine Block */}
            <WireframeBlock x={60} y={280} w={80} h={80} d={40}>
               <GlowingNode progress={progress} />
            </WireframeBlock>
            <HoverGear x={100} y={320} progress={progress} baseZ={40} targetZ={200} size={60} />

            {/* Mini Chip 1 */}
            <WireframeBlock x={80} y={60} w={50} h={50} d={15}>
               <GlowingNode progress={progress} />
            </WireframeBlock>
            <AccordionStack x={105} y={85} progress={progress} baseZ={15} targetZ={420} count={6} w={32} h={32} />

            {/* Mini Chip 2 */}
            <WireframeBlock x={260} y={320} w={60} h={60} d={15}>
               <GlowingNode progress={progress} color="bg-primary" shadow="rgba(var(--primary), 0.6)" />
            </WireframeBlock>
            <AccordionStack x={290} y={350} progress={progress} baseZ={15} targetZ={180} count={4} w={40} h={40} />

            {/* Data Node */}
            <WireframeBlock x={360} y={280} w={50} h={80} d={25} />
            <AccordionStack x={385} y={320} progress={progress} baseZ={25} targetZ={280} count={8} w={36} h={36} />

          </div>
        </div>

      </div>
    </section>
  )
}
