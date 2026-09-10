import { describe, expect, it } from "vitest"
import { ANONYMOUS_DISPLAY_NAME, normalizeDisplayName } from "./display-name"

describe("normalizeDisplayName", () => {
  it("treats missing names as anonymous", () => {
    expect(normalizeDisplayName(null)).toBe(ANONYMOUS_DISPLAY_NAME)
    expect(normalizeDisplayName(undefined)).toBe(ANONYMOUS_DISPLAY_NAME)
  })

  it("treats empty and whitespace-only names as anonymous", () => {
    // The backend can legitimately return an empty guest name; it must not
    // reach the avatar initial and render as "?".
    expect(normalizeDisplayName("")).toBe(ANONYMOUS_DISPLAY_NAME)
    expect(normalizeDisplayName("   ")).toBe(ANONYMOUS_DISPLAY_NAME)
    expect(normalizeDisplayName("\t\n ")).toBe(ANONYMOUS_DISPLAY_NAME)
  })

  it("preserves and trims real names", () => {
    expect(normalizeDisplayName("Alice")).toBe("Alice")
    expect(normalizeDisplayName(" Alice ")).toBe("Alice")
    expect(normalizeDisplayName("Alice Smith")).toBe("Alice Smith")
  })

  it("falls back to the single shared constant", () => {
    expect(ANONYMOUS_DISPLAY_NAME).toBe("Anonymous")
  })
})
