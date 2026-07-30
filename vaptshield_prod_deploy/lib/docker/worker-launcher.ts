export async function ensureWorkerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${process.env.DOCKER_HOST_API_URL || ""}/health`, {
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timeout)
    if (res.ok) return true
  } catch {}
  return false
}
