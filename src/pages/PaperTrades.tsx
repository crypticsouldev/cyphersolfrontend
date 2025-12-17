import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthToken } from '../lib/auth'
import {
  type ApiError,
  listPaperOrders,
  listPaperPositions,
  type PaperOrder,
  type PaperPosition,
} from '../lib/api'

export default function PaperTrades() {
  const navigate = useNavigate()

  const [positions, setPositions] = useState<PaperPosition[]>([])
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const totalTrades = useMemo(() => orders.length, [orders.length])

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setBusy(true)
      setError(undefined)
    }

    try {
      const [posRes, ordersRes] = await Promise.all([listPaperPositions(), listPaperOrders({ limit: 100 })])
      setPositions(posRes.positions)
      setOrders(ordersRes.paperOrders)
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
      if (!options?.silent) {
        setBusy(false)
      }
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Paper trading</div>
          <h1 style={{ margin: 0 }}>Paper trades</h1>
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

      <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>{totalTrades} trades captured from workflow executions</div>

      {error ? (
        <div style={{ background: '#fee', color: '#700', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: '1fr 2fr' }}>
        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Positions</h2>
          {busy ? (
            <div style={{ color: '#555' }}>loading...</div>
          ) : positions.length === 0 ? (
            <div style={{ color: '#555' }}>No positions yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {positions.map((p) => (
                <div key={p.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 600 }}>{p.symbol}</div>
                  <div style={{ fontFamily: 'monospace' }}>{p.netQuantity}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid #eee' }}>
            <h2 style={{ margin: 0 }}>Ledger</h2>
          </div>

          {busy ? (
            <div style={{ padding: 16, color: '#555' }}>loading...</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 16, color: '#555' }}>No paper trades yet.</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {orders.map((o) => (
                <Link
                  key={o.id}
                  to={`/executions/${o.executionId}`}
                  style={{
                    padding: 14,
                    borderBottom: '1px solid #eee',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 600 }}>
                      {o.side} {o.quantity} {o.symbol}
                      {o.price !== undefined ? ` @ ${o.price}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>{new Date(o.filledAt).toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    workflow: <span style={{ fontFamily: 'monospace' }}>{o.workflowId}</span> · node:{' '}
                    <span style={{ fontFamily: 'monospace' }}>{o.nodeId}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
