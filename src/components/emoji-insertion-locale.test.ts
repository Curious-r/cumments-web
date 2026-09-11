import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

/**
 * The Emoji picker fed `insertEmojiAtCaret()`, which located the comment
 * textarea with the English literal `textarea[aria-label="Comment"]`. That
 * label is localized (`t.commentAriaLabel`: "Comment" in en, "评论" in zh-Hans),
 * so under any other locale the lookup returned null and selecting an emoji
 * did nothing.
 *
 * These tests drive the real picker path — toolbar button → picker → emoji
 * button → `handleEmojiPick` → `insertEmojiAtCaret` — across the production
 * boundary (the editor lives in <cumments-comments>'s shadow root), in both
 * locales.
 */
const EMOJI = "😀"
const EMOJI_NAME = "grinning face" // EMOJI_DATA names are not localized.

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => jsonResponse(body, status),
  } as unknown as Response
}

describe("emoji insertion across locales", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource

  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    localStorage.clear()
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "t.", difficulty: 1 })
      if (u.includes("/visitors/profile")) {
        return jsonResponse({ visitor_id: "v1", display_name: "Tester", avatar_url: null })
      }
      if (u.includes("/comments")) {
        return jsonResponse({
          data: [] as Message[],
          meta: { total: 0, page: 1, per_page: 20, total_pages: 1 },
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function waitFor(
    condition: () => boolean,
    message: string,
    timeoutMs = 2000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(`waitFor timed out: ${message}`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  type Host = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }

  async function mount(lang: string): Promise<{ host: Host; editor: CummentsEditor }> {
    const host = document.createElement("cumments-comments") as unknown as Host
    host.setAttribute("endpoint", "https://comments.curious.host")
    host.setAttribute("site-id", "my-blog")
    host.setAttribute("page-slug", "hello-world")
    if (lang) host.setAttribute("lang", lang)
    document.body.appendChild(host)

    await waitFor(
      () => host.shadowRoot.querySelector("cumments-editor") !== null,
      "editor to render inside the parent shadow root",
    )
    await host.updateComplete.catch(() => {})
    return { host, editor: host.shadowRoot.querySelector("cumments-editor") as CummentsEditor }
  }

  const draftOf = (editor: CummentsEditor) => (editor as unknown as { draft: string }).draft
  const textareaOf = (editor: CummentsEditor) =>
    editor.querySelector("textarea") as HTMLTextAreaElement
  const pickerOf = (editor: CummentsEditor) =>
    editor.querySelector('[role="dialog"][aria-label="Emoji picker"]') as HTMLElement | null

  async function typeAndSelect(
    host: Host,
    editor: CummentsEditor,
    text: string,
    start: number,
    end: number,
  ): Promise<HTMLTextAreaElement> {
    const textarea = textareaOf(editor)
    textarea.focus()
    textarea.value = text
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await host.updateComplete.catch(() => {})
    textarea.selectionStart = start
    textarea.selectionEnd = end
    return textarea
  }

  /** Real picker flow: open the picker, then activate an emoji entry. */
  async function pickEmoji(host: Host, editor: CummentsEditor, name = EMOJI_NAME) {
    const toggle = editor.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
    if (!toggle) throw new Error("Emoji toggle not found")
    // Mirror the real pointer activation: mousedown saves the caret, then click.
    toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    toggle.click()
    await host.updateComplete.catch(() => {})
    await waitFor(() => pickerOf(editor) !== null, "emoji picker to open")

    const entry = pickerOf(editor)?.querySelector(
      `.emoji-picker-grid button[aria-label="${name}"]`,
    ) as HTMLButtonElement | null
    if (!entry) throw new Error(`emoji entry ${name} not found`)
    entry.click()
    await new Promise((r) => setTimeout(r, 10))
    await host.updateComplete.catch(() => {})
  }

  describe.each(["en", "zh-Hans"])("locale %s", (lang) => {
    it("inserts at the caret through the real picker path", async () => {
      const { host, editor } = await mount(lang)
      const textarea = await typeAndSelect(host, editor, "hello world", 5, 5)

      await pickEmoji(host, editor)

      expect(draftOf(editor)).toBe(`hello${EMOJI} world`)
      expect(textarea.value).toBe(`hello${EMOJI} world`)
    })

    it("places the caret after the emoji (UTF-16 aware)", async () => {
      const { host, editor } = await mount(lang)
      const textarea = await typeAndSelect(host, editor, "hello world", 5, 5)

      await pickEmoji(host, editor)

      // 😀 is U+1F600: two UTF-16 code units, so 5 → 7.
      expect(textarea.selectionStart).toBe(7)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("replaces the selected range", async () => {
      const { host, editor } = await mount(lang)
      const textarea = await typeAndSelect(host, editor, "hello world", 6, 11) // "world"

      await pickEmoji(host, editor)

      expect(draftOf(editor)).toBe(`hello ${EMOJI}`)
      expect(textarea.selectionStart).toBe(8)
      expect(textarea.selectionEnd).toBe(8)
    })

    it("restores focus to the textarea after the picker closes", async () => {
      const { host, editor } = await mount(lang)
      const textarea = await typeAndSelect(host, editor, "hello", 5, 5)

      await pickEmoji(host, editor)

      expect(pickerOf(editor)).toBeNull()
      // Inside a shadow root `document.activeElement` reports the host.
      expect(host.shadowRoot.activeElement).toBe(textarea)
    })

    it("keeps the textarea and draft in sync", async () => {
      const { host, editor } = await mount(lang)
      const textarea = await typeAndSelect(host, editor, "hi", 2, 2)

      await pickEmoji(host, editor)

      expect(textarea.value).toBe(draftOf(editor))
      expect(draftOf(editor)).toBe(`hi${EMOJI}`)
    })
  })

  it("resolves the textarea despite the localized accessibility label", async () => {
    const { host, editor } = await mount("zh-Hans")
    const textarea = textareaOf(editor)

    // The premise: the label is not the English literal.
    expect(textarea.getAttribute("aria-label")).toBe("评论")
    expect(editor.querySelector('textarea[aria-label="Comment"]')).toBeNull()
    expect(editor.querySelector('textarea[part="input"]')).toBe(textarea)

    await typeAndSelect(host, editor, "hello", 5, 5)
    await pickEmoji(host, editor)

    // Before the fix this stayed "hello".
    expect(draftOf(editor)).toBe(`hello${EMOJI}`)
  })
})
