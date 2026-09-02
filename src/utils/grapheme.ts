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
  const seg = getSegmenter()
  let count = 0
  for (const _ of seg.segment(value)) count++
  return count
}
