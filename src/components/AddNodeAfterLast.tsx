import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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
  { value: 'raydium_swap', label: 'Raydium Swap', category: 'action', description: 'Swap on Raydium' },
  { value: 'solana_transfer', label: 'Transfer', category: 'action', description: 'Send SOL/tokens' },
  { value: 'solana_stake', label: 'Stake SOL', category: 'action', description: 'Stake SOL' },
  { value: 'solana_restake', label: 'Restake', category: 'action', description: 'Restake rewards' },
  { value: 'pump_fun_buy', label: 'Pump.fun Buy', category: 'action', description: 'Buy on pump.fun' },
  { value: 'pump_fun_sell', label: 'Pump.fun Sell', category: 'action', description: 'Sell on pump.fun' },
  { value: 'lulo_lend', label: 'Lulo Lend', category: 'action', description: 'Lend on Lulo' },
  { value: 'discord_webhook', label: 'Discord', category: 'action', description: 'Send message' },
  { value: 'telegram_message', label: 'Telegram', category: 'action', description: 'Send message' },
  { value: 'http_request', label: 'HTTP Request', category: 'action', description: 'Call API' },
  { value: 'memo', label: 'Memo', category: 'action', description: 'On-chain memo' },
  { value: 'log', label: 'Log', category: 'action', description: 'Debug output' },
  { value: 'twap', label: 'TWAP', category: 'action', description: 'Time-weighted avg' },
  { value: 'close_empty_token_accounts', label: 'Close Accounts', category: 'action', description: 'Close empty accounts' },
  // Logic
  { value: 'if', label: 'Condition', category: 'logic', description: 'If/else branch' },
  { value: 'delay', label: 'Delay', category: 'logic', description: 'Wait time' },
  { value: 'transform', label: 'Transform', category: 'logic', description: 'Modify data' },
  { value: 'cooldown', label: 'Cooldown', category: 'logic', description: 'Rate limiting' },
  { value: 'retry', label: 'Retry', category: 'logic', description: 'Retry on failure' },
  { value: 'split_order', label: 'Split Order', category: 'logic', description: 'DCA split' },
  { value: 'balance_threshold_trigger', label: 'Balance Threshold', category: 'logic', description: 'Trigger on balance' },
  { value: 'rug_check', label: 'Rug Check', category: 'logic', description: 'Safety check' },
  { value: 'whale_alert', label: 'Whale Alert', category: 'logic', description: 'Large tx alert' },
  { value: 'stop_loss', label: 'Stop Loss', category: 'logic', description: 'Auto stop loss' },
  { value: 'take_profit', label: 'Take Profit', category: 'logic', description: 'Auto take profit' },
  { value: 'trailing_stop', label: 'Trailing Stop', category: 'logic', description: 'Trailing stop loss' },
  { value: 'limit_order', label: 'Limit Order', category: 'logic', description: 'Limit order' },
  { value: 'volume_check', label: 'Volume Check', category: 'logic', description: 'Check volume' },
  { value: 'liquidity_check', label: 'Liquidity Check', category: 'logic', description: 'Check liquidity' },
  { value: 'copy_trade', label: 'Copy Trade', category: 'logic', description: 'Copy wallet trades' },
  { value: 'price_change_trigger', label: 'Price Change', category: 'logic', description: 'Trigger on % change' },
  // Data
  { value: 'solana_balance', label: 'SOL Balance', category: 'data', description: 'Get SOL balance' },
  { value: 'solana_token_balance', label: 'Token Balance', category: 'data', description: 'Get token balance' },
  { value: 'get_token_data', label: 'Token Metadata', category: 'data', description: 'Token info' },
  { value: 'parse_transaction', label: 'Parse TX', category: 'data', description: 'Decode transaction' },
  { value: 'solana_confirm_tx', label: 'Confirm TX', category: 'data', description: 'Wait for confirmation' },
  { value: 'wait_for_confirmation', label: 'Wait Confirm', category: 'data', description: 'Wait for tx confirm' },
  { value: 'transaction_log', label: 'TX Log', category: 'data', description: 'Log transaction' },
  { value: 'token_holders', label: 'Token Holders', category: 'data', description: 'Get holders count' },
  { value: 'token_supply', label: 'Token Supply', category: 'data', description: 'Get supply' },
  { value: 'portfolio_value', label: 'Portfolio Value', category: 'data', description: 'Get portfolio value' },
  { value: 'wallet_transactions', label: 'Wallet TXs', category: 'data', description: 'Get wallet history' },
  { value: 'average_cost', label: 'Average Cost', category: 'data', description: 'Calculate avg cost' },
  { value: 'position_size', label: 'Position Size', category: 'data', description: 'Calculate position' },
  { value: 'pnl_calculator', label: 'PnL', category: 'data', description: 'Calculate PnL' },
  { value: 'slippage_estimator', label: 'Slippage', category: 'data', description: 'Estimate slippage' },
  // Market
  { value: 'dexscreener_price', label: 'DEXScreener', category: 'market', description: 'Get price' },
  { value: 'jupiter_quote', label: 'Jupiter Quote', category: 'market', description: 'Get swap quote' },
  { value: 'birdeye_price', label: 'Birdeye', category: 'market', description: 'Get price' },
  { value: 'pyth_price', label: 'Pyth Price', category: 'market', description: 'Oracle price' },
  { value: 'pyth_price_feed_id', label: 'Pyth Feed ID', category: 'market', description: 'Get feed ID' },
  { value: 'market_data', label: 'Market Data', category: 'market', description: 'General market data' },
]

type Props = {
  screenPosition: { x: number; y: number }
  onAddNode: (nodeType: string) => void
  onPopupOpen?: () => void
  onPopupClose?: () => void
}

export default function AddNodeAfterLast({ screenPosition, onAddNode, onPopupOpen, onPopupClose }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<NodeCategory | null>(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Notify parent when popup opens/closes
  useEffect(() => {
    if (showMenu) {
      onPopupOpen?.()
    } else {
      onPopupClose?.()
    }
  }, [showMenu, onPopupOpen, onPopupClose])

  const handleOpenMenu = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPopupPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    setShowMenu(true)
  }

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.add-node-after-popup')) {
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
    onAddNode(nodeType)
    setShowMenu(false)
    setSelectedCategory(null)
  }

  const categories = ['trigger', 'action', 'logic', 'data', 'market'] as NodeCategory[]

  // Render button and popup using portal to avoid ReactFlow zoom transform
  return createPortal(
    <>
      {/* Button always visible with connecting line */}
      <div
        style={{
          position: 'fixed',
          left: screenPosition.x,
          top: screenPosition.y,
          transform: 'translate(-50%, 0)',
          zIndex: 100,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Connecting line */}
          <div style={{ 
            width: 2, 
            height: 30, 
            background: '#555',
            borderRadius: 1,
          }} />
          {/* Dark rounded square button */}
          <button
            ref={buttonRef}
            onClick={handleOpenMenu}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: showMenu ? '#333' : '#1a1a1a',
              border: `1px solid ${showMenu ? '#555' : '#333'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 300,
              color: showMenu ? '#fff' : '#666',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2a2a2a'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = '#555'
            }}
            onMouseLeave={(e) => {
              if (!showMenu) {
                e.currentTarget.style.background = '#1a1a1a'
                e.currentTarget.style.color = '#666'
                e.currentTarget.style.borderColor = '#333'
              }
            }}
            title="Add node"
          >
            +
          </button>
        </div>
      </div>
      
      {/* Popup - shown when menu is open */}
      {showMenu && (
        <div
          className="add-node-after-popup"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: popupPosition.x,
            top: popupPosition.y,
            transform: 'translate(-50%, -50%)',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: 0,
            minWidth: selectedCategory ? 280 : 380,
            maxHeight: 480,
            overflow: 'hidden',
            zIndex: 99999,
          }}
        >
          {/* Header */}
          <div style={{ 
            padding: '14px 16px', 
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }}>
                ADD NODE
              </span>
              <span style={{ width: 20, height: 20, background: '#333', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#888' }}>+</span>
            </div>
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
                fontSize: 16,
                color: '#888',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              {selectedCategory ? '←' : '×'}
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: 12 }}>
            {!selectedCategory ? (
              // Category selection
              <div style={{ display: 'grid', gap: 6 }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '14px 16px',
                      fontSize: 13,
                      textAlign: 'left',
                      background: '#222',
                      border: '1px solid #333',
                      borderRadius: 10,
                      cursor: 'pointer',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a'
                      e.currentTarget.style.borderColor = '#444'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#222'
                      e.currentTarget.style.borderColor = '#333'
                    }}
                  >
                    <span style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: categoryInfo[cat].color + '30',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}>
                      {categoryInfo[cat].icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{categoryInfo[cat].label}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{categoryInfo[cat].description}</div>
                    </div>
                    <span style={{ color: '#555', fontSize: 16 }}>→</span>
                  </button>
                ))}
              </div>
            ) : (
              // Node selection
              <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {nodeOptions
                  .filter((opt) => opt.category === selectedCategory)
                  .map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAddNode(opt.value)}
                      style={{
                        padding: '10px 12px',
                        fontSize: 12,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2a2a2a'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: categoryInfo[selectedCategory].color,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 500 }}>{opt.label}</div>
                        <div style={{ fontSize: 10, color: '#888' }}>{opt.description}</div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
