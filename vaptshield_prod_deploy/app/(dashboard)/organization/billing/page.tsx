export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { BillingClient } from "@/components/organization/billing/BillingClient"

export default async function BillingPage() {
  const supabase = await getServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.org_id) redirect("/dashboard")
  
  // Only Admin or PM can view billing
  if (profile.role !== 'admin' && profile.role !== 'program_manager') {
      notFound()
  }

  const { data: quota } = await supabase
    .from("org_quotas")
    .select("plan_tier")
    .eq("org_id", profile.org_id)
    .single()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BillingClient 
        currentPlan={quota?.plan_tier || "starter"} 
        orgId={profile.org_id}
      />
    </div>
  )
}
