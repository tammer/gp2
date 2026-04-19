import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  getResolveApiBaseUrl,
  postPipelineRun,
  postResolveSource,
  type ResolveSuccessData,
} from '@/lib/resolve-api'
import { supabase } from '@/lib/supabase'

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
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
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [step, setStep] = useState<Step>('query')
  const [query, setQuery] = useState('')
  const [reviewUrl, setReviewUrl] = useState('')
  const [reviewUseRss, setReviewUseRss] = useState(false)
  const [meta, setMeta] = useState<ResolveSuccessData | null>(null)

  const [resolveBusy, setResolveBusy] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)

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
    setResolveError(null)
    setUnauthorized(false)
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
    setResolveError(null)
    setUnauthorized(false)
    const q = query.trim()
    if (!q) {
      setResolveError('Enter a URL or site name.')
      return
    }
    if (!baseUrl) {
      setResolveError(
        'Resolve API URL is not configured (set VITE_API_BASE_URL or VITE_RESOLVE_API_BASE_URL).',
      )
      return
    }
    const token = await getAccessToken()
    if (!token) {
      setUnauthorized(true)
      setResolveError('No session token. Sign in again.')
      return
    }
    setResolveBusy(true)
    const outcome = await postResolveSource(baseUrl, q, token)
    setResolveBusy(false)

    switch (outcome.kind) {
      case 'success':
        setMeta(outcome.data)
        setReviewUrl(outcome.data.resolved_url)
        setReviewUseRss(outcome.data.use_rss)
        setStep('review')
        setInsertError(null)
        return
      case 'unauthorized':
        setUnauthorized(true)
        setResolveError(outcome.message)
        return
      case 'business_error':
        setResolveError(`${outcome.message} (${outcome.error})`)
        return
      case 'bad_response':
        setResolveError(outcome.message)
        return
      case 'network':
        setResolveError(outcome.message)
        return
      default:
        setResolveError('Unexpected resolve error.')
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
        void postPipelineRun(baseUrl, { source: newId }, t).then((o) => {
          if (o.kind !== 'success') console.error('postPipelineRun failed', o)
        })
      }
    }
    onSuccess()
    closeModal()
  }

  const titleId = 'add-source-modal-title'

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
            {resolveError ? (
              <p className="form-error field--full" role="alert">
                {resolveError}{' '}
                {unauthorized ? (
                  <Link to="/auth" className="modal-dialog__inline-link">
                    Sign in
                  </Link>
                ) : null}
              </p>
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
