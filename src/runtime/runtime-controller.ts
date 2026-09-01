import type { ReactiveController, ReactiveControllerHost } from "lit"
import type { AppRuntime } from "./app-runtime"

export class RuntimeController implements ReactiveController {
  private getRuntime: () => AppRuntime | null
  constructor(
    host: ReactiveControllerHost & HTMLElement,
    runtimeOrGetter: AppRuntime | (() => AppRuntime | null),
  ) {
    void host
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
