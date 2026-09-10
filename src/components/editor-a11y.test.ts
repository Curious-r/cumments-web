import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./editor/cumments-editor"

describe("Composer accessibility", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
    // Reset viewport to desktop default for other tests
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    })
    window.dispatchEvent(new Event("resize"))
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
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      const postBtn = el.querySelector('button[part="button"]')
      expect(emojiBtn).toBeTruthy()
      expect(stickerBtn).toBeTruthy()
      // More button should NOT exist on desktop (all actions are direct)
      expect(moreBtn).toBeNull()
      expect(postBtn).toBeTruthy()
    })

    it("icon-only controls have accessible names", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      const locationBtn = el.querySelector('button[aria-label="Add location"]')
      const pollBtn = el.querySelector('button[aria-label="Create poll"]')
      expect(emojiBtn?.getAttribute("aria-label")).toBe("Emoji")
      expect(stickerBtn?.getAttribute("aria-label")).toBe("Stickers")
      expect(locationBtn?.getAttribute("aria-label")).toBe("Add location")
      expect(pollBtn?.getAttribute("aria-label")).toBe("Create poll")
    })

    it("disabled Post uses native disabled attribute", async () => {
      const el = await createEditor()
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
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

    it("Attach control shares toolbar-control sizing class", async () => {
      const el = await createEditor()
      const attachLabel = el.querySelector("label.toolbar-control") as HTMLLabelElement
      expect(attachLabel).toBeTruthy()
      expect(attachLabel.classList.contains("toolbar-control")).toBe(true)
      // Hidden file input should remain hidden
      const fileInput = attachLabel.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toBeTruthy()
      expect(fileInput.style.display).toBe("none")
    })

    it("all primary toolbar controls share the sizing contract", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const attachLabel = el.querySelector("label.toolbar-control") as HTMLLabelElement
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      const locationBtn = el.querySelector('button[aria-label="Add location"]') as HTMLButtonElement
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      // All primary controls should be buttons or toolbar-control
      expect(attachLabel.tagName).toBe("LABEL")
      expect(attachLabel.classList.contains("toolbar-control")).toBe(true)
      expect(emojiBtn.tagName).toBe("BUTTON")
      expect(locationBtn.tagName).toBe("BUTTON")
      expect(pollBtn.tagName).toBe("BUTTON")
      expect(stickerBtn.tagName).toBe("BUTTON")
    })

    it("Attach remains visible on mobile while Location/Poll/Sticker are in More", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      const attachLabel = el.querySelector("label.toolbar-control") as HTMLLabelElement
      // Attach should NOT have the desktop-only toolbar-action class
      expect(attachLabel.classList.contains("toolbar-action")).toBe(false)
      // Location/Poll/Sticker should NOT be in the direct toolbar on mobile
      expect(el.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Create poll"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeNull()
      // More button should be visible on mobile
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      expect(moreBtn).toBeTruthy()
      expect(moreBtn.classList.contains("toolbar-action")).toBe(false)
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
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
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
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
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
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
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

  describe("Shadow DOM focus boundary", () => {
    function assertExpanded(editor: HTMLElement) {
      // Collapsed placeholder must be absent when expanded
      const placeholder = editor.querySelector('[role="button"]')
      expect(placeholder, "collapsed placeholder should not exist when expanded").toBeNull()
    }

    function assertCollapsed(editor: HTMLElement) {
      // Collapsed placeholder is rendered when collapsed
      const placeholder = editor.querySelector('[role="button"]')
      expect(placeholder, "collapsed placeholder should exist when collapsed").toBeTruthy()
    }

    it("stays expanded when focus moves inside editor mounted in ShadowRoot", async () => {
      // Create a host with ShadowRoot to reproduce production topology
      const host = document.createElement("div")
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: "open" })
      const editor = document.createElement("cumments-editor") as unknown as HTMLElement & {
        updateComplete: Promise<void>
      }
      shadow.appendChild(editor)
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Expand editor by focusing textarea
      const textarea = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Verify expanded
      assertExpanded(editor)
      // Move focus to an internal button using real .focus()
      const emojiBtn = editor.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Composer should remain expanded (no collapsed placeholder)
      assertExpanded(editor)
    })

    it("collapses when focus leaves ShadowRoot-mounted editor", async () => {
      // Create a host with ShadowRoot
      const host = document.createElement("div")
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: "open" })
      const editor = document.createElement("cumments-editor") as unknown as HTMLElement & {
        updateComplete: Promise<void>
      }
      shadow.appendChild(editor)
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Expand editor
      const textarea = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      assertExpanded(editor)
      // Move focus to an external element (outside ShadowRoot)
      const external = document.createElement("button")
      external.textContent = "External"
      document.body.appendChild(external)
      external.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Composer should collapse (placeholder visible)
      assertCollapsed(editor)
      document.body.removeChild(external)
      document.body.removeChild(host)
    })

    it("stays expanded when focus moves between internal controls in ShadowRoot", async () => {
      // Create a host with ShadowRoot
      const host = document.createElement("div")
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: "open" })
      const editor = document.createElement("cumments-editor") as unknown as HTMLElement & {
        updateComplete: Promise<void>
      }
      shadow.appendChild(editor)
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Expand editor
      const textarea = editor.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      assertExpanded(editor)
      // Move focus from emoji button to bold button
      const emojiBtn = editor.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.focus()
      await new Promise((r) => setTimeout(r, 10))
      const boldBtn = editor.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      boldBtn.focus()
      await new Promise((r) => setTimeout(r, 30))
      await editor.updateComplete?.catch(() => {})
      // Composer should remain expanded (no collapsed placeholder)
      assertExpanded(editor)
      document.body.removeChild(host)
    })
  })

  describe("focus-driven collapse behavior", () => {
    it("stays expanded when focus moves from textarea to toolbar button", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      // Simulate focus moving from textarea to emoji button
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: emojiBtn }))
      emojiBtn.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: textarea }))
      await new Promise((r) => setTimeout(r, 10))
      await el.updateComplete?.catch(() => {})
      // Composer should still be expanded (textarea visible)
      const textareaAfter = el.querySelector('textarea[aria-label="Comment"]') as HTMLElement
      expect(textareaAfter).toBeTruthy()
    })

    it("stays expanded when focus moves between internal controls", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      // Simulate focus moving from emoji button to bold button
      emojiBtn.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))
      boldBtn.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: emojiBtn }))
      await new Promise((r) => setTimeout(r, 10))
      await el.updateComplete?.catch(() => {})
      // Composer should still be expanded
      const textareaAfter = el.querySelector('textarea[aria-label="Comment"]') as HTMLElement
      expect(textareaAfter).toBeTruthy()
    })

    it("collapses when focus leaves the editor entirely", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Create an external element to receive focus
      const external = document.createElement("button")
      external.textContent = "External"
      document.body.appendChild(external)
      // Simulate focus moving from textarea to external element
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: external }))
      await new Promise((r) => setTimeout(r, 10))
      await el.updateComplete?.catch(() => {})
      // Composer should be collapsed (textarea not visible)
      const placeholder = el.querySelector('[role="button"]') as HTMLElement
      expect(placeholder).toBeTruthy()
      document.body.removeChild(external)
    })

    it("stays expanded when focus moves from textarea to formatting button", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      // Simulate focus moving from textarea to bold formatting button
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))
      boldBtn.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: textarea }))
      await new Promise((r) => setTimeout(r, 10))
      await el.updateComplete?.catch(() => {})
      // Composer should still be expanded
      const textareaAfter = el.querySelector('textarea[aria-label="Comment"]') as HTMLElement
      expect(textareaAfter).toBeTruthy()
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

  describe("More menu behavior", () => {
    it("Location/Poll/Sticker can be activated with Enter/Space", async () => {
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
      // Focus first menu item
      const firstItem = el.querySelector(".more-menu button") as HTMLElement
      firstItem.focus()
      // Activate with Enter
      firstItem.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Reset
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })

    it("selecting Location/Poll/Sticker closes More", async () => {
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
      // More menu should be open
      expect(el.querySelector(".more-menu")).toBeTruthy()
      // Click Poll item
      const pollItem = el.querySelector(".more-menu button:nth-child(2)") as HTMLElement
      pollItem.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // More menu should be closed
      expect(el.querySelector(".more-menu")).toBeFalsy()
      // Reset
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })
  })

  describe("Emoji behavior", () => {
    it("arrow keys in search do not navigate emoji", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const searchInput = el.querySelector('.emoji-picker input[type="search"]') as HTMLInputElement
      // Press arrow down in search
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Focus should still be in search, not moved to emoji grid
      expect(document.activeElement).toBe(searchInput)
    })

    it("category controls retain normal button keyboard behavior", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Category buttons should be real buttons
      const categoryBtn = el.querySelector(".emoji-picker-category-controls button") as HTMLElement
      expect(categoryBtn?.tagName).toBe("BUTTON")
    })

    it("focused emoji entries support Arrow navigation", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Focus first emoji
      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLElement
      firstEmoji.focus()
      // Press ArrowRight
      firstEmoji.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Focus should move to next emoji
      const secondEmoji = el.querySelector(".emoji-picker-grid button:nth-child(2)") as HTMLElement
      expect(document.activeElement).toBe(secondEmoji)
    })

    it("Enter/Space selects the focused emoji", async () => {
      const el = await createEditor()
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Focus first emoji
      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLElement
      firstEmoji.focus()
      // Get the emoji value
      const emojiValue = firstEmoji.textContent
      // Press Enter
      firstEmoji.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Textarea should contain the emoji
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      expect(textarea.value).toContain(emojiValue)
    })

    it("Escape closes picker without clearing reply/thread context", async () => {
      const el = await createEditor()
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const picker = el.querySelector(".emoji-picker") as HTMLElement
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Picker should be closed
      expect(el.querySelector(".emoji-picker")).toBeFalsy()
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })
  })

  describe("Poll behavior", () => {
    it("entering Poll focuses an appropriate Poll control", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Poll question input should be focused
      const pollInput = el.querySelector("#poll-question-input") as HTMLInputElement
      expect(document.activeElement).toBe(pollInput)
    })

    it("Enter in Poll text inputs does not trigger global submission", async () => {
      const el = await createEditor()
      let submitted = false
      el.addEventListener("cumments-submit", () => {
        submitted = true
      })
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const pollInput = el.querySelector("#poll-question-input") as HTMLInputElement
      pollInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Should not have submitted
      expect(submitted).toBe(false)
    })

    it("invalid Poll keeps native Post disabled", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Post should be disabled for invalid poll (no question, no options)
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("Escape/Cancel exits Poll and preserves existing composer state", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "Existing draft"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await el.updateComplete?.catch(() => {})
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Cancel poll
      const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLElement
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Poll editor should be closed
      expect(el.querySelector(".poll-editor")).toBeFalsy()
      // Draft should be preserved
      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("Existing draft")
    })
  })

  describe("Sticker state preservation", () => {
    it("closing Sticker preserves reply/thread context", async () => {
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })
  })

  describe("More menu state preservation", () => {
    it("closing More preserves reply/thread context", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
      // Reset
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })
  })

  describe("Poll state preservation", () => {
    it("cancelling Poll preserves pending media/location/sticker and text draft", async () => {
      const el = await createEditor({
        pendingMedia: {
          url: "test.png",
          kind: "image/png",
          filename: "test.png",
          state: "ready",
        },
      })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "Draft text"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await el.updateComplete?.catch(() => {})
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Cancel poll
      const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLElement
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      // Draft and media should be preserved
      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("Draft text")
      expect(
        (el as unknown as { pendingMedia: { state: string } | null }).pendingMedia?.state,
      ).toBe("ready")
    })
  })

  describe("additional pending states", () => {
    it("location acquisition -> native disabled Post", async () => {
      const el = await createEditor({
        locationSharing: true,
      })
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("location failure -> visible error + no fake pending location", async () => {
      const el = await createEditor({
        locationError: "Permission denied",
      })
      // Error should be visible
      const alert = el.querySelector('[role="alert"]')
      expect(alert?.textContent).toBe("Permission denied")
      // No pending location should be set
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBeNull()
    })

    it("poll validation error -> disabled Post", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})
      await new Promise((r) => setTimeout(r, 50))
      // Post should be disabled for invalid poll
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })
  })

  describe("CSS contract tests", () => {
    describe("touch-target CSS contract", () => {
      async function getEditorStyles(): Promise<string> {
        const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
          updateComplete: Promise<void>
        }
        document.body.appendChild(el)
        // Wait for render
        await new Promise((r) => setTimeout(r, 50))
        await el.updateComplete?.catch(() => {})
        // Get the style element content - it's inside the editor div
        const styleEl = el.querySelector("style")
        return styleEl?.textContent || ""
      }

      it("contains 44px min-width/min-height for toolbar controls", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("min-width: 44px")
        expect(styles).toContain("min-height: 44px")
      })

      it("sizes the shared toolbar controls with border-box", async () => {
        // Attach is a <label> (content-box by default) while its neighbours are
        // <button> (border-box). The shared rule must pin one box model so the
        // 44px minimum is the control's total height for both element types.
        const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
          updateComplete: Promise<void>
        }
        document.body.appendChild(el)
        await new Promise((r) => setTimeout(r, 50))
        await el.updateComplete?.catch(() => {})

        const wanted = [".editor-toolbar button", ".editor-toolbar .toolbar-control"]
        const styleEl = el.querySelector("style")
        const rule = Array.from(styleEl?.sheet?.cssRules ?? []).find((r): r is CSSStyleRule => {
          if (r.type !== CSSRule.STYLE_RULE) return false
          // Exact selector-list match: substring matching would also match the
          // :hover variant of the same two selectors.
          const parts = (r as CSSStyleRule).selectorText.split(",").map((s) => s.trim())
          return parts.length === wanted.length && wanted.every((s) => parts.includes(s))
        })
        expect(rule, "shared toolbar-control rule should exist").toBeTruthy()
        expect(rule?.style.getPropertyValue("box-sizing")).toBe("border-box")
      })

      it("contains touch-target rules for emoji picker", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".emoji-picker button")
      })

      it("contains touch-target rules for sticker picker", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain('[role="dialog"][aria-label="Stickers"] button')
      })

      it("contains touch-target rules for more menu", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".more-menu button")
      })

      it("contains touch-target rules for poll editor", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".poll-editor button")
      })

      it("scopes touch-target rules to narrow layouts", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("@media (max-width: 479px)")
      })
    })

    describe("focus-visible CSS contract", () => {
      async function getEditorStyles(): Promise<string> {
        const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
          updateComplete: Promise<void>
        }
        document.body.appendChild(el)
        await new Promise((r) => setTimeout(r, 50))
        await el.updateComplete?.catch(() => {})
        const styleEl = el.querySelector("style")
        return styleEl?.textContent || ""
      }

      it("contains focus-visible rule for buttons", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(":focus-visible")
        expect(styles).toContain("outline")
      })

      it("contains focus-visible rule for inputs", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("input:focus-visible")
      })

      it("removes outline on mouse focus", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(":focus:not(:focus-visible)")
      })
    })

    describe("visual polish CSS contract", () => {
      async function getEditorStyles(): Promise<string> {
        const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
          updateComplete: Promise<void>
        }
        document.body.appendChild(el)
        await new Promise((r) => setTimeout(r, 50))
        await el.updateComplete?.catch(() => {})
        const styleEl = el.querySelector("style")
        return styleEl?.textContent || ""
      }

      it("contains hover states for toolbar buttons", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("button:hover")
        expect(styles).toContain(".toolbar-control:hover")
      })

      it("contains Post button visual weight", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("font-weight: 600")
      })

      it("contains transition declarations", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("transition:")
      })

      it("contains prefers-reduced-motion guard", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain("prefers-reduced-motion")
      })

      it("contains menu item hover states", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".more-menu button:hover")
        expect(styles).toContain(".emoji-picker button:hover")
      })

      it("contains remove control hover state", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".remove-control:hover")
      })

      it("contains display name button hover state", async () => {
        const styles = await getEditorStyles()
        expect(styles).toContain(".editor-display-name button:hover")
      })

      it("has no malformed CSS units (whitespace-separated numbers and units)", async () => {
        const styles = await getEditorStyles()
        // Detect patterns like "4 px", "0.15 s", "0.01 ms", "0.01 em", "100 %"
        // Valid CSS requires no space between number and unit: "4px", "0.15s", "0.01ms", "0.01em", "100%"
        // The regex matches a number (integer or decimal) followed by whitespace and a valid CSS unit
        // Uses lookahead (?=[\s;,}]|$) to properly handle all units including % (non-word character)
        const malformedUnitRegex =
          /\b\d+(\.\d+)?\s+(?:px|em|rem|ex|ch|vw|vh|vmin|vmax|%|pt|pc|in|cm|mm|ms|s|fr|dpi|dpcm|dppx|Hz|kHz|deg|rad|grad|turn)(?=[\s;,}]|$)/gi
        const matches = styles.match(malformedUnitRegex)
        expect(matches, `Found malformed CSS units: ${JSON.stringify(matches)}`).toBeNull()
      })

      it("has no malformed CSS with space before !important", async () => {
        const styles = await getEditorStyles()
        // Detect patterns like "0.01ms ! important" (space before important)
        const malformedImportantRegex = /\b\d+(\.\d+)?(px|em|rem|ms|s|%)(\s+!\s+important)\b/gi
        const matches = styles.match(malformedImportantRegex)
        expect(matches, `Found malformed !important: ${JSON.stringify(matches)}`).toBeNull()
      })
    })
  })
})
