import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react'
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const defaultNodes: Node[] = []

const defaultEdges: Edge[] = []

type Props = {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onDefinitionChange?: (definition: { nodes: Node[]; edges: Edge[] }) => void
  onNodeSelect?: (nodeId: string | undefined) => void
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
  ({ initialNodes, initialEdges, onDefinitionChange, onNodeSelect, containerStyle, readOnly, syncFromProps }, ref) => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes ?? defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges)

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
        onNodeClick={(_evt, node) => onNodeSelect?.(node.id)}
        onPaneClick={() => onNodeSelect?.(undefined)}
        fitView
      />
    </div>
  )
  },
)

export default CreateWorkFlow
