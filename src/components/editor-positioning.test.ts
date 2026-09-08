import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"

describe("Popup positioning", () => {
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

  describe("Emoji picker positioning", () => {
    it("has position fixed after opening", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const picker = el.querySelector(".emoji-picker") as HTMLElement
      expect(picker).toBeTruthy()
      expect(picker.style.position).toBe("fixed")
      expect(picker.style.top).toBeTruthy()
      expect(picker.style.left).toBeTruthy()
    })

    it("repositions on resize", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const picker = el.querySelector(".emoji-picker") as HTMLElement
      expect(picker).toBeTruthy()

      const topBefore = picker.style.top
      const leftBefore = picker.style.left

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(picker.style.position).toBe("fixed")
      expect(picker.style.top).toBeTruthy()
      expect(picker.style.left).toBeTruthy()
    })
  })

  describe("Sticker picker positioning", () => {
    it("has position fixed after opening", async () => {
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      expect(picker).toBeTruthy()
      expect(picker.style.position).toBe("fixed")
      expect(picker.style.top).toBeTruthy()
      expect(picker.style.left).toBeTruthy()
    })

    it("repositions on resize while remaining open", async () => {
      const el = await createEditor({
        stickerPacks: [
          { pack_id: "p1", display_name: "Pack", images: [{ shortcode: ":s:", url: "test.png" }] },
        ],
      })
      const trigger = el.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const picker = el.querySelector('[role="dialog"][aria-label="Stickers"]') as HTMLElement
      expect(picker).toBeTruthy()

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(el.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeTruthy()
      expect(picker.style.position).toBe("fixed")
    })
  })

  describe("More menu positioning", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true })
      Object.defineProperty(window, "innerHeight", { value: 667, writable: true, configurable: true })
    })

    it("has position fixed after opening", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu") as HTMLElement
      expect(menu).toBeTruthy()
      expect(menu.style.position).toBe("fixed")
      expect(menu.style.top).toBeTruthy()
      expect(menu.style.left).toBeTruthy()
    })

    it("repositions on resize", async () => {
      const el = await createEditor()
      const trigger = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
      trigger.click()
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})
      const menu = el.querySelector(".more-menu") as HTMLElement
      expect(menu).toBeTruthy()

      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 20))
      await el.updateComplete?.catch(() => {})

      expect(menu.style.position).toBe("fixed")
      expect(menu.style.top).toBeTruthy()
    })
  })

  describe("lifecycle and focus", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true })
      Object.defineProperty(window, "innerHeight", { value: 667, writable: true, configurable: true })
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

      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
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

  describe("listener cleanup", () => {
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
  })
})
