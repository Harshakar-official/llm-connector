"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Save } from "lucide-react"
import { createProject, updateProject } from "@/app/(dashboard)/projects/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

// ─── Z+ Client-side validation schema (mirrors server for instant feedback) ───
const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be under 200 characters"),
  description: z.string().max(5000, "Description must be under 5000 characters").optional().or(z.literal("")),
  project_type: z.enum(["web_app", "mobile_app", "api", "network", "cloud", "red_team", "thick_client"]),
  scope: z.string().max(5000, "Scope must be under 5000 characters").optional().or(z.literal("")),
  methodology: z.string().max(200, "Methodology must be under 200 characters").optional().or(z.literal("")),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date)
    }
    return true
  },
  { message: "End date must be on or after start date", path: ["end_date"] }
)

type LocalFormValues = z.infer<typeof projectSchema>

interface ProjectFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: {
    id: string
    name: string
    description: string | null
    project_type: string
    scope?: string | null
    methodology?: string | null
    start_date?: string | null
    end_date?: string | null
  } | null
  onSuccess?: () => void
}

const projectTypes = [
  { value: "web_app", label: "Web Application" },
  { value: "mobile_app", label: "Mobile Application" },
  { value: "api", label: "API" },
  { value: "network", label: "Network" },
  { value: "cloud", label: "Cloud" },
  { value: "red_team", label: "Red Team" },
  { value: "thick_client", label: "Thick Client" },
]

const methodologies = [
  { value: "owasp", label: "OWASP Testing Guide" },
  { value: "nist", label: "NIST SP 800-115" },
  { value: "ptes", label: "PTES" },
  { value: "custom", label: "Custom" },
]

export function ProjectForm({ open, onOpenChange, project, onSuccess }: ProjectFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<LocalFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
      project_type: "web_app",
      scope: "",
      methodology: "",
      start_date: "",
      end_date: "",
    },
  })

  // ─── Z+ FIX: Reset form when project changes ─────────
  useEffect(() => {
    if (open) {
      if (project) {
        form.reset({
          name: project.name || "",
          description: project.description || "",
          project_type: (project.project_type as LocalFormValues["project_type"]) || "web_app",
          scope: project.scope || "",
          methodology: project.methodology || "",
          start_date: project.start_date?.split("T")[0] || "",
          end_date: project.end_date?.split("T")[0] || "",
        })
      } else {
        form.reset({
          name: "",
          description: "",
          project_type: "web_app",
          scope: "",
          methodology: "",
          start_date: "",
          end_date: "",
        })
      }
    }
  }, [project, open, form])

  async function onSubmit(data: LocalFormValues) {
    setLoading(true)
    setError(null)

    try {
      const action = project
        ? updateProject({ ...data, id: project.id })
        : createProject(data)

      const result = await action

      if (result.success) {
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error || "Something went wrong")
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "Create New Project"}</DialogTitle>
          <DialogDescription>
            {project ? "Update project details" : "Fill in the details for your new security assessment project"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Acme Corp Web App" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the project..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="project_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="methodology"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Methodology</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select methodology" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {methodologies.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List domains, IPs, or components in scope..."
                      className="resize-none font-mono text-sm"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {project ? "Update" : "Create"} Project
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}