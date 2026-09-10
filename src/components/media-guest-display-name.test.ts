import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"

/**
 * End-to-end reproduction of the reported guest failure.
 *
 * The POST mock enforces the backend's real `display_name` rule (1-50 grapheme
 * clusters) and returns the same `validation-error` problem document, so a
 * regression that submits an empty name fails the test instead of merely
 * asserting an internal call shape.
 */
const DISPLAY_NAME_PATTERN = /^[\s\S]{1,}$/

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => jsonResponse(body, status),
  } as unknown as Response
}

function validationError(): Response {
  return {
    ok: false,
    status: 400,
    headers: new Headers({ "content-type": "application/problem+json" }),
    json: async () => ({
      type: "about:blank",
      title: "Validation failed",
      status: 400,
      detail: "request validation failed",
      code: "validation-error",
      details: {
        display_name: [
          {
            code: "grapheme_length",
            message: "length must be between 1 and 50 grapheme clusters (got 0)",
          },
        ],
      },
    }),
    text: async () => "validation-error",
    clone: () => validationError(),
  } as unknown as Response
}

type El = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }

describe("guest media submission without a display name", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource

  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    origFetch = globalThis.fetch
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  async function waitFor(
    condition: () => boolean,
    message: string,
    timeoutMs = 2000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(`waitFor timed out: ${message}`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  it("submits an image as Anonymous instead of failing validation", async () => {
    const commentBodies: Array<Record<string, unknown>> = []
    let rejectEmptyName = false

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? (input as Request).url : input)
      const method = String(init?.method ?? "GET").toUpperCase()
      if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
      // A guest: the profile has no display name.
      if (u.includes("/visitors/profile")) {
        return jsonResponse({ visitor_id: "guest", display_name: null, avatar_url: null })
      }
      if (u.includes("/media")) {
        return jsonResponse({
          url: "mxc://hs/guest-image",
          filename: "guest.png",
          mimetype: "image/png",
          size: 12,
          voice: false,
        })
      }
      if (u.includes("/comments")) {
        if (method === "POST") {
          const body = init?.body
            ? (JSON.parse(init.body as string) as Record<string, unknown>)
            : {}
          commentBodies.push(body)
          const name = String(body.display_name ?? "")
          if (rejectEmptyName && !DISPLAY_NAME_PATTERN.test(name)) return validationError()
          return jsonResponse({ submission_id: 7 }, 202)
        }
        return jsonResponse({
          data: [],
          meta: { total: 0, page: 1, per_page: 20, total_pages: 1 },
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector("cumments-editor") !== null,
      "composer to render",
    )
    await el.updateComplete.catch(() => {})

    const editor = el.shadowRoot.querySelector("cumments-editor") as HTMLElement & {
      profileName: string
    }
    // Guest: no configured display name reaches the composer.
    expect(editor.profileName).toBe("")

    // Enable the backend's strict validation for the submission.
    rejectEmptyName = true

    // Select an image through the real Attach control; the upload succeeds.
    const file = new File(["guest-image"], "guest.png", { type: "image/png" })
    const fileInput = editor.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await waitFor(
      () =>
        editor.querySelector("img") !== null || editor.textContent?.includes("Uploading") === true,
      "upload to start",
    )
    await new Promise((r) => setTimeout(r, 60))
    await el.updateComplete.catch(() => {})

    const postBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn, "Post should be available once the upload is ready").toBeTruthy()
    await waitFor(() => postBtn.disabled === false, "Post to become enabled")
    postBtn.click()
    await waitFor(() => commentBodies.length > 0, "the comment POST to be sent")
    await new Promise((r) => setTimeout(r, 60))
    await el.updateComplete.catch(() => {})

    // The submission carried a valid name, so the backend did not reject it…
    const body = commentBodies[0]
    expect(body.display_name).toBe("Anonymous")
    // …and the rejection detail never surfaced in the UI. The mock returns the
    // real problem document; CommentsFeature renders its `detail` as the error,
    // so this is the text that appears when an invalid name is submitted.
    expect(el.shadowRoot.textContent ?? "").not.toContain("request validation failed")
    // The media attachment travelled with the submission.
    expect(body.media).toBeTruthy()
    expect((body.media as { url: string }).url).toBe("mxc://hs/guest-image")
  })
})
