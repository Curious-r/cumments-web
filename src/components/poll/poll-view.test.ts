import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./poll-view"
import type { Message } from "../../api/contract/query"
import type { CummentsPollView } from "./poll-view"

function makePollMessage(overrides: Partial<Message["content"]> = {}): Message {
  return {
    event_id: "$poll1",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "Alice",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: {
      type: "poll",
      question: "Best language?",
      options: [
        { id: "0", text: "Rust" },
        { id: "1", text: "TypeScript" },
        { id: "2", text: "Python" },
      ],
      max_selections: 1,
      responses: [
        { option_index: 0, count: 2 },
        { option_index: 1, count: 3 },
      ],
      ...overrides,
    } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
  } as unknown as Message
}

describe("cumments-poll-view", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  async function createPollView(
    message: Message,
    voting = false,
    onVote?: (pollId: string, optionId: string) => Promise<void>,
  ): Promise<CummentsPollView> {
    const el = document.createElement("cumments-poll-view") as CummentsPollView
    el.message = message
    el.voting = voting
    if (onVote) el.onVote = onVote
    document.body.appendChild(el)
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    return el
  }

  it("renders poll UI with question and all options", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg)
    expect(el.shadowRoot!.innerHTML).toContain("Best language?")
    const radios = el.shadowRoot!.querySelectorAll('input[type="radio"]')
    expect(radios.length).toBe(3)
    expect(el.shadowRoot!.innerHTML).toContain("Rust")
    expect(el.shadowRoot!.innerHTML).toContain("TypeScript")
    expect(el.shadowRoot!.innerHTML).toContain("Python")
  })

  it("renders vote counts and total", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg)
    // counts: 2 and 3, total 5
    expect(el.shadowRoot!.innerHTML).toContain("2 votes")
    expect(el.shadowRoot!.innerHTML).toContain("3 votes")
    expect(el.shadowRoot!.innerHTML).toContain("5 total votes")
    // percentages: 40% and 60%
    expect(el.shadowRoot!.innerHTML).toContain("40%")
    expect(el.shadowRoot!.innerHTML).toContain("60%")
  })

  it("no selection initially", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    expect(Array.from(radios).some((r) => r.checked)).toBe(false)
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    expect(voteBtn.disabled).toBe(true)
  })

  it("selecting an option updates UI and only one can be selected", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    const first = radios[0] as HTMLInputElement
    const second = radios[1] as HTMLInputElement
    first.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(first.checked).toBe(true)
    expect(second.checked).toBe(false)
    let voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    expect(voteBtn.disabled).toBe(false)
    // select second, should replace first
    second.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(first.checked).toBe(false)
    expect(second.checked).toBe(true)
    voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    expect(voteBtn.disabled).toBe(false)
  })

  it("valid selection submits through onVote", async () => {
    const msg = makePollMessage()
    const onVote = vi.fn(async () => {})
    const el = await createPollView(msg, false, onVote)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    radios[1].click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(onVote).toHaveBeenCalledTimes(1)
    expect(onVote).toHaveBeenCalledWith("$poll1", "1")
  })

  it("duplicate submission is prevented while pending", async () => {
    const msg = makePollMessage()
    let resolveVote: () => void = () => {}
    const onVote = vi.fn(() => new Promise<void>((res) => (resolveVote = res)))
    const el = await createPollView(msg, false, onVote)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    radios[0].click()
    await new Promise((r) => setTimeout(r, 10))
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    // Try second click while pending
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(onVote).toHaveBeenCalledTimes(1)
    expect(voteBtn.disabled).toBe(true)
    expect(el.shadowRoot!.innerHTML).toContain("Voting")
    // Resolve and check enabled again
    resolveVote()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(voteBtn.disabled).toBe(false)
  })

  it("successful vote keeps selection and clears error", async () => {
    const msg = makePollMessage()
    const onVote = vi.fn(async () => {})
    const el = await createPollView(msg, false, onVote)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    radios[2].click()
    await new Promise((r) => setTimeout(r, 10))
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // After success, selection remains
    expect(
      (el.shadowRoot!.querySelectorAll('input[type="radio"]')[2] as HTMLInputElement).checked,
    ).toBe(true)
    expect(el.shadowRoot!.innerHTML).not.toContain("Failed")
  })

  it("failed vote shows error and permits retry", async () => {
    const msg = makePollMessage()
    const onVote = vi.fn(async () => {
      throw new Error("network failed")
    })
    const el = await createPollView(msg, false, onVote)
    const radios = el.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    radios[0].click()
    await new Promise((r) => setTimeout(r, 10))
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.shadowRoot!.innerHTML).toContain("network failed")
    expect(el.shadowRoot!.querySelector('[role="alert"]')).toBeTruthy()
    // selection kept
    expect(
      (el.shadowRoot!.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).checked,
    ).toBe(true)
    // allow retry: fix mock to succeed
    onVote.mockResolvedValueOnce(undefined as unknown as never)
    // Need to reset mock to succeed
    const onVote2 = vi.fn(async () => {})
    el.onVote = onVote2
    voteBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(onVote2).toHaveBeenCalled()
  })

  it("has accessible radio group semantics", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg)
    const radiogroup = el.shadowRoot!.querySelector('[role="radiogroup"]')
    expect(radiogroup).toBeTruthy()
    expect(radiogroup?.getAttribute("aria-labelledby")).toContain("poll-question")
    const radios = el.shadowRoot!.querySelectorAll('input[type="radio"]')
    expect(radios.length).toBe(3)
    for (const radio of Array.from(radios)) {
      expect(radio.getAttribute("aria-label")).toBeTruthy()
    }
    const voteBtn = el.shadowRoot!.querySelector('button[aria-label="Vote for selected option"]')
    expect(voteBtn).toBeTruthy()
    expect(voteBtn?.getAttribute("aria-label")).toBe("Vote for selected option")
  })

  it("shows voting state when voting prop true", async () => {
    const msg = makePollMessage()
    const el = await createPollView(msg, true)
    const voteBtn = el.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    expect(voteBtn.disabled).toBe(true)
    expect(el.shadowRoot!.innerHTML).toContain("Voting")
    const radios = el.shadowRoot!.querySelectorAll('input[type="radio"]')
    for (const r of Array.from(radios) as HTMLInputElement[]) {
      expect(r.disabled).toBe(true)
    }
  })

  describe("my_votes personalization", () => {
    it("my_votes=[] -> no radio selected", async () => {
      const msg = makePollMessage({ my_votes: [] } as unknown as Record<string, unknown>)
      const el = await createPollView(msg)
      const radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(Array.from(radios).some((r) => r.checked)).toBe(false)
    })

    it('my_votes=["0"] -> option 0 checked', async () => {
      const msg = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const el = await createPollView(msg)
      const radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[0]!.checked).toBe(true)
      expect(radios[1]!.checked).toBe(false)
    })

    it('my_votes=["1"] -> option 1 checked', async () => {
      const msg = makePollMessage({ my_votes: ["1"] } as unknown as Record<string, unknown>)
      const el = await createPollView(msg)
      const radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true)
      expect(radios[0]!.checked).toBe(false)
    })

    it("missing my_votes -> treated as [] no exception", async () => {
      const msg = makePollMessage()
      // delete my_votes if present
      delete (msg.content as unknown as Record<string, unknown>).my_votes
      const el = await createPollView(msg)
      const radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(Array.from(radios).some((r) => r.checked)).toBe(false)
      expect(el.shadowRoot!.innerHTML).toContain("Best language?")
    })

    it("user changes selection locally", async () => {
      const msg = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const el = await createPollView(msg)
      let radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[0]!.checked).toBe(true)
      // click second
      radios[1]!.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true)
      expect(radios[0]!.checked).toBe(false)
    })

    it("vote succeeds -> message updates to my_votes=[new] -> UI reflects new", async () => {
      const initial = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const el = await createPollView(initial)
      let radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[0]!.checked).toBe(true)
      // user selects 1
      radios[1]!.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true)
      // simulate successful vote + refresh with new my_votes
      const updated = makePollMessage({ my_votes: ["1"] } as unknown as Record<string, unknown>)
      // keep same event_id
      updated.event_id = initial.event_id
      el.message = updated
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true)
      expect(radios[0]!.checked).toBe(false)
    })

    it("regression: local selection not reset during voting when message refreshes", async () => {
      const initial = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const el = await createPollView(initial)
      let radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[0]!.checked).toBe(true)
      // user selects 1
      radios[1]!.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true)
      // start voting
      el.voting = true
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // message refreshes with new server truth while voting (simulate race)
      const refreshed = makePollMessage({ my_votes: ["1"] } as unknown as Record<string, unknown>)
      refreshed.event_id = initial.event_id
      el.message = refreshed
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))
      // while voting, local should NOT be reset to old server value
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true) // still local 1, not reset to 0
      // voting ends
      el.voting = false
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true) // now synced to server 1
      expect(radios[0]!.checked).toBe(false)
    })

    it("vote fails -> selection remains and error shown", async () => {
      const msg = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const onVote = vi.fn(async () => {
        throw new Error("vote failed")
      })
      const el = await createPollView(msg, false, onVote)
      let radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      radios[1]!.click()
      await new Promise((r) => setTimeout(r, 10))
      const voteBtn = el.shadowRoot!.querySelector(
        'button[aria-label="Vote for selected option"]',
      ) as HTMLButtonElement
      voteBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[1]!.checked).toBe(true) // remains
      expect(el.shadowRoot!.innerHTML).toContain("vote failed")
      // retry should be possible: button not disabled after failure (since not voting)
      expect(voteBtn.disabled).toBe(false)
    })

    it("server truth my_votes=[] after refresh clears selection when not voting", async () => {
      const initial = makePollMessage({ my_votes: ["0"] } as unknown as Record<string, unknown>)
      const el = await createPollView(initial)
      let radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(radios[0]!.checked).toBe(true)
      const cleared = makePollMessage({ my_votes: [] } as unknown as Record<string, unknown>)
      cleared.event_id = initial.event_id
      el.message = cleared
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))
      radios = el.shadowRoot!.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>
      expect(Array.from(radios).some((r) => r.checked)).toBe(false)
    })
  })

  it("renders with no votes yet", async () => {
    const msg = makePollMessage({ responses: [] } as unknown as Record<string, unknown>)
    const el = await createPollView(msg)
    expect(el.shadowRoot!.innerHTML).toContain("No votes yet")
    expect(el.shadowRoot!.innerHTML).toContain("0 votes")
  })
})
