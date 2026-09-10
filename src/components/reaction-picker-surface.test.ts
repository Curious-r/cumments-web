import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"

type Surface = "main" | "thread"

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
    content: { type: "text", body: "hello" } as unknown as Message["content"],
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
          meta: { total: resp.total, page: pageNum, per_page: 2, total_pages: resp.totalPages },
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

describe("reaction picker surface ownership", () => {
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

  async function withIdentity(): Promise<void> {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    localStorage.setItem("cumments_identity", JSON.stringify(id))
  }

  async function mount(fixture: Fixture): Promise<El> {
    globalThis.fetch = makeFetch(fixture) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelectorAll('button[aria-label="Add reaction"]').length > 0,
      "main feed to render",
    )
    return el
  }

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

  /** Which surface a node belongs to, derived from its DOM container. */
  function surfaceOf(node: Element): Surface {
    return node.closest('[part="thread-dialog"]') ? "thread" : "main"
  }

  function addButtons(el: El, eventId: string): HTMLButtonElement[] {
    return Array.from(el.shadowRoot.querySelectorAll('button[aria-label="Add reaction"]')).filter(
      (b) => (b as HTMLElement).dataset.eventId === eventId,
    ) as HTMLButtonElement[]
  }

  function addButton(el: El, surface: Surface, eventId: string): HTMLButtonElement {
    const found = addButtons(el, eventId).find((b) => surfaceOf(b) === surface)
    if (!found) throw new Error(`Add reaction button not found in ${surface} for ${eventId}`)
    return found
  }

  function pickers(el: El): HTMLElement[] {
    return Array.from(el.shadowRoot.querySelectorAll('[role="dialog"][aria-label="Pick reaction"]'))
  }

  function pickerSurfaces(el: El): Surface[] {
    return pickers(el).map(surfaceOf)
  }

  function openThread(el: El, eventId: string): void {
    const btn = el.shadowRoot.querySelector(
      `button[aria-label="View thread"][data-event-id="${CSS.escape(eventId)}"]`,
    ) as HTMLButtonElement | null
    if (!btn) throw new Error(`View thread button not found for ${eventId}`)
    btn.click()
  }

  const root = makeMessage({
    event_id: "$a",
    content: { type: "text", body: "root body" } as unknown as Message["content"],
    reactions: [
      { key: "👍", count: 1, mine: false, reactors: [] },
    ] as unknown as Message["reactions"],
  })

  const memberB = makeMessage({
    event_id: "$b",
    thread_root: "$a",
    content: { type: "text", body: "member B" } as unknown as Message["content"],
    reactions: [
      { key: "👍", count: 1, mine: false, reactors: [] },
    ] as unknown as Message["reactions"],
  })

  const memberC = makeMessage({
    event_id: "$c",
    thread_root: "$a",
    content: { type: "text", body: "member C" } as unknown as Message["content"],
    reactions: [
      { key: "❤️", count: 1, mine: false, reactors: [] },
    ] as unknown as Message["reactions"],
  })

  function fixtureWith(members: Message[]): Fixture {
    const pages = new Map<number, ThreadPage>()
    pages.set(1, { data: members, total: members.length, totalPages: 1 })
    return { feed: [root], threads: new Map([["$a", pages]]) }
  }

  it("opens exactly one picker in the main feed and marks only that trigger expanded", async () => {
    const el = await mount(fixtureWith([]))
    const trigger = addButton(el, "main", "$a")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    trigger.click()
    await waitFor(() => pickers(el).length === 1, "picker to open")

    expect(pickerSurfaces(el)).toEqual(["main"])
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("keeps the picker in the Thread surface for a message shown in both surfaces", async () => {
    const el = await mount(fixtureWith([memberB]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    // The same message is on screen twice: main feed + Thread root.
    const mainTrigger = addButton(el, "main", "$a")
    const threadTrigger = addButton(el, "thread", "$a")

    threadTrigger.click()
    await waitFor(() => pickers(el).length > 0, "picker to open")

    expect(pickers(el)).toHaveLength(1)
    expect(pickerSurfaces(el)).toEqual(["thread"])
    expect(threadTrigger.getAttribute("aria-expanded")).toBe("true")
    // The duplicate copy must stay collapsed.
    expect(mainTrigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("keeps the picker in the main feed when the duplicate message is in the Thread", async () => {
    const el = await mount(fixtureWith([memberB]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    const mainTrigger = addButton(el, "main", "$a")
    const threadTrigger = addButton(el, "thread", "$a")

    mainTrigger.click()
    await waitFor(() => pickers(el).length > 0, "picker to open")

    expect(pickers(el)).toHaveLength(1)
    expect(pickerSurfaces(el)).toEqual(["main"])
    expect(mainTrigger.getAttribute("aria-expanded")).toBe("true")
    expect(threadTrigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("replaces the picker when another Thread message is activated", async () => {
    const el = await mount(fixtureWith([memberB, memberC]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$b").length === 1, "thread members to render")

    addButton(el, "thread", "$b").click()
    await waitFor(() => pickers(el).length === 1, "picker for B")
    expect(addButton(el, "thread", "$b").getAttribute("aria-expanded")).toBe("true")

    addButton(el, "thread", "$c").click()
    await waitFor(
      () => addButton(el, "thread", "$c").getAttribute("aria-expanded") === "true",
      "picker for C",
    )

    // Exactly one picker, owned by C; B is collapsed and its picker is gone.
    expect(pickers(el)).toHaveLength(1)
    expect(addButton(el, "thread", "$b").getAttribute("aria-expanded")).toBe("false")
    expect(pickerSurfaces(el)).toEqual(["thread"])
  })

  it("toggling the same Thread trigger closes its picker", async () => {
    const el = await mount(fixtureWith([]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    const threadTrigger = addButton(el, "thread", "$a")
    threadTrigger.click()
    await waitFor(() => pickers(el).length === 1, "picker to open")

    threadTrigger.click()
    await waitFor(() => pickers(el).length === 0, "picker to close")
    expect(threadTrigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("restores focus to the Thread trigger, not the duplicate in the main feed", async () => {
    const el = await mount(fixtureWith([]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    const mainTrigger = addButton(el, "main", "$a")
    const threadTrigger = addButton(el, "thread", "$a")

    threadTrigger.click()
    await waitFor(() => pickers(el).length === 1, "picker to open")
    // Move focus off the trigger, as opening the picker does.
    ;(pickers(el)[0].querySelector("button") as HTMLElement | null)?.focus()

    threadTrigger.click()
    await waitFor(() => pickers(el).length === 0, "picker to close")
    await new Promise((r) => setTimeout(r, 20))

    expect(el.shadowRoot.activeElement ?? document.activeElement).toBe(threadTrigger)
    expect(el.shadowRoot.activeElement ?? document.activeElement).not.toBe(mainTrigger)
  })

  it("submits the reaction for the message, regardless of surface", async () => {
    await withIdentity()
    const el = await mount(fixtureWith([]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    const runtime = (el as unknown as { runtime: { comments: { toggleReaction: unknown } } })
      .runtime
    const toggle = vi.spyOn(
      runtime.comments as { toggleReaction: (e: string, k: string, m: boolean) => Promise<void> },
      "toggleReaction",
    )

    addButton(el, "thread", "$a").click()
    await waitFor(() => pickers(el).length === 1, "picker to open")

    const emoji = pickers(el)[0].querySelector("button") as HTMLButtonElement
    const key = emoji.dataset.reactionKey as string
    emoji.click()
    await waitFor(() => toggle.mock.calls.length === 1, "toggleReaction to be called")

    // Surface is presentation only: the mutation targets the message id.
    expect(toggle).toHaveBeenCalledWith("$a", key, false)
  })

  it("closes the Thread picker when another transient opens", async () => {
    const el = await mount(fixtureWith([]))
    openThread(el, "$a")
    await waitFor(() => addButtons(el, "$a").length === 2, "both copies of $a to render")

    addButton(el, "thread", "$a").click()
    await waitFor(() => pickers(el).length === 1, "picker to open")

    // The main feed's own Add reaction replaces the Thread picker.
    addButton(el, "main", "$a").click()
    await waitFor(() => pickerSurfaces(el).join() === "main", "picker to move to the main feed")
    expect(pickers(el)).toHaveLength(1)
  })

  it("keeps a reaction pill's reactor details independent of the picker surface", async () => {
    const withReactors = makeMessage({
      event_id: "$a",
      content: { type: "text", body: "root body" } as unknown as Message["content"],
      reactions: [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ] as unknown as Message["reactions"],
    })
    const fixture: Fixture = {
      feed: [withReactors],
      threads: new Map([["$a", new Map([[1, { data: [], total: 0, totalPages: 1 }]])]]),
    }
    const el = await mount(fixture)

    const reactions = Array.from(
      el.shadowRoot.querySelectorAll('button[data-reaction-key="👍"]'),
    ) as HTMLButtonElement[]
    expect(reactions.length).toBeGreaterThan(0)
    reactions[0].dispatchEvent(new MouseEvent("mouseenter"))
    await waitFor(
      () => el.shadowRoot.querySelector(".reactor-panel") !== null,
      "reactor panel to appear",
    )
    // The picker is unrelated and must remain closed.
    expect(pickers(el)).toHaveLength(0)
  })
})
