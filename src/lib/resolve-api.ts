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

/** Portable catalog for POST /api/user/sources/import (see news_manager.user_sources_catalog). */
export type UserSourcesImportCatalog = {
  schema_version?: number
  categories: Array<{
    category: string
    instruction?: string
    sources: Array<{ url: string; use_rss: boolean }>
  }>
}

export type UserSourcesImportSummary = {
  categories_created: number
  categories_reused: number
  sources_inserted: number
  sources_skipped: number
}

export type UserSourcesImportOutcome =
  | { kind: 'success'; summary: UserSourcesImportSummary }
  | { kind: 'business_error'; error: string; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'network'; message: string }

export async function postUserSourcesImport(
  baseUrl: string,
  catalog: UserSourcesImportCatalog,
  accessToken: string,
): Promise<UserSourcesImportOutcome> {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/user/sources/import`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(catalog),
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
      const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      if (body && body.ok === false) {
        const error = typeof body.error === 'string' ? body.error : 'import_failed'
        const message =
          typeof body.message === 'string' ? body.message : `Import failed (${res.status}).`
        return { kind: 'business_error', error, message }
      }
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: readMessage(parsed) ?? `Import request failed (${res.status}).`,
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
      const error = typeof body.error === 'string' ? body.error : 'import_failed'
      const message = typeof body.message === 'string' ? body.message : 'Import was rejected.'
      return { kind: 'business_error', error, message }
    }

    const summaryRaw = body.summary
    if (!summaryRaw || typeof summaryRaw !== 'object') {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Import response missing summary.',
      }
    }
    const s = summaryRaw as Record<string, unknown>
    const summary: UserSourcesImportSummary = {
      categories_created: typeof s.categories_created === 'number' ? s.categories_created : 0,
      categories_reused: typeof s.categories_reused === 'number' ? s.categories_reused : 0,
      sources_inserted: typeof s.sources_inserted === 'number' ? s.sources_inserted : 0,
      sources_skipped: typeof s.sources_skipped === 'number' ? s.sources_skipped : 0,
    }

    return { kind: 'success', summary }
  } catch (e) {
    return {
      kind: 'network',
      message: e instanceof Error ? e.message : 'Network error while contacting resolve server.',
    }
  }
}
