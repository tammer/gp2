import { firstViteBaseUrl } from '@/lib/vite-env-base-url'

/** Base URL with no trailing slash, or null if unset. */
export function getResolveApiBaseUrl(): string | null {
  return firstViteBaseUrl('VITE_RESOLVE_API_BASE_URL', 'VITE_API_BASE_URL')
}

export type ResolveSuccessData = {
  website_title: string
  homepage_url: string
  resolved_url: string
  use_rss: boolean
  rss_found: boolean
  confidence: string
  notes: string
}

export type ResolveSourceOutcome =
  | { kind: 'success'; data: ResolveSuccessData }
  | { kind: 'business_error'; error: string; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'network'; message: string }

function readMessage(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined
  const m = (parsed as { message?: unknown }).message
  return typeof m === 'string' ? m : undefined
}

export async function postResolveSource(
  baseUrl: string,
  query: string,
  accessToken: string,
): Promise<ResolveSourceOutcome> {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/sources/resolve`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: query.trim(), max_results: 10 }),
    })

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Resolve server returned invalid JSON.',
      }
    }

    if (res.status === 401) {
      return {
        kind: 'unauthorized',
        message:
          readMessage(parsed) ??
          'Session expired or not authorized. Sign in again and retry.',
      }
    }

    if (!res.ok) {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: readMessage(parsed) ?? `Resolve request failed (${res.status}).`,
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Empty response from resolve server.',
      }
    }

    const body = parsed as Record<string, unknown>
    if (body.ok !== true) {
      const error = typeof body.error === 'string' ? body.error : 'no_results'
      const message =
        typeof body.message === 'string' ? body.message : 'Could not resolve this source.'
      return { kind: 'business_error', error, message }
    }

    const resolved_url = body.resolved_url
    const use_rss = body.use_rss
    if (typeof resolved_url !== 'string' || typeof use_rss !== 'boolean') {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Resolve response missing resolved_url or use_rss.',
      }
    }

    const data: ResolveSuccessData = {
      website_title: typeof body.website_title === 'string' ? body.website_title : '',
      homepage_url: typeof body.homepage_url === 'string' ? body.homepage_url : '',
      resolved_url,
      use_rss,
      rss_found: typeof body.rss_found === 'boolean' ? body.rss_found : false,
      confidence: typeof body.confidence === 'string' ? body.confidence : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
    }

    return { kind: 'success', data }
  } catch (e) {
    return {
      kind: 'network',
      message: e instanceof Error ? e.message : 'Network error while contacting resolve server.',
    }
  }
}
