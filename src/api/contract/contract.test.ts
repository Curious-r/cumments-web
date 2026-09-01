import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type { PaginationQuery } from "./query"
import { isEphemeralEvent, isProjectorEvent } from "./sse"

const snapshotPath = resolve("api/openapi.yaml")
const provenancePath = resolve("api/openapi.provenance")
const generatedPath = resolve("src/api/contract/generated.d.ts")

describe("contract compatibility harness", () => {
  it("snapshot provenance is present and well-formed", () => {
    const prov = readFileSync(provenancePath, "utf8")
    expect(prov).toMatch(/repository: Curious-r\/cumments/)
    expect(prov).toMatch(/commit: [0-9a-f]{40}/)
    expect(prov).toMatch(/source: docs\/public\/openapi.yaml/)
    expect(prov).toMatch(/openapi_version: 3\.2\.0/)
  })

  it("snapshot is OpenAPI 3.2 with QUERY and SSE itemSchema", () => {
    const yaml = readFileSync(snapshotPath, "utf8")
    expect(yaml).toContain("openapi: 3.2.0")
    expect(yaml).toContain("$self: https://cumments.curious.host/openapi.yaml")
    // 5 query operations
    const queryMatches = yaml.match(/^ {4}query:/gm) || []
    expect(queryMatches.length).toBe(5)
    expect(yaml).toContain("operationId: queryComments")
    expect(yaml).toContain("itemSchema:")
    expect(yaml).toContain("contentMediaType: application/json")
    expect(yaml).toContain("contentSchema:")
    // 5 SSE events
    expect(yaml).toContain("message_created")
    expect(yaml).toContain("ephemeral")
  })

  it("generated contract preserves core schemas but drops query/SSE specifics", () => {
    const gen = readFileSync(generatedPath, "utf8")
    // core schemas should exist
    expect(gen).toContain("PaginationMeta")
    expect(gen).toContain("Message")
    expect(gen).toContain("CommentSseFrame")
    // query operations are intentionally missing — hand-written patch owns them
    expect(gen).not.toContain("queryComments")
    expect(gen).not.toContain("listOperatorSites")
    // SSE frame is untyped as unknown in generated — patch re-types it
    expect(gen).toContain('"text/event-stream": unknown')
  })

  it("hand-written query patch matches snapshot contract", () => {
    // compile-time shape check: if this compiles, the patch is wired
    const _q: PaginationQuery = { page: 1, per_page: 20 }
    expect(_q.page).toBe(1)

    // runtime spot-check via snapshot regex for requestBody fields
    const yaml = readFileSync(snapshotPath, "utf8")
    expect(yaml).toMatch(/author_public_key:/)
    expect(yaml).toMatch(/author_signature:/)
  })

  it("SSE discriminator helpers match OpenAPI", () => {
    expect(isProjectorEvent({ type: "message_created", payload: {} } as never)).toBe(true)
    expect(isProjectorEvent({ type: "message_deleted", payload: {} } as never)).toBe(true)
    expect(
      isProjectorEvent({ type: "typing", room_id: "!", user_id: "@a:hs", typing: true } as never),
    ).toBe(false)
    expect(
      isEphemeralEvent({ type: "typing", room_id: "!", user_id: "@a:hs", typing: true } as never),
    ).toBe(true)
    expect(isEphemeralEvent({ type: "message_created", payload: {} } as never)).toBe(false)
  })
  it("ReactionSummary reactors contract matches backend 22f2aa4", () => {
    const yaml = readFileSync(snapshotPath, "utf8")
    // snapshot must contain Reactor and required reactors
    expect(yaml).toContain("Reactor:")
    expect(yaml).toContain("display_name:")
    expect(yaml).toContain("avatar_url:")
    expect(yaml).toMatch(
      /ReactionSummary:\s*\n\s+type: object\s*\n\s+required: \[key, count, reactors\]/,
    )
    expect(yaml).toContain("reactors:")
    expect(yaml).toContain("maxItems: 5")

    const gen = readFileSync(generatedPath, "utf8")
    expect(gen).toContain("Reactor:")
    expect(gen).toContain("display_name")
    expect(gen).toContain("avatar_url")
    // reactors must be required (no ?) and typed as Reactor[]
    expect(gen).toContain('reactors: components["schemas"]["Reactor"][]')
    expect(gen).not.toContain("reactors?:")
    // ensure ReactionSummary still has key/count/mine
    expect(gen).toContain("ReactionSummary:")
    expect(gen).toMatch(/ReactionSummary:\s*\{\s*key: string;/s)
  })
})
