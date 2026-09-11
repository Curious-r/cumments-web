import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

/**
 * The comment textarea's `aria-label` is localized (`t.commentAriaLabel` is
 * "Comment" in en but "评论" in zh-Hans). The formatting code used to locate the
 * textarea with the English literal `textarea[aria-label="Comment"]`, so in any
 * other locale the lookup returned null, `applyMarkdownFormat()` returned
 * early, and the Markdown toolbar silently did nothing.
 *
 * These tests drive the real toolbar path in both locales, across the actual
 * production boundary: the editor lives inside <cumments-comments>'s shadow
 * root rather than at the document root.
 */
const GEO = "geo:1,2"

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

describe("Markdown toolbar across locales", () => {
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

  /** Mounts the real component; the editor is reached through its shadow root. */
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
    const editor = host.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    return { host, editor }
  }

  /** Types through the real input path and selects a range. */
  async function typeAndSelect(
    host: Host,
    editor: CummentsEditor,
    text: string,
    start: number,
    end: number,
  ): Promise<HTMLTextAreaElement> {
    const textarea = editor.querySelector("textarea") as HTMLTextAreaElement
    textarea.focus()
    textarea.value = text
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    await host.updateComplete.catch(() => {})
    textarea.selectionStart = start
    textarea.selectionEnd = end
    return textarea
  }

  /** The real toolbar interaction: mousedown then click on the rendered button. */
  async function clickToolbar(host: Host, editor: CummentsEditor, label: string) {
    const button = editor.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
    if (!button) throw new Error(`${label} button not found`)
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await host.updateComplete.catch(() => {})
  }

  const draftOf = (editor: CummentsEditor) => (editor as unknown as { draft: string }).draft

  it("formats with the English label", async () => {
    const { host, editor } = await mount("en")
    await typeAndSelect(host, editor, "hello world", 6, 11)

    await clickToolbar(host, editor, "Bold")

    expect(draftOf(editor)).toBe("hello **world**")
  })

  it("resolves the textarea when the aria-label is localized", async () => {
    const { host, editor } = await mount("zh-Hans")

    // The premise of the bug: the label is not the English string.
    const textarea = editor.querySelector("textarea") as HTMLTextAreaElement
    expect(textarea.getAttribute("aria-label")).toBe("评论")
    // …and no English-labelled textarea exists to find.
    expect(editor.querySelector('textarea[aria-label="Comment"]')).toBeNull()
    // The stable hook still resolves it.
    expect(editor.querySelector('textarea[part="input"]')).toBe(textarea)

    await typeAndSelect(host, editor, "hello world", 6, 11)
    await clickToolbar(host, editor, "Bold")

    expect(draftOf(editor)).not.toBe("hello world")
    expect(draftOf(editor)).toBe("hello **world**")
    expect(textarea.value).toBe("hello **world**")
  })

  it("formats every toolbar action in the localized locale", async () => {
    const cases: Array<[string, string]> = [
      ["Bold", "hello **world**"],
      ["Italic", "hello *world*"],
      ["Strikethrough", "hello ~~world~~"],
      ["Code", "hello `world`"],
    ]
    for (const [label, expected] of cases) {
      const { host, editor } = await mount("zh-Hans")
      await typeAndSelect(host, editor, "hello world", 6, 11)
      await clickToolbar(host, editor, label)
      expect(draftOf(editor), label).toBe(expected)
      document.body.innerHTML = ""
    }
  })

  it("restores the selection and focus on the real textarea", async () => {
    const { host, editor } = await mount("zh-Hans")
    const textarea = await typeAndSelect(host, editor, "hello world", 6, 11)

    await clickToolbar(host, editor, "Bold")

    expect(textarea.selectionStart).toBe(8)
    expect(textarea.selectionEnd).toBe(13)
    // Inside a shadow root `document.activeElement` reports the host, so read
    // the focus through the parent's shadow root.
    expect(host.shadowRoot.activeElement).toBe(textarea)
  })

  it("keeps emoji insertion working in the localized locale", async () => {
    // Same shared lookup, same failure mode before the fix.
    const { host, editor } = await mount("zh-Hans")
    const textarea = await typeAndSelect(host, editor, "hello", 5, 5)

    ;(editor as unknown as { insertEmojiAtCaret: (e: string) => void }).insertEmojiAtCaret("😀")
    await new Promise((r) => setTimeout(r, 10))
    await host.updateComplete.catch(() => {})

    expect(draftOf(editor)).toBe("hello😀")
    expect(textarea.value).toBe("hello😀")
  })

  it("keeps geo parsing intact for the location preview", async () => {
    // Guards against a reflexive selector change breaking unrelated behaviour.
    const { editor } = await mount("zh-Hans")
    const formatted = (
      editor as unknown as { formatLocation: (g: string) => string }
    ).formatLocation(GEO)
    expect(formatted).toBe("1.0000, 2.0000")
  })
})
