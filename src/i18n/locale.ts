/**
 * BCP 47 locale resolver for Cumments Web.
 *
 * Public input: arbitrary BCP 47 tag (lang attribute)
 * Supported UI locales: zh-Hans, en
 * Resolved: one of the supported locales, deterministic fallback to en
 */

export const SUPPORTED_LOCALES = ["zh-Hans", "en"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = "en"

/**
 * Canonicalize a BCP 47 tag using platform APIs.
 * Returns null for syntactically invalid tags.
 */
export function canonicalize(tag: string): string | null {
  const trimmed = tag.trim()
  if (!trimmed) return null
  try {
    // Intl.getCanonicalLocales both validates and canonicalizes casing
    // EN -> en, en-us -> en-US, ZH-hans -> zh-Hans
    const [canonical] = Intl.getCanonicalLocales(trimmed)
    if (canonical) return canonical
  } catch {
    // fall through to Locale attempt
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
 * Algorithm:
 * 1. exact match (canonical === supported)
 * 2. language + script compatible match (e.g. requested zh-Hans vs supported zh-Hans)
 * 3. language-only match (e.g. en-GB -> en, zh-CN -> zh-Hans, zh -> zh-Hans)
 * 4. fallback to DEFAULT_LOCALE (en)
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

  // 1. exact
  for (const sup of SUPPORTED_LOCALES) {
    if (canonical === sup) return sup
    // also check canonicalized supported to be safe (en stays en, zh-Hans stays zh-Hans)
    const supCanon = canonicalize(sup)
    if (supCanon && canonical === supCanon) return sup
  }

  const reqLocale = parseLocale(canonical)
  if (!reqLocale) return DEFAULT_LOCALE

  // 2. language + script compatible
  // e.g. requested zh-Hans-CN could match zh-Hans
  for (const sup of SUPPORTED_LOCALES) {
    const supLocale = parseLocale(sup)
    if (!supLocale) continue
    // Both have script, compare language+script
    if (
      reqLocale.language &&
      supLocale.language &&
      reqLocale.language.toLowerCase() === supLocale.language.toLowerCase()
    ) {
      const reqScript = (reqLocale as unknown as { script?: string }).script
      const supScript = (supLocale as unknown as { script?: string }).script
      if (reqScript && supScript && reqScript.toLowerCase() === supScript.toLowerCase()) {
        // script compatible, optionally region ignored
        return sup
      }
    }
  }

  // 3. language-only
  const reqLang = reqLocale.language?.toLowerCase()
  if (reqLang) {
    for (const sup of SUPPORTED_LOCALES) {
      const supLocale = parseLocale(sup)
      if (supLocale?.language.toLowerCase() === reqLang) {
        return sup
      }
    }
    // also handle legacy "zh" -> zh-Hans via language-only (already covered, but explicit)
    // Already covered above because sup zh-Hans language is zh
  }

  // 4. fallback
  return DEFAULT_LOCALE
}

/** Convenience: check if a tag is syntactically valid BCP 47 */
export function isValidBCP47(tag: string): boolean {
  return canonicalize(tag) !== null
}
