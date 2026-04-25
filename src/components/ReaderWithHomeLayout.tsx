import { Outlet } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'

export function ReaderWithHomeLayout() {
  return (
    <div className="reader-with-home">
      <HomePage />
      <Outlet />
    </div>
  )
}
