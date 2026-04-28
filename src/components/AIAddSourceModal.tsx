import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import {
  getResolveApiBaseUrl,
  getSourcesDiscoverStatus,
  postPipelineRun,
  postSourcesDiscover,
  type DiscoverSuggestion,
} from '@/lib/resolve-api'
import { supabase } from '@/lib/supabase'

type CategoryOption = {
  id: string
  name: string
}

export type AIAddSourceModalProps = {
  open: boolean
  onClose: () => void
  userId: string
  categories: CategoryOption[]
  defaultCategoryId: string | null
  getAccessToken: () => Promise<string | null>
  onSuccess: () => void
}

type Step = 'prompt' | 'discovering' | 'results'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function AIAddSourceModal({
  open,
  onClose,
  userId,
  categories,
  defaultCategoryId,
  getAccessToken,
  onSuccess,
}: AIAddSourceModalProps) {
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const runIdRef = useRef(0)
  const [step, setStep] = useState<Step>('prompt')
  const [query, setQuery] = useState('')
  const [discoverStatus, setDiscoverStatus] = useState<'queued' | 'running'>('queued')
  const [suggestions, setSuggestions] = useState<DiscoverSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [selectedCategoryByUrl, setSelectedCategoryByUrl] = useState<Record<string, string>>({})

  const baseUrl = getResolveApiBaseUrl()

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      if (!d.open) d.showModal()
    } else if (d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    runIdRef.current += 1
    setStep('prompt')
    setQuery('')
    setDiscoverStatus('queued')
    setSuggestions([])
    setError(null)
    setBusy(false)
    setAddingUrl(null)
    setSelectedCategoryByUrl({})
  }, [open])

  function closeModal() {
    dialogRef.current?.close()
  }

  function handleDialogClose() {
    onClose()
  }

  async function onDiscover(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const q = query.trim()
    if (!q) {
      setError('Describe what you want to read about.')
      return
    }
    if (!baseUrl) {
      setError('Resolve API URL is not configured (set VITE_API_BASE_URL or VITE_RESOLVE_API_BASE_URL).')
      return
    }
    const token = await getAccessToken()
    if (!token) {
      setError('No session token. Sign in again.')
      return
    }

    setBusy(true)
    setStep('discovering')
    const start = await postSourcesDiscover(baseUrl, q, token, 5)
    if (start.kind !== 'success') {
      setBusy(false)
      setStep('prompt')
      setError(start.message)
      return
    }

    const runId = ++runIdRef.current
    let nextStatus: 'queued' | 'running' = 'queued'
    for (let i = 0; i < 90; i += 1) {
      if (runIdRef.current !== runId) return
      const statusRes = await getSourcesDiscoverStatus(baseUrl, start.data.job_id, token)
      if (statusRes.kind !== 'success') {
        setBusy(false)
        setStep('prompt')
        setError(statusRes.message)
        return
      }
      const data = statusRes.data
      if (data.status === 'succeeded') {
        setSuggestions(data.suggestions)
        setBusy(false)
        setStep('results')
        if (data.suggestions.length === 0) setError('No source suggestions were returned. Try a more specific prompt.')
        return
      }
      if (data.status === 'failed') {
        setBusy(false)
        setStep('prompt')
        setError(data.error ?? 'Discover job failed.')
        return
      }
      nextStatus = data.status
      setDiscoverStatus(nextStatus)
      await delay(nextStatus === 'queued' ? 900 : 1200)
    }

    setBusy(false)
    setStep('prompt')
    setError('Discover timed out. Please try again.')
  }

  async function onAddSuggestion(s: DiscoverSuggestion) {
    if (!supabase) return
    if (!baseUrl) {
      setError('Resolve API URL is not configured (set VITE_API_BASE_URL or VITE_RESOLVE_API_BASE_URL).')
      return
    }
    const categoryId = selectedCategoryByUrl[s.index] ?? defaultCategoryId ?? categories[0]?.id ?? ''
    if (!categoryId) {
      setError('Create a category first, then add sources.')
      return
    }
    setError(null)
    setAddingUrl(s.index)
    const { data: inserted, error: insertErr } = await supabase
      .from('sources')
      .insert({
        user_id: userId,
        category_id: categoryId,
        url: s.index,
        use_rss: s.index_is_rss,
      })
      .select('id')
      .single()
    if (insertErr) {
      setAddingUrl(null)
      setError(insertErr.message)
      return
    }
    const newId =
      inserted && typeof inserted === 'object' && 'id' in inserted && typeof inserted.id === 'string'
        ? inserted.id
        : ''
    if (newId && baseUrl) {
      const t = await getAccessToken()
      if (t) {
        const o = await postPipelineRun(baseUrl, { source: newId }, t)
        if (o.kind === 'success') {
          notifyRunAccepted()
          try {
            await pollPipelineJobUntilTerminal(baseUrl, t, o.data.job_id)
          } finally {
            notifyRunSettled()
          }
        }
      }
    }
    setAddingUrl(null)
    onSuccess()
    closeModal()
  }

  const titleId = 'ai-add-source-modal-title'
  const noCategories = categories.length === 0

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
            AI source discovery
          </h2>
          <button type="button" className="btn btn--ghost btn--small" disabled={busy || addingUrl !== null} onClick={closeModal} aria-label="Close">
            Close
          </button>
        </header>

        {!baseUrl ? (
          <p className="muted" role="status">
            Set <code>VITE_API_BASE_URL</code> or <code>VITE_RESOLVE_API_BASE_URL</code> in your environment and restart the dev server.
          </p>
        ) : null}

        {step === 'prompt' ? (
          <form className="form-grid" onSubmit={onDiscover}>
            <label className="field field--full">
              <span className="field__label">What would you like to read about?</span>
              <textarea
                className="textarea"
                rows={4}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy || !baseUrl}
                placeholder="e.g. trustworthy explainers on AI policy and open source models"
                autoFocus
              />
            </label>
            {error ? (
              <p className="form-error field--full" role="alert">
                {error}{' '}
                {error.toLowerCase().includes('session') || error.toLowerCase().includes('authorized') ? (
                  <Link to="/auth" className="modal-dialog__inline-link">
                    Sign in
                  </Link>
                ) : null}
              </p>
            ) : null}
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || !query.trim() || !baseUrl}>
                Discover
              </button>
            </div>
          </form>
        ) : null}

        {step === 'discovering' ? (
          <div className="ai-discover-status" role="status" aria-live="polite">
            <p className="muted">
              {discoverStatus === 'running'
                ? 'Searching and ranking sources...'
                : 'Queueing your discovery request...'}
            </p>
            <div className="onboarding-wizard__progress-track" role="progressbar" aria-busy="true" aria-label="Source discovery in progress">
              <div className="onboarding-wizard__progress-bar" />
            </div>
          </div>
        ) : null}

        {step === 'results' ? (
          <div className="ai-discover-results">
            <div className="ai-discover-results__header">
              <p className="muted">Suggestions</p>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setStep('prompt')
                  setSuggestions([])
                  setError(null)
                }}
              >
                New prompt
              </button>
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <ul className="ai-discover-results__list">
              {suggestions.map((s) => {
                const selected = selectedCategoryByUrl[s.index] ?? defaultCategoryId ?? categories[0]?.id ?? ''
                const isAdding = addingUrl === s.index
                return (
                  <li key={`${s.url}::${s.index}`} className="ai-discover-result-card">
                    <h3 className="ai-discover-result-card__title">{s.name || s.url}</h3>
                    <p className="ai-discover-result-card__url">
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    </p>
                    <p className="ai-discover-result-card__why">
                      <strong>Will ingest:</strong> {s.index} ({s.index_is_rss ? 'RSS/XML' : 'HTML/auto'})
                    </p>
                    {s.why ? <p className="ai-discover-result-card__why">{s.why}</p> : null}
                    <div className="ai-discover-result-card__actions">
                      <label className="field">
                        <span className="field__label">Category</span>
                        <select
                          className="input"
                          value={selected}
                          onChange={(e) =>
                            setSelectedCategoryByUrl((prev) => ({
                              ...prev,
                              [s.index]: e.target.value,
                            }))
                          }
                          disabled={isAdding || noCategories}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        disabled={isAdding || noCategories}
                        onClick={() => void onAddSuggestion(s)}
                      >
                        {isAdding ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {noCategories ? <p className="muted">Create a category first, then add suggested sources.</p> : null}
          </div>
        ) : null}
      </div>
    </dialog>
  )
}
