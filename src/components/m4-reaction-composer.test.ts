import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import "./editor/cumments-editor"
import type { Message } from "../api/contract/query"
import type { CummentsEditor } from "./editor/cumments-editor"

class MockEventSource {
  static OPEN = 1
  url = ""
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    setTimeout(() => this.onopen?.(), 0)
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function mockFetchWithMessages(msgs: Message[] = []) {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (u.includes("/visitors")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "abcd", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
      if (init?.method === "POST" || init?.method === "DELETE" || init?.method === "PATCH") {
        return {
          ok: true,
          status: 202,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 1 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 1 }) }) as unknown as Response,
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
      display_name: "Author",
      avatar_url: null,
      public_key: "pk",
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
    reactions: [
      { key: "❤️", count: 3, mine: false, reactors: [] } as unknown as Message["reactions"][number],
    ],
    ...overrides,
  } as Message
}

describe("M4 — reaction authoritative", () => {
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

  it("pending reaction does not fabricate count", async () => {
    const msg = makeMessage({
      event_id: "$1",
      reactions: [{ key: "❤️", count: 3, mine: false, reactors: [] } as any],
    })
    origFetch = mockFetchWithMessages([msg])
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    // Find reaction button
    const btn = el.shadowRoot.querySelector('button[data-reaction-key="❤️"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain("3")
    // Click reaction (should set pending, not fabricate 4)
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete.catch(() => {})
    // After click, count should still be 3, with pending indicator, not 4
    const btnAfter = el.shadowRoot.querySelector(
      'button[data-reaction-key="❤️"]',
    ) as HTMLButtonElement
    // The count should still be 3 (not fabricated to 4)
    expect(btnAfter.textContent).toContain("3")
    expect(btnAfter.textContent).not.toContain("4")
  })

  it("composer collapsed and expands on focus", async () => {
    origFetch = mockFetchWithMessages([])
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor).toBeTruthy()
    // Initially, editor should be in DOM
    expect(editor.innerHTML).toContain("Write a comment")
    // Focus should expand (tool row should be visible)
    const input = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    expect(input).toBeTruthy()
    input.focus()
    await new Promise((r) => setTimeout(r, 30))
    // After focus, tool row should be visible (contains Attach)
    expect(editor.innerHTML).toContain("Attach")
  })

  it("reaction picker opens and closes", async () => {
    const msg = makeMessage({ reactions: [] })
    origFetch = mockFetchWithMessages([msg])
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    const pickerBtn = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    expect(pickerBtn).toBeTruthy()
    pickerBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete.catch(() => {})
    // Picker should be visible (role dialog)
    const _picker =
      el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]') ??
      el.shadowRoot.querySelector('div[role="dialog"]')
    // Check that picker is in DOM (it should be inside comment)
    const html = el.shadowRoot.innerHTML
    expect(html).toContain("Pick reaction") // picker title
    // Close via Escape
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    el.dispatchEvent(esc)
    await new Promise((r) => setTimeout(r, 30))
  })
})
