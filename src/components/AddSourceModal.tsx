import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import {
  getResolveApiBaseUrl,
  postPipelineRun,
  postResolveSource,
  type ResolveFailureDetails,
  type ResolveSuccessData,
} from '@/lib/resolve-api'
import { supabase } from '@/lib/supabase'

const RESOLVE_FAILURE_SUFFIX =
  'Message me if this site should work. (I basically vibe coded this thing.)'

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function resolveFailureContextLine(d: ResolveFailureDetails): string | null {
  const parts: string[] = []
  if (d.stage) parts.push(`stage: ${d.stage}`)
  if (d.status_code !== undefined) parts.push(`HTTP ${d.status_code}`)
  if (d.final_url && d.final_url !== d.url) parts.push(`final: ${d.final_url}`)
  else if (d.final_url) parts.push(d.final_url)
  else if (d.url) parts.push(d.url)
  if (d.bytes_read !== undefined) parts.push(`${d.bytes_read} bytes`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export type AddSourceModalProps = {
  open: boolean
  onClose: () => void
  /** `null` = uncategorized */
  categoryId: string | null
  categoryLabel: string
  userId: string
  getAccessToken: () => Promise<string | null>
  onSuccess: () => void
}

type Step = 'query' | 'review'

export function AddSourceModal({
  open,
  onClose,
  categoryId,
  categoryLabel,
  userId,
  getAccessToken,
  onSuccess,
}: AddSourceModalProps) {
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [step, setStep] = useState<Step>('query')
  const [query, setQuery] = useState('')
  const [reviewUrl, setReviewUrl] = useState('')
  const [reviewUseRss, setReviewUseRss] = useState(false)
  const [meta, setMeta] = useState<ResolveSuccessData | null>(null)

  const [resolveBusy, setResolveBusy] = useState(false)
  const [resolveFailure, setResolveFailure] = useState<{
    message: string
    unauthorized: boolean
    details?: ResolveFailureDetails
  } | null>(null)

  const [insertBusy, setInsertBusy] = useState(false)
  const [insertError, setInsertError] = useState<string | null>(null)

  const baseUrl = getResolveApiBaseUrl()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      if (!d.open) d.showModal()
    } else if (d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    setStep('query')
    setQuery('')
    setReviewUrl('')
    setReviewUseRss(false)
    setMeta(null)
    setResolveBusy(false)
    setResolveFailure(null)
    setInsertBusy(false)
    setInsertError(null)
  }, [open])

  function handleDialogClose() {
    onClose()
  }

  function closeModal() {
    dialogRef.current?.close()
  }

  async function onResolve(e: FormEvent) {
    e.preventDefault()
    setResolveFailure(null)
    const q = query.trim()
    if (!q) {
      setResolveFailure({ message: 'Enter a URL or site name.', unauthorized: false })
      return
    }
    if (!baseUrl) {
      setResolveFailure({
        message:
          'Resolve API URL is not configured (set VITE_API_BASE_URL or VITE_RESOLVE_API_BASE_URL).',
        unauthorized: false,
      })
      return
    }
    const token = await getAccessToken()
    if (!token) {
      setResolveFailure({ message: 'No session token. Sign in again.', unauthorized: true })
      return
    }
    setResolveBusy(true)
    const outcome = await postResolveSource(baseUrl, q, token)
    setResolveBusy(false)

    const withResolveFailureNote = (message: string) =>
      message.trimEnd().endsWith(RESOLVE_FAILURE_SUFFIX) ? message : `${message.trimEnd()} ${RESOLVE_FAILURE_SUFFIX}`

    switch (outcome.kind) {
      case 'success':
        setMeta(outcome.data)
        setReviewUrl(outcome.data.resolved_url)
        setReviewUseRss(outcome.data.use_rss)
        setStep('review')
        setInsertError(null)
        return
      case 'unauthorized':
        setResolveFailure({ message: outcome.message, unauthorized: true })
        return
      case 'business_error':
        setResolveFailure({
          message: withResolveFailureNote(`${outcome.message} (${outcome.error})`),
          unauthorized: false,
          details: outcome.details,
        })
        return
      case 'bad_response':
        setResolveFailure({
          message: withResolveFailureNote(outcome.message),
          unauthorized: false,
          details: outcome.details,
        })
        return
      case 'network':
        setResolveFailure({
          message: withResolveFailureNote(outcome.message),
          unauthorized: false,
        })
        return
      default:
        setResolveFailure({
          message: withResolveFailureNote('Unexpected resolve error.'),
          unauthorized: false,
        })
    }
  }

  async function onInsert(e: FormEvent) {
    e.preventDefault()
    setInsertError(null)
    const u = reviewUrl.trim()
    if (!u) {
      setInsertError('URL is required.')
      return
    }
    if (!isProbablyUrl(u)) {
      setInsertError('Enter a valid http(s) URL.')
      return
    }
    if (!supabase) return
    setInsertBusy(true)
    const { data: inserted, error: err } = await supabase
      .from('sources')
      .insert({
        user_id: userId,
        url: u,
        use_rss: reviewUseRss,
        category_id: categoryId,
      })
      .select('id')
      .single()
    setInsertBusy(false)
    if (err) {
      setInsertError(err.message)
      return
    }
    const newId =
      inserted && typeof inserted === 'object' && 'id' in inserted && typeof inserted.id === 'string'
        ? inserted.id
        : ''
    if (newId && baseUrl) {
      const t = await getAccessToken()
      if (t) {
        void (async () => {
          const o = await postPipelineRun(baseUrl, { source: newId }, t)
          if (o.kind !== 'success') {
            console.error('postPipelineRun failed', o)
            return
          }
          notifyRunAccepted()
          try {
            await pollPipelineJobUntilTerminal(baseUrl, t, o.data.job_id)
          } finally {
            notifyRunSettled()
          }
        })()
      }
    }
    onSuccess()
    closeModal()
  }

  const titleId = 'add-source-modal-title'
  const resolveDetailsContext =
    resolveFailure?.details ? resolveFailureContextLine(resolveFailure.details) : null

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal()
      }}
    >
      <div className="modal-dialog__panel">
        <header className="modal-dialog__header">
          <h2 id={titleId} className="modal-dialog__title">
            Add source — {categoryLabel}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={resolveBusy || insertBusy}
            onClick={closeModal}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        {!baseUrl ? (
          <p className="muted" role="status">
            Set <code>VITE_API_BASE_URL</code> or <code>VITE_RESOLVE_API_BASE_URL</code> in your environment (e.g.{' '}
            <code>http://127.0.0.1:5000</code>) and restart the dev server.
          </p>
        ) : null}

        {step === 'query' ? (
          <form className="form-grid" onSubmit={onResolve}>
            <label className="field field--full">
              <span className="field__label">URL or site name</span>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. theguardian.com or https://example.org"
                disabled={resolveBusy || !baseUrl}
                autoFocus
              />
            </label>
            {resolveFailure ? (
              <div className="form-error field--full add-source-modal__resolve-error" role="alert">
                <p className="add-source-modal__resolve-error-msg">{resolveFailure.message}</p>
                {resolveFailure.unauthorized ? (
                  <p className="add-source-modal__resolve-error-msg">
                    <Link to="/auth" className="modal-dialog__inline-link">
                      Sign in
                    </Link>
                  </p>
                ) : null}
                {resolveFailure.details?.reason ? (
                  <p className="add-source-modal__resolve-reason">
                    <span className="add-source-modal__resolve-reason-label">Reason</span>{' '}
                    <code className="add-source-modal__resolve-reason-code">{resolveFailure.details.reason}</code>
                  </p>
                ) : null}
                {resolveDetailsContext ? (
                  <p className="muted add-source-modal__resolve-context">{resolveDetailsContext}</p>
                ) : null}
                {resolveFailure.details?.body_preview ? (
                  <details className="add-source-modal__body-preview-details">
                    <summary className="add-source-modal__body-preview-summary">
                      Rendered homepage response (scripts blocked)
                    </summary>
                    <iframe
                      className="add-source-modal__body-preview-frame"
                      title="Homepage response as rendered HTML; scripts and forms are disabled by the browser sandbox."
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={resolveFailure.details.body_preview}
                    />
                  </details>
                ) : null}
              </div>
            ) : null}
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--ghost" disabled={resolveBusy} onClick={closeModal}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={resolveBusy || !baseUrl || !query.trim()}
              >
                {resolveBusy ? 'Resolving…' : 'Resolve'}
              </button>
            </div>
          </form>
        ) : (
          <form className="form-grid" onSubmit={onInsert}>
            {meta ? (
              <div className="add-source-modal__meta field--full">
                {meta.website_title ? (
                  <p className="add-source-modal__meta-line">
                    <strong>Site:</strong> {meta.website_title}
                  </p>
                ) : null}
                <p className="add-source-modal__meta-line muted">
                  <strong>Confidence:</strong> {meta.confidence || '—'}
                  {meta.rss_found ? ' · RSS found' : ' · No RSS'}
                </p>
                {meta.notes ? <p className="add-source-modal__notes muted">{meta.notes}</p> : null}
              </div>
            ) : null}
            <label className="field field--full">
              <span className="field__label">URL to save</span>
              <input className="input" type="url" value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} disabled={insertBusy} />
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={reviewUseRss}
                onChange={(e) => setReviewUseRss(e.target.checked)}
                disabled={insertBusy}
              />
              <span>Use RSS</span>
            </label>
            {insertError ? (
              <p className="form-error field--full" role="alert">
                {insertError}
              </p>
            ) : null}
            <div className="modal-dialog__footer modal-dialog__footer--spread">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={insertBusy}
                onClick={() => {
                  setStep('query')
                  setInsertError(null)
                }}
              >
                Back
              </button>
              <div className="modal-dialog__footer-right">
                <button type="button" className="btn btn--ghost" disabled={insertBusy} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={insertBusy || !reviewUrl.trim()}>
                  {insertBusy ? 'Adding…' : 'Add source'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
