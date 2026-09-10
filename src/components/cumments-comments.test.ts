import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"

// Mock EventSource
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

describe("<cumments-comments> location submission error boundary", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource

  beforeEach(() => {
    origFetch = globalThis.fetch
    origES = globalThis.EventSource
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  function mockFetch() {
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
      if (u.includes("/location")) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            detail: "location service unavailable",
            code: "internal-error",
          }),
          text: async () => "",
          clone: () =>
            ({
              json: async () => ({
                type: "about:blank",
                title: "Internal Server Error",
                status: 500,
                detail: "location service unavailable",
                code: "internal-error",
              }),
            }) as unknown as Response,
        } as unknown as Response
      }
      if (u.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [],
            meta: { total: 0, page: 1, per_page: 20, total_pages: 1 },
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

  async function renderComponent() {
    const el = document.createElement("cumments-comments") as HTMLElement & {
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 100))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    await new Promise((r) => setTimeout(r, 100))
    return el
  }

  it("failed location submission does not produce an unhandled Promise rejection", async () => {
    mockFetch()
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource

    const unhandledErrors: unknown[] = []
    const handler = (event: PromiseRejectionEvent) => {
      unhandledErrors.push(event.reason)
      event.preventDefault()
    }
    window.addEventListener("unhandledrejection", handler)

    try {
      const el = await renderComponent()
      const editor = el.shadowRoot.querySelector("cumments-editor") as unknown as {
        pendingLocation: string | null
        restoreDraft: (content: string) => void
        dispatchEvent: (e: Event) => boolean
      }

      Object.defineProperty(editor, "pendingLocation", {
        value: "geo:1,2",
        configurable: true,
        writable: true,
      })

      const event = new CustomEvent("cumments:submit", {
        detail: { content: "hello", displayName: "Tester", geoUri: "geo:1,2" },
        bubbles: true,
        composed: true,
      })
      editor.dispatchEvent(event)

      await new Promise((r) => setTimeout(r, 300))

      expect(unhandledErrors).toHaveLength(0)
    } finally {
      window.removeEventListener("unhandledrejection", handler)
    }
  })

  it("failed location submission surfaces error state in the UI", async () => {
    mockFetch()
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource

    const el = await renderComponent()
    const editor = el.shadowRoot.querySelector("cumments-editor") as unknown as {
      pendingLocation: string | null
      dispatchEvent: (e: Event) => boolean
    }

    Object.defineProperty(editor, "pendingLocation", {
      value: "geo:1,2",
      configurable: true,
      writable: true,
    })

    const event = new CustomEvent("cumments:submit", {
      detail: { content: "hello", displayName: "Tester", geoUri: "geo:1,2" },
      bubbles: true,
      composed: true,
    })
    editor.dispatchEvent(event)

    await new Promise((r) => setTimeout(r, 300))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})

    const shadowText = el.shadowRoot.textContent ?? ""
    expect(shadowText).toContain("location service unavailable")
  })

  it("failed location submission preserves draft so user can retry", async () => {
    mockFetch()
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource

    const el = await renderComponent()
    const editor = el.shadowRoot.querySelector("cumments-editor") as unknown as {
      pendingLocation: string | null
      restoreDraft: (content: string) => void
      dispatchEvent: (e: Event) => boolean
    }

    Object.defineProperty(editor, "pendingLocation", {
      value: "geo:1,2",
      configurable: true,
      writable: true,
    })

    let restoredContent: string | null = null
    editor.restoreDraft = (content: string) => {
      restoredContent = content
    }

    const event = new CustomEvent("cumments:submit", {
      detail: { content: "hello", displayName: "Tester", geoUri: "geo:1,2" },
      bubbles: true,
      composed: true,
    })
    editor.dispatchEvent(event)

    await new Promise((r) => setTimeout(r, 300))

    expect(restoredContent).toBe("hello")
  })

  it("successful location submission clears the pending location from the editor", async () => {
    // Use a fetch mock that returns success for location endpoint
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
      if (u.includes("/location")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 1 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 1 }) }) as unknown as Response,
        } as unknown as Response
      }
      if (u.includes("/comments")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [],
            meta: { total: 0, page: 1, per_page: 20, total_pages: 1 },
          }),
          text: async () => "",
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        } as unknown as Response
      }
      // SSE / other
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream(),
        text: async () => "",
        clone: () => ({ text: async () => "" }) as unknown as Response,
      } as unknown as Response
    }) as unknown as typeof fetch
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource

    const el = await renderComponent()
    const editor = el.shadowRoot.querySelector("cumments-editor") as unknown as {
      pendingLocation: string | null
      clearPendingLocation: () => void
      dispatchEvent: (e: Event) => boolean
    }

    Object.defineProperty(editor, "pendingLocation", {
      value: "geo:1,2",
      configurable: true,
      writable: true,
    })

    let cleared = false
    editor.clearPendingLocation = () => {
      cleared = true
      Object.defineProperty(editor, "pendingLocation", {
        value: null,
        configurable: true,
        writable: true,
      })
    }

    const event = new CustomEvent("cumments:submit", {
      detail: { content: "hello", displayName: "Tester", geoUri: "geo:1,2" },
      bubbles: true,
      composed: true,
    })
    editor.dispatchEvent(event)

    await new Promise((r) => setTimeout(r, 400))

    expect(cleared).toBe(true)
  })
})
