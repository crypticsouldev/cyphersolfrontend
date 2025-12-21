import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createWorkflow,
  deleteWorkflow,
  signout,
  updateWorkflow,
  type ApiError,
  type Workflow,
} from '../lib/api'
import { clearAuthToken } from '../lib/auth'
import { useWorkflows, invalidateWorkflows } from '../lib/hooks'
import TemplateLibrary from '../components/TemplateLibrary'
import ThemeToggle from '../components/ThemeToggle'
import type { WorkflowTemplate } from '../lib/templates'

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function WorkflowSkeleton() {
  return (
    <div className="list-item">
      <div className="list-item-content">
        <div className="skeleton" style={{ width: 180, height: 18, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: 100, height: 14 }} />
      </div>
      <div className="flex gap-2">
        <div className="skeleton" style={{ width: 60, height: 32 }} />
        <div className="skeleton" style={{ width: 60, height: 32 }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { workflows, isLoading, error: fetchError, revalidate } = useWorkflows()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [showTemplates, setShowTemplates] = useState(false)

  const displayError = error || (fetchError ? 'Failed to load workflows' : undefined)

  async function onCreate(template?: WorkflowTemplate) {
    setBusy(true)
    setError(undefined)
    setShowTemplates(false)
    try {
      const definition = template
        ? { nodes: template.nodes, edges: template.edges }
        : {
            nodes: [
              {
                id: 'n1',
                position: { x: 0, y: 0 },
                data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 60 },
              },
              {
                id: 'n2',
                position: { x: 260, y: 120 },
                data: { label: 'log', type: 'log', message: 'hello' },
              },
            ],
            edges: [{ id: 'n1-n2', source: 'n1', target: 'n2' }],
          }
      const name = template?.name || 'untitled workflow'
      const res = await createWorkflow(name, definition)
      navigate(`/editor/${res.workflow.id}`)
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      setError(apiErr.message || 'Failed to create workflow')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    try {
      await signout()
    } catch {
    } finally {
      clearAuthToken()
      setBusy(false)
      navigate('/login', { replace: true })
    }
  }

  async function onRename(wf: Workflow) {
    const nextName = window.prompt('Rename workflow', wf.name)
    if (nextName === null || !nextName.trim()) return

    setBusy(true)
    setError(undefined)
    try {
      await updateWorkflow(wf.id, { name: nextName.trim() })
      await invalidateWorkflows()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      setError(apiErr.message || 'Failed to rename')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(wf: Workflow) {
    const ok = window.confirm(`Delete "${wf.name}"? This cannot be undone.`)
    if (!ok) return

    setBusy(true)
    setError(undefined)
    try {
      await deleteWorkflow(wf.id)
      await invalidateWorkflows()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      setError(apiErr.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-narrow" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="page-header">
        <h1 className="page-title">Workflows</h1>
        <div className="flex gap-2">
          <Link to="/analytics" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/>
              <path d="m19 9-5 5-4-4-3 3"/>
            </svg>
            Analytics
          </Link>
          <Link to="/credentials" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Credentials
          </Link>
          <Link to="/paper-trades" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Paper Trades
          </Link>
          <button type="button" onClick={() => setShowTemplates(true)} disabled={busy} className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Templates
          </button>
          <button type="button" onClick={() => onCreate()} disabled={busy} className="btn btn-primary">
            {busy ? (
              <span className="spinner" style={{ width: 14, height: 14 }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
            New Workflow
          </button>
          <ThemeToggle />
          <button type="button" onClick={onLogout} disabled={busy} className="btn btn-ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {displayError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{displayError}</span>
          {fetchError && (
            <button onClick={() => revalidate()} className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <>
            <WorkflowSkeleton />
            <WorkflowSkeleton />
            <WorkflowSkeleton />
          </>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style={{ marginBottom: 16 }}>No workflows yet</p>
            <div className="flex gap-2" style={{ justifyContent: 'center' }}>
              <button onClick={() => setShowTemplates(true)} disabled={busy} className="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                Browse Templates
              </button>
              <button onClick={() => onCreate()} disabled={busy} className="btn btn-primary">
                Start from Scratch
              </button>
            </div>
          </div>
        ) : (
          workflows.map((wf) => (
            <div key={wf.id} className="list-item">
              <Link to={`/editor/${wf.id}`} className="list-item-content" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="flex items-center gap-2">
                  <span className="list-item-title">{wf.name}</span>
                  {wf.enabled && (
                    <span className="badge badge-success">
                      <span className="status-dot status-dot-success" style={{ marginRight: 4 }} />
                      Active
                    </span>
                  )}
                </div>
                <div className="list-item-subtitle">
                  Updated {formatRelativeTime(new Date(wf.updatedAt))}
                  {wf.nextRunAt && (
                    <span> · Next run: {formatRelativeTime(new Date(wf.nextRunAt))}</span>
                  )}
                </div>
              </Link>
              <div className="flex gap-2">
                <Link to={`/workflows/${wf.id}/executions`} className="btn btn-sm btn-secondary">
                  History
                </Link>
                <button onClick={() => onRename(wf)} disabled={busy} className="btn btn-sm btn-secondary">
                  Rename
                </button>
                <button onClick={() => onDelete(wf)} disabled={busy} className="btn btn-sm btn-danger">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showTemplates && (
        <TemplateLibrary
          onSelect={(template) => onCreate(template)}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  )
}
