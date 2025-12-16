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

  const title = useMemo(() => (mode === 'signin' ? 'Sign in' : 'Sign up'), [mode])

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
      const meta = [apiErr.code, apiErr.requestId].filter(Boolean).join(' · ')
      setError(meta ? `${apiErr.message} (${meta})` : apiErr.message || 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          disabled={busy}
          style={{ background: 'transparent', border: '1px solid #ddd', padding: '6px 10px' }}
        >
          {mode === 'signin' ? 'switch to sign up' : 'switch to sign in'}
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 12 : 1}
            disabled={busy}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6 }}
          />
        </label>

        {mode === 'signup' ? (
          <div style={{ fontSize: 12, color: '#555' }}>Password must be at least 12 characters.</div>
        ) : null}

        {error ? (
          <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6 }}>{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{ padding: 10, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff' }}
        >
          {busy ? 'working...' : title.toLowerCase()}
        </button>
      </form>
    </div>
  )
}
