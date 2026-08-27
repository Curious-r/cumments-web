/**
 * PowSolver — Worker-first abstraction, main-thread fallback.
 * Semantics must match `crates/cumments-api/src/pow.rs` and `misc/demo`:
 *   SHA256(prefix + nonce) hex starts with `difficulty` zeros.
 *   nonce is decimal string, prefix is challenge prefix (timestamp.random.sig).
 */

export interface PowResult {
  nonce: string
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input) as unknown as BufferSource
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function verifyPow(
  prefix: string,
  difficulty: number,
  nonce: string,
): Promise<boolean> {
  const hex = await sha256Hex(`${prefix}${nonce}`)
  return hex.startsWith("0".repeat(difficulty))
}

async function solveOnMainThread(
  prefix: string,
  difficulty: number,
  signal?: AbortSignal,
): Promise<string> {
  const required = "0".repeat(difficulty)
  let nonce = 0
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    const hex = await sha256Hex(`${prefix}${nonce}`)
    if (hex.startsWith(required)) return String(nonce)
    nonce++
    if (nonce % 2000 === 0) {
      // yield to avoid blocking
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }
}

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && typeof import.meta.url !== "undefined"
}

export class PowSolver {
  private workerFactory?: () => Worker

  constructor(workerFactory?: () => Worker) {
    this.workerFactory = workerFactory
  }

  async solve(prefix: string, difficulty: number, signal?: AbortSignal): Promise<string> {
    if (difficulty === 0) return "0"

    // Prefer Worker if available and no custom factory that throws
    if (this.workerFactory || canUseWorker()) {
      try {
        return await this.solveViaWorker(prefix, difficulty, signal)
      } catch (e) {
        // Fall through to main thread on Worker failure (e.g., file:// or test env)
        if (e instanceof DOMException && e.name === "AbortError") throw e
        // otherwise fallback
      }
    }
    return solveOnMainThread(prefix, difficulty, signal)
  }

  private solveViaWorker(
    prefix: string,
    difficulty: number,
    signal?: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let worker: Worker
      try {
        worker = this.workerFactory
          ? this.workerFactory()
          : new Worker(new URL("./pow.worker.ts", import.meta.url), { type: "module" })
      } catch (e) {
        reject(e)
        return
      }

      const onAbort = () => {
        worker.terminate()
        reject(new DOMException("Aborted", "AbortError"))
      }
      if (signal) {
        if (signal.aborted) {
          worker.terminate()
          reject(new DOMException("Aborted", "AbortError"))
          return
        }
        signal.addEventListener("abort", onAbort, { once: true })
      }

      worker.onmessage = (e: MessageEvent<{ nonce?: string; error?: string }>) => {
        signal?.removeEventListener("abort", onAbort)
        worker.terminate()
        if (e.data.error) reject(new Error(e.data.error))
        else if (e.data.nonce !== undefined) resolve(e.data.nonce)
        else reject(new Error("invalid worker response"))
      }
      worker.onerror = (e) => {
        signal?.removeEventListener("abort", onAbort)
        worker.terminate()
        reject(e.error ?? new Error(e.message))
      }
      worker.postMessage({ prefix, difficulty })
    })
  }
}

// Convenience helper for `challenge_response = prefix|nonce`
export function formatChallengeResponse(prefix: string, nonce: string): string {
  return `${prefix}|${nonce}`
}

export function parseChallengeResponse(value: string): { prefix: string; nonce: string } | null {
  const idx = value.lastIndexOf("|")
  if (idx === -1) return null
  return { prefix: value.slice(0, idx), nonce: value.slice(idx + 1) }
}
