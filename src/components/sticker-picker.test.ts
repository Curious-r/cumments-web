import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

const STICKER_PACKS = [
  {
    pack_id: "pack1",
    display_name: "Test Pack",
    images: [
      {
        shortcode: ":sticker1:",
        url: "https://example.com/s1.png",
        proxy_url: "https://example.com/s1.png",
      },
      {
        shortcode: ":sticker2:",
        url: "https://example.com/s2.png",
        proxy_url: "https://example.com/s2.png",
      },
    ],
  },
]

function mockFetch(stickers: unknown[] | null = STICKER_PACKS) {
  const orig = globalThis.fetch
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
    if (u.includes("/visitors/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
          }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/stickers")) {
      if (stickers === null) {
        // Simulate error
        throw new Error("network error")
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ packs: stickers }),
        text: async () => "",
        clone: () => ({ json: async () => ({ packs: stickers }) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
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
  }) as unknown as typeof fetch
  return orig
}

describe("Sticker picker", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource

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

  async function createEditor() {
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 200))
    await el.updateComplete.catch(() => {})
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor & {
      stickerPacks: unknown
      stickerLoading: boolean
    }
    // Expand editor
    const input = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 50))
    return { el, editor }
  }

  it("sticker trigger is present with accessible name", async () => {
    const { editor } = await createEditor()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain("Sticker")
  })

  it("successful response renders sticker packs", async () => {
    const { editor } = await createEditor()
    // Sticker packs should be loaded from runtime
    expect((editor as unknown as { stickerPacks: unknown[] }).stickerPacks).toBeTruthy()
    expect((editor as unknown as { stickerPacks: unknown[] }).stickerPacks.length).toBeGreaterThan(
      0,
    )
  })

  it("trigger has correct expanded state", async () => {
    const { editor } = await createEditor()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog")
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(btn.getAttribute("aria-expanded")).toBe("true")
  })

  it("picker is absent when closed and present when open", async () => {
    const { editor } = await createEditor()
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
  })

  it("picker uses dialog-like non-modal semantics", async () => {
    const { editor } = await createEditor()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
    expect(picker).toBeTruthy()
    expect(picker.getAttribute("aria-modal")).toBeNull()
    expect(picker.getAttribute("aria-label")).toBe("Stickers")
  })

  it("focus moves into picker when opened", async () => {
    const { editor } = await createEditor()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 60))
    const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
    const focused = document.activeElement as HTMLElement | null
    const shadowFocused = (
      document.querySelector("cumments-comments") as unknown as { shadowRoot: ShadowRoot }
    )?.shadowRoot?.activeElement as HTMLElement | null
    const active = shadowFocused ?? focused
    expect(picker.contains(active as Node) || active === picker).toBeTruthy()
  })

  it("Escape closes picker and returns focus", async () => {
    const { el, editor } = await createEditor()
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    // Send Escape to picker
    const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
    picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    await new Promise((r) => setTimeout(r, 20))
    const activeEl = (el.shadowRoot.activeElement ?? document.activeElement) as HTMLElement | null
    expect(activeEl === btn || document.activeElement === btn).toBeTruthy()
  })

  it("selecting a sticker closes picker, preserves draft, does not submit", async () => {
    const { editor } = await createEditor()
    // Set draft
    const input = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input.value = "hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("hello")
    let submitted = false
    let capturedDetail: unknown = null
    editor.addEventListener("cumments:submit", (e) => {
      capturedDetail = (e as CustomEvent).detail
      submitted = true
    })
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
    const stickerBtn = picker.querySelector("[data-sticker-url]") as HTMLButtonElement
    expect(stickerBtn).toBeTruthy()
    stickerBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
    // Draft should still be "hello" (not erased)
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("hello")
    // Selecting sticker must NOT submit
    expect(submitted).toBe(false)
    // Pending sticker should be stored
    expect((editor as unknown as { pendingSticker: unknown }).pendingSticker).toBeTruthy()
    // Explicit Submit should then dispatch with sticker
    const submitBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
    submitBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(submitted).toBe(true)
    expect((capturedDetail as { media?: { url: string } })?.media?.url).toContain(
      "https://example.com/s",
    )
  })

  it("old inline sticker panel is no longer rendered", async () => {
    const { editor } = await createEditor()
    // When closed, there should be no div with margin-top:6px and max-height:160px (old inline)
    expect(editor.innerHTML).not.toContain("max-height:160px")
    expect(editor.innerHTML).not.toContain(
      "margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;max-height:160px",
    )
    // When open, picker should be fixed (viewport-aware), not inline
    const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 40))
    const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
    expect(picker.style.position).toBe("fixed")
  })

  it("opening another transient closes sticker picker", async () => {
    const { el, editor } = await createEditor()
    const stickerBtn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    stickerBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    // Open reaction picker via plus button in comment (need a comment)
    // Instead, open identity popover
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLButtonElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 40))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
  })

  it("opening sticker picker closes other transient", async () => {
    const { el, editor } = await createEditor()
    // Open identity popover first
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLButtonElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 40))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]')).toBeTruthy()
    // Now open sticker picker
    const stickerBtn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    stickerBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]')).toBeNull()
  })

  it("multiple instances remain isolated", async () => {
    const { editor: editor1 } = await createEditor()
    // Create second instance
    const el2 = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el2.setAttribute("endpoint", "https://comments.curious.host")
    el2.setAttribute("site-id", "s")
    el2.setAttribute("page-slug", "p")
    document.body.appendChild(el2)
    await new Promise((r) => setTimeout(r, 200))
    await el2.updateComplete.catch(() => {})
    const editor2 = el2.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const input2 = editor2.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input2?.focus()
    await new Promise((r) => setTimeout(r, 30))
    const btn1 = editor1.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    const btn2 = editor2.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
    btn1.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor1.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    expect(editor2.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
    btn2.click()
    await new Promise((r) => setTimeout(r, 40))
    expect(editor2.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    expect(editor1.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    // They are isolated, both can be open independently
    el2.remove()
  })

  describe("Sticker data loading", () => {
    afterEach(() => {
      document.body.innerHTML = ""
    })

    it("empty response produces usable empty state", async () => {
      mockFetch([])
      const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
        shadowRoot: ShadowRoot
        updateComplete: Promise<unknown>
      }
      el.setAttribute("endpoint", "https://comments.curious.host")
      el.setAttribute("site-id", "s")
      el.setAttribute("page-slug", "p")
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 200))
      await el.updateComplete.catch(() => {})
      const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
      // Should have empty packs array
      expect((editor as unknown as { stickerPacks: unknown[] }).stickerPacks).toEqual([])
      // Open picker
      const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 40))
      // Should show "No stickers" empty state
      expect(editor.innerHTML).toContain("No stickers")
    })

    it("failed request produces usable failure state", async () => {
      mockFetch(null) // null triggers error
      const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
        shadowRoot: ShadowRoot
        updateComplete: Promise<unknown>
      }
      el.setAttribute("endpoint", "https://comments.curious.host")
      el.setAttribute("site-id", "s")
      el.setAttribute("page-slug", "p")
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 200))
      await el.updateComplete.catch(() => {})
      const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
      // Packs should be null on error
      expect((editor as unknown as { stickerPacks: unknown[] | null }).stickerPacks).toBeNull()
      // Text composition should still work
      const input = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      input.value = "still works"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("still works")
    })

    it("sticker selection creates pending content and submits through media path", async () => {
      const { editor } = await createEditor()
      let submitted = false
      let capturedDetail: unknown = null
      editor.addEventListener("cumments:submit", (e) => {
        capturedDetail = (e as CustomEvent).detail
        submitted = true
      })
      // Open picker
      const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 40))
      // Select a sticker
      const stickerBtn = editor.querySelector("[data-sticker-url]") as HTMLButtonElement
      expect(stickerBtn).toBeTruthy()
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      // Pending sticker should exist
      expect((editor as unknown as { pendingSticker: unknown }).pendingSticker).toBeTruthy()
      // Should NOT auto-submit
      expect(submitted).toBe(false)
      // Submit should include sticker as media
      const submitBtn = editor.querySelector(
        'button[aria-label="Post comment"]',
      ) as HTMLButtonElement
      submitBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      expect(submitted).toBe(true)
      expect((capturedDetail as { media?: { url: string } })?.media?.url).toContain(
        "https://example.com/s",
      )
    })

    it("pending sticker can be removed before Post", async () => {
      const { editor } = await createEditor()
      // Open picker and select sticker
      const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 40))
      const stickerBtn = editor.querySelector("[data-sticker-url]") as HTMLButtonElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 40))
      expect((editor as unknown as { pendingSticker: unknown }).pendingSticker).toBeTruthy()
      // Remove the pending sticker
      const removeBtn = editor.querySelector(
        'button[aria-label="Remove sticker"]',
      ) as HTMLButtonElement
      expect(removeBtn).toBeTruthy()
      removeBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      expect((editor as unknown as { pendingSticker: unknown }).pendingSticker).toBeNull()
    })

    it("Escape closes picker without clearing reply/thread context", async () => {
      const { el, editor } = await createEditor()
      // Set reply context
      editor.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete
      // Open picker
      const btn = editor.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 40))
      expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
      // Send Escape
      const picker = editor.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 40))
      // Picker should be closed
      expect(editor.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
      // Reply context should be preserved
      expect((editor as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })
  })
})
