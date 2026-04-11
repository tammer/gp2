import { useContext } from 'react'
import { AuthContext, type AuthState } from '@/lib/auth-context'

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
