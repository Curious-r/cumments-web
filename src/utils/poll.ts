import { pollCanonicalPayload } from "../identity/signing"
import { graphemeLength } from "./grapheme"

// biome-ignore lint/suspicious/noControlCharactersInRegex: poll validation must detect control characters per backend contract
const CONTROL_RE = /[\u0000-\u001F\u007F]/

export const POLL_QUESTION_MIN = 1
export const POLL_QUESTION_MAX = 500
export const POLL_OPTION_MIN = 1
export const POLL_OPTION_MAX = 200
export const POLL_OPTIONS_MIN_COUNT = 2
export const POLL_OPTIONS_MAX_COUNT = 20

export function hasControlChars(value: string): boolean {
  return CONTROL_RE.test(value)
}

export function validatePollQuestion(question: string): string | null {
  const trimmed = question.trim()
  if (!trimmed) return "Question is required"
  if (trimmed !== question) return "Question must not have leading or trailing whitespace"
  if (hasControlChars(question)) return "Question must not contain control characters"
  const len = graphemeLength(question)
  if (len < POLL_QUESTION_MIN || len > POLL_QUESTION_MAX) {
    if (len > POLL_QUESTION_MAX) return "Question is too long"
    return "Question is required"
  }
  return null
}

export function validatePollOption(option: string): string | null {
  const trimmed = option.trim()
  if (!trimmed) return "Option cannot be empty"
  if (trimmed !== option) return "Option must not have leading or trailing whitespace"
  if (hasControlChars(option)) return "Option must not contain control characters"
  const len = graphemeLength(option)
  if (len < POLL_OPTION_MIN || len > POLL_OPTION_MAX) {
    if (len > POLL_OPTION_MAX) return "Option is too long"
    return "Option cannot be empty"
  }
  return null
}

export interface PollValidationResult {
  questionError: string | null
  optionErrors: (string | null)[]
  generalError: string | null
}

export function validatePoll(question: string, options: string[]): PollValidationResult {
  const questionError = validatePollQuestion(question)
  const optionErrors = options.map((o) => validatePollOption(o))
  let generalError: string | null = null
  if (options.length < POLL_OPTIONS_MIN_COUNT) generalError = "At least 2 options required"
  else if (options.length > POLL_OPTIONS_MAX_COUNT) generalError = "Too many options"
  return { questionError, optionErrors, generalError }
}

export function isPollValid(question: string, options: string[]): boolean {
  const { questionError, optionErrors, generalError } = validatePoll(question, options)
  if (questionError) return false
  if (generalError) return false
  if (optionErrors.some((e) => e !== null)) return false
  return true
}

export { pollCanonicalPayload }
