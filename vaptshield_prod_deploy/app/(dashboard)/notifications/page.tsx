import { getSafeSession } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import NotificationsPageClient from "./NotificationsPageClient"

export const dynamic = "force-dynamic"

export default async function NotificationsPage() {
    const { orgId, user, error } = await getSafeSession()
    
    if (error || !orgId || !user) {
        redirect("/login")
    }

    const supabase = await getServerClient()
    
    // Fetch all notifications for the user
    const { data: notifications } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)

    return (
        <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-700">
            <div>
                <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">Notification <span className="text-primary">Center</span></h1>
                <p className="mt-1 text-sm text-fg-muted font-medium">
                    Manage your security alerts and remediation updates.
                </p>
            </div>

            <NotificationsPageClient initialNotifications={notifications || []} />
        </div>
    )
}
