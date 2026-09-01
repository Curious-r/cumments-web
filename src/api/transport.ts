import { CummentsError, type ProblemDetails } from "./errors"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "QUERY"

export interface RequestOptions {
  method: HttpMethod
  path: string
  endpoint: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  idempotencyKey?: string
  responseType?: "json" | "text" | "binary"
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

function isBinaryBody(body: unknown): body is ArrayBuffer | Uint8Array | Blob {
  return (
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array ||
    (typeof Blob !== "undefined" && body instanceof Blob)
  )
}

async function doFetch<T>(opts: {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: unknown
  signal?: AbortSignal
  responseType?: "json" | "text" | "binary"
}): Promise<TransportResponse<T>> {
  let body: BodyInit | undefined
  const headers: Record<string, string> = { ...opts.headers }
  // Ensure Accept
  if (!headers.Accept) headers.Accept = "application/json"

  if (opts.body !== undefined) {
    if (isBinaryBody(opts.body)) {
      body = opts.body as unknown as BodyInit
      // Content-Type must be supplied by caller for binary (e.g., mime)
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/octet-stream"
    } else {
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"
      body = JSON.stringify(opts.body)
    }
  }

  const res = await fetch(opts.url, {
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
  if (opts.responseType === "binary") {
    const buf = await res.arrayBuffer()
    data = buf as unknown as T
  } else if (opts.responseType === "text") {
    const text = await res.text()
    data = text as unknown as T
  } else if (ct.includes("application/json")) {
    data = (await res.json()) as T
  } else if (res.status === 204) {
    data = undefined as T
  } else {
    const text = await res.text()
    data = text as unknown as T
  }

  return { data, headers: res.headers, status: res.status }
}

export async function request<T>(opts: RequestOptions): Promise<TransportResponse<T>> {
  const url = buildUrl(opts.endpoint, opts.path)
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey
  }
  return doFetch<T>({
    method: opts.method,
    url,
    headers,
    body: opts.body,
    signal: opts.signal,
    responseType: opts.responseType,
  })
}

/**
 * QUERY helper — RFC 10008. Sends JSON body with QUERY method.
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

export class HttpTransport {
  constructor(private endpoint: string) {}

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint
  }

  getEndpoint(): string {
    return this.endpoint
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    opts: {
      body?: unknown | ArrayBuffer
      headers?: Record<string, string>
      signal?: AbortSignal
      idempotencyKey?: string
      responseType?: "json" | "text" | "binary"
    } = {},
  ): Promise<TransportResponse<T>> {
    const url = buildUrl(this.endpoint, path)
    const headers: Record<string, string> = { ...opts.headers }
    if (opts.idempotencyKey) {
      headers["Idempotency-Key"] = opts.idempotencyKey
    }
    return doFetch<T>({
      method,
      url,
      headers,
      body: opts.body,
      signal: opts.signal,
      responseType: opts.responseType,
    })
  }

  async query<T, B = unknown>(
    path: string,
    body: B,
    opts: {
      headers?: Record<string, string>
      signal?: AbortSignal
    } = {},
  ): Promise<TransportResponse<T>> {
    return this.request<T>("QUERY", path, {
      body: body as unknown,
      headers: opts.headers,
      signal: opts.signal,
    })
  }

  async get<T>(
    path: string,
    opts: {
      headers?: Record<string, string>
      signal?: AbortSignal
      responseType?: "json" | "text" | "binary"
    } = {},
  ): Promise<TransportResponse<T>> {
    return this.request<T>("GET", path, opts)
  }
}
