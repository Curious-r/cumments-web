/**
 * Lightweight Markdown formatting primitives for the Composer.
 *
 * These pure functions handle inline Markdown formatting operations
 * (bold, italic, strikethrough, code, link) on plain text with
 * selection/caret positions.
 *
 * All positions are UTF-16 offsets (matching DOM textarea selection).
 */

export type MarkdownFormat = "bold" | "italic" | "strikethrough" | "code" | "link"

export interface FormatResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

// Marker definitions for each format
const MARKERS: Record<Exclude<MarkdownFormat, "link">, { prefix: string; suffix: string }> = {
  bold: { prefix: "**", suffix: "**" },
  italic: { prefix: "*", suffix: "*" },
  strikethrough: { prefix: "~~", suffix: "~~" },
  code: { prefix: "`", suffix: "`" },
}

/**
 * Apply inline Markdown formatting to a selection in text.
 *
 * Behavior:
 * - If text is selected: wrap with format markers, keep selection on original text
 * - If no selection: insert paired markers with caret between them
 * - If selection is already wrapped with same markers: remove them (toggle off)
 *
 * @param text - The current text
 * @param selectionStart - Start of selection (UTF-16 offset)
 * @param selectionEnd - End of selection (UTF-16 offset)
 * @param format - The format to apply
 * @param linkUrl - URL required for link format
 * @returns The formatted text and new selection positions
 */
export function formatMarkdownSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: MarkdownFormat,
  linkUrl?: string,
): FormatResult {
  if (format === "link") {
    return formatLink(text, selectionStart, selectionEnd, linkUrl ?? "")
  }

  return formatInline(text, selectionStart, selectionEnd, format)
}

/**
 * Format link: [text](url)
 */
function formatLink(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  url: string,
): FormatResult {
  const hasSelection = selectionStart !== selectionEnd

  if (hasSelection) {
    // Check if already a link
    const toggleResult = tryToggleLink(text, selectionStart, selectionEnd)
    if (toggleResult) {
      return toggleResult
    }

    // Wrap selected text as link
    const selectedText = text.slice(selectionStart, selectionEnd)
    const newText = `${text.slice(0, selectionStart)}[${selectedText}](${url})${text.slice(selectionEnd)}`
    return {
      text: newText,
      selectionStart,
      selectionEnd,
    }
  }

  // No selection: insert empty link with caret inside brackets
  const insert = `[](${url})`
  const newText = text.slice(0, selectionStart) + insert + text.slice(selectionEnd)
  // Place caret inside the brackets
  const caretPos = selectionStart + 1
  return {
    text: newText,
    selectionStart: caretPos,
    selectionEnd: caretPos,
  }
}

/**
 * Try to toggle off an existing link. Returns null if not a link.
 */
function tryToggleLink(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): FormatResult | null {
  // Look for pattern: [selectedText](url)
  const before = text.slice(0, selectionStart)
  const after = text.slice(selectionEnd)

  if (!before.endsWith("[") || !after.startsWith("]")) {
    return null
  }

  // Find the closing paren after the ]
  const afterCloseBracket = after.slice(1)
  const parenIndex = afterCloseBracket.indexOf(")")
  if (parenIndex === -1 || !afterCloseBracket.startsWith("(")) {
    return null
  }

  // Extract the visible text (between [ and ])
  const visibleText = text.slice(selectionStart, selectionEnd)
  const newBefore = before.slice(0, -1) // Remove the [
  const newAfter = afterCloseBracket.slice(parenIndex + 1) // Remove ](url)

  // Adjust selection: the [ was removed from before, so shift left by 1
  const newStart = selectionStart - 1
  const newEnd = selectionEnd - 1

  return {
    text: newBefore + visibleText + newAfter,
    selectionStart: newStart,
    selectionEnd: newEnd,
  }
}

/**
 * Format inline markers: bold, italic, strikethrough, code
 */
function formatInline(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: Exclude<MarkdownFormat, "link">,
): FormatResult {
  const markers = MARKERS[format]
  const hasSelection = selectionStart !== selectionEnd

  if (hasSelection) {
    // Check if already wrapped with same markers (toggle off)
    const toggleResult = tryToggleInline(text, selectionStart, selectionEnd, format)
    if (toggleResult) {
      return toggleResult
    }

    // Wrap selected text with markers
    const selectedText = text.slice(selectionStart, selectionEnd)
    const newText =
      text.slice(0, selectionStart) +
      markers.prefix +
      selectedText +
      markers.suffix +
      text.slice(selectionEnd)
    return {
      text: newText,
      selectionStart,
      selectionEnd,
    }
  }

  // No selection: insert paired markers with caret between them
  const insert = markers.prefix + markers.suffix
  const newText = text.slice(0, selectionStart) + insert + text.slice(selectionEnd)
  // Place caret between the markers
  const caretPos = selectionStart + markers.prefix.length
  return {
    text: newText,
    selectionStart: caretPos,
    selectionEnd: caretPos,
  }
}

/**
 * Try to toggle off existing inline markers. Returns null if not wrapped.
 */
function tryToggleInline(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: Exclude<MarkdownFormat, "link">,
): FormatResult | null {
  const markers = MARKERS[format]
  const before = text.slice(0, selectionStart)
  const after = text.slice(selectionEnd)

  // Check if the text immediately before selection ends with prefix
  // and text immediately after selection starts with suffix
  if (!before.endsWith(markers.prefix) || !after.startsWith(markers.suffix)) {
    return null
  }

  // Remove the markers
  const newBefore = before.slice(0, -markers.prefix.length)
  const newAfter = after.slice(markers.suffix.length)

  return {
    text: newBefore + text.slice(selectionStart, selectionEnd) + newAfter,
    selectionStart: newBefore.length,
    selectionEnd: newBefore.length + (selectionEnd - selectionStart),
  }
}
