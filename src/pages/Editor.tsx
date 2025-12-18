import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import CreateWorkFlow, { type CreateWorkFlowHandle } from '../components/CreateWorkFlow'
import {
  type ApiError,
  deleteWorkflow,
  getWorkflow,
  getMeta,
  listCredentials,
  runWorkflow,
  updateWorkflow,
  type CredentialSummary,
  type MetaResponse,
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

  const [meta, setMeta] = useState<MetaResponse | undefined>()

  const flowRef = useRef<CreateWorkFlowHandle | null>(null)
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const solanaWalletCredentials = useMemo(() => credentials.filter((c) => c.provider === 'solana_wallet'), [credentials])
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')
  const [maxBacklogDraft, setMaxBacklogDraft] = useState('')

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

  function isTemplateString(v: unknown): boolean {
    return typeof v === 'string' && v.includes('{{') && v.includes('}}')
  }

  function parseFiniteNumber(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (!trimmed) return undefined
      const n = Number(trimmed)
      if (Number.isFinite(n)) return n
    }
    return undefined
  }

  const solanaValidationIssues = useMemo(() => {
    const issues: string[] = []
    if (!draft) return issues

    const maxAmount = meta?.jupiterSwapMaxAmount ?? 10
    const maxSlippageBps = meta?.jupiterSwapMaxSlippageBps ?? 2000

    for (const n of draft.nodes) {
      const data = (n.data as any) || {}
      const kind = String(data?.type || (n as any)?.type || '')
      if (kind !== 'solana_balance' && kind !== 'jupiter_swap') continue

      const credentialId = data.credentialId
      if (typeof credentialId !== 'string' || !credentialId.trim()) {
        issues.push(`${kind} (${n.id}) requires a wallet credential`)
      }

      if (kind !== 'jupiter_swap') continue

      const inputMint = data.inputMint
      if (typeof inputMint !== 'string' || !inputMint.trim()) {
        issues.push(`jupiter_swap (${n.id}) requires input mint`)
      }
      const outputMint = data.outputMint
      if (typeof outputMint !== 'string' || !outputMint.trim()) {
        issues.push(`jupiter_swap (${n.id}) requires output mint`)
      }

      const amountRaw = data.amount
      if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
        issues.push(`jupiter_swap (${n.id}) requires amount`)
      } else if (!isTemplateString(amountRaw)) {
        const amount = parseFiniteNumber(amountRaw)
        if (amount === undefined || amount <= 0) {
          issues.push(`jupiter_swap (${n.id}) amount must be > 0`)
        } else if (amount > maxAmount) {
          issues.push(`jupiter_swap (${n.id}) amount exceeds max (${maxAmount})`)
        }
      }

      const slippageRaw = data.slippageBps
      if (slippageRaw !== undefined && slippageRaw !== null && slippageRaw !== '') {
        if (!isTemplateString(slippageRaw)) {
          const slippage = parseFiniteNumber(slippageRaw)
          if (slippage === undefined || slippage <= 0) {
            issues.push(`jupiter_swap (${n.id}) slippage must be > 0`)
          } else if (slippage > maxSlippageBps) {
            issues.push(`jupiter_swap (${n.id}) slippage exceeds max (${maxSlippageBps} bps)`)
          }
        }
      }
    }

    return issues
  }, [draft, meta?.jupiterSwapMaxAmount, meta?.jupiterSwapMaxSlippageBps])

  const enableEligibility = useMemo((): { ok: boolean; reason?: string } => {
    if (!draft) return { ok: false, reason: 'no workflow loaded' }

    const triggers = draft.nodes.filter((n) => {
      const data = (n.data as any) || {}
      const kind = String(data?.type || (n as any)?.type || '')
      return kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'helius_webhook_trigger'
    })

    if (triggers.length === 0) {
      return { ok: false, reason: 'add a trigger node to enable automation' }
    }

    if (triggers.length > 1) {
      return { ok: false, reason: 'only one trigger node is allowed' }
    }

    const data = (triggers[0].data as any) || {}
    const kind = String(data?.type || (triggers[0] as any)?.type || '')

    if (kind === 'helius_webhook_trigger') {
      return { ok: true, reason: undefined }
    }

    const intervalMs = data.intervalMs
    const intervalSeconds = data.intervalSeconds

    const ms =
      intervalMs !== undefined ? Number(intervalMs) : intervalSeconds !== undefined ? Number(intervalSeconds) * 1000 : Number.NaN

    if (!Number.isFinite(ms) || ms <= 0) {
      return { ok: false, reason: `${kind} requires a valid interval` }
    }

    if (kind === 'price_trigger') {
      const symbol = String(data.symbol || '').trim()
      const direction = String(data.direction || '')
      const threshold = Number(data.threshold)
      if (!symbol) return { ok: false, reason: 'price_trigger requires a symbol' }
      if (direction !== 'crosses_above' && direction !== 'crosses_below') {
        return { ok: false, reason: 'price_trigger requires a direction' }
      }
      if (!Number.isFinite(threshold) || threshold <= 0) {
        return { ok: false, reason: 'price_trigger requires a valid threshold' }
      }
    }

    if (solanaValidationIssues.length > 0) {
      return { ok: false, reason: solanaValidationIssues[0] }
    }

    return { ok: true, reason: undefined }
  }, [draft, solanaValidationIssues])

  const runEligibility = useMemo((): { ok: boolean; reason?: string } => {
    if (!draft) return { ok: false, reason: 'no workflow loaded' }
    if (solanaValidationIssues.length > 0) {
      return { ok: false, reason: solanaValidationIssues[0] }
    }
    return { ok: true, reason: undefined }
  }, [draft, solanaValidationIssues])

  const hasTriggerNode = useMemo(() => {
    if (!draft) return false
    return draft.nodes.some((n) => {
      const data = (n.data as any) || {}
      const kind = String(data?.type || (n as any)?.type || '')
      return kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'helius_webhook_trigger'
    })
  }, [draft])

  const title = useMemo(() => workflow?.name || 'workflow editor', [workflow?.name])

  useEffect(() => {
    const mb = workflow?.maxBacklog
    setMaxBacklogDraft(mb !== undefined && mb !== null ? String(mb) : '5')
  }, [workflow?.id, workflow?.maxBacklog])

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
    async function loadMeta() {
      await getMeta()
        .then((res) => setMeta(res))
        .catch(() => undefined)
    }

    void loadMeta()
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

  function addNode(
    kind:
      | 'log'
      | 'delay'
      | 'http_request'
      | 'solana_balance'
      | 'jupiter_swap'
      | 'timer_trigger'
      | 'price_trigger'
      | 'helius_webhook_trigger'
      | 'market_data'
      | 'paper_order',
  ) {
    if (!draft) return

    if (kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'helius_webhook_trigger') {
      const existing = draft.nodes.find((n) => {
        const data = (n.data as any) || {}
        const nodeKind = String(data?.type || (n as any)?.type || '')
        return nodeKind === 'timer_trigger' || nodeKind === 'price_trigger' || nodeKind === 'helius_webhook_trigger'
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

    if (kind === 'solana_balance') {
      baseData.commitment = 'confirmed'
    }

    if (kind === 'jupiter_swap') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      baseData.amount = 0.01
      baseData.slippageBps = 300
    }

    if (kind === 'market_data') {
      baseData.symbol = 'SOL'
      baseData.vsCurrency = 'usd'
    }

    if (kind === 'paper_order') {
      baseData.symbol = 'SOL'
      baseData.side = 'buy'
      baseData.quantity = 1
      baseData.price = 150
    }

    if (kind === 'timer_trigger') {
      baseData.intervalSeconds = 60
    }

    if (kind === 'price_trigger') {
      baseData.symbol = 'SOL'
      baseData.vsCurrency = 'usd'
      baseData.direction = 'crosses_above'
      baseData.threshold = 150
      baseData.intervalSeconds = 60
    }

    if (kind === 'helius_webhook_trigger') {
      // no config in v1
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

  async function onSetOverlapPolicy(nextPolicy: 'skip' | 'queue' | 'allow') {
    if (!workflowId) return
    if (!workflow) return

    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, { overlapPolicy: nextPolicy })
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

  async function onSetMaxBacklog(nextMaxBacklog: number) {
    if (!workflowId) return
    if (!workflow) return

    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, { maxBacklog: nextMaxBacklog })
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

    if (!runEligibility.ok) {
      setError(runEligibility.reason || 'workflow is not valid for running')
      return
    }

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
                if (
                  (nextType === 'timer_trigger' || nextType === 'price_trigger' || nextType === 'helius_webhook_trigger') &&
                  draft
                ) {
                  const existingTrigger = draft.nodes.find((n) => {
                    const data = (n.data as any) || {}
                    const kind = String(data?.type || (n as any)?.type || '')
                    return (
                      (kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'helius_webhook_trigger') &&
                      n.id !== selectedNodeId
                    )
                  })
                  if (existingTrigger) {
                    setError('only one trigger node is allowed')
                    return
                  }

                  const currentIntervalSeconds = (selectedNodeData as any).intervalSeconds
                  const needsDefault = currentIntervalSeconds === undefined || currentIntervalSeconds === null || currentIntervalSeconds === ''
                  if (nextType === 'price_trigger') {
                    patchSelectedNode(
                      needsDefault
                        ? {
                            type: nextType,
                            intervalSeconds: 60,
                            symbol: (selectedNodeData as any).symbol || 'SOL',
                            vsCurrency: (selectedNodeData as any).vsCurrency || 'usd',
                            direction: (selectedNodeData as any).direction || 'crosses_above',
                            threshold: (selectedNodeData as any).threshold || 150,
                          }
                        : { type: nextType },
                    )
                  } else {
                    patchSelectedNode(
                      nextType === 'helius_webhook_trigger'
                        ? { type: nextType }
                        : needsDefault
                          ? { type: nextType, intervalSeconds: 60 }
                          : { type: nextType },
                    )
                  }
                  return
                }

                if (nextType === 'solana_balance') {
                  patchSelectedNode({ type: nextType, commitment: (selectedNodeData as any).commitment || 'confirmed' })
                  return
                }

                if (nextType === 'jupiter_swap') {
                  patchSelectedNode({
                    type: nextType,
                    inputMint: (selectedNodeData as any).inputMint || 'So11111111111111111111111111111111111111112',
                    outputMint: (selectedNodeData as any).outputMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: (selectedNodeData as any).amount ?? 0.01,
                    slippageBps: (selectedNodeData as any).slippageBps ?? 300,
                  })
                  return
                }

                patchSelectedNode({ type: nextType })
              }}
              disabled={busy}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
            >
              <option value="timer_trigger">timer_trigger</option>
              <option value="price_trigger">price_trigger</option>
              <option value="helius_webhook_trigger">helius_webhook_trigger</option>
              <option value="log">log</option>
              <option value="delay">delay</option>
              <option value="http_request">http_request</option>
              <option value="solana_balance">solana_balance</option>
              <option value="jupiter_swap">jupiter_swap</option>
              <option value="market_data">market_data</option>
              <option value="paper_order">paper_order</option>
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

          {selectedNodeType === 'solana_balance' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', flex: 1 }}
                  >
                    <option value="">select solana_wallet credential</option>
                    {solanaWalletCredentials.map((c) => (
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
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>commitment</div>
                <select
                  value={typeof selectedNodeData.commitment === 'string' ? selectedNodeData.commitment : 'confirmed'}
                  onChange={(e) => patchSelectedNode({ commitment: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                >
                  <option value="processed">processed</option>
                  <option value="confirmed">confirmed</option>
                  <option value="finalized">finalized</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: '#666' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'jupiter_swap' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', flex: 1 }}
                  >
                    <option value="">select solana_wallet credential</option>
                    {solanaWalletCredentials.map((c) => (
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
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>input mint</div>
                <input
                  value={typeof selectedNodeData.inputMint === 'string' ? selectedNodeData.inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontFamily: 'monospace' }}
                  placeholder="So11111111111111111111111111111111111111112"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>output mint</div>
                <input
                  value={typeof selectedNodeData.outputMint === 'string' ? selectedNodeData.outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>amount (token units)</div>
                <input
                  type="number"
                  value={
                    typeof selectedNodeData.amount === 'number'
                      ? selectedNodeData.amount
                      : typeof selectedNodeData.amount === 'string'
                        ? selectedNodeData.amount
                        : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    patchSelectedNode({ amount: val === '' ? undefined : Number(val) })
                  }}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="0.01"
                  min={0}
                  step={0.000001}
                />
                {meta && Number.isFinite(Number((selectedNodeData as any).amount)) &&
                Number((selectedNodeData as any).amount) > meta.jupiterSwapMaxAmount ? (
                  <div style={{ fontSize: 12, color: '#b42318' }}>
                    amount exceeds max ({meta.jupiterSwapMaxAmount})
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>slippage bps</div>
                <input
                  type="number"
                  value={
                    typeof selectedNodeData.slippageBps === 'number'
                      ? selectedNodeData.slippageBps
                      : typeof selectedNodeData.slippageBps === 'string'
                        ? selectedNodeData.slippageBps
                        : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    patchSelectedNode({ slippageBps: val === '' ? undefined : Number(val) })
                  }}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="300"
                  min={1}
                  max={10_000}
                />
                {meta && Number.isFinite(Number((selectedNodeData as any).slippageBps)) &&
                Number((selectedNodeData as any).slippageBps) > meta.jupiterSwapMaxSlippageBps ? (
                  <div style={{ fontSize: 12, color: '#b42318' }}>
                    slippage exceeds max ({meta.jupiterSwapMaxSlippageBps} bps)
                  </div>
                ) : null}
              </div>

              {meta ? (
                <div style={{ fontSize: 12, color: '#666' }}>
                  safety caps: max amount {meta.jupiterSwapMaxAmount} · max slippage {meta.jupiterSwapMaxSlippageBps} bps
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: '#666' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'helius_webhook_trigger' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#666' }}>webhook trigger</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                configure Helius to POST to:
              </div>
              <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>
                /webhooks/helius/{workflow?.id || '<workflowId>'}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                set the Authorization header to match HELIUS_WEBHOOK_AUTH_HEADER
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'price_trigger' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>symbol</div>
                <input
                  value={typeof selectedNodeData.symbol === 'string' ? selectedNodeData.symbol : ''}
                  onChange={(e) => patchSelectedNode({ symbol: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>vs currency</div>
                <input
                  value={typeof selectedNodeData.vsCurrency === 'string' ? selectedNodeData.vsCurrency : ''}
                  onChange={(e) => patchSelectedNode({ vsCurrency: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="usd"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>direction</div>
                <select
                  value={typeof selectedNodeData.direction === 'string' ? selectedNodeData.direction : 'crosses_above'}
                  onChange={(e) => patchSelectedNode({ direction: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                >
                  <option value="crosses_above">crosses_above</option>
                  <option value="crosses_below">crosses_below</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>threshold</div>
                <input
                  type="number"
                  value={
                    typeof selectedNodeData.threshold === 'number'
                      ? selectedNodeData.threshold
                      : typeof selectedNodeData.threshold === 'string'
                        ? selectedNodeData.threshold
                        : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    patchSelectedNode({ threshold: val === '' ? undefined : Number(val) })
                  }}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="150"
                  min={0}
                  step={0.0001}
                />
              </div>

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
                <div style={{ fontSize: 12, color: '#666' }}>polling interval used by trigger service</div>
              </div>
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

          {selectedNodeType === 'market_data' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>symbol</div>
                <input
                  value={typeof selectedNodeData.symbol === 'string' ? selectedNodeData.symbol : ''}
                  onChange={(e) => patchSelectedNode({ symbol: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>vs currency</div>
                <input
                  value={typeof selectedNodeData.vsCurrency === 'string' ? selectedNodeData.vsCurrency : ''}
                  onChange={(e) => patchSelectedNode({ vsCurrency: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="usd"
                />
              </div>

              <div style={{ fontSize: 12, color: '#666' }}>
                requires backend allowlist via <span style={{ fontFamily: 'monospace' }}>EXECUTOR_HTTP_ALLOWED_HOSTS</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'paper_order' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>symbol</div>
                <input
                  value={typeof selectedNodeData.symbol === 'string' ? selectedNodeData.symbol : ''}
                  onChange={(e) => patchSelectedNode({ symbol: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>side</div>
                <select
                  value={typeof selectedNodeData.side === 'string' ? selectedNodeData.side : 'buy'}
                  onChange={(e) => patchSelectedNode({ side: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                >
                  <option value="buy">buy</option>
                  <option value="sell">sell</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>quantity</div>
                <input
                  type="number"
                  value={
                    typeof selectedNodeData.quantity === 'number'
                      ? selectedNodeData.quantity
                      : typeof selectedNodeData.quantity === 'string'
                        ? selectedNodeData.quantity
                        : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    patchSelectedNode({ quantity: val === '' ? undefined : Number(val) })
                  }}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="1"
                  min={0}
                  step={0.0001}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>price (optional)</div>
                <input
                  type="number"
                  value={
                    typeof selectedNodeData.price === 'number'
                      ? selectedNodeData.price
                      : typeof selectedNodeData.price === 'string'
                        ? selectedNodeData.price
                        : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    patchSelectedNode({ price: val === '' ? undefined : Number(val) })
                  }}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
                  placeholder="150"
                  min={0}
                  step={0.0001}
                />
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
        <select
          value={workflow?.overlapPolicy || 'skip'}
          onChange={(e) => void onSetOverlapPolicy(e.target.value as 'skip' | 'queue' | 'allow')}
          disabled={busy || !workflowId || !workflow}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          <option value="skip">overlap: skip</option>
          <option value="queue">overlap: queue</option>
          <option value="allow">overlap: allow</option>
        </select>
        {(workflow?.overlapPolicy || 'skip') === 'queue' ? (
          <input
            type="number"
            value={maxBacklogDraft}
            onChange={(e) => setMaxBacklogDraft(e.target.value)}
            onBlur={() => {
              const n = Number(maxBacklogDraft)
              if (Number.isFinite(n) && n >= 0) {
                void onSetMaxBacklog(n)
              }
            }}
            disabled={busy || !workflowId || !workflow}
            style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6, width: 160 }}
            placeholder="max backlog"
            min={0}
            max={1000}
          />
        ) : null}
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
          onClick={() => addNode('price_trigger')}
          disabled={busy || !draft || hasTriggerNode}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add price trigger
        </button>
        <button
          type="button"
          onClick={() => addNode('helius_webhook_trigger')}
          disabled={busy || !draft || hasTriggerNode}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add helius webhook
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
          onClick={() => addNode('solana_balance')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add solana balance
        </button>
        <button
          type="button"
          onClick={() => addNode('jupiter_swap')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add jupiter swap
        </button>
        <button
          type="button"
          onClick={() => addNode('market_data')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add market data
        </button>
        <button
          type="button"
          onClick={() => addNode('paper_order')}
          disabled={busy || !draft}
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}
        >
          add paper trade
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
          disabled={busy || !workflowId || !runEligibility.ok}
          title={!runEligibility.ok ? runEligibility.reason || 'workflow is not valid for running' : undefined}
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

      {!error && solanaValidationIssues.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 12,
            zIndex: 10,
            background: '#fff6ed',
            color: '#7a2e0e',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #f9dbaf',
            maxWidth: 520,
          }}
        >
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12 }}>
              workflow has {solanaValidationIssues.length} solana issue{solanaValidationIssues.length === 1 ? '' : 's'}
            </summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {solanaValidationIssues.map((msg) => (
                <div key={msg} style={{ fontSize: 12 }}>
                  {msg}
                </div>
              ))}
            </div>
          </details>
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
