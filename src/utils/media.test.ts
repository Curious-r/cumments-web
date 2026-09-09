import { describe, expect, it } from "vitest"
import { mimeToMediaKind } from "./media"

describe("mimeToMediaKind", () => {
  it("maps image/png to image", () => {
    expect(mimeToMediaKind("image/png")).toBe("image")
  })

  it("maps image/jpeg to image", () => {
    expect(mimeToMediaKind("image/jpeg")).toBe("image")
  })

  it("maps video/* to video", () => {
    expect(mimeToMediaKind("video/mp4")).toBe("video")
  })

  it("maps audio/* to audio", () => {
    expect(mimeToMediaKind("audio/mpeg")).toBe("audio")
  })

  it("maps application/pdf to file", () => {
    expect(mimeToMediaKind("application/pdf")).toBe("file")
  })

  it("maps unknown types to file", () => {
    expect(mimeToMediaKind("application/octet-stream")).toBe("file")
  })
})
