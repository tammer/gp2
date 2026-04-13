import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category, NewsArticleExclusion, Source } from '@/types/database'

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

type ExclusionRow = Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why' | 'excluded_at'>

function CategoryBlock({
  category,
  sources,
  uid,
  onReload,
}: {
  category: Category
  sources: Source[]
  uid: string
  onReload: () => void
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

  const [url, setUrl] = useState('')
  const [useRss, setUseRss] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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

  async function onAddSource(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    const u = url.trim()
    if (!u) {
      setAddError('URL is required.')
      return
    }
    if (!isProbablyUrl(u)) {
      setAddError('Enter a valid http(s) URL.')
      return
    }
    if (!supabase) return
    setAddBusy(true)
    const { error: err } = await supabase.from('sources').insert({
      user_id: uid,
      url: u,
      use_rss: useRss,
      category_id: category.id,
    })
    setAddBusy(false)
    if (err) {
      setAddError(err.message)
      return
    }
    setUrl('')
    setUseRss(false)
    onReload()
  }

  async function removeSource(id: string) {
    if (!supabase) return
    if (!confirm('Delete this source?')) return
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setAddError(err.message)
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
    <section className="card settings-category" aria-labelledby={`cat-heading-${category.id}`}>
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
        <p className="muted settings-category__hint">
          Markdown rules for this category (filtering, tone, what to exclude). Applies to all sources in this category.
        </p>
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
        <form className="form-grid settings-category__add-source" onSubmit={onAddSource}>
          <label className="field field--full">
            <span className="field__label">Add source URL</span>
            <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field field--checkbox">
            <input type="checkbox" checked={useRss} onChange={(e) => setUseRss(e.target.checked)} />
            <span>Use RSS</span>
          </label>
          {addError ? (
            <p className="form-error field--full" role="alert">
              {addError}
            </p>
          ) : null}
          <div className="field--full">
            <button type="submit" className="btn btn--primary" disabled={addBusy}>
              {addBusy ? 'Adding…' : 'Add source'}
            </button>
          </div>
        </form>
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

function UncategorizedBlock({
  sources,
  uid,
  onReload,
}: {
  sources: Source[]
  uid: string
  onReload: () => void
}) {
  const [url, setUrl] = useState('')
  const [useRss, setUseRss] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function onAddSource(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    const u = url.trim()
    if (!u) {
      setAddError('URL is required.')
      return
    }
    if (!isProbablyUrl(u)) {
      setAddError('Enter a valid http(s) URL.')
      return
    }
    if (!supabase) return
    setAddBusy(true)
    const { error: err } = await supabase.from('sources').insert({
      user_id: uid,
      url: u,
      use_rss: useRss,
      category_id: null,
    })
    setAddBusy(false)
    if (err) {
      setAddError(err.message)
      return
    }
    setUrl('')
    setUseRss(false)
    onReload()
  }

  async function removeSource(id: string) {
    if (!supabase) return
    if (!confirm('Delete this source?')) return
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setAddError(err.message)
      return
    }
    onReload()
  }

  return (
    <section className="card settings-category settings-category--uncategorized" aria-labelledby="uncat-heading">
      <div className="settings-category__header">
        <h2 id="uncat-heading" className="settings-category__title">
          Uncategorized
        </h2>
      </div>
      <p className="muted settings-category__hint">
        Sources without a category. Add new uncategorized feeds here, or add under a category above.
      </p>
      <form className="form-grid settings-category__add-source" onSubmit={onAddSource}>
        <label className="field field--full">
          <span className="field__label">Add source URL (no category)</span>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="field field--checkbox">
          <input type="checkbox" checked={useRss} onChange={(e) => setUseRss(e.target.checked)} />
          <span>Use RSS</span>
        </label>
        {addError ? (
          <p className="form-error field--full" role="alert">
            {addError}
          </p>
        ) : null}
        <div className="field--full">
          <button type="submit" className="btn btn--primary" disabled={addBusy}>
            {addBusy ? 'Adding…' : 'Add source'}
          </button>
        </div>
      </form>
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
    </section>
  )
}

export function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatInstruction, setNewCatInstruction] = useState('')
  const [addCatBusy, setAddCatBusy] = useState(false)
  const [addCatError, setAddCatError] = useState<string | null>(null)
  const addCategoryDialogRef = useRef<HTMLDialogElement>(null)

  const uid = user?.id

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

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    const name = newCatName.trim()
    if (!supabase || !uid || !name) return
    setAddCatBusy(true)
    setAddCatError(null)
    const { error: err } = await supabase.from('categories').insert({
      user_id: uid,
      name,
      instruction: newCatInstruction,
    })
    setAddCatBusy(false)
    if (err) {
      setAddCatError(err.message)
      return
    }
    closeAddCategoryModal()
    void reload()
  }

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
        Categories, filtering instructions per category, sources, and recent article exclusions.
      </p>

      <div className="settings-page__toolbar">
        <button type="button" className="btn btn--primary" onClick={openAddCategoryModal}>
          Add category
        </button>
      </div>

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
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <p>No categories yet. Use Add category to create one.</p>
        </div>
      ) : (
        <div className="settings-category-list">
          {categories.map((c) => (
            <CategoryBlock
              key={c.id}
              category={c}
              sources={sourcesByCategory.map.get(c.id) ?? []}
              uid={user.id}
              onReload={() => void reload()}
            />
          ))}
        </div>
      )}

      {!loading ? (
        <UncategorizedBlock sources={sourcesByCategory.uncategorized} uid={user.id} onReload={() => void reload()} />
      ) : null}
    </div>
  )
}
