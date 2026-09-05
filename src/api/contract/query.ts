/**
 * Hand-written patch for OpenAPI 3.2 `query:` operations.
 *
 * `openapi-typescript` 7.13 does not emit `query` methods, so the
 * 5 QUERY operations are typed here and kept in sync with
 * `api/openapi.yaml` (queryComments + 4 operator queries).
 * This file is the source of truth for the web client's read path.
 */

import type { components } from "./generated"

export type SiteId = string
export type PageSlug = string

/**
 * Request body for `QUERY /sites/{site_id}/pages/{page_slug}/comments`.
 * Mirrors `api/openapi.yaml#/paths/.../query/requestBody`.
 * Personalization fields are optional; when both are present the server
 * verifies `["QUERY_COMMENTS", site_id, page_slug]`.
 * `thread_root` filters to active replies of that Thread: the root itself is
 * excluded and `meta.total` is the active reply count.
 */
export interface PaginationQuery {
  page?: number
  per_page?: number
  thread_root?: string
  author_public_key?: string
  author_signature?: string
}

export type Message = components["schemas"]["Message"]
export type PaginationMeta = components["schemas"]["PaginationMeta"]
export type ThreadSummary = components["schemas"]["ThreadSummary"]

export interface PaginatedResponse {
  data: Message[]
  meta: PaginationMeta
}

/**
 * Operator list queries — kept for completeness; the web client currently
 * only uses `queryComments`, but the types are preserved to avoid silent
 * drift with the contract.
 */
export type OperatorListQuery = components["schemas"]["OperatorListQuery"]
export type OperatorQuarantinedRoomPage = components["schemas"]["OperatorQuarantinedRoomPage"]
export type UpgradeIntentListQuery = components["schemas"]["UpgradeIntentListQuery"]
export type ProjectionRepairPage = components["schemas"]["ProjectionRepairPage"]
