"use client"

import { useState } from "react"
import { Bell, CheckCheck, Inbox, ExternalLink, Clock, Trash2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatRelativeTime } from "@/lib/utils"
import { markAsRead, markAllAsRead, deleteNotification } from "@/lib/supabase/notification-actions"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Notification {
    id: string
    title: string
    message: string
    type: string
    is_read: boolean
    link: string | null
    created_at: string
}

export default function NotificationsPageClient({ initialNotifications }: { initialNotifications: Notification[] }) {
    const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
    const router = useRouter()

    const handleMarkRead = async (id: string, link: string | null) => {
        await markAsRead(id)
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
        if (link) {
            router.push(link)
        }
    }

    const handleMarkAllRead = async () => {
        const result = await markAllAsRead()
        if (result.success) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            toast.success("All notifications marked as read")
        }
    }

    const handleDelete = async (id: string) => {
        const result = await deleteNotification(id)
        if (result.success) {
            setNotifications(prev => prev.filter(n => n.id !== id))
            toast.success("Notification deleted")
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-panel border border-border p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                        <Bell className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-fg">Status: {notifications.filter(n => !n.is_read).length} Unread</p>
                        <p className="text-[10px] text-fg-muted uppercase tracking-widest font-black">Account Security alerts</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleMarkAllRead}
                        disabled={notifications.every(n => n.is_read)}
                        className="h-9 px-4 rounded-xl text-xs font-bold border-border hover:bg-bg-subtle"
                    >
                        <CheckCheck className="h-3.5 w-3.5 mr-2" />
                        Mark all as read
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {notifications.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center bg-panel border border-border rounded-3xl border-dashed">
                        <div className="h-16 w-16 rounded-full bg-bg-subtle flex items-center justify-center mb-4">
                            <Inbox className="h-8 w-8 text-fg-disabled opacity-20" />
                        </div>
                        <h3 className="text-lg font-bold text-fg">No notifications</h3>
                        <p className="text-sm text-fg-muted">We'll let you know when something important happens.</p>
                    </div>
                ) : (
                    notifications.map((n) => (
                        <div 
                            key={n.id}
                            className={cn(
                                "group relative bg-panel border rounded-2xl p-5 transition-all hover:shadow-md flex gap-4 items-start",
                                !n.is_read ? "border-primary/30 ring-1 ring-primary/5 shadow-sm" : "border-border/50 opacity-80"
                            )}
                        >
                            <div className={cn(
                                "h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-2",
                                !n.is_read ? "bg-primary/5 border-primary/20 text-primary" : "bg-bg-subtle border-border text-fg-disabled"
                            )}>
                                {n.type.includes('critical') ? <ShieldAlert className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className={cn("text-sm font-bold truncate", !n.is_read ? "text-fg" : "text-fg-muted")}>
                                        {n.title}
                                    </h4>
                                    <div className="flex items-center gap-1 text-[10px] text-fg-disabled font-mono shrink-0">
                                        <Clock className="h-3 w-3" />
                                        {formatRelativeTime(n.created_at)}
                                    </div>
                                </div>
                                <p className="text-sm text-fg-muted leading-relaxed">
                                    {n.message}
                                </p>
                                
                                <div className="pt-3 flex items-center gap-3">
                                    {n.link && (
                                        <Button 
                                            size="sm" 
                                            variant="secondary" 
                                            className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-none"
                                            onClick={() => handleMarkRead(n.id, n.link)}
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            View Action
                                        </Button>
                                    )}
                                    {!n.is_read && (
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-8 rounded-lg text-[10px] font-bold text-fg-muted hover:text-fg"
                                            onClick={() => handleMarkRead(n.id, null)}
                                        >
                                            Mark as read
                                        </Button>
                                    )}
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="h-8 w-8 p-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-fg-disabled hover:text-danger hover:bg-danger/5 rounded-full"
                                        onClick={() => handleDelete(n.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
