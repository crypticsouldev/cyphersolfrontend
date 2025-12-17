import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import CreateWorkFlow, { type CreateWorkFlowHandle } from '../components/CreateWorkFlow'
import {
  type ApiError,
  deleteWorkflow,
  getWorkflow,
  listCredentials,
  runWorkflow,
  updateWorkflow,
  type CredentialSummary,
  type Workflow,
} from '../lib/api'
import { clearAuthToken } from '../lib/auth'

export default function Editor() {
  const params = useParams()
  const navigate = useNavigate()

  const workflowId = params.id

  const [workflow, setWorkflow] = useState<Workflow | undefined>()
  const [initialNodes, setInitialNodes] = useState<Node[] | undefined>()
  const [initialEdges, setInitialEdges] = useState<Edge[] | undefined>()
  const [draft, setDraft] = useState<{ nodes: Node[]; edges: Edge[] } | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const flowRef = useRef<CreateWorkFlowHandle | null>(null)
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')

  const handleDefinitionChange = useCallback((definition: { nodes: Node[]; edges: Edge[] }) => {
    setDraft(definition)
  }, [])

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return undefined
    return draft?.nodes.find((n) => n.id === selectedNodeId)
  }, [draft, selectedNodeId])

  const selectedNodeData = useMemo(() => {
    return ((selectedNode?.data as any) || {}) as Record<string, unknown>
  }, [selectedNode])

  const selectedNodeType = useMemo(() => {
    const t = selectedNodeData.type
    return typeof t === 'string' && t.length > 0 ? t : 'log'
  }, [selectedNodeData.type])

  const enableEligibility = useMemo((): { ok: boolean; reason?: string } => {
    if (!draft) return { ok: false, reason: 'no workflow loaded' }

    const triggers = draft.nodes.filter((n) => {
      const data = (n.data as any) || {}
      const kind = String(data?.type || (n as any)?.type || '')
      return kind === 'timer_trigger'
    })

    if (triggers.length === 0) {
      return { ok: false, reason: 'add a timer_trigger node to enable automation' }
    }

    if (triggers.length > 1) {
      return { ok: false, reason: 'only one trigger node is allowed' }
    }

    const data = (triggers[0].data as any) || {}
    const intervalMs = data.intervalMs
    const intervalSeconds = data.intervalSeconds

    const ms =
      intervalMs !== undefined ? Number(intervalMs) : intervalSeconds !== undefined ? Number(intervalSeconds) * 1000 : Number.NaN

    if (!Number.isFinite(ms) || ms <= 0) {
      return { ok: false, reason: 'timer_trigger requires a valid interval' }
    }

    return { ok: true, reason: undefined }
  }, [draft])

  const hasTriggerNode = useMemo(() => {
    if (!draft) return false
    return draft.nodes.some((n) => {
      const data = (n.data as any) || {}
      const kind = String(data?.type || (n as any)?.type || '')
      return kind === 'timer_trigger'
    })
  }, [draft])

  const title = useMemo(() => workflow?.name || 'workflow editor', [workflow?.name])

  useEffect(() => {
    async function load() {
      if (!workflowId) return
      setError(undefined)
      setBusy(true)
      try {
        const res = await getWorkflow(workflowId)
        setWorkflow(res.workflow)

        const def = res.workflow.definition as any
        const nodes = Array.isArray(def?.nodes) ? (def.nodes as Node[]) : ([] as Node[])
        const edges = Array.isArray(def?.edges) ? (def.edges as Edge[]) : ([] as Edge[])
        setInitialNodes(nodes)
        setInitialEdges(edges)
        setDraft({ nodes, edges })
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

  useEffect(() => {
    async function loadCreds() {
      setError(undefined)
      try {
        const res = await listCredentials()
        setCredentials(res.credentials)
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

    void loadCreds()
  }, [])

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedCredentialId('')
      return
    }
    const current = selectedNodeData.credentialId
    setSelectedCredentialId(typeof current === 'string' ? current : '')
  }, [selectedNodeId, selectedNodeData.credentialId])

  function onAttachCredential(credentialId: string) {
    if (!selectedNodeId) return
    setSelectedCredentialId(credentialId)
    flowRef.current?.patchNodeData(selectedNodeId, { credentialId: credentialId || undefined })
  }

  function patchSelectedNode(patch: Record<string, unknown>) {
    if (!selectedNodeId) return
    flowRef.current?.patchNodeData(selectedNodeId, patch)
  }

  function getNextNodeId(existing: Node[]) {
    const used = new Set(existing.map((n) => n.id))
    let i = 1
    while (used.has(`n${i}`)) i += 1
    return `n${i}`
  }

  function addNode(kind: 'log' | 'delay' | 'http_request' | 'timer_trigger') {
    if (!draft) return

    if (kind === 'timer_trigger') {
      const existing = draft.nodes.find((n) => {
        const data = (n.data as any) || {}
        const nodeKind = String(data?.type || (n as any)?.type || '')
        return nodeKind === 'timer_trigger'
      })
      if (existing) {
        setError('only one trigger node is allowed')
        setSelectedNodeId(existing.id)
        return
      }
    }

    const id = getNextNodeId(draft.nodes)
    const maxY = draft.nodes.reduce((acc, n) => Math.max(acc, (n.position as any)?.y ?? 0), 0)
    const position = { x: 260, y: maxY + 120 }

    const baseData: Record<string, unknown> = {
      label: kind,
      type: kind,
    }

    if (kind === 'log') {
      baseData.message = 'hello'
    }

    if (kind === 'delay') {
      baseData.ms = 1000
    }

    if (kind === 'http_request') {
      baseData.url = 'https://example.com'
      baseData.method = 'GET'
    }

    if (kind === 'timer_trigger') {
      baseData.intervalSeconds = 60
    }

    const node: Node = {
      id,
      position,
      data: baseData,
    }

    flowRef.current?.addNode(node)
    setSelectedNodeId(id)
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return
    if (!draft) return

    const ok = window.confirm(`delete node ${selectedNodeId}?`)
    if (!ok) return

    flowRef.current?.deleteNode(selectedNodeId)
    setSelectedNodeId(undefined)
  }

  async function onSave() {
    if (!workflowId || !draft) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, { definition: draft })
      setWorkflow(res.workflow)
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

  async function onRenameWorkflow() {
    if (!workflowId || !workflow) return

    const nextName = window.prompt('rename workflow', workflow.name)
    if (nextName === null) return
    if (!nextName.trim()) {
      setError('name is required')
      return
    }

    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, { name: nextName })
      setWorkflow(res.workflow)
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

  async function onDeleteWorkflow() {
    if (!workflowId || !workflow) return

    const ok = window.confirm(`delete workflow "${workflow.name}"?`)
    if (!ok) return

    setBusy(true)
    setError(undefined)
    try {
      await deleteWorkflow(workflowId)
      navigate('/dashboard', { replace: true })
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

  async function onRun() {
    if (!workflowId) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await runWorkflow(workflowId)
      navigate(`/executions/${res.execution.id}`)
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

  async function onToggleEnabled() {
    if (!workflowId) return

    const next = !workflow?.enabled
    if (next && !enableEligibility.ok) {
      setError(enableEligibility.reason || 'workflow is not valid for enabling')
      return
    }

    if (next && !draft) {
      setError('no workflow loaded')
      return
    }

    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, next ? { enabled: true, definition: draft } : { enabled: false })
      setWorkflow(res.workflow)
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

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link
          to="/dashboard"
          style={{
            background: '#fff',
            border: '1px solid #ddd',
            padding: '6px 10px',
            borderRadius: 6,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          back
        </Link>
        <span style={{ fontSize: 12, color: '#666' }}>{title}</span>
        {workflow ? (
          <span style={{ fontSize: 12, color: workflow.enabled ? '#157f3b' : '#666' }}>
            {workflow.enabled ? 'enabled' : 'disabled'}
          </span>
        ) : null}
        {workflow && !workflow.enabled && !enableEligibility.ok ? (
          <span style={{ fontSize: 12, color: '#b42318' }}>{enableEligibility.reason || 'not ready to enable'}</span>
        ) : null}
        {workflowId ? (
          <Link
            to={`/workflows/${workflowId}/executions`}
            style={{
              background: '#fff',
              border: '1px solid #ddd',
              padding: '6px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            executions
          </Link>
        ) : null}

      {selectedNodeId ? (
        <div
          style={{
            position: 'absolute',
            top: 92,
            left: 12,
            zIndex: 10,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 10,
            padding: 12,
            display: 'grid',
            gap: 10,
            maxWidth: 520,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <div style={{ fontSize: 12, color: '#666' }}>selected node</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{selectedNodeId}</div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: '#666' }}>label</div>
            <input
              value={typeof selectedNodeData.label === 'string' ? selectedNodeData.label : ''}
              onChange={(e) => patchSelectedNode({ label: e.target.value })}
              disabled={busy}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
              placeholder="label"
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: '#666' }}>type</div>
            <select
              value={selectedNodeType}
              onChange={(e) => {
                const nextType = e.target.value
                if (nextType === 'timer_trigger' && draft) {
                  const existingTrigger = draft.nodes.find((n) => {
                    const data = (n.data as any) || {}
                    const kind = String(data?.type || (n as any)?.type || '')
                    return kind === 'timer_trigger' && n.id !== selectedNodeId
                  })
                  if (existingTrigger) {
                    setError('only one trigger node is allowed')
                    return
                  }

                  const currentIntervalSeconds = (selectedNodeData as any).intervalSeconds
                  const needsDefault = currentIntervalSeconds === undefined || currentIntervalSeconds === null || currentIntervalSeconds === ''
                  patchSelectedNode(needsDefault ? { type: nextType, intervalSeconds: 60 } : { type: nextType })
                  return
                }

                patchSelectedNode({ type: nextType })
              }}
              disabled={busy}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
            >
              <option value="timer_trigger">timer_trigger</option>
              <option value="log">log</option>
              <option value="delay">delay</option>
              <option value="http_request">http_request</option>
            </select>
          </div>

          {selectedNodeType === 'log' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#666' }}>message</div>
              <input
                value={typeof selectedNodeData.message === 'string' ? selectedNodeData.message : ''}
                onChange={(e) => patchSelectedNode({ message: e.target.value })}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                placeholder="message"
              />
            </div>
          ) : null}

          {selectedNodeType === 'timer_trigger' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#666' }}>interval seconds</div>
              <input
                type="number"
                value={
                  typeof selectedNodeData.intervalSeconds === 'number'
                    ? selectedNodeData.intervalSeconds
                    : typeof selectedNodeData.intervalSeconds === 'string'
                      ? selectedNodeData.intervalSeconds
                      : ''
                }
                onChange={(e) => {
                  const val = e.target.value
                  patchSelectedNode({ intervalSeconds: val === '' ? undefined : Number(val) })
                }}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                placeholder="60"
                min={1}
              />
              <div style={{ fontSize: 12, color: '#666' }}>
                used by the trigger service when workflow is enabled
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'delay' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#666' }}>delay ms</div>
              <input
                type="number"
                value={
                  typeof selectedNodeData.ms === 'number'
                    ? selectedNodeData.ms
                    : typeof selectedNodeData.ms === 'string'
                      ? selectedNodeData.ms
                      : ''
                }
                onChange={(e) => {
                  const val = e.target.value
                  patchSelectedNode({ ms: val === '' ? undefined : Number(val) })
                }}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                placeholder="1000"
                min={0}
              />
            </div>
          ) : null}

          {selectedNodeType === 'http_request' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>url</div>
                <input
                  value={typeof selectedNodeData.url === 'string' ? selectedNodeData.url : ''}
                  onChange={(e) => patchSelectedNode({ url: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="https://api.example.com/path"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>method</div>
                <select
                  value={typeof selectedNodeData.method === 'string' ? selectedNodeData.method : 'GET'}
                  onChange={(e) => patchSelectedNode({ method: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', flex: 1 }}
                  >
                    <option value="">no credential</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.provider} · {c.name}
                      </option>
                    ))}
                  </select>
                  <Link
                    to="/credentials"
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: '1px solid #ddd',
                      background: '#fff',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontSize: 12,
                    }}
                  >
                    manage
                  </Link>
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  requires backend allowlist via <span style={{ fontFamily: 'monospace' }}>EXECUTOR_HTTP_ALLOWED_HOSTS</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft}
          style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '6px 10px', borderRadius: 6 }}
        >
          {busy ? 'working...' : 'save'}
        </button>
        <button
          type="button"
          onClick={onToggleEnabled}
          disabled={busy || !workflowId || !workflow || (!workflow.enabled && !enableEligibility.ok)}
          style={{
            background: workflow?.enabled ? '#fff' : '#fff',
            color: workflow?.enabled ? '#b42318' : '#157f3b',
            border: '1px solid #ddd',
            padding: '6px 10px',
            borderRadius: 6,
          }}
        >
          {workflow?.enabled ? 'disable' : 'enable'}
        </button>
        <button
          type="button"
          onClick={onRenameWorkflow}
          disabled={busy || !workflowId || !workflow}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          rename
        </button>
        <button
          type="button"
          onClick={onDeleteWorkflow}
          disabled={busy || !workflowId || !workflow}
          style={{ background: '#fff', color: '#b42318', border: '1px solid #f3c7c7', padding: '6px 10px', borderRadius: 6 }}
        >
          delete
        </button>
        <button
          type="button"
          onClick={() => addNode('timer_trigger')}
          disabled={busy || !draft || hasTriggerNode}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add timer
        </button>
        <button
          type="button"
          onClick={() => addNode('log')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add log
        </button>
        <button
          type="button"
          onClick={() => addNode('delay')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add delay
        </button>
        <button
          type="button"
          onClick={() => addNode('http_request')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add http
        </button>
        <button
          type="button"
          onClick={deleteSelectedNode}
          disabled={busy || !draft || !selectedNodeId}
          style={{ background: '#fff', color: '#b42318', border: '1px solid #f3c7c7', padding: '6px 10px', borderRadius: 6 }}
        >
          delete node
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !workflowId}
          style={{ background: '#0b5', color: '#fff', border: '1px solid #084', padding: '6px 10px', borderRadius: 6 }}
        >
          {busy ? 'working...' : 'run'}
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>id: {params.id}</span>
      </div>

      {error ? (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 12,
            zIndex: 10,
            background: '#fee',
            color: '#700',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #f3c7c7',
            maxWidth: 520,
          }}
        >
          {error}
        </div>
      ) : null}

      <CreateWorkFlow
        ref={flowRef}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        onDefinitionChange={handleDefinitionChange}
        onNodeSelect={(nodeId) => setSelectedNodeId(nodeId)}
      />
    </div>
  )
}
