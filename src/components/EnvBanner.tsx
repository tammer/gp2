import { supabaseConfigured } from '@/lib/supabase'

export function EnvBanner() {
  if (supabaseConfigured) return null
  return (
    <div className="env-banner" role="status">
      <strong>Configuration:</strong> Set <code>VITE_SUPABASE_URL</code> and{' '}
      <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> (see <code>.env.example</code>
      ).
    </div>
  )
}
