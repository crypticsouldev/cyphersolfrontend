import { Link, useParams } from 'react-router-dom'
import CreateWorkFlow from '../components/CreateWorkFlow'

export default function Editor() {
  const params = useParams()
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
        <Link
          to="/dashboard"
          style={{
            background: '#fff',
            border: '1px solid #ddd',
            padding: '6px 10px',
            borderRadius: 6,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          back
        </Link>
        <span style={{ marginLeft: 10, fontSize: 12, color: '#666' }}>id: {params.id}</span>
      </div>
      <CreateWorkFlow />
    </div>
  )
}
