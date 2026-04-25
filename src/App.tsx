import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { ReaderWithHomeLayout } from '@/components/ReaderWithHomeLayout'
import { AuthPage } from '@/pages/AuthPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { SettingsDrawerRoute } from '@/pages/SettingsDrawerRoute'

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<ReaderWithHomeLayout />}>
          <Route path="settings" element={<SettingsDrawerRoute />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/instructions" element={<Navigate to="/settings" replace />} />
        <Route path="/sources" element={<Navigate to="/settings" replace />} />
      </Route>
    </Routes>
  )
}
