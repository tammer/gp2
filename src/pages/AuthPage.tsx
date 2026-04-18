import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { EmailPasswordAuthForm } from '@/components/EmailPasswordAuthForm'
import { useAuth } from '@/lib/use-auth'
import { supabaseConfigured } from '@/lib/supabase'

export function AuthPage() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

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

  return (
    <div className="page page--narrow">
      <h1 className="page-title">{mode === 'signin' ? 'Sign in' : 'Sign up'}</h1>
      <p className="page-lead muted">Use your Supabase Auth credentials.</p>
      <EmailPasswordAuthForm defaultMode="signin" onModeChange={setMode} />
    </div>
  )
}
