import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

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
      {/* Node handles */}
      <Handle type="target" position={Position.Top} />
      
      {/* Node content with X button */}
      <div
        style={{
          position: 'relative',
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
        {/* X button - only visible when selected */}
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              data.onDelete?.(id)
            }}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--color-surface, #fff)',
              border: '2px solid #3b82f6',
              color: '#3b82f6',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
            }}
            title="Delete node"
          >
            ×
          </button>
        )}
        {data.label}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </>
  )
}

export default memo(CustomNode)
