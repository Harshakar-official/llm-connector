"use client"

import { FileText, Zap, ShieldCheck, MessageSquare, History, Info, Flag, Target, ExternalLink, Trash2, Users, RefreshCw } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { PoCViewer } from "@/components/findings/PoCViewer"
import { RemediationForm } from "@/components/findings/RemediationForm"
import { DiscussionThread } from "@/components/findings/DiscussionThread"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatRelativeTime, cn } from "@/lib/utils"

interface Props {
  activeTab: string
  onTabChange: (tab: string) => void
  finding: any
  comments: any[]
  activity: any[]
  userRole: string
  currentUserId: string
  currentUserProfile: any
  isLocked: boolean
  onRemediationSuccess: () => void
  members: any[]
}

export function FindingTabs({ 
  activeTab, 
  onTabChange, 
  finding, 
  comments, 
  activity, 
  userRole, 
  currentUserId, 
  currentUserProfile, 
  isLocked, 
  onRemediationSuccess,
  members
}: Props) {
  return (
    <div className="bg-panel border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col">
        <div className="px-6 border-b border-border bg-bg-subtle/30">
          <TabsList className="bg-transparent h-12 w-full justify-start gap-6 p-0">
            <TabsTrigger value="description" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 font-bold text-xs uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5 mr-2" /> Description
            </TabsTrigger>
            <TabsTrigger value="evidence" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 font-bold text-xs uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5 mr-2" /> Evidence
            </TabsTrigger>
            <TabsTrigger value="remediation" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Remediation
            </TabsTrigger>
            <TabsTrigger value="discussion" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Discussion
              {comments.length > 0 && (
                <span className="bg-primary/10 text-primary px-1.5 rounded-full text-[9px]">{comments.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 font-bold text-xs uppercase tracking-wider">
              <History className="h-3.5 w-3.5 mr-2" /> Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-8">
          <TabsContent value="description" className="m-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Detailed Analysis
              </h2>
              <div 
                className="prose prose-sm dark:prose-invert max-w-none text-fg-muted leading-relaxed"
                dangerouslySetInnerHTML={{ __html: finding.description }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              <div className="bg-bg-subtle/50 p-6 rounded-2xl border border-border/50 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Target className="h-4 w-4" /> Affected Target
                </h4>
                <code className="text-xs font-mono break-all block bg-bg p-3 rounded-xl border border-border">
                  {finding.endpoint_url || finding.affected_component || "General Application Logic"}
                </code>
              </div>
              <div className="bg-bg-subtle/50 p-6 rounded-2xl border border-border/50 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-severity-high flex items-center gap-2">
                  <Flag className="h-4 w-4" /> Business Impact
                </h4>
                <p className="text-sm text-fg-muted leading-relaxed">
                  {finding.impact || "Technical exploitation could lead to unauthorized access or data disclosure."}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="m-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="h-5 w-5 text-warning" />
                Proof of Reproducibility
              </h2>
              
              <div className="bg-bg-muted/30 p-6 rounded-2xl border border-border/50">
                <PoCViewer value={finding.proof_of_concept} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="remediation" className="m-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2 text-success">
                <ShieldCheck className="h-5 w-5" />
                Technical Remediation Plan
              </h2>
              <div 
                className="prose prose-sm dark:prose-invert max-w-none text-fg-muted border-l-4 border-l-success/30 pl-6 py-2"
                dangerouslySetInnerHTML={{ __html: finding.remediation || "<p>Consult standard OWASP guidelines for this vulnerability class.</p>" }}
              />
            </div>

            {['developer', 'admin', 'program_manager', 'security_engineer'].includes(userRole) && !isLocked && !['resolved', 'verified', 'closed'].includes(finding.status) && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                 <div className="mb-4 p-3 bg-primary/5 rounded-xl border border-primary/10 flex items-center gap-2">
                   <Zap className="h-4 w-4 text-primary animate-pulse" />
                   <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Active Remediation Phase</p>
                 </div>
                 <RemediationForm 
                    findingId={finding.id} 
                    version={finding.version} 
                    onSuccess={onRemediationSuccess}
                 />
              </div>
            )}

            {(finding.remediation_notes || finding.remediation_proof_url) && (
              <div className="space-y-4 pt-8 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                    <FileText className="h-5 w-5" />
                    Submitted Fix Archive
                  </h2>
                  {finding.status === 'resolved' && (
                    <Badge className="bg-success text-white border-none animate-pulse">Pending Verification</Badge>
                  )}
                </div>
                
                <div className="bg-bg-subtle/50 p-6 rounded-2xl border border-border/50 space-y-6">
                  {finding.remediation_notes && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-disabled">Developer Fix Documentation</h4>
                      <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed bg-bg/50 p-4 rounded-xl border border-border/30 italic">
                        "{finding.remediation_notes}"
                      </p>
                    </div>
                  )}
                  
                  {finding.remediation_proof_url && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-disabled">Evidence & Artifacts</h4>
                      <div className="flex flex-wrap gap-2">
                        {finding.remediation_proof_url.split(/[,\s\n]+/).filter(Boolean).map((url: string, i: number) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-bg hover:bg-bg-subtle border border-border px-4 py-2.5 rounded-xl text-xs font-bold text-primary transition-all shadow-sm hover:shadow-md group">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 group-hover:scale-110 transition-transform" />
                            {url.length > 50 ? url.substring(0, 47) + '...' : url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {finding.reference_links && finding.reference_links.length > 0 && (
              <div className="space-y-4 pt-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-fg-muted">External Resources</h4>
                <div className="flex flex-wrap gap-2">
                  {finding.reference_links.map((link: string, i: number) => (
                    <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-bg hover:bg-bg-subtle border border-border px-3 py-2 rounded-xl text-xs font-medium text-primary transition-all">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Reference #{i+1}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="discussion" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-panel rounded-2xl border border-border/50 p-6 shadow-sm">
              <DiscussionThread 
                vulnId={finding.id} 
                initialComments={comments} 
                currentUserId={currentUserId} 
                isLocked={isLocked}
                currentUserProfile={currentUserProfile}
              />
            </div>
          </TabsContent>

          <TabsContent value="activity" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {activity.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm text-fg-muted">No activity logs recorded for this finding.</p>
                </div>
              ) : (
                activity.map((entry) => {
                  const action = entry.action.toLowerCase()
                  
                  let Icon = History
                  let iconColor = "text-primary"
                  let bgSubtle = "bg-primary/5"

                  if (action.includes('created') || action.includes('found')) {
                    Icon = Target
                    iconColor = "text-chart-3"
                    bgSubtle = "bg-chart-3/5"
                  } else if (action.includes('assigned')) {
                    Icon = Users
                    iconColor = "text-warning"
                    bgSubtle = "bg-warning/5"
                  } else if (action.includes('remediated') || action.includes('resolved')) {
                    Icon = ShieldCheck
                    iconColor = "text-success"
                    bgSubtle = "bg-success/5"
                  } else if (action.includes('status_change')) {
                    Icon = RefreshCw
                    iconColor = "text-blue-500"
                    bgSubtle = "bg-blue-500/5"
                  } else if (action.includes('deleted')) {
                    Icon = Trash2
                    iconColor = "text-danger"
                    bgSubtle = "bg-danger/5"
                  }

                  return (
                    <div key={entry.id} className="relative group">
                      <div className={cn(
                        "absolute -left-[35px] top-0 h-6 w-6 rounded-full bg-bg border border-border flex items-center justify-center z-10 transition-transform group-hover:scale-110 shadow-sm",
                        iconColor
                      )}>
                        <Icon className="h-3 w-3" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-6 w-6 ring-1 ring-border">
                            <AvatarImage src={entry.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="text-[8px] bg-bg-muted">{entry.profiles?.full_name?.slice(0, 2).toUpperCase() || "SY"}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <p className="text-xs font-bold text-fg leading-none">
                              {entry.profiles?.full_name || "System Automation"}
                            </p>
                            <span className="text-[10px] text-fg-disabled font-medium mt-0.5">
                              {formatRelativeTime(entry.created_at)}
                            </span>
                          </div>
                          
                          <Badge variant="outline" className={cn("ml-auto text-[9px] uppercase font-black tracking-widest h-5 px-1.5", bgSubtle, iconColor, "border-none")}>
                            {entry.action.replace(/_/g, " ").replace(/\./g, " ")}
                          </Badge>
                        </div>

                        {entry.new_value != null && (
                          <div className="ml-9 p-3 rounded-xl bg-bg-subtle/50 border border-border/40 text-[11px] text-fg-muted space-y-1 animate-in slide-in-from-left-1 duration-300">
                            {entry.action === 'finding.assigned' ? (
                              <p className="font-medium text-fg">
                                Assigned task to: <span className="text-warning font-black uppercase tracking-tighter">{members.find(m => m.id === entry.new_value?.assigned_to)?.full_name || 'Team Member'}</span>
                              </p>
                            ) : Object.entries(entry.new_value).map(([key, val]) => (
                              <div key={key} className="flex items-start gap-2">
                                <span className="font-bold uppercase text-[9px] text-fg-disabled min-w-[60px] pt-0.5">{key}:</span>
                                <span className={cn(
                                  "font-medium",
                                  key === 'status' && "text-primary font-black uppercase tracking-tight"
                                )}>
                                  {String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
