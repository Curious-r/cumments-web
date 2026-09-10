import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"

const LAT = 31.1234
const LNG = 121.5678
const GEO = `geo:${LAT},${LNG}`

type El = HTMLElement & {
  shadowRoot: ShadowRoot
  updateComplete: Promise<unknown>
  runtime: { comments: { refresh: () => Promise<void> } }
}
type Editor = HTMLElement & {
  pendingLocation: string | null
  currentDraft: string
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

function problemResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/problem+json" }),
    json: async () => ({
      type: "about:blank",
      title: "Location unavailable",
      status,
      detail: "location service unavailable",
      code: "location-unavailable",
    }),
    text: async () => "location service unavailable",
    clone: () => problemResponse(status),
  } as unknown as Response
}

/** `locationOk` is read per request so a retry can be observed deterministically. */
function makeFetch(locationOk: () => boolean) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    const method = init?.method ?? "GET"
    if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
    if (u.includes("/visitors/profile")) {
      return jsonResponse({
        visitor_id: "v1",
        site_id: "my-blog",
        display_name: "Tester",
        avatar_url: null,
        created_at: new Date().toISOString(),
        event_count: 0,
      })
    }
    if (u.includes("/pages/") && u.includes("/location")) {
      return locationOk() ? jsonResponse({ submission_id: 1 }, 202) : problemResponse(503)
    }
    if (u.includes("/comments")) {
      if (method === "POST") return jsonResponse({ submission_id: 1 }, 202)
      return jsonResponse({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } })
    }
    return jsonResponse({})
  })
}

describe("Location submission does not leak the geo URI into text", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let origGeo: Geolocation | undefined

  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    origGeo = navigator.geolocation
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    Object.defineProperty(navigator, "geolocation", {
      value: origGeo,
      writable: true,
      configurable: true,
    })
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  function mockGeolocation(): void {
    const mockPos = { coords: { latitude: LAT, longitude: LNG } } as unknown as GeolocationPosition
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (succ: PositionCallback) => succ(mockPos) },
      writable: true,
      configurable: true,
    })
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

  async function mount(locationOk: () => boolean): Promise<El> {
    globalThis.fetch = makeFetch(locationOk) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector("cumments-editor") !== null,
      "composer to render",
    )
    await el.updateComplete.catch(() => {})
    return el
  }

  const editorOf = (el: El): Editor =>
    el.shadowRoot.querySelector("cumments-editor") as unknown as Editor

  const textareaOf = (editor: Editor): HTMLTextAreaElement =>
    editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement

  function typeDraft(editor: Editor, text: string): void {
    const textarea = textareaOf(editor)
    textarea.value = text
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }

  /** Select a Location through the real toolbar button. */
  async function selectLocation(el: El): Promise<Editor> {
    mockGeolocation()
    const editor = editorOf(el)
    const btn = editor.querySelector('button[aria-label="Add location"]') as HTMLButtonElement
    if (!btn) throw new Error("Add location button not found")
    btn.click()
    await waitFor(
      () => (editorOf(el).pendingLocation ?? null) === GEO,
      "pending location to be set",
    )
    await el.updateComplete.catch(() => {})
    return editorOf(el)
  }

  /** Click Post and capture the emitted submit detail. */
  async function post(
    el: El,
    editor: Editor,
  ): Promise<{ content: string; geoUri?: string; displayName: string }> {
    let captured: { content: string; geoUri?: string; displayName: string } | null = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    if (!postBtn) throw new Error("Post button not found")
    postBtn.click()
    await waitFor(() => captured !== null, "cumments:submit to be dispatched")
    await el.updateComplete.catch(() => {})
    return captured as unknown as { content: string; geoUri?: string; displayName: string }
  }

  it("sends an empty content for a location-only submission", async () => {
    const el = await mount(() => true)
    const editor = await selectLocation(el)
    expect(editor.currentDraft).toBe("")

    const detail = await post(el, editor)

    expect(detail.geoUri).toBe(GEO)
    expect(detail.content).toBe("")
    // The geo URI must never travel as ordinary text content.
    expect(detail.content).not.toBe(GEO)
  })

  it("preserves user text alongside the location", async () => {
    const el = await mount(() => true)
    const editor = editorOf(el)
    typeDraft(editor, "Meet here")
    await el.updateComplete.catch(() => {})
    await selectLocation(el)

    const detail = await post(el, editorOf(el))

    expect(detail.content).toBe("Meet here")
    expect(detail.geoUri).toBe(GEO)
  })

  it("keeps the location pending while the request is in flight", async () => {
    let release!: (r: Response) => void
    const gate = new Promise<Response>((resolve) => {
      release = resolve
    })
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
      if (u.includes("/visitors/profile")) {
        return jsonResponse({ visitor_id: "v1", display_name: "Tester", avatar_url: null })
      }
      if (u.includes("/pages/") && u.includes("/location")) return gate
      if (u.includes("/comments")) {
        if (method === "POST") return jsonResponse({ submission_id: 1 }, 202)
        return jsonResponse({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector("cumments-editor") !== null,
      "composer to render",
    )
    const editor = await selectLocation(el)

    const submit = post(el, editor)
    await new Promise((r) => setTimeout(r, 20))

    // Still pending while the request is in flight: the lifecycle is preserved.
    expect(editorOf(el).pendingLocation).toBe(GEO)
    expect(textareaOf(editorOf(el)).value).toBe("")

    release(jsonResponse({ submission_id: 1 }, 202))
    const detail = await submit
    expect(detail.content).toBe("")
    expect(detail.geoUri).toBe(GEO)

    await waitFor(
      () => (editorOf(el).pendingLocation ?? null) === null,
      "pending location to clear after success",
    )
    // The textarea must never acquire the geo URI at any point.
    expect(textareaOf(editorOf(el)).value).toBe("")
    expect(editorOf(el).currentDraft).toBe("")
  })

  it("keeps the location available for retry after a failure without touching the textarea", async () => {
    let locationOk = false
    const el = await mount(() => locationOk)
    const editor = await selectLocation(el)

    // First attempt fails.
    const first = await post(el, editor)
    expect(first.geoUri).toBe(GEO)
    expect(first.content).toBe("")
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete.catch(() => {})

    // Location preview stays available; no geo URI leaked into the textarea.
    expect(editorOf(el).pendingLocation).toBe(GEO)
    expect(textareaOf(editorOf(el)).value).not.toContain("geo:")
    expect(textareaOf(editorOf(el)).value).toBe("")

    // Retry still submits through geoUri with empty content.
    locationOk = true
    const retry = await post(el, editorOf(el))
    expect(retry.geoUri).toBe(GEO)
    expect(retry.content).toBe("")
    expect(retry.content).not.toBe(GEO)
  })

  it("does not repopulate the textarea when a later attempt fails after success", async () => {
    // Reproduces the reported symptom end to end: a Location submission is
    // accepted, and a subsequent attempt for the same Location fails. The
    // failure path restores the submission's text content, so that content must
    // be the user's text (here: empty) and never the geo URI.
    let locationCalls = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      const method = init?.method ?? "GET"
      if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
      if (u.includes("/visitors/profile")) {
        return jsonResponse({ visitor_id: "v1", display_name: "Tester", avatar_url: null })
      }
      if (u.includes("/pages/") && u.includes("/location")) {
        locationCalls++
        return locationCalls === 1 ? jsonResponse({ submission_id: 1 }, 202) : problemResponse(409)
      }
      if (u.includes("/comments")) {
        if (method === "POST") return jsonResponse({ submission_id: 1 }, 202)
        return jsonResponse({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector("cumments-editor") !== null,
      "composer to render",
    )
    const editor = await selectLocation(el)
    const detail = await post(el, editor)
    expect(detail.content).toBe("")

    // Let the full submit/recovery sequence settle.
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})

    const textarea = textareaOf(editorOf(el))
    expect(textarea.value).toBe("")
    expect(textarea.value).not.toContain("geo:")
    expect(editorOf(el).currentDraft).not.toContain("geo:")
  })

  it("keeps the textarea empty across the post-submit refresh", async () => {
    const el = await mount(() => true)
    const editor = await selectLocation(el)
    const detail = await post(el, editor)
    expect(detail.content).toBe("")

    // Drive the same update/refresh sequence the component uses after a submit.
    await el.runtime.comments.refresh().catch(() => {})
    await el.updateComplete.catch(() => {})

    expect(textareaOf(editorOf(el)).value).toBe("")
    expect(editorOf(el).currentDraft).toBe("")
    expect(editorOf(el).currentDraft).not.toContain("geo:")
  })
})
