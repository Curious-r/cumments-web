import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { base64url } from "./keypair"

function getSubtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto
  if (c?.subtle) return c.subtle
  throw new Error("WebCrypto not available")
}

async function hmacSha512(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtle()
  const key = await subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-512" } as Algorithm,
    false,
    ["sign"],
  )
  const sig = await subtle.sign("HMAC", key, dataBytes as unknown as BufferSource)
  return new Uint8Array(sig)
}

function ser32(i: number): Uint8Array {
  const out = new Uint8Array(4)
  out[0] = (i >>> 24) & 0xff
  out[1] = (i >>> 16) & 0xff
  out[2] = (i >>> 8) & 0xff
  out[3] = i & 0xff
  return out
}

interface Slip10Node {
  key: Uint8Array
  chainCode: Uint8Array
}

async function slip10Master(seed: Uint8Array): Promise<Slip10Node> {
  const i = await hmacSha512(new TextEncoder().encode("ed25519 seed"), seed)
  return { key: i.slice(0, 32), chainCode: i.slice(32) }
}

async function slip10Child(node: Slip10Node, index: number): Promise<Slip10Node> {
  const data = new Uint8Array(1 + 32 + 4)
  data[0] = 0x00
  data.set(node.key, 1)
  data.set(ser32(index), 33)
  const i = await hmacSha512(node.chainCode, data)
  return { key: i.slice(0, 32), chainCode: i.slice(32) }
}

export function mnemonicToString(mnemonic: string | Uint16Array): string {
  if (typeof mnemonic === "string") return mnemonic
  return String(mnemonic)
}

export async function mnemonicToIdentity(
  mnemonic: string,
): Promise<{ publicKey: string; privateKey: string }> {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(" ")
  if (!bip39.validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid mnemonic")
  }
  const seed = bip39.mnemonicToSeedSync(normalized)
  let node = await slip10Master(seed)
  for (const index of [0x80000000 + 44, 0x80000000 + 1328, 0x80000000]) {
    node = await slip10Child(node, index)
  }
  const der = new Uint8Array(48)
  der.set(
    [
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ],
    0,
  )
  der.set(node.key, 16)
  const subtle = getSubtle()
  const privateKey = await subtle.importKey("pkcs8", der, { name: "Ed25519" } as Algorithm, true, [
    "sign",
  ])
  const jwk = (await subtle.exportKey("jwk", privateKey)) as JsonWebKey
  if (!jwk.x) throw new Error("failed to derive public key")
  return { publicKey: jwk.x, privateKey: base64url(der) }
}

export function generateMnemonic(): string {
  return bip39.generateMnemonic(wordlist, 128)
}

export function validateMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(" ")
  return bip39.validateMnemonic(normalized, wordlist)
}
