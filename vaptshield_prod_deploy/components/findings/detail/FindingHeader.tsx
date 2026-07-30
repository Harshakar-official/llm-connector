"use client"

import Link from "next/link"
import { ArrowLeft, Edit3 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  title: string
  canModify: boolean
  isLocked: boolean
  onEditClick: () => void
}

export function FindingHeader({ title, canModify, isLocked, onEditClick }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/findings" className="text-fg-muted hover:text-fg flex items-center gap-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Findings Inventory
        </Link>
        <span className="text-fg-subtle">/</span>
        <span className="text-fg font-medium truncate max-w-[300px]">{title}</span>
      </div>
      
      {canModify && !isLocked && (
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-border rounded-xl h-9 px-4 text-xs font-bold" onClick={onEditClick}>
            <Edit3 className="h-3.5 w-3.5 mr-2" /> Edit Details
          </Button>
        </div>
      )}
    </div>
  )
}
