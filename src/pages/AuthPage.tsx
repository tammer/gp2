import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/use-auth'
import { supabase, supabaseConfigured } from '@/lib/supabase'

export function AuthPage() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!supabaseConfigured) {
    return (
      <div className="page page--narrow">
        <h1 className="page-title">Sign in</h1>
        <p className="muted">Configure Supabase environment variables to enable authentication.</p>
      </div>
    )
  }

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

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
    <div className="page page--narrow">
      <h1 className="page-title">{mode === 'signin' ? 'Sign in' : 'Sign up'}</h1>
      <p className="page-lead muted">Use your Supabase Auth credentials.</p>
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
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        <button
          type="button"
          className="btn btn--link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setMessage(null)
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </p>
    </div>
  )
}
