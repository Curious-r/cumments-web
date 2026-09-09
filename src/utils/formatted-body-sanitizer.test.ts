import { describe, expect, it } from "vitest"
import { sanitizeFormattedBody } from "./formatted-body-sanitizer"

describe("sanitizeFormattedBody", () => {
  describe("safe formatting", () => {
    it("preserves paragraphs and strong text", () => {
      const input = "<p>Hello <strong>world</strong></p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<p>")
      expect(result).toContain("<strong>world</strong>")
      expect(result).toContain("Hello")
    })

    it("preserves em and i tags", () => {
      const input = "<p><em>emphasis</em> and <i>italic</i></p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<em>emphasis</em>")
      expect(result).toContain("<i>italic</i>")
    })

    it("preserves lists", () => {
      const input = "<ul><li>A</li><li>B</li></ul>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<ul>")
      expect(result).toContain("<li>A</li>")
      expect(result).toContain("<li>B</li>")
    })

    it("preserves blockquotes", () => {
      const input = "<blockquote>quote</blockquote>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<blockquote>quote</blockquote>")
    })

    it("preserves pre and code", () => {
      const input = "<pre><code>const x = 1</code></pre>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<pre>")
      expect(result).toContain("<code>const x = 1</code>")
    })

    it("preserves del and s tags", () => {
      const input = "<p><del>deleted</del> and <s>strikethrough</s></p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<del>deleted</del>")
      expect(result).toContain("<s>strikethrough</s>")
    })

    it("preserves br tags", () => {
      const input = "<p>line1<br />line2</p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<br")
    })

    it("preserves u tags", () => {
      const input = "<p><u>underlined</u></p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<u>underlined</u>")
    })

    it("preserves b tags", () => {
      const input = "<p><b>bold</b></p>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<b>bold</b>")
    })

    it("preserves ordered lists", () => {
      const input = "<ol><li>first</li><li>second</li></ol>"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("<ol>")
      expect(result).toContain("<li>first</li>")
    })
  })

  describe("unknown elements", () => {
    it("unwraps div while preserving text", () => {
      const input = "<div>Hello <span>world</span></div>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<div>")
      expect(result).not.toContain("<span>")
      expect(result).toContain("Hello")
      expect(result).toContain("world")
    })

    it("unwraps span while preserving text", () => {
      const input = "<p>text <span>inner</span> more</p>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<span>")
      expect(result).toContain("text")
      expect(result).toContain("inner")
      expect(result).toContain("more")
    })

    it("unwraps nested unknown elements", () => {
      const input = "<div><div><span>deep</span></div></div>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<div>")
      expect(result).not.toContain("<span>")
      expect(result).toContain("deep")
    })

    it("preserves allowed elements inside unknown wrappers", () => {
      const input = "<div><p>paragraph</p></div>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<div>")
      expect(result).toContain("<p>paragraph</p>")
    })
  })

  describe("dangerous elements", () => {
    it("removes script tags and content", () => {
      const input = "<p>safe</p><script>alert(1)</script>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<script")
      expect(result).not.toContain("alert(1)")
      expect(result).toContain("<p>safe</p>")
    })

    it("removes iframe tags and content", () => {
      const input = '<iframe src="evil.com">x</iframe>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<iframe")
      expect(result).not.toContain("evil.com")
    })

    it("removes style tags and content", () => {
      const input = "<style>body { background: red }</style>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<style")
      expect(result).not.toContain("background")
    })

    it("removes object tags and content", () => {
      const input = '<object data="evil.swf">x</object>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<object")
    })

    it("removes svg tags and content", () => {
      const input = "<svg><script>alert(1)</script></svg>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<svg")
      expect(result).not.toContain("alert")
    })

    it("removes embed tags", () => {
      const input = '<embed src="evil.swf" />'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<embed")
    })

    it("removes form tags", () => {
      const input = '<form action="evil.com"><input /></form>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<form")
      expect(result).not.toContain("<input")
    })

    it("removes video tags", () => {
      const input = '<video src="evil.mp4"></video>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<video")
    })

    it("removes audio tags", () => {
      const input = '<audio src="evil.mp3"></audio>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<audio")
    })

    it("removes canvas tags", () => {
      const input = '<canvas id="c"></canvas>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<canvas")
    })
  })

  describe("dangerous attributes", () => {
    it("removes onclick attributes", () => {
      const input = '<p onclick="alert(1)">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("onclick")
      expect(result).toContain("<p>text</p>")
    })

    it("removes onerror attributes", () => {
      const input = '<a href="https://example.com" onerror="alert(1)">link</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("onerror")
      expect(result).toContain("link")
    })

    it("removes onload attributes", () => {
      const input = '<p onload="alert(1)">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("onload")
    })

    it("removes onmouseover attributes", () => {
      const input = '<p onmouseover="alert(1)">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("onmouseover")
    })

    it("removes style attributes", () => {
      const input = '<p style="color: red">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("style=")
      expect(result).toContain("<p>text</p>")
    })

    it("removes class attributes", () => {
      const input = '<p class="foo">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("class=")
      expect(result).toContain("<p>text</p>")
    })

    it("removes id attributes", () => {
      const input = '<p id="bar">text</p>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("id=")
      expect(result).toContain("<p>text</p>")
    })

    it("removes target attributes from links", () => {
      const input = '<a href="https://example.com" target="_blank">link</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("target=")
      expect(result).toContain("<a href=")
    })
  })

  describe("URL schemes", () => {
    it("allows https URLs", () => {
      const input = '<a href="https://example.com">safe</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain("safe")
    })

    it("allows http URLs", () => {
      const input = '<a href="http://example.com">safe</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).toContain('href="http://example.com"')
      expect(result).toContain("safe")
    })

    it("allows mailto URLs", () => {
      const input = '<a href="mailto:test@example.com">mail</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).toContain('href="mailto:test@example.com"')
      expect(result).toContain("mail")
    })

    it("allows relative URLs", () => {
      const input = '<a href="/path/to/page">link</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).toContain('href="/path/to/page"')
    })

    it("removes javascript: URLs but keeps text", () => {
      const input = '<a href="javascript:alert(1)">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("javascript:")
      expect(result).toContain("<a>bad</a>")
    })

    it("removes data: URLs but keeps text", () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("data:")
      expect(result).toContain("<a>bad</a>")
    })

    it("removes vbscript: URLs but keeps text", () => {
      const input = '<a href="vbscript:msgbox">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("vbscript:")
      expect(result).toContain("<a>bad</a>")
    })

    it("handles uppercase JavaScript: scheme", () => {
      const input = '<a href="JavaScript:alert(1)">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("javascript:")
      expect(result).toContain("<a>bad</a>")
    })

    it("handles mixed case scheme", () => {
      const input = '<a href="JaVaScRiPt:alert(1)">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("javascript:")
      expect(result).toContain("<a>bad</a>")
    })

    it("handles whitespace before scheme", () => {
      const input = '<a href="  javascript:alert(1)">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("javascript:")
      expect(result).toContain("<a>bad</a>")
    })

    it("handles tab in scheme", () => {
      const input = '<a href="java\tscript:alert(1)">bad</a>'
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("javascript:")
      expect(result).toContain("<a>bad</a>")
    })
  })

  describe("malformed input", () => {
    it("handles unclosed tags", () => {
      const input = "<p>unclosed <strong>bold"
      const result = sanitizeFormattedBody(input)
      expect(() => result).not.toThrow()
      expect(result).toContain("unclosed")
      expect(result).toContain("bold")
    })

    it("handles mismatched tags", () => {
      const input = "<p><em>text</p></em>"
      const result = sanitizeFormattedBody(input)
      expect(() => result).not.toThrow()
      expect(result).toContain("text")
    })

    it("handles broken attributes", () => {
      const input = '<a href="unclosed>text</a>'
      const result = sanitizeFormattedBody(input)
      expect(() => result).not.toThrow()
      // DOMParser normalizes malformed markup; output must be safe
      expect(result).not.toContain("javascript:")
    })

    it("handles nested scripts", () => {
      const input = "<script><script>alert(1)</script></script>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<script")
      expect(result).not.toContain("alert")
    })
  })

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeFormattedBody("")).toBe("")
    })

    it("returns empty string for whitespace-only input", () => {
      expect(sanitizeFormattedBody("   ")).toBe("")
    })

    it("preserves plain text", () => {
      const input = "just plain text"
      const result = sanitizeFormattedBody(input)
      expect(result).toContain("just plain text")
    })

    it("handles entities", () => {
      const input = "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
      const result = sanitizeFormattedBody(input)
      expect(result).not.toContain("<script>")
      expect(result).toContain("&lt;")
    })
  })

  describe("idempotence", () => {
    it("is idempotent for safe HTML", () => {
      const input = "<p>Hello <strong>world</strong></p>"
      const once = sanitizeFormattedBody(input)
      const twice = sanitizeFormattedBody(once)
      expect(twice).toBe(once)
    })

    it("is idempotent for dangerous HTML", () => {
      const input = '<p>safe</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>'
      const once = sanitizeFormattedBody(input)
      const twice = sanitizeFormattedBody(once)
      expect(twice).toBe(once)
    })

    it("is idempotent for unknown elements", () => {
      const input = "<div>Hello <span>world</span></div>"
      const once = sanitizeFormattedBody(input)
      const twice = sanitizeFormattedBody(once)
      expect(twice).toBe(once)
    })

    it("is idempotent for malformed HTML", () => {
      const input = "<p>unclosed <strong>bold"
      const once = sanitizeFormattedBody(input)
      const twice = sanitizeFormattedBody(once)
      expect(twice).toBe(once)
    })
  })
})
