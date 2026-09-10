import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"
import { getThreadRootId, isMainTimelineMessage } from "../utils/thread"

type El = HTMLElement & {
  shadowRoot: ShadowRoot
  updateComplete: Promise<unknown>
}

interface ThreadPage {
  data: Message[]
  total: number
  totalPages: number
}

interface Fixture {
  feed: Message[]
  threads: Map<string, Map<number, ThreadPage>>
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$a",
    site_id: "my-blog",
    page_slug: "hello-world",
    author: {
      type: "visitor",
      display_name: "Alice",
      avatar_url: null,
      public_key: "pk_author",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "body" } as unknown as Message["content"],
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

/**
 * Stands in for the current backend: the main page query returns every message
 * on the page, including explicit Thread members.
 */
function makeFetch(fixture: Fixture) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    const method = init?.method ?? "GET"
    if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
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
    if (u.includes("/reactions")) return jsonResponse({})
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
        const pageNum = typeof body.page === "number" ? body.page : 1
        const resp = fixture.threads.get(threadRoot)?.get(pageNum) ?? {
          data: [],
          total: 0,
          totalPages: 1,
        }
        return jsonResponse({
          data: resp.data,
          meta: { total: resp.total, page: pageNum, per_page: 20, total_pages: resp.totalPages },
        })
      }
      const id = decodeURIComponent(u.split("/comments/")[1] ?? "")
      const found = fixture.feed.find((m) => m.event_id === id)
      if (found) return jsonResponse(found)
      return jsonResponse(
        { status: 404, code: "not-found", detail: "missing", title: "Missing" },
        404,
      )
    }
    return jsonResponse({})
  })
}

// A and D are main-timeline roots; B and C are members of A's Thread.
const rootA = makeMessage({
  event_id: "$a",
  thread_root: null,
  content: { type: "text", body: "root A" } as unknown as Message["content"],
})
const memberB = makeMessage({
  event_id: "$b",
  thread_root: "$a",
  content: { type: "text", body: "member B" } as unknown as Message["content"],
})
const memberC = makeMessage({
  event_id: "$c",
  thread_root: "$a",
  reply_to: "$b",
  content: { type: "text", body: "member C" } as unknown as Message["content"],
})
const rootD = makeMessage({
  event_id: "$d",
  thread_root: null,
  content: { type: "text", body: "root D" } as unknown as Message["content"],
})

/** The backend page currently mixes roots and Thread members together. */
const fullPage: Fixture = {
  feed: [rootA, memberB, memberC, rootD],
  threads: new Map([["$a", new Map([[1, { data: [memberB, memberC], total: 2, totalPages: 1 }]])]]),
}

describe("main timeline and Thread semantics", () => {
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

  async function waitFor(
    condition: () => boolean,
    message: string,
    timeoutMs = 2000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(`waitFor timed out: ${message}`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  async function mount(fixture: Fixture): Promise<El> {
    globalThis.fetch = makeFetch(fixture) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelectorAll('[part="list"] [role="article"]').length > 0,
      "main feed to render",
    )
    return el
  }

  /** Event ids rendered as main-feed articles, in order. */
  function feedIds(el: El): string[] {
    const list = el.shadowRoot.querySelector('[part="list"]')
    if (!list) return []
    return Array.from(list.querySelectorAll('[role="article"]'))
      .map((a) => (a.querySelector("[data-event-id]") as HTMLElement | null)?.dataset.eventId)
      .filter((id): id is string => !!id)
  }

  function threadArticleIds(el: El): string[] {
    return Array.from(el.shadowRoot.querySelectorAll('[part="thread-members"] [role="article"]'))
      .map((a) => (a.querySelector("[data-event-id]") as HTMLElement | null)?.dataset.eventId)
      .filter((id): id is string => !!id)
  }

  function viewThreadButton(el: El, id: string): HTMLButtonElement | null {
    return el.shadowRoot.querySelector(
      `button[aria-label="View thread"][data-event-id="${CSS.escape(id)}"]`,
    ) as HTMLButtonElement | null
  }

  async function openThread(el: El, id: string, expectedMembers: string[] = []): Promise<void> {
    const btn = viewThreadButton(el, id)
    if (!btn) throw new Error(`View thread button not found for ${id}`)
    btn.click()
    await el.updateComplete.catch(() => {})
    await waitFor(
      () => el.shadowRoot.querySelector('[part="thread-dialog"]') !== null,
      "Thread dialog to open",
    )
    await waitFor(
      () =>
        runtimeOf(el).thread.snapshot().memberIds.length === expectedMembers.length &&
        runtimeOf(el).thread.snapshot().loading === false,
      "Thread members to load",
    )
    await el.updateComplete.catch(() => {})
  }

  interface RuntimeProbe {
    thread: {
      snapshot(): { rootId: string | null; memberIds: string[]; loading: boolean }
    }
  }

  const runtimeOf = (el: El) => (el as unknown as { runtime: RuntimeProbe }).runtime

  it("renders only main-timeline roots and hides Thread members", async () => {
    const el = await mount(fullPage)

    expect(feedIds(el)).toEqual(["$a", "$d"])
    expect(feedIds(el)).not.toContain("$b")
    expect(feedIds(el)).not.toContain("$c")

    // Hidden members are not accessible as duplicate main-feed articles either.
    const list = el.shadowRoot.querySelector('[part="list"]')
    expect(list?.textContent).toContain("root A")
    expect(list?.textContent).not.toContain("member B")
    expect(list?.textContent).not.toContain("member C")
  })

  it("keeps the main-timeline root visible while its members are hidden", async () => {
    const el = await mount(fullPage)
    expect(feedIds(el)).toContain("$a")
    expect(viewThreadButton(el, "$a")).toBeTruthy()
  })

  it("keeps Thread members materialized and reachable through ThreadFeature", async () => {
    const el = await mount(fullPage)
    await openThread(el, "$a", ["$b", "$c"])

    // The root plus both members are materialized, even though the members are
    // absent from the main feed.
    expect(runtimeOf(el).thread.snapshot().rootId).toBe("$a")
    expect(el.shadowRoot.querySelector('[part="thread-root"]')?.textContent).toContain("root A")
    expect(threadArticleIds(el)).toEqual(["$b", "$c"])
    // Filtering is presentation-only: the main feed is unaffected by the open.
    expect(feedIds(el)).toEqual(["$a", "$d"])
  })

  it("opens the canonical Thread when View thread is activated on a root", async () => {
    const el = await mount(fullPage)
    await openThread(el, "$a", ["$b", "$c"])

    expect(runtimeOf(el).thread.snapshot().rootId).toBe("$a")
    expect(el.shadowRoot.querySelector('[part="thread-root"]')?.textContent).toContain("root A")
    expect(threadArticleIds(el)).toEqual(["$b", "$c"])
  })

  it("resolves a Thread member trigger to the canonical root", async () => {
    const el = await mount(fullPage)
    // Defensive: Thread members are no longer rendered in the main feed, but if
    // a "View thread" trigger ever carries a member id the handler must still
    // open the canonical Thread rather than starting a Thread at the reply.
    const trigger = document.createElement("button")
    trigger.dataset.eventId = "$b"
    const handler = (el as unknown as { handleViewThreadBound: (e: Event) => void })
      .handleViewThreadBound
    handler({ currentTarget: trigger } as unknown as Event)

    await el.updateComplete.catch(() => {})
    await waitFor(
      () => runtimeOf(el).thread.snapshot().rootId !== null,
      "Thread to open from a member trigger",
    )
    expect(runtimeOf(el).thread.snapshot().rootId).toBe("$a")
    expect(runtimeOf(el).thread.snapshot().rootId).not.toBe("$b")
  })

  it("resolves a Thread member to its canonical root, not its own event id", () => {
    expect(getThreadRootId(memberB)).toBe("$a")
    expect(getThreadRootId(memberC)).toBe("$a")
    expect(getThreadRootId(rootA)).toBe("$a")
    expect(getThreadRootId(rootD)).toBe("$d")
    // Classification used by the main-timeline projection.
    expect(isMainTimelineMessage(rootA)).toBe(true)
    expect(isMainTimelineMessage(rootD)).toBe(true)
    expect(isMainTimelineMessage(memberB)).toBe(false)
    expect(isMainTimelineMessage(memberC)).toBe(false)
  })

  it("does not derive the Thread from reply_to", async () => {
    // C has thread_root = A and reply_to = B: the Thread is A, not B.
    expect(memberC.reply_to).toBe("$b")
    expect(getThreadRootId(memberC)).toBe("$a")

    const el = await mount(fullPage)
    await openThread(el, "$a", ["$b", "$c"])
    expect(runtimeOf(el).thread.snapshot().rootId).toBe("$a")
    // Opening the Thread must not have been redirected to the reply parent.
    expect(runtimeOf(el).thread.snapshot().rootId).not.toBe("$b")
  })

  it("treats a page containing only Thread members as an empty main timeline", async () => {
    const membersOnly: Fixture = {
      feed: [memberB, memberC],
      threads: fullPage.threads,
    }
    globalThis.fetch = makeFetch(membersOnly) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector('[part="list"]') !== null,
      "main feed container to render",
    )
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 20))

    // No fabricated replacements: the members are simply not main-feed items.
    expect(feedIds(el)).toEqual([])
    const list = el.shadowRoot.querySelector('[part="list"]')
    expect(list?.textContent).not.toContain("member B")
    expect(list?.textContent).not.toContain("member C")
  })

  it("shows a realtime Thread reply in the Thread but not in the main feed", async () => {
    class RecordingES extends MockEventSource {
      static instances: RecordingES[] = []
      constructor(url: string) {
        super(url)
        RecordingES.instances.push(this)
      }
    }
    globalThis.EventSource = RecordingES as unknown as typeof EventSource

    const el = await mount({
      feed: [rootA, memberB],
      // $c is deliberately absent from the backend thread page: it only ever
      // arrives through the realtime channel.
      threads: new Map([["$a", new Map([[1, { data: [memberB], total: 1, totalPages: 1 }]])]]),
    })
    await openThread(el, "$a", ["$b"])
    expect(threadArticleIds(el)).toEqual(["$b"])
    const feedBefore = feedIds(el)

    // A Thread member arrives through the shared realtime path.
    const incoming = makeMessage({
      event_id: "$c",
      thread_root: "$a",
      content: { type: "text", body: "member C via SSE" } as unknown as Message["content"],
    })
    const es = RecordingES.instances[RecordingES.instances.length - 1]
    if (!es) throw new Error("no EventSource instance")
    const frame = {
      data: JSON.stringify({
        type: "message_created",
        payload: { site_id: "my-blog", page_slug: "hello-world", message: incoming },
      }),
    }
    for (const cb of es.listeners.get("message_created") ?? []) {
      cb(frame as unknown as MessageEvent)
    }
    await el.updateComplete.catch(() => {})
    await waitFor(
      () => threadArticleIds(el).includes("$c"),
      "realtime Thread member to appear in the reader",
    )

    // Visible in the Thread, and never promoted into the main timeline.
    expect(el.shadowRoot.querySelector('[part="thread-members"]')?.textContent).toContain(
      "member C via SSE",
    )
    expect(feedIds(el)).toEqual(feedBefore)
    expect(feedIds(el)).not.toContain("$c")
  })

  it("shows a realtime main-timeline root in the feed", async () => {
    class RecordingES extends MockEventSource {
      static instances: RecordingES[] = []
      constructor(url: string) {
        super(url)
        RecordingES.instances.push(this)
      }
    }
    globalThis.EventSource = RecordingES as unknown as typeof EventSource

    const el = await mount({ feed: [rootA], threads: fullPage.threads })
    const incoming = makeMessage({
      event_id: "$e",
      thread_root: null,
      content: { type: "text", body: "new root E" } as unknown as Message["content"],
    })
    const es = RecordingES.instances[RecordingES.instances.length - 1]
    if (!es) throw new Error("no EventSource instance")
    const frame = {
      data: JSON.stringify({
        type: "message_created",
        payload: { site_id: "my-blog", page_slug: "hello-world", message: incoming },
      }),
    }
    for (const cb of es.listeners.get("message_created") ?? []) {
      cb(frame as unknown as MessageEvent)
    }
    await el.updateComplete.catch(() => {})
    await waitFor(() => feedIds(el).includes("$e"), "new root to appear in the feed")
    expect(feedIds(el)[0]).toBe("$e")
  })
})
