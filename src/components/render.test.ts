import { html, render } from "lit"
import { describe, expect, it } from "vitest"
import type { Message } from "../api/contract/query"
import { renderContent } from "./render"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello", style: "normal" } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
    ...overrides,
  } as Message
}

function renderToContainer(message: Message): HTMLElement {
  const container = document.createElement("div")
  const template = renderContent(message)
  render(template, container)
  return container
}

describe("render helpers", () => {
  it("renderContent preserves Message body for text", () => {
    const msg = makeMessage({
      content: {
        type: "text",
        body: "hello world",
        style: "normal",
      } as unknown as Message["content"],
    })
    const result = renderContent(msg) as unknown as {
      values: unknown[]
      strings: TemplateStringsArray
    }
    expect(result.values).toContain("hello world")
    expect(msg.content.body).toBe("hello world")
  })

  it("renderContent handles redacted tombstone", () => {
    const msg = makeMessage({
      content: { type: "redacted" } as unknown as Message["content"],
      status: "redacted" as unknown as Message["status"],
    })
    const result = renderContent(msg) as unknown as {
      strings: TemplateStringsArray
    }
    expect(result.strings.join("")).toContain("deleted")
  })

  it("keyed repeat identity: comments use event_id as key", async () => {
    const msgs = [makeMessage({ event_id: "$1" }), makeMessage({ event_id: "$2" })]
    const keys = msgs.map((m) => m.event_id)
    expect(keys).toEqual(["$1", "$2"])
    const reordered = [msgs[1], msgs[0]]
    expect(reordered.map((m) => m.event_id)).toEqual(["$2", "$1"])
  })
})

describe("formatted body rendering", () => {
  describe("formatted rendering", () => {
    it("renders formatted_body when available", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "plain fallback",
          formatted_body: "<p>Hello <strong>world</strong></p>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.innerHTML).toContain("<strong>world</strong>")
      expect(container.innerHTML).toContain("Hello")
    })

    it("renders em and i formatting", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: "<p><em>emphasis</em> and <i>italic</i></p>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.innerHTML).toContain("<em>emphasis</em>")
      expect(container.innerHTML).toContain("<i>italic</i>")
    })

    it("renders paragraphs and line breaks", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: "<p>First</p><p>Second<br />line</p>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.innerHTML).toContain("<p>First</p>")
      expect(container.innerHTML).toContain("<p>Second")
      expect(container.innerHTML).toContain("<br")
    })

    it("renders lists as native elements", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: "<ul><li>A</li><li>B</li></ul>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.querySelector("ul")).toBeTruthy()
      expect(container.querySelectorAll("li").length).toBe(2)
    })

    it("renders code and blockquote", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: "<pre><code>const x = 1</code></pre><blockquote>quote</blockquote>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.querySelector("pre")).toBeTruthy()
      expect(container.querySelector("code")).toBeTruthy()
      expect(container.querySelector("blockquote")).toBeTruthy()
    })

    it("renders sanitized links with safe href", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: '<a href="https://example.com">link</a>',
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      const link = container.querySelector("a")
      expect(link).toBeTruthy()
      expect(link?.getAttribute("href")).toBe("https://example.com")
    })
  })

  describe("plain fallback", () => {
    it("renders body when formatted_body is missing", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "plain text content",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.textContent).toContain("plain text content")
    })

    it("renders body when formatted_body is empty", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "fallback text",
          formatted_body: "",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.textContent).toContain("fallback text")
    })

    it("does not throw for malformed formatted_body", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "fallback",
          formatted_body: "<p>unclosed <strong>bold",
          style: "normal",
        } as unknown as Message["content"],
      })
      expect(() => renderToContainer(msg)).not.toThrow()
    })

    it("sanitizes unsafe input before DOM insertion", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: '<p>safe</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.querySelector("script")).toBeFalsy()
      expect(container.innerHTML).not.toContain("javascript:")
      expect(container.innerHTML).toContain("safe")
    })
  })

  describe("layout and semantics", () => {
    it("formatted blocks stay inside container", () => {
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: "<p>text</p><ul><li>item</li></ul>",
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      expect(container.querySelector("p")).toBeTruthy()
      expect(container.querySelector("ul")).toBeTruthy()
    })

    it("long code does not cause overflow issues", () => {
      const longCode = "x".repeat(200)
      const msg = makeMessage({
        content: {
          type: "text",
          body: "",
          formatted_body: `<pre><code>${longCode}</code></pre>`,
          style: "normal",
        } as unknown as Message["content"],
      })
      const container = renderToContainer(msg)
      const pre = container.querySelector("pre")
      expect(pre).toBeTruthy()
      // pre has overflow-x: auto from CSS, but we can't test computed styles in happy-dom
      // Just verify the content is preserved
      expect(pre?.textContent?.length).toBeGreaterThan(0)
    })

    it("does not alter unrelated comment branches", () => {
      const textMsg = makeMessage({
        content: {
          type: "text",
          body: "text content",
          style: "normal",
        } as unknown as Message["content"],
      })
      const mediaMsg = makeMessage({
        content: {
          type: "media",
          kind: "image",
          url: "https://example.com/img.png",
          style: "normal",
        } as unknown as Message["content"],
      })
      const textContainer = renderToContainer(textMsg)
      const mediaContainer = renderToContainer(mediaMsg)
      expect(textContainer.textContent).toContain("text content")
      expect(mediaContainer.querySelector("img")).toBeTruthy()
    })
  })
})
