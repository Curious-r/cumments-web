import { describe, expect, it } from "vitest"
import { canonicalize, isValidBCP47, resolveLocale } from "./locale"

describe("canonicalize", () => {
  it("canonicalizes casing", () => {
    expect(canonicalize("EN")).toBe("en")
    expect(canonicalize("en-us")).toBe("en-US")
    expect(canonicalize("ZH-hans")).toBe("zh-Hans")
    expect(canonicalize("CMN-hans")).toBe("cmn-Hans")
  })

  it("does not translate cmn-Hans to zh-Hans at canonicalization layer", () => {
    expect(canonicalize("cmn-Hans")).toBe("cmn-Hans")
    expect(canonicalize("cmn-Hans")).not.toBe("zh-Hans")
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
    expect(isValidBCP47("cmn-Hans")).toBe(true)
    expect(isValidBCP47("")).toBe(false)
    expect(isValidBCP47("123")).toBe(false)
  })
})

describe("resolveLocale", () => {
  it("exact supported locales", () => {
    expect(resolveLocale("zh-Hans")).toBe("zh-Hans")
    expect(resolveLocale("en")).toBe("en")
  })

  it("Chinese aliases", () => {
    expect(resolveLocale("zh")).toBe("zh-Hans")
    expect(resolveLocale("zh-CN")).toBe("zh-Hans")
    expect(resolveLocale("zh-SG")).toBe("zh-Hans")
    expect(resolveLocale("cmn")).toBe("zh-Hans")
    expect(resolveLocale("cmn-Hans")).toBe("zh-Hans")
  })

  it("English variants", () => {
    expect(resolveLocale("en-US")).toBe("en")
    expect(resolveLocale("en-GB")).toBe("en")
  })

  it("case canonicalization resolves identically", () => {
    expect(resolveLocale("ZH-hans")).toBe("zh-Hans")
    expect(resolveLocale("EN-us")).toBe("en")
    expect(resolveLocale("zh-hans")).toBe("zh-Hans")
    expect(resolveLocale("EN")).toBe("en")
    expect(resolveLocale("CMN-hans")).toBe("zh-Hans")
  })

  it("Traditional Chinese falls back to default", () => {
    expect(resolveLocale("zh-Hant")).toBe("en")
    expect(resolveLocale("zh-Hant-TW")).toBe("en")
  })

  it("does not map arbitrary Hans script to zh-Hans", () => {
    expect(resolveLocale("yue-Hans")).toBe("en")
    expect(resolveLocale("hak-Hans")).toBe("en")
  })

  it("other languages fallback to default", () => {
    expect(resolveLocale("ja")).toBe("en")
    expect(resolveLocale("ko")).toBe("en")
    expect(resolveLocale("de")).toBe("en")
    expect(resolveLocale("fr")).toBe("en")
  })

  it("malformed input falls back gracefully without throwing", () => {
    expect(resolveLocale("")).toBe("en")
    expect(resolveLocale("   ")).toBe("en")
    expect(resolveLocale(null as unknown as string)).toBe("en")
    expect(resolveLocale(undefined as unknown as string)).toBe("en")
    expect(resolveLocale("not-a-!!")).toBe("en")
    expect(resolveLocale("en-")).toBe("en")
    expect(() => resolveLocale("en-")).not.toThrow()
    expect(() => resolveLocale("cmn-Hans")).not.toThrow()
  })
})
