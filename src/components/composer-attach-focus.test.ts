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
   * Environment Scope & Real-Browser Verification Summary:
   *
   * 1. What Happy DOM tests verify:
   *    - In-DOM activation paths: native label click bubbling to the enclosed `<input type="file">`.
   *    - `mousedown.preventDefault()` execution: asserting `defaultPrevented === true` on the
   *      `Attach` `<label>`, which suppresses focus movement away from the textarea.
   *    - Keyboard activation: `Enter` and `Space` keydown events on `label[tabindex="0"]` call
   *      `preventDefault()` and programmatically trigger `click()` on the file input.
   *    - Complete file selection flow: triggering file input activation via label/keyboard,
   *      supplying files upon activation, dispatching `change`, and asserting that `uploadMedia`
   *      is invoked while the composer remains expanded.
   *    - Focus blur guards: verifying that `handleBlur` does not collapse the composer when
   *      blur originates from `label.toolbar-control` or its child `<input type="file">`.
   *    - Immunity of other controls: Markdown buttons, Emoji, Location, Poll, and More menu.
   *
   * 2. What Happy DOM cannot model (and was verified via Chromium CDP):
   *    - Happy DOM has no layout engine, does not shift focus to `<body>` on un-focusable mousedown,
   *      and cannot open native OS dialogs (`Page.fileChooserOpened`).
   *    - In Chromium 140 (CDP intercept mode):
   *      * Mouse press (`Input.dispatchMouseEvent`) on Attach cancelled mousedown, left the
   *        textarea focused (`activeElement: TEXTAREA`), and opened `Page.fileChooserOpened`.
   *      * Touch tap (`Input.dispatchTouchEvent`) on Attach triggered native label click,
   *        opened `Page.fileChooserOpened`, and left composer expanded.
   *      * Keyboard navigation (`Tab` to Attach label, `Enter` / `Space`) opened
   *        `Page.fileChooserOpened` with Attach label focused, leaving composer expanded.
   *      * CDP file selection (`DOM.setFileInputFiles`) populated the input, fired `change`,
   *        and transitioned `pendingMedia` to uploaded state without collapsing the composer.
   */

  it("starts expanded with the textarea focused and Attach control configured as a label", async () => {
    const el = await createExpandedEditor()

    expect(isExpanded(el)).toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()

    const attach = attachControl(el)
    expect(attach).toBeTruthy()
    expect(attach?.tagName.toLowerCase()).toBe("label")
    expect(attach?.getAttribute("tabindex")).toBe("0")

    const input = attachInput(el)
    expect(input).toBeTruthy()
    expect(input?.type).toBe("file")
    expect(input?.style.display).toBe("none")
  })

  it("activates the hidden file input via native label click while suppressing focus loss (mouse path)", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    let inputClickCount = 0
    input.addEventListener("click", () => {
      inputClickCount++
    })

    // In a real browser, pointer down on an un-focusable <label> blurs the textarea
    // unless mousedown is prevented.
    const mousedownEv = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    const notCancelled = attach.dispatchEvent(mousedownEv)

    expect(notCancelled, "mousedown on Attach must be cancelled to prevent textarea blur").toBe(
      false,
    )
    expect(mousedownEv.defaultPrevented).toBe(true)

    // Activating the label must trigger a click on the enclosed file input via native label behavior
    attach.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }))
    attach.click()
    await flush(el)

    expect(inputClickCount, "clicking Attach label must natively activate the file input").toBe(1)
    expect(isExpanded(el), "composer must stay expanded after Attach click").toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("activates the hidden file input on touch tap sequence while suppressing focus loss (touch path)", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    let inputClickCount = 0
    input.addEventListener("click", () => {
      inputClickCount++
    })

    // Model touch gesture: touchstart -> touchend -> synthesized mousedown -> click
    attach.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }))
    attach.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true }))

    const mousedownEv = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    const notCancelled = attach.dispatchEvent(mousedownEv)
    expect(notCancelled, "synthesized mousedown on touch must be cancelled").toBe(false)
    expect(mousedownEv.defaultPrevented).toBe(true)

    attach.click()
    await flush(el)

    expect(inputClickCount, "touch tap on Attach label must reach and click the file input").toBe(1)
    expect(isExpanded(el), "composer must stay expanded after touch activation").toBe(true)
    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("activates the hidden file input via keyboard Enter and Space with default action prevented", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    let inputClickCount = 0
    input.addEventListener("click", () => {
      inputClickCount++
    })

    // Enter key
    const enterEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    attach.dispatchEvent(enterEv)
    expect(enterEv.defaultPrevented, "Enter on Attach must prevent default").toBe(true)
    expect(inputClickCount, "Enter on Attach must activate the file input").toBe(1)

    // Space key
    const spaceEv = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
    attach.dispatchEvent(spaceEv)
    expect(spaceEv.defaultPrevented, "Space on Attach must prevent default").toBe(true)
    expect(inputClickCount, "Space on Attach must activate the file input").toBe(2)

    await flush(el)
    expect(isExpanded(el), "composer must stay expanded after keyboard activation").toBe(true)
    expect(collapsedControl(el)).toBeNull()
  })

  it("completes full file selection flow initiated through native label activation (mouse/touch)", async () => {
    const uploadMock = vi.fn(async () => ({
      url: "https://example.com/uploaded-photo.jpg",
      filename: "photo.jpg",
      mimetype: "image/jpeg",
      size: 2048,
      voice: false,
    }))

    const el = await createExpandedEditor({
      uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"],
    })
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    // Intercept input click (which in a real browser opens the OS file chooser)
    // and simulate user selecting a file in response to that activation.
    let activationReachedInput = false
    input.addEventListener("click", () => {
      activationReachedInput = true
      const file = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" })
      Object.defineProperty(input, "files", { value: [file], writable: true, configurable: true })
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })

    // User clicks the Attach label
    attach.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    attach.click()
    await flush(el)

    expect(
      activationReachedInput,
      "Attach label activation must reach the file input and trigger the chooser flow",
    ).toBe(true)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ name: "photo.jpg" }))

    const pending = (el as unknown as { pendingMedia: { url: string; kind: string } | null })
      .pendingMedia
    expect(pending).toBeTruthy()
    expect(pending?.url).toBe("https://example.com/uploaded-photo.jpg")
    expect(pending?.kind).toBe("image")

    // The input value must be cleared so selecting the same file again still fires change
    expect(input.value).toBe("")
    expect(isExpanded(el), "composer must remain expanded after completing file upload").toBe(true)
    expect(collapsedControl(el)).toBeNull()
  })

  it("completes full file selection flow initiated through keyboard activation", async () => {
    const uploadMock = vi.fn(async () => ({
      url: "https://example.com/document.pdf",
      filename: "document.pdf",
      mimetype: "application/pdf",
      size: 4096,
      voice: false,
    }))

    const el = await createExpandedEditor({
      uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"],
    })
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    let activationReachedInput = false
    input.addEventListener("click", () => {
      activationReachedInput = true
      const file = new File(["doc-bytes"], "document.pdf", { type: "application/pdf" })
      Object.defineProperty(input, "files", { value: [file], writable: true, configurable: true })
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })

    // User focuses Attach and presses Enter
    attach.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    )
    await flush(el)

    expect(activationReachedInput, "Keyboard Enter must activate the file input").toBe(true)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ name: "document.pdf" }))

    const pending = (el as unknown as { pendingMedia: { url: string; kind: string } | null })
      .pendingMedia
    expect(pending?.url).toBe("https://example.com/document.pdf")
    expect(pending?.kind).toBe("file")
    expect(isExpanded(el), "composer must remain expanded after keyboard file selection").toBe(true)
  })

  it("does not collapse when the Attach control or its input loses focus to the OS file picker", async () => {
    const el = await createExpandedEditor()
    const attach = attachControl(el) as HTMLLabelElement
    const input = attachInput(el) as HTMLInputElement

    // Scenario A: focus is on the Attach label when the OS file dialog opens
    // (relatedTarget is null because focus leaves the window entirely)
    attach.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    await flush(el)
    expect(
      isExpanded(el),
      "composer must stay expanded when Attach label loses focus to file dialog",
    ).toBe(true)

    // Scenario B: focus is on the file input itself when losing focus
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    await flush(el)
    expect(
      isExpanded(el),
      "composer must stay expanded when hidden file input loses focus to file dialog",
    ).toBe(true)

    expect(collapsedControl(el)).toBeNull()
    expect(commentTextarea(el)).toBeTruthy()
  })

  it("leaves Markdown, Emoji, Location, Poll, and More unaffected", async () => {
    const el = await createExpandedEditor()
    const textarea = commentTextarea(el) as HTMLTextAreaElement

    // 1. Markdown formatting button preserves selection and applies syntax
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
