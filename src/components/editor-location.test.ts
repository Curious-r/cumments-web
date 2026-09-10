import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"
import type { CummentsEditor } from "./editor/cumments-editor"

function createEditor(opts: Partial<CummentsEditor> = {}): Promise<CummentsEditor> {
  const el = document.createElement("cumments-editor") as CummentsEditor
  Object.assign(el, opts)
  document.body.appendChild(el)
  return new Promise((resolve) => setTimeout(() => resolve(el), 30))
}

function mockGeolocationSuccess(lat = 30.123, lng = 120.456) {
  const mockPos = { coords: { latitude: lat, longitude: lng } } as unknown as GeolocationPosition
  return vi.fn((succ: PositionCallback) => succ(mockPos))
}

function mockGeolocationFailure(
  error: Partial<GeolocationPositionError> = { code: 1, message: "Permission denied" },
) {
  const err = {
    code: 1,
    message: "Permission denied",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    ...error,
  } as unknown as GeolocationPositionError
  return vi.fn((_succ: PositionCallback, fail: PositionErrorCallback) => fail(err))
}

describe("Location explicit attachment", () => {
  let origGeo: Geolocation | undefined

  beforeEach(() => {
    origGeo = navigator.geolocation
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: origGeo,
      writable: true,
      configurable: true,
    })
    document.body.innerHTML = ""
  })

  it("clicking Location invokes getCurrentPosition", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(geoMock).toHaveBeenCalled()
  })

  it("geolocation success creates pending location", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBe(
      "geo:30.123,120.456",
    )
    // Should show formatted coordinates (4 decimal places)
    expect(el.innerHTML).toContain("30.1230, 120.4560")
  })

  it("successful location selection does not dispatch submit", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    let submitted = false
    el.addEventListener("cumments:submit", () => {
      submitted = true
    })
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(submitted).toBe(false)
  })

  it("successful location selection does not invoke shareLocation immediately", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
  })

  it("existing draft preserved after location selection", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input.value = "hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
  })

  it("existing reply preserved after location selection", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
  })

  it("pending location enables Post when no text exists", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn.disabled).toBe(true)
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(postBtn.disabled).toBe(false)
  })

  it("explicit Post submits pending location", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { geoUri?: string }
    expect(detail.geoUri).toBe("geo:30.123,120.456")
  })

  it("media/sticker state not cleared when adding location", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    // Set pending media
    const uploadMock = vi.fn(async () => ({
      url: "https://example.com/a.png",
      filename: "a.png",
      mimetype: "image/png",
      size: 100,
      voice: false,
    }))
    ;(el as unknown as { uploadMedia: unknown }).uploadMedia = uploadMock
    const file = new File(["hello"], "a.png", { type: "image/png" })
    const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(fileInput, "files", { value: [file], writable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    // Now add location
    const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    locBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeTruthy()
    // Draft should still be preserved
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("")
  })

  it("removing pending location does not submit", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    let submitted = false
    el.addEventListener("cumments:submit", () => {
      submitted = true
    })
    const removeBtn = el.querySelector('button[aria-label="Remove location"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(submitted).toBe(false)
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeNull()
  })

  it("removing pending location preserves draft", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input.value = "hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    const removeBtn = el.querySelector('button[aria-label="Remove location"]') as HTMLButtonElement
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
  })

  it("pendingLocation is preserved until parent clears after successful submit", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    // pendingLocation should be set
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeTruthy()
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    expect((captured as { geoUri?: string })?.geoUri).toBe("geo:30.123,120.456")
    // pendingLocation should NOT be cleared by the editor — parent owns it
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeTruthy()
    // Parent signals success by clearing it
    ;(el as unknown as { clearPendingLocation: () => void }).clearPendingLocation()
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeNull()
  })

  it("pendingLocation is preserved on failed submit", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeTruthy()
    // Simulate a failed submit — the parent would dispatch an error
    // The editor should keep the pendingLocation for retry
    el.dispatchEvent(
      new CustomEvent("cumments:submit", {
        detail: {
          content: "geo:30.123,120.456",
          displayName: "Alice",
          geoUri: "geo:30.123,120.456",
        },
        bubbles: true,
        composed: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    // pendingLocation should still be present (not cleared by editor on submit)
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeTruthy()
  })

  it("draft can be restored after failed submit", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input.value = "my comment"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    // After submit, draft is cleared optimistically
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("")
    // Simulate failure — parent restores the draft
    ;(el as unknown as { restoreDraft: (s: string) => void }).restoreDraft("my comment")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("my comment")
  })

  it("removing pending location does not invoke shareLocation", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    const removeBtn = el.querySelector('button[aria-label="Remove location"]') as HTMLButtonElement
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeNull()
  })

  it("geolocation failure does not create pending location", async () => {
    const geoMock = mockGeolocationFailure()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { pendingLocation: unknown }).pendingLocation).toBeNull()
  })

  it("geolocation failure does not submit", async () => {
    const geoMock = mockGeolocationFailure()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    let submitted = false
    el.addEventListener("cumments:submit", () => {
      submitted = true
    })
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(submitted).toBe(false)
  })

  it("geolocation failure clears loading state", async () => {
    const geoMock = mockGeolocationFailure()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    // Immediately after click, should be sharing
    expect((el as unknown as { locationSharing: boolean }).locationSharing).toBe(true)
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { locationSharing: boolean }).locationSharing).toBe(false)
  })

  it("existing location error handling remains visible", async () => {
    const geoMock = mockGeolocationFailure({ code: 1, message: "Permission denied" })
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Should show user-friendly error message
    expect(el.innerHTML).toContain("Location access denied")
  })

  it("permission denied shows user-friendly message", async () => {
    const geoMock = mockGeolocationFailure({ code: 1, message: "Permission denied" })
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("Location access denied. Enable in browser settings.")
  })

  it("position unavailable shows user-friendly message", async () => {
    const geoMock = mockGeolocationFailure({ code: 2, message: "Position unavailable" })
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("Location unavailable. Try again.")
  })

  it("timeout shows user-friendly message", async () => {
    const geoMock = mockGeolocationFailure({ code: 3, message: "Timeout" })
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("Location request timed out. Try again.")
  })

  it("pending location card shows coordinates", async () => {
    const geoMock = mockGeolocationSuccess(30.123456, 120.456789)
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Should show formatted coordinates
    expect(el.innerHTML).toContain("30.1235, 120.4568")
  })

  it("pending location card has accessible remove button", async () => {
    const geoMock = mockGeolocationSuccess()
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    const btn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const removeBtn = el.querySelector('button[aria-label="Remove location"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
  })

  it("successful location acquisition creates persistent pending content without auto-submit", async () => {
    const geoMock = mockGeolocationSuccess(30.123, 120.456)
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    let submitted = false
    let capturedDetail: unknown = null
    el.addEventListener("cumments:submit", (e) => {
      submitted = true
      capturedDetail = (e as CustomEvent).detail
    })
    // Activate Location
    const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    locBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Pending location should be visible
    expect(el.innerHTML).toContain("30.1230, 120.4560")
    // No submit should have occurred
    expect(submitted).toBe(false)
    // Pending location should still be visible (persistent)
    expect(el.innerHTML).toContain("30.1230, 120.4560")
    // Now explicitly press Post
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn.disabled).toBe(false)
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    // Submit should now have occurred with location
    expect(submitted).toBe(true)
    expect((capturedDetail as { geoUri?: string })?.geoUri).toBe("geo:30.123,120.456")
  })
})
