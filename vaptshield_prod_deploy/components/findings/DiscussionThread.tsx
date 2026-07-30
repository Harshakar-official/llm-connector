"use client"

import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Send, MessageSquare, Loader2, Edit2, Trash2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form"
import { toast } from "sonner"
import { addComment, editComment, deleteComment } from "@/app/(dashboard)/findings/comment-actions"
import { formatRelativeTime, cn } from "@/lib/utils"
import { useSounds } from "@/lib/hooks/useSounds"
import { getBrowserClient } from "@/lib/supabase/client"

const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(2000, "Comment is too long"),
})

interface Comment {
  id: string
  content: string
  created_at: string
  author_id: string
  is_edited: boolean
  isOptimistic?: boolean // New: for UI feedback
  profiles?: {
    full_name: string
    avatar_url: string | null
    role: string
  }
}

interface DiscussionThreadProps {
  vulnId: string
  initialComments: Comment[]
  currentUserId: string
  isLocked: boolean
  currentUserProfile?: {
      full_name: string
      avatar_url: string | null
      role: string
  }
}

// Lightweight URL parser to make links clickable
const parseLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors break-all">{part}</a>;
    }
    return part;
  });
};

export function DiscussionThread({ vulnId, initialComments, currentUserId, isLocked, currentUserProfile }: DiscussionThreadProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [now, setNow] = useState(new Date())
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  
  const { playSound } = useSounds()
  const supabase = getBrowserClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Timer to update the "now" state every 30 seconds to recalculate edit/delete visibility
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // Supabase Realtime Subscription for Live Updates, Presence & Broadcast
  useEffect(() => {
    channelRef.current = supabase.channel(`comments-${vulnId}`, {
        config: { presence: { key: currentUserId }, broadcast: { self: true } },
    })

    channelRef.current
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vuln_comments', filter: `vuln_id=eq.${vulnId}` },
        async (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setComments((prev) => {
              const exists = prev.find(c => c.id === payload.new.id)
              if (exists) {
                  // Replace with real data from DB event
                  return prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new, isOptimistic: false } : c)
              }
              
              // Fallback: Reconcile with optimistic local state
              const myOptimistic = prev.find(c => c.isOptimistic && c.author_id === payload.new.author_id && c.content === payload.new.content)
              if (myOptimistic) {
                  return prev.map(c => c.id === myOptimistic.id ? { ...c, ...payload.new, isOptimistic: false } : c)
              }

              // New comment from someone else (if broadcast was missed)
              return [...prev, { ...payload.new, isOptimistic: false }]
            })

            // Async fetch profile if missing
            const targetId = payload.new.id
            const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url, role').eq('id', payload.new.author_id).single()
            if (profile) {
                setComments(prev => prev.map(c => c.id === targetId ? { ...c, profiles: profile } : c))
            }
            
            // Play sound for incoming message if it's not from me
            if (payload.new.author_id !== currentUserId) {
                playSound('notification')
            }
          } else if (payload.eventType === 'UPDATE') {
            setComments((prev) => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c))
          } else if (payload.eventType === 'DELETE') {
            setComments((prev) => prev.filter(c => c.id !== payload.old.id))
          }
        }
      )
      .on('broadcast', { event: 'new-message' }, (payload: any) => {
          // Fast-path for UI sync (WhatsApp speed)
          if (payload.payload.author_id !== currentUserId) {
              setComments(prev => {
                  const exists = prev.find(c => c.id === payload.payload.id)
                  if (exists) return prev
                  return [...prev, { ...payload.payload, isOptimistic: false }]
              })
              playSound('notification')
          }
      })
      .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current.presenceState()
          const typing = []
          for (const key of Object.keys(state)) {
              if (key !== currentUserId && (state[key][0] as any)?.isTyping) {
                  typing.push("Someone")
              }
          }
          setTypingUsers(typing)
      })
      .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
              await channelRef.current.track({ isTyping: false })
          }
      })

    return () => {
      if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
      }
    }
  }, [vulnId, supabase, currentUserId, playSound])

  const handleTyping = async () => {
      if (!channelRef.current) return
      await channelRef.current.track({ isTyping: true })
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(async () => {
          if (channelRef.current) {
              await channelRef.current.track({ isTyping: false })
          }
      }, 2000)
  }

  // Auto-scroll to bottom on new comments
  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
  }, [comments])


  const form = useForm<z.infer<typeof commentSchema>>({
    resolver: zodResolver(commentSchema),
    defaultValues: { content: "" },
  })

  async function onSubmit(data: z.infer<typeof commentSchema>) {
    if (isLocked) {
      toast.error("Project is locked. Cannot add new comments.")
      return
    }

    const content = data.content.trim()
    if (!content) return

    setIsSubmitting(true)
    
    // ─── OPTIMISTIC UPDATE ───
    const tempId = crypto.randomUUID()
    const optimisticComment: Comment = {
        id: tempId,
        content: content,
        author_id: currentUserId,
        created_at: new Date().toISOString(),
        is_edited: false,
        isOptimistic: true,
        profiles: currentUserProfile ? {
            full_name: currentUserProfile.full_name,
            avatar_url: currentUserProfile.avatar_url,
            role: currentUserProfile.role
        } : undefined
    }
    
    setComments(prev => [...prev, optimisticComment])
    form.reset()
    playSound('success')

    try {
      const result = await addComment({ vuln_id: vulnId, content: content })
      if (result.success && result.data) {
        const finalComment = {
            ...result.data,
            isOptimistic: false,
            profiles: currentUserProfile ? {
                full_name: currentUserProfile.full_name,
                avatar_url: currentUserProfile.avatar_url,
                role: currentUserProfile.role
            } : undefined
        }
        
        // 1. Reconcile optimistic ID with Real ID locally
        setComments(prev => prev.map(c => c.id === tempId ? finalComment : c))

        // 2. BROADCAST to others instantly (WhatsApp speed)
        channelRef.current.send({
            type: 'broadcast',
            event: 'new-message',
            payload: finalComment
        })
      } else if (!result.success) {
        toast.error(result.error || "Failed to post comment")
        // Rollback optimistic update on failure
        setComments(prev => prev.filter(c => c.id !== tempId))
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      setComments(prev => prev.filter(c => c.id !== tempId))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditSubmit = async (commentId: string) => {
      const newContent = editContent.trim()
      if (!newContent) return
      
      const originalComment = comments.find(c => c.id === commentId)
      if (!originalComment) return

      // Optimistic Edit
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent, is_edited: true } : c))
      setEditingId(null)

      try {
          const result = await editComment({ comment_id: commentId, content: newContent, vuln_id: vulnId })
          if (!result.success) {
              toast.error(result.error)
              // Rollback
              setComments(prev => prev.map(c => c.id === commentId ? originalComment : c))
          }
      } catch (error) {
          toast.error("Failed to edit comment")
          setComments(prev => prev.map(c => c.id === commentId ? originalComment : c))
      }
  }

  const handleDelete = async (commentId: string) => {
      const originalComments = [...comments]
      
      // Optimistic Delete
      setComments(prev => prev.filter(c => c.id !== commentId))

      try {
          const result = await deleteComment(commentId, vulnId)
          if (!result.success) {
              toast.error(result.error)
              // Rollback
              setComments(originalComments)
          } else {
              toast.success("Comment deleted")
          }
      } catch (error) {
          toast.error("Failed to delete comment")
          setComments(originalComments)
      }
  }

  return (
    <div className="space-y-4 flex flex-col h-[600px] animate-in fade-in duration-500 overflow-visible">
      <h2 className="text-xl font-bold flex items-center gap-2 shrink-0">
        <MessageSquare className="h-5 w-5 text-primary" />
        Discussion Thread
      </h2>

      <div className="flex-1 overflow-y-auto overflow-x-visible pr-4 space-y-6 scrollbar-thin" ref={scrollRef}>
        {comments.length === 0 ? (
          <div className="text-center py-12 bg-bg-muted/30 rounded-2xl border border-border/50 h-full flex flex-col items-center justify-center border-dashed">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 text-fg-disabled opacity-20" />
            <p className="text-sm text-fg-muted italic">No comments yet. Be the first to start the discussion!</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {comments.map((comment) => {
              const isMe = comment.author_id === currentUserId
              const ageInSeconds = (now.getTime() - new Date(comment.created_at).getTime()) / 1000
              const canEdit = isMe && ageInSeconds < 120 && !isLocked && !comment.isOptimistic

              return (
                <div key={comment.id} className={cn(
                    "flex gap-3 group animate-in slide-in-from-bottom-2 duration-300",
                    isMe ? 'flex-row-reverse' : '',
                    comment.isOptimistic && "opacity-50"
                )}>
                  <Avatar className="h-8 w-8 shrink-0 border border-border shadow-sm">
                    <AvatarImage src={comment.profiles?.avatar_url || ""} />
                    <AvatarFallback className="text-[10px] bg-bg-subtle text-fg-muted font-bold">
                      {comment.profiles?.full_name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div className="flex items-baseline gap-2 mb-1 px-1">
                      <span className="text-[11px] font-bold text-fg">{comment.profiles?.full_name || "Loading..."}</span>
                      <span className="text-[9px] text-fg-disabled font-medium uppercase tracking-tighter">{formatRelativeTime(comment.created_at)}</span>
                    </div>

                    {editingId === comment.id ? (
                        <div className="flex items-end gap-2 w-full min-w-[280px] animate-in zoom-in-95 duration-200">
                            <Textarea 
                                value={editContent} 
                                onChange={(e) => setEditContent(e.target.value)}
                                className="min-h-[80px] text-sm bg-bg border-primary/50 focus-visible:ring-primary/20 rounded-xl shadow-inner"
                                autoFocus
                            />
                            <div className="flex flex-col gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-success hover:bg-success/10 rounded-full" onClick={() => handleEditSubmit(comment.id)}>
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-fg-disabled hover:bg-bg-subtle rounded-full" onClick={() => setEditingId(null)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="relative group/bubble w-full">
                            <div className={cn(
                                "p-3 rounded-2xl text-sm shadow-sm transition-all",
                                isMe 
                                    ? 'bg-primary text-primary-fg rounded-tr-none' 
                                    : 'bg-panel border border-border rounded-tl-none text-fg hover:border-border/80'
                            )}>
                                <div className="whitespace-pre-wrap break-words leading-relaxed">{parseLinks(comment.content)}</div>
                                {comment.is_edited && <span className={cn("text-[8px] mt-1 block italic text-right opacity-50", isMe ? "text-primary-fg" : "text-fg-muted")}>(edited)</span>}
                            </div>
                            
                            {/* Action Menu (Visible on Hover within 2 mins) */}
                            {canEdit && (
                                <div className={cn(
                                    "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-all flex items-center gap-0.5 bg-panel border border-border rounded-lg shadow-xl p-0.5 z-10",
                                    isMe ? '-left-10' : '-right-10'
                                )}>
                                    <button 
                                        onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                                        className="p-1.5 text-fg-muted hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                                        title="Edit (2 min window)"
                                    >
                                        <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(comment.id)}
                                        className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger/5 rounded-md transition-colors"
                                        title="Delete (2 min window)"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Realtime Typing Indicator */}
            {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-fg-disabled italic animate-in slide-in-from-left-2 duration-300 px-2 py-1">
                    <div className="flex gap-0.5 items-center">
                        <div className="h-1 w-1 bg-primary rounded-full animate-bounce" />
                        <div className="h-1 w-1 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="h-1 w-1 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span>Someone is typing...</span>
                </div>
            )}
          </div>
        )}
      </div>

      {!isLocked && (
        <div className="pt-4 border-t border-border/50 shrink-0 bg-panel/50 backdrop-blur-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-3">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Textarea 
                        placeholder="Type a message or share a link..." 
                        className="min-h-[80px] resize-none bg-bg border-border text-sm rounded-2xl focus-visible:ring-primary/20 shadow-inner"
                        disabled={isSubmitting}
                        onKeyDown={(e) => {
                            handleTyping()
                            // Quick send on Cmd/Ctrl + Enter
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault()
                                form.handleSubmit(onSubmit)()
                            }
                        }}
                        {...field} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={isSubmitting || !form.watch("content").trim()}
                className="h-[80px] w-[80px] rounded-2xl flex flex-col items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-fg shadow-lg shadow-primary/20 transition-all active:scale-[0.95]"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5 rotate-[-15deg] transition-transform group-hover:rotate-0" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em]">Send</span>
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  )
}
