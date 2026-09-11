import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveLocale } from "../../i18n/locale"
import { messages } from "../../i18n/messages"
import "./cumments-editor"
import type { CummentsEditor } from "./cumments-editor"

/**
 * Poll focus management used to locate its fields through English literals:
 *
 *   input[aria-label^="Option"]
 *   input[aria-label="Poll question"]
 *   button[aria-label="Create poll"], button[aria-label="Poll"]
 *
 * Those labels are localized (`t.pollQuestionLabel` is "Poll question" in en
 * but "投票问题" in zh-Hans), so in any other locale the lookups returned null
 * and entering Poll mode, adding an option, and cancelling all failed to move
 * focus. The fields now use their stable `#poll-*` ids and the Poll control a
 * `data-action="poll"` hook.
 */
describe("Poll focus management across locales", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  const stringsFor = (lang: string) => messages[resolveLocale(lang)]

  async function createEditor(lang: string): Promise<CummentsEditor> {
    const el = document.createElement("cumments-editor") as CummentsEditor
    el.lang = lang
    el.profileName = "Tester"
    document.body.appendChild(el)
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    return el
  }

  const flush = async (el: CummentsEditor) => {
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
  }

  /** The Poll control, found by its stable hook rather than its label. */
  const pollToggle = (el: CummentsEditor) =>
    el.querySelector('button[data-action="poll"]') as HTMLButtonElement | null

  /** The accessible name is localized, so tests resolve it from the messages. */
  const buttonByLabel = (el: CummentsEditor, label: string) =>
    el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null

  async function enterPollMode(el: CummentsEditor): Promise<void> {
    const toggle = pollToggle(el) ?? buttonByLabel(el, stringsFor(el.lang).createPoll)
    if (!toggle) throw new Error("Poll toggle not found")
    toggle.click()
    await flush(el)
  }

  describe.each(["en", "zh-Hans"])("locale %s", (lang) => {
    it("focuses the question field when entering Poll mode", async () => {
      const el = await createEditor(lang)
      await enterPollMode(el)

      const question = el.querySelector("#poll-question-input") as HTMLInputElement | null
      expect(question).toBeTruthy()
      expect(document.activeElement).toBe(question)
    })

    it("keeps the question field's accessible name localized", async () => {
      // The label must stay for accessibility; it just isn't a lookup key.
      const el = await createEditor(lang)
      await enterPollMode(el)

      const question = el.querySelector("#poll-question-input") as HTMLInputElement
      expect(question.getAttribute("aria-label")).toBe(stringsFor(lang).pollQuestionLabel)
    })

    it("focuses the newly added option field", async () => {
      const el = await createEditor(lang)
      await enterPollMode(el)

      const before = el.querySelectorAll('input[id^="poll-option-"]').length
      expect(before).toBe(2)

      const addBtn = buttonByLabel(el, stringsFor(lang).addOption)
      expect(addBtn).toBeTruthy()
      addBtn?.click()
      await flush(el)

      const after = el.querySelectorAll('input[id^="poll-option-"]')
      expect(after.length).toBe(3)
      // The new field is the last one and has taken focus.
      const newest = el.querySelector(`#poll-option-${after.length - 1}`) as HTMLInputElement
      expect(newest).toBeTruthy()
      expect(document.activeElement).toBe(newest)
    })

    it("restores focus to the Poll control when cancelling", async () => {
      const el = await createEditor(lang)
      await enterPollMode(el)

      const cancelBtn = buttonByLabel(el, stringsFor(lang).cancelPoll)
      expect(cancelBtn).toBeTruthy()
      cancelBtn?.click()
      await flush(el)

      expect(el.querySelector("#poll-question-input")).toBeNull()
      const toggle = pollToggle(el)
      expect(toggle).toBeTruthy()
      expect(document.activeElement).toBe(toggle)
    })

    it("restores focus to the Poll control when cancelling with Escape", async () => {
      const el = await createEditor(lang)
      await enterPollMode(el)

      const question = el.querySelector("#poll-question-input") as HTMLInputElement
      question.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await flush(el)

      expect(el.querySelector("#poll-question-input")).toBeNull()
      expect(document.activeElement).toBe(pollToggle(el))
    })

    it("keeps normal comment input working after cancelling", async () => {
      const el = await createEditor(lang)
      await enterPollMode(el)
      buttonByLabel(el, stringsFor(lang).cancelPoll)?.click()
      await flush(el)

      const textarea = el.querySelector('textarea[part="input"]') as HTMLTextAreaElement
      expect(textarea).toBeTruthy()
      expect(textarea.getAttribute("aria-label")).toBe(stringsFor(lang).commentAriaLabel)
    })
  })
})
