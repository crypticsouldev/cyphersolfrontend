import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

  const [solanaExplorerCluster, setSolanaExplorerCluster] = useState<'mainnet-beta' | 'devnet'>(() => {
    const v = window.localStorage.getItem('solanaExplorerCluster')
    return v === 'devnet' ? 'devnet' : 'mainnet-beta'
  })

  useEffect(() => {
    window.localStorage.setItem('solanaExplorerCluster', solanaExplorerCluster)
  }, [solanaExplorerCluster])

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

  function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v)
  }

  function shorten(s: string, head = 6, tail = 6) {
    if (s.length <= head + tail + 3) return s
    return `${s.slice(0, head)}...${s.slice(-tail)}`
  }

  function buildSolanaExplorerUrl(path: string): string {
    const base = 'https://explorer.solana.com'
    const clusterParam = solanaExplorerCluster === 'devnet' ? '?cluster=devnet' : ''
    return `${base}${path}${clusterParam}`
  }

  function renderNodeOutput(output: unknown): ReactNode {
    if (isRecord(output) && output.kind === 'jupiter_swap') {
      const signature = typeof output.signature === 'string' ? output.signature : undefined
      const inputMint = typeof output.inputMint === 'string' ? output.inputMint : undefined
      const outputMint = typeof output.outputMint === 'string' ? output.outputMint : undefined
      const amount = typeof output.amount === 'number' ? output.amount : undefined
      const slippageBps = typeof output.slippageBps === 'number' ? output.slippageBps : undefined

      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>signature</div>
            {signature ? (
              <a
                href={buildSolanaExplorerUrl(`/tx/${signature}`)}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: 'monospace', fontSize: 13, textDecoration: 'none', color: 'var(--color-primary)' }}
              >
                {signature}
              </a>
            ) : (
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' }}>—</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
              {inputMint ? (
                <a
                  href={buildSolanaExplorerUrl(`/address/${inputMint}`)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: 'monospace', fontSize: 13, textDecoration: 'none', color: 'var(--color-primary)' }}
                >
                  {inputMint}
                </a>
              ) : (
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' }}>—</div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
              {outputMint ? (
                <a
                  href={buildSolanaExplorerUrl(`/address/${outputMint}`)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: 'monospace', fontSize: 13, textDecoration: 'none', color: 'var(--color-primary)' }}
                >
                  {outputMint}
                </a>
              ) : (
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' }}>—</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{amount !== undefined ? String(amount) : '—'}</div>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{slippageBps !== undefined ? `${slippageBps} bps` : '—'}</div>
            </div>
          </div>
        </div>
      )
    }

    if (isRecord(output) && output.kind === 'solana_balance') {
      const publicKey = typeof output.publicKey === 'string' ? output.publicKey : undefined
      const sol = typeof output.sol === 'number' ? output.sol : undefined
      const solLamports = typeof output.solLamports === 'number' ? output.solLamports : undefined
      const tokens = Array.isArray(output.tokens) ? output.tokens : []

      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>public key</div>
            {publicKey ? (
              <a
                href={buildSolanaExplorerUrl(`/address/${publicKey}`)}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: 'monospace', fontSize: 13, textDecoration: 'none', color: 'var(--color-primary)' }}
              >
                {publicKey}
              </a>
            ) : (
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' }}>—</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sol</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{sol !== undefined ? String(sol) : '—'}</div>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>lamports</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{solLamports !== undefined ? String(solLamports) : '—'}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>tokens</div>
            {tokens.length === 0 ? (
              <div style={{ color: 'var(--color-text-subtle)' }}>no token accounts</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>mint</th>
                      <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>ui</th>
                      <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>amount</th>
                      <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>decimals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t, idx) => {
                      const tok = isRecord(t) ? t : {}
                      const mint = typeof tok.mint === 'string' ? tok.mint : undefined
                      const uiAmountString = typeof tok.uiAmountString === 'string' ? tok.uiAmountString : undefined
                      const amount = typeof tok.amount === 'string' ? tok.amount : undefined
                      const decimals = typeof tok.decimals === 'number' ? tok.decimals : undefined
                      return (
                        <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>
                            {mint ? (
                              <a
                                href={buildSolanaExplorerUrl(`/address/${mint}`)}
                                target="_blank"
                                rel="noreferrer"
                                title={mint}
                                style={{ textDecoration: 'none', color: 'var(--color-primary)' }}
                              >
                                {shorten(mint, 8, 8)}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>{uiAmountString || '—'}</td>
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>{amount || '—'}</td>
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>{decimals !== undefined ? String(decimals) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 10,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(output, null, 2)}
      </pre>
    )
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
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Execution</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {polling ? <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>auto-refreshing</span> : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>explorer</div>
            <select
              value={solanaExplorerCluster}
              onChange={(e) => setSolanaExplorerCluster(e.target.value as 'mainnet-beta' | 'devnet')}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12 }}
            >
              <option value="mainnet-beta">mainnet</option>
              <option value="devnet">devnet</option>
            </select>
          </div>
          {execution ? (
            <Link
              to={`/workflows/${execution.workflowId}/executions`}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                textDecoration: 'none',
                color: 'inherit',
                background: 'var(--color-surface)',
              }}
            >
              back to executions
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, border: '1px solid var(--color-border)', borderRadius: 10, padding: 16 }}>
        {busy ? (
          <div style={{ color: 'var(--color-text-subtle)' }}>loading...</div>
        ) : !execution ? (
          <div style={{ color: 'var(--color-text-subtle)' }}>not found</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Execution id</div>
              <div style={{ fontFamily: 'monospace' }}>{execution.id}</div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Workflow id</div>
              <div style={{ fontFamily: 'monospace' }}>{execution.workflowId}</div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Timestamps</div>
              <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
                created: {new Date(execution.createdAt).toLocaleString()}
                {execution.startedAt ? ` · started: ${new Date(execution.startedAt).toLocaleString()}` : ''}
                {execution.finishedAt ? ` · finished: ${new Date(execution.finishedAt).toLocaleString()}` : ''}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Graph</div>
              {graphError ? <div style={{ color: 'var(--color-error)' }}>{graphError}</div> : null}
              {!styledGraphNodes || !graph ? (
                <div style={{ color: 'var(--color-text-subtle)' }}>loading graph...</div>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
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
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Outputs</div>
              {outputEntries.length === 0 ? (
                <div style={{ color: 'var(--color-text-subtle)' }}>no outputs</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {outputEntries.map(([nodeId, output]) => (
                    <div
                      key={nodeId}
                      id={`node-output-${nodeId}`}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 10,
                        padding: 12,
                        background: 'var(--color-surface)',
                        outline: highlightNodeId === nodeId ? '2px solid var(--color-primary)' : undefined,
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>node: {nodeId}</div>
                      {renderNodeOutput(output)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Node statuses</div>
              {nodeEntries.length === 0 ? (
                <div style={{ color: 'var(--color-text-subtle)' }}>no node statuses</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>node</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>status</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>started</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>finished</th>
                        <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 6px' }}>error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeEntries.map(([nodeId, state]) => (
                        <tr
                          key={nodeId}
                          id={`node-status-${nodeId}`}
                          style={{ borderTop: '1px solid var(--color-border)', outline: highlightNodeId === nodeId ? '2px solid var(--color-primary)' : undefined }}
                        >
                          <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 13 }}>{nodeId}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: 12,
                                border: '1px solid var(--color-border)',
                                color: getStatusColor(String(state?.status || 'unknown')),
                                background: 'var(--color-surface)',
                              }}
                            >
                              {String(state?.status || 'unknown')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--color-text)' }}>
                            {state?.startedAt ? new Date(state.startedAt).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--color-text)' }}>
                            {state?.finishedAt ? new Date(state.finishedAt).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: 12, color: 'var(--color-error)' }}>{state?.error || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Logs</div>
              {execution.logs.length === 0 ? (
                <div style={{ color: 'var(--color-text-subtle)' }}>no logs</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {execution.logs.map((l, idx) => (
                    <div
                      key={idx}
                      id={l.nodeId && firstLogIndexByNodeId[l.nodeId] === idx ? `node-log-${l.nodeId}` : undefined}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        padding: 10,
                        background: 'var(--color-bg)',
                        display: 'grid',
                        gap: 4,
                        outline: l.nodeId && highlightNodeId === l.nodeId ? '2px solid var(--color-primary)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontWeight: 600 }}>{l.level}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(l.timestamp).toLocaleString()}</div>
                      </div>
                      <div style={{ fontSize: 13 }}>{l.message}</div>
                      {l.nodeId ? <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>node: {l.nodeId}</div> : null}
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
