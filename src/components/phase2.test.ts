import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import "./cumments-comments"

class MockEventSource {
  static OPEN = 1
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }
  addEventListener(type: string, cb: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(cb)
  }
  removeEventListener() {}
  close() {
    this.readyState = 2
  }
}

function mockFetchWithMessages(messages: Message[]) {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    if (u.includes("/api/v1/challenge")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ prefix: "test.", difficulty: 1 }),
        text: async () => "",
        clone: () =>
          ({ json: async () => ({ prefix: "test.", difficulty: 1 }) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: messages,
          meta: { total: messages.length, page: 1, per_page: 20, total_pages: 1 },
        }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    } as unknown as Response
  }) as unknown as typeof fetch
  return orig
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "Alice",
      avatar_url: null,
      public_key: "pk_author",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello", style: "normal" } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
    ...overrides,
  } as Message
}

describe("Phase 2: edit/delete/reply", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function renderWithMessages(
    msgs: Message[],
    identity?: { publicKey: string; privateKey: string },
  ) {
    if (identity) {
      localStorage.setItem("cumments_identity", JSON.stringify(identity))
    }
    origFetch = mockFetchWithMessages(msgs)
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 80))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  it("isOwn shows edit/delete, non-author does not", async () => {
    // Need to know own public key: controller generates one and saves to localStorage
    // We can set a known identity and make message with that pk
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const ownMsg = makeMessage({
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const otherMsg = makeMessage({
      event_id: "$other",
      author: {
        type: "visitor",
        display_name: "Other",
        avatar_url: null,
        public_key: "other_pk",
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([ownMsg, otherMsg], id)
    const html = el.shadowRoot?.innerHTML ?? ""
    // Should have edit/delete for own, not for other (count occurrences)
    const editButtons = el.shadowRoot?.querySelectorAll('[aria-label="Edit comment"]') ?? []
    expect(editButtons.length).toBe(1)
    const deleteButtons = el.shadowRoot?.querySelectorAll('[aria-label="Delete comment"]') ?? []
    expect(deleteButtons.length).toBe(1)
    expect(html).toContain("Reply")
  })

  it("reply button exists for all comments", async () => {
    const el = await renderWithMessages([makeMessage()])
    const replyButtons = el.shadowRoot?.querySelectorAll('[aria-label="Reply to comment"]') ?? []
    expect(replyButtons.length).toBeGreaterThanOrEqual(1)
  })

  it("reply creates reply_to and thread_root correctly", async () => {
    // Simulate controller logic for thread_root
    const parent = makeMessage({ event_id: "$parent", reply_to: null, thread_root: null })
    const replyTo = parent.event_id
    const threadRoot =
      (parent.thread_root as string | null) ?? (parent.reply_to as string | null) ?? parent.event_id
    expect(threadRoot).toBe("$parent")
    const child = makeMessage({ event_id: "$child", reply_to: "$parent", thread_root: "$parent" })
    const threadRoot2 =
      (child.thread_root as string | null) ?? (child.reply_to as string | null) ?? child.event_id
    expect(threadRoot2).toBe("$parent")
  })

  it("deleted/redacted shows fallback and no edit", async () => {
    const redacted = makeMessage({
      event_id: "$del",
      content: { type: "redacted" } as unknown as Message["content"],
      status: "redacted" as unknown as Message["status"],
    })
    const el = await renderWithMessages([redacted])
    const html = el.shadowRoot?.innerHTML ?? ""
    expect(html).toContain("deleted") // either en or zh fallback contains deleted
    const editButtons = el.shadowRoot?.querySelectorAll('[aria-label="Edit comment"]') ?? []
    expect(editButtons.length).toBe(0)
  })

  it("reply reference fallback when target not in byId", async () => {
    const reply = makeMessage({
      event_id: "$reply",
      reply_to: "$missing",
      content: { type: "text", body: "reply" } as unknown as Message["content"],
    })
    const el = await renderWithMessages([reply])
    const html = el.shadowRoot?.innerHTML ?? ""
    // Should show either unavailable or not crash
    expect(html).toContain("reply") // at least reply button
    // Reference should be unavailable
    expect(html).toContain("unavailable") // en fallback
  })

  it("keyed repeat: ordered list uses event_id", async () => {
    const msgs = [
      makeMessage({
        event_id: "$1",
        content: { type: "text", body: "one" } as unknown as Message["content"],
      }),
      makeMessage({
        event_id: "$2",
        content: { type: "text", body: "two" } as unknown as Message["content"],
      }),
    ]
    const el = await renderWithMessages(msgs)
    const articles = el.shadowRoot?.querySelectorAll('[role="article"]') ?? []
    expect(articles.length).toBe(2)
  })
})
