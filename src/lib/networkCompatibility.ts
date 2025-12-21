export type Network = 'mainnet' | 'devnet'

// Nodes that work on both networks
const universalNodes = [
  'log',
  'delay',
  'if',
  'transform',
  'http_request',
  'discord_webhook',
  'telegram_message',
  'cooldown',
  'retry',
  'split_order',
]

// Nodes that only work on mainnet (require real liquidity, APIs, or mainnet-only services)
const mainnetOnlyNodes = [
  'dexscreener_price',
  'birdeye_price',
  'jupiter_swap',
  'raydium_swap',
  'pump_fun_buy',
  'pump_fun_sell',
  'lulo_lend',
  'jupiter_quote',
  'stop_loss',
  'take_profit',
  'trailing_stop',
  'limit_order',
  'volume_check',
  'liquidity_check',
  'rug_check',
  'copy_trade',
  'whale_alert',
  'slippage_estimator',
  'twap',
  'market_data',
]

// Nodes that work on devnet (basic Solana operations)
const devnetCompatibleNodes = [
  ...universalNodes,
  'timer_trigger',
  'price_trigger',
  'onchain_trigger',
  'solana_balance',
  'solana_token_balance',
  'solana_transfer',
  'solana_stake',
  'solana_restake',
  'close_empty_token_accounts',
  'memo',
  'parse_transaction',
  'solana_confirm_tx',
  'get_token_data',
  'wait_for_confirmation',
  'balance_threshold_trigger',
  'transaction_log',
  'token_holders',
  'token_supply',
  'portfolio_value',
  'wallet_transactions',
  'average_cost',
  'position_size',
  'pnl_calculator',
  'paper_order',
  'pyth_price_feed_id',
  'pyth_price',
]

export function isNodeCompatibleWithNetwork(nodeType: string, network: Network): boolean {
  if (network === 'mainnet') return true // All nodes work on mainnet
  return devnetCompatibleNodes.includes(nodeType)
}

export function getIncompatibleNodes(nodeTypes: string[], network: Network): string[] {
  if (network === 'mainnet') return []
  return nodeTypes.filter(type => !devnetCompatibleNodes.includes(type))
}

export function getNodeNetworkWarning(nodeType: string): string | undefined {
  if (mainnetOnlyNodes.includes(nodeType)) {
    return 'This node only works on mainnet. It will fail on devnet.'
  }
  return undefined
}

export const NETWORK_OPTIONS: { value: Network; label: string; description: string }[] = [
  { 
    value: 'mainnet', 
    label: 'Mainnet', 
    description: 'Production network with real funds' 
  },
  { 
    value: 'devnet', 
    label: 'Devnet', 
    description: 'Test network for development (free SOL from faucet)' 
  },
]
