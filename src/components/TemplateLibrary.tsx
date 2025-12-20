import { useState, useMemo } from 'react'
import { workflowTemplates, templateCategories, getTemplatesByCategory, type WorkflowTemplate } from '../lib/templates'

type Props = {
  onSelect: (template: WorkflowTemplate) => void
  onClose: () => void
}

function getCategoryIcon(icon: string) {
  switch (icon) {
    case 'grid':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      )
    case 'bell':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
      )
    case 'eye':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      )
    case 'trending-up':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      )
    case 'shield':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      )
    case 'layers':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
        </svg>
      )
    default:
      return null
  }
}

function getDifficultyBadge(difficulty: WorkflowTemplate['difficulty']) {
  switch (difficulty) {
    case 'beginner':
      return <span className="badge badge-success">Beginner</span>
    case 'intermediate':
      return <span className="badge badge-warning">Intermediate</span>
    case 'advanced':
      return <span className="badge badge-error">Advanced</span>
  }
}

function getCategoryColor(category: WorkflowTemplate['category']) {
  switch (category) {
    case 'alerts':
      return '#8b5cf6'
    case 'monitoring':
      return '#3b82f6'
    case 'trading':
      return '#10b981'
    case 'safety':
      return '#f59e0b'
    case 'defi':
      return '#ec4899'
    default:
      return '#6b7280'
  }
}

export default function TemplateLibrary({ onSelect, onClose }: Props) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTemplates = useMemo(() => {
    let templates = getTemplatesByCategory(selectedCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
    }
    return templates
  }, [selectedCategory, searchQuery])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Template Library</h2>
            <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
              Start with a pre-built workflow template
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Search & Categories */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-subtle)' }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{ paddingLeft: 40 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {templateCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={selectedCategory === cat.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ gap: 6 }}
              >
                {getCategoryIcon(cat.icon)}
                {cat.name}
                {cat.id !== 'all' && (
                  <span style={{ opacity: 0.7 }}>
                    ({workflowTemplates.filter((t) => t.category === cat.id).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {filteredTemplates.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p>No templates found</p>
              <p className="text-sm text-muted">Try a different search or category</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="card card-hover"
                  style={{
                    padding: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    transition: 'all var(--transition-fast)',
                  }}
                  onClick={() => onSelect(template)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: getCategoryColor(template.category),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {getCategoryIcon(
                        templateCategories.find((c) => c.id === template.category)?.icon || 'grid'
                      )}
                    </div>
                    {getDifficultyBadge(template.difficulty)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{template.name}</h3>
                    <p className="text-sm text-muted" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                      {template.description}
                    </p>
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="text-xs text-subtle">
                      {template.nodes.length} nodes · {template.edges.length} connections
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border)',
            background: '#f9fafb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="text-sm text-muted">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
          </span>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
