/**
 * Sanitizer for Matrix/Cumments `formatted_body` HTML content.
 *
 * Matrix formatted_body follows `org.matrix.custom.html` conventions, but it
 * is event-derived input and must not be inserted into the DOM without
 * sanitization. This sanitizer is intentionally narrower than arbitrary Matrix
 * HTML: it retains only common text-formatting elements and removes everything
 * else, including interactive/embed content and dangerous URL schemes.
 *
 * The output is intended for safe DOM rendering via Lit's `unsafeHTML`
 * directive (or equivalent) after sanitization.
 */

// Elements explicitly allowed in the output. This is intentionally a small
// subset of what Matrix permits, focused on common formatted text.
const ALLOWED_ELEMENTS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "del",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
])

// Dangerous container elements whose entire subtree must be removed.
const DANGEROUS_ELEMENTS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "svg",
  "math",
  "canvas",
  "video",
  "audio",
  "input",
  "button",
  "textarea",
  "select",
])

// Attributes allowed per element. Only attributes required by the allowed
// elements are permitted.
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href"]),
}

// URL schemes considered safe for a[href].
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:"])

// Regex to detect event-handler attributes (onclick, onerror, etc.).
const EVENT_HANDLER_ATTR = /^on/i

/**
 * Check if a URL is safe to preserve.
 *
 * Allowed:
 * - Fragment URLs (#section)
 * - http:, https:, mailto: schemes
 * - Relative URLs (e.g. /path, path/to/resource)
 *
 * Rejected:
 * - javascript:, data:, vbscript:, and other executable schemes
 * - Protocol-relative URLs (//example.com) are rejected because they
 *   inherit the page scheme and can lead to unexpected external content
 *
 * Handles case-insensitive variants and leading/trailing whitespace/control
 * characters around the scheme.
 */
function stripDangerousChars(url: string): string {
  // Remove leading/trailing whitespace and control characters.
  let start = 0
  let end = url.length
  while (start < end && isWhitespaceOrControl(url[start])) start++
  while (end > start && isWhitespaceOrControl(url[end - 1])) end--
  return url.slice(start, end)
}

function isWhitespaceOrControl(char: string): boolean {
  const code = char.charCodeAt(0)
  return code <= 0x20 || code === 0x7f
}

function isSafeUrl(url: string): boolean {
  const cleaned = stripDangerousChars(url).toLowerCase()

  // Fragment-only URLs are safe.
  if (cleaned.startsWith("#")) return true

  // Reject protocol-relative URLs (//example.com).
  if (cleaned.startsWith("//")) return false

  // Extract scheme (everything before the first colon).
  const colonIndex = cleaned.indexOf(":")
  if (colonIndex === -1) {
    // No colon means relative URL (e.g. /path or path/to/resource).
    return true
  }

  const scheme = cleaned.slice(0, colonIndex + 1)
  return SAFE_URL_SCHEMES.has(scheme)
}

/**
 * Sanitize a single attribute. Returns the attribute value if it should be
 * kept, or null if it should be removed.
 */
function sanitizeAttribute(
  elementName: string,
  attrName: string,
  attrValue: string,
): string | null {
  // Remove event-handler attributes.
  if (EVENT_HANDLER_ATTR.test(attrName)) return null
  // Remove style attributes.
  if (attrName === "style") return null
  // Only allow attributes in the allowlist for this element.
  const allowed = ALLOWED_ATTRIBUTES[elementName]
  if (!allowed?.has(attrName)) return null
  // Validate URL-bearing attributes.
  if (attrName === "href" && !isSafeUrl(attrValue)) return null
  return attrValue
}

/**
 * Recursively sanitize the children of an element, returning a flat list of
 * sanitized nodes. This allows unknown elements to be unwrapped into multiple
 * sibling nodes while dangerous elements produce an empty list (subtree
 * removal).
 */
function sanitizeChildren(parent: Element): Node[] {
  const result: Node[] = []
  for (const child of Array.from(parent.childNodes)) {
    const nodes = sanitizeNode(child)
    result.push(...nodes)
  }
  return result
}

/**
 * Recursively sanitize a DOM node. Returns a list of sanitized nodes:
 * - Text nodes: returned as a single-element list
 * - Allowed elements: returned as a single-element list with sanitized
 *   attributes and recursively sanitized children
 * - Dangerous elements: returned as an empty list (subtree removed)
 * - Unknown elements: returned as a list of sanitized children (unwrapped)
 */
function sanitizeNode(node: Node): Node[] {
  // Text nodes are preserved as-is.
  if (node.nodeType === Node.TEXT_NODE) {
    return [node.cloneNode(true)]
  }
  // Only process element nodes.
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return []
  }
  const element = node as Element
  const tagName = element.tagName.toLowerCase()

  // Dangerous elements: remove entire subtree.
  if (DANGEROUS_ELEMENTS.has(tagName)) {
    return []
  }

  // Allowed element: clone with sanitized attributes and recurse on children.
  if (ALLOWED_ELEMENTS.has(tagName)) {
    const clone = document.createElement(tagName)
    for (const attr of Array.from(element.attributes)) {
      const value = sanitizeAttribute(tagName, attr.name, attr.value)
      if (value !== null) {
        clone.setAttribute(attr.name, value)
      }
    }
    for (const child of sanitizeChildren(element)) {
      clone.appendChild(child)
    }
    return [clone]
  }

  // Unknown element: unwrap (preserve children/text, remove element wrapper).
  return sanitizeChildren(element)
}

/**
 * Sanitize Matrix/Cumments `formatted_body` HTML for safe DOM rendering.
 *
 * Parses the HTML into an inert DOM, walks the tree retaining only allowed
 * elements/attributes, and returns sanitized HTML. Dangerous elements are
 * removed entirely; unknown elements are unwrapped while preserving text.
 *
 * @param html - The raw HTML string to sanitize
 * @returns Sanitized HTML string, or empty string for null/empty input
 */
export function sanitizeFormattedBody(html: string): string {
  if (!html) return ""

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const fragment = document.createDocumentFragment()
  for (const child of Array.from(doc.body.childNodes)) {
    for (const sanitized of sanitizeNode(child)) {
      fragment.appendChild(sanitized)
    }
  }

  // Serialize the fragment back to HTML.
  const container = document.createElement("div")
  container.appendChild(fragment)
  return container.innerHTML
}
