import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AddNodeAfterLast from './AddNodeAfterLast'

const defaultNodes: Node[] = []

const defaultEdges: Edge[] = []

type Props = {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onDefinitionChange?: (definition: { nodes: Node[]; edges: Edge[] }) => void
  onNodeSelect?: (nodeId: string | undefined) => void
  onAddNodeAfterLast?: (nodeType: string) => void
  containerStyle?: CSSProperties
  readOnly?: boolean
  syncFromProps?: boolean
}

export type CreateWorkFlowHandle = {
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  addNode: (node: Node) => void
  deleteNode: (nodeId: string) => void
}

const CreateWorkFlow = forwardRef<CreateWorkFlowHandle, Props>(
  ({ initialNodes, initialEdges, onDefinitionChange, onNodeSelect, onAddNodeAfterLast, containerStyle, readOnly, syncFromProps }, ref) => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes ?? defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges)
  const [popupOpen, setPopupOpen] = useState(false)

  // Find terminal nodes (nodes with no outgoing edges)
  const terminalNodes = useMemo(() => {
    if (readOnly || nodes.length === 0) return []
    const nodesWithOutgoing = new Set(edges.map((e) => e.source))
    return nodes.filter((n) => !nodesWithOutgoing.has(n.id))
  }, [nodes, edges, readOnly])

  const didHydrateRef = useRef(false)

  useEffect(() => {
    if (syncFromProps) {
      setNodes(initialNodes ?? defaultNodes)
      setEdges(initialEdges ?? defaultEdges)
      return
    }

    if (didHydrateRef.current) return
    if (!initialNodes && !initialEdges) return

    setNodes(initialNodes ?? defaultNodes)
    setEdges(initialEdges ?? defaultEdges)
    didHydrateRef.current = true
  }, [initialNodes, initialEdges, syncFromProps])

  useEffect(() => {
    onDefinitionChange?.({ nodes, edges })
  }, [nodes, edges, onDefinitionChange])

  useImperativeHandle(
    ref,
    () => ({
      patchNodeData: (nodeId: string, patch: Record<string, unknown>) => {
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as any), ...patch } } : n)),
        )
      },
      addNode: (node: Node) => {
        setNodes((prev) => [...prev, node])
      },
      deleteNode: (nodeId: string) => {
        setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
      },
    }),
    [],
  )

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  )

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  )

  return (
    <div style={{ width: '100vw', height: '100vh', ...containerStyle }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        onNodeClick={(_evt, node) => onNodeSelect?.(node.id)}
        onPaneClick={() => {
          onNodeSelect?.(undefined)
          setPopupOpen(false)
        }}
        fitView
        zoomOnScroll={!popupOpen}
        zoomOnPinch={!popupOpen}
        zoomOnDoubleClick={!popupOpen}
        panOnScroll={!popupOpen}
        style={{
          // Custom node styling for dark mode
          ['--xy-node-background-color' as any]: 'var(--color-surface, #fff)',
          ['--xy-node-border-color' as any]: 'var(--color-border, #e5e7eb)',
          ['--xy-node-color' as any]: 'var(--color-text, #111)',
        }}
      >
        <Background color="var(--color-border)" gap={20} />
        <Controls showInteractive={false} />
        {/* Plus icon after terminal nodes - only show for the last one */}
        {terminalNodes.length > 0 && (
          <AddNodeAfterLast
            key={`add-after-${terminalNodes[terminalNodes.length - 1].id}`}
            position={{ 
              x: terminalNodes[terminalNodes.length - 1].position.x + 75,
              y: terminalNodes[terminalNodes.length - 1].position.y + 60
            }}
            onAddNode={(nodeType) => {
              setPopupOpen(false)
              onAddNodeAfterLast?.(nodeType)
            }}
            onPopupOpen={() => setPopupOpen(true)}
            onPopupClose={() => setPopupOpen(false)}
          />
        )}
      </ReactFlow>
    </div>
  )
  },
)

export default CreateWorkFlow
