import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/lib/auth-provider'
import { PipelinePendingProvider } from '@/lib/pipeline-pending-context'
import { App } from '@/App'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PipelinePendingProvider>
          <App />
        </PipelinePendingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
