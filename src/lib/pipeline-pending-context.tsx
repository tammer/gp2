import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/use-auth'

export type PipelinePendingContextValue = {
  pendingPipelineRunCount: number
  notifyRunAccepted: () => void
  notifyRunSettled: () => void
}

const PipelinePendingContext = createContext<PipelinePendingContextValue | null>(null)

export function PipelinePendingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [pendingPipelineRunCount, setCount] = useState(0)

  useEffect(() => {
    if (!user) setCount(0)
  }, [user])

  const notifyRunAccepted = useCallback(() => {
    setCount((n) => n + 1)
  }, [])

  const notifyRunSettled = useCallback(() => {
    setCount((n) => Math.max(0, n - 1))
  }, [])

  const value = useMemo(
    () => ({ pendingPipelineRunCount, notifyRunAccepted, notifyRunSettled }),
    [pendingPipelineRunCount, notifyRunAccepted, notifyRunSettled],
  )

  return <PipelinePendingContext.Provider value={value}>{children}</PipelinePendingContext.Provider>
}

export function usePipelinePending(): PipelinePendingContextValue {
  const ctx = useContext(PipelinePendingContext)
  if (!ctx) throw new Error('usePipelinePending must be used within PipelinePendingProvider')
  return ctx
}
