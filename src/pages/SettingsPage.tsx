import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { AddSourceModal } from '@/components/AddSourceModal'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category, NewsArticleExclusion, Source } from '@/types/database'

type ExclusionRow = Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why' | 'excluded_at'>

type SettingsSelection = string | 'uncategorized'

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
    if (!supabase) return
    if (!confirm('Delete this source?')) return
    setSourceActionError(null)
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setSourceActionError(err.message)
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
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setRenaming(true)}>
              Rename
            </button>
          </>
        )}
      </div>

      <div className="settings-category__section">
        <h3 className="settings-category__subheading">Instructions</h3>
        {instrEditing ? (
          <form className="form-stack" onSubmit={saveInstruction}>
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
              <button type="submit" className="btn btn--primary" disabled={instrBusy}>
                {instrBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={instrBusy}
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
          <div className="instruction-view">
            {instrSuccess ? (
              <p className="form-success" role="status">
                {instrSuccess}
              </p>
            ) : null}
            {category.instruction.trim() ? (
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
            ) : (
              <p className="muted">No instructions yet.</p>
            )}
            <div className="instruction-view__toolbar">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setInstrSuccess(null)
                  setInstrEditing(true)
                }}
              >
                {category.instruction.trim() ? 'Edit' : 'Add instructions'}
              </button>
            </div>
          </div>
        )}
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
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void removeSource(s.id)}>
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
          <button type="button" className="btn btn--primary" onClick={() => setAddSourceOpen(true)}>
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

function UncategorizedDetailPane({
  sources,
  uid,
  onReload,
  getAccessToken,
}: {
  sources: Source[]
  uid: string
  onReload: () => void
  getAccessToken: () => Promise<string | null>
}) {
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [sourceActionError, setSourceActionError] = useState<string | null>(null)

  async function removeSource(id: string) {
    if (!supabase) return
    if (!confirm('Delete this source?')) return
    setSourceActionError(null)
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setSourceActionError(err.message)
      return
    }
    onReload()
  }

  return (
    <section className="card settings-detail settings-category settings-category--uncategorized" aria-labelledby="uncat-heading">
      <div className="settings-category__header">
        <h2 id="uncat-heading" className="settings-category__title">
          Uncategorized
        </h2>
      </div>
      <p className="muted settings-category__hint">
        Sources without a category. Article exclusions are tracked per category, so they do not apply here.
      </p>
      <div className="settings-category__section">
        <h3 className="settings-category__subheading">Sources</h3>
        {sources.length === 0 ? (
          <p className="muted">No uncategorized sources.</p>
        ) : (
          <div className="sources-table-wrap">
            <table className="sources-table">
              <caption className="sr-only">Uncategorized sources</caption>
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
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void removeSource(s.id)}>
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
          <button type="button" className="btn btn--primary" onClick={() => setAddSourceOpen(true)}>
            Add source
          </button>
        </div>
        <AddSourceModal
          open={addSourceOpen}
          onClose={() => setAddSourceOpen(false)}
          categoryId={null}
          categoryLabel="Uncategorized"
          userId={uid}
          getAccessToken={getAccessToken}
          onSuccess={onReload}
        />
      </div>
    </section>
  )
}

export function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<SettingsSelection | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatInstruction, setNewCatInstruction] = useState('')
  const [addCatBusy, setAddCatBusy] = useState(false)
  const [addCatError, setAddCatError] = useState<string | null>(null)
  const addCategoryDialogRef = useRef<HTMLDialogElement>(null)

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

  const sourcesByCategory = useMemo(() => {
    const map = new Map<string, Source[]>()
    for (const c of categories) map.set(c.id, [])
    const uncategorized: Source[] = []
    for (const s of sources) {
      if (s.category_id && map.has(s.category_id)) {
        map.get(s.category_id)!.push(s)
      } else {
        uncategorized.push(s)
      }
    }
    return { map, uncategorized }
  }, [categories, sources])

  const uncategorizedCount = sourcesByCategory.uncategorized.length

  useEffect(() => {
    if (loading) return

    if (categories.length === 0) {
      if (selectedId !== 'uncategorized') setSelectedId('uncategorized')
      return
    }

    if (selectedId === null) {
      setSelectedId(categories[0]!.id)
      return
    }

    if (selectedId === 'uncategorized') return

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

  const selectedCategory = useMemo(
    () => (selectedId && selectedId !== 'uncategorized' ? categories.find((c) => c.id === selectedId) : undefined),
    [categories, selectedId],
  )

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <h1 className="page-title">Settings</h1>
        <p className="muted">Configure Supabase first.</p>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="page page--settings">
      <h1 className="page-title">Settings</h1>
      <p className="page-lead muted">
        Pick a category to edit instructions, sources, and exclusions. Use Uncategorized for feeds without a category.
      </p>

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
                className="textarea"
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

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="settings-layout">
          <aside className="settings-sidebar" aria-label="Category list">
            <nav className="settings-nav" aria-label="Categories">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`settings-nav__item${selectedId === c.id ? ' settings-nav__item--active' : ''}`}
                  aria-current={selectedId === c.id ? 'page' : undefined}
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                className={`settings-nav__item settings-nav__item--secondary${
                  selectedId === 'uncategorized' ? ' settings-nav__item--active' : ''
                }`}
                aria-current={selectedId === 'uncategorized' ? 'page' : undefined}
                onClick={() => setSelectedId('uncategorized')}
              >
                Uncategorized
                {uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}
              </button>
            </nav>
            <div className="settings-sidebar__footer">
              <button type="button" className="btn btn--primary btn--small settings-sidebar__add-cat" onClick={openAddCategoryModal}>
                Add category
              </button>
            </div>
          </aside>

          <div className="settings-detail-column">
            {selectedId === 'uncategorized' ? (
              <>
                {categories.length === 0 ? (
                  <p className="muted settings-detail__intro">
                    No categories yet. Use <strong>Add category</strong> in the sidebar to create one, or add uncategorized
                    sources below.
                  </p>
                ) : null}
                <UncategorizedDetailPane
                  key="uncategorized"
                  sources={sourcesByCategory.uncategorized}
                  uid={user.id}
                  onReload={() => void reload()}
                  getAccessToken={getAccessToken}
                />
              </>
            ) : selectedCategory ? (
              <CategoryDetailPane
                key={selectedCategory.id}
                category={selectedCategory}
                sources={sourcesByCategory.map.get(selectedCategory.id) ?? []}
                uid={user.id}
                onReload={() => void reload()}
                getAccessToken={getAccessToken}
              />
            ) : (
              <div className="card settings-detail settings-detail--empty">
                <p className="muted">Select a category.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
