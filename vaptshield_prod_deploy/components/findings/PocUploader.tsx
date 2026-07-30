"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useDropzone } from "react-dropzone"
import { 
    Upload, 
    X, 
    Download, 
    Loader2, 
    AlertCircle,
    CheckCircle2,
    Paperclip
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface FileItem {
  id: string
  name: string
  size: number
  type: string
  url: string
  status: 'uploading' | 'completed' | 'error'
  progress: number
}

interface PocUploaderProps {
  projectId: string
  onFilesChange: (files: FileItem[]) => void
  initialFiles?: FileItem[]
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'txt', 'pcap', 'json', 'yaml', 'yml', 'md']

// MIME type whitelist — maps extensions to allowed MIME types for defense-in-depth
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  pcap: ['application/vnd.tcpdump.pcap', 'application/octet-stream'],
  json: ['application/json'],
  yaml: ['application/x-yaml', 'text/yaml', 'text/plain'],
  yml: ['application/x-yaml', 'text/yaml', 'text/plain'],
  md: ['text/markdown', 'text/plain'],
}

// Build accept prop for react-dropzone from allowed extensions
const ACCEPT_MAP: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'application/vnd.tcpdump.pcap': ['.pcap'],
  'application/json': ['.json'],
  'application/x-yaml': ['.yaml', '.yml'],
  'text/yaml': ['.yaml', '.yml'],
  'text/markdown': ['.md'],
}

export function PocUploader({ projectId, onFilesChange, initialFiles = [] }: PocUploaderProps) {
  const [files, setFiles] = useState<FileItem[]>(initialFiles)
  const supabase = getBrowserClient()

  // Track whether initialFiles have been seeded to avoid overwriting user changes
  const seededRef = useRef(false)

  // Sync late-arriving initialFiles (e.g., when FindingForm loads attachments async)
  useEffect(() => {
    if (initialFiles.length > 0 && !seededRef.current) {
      setFiles(initialFiles)
      seededRef.current = true
    }
  }, [initialFiles])

  const uploadFile = useCallback(async (fileItem: FileItem & { file: File }) => {
    const ext = fileItem.name.split('.').pop()
    const storagePath = `${projectId}/${fileItem.id}.${ext}`

    try {
        const { data, error } = await supabase.storage
            .from('poc-files')
            .upload(storagePath, fileItem.file, {
                cacheControl: '3600',
                upsert: false
            })

        if (error) throw error

        // Verify the storage path is present before storing
        if (!data?.path) {
            throw new Error("Upload succeeded but storage path is missing — file may be unreachable.")
        }

        const url = data.path

        setFiles(prev => {
            const updated = prev.map(f =>
                f.id === fileItem.id
                ? { ...f, status: 'completed' as const, progress: 100, url }
                : f
            )
            onFilesChange(updated.filter(f => f.status === 'completed'))
            return updated
        })
    } catch (err) {
        console.error("Upload error:", err)
        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' as const } : f))
        toast.error(`Failed to upload ${fileItem.name}`)
    }
  }, [projectId, onFilesChange, supabase.storage])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const allowedExtsStr = ALLOWED_EXTENSIONS.map(e => `.${e}`).join(", ")
    const DANGEROUS_DOUBLE_EXTS = ['exe', 'bat', 'cmd', 'com', 'dll', 'msi', 'ps1', 'sh', 'vbs', 'wsf', 'scr', 'pif', 'cpl']

    const newFiles: (FileItem & { file: File })[] = []

    for (const file of acceptedFiles) {
        // ── Check for double-extension bypass (e.g., payload.exe.pdf) ──
        const parts = file.name.split('.')
        if (parts.length > 2) {
            const secondLastExt = parts[parts.length - 2]?.toLowerCase()
            if (secondLastExt && DANGEROUS_DOUBLE_EXTS.includes(secondLastExt)) {
                toast.error(`File "${file.name}" has a suspicious double extension (.${secondLastExt}.${parts[parts.length - 1]}). File rejected for security.`)
                continue
            }
        }

        const ext = parts.pop()?.toLowerCase() || ""
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            toast.error(`Extension .${ext} is not allowed. Allowed: ${allowedExtsStr}`)
            continue
        }

        if (file.size > MAX_FILE_SIZE) {
            toast.error(`File ${file.name} exceeds 10MB limit.`)
            continue
        }

        // ── Duplicate filename check ──
        const isDuplicate = files.some(f => f.name === file.name)
        if (isDuplicate) {
            toast.warning(`File "${file.name}" was already added. Skipping duplicate.`)
            continue
        }

        // ── Magic bytes / file signature validation ──
        try {
            const buffer = await file.slice(0, 8).arrayBuffer()
            const bytes = new Uint8Array(buffer)

            // MZ header — Windows PE/EXE/DLL
            if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
                toast.error(`File "${file.name}" appears to be a Windows executable (MZ header). File rejected for security.`)
                continue
            }
            // ELF header — Linux executable
            if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
                toast.error(`File "${file.name}" appears to be a Linux executable (ELF header). File rejected for security.`)
                continue
            }
            // ZIP/PK header — archive (blocked since .zip was removed)
            if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
                toast.error(`File "${file.name}" appears to be a ZIP archive. Archives are not allowed for security reasons.`)
                continue
            }
        } catch {
            toast.error(`Could not read file "${file.name}" for security validation.`)
            continue
        }

        // Defense-in-depth: validate MIME type matches the extension
        const allowedMimes = ALLOWED_MIME_TYPES[ext]
        if (allowedMimes && !allowedMimes.includes(file.type)) {
            toast.error(`File type "${file.type}" does not match extension .${ext}. File rejected for security.`)
            continue
        }

        newFiles.push({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            url: '',
            status: 'uploading' as const,
            progress: 0,
            file
        })
    }

    if (newFiles.length === 0) return

    setFiles(prev => [...prev, ...newFiles.map(({ file: _unused, ...rest }) => rest)])

    for (const fileItem of newFiles) {
        uploadFile(fileItem)
    }
  }, [uploadFile, files])

  const removeFile = async (id: string, path: string) => {
    try {
        if (path) {
            await supabase.storage.from('poc-files').remove([path])
        }
        const updated = files.filter(f => f.id !== id)
        setFiles(updated)
        onFilesChange(updated.filter(f => f.status === 'completed'))
    } catch {
        toast.error("Failed to remove file from server")
    }
  }

  const downloadFile = async (path: string, fileName: string) => {
    const toastId = toast.loading("Generating download link...")
    try {
        // Sanitize filename: strip path traversal characters and control chars
        const safeName = fileName.replace(/[/\\:*?"<>|]/g, '_').replace(/[\x00-\x1f\x7f]/g, '').trim() || 'download'
        
        const { data, error } = await supabase.storage
            .from('poc-files')
            .createSignedUrl(path, 300, {
                download: safeName
            })
        
        if (error) throw error
        
        // Use programmatic <a> click to avoid popup blockers
        const link = document.createElement('a')
        link.href = data.signedUrl
        link.download = safeName
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        toast.success("Download started", { id: toastId })
    } catch {
        toast.error("Failed to generate download link", { id: toastId })
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_FILE_SIZE,
    accept: ACCEPT_MAP,
  })

  return (
    <div className="space-y-4">
      <div 
        {...getRootProps()} 
        className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-bg-subtle/50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Upload className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-bold">Click or drag files to upload PoC evidence</p>
            <p className="text-xs text-fg-muted">Maximum file size: 10MB. Allowed: Images, PDF, TXT, PCAP, JSON, ZIP</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {files.map((file) => (
            <div 
                key={file.id} 
                className="flex items-center justify-between p-3 bg-panel border border-border rounded-lg group animate-in fade-in slide-in-from-top-1"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded bg-bg-muted flex items-center justify-center flex-shrink-0">
                        <Paperclip className="h-4 w-4 text-fg-muted" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold truncate max-w-[200px]">{file.name}</p>
                        <p className="text-[10px] text-fg-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {file.status === 'uploading' && (
                        <div className="flex items-center gap-2 mr-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span className="text-[10px] font-bold text-primary uppercase">Uploading...</span>
                        </div>
                    )}
                    {file.status === 'completed' && (
                        <>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-fg-muted hover:text-primary"
                                onClick={() => downloadFile(file.url, file.name)}
                            >
                                <Download className="h-3.5 w-3.5" />
                            </Button>
                            <div className="h-3.5 w-3.5 rounded-full bg-success/20 flex items-center justify-center">
                                <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                            </div>
                        </>
                    )}
                    {file.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-danger mr-2" />
                    )}
                    
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-fg-muted hover:text-danger"
                        onClick={() => removeFile(file.id, file.url)}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
