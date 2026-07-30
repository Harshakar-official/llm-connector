"use client"

import { CheckCircle2, Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PoCImage {
    id: string
    remoteUrl?: string
    preview?: string
    name: string
}

interface PoCStep {
    id: string
    text: string
    images: PoCImage[]
}

interface PoCViewerProps {
    value: string | null | undefined
}

export function PoCViewer({ value }: PoCViewerProps) {
    if (!value || value.trim() === "") {
        return <p className="text-sm text-fg-disabled italic">No reproduction steps provided.</p>
    }

    let steps: PoCStep[] = []
    let isJson = false

    if (value.trim().startsWith('[')) {
        try {
            steps = JSON.parse(value)
            isJson = true
        } catch (e) {
            isJson = false
        }
    }

    if (!isJson) {
        return (
            <div 
                className="prose prose-sm dark:prose-invert max-w-none text-fg-muted leading-relaxed"
                dangerouslySetInnerHTML={{ __html: value }}
            />
        )
    }

    return (
        <div className="space-y-8 pl-4 relative">
            {/* Vertical Timeline Line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary/30 via-border to-border/10 rounded-full" />

            {steps.map((step, index) => (
                <div key={step.id || index} className="relative animate-in fade-in slide-in-from-left-2 duration-500">
                    {/* Timeline Node */}
                    <div className="absolute -left-[13px] top-1.5 h-6 w-6 rounded-full bg-bg border-2 border-primary flex items-center justify-center shadow-md z-10">
                        <span className="text-[10px] font-black text-primary">{index + 1}</span>
                    </div>

                    <div className="space-y-4">
                        <div 
                            className="prose prose-sm dark:prose-invert max-w-none text-fg-muted leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: step.text }}
                        />

                        {step.images && step.images.length > 0 && (
                            <div className="flex flex-wrap gap-4 pt-2">
                                {step.images.map((img) => {
                                    const path = img.remoteUrl || img.preview
                                    const isSecurePath = path && path.includes('/') && !path.startsWith('http') && !path.startsWith('blob:')
                                    const finalSrc = isSecurePath ? `/api/poc/view?path=${path}` : path
                                    
                                    return (
                                        <div 
                                            key={img.id} 
                                            className="relative group aspect-video w-48 rounded-xl overflow-hidden border border-border bg-bg-subtle shadow-sm hover:border-primary/40 transition-all cursor-zoom-in"
                                            onClick={() => {
                                                if (path) window.open(finalSrc, '_blank')
                                            }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img 
                                                src={finalSrc} 
                                                alt={img.name} 
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                            {isSecurePath && (
                                                <div className="absolute bottom-2 right-2">
                                                    <CheckCircle2 className="h-4 w-4 text-success fill-bg rounded-full shadow-sm" />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
