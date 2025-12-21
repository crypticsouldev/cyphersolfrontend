import { useState, useEffect } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'market'

const categoryInfo: Record<NodeCategory, { label: string; icon: string; description: string; color: string }> = {
  trigger: { label: 'Triggers', icon: '⚡', description: 'Start your workflow', color: '#8b5cf6' },
  action: { label: 'Actions', icon: '🚀', description: 'Execute operations', color: '#3b82f6' },
  logic: { label: 'Logic', icon: '🔀', description: 'Control flow', color: '#f59e0b' },
  data: { label: 'Data', icon: '📊', description: 'Fetch information', color: '#10b981' },
  market: { label: 'Market', icon: '📈', description: 'Price & quotes', color: '#06b6d4' },
}

const nodeOptions: { value: string; label: string; category: NodeCategory; description: string }[] = [
  // Triggers
  { value: 'timer_trigger', label: 'Timer', category: 'trigger', description: 'Run on schedule' },
  { value: 'price_trigger', label: 'Price Alert', category: 'trigger', description: 'Trigger on price' },
  { value: 'onchain_trigger', label: 'On-Chain', category: 'trigger', description: 'Watch wallet txs' },
  // Actions
  { value: 'jupiter_swap', label: 'Jupiter Swap', category: 'action', description: 'Swap tokens' },
  { value: 'solana_transfer', label: 'Transfer', category: 'action', description: 'Send SOL/tokens' },
  { value: 'discord_webhook', label: 'Discord', category: 'action', description: 'Send message' },
  { value: 'telegram_message', label: 'Telegram', category: 'action', description: 'Send message' },
  { value: 'http_request', label: 'HTTP Request', category: 'action', description: 'Call API' },
  { value: 'log', label: 'Log', category: 'action', description: 'Debug output' },
  // Logic
  { value: 'if', label: 'Condition', category: 'logic', description: 'If/else branch' },
  { value: 'delay', label: 'Delay', category: 'logic', description: 'Wait time' },
  { value: 'transform', label: 'Transform', category: 'logic', description: 'Modify data' },
  { value: 'rug_check', label: 'Rug Check', category: 'logic', description: 'Safety check' },
  // Data
  { value: 'solana_balance', label: 'Balance', category: 'data', description: 'Get SOL balance' },
  { value: 'token_data', label: 'Token Data', category: 'data', description: 'Token info' },
  { value: 'parse_transaction', label: 'Parse TX', category: 'data', description: 'Decode transaction' },
  // Market
  { value: 'dexscreener_price', label: 'DEXScreener', category: 'market', description: 'Get price' },
  { value: 'jupiter_quote', label: 'Jupiter Quote', category: 'market', description: 'Get swap quote' },
  { value: 'coingecko_price', label: 'CoinGecko', category: 'market', description: 'Get price' },
]

type AddNodeEdgeProps = EdgeProps & {
  data?: {
    onAddNode?: (edgeId: string, nodeType: string) => void
  }
}

export default function AddNodeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: AddNodeEdgeProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<NodeCategory | null>(null)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.add-node-popup')) {
        setShowMenu(false)
        setSelectedCategory(null)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMenu(false)
        setSelectedCategory(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMenu])

  const handleAddNode = (nodeType: string) => {
    data?.onAddNode?.(id, nodeType)
    setShowMenu(false)
    setSelectedCategory(null)
  }

  const categories = ['trigger', 'action', 'logic', 'data', 'market'] as NodeCategory[]

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: showMenu ? 9999 : 1,
          }}
          className="nodrag nopan"
        >
          {!showMenu ? (
            <button
              onClick={() => setShowMenu(true)}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--color-surface, #fff)',
                border: '2px solid var(--color-border, #e5e7eb)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 'bold',
                color: 'var(--color-text-muted, #666)',
                transition: 'all 0.15s ease',
                opacity: 0.6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-primary, #3b82f6)'
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = 'var(--color-primary, #3b82f6)'
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface, #fff)'
                e.currentTarget.style.color = 'var(--color-text-muted, #666)'
                e.currentTarget.style.borderColor = 'var(--color-border, #e5e7eb)'
                e.currentTarget.style.opacity = '0.6'
              }}
              title="Add node"
            >
              +
            </button>
          ) : (
            <div
              className="add-node-popup"
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              style={{
                background: 'var(--color-surface, #fff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                padding: 0,
                minWidth: selectedCategory ? 200 : 240,
                overflow: 'hidden',
                zIndex: 99999,
              }}
            >
              {/* Header */}
              <div style={{ 
                padding: '10px 12px', 
                borderBottom: '1px solid var(--color-border, #e5e7eb)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-hover, #f9fafb)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text, #111)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedCategory ? `${categoryInfo[selectedCategory].icon} ${categoryInfo[selectedCategory].label}` : 'Add Node'}
                </span>
                <button
                  onClick={() => {
                    if (selectedCategory) {
                      setSelectedCategory(null)
                    } else {
                      setShowMenu(false)
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--color-text-muted, #666)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {selectedCategory ? '←' : '✕'}
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: 8 }}>
                {!selectedCategory ? (
                  // Category selection
                  <div style={{ display: 'grid', gap: 4 }}>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: 'var(--color-text, #111)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-hover, #f5f5f5)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'none'
                        }}
                      >
                        <span style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: categoryInfo[cat].color + '20',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                        }}>
                          {categoryInfo[cat].icon}
                        </span>
                        <div>
                          <div style={{ fontWeight: 500 }}>{categoryInfo[cat].label}</div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted, #666)' }}>{categoryInfo[cat].description}</div>
                        </div>
                        <span style={{ marginLeft: 'auto', color: 'var(--color-text-subtle, #999)' }}>→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Node selection
                  <div style={{ display: 'grid', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                    {nodeOptions
                      .filter((opt) => opt.category === selectedCategory)
                      .map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleAddNode(opt.value)}
                          style={{
                            padding: '8px 10px',
                            fontSize: 12,
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            color: 'var(--color-text, #111)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = categoryInfo[selectedCategory].color + '15'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'none'
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: categoryInfo[selectedCategory].color,
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 500 }}>{opt.label}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-muted, #666)' }}>{opt.description}</div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
