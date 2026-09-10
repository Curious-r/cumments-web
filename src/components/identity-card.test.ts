import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { generateRandomIdentity } from "../identity/keypair"
import { MockEventSource } from "../test/mocks"

type El = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }

interface ServerState {
  display_name: string | null
  avatar_url: string | null
}

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

function makeFetch(state: ServerState) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    const method = init?.method ?? "GET"
    if (u.includes("/api/v1/challenge")) return jsonResponse({ prefix: "test.", difficulty: 1 })
    if (u.includes("/visitors/profile")) {
      return jsonResponse({
        visitor_id: "v1",
        display_name: state.display_name,
        avatar_url: state.avatar_url,
      })
    }
    if (u.includes("/comments")) {
      if (method === "POST") return jsonResponse({ submission_id: 1 }, 202)
      return jsonResponse({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } })
    }
    return jsonResponse({})
  })
}

describe("identity card structure", () => {
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

  async function mount(state: ServerState): Promise<El> {
    globalThis.fetch = makeFetch(state) as unknown as typeof fetch
    const el = document.createElement("cumments-comments") as unknown as El
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "my-blog")
    el.setAttribute("page-slug", "hello-world")
    document.body.appendChild(el)
    await waitFor(
      () => el.shadowRoot.querySelector('[part="identity-capsule"]') !== null,
      "identity capsule to render",
    )
    // The active profile is fetched during runtime start; wait for it so the
    // capsule reflects real profile state rather than the initial empty one.
    await waitFor(
      () =>
        (el as unknown as { runtime?: { profile?: { current?: unknown } } }).runtime?.profile
          ?.current !== null,
      "active profile to load",
    )
    await el.updateComplete.catch(() => {})
    return el
  }

  const capsule = (el: El) =>
    el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement

  async function openPopover(el: El): Promise<HTMLElement> {
    capsule(el).click()
    await waitFor(
      () => el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]') !== null,
      "identity popover to open",
    )
    await el.updateComplete.catch(() => {})
    return el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]') as HTMLElement
  }

  const section = (popover: HTMLElement, name: string) =>
    popover.querySelector(`[data-identity-section="${name}"]`) as HTMLElement | null

  const buttonWithText = (root: ParentNode, text: string) =>
    Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as
      | HTMLButtonElement
      | undefined

  it("splits the card into profile, switch and management sections", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const popover = await openPopover(el)

    expect(section(popover, "profile"), "current profile section").toBeTruthy()
    expect(section(popover, "switch"), "switch identity section").toBeTruthy()
    expect(section(popover, "manage"), "identity management section").toBeTruthy()
  })

  it("shows the active profile with its display name and a way to edit it", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const popover = await openPopover(el)
    const profileSection = section(popover, "profile") as HTMLElement

    expect(profileSection.textContent).toContain("Alice")
    // The active cryptographic identity stays distinguishable.
    const runtime = (el as unknown as { runtime: { identity: { active: { publicKey: string } } } })
      .runtime
    const pk = runtime.identity.active.publicKey
    expect(profileSection.textContent).toContain(pk.slice(0, 8))

    const editProfile = profileSection.querySelector('[aria-label="Edit profile"]') as HTMLElement
    expect(editProfile).toBeTruthy()
    editProfile.click()
    await waitFor(
      () => el.shadowRoot.querySelector("input[aria-label='Profile display name']") !== null,
      "profile dialog to open",
    )
  })

  it("separates management actions from the active profile", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const popover = await openPopover(el)
    const manageSection = section(popover, "manage") as HTMLElement

    // Exact labels are part of the existing contract.
    expect(buttonWithText(manageSection, "Create")).toBeTruthy()
    expect(buttonWithText(manageSection, "Import")).toBeTruthy()
    expect(buttonWithText(manageSection, "Manage")).toBeTruthy()
    // Management lives only in its own section, not alongside the profile.
    const profileSection = section(popover, "profile") as HTMLElement
    expect(buttonWithText(profileSection, "Create")).toBeUndefined()
    expect(buttonWithText(profileSection, "Manage")).toBeUndefined()
  })

  it("keeps the management handlers wired", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const popover = await openPopover(el)
    ;(
      buttonWithText(section(popover, "manage") as HTMLElement, "Create") as HTMLButtonElement
    ).click()
    await waitFor(
      () => el.shadowRoot.textContent?.includes("Create identity") === true,
      "create dialog to open",
    )
  })

  it("marks the active identity and offers switching for the others", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const runtime = (
      el as unknown as {
        runtime: {
          identity: { active: { publicKey: string } | null; addIdentity: (i: unknown) => void }
        }
      }
    ).runtime
    const second = await generateRandomIdentity()
    runtime.identity.addIdentity(second)

    const popover = await openPopover(el)
    const rows = popover.querySelectorAll("[data-identity-row]")
    expect(rows).toHaveLength(2)

    const activeRow = Array.from(rows).find((r) => (r as HTMLElement).dataset.active === "true")
    expect(activeRow, "exactly one active row").toBeTruthy()
    expect(activeRow?.querySelector("[data-identity-active]")).toBeTruthy()

    const inactiveRow = Array.from(rows).find((r) => (r as HTMLElement).dataset.active === "false")
    const switchBtn = inactiveRow?.querySelector("[data-public-key]") as HTMLButtonElement
    expect(switchBtn).toBeTruthy()

    switchBtn.click()
    await waitFor(
      () => runtime.identity.active?.publicKey === second.publicKey,
      "identity to switch",
    )
  })

  it("renders the capsule avatar through the shared presentation", async () => {
    const withAvatar = await mount({ display_name: "Alice", avatar_url: "https://cdn/a.png" })
    const image = capsule(withAvatar).querySelector("img.avatar-image") as HTMLImageElement | null
    expect(image?.getAttribute("src")).toBe("https://cdn/a.png")
    expect(capsule(withAvatar).textContent).toContain("Alice")

    const withoutAvatar = await mount({ display_name: "Alice", avatar_url: null })
    expect(capsule(withoutAvatar).querySelector("img")).toBeNull()
    expect(capsule(withoutAvatar).querySelector(".avatar-fallback")?.textContent?.trim()).toBe("A")

    const broken = await mount({ display_name: "Alice", avatar_url: "https://cdn/broken.png" })
    capsule(broken).querySelector("img.avatar-image")?.dispatchEvent(new Event("error"))
    await waitFor(
      () => capsule(broken).querySelector(".avatar-fallback") !== null,
      "capsule avatar to fall back",
    )
  })

  it("renders the profile dialog avatar through the shared presentation", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: "https://cdn/a.png" })
    const popover = await openPopover(el)
    const profileSection = section(popover, "profile") as HTMLElement
    ;(profileSection.querySelector('[aria-label="Edit profile"]') as HTMLElement).click()
    await waitFor(
      () => el.shadowRoot.querySelector("input[aria-label='Profile display name']") !== null,
      "profile dialog to open",
    )

    const dialog = el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
    const images = dialog.querySelectorAll("cumments-avatar img.avatar-image")
    expect(images.length).toBeGreaterThan(0)
    expect(images[0].getAttribute("src")).toBe("https://cdn/a.png")
  })

  it("keeps edit-profile and management actions keyboard reachable", async () => {
    const el = await mount({ display_name: "Alice", avatar_url: null })
    const popover = await openPopover(el)

    const editProfile = popover.querySelector('[aria-label="Edit profile"]') as HTMLButtonElement
    editProfile.focus()
    expect(el.shadowRoot.activeElement).toBe(editProfile)

    const manage = buttonWithText(
      section(popover, "manage") as HTMLElement,
      "Manage",
    ) as HTMLButtonElement
    manage.focus()
    expect(el.shadowRoot.activeElement).toBe(manage)
  })
})
