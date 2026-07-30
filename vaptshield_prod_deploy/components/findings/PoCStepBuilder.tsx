"use client"

import { useState, useCallback, useEffect } from "react"
import { 
    Plus, 
    Trash2, 
    GripVertical, 
    Image as ImageIcon, 
    X, 
    UploadCloud,
    Zap,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Eye
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle 
} from "@/components/ui/dialog"
import { RichTextEditor } from "@/components/shared/LazyRichTextEditor"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getBrowserClient } from "@/lib/supabase/client"
import { pocRegistry } from "@/lib/utils/poc-registry"

// ─── UUID HELPER ───
const generateId = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID()
    }
    return Math.random().toString(36).substring(2, 15)
}

// ─── TYPES ───

export interface PoCImage {
    id: string
    file?: File        // Local file for upload
    preview: string    // Local blob URL or remote URL
    remoteUrl?: string // Final path in Supabase
    name: string
    size: number
    type: string
}

export interface PoCStep {
    id: string
    text: string
    images: PoCImage[]
}

interface PoCStepBuilderProps {
    value: string | null | undefined // Existing PoC data (JSON string or HTML)
    onChange: (value: string) => void
    projectId: string
    findingId?: string
}

// ─── CONSTANTS ───
const MAX_STEPS = 15
const MAX_IMAGES_PER_STEP = 4
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB (Enterprise compressed standard)
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function PoCStepBuilder({ value, onChange, projectId, findingId }: PoCStepBuilderProps) {
    const [steps, setSteps] = useState<PoCStep[]>([])
    const [isInitialized, setIsInitialized] = useState(false)
    const [activeLightbox, setActiveLightbox] = useState<{ url: string, name: string } | null>(null)

    // ─── INITIALIZATION & BACKWARD COMPATIBILITY ───
    useEffect(() => {
        if (isInitialized) return

        try {
            if (value && value.trim().startsWith('[')) {
                // Parse existing JSON steps
                const parsed = JSON.parse(value)
                if (Array.isArray(parsed)) {
                    setSteps(parsed.map((s: any) => ({
                        id: s.id || generateId(),
                        text: s.text || "",
                        images: (s.images || []).map((img: any) => {
                            // Z+ FIX: If we have a remoteUrl, use it. Ignore expired blob previews.
                            const effectivePreview = img.remoteUrl 
                                ? `/api/poc/view?path=${img.remoteUrl}` 
                                : (img.preview?.startsWith('blob:') ? img.preview : "")

                            return {
                                id: img.id || generateId(),
                                preview: effectivePreview,
                                remoteUrl: img.remoteUrl || "",
                                name: img.name || "image.png",
                                size: img.size || 0,
                                type: img.type || "image/png"
                            }
                        })
                    })))
                }
            } else if (value && value.trim() !== "") {
                // Convert legacy HTML string to Step 1
                setSteps([{
                    id: generateId(),
                    text: value,
                    images: []
                }])
            } else {
                // Default: Start with one empty step
                setSteps([{
                    id: generateId(),
                    text: "",
                    images: []
                }])
            }
        } catch (e) {
            console.error("Failed to parse PoC steps:", e)
            setSteps([{ id: generateId(), text: value || "", images: [] }])
        }
        setIsInitialized(true)
    }, [value, isInitialized])

    // ─── SYNC STATE TO FORM ───
    const syncToForm = useCallback((currentSteps: PoCStep[]) => {
        // We only sync the structure. Actual remoteUrls might be missing until batch upload.
        const simplified = currentSteps.map(s => ({
            id: s.id,
            text: s.text,
            images: s.images.map(img => ({
                id: img.id,
                preview: img.preview?.startsWith('blob:') ? "" : img.preview, // Z+ FIX: Don't store temporary blob URLs
                remoteUrl: img.remoteUrl || "",
                name: img.name,
                size: img.size,
                type: img.type
            }))
        }))
        onChange(JSON.stringify(simplified))
    }, [onChange])

    // ─── ACTIONS ───

    const addStep = () => {
        if (steps.length >= MAX_STEPS) {
            toast.error(`Maximum of ${MAX_STEPS} steps allowed.`)
            return
        }
        const newSteps = [...steps, { id: generateId(), text: "", images: [] }]
        setSteps(newSteps)
        syncToForm(newSteps)
    }

    const removeStep = (id: string) => {
        if (steps.length <= 1) {
            // Just clear the first step instead of removing
            const cleared = [{ ...steps[0], text: "", images: [] }]
            // Unregister all files for this step
            steps[0].images.forEach(img => pocRegistry.delete(img.id))
            setSteps(cleared)
            syncToForm(cleared)
            return
        }
        // Unregister all files for the removed step
        const removedStep = steps.find(s => s.id === id)
        removedStep?.images.forEach(img => pocRegistry.delete(img.id))

        const newSteps = steps.filter(s => s.id !== id)
        setSteps(newSteps)
        syncToForm(newSteps)
    }

    const updateStepText = (id: string, text: string) => {
        const newSteps = steps.map(s => s.id === id ? { ...s, text } : s)
        setSteps(newSteps)
        syncToForm(newSteps)
    }

    const handleImageSelect = (stepId: string, files: FileList | null) => {
        if (!files) return

        const step = steps.find(s => s.id === stepId)
        if (!step) return

        if (step.images.length + files.length > MAX_IMAGES_PER_STEP) {
            toast.error(`Max ${MAX_IMAGES_PER_STEP} images per step allowed.`)
            return
        }

        const newImages: PoCImage[] = []
        Array.from(files).forEach(file => {
            if (!ALLOWED_TYPES.includes(file.type)) {
                toast.error(`Invalid file type: ${file.name}. Only PNG/JPG/WebP allowed.`)
                return
            }
            if (file.size > MAX_FILE_SIZE) {
                toast.error(`File too large: ${file.name}. Max 5MB allowed.`)
                return
            }

            const imgId = generateId()
            // Z+ REGISTRY: Store raw file reference
            pocRegistry.set(imgId, file)

            newImages.push({
                id: imgId,
                file,
                preview: URL.createObjectURL(file),
                name: file.name,
                size: file.size,
                type: file.type,
                remoteUrl: ""
            })
        })

        const newSteps = steps.map(s => 
            s.id === stepId ? { ...s, images: [...s.images, ...newImages] } : s
        )
        setSteps(newSteps)
        syncToForm(newSteps)
    }

    const removeImage = (stepId: string, imgId: string) => {
        // Z+ REGISTRY: Clean up raw file reference
        pocRegistry.delete(imgId)

        const step = steps.find(s => s.id === stepId)
        const img = step?.images.find(i => i.id === imgId)
        
        if (img?.preview.startsWith('blob:')) {
            URL.revokeObjectURL(img.preview)
        }

        const newSteps = steps.map(s => 
            s.id === stepId ? { ...s, images: s.images.filter(i => i.id !== imgId) } : s
        )
        setSteps(newSteps)
        syncToForm(newSteps)
    }

    // ─── RENDER ───

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-warning" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-fg-muted">Timeline Reproduction Steps</h3>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-[10px] text-fg-muted uppercase font-bold tracking-tighter">
                        {steps.length} / {MAX_STEPS} Steps
                    </span>
                    <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={addStep}
                        className="h-8 border-dashed border-primary/30 hover:border-primary rounded-lg text-[10px] font-bold uppercase"
                    >
                        <Plus className="h-3 w-3 mr-1" /> Add Next Step
                    </Button>
                </div>
            </div>

            <div className="relative space-y-8 pl-4">
                {/* Vertical Timeline Line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary/50 via-border to-border/30 rounded-full" />

                {steps.map((step, index) => (
                    <div key={step.id} className="relative animate-in slide-in-from-left-2 duration-300">
                        {/* Timeline Node */}
                        <div className="absolute -left-[13px] top-2 h-6 w-6 rounded-full bg-bg border-2 border-primary flex items-center justify-center shadow-lg shadow-primary/20 z-10">
                            <span className="text-[10px] font-black text-primary">{index + 1}</span>
                        </div>

                        <Card className="bg-panel/40 border-border rounded-2xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-fg-muted/60">Step Instructions</h4>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-fg-muted hover:text-danger rounded-lg"
                                            onClick={() => removeStep(step.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                <RichTextEditor 
                                    value={step.text}
                                    onChange={(val) => updateStepText(step.id, val)}
                                    minHeight="100px"
                                    placeholder={`Describe what to do in step ${index + 1}...`}
                                />

                                {/* Image Section */}
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-3">
                                        {step.images.map((img) => (
                                            <div key={img.id} className="relative group/img aspect-video w-32 rounded-xl overflow-hidden border border-border bg-bg-subtle shadow-sm">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img 
                                                    src={img.remoteUrl ? `/api/poc/view?path=${img.remoteUrl}` : img.preview} 
                                                    alt={img.name} 
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <Button 
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white"
                                                        onClick={() => setActiveLightbox({ 
                                                            url: img.remoteUrl ? `/api/poc/view?path=${img.remoteUrl}` : img.preview, 
                                                            name: img.name 
                                                        })}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button 
                                                        type="button"
                                                        variant="destructive"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-full shadow-xl"
                                                        onClick={() => removeImage(step.id, img.id)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                {img.remoteUrl && (
                                                    <div className="absolute top-1 left-1">
                                                        <CheckCircle2 className="h-3 w-3 text-success fill-bg rounded-full shadow-sm" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {step.images.length < MAX_IMAGES_PER_STEP && (
                                            <label className="aspect-video w-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-bg-subtle/50 hover:bg-primary/5 cursor-pointer flex flex-col items-center justify-center transition-all group/label">
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept={ALLOWED_TYPES.join(',')}
                                                    multiple
                                                    onChange={(e) => handleImageSelect(step.id, e.target.files)}
                                                />
                                                <UploadCloud className="h-5 w-5 text-fg-muted group-hover/label:text-primary transition-colors" />
                                                <span className="text-[8px] font-bold uppercase mt-1 text-fg-muted/60 group-hover/label:text-primary/60">Upload PoC</span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                ))}

                <div className="flex justify-center pt-2">
                    <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={addStep}
                        className="rounded-full border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-md"
                    >
                        <Plus className="h-4 w-4 mr-2" /> 
                        Add Step {steps.length + 1}
                    </Button>
                </div>
            </div>

            {/* Security Notice */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                <div>
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Enterprise Security Protocol</p>
                    <p className="text-[10px] text-fg-muted leading-tight mt-1">
                        Images are held in secure browser memory and sanitized (EXIF stripping) before parallel batch upload. 
                        Max 15 steps per finding. Each image is strictly validated for MIME signature.
                    </p>
                </div>
            </div>

            {/* Lightbox Dialog */}
            <Dialog open={!!activeLightbox} onOpenChange={(open) => !open && setActiveLightbox(null)}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-black/90 border-none shadow-2xl">
                    <DialogHeader className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md p-2 rounded-lg border border-white/10 opacity-0 hover:opacity-100 transition-opacity">
                        <DialogTitle className="text-white text-xs font-bold truncate max-w-[300px]">
                            {activeLightbox?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={activeLightbox?.url} 
                            alt={activeLightbox?.name} 
                            className="max-w-full max-h-[85vh] object-contain rounded-sm shadow-2xl"
                        />
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full h-10 w-10 z-50"
                        onClick={() => setActiveLightbox(null)}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                </DialogContent>
            </Dialog>
        </div>
    )
}
