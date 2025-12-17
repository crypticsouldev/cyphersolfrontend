import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import { clearAuthToken } from '../lib/auth'
import CreateWorkFlow from '../components/CreateWorkFlow'
import { type ApiError, getExecution, getWorkflow, type Execution, type NodeExecutionState } from '../lib/api'

export default function ExecutionDetail() {
  const params = useParams()
  const navigate = useNavigate()

  const executionId = params.id

  const [execution, setExecution] = useState<Execution | undefined>()
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | undefined>()
  const [graphError, setGraphError] = useState<string | undefined>()

  const [focusNodeId, setFocusNodeId] = useState<string | undefined>()
  const [highlightNodeId, setHighlightNodeId] = useState<string | undefined>()

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

  const nodeEntries = useMemo(() => {
    const entries = Object.entries(execution?.nodeStatuses || {}) as Array<[string, NodeExecutionState]>
    entries.sort(([a], [b]) => a.localeCompare(b))
    return entries
  }, [execution?.nodeStatuses])

  const outputEntries = useMemo(() => {
    const entries = Object.entries(execution?.nodeOutputs || {}) as Array<[string, unknown]>
    entries.sort(([a], [b]) => a.localeCompare(b))
    return entries
  }, [execution?.nodeOutputs])

  const firstLogIndexByNodeId = useMemo(() => {
    const map: Record<string, number> = {}
    const logs = execution?.logs || []
    for (let i = 0; i < logs.length; i += 1) {
      const nodeId = logs[i]?.nodeId
      if (!nodeId) continue
      if (map[nodeId] !== undefined) continue
      map[nodeId] = i
    }
    return map
  }, [execution?.logs])

  useEffect(() => {
    if (!focusNodeId) return

    const outputEl = document.getElementById(`node-output-${focusNodeId}`)
    const logEl = document.getElementById(`node-log-${focusNodeId}`)
    const statusEl = document.getElementById(`node-status-${focusNodeId}`)
    const target = outputEl || logEl || statusEl
    if (!target) return

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightNodeId(focusNodeId)

    const t = window.setTimeout(() => {
      setHighlightNodeId((cur) => (cur === focusNodeId ? undefined : cur))
    }, 1200)

    return () => window.clearTimeout(t)
  }, [focusNodeId])

  function getStatusColor(status: string) {
    if (status === 'success') return '#157f3b'
    if (status === 'failed') return '#b42318'
    if (status === 'running') return '#175cd3'
    if (status === 'queued' || status === 'pending') return '#4b5563'
    if (status === 'skipped' || status === 'cancelled') return '#6b7280'
    return '#374151'
  }

  function getStatusBg(status: string) {
    if (status === 'success') return '#ecfdf3'
    if (status === 'failed') return '#fef3f2'
    if (status === 'running') return '#eff8ff'
    if (status === 'queued' || status === 'pending') return '#f3f4f6'
    if (status === 'skipped' || status === 'cancelled') return '#f9fafb'
    return '#f9fafb'
  }

  useEffect(() => {
    async function loadWorkflow() {
      if (!execution?.workflowId) return
      setGraphError(undefined)

      try {
        const wfRes = await getWorkflow(execution.workflowId)
        const def = wfRes.workflow.definition as any
        const nodes = Array.isArray(def?.nodes) ? (def.nodes as Node[]) : ([] as Node[])
        const edges = Array.isArray(def?.edges) ? (def.edges as Edge[]) : ([] as Edge[])
        setGraph({ nodes, edges })
      } catch (err) {
        const apiErr = err as ApiError
        if (apiErr.status === 401) {
          clearAuthToken()
          navigate('/login', { replace: true })
          return
        }
        const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
        setGraphError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
      }
    }

    void loadWorkflow()
  }, [execution?.workflowId])

  const styledGraphNodes = useMemo(() => {
    if (!graph) return undefined
    const nodeStatuses = execution?.nodeStatuses || {}

    return graph.nodes.map((n) => {
      const state = (nodeStatuses as any)?.[n.id] as NodeExecutionState | undefined
      const status = String(state?.status || 'pending')
      const labelRaw = (n.data as any)?.label
      const baseLabel = typeof labelRaw === 'string' && labelRaw.length > 0 ? labelRaw : n.id

      return {
        ...n,
        data: { ...(n.data as any), label: `${baseLabel} (${status})` },
        style: {
          ...(n.style as any),
          border: `2px solid ${getStatusColor(status)}`,
          background: getStatusBg(status),
          borderRadius: 10,
          padding: 6,
        },
      }
    })
  }, [graph, execution?.nodeStatuses])

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
              <div style={{ fontSize: 12, color: '#666' }}>Graph</div>
              {graphError ? <div style={{ color: '#700' }}>{graphError}</div> : null}
              {!styledGraphNodes || !graph ? (
                <div style={{ color: '#555' }}>loading graph...</div>
              ) : (
                <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
                  <CreateWorkFlow
                    initialNodes={styledGraphNodes}
                    initialEdges={graph.edges}
                    readOnly
                    syncFromProps
                    onNodeSelect={(nodeId) => {
                      if (nodeId) setFocusNodeId(nodeId)
                    }}
                    containerStyle={{ width: '100%', height: 340 }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Outputs</div>
              {outputEntries.length === 0 ? (
                <div style={{ color: '#555' }}>no outputs</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {outputEntries.map(([nodeId, output]) => (
                    <div
                      key={nodeId}
                      id={`node-output-${nodeId}`}
                      style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fff' }}
                    >
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>node: {nodeId}</div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 12,
                          background: '#fafafa',
                          border: '1px solid #eee',
                          borderRadius: 8,
                          padding: 10,
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          outline: highlightNodeId === nodeId ? '2px solid #175cd3' : undefined,
                        }}
                      >
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Node statuses</div>
              {nodeEntries.length === 0 ? (
                <div style={{ color: '#555' }}>no node statuses</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: 12, color: '#666', padding: '8px 6px' }}>node</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: '#666', padding: '8px 6px' }}>status</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: '#666', padding: '8px 6px' }}>started</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: '#666', padding: '8px 6px' }}>finished</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: '#666', padding: '8px 6px' }}>error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeEntries.map(([nodeId, state]) => (
                        <tr
                          key={nodeId}
                          id={`node-status-${nodeId}`}
                          style={{ borderTop: '1px solid #eee', outline: highlightNodeId === nodeId ? '2px solid #175cd3' : undefined }}
                        >
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>{nodeId}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: 12,
                                border: '1px solid #e5e7eb',
                                color: getStatusColor(String(state?.status || 'unknown')),
                                background: '#fff',
                              }}
                            >
                              {String(state?.status || 'unknown')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: '#333' }}>
                            {state?.startedAt ? new Date(state.startedAt).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: '#333' }}>
                            {state?.finishedAt ? new Date(state.finishedAt).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: '#b42318' }}>{state?.error || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                      id={l.nodeId && firstLogIndexByNodeId[l.nodeId] === idx ? `node-log-${l.nodeId}` : undefined}
                      style={{
                        border: '1px solid #eee',
                        borderRadius: 8,
                        padding: 10,
                        background: '#fafafa',
                        display: 'grid',
                        gap: 4,
                        outline: l.nodeId && highlightNodeId === l.nodeId ? '2px solid #175cd3' : undefined,
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
