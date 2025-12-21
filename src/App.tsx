import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Analytics from './pages/Analytics'
import Credentials from './pages/Credentials'
import Dashboard from './pages/Dashboard'
import ExecutionDetail from './pages/ExecutionDetail'
import Editor from './pages/Editor'
import Login from './pages/Login'
import WorkflowExecutions from './pages/WorkflowExecutions'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/editor/:id" element={<Editor />} />
          <Route path="/workflows/:id/executions" element={<WorkflowExecutions />} />
          <Route path="/executions/:id" element={<ExecutionDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
