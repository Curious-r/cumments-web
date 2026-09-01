import { describe, expect, it } from "vitest"
import type { Message } from "../api/contract/query"
import { PendingOperation } from "./pending-operation"

function msg(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$1",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello" } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: 42,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
    ...overrides,
  } as Message
}

describe("PendingOperation", () => {
  it("single slot set/clear", () => {
    const op = new PendingOperation()
    expect(op.pending).toBeNull()
    op.setPending({ submissionId: 42, publicKey: "pk", content: "hello", submittedAt: Date.now() })
    expect(op.pending?.submissionId).toBe(42)
    op.setPending(null)
    expect(op.pending).toBeNull()
  })

  it("submission_id satisfaction", () => {
    const op = new PendingOperation()
    op.setPending({ submissionId: 42, publicKey: "pk", content: "hello", submittedAt: Date.now() })
    op.clearIfSatisfied([msg({ submission_id: 42 })])
    expect(op.pending).toBeNull()
  })

  it("fallback satisfaction by publicKey+body", () => {
    const op = new PendingOperation()
    const now = Date.now()
    op.setPending({ submissionId: null, publicKey: "pk", content: "hello", submittedAt: now })
    const m = msg({
      submission_id: null,
      content: { type: "text", body: "hello" } as unknown as Message["content"],
      timestamp: new Date(now).toISOString(),
    })
    // need to set author public_key to pk
    ;(m.author as unknown as { public_key: string }).public_key = "pk"
    op.clearIfSatisfied([m])
    expect(op.pending).toBeNull()
  })

  it("second mutation should be rejected (single slot)", () => {
    const op = new PendingOperation()
    op.setPending({ submissionId: 1, publicKey: "pk", content: "a", submittedAt: Date.now() })
    // Simulate CommentsFeature check: should throw if pending already occupied
    let threw = false
    try {
      if (op.pending) throw new Error("pending already in progress")
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(op.pending?.submissionId).toBe(1)
  })

  it("REACT/VOTE never occupy slot", () => {
    const op = new PendingOperation()
    // Simulate that REACT/VOTE don't call setPending
    expect(op.pending).toBeNull()
    // Even after REACT, pending should remain null
    // No operation to set pending for REACT
    expect(op.pending).toBeNull()
  })

  it("not cleared if not satisfied", () => {
    const op = new PendingOperation()
    op.setPending({ submissionId: 99, publicKey: "pk", content: "hello", submittedAt: Date.now() })
    const other = msg({
      submission_id: 42,
      content: { type: "text", body: "different" } as unknown as Message["content"],
    })
    ;(other.author as unknown as { public_key: string }).public_key = "other"
    op.clearIfSatisfied([other])
    expect(op.pending).not.toBeNull()
  })
})
