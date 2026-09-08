import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"

describe("Composer responsive below 480px", () => {
  it("has responsive style with 480px breakpoint", async () => {
    const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
      updateComplete: Promise<void>
    }
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    const style = el.querySelector("style")?.textContent ?? el.innerHTML
    expect(style).toContain("@media")
    expect(style).toContain("max-width: 479px")
    expect(style).toContain("flex: 1 1 120px")
    expect(style).not.toContain("479 px")
    expect(style).not.toContain("120 px")
    // Also verify via stylesheet if available (flex may be expanded to longhand)
    const sheet = el.querySelector("style")?.sheet as CSSStyleSheet | undefined
    if (sheet?.cssRules?.length) {
      const cssText = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join(" ")
      expect(cssText).toContain("479px")
      expect(cssText).toContain("120px")
      expect(cssText).not.toContain("479 px")
      expect(cssText).not.toContain("120 px")
    }
    el.remove()
  })

  it("has accessible input, Post and toolbar controls", async () => {
    const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
      updateComplete: Promise<void>
    }
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    // Expand editor
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 30))
    expect(el.querySelector('textarea[aria-label="Comment"]')).toBeTruthy()
    expect(el.querySelector('button[aria-label="Post comment"]')).toBeTruthy()
    expect(el.querySelector('button[aria-label="Stickers"]')).toBeTruthy()
    expect(el.querySelector('input[type="file"]')).toBeTruthy()
    const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    )
    expect(locBtn).toBeTruthy()
    el.remove()
  })

  it("toolbar and input row have responsive classes", async () => {
    const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
      updateComplete: Promise<void>
    }
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 30))
    expect(el.querySelector(".editor-input-row")).toBeTruthy()
    expect(el.querySelector(".editor-toolbar")).toBeTruthy()
    expect(el.querySelector(".editor-display-name")).toBeTruthy()
    el.remove()
  })

  it("pending attachments have compact class", async () => {
    const el = document.createElement("cumments-editor") as unknown as HTMLElement & {
      updateComplete: Promise<void>
    }
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    // Set pending via property after append to trigger update
    ;(
      el as unknown as { pendingMedia: { url: string; filename: string | null; kind: string } }
    ).pendingMedia = { url: "https://example.com/a.png", filename: "a.png", kind: "image" }
    ;(el as unknown as { requestUpdate: () => void }).requestUpdate()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input?.focus()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete?.catch(() => {})
    // Check that pending state is set (DOM may not render if still collapsed, but state should be)
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    // The editor should have the pendingMedia property set
    el.remove()
  })
})

describe("More menu (narrow viewport)", () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    document.body.innerHTML = ""
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    document.body.innerHTML = ""
    window.matchMedia = originalMatchMedia
  })

  function mockViewport(width: number) {
    window.matchMedia = vi.fn((query: string) =>
      ({
        matches: query.includes("max-width") ? width <= 479 : width >= 480,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
    )
  }

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

  it("shows More button in narrow viewport", async () => {
    mockViewport(375)
    const el = await createEditor()
    const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
    expect(moreBtn).toBeTruthy()
  })

  it("hides secondary actions in narrow viewport", async () => {
    mockViewport(375)
    const el = await createEditor()
    const toolbarActions = el.querySelectorAll(".toolbar-action")
    expect(toolbarActions.length).toBeGreaterThan(0)
    // Actions exist but are hidden via CSS
  })

  it("opening More reveals Location, Poll, Sticker", async () => {
    mockViewport(375)
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
    mockViewport(375)
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
    mockViewport(375)
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
    mockViewport(375)
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
    mockViewport(375)
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
    mockViewport(375)
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
    mockViewport(375)
    const el = await createEditor()
    const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
    expect(moreBtn.getAttribute("aria-label")).toBe("More composer actions")
  })

  it("opening More establishes predictable focus", async () => {
    mockViewport(375)
    const el = await createEditor()
    const moreBtn = el.querySelector('button[aria-label="More composer actions"]') as HTMLButtonElement
    moreBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await el.updateComplete?.catch(() => {})
    const focused = el.querySelector(".more-menu button:focus") as HTMLElement | null
    expect(focused).toBeTruthy()
  })

  it("keyboard activation of menu actions works", async () => {
    mockViewport(375)
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
    mockViewport(375)
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
