import type { PaginationMeta } from "../api/contract/query"

export class PageView {
  order: string[] = []
  meta: PaginationMeta | null = null

  replace(order: string[], meta: PaginationMeta | null): void {
    this.order = [...order]
    this.meta = meta ? { ...meta } : null
  }

  clear(): void {
    this.order = []
    this.meta = null
  }
}
