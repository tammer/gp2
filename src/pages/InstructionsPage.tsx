import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { NewsArticleExclusion, UserInstructions } from '@/types/database'

type InstructionsTab = 'instructions' | 'exclusions'

export function InstructionsPage() {
  const { user, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<InstructionsTab>('instructions')

  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [exclusions, setExclusions] = useState<
    Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why'>[]
  >([])
  const [exclusionsLoading, setExclusionsLoading] = useState(false)
  const [exclusionsError, setExclusionsError] = useState<string | null>(null)

  const uid = user?.id

  const load = useCallback(async () => {
    if (!supabase || !uid) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('user_instructions')
      .select('id,user_id,instruction')
      .eq('user_id', uid)
      .maybeSingle()
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    const row = data as UserInstructions | null
    setInstruction(row?.instruction ?? '')
  }, [uid])

  const loadExclusions = useCallback(async () => {
    if (!supabase || !uid) return
    setExclusionsLoading(true)
    setExclusionsError(null)
    const { data: cats, error: catErr } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', uid)
    if (catErr) {
      setExclusionsLoading(false)
      setExclusionsError(catErr.message)
      setExclusions([])
      return
    }
    const ids = (cats ?? []).map((c: { id: string }) => c.id)
    if (ids.length === 0) {
      setExclusions([])
      setExclusionsLoading(false)
      return
    }
    const { data, error: exErr } = await supabase
      .from('news_article_exclusions')
      .select('category_id,url,why')
      .in('category_id', ids)
      .order('excluded_at', { ascending: false })
      .limit(25)
    setExclusionsLoading(false)
    if (exErr) {
      setExclusionsError(exErr.message)
      setExclusions([])
      return
    }
    setExclusions((data ?? []) as Pick<NewsArticleExclusion, 'category_id' | 'url' | 'why'>[])
  }, [uid])

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setLoading(false)
      return
    }
    void load()
  }, [uid, load])

  useEffect(() => {
    if (tab !== 'exclusions' || !uid || !supabaseConfigured) return
    void loadExclusions()
  }, [tab, uid, loadExclusions])

  function startEdit() {
    setSuccess(null)
    setError(null)
    setDraft(instruction)
    setEditing(true)
  }

  function cancelEdit() {
    setDraft(instruction)
    setEditing(false)
    setError(null)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !uid) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const { error: err } = await supabase.from('user_instructions').upsert(
      { user_id: uid, instruction: draft },
      { onConflict: 'user_id' },
    )
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setInstruction(draft)
    setEditing(false)
    setSuccess('Saved.')
    void load()
  }

  const tabButtons = useMemo(
    () =>
      (
        [
          { id: 'instructions' as const, label: 'Instructions' },
          { id: 'exclusions' as const, label: 'Exclusions' },
        ] as const
      ).map((b) => (
        <button
          key={b.id}
          type="button"
          className={`btn view-toggle__btn${tab === b.id ? ' view-toggle__btn--active' : ''}`}
          aria-pressed={tab === b.id}
          onClick={() => setTab(b.id)}
        >
          {b.label}
        </button>
      )),
    [tab],
  )

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <h1 className="page-title">Instructions</h1>
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
    <div className={`page${tab === 'instructions' ? ' page--narrow' : ''}`}>
      <h1 className="page-title">Filtering</h1>
      <div className="view-toggle instructions-page__tabs" role="group" aria-label="Instructions sections">
        {tabButtons}
      </div>
      {tab === 'instructions' ? (
        <p className="page-lead muted">Tell the AI what content to filter out.</p>
      ) : (
        <p className="page-lead muted">
          The 25 most recent article exclusions across your categories (newest first).
        </p>
      )}

      {tab === 'instructions' ? (
        loading ? (
          <p className="muted">Loading…</p>
        ) : editing ? (
          <form className="form-stack" onSubmit={onSave}>
            <label className="field">
              <span className="field__label">Markdown</span>
              <textarea
                className="textarea textarea--instruction"
                rows={16}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`## Tone
Summarize in a neutral voice…

- Bullet points welcome
- Use **bold** for emphasis`}
                spellCheck
              />
            </label>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn--ghost" disabled={saving} onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="instruction-view">
              <div className="instruction-view__toolbar">
                <button type="button" className="btn btn--primary" onClick={startEdit}>
                  {instruction.trim() ? 'Edit' : 'Add instructions'}
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
              {instruction.trim() ? (
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
                    {instruction}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="instruction-empty muted">
                  <p>
                    No instructions yet. Click <strong>Add instructions</strong> to write markdown for your pipeline.
                  </p>
                </div>
              )}
            </div>
          </>
        )
      ) : exclusionsLoading ? (
        <p className="muted">Loading exclusions…</p>
      ) : exclusionsError ? (
        <p className="inline-error" role="alert">
          {exclusionsError}
        </p>
      ) : exclusions.length === 0 ? (
        <div className="empty-state">
          <p>No exclusions yet, or you have no categories.</p>
        </div>
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
              {exclusions.map((row) => (
                <tr key={`${row.category_id}:${row.url}`}>
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
  )
}
