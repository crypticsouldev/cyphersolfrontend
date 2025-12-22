import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import CreateWorkFlow, { type CreateWorkFlowHandle } from '../components/CreateWorkFlow'
import {
  type ApiError,
  deleteWorkflow,
  getWorkflow,
  runWorkflow,
  updateWorkflow,
  type Workflow,
} from '../lib/api'
import { clearAuthToken } from '../lib/auth'
import { useCredentials, useMeta, invalidateWorkflow } from '../lib/hooks'
import { getNodeDoc, getCategoryColor, getCategoryLabel } from '../lib/nodeDocumentation'

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

  const { meta } = useMeta()
  const { credentials } = useCredentials()

  const flowRef = useRef<CreateWorkFlowHandle | null>(null)
  const solanaWalletCredentials = useMemo(() => credentials.filter((c) => c.provider === 'solana_wallet'), [credentials])
  const discordWebhookCredentials = useMemo(
    () => credentials.filter((c) => c.provider === 'discord_webhook'),
    [credentials],
  )
  const telegramCredentials = useMemo(
    () => credentials.filter((c) => c.provider === 'telegram_bot'),
    [credentials],
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')
  const [maxBacklogDraft, setMaxBacklogDraft] = useState('')
  const [lastSavedDraft, setLastSavedDraft] = useState<string>('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingNameValue, setEditingNameValue] = useState('')

  // Track if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft) return false
    const currentDraftStr = JSON.stringify({ nodes: draft.nodes, edges: draft.edges })
    return currentDraftStr !== lastSavedDraft
  }, [draft, lastSavedDraft])

  // Warn on browser close/refresh with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const onBackToDashboard = useCallback(async () => {
    if (hasUnsavedChanges) {
      const shouldSave = window.confirm(
        'You have unsaved changes.\n\nClick OK to save and leave, or Cancel to discard and leave.'
      )
      if (shouldSave) {
        await onSave()
      }
    }
    navigate('/dashboard')
  }, [hasUnsavedChanges, navigate, onSave])

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
      return kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'onchain_trigger'
    })

    if (triggers.length === 0) {
      return { ok: false, reason: 'add a trigger node to enable automation' }
    }

    if (triggers.length > 1) {
      return { ok: false, reason: 'only one trigger node is allowed' }
    }

    const data = (triggers[0].data as any) || {}
    const kind = String(data?.type || (triggers[0] as any)?.type || '')

    if (kind === 'onchain_trigger') {
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
      return kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'onchain_trigger'
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
        setLastSavedDraft(JSON.stringify({ nodes, edges }))
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
      | 'transform'
      | 'if'
      | 'discord_webhook'
      | 'dexscreener_price'
      | 'pyth_price_feed_id'
      | 'pyth_price'
      | 'delay'
      | 'http_request'
      | 'solana_balance'
      | 'solana_transfer'
      | 'solana_stake'
      | 'solana_restake'
      | 'close_empty_token_accounts'
      | 'jupiter_swap'
      | 'parse_transaction'
      | 'cooldown'
      | 'solana_confirm_tx'
      | 'get_token_data'
      | 'raydium_swap'
      | 'pump_fun_buy'
      | 'pump_fun_sell'
      | 'lulo_lend'
      | 'jupiter_quote'
      | 'solana_token_balance'
      | 'wait_for_confirmation'
      | 'telegram_notify'
      | 'balance_threshold_trigger'
      | 'memo'
      | 'transaction_log'
      | 'retry'
      | 'split_order'
      | 'birdeye_price'
      | 'token_holders'
      | 'whale_alert'
      | 'portfolio_value'
      | 'stop_loss'
      | 'take_profit'
      | 'token_supply'
      | 'wallet_transactions'
      | 'price_change_trigger'
      | 'copy_trade'
      | 'trailing_stop'
      | 'average_cost'
      | 'position_size'
      | 'pnl_calculator'
      | 'volume_check'
      | 'liquidity_check'
      | 'slippage_estimator'
      | 'limit_order'
      | 'twap'
      | 'rug_check'
      | 'timer_trigger'
      | 'price_trigger'
      | 'onchain_trigger'
      | 'market_data',
  ) {
    if (!draft) return

    if (kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'onchain_trigger') {
      const existing = draft.nodes.find((n) => {
        const data = (n.data as any) || {}
        const nodeKind = String(data?.type || (n as any)?.type || '')
        return nodeKind === 'timer_trigger' || nodeKind === 'price_trigger' || nodeKind === 'onchain_trigger'
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

    if (kind === 'transform') {
      baseData.value = {
        ok: true,
      }
    }

    if (kind === 'if') {
      baseData.op = 'truthy'
      baseData.left = true
    }

    if (kind === 'discord_webhook') {
      baseData.content = 'hello from cyphersol'
      baseData.username = 'cyphersol'
    }

    if (kind === 'dexscreener_price') {
      baseData.pairAddress = ''
    }

    if (kind === 'pyth_price_feed_id') {
      baseData.tokenSymbol = 'SOL'
    }

    if (kind === 'pyth_price') {
      baseData.priceFeedId = ''
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

    if (kind === 'solana_transfer') {
      baseData.to = ''
      baseData.amount = 0.01
    }

    if (kind === 'solana_stake' || kind === 'solana_restake') {
      baseData.amount = 0.1
    }

    if (kind === 'jupiter_swap') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      baseData.amount = 0.01
      baseData.slippageBps = 300
    }

    if (kind === 'parse_transaction') {
      baseData.signature = ''
    }

    if (kind === 'cooldown') {
      baseData.key = 'my-cooldown'
      baseData.ttlSeconds = 60
    }

    if (kind === 'solana_confirm_tx') {
      baseData.signature = ''
      baseData.commitment = 'confirmed'
    }

    if (kind === 'get_token_data') {
      baseData.mint = ''
    }

    if (kind === 'raydium_swap') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      baseData.amount = 0.01
      baseData.slippageBps = 300
    }

    if (kind === 'pump_fun_buy') {
      baseData.mint = ''
      baseData.solAmount = 0.01
      baseData.slippageBps = 500
    }

    if (kind === 'pump_fun_sell') {
      baseData.mint = ''
      baseData.tokenAmount = 1000
      baseData.slippageBps = 500
    }

    if (kind === 'lulo_lend') {
      baseData.amount = 1
    }

    if (kind === 'jupiter_quote') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      baseData.amount = 1
      baseData.slippageBps = 50
    }

    if (kind === 'solana_token_balance') {
      baseData.mint = ''
    }

    if (kind === 'wait_for_confirmation') {
      baseData.signature = ''
      baseData.commitment = 'confirmed'
      baseData.timeoutMs = 60000
    }

    if (kind === 'telegram_notify') {
      baseData.chatId = ''
      baseData.message = ''
    }

    if (kind === 'balance_threshold_trigger') {
      baseData.direction = 'above'
      baseData.threshold = 1
      baseData.intervalSeconds = 60
    }

    if (kind === 'memo') {
      baseData.memo = ''
    }

    if (kind === 'transaction_log') {
      baseData.signature = ''
      baseData.action = 'trade'
    }

    if (kind === 'retry') {
      baseData.maxAttempts = 3
      baseData.delayMs = 1000
      baseData.backoffMultiplier = 2
    }

    if (kind === 'split_order') {
      baseData.totalAmount = 1
      baseData.chunks = 5
      baseData.delayBetweenMs = 5000
    }

    if (kind === 'birdeye_price') {
      baseData.mint = ''
    }

    if (kind === 'token_holders') {
      baseData.mint = ''
      baseData.limit = 20
    }

    if (kind === 'whale_alert') {
      baseData.mint = ''
      baseData.minAmount = 10000
    }

    if (kind === 'portfolio_value') {
      // just needs credentialId
    }

    if (kind === 'stop_loss') {
      baseData.mint = ''
      baseData.triggerPriceUsd = 0
      baseData.sellPercentage = 100
    }

    if (kind === 'take_profit') {
      baseData.mint = ''
      baseData.triggerPriceUsd = 0
      baseData.sellPercentage = 100
    }

    if (kind === 'token_supply') {
      baseData.mint = ''
    }

    if (kind === 'wallet_transactions') {
      baseData.limit = 10
    }

    if (kind === 'price_change_trigger') {
      baseData.mint = ''
      baseData.changePercentage = 5
      baseData.direction = 'any'
      baseData.timeframeMinutes = 60
    }

    if (kind === 'copy_trade') {
      baseData.targetWallet = ''
      baseData.slippageBps = 300
    }

    if (kind === 'trailing_stop') {
      baseData.mint = ''
      baseData.trailPercentage = 5
      baseData.sellPercentage = 100
    }

    if (kind === 'average_cost') {
      baseData.mint = ''
    }

    if (kind === 'position_size') {
      baseData.accountBalance = 1000
      baseData.riskPercentage = 2
      baseData.entryPrice = 0
      baseData.stopLossPrice = 0
    }

    if (kind === 'pnl_calculator') {
      baseData.entryPrice = 0
      baseData.currentPrice = 0
      baseData.quantity = 1
      baseData.side = 'long'
    }

    if (kind === 'volume_check') {
      baseData.mint = ''
      baseData.minVolume24h = 10000
    }

    if (kind === 'liquidity_check') {
      baseData.mint = ''
      baseData.minLiquidityUsd = 50000
    }

    if (kind === 'slippage_estimator') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = ''
      baseData.amount = 1
    }

    if (kind === 'limit_order') {
      baseData.mint = ''
      baseData.side = 'buy'
      baseData.targetPriceUsd = 0
      baseData.amount = 1
    }

    if (kind === 'twap') {
      baseData.inputMint = 'So11111111111111111111111111111111111111112'
      baseData.outputMint = ''
      baseData.totalAmount = 1
      baseData.intervals = 5
      baseData.intervalMinutes = 10
      baseData.slippageBps = 300
    }

    if (kind === 'rug_check') {
      baseData.mint = ''
      baseData.minTokenAgeMinutes = 60
      baseData.maxTopHolderPercentage = 50
    }

    if (kind === 'market_data') {
      baseData.symbol = 'SOL'
      baseData.vsCurrency = 'usd'
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

    if (kind === 'onchain_trigger') {
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
      setLastSavedDraft(JSON.stringify({ nodes: draft.nodes, edges: draft.edges }))
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

  async function onInlineRename(newName: string) {
    if (!workflowId || !workflow) return
    if (!newName.trim() || newName.trim() === workflow.name) {
      setIsEditingName(false)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const res = await updateWorkflow(workflowId, { name: newName.trim() })
      setWorkflow(res.workflow)
      setIsEditingName(false)
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

    // Check for unsaved changes
    if (hasUnsavedChanges) {
      const choice = window.confirm(
        'You have unsaved changes.\n\nClick OK to save and run, or Cancel to go back to editor.'
      )
      if (choice) {
        // Save first, then run
        await onSave()
      } else {
        // User cancelled - go back to editor without running
        return
      }
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
    <div style={{ width: '100vw', height: '100vh', background: 'var(--color-bg-subtle)' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          padding: '10px 12px',
          borderRadius: 12,
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/dashboard"
            onClick={(e) => {
              e.preventDefault()
              void onBackToDashboard()
            }}
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              padding: '8px 10px',
              borderRadius: 10,
              textDecoration: 'none',
              color: 'inherit',
              fontSize: 12,
            }}
          >
            ← back
          </Link>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isEditingName ? (
              <input
                autoFocus
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                onBlur={() => void onInlineRename(editingNameValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onInlineRename(editingNameValue)
                  if (e.key === 'Escape') setIsEditingName(false)
                }}
                style={{
                  fontSize: 12,
                  padding: '4px 8px',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 6,
                  outline: 'none',
                  minWidth: 120,
                }}
              />
            ) : (
              <>
                <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{title}</span>
                <button
                  onClick={() => {
                    setEditingNameValue(workflow?.name || '')
                    setIsEditingName(true)
                  }}
                  disabled={!workflow}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                  }}
                  title="Rename workflow"
                >
                  ✏️
                </button>
              </>
            )}
            {workflow ? (
              <span style={{ fontSize: 11, color: workflow.enabled ? '#157f3b' : '#888', marginLeft: 4 }}>
                {workflow.enabled ? '● enabled' : '○ disabled'}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !draft}
            style={{ background: '#111', color: '#fff', border: '1px solid #111', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}
          >
            {busy ? '...' : 'save'}
          </button>

          <button
            type="button"
            onClick={onToggleEnabled}
            disabled={busy || !workflowId || !workflow || (!workflow.enabled && !enableEligibility.ok)}
            title={!workflow?.enabled && !enableEligibility.ok ? enableEligibility.reason || 'workflow is not valid for enabling' : undefined}
            style={{
              background: 'var(--color-bg)',
              color: workflow?.enabled ? '#b42318' : '#157f3b',
              border: '1px solid var(--color-border)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {workflow?.enabled ? 'disable' : 'enable'}
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={busy || !workflowId || !runEligibility.ok}
            title={!runEligibility.ok ? runEligibility.reason || 'workflow is not valid for running' : undefined}
            style={{ background: '#0b5', color: '#fff', border: '1px solid #084', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}
          >
            ▶ run
          </button>

          {workflowId ? (
            <Link
              to={`/workflows/${workflowId}/executions`}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                fontSize: 12,
              }}
            >
              executions
            </Link>
          ) : null}
        </div>
      </div>

      {selectedNodeId ? (
        <div
          style={{
            position: 'absolute',
            top: 122,
            left: 12,
            zIndex: 10,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: 12,
            display: 'grid',
            gap: 10,
            maxWidth: 520,
            boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>selected node</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{selectedNodeId}</div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>label</div>
            <input
              value={typeof selectedNodeData.label === 'string' ? selectedNodeData.label : ''}
              onChange={(e) => patchSelectedNode({ label: e.target.value })}
              disabled={busy}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
              placeholder="label"
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>type</div>
            <select
              value={selectedNodeType}
              onChange={(e) => {
                const nextType = e.target.value
                if (
                  (nextType === 'timer_trigger' || nextType === 'price_trigger' || nextType === 'onchain_trigger') &&
                  draft
                ) {
                  const existingTrigger = draft.nodes.find((n) => {
                    const data = (n.data as any) || {}
                    const kind = String(data?.type || (n as any)?.type || '')
                    return (
                      (kind === 'timer_trigger' || kind === 'price_trigger' || kind === 'onchain_trigger') &&
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
                      nextType === 'onchain_trigger'
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

                if (nextType === 'transform') {
                  patchSelectedNode({
                    type: nextType,
                    value: (selectedNodeData as any).value ?? { ok: true },
                  })
                  return
                }

                if (nextType === 'if') {
                  patchSelectedNode({
                    type: nextType,
                    op: (selectedNodeData as any).op || 'truthy',
                    left: (selectedNodeData as any).left ?? true,
                    right: (selectedNodeData as any).right,
                  })
                  return
                }

                if (nextType === 'discord_webhook') {
                  patchSelectedNode({
                    type: nextType,
                    webhookUrl: (selectedNodeData as any).webhookUrl,
                    credentialId: (selectedNodeData as any).credentialId,
                    content: (selectedNodeData as any).content || 'hello from cyphersol',
                    username: (selectedNodeData as any).username || 'cyphersol',
                  })
                  return
                }

                if (nextType === 'dexscreener_price') {
                  patchSelectedNode({
                    type: nextType,
                    pairAddress: (selectedNodeData as any).pairAddress || '',
                  })
                  return
                }

                if (nextType === 'pyth_price_feed_id') {
                  patchSelectedNode({
                    type: nextType,
                    tokenSymbol: (selectedNodeData as any).tokenSymbol || 'SOL',
                  })
                  return
                }

                if (nextType === 'pyth_price') {
                  patchSelectedNode({
                    type: nextType,
                    priceFeedId: (selectedNodeData as any).priceFeedId || '',
                  })
                  return
                }

                if (nextType === 'solana_transfer') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    to: (selectedNodeData as any).to || '',
                    mint: (selectedNodeData as any).mint,
                    amount: (selectedNodeData as any).amount ?? 0.01,
                  })
                  return
                }

                if (nextType === 'solana_stake' || nextType === 'solana_restake') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    amount: (selectedNodeData as any).amount ?? 0.1,
                  })
                  return
                }

                if (nextType === 'close_empty_token_accounts') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                  })
                  return
                }

                if (nextType === 'parse_transaction') {
                  patchSelectedNode({
                    type: nextType,
                    signature: (selectedNodeData as any).signature || '',
                  })
                  return
                }

                if (nextType === 'cooldown') {
                  patchSelectedNode({
                    type: nextType,
                    key: (selectedNodeData as any).key || 'my-cooldown',
                    ttlSeconds: (selectedNodeData as any).ttlSeconds ?? 60,
                  })
                  return
                }

                if (nextType === 'solana_confirm_tx') {
                  patchSelectedNode({
                    type: nextType,
                    signature: (selectedNodeData as any).signature || '',
                    commitment: (selectedNodeData as any).commitment || 'confirmed',
                  })
                  return
                }

                if (nextType === 'get_token_data') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                  })
                  return
                }

                if (nextType === 'raydium_swap') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    inputMint: (selectedNodeData as any).inputMint || 'So11111111111111111111111111111111111111112',
                    outputMint: (selectedNodeData as any).outputMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: (selectedNodeData as any).amount ?? 0.01,
                    slippageBps: (selectedNodeData as any).slippageBps ?? 300,
                  })
                  return
                }

                if (nextType === 'pump_fun_buy') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                    solAmount: (selectedNodeData as any).solAmount ?? 0.01,
                    slippageBps: (selectedNodeData as any).slippageBps ?? 500,
                  })
                  return
                }

                if (nextType === 'pump_fun_sell') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                    tokenAmount: (selectedNodeData as any).tokenAmount ?? 1000,
                    slippageBps: (selectedNodeData as any).slippageBps ?? 500,
                  })
                  return
                }

                if (nextType === 'lulo_lend') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    amount: (selectedNodeData as any).amount ?? 1,
                  })
                  return
                }

                if (nextType === 'jupiter_quote') {
                  patchSelectedNode({
                    type: nextType,
                    inputMint: (selectedNodeData as any).inputMint || 'So11111111111111111111111111111111111111112',
                    outputMint: (selectedNodeData as any).outputMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: (selectedNodeData as any).amount ?? 1,
                    slippageBps: (selectedNodeData as any).slippageBps ?? 50,
                  })
                  return
                }

                if (nextType === 'solana_token_balance') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                  })
                  return
                }

                if (nextType === 'wait_for_confirmation') {
                  patchSelectedNode({
                    type: nextType,
                    signature: (selectedNodeData as any).signature || '',
                    commitment: (selectedNodeData as any).commitment || 'confirmed',
                    timeoutMs: (selectedNodeData as any).timeoutMs ?? 60000,
                  })
                  return
                }

                if (nextType === 'telegram_notify') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    chatId: (selectedNodeData as any).chatId || '',
                    message: (selectedNodeData as any).message || '',
                  })
                  return
                }

                if (nextType === 'balance_threshold_trigger') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint,
                    direction: (selectedNodeData as any).direction || 'above',
                    threshold: (selectedNodeData as any).threshold ?? 1,
                    intervalSeconds: (selectedNodeData as any).intervalSeconds ?? 60,
                  })
                  return
                }

                if (nextType === 'memo') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    memo: (selectedNodeData as any).memo || '',
                  })
                  return
                }

                if (nextType === 'transaction_log') {
                  patchSelectedNode({
                    type: nextType,
                    signature: (selectedNodeData as any).signature || '',
                    action: (selectedNodeData as any).action || 'trade',
                  })
                  return
                }

                if (nextType === 'retry') {
                  patchSelectedNode({
                    type: nextType,
                    maxAttempts: (selectedNodeData as any).maxAttempts ?? 3,
                    delayMs: (selectedNodeData as any).delayMs ?? 1000,
                    backoffMultiplier: (selectedNodeData as any).backoffMultiplier ?? 2,
                  })
                  return
                }

                if (nextType === 'split_order') {
                  patchSelectedNode({
                    type: nextType,
                    totalAmount: (selectedNodeData as any).totalAmount ?? 1,
                    chunks: (selectedNodeData as any).chunks ?? 5,
                    delayBetweenMs: (selectedNodeData as any).delayBetweenMs ?? 5000,
                  })
                  return
                }

                if (nextType === 'birdeye_price' || nextType === 'token_supply') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                  })
                  return
                }

                if (nextType === 'token_holders') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                    limit: (selectedNodeData as any).limit ?? 20,
                  })
                  return
                }

                if (nextType === 'whale_alert') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                    minAmount: (selectedNodeData as any).minAmount ?? 10000,
                  })
                  return
                }

                if (nextType === 'portfolio_value' || nextType === 'wallet_transactions') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    limit: (selectedNodeData as any).limit ?? 10,
                  })
                  return
                }

                if (nextType === 'stop_loss' || nextType === 'take_profit') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                    triggerPriceUsd: (selectedNodeData as any).triggerPriceUsd ?? 0,
                    sellPercentage: (selectedNodeData as any).sellPercentage ?? 100,
                  })
                  return
                }

                if (nextType === 'price_change_trigger') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                    changePercentage: (selectedNodeData as any).changePercentage ?? 5,
                    direction: (selectedNodeData as any).direction || 'any',
                    timeframeMinutes: (selectedNodeData as any).timeframeMinutes ?? 60,
                  })
                  return
                }

                if (nextType === 'copy_trade') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    targetWallet: (selectedNodeData as any).targetWallet || '',
                    slippageBps: (selectedNodeData as any).slippageBps ?? 300,
                  })
                  return
                }

                if (nextType === 'trailing_stop') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                    trailPercentage: (selectedNodeData as any).trailPercentage ?? 5,
                    sellPercentage: (selectedNodeData as any).sellPercentage ?? 100,
                  })
                  return
                }

                if (nextType === 'average_cost') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                  })
                  return
                }

                if (nextType === 'position_size') {
                  patchSelectedNode({
                    type: nextType,
                    accountBalance: (selectedNodeData as any).accountBalance ?? 1000,
                    riskPercentage: (selectedNodeData as any).riskPercentage ?? 2,
                    entryPrice: (selectedNodeData as any).entryPrice ?? 0,
                    stopLossPrice: (selectedNodeData as any).stopLossPrice ?? 0,
                  })
                  return
                }

                if (nextType === 'pnl_calculator') {
                  patchSelectedNode({
                    type: nextType,
                    entryPrice: (selectedNodeData as any).entryPrice ?? 0,
                    currentPrice: (selectedNodeData as any).currentPrice ?? 0,
                    quantity: (selectedNodeData as any).quantity ?? 1,
                    side: (selectedNodeData as any).side || 'long',
                  })
                  return
                }

                if (nextType === 'volume_check' || nextType === 'liquidity_check' || nextType === 'rug_check') {
                  patchSelectedNode({
                    type: nextType,
                    mint: (selectedNodeData as any).mint || '',
                  })
                  return
                }

                if (nextType === 'slippage_estimator') {
                  patchSelectedNode({
                    type: nextType,
                    inputMint: (selectedNodeData as any).inputMint || 'So11111111111111111111111111111111111111112',
                    outputMint: (selectedNodeData as any).outputMint || '',
                    amount: (selectedNodeData as any).amount ?? 1,
                  })
                  return
                }

                if (nextType === 'limit_order') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    mint: (selectedNodeData as any).mint || '',
                    side: (selectedNodeData as any).side || 'buy',
                    targetPriceUsd: (selectedNodeData as any).targetPriceUsd ?? 0,
                    amount: (selectedNodeData as any).amount ?? 1,
                  })
                  return
                }

                if (nextType === 'twap') {
                  patchSelectedNode({
                    type: nextType,
                    credentialId: (selectedNodeData as any).credentialId,
                    inputMint: (selectedNodeData as any).inputMint || 'So11111111111111111111111111111111111111112',
                    outputMint: (selectedNodeData as any).outputMint || '',
                    totalAmount: (selectedNodeData as any).totalAmount ?? 1,
                    intervals: (selectedNodeData as any).intervals ?? 5,
                    intervalMinutes: (selectedNodeData as any).intervalMinutes ?? 10,
                  })
                  return
                }

                patchSelectedNode({ type: nextType })
              }}
              disabled={busy}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
            >
              <option value="timer_trigger">timer_trigger</option>
              <option value="price_trigger">price_trigger</option>
              <option value="onchain_trigger">onchain_trigger</option>
              <option value="log">log</option>
              <option value="transform">transform</option>
              <option value="if">if</option>
              <option value="discord_webhook">discord_webhook</option>
              <option value="dexscreener_price">dexscreener_price</option>
              <option value="pyth_price_feed_id">pyth_price_feed_id</option>
              <option value="pyth_price">pyth_price</option>
              <option value="delay">delay</option>
              <option value="http_request">http_request</option>
              <option value="solana_balance">solana_balance</option>
              <option value="solana_transfer">solana_transfer</option>
              <option value="solana_stake">solana_stake</option>
              <option value="solana_restake">solana_restake</option>
              <option value="close_empty_token_accounts">close_empty_token_accounts</option>
              <option value="jupiter_swap">jupiter_swap</option>
              <option value="parse_transaction">parse_transaction</option>
              <option value="cooldown">cooldown</option>
              <option value="solana_confirm_tx">solana_confirm_tx</option>
              <option value="get_token_data">get_token_data</option>
              <option value="raydium_swap">raydium_swap</option>
              <option value="pump_fun_buy">pump_fun_buy</option>
              <option value="pump_fun_sell">pump_fun_sell</option>
              <option value="lulo_lend">lulo_lend</option>
              <option value="jupiter_quote">jupiter_quote</option>
              <option value="solana_token_balance">solana_token_balance</option>
              <option value="wait_for_confirmation">wait_for_confirmation</option>
              <option value="telegram_notify">telegram_notify</option>
              <option value="balance_threshold_trigger">balance_threshold_trigger</option>
              <option value="memo">memo</option>
              <option value="transaction_log">transaction_log</option>
              <option value="retry">retry</option>
              <option value="split_order">split_order</option>
              <option value="birdeye_price">birdeye_price</option>
              <option value="token_holders">token_holders</option>
              <option value="whale_alert">whale_alert</option>
              <option value="portfolio_value">portfolio_value</option>
              <option value="stop_loss">stop_loss</option>
              <option value="take_profit">take_profit</option>
              <option value="token_supply">token_supply</option>
              <option value="wallet_transactions">wallet_transactions</option>
              <option value="price_change_trigger">price_change_trigger</option>
              <option value="copy_trade">copy_trade</option>
              <option value="trailing_stop">trailing_stop</option>
              <option value="average_cost">average_cost</option>
              <option value="position_size">position_size</option>
              <option value="pnl_calculator">pnl_calculator</option>
              <option value="volume_check">volume_check</option>
              <option value="liquidity_check">liquidity_check</option>
              <option value="slippage_estimator">slippage_estimator</option>
              <option value="limit_order">limit_order</option>
              <option value="twap">twap</option>
              <option value="rug_check">rug_check</option>
              <option value="market_data">market_data</option>
            </select>
          </div>

          {/* Node Documentation */}
          {selectedNodeType && getNodeDoc(selectedNodeType) && (
            <div style={{ 
              background: 'var(--color-hover)', 
              borderRadius: 8, 
              padding: 12,
              marginBottom: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ 
                  display: 'inline-block',
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%',
                  background: getCategoryColor(getNodeDoc(selectedNodeType)!.category),
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>
                  {getCategoryLabel(getNodeDoc(selectedNodeType)!.category)}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {getNodeDoc(selectedNodeType)!.description}
              </div>
              {getNodeDoc(selectedNodeType)!.example && (
                <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginTop: 8, fontStyle: 'italic' }}>
                  💡 {getNodeDoc(selectedNodeType)!.example}
                </div>
              )}
              {getNodeDoc(selectedNodeType)!.outputs && (
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 8 }}>
                  <strong>Outputs:</strong> {getNodeDoc(selectedNodeType)!.outputs!.join(', ')}
                </div>
              )}
            </div>
          )}

          {selectedNodeType === 'log' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>message</div>
              <input
                value={typeof selectedNodeData.message === 'string' ? selectedNodeData.message : ''}
                onChange={(e) => patchSelectedNode({ message: e.target.value })}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                placeholder="message"
              />
            </div>
          ) : null}

          {selectedNodeType === 'pyth_price_feed_id' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token symbol</div>
              <input
                value={typeof (selectedNodeData as any).tokenSymbol === 'string' ? (selectedNodeData as any).tokenSymbol : ''}
                onChange={(e) => patchSelectedNode({ tokenSymbol: e.target.value })}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                placeholder="SOL"
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                fetched from <span style={{ fontFamily: 'monospace' }}>hermes.pyth.network</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'pyth_price' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>price feed id</div>
              <input
                value={typeof (selectedNodeData as any).priceFeedId === 'string' ? (selectedNodeData as any).priceFeedId : ''}
                onChange={(e) => patchSelectedNode({ priceFeedId: e.target.value })}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                placeholder="feed id"
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                fetched from <span style={{ fontFamily: 'monospace' }}>hermes.pyth.network</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'close_empty_token_accounts' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontSize: 12,
                    }}
                  >
                    manage
                  </Link>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'solana_stake' || selectedNodeType === 'solana_restake' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount (sol)</div>
                <input
                  value={selectedNodeData.amount === undefined || selectedNodeData.amount === null ? '' : String(selectedNodeData.amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.1"
                />
                {meta && Number.isFinite(Number((selectedNodeData as any).amount)) ? (
                  selectedNodeType === 'solana_stake'
                    ? Number((selectedNodeData as any).amount) > meta.solanaStakeMaxSol
                      ? (
                          <div style={{ fontSize: 12, color: '#b42318' }}>amount exceeds max</div>
                        )
                      : null
                    : Number((selectedNodeData as any).amount) > meta.solanaRestakeMaxSol
                      ? (
                          <div style={{ fontSize: 12, color: '#b42318' }}>amount exceeds max</div>
                        )
                      : null
                ) : null}
              </div>

              {meta ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  safety caps: stake max {meta.solanaStakeMaxSol} · restake max {meta.solanaRestakeMaxSol}
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'solana_transfer' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</div>
                <input
                  value={typeof selectedNodeData.to === 'string' ? selectedNodeData.to : ''}
                  onChange={(e) => patchSelectedNode({ to: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="recipient public key"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>mint (optional)</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value || undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="leave empty for SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount (token units)</div>
                <input
                  value={selectedNodeData.amount === undefined || selectedNodeData.amount === null ? '' : String(selectedNodeData.amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.01"
                />
                {meta && Number.isFinite(Number((selectedNodeData as any).amount)) ? (
                  (typeof (selectedNodeData as any).mint === 'string' && (selectedNodeData as any).mint.trim().length > 0
                    ? Number((selectedNodeData as any).amount) > meta.solanaTransferMaxTokenAmount
                    : Number((selectedNodeData as any).amount) > meta.solanaTransferMaxSol) ? (
                    <div style={{ fontSize: 12, color: '#b42318' }}>amount exceeds max</div>
                  ) : null
                ) : null}
              </div>

              {meta ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  safety caps: max sol {meta.solanaTransferMaxSol} · max token amount {meta.solanaTransferMaxTokenAmount}
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'dexscreener_price' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>pair address (solana)</div>
              <input
                value={typeof selectedNodeData.pairAddress === 'string' ? selectedNodeData.pairAddress : ''}
                onChange={(e) => patchSelectedNode({ pairAddress: e.target.value })}
                disabled={busy}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                placeholder="pair address"
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                fetched from <span style={{ fontFamily: 'monospace' }}>api.dexscreener.com</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'parse_transaction' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>transaction signature</div>
                <input
                  value={typeof selectedNodeData.signature === 'string' ? selectedNodeData.signature : ''}
                  onChange={(e) => patchSelectedNode({ signature: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="5abc123... or {{node.signature}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Parses and enriches transaction with human-readable details.
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                returns: type, source, description, transfers, events
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'cooldown' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>cooldown key</div>
                <input
                  value={typeof selectedNodeData.key === 'string' ? selectedNodeData.key : ''}
                  onChange={(e) => patchSelectedNode({ key: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="my-cooldown or {{trigger.feePayer}}"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>ttl (seconds)</div>
                <input
                  type="number"
                  value={selectedNodeData.ttlSeconds === undefined || selectedNodeData.ttlSeconds === null ? '' : String(selectedNodeData.ttlSeconds)}
                  onChange={(e) => patchSelectedNode({ ttlSeconds: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="60"
                  min={1}
                  max={604800}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                gates downstream nodes. if cooldown is active (key seen within ttl), downstream nodes are skipped.
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'solana_confirm_tx' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>transaction signature</div>
                <input
                  value={typeof selectedNodeData.signature === 'string' ? selectedNodeData.signature : ''}
                  onChange={(e) => patchSelectedNode({ signature: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="5abc123... or {{node.signature}}"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>commitment</div>
                <select
                  value={typeof (selectedNodeData as any).commitment === 'string' ? (selectedNodeData as any).commitment : 'confirmed'}
                  onChange={(e) => patchSelectedNode({ commitment: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="processed">processed</option>
                  <option value="confirmed">confirmed</option>
                  <option value="finalized">finalized</option>
                </select>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                returns: found, confirmed, finalized, confirmationStatus, slot, err
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'get_token_data' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint address</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5... or {{node.mint}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                returns: decimals, supply, mintAuthority, freezeAuthority
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'raydium_swap' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
                <input
                  value={typeof (selectedNodeData as any).inputMint === 'string' ? (selectedNodeData as any).inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="So11111111111111111111111111111111111111112"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
                <input
                  value={typeof (selectedNodeData as any).outputMint === 'string' ? (selectedNodeData as any).outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount</div>
                <input
                  value={(selectedNodeData as any).amount === undefined ? '' : String((selectedNodeData as any).amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.01"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage (bps)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).slippageBps === undefined ? '' : String((selectedNodeData as any).slippageBps)}
                  onChange={(e) => patchSelectedNode({ slippageBps: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="300"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>swaps via raydium amm</div>
            </div>
          ) : null}

          {selectedNodeType === 'pump_fun_buy' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="pump.fun token mint"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sol amount</div>
                <input
                  value={(selectedNodeData as any).solAmount === undefined ? '' : String((selectedNodeData as any).solAmount)}
                  onChange={(e) => patchSelectedNode({ solAmount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.01"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage (bps)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).slippageBps === undefined ? '' : String((selectedNodeData as any).slippageBps)}
                  onChange={(e) => patchSelectedNode({ slippageBps: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="500"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>buys token on pump.fun</div>
            </div>
          ) : null}

          {selectedNodeType === 'pump_fun_sell' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="pump.fun token mint"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token amount</div>
                <input
                  value={(selectedNodeData as any).tokenAmount === undefined ? '' : String((selectedNodeData as any).tokenAmount)}
                  onChange={(e) => patchSelectedNode({ tokenAmount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1000"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage (bps)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).slippageBps === undefined ? '' : String((selectedNodeData as any).slippageBps)}
                  onChange={(e) => patchSelectedNode({ slippageBps: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="500"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sells token on pump.fun</div>
            </div>
          ) : null}

          {selectedNodeType === 'lulo_lend' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>usdc amount</div>
                <input
                  value={(selectedNodeData as any).amount === undefined ? '' : String((selectedNodeData as any).amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>lends usdc via lulo protocol</div>
            </div>
          ) : null}

          {selectedNodeType === 'jupiter_quote' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
                <input
                  value={typeof (selectedNodeData as any).inputMint === 'string' ? (selectedNodeData as any).inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="So11111111111111111111111111111111111111112"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
                <input
                  value={typeof (selectedNodeData as any).outputMint === 'string' ? (selectedNodeData as any).outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount</div>
                <input
                  value={(selectedNodeData as any).amount === undefined ? '' : String((selectedNodeData as any).amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gets jupiter quote without executing swap</div>
            </div>
          ) : null}

          {selectedNodeType === 'solana_token_balance' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5... or {{node.mint}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>returns: balance, decimals</div>
            </div>
          ) : null}

          {selectedNodeType === 'wait_for_confirmation' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>transaction signature</div>
                <input
                  value={typeof (selectedNodeData as any).signature === 'string' ? (selectedNodeData as any).signature : ''}
                  onChange={(e) => patchSelectedNode({ signature: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="{{node.signature}}"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>commitment</div>
                <select
                  value={typeof (selectedNodeData as any).commitment === 'string' ? (selectedNodeData as any).commitment : 'confirmed'}
                  onChange={(e) => patchSelectedNode({ commitment: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="confirmed">confirmed</option>
                  <option value="finalized">finalized</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>timeout (ms)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).timeoutMs === undefined ? '' : String((selectedNodeData as any).timeoutMs)}
                  onChange={(e) => patchSelectedNode({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="60000"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>polls until tx reaches commitment level</div>
            </div>
          ) : null}

          {selectedNodeType === 'telegram_notify' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>bot token credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
                  >
                    <option value="">select telegram_bot credential</option>
                    {credentials
                      .filter((c) => c.provider === 'telegram_bot')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.provider} · {c.name}
                        </option>
                      ))}
                  </select>
                  <Link
                    to="/credentials"
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>chat id</div>
                <input
                  value={typeof (selectedNodeData as any).chatId === 'string' ? (selectedNodeData as any).chatId : ''}
                  onChange={(e) => patchSelectedNode({ chatId: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="-1001234567890"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>message</div>
                <textarea
                  value={typeof (selectedNodeData as any).message === 'string' ? (selectedNodeData as any).message : ''}
                  onChange={(e) => patchSelectedNode({ message: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', minHeight: 60 }}
                  placeholder="Trade executed: {{node.signature}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sends message via telegram bot api</div>
            </div>
          ) : null}

          {selectedNodeType === 'balance_threshold_trigger' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint (empty for SOL)</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="leave empty for SOL"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>direction</div>
                <select
                  value={typeof (selectedNodeData as any).direction === 'string' ? (selectedNodeData as any).direction : 'above'}
                  onChange={(e) => patchSelectedNode({ direction: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>threshold</div>
                <input
                  value={(selectedNodeData as any).threshold === undefined ? '' : String((selectedNodeData as any).threshold)}
                  onChange={(e) => patchSelectedNode({ threshold: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gates downstream if balance doesn't meet threshold</div>
            </div>
          ) : null}

          {selectedNodeType === 'memo' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>memo text</div>
                <input
                  value={typeof (selectedNodeData as any).memo === 'string' ? (selectedNodeData as any).memo : ''}
                  onChange={(e) => patchSelectedNode({ memo: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="workflow:{{workflowId}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>adds memo to solana blockchain</div>
            </div>
          ) : null}

          {selectedNodeType === 'transaction_log' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>transaction signature</div>
                <input
                  value={typeof (selectedNodeData as any).signature === 'string' ? (selectedNodeData as any).signature : ''}
                  onChange={(e) => patchSelectedNode({ signature: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="{{node.signature}}"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>action label</div>
                <input
                  value={typeof (selectedNodeData as any).action === 'string' ? (selectedNodeData as any).action : ''}
                  onChange={(e) => patchSelectedNode({ action: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="swap, buy, sell..."
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>logs transaction for audit trail</div>
            </div>
          ) : null}

          {selectedNodeType === 'retry' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>max attempts</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).maxAttempts === undefined ? '' : String((selectedNodeData as any).maxAttempts)}
                  onChange={(e) => patchSelectedNode({ maxAttempts: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="3"
                  min={1}
                  max={10}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>delay (ms)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).delayMs === undefined ? '' : String((selectedNodeData as any).delayMs)}
                  onChange={(e) => patchSelectedNode({ delayMs: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1000"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>backoff multiplier</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).backoffMultiplier === undefined ? '' : String((selectedNodeData as any).backoffMultiplier)}
                  onChange={(e) => patchSelectedNode({ backoffMultiplier: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="2"
                  step={0.5}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>configures retry behavior for downstream nodes</div>
            </div>
          ) : null}

          {selectedNodeType === 'split_order' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>total amount</div>
                <input
                  value={(selectedNodeData as any).totalAmount === undefined ? '' : String((selectedNodeData as any).totalAmount)}
                  onChange={(e) => patchSelectedNode({ totalAmount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>chunks</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).chunks === undefined ? '' : String((selectedNodeData as any).chunks)}
                  onChange={(e) => patchSelectedNode({ chunks: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="5"
                  min={2}
                  max={20}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>delay between chunks (ms)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).delayBetweenMs === undefined ? '' : String((selectedNodeData as any).delayBetweenMs)}
                  onChange={(e) => patchSelectedNode({ delayBetweenMs: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="5000"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>splits order into chunks for DCA pattern</div>
            </div>
          ) : null}

          {selectedNodeType === 'birdeye_price' || selectedNodeType === 'token_supply' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5... or {{node.mint}}"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {selectedNodeType === 'birdeye_price' ? 'fetches token price from birdeye api' : 'fetches token supply info'}
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'token_holders' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>limit</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).limit === undefined ? '' : String((selectedNodeData as any).limit)}
                  onChange={(e) => patchSelectedNode({ limit: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="20"
                  min={1}
                  max={100}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Fetches token metadata (name, symbol, decimals, logo)</div>
            </div>
          ) : null}

          {selectedNodeType === 'whale_alert' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>minimum amount</div>
                <input
                  value={(selectedNodeData as any).minAmount === undefined ? '' : String((selectedNodeData as any).minAmount)}
                  onChange={(e) => patchSelectedNode({ minAmount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="10000"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gates downstream if transfer is below threshold</div>
            </div>
          ) : null}

          {selectedNodeType === 'portfolio_value' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>returns: sol balance, token holdings</div>
            </div>
          ) : null}

          {selectedNodeType === 'stop_loss' || selectedNodeType === 'take_profit' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>trigger price (USD)</div>
                <input
                  value={(selectedNodeData as any).triggerPriceUsd === undefined ? '' : String((selectedNodeData as any).triggerPriceUsd)}
                  onChange={(e) => patchSelectedNode({ triggerPriceUsd: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.001"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sell percentage</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).sellPercentage === undefined ? '' : String((selectedNodeData as any).sellPercentage)}
                  onChange={(e) => patchSelectedNode({ sellPercentage: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="100"
                  min={1}
                  max={100}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {selectedNodeType === 'stop_loss' ? 'triggers when price drops to threshold' : 'triggers when price rises to threshold'}
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'wallet_transactions' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>limit</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).limit === undefined ? '' : String((selectedNodeData as any).limit)}
                  onChange={(e) => patchSelectedNode({ limit: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="10"
                  min={1}
                  max={100}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>fetches recent wallet transactions</div>
            </div>
          ) : null}

          {selectedNodeType === 'price_change_trigger' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>change percentage</div>
                <input
                  value={(selectedNodeData as any).changePercentage === undefined ? '' : String((selectedNodeData as any).changePercentage)}
                  onChange={(e) => patchSelectedNode({ changePercentage: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="5"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>direction</div>
                <select
                  value={typeof (selectedNodeData as any).direction === 'string' ? (selectedNodeData as any).direction : 'any'}
                  onChange={(e) => patchSelectedNode({ direction: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="any">any</option>
                  <option value="up">up</option>
                  <option value="down">down</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>timeframe (minutes)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).timeframeMinutes === undefined ? '' : String((selectedNodeData as any).timeframeMinutes)}
                  onChange={(e) => patchSelectedNode({ timeframeMinutes: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="60"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gates downstream if price change not met</div>
            </div>
          ) : null}

          {selectedNodeType === 'copy_trade' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>your wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>target wallet to copy</div>
                <input
                  value={typeof (selectedNodeData as any).targetWallet === 'string' ? (selectedNodeData as any).targetWallet : ''}
                  onChange={(e) => patchSelectedNode({ targetWallet: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="wallet address..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>max amount per trade</div>
                <input
                  value={(selectedNodeData as any).maxAmountPerTrade === undefined ? '' : String((selectedNodeData as any).maxAmountPerTrade)}
                  onChange={(e) => patchSelectedNode({ maxAmountPerTrade: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="optional limit"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage (bps)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).slippageBps === undefined ? '' : String((selectedNodeData as any).slippageBps)}
                  onChange={(e) => patchSelectedNode({ slippageBps: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="300"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Detects and copies swaps from target wallet in real-time</div>
            </div>
          ) : null}

          {selectedNodeType === 'trailing_stop' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>trail percentage</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).trailPercentage === undefined ? '' : String((selectedNodeData as any).trailPercentage)}
                  onChange={(e) => patchSelectedNode({ trailPercentage: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="5"
                  min={0.1}
                  max={50}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sell percentage</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).sellPercentage === undefined ? '' : String((selectedNodeData as any).sellPercentage)}
                  onChange={(e) => patchSelectedNode({ sellPercentage: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="100"
                  min={1}
                  max={100}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>stop loss that moves up with price, triggers when price drops by trail %</div>
            </div>
          ) : null}

          {selectedNodeType === 'average_cost' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>returns: balance, current price, current value</div>
            </div>
          ) : null}

          {selectedNodeType === 'position_size' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>account balance ($)</div>
                <input
                  value={(selectedNodeData as any).accountBalance === undefined ? '' : String((selectedNodeData as any).accountBalance)}
                  onChange={(e) => patchSelectedNode({ accountBalance: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1000"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>risk percentage</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).riskPercentage === undefined ? '' : String((selectedNodeData as any).riskPercentage)}
                  onChange={(e) => patchSelectedNode({ riskPercentage: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="2"
                  min={0.1}
                  max={100}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>entry price</div>
                <input
                  value={(selectedNodeData as any).entryPrice === undefined ? '' : String((selectedNodeData as any).entryPrice)}
                  onChange={(e) => patchSelectedNode({ entryPrice: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.001"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>stop loss price</div>
                <input
                  value={(selectedNodeData as any).stopLossPrice === undefined ? '' : String((selectedNodeData as any).stopLossPrice)}
                  onChange={(e) => patchSelectedNode({ stopLossPrice: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.0008"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>calculates position size based on risk %</div>
            </div>
          ) : null}

          {selectedNodeType === 'pnl_calculator' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>entry price</div>
                <input
                  value={(selectedNodeData as any).entryPrice === undefined ? '' : String((selectedNodeData as any).entryPrice)}
                  onChange={(e) => patchSelectedNode({ entryPrice: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.001"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>current price</div>
                <input
                  value={(selectedNodeData as any).currentPrice === undefined ? '' : String((selectedNodeData as any).currentPrice)}
                  onChange={(e) => patchSelectedNode({ currentPrice: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.0012 or {{node.price}}"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>quantity</div>
                <input
                  value={(selectedNodeData as any).quantity === undefined ? '' : String((selectedNodeData as any).quantity)}
                  onChange={(e) => patchSelectedNode({ quantity: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1000"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>side</div>
                <select
                  value={typeof (selectedNodeData as any).side === 'string' ? (selectedNodeData as any).side : 'long'}
                  onChange={(e) => patchSelectedNode({ side: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="long">long</option>
                  <option value="short">short</option>
                </select>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>returns: pnl, pnl %, isProfit</div>
            </div>
          ) : null}

          {selectedNodeType === 'volume_check' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>min 24h volume ($)</div>
                <input
                  value={(selectedNodeData as any).minVolume24h === undefined ? '' : String((selectedNodeData as any).minVolume24h)}
                  onChange={(e) => patchSelectedNode({ minVolume24h: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="10000"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gates downstream if volume below threshold</div>
            </div>
          ) : null}

          {selectedNodeType === 'liquidity_check' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>min liquidity ($)</div>
                <input
                  value={(selectedNodeData as any).minLiquidityUsd === undefined ? '' : String((selectedNodeData as any).minLiquidityUsd)}
                  onChange={(e) => patchSelectedNode({ minLiquidityUsd: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="50000"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>gates downstream if liquidity below threshold</div>
            </div>
          ) : null}

          {selectedNodeType === 'slippage_estimator' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
                <input
                  value={typeof (selectedNodeData as any).inputMint === 'string' ? (selectedNodeData as any).inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="So111..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
                <input
                  value={typeof (selectedNodeData as any).outputMint === 'string' ? (selectedNodeData as any).outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount</div>
                <input
                  value={(selectedNodeData as any).amount === undefined ? '' : String((selectedNodeData as any).amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>returns: price impact %, route plan</div>
            </div>
          ) : null}

          {selectedNodeType === 'limit_order' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>side</div>
                <select
                  value={typeof (selectedNodeData as any).side === 'string' ? (selectedNodeData as any).side : 'buy'}
                  onChange={(e) => patchSelectedNode({ side: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="buy">buy</option>
                  <option value="sell">sell</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>target price (USD)</div>
                <input
                  value={(selectedNodeData as any).targetPriceUsd === undefined ? '' : String((selectedNodeData as any).targetPriceUsd)}
                  onChange={(e) => patchSelectedNode({ targetPriceUsd: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="0.001"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount</div>
                <input
                  value={(selectedNodeData as any).amount === undefined ? '' : String((selectedNodeData as any).amount)}
                  onChange={(e) => patchSelectedNode({ amount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="1"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>triggers when price reaches target (buy below, sell above)</div>
            </div>
          ) : null}

          {selectedNodeType === 'twap' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', textDecoration: 'none', color: 'inherit', fontSize: 12 }}
                  >
                    manage
                  </Link>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
                <input
                  value={typeof (selectedNodeData as any).inputMint === 'string' ? (selectedNodeData as any).inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="So111..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
                <input
                  value={typeof (selectedNodeData as any).outputMint === 'string' ? (selectedNodeData as any).outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>total amount</div>
                <input
                  value={(selectedNodeData as any).totalAmount === undefined ? '' : String((selectedNodeData as any).totalAmount)}
                  onChange={(e) => patchSelectedNode({ totalAmount: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="10"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>intervals</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).intervals === undefined ? '' : String((selectedNodeData as any).intervals)}
                  onChange={(e) => patchSelectedNode({ intervals: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="5"
                  min={2}
                  max={20}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>interval (minutes)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).intervalMinutes === undefined ? '' : String((selectedNodeData as any).intervalMinutes)}
                  onChange={(e) => patchSelectedNode({ intervalMinutes: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="10"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>time-weighted average price execution schedule</div>
            </div>
          ) : null}

          {selectedNodeType === 'rug_check' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>token mint</div>
                <input
                  value={typeof (selectedNodeData as any).mint === 'string' ? (selectedNodeData as any).mint : ''}
                  onChange={(e) => patchSelectedNode({ mint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5..."
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>min token age (minutes)</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).minTokenAgeMinutes === undefined ? '' : String((selectedNodeData as any).minTokenAgeMinutes)}
                  onChange={(e) => patchSelectedNode({ minTokenAgeMinutes: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="60"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>max top holder %</div>
                <input
                  type="number"
                  value={(selectedNodeData as any).maxTopHolderPercentage === undefined ? '' : String((selectedNodeData as any).maxTopHolderPercentage)}
                  onChange={(e) => patchSelectedNode({ maxTopHolderPercentage: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="50"
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>checks token age, liquidity, holder count - gates if warnings</div>
            </div>
          ) : null}

          {selectedNodeType === 'discord_webhook' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                provide either a stored credential or a direct webhook url
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>credential (recommended)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
                  >
                    <option value="">select discord_webhook credential</option>
                    {discordWebhookCredentials.map((c) => (
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>webhook url (optional)</div>
                <input
                  value={typeof selectedNodeData.webhookUrl === 'string' ? selectedNodeData.webhookUrl : ''}
                  onChange={(e) => patchSelectedNode({ webhookUrl: e.target.value || undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>content</div>
                <textarea
                  value={typeof selectedNodeData.content === 'string' ? selectedNodeData.content : ''}
                  onChange={(e) => patchSelectedNode({ content: e.target.value })}
                  disabled={busy}
                  rows={4}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="message"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>username (optional)</div>
                <input
                  value={typeof selectedNodeData.username === 'string' ? selectedNodeData.username : ''}
                  onChange={(e) => patchSelectedNode({ username: e.target.value || undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="cyphersol"
                />
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'telegram_message' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Send messages via Telegram bot. Create a bot with @BotFather to get a token.
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>credential (recommended)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
                  >
                    <option value="">select telegram_bot credential</option>
                    {telegramCredentials.map((c) => (
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>chat ID</div>
                <input
                  value={typeof selectedNodeData.chatId === 'string' ? selectedNodeData.chatId : ''}
                  onChange={(e) => patchSelectedNode({ chatId: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="-1001234567890 or @channelname"
                />
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  Get chat ID by forwarding a message to @userinfobot
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>message</div>
                <textarea
                  value={typeof selectedNodeData.text === 'string' ? selectedNodeData.text : ''}
                  onChange={(e) => patchSelectedNode({ text: e.target.value })}
                  disabled={busy}
                  rows={4}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="Your notification message..."
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>parse mode (optional)</div>
                <select
                  value={typeof selectedNodeData.parseMode === 'string' ? selectedNodeData.parseMode : ''}
                  onChange={(e) => patchSelectedNode({ parseMode: e.target.value || undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="">plain text</option>
                  <option value="HTML">HTML</option>
                  <option value="Markdown">Markdown</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                </select>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'if' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>op</div>
                <select
                  value={typeof selectedNodeData.op === 'string' ? selectedNodeData.op : 'truthy'}
                  onChange={(e) => patchSelectedNode({ op: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="truthy">truthy</option>
                  <option value="eq">eq</option>
                  <option value="neq">neq</option>
                  <option value="gt">gt</option>
                  <option value="gte">gte</option>
                  <option value="lt">lt</option>
                  <option value="lte">lte</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>left</div>
                <input
                  value={selectedNodeData.left === undefined || selectedNodeData.left === null ? '' : String(selectedNodeData.left)}
                  onChange={(e) => patchSelectedNode({ left: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="{{nodes.n1.output.value}}"
                />
              </div>

              {typeof selectedNodeData.op === 'string' && selectedNodeData.op !== 'truthy' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>right</div>
                  <input
                    value={selectedNodeData.right === undefined || selectedNodeData.right === null ? '' : String(selectedNodeData.right)}
                    onChange={(e) => patchSelectedNode({ right: e.target.value })}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                    placeholder="100"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedNodeType === 'solana_balance' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet source</div>
                <select
                  value={(selectedNodeData as any).walletSource || 'credential'}
                  onChange={(e) => patchSelectedNode({ walletSource: e.target.value, walletAddress: undefined, credentialId: undefined })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="credential">my wallet (credential)</option>
                  <option value="address">external wallet (address)</option>
                </select>
              </div>

              {((selectedNodeData as any).walletSource || 'credential') === 'credential' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={selectedCredentialId}
                      onChange={(e) => onAttachCredential(e.target.value)}
                      disabled={busy}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg)',
                        textDecoration: 'none',
                        color: 'inherit',
                        fontSize: 12,
                      }}
                    >
                      manage
                    </Link>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet address</div>
                  <input
                    value={typeof (selectedNodeData as any).walletAddress === 'string' ? (selectedNodeData as any).walletAddress : ''}
                    onChange={(e) => patchSelectedNode({ walletAddress: e.target.value })}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                    placeholder="e.g. 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
                  />
                  <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                    enter any Solana wallet address to check its balance
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>commitment</div>
                <select
                  value={typeof selectedNodeData.commitment === 'string' ? selectedNodeData.commitment : 'confirmed'}
                  onChange={(e) => patchSelectedNode({ commitment: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="processed">processed</option>
                  <option value="confirmed">confirmed</option>
                  <option value="finalized">finalized</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'jupiter_swap' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>input mint</div>
                <input
                  value={typeof selectedNodeData.inputMint === 'string' ? selectedNodeData.inputMint : ''}
                  onChange={(e) => patchSelectedNode({ inputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="So11111111111111111111111111111111111111112"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>output mint</div>
                <input
                  value={typeof selectedNodeData.outputMint === 'string' ? selectedNodeData.outputMint : ''}
                  onChange={(e) => patchSelectedNode({ outputMint: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                  placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>amount (token units)</div>
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
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>slippage bps</div>
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
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
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
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  safety caps: max amount {meta.jupiterSwapMaxAmount} · max slippage {meta.jupiterSwapMaxSlippageBps} bps
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend rpc via <span style={{ fontFamily: 'monospace' }}>SOLANA_RPC_URL</span>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'onchain_trigger' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Triggers when transactions involving your watched wallets are detected on Solana.
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>wallet addresses to watch</div>
                <textarea
                  value={typeof (selectedNodeData as any).walletAddresses === 'string' ? (selectedNodeData as any).walletAddresses : ''}
                  onChange={(e) => patchSelectedNode({ walletAddresses: e.target.value })}
                  disabled={busy}
                  rows={3}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: 11 }}
                  placeholder="Enter wallet addresses, one per line"
                />
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  Enter one or more Solana wallet addresses to monitor for activity.
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>transaction types (optional)</div>
                <select
                  value={typeof (selectedNodeData as any).transactionTypes === 'string' ? (selectedNodeData as any).transactionTypes : 'all'}
                  onChange={(e) => patchSelectedNode({ transactionTypes: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="all">All transactions</option>
                  <option value="swap">Swaps only</option>
                  <option value="transfer">Transfers only</option>
                  <option value="nft">NFT transactions</option>
                </select>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'price_trigger' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>symbol</div>
                <input
                  value={typeof selectedNodeData.symbol === 'string' ? selectedNodeData.symbol : ''}
                  onChange={(e) => patchSelectedNode({ symbol: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>vs currency</div>
                <input
                  value={typeof selectedNodeData.vsCurrency === 'string' ? selectedNodeData.vsCurrency : ''}
                  onChange={(e) => patchSelectedNode({ vsCurrency: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="usd"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>direction</div>
                <select
                  value={typeof selectedNodeData.direction === 'string' ? selectedNodeData.direction : 'crosses_above'}
                  onChange={(e) => patchSelectedNode({ direction: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="crosses_above">crosses_above</option>
                  <option value="crosses_below">crosses_below</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>threshold</div>
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
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="150"
                  min={0}
                  step={0.0001}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>interval seconds</div>
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
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="60"
                  min={1}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>polling interval used by trigger service</div>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'timer_trigger' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>interval seconds</div>
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
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                placeholder="60"
                min={1}
              />
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                used by the trigger service when workflow is enabled
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'delay' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>delay ms</div>
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
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                placeholder="1000"
                min={0}
              />
            </div>
          ) : null}

          {selectedNodeType === 'transform' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>value (json or template)</div>
              <textarea
                value={
                  typeof selectedNodeData.value === 'string'
                    ? selectedNodeData.value
                    : (() => {
                        try {
                          return JSON.stringify(selectedNodeData.value ?? null, null, 2)
                        } catch {
                          return ''
                        }
                      })()
                }
                onChange={(e) => patchSelectedNode({ value: e.target.value })}
                onBlur={(e) => {
                  const raw = e.target.value
                  const trimmed = raw.trim()
                  if (!trimmed) {
                    patchSelectedNode({ value: undefined })
                    return
                  }
                  try {
                    patchSelectedNode({ value: JSON.parse(raw) })
                  } catch {
                    patchSelectedNode({ value: raw })
                  }
                }}
                disabled={busy}
                rows={6}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                placeholder={'{"amount": "{{nodes.n1.output.sol}}"}'}
              />
            </div>
          ) : null}

          {selectedNodeType === 'http_request' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>url</div>
                <input
                  value={typeof selectedNodeData.url === 'string' ? selectedNodeData.url : ''}
                  onChange={(e) => patchSelectedNode({ url: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="https://api.example.com/path"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>method</div>
                <select
                  value={typeof selectedNodeData.method === 'string' ? selectedNodeData.method : 'GET'}
                  onChange={(e) => patchSelectedNode({ method: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>credential</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCredentialId}
                    onChange={(e) => onAttachCredential(e.target.value)}
                    disabled={busy}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', flex: 1 }}
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
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontSize: 12,
                    }}
                  >
                    manage
                  </Link>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  requires backend allowlist via <span style={{ fontFamily: 'monospace' }}>EXECUTOR_HTTP_ALLOWED_HOSTS</span>
                </div>
              </div>
            </div>
          ) : null}

          {selectedNodeType === 'market_data' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>symbol</div>
                <input
                  value={typeof selectedNodeData.symbol === 'string' ? selectedNodeData.symbol : ''}
                  onChange={(e) => patchSelectedNode({ symbol: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="SOL"
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>vs currency</div>
                <input
                  value={typeof selectedNodeData.vsCurrency === 'string' ? selectedNodeData.vsCurrency : ''}
                  onChange={(e) => patchSelectedNode({ vsCurrency: e.target.value })}
                  disabled={busy}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  placeholder="usd"
                />
              </div>

              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                requires backend allowlist via <span style={{ fontFamily: 'monospace' }}>EXECUTOR_HTTP_ALLOWED_HOSTS</span>
              </div>
            </div>
          ) : null}

        </div>
      ) : null}

      {error ? (
        <div
          style={{
            position: 'absolute',
            top: 74,
            left: 12,
            zIndex: 10,
            background: 'var(--color-error-bg, #fee)',
            color: 'var(--color-error, #700)',
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
            top: 74,
            left: 12,
            zIndex: 10,
            background: 'var(--color-warning-bg, #fff6ed)',
            color: 'var(--color-warning, #7a2e0e)',
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
        onAddNodeOnEdge={(edgeId, nodeType, sourceId, targetId) => {
          if (!draft) return
          
          const sourceNode = draft.nodes.find((n) => n.id === sourceId)
          const targetNode = draft.nodes.find((n) => n.id === targetId)
          if (!sourceNode || !targetNode) return
          
          // Position new node between source and target, shift target down
          const newX = sourceNode.position.x
          const newY = sourceNode.position.y + 150
          
          const newNodeId = getNextNodeId(draft.nodes)
          const newNode = {
            id: newNodeId,
            type: 'default',
            position: { x: newX, y: newY },
            data: { label: nodeType, type: nodeType },
          }
          
          // Move target node and all nodes below it down to make room
          const shiftAmount = 150
          flowRef.current?.shiftNodesDown(targetId, shiftAmount)
          
          // Add new node and update edges: remove old edge, add source->new and new->target
          flowRef.current?.insertNodeOnEdge(edgeId, newNode)
          setSelectedNodeId(newNodeId)
        }}
        onAddNodeAfterLast={(nodeType) => {
          addNode(nodeType as any)
        }}
        onDeleteNode={(nodeId) => {
          if (!draft) return
          const ok = window.confirm('Delete this node?')
          if (!ok) return
          flowRef.current?.deleteNode(nodeId)
          setSelectedNodeId(undefined)
        }}
      />
    </div>
  )
}
