/**
 * Browser Ed25519 keypair — faithful to misc/demo.
 * Public key is base64url raw 32B, private key is base64url PKCS#8 48B DER.
 */

export interface Identity {
  publicKey: string
  privateKey: string
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto
  if (c?.subtle) return c.subtle
  throw new Error("WebCrypto not available")
}

export function base64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function generateRandomIdentity(): Promise<Identity> {
  const subtle = getSubtle()
  const kp = (await subtle.generateKey({ name: "Ed25519" } as Algorithm, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", kp.publicKey))
  const privRaw = new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey))
  return { publicKey: base64url(pubRaw), privateKey: base64url(privRaw) }
}

export async function identityMatches(id: Identity): Promise<boolean> {
  try {
    const subtle = getSubtle()
    const key = await subtle.importKey(
      "pkcs8",
      base64urlToBytes(id.privateKey) as unknown as BufferSource,
      { name: "Ed25519" } as Algorithm,
      true,
      ["sign"],
    )
    const jwk = (await subtle.exportKey("jwk", key)) as JsonWebKey
    return jwk.x === id.publicKey
  } catch {
    return false
  }
}
