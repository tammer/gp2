import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { UserInstructions } from '@/types/database'

export function InstructionsPage() {
  const { user, loading: authLoading } = useAuth()
  const [instruction, setInstruction] = useState('')
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

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !uid) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const { error: err } = await supabase.from('user_instructions').upsert(
      { user_id: uid, instruction },
      { onConflict: 'user_id' },
    )
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
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
        <code>user_instructions</code>.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="form-stack" onSubmit={onSave}>
          <label className="field">
            <span className="field__label">Instruction</span>
            <textarea
              className="textarea"
              rows={12}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Guidance for summarization, tone, topics to emphasize…"
            />
          </label>
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
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  )
}
