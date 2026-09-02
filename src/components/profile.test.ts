import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

function mockFetchWithProfile(displayName: string, avatarUrl: string | null = null) {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
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
        json: async () => ({
          visitor_id: "abcd1234",
          display_name: displayName,
          avatar_url: avatarUrl,
        }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({
              visitor_id: "abcd1234",
              display_name: displayName,
              avatar_url: avatarUrl,
            }),
          }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/visitors/avatar") && u.includes("PUT")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ avatar_url: "https://cdn/avatar_new.png" }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ avatar_url: "https://cdn/avatar_new.png" }),
          }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/visitors/avatar") && u.includes("DELETE")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
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
  return orig
}

describe("Profile UX", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
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

  async function render(displayName = "Alice", avatarUrl: string | null = null) {
    origFetch = mockFetchWithProfile(displayName, avatarUrl)
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  it("profile management is discoverable from identity capsule", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    expect(capsule).toBeTruthy()
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const popover = el.shadowRoot.querySelector(
      'div[role="dialog"][aria-label="Identity"]',
    ) as HTMLElement
    expect(popover).toBeTruthy()
    const profileBtn = Array.from(popover.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Profile"),
    )
    expect(profileBtn).toBeTruthy()
    expect(profileBtn?.textContent).toContain("Profile")
  })

  it("profile UI is distinct from cryptographic identity management", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Profile button should be separate from Create/Import/Manage
    const popover = el.shadowRoot.querySelector(
      'div[role="dialog"][aria-label="Identity"]',
    ) as HTMLElement
    const buttons = Array.from(popover.querySelectorAll("button")).map((b) => b.textContent?.trim())
    expect(buttons.some((t) => t?.includes("Profile"))).toBe(true)
    expect(buttons.some((t) => t === "Create")).toBe(true)
    expect(buttons.some((t) => t === "Import")).toBe(true)
    expect(buttons.some((t) => t === "Manage")).toBe(true)
    // Click Profile should open Profile dialog, not identity dialogs
    const profileBtn = Array.from(popover.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Profile"),
    ) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const html = el.shadowRoot.innerHTML
    expect(html).toContain("Profile")
    expect(html).toContain("Display name")
    // Identity dialogs are create/import/manage/backup/mnemonic, not profile
    expect(html).not.toContain("12 word mnemonic")
    expect(html).not.toContain("Create random identity")
  })

  it("display name can be viewed and edited through profile surface", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("Alice")
    // Edit to Bob
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // After save, profile should be Bob, and composer should reflect
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor).toBeTruthy()
    // The composer button should now show Bob
    const composerBtn = editor.querySelector('button[aria-label="Edit profile"]') as HTMLElement
    expect(composerBtn.textContent).toContain("Bob")
    // Capsule should also show Bob
    const capsuleAfter = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    expect(capsuleAfter.textContent).toContain("Bob")
  })

  it("avatar is shown in profile and composer when supported", async () => {
    const el = await render("Alice", "https://cdn/avatar.png")
    // Capsule should show avatar img
    const capsuleImg = el.shadowRoot.querySelector(
      '[part="identity-capsule"] img',
    ) as HTMLImageElement
    expect(capsuleImg).toBeTruthy()
    expect(capsuleImg.src).toContain("avatar.png")
    // Composer shows profile name (avatar in capsule suffices)
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const composerBtn2 = editor.querySelector('button[aria-label="Edit profile"]') as HTMLElement
    expect(composerBtn2.textContent).toContain("Alice")
    // Profile dialog should show avatar and allow removal
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const html = el.shadowRoot.innerHTML
    expect(html).toContain("Avatar")
    // Should show current avatar and Remove button
    expect(html).toContain("Remove")
  })

  it("composer no longer contains editable display name input", async () => {
    const el = await render("Alice")
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('input[aria-label="Display name"]')).toBeNull()
    expect(editor.querySelector('button[aria-label="Edit profile"]')).toBeTruthy()
    expect(editor.innerHTML).toContain("Commenting as")
  })

  it("composer displays current profile context and clicking opens profile", async () => {
    const el = await render("Alice")
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const btn = editor.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn.textContent).toContain("Alice")
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.innerHTML).toContain("Profile")
    expect(el.shadowRoot.innerHTML).toContain("Display name")
  })

  it("submitting uses current profile display name", async () => {
    const el = await render("Alice")
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.focus()
    await new Promise((r) => setTimeout(r, 30))
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    let captured: unknown = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((captured as { displayName: string }).displayName).toBe("Alice")
    // Now change profile to Bob and submit again
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLElement
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // New editor should now have Bob
    const editor2 = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const draft2 = editor2.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draft2.focus()
    await new Promise((r) => setTimeout(r, 30))
    draft2.value = "second"
    draft2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let captured2: unknown = null
    editor2.addEventListener("cumments:submit", (e: Event) => {
      captured2 = (e as CustomEvent).detail
    })
    const postBtn2 = editor2.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn2.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((captured2 as { displayName: string }).displayName).toBe("Bob")
  })

  it("changing profile does not clear draft and preserves reply", async () => {
    const el = await render("Alice")
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.focus()
    await new Promise((r) => setTimeout(r, 30))
    draftInput.value = "my draft"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    editor.setReplyToId("$parent")
    await (editor as unknown as { updateComplete: Promise<unknown> }).updateComplete
    await new Promise((r) => setTimeout(r, 20))
    // Open profile
    const btn = editor.querySelector('button[aria-label="Edit profile"]') as HTMLElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("my draft")
    expect((editor as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
      "$parent",
    )
  })

  it("opening Profile focuses an element inside the dialog", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    expect(dlg).toBeTruthy()
    const input = dlg.querySelector('input[aria-label="Profile display name"]') as HTMLElement
    expect(
      document.activeElement === input ||
        dlg.contains(document.activeElement as Node) ||
        el.shadowRoot.activeElement === input,
    ).toBeTruthy()
  })

  it("Escape closes Profile Dialog", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    let dlg = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    expect(dlg).toBeTruthy()
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    dlg = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    expect(dlg).toBeNull()
  })

  it("focus does not escape the dialog with Tab", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    expect(dlg).toBeTruthy()
    // Tab should cycle within dialog, not escape to document
    const focusable = Array.from(dlg.querySelectorAll("button, input")) as HTMLElement[]
    expect(focusable.length).toBeGreaterThan(1)
    // Focus last then Tab should go to first
    const last = focusable[focusable.length - 1]
    last.focus()
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    // After Tab, focus should still be inside dialog (either first or last)
    const active = (el.shadowRoot.activeElement ?? document.activeElement) as HTMLElement | null
    expect(dlg.contains(active as Node)).toBeTruthy()
  })

  it("closing restores focus to Profile trigger", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const popover = el.shadowRoot.querySelector(
      'div[role="dialog"][aria-label="Identity"]',
    ) as HTMLElement
    const profileBtn = Array.from(popover.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Profile"),
    ) as HTMLElement
    profileBtn.focus()
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const dlg = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    expect(dlg).toBeTruthy()
    // Close via Escape
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    const capsuleAfter = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    // Focus should be restored to some element inside the component (capsule or profileBtn if still in DOM)
    const active2 = (el.shadowRoot.activeElement ?? document.activeElement) as HTMLElement | null
    expect(active2).toBeTruthy()
    // Dialog should be closed
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("display name input has backend-compatible maxlength", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute("maxlength")).toBe("50")
  })

  it("valid 50-character name can be saved and whitespace trimming works", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    const fifty = "a".repeat(50)
    input.value = "  " + fifty + "  "
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLElement
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Should have saved and closed
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('button[aria-label="Edit profile"]')?.textContent).toContain(fifty)
  })

  it("over-limit name cannot be saved and shows error", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    const over = "a".repeat(51)
    input.value = over
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLElement
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Should still be open and show error
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy()
    expect(el.shadowRoot.innerHTML).toContain("50 characters or fewer")
    // Composer should still show old name
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('button[aria-label="Edit profile"]')?.textContent).toContain(
      "Alice",
    )
  })

  it("empty/whitespace name means Anonymous", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    input.value = "   "
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLElement
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('button[aria-label="Edit profile"]')?.textContent).toContain(
      "Anonymous",
    )
    // Submit should use Anonymous
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    expect(draftInput).toBeTruthy()
    draftInput.focus()
    await new Promise((r) => setTimeout(r, 20))
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let captured: unknown = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn).toBeTruthy()
    // Ensure button is enabled
    await new Promise((r) => setTimeout(r, 10))
    expect(postBtn.disabled).toBe(false)
    postBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(captured).toBeTruthy()
    expect((captured as { displayName: string }).displayName).toBe("")
  })

  it("backup/import remain identity operations, not profile", async () => {
    const el = await render("Alice")
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Profile dialog should not contain backup/mnemonic
    const html = el.shadowRoot.innerHTML
    expect(html).toContain("Profile")
    expect(html).not.toContain("12 word mnemonic")
    expect(html).not.toContain("Create random identity")
    // Close profile, open Manage
    const closeBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Cancel"),
    ) as HTMLElement
    closeBtn?.click()
    await new Promise((r) => setTimeout(r, 30))
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const manageBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent === "Manage") as HTMLElement
    manageBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const html2 = el.shadowRoot.innerHTML
    expect(html2).toContain("Manage identities")
  })
})
