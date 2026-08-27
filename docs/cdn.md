# CDN Distribution — Decision Record

**Date:** 2026-08-28
**Status:** Preview 0.x, `main` `a9b788b` + M6.6
**Backend:** `0.28.1` via `https://comments.curious.host`

## Decision

**GitHub Pages** (`gh-pages` branch) as the CDN, with URL form:

```
https://curious-r.github.io/cumments-web/0.1.0/cumments-web.js
https://curious-r.github.io/cumments-web/latest/cumments-web.js
```

**Rationale — simplest, lowest ops:**

* HTTPS via `*.github.io` (already used for `cumments` docs)
* Immutable versioned path (`/0.1.0/`) + mutable `latest` alias (single `gh-pages` branch, no extra server)
* Tag → CI → build → publish, with `dist/` as a whole artifact (ensures `pow.worker-*.js` co-located)
* No extra infrastructure (no R2, no Cloudflare Workers, no multi-CDN)
* Directly maps to spec's `https://<cdn>/cumments-web/0.1.0/cumments-web.js` with `<cdn> = https://curious-r.github.io`

**Alternatives considered:**

* **jsDelivr via GitHub (`cdn.jsdelivr.net/gh/...`)** — provides `@0.1.0` and `@latest` via Git tags, but `latest` is not a controllable mutable alias (tied to GitHub's `latest` tag) and cache invalidation is opaque; also requires trusting third-party CDN for version semantics
* **Cloudflare R2 + Workers** — more control over cache headers, but adds account, bucket, and worker maintenance for a 0.x preview
* **unpkg / npm** — requires `npm publish`, out of scope for browser-only artifact (spec says no npm)

**Artifact storage:**

* `gh-pages` branch, directories `0.1.0/` and `latest/` each contain a full `dist/` snapshot (`cumments-web.js`, `assets/pow.worker-*.js`, `cumments-web.js.map` if present)
* Single build per tag: `v0.1.0` → build once → copy to `0.1.0/` and `latest/` in same commit, guaranteeing no drift

**Cache strategy:**

* **Versioned (`/0.1.0/`)** — immutable, long-lived (`Cache-Control: max-age=31536000, immutable` via GitHub Pages default `600` + `immutable` is acceptable for preview; no custom `_headers` needed yet)
* **`latest` (`/latest/`)** — moving, revalidated (`Cache-Control: no-cache` or short `max-age=300` via meta refresh; GitHub Pages default is `600`, acceptable for preview dogfooding — `latest` users accept short staleness, and fixed-version users are unaffected)

**Release flow:**

```
git tag v0.1.0 → push → release.yml (on: push tags v0.*)
  checkout exact tag (fetch-depth 0)
  pnpm install --frozen-lockfile → lint → typecheck → test → build
  verify dist/cumments-web.js + dist/assets/pow.worker-*.js exist
  publish: clone gh-pages, copy dist to 0.1.0/ and latest/, commit, push
```

**Worker verification (hard gate):**

* `dist/cumments-web.js` contains `new Worker(new URL("./pow.worker-*.js", import.meta.url))` (Vite hashed)
* When served from `https://curious-r.github.io/cumments-web/0.1.0/`, worker resolves to `.../0.1.0/assets/pow.worker-*.js` (same origin, same path prefix)
* Real browser test via `demo/index.html` with `endpoint=https://comments.curious.host` must show `create → PoW → sign → POST 202` with worker `200` (not `404` or `MIME` error)

**Version isolation:**

* Publishing `v0.1.1` must not mutate `0.1.0/` (verified by `git log` on `gh-pages` and by fetching both URLs)
* `latest` after `v0.1.1` must equal `0.1.1` artifact (verified by checksum)

**No GitHub Release:** tag → CI → artifact only, per backend philosophy.

**Source map & SRI:** `cumments-web.js.map` published alongside `js` for preview debugging; SRI `integrity` optional and not required for this stage, but `tag → commit → artifact → sha256` is traceable via `git` and `dist` content.

**Future:** If cache or worker requirements outgrow Pages, migrate to R2 without changing URL form (keep `0.1.0`/`latest` path contract).
