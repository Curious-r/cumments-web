// PoW Worker — runs SHA256 loop off main thread
// Input: { prefix: string, difficulty: number }
// Output: { nonce: string } or { error: string }

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

self.onmessage = async (e: MessageEvent<{ prefix: string; difficulty: number }>) => {
  const { prefix, difficulty } = e.data
  const required = "0".repeat(difficulty)
  let nonce = 0
  try {
    while (true) {
      const input = `${prefix}${nonce}`
      // eslint-disable-next-line no-await-in-loop
      const hex = await sha256Hex(input)
      if (hex.startsWith(required)) {
        ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
          nonce: String(nonce),
        })
        break
      }
      nonce++
      if (nonce % 5000 === 0) {
        // yield to event loop
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  } catch (err) {
    ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
