import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  Background,
  Controls,
  useReactFlow,
  Panel,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnReconnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AddNodeEdge from './AddNodeEdge'
import AddNodeAfterLast from './AddNodeAfterLast'
import CustomNode from './CustomNode'

const edgeTypes = {
  addNode: AddNodeEdge,
}

const nodeTypes = {
  custom: CustomNode,
}

const defaultNodes: Node[] = []

const defaultEdges: Edge[] = []

type Props = {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onDefinitionChange?: (definition: { nodes: Node[]; edges: Edge[] }) => void
  onNodeSelect?: (nodeId: string | undefined) => void
  onAddNodeOnEdge?: (edgeId: string, nodeType: string, sourceId: string, targetId: string) => void
  onAddNodeAfterLast?: (nodeType: string) => void
  onDeleteNode?: (nodeId: string) => void
  containerStyle?: CSSProperties
  readOnly?: boolean
  syncFromProps?: boolean
}

// Wrapper component to use hooks inside ReactFlow - converts flow coords to screen coords
function AddNodeButton({ nodeId, onAddNode, onPopupOpen, onPopupClose }: { 
  nodeId: string
  onAddNode: (nodeType: string) => void
  onPopupOpen: () => void
  onPopupClose: () => void 
}) {
  const { getNode, flowToScreenPosition } = useReactFlow()
  const node = getNode(nodeId)
  
  if (!node) return null
  
  // Calculate position below the node in flow coordinates
  const flowX = node.position.x + (node.measured?.width ? node.measured.width / 2 : 75)
  const flowY = node.position.y + (node.measured?.height ? node.measured.height + 10 : 50)
  
  // Convert to screen coordinates
  const screenPos = flowToScreenPosition({ x: flowX, y: flowY })
  
  return (
    <AddNodeAfterLast
      screenPosition={screenPos}
      onAddNode={onAddNode}
      onPopupOpen={onPopupOpen}
      onPopupClose={onPopupClose}
    />
  )
}

export type CreateWorkFlowHandle = {
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  addNode: (node: Node) => void
  deleteNode: (nodeId: string) => void
  insertNodeOnEdge: (edgeId: string, node: Node) => void
}

const CreateWorkFlow = forwardRef<CreateWorkFlowHandle, Props>(
  ({ initialNodes, initialEdges, onDefinitionChange, onNodeSelect, onAddNodeOnEdge, onAddNodeAfterLast, onDeleteNode, containerStyle, readOnly, syncFromProps }, ref) => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes ?? defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges)
  const [popupOpen, setPopupOpen] = useState(false)

  // Add custom node type with delete handler to all nodes
  const nodesWithHandlers = useMemo(() => {
    if (readOnly) return nodes
    return nodes.map((node) => ({
      ...node,
      type: 'custom',
      data: {
        ...node.data,
        onDelete: onDeleteNode,
      },
    }))
  }, [nodes, onDeleteNode, readOnly])

  // Add edge data with onAddNode handler for plus icon on edges
  const edgesWithHandlers = useMemo(() => {
    if (readOnly) return edges
    return edges.map((edge) => ({
      ...edge,
      type: 'addNode',
      data: {
        ...edge.data,
        onAddNode: onAddNodeOnEdge,
        onPopupOpen: () => setPopupOpen(true),
        onPopupClose: () => setPopupOpen(false),
      },
    }))
  }, [edges, onAddNodeOnEdge, readOnly])

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
      insertNodeOnEdge: (edgeId: string, node: Node) => {
        setEdges((prev) => {
          const edge = prev.find((e) => e.id === edgeId)
          if (!edge) return prev
          // Remove old edge, add two new edges
          const newEdges = prev.filter((e) => e.id !== edgeId)
          newEdges.push(
            { id: `e-${edge.source}-${node.id}`, source: edge.source, target: node.id },
            { id: `e-${node.id}-${edge.target}`, source: node.id, target: edge.target }
          )
          return newEdges
        })
        setNodes((prev) => [...prev, node])
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

  // Handle edge reconnection (drag edge to new target or disconnect by dropping on empty space)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((edgesSnapshot) => reconnectEdge(oldEdge, newConnection, edgesSnapshot))
    },
    [],
  )

  // Handle edge reconnection end - if dropped on empty space, delete the edge
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      // Edge was dropped on empty space, delete it
      setEdges((edgesSnapshot) => edgesSnapshot.filter((e) => e.id !== edge.id))
    },
    [],
  )

  return (
    <div style={{ width: '100vw', height: '100vh', ...containerStyle }}>
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edgesWithHandlers}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        onReconnect={readOnly ? undefined : onReconnect}
        onReconnectEnd={readOnly ? undefined : onReconnectEnd}
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
        proOptions={{ hideAttribution: true }}
        style={{
          // Custom node styling for dark mode
          ['--xy-node-background-color' as any]: 'var(--color-surface, #fff)',
          ['--xy-node-border-color' as any]: 'var(--color-border, #e5e7eb)',
          ['--xy-node-color' as any]: 'var(--color-text, #111)',
        }}
      >
        <Background color="#d1d5db" gap={20} />
        <Controls showInteractive={false} position="bottom-left" />
        {/* Plus icon after terminal nodes - only show for the last one */}
        {terminalNodes.length > 0 && (
          <AddNodeButton
            key={`add-after-${terminalNodes[terminalNodes.length - 1].id}`}
            nodeId={terminalNodes[terminalNodes.length - 1].id}
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
