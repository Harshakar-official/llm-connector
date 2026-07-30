"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Settings,
  Shield,
  Zap,
  Gauge,
  Globe,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Mail,
  Key,
  Users,
  FolderKanban,
  Power,
  PowerOff,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  getPlatformSettingsAction,
  updatePlatformSettingAction,
  type PlatformSetting,
} from "@/lib/supabase/settings-actions"

// ─── Category definitions ──────────────────────────────────────────

interface SettingCategory {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const CATEGORIES: SettingCategory[] = [
  { id: "general", label: "General", icon: Globe, description: "Platform identity and maintenance settings" },
  { id: "security", label: "Security", icon: Shield, description: "Authentication and access control policies" },
  { id: "quotas", label: "Default Quotas", icon: Gauge, description: "Default resource limits for new organizations" },
  { id: "retention", label: "Data Retention", icon: Clock, description: "GDPR and storage management policies" },
]

// ─── Field definitions ─────────────────────────────────────────────

interface SettingField {
  key: string
  label: string
  description: string
  type: "text" | "email" | "number" | "boolean" | "textarea" | "select"
  category: string
  placeholder?: string
  min?: number
  max?: number
  options?: { label: string; value: string }[]
}

const SETTING_FIELDS: SettingField[] = [
  // General
  { key: "support_email", label: "Support Email", description: "Contact email for user support inquiries", type: "email", category: "general", placeholder: "support@vaptshield.com" },
  { key: "maintenance_mode", label: "Maintenance Mode", description: "Put the entire platform in maintenance mode", type: "boolean", category: "general" },
  { key: "maintenance_message", label: "Maintenance Message", description: "Message shown to users during maintenance", type: "textarea", category: "general", placeholder: "VAPTShield is currently undergoing scheduled maintenance..." },
  // Security
  { key: "self_registration_enabled", label: "Self Registration", description: "Allow new users to register themselves", type: "boolean", category: "security" },
  { key: "allowed_email_domains", label: "Allowed Email Domains", description: "Comma-separated list (e.g. acme.com). Empty allows all.", type: "textarea", category: "security", placeholder: "company.com, acme.org" },
  // Quotas
  { 
    key: "default_org_plan_tier", 
    label: "Default Plan Tier", 
    description: "Default tier for new organizations", 
    type: "select", 
    category: "quotas",
    options: [
        { label: "Starter", value: "starter" },
        { label: "Pro", value: "pro" },
        { label: "Enterprise", value: "enterprise" }
    ]
  },
  // Retention
  { key: "audit_log_retention_days", label: "Audit Log Retention", description: "Days to keep audit logs before purging", type: "number", category: "retention", min: 1, max: 3650, placeholder: "365" },
  { key: "notification_retention_days", label: "Notification Retention", description: "Days to keep in-app notifications", type: "number", category: "retention", min: 1, max: 365, placeholder: "30" },
]

// ─── Component ─────────────────────────────────────────────────────

export function SuperAdminSettingsClient() {
  const [settings, setSettings] = useState<PlatformSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // key being saved
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [activeCategory, setActiveCategory] = useState("general")

  // ── Fetch settings ──────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPlatformSettingsAction()
      if (result.success && result.settings) {
        setSettings(result.settings)
        // Initialize edit values
        const values: Record<string, string> = {}
        result.settings.forEach((s) => {
          values[s.key] = s.value
        })
        setEditValues(values)
        setValidationErrors({}) // Clear errors on load
      } else {
        setError(result.error || "Failed to load settings")
      }
    } catch {
      setError("Failed to load platform settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── Get setting value ───────────────────────────────────────────
  const getSettingValue = (key: string): string => {
    return editValues[key] ?? settings.find((s) => s.key === key)?.value ?? ""
  }

  // ── Validate Field ──────────────────────────────────────────────
  const validateField = (key: string, value: string): string | null => {
      const fieldDef = SETTING_FIELDS.find(f => f.key === key)
      if (!fieldDef) return null

      if (fieldDef.type === "number") {
          const num = parseInt(value, 10)
          if (isNaN(num)) return "Must be a valid number."
          if (fieldDef.min !== undefined && num < fieldDef.min) return `Must be at least ${fieldDef.min}.`
          if (fieldDef.max !== undefined && num > fieldDef.max) return `Must be no more than ${fieldDef.max}.`
      } else if (fieldDef.type === "email") {
          const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (value.trim() && !EMAIL_RE.test(value.trim())) {
              return "Invalid email address format."
          }
      }
      return null
  }

  // ── Handle value change ─────────────────────────────────────────
  const handleValueChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }))
    const errorMsg = validateField(key, value)
    setValidationErrors((prev) => ({
        ...prev,
        [key]: errorMsg || ""
    }))
  }

  // ── Handle boolean toggle ───────────────────────────────────────
  const handleBooleanToggle = async (key: string, currentValue: string) => {
    const newValue = currentValue === "true" ? "false" : "true"
    setEditValues((prev) => ({ ...prev, [key]: newValue }))
    // Clear validation error since toggle doesn't have custom validation rules
    setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
    })
    await saveSetting(key, newValue)
  }

  // ── Save setting ────────────────────────────────────────────────
  const saveSetting = async (key: string, value: string) => {
    // Prevent saving if there's a validation error
    if (validationErrors[key]) return

    setSaving(key)
    try {
      const result = await updatePlatformSettingAction(key, value)
      if (result.success && result.settings) {
        setSettings(result.settings)
        toast.success("Setting updated successfully")
      } else {
        toast.error(result.error || "Failed to update setting")
        // Revert edit value on failure
        const original = settings.find((s) => s.key === key)?.value ?? ""
        setEditValues((prev) => ({ ...prev, [key]: original }))
        setValidationErrors(prev => { const n = {...prev}; delete n[key]; return n; })
      }
    } catch {
      toast.error("Failed to update setting")
      const original = settings.find((s) => s.key === key)?.value ?? ""
      setEditValues((prev) => ({ ...prev, [key]: original }))
      setValidationErrors(prev => { const n = {...prev}; delete n[key]; return n; })
    } finally {
      setSaving(null)
    }
  }

  // ── Get last updated time ───────────────────────────────────────
  const getLastUpdated = (): string | null => {
    if (settings.length === 0) return null
    const timestamps = settings.map((s) => new Date(s.updated_at).getTime())
    const latest = new Date(Math.max(...timestamps))
    return latest.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // ── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-fg-muted mt-1">Configure global platform settings and preferences</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-fg-muted mt-1">Configure global platform settings and preferences</p>
        </div>
        <div className="bg-panel border border-border rounded-md p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">Failed to Load Settings</h2>
          <p className="text-sm text-fg-muted max-w-md mx-auto mb-4">{error}</p>
          <Button variant="outline" onClick={fetchSettings}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ── Filter fields by active category ────────────────────────────
  const activeFields = SETTING_FIELDS.filter((f) => f.category === activeCategory)
  const lastUpdated = getLastUpdated()

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-fg-muted mt-1">
            Configure global platform settings and preferences
          </p>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Clock className="h-3.5 w-3.5" />
            Last updated: {lastUpdated}
          </div>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 bg-bg-subtle p-1 rounded-md border border-border">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-colors flex-1 justify-center ${
              activeCategory === cat.id
                ? "bg-panel text-fg shadow-sm border border-border"
                : "text-fg-muted hover:text-fg hover:bg-panel-hover"
            }`}
          >
            <cat.icon className="h-4 w-4" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Category Description */}
      <div className="bg-panel border border-border rounded-md p-4">
        <div className="flex items-start gap-3">
          {(() => {
            const cat = CATEGORIES.find((c) => c.id === activeCategory)
            const Icon = cat?.icon || Settings
            return (
              <>
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary-bg shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-medium">{cat?.label} Settings</h3>
                  <p className="text-xs text-fg-muted mt-0.5">{cat?.description}</p>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Settings Fields */}
      <div className="space-y-4">
        {activeFields.map((field) => {
          const currentValue = getSettingValue(field.key)
          const isSaving = saving === field.key
          const settingMeta = settings.find((s) => s.key === field.key)

          return (
            <div
              key={field.key}
              className="bg-panel border border-border rounded-md p-5 hover:border-primary/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`setting-${field.key}`} className="text-sm font-medium cursor-pointer">
                      {field.label}
                    </Label>
                    {settingMeta && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {settingMeta.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted mt-1">{field.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {field.type === "boolean" ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`setting-${field.key}`}
                        checked={currentValue === "true"}
                        onCheckedChange={() => handleBooleanToggle(field.key, currentValue)}
                        disabled={isSaving}
                      />
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />}
                    </div>
                  ) : field.type === "textarea" ? (
                    <div className="flex flex-col items-end w-full max-w-md gap-1">
                      <div className="flex items-start gap-2 w-full">
                        <textarea
                          id={`setting-${field.key}`}
                          value={currentValue}
                          onChange={(e) => handleValueChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                          className="flex-1 min-h-[60px] w-full rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-fg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                          disabled={isSaving}
                        />
                        <Button
                          size="sm"
                          onClick={() => saveSetting(field.key, currentValue)}
                          disabled={isSaving || currentValue === (settingMeta?.value ?? "") || !!validationErrors[field.key]}
                          className="shrink-0"
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {validationErrors[field.key] && (
                          <span className="text-[10px] text-danger font-medium self-start">{validationErrors[field.key]}</span>
                      )}
                    </div>
                  ) : field.type === "select" ? (
                    <div className="flex items-center gap-2">
                        <Select
                            value={currentValue}
                            onValueChange={(val: string) => {
                                handleValueChange(field.key, val)
                                saveSetting(field.key, val)
                            }}
                        >
                            <SelectTrigger className="w-48 bg-bg border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-panel border-border text-fg">
                                {field.options?.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          id={`setting-${field.key}`}
                          type={field.type}
                          value={currentValue}
                          onChange={(e) => handleValueChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          min={field.min}
                          max={field.max}
                          className={`w-48 ${validationErrors[field.key] ? 'border-danger focus-visible:ring-danger/20' : ''}`}
                          disabled={isSaving}
                        />
                        <Button
                          size="sm"
                          onClick={() => saveSetting(field.key, currentValue)}
                          disabled={isSaving || currentValue === (settingMeta?.value ?? "") || !!validationErrors[field.key]}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {validationErrors[field.key] && (
                          <span className="text-[10px] text-danger font-medium self-start">{validationErrors[field.key]}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Current value indicator for non-boolean fields */}
              {field.type !== "boolean" && settingMeta && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  Current: <code className="bg-bg-subtle px-1.5 py-0.5 rounded text-xs">{settingMeta.value}</code>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty state for category */}
      {activeFields.length === 0 && (
        <div className="bg-panel border border-border rounded-md p-8 text-center">
          <Settings className="h-10 w-10 text-fg-muted mx-auto mb-3" />
          <p className="text-sm text-fg-muted">No settings available in this category.</p>
        </div>
      )}

      {/* Platform Status Summary */}
      <div className="bg-panel border border-border rounded-md p-5 shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-fg-muted">
          <Activity className="h-4 w-4 text-primary" />
          Platform Live Status
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            label="Maintenance"
            active={getSettingValue("maintenance_mode") === "true"}
            activeLabel="Mode: ON"
            inactiveLabel="Mode: OFF"
            activeColor="text-danger"
            inactiveColor="text-success"
          />
          <StatusCard
            label="Registrations"
            active={getSettingValue("self_registration_enabled") === "true"}
            activeLabel="Public: OPEN"
            inactiveLabel="Public: CLOSED"
            activeColor="text-success"
            inactiveColor="text-warning"
          />
          <StatusCard
            label="Default Tier"
            active={true}
            activeLabel={getSettingValue("default_org_plan_tier").toUpperCase()}
            inactiveLabel="N/A"
            activeColor="text-primary"
            inactiveColor="text-fg-muted"
          />
          <StatusCard
            label="Email Policy"
            active={getSettingValue("allowed_email_domains") !== ""}
            activeLabel="Restricted"
            inactiveLabel="Unrestricted"
            activeColor="text-success"
            inactiveColor="text-fg-muted"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Status Card Sub-component ─────────────────────────────────────

function StatusCard({
  label,
  active,
  activeLabel,
  inactiveLabel,
  activeColor,
  inactiveColor,
}: {
  label: string
  active: boolean
  activeLabel: string
  inactiveLabel: string
  activeColor: string
  inactiveColor: string
}) {
  return (
    <div className="bg-bg-subtle rounded-md p-3 text-center">
      <p className="text-xs text-fg-muted mb-1">{label}</p>
      <p className={`text-sm font-semibold ${active ? activeColor : inactiveColor}`}>
        {active ? activeLabel : inactiveLabel}
      </p>
    </div>
  )
}