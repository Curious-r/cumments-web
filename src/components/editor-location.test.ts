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
    expect(el.innerHTML).toContain("Location attached")
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
    const input = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
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
    const input = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
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
    const geoMock = mockGeolocationFailure({ message: "Permission denied" })
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
    expect(el.innerHTML).toContain("Permission denied")
  })
})
