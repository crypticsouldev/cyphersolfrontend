import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthToken } from '../lib/auth'
import {
  createCredential,
  deleteCredential,
  type ApiError,
} from '../lib/api'
import { useCredentials, invalidateCredentials } from '../lib/hooks'

function CredentialSkeleton() {
  return (
    <div className="list-item">
      <div className="list-item-content">
        <div className="skeleton" style={{ width: 120, height: 16, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: 180, height: 14 }} />
      </div>
      <div className="skeleton" style={{ width: 60, height: 32 }} />
    </div>
  )
}

export default function Credentials() {
  const navigate = useNavigate()
  const { credentials, isLoading, error: fetchError, revalidate } = useCredentials()

  const [providerType, setProviderType] = useState<'solana_wallet' | 'discord_webhook' | 'api_token' | 'custom'>('solana_wallet')
  const [customProvider, setCustomProvider] = useState('')
  const [name, setName] = useState('')
  const [secretText, setSecretText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const displayError = error || (fetchError ? 'Failed to load credentials' : undefined)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)

    try {
      const provider = providerType === 'custom' ? customProvider.trim() : providerType
      if (!provider) {
        setError('Provider is required')
        return
      }

      let secret: unknown
      if (providerType === 'solana_wallet' || providerType === 'api_token' || providerType === 'discord_webhook') {
        secret = secretText.trim()
      } else {
        secret = secretText
        try {
          secret = secretText ? JSON.parse(secretText) : ''
        } catch {
        }
      }

      await createCredential(provider, name, secret)

      setProviderType('solana_wallet')
      setCustomProvider('')
      setName('')
      setSecretText('')
      await invalidateCredentials()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      setError(apiErr.message || 'Failed to create credential')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this credential? This cannot be undone.')) return
    
    setBusy(true)
    setError(undefined)
    try {
      await deleteCredential(id)
      await invalidateCredentials()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      setError(apiErr.message || 'Failed to delete credential')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-narrow" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Settings</div>
          <h1 className="page-title">Credentials</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Back
          </Link>
          <button type="button" onClick={() => revalidate()} disabled={busy} className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Secrets are encrypted at rest and never returned by the API.
      </p>

      {displayError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{displayError}</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Add Credential</h2>
          <form onSubmit={onCreate} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="label">Provider</label>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as any)}
                disabled={busy}
                className="input select"
              >
                <option value="solana_wallet">Solana Wallet</option>
                <option value="discord_webhook">Discord Webhook</option>
                <option value="api_token">API Token</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {providerType === 'custom' && (
              <div>
                <label className="label">Custom Provider ID</label>
                <input
                  value={customProvider}
                  onChange={(e) => setCustomProvider(e.target.value)}
                  required
                  disabled={busy}
                  placeholder="binance, smtp, etc."
                  className="input"
                />
              </div>
            )}

            <div>
              <label className="label">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={busy}
                placeholder="My trading wallet"
                className="input"
              />
            </div>

            <div>
              <label className="label">
                {providerType === 'solana_wallet'
                  ? 'Secret Key (base58)'
                  : providerType === 'discord_webhook'
                    ? 'Webhook URL'
                    : providerType === 'api_token'
                      ? 'Token'
                      : 'Secret (JSON preferred)'}
              </label>
              <textarea
                value={secretText}
                onChange={(e) => setSecretText(e.target.value)}
                disabled={busy}
                placeholder={
                  providerType === 'solana_wallet'
                    ? 'Base58 encoded secret key'
                    : providerType === 'discord_webhook'
                      ? 'https://discord.com/api/webhooks/...'
                      : providerType === 'api_token'
                        ? 'Your API token'
                        : '{"apiKey":"...","apiSecret":"..."}'
                }
                rows={4}
                className="input input-mono"
              />
              <p className="label-hint">
                {providerType === 'solana_wallet' && 'Used for solana_balance, jupiter_swap, and trading nodes.'}
                {providerType === 'discord_webhook' && 'Used for discord_webhook notification nodes.'}
              </p>
            </div>

            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating...</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Credential</>
              )}
            </button>
          </form>
        </div>

        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Your Credentials</h2>
          </div>
          {isLoading ? (
            <>
              <CredentialSkeleton />
              <CredentialSkeleton />
            </>
          ) : credentials.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p>No credentials yet</p>
            </div>
          ) : (
            credentials.map((c) => (
              <div key={c.id} className="list-item">
                <div className="list-item-content">
                  <div className="flex items-center gap-2">
                    <span className="list-item-title">{c.name}</span>
                    <span className="badge badge-neutral">{c.provider}</span>
                  </div>
                  {c.publicKey && (
                    <div className="text-xs text-muted" style={{ fontFamily: 'monospace' }}>
                      {c.publicKey.slice(0, 8)}...{c.publicKey.slice(-6)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(c.id)}
                  disabled={busy}
                  className="btn btn-sm btn-danger"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
