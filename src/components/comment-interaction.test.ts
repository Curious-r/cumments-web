import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

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
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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

describe("Comment interaction coverage", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let origClipboard: unknown
  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    origClipboard = (navigator as unknown as { clipboard: unknown }).clipboard
    localStorage.clear()
    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      writable: true,
      configurable: true,
    })
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    Object.defineProperty(navigator, "clipboard", {
      value: origClipboard,
      writable: true,
      configurable: true,
    })
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  async function renderWithMessages(
    msgs: Message[],
    identity?: { publicKey: string; privateKey: string },
  ) {
    if (identity) localStorage.setItem("cumments_identity", JSON.stringify(identity))
    globalThis.fetch = mockFetchWithMessages(msgs) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 120))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  describe("Reply flow", () => {
    it("Reply → editor state → cancel → submit with replyTo only (no thread root)", async () => {
      const parent = makeMessage({
        event_id: "$parent",
        content: { type: "text", body: "parent message" } as any,
      })
      const el = await renderWithMessages([parent])
      const replyBtn = el.shadowRoot.querySelector(
        '[aria-label="Reply to comment"]',
      ) as HTMLButtonElement
      expect(replyBtn).toBeTruthy()

      // Click Reply
      replyBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})

      const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor & {
        currentReplyToId: string | null
      }
      expect(editor).toBeTruthy()
      // Verify editor received reply target via actual state/UI, not just helper
      expect(editor.currentReplyToId).toBe("$parent")
      expect(el.shadowRoot.innerHTML).toContain("Replying to")

      // Cancel via existing cancel mechanism (button or Escape)
      const cancelBtn = el.shadowRoot.querySelector(
        'button[aria-label="Cancel reply"]',
      ) as HTMLButtonElement
      // Fallback: also test Escape via editor
      if (cancelBtn) {
        cancelBtn.click()
      } else {
        const editorEl = el.shadowRoot.querySelector("cumments-editor") as HTMLElement
        editorEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      }
      await new Promise((r) => setTimeout(r, 40))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
      expect(editor.currentReplyToId).toBeNull()
      expect(el.shadowRoot.innerHTML).not.toContain("Replying to")

      // Set new reply again and submit
      replyBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      expect(editor.currentReplyToId).toBe("$parent")

      const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
      // Editor may be light DOM, need to focus to ensure input exists
      expect(draftInput).toBeTruthy()
      draftInput.value = "reply hello"
      draftInput.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))

      const fetchCalls: Array<{ url: string; body: unknown }> = []
      const captureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? (input as Request).url : input)
        let body: unknown
        if (init?.body) {
          try {
            body = JSON.parse(init.body as string)
          } catch {}
        }
        if (init?.method === "POST" && url.includes("/comments") && !url.includes("/reactions")) {
          fetchCalls.push({ url, body })
          return {
            ok: true,
            status: 202,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ submission_id: 1 }),
            text: async () => "",
            clone: () => ({ json: async () => ({ submission_id: 1 }) }) as unknown as Response,
          } as unknown as Response
        }
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
        if (url.includes("/comments")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              data: [parent],
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
      globalThis.fetch = captureFetch as unknown as typeof fetch

      const postBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn).toBeTruthy()
      postBtn.click()
      await new Promise((r) => setTimeout(r, 300))

      expect(fetchCalls.length).toBeGreaterThan(0)
      const body = fetchCalls[0].body as Record<string, unknown>
      expect(body.content).toBe("reply hello")
      expect(body.reply_to).toBe("$parent")
      // Ordinary Reply must not infer Thread membership from the reply target
      expect(body.thread_root).toBeNull()
    })
  })

  describe("Delete visibility", () => {
    it("own comment shows Delete, non-own does not", async () => {
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
        } as any,
      })
      const otherMsg = makeMessage({
        event_id: "$other",
        author: {
          type: "visitor",
          display_name: "Other",
          avatar_url: null,
          public_key: "other_pk",
          mxid: null,
        } as any,
      })
      const el = await renderWithMessages([ownMsg, otherMsg], id)
      const moreBtns = el.shadowRoot.querySelectorAll(
        '[aria-label="More actions"]',
      ) as NodeListOf<HTMLButtonElement>
      expect(moreBtns.length).toBe(2)

      // First is own
      moreBtns[0].click()
      await new Promise((r) => setTimeout(r, 40))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
      expect(el.shadowRoot.querySelector('[aria-label="Delete comment"]')).toBeTruthy()
      expect(el.shadowRoot.querySelector('[aria-label="Edit comment"]')).toBeTruthy()
      // Close via Escape
      const menu = el.shadowRoot.querySelector('[role="menu"]') as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))

      // Second is other
      moreBtns[1].click()
      await new Promise((r) => setTimeout(r, 40))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
      expect(el.shadowRoot.querySelector('[aria-label="Delete comment"]')).toBeNull()
      expect(el.shadowRoot.querySelector('[aria-label="Edit comment"]')).toBeNull()
      expect(el.shadowRoot.querySelector('[aria-label="Copy link"]')).toBeTruthy()
    })
  })

  describe("Copy link", () => {
    it("exposes Copy link and writes expected URL", async () => {
      const msg = makeMessage({ event_id: "$copyMe" })
      const el = await renderWithMessages([msg])
      const moreBtn = el.shadowRoot.querySelector(
        '[aria-label="More actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
      const copyBtn = el.shadowRoot.querySelector('[aria-label="Copy link"]') as HTMLButtonElement
      expect(copyBtn).toBeTruthy()

      const writeMock = vi.fn(async () => {})
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeMock },
        writable: true,
        configurable: true,
      })

      copyBtn.click()
      await new Promise((r) => setTimeout(r, 30))

      expect(writeMock).toHaveBeenCalledTimes(1)
      const copied = (writeMock.mock.calls[0] as unknown as [string])[0] as string
      expect(copied).toContain("#$copyMe")
      expect(copied).toContain(location.pathname)
      expect(typeof copied).toBe("string")
      expect(copied.length).toBeGreaterThan(0)
    })
  })
})
