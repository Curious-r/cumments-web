/**
 * The single anonymous fallback for display presentation.
 *
 * The backend may legitimately return an empty or whitespace-only display
 * name (a guest who never set one). Every presentation surface must treat
 * that the same as a missing name, otherwise an empty string reaches the
 * avatar initial and renders as "?" instead of "A".
 */
export const ANONYMOUS_DISPLAY_NAME = "Anonymous"

/**
 * Normalize a raw display name for presentation:
 *
 *   null / undefined / "" / "   " -> "Anonymous"
 *   " Alice "                     -> "Alice"
 *
 * This is presentation/state only. Submission normalization lives in
 * `AppRuntime.handleEditorSubmit`, which owns the value sent to the API.
 */
export function normalizeDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : ANONYMOUS_DISPLAY_NAME
}
