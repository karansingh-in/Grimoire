import { SecureStorage } from "@aparajita/capacitor-secure-storage"

const KEY_NAME = "grimoire-data-key"
const ENVELOPE_PREFIX = "grimoire-enc-v1:"

function bytesToB64(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function looksEncrypted(raw: string | null): boolean {
  return !!raw && raw.startsWith(ENVELOPE_PREFIX)
}

async function importKey(raw: string): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      "raw",
      b64ToBytes(raw),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    )
  } catch {
    return null
  }
}

export async function loadKey(): Promise<CryptoKey | null> {
  try {
    const raw = await SecureStorage.getItem(KEY_NAME)
    if (!raw) return null
    return await importKey(raw)
  } catch {
    return null
  }
}

/** Fetch the device key, creating and storing one on first use. */
export async function ensureKey(): Promise<CryptoKey> {
  const existing = await loadKey()
  if (existing) return existing
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  await SecureStorage.setItem(KEY_NAME, bytesToB64(bytes))
  const created = await loadKey()
  if (!created) throw new Error("The device keystore is unavailable.")
  return created
}

export async function dropKey(): Promise<void> {
  try {
    await SecureStorage.removeItem(KEY_NAME)
  } catch {
    // Best effort; an orphaned key without data is harmless.
  }
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${ENVELOPE_PREFIX}${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ciphertext))}`
}

export async function decryptText(
  key: CryptoKey,
  payload: string,
): Promise<string> {
  if (!looksEncrypted(payload)) throw new Error("Payload is not encrypted.")
  const [ivB64, ctB64] = payload.slice(ENVELOPE_PREFIX.length).split(".")
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ctB64),
  )
  return new TextDecoder().decode(plaintext)
}
