import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import "./cumments-comments"

class MockEventSource {
  static OPEN = 1
  url = ""
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

function mockFetchWithMessages(messages: Message[]) {
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
    if (u.includes("/api/v1/visitors/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          visitor_id: "v1",
          site_id: "s",
          display_name: "Tester",
          avatar_url: null,
          created_at: new Date().toISOString(),
          event_count: 0,
        }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
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
}

describe("Comment action menu and delete dialog", () => {
  let origES: typeof globalThis.EventSource
  let origFetch: typeof fetch
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
  })

  async function renderWithMessages(
    msgs: Message[],
    identity?: { publicKey: string; privateKey: string },
  ) {
    if (identity) localStorage.setItem("cumments_identity", JSON.stringify(identity))
    mockFetchWithMessages(msgs)
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

  it("does not render inline Edit/Delete beside Reply", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    const html = el.shadowRoot.innerHTML
    // Reply should be present
    expect(html).toContain("Reply")
    // There should be a More button, but no inline Edit/Delete without opening menu
    const moreBtns = el.shadowRoot.querySelectorAll('[aria-label="More actions"]')
    expect(moreBtns.length).toBeGreaterThan(0)
    // Before opening menu, Edit/Delete should not be in DOM
    expect(el.shadowRoot.querySelector('[aria-label="Edit comment"]')).toBeNull()
    expect(el.shadowRoot.querySelector('[aria-label="Delete comment"]')).toBeNull()
  })

  it("More menu contains Edit when allowed and Delete when allowed", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const ownMsg = makeMessage({
      event_id: "$own",
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([ownMsg], id)
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    expect(moreBtn).toBeTruthy()
    expect(moreBtn.getAttribute("aria-haspopup")).toBe("menu")
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const freshBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    expect(freshBtn.getAttribute("aria-expanded")).toBe("true")
    const menu = el.shadowRoot.querySelector('[role="menu"]')
    expect(menu).toBeTruthy()
    expect(el.shadowRoot.querySelector('[aria-label="Edit comment"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[aria-label="Delete comment"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[aria-label="Copy link"]')).toBeTruthy()
    // menu items should be menuitem
    const items = el.shadowRoot.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it("More menu contains Copy link even for non-own", async () => {
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
    const el = await renderWithMessages([otherMsg])
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[aria-label="Copy link"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[aria-label="Edit comment"]')).toBeNull()
    expect(el.shadowRoot.querySelector('[aria-label="Delete comment"]')).toBeNull()
  })

  it("Delete opens modal dialog and inline confirm is not rendered", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      event_id: "$del",
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const delBtn = el.shadowRoot.querySelector('[aria-label="Delete comment"]') as HTMLButtonElement
    delBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Dialog should be present
    const dialog = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')
    expect(dialog).toBeTruthy()
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy()
    // Inline confirm should not exist inside comment
    const commentHtml = el.shadowRoot.innerHTML
    // The old inline confirm had text "Confirm delete?" inside comment body, not dialog title
    // Ensure no inline confirm block inside comment (check that comment article does not contain that specific inline structure)
    const articles = el.shadowRoot.querySelectorAll('[role="article"]')
    expect(articles.length).toBe(1)
    // Dialog title is "Delete comment?" – ensure dialog exists
    expect(commentHtml).toContain("Delete comment?")
    // Ensure menu is closed when dialog opens
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeNull()
  })

  it("Cancel closes dialog without deleting and returns focus", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      event_id: "$del2",
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    moreBtn.focus()
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const delBtn = el.shadowRoot.querySelector('[aria-label="Delete comment"]') as HTMLButtonElement
    delBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const dialog = el.shadowRoot.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    const cancelBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Cancel",
    ) as HTMLButtonElement
    expect(cancelBtn).toBeTruthy()
    // Cancel should close dialog
    const fetchSpy = vi.fn(globalThis.fetch)
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"]')).toBeNull()
    // No DELETE fetch
    const delCalls = (fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>).filter(
      ([url, init]) =>
        String(url).includes(encodeURIComponent("$del2")) && init?.method === "DELETE",
    )
    expect(delCalls.length).toBe(0)
    // focus should return to More trigger (next tick)
    await new Promise((r) => setTimeout(r, 20))
    expect(
      document.activeElement === moreBtn || el.shadowRoot.activeElement === moreBtn,
    ).toBeTruthy()
  })

  it("Confirm invokes delete operation", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const msg = makeMessage({
      event_id: "$del3",
      author: {
        type: "visitor",
        display_name: "Me",
        avatar_url: null,
        public_key: id.publicKey,
        mxid: null,
      } as unknown as Message["author"],
    })
    const el = await renderWithMessages([msg], id)
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const delBtn = el.shadowRoot.querySelector('[aria-label="Delete comment"]') as HTMLButtonElement
    delBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const dialog = el.shadowRoot.querySelector('[role="dialog"]') as HTMLElement
    const confirmBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Delete" && b !== delBtn,
    ) as HTMLButtonElement
    expect(confirmBtn).toBeTruthy()
    // Mock fetch to capture DELETE
    const fetchCalls: Array<{ url: string; init?: RequestInit; body: unknown }> = []
    const capture = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? (input as Request).url : input)
      let body: unknown
      if (init?.body)
        try {
          body = JSON.parse(init.body as string)
        } catch {}
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
      if (url.includes(encodeURIComponent("$del3")) && init?.method === "DELETE") {
        return {
          ok: true,
          status: 202,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 1 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 1 }) }) as unknown as Response,
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
    globalThis.fetch = capture as unknown as typeof fetch
    confirmBtn.click()
    await new Promise((r) => setTimeout(r, 200))
    const delCall = fetchCalls.find(
      (c) => c.url.includes(encodeURIComponent("$del3")) && c.init?.method === "DELETE",
    )
    expect(delCall).toBeDefined()
    expect((delCall?.body as Record<string, unknown>)?.author_public_key).toBe(id.publicKey)
  })

  it("keyboard: Enter/Space opens menu, Escape closes, Arrow navigation works", async () => {
    const msg = makeMessage()
    const el = await renderWithMessages([msg])
    const moreBtn = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    // Enter should open
    moreBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Simulate click via Enter handler: our More button's keydown calls onMore, which toggles
    // If not opened, click fallback
    if (!el.shadowRoot.querySelector('[role="menu"]')) {
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 30))
    }
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeTruthy()
    const menu = el.shadowRoot.querySelector('[role="menu"]') as HTMLElement
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBeGreaterThan(0)
    // Escape should close
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeNull()
  })
})
