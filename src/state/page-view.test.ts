import { describe, expect, it } from "vitest"
import { PageView } from "./page-view"

describe("PageView", () => {
  it("replace", () => {
    const pv = new PageView()
    pv.replace(["$2", "$1"], { total: 2, page: 1, per_page: 20, total_pages: 1 })
    expect(pv.order).toEqual(["$2", "$1"])
    expect(pv.meta?.total).toBe(2)
  })

  it("order/meta replacement", () => {
    const pv = new PageView()
    pv.replace(["$1"], { total: 1, page: 1, per_page: 20, total_pages: 1 })
    pv.replace(["$2"], { total: 1, page: 1, per_page: 20, total_pages: 1 })
    expect(pv.order).toEqual(["$2"])
    expect(pv.meta?.total).toBe(1)
  })

  it("page transition", () => {
    const pv = new PageView()
    pv.replace(["$1", "$2"], { total: 4, page: 1, per_page: 2, total_pages: 2 })
    pv.replace(["$3", "$4"], { total: 4, page: 2, per_page: 2, total_pages: 2 })
    expect(pv.order).toEqual(["$3", "$4"])
  })

  it("clear", () => {
    const pv = new PageView()
    pv.replace(["$1"], { total: 1, page: 1, per_page: 20, total_pages: 1 })
    pv.clear()
    expect(pv.order).toEqual([])
    expect(pv.meta).toBeNull()
  })
})
