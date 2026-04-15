export type EvaluateArticleRequest = {
  category_id: string
  url?: string
  article_id?: string
  instructions_override?: string
  persist?: boolean
  content_max_chars?: number
  timeout?: number
}

export type EvaluateArticleSuccessData = {
  ok: true
  included: boolean
  why: string
  url: string
  title: string
  date: string | null
  source: string
  short_summary: string | null
  full_summary: string | null
  persisted: boolean
  instruction_source: 'override' | 'category'
  persist_error?: string
}

export type EvaluateArticleOutcome =
  | { kind: 'success'; data: EvaluateArticleSuccessData }
  | { kind: 'business_error'; error: string; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'network'; message: string }

function readMessage(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined
  const m = (parsed as { message?: unknown }).message
  return typeof m === 'string' ? m : undefined
}

/** Base URL with no trailing slash, or null if unset. */
export function getPipelineApiBaseUrl(): string | null {
  const pipeline = import.meta.env.VITE_PIPELINE_API_BASE_URL
  if (typeof pipeline === 'string' && pipeline.trim()) return pipeline.trim().replace(/\/$/, '')

  const resolve = import.meta.env.VITE_RESOLVE_API_BASE_URL
  if (typeof resolve === 'string' && resolve.trim()) return resolve.trim().replace(/\/$/, '')

  return null
}

export async function postEvaluateArticle(
  baseUrl: string,
  payload: EvaluateArticleRequest,
  accessToken: string,
): Promise<EvaluateArticleOutcome> {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/pipeline/evaluate-article`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Pipeline server returned invalid JSON.',
      }
    }

    if (res.status === 401) {
      return {
        kind: 'unauthorized',
        message: readMessage(parsed) ?? 'Session expired or not authorized. Sign in again and retry.',
      }
    }

    if (!res.ok) {
      const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      if (body && body.ok === false) {
        const error = typeof body.error === 'string' ? body.error : 'request_error'
        const message = typeof body.message === 'string' ? body.message : `Pipeline request failed (${res.status}).`
        return { kind: 'business_error', error, message }
      }
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: readMessage(parsed) ?? `Pipeline request failed (${res.status}).`,
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Empty response from pipeline server.',
      }
    }

    const body = parsed as Record<string, unknown>
    if (body.ok !== true) {
      const error = typeof body.error === 'string' ? body.error : 'request_error'
      const message =
        typeof body.message === 'string'
          ? body.message
          : 'Could not evaluate this article against the category instructions.'
      return { kind: 'business_error', error, message }
    }

    const included = body.included
    const why = body.why
    const articleUrl = body.url
    const persisted = body.persisted
    const instructionSource = body.instruction_source
    if (
      typeof included !== 'boolean' ||
      typeof why !== 'string' ||
      typeof articleUrl !== 'string' ||
      typeof persisted !== 'boolean' ||
      (instructionSource !== 'override' && instructionSource !== 'category')
    ) {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Pipeline response missing required decision fields.',
      }
    }

    const data: EvaluateArticleSuccessData = {
      ok: true,
      included,
      why,
      url: articleUrl,
      title: typeof body.title === 'string' ? body.title : '',
      date: typeof body.date === 'string' ? body.date : null,
      source: typeof body.source === 'string' ? body.source : '',
      short_summary: typeof body.short_summary === 'string' ? body.short_summary : null,
      full_summary: typeof body.full_summary === 'string' ? body.full_summary : null,
      persisted,
      instruction_source: instructionSource,
      persist_error: typeof body.persist_error === 'string' ? body.persist_error : undefined,
    }

    return { kind: 'success', data }
  } catch (e) {
    return {
      kind: 'network',
      message: e instanceof Error ? e.message : 'Network error while contacting pipeline server.',
    }
  }
}
