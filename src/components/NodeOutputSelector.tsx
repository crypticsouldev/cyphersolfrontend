import { useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { nodeDocumentation } from '../lib/nodeDocumentation'

type Props = {
  nodes: Node[]
  currentNodeId: string
  edges: { source: string; target: string }[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  allowCustom?: boolean
  /** Force plain input even if previous nodes exist (useful for addresses/amounts) */
  forceInput?: boolean
}

export default function NodeOutputSelector({
  nodes,
  currentNodeId,
  edges,
  value,
  onChange,
  disabled,
  placeholder = 'Select a value...',
  allowCustom = true,
  forceInput = false,
}: Props) {
  const [isCustomMode, setIsCustomMode] = useState(false)

  if (forceInput) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          fontFamily: 'monospace',
          fontSize: 13,
        }}
        placeholder={placeholder}
      />
    )
  }

  // Get all nodes that come before the current node in the flow
  const previousNodes = useMemo(() => {
    const ancestors = new Set<string>()
    
    // BFS backwards from current node to find all ancestors
    const queue = [currentNodeId]
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      for (const edge of edges) {
        if (edge.target === nodeId && !ancestors.has(edge.source)) {
          ancestors.add(edge.source)
          queue.push(edge.source)
        }
      }
    }

    return nodes.filter((n) => ancestors.has(n.id))
  }, [nodes, currentNodeId, edges])

  // Build options from previous nodes and their outputs
  const options = useMemo(() => {
    const result: { label: string; value: string; group: string }[] = []

    for (const node of previousNodes) {
      const nodeType = (node.data as any)?.type as string
      const nodeLabel = (node.data as any)?.label || node.id
      const doc = nodeDocumentation[nodeType]
      const outputs = doc?.outputs || []

      // Add full output option
      result.push({
        label: `${nodeLabel} → full output`,
        value: `{{nodes.${node.id}.output}}`,
        group: nodeLabel,
      })

      // Add individual output fields
      for (const output of outputs) {
        result.push({
          label: `${nodeLabel} → ${output}`,
          value: `{{nodes.${node.id}.output.${output}}}`,
          group: nodeLabel,
        })
      }
    }

    return result
  }, [previousNodes])

  // Check if current value matches a known option
  const isKnownValue = options.some((opt) => opt.value === value)
  const showCustomInput = isCustomMode || (value && !isKnownValue && value !== '')

  if (previousNodes.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
          placeholder={placeholder}
        />
        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
          No previous nodes available. Add nodes before this one to reference their outputs.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {showCustomInput ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontFamily: 'monospace',
              fontSize: 13,
              flex: 1,
            }}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(false)
              onChange('')
            }}
            disabled={disabled}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ← list
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              flex: 1,
              fontSize: 13,
            }}
          >
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {allowCustom ? (
            <button
              type="button"
              onClick={() => setIsCustomMode(true)}
              disabled={disabled}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Enter custom value"
            >
              ✏️
            </button>
          ) : null}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
        Select data from a previous node, or enter a custom value.
      </div>
    </div>
  )
}
