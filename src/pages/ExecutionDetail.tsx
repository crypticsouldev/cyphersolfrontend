import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { clearAuthToken } from '../lib/auth'
import { type ApiError, getExecution, type Execution } from '../lib/api'

export default function ExecutionDetail() {
  const params = useParams()
  const navigate = useNavigate()

  const executionId = params.id

  const [execution, setExecution] = useState<Execution | undefined>()
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function fetchExecution(options?: { silent?: boolean }) {
    if (!executionId) return

    if (!options?.silent) {
      setBusy(true)
      setError(undefined)
    }

    try {
      const res = await getExecution(executionId)
      setExecution(res.execution)
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
      if (!options?.silent) {
        setBusy(false)
      }
    }
  }

  const title = useMemo(() => {
    if (!execution) return 'execution'
    return `${execution.status}`
  }, [execution])

  useEffect(() => {
    void fetchExecution()
  }, [executionId])

  useEffect(() => {
    if (!executionId) return
    if (!execution) return

    const shouldPoll = execution.status === 'queued' || execution.status === 'running'
    if (!shouldPoll) {
      setPolling(false)
      return
    }

    setPolling(true)

    const t = window.setTimeout(() => {
      void fetchExecution({ silent: true })
    }, 1000)

    return () => {
      window.clearTimeout(t)
    }
  }, [executionId, execution?.status])

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Execution</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {polling ? <span style={{ fontSize: 12, color: '#666' }}>auto-refreshing</span> : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {execution ? (
            <Link
              to={`/workflows/${execution.workflowId}/executions`}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #ddd',
                textDecoration: 'none',
                color: 'inherit',
                background: '#fff',
              }}
            >
              back to executions
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
        {busy ? (
          <div style={{ color: '#555' }}>loading...</div>
        ) : !execution ? (
          <div style={{ color: '#555' }}>not found</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Execution id</div>
              <div style={{ fontFamily: 'monospace' }}>{execution.id}</div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Workflow id</div>
              <div style={{ fontFamily: 'monospace' }}>{execution.workflowId}</div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Timestamps</div>
              <div style={{ fontSize: 13, color: '#333' }}>
                created: {new Date(execution.createdAt).toLocaleString()}
                {execution.startedAt ? ` · started: ${new Date(execution.startedAt).toLocaleString()}` : ''}
                {execution.finishedAt ? ` · finished: ${new Date(execution.finishedAt).toLocaleString()}` : ''}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Logs</div>
              {execution.logs.length === 0 ? (
                <div style={{ color: '#555' }}>no logs</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {execution.logs.map((l, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid #eee',
                        borderRadius: 8,
                        padding: 10,
                        background: '#fafafa',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontWeight: 600 }}>{l.level}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{new Date(l.timestamp).toLocaleString()}</div>
                      </div>
                      <div style={{ fontSize: 13 }}>{l.message}</div>
                      {l.nodeId ? <div style={{ fontSize: 12, color: '#666' }}>node: {l.nodeId}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
