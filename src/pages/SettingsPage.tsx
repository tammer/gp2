import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
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
import { clearTammerImportPromptPending, isTammerImportPromptPending } from '@/lib/tammer-import-onboarding'
import type { Category, NewsArticleExclusion, Source } from '@/types/database'

type ExclusionRow = Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why' | 'excluded_at'>

function SettingsBackToHomeLink() {
  return (
    <p className="page-back">
      <Link to="/" className="page-back__link">
        ← Back to Articles
      </Link>
    </p>
  )
}

function CategoryDetailPane({
  category,
  sources,
  uid,
  onReload,
  getAccessToken,
}: {
  category: Category
  sources: Source[]
  uid: string
  onReload: () => void
  getAccessToken: () => Promise<string | null>
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
            <h2 id={`cat-heading-${category.id}`} className="settings-category__title">
              {category.name}
            </h2>
            <div className="settings-category__header-actions">
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setRenaming(true)} disabled={deleteBusy}>
                Rename
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small settings-category__delete-btn"
                onClick={() => void deleteCategory()}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete category'}
              </button>
            </div>
          </>
        )}
      </div>
      {deleteError ? (
        <p className="form-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      <div className="settings-category__section">
        <section
          className="settings-instructions-panel"
          aria-labelledby={`instructions-heading-${category.id}`}
        >
          <div className="settings-instructions-panel__header">
            <h3 id={`instructions-heading-${category.id}`} className="settings-instructions-panel__title">
              Instructions
            </h3>
            {!instrEditing ? (
              <div className="settings-instructions-panel__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={deleteBusy}
                  onClick={() => {
                    setInstrSuccess(null)
                    setInstrEditing(true)
                  }}
                >
                  {hasInstruction ? 'Edit Instructions' : 'Add instructions'}
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

      <div className="settings-category__section">
        <h3 className="settings-category__subheading">Sources</h3>
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
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
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
        <div className="settings-add-source-action">
          <button type="button" className="btn btn--primary" onClick={() => setAddSourceOpen(true)} disabled={deleteBusy}>
            Add source
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
      </div>

      <details className="settings-exclusions" onToggle={onExclusionsToggle}>
        <summary className="settings-exclusions__summary">Recent exclusions (10 newest)</summary>
        <div className="settings-exclusions__body">
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

export function SettingsPage() {
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const { user, loading: authLoading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatInstruction, setNewCatInstruction] = useState('')
  const [addCatBusy, setAddCatBusy] = useState(false)
  const [addCatError, setAddCatError] = useState<string | null>(null)
  const addCategoryDialogRef = useRef<HTMLDialogElement>(null)

  const tammerImportDialogRef = useRef<HTMLDialogElement>(null)
  const [tammerImportBusy, setTammerImportBusy] = useState(false)
  const [tammerImportError, setTammerImportError] = useState<string | null>(null)

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

  function closeTammerImportModal() {
    tammerImportDialogRef.current?.close()
  }

  function declineTammerImport() {
    clearTammerImportPromptPending()
    setTammerImportError(null)
    closeTammerImportModal()
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
      clearTammerImportPromptPending()
      closeTammerImportModal()
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

  useEffect(() => {
    if (loading || authLoading || !uid) return
    if (categories.length > 0) {
      clearTammerImportPromptPending()
      if (tammerImportDialogRef.current?.open) tammerImportDialogRef.current.close()
      return
    }
    if (!isTammerImportPromptPending()) return
    const d = tammerImportDialogRef.current
    if (!d || d.open) return
    setTammerImportError(null)
    d.showModal()
  }, [loading, authLoading, uid, categories.length])

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

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <SettingsBackToHomeLink />
        <h1 className="page-title">Settings</h1>
        <p className="muted">Configure Supabase first.</p>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="page">
        <SettingsBackToHomeLink />
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="page page--settings">
      <SettingsBackToHomeLink />
      <h1 className="page-title">Settings</h1>

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
        ref={tammerImportDialogRef}
        className="modal-dialog"
        aria-labelledby="tammer-import-modal-title"
        onCancel={(e) => {
          e.preventDefault()
        }}
        onClose={() => {
          setTammerImportError(null)
        }}
      >
        <div className="modal-dialog__panel">
          <header className="modal-dialog__header">
            <h2 id="tammer-import-modal-title" className="modal-dialog__title">
              Import Tammer&apos;s filters?
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={tammerImportBusy}
              onClick={() => declineTammerImport()}
              aria-label="Close"
            >
              Close
            </button>
          </header>
          <div className="form-grid">
            <p className="field--full muted">
              Add Tammer&apos;s curated categories and sources to your account. You can edit or delete them afterward
              in Settings.
            </p>
            {tammerImportError ? (
              <p className="form-error field--full" role="alert">
                {tammerImportError}
              </p>
            ) : null}
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--ghost" disabled={tammerImportBusy} onClick={() => declineTammerImport()}>
                No thanks
              </button>
              <button type="button" className="btn btn--primary" disabled={tammerImportBusy} onClick={() => void confirmTammerImport()}>
                {tammerImportBusy ? 'Importing…' : 'Yes, import'}
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
                <button
                  key={c.id}
                  type="button"
                  className={`settings-nav__item${selectedId === c.id ? ' settings-nav__item--active' : ''}`}
                  aria-current={selectedId === c.id ? 'page' : undefined}
                  aria-controls="settings-category-detail"
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </nav>
            <div className="settings-sidebar__footer">
              <button type="button" className="btn btn--primary btn--small settings-sidebar__add-cat" onClick={openAddCategoryModal}>
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
              />
            ) : (
              <div className="card settings-detail settings-detail--empty">
                <p className="muted">
                  No categories yet. Use <strong>Add category</strong> in the sidebar to create one.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
