import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY environment variable is required for AES-256-GCM encryption")
  }
  const key = Buffer.from(keyHex, "hex")
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes / 256 bits)")
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format")
  }
  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

const ENC_PREFIX = "enc:"

/**
 * Encrypt a JSON-serializable value (object/array/string) into a prefixed
 * ciphertext string. Returns null/undefined unchanged so optional fields stay empty.
 * The `enc:` prefix lets readers distinguish encrypted values from legacy plaintext.
 */
export function encryptJson(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value as null | undefined
  return ENC_PREFIX + encrypt(JSON.stringify(value))
}

/**
 * Decrypt a value produced by encryptJson back to its original object/array/string.
 * Passes through null/undefined and legacy plaintext (no `enc:` prefix) unchanged
 * so existing unencrypted rows keep working.
 */
export function decryptJson<T = unknown>(value: unknown): T | null | undefined {
  if (value === null || value === undefined) return value as null | undefined
  if (typeof value !== "string" || !value.startsWith(ENC_PREFIX)) return value as T
  try {
    return JSON.parse(decrypt(value.slice(ENC_PREFIX.length))) as T
  } catch {
    return value as T
  }
}
