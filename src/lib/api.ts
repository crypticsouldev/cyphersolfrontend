import { getAuthToken } from './auth'

export type ApiError = {
  message: string
  status: number
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

    const err: ApiError = { message, status: res.status }
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
  createdAt: string
  updatedAt: string
}

export type WorkflowsListResponse = {
  workflows: Workflow[]
}

export type WorkflowResponse = {
  workflow: Workflow
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

export async function createWorkflow(name: string, definition: unknown) {
  return request<WorkflowResponse>('/workflows', {
    method: 'POST',
    body: JSON.stringify({ name, definition }),
  })
}
