export function sanitizeError(e: unknown): string {
  let msg: string
  if (e instanceof Error) msg = e.message
  else if (typeof e === "string") msg = e
  else {
    try { msg = JSON.stringify(e) } catch { return "An unexpected error occurred" }
  }

  // Strip potential sensitive patterns before returning
  msg = msg.slice(0, 500)

  // Remove file paths (Unix + Windows)
  msg = msg.replace(/\/[^\s:]{3,}\/[^\s:]+/g, "<path>")
  msg = msg.replace(/[A-Za-z]:\\[^\s]+/g, "<path>")

  // Remove IP addresses (internal only to be safe)
  msg = msg.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<ip>")

  // Remove SQL-like syntax noise
  msg = msg.replace(/\b(relation|column|table|schema)\s+"[^"]+"/gi, "$1")

  // Remove any base64-ish strings (potential tokens)
  msg = msg.replace(/[A-Za-z0-9+/=]{40,}/g, "<token>")

  // Remove email addresses
  msg = msg.replace(/[^\s]+@[^\s]+/g, "<email>")

  if (msg.length === 0) return "An unexpected error occurred"
  return msg
}
