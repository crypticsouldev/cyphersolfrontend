import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import AddNodeEdge from './AddNodeEdge'

const defaultNodes: Node[] = []

const defaultEdges: Edge[] = []

type Props = {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onDefinitionChange?: (definition: { nodes: Node[]; edges: Edge[] }) => void
  onNodeSelect?: (nodeId: string | undefined) => void
  onAddNodeOnEdge?: (edgeId: string, nodeType: string) => void
  containerStyle?: CSSProperties
  readOnly?: boolean
  syncFromProps?: boolean
}

const edgeTypes = {
  addNode: AddNodeEdge,
}

export type CreateWorkFlowHandle = {
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  addNode: (node: Node) => void
  deleteNode: (nodeId: string) => void
}

const CreateWorkFlow = forwardRef<CreateWorkFlowHandle, Props>(
  ({ initialNodes, initialEdges, onDefinitionChange, onNodeSelect, onAddNodeOnEdge, containerStyle, readOnly, syncFromProps }, ref) => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes ?? defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges)

  // Add edge data with onAddNode handler
  const edgesWithHandlers = useMemo(() => {
    if (readOnly) return edges
    return edges.map((edge) => ({
      ...edge,
      type: 'addNode',
      data: {
        ...edge.data,
        onAddNode: onAddNodeOnEdge,
      },
    }))
  }, [edges, onAddNodeOnEdge, readOnly])

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
        edges={edgesWithHandlers}
        edgeTypes={edgeTypes}
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
