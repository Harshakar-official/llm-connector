"use client"

import { useState } from "react"
import { 
    CheckCircle2, 
    XCircle, 
    Loader2, 
    MessageSquare, 
    AlertTriangle,
    Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { approveScanFinding, rejectScanFinding } from "@/app/(dashboard)/findings/approval-actions"

interface ApproveButtonProps {
  scanFindingId: string
  onApprove?: (vulnId: string) => void
  onReject?: () => void
}

export function ApproveButton({ scanFindingId, onApprove, onReject }: ApproveButtonProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const handleApprove = async () => {
    setIsApproving(true)
    try {
        const result = await approveScanFinding({ scanFindingId })
        if (result.success) {
            toast.success("Finding approved", {
                description: "AI normalization complete. Linked to vulnerability inventory.",
                icon: <Sparkles className="h-4 w-4 text-primary" />
            })
            onApprove?.(result.vulnId!)
        } else {
            toast.error(result.error || "Approval failed")
        }
    } catch (err) {
        toast.error("Internal connection error during approval")
    } finally {
        setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (rejectionReason.length < 5) {
        toast.error("Please provide a valid reason for rejection (min 5 chars)")
        return
    }

    setIsRejecting(true)
    try {
        const result = await rejectScanFinding({ 
            scanFindingId, 
            reason: rejectionReason 
        })
        if (result.success) {
            toast.success("Finding rejected", {
                description: "Marked as false positive/rejected in scan results."
            })
            setIsRejectModalOpen(false)
            onReject?.()
        } else {
            toast.error(result.error || "Rejection failed")
        }
    } catch (err) {
        toast.error("Internal connection error during rejection")
    } finally {
        setIsRejecting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* APPROVE BUTTON */}
      <Button 
        size="sm" 
        className="h-8 gap-2 bg-success text-white hover:bg-success/90 border-success shadow-lg shadow-success/10 font-bold px-4"
        onClick={handleApprove}
        disabled={isApproving || isRejecting}
      >
        {isApproving ? (
            <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Normalizing...
            </>
        ) : (
            <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve
            </>
        )}
      </Button>

      {/* REJECT BUTTON */}
      <Button 
        size="sm" 
        variant="outline"
        className="h-8 gap-2 border-border text-fg-muted hover:text-danger hover:border-danger/30 font-bold px-4"
        onClick={() => setIsRejectModalOpen(true)}
        disabled={isApproving || isRejecting}
      >
        <XCircle className="h-3.5 w-3.5" />
        Reject
      </Button>

      {/* REJECT MODAL */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-md bg-panel border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-5 w-5" />
              Reject Scan Result
            </DialogTitle>
            <DialogDescription className="text-fg-muted">
              Why are you rejecting this finding? This will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
              <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" /> Rejection Reason *
                  </label>
                  <Textarea 
                    placeholder="e.g. False positive, known issue, or out of scope..." 
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="bg-bg border-border min-h-[100px] resize-none text-sm"
                  />
              </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)} disabled={isRejecting} className="border-border">
              Cancel
            </Button>
            <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={isRejecting}
                className="font-bold shadow-lg shadow-danger/20"
            >
              {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
