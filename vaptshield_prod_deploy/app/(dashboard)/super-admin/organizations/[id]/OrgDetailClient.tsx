"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Building, Shield, UserPlus, ListTodo, Wrench, Users, ExternalLink, Mail, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InviteOrgAdminModal } from "@/components/super-admin/organizations/InviteOrgAdminModal"
import { OrgManagement } from "@/components/super-admin/organizations/OrgManagement"
import { OrgAuditLogs } from "@/components/super-admin/organizations/OrgAuditLogs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Organization {
  id: string
  name: string
  slug: string
  industry: string | null
  website: string | null
  is_active: boolean
  suspended_reason: string | null
  created_at: string
}

interface OrgQuotas {
  max_users: number
  max_projects: number
  max_docker_containers: number
  active_docker_containers: number
  paid_extra_docker: number
  max_ci_scans_per_day: number
  ci_scans_today: number
  storage_limit_gb: number
  storage_used_gb: number
  plan_tier: string
}

interface Props {
  org: Organization
  quotas: OrgQuotas | null
  userCount: number
  projectCount: number
  members: any[]
}

export function OrgDetailClient({ org, quotas, userCount, projectCount, members }: Props) {
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"overview" | "management" | "logs" | "members">("overview")

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/super-admin/organizations">
          <Button variant="ghost" size="sm" className="rounded-xl border-border">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Organizations
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-black tracking-tighter text-fg flex items-center gap-3 uppercase italic">
            <Building className="h-7 w-7 text-primary" />
            {org.name}
          </h1>
          <p className="text-sm text-fg-muted font-medium">Internal platform control for this entity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl border-border font-bold uppercase text-xs tracking-tighter" onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Admin
          </Button>
        </div>
      </div>

      {/* Tabs Control */}
      <div className="flex gap-1 bg-bg-subtle p-1 rounded-xl border border-border w-fit">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-lg ${activeTab === 'overview' ? 'bg-panel text-primary shadow-sm border border-border' : 'text-fg-muted hover:text-fg'}`}
          >
              Overview
          </button>
          <button 
            onClick={() => setActiveTab("management")}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-lg flex items-center gap-2 ${activeTab === 'management' ? 'bg-panel text-primary shadow-sm border border-border' : 'text-fg-muted hover:text-fg'}`}
          >
              <Wrench className="h-3.5 w-3.5" /> Management
          </button>
          <button 
            onClick={() => setActiveTab("members")}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-lg flex items-center gap-2 ${activeTab === 'members' ? 'bg-panel text-primary shadow-sm border border-border' : 'text-fg-muted hover:text-fg'}`}
          >
              <Users className="h-3.5 w-3.5" /> Members
          </button>
          <button 
            onClick={() => setActiveTab("logs")}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-lg flex items-center gap-2 ${activeTab === 'logs' ? 'bg-panel text-primary shadow-sm border border-border' : 'text-fg-muted hover:text-fg'}`}
          >
              <ListTodo className="h-3.5 w-3.5" /> Audit Trail
          </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Banner */}
            <div className={`p-4 rounded-xl border ${
                org.is_active
                ? "bg-success/5 border-success/20"
                : "bg-danger/5 border-danger/20"
            }`}>
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${org.is_active ? 'bg-success' : 'bg-danger'}`} />
                    <span className={`text-xs font-black uppercase tracking-widest ${
                    org.is_active ? "text-success" : "text-danger"
                    }`}>
                    Status: {org.is_active ? "Operational" : "Suspended"}
                    </span>
                </div>
                {!org.is_active && org.suspended_reason && (
                <p className="text-xs text-danger/80 mt-1 font-medium ml-4">Reason: {org.suspended_reason}</p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-fg">
                {/* Basic Info */}
                <div className="lg:col-span-2 bg-panel border border-border rounded-xl p-6 shadow-sm">
                    <h2 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-6">Identity & Registry</h2>
                    <div className="grid grid-cols-2 gap-8 text-sm">
                        <div className="space-y-1">
                            <span className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Global Slug</span>
                            <p className="font-mono text-fg bg-bg-subtle px-2 py-1 rounded w-fit">{org.slug}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Industry Vertical</span>
                            <p className="text-fg font-bold">{org.industry || "—"}</p>
                        </div>
                        <div className="col-span-2 space-y-1">
                            <span className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">External Domain</span>
                            <p className="text-fg font-medium underline underline-offset-4 decoration-primary/20">{org.website || "—"}</p>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="bg-panel border border-border rounded-xl p-6 shadow-sm flex flex-col justify-center text-center space-y-4">
                    <div className="space-y-1">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Member Occupancy</p>
                        <p className="text-4xl font-black font-mono tracking-tighter text-fg">
                            {userCount}
                        </p>
                    </div>
                    <div className="h-px bg-border/50 w-12 mx-auto" />
                    <div className="space-y-1">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Total Projects</p>
                        <p className="text-4xl font-black font-mono tracking-tighter text-fg">
                            {projectCount}
                        </p>
                    </div>
                </div>
            </div>

            {/* Quota Usage */}
            <div className="bg-panel border border-border rounded-xl p-6 shadow-sm text-fg">
                <h2 className="text-xs font-black uppercase tracking-widest text-fg-muted mb-6 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    Entitlement Quotas & Provisioning
                </h2>
                {quotas ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Current Tier</p>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black uppercase italic px-3 py-1">
                            {quotas.plan_tier}
                        </Badge>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">User Limit</p>
                        <p className="text-xl font-bold font-mono text-fg">{quotas.max_users.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Project Limit</p>
                        <p className="text-xl font-bold font-mono text-fg">{quotas.max_projects.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Storage Pool</p>
                        <p className="text-xl font-bold font-mono text-fg">{quotas.storage_limit_gb} GB</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Docker Slots</p>
                        <p className="text-xl font-bold font-mono text-fg">{quotas.max_docker_containers}</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-fg-disabled uppercase font-black tracking-widest">Max Scans / Month</p>
                        <p className="text-xl font-bold font-mono text-fg">3,000</p>
                    </div>
                </div>
                ) : (
                <div className="py-12 text-center border border-dashed border-border rounded-xl">
                    <p className="text-sm text-fg-muted italic text-center">No provisioned quotas found for this organization.</p>
                </div>
                )}
            </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-fg">
                        <Users className="h-4 w-4 text-fg-muted" />
                        <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">Organization Members</h3>
                    </div>
                    <Link href={`/super-admin/users?org=${org.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-primary hover:bg-primary/10">
                            Advanced Management <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-bg-subtle/50 border-b border-border text-[10px] font-black uppercase tracking-widest text-fg-muted">
                            <tr>
                                <th className="px-6 py-3 text-left">Identity</th>
                                <th className="px-6 py-3 text-left">Role</th>
                                <th className="px-6 py-3 text-left">Account Status</th>
                                <th className="px-6 py-3 text-left">Last Activity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-fg">
                            {members.map((member) => (
                                <tr key={member.id} className="hover:bg-panel-hover transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-border shadow-sm">
                                                <AvatarImage src={member.avatar_url || ""} />
                                                <AvatarFallback className="bg-bg-subtle text-fg-muted text-xs font-bold">
                                                    {member.full_name?.slice(0, 2).toUpperCase() || "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-fg">{member.full_name || "Unidentified"}</span>
                                                <span className="text-xs text-fg-muted font-mono flex items-center gap-1">
                                                    <Mail className="h-3 w-3 opacity-50" /> {member.email}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tighter bg-bg border-border text-fg">
                                            {member.role.replace('_', ' ')}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4">
                                        {member.is_active ? (
                                            <Badge className="bg-success/10 text-success border-success/20 text-[9px] font-black uppercase">Active</Badge>
                                        ) : (
                                            <Badge className="bg-danger/10 text-danger border-danger/20 text-[9px] font-black uppercase">Suspended</Badge>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                                            <Clock className="h-3.5 w-3.5 opacity-50" />
                                            {member.last_seen ? new Date(member.last_seen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "Never"}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {members.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-fg-muted italic text-sm">
                                        No registered members found for this organization.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {activeTab === "management" && (
          <div className="animate-in slide-in-from-bottom-2 duration-500">
            <OrgManagement org={org} quotas={quotas} />
          </div>
      )}

      {activeTab === "logs" && (
          <div className="animate-in fade-in duration-500">
            <OrgAuditLogs orgId={org.id} />
          </div>
      )}

      <InviteOrgAdminModal
        isOpen={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        orgId={org.id}
        orgName={org.name}
      />
    </div>
  )
}
