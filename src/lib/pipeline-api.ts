import { firstViteBaseUrl } from '@/lib/vite-env-base-url'

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
  return firstViteBaseUrl(
    'VITE_PIPELINE_API_BASE_URL',
    'VITE_RESOLVE_API_BASE_URL',
    'VITE_API_BASE_URL',
  )
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

// --- Pipeline run (async job + poll) — POST /api/pipeline/run, GET /api/pipeline/run/<job_id>

export type PipelineRunRequest = {
  category?: string | null
  source?: string | null
  max_articles?: number
  timeout?: number
  content_max_chars?: number
  reprocess?: boolean
}

export type PipelineJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type PipelineRunPollParams = {
  user_id: string
  category: string | null
  source: string | null
  max_articles: number
  timeout: number
  content_max_chars: number
  reprocess: boolean
}

/** One row per processed URL when status === succeeded (API-safe; no raw HTML). */
export type PipelineArticleDecision = {
  url: string
  source: string
  title: string | null
  date: string | null
  short_summary: string | null
  full_summary: string | null
  included: boolean
  reason: string | null
}

export type PipelineRunPollBody = {
  ok: true
  job_id: string
  status: PipelineJobStatus
  started_at: string | null
  finished_at: string | null
  params: PipelineRunPollParams
  result: PipelineArticleDecision[] | null
  error: string | null
}

export type PostPipelineRunOutcome =
  | { kind: 'success'; jobId: string }
  | { kind: 'aborted' }
  | { kind: 'business_error'; error: string; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'network'; message: string }

export type GetPipelineRunOutcome =
  | { kind: 'success'; body: PipelineRunPollBody }
  | { kind: 'aborted' }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'network'; message: string }

export type PollPipelineRunOutcome =
  | { kind: 'success'; result: PipelineArticleDecision[] }
  | { kind: 'failed'; error: string }
  | { kind: 'aborted' }
  | { kind: 'business_error'; error: string; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'bad_response'; httpStatus: number; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'network'; message: string }

export type PollPipelineRunOptions = {
  signal?: AbortSignal
  onRunAccepted?: () => void
  onRunSettled?: () => void
  /** Called after each poll while the job is still `queued` or `running` (before the wait backoff). */
  onWaitingPoll?: (status: Extract<PipelineJobStatus, 'queued' | 'running'>) => void
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

function parsePipelinePollBody(parsed: unknown): PipelineRunPollBody | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (o.ok !== true) return null
  const jobId = o.job_id
  const status = o.status
  if (typeof jobId !== 'string' || typeof status !== 'string') return null
  if (status !== 'queued' && status !== 'running' && status !== 'succeeded' && status !== 'failed') return null
  const params = o.params
  if (!params || typeof params !== 'object') return null
  const p = params as Record<string, unknown>
  if (
    typeof p.user_id !== 'string' ||
    (p.category !== null && typeof p.category !== 'string') ||
    (p.source !== null && typeof p.source !== 'string') ||
    typeof p.max_articles !== 'number' ||
    typeof p.timeout !== 'number' ||
    typeof p.content_max_chars !== 'number' ||
    typeof p.reprocess !== 'boolean'
  ) {
    return null
  }
  return {
    ok: true,
    job_id: jobId,
    status: status as PipelineJobStatus,
    started_at: typeof o.started_at === 'string' ? o.started_at : null,
    finished_at: typeof o.finished_at === 'string' ? o.finished_at : null,
    params: {
      user_id: p.user_id,
      category: p.category === null ? null : (p.category as string),
      source: p.source === null ? null : (p.source as string),
      max_articles: p.max_articles,
      timeout: p.timeout,
      content_max_chars: p.content_max_chars,
      reprocess: p.reprocess,
    },
    result: Array.isArray(o.result)
      ? (o.result as PipelineArticleDecision[])
      : o.result === null || o.result === undefined
        ? null
        : null,
    error: typeof o.error === 'string' ? o.error : o.error === null || o.error === undefined ? null : null,
  }
}

/** Start a background pipeline run; returns job_id for polling. */
export async function postPipelineRun(
  baseUrl: string,
  accessToken: string,
  payload: PipelineRunRequest,
  signal?: AbortSignal,
): Promise<PostPipelineRunOutcome> {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/pipeline/run`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
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

    if (res.status === 202) {
      if (!parsed || typeof parsed !== 'object') {
        return {
          kind: 'bad_response',
          httpStatus: res.status,
          message: 'Empty response from pipeline server.',
        }
      }
      const body = parsed as Record<string, unknown>
      if (body.ok === true && typeof body.job_id === 'string') {
        return { kind: 'success', jobId: body.job_id }
      }
      const error = typeof body.error === 'string' ? body.error : 'request_error'
      const message =
        typeof body.message === 'string' ? body.message : 'Could not start pipeline run.'
      return { kind: 'business_error', error, message }
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

    return {
      kind: 'bad_response',
      httpStatus: res.status,
      message: readMessage(parsed) ?? `Unexpected status ${res.status} from pipeline run.`,
    }
  } catch (e) {
    if (isAbortError(e)) {
      return { kind: 'aborted' }
    }
    return {
      kind: 'network',
      message: e instanceof Error ? e.message : 'Network error while contacting pipeline server.',
    }
  }
}

/** Poll a single job status (one GET). */
export async function getPipelineRun(
  baseUrl: string,
  accessToken: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<GetPipelineRunOutcome> {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/pipeline/run/${encodeURIComponent(jobId)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
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

    if (res.status === 403) {
      const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      return {
        kind: 'forbidden',
        message:
          (body && typeof body.message === 'string' ? body.message : null) ??
          'Not allowed to view this job.',
      }
    }

    if (res.status === 404) {
      return {
        kind: 'not_found',
        message:
          readMessage(parsed) ??
          'Job not found. It may have expired after a server restart, or the job id is invalid.',
      }
    }

    if (!res.ok) {
      const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      if (body && body.ok === false) {
        const message = typeof body.message === 'string' ? body.message : `Pipeline request failed (${res.status}).`
        return { kind: 'bad_response', httpStatus: res.status, message }
      }
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: readMessage(parsed) ?? `Pipeline request failed (${res.status}).`,
      }
    }

    const body = parsePipelinePollBody(parsed)
    if (!body) {
      return {
        kind: 'bad_response',
        httpStatus: res.status,
        message: 'Pipeline poll response missing required fields.',
      }
    }

    return { kind: 'success', body }
  } catch (e) {
    if (isAbortError(e)) {
      return { kind: 'aborted' }
    }
    return {
      kind: 'network',
      message: e instanceof Error ? e.message : 'Network error while contacting pipeline server.',
    }
  }
}

const POLL_INITIAL_MS = 1500
const POLL_MAX_MS = 25000
const POLL_BACKOFF = 1.35

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      window.clearTimeout(id)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const id = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort)
  })
}

/** Poll `GET /api/pipeline/run/<job_id>` until succeeded, failed, or non-recoverable outcome. */
export async function pollPipelineJobUntilTerminal(
  baseUrl: string,
  accessToken: string,
  jobId: string,
  signal?: AbortSignal,
  onWaitingPoll?: (status: Extract<PipelineJobStatus, 'queued' | 'running'>) => void,
): Promise<PollPipelineRunOutcome> {
  let waitMs = POLL_INITIAL_MS
  for (;;) {
    if (signal?.aborted) {
      return { kind: 'aborted' }
    }

    const poll = await getPipelineRun(baseUrl, accessToken, jobId, signal)
    if (poll.kind === 'aborted') {
      return { kind: 'aborted' }
    }
    if (poll.kind !== 'success') {
      return poll
    }

    const { status, result, error } = poll.body
    if (status === 'succeeded') {
      return { kind: 'success', result: Array.isArray(result) ? result : [] }
    }
    if (status === 'failed') {
      return {
        kind: 'failed',
        error: typeof error === 'string' && error.trim() ? error : 'Pipeline run failed.',
      }
    }

    onWaitingPoll?.(status)

    try {
      await delay(waitMs, signal)
    } catch (e) {
      if (isAbortError(e)) return { kind: 'aborted' }
      throw e
    }

    waitMs = Math.min(Math.round(waitMs * POLL_BACKOFF), POLL_MAX_MS)
  }
}

/**
 * POST /api/pipeline/run then poll until succeeded, failed, or error.
 * Pass `options.signal` to cancel when the user leaves the page or changes category.
 */
export async function pollPipelineRun(
  baseUrl: string,
  accessToken: string,
  request: PipelineRunRequest,
  options?: PollPipelineRunOptions,
): Promise<PollPipelineRunOutcome> {
  const signal = options?.signal
  const start = await postPipelineRun(baseUrl, accessToken, request, signal)
  if (start.kind === 'aborted') {
    return { kind: 'aborted' }
  }
  if (start.kind !== 'success') {
    return start
  }

  options?.onRunAccepted?.()
  try {
    return await pollPipelineJobUntilTerminal(baseUrl, accessToken, start.jobId, signal, options?.onWaitingPoll)
  } finally {
    options?.onRunSettled?.()
  }
}
