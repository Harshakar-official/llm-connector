'use client'

import React, { useState, useRef } from 'react'
import { Upload, Loader2, ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PoCImage {
    storagePath: string
    viewUrl: string
    originalFilename: string
    sizeBytes: number
}

interface PocUploaderProps {
    projectId: string
    onUploaded: (image: PoCImage) => void
}

/**
 * Drag-drop / paste / click-to-upload PoC screenshots.
 * Uploads to /api/poc/upload which validates MIME/extension/size and
 * stores under `{projectId}/poc/{uuid}.{ext}`. Returns a /api/poc/view
 * URL that proxies through a 60s signed URL for secure display.
 */
export function PocUploaderV2({ projectId, onUploaded }: PocUploaderProps) {
    const [uploading, setUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFiles = async (files: FileList | File[]) => {
        const fileArr = Array.from(files)
        if (fileArr.length === 0) return
        setUploading(true)
        for (const file of fileArr) {
            try {
                const formData = new FormData()
                formData.append('file', file)
                formData.append('projectId', projectId)
                const res = await fetch('/api/poc/upload', {
                    method: 'POST',
                    body: formData,
                })
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({ error: 'Upload failed' }))
                    throw new Error(errBody.error || `HTTP ${res.status}`)
                }
                const data = await res.json()
                onUploaded(data)
                toast.success(`Uploaded ${data.originalFilename}`)
            } catch (err: any) {
                toast.error(`Upload failed: ${err.message}`)
            }
        }
        setUploading(false)
        if (inputRef.current) inputRef.current.value = ''
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files)
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items
        const files: File[] = []
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const f = items[i].getAsFile()
                if (f) files.push(f)
            }
        }
        if (files.length > 0) {
            e.preventDefault()
            handleFiles(files)
        }
    }

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
            className={`
                relative border-2 border-dashed rounded-2xl p-4 mb-4
                flex items-center gap-3 transition-colors cursor-pointer
                print:hidden
                ${isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-200 bg-slate-50/30 hover:bg-slate-50/60 hover:border-slate-300'}
            `}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            {uploading ? (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin shrink-0" />
            ) : (
                <Upload className="h-5 w-5 text-slate-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {uploading ? 'Uploading…' : 'Drop / paste / click to attach PoC evidence'}
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                    PNG, JPEG, GIF, WebP, PDF — max 10MB each
                </p>
            </div>
        </div>
    )
}
