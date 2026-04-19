/**
 * `sessionStorage` key used with value `"1"` after `SIGNED_IN` so Home can redirect
 * to Settings and offer bundled filter import when the user has zero categories.
 * Cleared when categories exist, after import success, or when the user declines.
 */
export const TAMMER_IMPORT_PROMPT_SESSION_KEY = 'gistprism_prompt_tammer_import'

export function setTammerImportPromptPending(): void {
  try {
    sessionStorage.setItem(TAMMER_IMPORT_PROMPT_SESSION_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTammerImportPromptPending(): void {
  try {
    sessionStorage.removeItem(TAMMER_IMPORT_PROMPT_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function isTammerImportPromptPending(): boolean {
  try {
    return sessionStorage.getItem(TAMMER_IMPORT_PROMPT_SESSION_KEY) === '1'
  } catch {
    return false
  }
}
