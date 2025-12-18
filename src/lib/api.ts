import { getAuthToken } from './auth'

export type ApiError = {
  message: string
  status: number
  code?: string
  requestId?: string
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000'
}

async function readJsonSafely(res: Response) {
  const text = await res.text()
  if (!text) return undefined

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(init.headers)

  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json')
  }

  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const payload = await readJsonSafely(res)
    const message =
      (payload as any)?.error?.message ||
      (payload as any)?.message ||
      (typeof payload === 'string' ? payload : 'request failed')

    const code = (payload as any)?.error?.code
    const requestId = (payload as any)?.error?.requestId || res.headers.get('x-request-id') || undefined

    const err: ApiError = { message, status: res.status, code, requestId }
    throw err
  }

  return (await readJsonSafely(res)) as T
}

export type AuthResponse = {
  user: { id: string; email: string }
  token: string
  expiresAt: string
}

export type MeResponse = {
  user: { id: string; email: string }
}

export type Workflow = {
  id: string
  name: string
  definition: unknown
  enabled?: boolean
  nextRunAt?: string
  lockedUntil?: string
  overlapPolicy?: 'skip' | 'queue' | 'allow'
  maxBacklog?: number
  createdAt: string
  updatedAt: string
}

export type WorkflowsListResponse = {
  workflows: Workflow[]
}

export type WorkflowResponse = {
  workflow: Workflow
}

export type ExecutionStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export type ExecutionLog = {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  nodeId?: string
}

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export type NodeExecutionState = {
  status: NodeExecutionStatus | string
  startedAt?: string
  finishedAt?: string
  error?: string
}

export type Execution = {
  id: string
  workflowId: string
  userId: string
  status: ExecutionStatus
  startedAt?: string
  finishedAt?: string
  logs: ExecutionLog[]
  nodeStatuses?: Record<string, NodeExecutionState>
  nodeOutputs?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ExecutionSummary = {
  id: string
  workflowId: string
  userId: string
  status: ExecutionStatus
  startedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

export type ExecutionResponse = {
  execution: Execution
}

export type WorkflowExecutionsListResponse = {
  executions: ExecutionSummary[]
}

export type CredentialSummary = {
  id: string
  provider: string
  name: string
  publicKey?: string
  createdAt: string
  updatedAt: string
}

export type CredentialsListResponse = {
  credentials: CredentialSummary[]
}

export type CredentialResponse = {
  credential: CredentialSummary
}

export type PaperOrderSide = 'buy' | 'sell'

export type PaperOrder = {
  id: string
  userId: string
  workflowId: string
  executionId: string
  nodeId: string
  symbol: string
  side: PaperOrderSide
  quantity: number
  price?: number
  filledAt: string
  status: string
  createdAt: string
  updatedAt: string
}

export type PaperOrdersListResponse = {
  paperOrders: PaperOrder[]
  nextCursor?: string
}

export type PaperPosition = {
  symbol: string
  buyQty: number
  sellQty: number
  netQuantity: number
  lastTradeAt?: string
  tradeCount: number
}

export type PaperPositionsResponse = {
  positions: PaperPosition[]
}

export async function signup(email: string, password: string) {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function signin(email: string, password: string) {
  return request<AuthResponse>('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function me() {
  return request<MeResponse>('/auth/me')
}

export async function signout() {
  return request<{ ok: true }>('/auth/signout', { method: 'POST' })
}

export async function listWorkflows() {
  return request<WorkflowsListResponse>('/workflows')
}

export async function getWorkflow(id: string) {
  return request<WorkflowResponse>(`/workflows/${id}`)
}

export async function createWorkflow(name: string, definition: unknown) {
  return request<WorkflowResponse>('/workflows', {
    method: 'POST',
    body: JSON.stringify({ name, definition }),
  })
}

export async function updateWorkflow(
  id: string,
  patch: {
    name?: string
    definition?: unknown
    enabled?: boolean
    overlapPolicy?: 'skip' | 'queue' | 'allow'
    maxBacklog?: number
  },
) {
  return request<WorkflowResponse>(`/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteWorkflow(id: string) {
  return request<{ ok: true }>(`/workflows/${id}`, { method: 'DELETE' })
}

export async function runWorkflow(id: string) {
  return request<ExecutionResponse>(`/workflows/${id}/run`, { method: 'POST' })
}

export async function listWorkflowExecutions(workflowId: string) {
  return request<WorkflowExecutionsListResponse>(`/workflows/${workflowId}/executions`)
}

export async function getExecution(executionId: string) {
  return request<ExecutionResponse>(`/executions/${executionId}`)
}

export async function listCredentials() {
  return request<CredentialsListResponse>('/credentials')
}

export async function createCredential(provider: string, name: string, secret: unknown) {
  return request<CredentialResponse>('/credentials', {
    method: 'POST',
    body: JSON.stringify({ provider, name, secret }),
  })
}

export async function deleteCredential(id: string) {
  return request<{ ok: true }>(`/credentials/${id}`, { method: 'DELETE' })
}

export async function listPaperOrders(params: {
  workflowId?: string
  symbol?: string
  limit?: number
  cursor?: string
} = {}) {
  const qs = new URLSearchParams()
  if (params.workflowId) qs.set('workflowId', params.workflowId)
  if (params.symbol) qs.set('symbol', params.symbol)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.cursor) qs.set('cursor', params.cursor)
  const q = qs.toString()
  return request<PaperOrdersListResponse>(`/paper-orders${q ? `?${q}` : ''}`)
}

export async function listPaperPositions(params: { workflowId?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.workflowId) qs.set('workflowId', params.workflowId)
  const q = qs.toString()
  return request<PaperPositionsResponse>(`/paper-orders/positions${q ? `?${q}` : ''}`)
}
