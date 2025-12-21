export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  category: 'trading' | 'alerts' | 'monitoring' | 'defi' | 'safety'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  nodes: Array<{
    id: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
  }>
}

export const workflowTemplates: WorkflowTemplate[] = [
  // ============ ALERTS ============
  {
    id: 'price-alert',
    name: 'Price Alert Bot',
    description: 'Get Discord notifications when a token reaches your target price. Perfect for tracking entry/exit points.',
    category: 'alerts',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 60 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'dexscreener_price', type: 'dexscreener_price', pairAddress: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.priceUsd}} > 1.0' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🚨 Price Alert! Token is now ${{n2.priceUsd}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },
  {
    id: 'whale-watcher',
    name: 'Whale Watcher',
    description: 'Monitor large wallet transactions and get alerted when whales move tokens.',
    category: 'alerts',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 30 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'whale_alert', type: 'whale_alert', walletAddress: '', thresholdSol: 100 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🐋 Whale Alert! Large transaction detected from {{n2.walletAddress}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
  {
    id: 'volume-spike-alert',
    name: 'Volume Spike Alert',
    description: 'Get notified when trading volume exceeds your threshold - often signals big moves.',
    category: 'alerts',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 300 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'volume_check', type: 'volume_check', mint: '', minVolume24h: 100000 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '📊 Volume Alert! 24h volume: ${{n2.volume24h}} exceeds threshold' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
  {
    id: 'price-change-alert',
    name: 'Price Change Alert',
    description: 'Trigger alerts when price crosses above or below a specific threshold.',
    category: 'alerts',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'price_trigger', type: 'price_trigger', symbol: 'SOL', direction: 'crosses_above', threshold: 100, intervalSeconds: 60 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '📈 SOL just crossed above $100!' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
    ],
  },

  // ============ MONITORING ============
  {
    id: 'portfolio-tracker',
    name: 'Portfolio Tracker',
    description: 'Track your portfolio value and get periodic updates on your holdings.',
    category: 'monitoring',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 3600 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'portfolio_value', type: 'portfolio_value', credentialId: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '💰 Portfolio Update\nTotal Value: ${{n2.totalValueUsd}}\nSOL: {{n2.solBalance}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
  {
    id: 'balance-monitor',
    name: 'Balance Monitor',
    description: 'Monitor your wallet balance and get alerts when it changes significantly.',
    category: 'monitoring',
    difficulty: 'beginner',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 300 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'solana_balance', type: 'solana_balance', credentialId: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.solBalance}} < 1' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '⚠️ Low Balance Alert! SOL balance: {{n2.solBalance}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },
  {
    id: 'token-holder-tracker',
    name: 'Token Holder Tracker',
    description: 'Monitor token holder count and distribution changes over time.',
    category: 'monitoring',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 3600 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'token_holders', type: 'token_holders', mint: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '👥 Holder Update\nTotal Holders: {{n2.holderCount}}\nTop 10 Own: {{n2.top10Percentage}}%' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },

  // ============ SAFETY ============
  {
    id: 'rug-detector',
    name: 'Rug Pull Detector',
    description: 'Monitor tokens for rug pull warning signs like low liquidity, concentrated holders, or suspicious activity.',
    category: 'safety',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 300 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'rug_check', type: 'rug_check', mint: '', minLiquidityUsd: 10000, maxTop10HolderPct: 50, minTokenAgeHours: 24 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.passed}} === false' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🚨 RUG WARNING!\nToken: {{n2.mint}}\nReason: {{n2.reason}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },
  {
    id: 'liquidity-monitor',
    name: 'Liquidity Monitor',
    description: 'Watch liquidity pools and get alerts if liquidity drops below safe levels.',
    category: 'safety',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 300 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'liquidity_check', type: 'liquidity_check', mint: '', minLiquidityUsd: 50000 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.passed}} === false' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '⚠️ Low Liquidity Alert!\nCurrent: ${{n2.liquidityUsd}}\nThreshold: $50,000' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },

  // ============ TRADING ============
  {
    id: 'dca-bot',
    name: 'DCA Bot (Dollar Cost Average)',
    description: 'Automatically buy a fixed amount of tokens at regular intervals to average your entry price.',
    category: 'trading',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 86400 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'solana_balance', type: 'solana_balance', credentialId: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.solBalance}} > 0.1' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { 
          label: 'jupiter_swap', 
          type: 'jupiter_swap', 
          credentialId: '',
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: '',
          amount: 0.05,
          slippageBps: 100
        },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '✅ DCA Buy Complete!\nBought with 0.05 SOL\nTx: {{n4.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },
  {
    id: 'stop-loss-bot',
    name: 'Stop Loss Bot',
    description: 'Automatically sell tokens when price drops below your stop loss level to limit losses.',
    category: 'trading',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 30 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'dexscreener_price', type: 'dexscreener_price', pairAddress: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'stop_loss', type: 'stop_loss', entryPrice: 1.0, stopLossPercent: 10 },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { 
          label: 'jupiter_swap', 
          type: 'jupiter_swap', 
          credentialId: '',
          inputMint: '',
          outputMint: 'So11111111111111111111111111111111111111112',
          amount: '{{all}}',
          slippageBps: 200
        },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🛑 Stop Loss Triggered!\nSold at ${{n2.priceUsd}}\nTx: {{n4.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },
  {
    id: 'take-profit-bot',
    name: 'Take Profit Bot',
    description: 'Automatically sell tokens when price reaches your profit target.',
    category: 'trading',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 30 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'dexscreener_price', type: 'dexscreener_price', pairAddress: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'take_profit', type: 'take_profit', entryPrice: 1.0, takeProfitPercent: 50 },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { 
          label: 'jupiter_swap', 
          type: 'jupiter_swap', 
          credentialId: '',
          inputMint: '',
          outputMint: 'So11111111111111111111111111111111111111112',
          amount: '{{all}}',
          slippageBps: 100
        },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🎯 Take Profit Hit!\nSold at ${{n2.priceUsd}} (+50%)\nTx: {{n4.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },
  {
    id: 'trailing-stop-bot',
    name: 'Trailing Stop Bot',
    description: 'Smart stop loss that moves up with price, locking in profits while protecting against downturns.',
    category: 'trading',
    difficulty: 'advanced',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 30 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'trailing_stop', type: 'trailing_stop', credentialId: '', mint: '', trailPercentage: 10, sellPercentage: 100 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '📉 Trailing Stop Triggered!\nSold at {{n2.triggerPrice}}\nHigh was: {{n2.highPrice}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
  {
    id: 'limit-order-bot',
    name: 'Limit Order Bot',
    description: 'Place conditional orders that execute when price reaches your target level.',
    category: 'trading',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 30 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'limit_order', type: 'limit_order', credentialId: '', mint: '', side: 'buy', targetPrice: 0.5, amount: 1 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '✅ Limit Order Filled!\nBought at ${{n2.executionPrice}}\nTx: {{n2.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
  {
    id: 'twap-execution',
    name: 'TWAP Execution',
    description: 'Execute large orders over time using Time-Weighted Average Price to minimize market impact.',
    category: 'trading',
    difficulty: 'advanced',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 300 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'twap', type: 'twap', credentialId: '', inputMint: 'So11111111111111111111111111111111111111112', outputMint: '', totalAmount: 10, intervals: 10, intervalMinutes: 60 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '📊 TWAP Order Executed\nChunk {{n2.currentInterval}}/{{n2.totalIntervals}}\nAmount: {{n2.chunkAmount}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },

  // ============ DEFI ============
  {
    id: 'auto-restake',
    name: 'Auto Restake',
    description: 'Automatically restake your SOL staking rewards to compound your earnings.',
    category: 'defi',
    difficulty: 'intermediate',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 86400 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'solana_balance', type: 'solana_balance', credentialId: '' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.solBalance}} > 0.1' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'solana_restake', type: 'solana_restake', credentialId: '' },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '♻️ Auto-Restake Complete!\nRestaked rewards\nTx: {{n4.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },
  {
    id: 'copy-trading',
    name: 'Copy Trading Bot',
    description: 'Mirror trades from successful whale wallets automatically. Watch a wallet and copy their swaps in real-time.',
    category: 'trading',
    difficulty: 'advanced',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'onchain_trigger', type: 'onchain_trigger', walletAddresses: '', transactionTypes: 'swap' },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'parse_transaction', type: 'parse_transaction' },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.type}} === "SWAP"' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { label: 'rug_check', type: 'rug_check', mint: '{{n2.tokenOutputMint}}' },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'if', type: 'if', condition: '{{n4.isRugPull}} === false' },
      },
      {
        id: 'n6',
        position: { x: 0, y: 600 },
        data: { label: 'jupiter_swap', type: 'jupiter_swap', credentialId: '', inputMint: 'So11111111111111111111111111111111111111112', outputMint: '{{n2.tokenOutputMint}}', amount: 0.1, slippageBps: 300 },
      },
      {
        id: 'n7',
        position: { x: 0, y: 720 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '🔄 Copy Trade Executed!\n\nCopied swap from whale\nBought: {{n2.tokenOutputMint}}\nAmount: {{n6.outputAmount}}\nTx: {{n6.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
    ],
  },
  {
    id: 'slippage-monitor',
    name: 'Slippage Monitor',
    description: 'Check expected slippage before trading and only execute when conditions are favorable.',
    category: 'trading',
    difficulty: 'advanced',
    nodes: [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        data: { label: 'timer_trigger', type: 'timer_trigger', intervalSeconds: 60 },
      },
      {
        id: 'n2',
        position: { x: 0, y: 120 },
        data: { label: 'slippage_estimator', type: 'slippage_estimator', inputMint: 'So11111111111111111111111111111111111111112', outputMint: '', amount: 1 },
      },
      {
        id: 'n3',
        position: { x: 0, y: 240 },
        data: { label: 'if', type: 'if', condition: '{{n2.priceImpactPct}} < 1' },
      },
      {
        id: 'n4',
        position: { x: 0, y: 360 },
        data: { 
          label: 'jupiter_swap', 
          type: 'jupiter_swap', 
          credentialId: '',
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: '',
          amount: 1,
          slippageBps: 100
        },
      },
      {
        id: 'n5',
        position: { x: 0, y: 480 },
        data: { label: 'discord_webhook', type: 'discord_webhook', credentialId: '', message: '✅ Low Slippage Trade!\nPrice Impact: {{n2.priceImpactPct}}%\nTx: {{n4.txSignature}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
  },
]

export const templateCategories = [
  { id: 'all', name: 'All Templates', icon: 'grid' },
  { id: 'alerts', name: 'Alerts', icon: 'bell' },
  { id: 'monitoring', name: 'Monitoring', icon: 'eye' },
  { id: 'trading', name: 'Trading', icon: 'trending-up' },
  { id: 'safety', name: 'Safety', icon: 'shield' },
  { id: 'defi', name: 'DeFi', icon: 'layers' },
] as const

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  if (category === 'all') return workflowTemplates
  return workflowTemplates.filter((t) => t.category === category)
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find((t) => t.id === id)
}
