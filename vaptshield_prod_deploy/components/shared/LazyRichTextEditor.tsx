"use client"
import dynamic from "next/dynamic"
import type { RichTextEditorProps } from "./RichTextEditor"
import type { ComponentType } from "react"

const BaseEditor = dynamic<RichTextEditorProps>(
  () => import("./RichTextEditor").then((mod) => ({ default: mod.RichTextEditor as ComponentType<RichTextEditorProps> })),
  { ssr: false }
)

export function RichTextEditor(props: RichTextEditorProps) {
  return <BaseEditor {...props} />
}
