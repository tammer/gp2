import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/use-auth'
import { EnvBanner } from '@/components/EnvBanner'

export function AppLayout() {
  const { signOut, user } = useAuth()
  const { pathname } = useLocation()
  const landingShell = pathname === '/' && !user

  return (
    <div className="app">
      <EnvBanner />
      <header className="app-header">
        <div className="app-header__brand">
          <NavLink to="/" className="app-header__title-link" end>
            <span className="app-header__title">Gistprism</span>
          </NavLink>
        </div>
        {user ? (
          <nav className="app-nav" aria-label="Main">
            <button type="button" className="btn btn--ghost app-nav__signout" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        ) : (
          <nav className="app-nav" aria-label="Main">
            <NavLink to="/auth" className="app-nav__link">
              Sign in
            </NavLink>
          </nav>
        )}
      </header>
      <main className={`app-main${landingShell ? ' app-main--landing' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}
