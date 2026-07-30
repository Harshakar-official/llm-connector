"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { calculateCvss40, getSeverityFromScore } from "@/lib/utils/cvss-official"
import { cn } from "@/lib/utils"
import { ChevronDown, Shield, Zap, Target, BarChart3, Info, AlertTriangle, MousePointer2 } from "lucide-react"

interface CvssCalculatorProps {
  onCalculate: (vector: string, score: number) => void
  initialVector?: string
}

// ─── FULL METRIC DEFINITIONS (CVSS 4.0 SPEC) ───
// ... rest of metric groups ...
const METRIC_GROUPS = [
  {
    id: 'base_exploitability',
    label: 'Base: Exploitability',
    icon: <Zap className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'AV', label: 'Attack Vector', options: [
        { label: 'Network', value: 'N', desc: 'Remotely exploitable' },
        { label: 'Adjacent', value: 'A', desc: 'Local network' },
        { label: 'Local', value: 'L', desc: 'Local access' },
        { label: 'Physical', value: 'P', desc: 'Physical contact' },
      ]},
      { code: 'AC', label: 'Attack Complexity', options: [
        { label: 'Low', value: 'L', desc: 'No special conditions' },
        { label: 'High', value: 'H', desc: 'Special conditions required' },
      ]},
      { code: 'AT', label: 'Attack Requirements', options: [
        { label: 'None', value: 'N', desc: 'No specific deployment' },
        { label: 'Present', value: 'P', desc: 'Specific deployment required' },
      ]},
      { code: 'PR', label: 'Privileges Required', options: [
        { label: 'None', value: 'N', desc: 'No auth' },
        { label: 'Low', value: 'L', desc: 'User level' },
        { label: 'High', value: 'H', desc: 'Admin level' },
      ]},
      { code: 'UI', label: 'User Interaction', options: [
        { label: 'None', value: 'N', desc: 'No user action' },
        { label: 'Passive', value: 'P', desc: 'Limited interaction' },
        { label: 'Active', value: 'A', desc: 'Significant interaction' },
      ]},
    ]
  },
  {
    id: 'base_impact',
    label: 'Base: Vulnerable System Impact',
    icon: <Shield className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'VC', label: 'Confidentiality (VC)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
      { code: 'VI', label: 'Integrity (VI)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
      { code: 'VA', label: 'Availability (VA)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
    ]
  },
  {
    id: 'subsequent_impact',
    label: 'Base: Subsequent System Impact',
    icon: <Target className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'SC', label: 'Confidentiality (SC)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
      { code: 'SI', label: 'Integrity (SI)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
      { code: 'SA', label: 'Availability (SA)', options: [
        { label: 'High', value: 'H' }, { label: 'Low', value: 'L' }, { label: 'None', value: 'N' }
      ]},
    ]
  },
  {
    id: 'threat',
    label: 'Threat Metrics',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'E', label: 'Exploit Maturity', options: [
        { label: 'X (Not Defined)', value: 'X' },
        { label: 'Attacked', value: 'A' },
        { label: 'POC', value: 'P' },
        { label: 'Unreported', value: 'U' },
      ]},
    ]
  },
  {
    id: 'environmental',
    label: 'Environmental (Security Requirements)',
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'CR', label: 'Confidentiality (CR)', options: [
        { label: 'X', value: 'X' }, { label: 'Low', value: 'L' }, { label: 'Medium', value: 'M' }, { label: 'High', value: 'H' }
      ]},
      { code: 'IR', label: 'Integrity (IR)', options: [
        { label: 'X', value: 'X' }, { label: 'Low', value: 'L' }, { label: 'Medium', value: 'M' }, { label: 'High', value: 'H' }
      ]},
      { code: 'AR', label: 'Availability (AR)', options: [
        { label: 'X', value: 'X' }, { label: 'Low', value: 'L' }, { label: 'Medium', value: 'M' }, { label: 'High', value: 'H' }
      ]},
    ]
  },
  {
    id: 'supplemental',
    label: 'Supplemental Metrics',
    icon: <Info className="h-3.5 w-3.5" />,
    metrics: [
      { code: 'S', label: 'Safety', options: [{ label: 'X', value: 'X' }, { label: 'Negligible', value: 'N' }, { label: 'Present', value: 'P' }]},
      { code: 'AU', label: 'Automatable', options: [{ label: 'X', value: 'X' }, { label: 'No', value: 'N' }, { label: 'Yes', value: 'Y' }]},
      { code: 'R', label: 'Recovery', options: [{ label: 'X', value: 'X' }, { label: 'Automatic', value: 'A' }, { label: 'User', value: 'U' }, { label: 'Irrecoverable', value: 'I' }]},
      { code: 'V', label: 'Value Density', options: [{ label: 'X', value: 'X' }, { label: 'Diffuse', value: 'D' }, { label: 'Concentrated', value: 'C' }]},
      { code: 'RE', label: 'Response Effort', options: [{ label: 'X', value: 'X' }, { label: 'Low', value: 'L' }, { label: 'Moderate', value: 'M' }, { label: 'High', value: 'H' }]},
      { code: 'U', label: 'Provider Urgency', options: [{ label: 'X', value: 'X' }, { label: 'Clear', value: 'Clear' }, { label: 'Green', value: 'Green' }, { label: 'Amber', value: 'Amber' }, { label: 'Red', value: 'Red' }]},
    ]
  }
]

const DEFAULT_VECTOR: Record<string, string> = {
  AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
  VC: 'N', VI: 'N', VA: 'N',
  SC: 'N', SI: 'N', SA: 'N',
  E: 'X', CR: 'X', IR: 'X', AR: 'X',
  S: 'X', AU: 'X', R: 'X', V: 'X', RE: 'X', U: 'X'
}

export function CvssCalculator({ onCalculate, initialVector }: CvssCalculatorProps) {
  const [vector, setVector] = useState<Record<string, string>>(DEFAULT_VECTOR)
  const [score, setScore] = useState(0)
  const [manualScore, setManualScore] = useState("")
  const [isManualMode, setIsManualMode] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['base_exploitability', 'base_impact']))
  
  const isInternalChangeRef = useRef(false)
  const lastParsedVectorRef = useRef<string | null>(null)

  const toggleSection = (id: string) => {
    const next = new Set(expandedSections)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedSections(next)
  }

  // Generate Vector String
  const generateVectorString = (v: Record<string, string>) => {
    const parts = [`CVSS:4.0`]
    const order = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA', 'E', 'CR', 'IR', 'AR', 'S', 'AU', 'R', 'V', 'RE', 'U']
    order.forEach(code => {
      if (v[code]) parts.push(`${code}:${v[code]}`)
    })
    return parts.join('/')
  }

  // ─── Z+ INTELLIGENCE: Manual Override Sync ───
  const handleManualScoreChange = (val: string) => {
      isInternalChangeRef.current = true
      setManualScore(val)
      if (val === "") {
          setIsManualMode(false)
          return
      }

      const numScore = parseFloat(val)
      if (!isNaN(numScore) && numScore >= 0 && numScore <= 10) {
          setScore(numScore)
          setIsManualMode(true)
          
          // Z+ SECURITY: When manual mode is active, we send "N/A" as the vector
          // to signal to the backend that vector-based math should be bypassed
          // in favor of the manual score.
          onCalculate("N/A", numScore)
      }
  }

  // Parse initial vector if provided
  useEffect(() => {
    if (initialVector && initialVector.startsWith('CVSS:4.0')) {
      if (initialVector === lastParsedVectorRef.current) return

      try {
          const parts = initialVector.split('/')
          const newVector: Record<string, string> = { ...DEFAULT_VECTOR }
          parts.forEach(part => {
            const [key, value] = part.split(':')
            if (key && value && DEFAULT_VECTOR[key] !== undefined) {
                const group = METRIC_GROUPS.find(g => g.metrics.some(m => m.code === key))
                const metric = group?.metrics.find(m => m.code === key)
                const isValid = metric?.options.some(o => o.value === value)
                if (isValid) newVector[key] = value
            }
          })
          
          isInternalChangeRef.current = false
          setVector(newVector)
          setManualScore("")
          setIsManualMode(false)
          lastParsedVectorRef.current = initialVector
      } catch (err) {
          console.error("[CVSS Parser] Failed to parse initial vector:", err)
      }
    } else if (initialVector === 'N/A' || !initialVector) {
        setIsManualMode(true)
    }
  }, [initialVector])

  useEffect(() => {
    // If we are in manual mode and the user is typing, don't let calculation override
    if (manualScore !== "") return

    const vectorString = generateVectorString(vector)
    
    // Z+ SECURITY: Use official calculation engine
    const calc = calculateCvss40(vectorString)
    
    if (calc.success) {
        setScore(calc.score)
        
        if (isInternalChangeRef.current) {
            lastParsedVectorRef.current = vectorString
            onCalculate(vectorString, calc.score)
            isInternalChangeRef.current = false
        }
    }
  }, [vector, onCalculate, manualScore])

  const handleMetricChange = (code: string, value: string) => {
    isInternalChangeRef.current = true
    setManualScore("") 
    setIsManualMode(false)
    setVector(prev => ({ ...prev, [code]: value }))
  }

  const getScoreColor = (s: number) => {
    if (s >= 9.0) return "text-severity-critical"
    if (s >= 7.0) return "text-severity-high"
    if (s >= 4.0) return "text-severity-medium"
    if (s > 0) return "text-severity-low"
    return "text-fg-muted"
  }

  const vectorString = generateVectorString(vector)

  return (
    <div className="space-y-4">
      {/* Header Sticky Card */}
      <div className="sticky top-0 z-10 bg-bg-subtle p-4 rounded-xl border border-border shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4 overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">CVSS 4.0 Vector String</h4>
                {isManualMode && (
                    <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-tighter">
                        Manual Override Active
                    </span>
                )}
              </div>
              <p className="text-[11px] text-fg-muted font-mono break-all leading-tight bg-bg/50 p-2 rounded-lg border border-border/50">
                  {vectorString}
              </p>
          </div>
          <div className="flex items-center gap-4 border-l border-border pl-6">
              <div className="flex flex-col items-end">
                  <label className="text-[9px] font-black text-fg-muted uppercase mb-1 tracking-tighter">
                    {isManualMode ? "Custom Score" : "Official Score"}
                  </label>
                  <div className="relative group">
                    <input 
                        type="number" 
                        step="0.1" 
                        min="0" 
                        max="10" 
                        value={manualScore || score.toFixed(1)}
                        onChange={(e) => handleManualScoreChange(e.target.value)}
                        className={cn(
                            "w-16 h-9 bg-bg border border-border rounded-lg text-center font-black text-lg focus:ring-primary/20 ring-offset-bg transition-colors",
                            isManualMode ? "border-amber-500/50 bg-amber-500/5" : getScoreColor(score)
                        )}
                    />
                    <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MousePointer2 className="h-3 w-3 text-amber-500" />
                    </div>
                  </div>
              </div>
          </div>
        </div>
      </div>

      {/* Metric Sections */}
      <div className="space-y-3">
          {METRIC_GROUPS.map((group) => {
              const isExpanded = expandedSections.has(group.id)
              return (
                  <div key={group.id} className="border border-border rounded-xl overflow-hidden bg-panel/50">
                      <button 
                        type="button"
                        onClick={() => toggleSection(group.id)}
                        className="w-full flex items-center justify-between p-3 bg-bg-subtle/50 hover:bg-bg-subtle transition-colors"
                      >
                          <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                {group.icon}
                              </span>
                              <span className="text-xs font-bold uppercase tracking-wide">{group.label}</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-fg-muted transition-transform duration-300", isExpanded && "rotate-180")} />
                      </button>

                      {isExpanded && (
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300">
                              {group.metrics.map((metric) => (
                                  <div key={metric.code} className="space-y-2">
                                      <label className="text-[10px] font-bold uppercase text-fg-muted flex items-center gap-1">
                                          {metric.label}
                                          <span className="text-[9px] font-mono opacity-50">[{metric.code}]</span>
                                      </label>
                                      <div className="flex flex-wrap gap-1">
                                          {metric.options.map((opt) => (
                                              <button
                                                  key={opt.value}
                                                  type="button"
                                                  onClick={() => handleMetricChange(metric.code, opt.value)}
                                                  title={'desc' in opt ? opt.desc : undefined}
                                                  className={cn(
                                                      "px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-all duration-200",
                                                      vector[metric.code] === opt.value
                                                          ? "bg-primary border-primary text-white shadow-sm ring-2 ring-primary/20"
                                                          : "bg-bg border-border text-fg-muted hover:border-primary/50 hover:bg-bg-subtle"
                                                  )}
                                              >
                                                  {opt.label}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )
          })}
      </div>

      <div className="bg-info/10 border border-info/20 p-3 rounded-xl flex items-start gap-3">
          <Info className="h-4 w-4 text-info mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11px] text-info-fg leading-relaxed font-bold">
                Z+ Intelligence Engine Active
            </p>
            <p className="text-[10px] text-info-fg/80 leading-relaxed">
                Official CVSS 4.0 math is enforced by default. To use a custom score (Quick Mode), 
                simply type directly into the score box. Typing a score will flag the finding 
                as "Manual Override" while preserving the vector state.
            </p>
          </div>
      </div>
    </div>
  )
}
