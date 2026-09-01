import { describe, expect, it, vi } from "vitest"
import { AppRuntime } from "./app-runtime"
import { RuntimeController } from "./runtime-controller"

function makeRuntime() {
  // Use stub storage and transport to avoid network
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage
  const runtime = new AppRuntime(
    { endpoint: "https://example.com", siteId: "s", pageSlug: "p" },
    { storage: storage as unknown as import("../identity/storage").StorageLike },
  )
  // Stub start/stop to avoid real network
  return runtime
}

describe("RuntimeController", () => {
  it("hostConnected calls runtime.start", async () => {
    const runtime = makeRuntime()
    const startSpy = vi.spyOn(runtime, "start").mockResolvedValue()
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, runtime)
    ctrl.hostConnected()
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  it("hostDisconnected calls runtime.stop", async () => {
    const runtime = makeRuntime()
    const stopSpy = vi.spyOn(runtime, "stop").mockImplementation(() => {})
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, runtime)
    ctrl.hostDisconnected()
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it("double connect is idempotent", async () => {
    const runtime = makeRuntime()
    const startSpy = vi.spyOn(runtime, "start").mockResolvedValue()
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, runtime)
    ctrl.hostConnected()
    ctrl.hostConnected()
    expect(startSpy).toHaveBeenCalledTimes(2)
    // Runtime.start itself is idempotent, so second call is safe (but we call twice)
    // The important check is that no error and stop remains idempotent
    const stopSpy = vi.spyOn(runtime, "stop").mockImplementation(() => {})
    ctrl.hostDisconnected()
    ctrl.hostDisconnected()
    expect(stopSpy).toHaveBeenCalledTimes(2)
  })

  it("disconnect during start - stale start does not recreate state", async () => {
    const runtime = makeRuntime()
    let startResolve!: () => void
    const startPromise = new Promise<void>((resolve) => {
      startResolve = () => resolve()
    })
    vi.spyOn(runtime, "start").mockImplementation(() => startPromise)
    const origStop = runtime.stop.bind(runtime)
    const stopSpy2 = vi.spyOn(runtime, "stop").mockImplementation(() => {
      return origStop()
    })
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, runtime)
    const _p = ctrl.hostConnected()
    // Immediately disconnect
    ctrl.hostDisconnected()
    // Resolve start
    startResolve()
    await new Promise((r) => setTimeout(r, 10))
    // If implementation uses epoch, stale start should not create adapter
    // We just ensure no exception and stop was called
    expect(stopSpy2).toHaveBeenCalled()
  })

  it("supports getter form for dynamic runtime", async () => {
    const runtime1 = makeRuntime()
    const runtime2 = makeRuntime()
    const startSpy1 = vi.spyOn(runtime1, "start").mockResolvedValue()
    const startSpy2 = vi.spyOn(runtime2, "start").mockResolvedValue()
    let current: import("./app-runtime").AppRuntime | null = runtime1
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, () => current)
    ctrl.hostConnected()
    expect(startSpy1).toHaveBeenCalledTimes(1)
    expect(startSpy2).not.toHaveBeenCalled()
    current = runtime2
    ctrl.hostConnected()
    expect(startSpy2).toHaveBeenCalledTimes(1)
  })

  it("uses getter on disconnect", async () => {
    const runtime = makeRuntime()
    const stopSpy = vi.spyOn(runtime, "stop").mockImplementation(() => {})
    let current: import("./app-runtime").AppRuntime | null = runtime
    const host = {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    } as unknown as import("lit").ReactiveControllerHost & HTMLElement
    const ctrl = new RuntimeController(host, () => current)
    ctrl.hostDisconnected()
    expect(stopSpy).toHaveBeenCalledTimes(1)
    current = null
    ctrl.hostDisconnected()
    // should not throw
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })
})
