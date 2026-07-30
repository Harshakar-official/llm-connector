import Link from "next/link"
import { ShieldAlert, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-lg shadow-danger/20">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <h1 className="mb-2 text-4xl font-black italic uppercase tracking-tighter text-fg sm:text-6xl">
        404 <span className="text-primary">Defeated</span>
      </h1>
      <p className="mb-10 max-w-md text-lg text-fg-muted font-medium">
        The target path does not exist or has been neutralized. Verification failed.
      </p>
      <Link href="/dashboard">
        <Button size="lg" className="rounded-xl font-bold shadow-xl shadow-primary/20">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back to Command Center
        </Button>
      </Link>
    </div>
  )
}
