import { memo } from 'react'
import { Handle, Position, NodeToolbar } from '@xyflow/react'

type CustomNodeProps = {
  id: string
  data: {
    label: string
    type?: string
    onDelete?: (nodeId: string) => void
  }
  selected?: boolean
}

function CustomNode({ id, data, selected }: CustomNodeProps) {
  return (
    <>
      {/* Delete button toolbar - shows when selected */}
      <NodeToolbar isVisible={selected === true} position={Position.Top}>
        <button
          onClick={() => data.onDelete?.(id)}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          title="Delete node"
        >
          ✕ Delete
        </button>
      </NodeToolbar>

      {/* Node handles */}
      <Handle type="target" position={Position.Top} />
      
      {/* Node content */}
      <div
        style={{
          padding: '12px 20px',
          background: 'var(--color-surface, #fff)',
          border: selected ? '2px solid #3b82f6' : '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 8,
          minWidth: 120,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--color-text, #111)',
          boxShadow: selected ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        {data.label}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </>
  )
}

export default memo(CustomNode)
