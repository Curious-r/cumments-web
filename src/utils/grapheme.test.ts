import { describe, expect, it } from "vitest"
import { graphemeLength } from "./grapheme"

describe("graphemeLength", () => {
  it('counts "a" as 1', () => {
    expect(graphemeLength("a")).toBe(1)
  })

  it('counts "中" as 1', () => {
    expect(graphemeLength("中")).toBe(1)
  })

  it('counts "é" (precomposed) as 1', () => {
    expect(graphemeLength("é")).toBe(1)
  })

  it('counts "e\\u0301" (decomposed) as 1', () => {
    expect(graphemeLength("e\u0301")).toBe(1)
  })

  it('counts "🇩🇪" flag as 1', () => {
    expect(graphemeLength("🇩🇪")).toBe(1)
  })

  it('counts "👩‍👩‍👧‍👦" ZWJ family as 1', () => {
    expect(graphemeLength("👩‍👩‍👧‍👦")).toBe(1)
  })

  it("counts combinations of multiple graphemes", () => {
    expect(graphemeLength("a中")).toBe(2)
    expect(graphemeLength("🇩🇪🇺🇸")).toBe(2)
    expect(graphemeLength("👩‍👩‍👧‍👦👩‍👩‍👧‍👦")).toBe(2)
    expect(graphemeLength("e\u0301🇩🇪👩‍👩‍👧‍👦")).toBe(3)
    expect(graphemeLength("hello")).toBe(5)
    expect(graphemeLength("a".repeat(50))).toBe(50)
  })

  it("differs from UTF-16 length for representative strings", () => {
    const flag = "🇩🇪"
    expect(flag.length).toBe(4)
    expect(graphemeLength(flag)).toBe(1)

    const zwj = "👩‍👩‍👧‍👦"
    expect(zwj.length).toBe(11)
    expect(graphemeLength(zwj)).toBe(1)

    const combining = "e\u0301"
    expect(combining.length).toBe(2)
    expect(graphemeLength(combining)).toBe(1)

    const flags32 = "🇩🇪".repeat(32)
    expect(flags32.length).toBe(128) // 4 * 32
    expect(graphemeLength(flags32)).toBe(32)

    const zwj32 = "👩‍👩‍👧‍👦".repeat(32)
    expect(zwj32.length).toBeGreaterThan(32)
    expect(graphemeLength(zwj32)).toBe(32)
  })

  it("handles empty string", () => {
    expect(graphemeLength("")).toBe(0)
  })
})
