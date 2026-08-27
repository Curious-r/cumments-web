import { defineConfig } from "vite"

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "cumments-web.js",
    },
    rollupOptions: {
      external: [],
    },
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,js}"],
    setupFiles: ["src/test/setup.ts"],
  },
})
