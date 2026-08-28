import type { components } from "./contract/generated"

export type ChallengeResponse = components["schemas"]["ChallengeResponse"]

export interface Challenge {
  prefix: string
  difficulty: number
}

export class ChallengeManager {
  private inflight: Promise<Challenge> | null = null

  constructor(private endpoint: string) {}

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint
  }

  async get(): Promise<Challenge> {
    // Challenges are single-use (pow.rs), so do not cache across calls.
    // Only dedupe concurrent inflight requests.
    if (this.inflight) return this.inflight
    this.inflight = this.fetchChallenge().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  clear(): void {
    // no-op: challenges are single-use and not cached
  }

  private async fetchChallenge(): Promise<Challenge> {
    const url = `${this.endpoint.replace(/\/$/, "")}/api/v1/challenge`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`challenge fetch failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as ChallengeResponse
    if (!data.prefix || typeof data.difficulty !== "number") {
      throw new Error("invalid challenge response")
    }
    return { prefix: data.prefix, difficulty: data.difficulty }
  }
}
