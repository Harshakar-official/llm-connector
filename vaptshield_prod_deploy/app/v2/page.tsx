"use client"
import Link from "next/link"
import Image from "next/image"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { cn } from "@/lib/utils"
import SmoothScrollProvider from "@/components/SmoothScrollProvider"

const CinematicBackground = dynamic(() => import("@/components/CinematicBackground"), { ssr: false })
const Dashboard3DCard = dynamic(() => import("@/components/Dashboard3DCard"), { ssr: false })
const WireframeExplodedView = dynamic(() => import("@/components/WireframeExplodedView"), { ssr: false })
import { 
  ShieldCheck, 
  ArrowRight, 
  Zap, 
  Target, 
  Lock, 
  Cpu, 
  FileText, 
  Layers,
  CheckCircle2,
  Terminal,
  Sparkles,
  Bot,
  Binary,
  Bug,
  Flame,
  FileCode2,
  MessageSquare,
  Users,
  ListTodo,
  Mail
} from "lucide-react"

export default function LandingPage() {
  return (
    <SmoothScrollProvider>
      <div className="min-h-screen bg-transparent selection:bg-primary/20 relative">
        <CinematicBackground />
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-bold tracking-tight text-fg italic uppercase">
              VAPT<span className="text-primary">Shield</span>
            </span>
          </div>
          
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#platform" className="text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary transition-colors">Platform</Link>
            <Link href="#ai-intelligence" className="text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary transition-colors">AI Intelligence</Link>
            <Link href="#lifecycle" className="text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary transition-colors">VAPT Lifecycle</Link>
            <Link href="#security" className="text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary transition-colors">Security</Link>
            <Link href="#" className="text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary transition-colors opacity-50 cursor-not-allowed flex items-center gap-1">Docs <Lock className="h-2.5 w-2.5" /></Link>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login" className="hidden text-xs font-bold uppercase tracking-tighter text-fg-muted hover:text-fg md:block">
              Sign In
            </Link>
            <Link href="/register">
              <Button size="sm" className="rounded-full px-5 font-bold uppercase tracking-widest text-[10px]">
                Initialize
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pb-20 pt-32 md:pt-48 lg:pb-32 lg:pt-56">
        <div className="container relative z-10 mx-auto px-6 text-center text-fg">
          <Badge variant="outline" className="mb-6 rounded-full border-primary/20 bg-primary/5 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-primary shadow-sm">
            NEXT-GEN OFFENSIVE CAPABILITY 2026
          </Badge>
          <h1 className="mx-auto max-w-5xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            The Ultimate Command Center for <br/>
            <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent underline decoration-primary/20 decoration-4 underline-offset-8 italic">Enterprise VAPT</span>
          </h1>
          <p className="mx-auto mt-10 max-w-3xl text-lg text-fg-muted sm:text-xl leading-relaxed">
            Transition from scattered spreadsheets to a unified offensive ecosystem. Orchestrate <span className="text-fg font-semibold">Automated Scans</span>, execute manual exploits, and streamline developer remediation through <span className="text-fg font-semibold italic">Real-Time AI Synthesis</span>.
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="h-14 rounded-full px-10 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                Join the Mission <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
            </Link>
            <Link href="#platform">
              <Button variant="outline" size="lg" className="h-14 rounded-full border-border bg-transparent px-10 text-lg font-bold transition-all hover:bg-bg-subtle text-fg">
                Explore Arsenal
              </Button>
            </Link>
          </div>

          {/* Real Dashboard Preview with 3D Tilt Effect */}
          <Dashboard3DCard />
        </div>
      </section>

      {/* Improved Trust Strip with Real Partner Logos */}
      <section className="border-y border-border bg-bg-subtle py-12">
        <div className="container mx-auto px-6">
          <p className="mb-10 text-center text-[10px] font-black uppercase tracking-[0.4em] text-fg-subtle">
            Trusted by the Architects of Modern Security
          </p>
          <div className="flex flex-wrap items-center justify-center gap-16 md:gap-32">
             {/* SecPrima Logo */}
             <div className="flex items-center gap-4 group cursor-default">
               <div className="relative h-12 w-32 md:h-14 md:w-40 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500 group-hover:scale-105">
                 <Image 
                   src="/SecPrima Final Logo.avif" 
                   alt="SecPrima" 
                   fill 
                   className="object-contain"
                 />
               </div>
             </div>

             {/* SDET360 Logo */}
             <div className="flex items-center gap-4 group cursor-default">
               <div className="relative h-12 w-32 md:h-14 md:w-40 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500 group-hover:scale-105">
                 <Image 
                   src="/sdet_logo.png" 
                   alt="SDET360" 
                   fill 
                   className="object-contain"
                 />
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* 3D Exploded View Scroll Animation */}
      <WireframeExplodedView />

      {/* AI Intelligence Section */}
      <section id="ai-intelligence" className="py-24 lg:py-32 overflow-hidden relative">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-96 h-96 bg-primary/10 blur-[100px] rounded-full" />
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                <Sparkles className="h-3 w-3" /> Autonomous Synthesis
              </div>
              <h2 className="text-4xl font-extrabold tracking-tight text-fg lg:text-5xl">
                Intelligence for <br/> <span className="text-primary">Next-Gen Triage</span>
              </h2>
              <p className="text-lg text-fg-muted leading-relaxed">
                VAPTShield utilizes advanced AI-Powered Vulnerability Synthesis to normalize complex exploit findings across disparate scanning toolsets. 
                Our platform performs intelligent triage, reduces false positives, and auto-generates actionable patch strategies.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-border bg-panel/50 backdrop-blur-sm shadow-sm hover:border-primary/50 transition-colors">
                  <Bot className="h-8 w-8 text-primary mb-4" />
                  <h4 className="font-bold mb-2 text-fg">Automated Synthesis</h4>
                  <p className="text-sm text-fg-muted text-balance font-medium">Validate and prioritize thousands of findings in seconds with deep context analysis.</p>
                </div>
                <div className="p-6 rounded-2xl border border-border bg-panel/50 backdrop-blur-sm shadow-sm hover:border-primary/50 transition-colors">
                  <Binary className="h-8 w-8 text-blue-500 mb-4" />
                  <h4 className="font-bold mb-2 text-fg">Smart Remediation</h4>
                  <p className="text-sm text-fg-muted text-balance font-medium">Generate ready-to-deploy patch strategies and CVSS 4.0 vectors automatically.</p>
                </div>
              </div>
            </div>
            
            {/* Atom Graphic */}
            <div className="flex-1 relative w-full aspect-square max-w-lg mx-auto">
              <div className="absolute inset-0 bg-primary/5 rounded-full animate-pulse blur-xl" />
              <div className="absolute inset-8 border border-primary/20 rounded-full animate-[spin_20s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel p-3 rounded-full border border-border shadow-lg group hover:scale-110 transition-transform">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-panel p-3 rounded-full border border-border shadow-lg group hover:scale-110 transition-transform">
                  <Bug className="h-6 w-6 text-danger" />
                </div>
              </div>
              <div className="absolute inset-24 border border-primary/30 rounded-full animate-[spin_15s_linear_infinite_reverse]">
                <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel p-3 rounded-full border border-border shadow-lg group hover:scale-110 transition-transform">
                  <Flame className="h-6 w-6 text-warning" />
                </div>
                <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 bg-panel p-3 rounded-full border border-border shadow-lg group hover:scale-110 transition-transform">
                  <FileCode2 className="h-6 w-6 text-success" />
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center backdrop-blur-md border border-primary/40 shadow-[0_0_40px_rgba(var(--primary),0.4)] z-10">
                  <Cpu className="h-12 w-12 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section id="platform" className="py-24 lg:py-32 bg-bg-subtle/50">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl uppercase italic">
              Engineered for <span className="text-primary">Global Scale</span>
            </h2>
            <p className="mt-4 text-lg text-fg-muted max-w-2xl mx-auto font-medium">
              A comprehensive ecosystem designed to manage, track, and execute enterprise-wide security assessments.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
            <div className="group relative col-span-1 rounded-3xl border border-border bg-panel p-8 transition-all hover:border-primary/50 hover:shadow-xl md:col-span-3">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-fg">Multi-Tenant Command</h3>
              <p className="text-fg-muted text-balance font-medium">
                Zero-trust data isolation. Orchestrate security for thousands of organizations 
                with absolute cryptographic separation and unified management.
              </p>
            </div>
            <div className="group relative col-span-1 rounded-3xl border border-border bg-panel p-8 transition-all hover:border-primary/50 hover:shadow-xl md:col-span-3">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-fg">Native Tool Orchestration</h3>
              <p className="text-fg-muted text-balance font-medium">
                Seamless integration with ZAP Proxy, Kali toolchains, and custom scanners. 
                Ingest findings directly into your security lifecycle.
              </p>
            </div>
            <div className="group relative col-span-1 rounded-3xl border border-border bg-panel p-8 transition-all hover:border-primary/50 hover:shadow-xl md:col-span-4">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
                <Terminal className="h-6 w-6" />
              </div>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h3 className="mb-2 text-xl font-bold text-fg">Smart Ticket System</h3>
                  <p className="text-fg-muted text-balance max-w-md font-medium">
                    Synchronized vulnerability lifecycle. Assign targets to developers, track remediation progress in real-time, and eliminate manual tracking.
                  </p>
                </div>
                <div className="h-32 w-full md:w-64 bg-bg-muted rounded-xl border border-border/50 flex items-center justify-center opacity-40">
                   <div className="flex gap-2">
                     <div className="h-16 w-12 rounded bg-panel border border-border" />
                     <div className="h-16 w-12 rounded bg-panel border border-border" />
                     <div className="h-16 w-12 rounded bg-primary/20 border border-primary/40" />
                   </div>
                </div>
              </div>
            </div>
            <div className="group relative col-span-1 rounded-3xl border border-border bg-panel p-8 transition-all hover:border-primary/50 hover:shadow-xl md:col-span-2">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-fg">Precision RBAC</h3>
              <p className="text-fg-muted text-balance font-medium">
                5 distinct enterprise roles (Admin, PM, SE, Developer, Guest). Absolute control over visibility and actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* VAPT Lifecycle */}
      <section id="lifecycle" className="relative overflow-hidden py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl uppercase italic font-black">
              The Complete <span className="text-primary">VAPT Lifecycle</span>
            </h2>
            <p className="mt-4 text-lg text-fg-muted max-w-2xl mx-auto font-medium">
              Experience a flawless, end-to-end operational flow designed by offensive security experts.
            </p>
          </div>

          <div className="relative mx-auto max-w-5xl space-y-12">
            <div className="absolute left-8 top-0 h-full w-0.5 bg-gradient-to-b from-primary via-primary/50 to-transparent md:left-1/2" />
            
            {[
              { id: "01", title: "Team Provisioning", desc: "Program Managers securely invite Developers and assign them to specific isolated projects with precise RBAC guardrails.", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
              { id: "02", title: "Discovery & Exploitation", desc: "Security Engineers execute automated scans and perform deep manual pentesting, seamlessly importing PoC payloads into the central dashboard.", icon: Target, color: "text-red-500", bg: "bg-red-500/10" },
              { id: "03", title: "Smart Ticket Assignment", desc: "Findings are instantly routed to the dedicated developer's Tracker Grid with aggregated smart notifications to prevent alert fatigue.", icon: ListTodo, color: "text-warning", bg: "bg-warning/10" },
              { id: "04", title: "Real-time Remediation", desc: "Developers and Security Engineers collaborate via the sub-100ms bidirectional chat engine to resolve blockers and submit patch proofs.", icon: MessageSquare, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { id: "05", title: "Verification & Closure", desc: "Security teams receive instant 'Fix Ready' alerts. They re-test the exploit and officially mark the finding as Verified or Re-opened.", icon: ShieldCheck, color: "text-purple-500", bg: "bg-purple-500/10" },
              { id: "06", title: "Executive Reporting", desc: "Generate board-ready DOCX and PDF reports with custom organization branding, summarizing the complete security posture.", icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10" }
            ].map((step, i) => (
              <div key={step.id} className={cn(
                "relative flex flex-col items-start gap-8 md:flex-row md:items-center transition-all hover:translate-x-2 md:hover:translate-x-0 md:hover:scale-[1.02]",
                i % 2 === 0 ? "" : "md:flex-row-reverse"
              )}>
                <div className="absolute left-8 h-8 w-8 -translate-x-1/2 rounded-full border-4 border-bg bg-primary shadow-lg shadow-primary/30 md:left-1/2" />
                <div className={cn("flex-1 rounded-2xl border border-border bg-panel p-8 shadow-sm", i % 2 === 0 ? "md:text-right" : "md:text-left")}>
                  <div className={cn("inline-flex items-center justify-center h-10 w-10 rounded-full mb-4", step.bg, step.color, i % 2 === 0 ? "md:ml-auto" : "md:mr-auto")}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h4 className="text-lg font-bold text-fg">{step.id}. {step.title}</h4>
                  <p className="mt-2 text-sm text-fg-muted font-medium">{step.desc}</p>
                </div>
                <div className="hidden flex-1 md:block" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Infrastructure */}
      <section id="security" className="py-24 lg:py-32">
        <div className="container mx-auto px-6">
          <div className="rounded-3xl bg-primary px-8 py-16 text-center text-primary-fg shadow-2xl shadow-primary/20 lg:px-16 lg:py-24">
            <Lock className="mx-auto mb-6 h-12 w-12 opacity-80" />
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl font-black italic uppercase">
              Z+ Security Infrastructure
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg opacity-90 sm:text-xl font-medium">
              We protect your data with the same intensity you use to find vulnerabilities. 
              Absolute isolation. AES-256-GCM Zero-Knowledge Encryption. Post-Quantum Ready.
            </p>
            <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
              {[
                "MFA & FIDO2 Support",
                "Cryptographic RLS",
                "Immutable Logging",
                "ISO 27001 Ready"
              ].map(feat => (
                <div key={feat} className="space-y-2">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-white" />
                  <p className="font-bold uppercase tracking-widest text-[9px]">{feat}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 lg:py-32 bg-bg">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-black tracking-tight text-fg uppercase italic">Security & <span className="text-primary">Reliability FAQ</span></h2>
            <p className="mt-4 text-sm text-fg-muted font-medium uppercase tracking-widest">Everything you need to know about VAPTShield deployment.</p>
          </div>
          <div className="space-y-4">
            {[
              { q: "How is data isolated between organizations?", a: "VAPTShield uses a tiered Row-Level Security (RLS) architecture. Every single record in our database is cryptographically bound to an organization ID, ensuring zero data leakage between tenants." },
              { q: "Can we integrate existing CI/CD pipelines?", a: "Yes. Our Next-Gen API allows you to ingest findings from automated CI/CD security stages (SAST/DAST) directly into the Project findings tab for centralized triage." },
              { q: "What scanning tools are natively orchestrated?", a: "The platform provides deep orchestration for ZAP Proxy, Semgrep, Trivy, and Gitleaks, with modular support for custom offensive toolchains." },
              { q: "Is our data encrypted at rest?", a: "All sensitive organizational data and finding details are encrypted using AES-256-GCM. We follow a strict 'Zero-Access' policy for production databases." }
            ].map((faq, i) => (
              <div key={i} className="bg-panel border border-border rounded-2xl p-6 transition-all hover:border-primary/30">
                <h4 className="text-sm font-bold text-fg mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" /> {faq.q}
                </h4>
                <p className="text-xs text-fg-muted leading-relaxed font-medium pl-3.5 border-l border-border/50">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 lg:py-32 relative overflow-hidden bg-bg">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-[120px] -z-10" />
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-fg lg:text-6xl">
            Scale Your Offensive Capability. <br/> <span className="text-primary font-black uppercase tracking-tighter">Initialize Command.</span>
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-fg-muted font-medium">
            Deploy the world's most advanced VAPT orchestration ecosystem. 
            VAPTShield is ready to power your global security strategy.
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="h-16 rounded-full px-12 text-xl font-bold shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95">
                Join the Mission <ArrowRight className="ml-2 h-7 w-7" />
              </Button>
            </Link>
            <Button variant="ghost" size="lg" asChild className="h-16 rounded-full px-12 text-xl font-bold text-fg-muted hover:text-fg">
              <a href="mailto:hello@vaptshield.app">
                <Mail className="h-6 w-6 mr-3" /> Contact Sales
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-20 bg-bg">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center justify-between gap-12 md:flex-row">
            <div className="flex flex-col items-center md:items-start gap-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-7 w-7 text-primary" />
                <span className="text-3xl font-black tracking-tighter text-fg italic uppercase">VAPT<span className="text-primary">Shield</span></span>
              </div>
              <p className="text-sm text-fg-subtle max-w-sm text-center md:text-left font-medium leading-relaxed uppercase tracking-tighter">
                The ultimate command center for modern offensive security. 
                Built by experts for the future of global defense.
              </p>
            </div>
            <div className="flex gap-16 text-[10px] font-black uppercase tracking-widest text-fg-muted">
              <div className="flex flex-col gap-6">
                <p className="text-fg font-black opacity-50">Platform</p>
                <Link href="#ai-intelligence" className="hover:text-primary transition-colors">Neural AI</Link>
                <Link href="#lifecycle" className="hover:text-primary transition-colors">VAPT Lifecycle</Link>
              </div>
              <div className="flex flex-col gap-6">
                <p className="text-fg font-black opacity-50">Enterprise</p>
                <Link href="/login" className="hover:text-primary transition-colors">Sign In</Link>
                <Link href="/register" className="hover:text-primary transition-colors">Initialize</Link>
              </div>
            </div>
            <div className="flex flex-col items-center md:items-end gap-4">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-fg-subtle">
                &copy; 2026 VAPTShield Ecosystem
              </p>
              <div className="flex items-center gap-6">
                 <div className="h-10 w-28 relative grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                    <Image src="/SecPrima Final Logo.avif" alt="SecPrima" fill className="object-contain" />
                 </div>
                 <div className="h-10 w-28 relative grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                    <Image src="/sdet_logo.png" alt="SDET360" fill className="object-contain" />
                 </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </SmoothScrollProvider>
  )
}
