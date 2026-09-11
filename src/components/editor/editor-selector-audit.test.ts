// @vitest-environment node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The Poll editor's accessible names are localized (`t.pollQuestionLabel` is
 * "Poll question" in en but "投票问题" in zh-Hans). Using them as DOM lookup
 * keys silently broke focus management outside English, so a source-level guard
 * keeps them from creeping back in.
 */
const SOURCE = readFileSync(fileURLToPath(new URL("./cumments-editor.ts", import.meta.url)), "utf8")

describe("editor selector audit", () => {
  it("uses no localized aria-label as an internal Poll lookup key", () => {
    for (const stale of [
      'aria-label^="Option"',
      'aria-label="Poll question"',
      'aria-label="Create poll"',
      'aria-label="Poll"',
    ]) {
      expect(SOURCE, `stale localized selector: ${stale}`).not.toContain(stale)
    }
  })

  it("never interpolates a translated message into a DOM query", () => {
    // e.g. this.querySelector(`input[aria-label="${t.pollQuestionLabel}"]`)
    const offenders = SOURCE.split("\n").filter(
      (line) => /querySelector(?:All)?\(/.test(line) && line.includes("${t."),
    )
    expect(offenders, `localized selector(s): ${offenders.join(" | ")}`).toEqual([])
  })

  it("keeps the stable Poll hooks the fix relies on", () => {
    expect(SOURCE).toContain('id="poll-question-input"')
    expect(SOURCE).toMatch(/id="poll-option-\$\{idx\}"/)
    expect(SOURCE).toContain('button[data-action="poll"]')
    // Present in both renderings of the Poll control.
    expect(SOURCE.match(/data-action="\$\{action\.id\}"/g)?.length).toBe(2)
  })
})
