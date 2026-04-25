import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsScreen } from '@/pages/SettingsPage'

export function SettingsDrawerRoute() {
  const navigate = useNavigate()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (document.querySelector('.modal-dialog[open]')) return
      event.preventDefault()
      navigate('/')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <div className="settings-drawer">
      <button
        type="button"
        className="settings-drawer__backdrop"
        aria-label="Close settings"
        onClick={() => navigate('/')}
      />
      <section
        className="settings-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <header className="settings-drawer__header">
          <h1 id="settings-dialog-title" className="settings-drawer__title">
            Settings
          </h1>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => navigate('/')}
          >
            Close
          </button>
        </header>
        <SettingsScreen embedded />
      </section>
    </div>
  )
}
