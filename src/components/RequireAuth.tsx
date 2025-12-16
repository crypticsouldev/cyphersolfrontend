import { Navigate, Outlet } from 'react-router-dom'
import { getAuthToken } from '../lib/auth'

export default function RequireAuth() {
  const token = getAuthToken()
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}
