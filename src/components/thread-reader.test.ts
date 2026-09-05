import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import type { AppRuntime } from "../runtime/app-runtime"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"

type El = HTMLElement & {
  shadowRoot: ShadowRoot
  updateComplete: Promise<unknown>
}

function runtimeOf(el: El): AppRuntime {
  return (el as unknown as { runtime: AppRuntime }).runtime
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "my-blog",
    page_slug: "hello-world",
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

interface ThreadPage {
  data: Message[]
  total: number
  totalPages: number
}

interface Fixture {
  feed: Message[]
  /** Thread member pages keyed by root id, then by page number. */
  threads: Map<string, Map<number, ThreadPage>>
  failThreadRoots?: Set<string>
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => jsonResponse(body, status),
  } as unknown as Response
}

function makeFetch(fixture: Fixture) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    const method = init?.method ?? "GET"
    if (u.includes("/api/v1/challenge")) {
      return jsonResponse({ prefix: "test.", difficulty: 1 })
    }
    if (u.includes("/api/v1/visitors/profile")) {
      return jsonResponse({
        visitor_id: "v1",
        site_id: "my-blog",
        display_name: "Tester",
        avatar_url: null,
        created_at: new Date().toISOString(),
        event_count: 0,
      })
    }
    if (u.includes("/comments")) {
      let body: Record<string, unknown> = {}
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string) as Record<string, unknown>
        } catch {}
      }
      const threadRoot = typeof body.thread_root === "string" ? body.thread_root : null
      if (method === "QUERY" && !threadRoot) {
        return jsonResponse({
          data: fixture.feed,
          meta: { total: fixture.feed.length, page: 1, per_page: 20, total_pages: 1 },
        })
      }
      if (method === "QUERY" && threadRoot) {
        if (fixture.failThreadRoots?.has(threadRoot)) {
          return jsonResponse(
            { status: 500, code: "internal", detail: "thread boom", title: "boom" },
            500,
          )
        }
        const pageNum = typeof body.page === "number" ? body.page : 1
        const resp = fixture.threads.get(threadRoot)?.get(pageNum) ?? {
          data: [],
          total: 0,
          totalPages: 1,
        }
        return jsonResponse({
          data: resp.data,
          meta: { total: resp.total, page: pageNum, per_page: 2, total_pages: resp.totalPages },
        })
      }
      // GET single comment
      const id = decodeURIComponent(u.split("/comments/")[1] ?? "")
      const found = fixture.feed.find((m) => m.event_id === id)
      if (found) return jsonResponse(found)
      return jsonResponse(
        { status: 404, code: "not-found", detail: "missing", title: "Missing" },
        404,
      )
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
}

describe("Thread reader", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    localStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  /** Installs a fetch mock, mounts the element, and waits for the main feed. */
  async function mountWith(fetchMock: typeof fetch | Fixture): Promise<El> {
    globalThis.fetch =
      typeof fetchMock === "function"
        ? fetchMock
        : (makeFetch(fetchMock) as unknown as typeof fetch)
    const el = document.createElement("cumments-comments") as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 120))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  function threadButton(el: El, id: string): HTMLButtonElement {
    const btn = el.shadowRoot.querySelector(
      `button[aria-label="View thread"][data-event-id="${CSS.escape(id)}"]`,
    ) as HTMLButtonElement | null
    if (!btn) throw new Error(`thread button for ${id} not rendered`)
    return btn
  }

  async function settle(el: El): Promise<void> {
    await new Promise((r) => setTimeout(r, 60))
    await el.updateComplete.catch(() => {})
  }

  const root = makeMessage({
    event_id: "$a",
    content: { type: "text", body: "root body" } as unknown as Message["content"],
  })

  function fixtureWith(
    members1: Message[],
    total = members1.length,
    totalPages = 1,
    members2?: Message[],
  ): Fixture {
    const pages = new Map<number, ThreadPage>()
    pages.set(1, { data: members1, total, totalPages })
    if (members2) pages.set(2, { data: members2, total, totalPages })
    return { feed: [root], threads: new Map([["$a", pages]]) }
  }

  it("opens from the comment action and renders root exactly once plus members in backend order", async () => {
    const b = makeMessage({
      event_id: "$b",
      thread_root: "$a",
      content: { type: "text", body: "member B" } as unknown as Message["content"],
    })
    const c = makeMessage({
      event_id: "$c",
      thread_root: "$a",
      reply_to: "$b",
      content: { type: "text", body: "member C" } as unknown as Message["content"],
    })
    const el = await mountWith(fixtureWith([b, c]))

    threadButton(el, "$a").click()
    await settle(el)

    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')
    if (!dlg) throw new Error("thread dialog not rendered")
    // Root body appears exactly once within the reader
    expect((dlg.innerHTML ?? "").split("root body").length - 1).toBe(1)
    // Members in backend order
    const membersList = dlg.querySelector('[part="thread-members"]')
    if (!membersList) throw new Error("member list not rendered")
    const articles = membersList.querySelectorAll("[role='article']")
    expect(articles.length).toBe(2)
    expect(articles[0].textContent).toContain("member B")
    expect(articles[1].textContent).toContain("member C")
    // The root must not appear in the member list
    expect(membersList.innerHTML).not.toContain("root body")
    // Header shows the backend-derived reply count
    const heading = dlg.querySelector(".thread-header h3")
    if (!heading) throw new Error("thread heading missing")
    expect(heading.textContent).toContain("2")
  })

  it("renders an empty thread as a valid empty state", async () => {
    const el = await mountWith(fixtureWith([]))
    threadButton(el, "$a").click()
    await settle(el)

    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')
    if (!dlg) throw new Error("thread dialog not rendered")
    expect(dlg.textContent).toContain("No replies yet")
    expect((dlg.innerHTML ?? "").split("root body").length - 1).toBe(1)
  })

  it("shows a thread-local loading state without touching the main feed", async () => {
    let releaseThread: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseThread = resolve
    })
    const base = makeFetch(fixtureWith([]))
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      let body: Record<string, unknown> = {}
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string) as Record<string, unknown>
        } catch {}
      }
      if (u.includes("/comments") && init?.method === "QUERY" && body.thread_root === "$a") {
        await gate
        return jsonResponse({ data: [], meta: { total: 0, page: 1, per_page: 2, total_pages: 1 } })
      }
      return base(input, init)
    }) as unknown as typeof fetch

    const el = await mountWith(globalThis.fetch)

    threadButton(el, "$a").click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})

    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')
    if (!dlg) throw new Error("thread dialog not rendered")
    const status = dlg.querySelector("[role='status']")
    if (!status) throw new Error("loading status not rendered")
    expect(status.textContent).toContain("Loading")
    // Main feed stays rendered beneath the overlay and is not loading itself
    const feed = el.shadowRoot.querySelector('[part="list"]')
    if (!feed) throw new Error("main feed not rendered")
    expect(feed.querySelectorAll("[role='article']").length).toBe(1)

    releaseThread()
    await settle(el)
    expect(dlg.querySelector("[role='status']")).toBeFalsy()
    expect(dlg.textContent).toContain("No replies yet")
  })

  it("shows error with retry and close; retry recovers through ThreadFeature", async () => {
    const fixture = fixtureWith([])
    fixture.failThreadRoots = new Set(["$a"])
    const el = await mountWith(fixture)

    threadButton(el, "$a").click()
    await settle(el)

    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')
    if (!dlg) throw new Error("thread dialog not rendered")
    const alert = dlg.querySelector("[role='alert']")
    if (!alert) throw new Error("thread error alert not rendered")
    expect(alert.textContent).toContain("thread boom")
    const retryBtn = dlg.querySelector("button[aria-label='Retry']") as HTMLButtonElement | null
    const closeBtn = dlg.querySelector("button[aria-label='Close']") as HTMLButtonElement | null
    if (!retryBtn || !closeBtn) throw new Error("retry/close controls missing")

    // Retry succeeds once the backend recovers
    fixture.failThreadRoots = new Set()
    retryBtn.click()
    await settle(el)
    expect(dlg.querySelector("[role='alert']")).toBeFalsy()
    expect(dlg.textContent).toContain("No replies yet")
    // Main feed error state unaffected
    expect(el.shadowRoot.innerHTML).not.toContain("thread boom")
  })

  it("load-more appends the next backend page in returned order", async () => {
    const b = makeMessage({
      event_id: "$b",
      thread_root: "$a",
      content: { type: "text", body: "member B" } as unknown as Message["content"],
    })
    const c = makeMessage({
      event_id: "$c",
      thread_root: "$a",
      content: { type: "text", body: "member C" } as unknown as Message["content"],
    })
    const d = makeMessage({
      event_id: "$d",
      thread_root: "$a",
      content: { type: "text", body: "member D" } as unknown as Message["content"],
    })
    const e = makeMessage({
      event_id: "$e",
      thread_root: "$a",
      content: { type: "text", body: "member E" } as unknown as Message["content"],
    })
    const el = await mountWith(fixtureWith([b, c], 4, 2, [d, e]))

    threadButton(el, "$a").click()
    await settle(el)

    const membersList = el.shadowRoot.querySelector('[part="thread-members"]')
    if (!membersList) throw new Error("member list not rendered")
    expect(membersList.querySelectorAll("[role='article']").length).toBe(2)
    const loadMore = el.shadowRoot.querySelector(
      "button[aria-label='Load more']",
    ) as HTMLButtonElement | null
    if (!loadMore) throw new Error("load-more control missing")
    loadMore.click()
    await settle(el)

    const articles = el.shadowRoot.querySelectorAll('[part="thread-members"] [role="article"]')
    expect(articles.length).toBe(4)
    expect(articles[2].textContent).toContain("member D")
    expect(articles[3].textContent).toContain("member E")
    // End of pagination: control gone
    expect(el.shadowRoot.querySelector("button[aria-label='Load more']")).toBeFalsy()
  })

  it("closing removes the reader, restores focus, and keeps Reply behavior unchanged", async () => {
    const b = makeMessage({
      event_id: "$b",
      thread_root: "$a",
      content: { type: "text", body: "member B" } as unknown as Message["content"],
    })
    const el = await mountWith(fixtureWith([b]))

    const btn = threadButton(el, "$a")
    btn.click()
    await settle(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')).toBeTruthy()
    // Opening a Thread must never populate the editor's reply target
    const editor = el.shadowRoot.querySelector("cumments-editor") as unknown as {
      currentReplyToId: string | null
    }
    expect(editor.currentReplyToId).toBeNull()

    const closeBtn = el.shadowRoot.querySelector('[part="thread-close"]') as HTMLButtonElement
    closeBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')).toBeFalsy()
    // Focus restored to the opening control
    expect(el.shadowRoot.activeElement).toBe(btn)

    // Normal Reply behavior still works after using the reader
    const replyBtn = el.shadowRoot.querySelector(
      "button[aria-label='Reply to comment'][data-event-id='$a']",
    ) as HTMLButtonElement
    replyBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(editor.currentReplyToId).toBe("$a")
  })

  it("thread rendering reuses the shared EntityCache entities", async () => {
    const b = makeMessage({
      event_id: "$b",
      thread_root: "$a",
      content: { type: "text", body: "member B" } as unknown as Message["content"],
    })
    const el = await mountWith(fixtureWith([b]))

    threadButton(el, "$a").click()
    await settle(el)

    const thread = runtimeOf(el).thread
    const comments = runtimeOf(el).comments
    // One canonical entity per event id across main feed and thread
    expect(thread.getMessage("$b")).toBe(comments.getMessage("$b"))
    expect(thread.getMessage("$a")).toBe(comments.getMessage("$a"))
    expect(thread.root).toBe(comments.getMessage("$a"))
  })

  it("switching from thread A to thread B never renders stale A content", async () => {
    const aMember = makeMessage({
      event_id: "$am",
      thread_root: "$a",
      content: { type: "text", body: "A member" } as unknown as Message["content"],
    })
    const bRoot = makeMessage({
      event_id: "$b-root",
      content: { type: "text", body: "B root body" } as unknown as Message["content"],
    })
    const bMember = makeMessage({
      event_id: "$bm",
      thread_root: "$b-root",
      content: { type: "text", body: "B member" } as unknown as Message["content"],
    })
    const pagesA = new Map<number, ThreadPage>([[1, { data: [aMember], total: 1, totalPages: 1 }]])
    const pagesB = new Map<number, ThreadPage>([[1, { data: [bMember], total: 1, totalPages: 1 }]])
    const fixture: Fixture = {
      feed: [root, bRoot],
      threads: new Map([
        ["$a", pagesA],
        ["$b-root", pagesB],
      ]),
    }
    let releaseA: () => void = () => {}
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const base = makeFetch(fixture)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      let body: Record<string, unknown> = {}
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string) as Record<string, unknown>
        } catch {}
      }
      if (u.includes("/comments") && init?.method === "QUERY" && body.thread_root === "$a") {
        await gateA
        return jsonResponse({
          data: [aMember],
          meta: { total: 1, page: 1, per_page: 2, total_pages: 1 },
        })
      }
      return base(input, init)
    }) as unknown as typeof fetch

    const el = await mountWith(globalThis.fetch)

    threadButton(el, "$a").click()
    await new Promise((r) => setTimeout(r, 30))
    // Open B while A is still in flight
    threadButton(el, "$b-root").click()
    await settle(el)

    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-label="Thread"]')
    if (!dlg) throw new Error("thread dialog not rendered")
    expect(dlg.textContent).toContain("B root body")
    expect(dlg.textContent).toContain("B member")

    // Late A response must not overwrite B
    releaseA()
    await settle(el)
    expect(dlg.textContent).not.toContain("A member")
    expect(dlg.textContent).toContain("B member")
  })
})
