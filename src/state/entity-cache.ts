import type { Message } from "../api/contract/query"

export class EntityCache {
  private map = new Map<string, Message>()

  get(id: string): Message | undefined {
    return this.map.get(id)
  }

  set(id: string, message: Message): void {
    this.map.set(id, message)
  }

  setBatch(messages: Message[]): void {
    for (const m of messages) {
      this.map.set(m.event_id, m)
    }
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  clear(): void {
    this.map.clear()
  }

  // For testing/inspection only
  get size(): number {
    return this.map.size
  }
}
