"use client"

import { useState, useEffect, useRef } from "react"
import { experimental_useObject as useObject } from "ai/react"
import { z } from "zod"
import { Loader2, Zap, ArrowRightLeft, Copy, Check, ShieldCheck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { DiffEditor } from "@/components/shared/MonacoEditor"
import { useTheme } from "next-themes"

const patchResponseSchema = z.object({
    vulnerable_lines: z.array(z.number()),
    explanation: z.string(),
    fixed_code: z.string(),
    fix_explanation: z.string(),
})

interface AIPatchInlineProps {
  findingId?: string
  findingTitle: string
  vulnerableCode: string
  existingPatch?: any
  onPatchGenerated?: (findingId: string, patch: any) => void
}

export function AIPatchInline({ findingId, findingTitle, vulnerableCode, existingPatch, onPatchGenerated }: AIPatchInlineProps) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)
  const [monacoLanguage] = useState("javascript")

  const { object: patchObject, submit: submitPatch, isLoading: isPatchLoading, stop } = useObject({
    api: "/api/ai/patch",
    schema: patchResponseSchema,
    onFinish: ({ object }) => {
        toast.success("Security patch generated successfully")
        if (findingId && onPatchGenerated && object) {
            onPatchGenerated(findingId, object)
        }
    },
    onError: (error) => {
        if (error.name === 'AbortError') return;
        toast.error("Patch generation failed")
        console.error(error)
    }
  })

  useEffect(() => {
    return () => stop()
  }, [stop])

  const typedPatchObject = existingPatch || (patchObject as { fixed_code?: string; explanation?: string; fix_explanation?: string } | undefined)

  const handleSuggestPatch = () => {
    submitPatch({
      vulnTitle: findingTitle,
      vulnerableCode
    })
  }

  const editorRef = useRef<any>(null)

  useEffect(() => {
    return () => {
      // Safe cleanup of Monaco Diff Editor models before component unmounts
      // This prevents the "TextModel got disposed before DiffEditorWidget model got reset" error
      if (editorRef.current) {
        try {
          const model = editorRef.current.getModel()
          if (model) {
            editorRef.current.setModel(null)
          }
        } catch (e) {
          // ignore cleanup errors
        }
      }
    }
  }, [])

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Fixed code copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  if (!typedPatchObject && !isPatchLoading) {
    return (
      <div className="bg-bg-subtle/30 border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-panel flex items-center justify-center shadow-inner">
          <Zap className="h-8 w-8 text-primary opacity-20" />
        </div>
        <div className="space-y-2">
          <h4 className="text-lg font-bold text-fg-muted">AI Patch Suggester</h4>
          <p className="text-xs text-fg-disabled max-w-sm">
            Generate a secure fix for this vulnerability using AI. Always review the code before applying.
          </p>
        </div>
        <Button onClick={handleSuggestPatch} className="font-bold shadow-md">
          <Zap className="h-4 w-4 mr-2" /> Generate Secure Patch
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-panel-base border border-border rounded-xl overflow-hidden mt-4 shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel-muted">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5">
            <Zap className="h-3 w-3 mr-1" /> AI Generated Fix
          </Badge>
          <span className="text-[10px] text-fg-muted font-mono ml-2 flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" /> Diff View
          </span>
          {isPatchLoading && <Loader2 className="h-4 w-4 animate-spin text-primary ml-2" />}
        </div>
        <Button 
          size="sm" 
          variant="outline"
          className="h-8 text-xs font-bold"
          disabled={!typedPatchObject?.fixed_code}
          onClick={() => copyToClipboard(typedPatchObject?.fixed_code || "")}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
          Copy Fix
        </Button>
      </div>

      <div className="border-b border-border h-[600px]">
        <DiffEditor
          height="100%"
          language={monacoLanguage}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          original={vulnerableCode}
          modified={typedPatchObject?.fixed_code || ""}
          onMount={handleEditorMount}
          options={{
            renderSideBySide: true,
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
      
      <div className="p-6 space-y-5 bg-bg-subtle/10 overflow-y-auto max-h-[300px]">
        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Root Cause Analysis
          </h4>
          <div className="bg-bg-subtle p-3 rounded-lg border border-border/50 text-xs text-fg-muted leading-relaxed">
            {typedPatchObject?.explanation || "Analyzing security flaw..."}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-success flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Fix Strategy
          </h4>
          <div className="border-l-2 border-l-success pl-4 py-1 text-xs text-fg-muted leading-relaxed">
            {typedPatchObject?.fix_explanation || "Determining secure implementation..."}
          </div>
        </div>

        <div className="mt-4 bg-primary/5 border border-primary/20 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[10px] text-fg-subtle leading-relaxed">
            <strong>Gentle Reminder:</strong> AI-generated code fixes are highly accurate but not foolproof. Please review and verify the changes against your project's context before applying them to your main branch.
          </p>
        </div>
      </div>
    </div>
  )
}
