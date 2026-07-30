"use client"

import { useState } from "react"
import {
    Sparkles,
    Zap,
    FileText,
    LayoutGrid,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    Plus,
    Trash2,
    Calculator,
    ShieldCheck,
    Code2,
    ArrowRightLeft,
    Copy,
    Check,
    Save,
    RefreshCcw
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { experimental_useObject as useObject } from "ai/react"
import { z } from "zod"
import { toast } from "sonner"
import { SeverityBadge, type SeverityLevel } from "@/components/findings/SeverityBadge"
import { saveAiFinding, bulkSaveAiFindings, validateCveAction } from "./actions"
import {
  Tooltip as TooltipBase,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Editor, DiffEditor } from "@/components/shared/MonacoEditor"
import { useTheme } from "next-themes"

const responseSchema = z.object({
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  cvss_score: z.number(),
  cvss_vector: z.string(),
  cwe_id: z.string().optional(),
  owasp_category: z.string().optional(),
  affected_component: z.string().optional(),
  description: z.string(),
  impact: z.string().optional(),
  proof_of_concept: z.string().optional(),
  remediation: z.string().optional(),
  references: z.array(z.string()).optional(),
})

const normalizeResponseSchema = z.object({
    findings: z.array(responseSchema)
})

const patchResponseSchema = z.object({
    vulnerable_lines: z.array(z.number()),
    explanation: z.string(),
    fixed_code: z.string(),
    fix_explanation: z.string(),
})

interface Project {
    id: string
    name: string
    project_type: string
}

interface Props {
  projects: Project[]
  initialFinding?: { title: string; code: string; language: string } | null
}

interface AIFinding {
    title?: string
    description?: string
    severity?: string
    cvss_score?: number
    cvss_vector?: string
    cve_id?: string
    cwe_id?: string
    owasp_category?: string
    affected_component?: string
    proof_of_concept?: string
    remediation?: string
    references?: string[]
}

export function AIClient({ projects, initialFinding }: Props) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState(initialFinding ? "patch" : "generate")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  
  // Generate Tab State
  const [targetInput, setTargetInput] = useState("")
  const [promptInput, setPromptInput] = useState("")
  
  // Normalize Tab State
  const [scannerType, setScannerType] = useState<string>("zap")
  const [rawOutput, setRawOutput] = useState("")
  const [selectedFindingIndices, setSelectedFindingIndices] = useState<Set<number>>(new Set())

  // Patch Tab State
  const [vulnTitle, setVulnTitle] = useState(initialFinding?.title || "")
  const [language, setLanguage] = useState(initialFinding?.language || "javascript")
  const [vulnerableCode, setVulnerableCode] = useState(initialFinding?.code || "")
  const [monacoLanguage, setMonacoLanguage] = useState(initialFinding?.language || "javascript")
  const [copied, setCopied] = useState(false)

  const [cveId, setCveId] = useState("")
  const [isCveVerified, setIsCveVerified] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  // ─── AI: GENERATE ───
  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/generate",
    schema: responseSchema,
    onFinish: () => {
        toast.success("Finding generated successfully")
    },
    onError: (error) => {
        toast.error("AI Generation failed")
        console.error(error)
    }
  })

  // ─── AI: NORMALIZE ───
  const { object: normObject, submit: submitNorm, isLoading: isNormLoading } = useObject({
    api: "/api/ai/normalize",
    schema: normalizeResponseSchema,
    onFinish: () => {
        toast.success("Log data normalized")
    },
    onError: (error) => {
        toast.error("Normalization failed")
        console.error(error)
    }
  })

  // ─── AI: PATCH ───
  const { object: patchObject, submit: submitPatch, isLoading: isPatchLoading } = useObject({
      api: "/api/ai/patch",
      schema: patchResponseSchema,
      onFinish: () => {
          toast.success("Security patch suggested")
      },
      onError: (error) => {
          toast.error("Patch suggestion failed")
          console.error(error)
      }
  })

  // Typed aliases to resolve build errors
  const typedObject = object as AIFinding | undefined
  const typedNormObject = normObject as { findings?: AIFinding[] } | undefined
  const typedPatchObject = patchObject as { fixed_code?: string; explanation?: string; fix_explanation?: string } | undefined


  const handleGenerate = () => {
    if (!selectedProjectId) return toast.error("Please select a project")
    if (!targetInput) return toast.error("Please specify a target (URL/IP)")
    if (promptInput.length < 10) return toast.error("Please provide more detail")

    submit({
        projectId: selectedProjectId,
        target: targetInput,
        projectType: selectedProject?.project_type || "web_app",
        prompt: promptInput
    })
  }

  const handleNormalize = () => {
      if (!selectedProjectId) return toast.error("Please select a project")
      if (rawOutput.length < 20) return toast.error("Please paste more log data")

      submitNorm({
          scannerType,
          rawOutput
      })
  }

  const handleSuggestPatch = () => {
      if (!vulnTitle) return toast.error("Please specify the vulnerability type")
      if (vulnerableCode.length < 10) return toast.error("Please provide the code snippet")

      submitPatch({
          language,
          vulnTitle,
          vulnerableCode
      })
  }

  const handleBulkSave = async () => {
      const normalizedData = normObject as { findings?: AIFinding[] } | undefined
      if (!normalizedData?.findings || selectedFindingIndices.size === 0) return
      if (!selectedProjectId) return toast.error("Please select a project")

      setIsSaving(true)
      try {
          const selectedFindings = Array.from(selectedFindingIndices).map(idx => {
              const f = (normalizedData.findings![idx]) as AIFinding
              return {

                  project_id: selectedProjectId,
                  title: f.title || "AI Finding",
                  description: f.description || "",
                  severity: (f.severity as SeverityLevel) || "medium",
                  cvss_score: f.cvss_score || 0,
                  cvss_vector: f.cvss_vector || null,
                  cve_id: f.cve_id || null,
                  cwe_id: f.cwe_id || null,
                  owasp_category: f.owasp_category || null,
                  affected_component: f.affected_component || null,
                  proof_of_concept: f.proof_of_concept || null,
                  remediation: f.remediation || null,
                  reference_links: f.references || [],
                  is_ai_generated: true
              }
          })

          const result = await bulkSaveAiFindings({
              project_id: selectedProjectId,
              findings: selectedFindings
          })

          if (result.success) {
              toast.success(`Successfully added ${selectedFindings.length} findings to project`)
              setSelectedFindingIndices(new Set())
              setRawOutput("")
          } else {
              toast.error(result.error)
          }
      } catch (error) {
          console.error("Batch save error:", error)
          toast.error("Batch save failed")
      } finally {
          setIsSaving(false)
      }
  }

  const toggleFindingSelection = (index: number) => {
      const next = new Set(selectedFindingIndices)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      setSelectedFindingIndices(next)
  }

  const handleVerifyCve = async () => {
    if (!cveId) return
    const result = await validateCveAction(cveId)
    setIsCveVerified(result.valid)
    if (result.valid) {
        toast.success("CVE verified in NVD database")
    } else {
        toast.warning("Could not verify CVE in NVD")
    }
  }

  const handleSaveGenerate = async () => {
    if (!object || !selectedProjectId) return
    const singleData = object as AIFinding
    setIsSaving(true)
    try {
        const result = await saveAiFinding({
            project_id: selectedProjectId,
            title: singleData.title || "AI Finding",
            description: singleData.description || "",
            severity: (singleData.severity as SeverityLevel) || "medium",
            cvss_score: singleData.cvss_score || 0,
            cvss_vector: singleData.cvss_vector || null,
            cve_id: singleData.cve_id || null,
            cwe_id: singleData.cwe_id || null,
            owasp_category: singleData.owasp_category || null,
            affected_component: singleData.affected_component || null,
            proof_of_concept: singleData.proof_of_concept || null,
            remediation: singleData.remediation || null,
            reference_links: singleData.references || [],
            is_ai_generated: true
        })

        if (result.success) {
            toast.success("Finding added to project inventory")
            setPromptInput("")
            setTargetInput("")
        } else {
            toast.error(result.error)
        }
    } catch (error) {
        console.error("Save AI error:", error)
        toast.error("Failed to save finding")
    } finally {
        setIsSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Fixed code copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="flex items-center justify-between bg-panel border border-border p-1 rounded-xl w-fit">
        <TabsList className="bg-transparent gap-1">
          <TabsTrigger value="generate" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all px-4 h-9 font-bold text-xs uppercase">
            <Sparkles className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="normalize" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all px-4 h-9 font-bold text-xs uppercase">
            <RefreshCcw className="h-4 w-4" />
            Normalize
          </TabsTrigger>
          <TabsTrigger value="patch" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all px-4 h-9 font-bold text-xs uppercase">
            <Zap className="h-4 w-4" />
            Patch
          </TabsTrigger>
        </TabsList>
      </div>

      {/* GENERATE TAB */}
      <TabsContent value="generate" className="m-0 space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
            <div className="space-y-6 bg-panel border border-border p-6 rounded-2xl shadow-sm h-fit">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg-muted flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" /> Configuration
                </h3>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Select Project *</label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="bg-bg border-border rounded-xl">
                                <SelectValue placeholder="Target Project" />
                            </SelectTrigger>
                            <SelectContent className="bg-panel border-border rounded-xl">
                                {projects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Target Asset *</label>
                        <Input 
                            placeholder="e.g. https://api.acme.com" 
                            className="bg-bg border-border rounded-xl"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Vulnerability Summary *</label>
                        <Textarea 
                            placeholder="e.g. Found a potential IDOR on /api/user/profile. I could see other users' data by changing the ID in the URL."
                            className="bg-bg border-border rounded-xl min-h-[150px] resize-none"
                            value={promptInput}
                            onChange={(e) => setPromptInput(e.target.value)}
                        />
                    </div>

                    <Button 
                        className="w-full h-11 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" 
                        disabled={isLoading || isSaving}
                        onClick={handleGenerate}
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Generate Findings
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {!object && !isLoading ? (
                    <div className="bg-bg-subtle/30 border border-dashed border-border rounded-3xl h-[600px] flex flex-col items-center justify-center text-center p-12 space-y-4">
                        <div className="h-20 w-20 rounded-full bg-panel flex items-center justify-center shadow-inner">
                            <Sparkles className="h-10 w-10 text-primary opacity-20" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-xl font-bold text-fg-muted">AI Finding Workbench</h4>
                            <p className="text-sm text-fg-disabled max-w-sm">Enter the technical details on the left to generate a professional security report.</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-panel border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[600px] animate-in slide-in-from-right-4 duration-500">
                        <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <SeverityBadge severity={(object as AIFinding)?.severity || "medium"} size="md" />
                                <h3 className="text-xl font-bold text-fg truncate max-w-md">
                                    {(object as AIFinding)?.title || "Synthesizing finding..."}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                {!isLoading && (
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="rounded-lg h-9 border-border gap-2"
                                        onClick={() => stop()}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Discard
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    className="rounded-lg h-9 font-bold gap-2 shadow-md"
                                    disabled={isLoading || isSaving || !typedObject?.title || !typedObject?.description || !typedObject?.remediation}
                                    onClick={handleSaveGenerate}
                                >
                                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                    Add to Project
                                </Button>
                            </div>
                        </div>

                        <div className="p-8 space-y-8 flex-1 overflow-y-auto max-h-[700px] scrollbar-thin">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest flex items-center gap-1">
                                        <Calculator className="h-3 w-3" /> CVSS 4.0
                                    </span>
                                    <TooltipProvider>
                                        <TooltipBase>
                                            <TooltipTrigger asChild>
                                                <p className={cn(
                                                    "font-mono text-lg font-black cursor-help",
                                                    (typedObject?.cvss_score ?? 0) >= 7 ? "text-severity-high" : "text-primary"
                                                )}>{typedObject?.cvss_score?.toFixed(1) || "..."}</p>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-panel border-border text-[10px] font-mono p-2">
                                                {typedObject?.cvss_vector || "Calculating vector..."}
                                            </TooltipContent>
                                        </TooltipBase>
                                    </TooltipProvider>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3" /> CWE ID
                                    </span>
                                    <p className="font-mono text-sm font-bold text-fg">{typedObject?.cwe_id || "Unassigned"}</p>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" /> CVE Lookup
                                    </span>
                                    <div className="flex flex-col gap-2">
                                        <Input 
                                            placeholder="Enter CVE ID" 
                                            className="h-8 text-xs font-mono" 
                                            value={cveId}
                                            onChange={(e) => setCveId(e.target.value)}
                                        />
                                        <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={handleVerifyCve}>
                                            Check NVD
                                        </Button>
                                        {isCveVerified === false && (
                                            <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Unverified CVE</Badge>
                                        )}
                                        {isCveVerified === true && (
                                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">NVD Verified</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <FileText className="h-4 w-4" /> Description
                                </h4>
                                <div className="bg-bg-subtle p-4 rounded-xl border border-border/50 text-sm text-fg-muted leading-relaxed">
                                    {typedObject?.description || "Analyzing report..."}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-warning flex items-center gap-2">
                                    <Zap className="h-4 w-4" /> Proof of Concept
                                </h4>
                                <div className="bg-bg-muted/30 p-4 rounded-xl border border-border/50 text-xs font-mono text-fg-subtle whitespace-pre-wrap">
                                    {typedObject?.proof_of_concept || "Generating POC code..."}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-success flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" /> Remediation
                                </h4>
                                <div className="border-l-4 border-l-success pl-6 py-2 text-sm text-fg-muted leading-relaxed">
                                    {typedObject?.remediation || "Determining fix strategy..."}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </TabsContent>

      {/* NORMALIZE TAB */}
      <TabsContent value="normalize" className="m-0 space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
              <div className="space-y-6 bg-panel border border-border p-6 rounded-2xl shadow-sm h-fit">
                  <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" /> Scan Data
                  </h3>

                  <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Target Project *</label>
                            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                                <SelectTrigger className="bg-bg border-border rounded-xl">
                                    <SelectValue placeholder="Target Project" />
                                </SelectTrigger>
                                <SelectContent className="bg-panel border-border rounded-xl">
                                    {projects.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Scanner Source *</label>
                            <Select value={scannerType} onValueChange={setScannerType}>
                                <SelectTrigger className="bg-bg border-border rounded-xl">
                                    <SelectValue placeholder="Select Scanner" />
                                </SelectTrigger>
                                <SelectContent className="bg-panel border-border rounded-xl">
                                    <SelectItem value="zap">OWASP ZAP</SelectItem>
                                    <SelectItem value="nuclei">Nuclei</SelectItem>
                                    <SelectItem value="nmap">Nmap</SelectItem>
                                    <SelectItem value="custom">Custom JSON/Logs</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Raw Log Output *</label>
                            <Textarea 
                                placeholder="Paste raw JSON, XML, or Text output from your scanner here..."
                                className="bg-bg border-border rounded-xl min-h-[300px] resize-none font-mono text-[10px]"
                                value={rawOutput}
                                onChange={(e) => setRawOutput(e.target.value)}
                            />
                        </div>

                        <Button 
                            className="w-full h-11 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" 
                            disabled={isNormLoading || isSaving}
                            onClick={handleNormalize}
                        >
                            {isNormLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                            Normalize Scan Results
                        </Button>
                  </div>
              </div>

              <div className="space-y-6">
                    {!typedNormObject?.findings && !isNormLoading ? (
                        <div className="bg-bg-subtle/30 border border-dashed border-border rounded-3xl h-[600px] flex flex-col items-center justify-center text-center p-12 space-y-4">
                            <div className="h-20 w-20 rounded-full bg-panel flex items-center justify-center shadow-inner">
                                <RefreshCcw className="h-10 w-10 text-primary opacity-20" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-xl font-bold text-fg-muted">Normalization Workbench</h4>
                                <p className="text-sm text-fg-disabled max-w-sm">Paste raw scanner logs on the left to extract and structure findings into your project inventory.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-panel border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[600px] animate-in slide-in-from-right-4 duration-500">
                             <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-3">
                                        {typedNormObject?.findings?.length || 0} Findings Found
                                    </Badge>
                                    {selectedFindingIndices.size > 0 && (
                                        <Badge className="bg-success/10 text-success border-success/20 font-bold px-3">
                                            {selectedFindingIndices.size} Selected
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isNormLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                    <Button 
                                        size="sm" 
                                        className="rounded-lg h-9 font-bold gap-2 shadow-md"
                                        disabled={isNormLoading || isSaving || selectedFindingIndices.size === 0}
                                        onClick={handleBulkSave}
                                    >
                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        Add Selected to Project
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[750px] scrollbar-thin">
                                {typedNormObject?.findings?.map((f, i) => (
                                    <div 
                                        key={i}
                                        className={cn(
                                            "p-4 rounded-xl border transition-all cursor-pointer group flex items-start gap-4",
                                            selectedFindingIndices.has(i) 
                                                ? "bg-primary/[0.03] border-primary shadow-sm" 
                                                : "bg-bg border-border hover:border-primary/30"
                                        )}
                                        onClick={() => toggleFindingSelection(i)}
                                    >
                                        <div className={cn(
                                            "mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                            selectedFindingIndices.has(i) ? "bg-primary border-primary" : "border-border"
                                        )}>
                                            {selectedFindingIndices.has(i) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <SeverityBadge severity={f.severity || "medium"} size="sm" variant="dot" />
                                                    <h5 className="font-bold text-sm truncate max-w-md">{f.title || "Untitled Finding"}</h5>
                                                </div>
                                                <span className="text-[10px] font-mono text-fg-disabled">CVSS {f.cvss_score?.toFixed(1) || "0.0"}</span>
                                            </div>
                                            <p className="text-[11px] text-fg-muted line-clamp-2 leading-relaxed">
                                                {f.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
              </div>
          </div>
      </TabsContent>

      {/* PATCH TAB */}
      <TabsContent value="patch" className="m-0 space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
              <div className="space-y-6 bg-panel border border-border p-6 rounded-2xl shadow-sm h-fit">
                  <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted flex items-center gap-2">
                      <Code2 className="h-4 w-4" /> Remediation Engine
                  </h3>

                  <div className="bg-warning/10 border border-warning/20 p-3 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                      <div className="text-xs text-warning/90 leading-relaxed">
                          <strong>AI Patch Disclaimer:</strong> Always review the generated code patch before committing it. Once applied, a subsequent CI/CD scan should yield a Green Flag.
                      </div>
                  </div>

                  <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Vulnerability Type *</label>
                            <Input 
                                placeholder="e.g. SQL Injection, XSS, CSRF"
                                value={vulnTitle}
                                onChange={(e) => setVulnTitle(e.target.value)}
                                className="bg-bg border-border rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Language *</label>
                            <Select value={language} onValueChange={(v) => { setLanguage(v); setMonacoLanguage(v === 'cpp' ? 'cpp' : v === 'csharp' ? 'csharp' : v) }}>
                                <SelectTrigger className="bg-bg border-border rounded-xl">
                                    <SelectValue placeholder="Select Language" />
                                </SelectTrigger>
                                <SelectContent className="bg-panel border-border rounded-xl">
                                    <SelectItem value="javascript">JavaScript</SelectItem>
                                    <SelectItem value="typescript">TypeScript</SelectItem>
                                    <SelectItem value="python">Python</SelectItem>
                                    <SelectItem value="go">Go</SelectItem>
                                    <SelectItem value="java">Java</SelectItem>
                                    <SelectItem value="php">PHP</SelectItem>
                                    <SelectItem value="c">C</SelectItem>
                                    <SelectItem value="cpp">C++</SelectItem>
                                    <SelectItem value="ruby">Ruby</SelectItem>
                                    <SelectItem value="rust">Rust</SelectItem>
                                    <SelectItem value="swift">Swift</SelectItem>
                                    <SelectItem value="kotlin">Kotlin</SelectItem>
                                    <SelectItem value="csharp">C#</SelectItem>
                                    <SelectItem value="sql">SQL</SelectItem>
                                    <SelectItem value="bash">Bash</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Vulnerable Code Snippet *</label>
                            <div className="rounded-xl border border-border overflow-hidden h-[300px]">
                                <Editor
                                    height="100%"
                                    language={monacoLanguage}
                                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                    value={vulnerableCode}
                                    onChange={(v) => setVulnerableCode(v || "")}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 12,
                                        scrollBeyondLastLine: false,
                                        lineNumbers: 'on',
                                        padding: { top: 10 }
                                    }}
                                />
                            </div>
                        </div>

                        <Button 
                            className="w-full h-11 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" 
                            disabled={isPatchLoading}
                            onClick={handleSuggestPatch}
                        >
                            {isPatchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                            Suggest AI Patch
                        </Button>
                  </div>
              </div>

              <div className="space-y-6">
                    {!patchObject && !isPatchLoading ? (
                        <div className="bg-bg-subtle/30 border border-dashed border-border rounded-3xl h-[600px] flex flex-col items-center justify-center text-center p-12 space-y-4">
                            <div className="h-20 w-20 rounded-full bg-panel flex items-center justify-center shadow-inner">
                                <Zap className="h-10 w-10 text-primary opacity-20" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-xl font-bold text-fg-muted">AI Patch Suggester</h4>
                                <p className="text-sm text-fg-disabled max-w-sm">Provide your vulnerable code snippet on the left to receive a secure, AI-generated patch and explanation.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-panel border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[600px] animate-in slide-in-from-right-4 duration-500">
                             <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-3 flex gap-2">
                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                        Review Suggested Fix
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isPatchLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                    <Button 
                                        size="sm" 
                                        variant="outline"
                                        className="rounded-lg h-9 border-border gap-2"
                                        disabled={!typedPatchObject?.fixed_code}
                                        onClick={() => copyToClipboard(typedPatchObject?.fixed_code || "")}
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                                        Copy Fixed Code
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex-1 border-b border-border">
                                    <DiffEditor
                                        height="450px"
                                        language={monacoLanguage}
                                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                        original={vulnerableCode}
                                        modified={typedPatchObject?.fixed_code || ""}
                                        options={{
                                            renderSideBySide: true,
                                            readOnly: true,
                                            minimap: { enabled: false },
                                            fontSize: 12,
                                            scrollBeyondLastLine: false,
                                        }}
                                    />
                                </div>
                                
                                <div className="p-8 space-y-6 overflow-y-auto max-h-[300px] scrollbar-thin">
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" /> Root Cause Analysis
                                        </h4>
                                        <div className="bg-bg-subtle p-4 rounded-xl border border-border/50 text-sm text-fg-muted leading-relaxed">
                                            {typedPatchObject?.explanation || "Analyzing security flaw..."}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-success flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4" /> Fix Strategy
                                        </h4>
                                        <div className="border-l-4 border-l-success pl-6 py-2 text-sm text-fg-muted leading-relaxed">
                                            {typedPatchObject?.fix_explanation || "Determining secure implementation..."}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
              </div>
          </div>
      </TabsContent>
    </Tabs>
  )
}
