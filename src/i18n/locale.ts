/**
 * BCP 47 locale resolver for Cumments Web.
 *
 * Public input: arbitrary BCP 47 tag (lang attribute)
 * Supported UI locales: zh-Hans, en
 * Resolved: one of the supported locales, deterministic fallback to en
 *
 * Layers:
 * - BCP 47 canonicalization (platform APIs)
 * - Exact match
 * - Explicit Cumments alias (application policy)
 * - Standard language fallback (e.g. en-GB -> en)
 * - Default
 */

export const SUPPORTED_LOCALES = ["zh-Hans", "en"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = "en"

/**
 * Explicit Cumments locale aliases.
 * This is application policy, not BCP 47 equivalence.
 * e.g. cmn-Hans (Mandarin, Simplified) resolves to the single
 * Simplified Chinese catalog zh-Hans.
 */
const ALIASES: Record<string, SupportedLocale> = {
  // Mandarin
  cmn: "zh-Hans",
  "cmn-Hans": "zh-Hans",
  // Chinese generic / region variants that should use Simplified catalog
  zh: "zh-Hans",
  "zh-CN": "zh-Hans",
  "zh-SG": "zh-Hans",
  // English region variants
  "en-US": "en",
  "en-GB": "en",
}

/**
 * Canonicalize a BCP 47 tag using platform APIs.
 * Returns null for syntactically invalid tags.
 * Must not change language meaning (cmn-Hans stays cmn-Hans, not zh-Hans).
 */
export function canonicalize(tag: string): string | null {
  const trimmed = tag.trim()
  if (!trimmed) return null
  // Preserve extlang cmn as distinct language; platform would map cmn -> zh
  const lowerLang = trimmed.split("-")[0]?.toLowerCase()
  if (lowerLang === "cmn") {
    // Manual case canonicalization for cmn variants to avoid zh mapping
    const parts = trimmed.split("-")
    const lang = parts[0]?.toLowerCase() ?? ""
    const rest = parts.slice(1).map((p) => {
      if (p.length === 4) return p[0]?.toUpperCase() + p.slice(1).toLowerCase() // script
      if (p.length === 2) return p.toUpperCase() // region
      return p.toLowerCase()
    })
    const candidate = [lang, ...rest].join("-")
    // Validate still via Intl.Locale with try but bypass mapping
    try {
      // Use a dummy that doesn't map cmn? Just validate syntax via regex-ish
      // If candidate is syntactically invalid, Intl.Locale will throw
      new Intl.Locale(candidate)
      return candidate
    } catch {
      return null
    }
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed)
    if (canonical) return canonical
  } catch {
    // fall through
  }
  try {
    return new Intl.Locale(trimmed).toString()
  } catch {
    return null
  }
}

function parseLocale(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(tag)
  } catch {
    return null
  }
}

/**
 * Resolve a requested BCP 47 tag to a supported UI locale.
 *
 * Priority:
 * 1. Validate + canonicalize
 * 2. Exact supported-locale match
 * 3. Explicit Cumments alias
 * 4. Standard language fallback (currently: any en-* -> en)
 * 5. Default (en)
 *
 * Graceful for embeddable Web Component: malformed/empty input falls back,
 * never throws during render.
 */
export function resolveLocale(requested: string | null | undefined): SupportedLocale {
  if (!requested || typeof requested !== "string") return DEFAULT_LOCALE
  const trimmed = requested.trim()
  if (!trimmed) return DEFAULT_LOCALE

  const canonical = canonicalize(trimmed)
  if (!canonical) return DEFAULT_LOCALE

  // 2. Exact
  for (const sup of SUPPORTED_LOCALES) {
    if (canonical === sup) return sup
    const supCanon = canonicalize(sup)
    if (supCanon && canonical === supCanon) return sup
  }

  // 3. Explicit alias (canonical form)
  const aliased = ALIASES[canonical]
  if (aliased) return aliased

  const reqLocale = parseLocale(canonical)
  if (!reqLocale) return DEFAULT_LOCALE

  // 4. Standard language fallback
  // Deterministic, not dependent on SUPPORTED_LOCALES order.
  // Only en-* is generically fallback to en; do not map arbitrary Hans script to zh-Hans
  const lang = reqLocale.language?.toLowerCase()
  if (lang === "en") {
    return "en"
  }
  // No generic zh fallback here; zh variants are handled via explicit ALIASES.
  // This ensures zh-Hant -> default, not zh-Hans, and yue-Hans etc do not auto-map.

  // 5. Default
  return DEFAULT_LOCALE
}

/** Convenience: check if a tag is syntactically valid BCP 47 */
export function isValidBCP47(tag: string): boolean {
  return canonicalize(tag) !== null
}
