import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { clearAuthToken } from '../lib/auth'
import {
  type ApiError,
  getWorkflow,
  listWorkflowExecutions,
  type ExecutionSummary,
  type Workflow,
} from '../lib/api'

export default function WorkflowExecutions() {
  const params = useParams()
  const navigate = useNavigate()

  const workflowId = params.id

  const [workflow, setWorkflow] = useState<Workflow | undefined>()
  const [executions, setExecutions] = useState<ExecutionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const title = useMemo(() => workflow?.name || 'executions', [workflow?.name])

  useEffect(() => {
    async function load() {
      if (!workflowId) return
      setBusy(true)
      setError(undefined)

      try {
        const wfRes = await getWorkflow(workflowId)
        setWorkflow(wfRes.workflow)

        const exRes = await listWorkflowExecutions(workflowId)
        setExecutions(exRes.executions)
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

    void load()
  }, [workflowId])

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Workflow executions</div>
          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to={`/editor/${workflowId}`}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              textDecoration: 'none',
              color: 'inherit',
              background: '#fff',
            }}
          >
            back to editor
          </Link>
        </div>
      </div>

      {error ? (
        <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10 }}>
        {busy ? (
          <div style={{ padding: 16, color: '#555' }}>loading...</div>
        ) : executions.length === 0 ? (
          <div style={{ padding: 16, color: '#555' }}>No executions yet.</div>
        ) : (
          <div style={{ display: 'grid' }}>
            {executions.map((e) => (
              <Link
                key={e.id}
                to={`/executions/${e.id}`}
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
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontWeight: 600 }}>{e.status}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{new Date(e.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>{e.finishedAt ? `finished: ${new Date(e.finishedAt).toLocaleTimeString()}` : ''}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
