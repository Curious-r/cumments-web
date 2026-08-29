import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"

// Mock EventSource
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

function mockFetch() {
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
    if (u.includes("/comments") && (init?.method === "QUERY" || u.includes("/comments"))) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } }),
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
  return orig
}

describe("<cumments-comments> lang BCP47", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let _origLocalStorage: Storage | undefined

  beforeEach(() => {
    origFetch = mockFetch()
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function renderWithLang(lang: string) {
    const el = document.createElement("cumments-comments") as HTMLElement & { lang: string }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    if (lang) el.setAttribute("lang", lang)
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    return el as unknown as HTMLElement & { shadowRoot: ShadowRoot }
  }

  it("renders zh-Hans UI", async () => {
    const el = await renderWithLang("zh-Hans")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("评论")
    expect(text).not.toContain("Comments")
  })

  it("renders en UI", async () => {
    const el = await renderWithLang("en")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
    expect(text).not.toContain("评论")
  })

  it("cmn-Hans resolves to zh-Hans", async () => {
    const el = await renderWithLang("cmn-Hans")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("评论")
    expect(text).not.toContain("Comments")
  })

  it("zh-CN resolves to zh-Hans", async () => {
    const el = await renderWithLang("zh-CN")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("评论")
  })

  it("en-GB resolves to en", async () => {
    const el = await renderWithLang("en-GB")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
  })

  it("zh-Hant falls back to default en", async () => {
    const el = await renderWithLang("zh-Hant")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
    expect(text).not.toContain("评论")
  })

  it("unsupported ja falls back to en", async () => {
    const el = await renderWithLang("ja")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
  })

  it("malformed lang falls back gracefully", async () => {
    const el = await renderWithLang("not-a-tag-@@")
    const text = el.shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
  })

  it("default lang is en when not specified", async () => {
    const el = document.createElement("cumments-comments") as HTMLElement & { lang: string }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    const text =
      (el as unknown as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot?.textContent ?? ""
    expect(text).toContain("Comments")
  })
})
