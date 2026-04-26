import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import { getResolveApiBaseUrl, postPipelineRun, postResolveSource, type ResolveSuccessData } from '@/lib/resolve-api'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category } from '@/types/database'

const DEFAULT_CATEGORY_NAME = 'Tech News'
const DEFAULT_INSTRUCTIONS = 'I am only interested in articles about AI and startups'
const DEFAULT_SOURCE_QUERY = 'techcrunch.com'

type WizardStep = 1 | 2 | 3 | 4 | 5

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const navigate = useNavigate()
  const uid = user?.id

  const [existingCategories, setExistingCategories] = useState<Category[]>([])
  const [initLoading, setInitLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  const [step, setStep] = useState<WizardStep>(1)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState(DEFAULT_CATEGORY_NAME)
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [sourceQuery, setSourceQuery] = useState(DEFAULT_SOURCE_QUERY)

  const [busy, setBusy] = useState(false)
  /** While adding a source on step 4: saving row vs waiting on first pipeline job (long). */
  const [sourceAddPhase, setSourceAddPhase] = useState<'idle' | 'saving' | 'pipeline'>('idle')
  const [pipelinePollStatus, setPipelinePollStatus] = useState<'queued' | 'running' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resolvedMeta, setResolvedMeta] = useState<ResolveSuccessData | null>(null)
  const [reviewUrl, setReviewUrl] = useState('')
  const [reviewUseRss, setReviewUseRss] = useState(false)
  const [resolved, setResolved] = useState(false)

  const resolveBaseUrl = useMemo(() => getResolveApiBaseUrl(), [])

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const loadExistingCategories = useCallback(async () => {
    if (!supabase || !uid) return
    setInitLoading(true)
    setInitError(null)
    const { data, error: loadError } = await supabase
      .from('categories')
      .select('id,user_id,name,instruction')
      .eq('user_id', uid)
      .order('name', { ascending: true })
    setInitLoading(false)
    if (loadError) {
      setInitError(loadError.message)
      return
    }
    setExistingCategories((data ?? []) as Category[])
  }, [uid])

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setInitLoading(false)
      return
    }
    void loadExistingCategories()
  }, [uid, loadExistingCategories])

  async function onCreateCategory(e: FormEvent) {
    e.preventDefault()
    const name = categoryName.trim()
    if (!supabase || !uid || !name) return
    setBusy(true)
    setError(null)
    const { data, error: insertErr } = await supabase
      .from('categories')
      .insert({
        user_id: uid,
        name,
        instruction: '',
      })
      .select('id')
      .single()
    setBusy(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    const row = data as { id: string } | null
    if (!row?.id) {
      setError('Category was created but no id was returned.')
      return
    }
    setCategoryId(row.id)
    setStep(3)
  }

  async function onSaveInstructions(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !uid || !categoryId) return
    setBusy(true)
    setError(null)
    const { error: updateErr } = await supabase
      .from('categories')
      .update({ instruction: instructions })
      .eq('id', categoryId)
      .eq('user_id', uid)
    setBusy(false)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setStep(4)
  }

  async function onResolveSource(e: FormEvent) {
    e.preventDefault()
    const query = sourceQuery.trim()
    if (!query) {
      setError('Enter a URL or site name.')
      return
    }
    if (!resolveBaseUrl) {
      setError('Resolve API URL is not configured (set VITE_API_BASE_URL or VITE_RESOLVE_API_BASE_URL).')
      return
    }
    const token = await getAccessToken()
    if (!token) {
      setError('No session token. Sign in again.')
      return
    }
    setBusy(true)
    setError(null)
    const outcome = await postResolveSource(resolveBaseUrl, query, token)
    setBusy(false)

    if (outcome.kind === 'success') {
      setResolvedMeta(outcome.data)
      setReviewUrl(outcome.data.resolved_url)
      setReviewUseRss(outcome.data.use_rss)
      setResolved(true)
      return
    }
    if (outcome.kind === 'unauthorized' || outcome.kind === 'business_error' || outcome.kind === 'bad_response' || outcome.kind === 'network') {
      setError(outcome.message)
      return
    }
  }

  async function onAddSource(e: FormEvent) {
    e.preventDefault()
    const url = reviewUrl.trim()
    if (!supabase || !uid || !categoryId) return
    if (!url) {
      setError('URL is required.')
      return
    }
    if (!isProbablyUrl(url)) {
      setError('Enter a valid http(s) URL.')
      return
    }
    setBusy(true)
    setError(null)
    setSourceAddPhase('saving')
    setPipelinePollStatus(null)
    const { data: inserted, error: insertErr } = await supabase
      .from('sources')
      .insert({
        user_id: uid,
        category_id: categoryId,
        url,
        use_rss: reviewUseRss,
      })
      .select('id')
      .single()
    if (insertErr) {
      setBusy(false)
      setSourceAddPhase('idle')
      setError(insertErr.message)
      return
    }

    const sourceId =
      inserted && typeof inserted === 'object' && 'id' in inserted && typeof inserted.id === 'string'
        ? inserted.id
        : ''
    if (sourceId && resolveBaseUrl) {
      const token = await getAccessToken()
      if (token) {
        const run = await postPipelineRun(resolveBaseUrl, { source: sourceId }, token)
        if (run.kind === 'success') {
          setSourceAddPhase('pipeline')
          setPipelinePollStatus(null)
          notifyRunAccepted()
          try {
            await pollPipelineJobUntilTerminal(resolveBaseUrl, token, run.data.job_id, undefined, (status) => {
              setPipelinePollStatus(status)
            })
          } finally {
            notifyRunSettled()
          }
        }
      }
    }
    setBusy(false)
    setSourceAddPhase('idle')
    setPipelinePollStatus(null)
    setStep(5)
  }

  function onSkipSetup() {
    navigate('/settings')
  }

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <p className="muted">Configure Supabase first.</p>
      </div>
    )
  }

  if (authLoading || initLoading) {
    return (
      <div className="page page--narrow">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (initError) {
    return (
      <div className="page page--narrow">
        <p className="inline-error" role="alert">
          {initError}
        </p>
      </div>
    )
  }

  if (existingCategories.length > 0 && !categoryId) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page page--narrow">
      <section className="card onboarding-wizard" aria-labelledby="onboarding-title">
        <header className="onboarding-wizard__header">
          <h1 id="onboarding-title" className="page-title">
            Setup Wizard
          </h1>
          <p className="muted">Step {step} of 5</p>
        </header>

        {step === 1 ? (
          <div className="onboarding-wizard__step">
            <h2 className="onboarding-wizard__step-title">Welcome to GistPrism</h2>
            <p>Let&apos;s set up your first filter.</p>
            <div className="form-actions onboarding-wizard__actions">
              <button type="button" className="btn btn--ghost" onClick={onSkipSetup}>
                Skip setup
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>
                Start
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form className="form-stack onboarding-wizard__step" onSubmit={onCreateCategory}>
            <h2 className="onboarding-wizard__step-title">Create a category</h2>
            <p className="muted">Suggested: Tech News.</p>
            <label className="field">
              <span className="field__label">Category name</span>
              <input
                className="input"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <div className="form-actions onboarding-wizard__actions">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setStep(1)}>
                Back
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || !categoryName.trim()}>
                {busy ? 'Creating…' : 'Next'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          <form className="form-stack onboarding-wizard__step" onSubmit={onSaveInstructions}>
            <h2 className="onboarding-wizard__step-title">Set your instructions</h2>
            <p className="muted">You can update these instructions later.</p>
            <label className="field">
              <span className="field__label">Instructions (markdown)</span>
              <textarea
                className="textarea textarea--instruction"
                rows={8}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={busy}
                spellCheck
              />
            </label>
            <div className="form-actions onboarding-wizard__actions">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setStep(2)}>
                Back
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Next'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 4 ? (
          <div className="onboarding-wizard__step">
            {!resolved ? (
              <form className="form-stack" onSubmit={onResolveSource}>
                <h2 className="onboarding-wizard__step-title">Add a source</h2>
                <p className="muted">Suggested source: techcrunch.com.</p>
                <label className="field">
                  <span className="field__label">URL or site name</span>
                  <input
                    className="input"
                    value={sourceQuery}
                    onChange={(e) => setSourceQuery(e.target.value)}
                    disabled={busy || !resolveBaseUrl}
                    autoFocus
                  />
                </label>
                {!resolveBaseUrl ? (
                  <p className="muted">
                    Set <code>VITE_API_BASE_URL</code> or <code>VITE_RESOLVE_API_BASE_URL</code> and restart.
                  </p>
                ) : null}
                <div className="form-actions onboarding-wizard__actions">
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setStep(3)}>
                    Back
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={busy || !sourceQuery.trim() || !resolveBaseUrl}>
                    {busy ? 'Resolving…' : 'Resolve'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="form-stack" onSubmit={onAddSource}>
                <h2 className="onboarding-wizard__step-title">Review source</h2>
                {resolvedMeta?.website_title ? (
                  <p className="muted">
                    Site: <strong>{resolvedMeta.website_title}</strong>
                  </p>
                ) : null}
                <label className="field">
                  <span className="field__label">URL to save</span>
                  <input
                    className="input"
                    value={reviewUrl}
                    onChange={(e) => setReviewUrl(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={reviewUseRss}
                    onChange={(e) => setReviewUseRss(e.target.checked)}
                    disabled={busy}
                  />
                  <span>Use RSS</span>
                </label>
                {busy && sourceAddPhase === 'pipeline' ? (
                  <div className="onboarding-wizard__pipeline-wait" role="status" aria-live="polite">
                    <p className="muted onboarding-wizard__pipeline-wait-text">
                      Your source is saved. Now fetching and processing articles. This takes&nbsp;
                      <strong>10–15 seconds</strong>.
                    </p>
                    <div
                      className="onboarding-wizard__progress-track"
                      role="progressbar"
                      aria-busy="true"
                      aria-label="First article import in progress"
                      aria-valuetext={
                        pipelinePollStatus === 'running'
                          ? 'Fetching and analyzing articles'
                          : pipelinePollStatus === 'queued'
                            ? 'Job queued'
                            : 'Starting import'
                      }
                    >
                      <div className="onboarding-wizard__progress-bar" />
                    </div>
                    <p className="muted onboarding-wizard__pipeline-status">
                      {pipelinePollStatus === 'running'
                        ? 'Working…'
                        : pipelinePollStatus === 'queued'
                          ? 'Job queued…'
                          : 'Starting…'}
                    </p>
                  </div>
                ) : null}
                <div className="form-actions onboarding-wizard__actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => {
                      setResolved(false)
                      setResolvedMeta(null)
                      setReviewUrl('')
                      setReviewUseRss(false)
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={busy || !reviewUrl.trim()}>
                    {busy ? (sourceAddPhase === 'pipeline' ? 'Fetching articles…' : 'Saving…') : 'Add source'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="onboarding-wizard__step">
            <h2 className="onboarding-wizard__step-title">Success</h2>
            <p>You have successfully added your first category, filter instructions, and source.</p>
            <p>You can add more categories and sources in settings OR use the <strong>"Add Sources"</strong> button to add sources from a catalog.</p>
            <p>GistPrism updates your article gists automatically every few hours. (When you've read everthing, you're done. No doom scrolling!)</p>
            <div className="form-actions onboarding-wizard__actions onboarding-wizard__actions--center">
              <Link to="/" className="btn btn--primary">
                Go to articles
              </Link>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}
