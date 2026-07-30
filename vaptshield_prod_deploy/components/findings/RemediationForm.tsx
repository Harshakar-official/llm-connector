"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { 
  ShieldCheck, 
  Loader2, 
  Paperclip, 
  AlertCircle,
  FileText,
  CheckCircle2
} from "lucide-react"
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { remediateFinding } from "@/app/(dashboard)/findings/actions"
import { useRouter } from "next/navigation"

const remediateSchema = z.object({
  notes: z.string().min(10, "Please provide at least 10 characters detailing the fix."),
  proofUrl: z.string().optional().or(z.literal("")), // Relaxed URL validation to allow multiple links
})

type FormValues = z.infer<typeof remediateSchema>

interface RemediationFormProps {
  findingId: string
  version: number
  onSuccess?: () => void
}

export function RemediationForm({ findingId, version, onSuccess }: RemediationFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(remediateSchema),
    defaultValues: {
      notes: "",
      proofUrl: "",
    },
  })

  async function onSubmit(data: FormValues) {
    setIsLoading(true)
    try {
      const result = await remediateFinding({
        id: findingId,
        version: version,
        notes: data.notes,
        proofUrl: data.proofUrl,
      })

      if (result.success) {
        toast.success("Finding marked as Resolved. SE has been notified for verification.")
        form.reset()
        if (onSuccess) onSuccess()
        router.refresh()
      } else {
        toast.error(result.error || "Failed to submit remediation")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-bg-muted/30 border border-border/50 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2 text-success mb-2">
        <ShieldCheck className="h-5 w-5" />
        <h3 className="font-bold text-sm uppercase tracking-wider">Submit Remediation Fix</h3>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-fg-muted uppercase">Fix Description & Notes</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Describe how the vulnerability was fixed (e.g., input sanitization added, dependency updated...)" 
                    className="bg-bg border-border min-h-[100px] text-sm"
                    {...field} 
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="proofUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-fg-muted uppercase flex items-center gap-1">
                   <Paperclip className="h-3 w-3" /> Proof of Fix URL(s) (Optional)
                </FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="https://github.com/org/repo/pull/123, https://jira.com/issue/456" 
                    className="bg-bg border-border text-sm min-h-[60px]"
                    {...field} 
                  />
                </FormControl>
                <FormDescription className="text-[10px]">
                   Links to Pull Requests, Jira tickets, or internal documentation. Separate multiple URLs with a comma or new line.
                </FormDescription>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <div className="pt-2">
            <Button 
                type="submit" 
                className="w-full bg-success hover:bg-success/90 text-white font-bold h-11 rounded-xl gap-2 shadow-lg shadow-success/20 transition-all active:scale-[0.98]"
                disabled={isLoading}
            >
              {isLoading ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Fix...
                </>
              ) : (
                <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Fix for Verification
                </>
              )}
            </Button>
          </div>

          <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/10 p-3 rounded-xl">
             <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
             <p className="text-[10px] text-blue-500/80 italic leading-relaxed">
                By submitting, the finding status will move to 'Resolved'. A Security Engineer will be notified to perform a re-test and close the ticket.
             </p>
          </div>
        </form>
      </Form>
    </div>
  )
}
