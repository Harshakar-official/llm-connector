"use client"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

export const Editor = dynamic(
  () => import("@monaco-editor/react"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full min-h-[300px]" /> }
)

export const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
  { ssr: false, loading: () => <Skeleton className="h-full w-full min-h-[600px]" /> }
)
