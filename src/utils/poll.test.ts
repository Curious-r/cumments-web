import { describe, expect, it } from "vitest"
import { graphemeLength } from "./grapheme"
import {
  isPollValid,
  pollCanonicalPayload,
  validatePoll,
  validatePollOption,
  validatePollQuestion,
} from "./poll"

describe("poll validation", () => {
  it("rejects empty question", () => {
    expect(validatePollQuestion("")).toBe("Question is required")
    expect(validatePollQuestion("   ")).toBe("Question is required")
    expect(validatePoll("", ["a", "b"]).questionError).toBe("Question is required")
  })

  it("accepts question at 500 graphemes", () => {
    const q500 = "a".repeat(500)
    expect(graphemeLength(q500)).toBe(500)
    expect(validatePollQuestion(q500)).toBeNull()
    expect(validatePoll(q500, ["a", "b"]).questionError).toBeNull()
  })

  it("rejects question at 501 graphemes", () => {
    const q501 = "a".repeat(501)
    expect(graphemeLength(q501)).toBe(501)
    expect(validatePollQuestion(q501)).toBe("Question is too long")
  })

  it("rejects fewer than 2 options", () => {
    expect(validatePoll("q", []).generalError).toBe("At least 2 options required")
    expect(validatePoll("q", ["a"]).generalError).toBe("At least 2 options required")
  })

  it("accepts 2 options", () => {
    expect(validatePoll("q", ["a", "b"]).generalError).toBeNull()
    expect(isPollValid("q", ["a", "b"])).toBe(true)
  })

  it("accepts 20 options", () => {
    const opts20 = Array.from({ length: 20 }, (_, i) => `opt${i}`)
    expect(validatePoll("q", opts20).generalError).toBeNull()
    expect(isPollValid("q", opts20)).toBe(true)
  })

  it("rejects 21 options", () => {
    const opts21 = Array.from({ length: 21 }, (_, i) => `opt${i}`)
    expect(validatePoll("q", opts21).generalError).toBe("Too many options")
  })

  it("rejects empty option", () => {
    expect(validatePollOption("")).toBe("Option cannot be empty")
    expect(validatePollOption("   ")).toBe("Option cannot be empty")
    const res = validatePoll("q", ["a", ""])
    expect(res.optionErrors[1]).toBe("Option cannot be empty")
  })

  it("accepts option at 200 graphemes", () => {
    const opt200 = "a".repeat(200)
    expect(graphemeLength(opt200)).toBe(200)
    expect(validatePollOption(opt200)).toBeNull()
  })

  it("rejects option at 201 graphemes", () => {
    const opt201 = "a".repeat(201)
    expect(graphemeLength(opt201)).toBe(201)
    expect(validatePollOption(opt201)).toBe("Option is too long")
  })

  it("counts graphemes correctly for question and options", () => {
    // combining
    const combining = "e\u0301".repeat(500)
    expect(graphemeLength(combining)).toBe(500)
    expect(validatePollQuestion(combining)).toBeNull()
    const combining501 = "e\u0301".repeat(501)
    expect(graphemeLength(combining501)).toBe(501)
    expect(validatePollQuestion(combining501)).toBe("Question is too long")
    // flags
    const flag500 = "🇩🇪".repeat(500)
    expect(graphemeLength(flag500)).toBe(500)
    expect(flag500.length).toBe(2000)
    expect(validatePollQuestion(flag500)).toBeNull()
    const flag501 = "🇩🇪".repeat(501)
    expect(graphemeLength(flag501)).toBe(501)
    expect(validatePollQuestion(flag501)).toBe("Question is too long")
    // ZWJ
    const zwj500 = "👩‍👩‍👧‍👦".repeat(500)
    expect(graphemeLength(zwj500)).toBe(500)
    expect(validatePollQuestion(zwj500)).toBeNull()
    const zwj501 = "👩‍👩‍👧‍👦".repeat(501)
    expect(graphemeLength(zwj501)).toBe(501)
    expect(validatePollQuestion(zwj501)).toBe("Question is too long")
    // options with unicode
    const flagOpt200 = "🇩🇪".repeat(200)
    expect(graphemeLength(flagOpt200)).toBe(200)
    expect(validatePollOption(flagOpt200)).toBeNull()
    const flagOpt201 = "🇩🇪".repeat(201)
    expect(graphemeLength(flagOpt201)).toBe(201)
    expect(validatePollOption(flagOpt201)).toBe("Option is too long")
  })

  it("pollCanonicalPayload is deterministic JSON", () => {
    const payload = pollCanonicalPayload("Q?", ["A", "B"], 1)
    expect(payload).toBe(JSON.stringify({ question: "Q?", options: ["A", "B"], max_selections: 1 }))
    // order matters
    const payload2 = pollCanonicalPayload("Q?", ["B", "A"], 1)
    expect(payload2).not.toBe(payload)
  })
})
