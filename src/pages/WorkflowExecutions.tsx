import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorkflow, useWorkflowExecutions } from '../lib/hooks'
import type { ExecutionStatus } from '../lib/api'

function ExecutionSkeleton() {
  return (
    <div className="list-item">
      <div className="list-item-content">
        <div className="skeleton" style={{ width: 80, height: 16, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: 140, height: 14 }} />
      </div>
      <div className="skeleton" style={{ width: 100, height: 14 }} />
    </div>
  )
}

function getStatusBadge(status: ExecutionStatus) {
  switch (status) {
    case 'success':
      return <span className="badge badge-success"><span className="status-dot status-dot-success" style={{ marginRight: 6 }} />Success</span>
    case 'failed':
      return <span className="badge badge-error"><span className="status-dot status-dot-error" style={{ marginRight: 6 }} />Failed</span>
    case 'running':
      return <span className="badge badge-primary"><span className="status-dot status-dot-running" style={{ marginRight: 6 }} />Running</span>
    case 'queued':
      return <span className="badge badge-warning"><span className="status-dot status-dot-warning" style={{ marginRight: 6 }} />Queued</span>
    case 'cancelled':
      return <span className="badge badge-neutral"><span className="status-dot status-dot-neutral" style={{ marginRight: 6 }} />Cancelled</span>
    default:
      return <span className="badge badge-neutral">{status}</span>
  }
}

function formatDuration(start: string, end?: string): string {
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const diffMs = endDate.getTime() - startDate.getTime()
  
  if (diffMs < 1000) return `${diffMs}ms`
  if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`
  return `${Math.floor(diffMs / 60000)}m ${Math.floor((diffMs % 60000) / 1000)}s`
}

export default function WorkflowExecutions() {
  const params = useParams()
  const workflowId = params.id

  const { workflow } = useWorkflow(workflowId)
  const { executions, isLoading, error } = useWorkflowExecutions(workflowId)

  const title = useMemo(() => workflow?.name || 'Executions', [workflow?.name])

  return (
    <div className="container-narrow" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Execution History</div>
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={`/editor/${workflowId}`} className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Back to Editor
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Failed to load executions</span>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <>
            <ExecutionSkeleton />
            <ExecutionSkeleton />
            <ExecutionSkeleton />
          </>
        ) : executions.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <p>No executions yet</p>
            <p className="text-sm text-muted">Run your workflow to see execution history here</p>
          </div>
        ) : (
          executions.map((e) => (
            <Link key={e.id} to={`/executions/${e.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="list-item-content">
                <div className="flex items-center gap-2">
                  {getStatusBadge(e.status)}
                </div>
                <div className="list-item-subtitle">
                  Started {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-sm text-muted">
                {e.startedAt && (
                  <span>{formatDuration(e.startedAt, e.finishedAt ?? undefined)}</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
