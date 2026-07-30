export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getSafeSession } from "@/lib/utils/security-guard"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectScannerPage({ params }: Props) {
  const { id: projectId } = await params
  const { orgId, error } = await getSafeSession()

  if (error || !orgId) redirect("/login")

  // Redirect to the unified CI/CD Scanner page with project pre-selected
  redirect(`/scanner/cicd?projectId=${projectId}`)
}
