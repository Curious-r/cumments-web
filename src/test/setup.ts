import { webcrypto } from "node:crypto"

// Polyfill WebCrypto for happy-dom / Node tests where Ed25519 is missing
if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto as unknown as Crypto
} else {
  const subtle = (globalThis.crypto as Crypto).subtle as unknown as { generateKey?: unknown }
  if (!subtle.generateKey) {
    globalThis.crypto = webcrypto as unknown as Crypto
  }
}
