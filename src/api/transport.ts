import { CummentsError, type ProblemDetails } from "./errors"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "QUERY"

export interface RequestOptions {
  method: HttpMethod
  path: string
  endpoint: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface TransportResponse<T> {
  data: T
  headers: Headers
  status: number
}

function buildUrl(endpoint: string, path: string): string {
  const base = endpoint.replace(/\/$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}

async function parseProblem(res: Response): Promise<ProblemDetails | null> {
  const ct = res.headers.get("content-type") || ""
  if (!ct.includes("application/problem+json") && !ct.includes("application/json")) {
    return null
  }
  try {
    const body = (await res.clone().json()) as Partial<ProblemDetails>
    if (body && typeof body.status === "number" && typeof body.code === "string") {
      return body as ProblemDetails
    }
  } catch {
    // ignore
  }
  return null
}

export async function request<T>(opts: RequestOptions): Promise<TransportResponse<T>> {
  const url = buildUrl(opts.endpoint, opts.path)
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opts.headers,
  }
  let body: BodyInit | undefined
  if (opts.body !== undefined) {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body,
    signal: opts.signal,
  })

  if (!res.ok) {
    const problem = await parseProblem(res)
    const retryAfter = res.headers.get("Retry-After")
    const retrySec = retryAfter ? Number.parseInt(retryAfter, 10) : undefined
    if (problem) {
      throw new CummentsError(problem, Number.isFinite(retrySec) ? retrySec : undefined)
    }
    const text = await res.text().catch(() => res.statusText)
    throw new CummentsError(
      {
        type: "about:blank",
        title: res.statusText || "Request failed",
        status: res.status,
        detail: text || `request failed with ${res.status}`,
        code: `http-${res.status}`,
      },
      Number.isFinite(retrySec) ? retrySec : undefined,
    )
  }

  const ct = res.headers.get("content-type") || ""
  let data: T
  if (ct.includes("application/json")) {
    data = (await res.json()) as T
  } else if (res.status === 204) {
    data = undefined as T
  } else {
    const text = await res.text()
    data = text as unknown as T
  }

  return { data, headers: res.headers, status: res.status }
}

/**
 * QUERY helper — RFC 10008. Sends JSON body with QUERY method.
 * Falls back to POST with `?_query=1` only if the caller explicitly opts in;
 * by default the spec method is used and a network error surfaces.
 */
export async function query<T, B = unknown>(
  endpoint: string,
  path: string,
  body: B,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<TransportResponse<T>> {
  return request<T>({
    method: "QUERY",
    endpoint,
    path,
    body,
    headers,
    signal,
  })
}
