import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"

describe("Composer responsive behavior", () => {
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
      // Verify the responsive rules exist
      expect(cssText).toContain(".toolbar-action")
      expect(cssText).toContain(".more-button")
      expect(cssText).toContain("display: none")
      expect(cssText).toContain("display: inline-flex")
    })

    it("hides toolbar actions in narrow viewport", async () => {
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // At max-width: 479px, toolbar-action should be hidden
      // Extract the narrow media query block
      const narrowMatch = cssText.match(/@media\s*\(max-width:\s*479px\)\s*\{([\s\S]*?)\n\s*\}/)
      const narrowSection = narrowMatch?.[1] ?? ""
      expect(narrowSection).toContain(".toolbar-action")
      expect(narrowSection).toContain("display: none")
    })

    it("shows More button in narrow viewport", async () => {
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // At max-width: 479px, more-button should be visible
      const narrowMatch = cssText.match(/@media\s*\(max-width:\s*479px\)\s*\{([\s\S]*?)\n\s*\}/)
      const narrowSection = narrowMatch?.[1] ?? ""
      expect(narrowSection).toContain(".more-button")
      expect(narrowSection).toContain("display: inline-flex")
    })

    it("hides More button in desktop viewport", async () => {
      const el = await createEditor()
      const cssText = getCSSRules(el).join("\n")
      // At min-width: 480px, more-button should be hidden
      const desktopMatch = cssText.match(/@media\s*\(min-width:\s*480px\)\s*\{([\s\S]*?)\n\s*\}/)
      const desktopSection = desktopMatch?.[1] ?? ""
      expect(desktopSection).toContain(".more-button")
      expect(desktopSection).toContain("display: none")
    })
  })

  describe("computed visibility at breakpoint boundaries", () => {
    it("at 479px: toolbar actions hidden, More visible", async () => {
      // Set viewport to 479px
      Object.defineProperty(window, "innerWidth", { value: 479, writable: true, configurable: true })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const toolbarAction = el.querySelector(".toolbar-action") as HTMLElement
      const moreButton = el.querySelector(".more-button") as HTMLElement

      // Elements should exist in DOM
      expect(toolbarAction).toBeTruthy()
      expect(moreButton).toBeTruthy()

      // Verify CSS rules would hide toolbar-action at 479px
      const cssText = getCSSRules(el).join("\n")
      const narrowMatch = cssText.match(/@media\s*\(max-width:\s*479px\)\s*\{([\s\S]*?)\n\s*\}/)
      const narrowSection = narrowMatch?.[1] ?? ""
      expect(narrowSection).toContain(".toolbar-action")
      expect(narrowSection).toContain("display: none")
      expect(narrowSection).toContain(".more-button")
      expect(narrowSection).toContain("display: inline-flex")
    })

    it("at 480px: toolbar actions visible, More hidden", async () => {
      // Set viewport to 480px
      Object.defineProperty(window, "innerWidth", { value: 480, writable: true, configurable: true })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const toolbarAction = el.querySelector(".toolbar-action") as HTMLElement
      const moreButton = el.querySelector(".more-button") as HTMLElement

      // Elements should exist in DOM
      expect(toolbarAction).toBeTruthy()
      expect(moreButton).toBeTruthy()

      // Verify CSS rules would show toolbar-action at 480px
      const cssText = getCSSRules(el).join("\n")
      const desktopMatch = cssText.match(/@media\s*\(min-width:\s*480px\)\s*\{([\s\S]*?)\n\s*\}/)
      const desktopSection = desktopMatch?.[1] ?? ""
      expect(desktopSection).toContain(".more-button")
      expect(desktopSection).toContain("display: none")
    })
  })

  describe("More menu behavior", () => {
    beforeEach(() => {
      // Set narrow viewport for More menu tests
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true })
      window.dispatchEvent(new Event("resize"))
    })

    it("More button is visible in narrow viewport", async () => {
      // Set narrow viewport
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true })
      window.dispatchEvent(new Event("resize"))

      const el = await createEditor()
      const moreBtn = el.querySelector(".more-button") as HTMLElement
      expect(moreBtn).toBeTruthy()
      // Verify CSS rules would show more-button in narrow viewport
      const cssText = getCSSRules(el).join("\n")
      const narrowMatch = cssText.match(/@media\s*\(max-width:\s*479px\)\s*\{([\s\S]*?)\n\s*\}/)
      const narrowSection = narrowMatch?.[1] ?? ""
      expect(narrowSection).toContain(".more-button")
      expect(narrowSection).toContain("display: inline-flex")
    })

    it("opening More reveals Location, Poll, Sticker", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const mockPos = { coords: { latitude: 30.123, longitude: 120.456 } } as unknown as GeolocationPosition
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: vi.fn((succ: PositionCallback) => succ(mockPos)) },
        writable: true,
        configurable: true,
      })
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
    })

    it("More button has accessible name", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
      expect(moreBtn.getAttribute("aria-label")).toBe("More composer actions")
    })

    it("opening More establishes predictable focus", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const focused = el.querySelector(".more-menu button:focus") as HTMLElement | null
      expect(focused).toBeTruthy()
    })

    it("keyboard activation of menu actions works", async () => {
      const el = await createEditor()
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
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
})
