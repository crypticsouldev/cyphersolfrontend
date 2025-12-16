import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import CreateWorkFlow, { type CreateWorkFlowHandle } from '../components/CreateWorkFlow'
import {
  type ApiError,
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
    const node = draft?.nodes.find((n) => n.id === selectedNodeId)
    const current = (node?.data as any)?.credentialId
    setSelectedCredentialId(typeof current === 'string' ? current : '')
  }, [selectedNodeId, draft])

  function onAttachCredential(credentialId: string) {
    if (!selectedNodeId) return
    setSelectedCredentialId(credentialId)
    flowRef.current?.patchNodeData(selectedNodeId, { credentialId: credentialId || undefined })
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
            padding: 10,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            maxWidth: 520,
          }}
        >
          <div style={{ fontSize: 12, color: '#666' }}>selected node: {selectedNodeId}</div>
          <select
            value={selectedCredentialId}
            onChange={(e) => onAttachCredential(e.target.value)}
            disabled={busy}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
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
        onDefinitionChange={(definition) => setDraft(definition)}
        onNodeSelect={(nodeId) => setSelectedNodeId(nodeId)}
      />
    </div>
  )
}
