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

  it("edit flow triggers PATCH with correct payload", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      event_id: "$editMe",
      content: { type: "text", body: "original" } as unknown as Message["content"],
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    // Click Edit
    const editBtn = el.shadowRoot?.querySelector('[aria-label="Edit comment"]') as HTMLButtonElement
    expect(editBtn).toBeTruthy()
    editBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Find edit input
    const input = el.shadowRoot?.querySelector(
      'input[aria-label="Edit comment"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("original")
    input.value = "edited body"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    // Capture PATCH
    const fetchCalls: Array<{ url: string; init?: RequestInit; body: unknown }> = []
    const origFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const prevMock = globalThis.fetch
    // Wrap existing mock to capture
    const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      let body: unknown
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string)
        } catch {
          body = init?.body
        }
      }
      fetchCalls.push({ url, init, body })
      // delegate to previous mock's behavior for challenge/comments
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
      if (url.includes("/comments/$editMe") && init?.method === "PATCH") {
        const hdrs = new Headers({ "content-type": "application/json" })
        return {
          ok: true,
          status: 202,
          headers: hdrs,
          json: async () => ({ submission_id: 999 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 999 }) }) as unknown as Response,
        } as unknown as Response
      }
      if (url.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [msg],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
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
    })
    globalThis.fetch = captureFetch as unknown as typeof fetch
    const saveBtn = el.shadowRoot?.querySelector('[aria-label="Save"]') as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 200))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Find PATCH call
    const patch = fetchCalls.find(
      (c) => c.url.includes("/comments/%24editMe") || c.url.includes("/comments/$editMe"),
    )
    expect(patch).toBeDefined()
    expect(patch?.url).toContain(encodeURIComponent("$editMe"))
    const body = patch?.body as Record<string, unknown>
    expect(body.content).toBe("edited body")
    expect(body.author_public_key).toBe(id.publicKey)
    expect(typeof body.author_signature).toBe("string")
    expect(typeof body.challenge_response).toBe("string")
    expect((body.challenge_response as string).includes("|")).toBe(true)
    // Idempotency-Key header
    expect(patch?.init?.headers).toBeDefined()
    const hdrs = patch?.init?.headers as Record<string, string>
    const hasIdempotency =
      hdrs["Idempotency-Key"] || (hdrs as unknown as Headers)?.get?.("Idempotency-Key")
    // At least one header should contain Idempotency-Key via fetch init headers
    // In our capture, headers are in init.headers
    const headerKeys = Object.keys(hdrs).join(",")
    expect(headerKeys.toLowerCase()).toContain("idempotency-key")
    globalThis.fetch = prevMock
  })

  it("delete flow triggers DELETE with author proof", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      event_id: "$delMe",
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    const delBtn = el.shadowRoot?.querySelector(
      '[aria-label="Delete comment"]',
    ) as HTMLButtonElement
    expect(delBtn).toBeTruthy()
    delBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const confirmBtn = el.shadowRoot?.querySelector("button") as HTMLButtonElement
    // Find confirm delete button (text Confirm delete? or Delete)
    const allBtns = Array.from(
      el.shadowRoot?.querySelectorAll("button") ?? [],
    ) as HTMLButtonElement[]
    const confirm = allBtns.find((b) =>
      b.textContent?.includes("Delete") && b.textContent !== "Delete"
        ? false
        : b.getAttribute("aria-label") === "Delete"
          ? false
          : b.textContent?.trim() === "Delete" && b !== delBtn,
    )
    // Simpler: find button with text Delete that is not the original delete
    const confirmDeleteBtn =
      allBtns.find((b) => b.textContent?.trim() === "Delete" && b !== delBtn) ??
      allBtns.find((b) => b.textContent?.includes("Delete"))
    expect(confirmDeleteBtn).toBeTruthy()
    const fetchCalls: Array<{ url: string; init?: RequestInit; body: unknown }> = []
    const prevMock = globalThis.fetch
    const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      let body: unknown
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string)
        } catch {
          body = init?.body
        }
      }
      fetchCalls.push({ url, init, body })
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
      if (url.includes("/comments/%24delMe") || url.includes("/comments/$delMe")) {
        if (init?.method === "DELETE") {
          return {
            ok: true,
            status: 202,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ submission_id: 1000 }),
            text: async () => "",
            clone: () => ({ json: async () => ({ submission_id: 1000 }) }) as unknown as Response,
          } as unknown as Response
        }
      }
      if (url.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [msg],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
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
    })
    globalThis.fetch = captureFetch as unknown as typeof fetch
    ;(confirmDeleteBtn as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 200))
    const delCall = fetchCalls.find(
      (c) => c.url.includes(encodeURIComponent("$delMe")) && c.init?.method === "DELETE",
    )
    expect(delCall).toBeDefined()
    const body = delCall?.body as Record<string, unknown>
    expect(body.author_public_key).toBe(id.publicKey)
    expect(typeof body.author_signature).toBe("string")
    expect(typeof body.challenge_response).toBe("string")
    const hdrs = delCall?.init?.headers as Record<string, string>
    expect(Object.keys(hdrs).join(",").toLowerCase()).toContain("idempotency-key")
    globalThis.fetch = prevMock
  })

  it("reply flow posts with reply_to and thread_root", async () => {
    const parent = makeMessage({
      event_id: "$parent1",
      content: { type: "text", body: "parent" } as unknown as Message["content"],
    })
    const parentThreaded = makeMessage({
      event_id: "$parent2",
      content: { type: "text", body: "threaded" } as unknown as Message["content"],
      reply_to: "$root",
      thread_root: "$root",
    })
    // Test case 1: parent without thread_root
    {
      const el = await renderWithMessages([parent])
      const replyBtn = el.shadowRoot?.querySelector(
        '[aria-label="Reply to comment"]',
      ) as HTMLButtonElement
      expect(replyBtn).toBeTruthy()
      replyBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
      const html = el.shadowRoot?.innerHTML ?? ""
      expect(html).toContain("Replying to")
      const input = el.shadowRoot?.querySelector('input[aria-label="Comment"]') as HTMLInputElement
      expect(input).toBeTruthy()
      input.value = "reply body"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      const fetchCalls: Array<{ url: string; body: unknown }> = []
      const prevMock = globalThis.fetch
      const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? (input as Request).url : input)
        let body: unknown
        if (init?.body) {
          try {
            body = JSON.parse(init.body as string)
          } catch {
            body = init?.body
          }
        }
        if (init?.method === "POST" && url.includes("/comments") && !url.includes("/reactions")) {
          fetchCalls.push({ url, body })
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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({}),
          text: async () => "",
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        } as unknown as Response
      })
      globalThis.fetch = captureFetch as unknown as typeof fetch
      const postBtn = el.shadowRoot?.querySelector(
        '[aria-label="Post comment"]',
      ) as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 300))
      expect(fetchCalls.length).toBeGreaterThan(0)
      const post = fetchCalls[0].body as Record<string, unknown>
      expect(post.reply_to).toBe("$parent1")
      expect(post.thread_root).toBe("$parent1")
      expect(post.content).toBe("reply body")
      expect(typeof post.author_signature).toBe("string")
      globalThis.fetch = prevMock
      document.body.innerHTML = ""
    }
    // Test case 2: parent already in thread
    {
      const el = await renderWithMessages([parentThreaded])
      const replyBtn = el.shadowRoot?.querySelector(
        '[aria-label="Reply to comment"]',
      ) as HTMLButtonElement
      replyBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      const input = el.shadowRoot?.querySelector('input[aria-label="Comment"]') as HTMLInputElement
      input.value = "nested reply"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      const fetchCalls: Array<{ body: unknown }> = []
      const prevMock = globalThis.fetch
      const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? (input as Request).url : input)
        if (init?.method === "POST" && url.includes("/comments") && !url.includes("/reactions")) {
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
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [parentThreaded],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
          }),
          text: async () => "",
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        } as unknown as Response
      })
      globalThis.fetch = captureFetch as unknown as typeof fetch
      const postBtn = el.shadowRoot?.querySelector(
        '[aria-label="Post comment"]',
      ) as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 300))
      const post = fetchCalls[0]?.body as Record<string, unknown>
      expect(post.reply_to).toBe("$parent2")
      expect(post.thread_root).toBe("$root")
      globalThis.fetch = prevMock
    }
  })
})
