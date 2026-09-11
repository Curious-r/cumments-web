import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./editor/cumments-editor"

/**
 * The collapsed composer affordance used to be a generic `<div role="button">`.
 * It is a descendant of `.editor`, whose `focusin` expands the composer, so on
 * mousedown/touchstart the browser focused the affordance, `handleFocus` set
 * `focused = true`, Lit replaced the collapsed markup, and the affordance was
 * detached before the gesture's `click` arrived. Focus fell to `<body>`, so
 * `handleBlur` immediately set `focused = false` again — the tap appeared to do
 * nothing. Reproduced in real Chromium for both touch and mouse input.
 *
 * Three things had to change, and each covers a different activation path:
 *
 * 1. The affordance is now a native `<button type="button">` (better semantics
 *    than a `role=button` div, and native Enter/Space activation).
 * 2. It cancels mousedown so the browser never focuses it. That is what stops the
 *    race for pointer input: the button survives the gesture, so `click` lands.
 * 3. `handleFocus` ignores focus arriving on the affordance, and `handleBlur`
 *    ignores a blur originating from it. Without these, keyboard input stayed
 *    broken: tabbing to the affordance expanded the composer and replaced the
 *    focused button (dropping focus to `<body>`), and activating it removed the
 *    focused node, whose resulting blur collapsed the composer again.
 *
 * These tests deliberately never focus the textarea while setting up; the
 * earlier responsive helpers did so and therefore never exercised the collapsed
 * path at all.
 *
 * Note on coverage: happy-dom has no layout engine, does not focus an element on
 * mousedown, and does not blur removed nodes. It therefore cannot reproduce the
 * browser's focus race end to end — the mousedown-cancellation and native-element
 * assertions are the in-repo regression guards, backed by the real-browser
 * verification recorded for this change (Chromium, mouse and touch emulation:
 * tap/click, Tab, Enter, Space and blur all verified).
 */

type CollapsedEditor = HTMLElement & {
  updateComplete: Promise<boolean>
  setReplyToId: (id: string | null) => void
}

/** `focused` is a private state field on the editor; read it defensively. */
function isExpanded(el: HTMLElement): boolean {
  return (el as unknown as { focused: boolean }).focused
}

/**
 * The collapsed affordance. Matches either implementation so that assertions
 * about behaviour and the mousedown guard stay meaningful against the pre-fix
 * markup instead of trivially failing on a selector change.
 */
function collapsedControl(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[part="collapsed"], [role="button"]') as HTMLElement | null
}

/** The post-fix native control specifically. */
function nativeCollapsedControl(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector('[part="collapsed"]') as HTMLButtonElement | null
}

function commentTextarea(el: HTMLElement): HTMLTextAreaElement | null {
  return el.querySelector('textarea[part="input"]') as HTMLTextAreaElement | null
}

function dispatchMouseDown(target: HTMLElement): boolean {
  // Returns false when default was prevented, i.e. focus theft was suppressed.
  return target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
}

describe("Collapsed composer activation", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  async function createEditor(props: Record<string, unknown> = {}): Promise<CollapsedEditor> {
    const el = document.createElement("cumments-editor") as CollapsedEditor
    Object.assign(el, props)
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
    // Intentionally no commentTextarea(el)?.focus() here.
    return el
  }

  async function flush(el: CollapsedEditor): Promise<void> {
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
  }

  it("starts collapsed", async () => {
    const el = await createEditor()
    expect(collapsedControl(el), "collapsed affordance should be rendered").toBeTruthy()
    expect(isExpanded(el)).toBe(false)
    expect(document.activeElement).not.toBe(commentTextarea(el))
  })

  it("renders a native activation control, not a role=button div", async () => {
    const el = await createEditor()
    const control = nativeCollapsedControl(el)
    expect(control).toBeTruthy()
    expect(control?.tagName).toBe("BUTTON")
    expect(control?.getAttribute("type")).toBe("button")
    expect(control?.getAttribute("role")).toBeNull()
    expect(control?.tabIndex).toBe(0)
  })

  it("expands and focuses the textarea on click", async () => {
    const el = await createEditor()
    expect(collapsedControl(el)).toBeTruthy()

    collapsedControl(el)?.click()
    await flush(el)

    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el), "collapsed affordance should be gone once expanded").toBeNull()
    const textarea = commentTextarea(el)
    expect(textarea).toBeTruthy()
    expect(document.activeElement).toBe(textarea)
  })

  it("hands the textarea a usable, empty composer", async () => {
    const el = await createEditor()
    collapsedControl(el)?.click()
    await flush(el)

    const textarea = commentTextarea(el) as HTMLTextAreaElement
    textarea.value = "hello"
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await flush(el)
    expect(textarea.value).toBe("hello")
    expect(el.querySelector(".formatting-toolbar")).toBeTruthy()
  })

  /**
   * The regression guard. The affordance sits inside `.editor`, whose `focusin`
   * handler expands the composer. If the affordance takes focus, it is detached
   * mid-gesture: `click` is lost and the follow-up blur re-collapses. Cancelling
   * mousedown is what prevents the browser from focusing it, so this must hold.
   */
  it("does not let the collapsed control steal focus on mousedown", async () => {
    const el = await createEditor()
    const control = collapsedControl(el) as HTMLElement

    expect(dispatchMouseDown(control), "mousedown must be cancelled to prevent focus theft").toBe(
      false,
    )
  })

  /**
   * Tabbing to the affordance used to expand it (the editor's `focusin` handler),
   * which replaced the very button holding focus and dropped focus to `<body>` —
   * so keyboard users could never reach Enter/Space. Expansion is now an explicit
   * activation, which is what makes the keyboard path below possible.
   */
  it("does not expand merely because the collapsed control receives focus", async () => {
    const el = await createEditor()
    const control = collapsedControl(el) as HTMLElement

    control.focus()
    await flush(el)

    expect(collapsedControl(el), "focus alone must not consume the affordance").toBeTruthy()
    expect(isExpanded(el)).toBe(false)
    expect(document.activeElement).toBe(control)
  })

  it("activates through a realistic mouse sequence", async () => {
    const el = await createEditor()
    const control = collapsedControl(el) as HTMLElement

    dispatchMouseDown(control)
    control.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await flush(el)

    expect(collapsedControl(el)).toBeNull()
    expect(document.activeElement).toBe(commentTextarea(el))
  })

  /**
   * Touch is where this was reported. A tap dispatches touchstart/touchend and
   * then a synthesized mousedown/mouseup/click; that synthesized mousedown must
   * be cancelled too, or the same focus race reappears on phones.
   */
  it("activates through a realistic touch sequence", async () => {
    const el = await createEditor()
    const control = collapsedControl(el) as HTMLElement

    control.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    control.dispatchEvent(new Event("touchstart", { bubbles: true }))
    control.dispatchEvent(new Event("pointerup", { bubbles: true }))
    control.dispatchEvent(new Event("touchend", { bubbles: true }))
    const notCancelled = dispatchMouseDown(control)
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await flush(el)

    expect(notCancelled, "the synthesized mousedown of a tap must not focus the control").toBe(
      false,
    )
    expect(collapsedControl(el)).toBeNull()
    expect(isExpanded(el)).toBe(true)
    expect(document.activeElement).toBe(commentTextarea(el))
  })

  it.each([["Enter"], [" "]])("activates on the %s key", async (key) => {
    const el = await createEditor()
    const control = collapsedControl(el) as HTMLElement
    control.focus()

    control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
    await flush(el)

    expect(collapsedControl(el)).toBeNull()
    expect(isExpanded(el)).toBe(true)
    expect(document.activeElement).toBe(commentTextarea(el))
  })

  it("keeps collapsing again available after a blur", async () => {
    const el = await createEditor()
    collapsedControl(el)?.click()
    await flush(el)
    expect(collapsedControl(el)).toBeNull()

    const textarea = commentTextarea(el) as HTMLTextAreaElement
    const external = document.createElement("button")
    document.body.appendChild(external)
    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: external }))
    await flush(el)

    // Collapse policy is unchanged: an empty, blurred composer collapses, and
    // the affordance is usable again.
    expect(collapsedControl(el)).toBeTruthy()
    collapsedControl(el)?.click()
    await flush(el)
    expect(document.activeElement).toBe(commentTextarea(el))
  })

  it("keeps the reply path expanded without going through the affordance", async () => {
    const el = await createEditor()
    el.setReplyToId("$reply-target")
    await flush(el)

    expect(collapsedControl(el), "replying must bypass the collapsed UI").toBeNull()
    const textarea = commentTextarea(el) as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    // Immediately usable without activating the collapsed affordance.
    textarea.focus()
    expect(document.activeElement).toBe(textarea)
    textarea.value = "replying"
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await flush(el)
    expect(textarea.value).toBe("replying")
  })
})
