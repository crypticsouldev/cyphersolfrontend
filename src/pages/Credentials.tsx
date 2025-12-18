import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthToken } from '../lib/auth'
import {
  createCredential,
  deleteCredential,
  listCredentials,
  type ApiError,
  type CredentialSummary,
} from '../lib/api'

export default function Credentials() {
  const navigate = useNavigate()

  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [secretText, setSecretText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function load() {
    setError(undefined)
    try {
      const res = await listCredentials()
      setCredentials(res.credentials)
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)

    try {
      let secret: unknown = secretText
      try {
        secret = secretText ? JSON.parse(secretText) : ''
      } catch {
      }

      await createCredential(provider, name, secret)
      setProvider('')
      setName('')
      setSecretText('')
      await load()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    setBusy(true)
    setError(undefined)
    try {
      await deleteCredential(id)
      await load()
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        clearAuthToken()
        navigate('/login', { replace: true })
        return
      }
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Credentials</div>
          <h1 style={{ margin: 0 }}>Manage credentials</h1>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to="/dashboard"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              textDecoration: 'none',
              color: 'inherit',
              background: '#fff',
            }}
          >
            back
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
          >
            refresh
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
        Secrets are encrypted at rest and never returned by the API.
      </div>

      {error ? (
        <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create credential</h2>
          <form onSubmit={onCreate} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Provider</span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                required
                disabled={busy}
                placeholder="binance / smtp / ..."
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={busy}
                placeholder="main account"
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Secret (JSON preferred)</span>
              <textarea
                value={secretText}
                onChange={(e) => setSecretText(e.target.value)}
                disabled={busy}
                placeholder='{"apiKey":"...","apiSecret":"..."}'
                rows={6}
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, fontFamily: 'monospace' }}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              style={{ padding: 10, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff' }}
            >
              {busy ? 'working...' : 'create'}
            </button>
          </form>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 10 }}>
          <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
            <h2 style={{ margin: 0 }}>Your credentials</h2>
          </div>
          {credentials.length === 0 ? (
            <div style={{ padding: 16, color: '#555' }}>No credentials yet.</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {credentials.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: 14,
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontWeight: 600 }}>{c.provider}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{c.name}</div>
                    {c.publicKey ? (
                      <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{c.publicKey}</div>
                    ) : null}
                    <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{c.id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDelete(c.id)}
                    disabled={busy}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
                  >
                    delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
