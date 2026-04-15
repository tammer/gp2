/**
 * First non-empty Vite env value among `keys`, trimmed with no trailing slash.
 * Used for API base URL resolution (see VITE_API_BASE_URL and service-specific overrides).
 */
export function firstViteBaseUrl(...keys: string[]): string | null {
  const env = import.meta.env as Record<string, string | undefined>
  for (const key of keys) {
    const raw = env[key]
    if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/$/, '')
  }
  return null
}
