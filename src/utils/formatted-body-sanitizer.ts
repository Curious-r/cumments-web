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
 * Check if a URL is safe to preserve. Allows relative URLs and explicitly
 * safe schemes. Rejects javascript:, data:, vbscript:, and other
 * executable/custom schemes. Handles case-insensitive variants and
 * leading/trailing whitespace/control characters.
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  // Allow relative URLs (no scheme).
  if (!trimmed.includes(":")) return true
  // Extract scheme (everything before the first colon).
  const scheme = trimmed.slice(0, trimmed.indexOf(":") + 1)
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
  if (!allowed || !allowed.has(attrName)) return null
  // Validate URL-bearing attributes.
  if (attrName === "href" && !isSafeUrl(attrValue)) return null
  return attrValue
}

/**
 * Recursively sanitize a DOM node. Returns a sanitized Node, or null if the
 * node should be removed entirely.
 */
function sanitizeNode(node: Node): Node | null {
  // Text nodes are preserved as-is.
  if (node.nodeType === Node.TEXT_NODE) {
    return node.cloneNode(true)
  }
  // Only process element nodes.
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }
  const element = node as Element
  const tagName = element.tagName.toLowerCase()

  // Dangerous elements: remove entire subtree.
  if (DANGEROUS_ELEMENTS.has(tagName)) {
    return null
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
    return appendSanitizedChildren(clone, element)
  }

  // Unknown element: unwrap (preserve children/text, remove element wrapper).
  return unwrapChildren(element)
}

/**
 * Recursively append sanitized children to a target element.
 */
function appendSanitizedChildren(target: Element, source: Element): Element {
  for (const child of Array.from(source.childNodes)) {
    const sanitized = sanitizeNode(child)
    if (sanitized) {
      target.appendChild(sanitized)
    }
  }
  return target
}

/**
 * Unwrap an unknown element: return a document fragment containing its
 * sanitized children, or null if no children survive.
 */
function unwrapChildren(element: Element): DocumentFragment | null {
  const fragment = document.createDocumentFragment()
  for (const child of Array.from(element.childNodes)) {
    const sanitized = sanitizeNode(child)
    if (sanitized) {
      fragment.appendChild(sanitized)
    }
  }
  return fragment
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
    const sanitized = sanitizeNode(child)
    if (sanitized) {
      fragment.appendChild(sanitized)
    }
  }

  // Serialize the fragment back to HTML.
  const container = document.createElement("div")
  container.appendChild(fragment)
  return container.innerHTML
}
