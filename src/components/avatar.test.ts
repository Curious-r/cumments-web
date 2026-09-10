import { afterEach, describe, expect, it } from "vitest"
import "./avatar"
import { avatarInitial, type CummentsAvatar, usableAvatarUrl } from "./avatar"

async function createAvatar(props: Partial<CummentsAvatar> = {}): Promise<CummentsAvatar> {
  const el = document.createElement("cumments-avatar") as CummentsAvatar
  el.size = 32
  el.displayName = "Alice"
  Object.assign(el, props)
  document.body.appendChild(el)
  await el.updateComplete
  return el
}

const img = (el: CummentsAvatar) => el.querySelector("img.avatar-image") as HTMLImageElement | null
const fallback = (el: CummentsAvatar) => el.querySelector(".avatar-fallback") as HTMLElement | null

describe("usableAvatarUrl", () => {
  it("accepts http and https only", () => {
    expect(usableAvatarUrl("https://cdn/avatar.png")).toBe("https://cdn/avatar.png")
    expect(usableAvatarUrl("http://cdn/avatar.png")).toBe("http://cdn/avatar.png")
    expect(usableAvatarUrl("  https://cdn/a.png  ")).toBe("https://cdn/a.png")
  })

  it("rejects missing, empty and non-http schemes", () => {
    expect(usableAvatarUrl(null)).toBeNull()
    expect(usableAvatarUrl(undefined)).toBeNull()
    expect(usableAvatarUrl("")).toBeNull()
    expect(usableAvatarUrl("   ")).toBeNull()
    expect(usableAvatarUrl("mxc://example.com/abc")).toBeNull()
    expect(usableAvatarUrl("not a url")).toBeNull()
    expect(usableAvatarUrl("javascript:alert(1)")).toBeNull()
  })
})

describe("avatarInitial", () => {
  it("uses the first letter of the name", () => {
    expect(avatarInitial("Alice")).toBe("A")
    expect(avatarInitial("bob")).toBe("B")
  })

  it("does not break on Unicode names", () => {
    // First grapheme of a surrogate-pair emoji must survive intact.
    expect(avatarInitial("😀 Alice")).toBe("😀")
    // A combining sequence is one grapheme, not two code points.
    expect(avatarInitial("e\u0301mile")).toBe("E\u0301")
  })

  it("falls back neutrally with no usable name", () => {
    expect(avatarInitial("")).toBe("?")
    expect(avatarInitial("   ")).toBe("?")
    expect(avatarInitial(null)).toBe("?")
  })
})

describe("<cumments-avatar>", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("renders an image for a usable HTTP URL", async () => {
    const el = await createAvatar({ avatarUrl: "https://cdn/avatar.png" })
    expect(img(el)?.getAttribute("src")).toBe("https://cdn/avatar.png")
    expect(fallback(el)).toBeNull()
    // Decorative: the visible name already identifies the user.
    expect(img(el)?.getAttribute("alt")).toBe("")
  })

  it("renders the fallback initial when the URL is null", async () => {
    const el = await createAvatar({ avatarUrl: null })
    expect(img(el)).toBeNull()
    expect(fallback(el)?.textContent?.trim()).toBe("A")
  })

  it("renders the fallback for an empty URL", async () => {
    const el = await createAvatar({ avatarUrl: "" })
    expect(img(el)).toBeNull()
    expect(fallback(el)?.textContent?.trim()).toBe("A")
  })

  it("gracefully falls back for an unusable URL instead of building one", async () => {
    const el = await createAvatar({ avatarUrl: "mxc://example.com/abc" })
    expect(img(el)).toBeNull()
    expect(fallback(el)?.textContent?.trim()).toBe("A")
    // The frontend must not construct a Matrix media URL from an mxc:// value.
    expect(el.innerHTML).not.toContain("mxc")
  })

  it("swaps to the fallback when the image fails to load", async () => {
    const el = await createAvatar({ avatarUrl: "https://cdn/broken.png" })
    expect(img(el)).toBeTruthy()

    img(el)?.dispatchEvent(new Event("error"))
    await el.updateComplete

    expect(img(el)).toBeNull()
    expect(fallback(el)?.textContent?.trim()).toBe("A")
  })

  it("retries when a new URL is supplied after a failure", async () => {
    const el = await createAvatar({ avatarUrl: "https://cdn/broken.png" })
    img(el)?.dispatchEvent(new Event("error"))
    await el.updateComplete
    expect(fallback(el)).toBeTruthy()

    el.avatarUrl = "https://cdn/working.png"
    await el.updateComplete
    expect(img(el)?.getAttribute("src")).toBe("https://cdn/working.png")
    expect(fallback(el)).toBeNull()
  })

  it("keeps the same box dimensions in both representations", async () => {
    const image = await createAvatar({ avatarUrl: "https://cdn/avatar.png", size: 48 })
    const imageStyle = getComputedStyle(img(image) as HTMLImageElement)
    expect(imageStyle.width).toBe("48px")
    expect(imageStyle.height).toBe("48px")

    const initials = await createAvatar({ avatarUrl: null, size: 48 })
    const fallbackStyle = getComputedStyle(fallback(initials) as HTMLElement)
    // Identical box so the layout does not shift when an avatar is missing or fails.
    expect(fallbackStyle.width).toBe(imageStyle.width)
    expect(fallbackStyle.height).toBe(imageStyle.height)
    expect(fallbackStyle.borderRadius).toBe(imageStyle.borderRadius)
  })

  it("keeps the fallback decorative", async () => {
    const el = await createAvatar({ avatarUrl: null })
    expect(fallback(el)?.getAttribute("aria-hidden")).toBe("true")
  })
})
