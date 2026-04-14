import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ArticleCard } from '@/components/ArticleCard'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { Category, NewsArticle } from '@/types/database'

type ListView = 'unread' | 'read' | 'saved'

export function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<string>('')
  const [listView, setListView] = useState<ListView>('unread')
  const [articles, setArticles] = useState<NewsArticle[]>([])

  const [catLoading, setCatLoading] = useState(true)
  const [catError, setCatError] = useState<string | null>(null)
  const [artLoading, setArtLoading] = useState(false)
  const [artError, setArtError] = useState<string | null>(null)
  const [busyReadId, setBusyReadId] = useState<string | null>(null)
  const [busySavedId, setBusySavedId] = useState<string | null>(null)
  const editFilterDialogRef = useRef<HTMLDialogElement | null>(null)
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [filterDraft, setFilterDraft] = useState('')
  const [filterBusy, setFilterBusy] = useState(false)
  const [filterError, setFilterError] = useState<string | null>(null)

  const uid = user?.id

  const loadCategories = useCallback(async () => {
    if (!supabase || !uid) return
    setCatLoading(true)
    setCatError(null)
    const { data, error } = await supabase
      .from('categories')
      .select('id,user_id,name,instruction')
      .eq('user_id', uid)
      .order('name', { ascending: true })
    setCatLoading(false)
    if (error) {
      setCatError(error.message)
      return
    }
    const rows = (data ?? []) as Category[]
    setCategories(rows)
    setCategoryId((prev) => {
      if (prev && rows.some((c) => c.id === prev)) return prev
      return rows[0]?.id ?? ''
    })
  }, [uid])

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setCatLoading(false)
      return
    }
    void loadCategories()
  }, [uid, loadCategories])

  const loadArticles = useCallback(async () => {
    if (!supabase || !uid || !categoryId) {
      setArticles([])
      return
    }
    setArtLoading(true)
    setArtError(null)

    let q = supabase
      .from('news_articles')
      .select(
        'id,user_id,category_id,url,headline,article_date,source,short_summary,full_summary,read,saved,inserted_at,updated_at',
      )
      .eq('user_id', uid)
      .eq('category_id', categoryId)
      .order('article_date', { ascending: false, nullsFirst: false })

    if (listView === 'unread') q = q.eq('read', false)
    else if (listView === 'read') q = q.eq('read', true)
    else q = q.eq('saved', true)

    const { data, error } = await q
    setArtLoading(false)
    if (error) {
      setArtError(error.message)
      setArticles([])
      return
    }
    setArticles((data ?? []) as NewsArticle[])
  }, [uid, categoryId, listView])

  useEffect(() => {
    if (!uid || !categoryId) {
      setArticles([])
      return
    }
    void loadArticles()
  }, [uid, categoryId, listView, loadArticles])

  async function patchArticle(id: string, patch: Partial<Pick<NewsArticle, 'read' | 'saved'>>) {
    if (!supabase || !uid) return
    const { error } = await supabase.from('news_articles').update(patch).eq('id', id).eq('user_id', uid)
    if (error) throw error
  }

  async function handleSetRead(id: string, read: boolean) {
    setBusyReadId(id)
    setArtError(null)
    try {
      await patchArticle(id, { read })
      await loadArticles()
    } catch (e: unknown) {
      setArtError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyReadId(null)
    }
  }

  async function handleToggleSaved(id: string, currentlySaved: boolean) {
    setBusySavedId(id)
    setArtError(null)
    try {
      await patchArticle(id, { saved: !currentlySaved })
      await loadArticles()
    } catch (e: unknown) {
      setArtError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusySavedId(null)
    }
  }

  const filterCategory = useMemo(
    () => (filterCategoryId ? categories.find((c) => c.id === filterCategoryId) ?? null : null),
    [categories, filterCategoryId],
  )

  function openEditFilterModal(articleCategoryId: string) {
    const category = categories.find((c) => c.id === articleCategoryId)
    if (!category) return
    setFilterCategoryId(category.id)
    setFilterDraft(category.instruction)
    setFilterError(null)
    const dialog = editFilterDialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }

  function closeEditFilterModal() {
    if (filterBusy) return
    editFilterDialogRef.current?.close()
  }

  function onEditFilterDialogClose() {
    setFilterCategoryId(null)
    setFilterDraft('')
    setFilterError(null)
  }

  async function handleSaveFilter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || !uid || !filterCategory) return
    setFilterBusy(true)
    setFilterError(null)
    const { error } = await supabase
      .from('categories')
      .update({ instruction: filterDraft })
      .eq('id', filterCategory.id)
      .eq('user_id', uid)
    setFilterBusy(false)
    if (error) {
      setFilterError(error.message)
      return
    }
    await loadCategories()
    editFilterDialogRef.current?.close()
  }

  const viewButtons = useMemo(
    () =>
      (
        [
          { id: 'unread' as const, label: 'Unread' },
          { id: 'read' as const, label: 'Read' },
          { id: 'saved' as const, label: 'Saved' },
        ] as const
      ).map((b) => (
        <button
          key={b.id}
          type="button"
          className={`btn view-toggle__btn${listView === b.id ? ' view-toggle__btn--active' : ''}`}
          aria-pressed={listView === b.id}
          onClick={() => setListView(b.id)}
        >
          {b.label}
        </button>
      )),
    [listView],
  )

  if (!supabaseConfigured) {
    return (
      <div className="page">
        <p className="muted">Configure Supabase to load articles.</p>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="page">
        <p className="muted" aria-live="polite">
          Loading session…
        </p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="page">
      <dialog
        ref={editFilterDialogRef}
        className="modal-dialog"
        aria-labelledby="edit-filter-modal-title"
        onClose={onEditFilterDialogClose}
        onCancel={(e) => {
          if (filterBusy) e.preventDefault()
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeEditFilterModal()
        }}
      >
        <div className="modal-dialog__panel">
          <header className="modal-dialog__header">
            <h2 id="edit-filter-modal-title" className="modal-dialog__title">
              Edit Filter
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={filterBusy}
              onClick={closeEditFilterModal}
              aria-label="Close"
            >
              Close
            </button>
          </header>
          <form className="form-stack" onSubmit={handleSaveFilter}>
            <p className="muted">
              Category: <strong>{filterCategory?.name ?? 'Unknown'}</strong>
            </p>
            <label className="field">
              <span className="field__label">Instructions (markdown)</span>
              <textarea
                className="textarea textarea--instruction"
                rows={10}
                value={filterDraft}
                onChange={(e) => setFilterDraft(e.target.value)}
                disabled={filterBusy}
                spellCheck
              />
            </label>
            {filterError ? (
              <p className="form-error" role="alert">
                {filterError}
              </p>
            ) : null}
            <div className="modal-dialog__footer">
              <button type="button" className="btn btn--ghost" disabled={filterBusy} onClick={closeEditFilterModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={filterBusy || !filterCategory}>
                {filterBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <section className="reader-controls" aria-label="Filters">
        <div className="reader-controls__row">
          <select
            className="select reader-controls__category-select"
            aria-label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={catLoading || categories.length === 0}
          >
            {categories.length === 0 ? <option value="">—</option> : null}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="view-toggle" role="group" aria-label="Article list view">
            {viewButtons}
          </div>
        </div>
      </section>

      {catError ? (
        <p className="inline-error" role="alert">
          {catError}
        </p>
      ) : null}

      {catLoading ? (
        <p className="muted">Loading categories…</p>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <p>
            <strong>No categories yet.</strong> Add categories in Settings, or wait until your ingestion pipeline
            creates them. Articles are grouped by category.
          </p>
        </div>
      ) : artLoading ? (
        <p className="muted">Loading articles…</p>
      ) : artError ? (
        <p className="inline-error" role="alert">
          {artError}
        </p>
      ) : articles.length === 0 ? (
        <div className="empty-state">
          <p>No articles in this view for the selected category.</p>
        </div>
      ) : (
        <ul className="article-list">
          {articles.map((a) => (
            <li key={a.id}>
              <ArticleCard
                article={a}
                view={listView}
                onSetRead={handleSetRead}
                onToggleSaved={handleToggleSaved}
                onEditFilter={openEditFilterModal}
                busyRead={busyReadId === a.id}
                busySaved={busySavedId === a.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
