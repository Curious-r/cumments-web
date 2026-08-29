# Web Component — Preview Contract

`<cumments-comments>` is the confirmed public surface. Lit 3 is an internal detail.

```html
<script type="module" src="/cumments-web.js"></script>
<cumments-comments endpoint="https://comments.curious.host" site-id="my-blog" page-slug="hello-world" per-page="20" lang="zh-Hans"></cumments-comments>
```

Other examples:

```html
<cumments-comments lang="zh-Hans"></cumments-comments>
<cumments-comments lang="en"></cumments-comments>
<cumments-comments lang="en-GB"></cumments-comments>
```

## Attributes (5)

| Attribute | Type | Required | Description |
|---|---|---|---|
| `endpoint` | `string` | yes | API root, e.g. `https://comments.curious.host` |
| `site-id` | `string` | yes | `siteId` |
| `page-slug` | `string` | yes | `pageSlug` / `page_slug` — Cumments `PageSlug`, not an arbitrary URL or opaque page ID |
| `per-page` | `number` | no | `1..100`, default `20` |
| `lang` | `BCP 47 language tag` | no | default `en`. See Language below |

Properties mirror attributes (`endpoint`, `siteId`, `pageSlug`, `perPage`, `lang`).

## Language

`lang` accepts any **BCP 47 language tag** (`string`). It is *not* a closed enum.

Current UI locales actually shipped:

- `zh-Hans`
- `en`

Resolution (`requested tag → supported UI locale`) is deterministic and platform-aware (`Intl.getCanonicalLocales` / `Intl.Locale`):

```
exact match → language + script compatible → language-only → default en
```

Examples:

| Requested `lang` | Resolved | Notes |
|---|---|---|
| `zh-Hans` | `zh-Hans` | exact |
| `en` | `en` | exact |
| `en-GB` / `en-US` | `en` | language-only |
| `zh-CN` / `zh-SG` | `zh-Hans` | language-only (`zh` → `zh-Hans`) |
| `ZH-hans` / `EN-us` | `zh-Hans` / `en` | case canonicalized (`en-us` → `en-US`) |
| `zh-Hant` | `zh-Hans` | no `zh-Hant` UI yet, falls back to `zh-Hans` (not script conversion) |
| `ja` / `ko` / `de` / `fr` | `en` | unsupported → default |

Malformed or empty tags (e.g. `""`, `"not-a-tag-123"`, `"en-"`) are **gracefully handled**: they resolve to `en` and never throw during render. The single source of truth is `src/i18n/locale.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `resolveLocale`, `canonicalize`) and `src/i18n/messages.ts` (`messages["zh-Hans"]`, `messages["en"]`).

Future locales (`ja`, `ko`, `zh-Hant`, `fr`, `de`) can be added by extending the supported list and message catalog without changing the public `lang` type.

Zola mapping is outside this package: a Zola site's `cmn-Hans` should be mapped to `zh-Hans` (or another appropriate BCP 47 tag) by the integration, not passed blindly as `zh`.

## Methods (Preview: 1)

* `reload(): Promise<void>` — re-fetches current page (`controller.refresh()`). `setIdentity` etc. remain internal via `ClientContext`.

## Events (Preview: none promised)

`cumments:ready / cumments:error / cumments:change` are deferred to `1.0`.

## CSS

* **Parts:** `wrap, header, list, comment, meta, body, reactions, reaction, pagination, input, button, editor, error`
* **Custom properties:** `--cumments-primary, --cumments-border, --cumments-bg, --cumments-text`
* `Tailwind` does not enter the bundle; demo may use it.

## Lifecycle

`connectedCallback → CommentController(ensureIdentity → list → SseClient.connect)` → `disconnectedCallback → sse.close + clearPendingPoll + store off`. `updated(endpoint/siteId/pageSlug/perPage)` resets `page=1` and re-inits. `lang` changes trigger a re-render via `resolveLocale`.

## Browser Requirements

`ESM / Custom Elements / Shadow DOM / fetch(QUERY) / EventSource / Web Worker / WebCrypto Ed25519` in **secure context** (`https` / `localhost`). `Intl.Locale` / `Intl.getCanonicalLocales` required for canonicalization. `file://` is not a production target. `http://192.168.x.x` should use `localhost` or `https`.
