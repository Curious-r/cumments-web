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

// Suppress AbortError unhandled rejections during happy-dom teardown.
// happy-dom aborts pending fetch requests when the window is torn down,
// which can surface as flaky unhandled AbortError rejections.
const isAbortError = (reason: unknown): boolean => {
  if (reason instanceof DOMException && reason.name === "AbortError") return true
  if (reason instanceof Error && reason.name === "AbortError") return true
  if (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    (reason as { name: string }).name === "AbortError"
  ) {
    return true
  }
  return false
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("unhandledrejection", (event) => {
    if (isAbortError(event.reason)) event.preventDefault()
  })
}

// Node.js process-level handler as a fallback for errors that escape the
// browser event loop (e.g., errors thrown in happy-dom's internal teardown).
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("unhandledRejection", (reason) => {
    if (isAbortError(reason)) {
      // Swallow the AbortError; it is an artifact of happy-dom teardown.
    }
  })
}
