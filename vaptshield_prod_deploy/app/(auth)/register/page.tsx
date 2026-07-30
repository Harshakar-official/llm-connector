import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import RegisterPageContent from "./RegisterClient"
import { getPlatformSetting } from "@/lib/utils/platform-settings"

export const dynamic = "force-dynamic"

/**
 * Registration Page — Server Component
 * Enforces platform-level self-registration gates.
 */
export default async function RegisterPage() {
  // ─── PLATFORM GATE: Self Registration ───
  const registrationEnabled = (await getPlatformSetting("self_registration_enabled", "true")) === "true"
  
  return (
    <Suspense fallback={
      <div className="bg-panel border border-border rounded-md p-12 shadow-sm flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <RegisterPageContent registrationEnabled={registrationEnabled} />
    </Suspense>
  )
}
