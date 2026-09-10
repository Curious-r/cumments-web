import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"

type El = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }

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

function makeFetch(fixture: Fixture) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    const method = init?.method ?? "GET"
    if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
    if (u.includes("/visitors/profile")) {
      return jsonResponse({ visitor_id: "v1", display_name: "Tester", avatar_url: null })
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
      return jsonResponse({})
    }
    return jsonResponse({})
  })
}

const VALID = "https://cdn/avatar.png"
const BROKEN = "https://cdn/broken.png"

const root = makeMessage({
  event_id: "$root",
  author: {
    type: "visitor",
    display_name: "Root Author",
    avatar_url: VALID,
    public_key: "pk_root",
    mxid: null,
  } as unknown as Message["author"],
})
const noAvatar = makeMessage({
  event_id: "$none",
  author: {
    type: "visitor",
    display_name: "No Avatar",
    avatar_url: null,
    public_key: "pk_none",
    mxid: null,
  } as unknown as Message["author"],
})
const brokenAvatar = makeMessage({
  event_id: "$broken",
  author: {
    type: "visitor",
    display_name: "Broken Image",
    avatar_url: BROKEN,
    public_key: "pk_broken",
    mxid: null,
  } as unknown as Message["author"],
})
const member = makeMessage({
  event_id: "$m1",
  thread_root: "$root",
  author: {
    type: "visitor",
    display_name: "Member One",
    avatar_url: VALID,
    public_key: "pk_member",
    mxid: null,
  } as unknown as Message["author"],
})

const fixture: Fixture = {
  feed: [root, noAvatar, brokenAvatar],
  threads: new Map([["$root", new Map([[1, { data: [member], total: 1, totalPages: 1 }]])]]),
}

describe("comment author avatars", () => {
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

  async function mount(): Promise<El> {
    globalThis.fetch = makeFetch(fixture) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelectorAll('[part="list"] [role="article"]').length === 3,
      "main feed to render three comments",
    )
    await el.updateComplete.catch(() => {})
    return el
  }

  function articles(el: El): HTMLElement[] {
    return Array.from(
      el.shadowRoot.querySelectorAll('[part="list"] [role="article"]'),
    ) as HTMLElement[]
  }

  function articleFor(el: El, name: string): HTMLElement {
    const found = articles(el).find((a) => a.textContent?.includes(name))
    if (!found) throw new Error(`comment for ${name} not found`)
    return found
  }

  it("gives every comment an avatar slot without collapsing it", async () => {
    const el = await mount()
    for (const article of articles(el)) {
      const avatars = article.querySelectorAll("cumments-avatar")
      expect(avatars, "each comment has exactly one avatar slot").toHaveLength(1)
    }
  })

  it("renders the image for a usable URL and the initial otherwise", async () => {
    const el = await mount()

    const withImage = articleFor(el, "Root Author")
    const image = withImage.querySelector("img.avatar-image") as HTMLImageElement | null
    expect(image?.getAttribute("src")).toBe(VALID)
    // Decorative: the adjacent visible name identifies the author.
    expect(image?.getAttribute("alt")).toBe("")

    const withoutImage = articleFor(el, "No Avatar")
    expect(withoutImage.querySelector("img")).toBeNull()
    expect(withoutImage.querySelector(".avatar-fallback")?.textContent?.trim()).toBe("N")
  })

  it("falls back when the avatar image fails to load", async () => {
    const el = await mount()
    const article = articleFor(el, "Broken Image")
    expect(article.querySelector("img.avatar-image")).toBeTruthy()

    article.querySelector("img.avatar-image")?.dispatchEvent(new Event("error"))
    await waitFor(
      () => article.querySelector(".avatar-fallback") !== null,
      "comment avatar to fall back after a load failure",
    )
    expect(article.querySelector("img")).toBeNull()
    expect(article.querySelector(".avatar-fallback")?.textContent?.trim()).toBe("B")
  })

  it("keeps the display name visible and the actions usable", async () => {
    const el = await mount()
    for (const name of ["Root Author", "No Avatar", "Broken Image"]) {
      const article = articleFor(el, name)
      expect(article.textContent).toContain(name)
      const reply = article.querySelector('[aria-label="Reply to comment"]') as HTMLButtonElement
      expect(reply, `reply action for ${name}`).toBeTruthy()
      expect(reply.disabled).toBe(false)
    }
  })

  it("does not duplicate the author name in the accessibility tree", async () => {
    const el = await mount()
    const withImage = articleFor(el, "Root Author")
    expect(withImage.querySelector("img")?.getAttribute("alt")).toBe("")
    const withoutImage = articleFor(el, "No Avatar")
    expect(withoutImage.querySelector(".avatar-fallback")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("renders avatars in Thread reader comments through the same presentation", async () => {
    const el = await mount()
    const viewThread = el.shadowRoot.querySelector(
      'button[aria-label="View thread"][data-event-id="$root"]',
    ) as HTMLButtonElement
    expect(viewThread).toBeTruthy()
    viewThread.click()
    await waitFor(
      () => el.shadowRoot.querySelector('[part="thread-members"] [role="article"]') !== null,
      "thread members to render",
    )
    await el.updateComplete.catch(() => {})

    const inThread = Array.from(
      el.shadowRoot.querySelectorAll('[part="thread-dialog"] [role="article"]'),
    ) as HTMLElement[]
    expect(inThread.length).toBeGreaterThanOrEqual(2)
    for (const article of inThread) {
      expect(article.querySelectorAll("cumments-avatar")).toHaveLength(1)
    }

    const memberArticle = el.shadowRoot.querySelector(
      '[part="thread-members"] [role="article"]',
    ) as HTMLElement
    expect(memberArticle.textContent).toContain("Member One")
    expect(memberArticle.querySelector("img.avatar-image")?.getAttribute("src")).toBe(VALID)
  })
})
