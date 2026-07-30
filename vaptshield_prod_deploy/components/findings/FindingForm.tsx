"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useForm, useFieldArray, FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import DOMPurify from "dompurify"
import { calculateCvss40 } from "@/lib/utils/cvss-official"
import {
  Loader2,
  ShieldAlert,
  LayoutGrid,
  Save,
  Calculator,
  Zap,
  Users,
  Link as LinkIcon,
  Plus,
  Trash2,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Book,
  X,
  RefreshCcw,
  Search
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip as TooltipBase,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { RichTextEditor } from "@/components/shared/LazyRichTextEditor"
import { CvssCalculator } from "./CvssCalculator"
import { VULNERABILITY_TEMPLATES, VulnerabilityTemplate } from "@/lib/data/vulnerability-templates"
import { PoCStepBuilder, PoCStep } from "./PoCStepBuilder"
import { getBrowserClient } from "@/lib/supabase/client"
import { pocRegistry } from "@/lib/utils/poc-registry"

// ─── XSS SANITIZATION HELPERS ───
const sanitizeHtml = (val: string | null | undefined): string => {
  if (val == null || val === '') return ''
  return DOMPurify.sanitize(val, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'a', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|ftps|mailto):|[#/.])/i,
  })
}

const sanitizePlainText = (val: string | null | undefined): string => {
  if (val == null || val === '') return ''
  return DOMPurify.sanitize(val, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'ftp:', 'ftps:']

function isValidUrlProtocol(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)
  } catch {
    return url.startsWith('/') || url.startsWith('#') || url.startsWith('.')
  }
}

const findingSchema = z.object({
  project_id: z.string().uuid("Please select a target project"),
  title: z.string().min(3, "Title must be at least 3 characters").max(255),
  description: z.string().default("No technical description provided."),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]).default("medium"),
  status: z.enum(["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]).default("open"),
  cve_id: z.string().nullish().or(z.literal("")),
  cwe_id: z.string().nullish().or(z.literal("")),
  owasp_category: z.string().nullish().or(z.literal("")),
  cvss_score: z.number().min(0).max(10).default(0),
  cvss_vector: z.string().nullish().or(z.literal("")),
  endpoint_url: z.string().nullish().or(z.literal("")),
  affected_component: z.string().nullish(),
  proof_of_concept: z.string().nullish(),
  impact: z.string().nullish(),
  remediation: z.string().nullish(),
  reference_links: z.array(z.string()).default([]),
  assigned_to: z.string().uuid().nullish(),
  version: z.number().default(1),
  is_ai_generated: z.boolean().default(false),
  ai_model_used: z.string().nullish(),
})

type FindingFormValues = z.infer<typeof findingSchema>

interface AttachmentMetadata {
    id: string
    name: string
    size: number
    type: string
    url: string
}

interface AttachmentResponse {
    id: string
    original_filename: string
    file_size_bytes: number
    mime_type: string
    file_url: string
}

export interface InitialFindingData extends Partial<FindingFormValues> {
  id?: string
  version?: number
  remediation_notes?: string | null
  remediation_proof_url?: string | null
  vuln_attachments?: AttachmentResponse[]
}

interface Member {
    id: string
    full_name: string
    avatar_url?: string | null
    role?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: { id: string, name: string }[]
  members?: Member[]
  initialData?: InitialFindingData 
  onSuccess: () => void
  onSuccessWithId?: (vulnId: string) => Promise<void>
}

export function FindingForm({ open, onOpenChange, projects, members = [], initialData, onSuccess, onSuccessWithId }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  
  // Z+ UX: Filter members to only show relevant remediation leads (Developers, Clients, Engineers)
  // Admins/Super-admins are removed to prevent assignment confusion.
  const filteredMembers = useMemo(() => {
    return members.filter(m => !['admin', 'super_admin'].includes(m.role || ''))
  }, [members])
  const [activeTab, setActiveTab] = useState("details")
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([])
  
  // ─── AI ASSISTANT STATE ───
  const [isAiMode, setIsAiMode] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false)
  const [templateCategory, setTemplateCategory] = useState<"All" | "Web" | "API" | "Network" | "Cloud">("All")

  const defaultValues = useMemo(() => {
    const defaultObj = {
      title: "",
      description: "No technical description provided.",
      severity: "medium" as const,
      status: "open" as const,
      project_id: projects.length === 1 ? projects[0].id : "",
      cve_id: "",
      cwe_id: "",
      owasp_category: "",
      cvss_score: 0,
      cvss_vector: "",
      endpoint_url: "",
      affected_component: "",
      proof_of_concept: "",
      impact: "",
      remediation: "",
      reference_links: [],
      assigned_to: null,
      version: 1,
      is_ai_generated: false,
      ai_model_used: null,
    }

    const base = initialData ? { ...defaultObj, ...initialData } : defaultObj

    return {
        ...base,
        cve_id: base.cve_id ?? "",
        cwe_id: base.cwe_id ?? "",
        owasp_category: base.owasp_category ?? "",
        cvss_vector: base.cvss_vector ?? "",
        endpoint_url: base.endpoint_url ?? "",
        affected_component: base.affected_component ?? "",
        proof_of_concept: base.proof_of_concept ?? "",
        impact: base.impact ?? "",
        remediation: base.remediation ?? "",
        reference_links: Array.isArray(base.reference_links) ? base.reference_links : [],
    }
  }, [initialData, JSON.stringify(projects)])

  const form = useForm<FindingFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(findingSchema) as any,
    defaultValues,
  })

  // ─── TEMPLATE HANDLER ───
  const applyTemplate = (template: VulnerabilityTemplate) => {
    form.setValue("title", template.title, { shouldValidate: true })

    // Z+ STABILITY: Calculate exact official score from the template vector 
    // instead of relying on hardcoded template scores. This ensures the 
    // base score shown in the UI exactly matches the calculator.
    let finalScore = template.cvss_score || 0
    let finalSeverity = template.severity
    const vectorStr = template.cvss_vector || ""

    if (vectorStr.startsWith("CVSS:4.0")) {
        const calc = calculateCvss40(vectorStr)
        if (calc.success) {
            finalScore = calc.score
            finalSeverity = calc.severity
        }
    }

    form.setValue("severity", finalSeverity, { shouldValidate: true })
    form.setValue("cvss_score", finalScore, { shouldValidate: true })
    form.setValue("cvss_vector", vectorStr || "N/A", { shouldValidate: true })
    
    form.setValue("cwe_id", template.cwe_id, { shouldValidate: true })
    form.setValue("owasp_category", template.owasp_category, { shouldValidate: true })
    form.setValue("description", template.description, { shouldValidate: true })
    form.setValue("impact", template.impact, { shouldValidate: true })
    form.setValue("remediation", template.remediation, { shouldValidate: true })
    form.setValue("reference_links", template.reference_links, { shouldValidate: true })

    setIsTemplatePopoverOpen(false)
    toast.success(`${template.title} template applied`)
  }

  // ─── AI GENERATION HANDLER ───
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return

    let projectId = form.getValues("project_id")

    // Z+ Context Detection: Auto-detect project if only one exists or if we can infer it
    if (!projectId) {
        if (projects.length === 1) {
            projectId = projects[0].id
        } else if (initialData?.project_id) {
            projectId = initialData.project_id
        }

        if (projectId) {
            form.setValue("project_id", projectId, { shouldValidate: true })
        }
    }

    if (!projectId) {
        toast.error("Project Missing", {
            description: "Please select a target project from the Details tab before using AI generation."
        })
        setActiveTab("details")
        return
    }
    const project = projects.find(p => p.id === projectId)
    
    setIsGenerating(true)
    try {
        const response = await fetch("/api/ai/generate", {
            method: "POST",
            body: JSON.stringify({
                projectId,
                target: project?.name || "Unknown",
                projectType: "web_app", // Default
                prompt: aiPrompt
            })
        })

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: "AI Generation failed" }))
            throw new Error(errBody.error || "AI Generation failed")
        }

        const data = await response.json()
        
        // Mark as AI generated for audit trail
        form.setValue("is_ai_generated", true)
        form.setValue("ai_model_used", "groq-llama-3-70b")

        // ─── CVE VALIDATION (Z+ SECURITY) ───
        if (data.cve_id) {
            toast.info(`Validating CVE ${data.cve_id} against NVD...`)
            try {
                const vRes = await fetch(`/api/ai/cve/validate?cveId=${data.cve_id}`)
                const vData = await vRes.json()
                if (vData.valid) {
                    toast.success(`CVE ${data.cve_id} verified in NVD`)
                } else {
                    toast.warning(`CVE ${data.cve_id} could not be verified in NVD. Please check manually.`)
                }
            } catch {
                console.warn("CVE validation failed or timed out")
            }
        }
        
        // Map data to form with XSS sanitization
        const richTextFieldNames = new Set(['description', 'impact', 'proof_of_concept', 'remediation'])
        Object.entries(data).forEach(([key, value]) => {
            if (value && key in findingSchema.shape) {
                const fieldName = key as keyof FindingFormValues
                let sanitizedValue: unknown = value
                if (typeof value === 'string') {
                    sanitizedValue = richTextFieldNames.has(key)
                        ? sanitizeHtml(value)
                        : sanitizePlainText(value)
                } else if (Array.isArray(value)) {
                    sanitizedValue = value.map(v => typeof v === 'string' ? sanitizePlainText(v) : v)
                }
                form.setValue(fieldName, sanitizedValue as FindingFormValues[typeof fieldName], { shouldValidate: true })
            }
        })

        // ─── Z+ SECURITY: Strip POC from AI-generated findings ───
        // AI cannot provide actual reproduction steps for a real system.
        // The security engineer must add POC manually. This is a defense-in-depth
        // safety net even though the AI prompt instructs the model to return empty POC.
        form.setValue("proof_of_concept", null as unknown as string, { shouldValidate: true })

        // ─── Z+ AUTO-SYNC: Explicitly force CVSS -> Severity sync after AI mapping ───
        if (data.cvss_score !== undefined) {
            const score = Number(data.cvss_score)
            let autoSeverity: "critical" | "high" | "medium" | "low" | "informational" = "informational"
            if (score >= 9.0) autoSeverity = "critical"
            else if (score >= 7.0) autoSeverity = "high"
            else if (score >= 4.0) autoSeverity = "medium"
            else if (score > 0) autoSeverity = "low"
            
            form.setValue("severity", autoSeverity, { shouldValidate: true })
            form.setValue("cvss_score", score, { shouldValidate: true })
            if (data.cvss_vector) {
                form.setValue("cvss_vector", data.cvss_vector, { shouldValidate: true })
            }
        }

        toast.success("Finding generated by AI")
        setIsAiMode(false)
    } catch (err) {
        console.error("AI Gen Error:", err)
        toast.error("AI failed to generate finding. Please try again.")
    } finally {
        setIsGenerating(false)
    }
  }

  // Synchronize default values if they change
  useEffect(() => {
    if (projects.length === 1 && form.getValues("project_id") !== projects[0].id) {
        form.setValue("project_id", projects[0].id, { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  // ─── HIGH #3: Refresh version from DB when form opens to prevent stale version conflicts ───
  const [isRefreshingVersion, setIsRefreshingVersion] = useState(false)
  const lastResetId = useRef<string | null>(null)
  
  useEffect(() => {
    // Z+ STABILITY: Only reset the form if it was just opened or if the specific finding ID changed.
    const currentId = initialData?.id || 'new'
    
    if (open && (lastResetId.current !== currentId)) {
        console.log(`[FindingForm] Initializing/Resetting form for ID: ${currentId}`)
        form.reset(defaultValues)
        lastResetId.current = currentId

        if (initialData?.vuln_attachments) {
            setAttachments(initialData.vuln_attachments.map((a: AttachmentResponse) => ({
                id: a.id,
                name: a.original_filename,
                size: a.file_size_bytes,
                type: a.mime_type,
                url: a.file_url,
                status: 'completed'
            })))
        } else {
            setAttachments([])
        }

        // Fetch latest version from DB to avoid stale version conflicts
        if (initialData?.id) {
            setIsRefreshingVersion(true)
            const supabase = getBrowserClient()
            supabase
                .from("vulnerabilities")
                .select("version")
                .eq("id", initialData.id)
                .single()
                .then(({ data, error }: { data: { version: number } | null; error: unknown }) => {
                    // Only set if form is still open and for the same ID
                    if (!error && data && lastResetId.current === initialData.id) {
                        form.setValue("version", data.version, { shouldValidate: true })
                    }
                })
                .finally(() => setIsRefreshingVersion(false))
        }
    } else if (!open) {
        lastResetId.current = null
    }
  }, [open, initialData?.id, defaultValues, form])

  const { fields: refFields, append: appendRef, remove: removeRef } = useFieldArray({
    control: form.control,
    // @ts-expect-error - primitive array mismatch in react-hook-form
    name: "reference_links",
  })

  const selectedProjectId = form.watch("project_id")

  const handleCalculate = useCallback((vector: string, score: number) => {
    // Z+ STABILITY: Guard clause to prevent infinite re-render loops
    // Only update the form if the vector string has actually changed.
    const currentVector = form.getValues("cvss_vector")
    if (currentVector === vector) return

    console.log(`[FindingForm] CVSS Updated: Vector=${vector}, Score=${score}`)
    form.setValue("cvss_vector", vector, { shouldValidate: true })
    form.setValue("cvss_score", score, { shouldValidate: true })
    
    // ─── Z+ AUTO-SYNC: Severity from CVSS ───
    let autoSeverity: "critical" | "high" | "medium" | "low" | "informational" = "informational"
    if (score >= 9.0) autoSeverity = "critical"
    else if (score >= 7.0) autoSeverity = "high"
    else if (score >= 4.0) autoSeverity = "medium"
    else if (score > 0) autoSeverity = "low"
    
    if (form.getValues("severity") !== autoSeverity) {
        form.setValue("severity", autoSeverity, { shouldValidate: true })
    }
  }, [form])

    async function onSubmit(data: FindingFormValues) {
    // ─── Z+ ENTERPRISE VALIDATION: Severity vs CVSS Mismatch ───
    const score = data.cvss_score || 0
    const severity = data.severity
    let isValidRange = true

    if (severity === "critical" && score < 9.0) isValidRange = false
    if (severity === "high" && (score < 7.0 || score >= 9.0)) isValidRange = false
    if (severity === "medium" && (score < 4.0 || score >= 7.0)) isValidRange = false
    if (severity === "low" && (score <= 0 || score >= 4.0)) isValidRange = false
    // Informational can be 0 or null
    if (severity === "informational" && score > 0) isValidRange = false

    if (!isValidRange) {
        toast.error("Severity Mismatch", {
            description: `Technical Conflict: A '${severity}' severity must have a score in the appropriate range. Please adjust the CVSS score or the severity level.`,
        })
        return
    }

    setIsLoading(true)
    try {
      // ─── Z+ BATCH UPLOAD: PoC Step-by-Step Images ───
      let finalPoC = data.proof_of_concept
      const newStepAttachments: AttachmentMetadata[] = []

      if (finalPoC && finalPoC.trim().startsWith('[')) {
          const steps: PoCStep[] = JSON.parse(finalPoC)
          const uploadTasks: { sIdx: number, iIdx: number, file: File, id: string }[] = []

          steps.forEach((step, sIdx) => {
              step.images.forEach((img, iIdx) => {
                  // Z+ FIX: Retrieve the raw File from the memory registry since it can't be in JSON
                  const rawFile = pocRegistry.get(img.id)
                  if (rawFile && !img.remoteUrl) {
                      uploadTasks.push({ sIdx, iIdx, file: rawFile, id: img.id })
                  }
              })
          })

          if (uploadTasks.length > 0) {
              const supabase = getBrowserClient()
              await Promise.all(uploadTasks.map(async (task) => {
                  const ext = task.file.name.split('.').pop()
                  const path = `${selectedProjectId}/poc/${task.id}.${ext}`

                  const { data: uploadData, error: uploadError } = await supabase.storage
                      .from('poc-files')
                      .upload(path, task.file, { upsert: true })

                  if (uploadError) throw uploadError
                  
                  steps[task.sIdx].images[task.iIdx].remoteUrl = uploadData.path
                  
                  // Add to global attachments metadata so it saves to vuln_attachments table
                  newStepAttachments.push({
                      id: task.id,
                      name: task.file.name,
                      size: task.file.size,
                      type: task.file.type,
                      url: uploadData.path
                  })
                  
                  // Cleanup blob URL
                  if (steps[task.sIdx].images[task.iIdx].preview && steps[task.sIdx].images[task.iIdx].preview.startsWith('blob:')) {
                      URL.revokeObjectURL(steps[task.sIdx].images[task.iIdx].preview!)
                  }
              }))
              // CRITICAL FIX: Ensure the state-synced 'steps' array is stringified AFTER all remoteUrls are assigned
              finalPoC = JSON.stringify(steps)
          }
      }

      const sanitizedData = {
        ...data,
        title: sanitizePlainText(data.title),
        description: sanitizeHtml(data.description),
        impact: data.impact ? sanitizeHtml(data.impact) : null,
        proof_of_concept: finalPoC, // Use the updated PoC with remote URLs
        remediation: data.remediation ? sanitizeHtml(data.remediation) : null,
        cve_id: data.cve_id ? sanitizePlainText(data.cve_id) : null,
        cwe_id: data.cwe_id ? sanitizePlainText(data.cwe_id) : null,
        owasp_category: data.owasp_category ? sanitizePlainText(data.owasp_category) : null,
        endpoint_url: data.endpoint_url ? sanitizePlainText(data.endpoint_url) : null,
        affected_component: data.affected_component ? sanitizePlainText(data.affected_component) : null,
        cvss_vector: data.cvss_vector ? sanitizePlainText(data.cvss_vector) : null,
        reference_links: data.reference_links?.map((link: string) => sanitizePlainText(link)) ?? [],
      }

      const payload: Record<string, unknown> = Object.fromEntries(
          Object.entries(sanitizedData).map(([k, v]) => [k, v === "" ? null : v])
      )

      // ─── Z+ ATTACHMENT RECONCILIATION ───
      // Filter out PoC images from 'attachments' that are no longer in finalPoC JSON
      const currentPoCImageIds = new Set<string>()
      if (finalPoC && finalPoC.startsWith('[')) {
          try {
              const steps: PoCStep[] = JSON.parse(finalPoC)
              steps.forEach(s => s.images.forEach(img => currentPoCImageIds.add(img.id)))
          } catch (e) { /* ignore */ }
      }

      const reconciledAttachments = [
          ...attachments.filter(att => {
              // If it's a PoC image (has /poc/ in url), only keep it if it's still in the JSON
              if (att.url.includes('/poc/')) {
                  return currentPoCImageIds.has(att.id)
              }
              return true // Keep regular attachments
          }),
          ...newStepAttachments
      ]

      payload.attachments = reconciledAttachments

      // ─── SWITCH: CREATE VS UPDATE ───
      const isUpdate = !!initialData?.id
      const method = isUpdate ? 'patch' : 'post'
      
      if (isUpdate) {
          payload.id = initialData.id
          payload.version = initialData.version

          // Compute removed attachment IDs
          const initialAttachmentIds = new Set(
              (initialData.vuln_attachments || []).map((a: AttachmentResponse) => a.id)
          )
          const currentAttachmentIds = new Set(reconciledAttachments.map(a => a.id))
          const removedIds = [...initialAttachmentIds].filter(id => !currentAttachmentIds.has(id))
          if (removedIds.length > 0) {
              payload.removed_attachment_ids = removedIds
          }
      }

      const response = await fetch("/api/findings", {
        method: method.toUpperCase(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const responseData = await response.json()
      
      if (!response.ok) {
          // Handle 409 Conflict (optimistic locking) with special toast action
          if (response.status === 409) {
              toast.error(responseData.error || "Conflict detected", {
                  duration: 8000,
                  action: {
                      label: "Reload Latest",
                      onClick: () => {
                          onOpenChange(false)
                          onSuccess()
                      }
                  }
              })
              setIsLoading(false)
              return
          }
          throw new Error(responseData.error || "Failed to save finding")
      }
      
      if (responseData.success) {
        toast.success(isUpdate ? "Finding updated successfully" : "Finding reported successfully")
        form.reset()
        // Z+ REGISTRY CLEANUP: Clear memory store
        pocRegistry.clear()
        onSuccess()
        onOpenChange(false)
        if (!isUpdate && onSuccessWithId && responseData.data?.id) {
          await onSuccessWithId(responseData.data.id)
        }
      } else {
        throw new Error(responseData.error || "Failed to save finding")
      }
    } catch (error) {
      console.error("Save finding error:", error)
      toast.error(error instanceof Error ? error.message : "Internal server error")
    } finally {
      setIsLoading(false)
    }
  }

  const onInvalid = (errors: FieldErrors<FindingFormValues>) => {
    console.group("FindingForm Validation Failure")
    console.error("Field Errors:", errors)
    console.log("Current Form Values:", form.getValues())
    console.log("Form State:", {
        isValid: form.formState.isValid,
        isDirty: form.formState.isDirty,
        errors: form.formState.errors,
        submitCount: form.formState.submitCount
    })
    console.dir(errors)
    console.groupEnd()
    
    toast.error("Required fields missing. Please check all tabs.")
    
    // Tab switching logic (Enhanced)
    const fieldNames = Object.keys(errors)
    if (fieldNames.some(f => ["title", "description", "severity", "project_id", "cve_id", "cwe_id", "owasp_category"].includes(f))) {
        setActiveTab("details")
    } else if (fieldNames.some(f => ["proof_of_concept", "endpoint_url", "attachments"].includes(f))) {
        setActiveTab("evidence")
    } else if (fieldNames.some(f => ["remediation", "assigned_to", "reference_links"].includes(f))) {
        setActiveTab("remediation")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden p-0 bg-panel border-border flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex-1 overflow-hidden flex flex-col">
            <DialogHeader className="p-6 border-b border-border bg-bg-subtle/30">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                        <ShieldAlert className="h-6 w-6 text-primary" />
                        Finding Workbench
                    </DialogTitle>
                    <DialogDescription className="text-fg-muted">
                        Technical reporting interface with Z+ Security & CVSS 4.0 validation.
                    </DialogDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {(form.watch("cvss_score") ?? 0) > 0 && (
                        <div className="text-right px-4 py-2 bg-bg rounded-xl border border-border shadow-sm">
                            <p className="text-[10px] font-bold text-fg-muted uppercase">Base Score</p>
                            <p className={cn(
                                "text-2xl font-black font-mono leading-none",
                                (form.watch("cvss_score") ?? 0) >= 7 ? "text-severity-high" : "text-primary"
                            )}>
                                {form.watch("cvss_score")?.toFixed(1)}
                            </p>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {/* ─── VULNERABILITY LIBRARY ─── */}
                        <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button 
                                    type="button"
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 font-bold text-[10px] uppercase tracking-tight"
                                >
                                    <Book className="h-3 w-3 mr-1.5" /> Use Template
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[450px] h-[550px] p-0 bg-panel border-border shadow-2xl flex flex-col overflow-hidden" align="end">
                                <Command className="bg-transparent flex-1 flex flex-col overflow-hidden" shouldFilter={true}>
                                    <div className="p-4 border-b border-border/50 space-y-3 bg-bg-subtle/50">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Vulnerability Library</h4>
                                            <span className="text-[10px] font-bold text-fg-disabled">{VULNERABILITY_TEMPLATES.length} Templates</span>
                                        </div>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-disabled" />
                                            <CommandInput 
                                                placeholder="Search by title, CWE (e.g. 89), or OWASP (e.g. A03)..." 
                                                className="h-10 pl-9 bg-bg border-border/50 rounded-xl" 
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 p-1 bg-bg border border-border/50 rounded-lg overflow-x-auto no-scrollbar">
                                            {(['All', 'Web', 'API', 'Network', 'Cloud'] as const).map(cat => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setTemplateCategory(cat)}
                                                    className={cn(
                                                        "px-3 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all whitespace-nowrap",
                                                        templateCategory === cat 
                                                            ? "bg-primary text-white shadow-sm" 
                                                            : "text-fg-muted hover:bg-primary/10 hover:text-primary"
                                                    )}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <CommandList 
                                        className="flex-1 max-h-none overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent outline-none"
                                        tabIndex={0}
                                        onWheel={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                    >
                                        <CommandEmpty className="p-12 text-xs text-fg-disabled text-center italic flex flex-col items-center gap-3">
                                            <Search className="h-8 w-8 opacity-20" />
                                            No matching templates found in {templateCategory}
                                        </CommandEmpty>
                                        
                                        {(['Web', 'API', 'Network', 'Cloud'] as const)
                                            .filter(cat => templateCategory === 'All' || templateCategory === cat)
                                            .map(cat => (
                                            <CommandGroup key={cat} heading={`${cat} Vulnerabilities`} className="px-2">
                                                {VULNERABILITY_TEMPLATES.filter(t => t.category === cat).map((t) => (
                                                    <CommandItem 
                                                        key={t.id} 
                                                        onSelect={() => applyTemplate(t)}
                                                        value={`${t.title} ${t.cwe_id} ${t.owasp_category} ${t.category}`}
                                                        className="cursor-pointer py-4 rounded-xl hover:bg-primary/5 data-[selected=true]:bg-primary/10 transition-colors border border-transparent data-[selected=true]:border-primary/20 mb-1"
                                                    >
                                                        <div className="flex flex-col gap-1.5 w-full">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <span className="font-bold text-xs leading-tight text-fg">{t.title}</span>
                                                                <span className={cn(
                                                                    "text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter shrink-0",
                                                                    t.severity === 'critical' ? "bg-severity-critical/10 text-severity-critical" :
                                                                    t.severity === 'high' ? "bg-severity-high/10 text-severity-high" :
                                                                    t.severity === 'medium' ? "bg-severity-medium/10 text-severity-medium" :
                                                                    "bg-severity-low/10 text-severity-low"
                                                                )}>
                                                                    {t.severity}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-fg-muted font-mono bg-bg-subtle px-1.5 py-0.5 rounded border border-border/50">{t.cwe_id}</span>
                                                                <span className="text-[10px] text-primary/70 font-black tracking-tight">{t.owasp_category}</span>
                                                                {templateCategory === 'All' && (
                                                                    <span className="text-[9px] text-fg-disabled font-bold uppercase ml-auto">{t.category}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        ))}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* ─── AI ASSISTANT BUTTON ─── */}
                        <Button 
                            type="button"
                            variant={isAiMode ? "default" : "outline"} 
                            size="sm" 
                            onClick={() => setIsAiMode(!isAiMode)}
                            className={cn(
                                "h-8 rounded-lg font-bold text-[10px] uppercase tracking-tight transition-all",
                                isAiMode ? "bg-primary shadow-lg shadow-primary/20" : "border-warning/30 bg-warning/5 text-warning hover:bg-warning/10"
                            )}
                        >
                            <Sparkles className={cn("h-3 w-3 mr-1.5", isAiMode && "animate-pulse")} />
                            {isAiMode ? "Close AI" : "AI Assistant"}
                        </Button>
                    </div>
                </div>
              </div>

              {/* ─── AI PROMPT INPUT ─── */}
              {isAiMode && (
                  <div className="mt-4 p-4 bg-bg rounded-2xl border border-warning/20 shadow-inner animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-start gap-4">
                          <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                              <Sparkles className="h-4 w-4 text-warning" />
                          </div>
                          <div className="flex-1 space-y-3">
                              <div className="space-y-1">
                                  <Label className="text-[10px] font-black uppercase text-warning tracking-widest">AI Finding Generator</Label>
                                  <p className="text-xs text-fg-muted">Describe the finding briefly. AI will auto-fill the technical details.</p>
                              </div>
                              <div className="flex gap-2">
                                  <Input 
                                    placeholder="e.g. Found SQL injection on the login page affecting the username field..." 
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    className="bg-panel border-border h-11 rounded-xl"
                                    disabled={isGenerating}
                                  />
                                  <Button 
                                    type="button"
                                    onClick={handleAiGenerate} 
                                    disabled={isGenerating || !aiPrompt.trim()}
                                    className="h-11 px-6 rounded-xl bg-warning hover:bg-warning/90 text-black font-bold"
                                  >
                                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
                                  </Button>
                              </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setIsAiMode(false)} className="h-8 w-8 rounded-full">
                              <X className="h-4 w-4" />
                          </Button>
                      </div>
                  </div>
              )}
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 border-b border-border bg-bg-subtle/20">
                    <TabsList className="bg-transparent h-12 w-full justify-start gap-4 p-0">
                        <TabsTrigger value="details" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 font-bold text-xs uppercase tracking-wider">
                            <LayoutGrid className="h-3.5 w-3.5 mr-2" /> Details
                        </TabsTrigger>
                        <TabsTrigger value="evidence" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 font-bold text-xs uppercase tracking-wider">
                            <Zap className="h-3.5 w-3.5 mr-2" /> Evidence & PoC
                        </TabsTrigger>
                        <TabsTrigger value="remediation" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 font-bold text-xs uppercase tracking-wider">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Remediation
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    <TabsContent value="details" className="m-0 space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="project_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Security Target *</FormLabel>
                                        <Select 
                                            onValueChange={field.onChange} 
                                            value={field.value}
                                            disabled={projects.length === 1}
                                        >
                                            <FormControl>
                                                <SelectTrigger className="bg-bg border-border h-11 rounded-xl">
                                                    <SelectValue placeholder="Select target project" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-panel border-border rounded-xl">
                                                {projects.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="severity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Severity Level *</FormLabel>
                                        <Select onValueChange={(val) => {
                                            field.onChange(val)
                                            // Z+ SECURITY: Severity changes no longer force arbitrary CVSS vectors.
                                            // Official math is enforced via the Calculator or Manual Override.
                                        }} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-bg border-border h-11 rounded-xl">
                                                    <SelectValue placeholder="Select severity" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-panel border-border rounded-xl">
                                                <SelectItem value="critical">Critical</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="informational">Informational</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Finding Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger className="bg-bg border-border h-11 rounded-xl">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-panel border-border rounded-xl">
                                                <SelectItem value="open">Open</SelectItem>
                                                <SelectItem value="reopened">Re-opened</SelectItem>
                                                <SelectItem value="in_progress">In Progress</SelectItem>
                                                <SelectItem value="resolved">Resolved</SelectItem>
                                                <SelectItem value="verified">Verified</SelectItem>
                                                <SelectItem value="closed">Closed</SelectItem>
                                                <SelectItem value="accepted_risk">Risk Accepted</SelectItem>
                                                <SelectItem value="false_positive">False Positive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Vulnerability Title *</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Unauthenticated Remote Code Execution in Management API" {...field} className="bg-bg border-border h-11 rounded-xl font-bold text-lg" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <Calculator className="h-4 w-4" /> CVSS 4.0 Assessment
                                </h4>
                            </div>
                            <CvssCalculator 
                                initialVector={form.watch("cvss_vector") || undefined}
                                onCalculate={handleCalculate}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField
                                control={form.control}
                                name="cve_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">CVE ID</FormLabel>
                                        <FormControl>
                                            <Input placeholder="CVE-2024-XXXX" {...field} value={field.value || ""} className="bg-bg border-border rounded-xl font-mono" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="cwe_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">CWE ID</FormLabel>
                                        <FormControl>
                                            <Input placeholder="CWE-79" {...field} value={field.value || ""} className="bg-bg border-border rounded-xl font-mono" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="owasp_category"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">OWASP Category</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger className="bg-bg border-border rounded-xl">
                                                    <SelectValue placeholder="Select category" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-panel border-border rounded-xl">
                                                <SelectItem value="A01:2025">A01:2025 - Broken Access Control</SelectItem>
                                                <SelectItem value="A02:2025">A02:2025 - Security Misconfiguration</SelectItem>
                                                <SelectItem value="A03:2025">A03:2025 - Software Supply Chain Failures</SelectItem>
                                                <SelectItem value="A04:2025">A04:2025 - Cryptographic Failures</SelectItem>
                                                <SelectItem value="A05:2025">A05:2025 - Injection</SelectItem>
                                                <SelectItem value="A06:2025">A06:2025 - Insecure Design</SelectItem>
                                                <SelectItem value="A07:2025">A07:2025 - Authentication Failures</SelectItem>
                                                <SelectItem value="A08:2025">A08:2025 - Software or Data Integrity Failures</SelectItem>
                                                <SelectItem value="A09:2025">A09:2025 - Security Logging and Alerting Failures</SelectItem>
                                                <SelectItem value="A10:2025">A10:2025 - Mishandling of Exceptional Conditions</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="endpoint_url"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Affected Endpoint / Target</FormLabel>
                                        <FormControl>
                                            <Input placeholder="https://api.vapt.com/v1/auth/login" {...field} value={field.value || ""} className="bg-bg border-border rounded-xl font-mono text-sm" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="affected_component"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Affected Component / Module</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Authentication Module, User Profile API" {...field} value={field.value || ""} className="bg-bg border-border rounded-xl" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="evidence" className="m-0 space-y-8 animate-in fade-in duration-300">
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Detailed Analysis *</FormLabel>
                                    <FormControl>
                                        <RichTextEditor 
                                            value={field.value} 
                                            onChange={field.onChange} 
                                            minHeight="200px"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="impact"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold text-[10px] uppercase text-danger tracking-widest flex items-center gap-2">
                                        <AlertCircle className="h-3 w-3" /> Business & Security Impact
                                    </FormLabel>
                                    <FormControl>
                                        <RichTextEditor 
                                            value={field.value || ""} 
                                            onChange={field.onChange} 
                                            minHeight="150px"
                                        />
                                    </FormControl>
                                    <FormDescription className="text-[10px]">Describe what an attacker can achieve by exploiting this vulnerability.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="proof_of_concept"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <PoCStepBuilder 
                                            value={field.value} 
                                            onChange={field.onChange} 
                                            projectId={selectedProjectId || "unassigned"}
                                            findingId={initialData?.id}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </TabsContent>

                    <TabsContent value="remediation" className="m-0 space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <FormField
                                control={form.control}
                                name="assigned_to"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-[10px] uppercase text-primary tracking-widest">Remediation Lead (Assignee)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                            <FormControl>
                                                <SelectTrigger className="h-12 bg-bg border-border rounded-xl">
                                                    <SelectValue placeholder="Assign a lead..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-panel border-border">
                                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                                {members.filter(m => m.role === 'developer').map((member) => (
                                                    <SelectItem key={member.id} value={member.id}>
                                                        <div className="flex items-center gap-2 py-0.5">
                                                            <Avatar className="h-5 w-5">
                                                                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                    {member.full_name.slice(0, 2).toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm font-medium">{member.full_name}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                                {members.filter(m => m.role === 'developer').length === 0 && (
                                                    <div className="px-2 py-3 text-[10px] text-fg-disabled text-center italic">
                                                        No developers found.
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription className="text-[10px]">The user responsible for implementing the fix.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="remediation"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-bold text-[10px] uppercase text-success tracking-widest">Technical Remediation Plan</FormLabel>
                                    <FormControl>
                                        <RichTextEditor 
                                            value={field.value || ""} 
                                            onChange={field.onChange} 
                                            minHeight="300px"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="font-bold text-[10px] uppercase text-fg-muted tracking-widest">Reference Links</Label>
                                <Button type="button" variant="outline" size="sm" onClick={() => appendRef("")} className="h-7 text-[10px] uppercase font-bold border-dashed">
                                    <Plus className="h-3 w-3 mr-1" /> Add Link
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {refFields.map((field, index) => (
                                    <div key={field.id} className="flex gap-2 animate-in slide-in-from-right-2">
                                        <div className="relative flex-1">
                                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                                            <Input 
                                                {...form.register(`reference_links.${index}` as const)}
                                                placeholder="https://cwe.mitre.org/..."
                                                className="pl-9 h-10 bg-bg border-border rounded-lg text-sm"
                                            />
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeRef(index)} className="h-10 w-10 text-fg-muted hover:text-danger">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </TabsContent>
                </div>
            </Tabs>

            <DialogFooter className="p-6 border-t border-border bg-bg-subtle/30 flex items-center justify-between">
              <div className="hidden md:block">
                  <TooltipProvider>
                      <TooltipBase>
                          <TooltipTrigger asChild>
                              <p className="text-[10px] text-fg-muted flex items-center gap-1 cursor-help">
                                  <AlertCircle className="h-3 w-3" />
                                  Optimistic Locking Active (v{form.watch("version")})
                              </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-panel border-border p-3 shadow-xl max-w-[280px]">
                              <p className="text-xs leading-relaxed">
                                  This version number prevents two people from overwriting each other&apos;s changes. 
                                  If someone else edits this finding before you save, you&apos;ll see a conflict warning 
                                  and can reload the latest version.
                              </p>
                          </TooltipContent>
                      </TooltipBase>
                  </TooltipProvider>
              </div>
              <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="border-border rounded-xl px-6">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading} className="font-bold px-8 rounded-xl shadow-lg shadow-primary/20">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Finalize Report
                      </>
                    )}
                  </Button>
              </div>
            </DialogFooter>

            {/* Removed hidden fields to prevent RHF state overwriting issues */}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
