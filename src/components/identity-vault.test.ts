import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"

class MockEventSource {
  static OPEN = 1
  url = ""
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    setTimeout(() => this.onopen?.(), 0)
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function mockFetch() {
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
        json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
          }) as unknown as Response,
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

describe("Identity vault UI", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  beforeEach(() => {
    origFetch = mockFetch()
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
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 100))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    return el
  }

  it("shows fingerprint for current identity", async () => {
    const el = await render()
    // M4: identity vault now behind capsule popover, not persistent
    const capsule = el.shadowRoot?.querySelector('[part="identity-capsule"]')
    expect(capsule).toBeTruthy()
    capsule?.dispatchEvent(new Event("click", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const html = el.shadowRoot?.innerHTML ?? ""
    expect(html).toMatch(/[0-9a-f]{8}/)
  })

  it("export backup requires explicit action", async () => {
    const el = await render()
    let html = el.shadowRoot?.innerHTML ?? ""
    expect(html).not.toContain('"privateKey"')
    // Open capsule then Manage then Backup
    const capsule = el.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule?.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const manageBtn = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find((b) =>
      b.textContent?.includes("Manage"),
    ) as HTMLButtonElement
    expect(manageBtn).toBeTruthy()
    manageBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Now in manage dialog, find Backup for first identity
    const backupBtn = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.trim() === "Backup",
    ) as HTMLButtonElement
    expect(backupBtn).toBeTruthy()
    backupBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    html = el.shadowRoot?.innerHTML ?? ""
    expect(html).toContain("privateKey")
  })

  it("import backup creates new identity", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    // Use isolated memory storage for this test
    const mem = new Map<string, string>()
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    }
    const { IdentityManager } = await import("../identity/identity-manager")
    const mgr = new IdentityManager(store as never)
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    // Remove then re-import to verify round-trip
    mgr.removeIdentity(id.publicKey)
    expect(mgr.list().length).toBe(0)
    const imported = await mgr.importIdentityBackup(json)
    expect(imported.publicKey).toBe(id.publicKey)
    expect(mgr.list().length).toBe(1)
  })

  it("mnemonic hidden by default", async () => {
    const el = await render()
    const html = el.shadowRoot?.innerHTML ?? ""
    // Should not show mnemonic directly
    expect(html).not.toContain("never share it") // only after export
  })

  it("backup and mnemonic not in data-* attributes", async () => {
    const el = await render()
    const html = el.shadowRoot?.innerHTML ?? ""
    expect(html).not.toContain("data-backup")
    expect(html).not.toContain("data-mnemonic")
    // M4: backup is now in dialog, open capsule -> Manage -> Backup
    const capsule = el.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule?.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const manageBtn = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find((b) =>
      b.textContent?.includes("Manage"),
    ) as HTMLButtonElement
    manageBtn?.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const backupBtn2 = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.trim() === "Backup",
    ) as HTMLButtonElement
    backupBtn2?.click()
    await new Promise((r) => setTimeout(r, 50))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const after = el.shadowRoot?.innerHTML ?? ""
    expect(after).not.toContain("data-backup")
    expect(after).not.toContain("data-mnemonic")
    expect(after).toContain("privateKey")
    // Check that no element has data-backup attribute containing privateKey
    const hasBackupAttr = el.shadowRoot?.querySelector("[data-backup]")
    expect(hasBackupAttr).toBeNull()
    const hasMnemonicAttr = el.shadowRoot?.querySelector("[data-mnemonic]")
    expect(hasMnemonicAttr).toBeNull()
  })

  it("copy backup gets correct JSON via state", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    const mem = new Map<string, string>()
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    }
    const { IdentityManager } = await import("../identity/identity-manager")
    const mgr = new IdentityManager(store as never)
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    // Simulate copy via manager (not DOM)
    expect(JSON.parse(json).privateKey).toBe(id.privateKey)
  })
})
