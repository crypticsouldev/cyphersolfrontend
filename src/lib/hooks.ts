import useSWR, { mutate } from 'swr'
import {
  getWorkflow,
  listWorkflows,
  listCredentials,
  getMeta,
  listWorkflowExecutions,
  getExecution,
  type Workflow,
  type CredentialSummary,
  type MetaResponse,
  type ExecutionSummary,
  type Execution,
} from './api'

const defaultConfig = {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
  errorRetryCount: 2,
  keepPreviousData: true,
}

// Workflows
export function useWorkflows() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<Workflow[]>(
    '/workflows',
    async () => {
      const res = await listWorkflows()
      return res.workflows
    },
    { ...defaultConfig, revalidateOnFocus: true }
  )
  return { workflows: data ?? [], error, isLoading, revalidate }
}

export function useWorkflow(id: string | undefined) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<Workflow>(
    id ? `/workflows/${id}` : null,
    async () => {
      if (!id) throw new Error('no id')
      const res = await getWorkflow(id)
      return res.workflow
    },
    defaultConfig
  )
  return { workflow: data, error, isLoading, revalidate }
}

// Credentials
export function useCredentials() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<CredentialSummary[]>(
    '/credentials',
    async () => {
      const res = await listCredentials()
      return res.credentials
    },
    { ...defaultConfig, revalidateIfStale: false }
  )
  return { credentials: data ?? [], error, isLoading, revalidate }
}

// Meta (caps, limits) - rarely changes
export function useMeta() {
  const { data, error, isLoading } = useSWR<MetaResponse>(
    '/meta',
    getMeta,
    { ...defaultConfig, revalidateIfStale: false, dedupingInterval: 60000 }
  )
  return { meta: data, error, isLoading }
}

// Executions
export function useWorkflowExecutions(workflowId: string | undefined) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<ExecutionSummary[]>(
    workflowId ? `/workflows/${workflowId}/executions` : null,
    async () => {
      if (!workflowId) throw new Error('no workflowId')
      const res = await listWorkflowExecutions(workflowId)
      return res.executions
    },
    { ...defaultConfig, refreshInterval: 30000 }
  )
  return { executions: data ?? [], error, isLoading, revalidate }
}

export function useExecution(executionId: string | undefined) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<Execution>(
    executionId ? `/executions/${executionId}` : null,
    async () => {
      if (!executionId) throw new Error('no executionId')
      const res = await getExecution(executionId)
      return res.execution
    },
    { ...defaultConfig, refreshInterval: 10000 }
  )
  return { execution: data, error, isLoading, revalidate }
}

// Cache invalidation helpers
export function invalidateWorkflows() {
  return mutate('/workflows')
}

export function invalidateWorkflow(id: string) {
  return mutate(`/workflows/${id}`)
}

export function invalidateCredentials() {
  return mutate('/credentials')
}

export function invalidateExecutions(workflowId: string) {
  return mutate(`/workflows/${workflowId}/executions`)
}
