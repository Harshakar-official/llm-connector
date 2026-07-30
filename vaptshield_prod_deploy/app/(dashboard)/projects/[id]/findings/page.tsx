export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectFindingsRedirectPage({ params }: PageProps) {
  const { id } = await params
  // Consolidate UI: Redirect to the main project page with the findings tab pre-selected
  redirect(`/projects/${id}?tab=findings`)
}
