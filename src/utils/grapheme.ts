let segmenter: Intl.Segmenter | undefined

function getSegmenter(): Intl.Segmenter {
  if (!segmenter) {
    segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  }
  return segmenter
}

/**
 * Count Unicode extended grapheme clusters in `value`.
 * Uses the browser-native `Intl.Segmenter` with `granularity: "grapheme"`
 * (UAX #29). The `Segmenter` instance is reused across calls.
 */
export function graphemeLength(value: string): number {
  // Fast path when Segmenter is available (Node >=16, modern browsers).
  // Fallback to spreading code points if the API is absent; this is not
  // fully correct for ZWJ/flag sequences but avoids crashing in legacy
  // environments. No polyfill is added unless the project's actual
  // compatibility baseline requires it.
  const seg =
    typeof Intl !== "undefined" &&
    typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter !== "undefined"
      ? getSegmenter()
      : null
  if (seg) {
    let count = 0
    for (const _ of seg.segment(value)) count++
    return count
  }
  return [...value].length
}
