import type { ReactiveController, ReactiveControllerHost } from "lit"
import type { AppRuntime } from "./app-runtime"

export class RuntimeController implements ReactiveController {
  private getRuntime: () => AppRuntime | null
  constructor(
    host: ReactiveControllerHost & HTMLElement,
    runtimeOrGetter: AppRuntime | (() => AppRuntime | null),
  ) {
    // host is stored via Lit's addController, not needed to store explicitly
    // but we keep reference for potential future use
    ;(this as unknown as { host: unknown }).host = host
    if (typeof runtimeOrGetter === "function") {
      this.getRuntime = runtimeOrGetter as () => AppRuntime | null
    } else {
      const rt = runtimeOrGetter as AppRuntime
      this.getRuntime = () => rt
    }
  }

  hostConnected(): void {
    const rt = this.getRuntime()
    if (rt) void rt.start()
  }

  hostDisconnected(): void {
    const rt = this.getRuntime()
    if (rt) rt.stop()
  }
}
