import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { AIAddSourceModal } from '@/components/AIAddSourceModal'
import { AddSourceModal } from '@/components/AddSourceModal'
import tammerFiltersCatalog from '@/data/tammer-filters-catalog.json'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import {
  getResolveApiBaseUrl,
  postPipelineRun,
  postUserSourcesImport,
  type UserSourcesImportCatalog,
} from '@/lib/resolve-api'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category, NewsArticleExclusion, Source } from '@/types/database'

type ExclusionRow = Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why' | 'excluded_at'>

type SettingsScreenProps = {
  embedded?: boolean
  titleId?: string
}

function CategoryDetailPane({
  category,
  sources,
  uid,
  onReload,
  getAccessToken,
  categories,
  forceRenameToken = 0,
  forceDeleteToken = 0,
}: {
  category: Category
  sources: Source[]
  uid: string
  onReload: () => void
  getAccessToken: () => Promise<string | null>
  categories: Category[]
  forceRenameToken?: number
  forceDeleteToken?: number
}) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [instrEditing, setInstrEditing] = useState(false)
  const [instrDraft, setInstrDraft] = useState(category.instruction)
  const [instrBusy, setInstrBusy] = useState(false)
  const [instrError, setInstrError] = useState<string | null>(null)
  const [instrSuccess, setInstrSuccess] = useState<string | null>(null)

  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addSourceAiOpen, setAddSourceAiOpen] = useState(false)
  const [sourceActionError, setSourceActionError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [exclStatus, setExclStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [exclRows, setExclRows] = useState<ExclusionRow[]>([])
  const [exclError, setExclError] = useState<string | null>(null)

  useEffect(() => {
    if (!renaming) setNameDraft(category.name)
  }, [category.name, renaming])

  useEffect(() => {
    if (!instrEditing) setInstrDraft(category.instruction)
  }, [category.instruction, instrEditing])

  useEffect(() => {
    if (forceRenameToken <= 0) return
    setRenameError(null)
    setRenaming(true)
  }, [forceRenameToken])

  async function saveRename(e: FormEvent) {
    e.preventDefault()
    const name = nameDraft.trim()
    if (!name) {
      setRenameError('Name is required.')
      return
    }
    if (!supabase) return
    setRenameBusy(true)
    setRenameError(null)
    const { error: err } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', category.id)
      .eq('user_id', uid)
    setRenameBusy(false)
    if (err) {
      setRenameError(err.message)
      return
    }
    setRenaming(false)
    onReload()
  }

  function cancelRename() {
    setNameDraft(category.name)
    setRenameError(null)
    setRenaming(false)
  }

  async function saveInstruction(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setInstrBusy(true)
    setInstrError(null)
    setInstrSuccess(null)
    const { error: err } = await supabase
      .from('categories')
      .update({ instruction: instrDraft })
      .eq('id', category.id)
      .eq('user_id', uid)
    setInstrBusy(false)
    if (err) {
      setInstrError(err.message)
      return
    }
    setInstrEditing(false)
    setInstrSuccess('Saved.')
    onReload()
  }

  async function removeSource(id: string) {
    if (!supabase || deleteBusy) return
    if (!confirm('Delete this source?')) return
    setSourceActionError(null)
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setSourceActionError(err.message)
      return
    }
    onReload()
  }

  async function deleteCategory() {
    if (!supabase || deleteBusy) return
    if (!confirm(`Delete category "${category.name}"? This permanently removes its sources, articles, and exclusions.`)) return
    setDeleteBusy(true)
    setDeleteError(null)
    const { error: err } = await supabase.from('categories').delete().eq('id', category.id).eq('user_id', uid)
    setDeleteBusy(false)
    if (err) {
      setDeleteError(err.message)
      return
    }
    onReload()
  }

  useEffect(() => {
    if (forceDeleteToken <= 0) return
    void deleteCategory()
  }, [forceDeleteToken])

  async function loadExclusionsIfNeeded() {
    if (!supabase || exclStatus === 'loading' || exclStatus === 'done') return
    setExclStatus('loading')
    setExclError(null)
    const { data, error: err } = await supabase
      .from('news_article_exclusions')
      .select('category_id,url,why,excluded_at')
      .eq('category_id', category.id)
      .order('excluded_at', { ascending: false })
      .limit(10)
    if (err) {
      setExclError(err.message)
      setExclRows([])
      setExclStatus('error')
      return
    }
    setExclRows((data ?? []) as ExclusionRow[])
    setExclStatus('done')
  }

  function onExclusionsToggle(e: SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open) void loadExclusionsIfNeeded()
  }

  const hasInstruction = Boolean(category.instruction.trim())

  return (
    <section className="card settings-detail settings-category" aria-labelledby={`cat-heading-${category.id}`}>
      <div className="settings-category__header">
        {renaming ? (
          <form className="settings-category__rename-form" onSubmit={saveRename}>
            <input
              className="input settings-category__rename-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              aria-label="Category name"
              disabled={renameBusy}
            />
            <button type="submit" className="btn btn--primary btn--small" disabled={renameBusy}>
              {renameBusy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={renameBusy} onClick={cancelRename}>
              Cancel
            </button>
            {renameError ? (
              <p className="form-error settings-category__rename-error" role="alert">
                {renameError}
              </p>
            ) : null}
          </form>
        ) : (
          <>
            <div className="settings-category__header-main">
              <h2 id={`cat-heading-${category.id}`} className="settings-category__title">
                {category.name}
              </h2>
            </div>
          </>
        )}
      </div>
      {deleteError ? (
        <p className="form-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      <details className="settings-category__section settings-section-toggle settings-section-toggle--sources">
        <summary className="settings-section-toggle__summary">
          Sources
          <span className="settings-section-toggle__count muted">
            ({sources.length})
          </span>
        </summary>
        <div className="settings-section-toggle__body">
          {sources.length === 0 ? (
            <p className="muted">No sources in this category yet.</p>
          ) : (
            <div className="sources-table-wrap">
              <table className="sources-table">
                <caption className="sr-only">Sources in {category.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">URL</th>
                    <th scope="col">RSS</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td className="sources-table__url">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>
                          {s.url}
                        </a>
                      </td>
                      <td>{s.use_rss ? 'Yes' : 'No'}</td>
                      <td className="sources-table__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={deleteBusy}
                          onClick={() => void removeSource(s.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sourceActionError ? (
            <p className="form-error" role="alert">
              {sourceActionError}
            </p>
          ) : null}
        </div>
      </details>
      <div className="settings-add-source-action">
        <button type="button" className="btn btn--primary" onClick={() => setAddSourceOpen(true)} disabled={deleteBusy}>
          Add Specific Source
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setAddSourceAiOpen(true)} disabled={deleteBusy}>
          AI
        </button>
      </div>
      <AddSourceModal
        open={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        categoryId={category.id}
        categoryLabel={category.name}
        userId={uid}
        getAccessToken={getAccessToken}
        onSuccess={onReload}
      />
      <AIAddSourceModal
        open={addSourceAiOpen}
        onClose={() => setAddSourceAiOpen(false)}
        userId={uid}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        defaultCategoryId={category.id}
        getAccessToken={getAccessToken}
        onSuccess={onReload}
      />

      <details className="settings-category__section settings-section-toggle settings-section-toggle--instructions">
        <summary className="settings-section-toggle__summary">Instructions</summary>
        <div className="settings-section-toggle__body">
          <section
            className="settings-instructions-panel"
            aria-labelledby={`instructions-heading-${category.id}`}
          >
            <div className="settings-instructions-panel__header">
              <div className="settings-instructions-panel__intro">
                <h3 id={`instructions-heading-${category.id}`} className="settings-instructions-panel__title">
                  Instructions
                </h3>
                {!instrEditing ? (
                  <p className="settings-instructions-panel__lead muted">
                    These instructions guide which articles are included for this category.
                  </p>
                ) : null}
              </div>
              {!instrEditing ? (
                <div className="settings-instructions-panel__actions">
                  <button
                    type="button"
                    className={`btn btn--small${hasInstruction ? ' btn--secondary' : ' btn--primary'}`}
                    disabled={deleteBusy}
                    onClick={() => {
                      setInstrSuccess(null)
                      setInstrEditing(true)
                    }}
                  >
                    {hasInstruction ? 'Edit instructions' : 'Add instructions'}
                  </button>
                </div>
              ) : null}
            </div>
            {instrEditing ? (
              <form className="form-stack settings-instructions-panel__body" onSubmit={saveInstruction}>
                <label className="field instruction-field-grow">
                  <span className="field__label">Markdown</span>
                  <textarea
                    className="textarea textarea--instruction"
                    rows={10}
                    value={instrDraft}
                    onChange={(e) => setInstrDraft(e.target.value)}
                    spellCheck
                  />
                </label>
                {instrError ? (
                  <p className="form-error" role="alert">
                    {instrError}
                  </p>
                ) : null}
                <div className="form-actions">
                  <button type="submit" className="btn btn--primary" disabled={instrBusy || deleteBusy}>
                    {instrBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={instrBusy || deleteBusy}
                    onClick={() => {
                      setInstrDraft(category.instruction)
                      setInstrError(null)
                      setInstrEditing(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="instruction-view settings-instructions-panel__body">
                {instrSuccess ? (
                  <p className="form-success" role="status">
                    {instrSuccess}
                  </p>
                ) : null}
                {hasInstruction ? (
                  <div className="instruction-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                      components={{
                        a: ({ href, children, ...props }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {category.instruction}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </details>

      <details className="settings-exclusions settings-section-toggle" onToggle={onExclusionsToggle}>
        <summary className="settings-exclusions__summary settings-section-toggle__summary">Recent exclusions (10 newest)</summary>
        <div className="settings-exclusions__body settings-section-toggle__body">
          {exclStatus === 'loading' ? (
            <p className="muted">Loading…</p>
          ) : exclError ? (
            <p className="inline-error" role="alert">
              {exclError}
            </p>
          ) : exclRows.length === 0 ? (
            <p className="muted">No exclusions recorded for this category yet.</p>
          ) : (
            <div className="sources-table-wrap">
              <table className="sources-table exclusions-table">
                <thead>
                  <tr>
                    <th scope="col">URL</th>
                    <th scope="col">Exclusion reason</th>
                  </tr>
                </thead>
                <tbody>
                  {exclRows.map((row) => (
                    <tr key={`${row.category_id}:${row.url}:${row.excluded_at}`}>
                      <td className="exclusions-table__url">
                        <a href={row.url} target="_blank" rel="noopener noreferrer">
                          {row.url}
                        </a>
                      </td>
                      <td className="exclusions-table__why">{row.why?.trim() ? row.why : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}

export function SettingsScreen({ embedded = false, titleId }: SettingsScreenProps) {
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const { user, loading: authLoading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renameRequestId, setRenameRequestId] = useState<string | null>(null)
  const [renameRequestToken, setRenameRequestToken] = useState(0)
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null)
  const [deleteRequestToken, setDeleteRequestToken] = useState(0)

  const [newCatName, setNewCatName] = useState('')
  const [newCatInstruction, setNewCatInstruction] = useState('')
  const [addCatBusy, setAddCatBusy] = useState(false)
  const [addCatError, setAddCatError] = useState<string | null>(null)
  const addCategoryDialogRef = useRef<HTMLDialogElement>(null)

  const [tammerImportBusy, setTammerImportBusy] = useState(false)
  const [tammerImportError, setTammerImportError] = useState<string | null>(null)
  const tammerImportInstructionsDialogRef = useRef<HTMLDialogElement>(null)

  const uid = user?.id

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  function openAddCategoryModal() {
    setAddCatError(null)
    addCategoryDialogRef.current?.showModal()
  }

  function closeAddCategoryModal() {
    addCategoryDialogRef.current?.close()
  }

  function openTammerImportInstructionsModal() {
    tammerImportInstructionsDialogRef.current?.showModal()
  }

  function closeTammerImportInstructionsModal() {
    tammerImportInstructionsDialogRef.current?.close()
  }

  async function confirmTammerImport() {
    setTammerImportError(null)
    const base = getResolveApiBaseUrl()
    if (!base) {
      setTammerImportError('Resolve API base URL not configured.')
      return
    }
    const token = await getAccessToken()
    if (!token) {
      setTammerImportError('Not signed in or session expired.')
      return
    }
    if (!supabase || !uid) {
      setTammerImportError('Not signed in or Supabase not configured.')
      return
    }
    const { data: beforeRows, error: beforeErr } = await supabase.from('sources').select('id').eq('user_id', uid)
    if (beforeErr) {
      setTammerImportError(beforeErr.message)
      return
    }
    const beforeIds = new Set((beforeRows ?? []).map((r) => r.id))
    setTammerImportBusy(true)
    const outcome = await postUserSourcesImport(
      base,
      tammerFiltersCatalog as UserSourcesImportCatalog,
      token,
    )
    setTammerImportBusy(false)
    if (outcome.kind === 'success') {
      const { data: afterRows, error: afterErr } = await supabase.from('sources').select('id').eq('user_id', uid)
      if (!afterErr && afterRows) {
        const newIds = afterRows.map((r) => r.id).filter((id) => !beforeIds.has(id))
        void Promise.all(
          newIds.map((id) =>
            (async () => {
              const o = await postPipelineRun(base, { source: id }, token)
              if (o.kind !== 'success') {
                console.error('postPipelineRun failed', id, o)
                return
              }
              notifyRunAccepted()
              try {
                await pollPipelineJobUntilTerminal(base, token, o.data.job_id)
              } finally {
                notifyRunSettled()
              }
            })(),
          ),
        )
      }
      openTammerImportInstructionsModal()
      void reload()
      return
    }
    if (outcome.kind === 'unauthorized') {
      setTammerImportError(outcome.message)
      return
    }
    if (outcome.kind === 'business_error' || outcome.kind === 'bad_response' || outcome.kind === 'network') {
      setTammerImportError(outcome.message)
      return
    }
  }

  function onAddCategoryDialogClose() {
    setAddCatError(null)
    setNewCatName('')
    setNewCatInstruction('')
  }

  function openCategoryRename(categoryId: string) {
    setSelectedId(categoryId)
    setRenameRequestId(categoryId)
    setRenameRequestToken((token) => token + 1)
  }

  function openCategoryDelete(categoryId: string) {
    setSelectedId(categoryId)
    setDeleteRequestId(categoryId)
    setDeleteRequestToken((token) => token + 1)
  }

  const loadCategories = useCallback(async () => {
    if (!supabase || !uid) return
    const { data, error: err } = await supabase
      .from('categories')
      .select('id,user_id,name,instruction')
      .eq('user_id', uid)
      .order('name', { ascending: true })
    if (err) throw err
    setCategories((data ?? []) as Category[])
  }, [uid])

  const loadSources = useCallback(async () => {
    if (!supabase || !uid) return
    const { data, error: err } = await supabase
      .from('sources')
      .select('id,user_id,url,use_rss,category_id')
      .eq('user_id', uid)
      .order('url', { ascending: true })
    if (err) throw err
    setSources((data ?? []) as Source[])
  }, [uid])

  const reload = useCallback(async () => {
    if (!supabase || !uid) return
    setError(null)
    try {
      await Promise.all([loadCategories(), loadSources()])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [uid, loadCategories, loadSources])

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        await Promise.all([loadCategories(), loadSources()])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Load failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [uid, loadCategories, loadSources])

  const sourcesByCategory = useMemo(() => {
    const map = new Map<string, Source[]>()
    for (const c of categories) map.set(c.id, [])
    for (const s of sources) {
      if (s.category_id && map.has(s.category_id)) map.get(s.category_id)!.push(s)
    }
    return map
  }, [categories, sources])

  useEffect(() => {
    if (loading) return

    if (categories.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }

    if (selectedId === null) {
      setSelectedId(categories[0]!.id)
      return
    }

    const stillExists = categories.some((c) => c.id === selectedId)
    if (!stillExists) {
      setSelectedId(categories[0]!.id)
    }
  }, [loading, categories, selectedId])

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    const name = newCatName.trim()
    if (!supabase || !uid || !name) return
    setAddCatBusy(true)
    setAddCatError(null)
    const { data, error: err } = await supabase
      .from('categories')
      .insert({
        user_id: uid,
        name,
        instruction: newCatInstruction,
      })
      .select('id')
      .single()
    setAddCatBusy(false)
    if (err) {
      setAddCatError(err.message)
      return
    }
    const row = data as { id: string } | null
    if (row?.id) setSelectedId(row.id)
    closeAddCategoryModal()
    void reload()
  }

  const selectedCategory = useMemo(() => (selectedId ? categories.find((c) => c.id === selectedId) : undefined), [categories, selectedId])
  const showingTammerInitState = !loading && categories.length === 0

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        {!embedded ? (
          <p className="page-back">
            <Link to="/" className="page-back__link">
              ← Back to Articles
            </Link>
          </p>
        ) : null}
        {!embedded ? <h1 id={titleId} className="page-title">Settings</h1> : null}
        <p className="muted">Configure Supabase first.</p>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="page">
        {!embedded ? (
          <p className="page-back">
            <Link to="/" className="page-back__link">
              ← Back to Articles
            </Link>
          </p>
        ) : null}
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className={`page page--settings${embedded ? ' page--settings--drawer' : ''}`}>
      {!embedded ? (
        <p className="page-back">
          <Link to="/" className="page-back__link">
            ← Back to Articles
          </Link>
        </p>
      ) : null}
      {!embedded ? <h1 id={titleId} className="page-title">Settings</h1> : null}

      <dialog
        ref={addCategoryDialogRef}
        className="modal-dialog"
        aria-labelledby="add-category-modal-title"
        onClose={onAddCategoryDialogClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeAddCategoryModal()
        }}
      >
        <div className="modal-dialog__panel">
          <header className="modal-dialog__header">
            <h2 id="add-category-modal-title" className="modal-dialog__title">
              Add category
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={addCatBusy}
              onClick={closeAddCategoryModal}
              aria-label="Close"
            >
              Close
            </button>
          </header>
          <form className="form-grid" onSubmit={addCategory}>
            <label className="field field--full">
              <span className="field__label">Name</span>
              <input
                className="input"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
                disabled={addCatBusy}
                autoFocus
              />
            </label>
            <label className="field field--full">
              <span className="field__label">Initial instructions (optional, markdown)</span>
              <textarea
                className="textarea textarea--instruction"
                rows={4}
                value={newCatInstruction}
                onChange={(e) => setNewCatInstruction(e.target.value)}
                disabled={addCatBusy}
              />
            </label>
            {addCatError ? (
              <p className="form-error field--full" role="alert">
                {addCatError}
              </p>
            ) : null}
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--ghost" disabled={addCatBusy} onClick={closeAddCategoryModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={addCatBusy || !newCatName.trim()}>
                {addCatBusy ? 'Adding…' : 'Add category'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        ref={tammerImportInstructionsDialogRef}
        className="modal-dialog"
        aria-labelledby="tammer-import-instructions-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeTammerImportInstructionsModal()
        }}
      >
        <div className="modal-dialog__panel">
          <header className="modal-dialog__header">
            <h2 id="tammer-import-instructions-title" className="modal-dialog__title">
              Import started
            </h2>
          </header>
          <div className="tammer-import-instructions">
            <ul className="tammer-import-instructions__list">
              <li>Gistprism will now update from these sources every few hours.</li>
              <li>Agents have been deployed to do an update right now.</li>
              <li>They will be done in 30 - 60 seconds.</li>
              <li>Return to the Articles page and start reading articles.</li>
            </ul>
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--primary" onClick={closeTammerImportInstructionsModal}>
                Got it
              </button>
            </div>
          </div>
        </div>
      </dialog>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="settings-split">
          <aside className="settings-sidebar" aria-label="Category list">
            <nav className="settings-nav" aria-label="Categories">
              {categories.map((c) => (
                <div key={c.id} className={`settings-nav__row${selectedId === c.id ? ' settings-nav__row--active' : ''}`}>
                  <button
                    type="button"
                    className={`settings-nav__item${selectedId === c.id ? ' settings-nav__item--active' : ''}`}
                    aria-current={selectedId === c.id ? 'page' : undefined}
                    aria-controls="settings-category-detail"
                    onClick={() => setSelectedId(c.id)}
                  >
                    {c.name}
                  </button>
                  <details className="settings-nav__menu">
                    <summary className="settings-nav__menu-trigger" aria-label={`Category actions for ${c.name}`}>
                      <span aria-hidden>...</span>
                    </summary>
                    <div className="settings-nav__menu-popover" role="menu" aria-label={`Actions for ${c.name}`}>
                      <button
                        type="button"
                        className="settings-nav__menu-item"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault()
                          ;(e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')
                          openCategoryRename(c.id)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="settings-nav__menu-item settings-nav__menu-item--danger"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault()
                          ;(e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')
                          openCategoryDelete(c.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              ))}
            </nav>
            <div className="settings-sidebar__footer">
              <button
                type="button"
                className={`btn btn--small settings-sidebar__add-cat${showingTammerInitState ? '' : ' btn--primary'}`}
                onClick={openAddCategoryModal}
              >
                Add category
              </button>
            </div>
          </aside>

          <div
            id="settings-category-detail"
            className="settings-detail-column"
            role="region"
            aria-label="Category settings"
          >
            {selectedCategory ? (
              <CategoryDetailPane
                key={selectedCategory.id}
                category={selectedCategory}
                sources={sourcesByCategory.get(selectedCategory.id) ?? []}
                uid={user.id}
                onReload={() => void reload()}
                getAccessToken={getAccessToken}
                categories={categories}
                forceRenameToken={renameRequestId === selectedCategory.id ? renameRequestToken : 0}
                forceDeleteToken={deleteRequestId === selectedCategory.id ? deleteRequestToken : 0}
              />
            ) : (
              <div className="card settings-detail settings-detail--empty">
                <p className="muted settings-empty-intro">
                  The best way to get started is to <strong>load Tammer's curated categories and sources</strong>.
                </p>
                <div className="settings-empty-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={tammerImportBusy}
                    onClick={() => void confirmTammerImport()}
                  >
                    {tammerImportBusy ? 'Importing…' : "Initiate with Tammer's settings"}
                  </button>
                </div>
                {tammerImportError ? (
                  <p className="form-error settings-empty-error" role="alert">
                    {tammerImportError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsPage() {
  return <SettingsScreen />
}
