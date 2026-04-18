import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

type EmailPasswordAuthFormProps = {
  defaultMode?: Mode
  submitButtonClassName?: string
  onModeChange?: (mode: Mode) => void
}

export function EmailPasswordAuthForm({
  defaultMode = 'signin',
  submitButtonClassName,
  onModeChange,
}: EmailPasswordAuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!supabase) return
    setPending(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setMessage('Check your email to confirm your account, if required by your project settings.')
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        <button type="submit" className={submitButtonClassName ?? 'btn btn--primary'} disabled={pending}>
          {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        <button
          type="button"
          className="btn btn--link"
          onClick={() => {
            const next = mode === 'signin' ? 'signup' : 'signin'
            setMode(next)
            onModeChange?.(next)
            setError(null)
            setMessage(null)
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </p>
    </>
  )
}
