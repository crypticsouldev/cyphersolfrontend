import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { getAnalytics } from '../lib/api'
import ThemeToggle from '../components/ThemeToggle'

function StatCard({ title, value, subtitle, icon, trend }: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number; label: string }
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span className="text-sm text-muted">{title}</span>
        <span style={{ color: 'var(--color-text-subtle)' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 4 }}>{value}</div>
      {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      {trend && (
        <div style={{ marginTop: 8, fontSize: 12, color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  )
}

function ExecutionSkeleton() {
  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3">
        <div className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: 80, height: 12 }} />
        </div>
        <div className="skeleton" style={{ width: 60, height: 12 }} />
      </div>
    </div>
  )
}

export default function Analytics() {
  // Fetch all analytics data in a single request
  const { data, isLoading } = useSWR(
    '/analytics',
    getAnalytics,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )

  const workflows = data?.workflows || []
  const executions = data?.executions || []

  // Calculate stats
  const stats = useMemo(() => {
    const total = executions.length
    const successful = executions.filter(e => e.status === 'success').length
    const failed = executions.filter(e => e.status === 'failed').length
    const running = executions.filter(e => e.status === 'running').length
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0

    // Last 24 hours
    const now = Date.now()
    const last24h = executions.filter(e => now - new Date(e.createdAt).getTime() < 86400000)
    const last24hSuccess = last24h.filter(e => e.status === 'success').length

    // Active workflows
    const activeWorkflows = workflows.filter(w => w.enabled).length

    return {
      total,
      successful,
      failed,
      running,
      successRate,
      last24h: last24h.length,
      last24hSuccess,
      activeWorkflows,
      totalWorkflows: workflows.length,
    }
  }, [executions, workflows])

  // Recent executions (last 10)
  const recentExecutions = useMemo(() => {
    return executions.slice(0, 10)
  }, [executions])

  // Execution by status for chart
  const statusBreakdown = useMemo(() => {
    const breakdown = [
      { status: 'Success', count: stats.successful, color: 'var(--color-success)' },
      { status: 'Failed', count: stats.failed, color: 'var(--color-error)' },
      { status: 'Running', count: stats.running, color: 'var(--color-primary)' },
    ]
    const max = Math.max(...breakdown.map(b => b.count), 1)
    return breakdown.map(b => ({ ...b, percentage: (b.count / max) * 100 }))
  }, [stats])

  function getStatusDot(status: string) {
    switch (status) {
      case 'success': return 'status-dot-success'
      case 'failed': return 'status-dot-error'
      case 'running': return 'status-dot-running'
      default: return 'status-dot-neutral'
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = Date.now()
    const diff = now - date.getTime()
    
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="container-narrow" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="text-sm text-muted" style={{ marginTop: 4 }}>Execution statistics and performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Back
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard
          title="Total Executions"
          value={isLoading ? '—' : stats.total}
          subtitle={`${stats.last24h} in last 24h`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          }
        />
        <StatCard
          title="Success Rate"
          value={isLoading ? '—' : `${stats.successRate}%`}
          subtitle={`${stats.successful} successful`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          }
        />
        <StatCard
          title="Failed"
          value={isLoading ? '—' : stats.failed}
          subtitle="executions"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          }
        />
        <StatCard
          title="Active Workflows"
          value={isLoading ? '—' : stats.activeWorkflows}
          subtitle={`of ${stats.totalWorkflows} total`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20v-6M6 20V10M18 20V4"/>
            </svg>
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Status Breakdown */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Status Breakdown</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {statusBreakdown.map(item => (
              <div key={item.status}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="text-sm">{item.status}</span>
                  <span className="text-sm font-medium">{item.count}</span>
                </div>
                <div style={{ height: 8, background: 'var(--color-hover)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${item.percentage}%`,
                      background: item.color,
                      borderRadius: 4,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Executions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Recent Executions</h3>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {isLoading ? (
              <>
                <ExecutionSkeleton />
                <ExecutionSkeleton />
                <ExecutionSkeleton />
                <ExecutionSkeleton />
              </>
            ) : recentExecutions.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <p className="text-sm text-muted">No executions yet</p>
              </div>
            ) : (
              recentExecutions.map(exec => (
                <Link
                  key={exec.id}
                  to={`/executions/${exec.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--color-border)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background var(--transition-fast)',
                  }}
                  className="list-item"
                >
                  <span className={`status-dot ${getStatusDot(exec.status)}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm truncate" style={{ fontWeight: 500 }}>
                      {(exec as any).workflowName || 'Workflow'}
                    </div>
                    <div className="text-xs text-muted">{exec.status}</div>
                  </div>
                  <span className="text-xs text-subtle">{formatTime(exec.createdAt)}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
