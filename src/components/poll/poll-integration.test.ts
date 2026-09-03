import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "../cumments-comments"
import { MockEventSource } from "../../test/mocks"
import type { CummentsPollView } from "./poll-view"

function mockFetchWithPoll() {
  const orig = globalThis.fetch
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    if (u.includes("/api/v1/challenge")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ prefix: "test.", difficulty: 1 }),
        text: async () => "",
        clone: () =>
          ({ json: async () => ({ prefix: "test.", difficulty: 1 }) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/visitors/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "v1", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ visitor_id: "v1", display_name: "Alice", avatar_url: null }),
          }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/polls") && u.includes("/votes")) {
      // vote endpoint
      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => "",
        json: async () => ({}),
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments") && (init as RequestInit)?.method === "QUERY") {
      // return a poll message
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            {
              event_id: "$poll1",
              site_id: "s",
              page_slug: "p",
              author: {
                type: "visitor",
                display_name: "Alice",
                avatar_url: null,
                public_key: "pk",
                mxid: null,
              },
              content: {
                type: "poll",
                question: "Best language?",
                options: [
                  { id: "0", text: "Rust" },
                  { id: "1", text: "TypeScript" },
                ],
                max_selections: 1,
                responses: [
                  { option_index: 0, count: 1 },
                  { option_index: 1, count: 2 },
                ],
                my_votes: ["1"],
              },
              timestamp: new Date().toISOString(),
              edited_at: null,
              reply_to: null,
              thread_root: null,
              submission_id: null,
              status: "active",
              redacted_at: null,
              redacted_by: null,
              reactions: [],
            },
          ],
          meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
        }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    } as unknown as Response
  }) as unknown as typeof fetch
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return { orig, fetchMock }
}

describe("Poll integration via cumments-comments", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  let fetchMock: any
  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function render() {
    const { orig, fetchMock: fm } = mockFetchWithPoll()
    origFetch = orig
    fetchMock = fm
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 300))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    return el
  }

  it("renders poll from backend projection", async () => {
    const el = await render()
    const pollView = el.shadowRoot.querySelector("cumments-poll-view") as CummentsPollView
    expect(pollView).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    await (pollView as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(pollView.shadowRoot!.innerHTML).toContain("Best language?")
    expect(pollView.shadowRoot!.innerHTML).toContain("Rust")
    expect(pollView.shadowRoot!.innerHTML).toContain("TypeScript")
    // counts
    expect(pollView.shadowRoot!.innerHTML).toContain("1 votes")
    expect(pollView.shadowRoot!.innerHTML).toContain("2 votes")
  })

  it("renders poll with my_votes personalization", async () => {
    const el = await render()
    const pollView = el.shadowRoot.querySelector("cumments-poll-view") as CummentsPollView
    expect(pollView).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    await (pollView as unknown as { updateComplete: Promise<void> }).updateComplete
    // my_votes=["1"] should have second option checked
    const radios = pollView.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    expect(radios[1]!.checked).toBe(true)
    expect(radios[0]!.checked).toBe(false)
    // verify input value
    expect(
      pollView.shadowRoot!.querySelector('input[value="1"]') as HTMLInputElement,
    ).not.toBeNull()
    expect(
      (pollView.shadowRoot!.querySelector('input[value="1"]') as HTMLInputElement).checked,
    ).toBe(true)
  })

  it("vote goes through PollsClient.vote and not /comments", async () => {
    const el = await render()
    const pollView = el.shadowRoot.querySelector("cumments-poll-view") as CummentsPollView
    expect(pollView).toBeTruthy()
    await (pollView as unknown as { updateComplete: Promise<void> }).updateComplete
    const radios = pollView.shadowRoot!.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>
    radios[0].click()
    await new Promise((r) => setTimeout(r, 10))
    const voteBtn = pollView.shadowRoot!.querySelector(
      'button[aria-label="Vote for selected option"]',
    ) as HTMLButtonElement
    // Spy on fetch for vote
    fetchMock.mockClear()
    // Mock PoW and signing to avoid real crypto
    const mod = await import("../../identity/signing")
    vi.spyOn(mod, "signMessage").mockResolvedValue("sig")
    // Need to mock challenge and pow
    // The vote will use SigningPipeline which will call challengeManager.get and powSolver.solve
    // We already mocked fetch for challenge, so it should work (pow difficulty 1)
    // Mock crypto for poll vote signing
    const origCrypto = globalThis.crypto
    // Ensure EventSource mock still

    voteBtn.click()
    await new Promise((r) => setTimeout(r, 500))
    // Check that fetch was called with poll vote endpoint, not comments
    const voteCalls = fetchMock.mock.calls.filter(
      (c: unknown) =>
        String((c as unknown[])[0]).includes("/polls/") &&
        String((c as unknown[])[0]).includes("/votes"),
    )
    expect(voteCalls.length).toBeGreaterThan(0)
    const voteUrl = String(voteCalls[0][0])
    expect(voteUrl).toContain("/polls/%24poll1/votes")
    expect(new URL(voteUrl).pathname).not.toContain("/comments")
    expect(new URL(voteUrl).pathname).toContain("/polls/")
    // Also check body contains option_id
    const init = voteCalls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.option_id).toBe("0")
    expect(body.author_public_key).toBeTruthy()
  })
})
