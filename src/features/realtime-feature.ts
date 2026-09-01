import type { SseData } from "../api/contract/sse"
import type { SseTransport } from "../realtime/sse-transport"

export class RealtimeFeature {
  private transport: SseTransport
  private subscribers = new Set<(event: SseData) => void>()
  private started = false

  constructor(transport: SseTransport) {
    this.transport = transport
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.transport.connect(
      (data) => {
        if (!this.started) return
        for (const cb of [...this.subscribers]) {
          try {
            cb(data)
          } catch {
            // isolate subscriber errors
          }
        }
      },
      () => {
        // status change; could expose via getter, not needed for now
      },
    )
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.transport.close()
  }

  get connected(): boolean {
    return this.transport.connected
  }

  subscribe(callback: (event: SseData) => void): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }
}
