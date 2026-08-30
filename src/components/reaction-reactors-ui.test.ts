import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"

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
    event_id: "$msg1",
    site_id: "my-blog",
    page_slug: "hello-world",
    author: {
      type: "visitor",
      display_name: "Author",
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

function mockFetchWithReactions(messages: Message[]) {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
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

describe("Reaction reactors disclosure", () => {
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
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function renderWithMessages(msgs: Message[]) {
    origFetch = mockFetchWithReactions(msgs)
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 50))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    await el.updateComplete.catch(() => {})
    return el
  }

  function getReactionButtons(el: HTMLElement & { shadowRoot: ShadowRoot }) {
    const nodes = el.shadowRoot?.querySelectorAll("button[data-reactor-key]")
    return nodes ? (Array.from(nodes) as HTMLButtonElement[]) : []
  }

  function getTooltip(el: HTMLElement & { shadowRoot: ShadowRoot }) {
    return el.shadowRoot?.querySelector('[role="tooltip"]') as HTMLElement | null
  }

  it("renders reactors in server order", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 3,
          mine: false,
          reactors: [
            { display_name: "Alice", avatar_url: null },
            { display_name: "Bob", avatar_url: null },
            { display_name: "Carol", avatar_url: null },
          ],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    expect(btn).toBeDefined()
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)
    expect(tip).not.toBeNull()
    const names = Array.from(tip!.querySelectorAll('[part="reactor-name"]')).map(
      (n) => n.textContent,
    )
    expect(names).toEqual(["Alice", "Bob", "Carol"])
  })

  it("renders unknown profile as localized Unknown with generic avatar", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "❤️",
          count: 1,
          mine: false,
          reactors: [
            { display_name: null as unknown as string, avatar_url: null as unknown as string },
          ],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)!
    expect(tip.textContent).toContain("Unknown")
    const avatar = tip.querySelector('[part="reactor-avatar"]') as HTMLElement
    expect(avatar).not.toBeNull()
    expect(avatar.tagName).not.toBe("IMG")
  })

  it("others: count=1 reactors=1 no others", async () => {
    const reactors = [{ display_name: "User0", avatar_url: null }]
    const msg = makeMessage({
      reactions: [
        { key: "👍", count: 1, mine: false, reactors } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)!.querySelector('[part="reactor-others"]')).toBeNull()
  })

  it("others: count=5 reactors=5 no others", async () => {
    const reactors = Array.from({ length: 5 }, (_, i) => ({
      display_name: `User${i}`,
      avatar_url: null,
    }))
    const msg = makeMessage({
      reactions: [
        { key: "👍", count: 5, mine: false, reactors } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)!.querySelector('[part="reactor-others"]')).toBeNull()
  })

  it("others: count=8 reactors=5 shows 3 others", async () => {
    const reactors = Array.from({ length: 5 }, (_, i) => ({
      display_name: `User${i}`,
      avatar_url: null,
    }))
    const msg = makeMessage({
      reactions: [
        { key: "👍", count: 8, mine: false, reactors } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const othersEl = getTooltip(el)!.querySelector('[part="reactor-others"]')
    expect(othersEl?.textContent?.trim()).toContain("3 others")
  })

  it("hover does not open immediately, opens after 300ms", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
    expect(getTooltip(el)).toBeNull()
    await vi.advanceTimersByTimeAsync(250)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    vi.useRealTimers()
  })

  it("focus opens immediately", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
  })

  it("Escape closes and keeps focus", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).toBeNull()
    const active = document.activeElement === btn || el.shadowRoot.activeElement === btn
    expect(active).toBeTruthy()
  })

  it("touch short tap does not open disclosure and toggles once", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    expect(controller).not.toBeNull()
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    expect(getTooltip(el)).toBeNull()
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("touch long press opens disclosure and does not toggle", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    expect(controller).not.toBeNull()
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(600)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("long press cancellation on move >10px", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerType: "touch",
        clientX: 30,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(500)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).toBeNull()
    vi.useRealTimers()
  })

  it("long press cancellation on pointercancel and scroll", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "touch", bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)
    expect(getTooltip(el)).toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    window.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(500)
    expect(getTooltip(el)).toBeNull()
    vi.useRealTimers()
  })

  it("click suppression after long press, next tap works", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    expect(controller).not.toBeNull()
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(600)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).not.toHaveBeenCalled()
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("single-open: opening B closes A", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
        {
          key: "❤️",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Bob", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btns = getReactionButtons(el)
    expect(btns).toHaveLength(2)
    btns[0].focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(el.shadowRoot.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
    expect(getTooltip(el)!.textContent).toContain("Alice")
    btns[1].focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(el.shadowRoot.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
    expect(getTooltip(el)!.textContent).toContain("Bob")
    expect(getTooltip(el)!.textContent).not.toContain("Alice")
  })

  it("positioning: tooltip has reactor-panel part", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)
    expect(tip).not.toBeNull()
    expect(tip!.classList.contains("reactor-panel")).toBe(true)
    expect(tip!.getAttribute("part")).toContain("reactor-panel")
  })

  it("realtime: open panel updates without extra network", async () => {
    const initial = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([initial])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)!.textContent).toContain("Alice")
    const controller = (el as unknown as Record<string, unknown>).controller as {
      store: {
        loadPage: (r: {
          data: Message[]
          meta: { total: number; page: number; per_page: number; total_pages: number }
        }) => void
      }
    }
    const updated = makeMessage({
      event_id: "$msg1",
      reactions: [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [
            { display_name: "Alice", avatar_url: null },
            { display_name: "Bob", avatar_url: null },
          ],
        } as unknown as Message["reactions"][number],
      ],
    })
    controller.store.loadPage({
      data: [updated],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)!.textContent).toContain("Bob")
    expect(getTooltip(el)!.textContent).toContain("Alice")
  })

  it("accessibility: role tooltip, aria-describedby only while open, no title, no focusable children", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    expect(btn.getAttribute("title")).toBeNull()
    expect(btn.getAttribute("aria-describedby")).toBeFalsy()
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)!
    expect(tip.getAttribute("role")).toBe("tooltip")
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id)
    expect(btn.hasAttribute("aria-haspopup")).toBe(false)
    expect(btn.hasAttribute("aria-expanded")).toBe(false)
    expect(tip.querySelector("button, a, input")).toBeNull()
    expect(tip.textContent).toContain("Alice")
    btn.blur()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(btn.getAttribute("aria-describedby")).toBeFalsy()
    expect(getTooltip(el)).toBeNull()
  })

  it("long press with no compatibility click: next tap works (case B)", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    expect(controller).not.toBeNull()
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(600)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("suppression is one-shot: second click without new long-press is not suppressed", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(600)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).not.toHaveBeenCalled()
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("positioning: above placement when enough top space", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const anchorRect = {
      top: 200,
      bottom: 220,
      left: 100,
      right: 150,
      width: 50,
      height: 20,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect
    btn.getBoundingClientRect = () => anchorRect
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true })
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true })
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)
    expect(tip).not.toBeNull()
    tip!.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        bottom: 40,
        right: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    window.dispatchEvent(new Event("resize"))
    await new Promise((r) => setTimeout(r, 20))
    const top = parseFloat(tip!.style.top || "0")
    expect(top).toBe(152)
  })

  it("positioning: flips below when insufficient top space", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const anchorRect = {
      top: 2,
      bottom: 22,
      left: 100,
      right: 150,
      width: 50,
      height: 20,
      x: 100,
      y: 2,
      toJSON: () => ({}),
    } as DOMRect
    btn.getBoundingClientRect = () => anchorRect
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true })
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true })
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)!
    tip.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        bottom: 40,
        right: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    window.dispatchEvent(new Event("resize"))
    await new Promise((r) => setTimeout(r, 20))
    const top = parseFloat(tip.style.top || "0")
    expect(top).toBe(anchorRect.bottom + 8)
  })

  it("positioning: left clamp to 8", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const anchorRect = {
      top: 200,
      bottom: 220,
      left: 0,
      right: 50,
      width: 50,
      height: 20,
      x: 0,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect
    btn.getBoundingClientRect = () => anchorRect
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true })
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true })
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)!
    tip.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        bottom: 40,
        right: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    window.dispatchEvent(new Event("resize"))
    await new Promise((r) => setTimeout(r, 20))
    const left = parseFloat(tip.style.left || "0")
    expect(left).toBe(8)
  })

  it("positioning: right clamp keeps inside viewport", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const anchorRect = {
      top: 200,
      bottom: 220,
      left: 950,
      right: 1000,
      width: 50,
      height: 20,
      x: 950,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect
    btn.getBoundingClientRect = () => anchorRect
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true })
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true })
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip = getTooltip(el)!
    tip.getBoundingClientRect = () =>
      ({
        width: 200,
        height: 40,
        top: 0,
        left: 0,
        bottom: 40,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    window.dispatchEvent(new Event("resize"))
    await new Promise((r) => setTimeout(r, 20))
    const left = parseFloat(tip.style.left || "0")
    expect(left + 200).toBeLessThanOrEqual(1024 - 8)
  })

  it("positioning: anchor leaves viewport closes disclosure", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    btn.getBoundingClientRect = () =>
      ({
        top: 2000,
        bottom: 2020,
        left: 0,
        right: 50,
        width: 50,
        height: 20,
        x: 0,
        y: 2000,
        toJSON: () => ({}),
      }) as DOMRect
    window.dispatchEvent(new Event("scroll"))
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).toBeNull()
  })

  it("lifecycle: scroll/resize listeners removed after close", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const addSpy = vi.spyOn(window, "addEventListener")
    const removeSpy = vi.spyOn(window, "removeEventListener")
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true)
    btn.blur()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true)
  })

  it("lifecycle: disconnect cleans timers and listeners", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    el.remove()
    await vi.advanceTimersByTimeAsync(600)
    expect(getTooltip(el)).toBeNull()
    vi.useRealTimers()
  })

  it("gesture cancellation does not leave stale suppression", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerType: "touch",
        clientX: 30,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(getTooltip(el)).toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("touch short tap with focus does NOT open disclosure", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Simulate short touch sequence with focus
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(getTooltip(el)).toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(getTooltip(el)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("long touch with focus: focus does not open, long-press does", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    const controller = (el as unknown as Record<string, unknown>).controller as {
      toggleReaction: (a: string, b: string, c: boolean) => Promise<void>
    } | null
    const spy = vi.spyOn(controller!, "toggleReaction").mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(getTooltip(el)).toBeNull()
    await vi.advanceTimersByTimeAsync(600)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("keyboard focus after touch still opens disclosure", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    // short touch
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    vi.useRealTimers()
    // Now simulate keyboard Tab focus after touch ends
    await new Promise((r) => setTimeout(r, 10))
    btn.blur()
    await new Promise((r) => setTimeout(r, 10))
    btn.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
  })

  it("mouse hover after touch still opens disclosure", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    const btn = getReactionButtons(el)[0]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    )
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 10))
    // mouse hover
    vi.useFakeTimers({ shouldAdvanceTime: true })
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(350)
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(getTooltip(el)).not.toBeNull()
    vi.useRealTimers()
  })

  it("tooltip IDs are unique across component instances", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const el1 = await renderWithMessages([msg])
    const el2 = await renderWithMessages([msg])
    const btn1 = el1.shadowRoot.querySelector("button[data-reactor-key]") as HTMLButtonElement
    const btn2 = el2.shadowRoot.querySelector("button[data-reactor-key]") as HTMLButtonElement
    btn1.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el1 as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip1 = el1.shadowRoot.querySelector('[role="tooltip"]') as HTMLElement
    expect(tip1).not.toBeNull()
    const tip1Id = tip1.id
    expect(tip1Id).not.toContain("$msg1")
    expect(tip1Id).not.toContain("👍")
    expect(tip1Id).toMatch(/^reactor-tip-c\d+-\d+$/)
    expect(btn1.getAttribute("aria-describedby")).toBe(tip1Id)
    // Focus second instance - first will blur and close, but IDs should remain unique
    btn2.focus()
    await new Promise((r) => setTimeout(r, 10))
    await (el2 as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const tip2 = el2.shadowRoot.querySelector('[role="tooltip"]') as HTMLElement
    expect(tip2).not.toBeNull()
    expect(tip2.id).not.toBe(tip1Id)
    expect(tip2.id).not.toContain("$msg1")
    expect(tip2.id).toMatch(/^reactor-tip-c\d+-\d+$/)
    expect(btn2.getAttribute("aria-describedby")).toBe(tip2.id)
  })

  it("deterministic tooltip IDs are collision-free across many instances", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "❤️",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Bob", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const instances: Array<HTMLElement & { shadowRoot: ShadowRoot }> = []
    const ids = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const el = await renderWithMessages([msg])
      instances.push(el)
      const btn = el.shadowRoot.querySelector("button[data-reactor-key]") as HTMLButtonElement
      btn.focus()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
      const tip = el.shadowRoot.querySelector('[role="tooltip"]') as HTMLElement
      expect(tip).not.toBeNull()
      expect(tip.id).toMatch(/^reactor-tip-c\d+-\d+$/)
      expect(tip.id).not.toContain("$msg1")
      expect(tip.id).not.toContain("❤️")
      expect(ids.has(tip.id)).toBe(false)
      ids.add(tip.id)
      btn.blur()
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(ids.size).toBe(5)
  })
})
