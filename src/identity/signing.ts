import { base64url, base64urlToBytes } from "./keypair"

function getSubtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto
  if (c?.subtle) return c.subtle
  throw new Error("WebCrypto not available")
}

/**
 * Canonical message — mirrors cumments_core::identity::signature_message.
 * JSON array, null for absent, string for present.
 */
export function signatureMessage(parts: (string | null | undefined)[]): string {
  return JSON.stringify(parts.map((v) => (v === null || v === undefined ? null : String(v))))
}

export async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const subtle = getSubtle()
  return subtle.importKey(
    "pkcs8",
    base64urlToBytes(privateKeyB64) as unknown as BufferSource,
    { name: "Ed25519" } as Algorithm,
    false,
    ["sign"],
  )
}

export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  const subtle = getSubtle()
  return subtle.importKey(
    "raw",
    base64urlToBytes(publicKeyB64) as unknown as BufferSource,
    { name: "Ed25519" } as Algorithm,
    false,
    ["verify"],
  )
}

export async function signMessage(privateKeyB64: string, message: string): Promise<string> {
  const key = await importPrivateKey(privateKeyB64)
  const sig = await getSubtle().sign(
    { name: "Ed25519" } as Algorithm,
    key,
    new TextEncoder().encode(message) as unknown as BufferSource,
  )
  return base64url(new Uint8Array(sig))
}

export async function verifySignature(
  publicKeyB64: string,
  message: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicKeyB64)
    const sig = base64urlToBytes(signatureB64) as unknown as BufferSource
    return await getSubtle().verify(
      { name: "Ed25519" } as Algorithm,
      key,
      sig,
      new TextEncoder().encode(message) as unknown as BufferSource,
    )
  } catch {
    return false
  }
}

export function postSignatureMessage(
  siteId: string,
  pageSlug: string,
  content: string,
  replyTo: string | null,
  threadRoot: string | null,
  challenge: string,
): string {
  return signatureMessage(["POST", siteId, pageSlug, content, replyTo, threadRoot, challenge, "1"])
}

export function locateSignatureMessage(
  siteId: string,
  pageSlug: string,
  geoUri: string,
  replyTo: string | null,
  threadRoot: string | null,
  challenge: string,
): string {
  return signatureMessage(["LOCATE", siteId, pageSlug, geoUri, replyTo, threadRoot, challenge, "1"])
}
