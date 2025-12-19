import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { signin, signup, type ApiError } from '../lib/api'
import { setAuthToken } from '../lib/auth'

type Mode = 'signin' | 'signup'

export default function Login() {
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const title = useMemo(() => (mode === 'signin' ? 'Sign In' : 'Create Account'), [mode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setBusy(true)

    try {
      const res = mode === 'signin' ? await signin(email, password) : await signup(email, password)
      setAuthToken(res.token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 12, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="m2 17 10 5 10-5"/>
              <path d="m2 12 10 5 10-5"/>
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>CypherSol</h1>
          <p className="text-muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        <div style={{ display: 'flex', marginBottom: 20, background: '#f3f4f6', borderRadius: 'var(--radius-md)', padding: 4 }}>
          <button
            type="button"
            onClick={() => setMode('signin')}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: mode === 'signin' ? 'white' : 'transparent',
              fontWeight: mode === 'signin' ? 500 : 400,
              boxShadow: mode === 'signin' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: mode === 'signup' ? 'white' : 'transparent',
              fontWeight: mode === 'signup' ? 500 : 400,
              boxShadow: mode === 'signup' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="label">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              placeholder="you@example.com"
              className="input"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 12 : 1}
              disabled={busy}
              placeholder="••••••••••••"
              className="input"
            />
            {mode === 'signup' && (
              <p className="label-hint">Must be at least 12 characters</p>
            )}
          </div>

          <button type="submit" disabled={busy} className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>
            {busy ? (
              <><span className="spinner" style={{ width: 14, height: 14 }} /> {mode === 'signin' ? 'Signing in...' : 'Creating account...'}</>
            ) : (
              title
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
