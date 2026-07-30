"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface Session {
  containerId: string
  sessionId: string
  wsUrl: string
  success: boolean
}

interface Finding {
  id: string
  title: string
  severity: string
  description: string
  url?: string | null
  raw_data?: unknown
  evidence?: string | null
  solution?: string | null
  reference?: string | null
  cweid?: string | null
  attack?: string | null
  param?: string | null
  other?: string | null
  riskcode?: string | null
  source?: string
  tool?: string
  is_auto_created?: boolean
  vuln_id?: string | null
}

interface TerminalStore {
  // Session
  session: Session | null
  selectedProject: string
  activeTime: number
  sessionStartedAt: number | null
  isRunning: boolean

  // Findings
  findings: Finding[]
  findingsCount: number
  aiEnrichments: Record<string, unknown>
  kaliTaskId: string | null

  // Heartbeat
  lastHeartbeatAt: number | null

  // Actions
  setSession: (session: Session | null) => void
  setSelectedProject: (projectId: string) => void
  setActiveTime: (time: number) => void
  setSessionStartedAt: (timestamp: number | null) => void
  setIsRunning: (running: boolean) => void
  setFindings: (findings: Finding[]) => void
  addFindings: (findings: Finding[]) => void
  removeFindings: (ids: string[]) => void
  setFindingsCount: (count: number) => void
  setAiEnrichment: (id: string, enrichment: unknown) => void
  removeAiEnrichment: (id: string) => void
  setKaliTaskId: (taskId: string | null) => void
  setLastHeartbeatAt: (lastHeartbeatAt: number | null) => void

  // Reset
  resetSession: () => void
  resetAll: () => void
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      session: null,
      selectedProject: "",
      activeTime: 0,
      sessionStartedAt: null,
      isRunning: false,
      findings: [],
      findingsCount: 0,
      aiEnrichments: {},
      kaliTaskId: null,
      lastHeartbeatAt: null,

      setSession: (session) => set({
        session,
        isRunning: session !== null,
        activeTime: session ? get().activeTime : 0,
        sessionStartedAt: session ? (get().sessionStartedAt || Date.now()) : null,
      }),
      setSelectedProject: (selectedProject) => set({ selectedProject }),
      setActiveTime: (activeTime) => set({ activeTime }),
      setSessionStartedAt: (sessionStartedAt) => set({ sessionStartedAt }),
      setIsRunning: (isRunning) => set({ isRunning }),
      setFindings: (findings) => set({ findings, findingsCount: findings.length }),
      addFindings: (newFindings) => set((state) => {
        const existing = new Set(state.findings.map(f => f.id))
        const unique = newFindings.filter(f => !existing.has(f.id))
        if (unique.length === 0) return state
        return { findings: [...state.findings, ...unique], findingsCount: state.findingsCount + unique.length }
      }),
      removeFindings: (ids) => set((state) => {
        const remaining = state.findings.filter(f => !ids.includes(f.id))
        return { findings: remaining, findingsCount: remaining.length }
      }),
      setFindingsCount: (findingsCount) => set({ findingsCount }),
      setAiEnrichment: (id, enrichment) => set((state) => ({
        aiEnrichments: { ...state.aiEnrichments, [id]: enrichment },
      })),
      removeAiEnrichment: (id) => set((state) => {
        const n = { ...state.aiEnrichments }
        delete n[id]
        return { aiEnrichments: n }
      }),
      setKaliTaskId: (kaliTaskId) => set({ kaliTaskId }),
      setLastHeartbeatAt: (lastHeartbeatAt) => set({ lastHeartbeatAt }),

      resetSession: () => set({ session: null, isRunning: false, activeTime: 0, sessionStartedAt: null, lastHeartbeatAt: null }),
      resetAll: () => set({
        session: null, selectedProject: "", activeTime: 0, sessionStartedAt: null, isRunning: false,
        findings: [], findingsCount: 0, aiEnrichments: {}, kaliTaskId: null,
        lastHeartbeatAt: null,
      }),
    }),
    {
      name: "vaptshield-terminal-store",
      partialize: (state) => ({
        session: state.session,
        selectedProject: state.selectedProject,
        sessionStartedAt: state.sessionStartedAt,
        activeTime: state.activeTime,
        findings: state.findings,
        findingsCount: state.findingsCount,
        aiEnrichments: state.aiEnrichments,
        kaliTaskId: state.kaliTaskId,
      }),
    }
  )
)
