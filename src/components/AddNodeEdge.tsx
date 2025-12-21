import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'market'

const nodeOptions: { value: string; label: string; category: NodeCategory }[] = [
  // Triggers
  { value: 'timer_trigger', label: 'Timer Trigger', category: 'trigger' },
  { value: 'price_trigger', label: 'Price Trigger', category: 'trigger' },
  { value: 'onchain_trigger', label: 'On-Chain Trigger', category: 'trigger' },
  // Actions
  { value: 'jupiter_swap', label: 'Jupiter Swap', category: 'action' },
  { value: 'solana_transfer', label: 'SOL Transfer', category: 'action' },
  { value: 'discord_webhook', label: 'Discord', category: 'action' },
  { value: 'telegram_message', label: 'Telegram', category: 'action' },
  { value: 'http_request', label: 'HTTP Request', category: 'action' },
  { value: 'log', label: 'Log', category: 'action' },
  // Logic
  { value: 'if', label: 'If Condition', category: 'logic' },
  { value: 'delay', label: 'Delay', category: 'logic' },
  { value: 'transform', label: 'Transform', category: 'logic' },
  { value: 'rug_check', label: 'Rug Check', category: 'logic' },
  // Data
  { value: 'solana_balance', label: 'SOL Balance', category: 'data' },
  { value: 'token_data', label: 'Token Data', category: 'data' },
  { value: 'parse_transaction', label: 'Parse TX', category: 'data' },
  // Market
  { value: 'dexscreener_price', label: 'DEXScreener', category: 'market' },
  { value: 'jupiter_quote', label: 'Jupiter Quote', category: 'market' },
  { value: 'coingecko_price', label: 'CoinGecko', category: 'market' },
]

const categoryColors: Record<NodeCategory, string> = {
  trigger: '#8b5cf6',
  action: '#3b82f6',
  logic: '#f59e0b',
  data: '#10b981',
  market: '#06b6d4',
}

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
  const [hoveredCategory, setHoveredCategory] = useState<NodeCategory | null>(null)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const handleAddNode = (nodeType: string) => {
    data?.onAddNode?.(id, nodeType)
    setShowMenu(false)
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
          }}
          className="nodrag nopan"
        >
          {!showMenu ? (
            <button
              onClick={() => setShowMenu(true)}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--color-surface, #fff)',
                border: '2px solid var(--color-border, #e5e7eb)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 'bold',
                color: 'var(--color-text-muted, #666)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-primary, #3b82f6)'
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = 'var(--color-primary, #3b82f6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface, #fff)'
                e.currentTarget.style.color = 'var(--color-text-muted, #666)'
                e.currentTarget.style.borderColor = 'var(--color-border, #e5e7eb)'
              }}
              title="Add node"
            >
              +
            </button>
          ) : (
            <div
              style={{
                background: 'var(--color-surface, #fff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: 8,
                minWidth: 180,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #666)' }}>ADD NODE</span>
                <button
                  onClick={() => setShowMenu(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'var(--color-text-muted, #666)',
                    padding: 2,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setHoveredCategory(hoveredCategory === cat ? null : cat)}
                    style={{
                      flex: 1,
                      padding: '4px 2px',
                      fontSize: 9,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      background: hoveredCategory === cat ? categoryColors[cat] : 'var(--color-hover, #f9fafb)',
                      color: hoveredCategory === cat ? '#fff' : 'var(--color-text-muted, #666)',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {cat.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                {nodeOptions
                  .filter((opt) => !hoveredCategory || opt.category === hoveredCategory)
                  .map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAddNode(opt.value)}
                      style={{
                        padding: '6px 8px',
                        fontSize: 11,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: 'var(--color-text, #111)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-hover, #f9fafb)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: categoryColors[opt.category],
                        }}
                      />
                      {opt.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
