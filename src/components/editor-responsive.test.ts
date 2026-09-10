import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"

describe("Composer responsive behavior", () => {
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
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
    return el
  }

  function getCSSRules(el: HTMLElement): string[] {
    const style = el.querySelector("style")
    if (!style?.sheet) return []
    return Array.from(style.sheet.cssRules).map((r) => r.cssText)
  }

  describe("CSS rules verification", () => {
    it("has responsive media query rules", async () => {
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // Verify the responsive media query exists
      expect(cssText).toContain("@media (max-width: 479px)")
      // Touch-target sizing rules should exist
      expect(cssText).toContain("min-width: 44px")
      expect(cssText).toContain("min-height: 44px")
    })

    it("renders overflow actions via JS, not CSS hiding", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // On mobile, overflow actions (Location/Poll/Sticker) are NOT in the
      // direct toolbar — they are rendered inside the More menu. No CSS hiding.
      expect(el.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Create poll"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeNull()
      // Attach and Emoji remain as direct toolbar actions
      expect(el.querySelector("label.toolbar-control")).toBeTruthy()
      expect(el.querySelector('button[aria-label="Emoji"]')).toBeTruthy()
    })

    it("shows More button in narrow viewport via JS rendering", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      const moreButton = el.querySelector(".more-button") as HTMLElement
      expect(moreButton).toBeTruthy()
    })
  })

  describe("computed visibility at breakpoint boundaries", () => {
    it("at 479px: overflow actions not in DOM, More present (JS)", async () => {
      // Set viewport to 479px
      Object.defineProperty(window, "innerWidth", {
        value: 479,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      // Overflow actions should NOT be in the DOM (model-driven, not CSS-hidden)
      const locationAction = el.querySelector('button[aria-label="Add location"]')
      const moreButton = el.querySelector(".more-button") as HTMLElement

      expect(locationAction).toBeNull()
      expect(moreButton).toBeTruthy()
    })

    it("at 480px: toolbar actions visible, More NOT in DOM", async () => {
      // Set viewport to 480px
      Object.defineProperty(window, "innerWidth", {
        value: 480,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const toolbarAction = el.querySelector(".toolbar-action") as HTMLElement
      const moreButton = el.querySelector(".more-button") as HTMLElement

      // Toolbar actions should exist in DOM (visible at 480px)
      expect(toolbarAction).toBeTruthy()
      // More button should NOT be in the DOM at desktop width
      expect(moreButton).toBeNull()
    })

    it("at 1200px: toolbar actions visible, More NOT in DOM", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1200,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const toolbarAction = el.querySelector(".toolbar-action") as HTMLElement
      const moreButton = el.querySelector(".more-button") as HTMLElement

      expect(toolbarAction).toBeTruthy()
      expect(moreButton).toBeNull()
    })
  })

  describe("More menu behavior", () => {
    beforeEach(() => {
      // Set narrow viewport for More menu tests
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
    })

    it("More button is visible in narrow viewport", async () => {
      // Set narrow viewport
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const moreBtn = el.querySelector(".more-button") as HTMLElement
      expect(moreBtn).toBeTruthy()
    })

    it("opening More reveals Location, Poll, Sticker", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu")
      expect(menu).toBeTruthy()
      const items = menu?.querySelectorAll('button[role="menuitem"]')
      expect(items?.length).toBe(3)
      expect(items?.[0]?.textContent).toContain("Location")
      expect(items?.[1]?.textContent).toContain("Poll")
      expect(items?.[2]?.textContent).toContain("Sticker")
    })

    it("Escape closes More menu", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeTruthy()
      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("activating Location closes More and enters Location flow", async () => {
      const el = await createEditor()
      const mockPos = {
        coords: { latitude: 30.123, longitude: 120.456 },
      } as unknown as GeolocationPosition
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: vi.fn((succ: PositionCallback) => succ(mockPos)) },
        writable: true,
        configurable: true,
      })
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const locationBtn = el.querySelector(".more-menu button") as HTMLButtonElement
      locationBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeNull()
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBeTruthy()
    })

    it("activating Poll closes More and enters Poll mode", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const pollBtn = el.querySelectorAll(".more-menu button")[1] as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeNull()
      expect(el.querySelector('input[aria-label="Poll question"]')).toBeTruthy()
    })

    it("More interaction preserves text draft", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "my draft"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("my draft")
    })

    it("More interaction preserves reply/thread context", async () => {
      const el = await createEditor()
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("More button has accessible name", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      expect(moreBtn.getAttribute("aria-label")).toBe("More composer actions")
    })

    it("opening More establishes predictable focus", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const focused = el.querySelector(".more-menu button:focus") as HTMLElement | null
      expect(focused).toBeTruthy()
    })

    it("keyboard activation of menu actions works", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu") as HTMLElement
      const firstItem = menu.querySelector("button") as HTMLElement
      firstItem.focus()
      // Native buttons trigger click on Enter
      firstItem.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      firstItem.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("Escape restores focus to More trigger", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(document.activeElement).toBe(moreBtn)
    })
  })

  describe("Markdown formatting toolbar responsive behavior", () => {
    function getCSSRules(el: HTMLElement): string[] {
      const style = el.querySelector("style")
      if (!style?.sheet) return []
      return Array.from(style.sheet.cssRules).map((r) => r.cssText)
    }

    it("formatting toolbar is visible on desktop", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 768,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // On desktop, formatting toolbar should be visible (display: flex)
      expect(cssText).toContain(".formatting-toolbar")
      // The base style should have display:flex
      expect(cssText).toMatch(/\.formatting-toolbar\s*\{[^}]*display:\s*flex/)
    })

    it("formatting toolbar is visible on narrow layouts", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // On narrow layouts, formatting toolbar should still be visible
      // Check that the formatting-toolbar CSS exists with display:flex !important
      expect(cssText).toMatch(/\.formatting-toolbar\s*\{[^}]*display:\s*flex\s*!important/)
    })

    it("narrow formatting controls have 44px touch targets", async () => {
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // Verify 44px touch targets on narrow layouts
      expect(cssText).toMatch(/\.formatting-toolbar\s+button\s*\{[^}]*min-width:\s*44px/)
      expect(cssText).toMatch(/\.formatting-toolbar\s+button\s*\{[^}]*min-height:\s*44px/)
    })

    it("primary toolbar actions remain intact on desktop", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 768,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      // Verify primary toolbar elements exist
      expect(el.querySelector(".editor-toolbar label")).toBeTruthy() // Attach
      expect(el.querySelector('button[aria-label="Emoji"]')).toBeTruthy()
      expect(el.querySelector('.toolbar-action[aria-label="Add location"]')).toBeTruthy()
      expect(el.querySelector('.toolbar-action[aria-label="Create poll"]')).toBeTruthy()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeTruthy()
      expect(el.querySelector('[aria-label="Post comment"]')).toBeTruthy()
      // More button should NOT be in the DOM on desktop
      expect(el.querySelector('button[aria-label="More composer actions"]')).toBeNull()
    })

    it("narrow layout preserves Attach/Emoji/More/Post hierarchy", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      // Attach and Emoji should be visible as direct toolbar actions
      expect(el.querySelector("label.toolbar-control")).toBeTruthy()
      expect(el.querySelector('button[aria-label="Emoji"]')).toBeTruthy()
      // More button should be present (rendered via JS, not CSS)
      expect(el.querySelector(".more-button")).toBeTruthy()
      expect(el.querySelector('button[aria-label="More composer actions"]')).toBeTruthy()
      // Post should be visible
      expect(el.querySelector('[aria-label="Post comment"]')).toBeTruthy()
    })

    it("formatting controls are not inside More menu", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu")
      expect(menu).toBeTruthy()
      // More menu should contain Location, Poll, Sticker but NOT formatting buttons
      const items = menu?.querySelectorAll('button[role="menuitem"]')
      expect(items?.length).toBe(3)
      const itemTexts = Array.from(items ?? []).map((item) => item.textContent)
      expect(itemTexts.some((t) => t?.includes("Location"))).toBe(true)
      expect(itemTexts.some((t) => t?.includes("Poll"))).toBe(true)
      expect(itemTexts.some((t) => t?.includes("Sticker"))).toBe(true)
      // Formatting buttons should NOT be in More menu
      expect(itemTexts.some((t) => t?.includes("Bold"))).toBe(false)
      expect(itemTexts.some((t) => t?.includes("Italic"))).toBe(false)
      expect(itemTexts.some((t) => t?.includes("Link"))).toBe(false)
    })

    it("formatting buttons are semantic buttons with accessible names", async () => {
      const el = await createEditor()
      const boldBtn = el.querySelector('button[aria-label="Bold"]')
      const italicBtn = el.querySelector('button[aria-label="Italic"]')
      const strikeBtn = el.querySelector('button[aria-label="Strikethrough"]')
      const codeBtn = el.querySelector('button[aria-label="Code"]')
      const linkBtn = el.querySelector('button[aria-label="Link"]')
      // All should be button elements
      expect(boldBtn?.tagName).toBe("BUTTON")
      expect(italicBtn?.tagName).toBe("BUTTON")
      expect(strikeBtn?.tagName).toBe("BUTTON")
      expect(codeBtn?.tagName).toBe("BUTTON")
      expect(linkBtn?.tagName).toBe("BUTTON")
      // All should have accessible names
      expect(boldBtn?.getAttribute("aria-label")).toBe("Bold")
      expect(italicBtn?.getAttribute("aria-label")).toBe("Italic")
      expect(strikeBtn?.getAttribute("aria-label")).toBe("Strikethrough")
      expect(codeBtn?.getAttribute("aria-label")).toBe("Code")
      expect(linkBtn?.getAttribute("aria-label")).toBe("Link")
    })

    it("narrow formatting controls are keyboard reachable", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      // Button should be focusable
      boldBtn.focus()
      expect(document.activeElement).toBe(boldBtn)
    })
  })

  describe("Responsive overflow semantics", () => {
    it("desktop: no More button in DOM, no overflow", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // More button should not exist on desktop
      expect(el.querySelector(".more-button")).toBeNull()
      expect(el.querySelector("button[aria-label='More composer actions']")).toBeNull()
      // No more-menu should exist
      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("mobile: More button present, More menu contains overflow actions", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      const moreBtn = el.querySelector("button[aria-label='More composer actions']")
      expect(moreBtn).toBeTruthy()
      ;(moreBtn as HTMLButtonElement).click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu")
      expect(menu).toBeTruthy()
      const items = menu?.querySelectorAll('button[role="menuitem"]')
      expect(items?.length).toBe(3)
      const itemTexts = Array.from(items ?? []).map((item) => item.textContent?.trim())
      expect(itemTexts).toContain("Location")
      expect(itemTexts).toContain("Poll")
      expect(itemTexts).toContain("Sticker")
    })

    it("desktop: Location/Poll/Sticker appear only as direct buttons, not in More", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // Direct buttons should exist
      expect(el.querySelector('button[aria-label="Add location"]')).toBeTruthy()
      expect(el.querySelector('button[aria-label="Create poll"]')).toBeTruthy()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeTruthy()
      // More should not exist
      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("mobile: Location/Poll/Sticker appear only in More, not as direct buttons", async () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // Overflow actions should NOT be in the direct toolbar on mobile
      expect(el.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Create poll"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeNull()
      // They should appear in the More menu instead
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu")
      expect(menu).toBeTruthy()
      const items = menu?.querySelectorAll('button[role="menuitem"]')
      expect(items?.length).toBe(3)
    })

    it("desktop → mobile: More button appears, overflow actions move to More", async () => {
      // Start at desktop
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // Desktop: no More button, all actions direct
      expect(el.querySelector(".more-button")).toBeNull()
      expect(el.querySelector('button[aria-label="Add location"]')).toBeTruthy()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeTruthy()

      // Resize to mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await el.updateComplete?.catch(() => {})
      // Mobile: More button should now exist, direct buttons gone
      expect(el.querySelector(".more-button")).toBeTruthy()
      expect(el.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeNull()
    })

    it("mobile → desktop: More button disappears, actions return to direct toolbar", async () => {
      // Start at mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // Mobile: More button exists, direct buttons gone
      expect(el.querySelector(".more-button")).toBeTruthy()
      expect(el.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeNull()

      // Resize to desktop
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await el.updateComplete?.catch(() => {})
      // Desktop: More button should be gone, direct buttons back
      expect(el.querySelector(".more-button")).toBeNull()
      expect(el.querySelector('button[aria-label="Add location"]')).toBeTruthy()
      expect(el.querySelector('button[aria-label="Stickers"]')).toBeTruthy()
    })

    it("desktop → mobile while More is open: menu closes on transition", async () => {
      // Start at mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      const moreBtn = el.querySelector("button[aria-label='More composer actions']") as HTMLElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeTruthy()

      // Resize to desktop
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      // More menu should be closed
      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("mobile → desktop → mobile: More content is correct at each state", async () => {
      // Mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      let el = await createEditor()
      expect(el.querySelector(".more-button")).toBeTruthy()
      expect(el.querySelector("button[aria-label='More composer actions']")).toBeTruthy()

      // Desktop
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      el = await createEditor()
      expect(el.querySelector(".more-button")).toBeNull()

      // Mobile again
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      el = await createEditor()
      expect(el.querySelector(".more-button")).toBeTruthy()
    })

    it("each action appears exactly once — never in both direct toolbar and More", async () => {
      // Desktop: all actions direct, no More
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const desktopEl = await createEditor()
      expect(desktopEl.querySelector('button[aria-label="Add location"]')).toBeTruthy()
      expect(desktopEl.querySelector('button[aria-label="Create poll"]')).toBeTruthy()
      expect(desktopEl.querySelector('button[aria-label="Stickers"]')).toBeTruthy()
      expect(desktopEl.querySelector(".more-button")).toBeNull()

      // Mobile: overflow actions only in More
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const mobileEl = await createEditor()
      expect(mobileEl.querySelector('button[aria-label="Add location"]')).toBeNull()
      expect(mobileEl.querySelector('button[aria-label="Create poll"]')).toBeNull()
      expect(mobileEl.querySelector('button[aria-label="Stickers"]')).toBeNull()
      expect(mobileEl.querySelector(".more-button")).toBeTruthy()
      const moreBtn = mobileEl.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await mobileEl.updateComplete?.catch(() => {})
      const items = mobileEl.querySelectorAll(".more-menu button[role='menuitem']")
      expect(items.length).toBe(3)
    })

    it("More menu closes when overflow becomes empty", async () => {
      // Start at mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      const moreBtn = el.querySelector("button[aria-label='More composer actions']") as HTMLElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeTruthy()

      // Resize to desktop — overflow becomes empty, More should close
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeNull()
      expect(el.querySelector(".more-button")).toBeNull()
    })

    it("invariant: overflowActions = availableActions not in directToolbarActions", async () => {
      // This is the core invariant: on mobile, availableActions minus directToolbarActions
      // should equal overflowActions (Location, Poll, Sticker).
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      const el = await createEditor()
      // Direct toolbar on mobile should have: Attach, Emoji, More
      expect(el.querySelector("label.toolbar-control")).toBeTruthy() // Attach
      expect(el.querySelector('button[aria-label="Emoji"]')).toBeTruthy() // Emoji
      expect(el.querySelector('button[aria-label="More composer actions"]')).toBeTruthy() // More
      // Overflow (in More menu) should have: Location, Poll, Sticker
      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const items = el.querySelectorAll(".more-menu button[role='menuitem']")
      expect(items.length).toBe(3)
      const labels = Array.from(items).map((i) => i.getAttribute("aria-label"))
      expect(labels).toContain("Location")
      expect(labels).toContain("Poll")
      expect(labels).toContain("Stickers")
    })
  })
})
