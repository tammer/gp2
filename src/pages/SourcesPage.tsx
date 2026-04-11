import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category, Source } from '@/types/database'

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function SourcesPage() {
  const { user, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [url, setUrl] = useState('')
  const [useRss, setUseRss] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [editUseRss, setEditUseRss] = useState(false)
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const uid = user?.id

  const loadCategories = useCallback(async () => {
    if (!supabase || !uid) return
    const { data, error: err } = await supabase
      .from('categories')
      .select('id,user_id,name')
      .eq('user_id', uid)
      .order('name', { ascending: true })
    if (!err) setCategories((data ?? []) as Category[])
  }, [uid])

  const load = useCallback(async () => {
    if (!supabase || !uid) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('sources')
      .select('id,user_id,url,use_rss,category_id,instruction')
      .eq('user_id', uid)
      .order('url', { ascending: true })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setRows((data ?? []) as Source[])
  }, [uid])

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setLoading(false)
      return
    }
    void loadCategories()
    void load()
  }, [uid, load, loadCategories])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const u = url.trim()
    if (!u) {
      setFormError('URL is required.')
      return
    }
    if (!isProbablyUrl(u)) {
      setFormError('Enter a valid http(s) URL.')
      return
    }
    if (!supabase || !uid) return
    setAdding(true)
    const { error: err } = await supabase.from('sources').insert({
      user_id: uid,
      url: u,
      use_rss: useRss,
      category_id: categoryId || null,
      instruction,
    })
    setAdding(false)
    if (err) {
      setFormError(err.message)
      return
    }
    setUrl('')
    setUseRss(false)
    setCategoryId('')
    setInstruction('')
    void load()
  }

  function startEdit(s: Source) {
    setEditingId(s.id)
    setEditUrl(s.url)
    setEditUseRss(s.use_rss)
    setEditCategoryId(s.category_id ?? '')
    setEditInstruction(s.instruction)
    setFormError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setFormError(null)
  }

  async function saveEdit() {
    const u = editUrl.trim()
    if (!u) {
      setFormError('URL is required.')
      return
    }
    if (!isProbablyUrl(u)) {
      setFormError('Enter a valid http(s) URL.')
      return
    }
    if (!supabase || !uid || !editingId) return
    setEditBusy(true)
    setFormError(null)
    const { error: err } = await supabase
      .from('sources')
      .update({
        url: u,
        use_rss: editUseRss,
        category_id: editCategoryId || null,
        instruction: editInstruction,
      })
      .eq('id', editingId)
      .eq('user_id', uid)
    setEditBusy(false)
    if (err) {
      setFormError(err.message)
      return
    }
    setEditingId(null)
    void load()
  }

  async function removeRow(id: string) {
    if (!supabase || !uid) return
    if (!confirm('Delete this source?')) return
    const { error: err } = await supabase.from('sources').delete().eq('id', id).eq('user_id', uid)
    if (err) {
      setError(err.message)
      return
    }
    void load()
  }

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <h1 className="page-title">Sources</h1>
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
    <div className="page">
      <h1 className="page-title">Sources</h1>
      <p className="page-lead muted">
        Feeds and pages for your external ingestor. Optionally assign each source to a category from your list (same
        rows as on the home page) so your pipeline can route articles by <code>category_id</code>.
      </p>

      <section className="card" aria-labelledby="add-source-heading">
        <h2 id="add-source-heading" className="card__title">
          Add source
        </h2>
        <form className="form-grid" onSubmit={onAdd}>
          <label className="field">
            <span className="field__label">URL</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} type="url" required />
          </label>
          <label className="field field--checkbox">
            <input type="checkbox" checked={useRss} onChange={(e) => setUseRss(e.target.checked)} />
            <span>Use RSS</span>
          </label>
          <label className="field">
            <span className="field__label">Category</span>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--full">
            <span className="field__label">Per-source instruction</span>
            <textarea
              className="textarea"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          {formError && !editingId ? (
            <p className="form-error field--full" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="field--full">
            <button type="submit" className="btn btn--primary" disabled={adding}>
              {adding ? 'Adding…' : 'Add source'}
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading sources…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No sources yet. Add one above.</p>
        </div>
      ) : (
        <div className="sources-table-wrap">
          <table className="sources-table">
            <caption className="sr-only">Your sources</caption>
            <thead>
              <tr>
                <th scope="col">URL</th>
                <th scope="col">RSS</th>
                <th scope="col">Category</th>
                <th scope="col">Instruction</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={5}>
                      <div className="edit-inline">
                        <label className="field">
                          <span className="field__label">URL</span>
                          <input className="input" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                        </label>
                        <label className="field field--checkbox">
                          <input
                            type="checkbox"
                            checked={editUseRss}
                            onChange={(e) => setEditUseRss(e.target.checked)}
                          />
                          <span>Use RSS</span>
                        </label>
                        <label className="field">
                          <span className="field__label">Category</span>
                          <select
                            className="input"
                            value={editCategoryId}
                            onChange={(e) => setEditCategoryId(e.target.value)}
                          >
                            <option value="">None</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field field--full">
                          <span className="field__label">Instruction</span>
                          <textarea
                            className="textarea"
                            rows={2}
                            value={editInstruction}
                            onChange={(e) => setEditInstruction(e.target.value)}
                          />
                        </label>
                        {formError ? (
                          <p className="form-error" role="alert">
                            {formError}
                          </p>
                        ) : null}
                        <div className="edit-inline__actions">
                          <button type="button" className="btn btn--primary" disabled={editBusy} onClick={() => void saveEdit()}>
                            Save
                          </button>
                          <button type="button" className="btn btn--ghost" disabled={editBusy} onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    </td>
                    <td>{s.use_rss ? 'Yes' : 'No'}</td>
                    <td>
                      {s.category_id ? categories.find((c) => c.id === s.category_id)?.name ?? '—' : '—'}
                    </td>
                    <td className="sources-table__instruction">{s.instruction || '—'}</td>
                    <td className="sources-table__actions">
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => void removeRow(s.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
