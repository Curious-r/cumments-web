import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./editor/cumments-editor"

/**
 * The primary toolbar mixes element types: Attach is a `<label class="toolbar-control">`
 * while the others are `<button>`. They must share one sizing contract, because a
 * browser's default box model differs between the two — a `<button>` is
 * `border-box`, a `<label>` is `content-box`. Left implicit, the label's
 * `min-height` grows by its padding and border and it renders taller than its
 * neighbours.
 */
const SHARED_SELECTORS = [".editor-toolbar button", ".editor-toolbar .toolbar-control"]
const SHARED_SELECTOR = SHARED_SELECTORS.join(", ")
const MIN_TOUCH_TARGET = 44

/** Exact selector-list match; substring matching would also hit the :hover rule. */
function selectorList(rule: CSSStyleRule): string[] {
  return rule.selectorText.split(",").map((s) => s.trim())
}

type Editor = HTMLElement & { updateComplete: Promise<unknown> }

describe("primary toolbar control sizing", () => {
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    document.body.innerHTML = ""
  })

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    })
    window.dispatchEvent(new Event("resize"))
    document.body.innerHTML = ""
  })

  async function createEditor(width = 1024): Promise<Editor> {
    Object.defineProperty(window, "innerWidth", {
      value: width,
      writable: true,
      configurable: true,
    })
    const el = document.createElement("cumments-editor") as Editor
    document.body.appendChild(el)
    window.dispatchEvent(new Event("resize"))
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    return el
  }

  /** CSS rules from the editor's own stylesheet. */
  function styleRules(el: Editor): CSSStyleRule[] {
    const style = el.querySelector("style")
    if (!style?.sheet) throw new Error("editor stylesheet not found")
    return Array.from(style.sheet.cssRules).filter(
      (r): r is CSSStyleRule => r.type === CSSRule.STYLE_RULE,
    )
  }

  /** The one rule that sizes both the toolbar buttons and the Attach control. */
  function sharedToolbarRule(el: Editor): CSSStyleRule {
    const rule = styleRules(el).find((r) => {
      const parts = selectorList(r)
      return (
        parts.length === SHARED_SELECTORS.length && SHARED_SELECTORS.every((s) => parts.includes(s))
      )
    })
    if (!rule) throw new Error("shared toolbar-control rule not found")
    return rule
  }

  /**
   * Total minimum height the control can render at, derived from its computed
   * box model. With border-box the min-height is the outer height; with
   * content-box the padding and border sit on top of it.
   */
  function outerMinHeight(cs: CSSStyleDeclaration): number {
    const minHeight = Number.parseFloat(cs.minHeight) || 0
    if (cs.boxSizing === "border-box") return minHeight
    const padding =
      (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0)
    const border =
      (Number.parseFloat(cs.borderTopWidth) || 0) + (Number.parseFloat(cs.borderBottomWidth) || 0)
    return minHeight + padding + border
  }

  function attachControl(el: Editor): HTMLElement {
    const label = el.querySelector("label.toolbar-control") as HTMLElement | null
    if (!label) throw new Error("Attach control not found")
    return label
  }

  /** First-level controls at desktop width. */
  function desktopControls(el: Editor): Array<[string, HTMLElement]> {
    const pick = (label: string) =>
      el.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null
    return [
      ["Attach", attachControl(el)],
      ["Emoji", pick("Emoji") as HTMLElement],
      ["Location", pick("Add location") as HTMLElement],
      ["Poll", pick("Create poll") as HTMLElement],
      ["Sticker", pick("Stickers") as HTMLElement],
    ]
  }

  it("declares one box model, min width and min height for the shared contract", async () => {
    const el = await createEditor()
    const rule = sharedToolbarRule(el)

    expect(rule.style.getPropertyValue("box-sizing")).toBe("border-box")
    expect(rule.style.getPropertyValue("min-width")).toBe(`${MIN_TOUCH_TARGET}px`)
    expect(rule.style.getPropertyValue("min-height")).toBe(`${MIN_TOUCH_TARGET}px`)
  })

  it("applies the shared selector to every first-level control on desktop", async () => {
    const el = await createEditor(1024)
    const controls = desktopControls(el)
    expect(controls).toHaveLength(5)
    for (const [name, control] of controls) {
      expect(control, `${name} should render`).toBeTruthy()
      expect(control.matches(SHARED_SELECTOR), `${name} should match the shared rule`).toBe(true)
    }
  })

  it("applies the shared selector to Attach, Emoji and More on mobile", async () => {
    const el = await createEditor(375)
    const more = el.querySelector(
      'button[aria-label="More composer actions"]',
    ) as HTMLElement | null
    expect(more, "More should render on mobile").toBeTruthy()
    for (const [name, control] of [
      ["Attach", attachControl(el)],
      ["Emoji", el.querySelector('button[aria-label="Emoji"]') as HTMLElement],
      ["More", more as HTMLElement],
    ] as Array<[string, HTMLElement]>) {
      expect(control, `${name} should render`).toBeTruthy()
      expect(control.matches(SHARED_SELECTOR), `${name} should match the shared rule`).toBe(true)
    }
  })

  it("gives Attach and the neighbouring buttons the same computed box model", async () => {
    const el = await createEditor(1024)
    const attach = getComputedStyle(attachControl(el))
    const emoji = getComputedStyle(el.querySelector('button[aria-label="Emoji"]') as HTMLElement)

    // Both are sized explicitly rather than relying on element-type defaults,
    // which is what kept the <label> taller than the <button>s.
    expect(attach.boxSizing).toBe("border-box")
    expect(emoji.boxSizing).toBe("border-box")
    expect(attach.boxSizing).toBe(emoji.boxSizing)
    expect(attach.minHeight).toBe(`${MIN_TOUCH_TARGET}px`)
    expect(emoji.minHeight).toBe(`${MIN_TOUCH_TARGET}px`)
  })

  it("keeps every first-level control at the 44px minimum outer height", async () => {
    const el = await createEditor(1024)
    for (const [name, control] of desktopControls(el)) {
      expect(outerMinHeight(getComputedStyle(control)), `${name} outer min height`).toBe(
        MIN_TOUCH_TARGET,
      )
    }

    const mobile = await createEditor(375)
    for (const [name, control] of [
      ["Attach", attachControl(mobile)],
      ["Emoji", mobile.querySelector('button[aria-label="Emoji"]') as HTMLElement],
      ["More", mobile.querySelector('button[aria-label="More composer actions"]') as HTMLElement],
    ] as Array<[string, HTMLElement]>) {
      expect(outerMinHeight(getComputedStyle(control)), `${name} outer min height`).toBe(
        MIN_TOUCH_TARGET,
      )
    }
  })

  it("keeps Attach's padding without letting it inflate the control's height", async () => {
    const el = await createEditor(1024)
    const attach = attachControl(el)
    const cs = getComputedStyle(attach)

    // Padding is still present (the icon/text spacing is unchanged)...
    expect(Number.parseFloat(cs.paddingTop)).toBeGreaterThan(0)
    expect(Number.parseFloat(cs.paddingBottom)).toBeGreaterThan(0)
    // ...but border-box means it is absorbed by the 44px minimum.
    expect(cs.boxSizing).toBe("border-box")
    expect(outerMinHeight(cs)).toBe(MIN_TOUCH_TARGET)
  })

  it("keeps the Attach file input hidden and the label as the file control", async () => {
    const el = await createEditor(1024)
    const attach = attachControl(el)

    expect(attach.tagName).toBe("LABEL")
    const input = attach.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input, "file input should live inside the Attach label").toBeTruthy()
    expect(input?.style.display).toBe("none")
    expect(getComputedStyle(input as HTMLInputElement).display).toBe("none")
  })
})
