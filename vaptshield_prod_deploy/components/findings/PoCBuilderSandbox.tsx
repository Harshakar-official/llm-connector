"use client"

import { useState } from "react"
import { PoCStepBuilder, PoCStep, PoCImage } from "./PoCStepBuilder"
import { Button } from "@/components/ui/button"
import { Save, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { getBrowserClient } from "@/lib/supabase/client"

export function PoCBuilderSandbox() {
    const [pocValue, setPocValue] = useState<string>("")
    const [isUploading, setIsUploading] = useState(false)
    const [projectId] = useState("sandbox-project-id")

    // ─── THE MASTER BATCH UPLOAD LOGIC ───
    // This is what we will integrate into FindingForm's onSubmit
    const handleBatchUpload = async (jsonString: string) => {
        setIsUploading(true)
        const supabase = getBrowserClient()
        
        try {
            const steps: PoCStep[] = JSON.parse(jsonString)
            const updatedSteps = [...steps]

            // 1. Identify all files that need uploading
            const uploadTasks: { stepIdx: number, imgIdx: number, file: File, id: string }[] = []
            
            steps.forEach((step, sIdx) => {
                step.images.forEach((img, iIdx) => {
                    // Only upload if it has a local file and NO remoteUrl yet
                    if (img.file && !img.remoteUrl) {
                        uploadTasks.push({ 
                            stepIdx: sIdx, 
                            imgIdx: iIdx, 
                            file: img.file,
                            id: img.id
                        })
                    }
                })
            })

            if (uploadTasks.length === 0) {
                console.log("No new images to upload.")
                setIsUploading(false)
                return jsonString
            }

            toast.info(`Uploading ${uploadTasks.length} PoC images...`)

            // 2. Parallel Upload to Supabase (Z+ Performance)
            await Promise.all(uploadTasks.map(async (task) => {
                const ext = task.file.name.split('.').pop()
                const path = `${projectId}/poc/${task.id}.${ext}`

                const { data, error } = await supabase.storage
                    .from('poc-files')
                    .upload(path, task.file, {
                        cacheControl: '3600',
                        upsert: true
                    })

                if (error) throw error
                if (!data) throw new Error("Upload failed: No data returned")

                // Update the step with the permanent URL
                updatedSteps[task.stepIdx].images[task.imgIdx].remoteUrl = data.path
                // Cleanup: Revoke local blob URL to free memory
                const preview = updatedSteps[task.stepIdx].images[task.imgIdx].preview
                if (preview.startsWith('blob:')) {
                    URL.revokeObjectURL(preview)
                }
            }))

            const finalJson = JSON.stringify(updatedSteps)
            setPocValue(finalJson)
            toast.success("Batch upload complete!")
            return finalJson

        } catch (error: any) {
            console.error("Batch upload failed:", error)
            toast.error("Failed to upload PoC images: " + error.message)
            throw error
        } finally {
            setIsUploading(false)
        }
    }

    const handleSave = async () => {
        try {
            const finalData = await handleBatchUpload(pocValue)
            console.log("Final JSON ready for Database:", finalData)
            // In the real FindingForm, this is where we'd call the /api/findings
        } catch (e) {
            // Error handled in batch upload
        }
    }

    return (
        <div className="max-w-3xl mx-auto p-8 space-y-8 bg-bg min-h-screen">
            <div className="flex items-center justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-fg italic">PoC BUILDER <span className="text-primary">SANDBOX</span></h1>
                    <p className="text-xs text-fg-muted uppercase font-bold tracking-widest mt-1">Enterprise Prototype: Local-First Blob Batching</p>
                </div>
                <Button 
                    onClick={handleSave} 
                    disabled={isUploading}
                    className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-6 shadow-lg shadow-primary/20"
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Simulate Final Save
                        </>
                    )}
                </Button>
            </div>

            <PoCStepBuilder 
                value={pocValue} 
                onChange={setPocValue} 
                projectId={projectId} 
            />

            <div className="mt-12 p-6 rounded-2xl bg-panel border border-border">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> 
                    Live Database Payload Preview
                </h3>
                <pre className="text-[10px] font-mono text-primary bg-bg/50 p-4 rounded-xl border border-border/50 overflow-x-auto">
                    {JSON.stringify(JSON.parse(pocValue || "[]"), null, 2)}
                </pre>
            </div>
        </div>
    )
}
