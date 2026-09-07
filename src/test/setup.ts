// Polyfill WebCrypto for happy-dom / Node tests where Ed25519 is missing.
// Dynamic import avoids vite externalizing node:crypto in browser targets.
void (async () => {
  const nodeCrypto = await import("node:crypto").catch(() => null)
  const webcrypto = nodeCrypto?.webcrypto as Crypto | undefined
  if (!webcrypto) return
  if (!globalThis.crypto?.subtle) {
    globalThis.crypto = webcrypto as unknown as Crypto
  } else {
    const subtle = (globalThis.crypto as Crypto).subtle as unknown as { generateKey?: unknown }
    if (!subtle.generateKey) {
      globalThis.crypto = webcrypto as unknown as Crypto
    }
  }
})()

// Ensure AbortSignal from Node.js realm is used consistently in happy-dom.
// happy-dom's fetch expects AbortSignal instances from its own realm.
if (typeof globalThis.AbortSignal === "undefined") {
  const { AbortSignal } = require("node:events") as { AbortSignal: typeof globalThis.AbortSignal }
  globalThis.AbortSignal = AbortSignal
}
