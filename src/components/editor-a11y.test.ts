import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./editor/cumments-editor"

describe("Composer accessibility", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  async function createEditor(props: Record<string, unknown> = {}) {
    const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
      updateComplete: Promise<void>
    }
    Object.assign(el, props)
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
    // Expand editor by focusing textarea
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
    return el
  }

  describe("semantics", () => {
    it("toolbar actions are actual buttons", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      const postBtn = el.querySelector('button[aria-label="Post comment"]')
      expect(emojiBtn).toBeTruthy()
      expect(stickerBtn).toBeTruthy()
      expect(moreBtn).toBeTruthy()
      expect(postBtn).toBeTruthy()
    })

    it("icon-only controls have accessible names", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      expect(emojiBtn?.getAttribute("aria-label")).toBe("Emoji")
      expect(stickerBtn?.getAttribute("aria-label")).toBe("Stickers")
      expect(moreBtn?.getAttribute("aria-label")).toBe("More composer actions")
    })

    it("disabled Post uses native disabled attribute", async () => {
      const el = await createEditor()
      const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      // Post should be disabled when empty
      expect(postBtn.disabled).toBe(true)
    })

    it("remove controls are keyboard accessible buttons", async () => {
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      // Open sticker picker and select a sticker
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      const stickerItem = el.querySelector("[data-sticker-url]") as HTMLElement
      stickerItem.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Remove button should be a button element
      const removeBtn = el.querySelector('button[aria-label="Remove sticker"]') as HTMLButtonElement
      expect(removeBtn).toBeTruthy()
      expect(removeBtn.tagName).toBe("BUTTON")
    })
  })

  describe("focus lifecycle", () => {
    it("Emoji open -> search receives focus", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const searchInput = el.querySelector('.emoji-picker input[type="search"]') as HTMLInputElement
      expect(document.activeElement).toBe(searchInput)
    })

    it("Emoji selection -> textarea regains focus", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Click first emoji
      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLElement
      firstEmoji?.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      expect(document.activeElement).toBe(textarea)
    })

    it("Sticker open/close preserves predictable focus", async () => {
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Focus should be in the picker
      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      expect(picker.contains(document.activeElement as Node)).toBe(true)
      // Close with Escape
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Focus should return to Sticker button
      expect(document.activeElement).toBe(stickerBtn)
    })

    it("More open -> menu receives focus", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const menu = el.querySelector(".more-menu") as HTMLElement
      expect(menu.contains(document.activeElement as Node)).toBe(true)
      // Reset
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })

    it("More close -> trigger regains focus", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Close with Escape
      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      expect(document.activeElement).toBe(moreBtn)
      // Reset
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })
  })

  describe("state preservation", () => {
    it("transient popup close preserves text draft", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "Hello world"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await el.updateComplete?.catch(() => {})
      // Open and close emoji picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const picker = el.querySelector(".emoji-picker") as HTMLElement
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Draft should be preserved
      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("Hello world")
    })

    it("transient popup close preserves reply/thread context", async () => {
      const el = await createEditor()
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})
      // Open and close emoji picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const picker = el.querySelector(".emoji-picker") as HTMLElement
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })
  })

  describe("disabled/busy/error states", () => {
    it("uploading attachment -> Post disabled and aria-live present", async () => {
      const el = await createEditor({
        pendingMedia: {
          url: null,
          kind: "image/png",
          filename: "test.png",
          state: "uploading",
        },
      })
      const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      // Check for aria-live region
      const liveRegion = el.querySelector('[aria-live="polite"]')
      expect(liveRegion).toBeTruthy()
      expect(liveRegion?.textContent).toContain("Uploading")
    })

    it("failed attachment -> Post disabled and role=alert present", async () => {
      const el = await createEditor({
        pendingMedia: {
          url: null,
          kind: "image/png",
          filename: "test.png",
          state: "failed",
        },
      })
      const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      // Check for role=alert
      const alert = el.querySelector('[role="alert"]')
      expect(alert).toBeTruthy()
      expect(alert?.textContent).toContain("failed")
    })

    it("location failure -> error visible with role=alert", async () => {
      const el = await createEditor({
        locationError: "Location access denied",
      })
      const alert = el.querySelector('[role="alert"]')
      expect(alert).toBeTruthy()
      expect(alert?.textContent).toBe("Location access denied")
    })
  })

  describe("collapsed placeholder", () => {
    it("is keyboard accessible with role=button and tabindex", async () => {
      const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
        updateComplete: Promise<void>
      }
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      const placeholder = el.querySelector('[role="button"]') as HTMLElement
      expect(placeholder).toBeTruthy()
      expect(placeholder.getAttribute("tabindex")).toBe("0")
    })

    it("activates on Enter key", async () => {
      const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
        updateComplete: Promise<void>
      }
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      const placeholder = el.querySelector('[role="button"]') as HTMLElement
      placeholder.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      // Editor should be expanded (textarea visible)
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLElement
      expect(textarea).toBeTruthy()
    })
  })
})
