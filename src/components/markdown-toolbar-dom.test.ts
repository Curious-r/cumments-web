import { describe, expect, it } from "vitest"
import "./editor/cumments-editor"
import type { CummentsEditor } from "./editor/cumments-editor"

/**
 * `applyMarkdownFormat()` resolves the comment textarea with
 * `this.querySelector('textarea[aria-label="Comment"]')`.
 *
 * That only works because `<cumments-editor>` renders into the LIGHT DOM:
 * `createRenderRoot()` returns `this`, so there is no shadow root between the
 * host element and its textarea. If the editor ever moves to Shadow DOM, that
 * lookup silently returns null, `applyMarkdownFormat()` returns early, and the
 * formatting buttons appear to do nothing — so the topology itself is pinned
 * here rather than left implicit.
 *
 * Verified in real browsers (Chromium 140 and Firefox 155, driven over CDP /
 * WebDriver BiDi with genuine mouse input): selecting `world` in
 * `hello world` and clicking Bold yields `hello **world**`.
 */
describe("Markdown toolbar DOM access", () => {
  async function createEditor(): Promise<CummentsEditor> {
    const el = document.createElement("cumments-editor") as CummentsEditor
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    return el
  }

  const textareaOf = (el: CummentsEditor) =>
    el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement

  const draftOf = (el: CummentsEditor) => (el as unknown as { currentDraft: string }).currentDraft

  const flush = async (el: CummentsEditor) => {
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
  }

  async function setup(
    text: string,
    selection: [number, number],
  ): Promise<{ el: CummentsEditor; textarea: HTMLTextAreaElement }> {
    const el = await createEditor()
    const textarea = textareaOf(el)
    textarea.focus()
    textarea.value = text
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await flush(el)
    textarea.selectionStart = selection[0]
    textarea.selectionEnd = selection[1]
    return { el, textarea }
  }

  it("renders the comment textarea in the light DOM, not a shadow root", async () => {
    const el = await createEditor()

    // The premise `applyMarkdownFormat` depends on.
    expect((el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot).toBeNull()
    expect(textareaOf(el)).toBeTruthy()
    expect(el.contains(textareaOf(el))).toBe(true)
  })

  it("resolves the textarea so the formatter is not skipped", async () => {
    const { el, textarea } = await setup("hello world", [6, 11])

    // `applyMarkdownFormat()` returns early when this lookup yields null, which
    // is exactly the "buttons do nothing" symptom.
    expect(textareaOf(el)).toBe(textarea)

    ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
    await flush(el)

    // The draft must change; an early return would leave it untouched.
    expect(draftOf(el)).not.toBe("hello world")
  })

  it("applies bold to the selected word and restores the selection", async () => {
    const { el, textarea } = await setup("hello world", [6, 11])

    ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
    await flush(el)

    expect(draftOf(el)).toBe("hello **world**")
    expect(textarea.value).toBe("hello **world**")
    // Selection sits on "world" inside the inserted markers.
    expect(textarea.selectionStart).toBe(8)
    expect(textarea.selectionEnd).toBe(13)
    expect(document.activeElement).toBe(textarea)
  })

  it("applies every toolbar action through the same resolved textarea", async () => {
    const cases: Array<[string, string]> = [
      ["italic", "hello *world*"],
      ["strikethrough", "hello ~~world~~"],
      ["code", "hello `world`"],
    ]
    for (const [format, expected] of cases) {
      const { el } = await setup("hello world", [6, 11])
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat(format)
      await flush(el)
      expect(draftOf(el), `${format}`).toBe(expected)
    }
  })

  it("keeps currentDraft a read-only getter", async () => {
    const el = await createEditor()
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el) as object,
      "currentDraft",
    )
    // Callers must never assign to it; the fix must not make it writable.
    expect(descriptor?.get).toBeTypeOf("function")
    expect(descriptor?.set).toBeUndefined()
  })
})
