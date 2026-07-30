import { createGroq } from '@ai-sdk/groq'
import { Groq } from 'groq-sdk'

// ─── Z+ SECURITY: Groq Client Initialization ───
// We use lazy initialization to prevent build-time crashes when env vars are missing.

export const getGroqSDK = () => {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured")
  return createGroq({ apiKey })
}

let groqRawInstance: Groq | null = null
export const getGroqRaw = () => {
  if (!groqRawInstance) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error("GROQ_API_KEY is not configured")
    groqRawInstance = new Groq({ apiKey })
  }
  return groqRawInstance
}

export const DEFAULT_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile'
