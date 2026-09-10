import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"

type El = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }

/**
 * A guest whose profile/author record exists but carries no usable display
 * name. The backend may return `""` or a whitespace-only value here; neither
 * may surface as an empty name or a "?" avatar.
 */
type Blank = "" | "   "

function makeMessage(
  eventId: string,
  displayName: string | null,
  avatarUrl: string | null,
): Message {
  return {
    event_id: eventId,
    site_id: "my-blog",
    page_slug: "hello-world",
    author: {
      type: "visitor",
      display_name: displayName,
      avatar_url: avatarUrl,
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

describe("anonymous display name presentation", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let feed: Message[]
  let profileName: string | null

  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    localStorage.clear()
    feed = []
    profileName = null
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
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      const method = String(init?.method ?? "GET").toUpperCase()
      if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
      if (u.includes("/visitors/profile")) {
        return jsonResponse({
          visitor_id: "guest",
          display_name: profileName,
          avatar_url: null,
        })
      }
      if (u.includes("/comments")) {
        if (method === "POST") return jsonResponse({ submission_id: 1 }, 202)
        return jsonResponse({
          data: feed,
          meta: { total: feed.length, page: 1, per_page: 20, total_pages: 1 },
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector('[part="identity-capsule"]') !== null,
      "identity capsule to render",
    )
    await el.updateComplete.catch(() => {})
    return el
  }

  /** Avatar fallback initial rendered inside `root`, or null when none exists. */
  function fallbackInitial(root: ParentNode): string | null {
    const fallback = root.querySelector(".avatar-fallback")
    return fallback?.textContent?.trim() ?? null
  }

  const capsule = (el: El) =>
    el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement

  async function openPopover(el: El): Promise<HTMLElement> {
    capsule(el).click()
    await waitFor(
      () => el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]') !== null,
      "identity popover to open",
    )
    await el.updateComplete.catch(() => {})
    return el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]') as HTMLElement
  }

  describe.each<[string, Blank]>([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("with a %s display name", (_label, blank) => {
    it("shows Anonymous and an 'A' avatar in a comment", async () => {
      feed = [makeMessage("$a", blank, null)]
      const el = await mount()
      await waitFor(
        () => el.shadowRoot.querySelector('[part="list"] [role="article"]') !== null,
        "comment to render",
      )

      const article = el.shadowRoot.querySelector('[part="list"] [role="article"]') as HTMLElement
      expect(article.textContent).toContain("Anonymous")
      expect(fallbackInitial(article)).toBe("A")
      // The regression: an empty name produced "?" here.
      expect(fallbackInitial(article)).not.toBe("?")
    })

    it("shows Anonymous and an 'A' avatar in the identity capsule", async () => {
      profileName = blank
      const el = await mount()
      await waitFor(
        () => capsule(el).textContent?.includes("Anonymous") === true,
        "capsule to show the anonymous name",
      )
      expect(capsule(el).textContent).toContain("Anonymous")
      expect(fallbackInitial(capsule(el))).toBe("A")
    })

    it("shows Anonymous and an 'A' avatar in the identity popover and profile dialog", async () => {
      profileName = blank
      const el = await mount()
      const popover = await openPopover(el)

      const profileSection = popover.querySelector(
        '[data-identity-section="profile"]',
      ) as HTMLElement
      expect(profileSection.textContent).toContain("Anonymous")
      expect(fallbackInitial(profileSection)).toBe("A")

      ;(profileSection.querySelector('[aria-label="Edit profile"]') as HTMLElement).click()
      await waitFor(
        () => el.shadowRoot.querySelector("input[aria-label='Profile display name']") !== null,
        "profile dialog to open",
      )
      await el.updateComplete.catch(() => {})
      const dialog = el.shadowRoot.querySelector(
        '[role="dialog"][aria-modal="true"]',
      ) as HTMLElement
      expect(dialog.textContent).toContain("Anonymous")
      expect(fallbackInitial(dialog)).toBe("A")
    })

    it("shows Anonymous and an 'A' avatar in the composer profile context", async () => {
      profileName = blank
      const el = await mount()
      const editor = el.shadowRoot.querySelector("cumments-editor") as HTMLElement
      await waitFor(
        () => editor.textContent?.includes("Anonymous") === true,
        "composer to show the anonymous name",
      )
      const profileButton = editor.querySelector('[aria-label="Edit profile"]') as HTMLElement
      expect(profileButton.textContent).toContain("Anonymous")
      expect(fallbackInitial(profileButton)).toBe("A")
    })
  })

  it("leaves a real profile name unchanged", async () => {
    profileName = "Alice"
    feed = [makeMessage("$a", "Alice", null)]
    const el = await mount()
    await waitFor(
      () => el.shadowRoot.querySelector('[part="list"] [role="article"]') !== null,
      "comment to render",
    )

    const article = el.shadowRoot.querySelector('[part="list"] [role="article"]') as HTMLElement
    expect(article.textContent).toContain("Alice")
    expect(fallbackInitial(article)).toBe("A")

    expect(capsule(el).textContent).toContain("Alice")
    expect(fallbackInitial(capsule(el))).toBe("A")
  })

  it("normalizes a whitespace-padded real name for display", async () => {
    profileName = " Alice "
    const el = await mount()
    await waitFor(
      () => capsule(el).textContent?.includes("Alice") === true,
      "capsule to show the trimmed name",
    )
    expect(capsule(el).textContent).toContain("Alice")
    expect(fallbackInitial(capsule(el))).toBe("A")
  })
})
