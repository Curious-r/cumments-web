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

/**
 * First extended grapheme cluster of `value`, or "" when there is none.
 * Splitting by grapheme (not UTF-16 code unit) keeps multibyte/Unicode names
 * intact — an initial derived from a surrogate pair or a combining sequence
 * would otherwise render as a broken character.
 */
export function firstGrapheme(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const seg = getSegmenter()
  for (const part of seg.segment(trimmed)) return part.segment
  return ""
}
