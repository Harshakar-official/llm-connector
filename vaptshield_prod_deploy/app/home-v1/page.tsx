import { ThemeToggle } from "@/components/shared/theme-toggle"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldCheck, AlertTriangle, FileSearch, Activity, ArrowRight } from "lucide-react"

export default function DesignSystemShowcase() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Topbar */}
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">
              VAPTShield
            </span>
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              Design System
            </Badge>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Quick Links */}
      <div className="flex items-center gap-3">
        <Link href="/login">
          <Button variant="outline" size="sm" className="gap-2">
            Sign In <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
        <Link href="/register">
          <Button size="sm" className="gap-2">
            Register <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Main */}
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
        {/* Hero */}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            VAPTShield Design System
          </h1>
          <p className="text-sm text-fg-muted">
            Enterprise theme · Light + Dark mode · Inter for UI · JetBrains Mono
            for data
          </p>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Total Projects
              </CardTitle>
              <FileSearch className="h-4 w-4 text-fg-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums font-mono">
                24
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-success">▲ 3</span> from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Critical Findings
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-fg-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums font-mono text-severity-critical">
                12
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-severity-critical">▲ 4</span> from last
                week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Successful Scans
              </CardTitle>
              <Activity className="h-4 w-4 text-fg-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums font-mono">
                147
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-success">98.7%</span> success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Failed Scans
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-fg-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums font-mono text-severity-high">
                2
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-severity-high">▼ 1</span> from last week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Severity badges showcase */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Severity System</CardTitle>
            <CardDescription>
              Functional colors for vulnerability severity levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-severity-critical-border bg-severity-critical-bg px-2.5 py-1 text-xs font-medium text-severity-critical">
                <span className="h-1.5 w-1.5 rounded-full bg-severity-critical" />
                CRITICAL
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-severity-high-border bg-severity-high-bg px-2.5 py-1 text-xs font-medium text-severity-high">
                <span className="h-1.5 w-1.5 rounded-full bg-severity-high" />
                HIGH
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-severity-medium-border bg-severity-medium-bg px-2.5 py-1 text-xs font-medium text-severity-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-severity-medium" />
                MEDIUM
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-severity-low-border bg-severity-low-bg px-2.5 py-1 text-xs font-medium text-severity-low">
                <span className="h-1.5 w-1.5 rounded-full bg-severity-low" />
                LOW
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-severity-info-border bg-severity-info-bg px-2.5 py-1 text-xs font-medium text-severity-info">
                <span className="h-1.5 w-1.5 rounded-full bg-severity-info" />
                INFO
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Buttons + form showcase */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Buttons</CardTitle>
              <CardDescription>
                Primary, secondary, ghost, destructive variants
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Form Elements</CardTitle>
              <CardDescription>
                Inputs and labels with focus states
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" placeholder="you@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="font-mono"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Typography showcase */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Typography</CardTitle>
            <CardDescription>
              Inter for UI, JetBrains Mono for data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-fg-muted">
                UI Text (Inter)
              </p>
              <p className="text-base">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fg-muted">
                Data / Code (JetBrains Mono)
              </p>
              <p className="font-mono text-sm">
                CVE-2024-1337 · CVSS 9.8 · 2024-05-08T10:32:14Z
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fg-muted">
                Tabular numbers
              </p>
              <p className="font-mono tabular-nums text-2xl font-semibold">
                1,234,567
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="pt-8 text-center text-xs text-fg-subtle">
          VAPTShield · Enterprise Design System · Step 1.5
        </div>
      </main>
    </div>
  )
}
