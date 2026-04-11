import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { UserInstructions } from '@/types/database'

export function InstructionsPage() {
  const { user, loading: authLoading } = useAuth()
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  useEffect(() => {
    if (!uid || !supabaseConfigured) {
      setLoading(false)
      return
    }
    void load()
  }, [uid, load])

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
    <div className="page page--narrow">
      <h1 className="page-title">Global instructions</h1>
      <p className="page-lead muted">
        Text you save here is for your ingestion pipeline (not used by this app). It is stored in{' '}
        <code>user_instructions</code>. Use markdown for structure.
      </p>
      {loading ? (
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
                <p>No instructions yet. Click <strong>Add instructions</strong> to write markdown for your pipeline.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
