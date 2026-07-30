"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ShieldAlert, AlertTriangle, RefreshCw, History, ShieldCheck, CheckCircle2, Lock } from "lucide-react"
import { FindingHeader } from "@/components/findings/detail/FindingHeader"
import { FindingSidebar } from "@/components/findings/detail/FindingSidebar"
import { FindingStatusActions } from "@/components/findings/detail/FindingStatusActions"
import { FindingTabs } from "@/components/findings/detail/FindingTabs"
import { FindingForm } from "@/components/findings/FindingForm"
import { bulkUpdateStatus } from "../actions"
import { toast } from "sonner"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/hooks/useAuth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

// Types...
interface VulnAttachment {
    id: string
    original_filename: string
    stored_filename: string
    file_url: string
    mime_type: string
    file_size_bytes: number
    created_at: string
}

interface Finding {
    id: string
    project_id: string
    title: string
    description: string
    severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
    status: 'open' | 'reopened' | 'in_progress' | 'resolved' | 'verified' | 'closed' | 'accepted_risk' | 'false_positive'
    cve_id: string | null
    cwe_id: string | null
    owasp_category: string | null
    cvss_score: number | null
    cvss_vector: string | null
    endpoint_url: string | null
    affected_component: string | null
    proof_of_concept: string | null
    impact: string | null
    remediation: string | null
    remediation_notes?: string | null
    remediation_proof_url?: string | null
    reference_links: string[] | null
    assigned_to: string | null
    version: number
    created_at: string
    updated_at: string
    projects: { id: string, name: string, status: string } | null
    profiles: { id: string, full_name: string, avatar_url: string | null } | null
    assigned_to_profile: { id: string, full_name: string, avatar_url: string | null } | null
    vuln_attachments: VulnAttachment[] | null
}

interface AuditEntry {
    id: string
    action: string
    created_at: string
    actor_id: string
    profiles: { full_name: string, avatar_url: string | null } | null
    new_value: Record<string, unknown> | null
}

interface Comment {
  id: string
  content: string
  created_at: string
  author_id: string
  is_edited: boolean
  profiles: {
    full_name: string
    avatar_url: string | null
    role: string
  }
}

interface Props {
  finding: Finding
  projects: { id: string, name: string }[]
  members: { id: string, full_name: string, role: string }[]
  activity: AuditEntry[]
  comments: Comment[]
  userRole: string
  currentUserId: string
}

export function FindingDetailClient({ finding, projects: rawProjects, members: rawMembers, activity, comments, userRole, currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile: currentUserProfile } = useAuth()

  const projects = useMemo(() => rawProjects, [rawProjects])
  const members = useMemo(() => rawMembers, [rawMembers])

  const isLocked = finding.projects?.status === 'completed' || finding.projects?.status === 'archived'
  const canModify = ['admin', 'program_manager', 'security_engineer'].includes(userRole)
  
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "description")
  const [confirmTransition, setConfirmTransition] = useState<string | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  const setTab = (tab: string) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const supabase = getBrowserClient()
    const channel = supabase
      .channel("finding-" + finding.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vulnerabilities", filter: "id=eq." + finding.id }, (payload: any) => {
          if (payload.new?.version !== payload.old?.version) {
            toast.warning("Finding updated by another user", {
              description: "Consider refreshing to see latest changes.",
              action: { label: "Refresh", onClick: () => router.refresh() },
            })
          }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [finding.id, router])

  const executeStatusTransition = useCallback(async (newStatus: string) => {
    setProcessingStatus(newStatus)
    const previousStatus = optimisticStatus || finding.status
    setOptimisticStatus(newStatus)
    try {
        const result = await bulkUpdateStatus({
            ids: [finding.id],
            status: newStatus as any,
            version: finding.version,
            currentStatus: finding.status as any,
        })
        if (result.success) {
            toast.success(`Finding moved to ${newStatus.replace("_", " ")}`)
            router.refresh()
        } else {
            setOptimisticStatus(previousStatus)
            toast.error(result.error)
        }
    } catch (err) {
        setOptimisticStatus(previousStatus)
        toast.error("Failed to update status")
    } finally {
        setProcessingStatus(null)
    }
  }, [finding.id, finding.version, finding.status, optimisticStatus, router])

  const STATUS_STEPS = useMemo(() => [
    { id: 'open', label: 'Open', icon: AlertTriangle, color: 'text-severity-critical' },
    { id: 'reopened', label: 'Re-opened', icon: RefreshCw, color: 'text-orange-500' },
    { id: 'in_progress', label: 'In Progress', icon: History, color: 'text-warning' },
    { id: 'resolved', label: 'Resolved', icon: ShieldCheck, color: 'text-success' },
    { id: 'verified', label: 'Verified', icon: CheckCircle2, color: 'text-purple-500' },
    { id: 'closed', label: 'Closed', icon: Lock, color: 'text-fg-disabled' },
  ], [])

  const handleConfirmTransition = () => {
    const target = confirmTransition
    setConfirmTransition(null)
    if (target) executeStatusTransition(target)
  }

  const displayStatus = optimisticStatus || finding.status

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-500">
      {isLocked && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm font-bold">Project is Locked. Modifications are disabled.</div>
        </div>
      )}

      <FindingHeader 
        title={finding.title} 
        canModify={canModify} 
        isLocked={isLocked} 
        onEditClick={() => setIsFormOpen(true)} 
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
          <FindingSidebar finding={finding} displayStatus={displayStatus} />

          <main className="space-y-6 flex flex-col">
              <FindingStatusActions 
                statusSteps={STATUS_STEPS}
                displayStatus={displayStatus}
                processingStatus={processingStatus}
                canModify={canModify}
                isLocked={isLocked}
                onStatusTransition={(s) => ['resolved', 'accepted_risk', 'false_positive'].includes(s) ? setConfirmTransition(s) : executeStatusTransition(s)}
              />

              <FindingTabs 
                activeTab={activeTab}
                onTabChange={setTab}
                finding={finding}
                comments={comments}
                activity={activity}
                userRole={userRole}
                currentUserId={currentUserId}
                currentUserProfile={currentUserProfile}
                isLocked={isLocked}
                onRemediationSuccess={() => { setOptimisticStatus('resolved'); router.refresh(); }}
                members={members}
              />
          </main>
      </div>

      <AlertDialog open={confirmTransition !== null} onOpenChange={(open) => !open && setConfirmTransition(null)}>
        <AlertDialogContent className="bg-panel border-border text-fg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription className="text-fg-muted">
                This action indicates a significant state change in the vulnerability lifecycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTransition}
              className={cn(
                confirmTransition === 'resolved' && "bg-success hover:bg-success/90",
                confirmTransition === 'accepted_risk' && "bg-fg-muted hover:bg-fg-muted/90",
                confirmTransition === 'false_positive' && "bg-fg-disabled hover:bg-fg-disabled/90"
              )}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FindingForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        projects={projects}
        members={members}
        initialData={{
            ...finding,
            cvss_score: finding.cvss_score || 0,
            reference_links: finding.reference_links || [],
            severity: finding.severity as any,
            status: finding.status as any,
            vuln_attachments: finding.vuln_attachments || undefined,
        }}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
