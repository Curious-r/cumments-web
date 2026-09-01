import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "../cumments-comments"
import type { Message } from "../../api/contract/query"

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

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "my-blog",
    page_slug: "hello-world",
    author: {
      type: "visitor",
      display_name: "Author",
      avatar_url: null,
      public_key: "pk",
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

describe("Editor integration via <cumments-comments>", () => {
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
    vi.restoreAllMocks()
  })

  function mockFetchWithMessages(msgs: Message[]) {
    origFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      if (url.includes("/api/v1/challenge")) {
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
      if (url.includes("/sticker") || url.includes("/stickers")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ packs: [] }),
          text: async () => "",
          clone: () => ({ json: async () => ({ packs: [] }) }) as unknown as Response,
        } as unknown as Response
      }
      if (
        url.includes("/comments") &&
        (init?.method === "QUERY" ||
          !init?.method ||
          url.includes("/comments?") ||
          url.includes("/comments"))
      ) {
        // Check if it's a QUERY or GET via transport
        if (init?.method === "QUERY" || url.includes("/comments")) {
          // For GET/QUERY, return msgs
          // Distinguish POST vs GET: POST has method POST
          if (init?.method === "POST") {
            // Let caller handle POST via capture
            return {
              ok: true,
              status: 202,
              headers: new Headers({ "content-type": "application/json" }),
              json: async () => ({ submission_id: 123 }),
              text: async () => "",
              clone: () => ({ json: async () => ({ submission_id: 123 }) }) as unknown as Response,
            } as unknown as Response
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              data: msgs,
              meta: { total: msgs.length, page: 1, per_page: 20, total_pages: 1 },
            }),
            text: async () => "",
            clone: () => ({ json: async () => ({}) }) as unknown as Response,
          } as unknown as Response
        }
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
    return origFetch
  }

  it("cumments:submit -> EditorFeature -> CommentsFeature for root reply", async () => {
    const parent = makeMessage({ event_id: "$parent1" })
    mockFetchWithMessages([parent])
    const el = document.createElement("cumments-comments") as HTMLElement & {
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

    const replyBtn = el.shadowRoot.querySelector(
      '[aria-label="Reply to comment"]',
    ) as HTMLButtonElement
    expect(replyBtn).toBeTruthy()
    replyBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete.catch(() => {})

    // Find editor inside shadowRoot
    const editor = el.shadowRoot.querySelector("cumments-editor") as HTMLElement & {
      shadowRoot: ShadowRoot
    }
    expect(editor).toBeTruthy()
    // Editor is light DOM, its input is inside editor element
    const input = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    expect(input).toBeTruthy()
    input.value = "reply body"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))

    const fetchCalls: Array<{ body: unknown }> = []
    const prevFetch = globalThis.fetch
    const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      if (
        init?.method === "POST" &&
        url.includes("/comments") &&
        !url.includes("/reactions") &&
        !url.includes("/polls")
      ) {
        let body: unknown
        if (init.body) {
          try {
            body = JSON.parse(init.body as string)
          } catch {
            body = init.body
          }
        }
        fetchCalls.push({ body })
        return {
          ok: true,
          status: 202,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 2000 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 2000 }) }) as unknown as Response,
        } as unknown as Response
      }
      if (url.includes("/api/v1/challenge")) {
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
      if (url.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [parent],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
          }),
          text: async () => "",
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        } as unknown as Response
      }
      return prevFetch(input, init as RequestInit) as Promise<Response>
    })
    globalThis.fetch = captureFetch as unknown as typeof fetch

    const postBtn = editor.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn).toBeTruthy()
    postBtn.click()
    await new Promise((r) => setTimeout(r, 400))
    expect(fetchCalls.length).toBeGreaterThan(0)
    const post = fetchCalls[0].body as Record<string, unknown>
    expect(post.reply_to).toBe("$parent1")
    expect(post.thread_root).toBe("$parent1")
    expect(post.content).toBe("reply body")
    globalThis.fetch = prevFetch
  })

  it("cumments:submit -> nested reply derives thread_root correctly", async () => {
    const _root = makeMessage({ event_id: "$root" })
    const parent = makeMessage({ event_id: "$parent2", reply_to: "$root", thread_root: "$root" })
    mockFetchWithMessages([parent])
    const el = document.createElement("cumments-comments") as HTMLElement & {
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

    const replyBtn = el.shadowRoot.querySelector(
      '[aria-label="Reply to comment"]',
    ) as HTMLButtonElement
    replyBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    const editor = el.shadowRoot.querySelector("cumments-editor") as HTMLElement
    const input = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    input.value = "nested reply"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))

    const fetchCalls: Array<{ body: unknown }> = []
    const prevFetch = globalThis.fetch
    const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      if (init?.method === "POST" && url.includes("/comments")) {
        let body: unknown
        if (init?.body)
          try {
            body = JSON.parse(init.body as string)
          } catch {}
        fetchCalls.push({ body })
        return {
          ok: true,
          status: 202,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 2001 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 2001 }) }) as unknown as Response,
        } as unknown as Response
      }
      if (url.includes("/api/v1/challenge")) {
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
      if (url.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [parent],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
          }),
          text: async () => "",
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        } as unknown as Response
      }
      return prevFetch(input, init as RequestInit) as Promise<Response>
    })
    globalThis.fetch = captureFetch as unknown as typeof fetch

    const postBtn = editor.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 400))
    expect(fetchCalls.length).toBeGreaterThan(0)
    const post = fetchCalls[fetchCalls.length - 1].body as Record<string, unknown>
    // For nested reply, thread_root should be $root (from parent's thread_root)
    expect(post.thread_root).toBe("$root")
    expect(post.reply_to).toBe("$parent2")
    globalThis.fetch = prevFetch
  })
})
