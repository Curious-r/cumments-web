import type { components } from "./contract/generated"

export type ChallengeResponse = components["schemas"]["ChallengeResponse"]

export interface Challenge {
  prefix: string
  difficulty: number
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export class ChallengeManager {
  private cache: Challenge | null = null
  private fetchedAt = 0
  private inflight: Promise<Challenge> | null = null

  constructor(private readonly endpoint: string) {}

  async get(): Promise<Challenge> {
    const now = Date.now()
    if (this.cache && now - this.fetchedAt < CHALLENGE_TTL_MS) {
      return this.cache
    }
    if (this.inflight) return this.inflight
    this.inflight = this.fetchChallenge().finally(() => {
      this.inflight = null
    })
    const challenge = await this.inflight
    this.cache = challenge
    this.fetchedAt = now
    return challenge
  }

  clear(): void {
    this.cache = null
    this.fetchedAt = 0
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
