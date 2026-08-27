/**
 * RFC 9457 Problem Details plus Cumments `code` extension.
 * Mirrors `components/schemas/Error` and `components/responses/Error`.
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  code: string
  instance?: string
}

export type ErrorCode =
  | "bad-request"
  | "invalid-signature"
  | "invalid-pow"
  | "idempotency-key-required"
  | "invalid-idempotency-key"
  | "idempotency-key-reused"
  | "site-not-registered"
  | "not-manageable"
  | "rate-limited"
  | string

export class CummentsError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly problem: ProblemDetails
  readonly retryAfter?: number

  constructor(problem: ProblemDetails, retryAfter?: number) {
    super(problem.detail)
    this.name = "CummentsError"
    this.status = problem.status
    this.code = problem.code as ErrorCode
    this.problem = problem
    this.retryAfter = retryAfter
  }

  isRateLimited(): boolean {
    return this.status === 429
  }

  isNotFound(): boolean {
    return this.status === 404
  }
}

export function isCummentsError(e: unknown): e is CummentsError {
  return e instanceof CummentsError
}
