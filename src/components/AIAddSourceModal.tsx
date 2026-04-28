import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import {
  getResolveApiBaseUrl,
  getSourcesDiscoverStatus,
  postPipelineRun,
  postResolveSource,
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
const NEW_CATEGORY_VALUE = '__new__'

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
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [activeAddUrl, setActiveAddUrl] = useState<string | null>(null)
  const [selectedCategoryByUrl, setSelectedCategoryByUrl] = useState<Record<string, string>>({})
  const [newCategoryNameByUrl, setNewCategoryNameByUrl] = useState<Record<string, string>>({})

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
    setSuccess(null)
    setBusy(false)
    setAddingUrl(null)
    setActiveAddUrl(null)
    setSelectedCategoryByUrl({})
    setNewCategoryNameByUrl({})
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
    const selectedCategory = selectedCategoryByUrl[s.url] ?? defaultCategoryId ?? categories[0]?.id ?? ''
    if (!selectedCategory) {
      setError('Create a category first, then add sources.')
      return
    }
    let categoryId = selectedCategory
    if (selectedCategory === NEW_CATEGORY_VALUE) {
      const categoryName = (newCategoryNameByUrl[s.url] ?? '').trim()
      if (!categoryName) {
        setError('Enter a name for the new category.')
        return
      }
      const { data: categoryRow, error: categoryErr } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: categoryName,
          instruction: '',
        })
        .select('id')
        .single()
      if (categoryErr) {
        setError(categoryErr.message)
        return
      }
      categoryId =
        categoryRow && typeof categoryRow === 'object' && 'id' in categoryRow && typeof categoryRow.id === 'string'
          ? categoryRow.id
          : ''
      if (!categoryId) {
        setError('Category was created but no id was returned.')
        return
      }
    }
    const token = await getAccessToken()
    if (!token) {
      setError('No session token. Sign in again.')
      return
    }
    setError(null)
    setSuccess(null)
    setAddingUrl(s.url)
    const resolved = await postResolveSource(baseUrl, s.url, token)
    if (resolved.kind !== 'success') {
      setAddingUrl(null)
      setError(resolved.message)
      return
    }
    const { data: inserted, error: insertErr } = await supabase
      .from('sources')
      .insert({
        user_id: userId,
        category_id: categoryId,
        url: resolved.data.resolved_url,
        use_rss: resolved.data.use_rss,
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
      const o = await postPipelineRun(baseUrl, { source: newId }, token)
      if (o.kind === 'success') {
        notifyRunAccepted()
        try {
          await pollPipelineJobUntilTerminal(baseUrl, token, o.data.job_id)
        } finally {
          notifyRunSettled()
        }
      }
    }
    setAddingUrl(null)
    setActiveAddUrl(null)
    onSuccess()
    setSuccess(`Added ${s.name || s.url}. You can add another suggestion.`)
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
            {success ? (
              <p className="form-success" role="status">
                {success}
              </p>
            ) : null}
            <ul className="ai-discover-results__list">
              {suggestions.map((s) => {
                const selected = selectedCategoryByUrl[s.url] ?? defaultCategoryId ?? categories[0]?.id ?? ''
                const isAdding = addingUrl === s.url
                const isChoosingCategory = activeAddUrl === s.url
                return (
                  <li key={s.url} className="ai-discover-result-card">
                    <h3 className="ai-discover-result-card__title">{s.name || s.url}</h3>
                    <p className="ai-discover-result-card__url">
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    </p>
                    {s.why ? <p className="ai-discover-result-card__why">{s.why}</p> : null}
                    {isChoosingCategory ? (
                      <div className="ai-discover-result-card__actions">
                        <label className="field">
                          <span className="field__label">Category</span>
                          <select
                            className="input"
                            value={selected}
                            onChange={(e) =>
                              setSelectedCategoryByUrl((prev) => ({
                                ...prev,
                                [s.url]: e.target.value,
                              }))
                            }
                            disabled={isAdding || noCategories}
                          >
                            <option value={NEW_CATEGORY_VALUE}>+ Create new category</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selected === NEW_CATEGORY_VALUE ? (
                          <label className="field">
                            <span className="field__label">New category name</span>
                            <input
                              className="input"
                              value={newCategoryNameByUrl[s.url] ?? ''}
                              onChange={(e) =>
                                setNewCategoryNameByUrl((prev) => ({
                                  ...prev,
                                  [s.url]: e.target.value,
                                }))
                              }
                              disabled={isAdding}
                              placeholder="e.g. AI Policy"
                            />
                          </label>
                        ) : null}
                        <div className="modal-dialog__footer-right">
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={isAdding}
                            onClick={() => setActiveAddUrl(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            disabled={isAdding || noCategories}
                            onClick={() => void onAddSuggestion(s)}
                          >
                            {isAdding ? 'Resolving and adding…' : 'Resolve and add'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="ai-discover-result-card__actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--small"
                          disabled={Boolean(addingUrl) || noCategories}
                          onClick={() => {
                            setError(null)
                            setSuccess(null)
                            setSelectedCategoryByUrl((prev) => ({
                              ...prev,
                              [s.url]: prev[s.url] ?? defaultCategoryId ?? categories[0]?.id ?? NEW_CATEGORY_VALUE,
                            }))
                            setActiveAddUrl(s.url)
                          }}
                        >
                          Add
                        </button>
                      </div>
                    )}
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
