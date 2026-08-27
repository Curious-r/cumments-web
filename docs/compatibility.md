# Compatibility

`cumments-web` tracks the **API contract**, not a `cumments` server tag.

```
cumments-web 0.x → Cumments API v1
```

| Backend | API | Snapshot | Verified |
|---|---|---|---|
| `0.28.1` | `v1` | `6eaa9b64` (`openapi: 3.2.0`) | `create/update/delete/list(QUERY+personalization)/reactions/pagination/identity/SSE reconnect` |

**Realtime semantics (Preview, frozen):** `SSE` is notification, `GET` is authoritative. A comment created during an `SSE` disconnect appears after the next `GET` (e.g. page change), not via `Last-Event-ID` replay. `seenIds` is `500 LRU` dedup only.

Additive `endpoint`/`field` additions remain `v1` compatible; breaking `endpoint/field/semantic` changes require a new API major.
