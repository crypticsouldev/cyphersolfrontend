import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createWorkflow, listWorkflows, signout, type ApiError, type Workflow } from '../lib/api'
import { clearAuthToken } from '../lib/auth'

export default function Dashboard() {
  const navigate = useNavigate()

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function load() {
    setError(undefined)
    try {
      const res = await listWorkflows()
      setWorkflows(res.workflows)
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate() {
    setBusy(true)
    setError(undefined)
    try {
      const res = await createWorkflow('untitled workflow', { nodes: [], edges: [] })
      navigate(`/editor/${res.workflow.id}`)
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(undefined)
    try {
      await signout()
    } catch {
    } finally {
      clearAuthToken()
      setBusy(false)
      navigate('/login', { replace: true })
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Workflows</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to="/credentials"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: '#fff',
              textDecoration: 'none',
              color: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            credentials
          </Link>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff' }}
          >
            {busy ? 'working...' : 'new workflow'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
          >
            logout
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10 }}>
        {workflows.length === 0 ? (
          <div style={{ padding: 16, color: '#555' }}>No workflows yet.</div>
        ) : (
          <div style={{ display: 'grid' }}>
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                to={`/editor/${wf.id}`}
                style={{
                  padding: 14,
                  borderBottom: '1px solid #eee',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>{wf.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {new Date(wf.updatedAt).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
