import { describe, expect, it } from "vitest"
import { canonicalize, isValidBCP47, resolveLocale } from "./locale"

describe("canonicalize", () => {
  it("canonicalizes casing", () => {
    expect(canonicalize("EN")).toBe("en")
    expect(canonicalize("en-us")).toBe("en-US")
    expect(canonicalize("ZH-hans")).toBe("zh-Hans")
  })

  it("returns null for empty", () => {
    expect(canonicalize("")).toBeNull()
    expect(canonicalize("   ")).toBeNull()
  })

  it("returns null for malformed", () => {
    expect(canonicalize("not-a-@@")).toBeNull()
  })

  it("validates via isValidBCP47", () => {
    expect(isValidBCP47("zh-Hans")).toBe(true)
    expect(isValidBCP47("en-GB")).toBe(true)
    expect(isValidBCP47("")).toBe(false)
    expect(isValidBCP47("123")).toBe(false)
  })
})

describe("resolveLocale", () => {
  it("exact supported locales", () => {
    expect(resolveLocale("zh-Hans")).toBe("zh-Hans")
    expect(resolveLocale("en")).toBe("en")
  })

  it("region variants", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-Hans")
    expect(resolveLocale("zh-SG")).toBe("zh-Hans")
    expect(resolveLocale("en-US")).toBe("en")
    expect(resolveLocale("en-GB")).toBe("en")
  })

  it("case canonicalization resolves identically", () => {
    expect(resolveLocale("ZH-hans")).toBe("zh-Hans")
    expect(resolveLocale("EN-us")).toBe("en")
    expect(resolveLocale("zh-hans")).toBe("zh-Hans")
    expect(resolveLocale("EN")).toBe("en")
  })

  it("script variants", () => {
    // no zh-Hant UI yet, falls back to zh-Hans via language-only
    expect(resolveLocale("zh-Hant")).toBe("zh-Hans")
    expect(resolveLocale("zh-Hant-TW")).toBe("zh-Hans")
  })

  it("unsupported languages fallback to en", () => {
    expect(resolveLocale("ja")).toBe("en")
    expect(resolveLocale("ko")).toBe("en")
    expect(resolveLocale("de")).toBe("en")
    expect(resolveLocale("fr")).toBe("en")
    expect(resolveLocale("ru")).toBe("en")
  })

  it("malformed input falls back gracefully without throwing", () => {
    expect(resolveLocale("")).toBe("en")
    expect(resolveLocale("   ")).toBe("en")
    expect(resolveLocale(null as unknown as string)).toBe("en")
    expect(resolveLocale(undefined as unknown as string)).toBe("en")
    expect(resolveLocale("not-a-!!")).toBe("en")
    expect(resolveLocale("en-")).toBe("en")
    expect(() => resolveLocale("en-")).not.toThrow()
  })

  it("legacy zh without script resolves to zh-Hans via language-only", () => {
    // Not a documented supported input, but graceful fallback via language-only
    expect(resolveLocale("zh")).toBe("zh-Hans")
  })
})
