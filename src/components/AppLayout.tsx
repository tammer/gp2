import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/use-auth'
import { EnvBanner } from '@/components/EnvBanner'

export function AppLayout() {
  const { signOut, user } = useAuth()

  return (
    <div className="app">
      <EnvBanner />
      <header className="app-header">
        <div className="app-header__brand">
          <NavLink to="/" className="app-header__title-link" end>
            <span className="app-header__title">Gistprism</span>
          </NavLink>
          <span className="app-header__tagline">Personalized reading</span>
        </div>
        {user ? (
          <nav className="app-nav" aria-label="Main">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `app-nav__link${isActive ? ' active' : ''}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/instructions"
              className={({ isActive }) => `app-nav__link${isActive ? ' active' : ''}`}
            >
              Instructions
            </NavLink>
            <NavLink to="/sources" className={({ isActive }) => `app-nav__link${isActive ? ' active' : ''}`}>
              Sources
            </NavLink>
            <button type="button" className="btn btn--ghost app-nav__signout" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        ) : null}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
