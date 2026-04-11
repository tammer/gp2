import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { AuthPage } from '@/pages/AuthPage'
import { HomePage } from '@/pages/HomePage'
import { InstructionsPage } from '@/pages/InstructionsPage'
import { SourcesPage } from '@/pages/SourcesPage'

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/instructions" element={<InstructionsPage />} />
        <Route path="/sources" element={<SourcesPage />} />
      </Route>
    </Routes>
  )
}
