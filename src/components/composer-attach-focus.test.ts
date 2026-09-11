import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"
import type { CummentsEditor } from "./editor/cumments-editor"

type CollapsedEditor = CummentsEditor & {
  updateComplete: Promise<boolean>
}

function isExpanded(el: HTMLElement): boolean {
  return (el as unknown as { focused: boolean }).focused
}

function collapsedControl(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[part="collapsed"], [role="button"]') as HTMLElement | null
}

function commentTextarea(el: HTMLElement): HTMLTextAreaElement | null {
  return el.querySelector('textarea[part="input"]') as HTMLTextAreaElement | null
}

function attachControl(el: HTMLElement): HTMLLabelElement | null {
  return el.querySelector("label.toolbar-control") as HTMLLabelElement | null
}

function attachInput(el: HTMLElement): HTMLInputElement | null {
  return el.querySelector('label.toolbar-control input[type="file"]') as HTMLInputElement | null
}

describe("Expanded composer Attach activation and focus lifecycle", () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  async function createExpandedEditor(
    props: Record<string, unknown> = {},
  ): Promise<CollapsedEditor> {
    const el = document.createElement("cumments-editor") as CollapsedEditor
    Object.assign(el, props)
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})

    // Activate the collapsed affordance to enter the expanded state
    const collapsed = collapsedControl(el)
    if (collapsed) {
      collapsed.click()
      await new Promise((r) => setTimeout(r, 30))
      await el.updateComplete?.catch(() => {})
    }

    // Ensure comment textarea is focused as if user was actively typing
    const textarea = commentTextarea(el)
    if (textarea) {
      textarea.focus()
    }
    await el.updateComplete?.catch(() => {})
    return el
  }

  async function flush(el: CollapsedEditor): Promise<void> {
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete?.catch(() => {})
  }

  /**
   * Note on test environment limitations:
   * happy-dom has no layout engine, does not move focus on un-focusable mousedown,
   * and does not blur when native file pickers open. In a real browser (Chromium / Firefox),
   * activating a <label> containing a hidden <input type="file"> triggers mousedown on an
   * un-focusable element, which would clear focus from the textarea to <body> (with
   * relatedTarget = null) and collapse the composer before click / file selection can occur.
   *
   * The regression guard verifies that:
   * 1. mousedown on the Attach control is cancelled (e.preventDefault() called), which in
   *    real browsers suppresses the focus theft/blur and keeps the textarea focused.
   * 2. The composer remains expanded throughout mouse, touch, and keyboard activation paths.
   * 3. handleBlur ignores blur originating from the Attach control when the OS dialog opens.
   */
  it("starts expanded with the textarea focused and Attach control present", async () => {
    const el = await createExpandedEditor()

    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
    expect(attachControl(el)).toBeTruthy()
    expect(attachInput(el)).toBeTruthy()
  })

  it("suppresses focus loss by cancelling mousedown on the Attach control (mouse path)", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement

    // In a real browser, pointer down on an un-focusable <label> blurs the textarea
    // unless mousedown is prevented.
    const mousedownEv = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    const notCancelled = attach.dispatchEvent(mousedownEv)

    expect(notCancelled, "mousedown on Attach must be cancelled to prevent textarea blur").toBe(
      false,
    )
    expect(mousedownEv.defaultPrevented).toBe(true)

    // Completing the click must keep the composer expanded
    attach.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }))
    attach.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flush(el)

    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("suppresses focus loss on touch tap sequence (touch path)", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement

    // Model touch gesture: touchstart -> touchend -> synthesized mousedown -> click
    attach.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }))
    attach.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true }))

    const mousedownEv = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    const notCancelled = attach.dispatchEvent(mousedownEv)
    expect(notCancelled, "synthesized mousedown on touch must be cancelled").toBe(false)

    attach.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flush(el)

    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("does not collapse when the Attach control loses focus (OS file picker open)", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement

    // Simulate focus on the Attach control losing focus to the OS file picker dialog
    // (where relatedTarget is null because focus leaves the window entirely).
    attach.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    await flush(el)

    expect(
      isExpanded(el),
      "composer must stay expanded when Attach loses focus to file dialog",
    ).toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("file selection reaches handleMediaSelect and creates pending media", async () => {
    const uploadMock = vi.fn(async () => ({
      url: "https://example.com/test-attachment.png",
      filename: "test-attachment.png",
      mimetype: "image/png",
      size: 1024,
      voice: false,
    }))

    const el = await createExpandedEditor({
      uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"],
    })
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    // Activate Attach control
    attach.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    attach.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await flush(el)

    // Select file via input change
    const file = new File(["test-content"], "test-attachment.png", { type: "image/png" })
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await flush(el)

    expect(uploadMock).toHaveBeenCalledTimes(1)
    const pending = (el as unknown as { pendingMedia: { url: string } | null }).pendingMedia
    expect(pending).toBeTruthy()
    expect(pending?.url).toBe("https://example.com/test-attachment.png")
    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
  })

  it("keyboard Enter and Space activate the file input", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    let clickCount = 0
    input.addEventListener("click", () => {
      clickCount++
    })

    // Enter key
    attach.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    )
    expect(clickCount).toBe(1)

    // Space key
    attach.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    )
    expect(clickCount).toBe(2)

    await flush(el)
    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
  })

  it("leaves Markdown, Emoji, Location, Poll, and More unaffected", async () => {
    const el = await createExpandedEditor()
    const textarea = commentTextarea(el) as HTMLTextAreaElement

    // 1. Markdown formatting button
    textarea.value = "test formatting"
    textarea.selectionStart = 0
    textarea.selectionEnd = 4
    const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
    expect(boldBtn).toBeTruthy()
    boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    boldBtn.click()
    await flush(el)
    expect(textarea.value).toBe("**test** formatting")
    expect(isExpanded(el)).toBe(true)

    // 2. Emoji picker toggle
    const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
    expect(emojiBtn).toBeTruthy()
    emojiBtn.click()
    await flush(el)
    expect(el.querySelector(".emoji-picker")).toBeTruthy()
    expect(isExpanded(el)).toBe(true)
    // Close emoji
    emojiBtn.click()
    await flush(el)

    // 3. Location button
    const locationBtn = el.querySelector('button[aria-label="Add location"]') as HTMLButtonElement
    expect(locationBtn).toBeTruthy()
    expect(isExpanded(el)).toBe(true)

    // 4. Poll button
    const pollBtn = el.querySelector('button[data-action="poll"]') as HTMLButtonElement
    expect(pollBtn).toBeTruthy()
    pollBtn.click()
    await flush(el)
    expect(el.querySelector(".poll-editor")).toBeTruthy()
    expect(isExpanded(el)).toBe(true)
    // Close poll
    pollBtn.click()
    await flush(el)

    // 5. Normal blur outside editor still collapses an empty composer
    textarea.value = ""
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await flush(el)

    const external = document.createElement("button")
    document.body.appendChild(external)
    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: external }))
    await flush(el)

    expect(isExpanded(el)).toBe(false)
    expect(collapsedControl(el)).toBeTruthy()
    document.body.removeChild(external)
  })
})
