export type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'market' | 'solana' | 'notify' | 'calc'

export type NodeDoc = {
  type: string
  name: string
  category: NodeCategory
  description: string
  inputs?: string[]
  outputs?: string[]
  example?: string
}

export const nodeDocumentation: Record<string, NodeDoc> = {
  // Triggers
  timer_trigger: {
    type: 'timer_trigger',
    name: 'Timer Trigger',
    category: 'trigger',
    description: 'Starts the workflow at regular intervals. Set the interval in seconds (minimum 60s for enabled workflows).',
    outputs: ['timestamp', 'intervalSeconds'],
    example: 'Use for periodic price checks, DCA buying, or scheduled tasks.',
  },
  price_trigger: {
    type: 'price_trigger',
    name: 'Price Trigger',
    category: 'trigger',
    description: 'Triggers when a token price crosses above or below a threshold.',
    inputs: ['symbol', 'direction', 'threshold'],
    outputs: ['price', 'triggered'],
    example: 'Alert when SOL crosses above $100.',
  },
  onchain_trigger: {
    type: 'onchain_trigger',
    name: 'On-Chain Trigger',
    category: 'trigger',
    description: 'Triggers when transactions involving your watched wallets are detected on Solana.',
    inputs: ['walletAddresses'],
    outputs: ['signature', 'event', 'matchedWallets', 'receivedAt'],
    example: 'React to wallet activity, swaps, or transfers in real-time.',
  },

  // Actions
  log: {
    type: 'log',
    name: 'Log',
    category: 'action',
    description: 'Logs a message to the execution output. Useful for debugging.',
    inputs: ['message'],
    outputs: ['message', 'timestamp'],
  },
  delay: {
    type: 'delay',
    name: 'Delay',
    category: 'action',
    description: 'Pauses execution for a specified number of milliseconds (max 30 seconds).',
    inputs: ['ms'],
    outputs: ['ms'],
  },
  transform: {
    type: 'transform',
    name: 'Transform',
    category: 'action',
    description: 'Transforms data using template expressions. Access previous node outputs with {{nodeId.field}}.',
    inputs: ['value'],
    outputs: ['value'],
    example: '{{n1.price}} * 1.1 to add 10% markup.',
  },
  http_request: {
    type: 'http_request',
    name: 'HTTP Request',
    category: 'action',
    description: 'Makes HTTP requests to allowed external APIs.',
    inputs: ['url', 'method', 'headers', 'body'],
    outputs: ['status', 'body', 'headers'],
  },

  // Logic
  if: {
    type: 'if',
    name: 'Condition (If)',
    category: 'logic',
    description: 'Evaluates a condition. Downstream nodes only run if condition passes.',
    inputs: ['left', 'op', 'right'],
    outputs: ['passed', 'op', 'left', 'right'],
    example: 'Check if {{n1.price}} > 100.',
  },
  cooldown: {
    type: 'cooldown',
    name: 'Cooldown',
    category: 'logic',
    description: 'Prevents the workflow from running again within a cooldown period.',
    inputs: ['key', 'cooldownMs'],
    outputs: ['passed', 'remainingMs'],
  },
  stop_loss: {
    type: 'stop_loss',
    name: 'Stop Loss',
    category: 'logic',
    description: 'Triggers when price drops below a percentage of entry price.',
    inputs: ['entryPrice', 'stopLossPercent', 'currentPrice'],
    outputs: ['triggered', 'triggerPrice'],
  },
  take_profit: {
    type: 'take_profit',
    name: 'Take Profit',
    category: 'logic',
    description: 'Triggers when price rises above a percentage of entry price.',
    inputs: ['entryPrice', 'takeProfitPercent', 'currentPrice'],
    outputs: ['triggered', 'triggerPrice'],
  },
  trailing_stop: {
    type: 'trailing_stop',
    name: 'Trailing Stop',
    category: 'logic',
    description: 'Dynamic stop loss that moves up with price, locking in profits.',
    inputs: ['mint', 'trailPercentage'],
    outputs: ['triggered', 'highPrice', 'triggerPrice'],
  },
  limit_order: {
    type: 'limit_order',
    name: 'Limit Order',
    category: 'logic',
    description: 'Executes when price reaches target level.',
    inputs: ['mint', 'side', 'targetPriceUsd', 'amount'],
    outputs: ['triggered', 'currentPriceUsd'],
  },
  volume_check: {
    type: 'volume_check',
    name: 'Volume Check',
    category: 'logic',
    description: 'Checks if 24h trading volume exceeds a threshold.',
    inputs: ['mint', 'minVolume24h'],
    outputs: ['volume24h', 'passed'],
  },
  liquidity_check: {
    type: 'liquidity_check',
    name: 'Liquidity Check',
    category: 'logic',
    description: 'Verifies token has sufficient liquidity.',
    inputs: ['mint', 'minLiquidityUsd'],
    outputs: ['liquidity', 'passed'],
  },
  rug_check: {
    type: 'rug_check',
    name: 'Rug Check',
    category: 'logic',
    description: 'Checks for rug pull warning signs (age, liquidity, holders).',
    inputs: ['mint', 'minTokenAgeMinutes', 'maxTopHolderPercentage'],
    outputs: ['passed', 'warnings', 'tokenAgeMinutes', 'holderCount'],
  },

  // Notifications
  discord_webhook: {
    type: 'discord_webhook',
    name: 'Discord Webhook',
    category: 'notify',
    description: 'Sends a message to a Discord channel via webhook.',
    inputs: ['credentialId', 'content', 'username'],
    outputs: ['status', 'sentAt'],
  },
  telegram_message: {
    type: 'telegram_message',
    name: 'Telegram Message',
    category: 'notify',
    description: 'Sends a message via Telegram bot. Get a bot token from @BotFather.',
    inputs: ['credentialId', 'chatId', 'text', 'parseMode'],
    outputs: ['status', 'messageId', 'sentAt'],
  },

  // Market Data
  dexscreener_price: {
    type: 'dexscreener_price',
    name: 'DexScreener Price',
    category: 'market',
    description: 'Fetches current price and market data from DexScreener.',
    inputs: ['pairAddress'],
    outputs: ['priceUsd', 'priceChange24h', 'volume24h', 'liquidity'],
  },
  birdeye_price: {
    type: 'birdeye_price',
    name: 'Birdeye Price',
    category: 'market',
    description: 'Fetches token price from Birdeye API.',
    inputs: ['mint'],
    outputs: ['priceUsd', 'priceChange24h'],
  },
  pyth_price_feed_id: {
    type: 'pyth_price_feed_id',
    name: 'Pyth Feed ID',
    category: 'market',
    description: 'Gets the Pyth price feed ID for a token symbol.',
    inputs: ['tokenSymbol'],
    outputs: ['priceFeedId'],
  },
  pyth_price: {
    type: 'pyth_price',
    name: 'Pyth Price',
    category: 'market',
    description: 'Fetches price from Pyth oracle network.',
    inputs: ['priceFeedId'],
    outputs: ['price', 'confidence', 'timestamp'],
  },
  jupiter_quote: {
    type: 'jupiter_quote',
    name: 'Jupiter Quote',
    category: 'market',
    description: 'Gets a swap quote from Jupiter aggregator.',
    inputs: ['inputMint', 'outputMint', 'amount'],
    outputs: ['outAmount', 'priceImpact', 'route'],
  },

  // Solana Actions
  solana_balance: {
    type: 'solana_balance',
    name: 'SOL Balance',
    category: 'solana',
    description: 'Fetches the SOL balance of a wallet.',
    inputs: ['credentialId'],
    outputs: ['solBalance', 'walletAddress'],
  },
  solana_token_balance: {
    type: 'solana_token_balance',
    name: 'Token Balance',
    category: 'solana',
    description: 'Fetches the token balance for a specific mint.',
    inputs: ['credentialId', 'mint'],
    outputs: ['balance', 'decimals'],
  },
  solana_transfer: {
    type: 'solana_transfer',
    name: 'Transfer',
    category: 'solana',
    description: 'Transfers SOL or SPL tokens to another wallet.',
    inputs: ['credentialId', 'to', 'amount', 'mint'],
    outputs: ['txSignature'],
  },
  jupiter_swap: {
    type: 'jupiter_swap',
    name: 'Jupiter Swap',
    category: 'solana',
    description: 'Swaps tokens using Jupiter aggregator for best rates.',
    inputs: ['credentialId', 'inputMint', 'outputMint', 'amount', 'slippageBps'],
    outputs: ['txSignature', 'inputAmount', 'outputAmount'],
  },
  raydium_swap: {
    type: 'raydium_swap',
    name: 'Raydium Swap',
    category: 'solana',
    description: 'Swaps tokens on Raydium DEX.',
    inputs: ['credentialId', 'inputMint', 'outputMint', 'amount', 'slippageBps'],
    outputs: ['txSignature'],
  },
  pump_fun_buy: {
    type: 'pump_fun_buy',
    name: 'Pump.fun Buy',
    category: 'solana',
    description: 'Buys tokens on Pump.fun.',
    inputs: ['credentialId', 'mint', 'solAmount', 'slippageBps'],
    outputs: ['txSignature'],
  },
  pump_fun_sell: {
    type: 'pump_fun_sell',
    name: 'Pump.fun Sell',
    category: 'solana',
    description: 'Sells tokens on Pump.fun.',
    inputs: ['credentialId', 'mint', 'tokenAmount', 'slippageBps'],
    outputs: ['txSignature'],
  },
  solana_stake: {
    type: 'solana_stake',
    name: 'Stake SOL',
    category: 'solana',
    description: 'Stakes SOL to earn rewards.',
    inputs: ['credentialId', 'amount'],
    outputs: ['txSignature'],
  },
  solana_restake: {
    type: 'solana_restake',
    name: 'Restake',
    category: 'solana',
    description: 'Restakes staking rewards to compound earnings.',
    inputs: ['credentialId', 'amount'],
    outputs: ['txSignature'],
  },
  lulo_lend: {
    type: 'lulo_lend',
    name: 'Lulo Lend',
    category: 'solana',
    description: 'Lends assets on Lulo protocol for yield.',
    inputs: ['credentialId', 'amount'],
    outputs: ['txSignature'],
  },
  close_empty_token_accounts: {
    type: 'close_empty_token_accounts',
    name: 'Close Empty Accounts',
    category: 'solana',
    description: 'Closes empty token accounts to reclaim SOL rent.',
    inputs: ['credentialId'],
    outputs: ['txSignature', 'closedCount'],
  },

  // Data
  token_holders: {
    type: 'token_holders',
    name: 'Token Holders',
    category: 'data',
    description: 'Fetches token holder count and distribution.',
    inputs: ['mint'],
    outputs: ['holderCount', 'top10Percentage'],
  },
  token_supply: {
    type: 'token_supply',
    name: 'Token Supply',
    category: 'data',
    description: 'Fetches token supply information.',
    inputs: ['mint'],
    outputs: ['totalSupply', 'circulatingSupply'],
  },
  portfolio_value: {
    type: 'portfolio_value',
    name: 'Portfolio Value',
    category: 'data',
    description: 'Calculates total portfolio value in USD.',
    inputs: ['credentialId'],
    outputs: ['totalValueUsd', 'solBalance', 'tokens'],
  },
  get_token_data: {
    type: 'get_token_data',
    name: 'Token Metadata',
    category: 'data',
    description: 'Fetches token metadata (name, symbol, decimals).',
    inputs: ['mint'],
    outputs: ['name', 'symbol', 'decimals', 'logoUri'],
  },
  parse_transaction: {
    type: 'parse_transaction',
    name: 'Parse Transaction',
    category: 'data',
    description: 'Parses and enriches a Solana transaction with human-readable details including token swap info.',
    inputs: ['signature'],
    outputs: [
      'signature',
      'parsed.type',
      'parsed.source',
      'parsed.description',
      'parsed.tokenInputMint',
      'parsed.tokenInputAmount',
      'parsed.tokenOutputMint',
      'parsed.tokenOutputAmount',
      'parsed.solSent',
      'parsed.solReceived',
      'parsed.fee',
      'parsed.feePayer',
    ],
  },

  // Calculations
  slippage_estimator: {
    type: 'slippage_estimator',
    name: 'Slippage Estimator',
    category: 'calc',
    description: 'Estimates price impact and slippage for a trade.',
    inputs: ['inputMint', 'outputMint', 'amount'],
    outputs: ['priceImpactPct', 'outAmount'],
  },
  pnl_calculator: {
    type: 'pnl_calculator',
    name: 'P&L Calculator',
    category: 'calc',
    description: 'Calculates profit/loss for a position.',
    inputs: ['entryPrice', 'currentPrice', 'quantity'],
    outputs: ['pnl', 'pnlPercent'],
  },
  position_size: {
    type: 'position_size',
    name: 'Position Size',
    category: 'calc',
    description: 'Calculates optimal position size based on risk.',
    inputs: ['accountBalance', 'riskPercent', 'entryPrice', 'stopLoss'],
    outputs: ['positionSize', 'riskAmount'],
  },
  twap: {
    type: 'twap',
    name: 'TWAP',
    category: 'action',
    description: 'Time-Weighted Average Price execution over multiple intervals.',
    inputs: ['inputMint', 'outputMint', 'totalAmount', 'intervals', 'intervalMinutes'],
    outputs: ['schedule', 'amountPerInterval'],
  },

}

export function getNodeDoc(type: string): NodeDoc | undefined {
  return nodeDocumentation[type]
}

export function getCategoryColor(category: NodeCategory): string {
  switch (category) {
    case 'trigger': return '#8b5cf6'
    case 'action': return '#3b82f6'
    case 'logic': return '#f59e0b'
    case 'data': return '#10b981'
    case 'market': return '#06b6d4'
    case 'solana': return '#14b8a6'
    case 'notify': return '#ec4899'
    case 'calc': return '#6366f1'
    default: return '#6b7280'
  }
}

export function getCategoryLabel(category: NodeCategory): string {
  switch (category) {
    case 'trigger': return 'Trigger'
    case 'action': return 'Action'
    case 'logic': return 'Logic'
    case 'data': return 'Data'
    case 'market': return 'Market'
    case 'solana': return 'Solana'
    case 'notify': return 'Notify'
    case 'calc': return 'Calculate'
    default: return 'Unknown'
  }
}
