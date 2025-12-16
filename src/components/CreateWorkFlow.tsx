import { useCallback, useEffect, useRef, useState } from 'react'
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

const defaultNodes: Node[] = [
  { id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Node 1' } },
  { id: 'n2', position: { x: 0, y: 100 }, data: { label: 'Node 2' } },
]

const defaultEdges: Edge[] = [{ id: 'n1-n2', source: 'n1', target: 'n2' }]

type Props = {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onDefinitionChange?: (definition: { nodes: Node[]; edges: Edge[] }) => void
}

export default function CreateWorkFlow({ initialNodes, initialEdges, onDefinitionChange }: Props) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes ?? defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges)

  const didHydrateRef = useRef(false)

  useEffect(() => {
    if (didHydrateRef.current) return
    if (!initialNodes && !initialEdges) return

    setNodes(initialNodes ?? defaultNodes)
    setEdges(initialEdges ?? defaultEdges)
    didHydrateRef.current = true
  }, [initialNodes, initialEdges])

  useEffect(() => {
    onDefinitionChange?.({ nodes, edges })
  }, [nodes, edges, onDefinitionChange])

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
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      />
    </div>
  )
}
