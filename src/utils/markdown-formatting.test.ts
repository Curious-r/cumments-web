import { describe, expect, it } from "vitest"
import { formatMarkdownSelection } from "./markdown-formatting"

describe("formatMarkdownSelection", () => {
  describe("formatting operations", () => {
    it("wraps selected text with bold markers", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "bold")
      expect(result.text).toBe("**hello** world")
    })

    it("wraps selected text with italic markers", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "italic")
      expect(result.text).toBe("*hello* world")
    })

    it("wraps selected text with strikethrough markers", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "strikethrough")
      expect(result.text).toBe("~~hello~~ world")
    })

    it("wraps selected text with code markers", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "code")
      expect(result.text).toBe("`hello` world")
    })

    it("wraps selected text with link", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "link", "https://example.com")
      expect(result.text).toBe("[hello](https://example.com) world")
    })

    it("toggles off bold when selection is already bold", () => {
      const result = formatMarkdownSelection("**hello** world", 2, 7, "bold")
      expect(result.text).toBe("hello world")
    })

    it("toggles off italic when selection is already italic", () => {
      const result = formatMarkdownSelection("*hello* world", 1, 6, "italic")
      expect(result.text).toBe("hello world")
    })

    it("toggles off strikethrough when selection is already strikethrough", () => {
      const result = formatMarkdownSelection("~~hello~~ world", 2, 7, "strikethrough")
      expect(result.text).toBe("hello world")
    })

    it("toggles off code when selection is already code", () => {
      const result = formatMarkdownSelection("`hello` world", 1, 6, "code")
      expect(result.text).toBe("hello world")
    })
  })

  describe("caret/selection behavior", () => {
    it("shifts selection by prefix length after bold", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "bold")
      // **hello** world
      //   ^^^^^  (selection shifted by 2 for **)
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(7)
    })

    it("shifts selection by prefix length after italic", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "italic")
      // *hello* world
      //  ^^^^^  (selection shifted by 1 for *)
      expect(result.selectionStart).toBe(1)
      expect(result.selectionEnd).toBe(6)
    })

    it("shifts selection by prefix length after code", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "code")
      // `hello` world
      //  ^^^^^  (selection shifted by 1 for `)
      expect(result.selectionStart).toBe(1)
      expect(result.selectionEnd).toBe(6)
    })

    it("shifts selection by prefix length after strikethrough", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "strikethrough")
      // ~~hello~~ world
      //   ^^^^^  (selection shifted by 2 for ~~)
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(7)
    })

    it("shifts selection by 1 for link [ prefix", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "link", "https://example.com")
      // [hello](https://example.com) world
      //  ^^^^^  (selection shifted by 1 for [)
      expect(result.selectionStart).toBe(1)
      expect(result.selectionEnd).toBe(6)
    })

    it("places caret between markers for no-selection bold", () => {
      const result = formatMarkdownSelection("hello", 5, 5, "bold")
      expect(result.text).toBe("hello****")
      expect(result.selectionStart).toBe(7)
      expect(result.selectionEnd).toBe(7)
    })

    it("places caret between markers for no-selection italic", () => {
      const result = formatMarkdownSelection("hello", 5, 5, "italic")
      expect(result.text).toBe("hello**")
      expect(result.selectionStart).toBe(6)
      expect(result.selectionEnd).toBe(6)
    })

    it("places caret between markers for no-selection code", () => {
      const result = formatMarkdownSelection("hello", 5, 5, "code")
      expect(result.text).toBe("hello``")
      expect(result.selectionStart).toBe(6)
      expect(result.selectionEnd).toBe(6)
    })
  })

  describe("unicode handling", () => {
    it("preserves emoji when formatting adjacent text", () => {
      const result = formatMarkdownSelection("hello 👋 world", 0, 5, "bold")
      expect(result.text).toBe("**hello** 👋 world")
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(7)
    })

    it("preserves non-BMP characters and correct UTF-16 offsets", () => {
      // 😀 is a surrogate pair (2 UTF-16 code units)
      const text = "hello 😀 world"
      const result = formatMarkdownSelection(text, 0, 5, "bold")
      expect(result.text).toBe("**hello** 😀 world")
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(7)
    })

    it("formats text containing emoji correctly", () => {
      const result = formatMarkdownSelection("hello 👋 world", 6, 8, "bold")
      expect(result.text).toBe("hello **👋** world")
    })
  })

  describe("edge cases", () => {
    it("handles selection at start of text", () => {
      const result = formatMarkdownSelection("hello world", 0, 3, "bold")
      expect(result.text).toBe("**hel**lo world")
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(5)
    })

    it("handles selection at end of text", () => {
      const result = formatMarkdownSelection("hello world", 6, 11, "bold")
      expect(result.text).toBe("hello **world**")
      expect(result.selectionStart).toBe(8)
      expect(result.selectionEnd).toBe(13)
    })

    it("handles selection containing spaces", () => {
      const result = formatMarkdownSelection("hello beautiful world", 6, 15, "italic")
      expect(result.text).toBe("hello *beautiful* world")
      expect(result.selectionStart).toBe(7)
      expect(result.selectionEnd).toBe(16)
    })

    it("handles selection containing punctuation", () => {
      const result = formatMarkdownSelection("hello, world!", 0, 5, "bold")
      expect(result.text).toBe("**hello**, world!")
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(7)
    })

    it("does not toggle if markers are not immediately adjacent", () => {
      // Bold markers are not immediately around selection
      const result = formatMarkdownSelection("**hello** world", 0, 9, "bold")
      expect(result.text).toBe("****hello**** world")
    })

    it("handles empty text with no selection", () => {
      const result = formatMarkdownSelection("", 0, 0, "bold")
      expect(result.text).toBe("****")
      expect(result.selectionStart).toBe(2)
      expect(result.selectionEnd).toBe(2)
    })

    it("handles link with no selection", () => {
      const result = formatMarkdownSelection("hello", 5, 5, "link", "https://example.com")
      expect(result.text).toBe("hello[](https://example.com)")
      expect(result.selectionStart).toBe(6)
      expect(result.selectionEnd).toBe(6)
    })

    it("toggles off link when selection is already a link", () => {
      const result = formatMarkdownSelection("[hello](https://example.com) world", 1, 6, "link")
      expect(result.text).toBe("hello world")
      expect(result.selectionStart).toBe(0)
      expect(result.selectionEnd).toBe(5)
    })
  })

  describe("missing link URL", () => {
    it("does nothing when link URL is undefined", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "link")
      expect(result.text).toBe("hello world")
      expect(result.selectionStart).toBe(0)
      expect(result.selectionEnd).toBe(5)
    })

    it("does nothing when link URL is empty string", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "link", "")
      expect(result.text).toBe("hello world")
      expect(result.selectionStart).toBe(0)
      expect(result.selectionEnd).toBe(5)
    })

    it("does nothing when link URL is whitespace only", () => {
      const result = formatMarkdownSelection("hello world", 0, 5, "link", "   ")
      expect(result.text).toBe("hello world")
      expect(result.selectionStart).toBe(0)
      expect(result.selectionEnd).toBe(5)
    })
  })
})
