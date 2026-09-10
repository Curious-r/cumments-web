import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"

/**
 * Geometry shim for popup positioning tests.
 * Mocks DOM measurements to exercise the production positioning code.
 */
class GeometryShim {
  private rects = new Map<HTMLElement, Partial<DOMRect>>()
  private viewportW: number
  private viewportH: number
  private originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect

  constructor(viewportW: number, viewportH: number) {
    this.viewportW = viewportW
    this.viewportH = viewportH
    this.originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
  }

  setRect(element: HTMLElement, rect: Partial<DOMRect>) {
    this.rects.set(element, rect)
  }

  install() {
    Object.defineProperty(window, "innerWidth", {
      value: this.viewportW,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, "innerHeight", {
      value: this.viewportH,
      writable: true,
      configurable: true,
    })
    const rects = this.rects
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const rect = rects.get(this)
      if (rect) {
        return {
          top: rect.top ?? 0,
          bottom: rect.bottom ?? 0,
          left: rect.left ?? 0,
          right: rect.right ?? 0,
          width: rect.width ?? 0,
          height: rect.height ?? 0,
          x: rect.left ?? 0,
          y: rect.top ?? 0,
          toJSON: () => {},
        } as DOMRect
      }
      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect
    }
  }

  uninstall() {
    HTMLElement.prototype.getBoundingClientRect = this.originalGetBoundingClientRect
  }

  resize(width: number, height: number) {
    this.viewportW = width
    this.viewportH = height
    Object.defineProperty(window, "innerWidth", {
      value: width,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, "innerHeight", {
      value: height,
      writable: true,
      configurable: true,
    })
  }
}

describe("Popup positioning", () => {
  let shim: GeometryShim

  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    document.body.innerHTML = ""
    if (shim) shim.uninstall()
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

  describe("Emoji picker positioning", () => {
    it("positions above when enough room above", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      // Trigger at y=400, picker height=280 -> enough room above (400 > 280)
      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      // Wait for updateComplete + .then() callback that positions the picker
      await new Promise((r) => setTimeout(r, 100))
      await el.updateComplete?.catch(() => {})
      // Wait for any additional .then() callbacks
      await new Promise((r) => setTimeout(r, 100))

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Should be positioned above: top = 400 - 280 - 4 = 116
      expect(picker.style.position).toBe("fixed")
      expect(parseInt(picker.style.top, 10)).toBe(116)
    })

    it("flips below when insufficient room above", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      // Trigger at y=10, picker height=280 -> not enough room above (10 < 280)
      shim.setRect(trigger, { top: 10, bottom: 40, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Should be positioned below: top = 40 + 4 = 44
      expect(parseInt(picker.style.top, 10)).toBe(44)
    })

    it("constrains max-height when neither side fits", async () => {
      shim = new GeometryShim(1024, 300)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      // Trigger in middle, picker height=280, viewport=300 -> neither side fits
      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Should be clamped to top margin (8) and have constrained max-height
      expect(parseInt(picker.style.top, 10)).toBe(8)
      expect(parseInt(picker.style.maxHeight ?? "0", 10)).toBe(284) // 300 - 8*2
      expect(picker.style.overflowY).toBe("auto")
    })

    it("clamps horizontally near left edge", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      // Trigger at left edge
      shim.setRect(trigger, { top: 400, bottom: 430, left: 0, right: 30, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Should be clamped to left margin (8)
      expect(parseInt(picker.style.left, 10)).toBe(8)
    })

    it("clamps horizontally near right edge", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      // Trigger at right edge
      shim.setRect(trigger, {
        top: 400,
        bottom: 430,
        left: 1000,
        right: 1024,
        width: 24,
        height: 30,
      })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Should be clamped so right edge doesn't exceed viewport
      const left = parseInt(picker.style.left, 10)
      expect(left + 280).toBeLessThanOrEqual(1024 - 8)
    })

    it("clears stale max-height after viewport recovery", async () => {
      // Start with cramped viewport
      shim = new GeometryShim(1024, 300)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      // Verify constrained
      expect(picker.style.maxHeight).toBeTruthy()
      expect(picker.style.overflowY).toBe("auto")

      // Resize to spacious viewport
      shim.resize(1024, 800)
      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      // Stale max-height should be cleared
      expect(picker.style.maxHeight).toBe("")
      expect(picker.style.overflowY).toBe("")
    })

    it("repositions on resize without closing", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLElement

      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector(".emoji-picker") as HTMLElement
      shim.setRect(picker, { width: 280, height: 280 })

      const topBefore = picker.style.top

      // Resize and move trigger
      shim.resize(1024, 600)
      shim.setRect(trigger, { top: 200, bottom: 230, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      // Position should have changed
      expect(picker.style.top).not.toBe(topBefore)
      // Picker should still be open
      expect(el.querySelector(".emoji-picker")).toBeTruthy()
    })
  })

  describe("Sticker picker positioning", () => {
    it("positions above when enough room", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      // Should be above: top = 400 - 200 - 4 = 196
      expect(picker.style.position).toBe("fixed")
      expect(parseInt(picker.style.top, 10)).toBe(196)
    })

    it("flips below when insufficient room above", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, { top: 10, bottom: 40, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      // Should be below: top = 40 + 4 = 44
      expect(parseInt(picker.style.top, 10)).toBe(44)
    })

    it("constrains in cramped viewport", async () => {
      shim = new GeometryShim(1024, 250)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      expect(parseInt(picker.style.top, 10)).toBe(8)
      expect(parseInt(picker.style.maxHeight ?? "0", 10)).toBe(234) // 250 - 8*2
    })

    it("clamps horizontally", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, {
        top: 400,
        bottom: 430,
        left: 1000,
        right: 1024,
        width: 24,
        height: 30,
      })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      const left = parseInt(picker.style.left, 10)
      expect(left + 320).toBeLessThanOrEqual(1024 - 8)
    })

    it("clears stale sizing after viewport recovery", async () => {
      shim = new GeometryShim(1024, 250)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      expect(picker.style.maxHeight).toBeTruthy()

      // Recover to spacious viewport
      shim.resize(1024, 800)
      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(picker.style.maxHeight).toBe("")
      expect(picker.style.overflowY).toBe("")
    })

    it("repositions on resize while remaining open", async () => {
      shim = new GeometryShim(1024, 800)
      shim.install()
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLElement

      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      shim.setRect(picker, { width: 320, height: 200 })

      const topBefore = picker.style.top

      shim.resize(1024, 600)
      shim.setRect(trigger, { top: 200, bottom: 230, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(picker.style.top).not.toBe(topBefore)
      expect(el.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
    })
  })

  describe("More menu positioning", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, "innerHeight", {
        value: 667,
        writable: true,
        configurable: true,
      })
    })

    it("clamps horizontally within viewport", async () => {
      shim = new GeometryShim(375, 667)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      shim.setRect(trigger, { top: 400, bottom: 430, left: 300, right: 330, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      shim.setRect(menu, { width: 140, height: 120 })

      const left = parseInt(menu.style.left, 10)
      expect(left + 140).toBeLessThanOrEqual(375 - 8)
      expect(left).toBeGreaterThanOrEqual(8)
    })

    it("clamps in cramped vertical space", async () => {
      shim = new GeometryShim(375, 200)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 50))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      shim.setRect(menu, { width: 140, height: 120 })

      expect(parseInt(menu.style.top, 10)).toBe(8)
      // maxHeight should be constrained to viewport height minus margins
      expect(parseInt(menu.style.maxHeight ?? "0", 10)).toBe(184) // 200 - 8*2
    })

    it("clears stale sizing after viewport recovery", async () => {
      shim = new GeometryShim(375, 200)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      shim.setRect(trigger, { top: 100, bottom: 130, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      shim.setRect(menu, { width: 140, height: 120 })

      expect(menu.style.maxHeight).toBeTruthy()

      // Recover
      shim.resize(375, 667)
      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(menu.style.maxHeight).toBe("")
      expect(menu.style.overflowY).toBe("")
    })

    it("repositions on resize while remaining open", async () => {
      shim = new GeometryShim(375, 667)
      shim.install()
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      shim.setRect(trigger, { top: 400, bottom: 430, left: 100, right: 130, width: 30, height: 30 })

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      shim.setRect(menu, { width: 140, height: 120 })

      const topBefore = menu.style.top

      shim.resize(375, 500)
      shim.setRect(trigger, { top: 200, bottom: 230, left: 100, right: 130, width: 30, height: 30 })
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(menu.style.top).not.toBe(topBefore)
      expect(el.querySelector(".more-menu")).toBeTruthy()
    })
  })

  describe("lifecycle and focus", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, "innerHeight", {
        value: 667,
        writable: true,
        configurable: true,
      })
    })

    it("popup remains open after resize", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-menu")).toBeTruthy()

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(el.querySelector(".more-menu")).toBeTruthy()
    })

    it("reply/thread context preserved after resize", async () => {
      const el = await createEditor()
      ;(el as unknown as { setReplyToId: (id: string | null) => void }).setReplyToId("$parent")
      await el.updateComplete?.catch(() => {})

      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("Escape still closes after repositioning", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("outside click still closes after repositioning", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(el.querySelector(".more-menu")).toBeNull()
    })

    it("closing returns focus to trigger", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const menu = el.querySelector(".more-menu") as HTMLElement
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(document.activeElement).toBe(trigger)
    })
  })

  describe("listener lifecycle", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
    })

    afterEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
    })

    it("resize listener enables More button on viewport transition to mobile", async () => {
      // Start at desktop — no More button
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      const el = await createEditor()
      expect(el.querySelector(".more-button")).toBeNull()

      // Resize to mobile — More button should appear via resize listener
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await el.updateComplete?.catch(() => {})
      const moreBtn = el.querySelector(".more-button")
      expect(moreBtn).toBeTruthy()
    })

    it("resize listener removes More button on viewport transition to desktop", async () => {
      // Start at mobile — More button present
      const el = await createEditor()
      expect(el.querySelector(".more-button")).toBeTruthy()

      // Resize to desktop — More button should disappear
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event("resize"))
      await el.updateComplete?.catch(() => {})
      expect(el.querySelector(".more-button")).toBeNull()
    })

    it("removes resize listener on disconnect", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      const removeSpy = vi.spyOn(window, "removeEventListener")

      el.remove()

      expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function))

      removeSpy.mockRestore()
    })

    it("disconnected editor does not react to resize", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLElement

      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      el.remove()
      await new Promise((r) => setTimeout(r, 20))

      // Dispatch resize - should not cause errors
      expect(() => {
        window.dispatchEvent(new Event("resize"))
      }).not.toThrow()

      await new Promise((r) => setTimeout(r, 20))
    })
  })
})
