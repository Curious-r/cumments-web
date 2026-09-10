import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"

type Reactor = { display_name?: string | null; avatar_url?: string | null }
type Reaction = { key: string; count: number; mine: boolean; reactors: Reactor[] }

function makeMessage(eventId: string, reactions: Reaction[]): Message {
  return {
    event_id: eventId,
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
    reactions: reactions as unknown as Message["reactions"],
  } as Message
}

describe("reaction reactor details", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let serverMessages: Message[]

  function mockFetch() {
    const orig = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      const json = (data: unknown, status = 200) =>
        ({
          ok: status < 400,
          status,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => data,
          text: async () => "",
          clone: () => ({ json: async () => data }) as unknown as Response,
        }) as unknown as Response
      if (u.includes("/api/v1/challenge")) return json({ prefix: "test.", difficulty: 1 })
      if (u.includes("/visitors")) {
        return json({ visitor_id: "abcd", display_name: "Alice", avatar_url: null })
      }
      if (u.includes("/comments")) {
        if (init?.method === "POST" || init?.method === "DELETE" || init?.method === "PATCH") {
          return json({ submission_id: 1 }, 202)
        }
        return json({
          data: serverMessages,
          meta: { total: serverMessages.length, page: 1, per_page: 20, total_pages: 1 },
        })
      }
      return json({})
    }) as unknown as typeof fetch
    return orig
  }

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

  type Host = HTMLElement & {
    shadowRoot: ShadowRoot
    updateComplete: Promise<unknown>
    runtime: {
      comments: {
        toggleReaction: (eventId: string, key: string, mine: boolean) => Promise<void>
        refresh: () => Promise<void>
      }
    }
  }

  async function render(messages: Message[]): Promise<Host> {
    serverMessages = messages
    origFetch = mockFetch()
    const el = document.createElement("cumments-comments") as unknown as Host
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelectorAll("button[data-reaction-key]").length > 0,
      "reaction pills to render",
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

  function pill(el: Host, eventId: string, key: string): HTMLButtonElement {
    const buttons = Array.from(
      el.shadowRoot.querySelectorAll("button[data-reaction-key]"),
    ) as HTMLButtonElement[]
    const found = buttons.find(
      (b) => b.dataset.eventId === eventId && b.dataset.reactionKey === key,
    )
    if (!found) throw new Error(`reaction pill not found for ${eventId} ${key}`)
    return found
  }

  function panel(el: Host): HTMLElement | null {
    return el.shadowRoot.querySelector(".reactor-panel")
  }

  function hover(el: Host, button: HTMLElement) {
    button.dispatchEvent(new MouseEvent("mouseenter"))
    return el.updateComplete.catch(() => {})
  }

  function unhover(el: Host, button: HTMLElement) {
    button.dispatchEvent(new MouseEvent("mouseleave"))
    return el.updateComplete.catch(() => {})
  }

  it("shows the known reactors on hover and hides them on leave", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [{ display_name: "Alice" }, { display_name: "Bob" }],
        },
      ]),
    ])
    const button = pill(el, "$a", "👍")
    expect(button).toBeTruthy()
    expect(panel(el)).toBeNull()

    await hover(el, button)
    await waitFor(() => panel(el) !== null, "reactor panel to appear")
    const text = panel(el)?.textContent ?? ""
    expect(text).toContain("Alice")
    expect(text).toContain("Bob")

    await unhover(el, button)
    await waitFor(() => panel(el) === null, "reactor panel to disappear")
  })

  it("stays open while the pointer moves from the pill into the panel", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [
            { display_name: "Alice", avatar_url: "https://cdn/alice.png" },
            { display_name: "Bob", avatar_url: null },
          ],
        },
      ]),
    ])
    const button = pill(el, "$a", "👍")

    // 1. Hover the pill → panel appears.
    await hover(el, button)
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    // 2. Leave the pill; the pointer is now crossing the gap toward the panel.
    button.dispatchEvent(new MouseEvent("mouseleave"))
    // 3. Enter the panel before the transit grace elapses.
    const livePanel = panel(el) as HTMLElement
    livePanel.dispatchEvent(new MouseEvent("mouseenter"))

    // The panel must remain, and its content must still be intact.
    expect(panel(el)).toBeTruthy()
    const text = panel(el)?.textContent ?? ""
    expect(text).toContain("Alice")
    expect(text).toContain("Bob")
    // Avatar + fallback initial both survive the transition. Both render
    // through the shared <cumments-avatar> presentation.
    const avatars = panel(el)?.querySelectorAll("cumments-avatar") ?? []
    expect(avatars).toHaveLength(2)
    expect(avatars[0].querySelector("img.avatar-image")?.getAttribute("src")).toContain("alice")
    expect(avatars[1].querySelector(".avatar-fallback")?.textContent).toContain("B")

    // Still visible after the grace would have expired, because it is hovered.
    await new Promise((r) => setTimeout(r, 250))
    await el.updateComplete.catch(() => {})
    expect(panel(el)).toBeTruthy()

    // 4. Leave the panel → it closes.
    livePanel.dispatchEvent(new MouseEvent("mouseleave"))
    await waitFor(() => panel(el) === null, "reactor panel to close after leaving it")
  })

  it("keeps the bounded-sample indication while hovering the panel", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 5,
          mine: false,
          reactors: [{ display_name: "Alice" }, { display_name: "Bob" }],
        },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    // Re-entering the panel must not disturb the rendered sample or the count.
    const livePanel = panel(el) as HTMLElement
    livePanel.dispatchEvent(new MouseEvent("mouseleave"))
    livePanel.dispatchEvent(new MouseEvent("mouseenter"))
    expect(panel(el)?.textContent).toContain("and 3 others")
    expect(panel(el)?.textContent).toContain("Alice")
  })

  it("indicates that the reactor sample is bounded", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 5,
          mine: false,
          reactors: [{ display_name: "Alice" }, { display_name: "Bob" }],
        },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    const text = panel(el)?.textContent ?? ""
    expect(text).toContain("Alice")
    expect(text).toContain("Bob")
    // 5 reactors, 2 known → 3 unlisted. Must not present the sample as complete.
    expect(text).toContain("and 3 others")
  })

  it("uses the singular phrasing when exactly one reactor is unlisted", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 2, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")
    expect(panel(el)?.textContent).toContain("and 1 other")
  })

  it("shows nothing for an empty reactor sample", async () => {
    const el = await render([
      makeMessage("$a", [{ key: "👍", count: 4, mine: false, reactors: [] }]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await el.updateComplete.catch(() => {})
    expect(panel(el)).toBeNull()
  })

  it("falls back to a safe name and initial when a reactor has no profile data", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: null, avatar_url: null }],
        },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")
    expect(panel(el)?.textContent).toContain("Unknown")
  })

  it("exposes the same details on keyboard focus and hides on blur", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
    ])
    const button = pill(el, "$a", "👍")
    button.focus()
    await waitFor(() => panel(el) !== null, "reactor panel to appear on focus")
    expect(panel(el)?.getAttribute("role")).toBe("tooltip")
    expect(button.getAttribute("aria-describedby")).toBeTruthy()

    button.blur()
    await waitFor(() => panel(el) === null, "reactor panel to disappear on blur")
    expect(button.getAttribute("aria-describedby")).toBeNull()
  })

  it("keys the panel by message so identical emoji do not collide", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
      makeMessage("$b", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Bob" }] },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "panel for comment A")
    expect(panel(el)?.textContent).toContain("Alice")
    expect(panel(el)?.textContent).not.toContain("Bob")

    await unhover(el, pill(el, "$a", "👍"))
    await hover(el, pill(el, "$b", "👍"))
    await waitFor(() => (panel(el)?.textContent ?? "").includes("Bob"), "panel for comment B")
    expect(panel(el)?.textContent).not.toContain("Alice")
  })

  it("updates the panel when moving between two pills, with no stale content", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
      makeMessage("$b", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Bob" }] },
      ]),
    ])
    // Hover A, then move straight to B: no leave-then-settle in between.
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => (panel(el)?.textContent ?? "").includes("Alice"), "panel for comment A")

    await hover(el, pill(el, "$b", "👍"))
    await waitFor(() => (panel(el)?.textContent ?? "").includes("Bob"), "panel for comment B")
    expect(panel(el)?.textContent).not.toContain("Alice")

    // The pending hide from leaving A must not close B's panel.
    await new Promise((r) => setTimeout(r, 250))
    await el.updateComplete.catch(() => {})
    expect(panel(el)?.textContent).toContain("Bob")
  })

  it("renders reactor avatars through the shared presentation", async () => {
    const el = await render([
      makeMessage("$a", [
        {
          key: "👍",
          count: 3,
          mine: false,
          reactors: [
            { display_name: "Alice", avatar_url: "https://cdn/a.png" },
            { display_name: "Bob", avatar_url: null },
            { display_name: "Carol", avatar_url: "https://cdn/broken.png" },
          ],
        },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    const avatars = Array.from(
      panel(el)?.querySelectorAll("cumments-avatar") ?? [],
    ) as HTMLElement[]
    expect(avatars).toHaveLength(3)

    // Valid URL → image; missing URL → initial.
    expect(avatars[0].querySelector("img.avatar-image")?.getAttribute("src")).toBe(
      "https://cdn/a.png",
    )
    expect(avatars[1].querySelector("img")).toBeNull()
    expect(avatars[1].querySelector(".avatar-fallback")?.textContent?.trim()).toBe("B")

    // A failed load falls back rather than showing a broken icon.
    avatars[2].querySelector("img.avatar-image")?.dispatchEvent(new Event("error"))
    await waitFor(
      () => avatars[2].querySelector(".avatar-fallback") !== null,
      "reactor avatar to fall back after a load failure",
    )
    expect(avatars[2].querySelector(".avatar-fallback")?.textContent?.trim()).toBe("C")
  })

  it("does not toggle the reaction when only revealing reactors", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
    ])
    const toggle = vi.spyOn(el.runtime.comments, "toggleReaction")
    const button = pill(el, "$a", "👍")

    await hover(el, button)
    await waitFor(() => panel(el) !== null, "reactor panel to appear")
    expect(toggle).not.toHaveBeenCalled()

    // Clicking still runs the existing add/remove path.
    button.click()
    await waitFor(() => toggle.mock.calls.length === 1, "toggleReaction to be called")
    expect(toggle).toHaveBeenCalledWith("$a", "👍", false)
  })

  it("closes the panel when another transient popup opens", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    const addButton = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    addButton.click()
    await waitFor(() => panel(el) === null, "reactor panel to close for the picker")
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
  })

  it("closes the panel when the anchor message disappears", async () => {
    const el = await render([
      makeMessage("$a", [
        { key: "👍", count: 1, mine: false, reactors: [{ display_name: "Alice" }] },
      ]),
    ])
    await hover(el, pill(el, "$a", "👍"))
    await waitFor(() => panel(el) !== null, "reactor panel to appear")

    serverMessages = []
    await el.runtime.comments.refresh()
    await waitFor(() => panel(el) === null, "reactor panel to close with its anchor")
    expect(el.shadowRoot.querySelectorAll("button[data-reaction-key]").length).toBe(0)
  })
})
