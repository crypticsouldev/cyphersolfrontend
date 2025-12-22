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
  ViewportPortal,
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
  onAddNodeAfterLast?: (nodeType: string, fromNodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  containerStyle?: CSSProperties
  readOnly?: boolean
  syncFromProps?: boolean
}

// Wrapper component to use hooks inside ReactFlow
function AddNodeButton({ nodeId, onAddNode, onPopupOpen, onPopupClose }: { 
  nodeId: string
  onAddNode: (nodeType: string) => void
  onPopupOpen: () => void
  onPopupClose: () => void 
}) {
  const { getNode } = useReactFlow()
  const node = getNode(nodeId)
  
  if (!node) return null

  const width = node.measured?.width ?? (node as any).width ?? 150
  const height = node.measured?.height ?? (node as any).height ?? 50
  
  return (
    <AddNodeAfterLast
      position={{ 
        x: node.position.x + width / 2,
        y: node.position.y + height - 2
      }}
      onAddNode={onAddNode}
      onPopupOpen={onPopupOpen}
      onPopupClose={onPopupClose}
    />
  )
}

export type CreateWorkFlowHandle = {
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  addNode: (node: Node) => void
  addEdge: (edge: Edge) => void
  deleteNode: (nodeId: string) => void
  insertNodeOnEdge: (edgeId: string, node: Node) => void
  shiftNodesDown: (startNodeId: string, amount: number) => void
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
    const isTriggerNode = (n: Node) => {
      const kind = String((n.data as any)?.type ?? '')
      return kind.endsWith('_trigger')
    }

    const trigger = nodes.find(isTriggerNode)
    const reachable = new Set<string>()

    if (trigger) {
      const queue: string[] = [trigger.id]
      reachable.add(trigger.id)
      while (queue.length) {
        const current = queue.shift()!
        for (const e of edges) {
          if (e.source !== current) continue
          if (!reachable.has(e.target)) {
            reachable.add(e.target)
            queue.push(e.target)
          }
        }
      }
    } else {
      for (const n of nodes) reachable.add(n.id)
    }

    const nodesWithOutgoing = new Set(
      edges.filter((e) => reachable.has(e.source) && reachable.has(e.target)).map((e) => e.source),
    )

    const terms = nodes.filter((n) => reachable.has(n.id) && !nodesWithOutgoing.has(n.id))

    // Stable ordering: pick deepest terminal as the last
    return terms.sort((a, b) => {
      const ay = (a.position as any)?.y ?? 0
      const by = (b.position as any)?.y ?? 0
      if (ay !== by) return ay - by
      const ax = (a.position as any)?.x ?? 0
      const bx = (b.position as any)?.x ?? 0
      return ax - bx
    })
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
      addEdge: (edge: Edge) => {
        setEdges((prev) => {
          const exists = prev.some((e) => e.source === edge.source && e.target === edge.target)
          if (exists) return prev
          return [...prev, edge]
        })
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
      shiftNodesDown: (startNodeId: string, amount: number) => {
        setNodes((prev) => {
          const startNode = prev.find((n) => n.id === startNodeId)
          if (!startNode) return prev
          const startY = startNode.position.y
          // Shift all nodes at or below startY down by amount
          return prev.map((n) => 
            n.position.y >= startY 
              ? { ...n, position: { ...n.position, y: n.position.y + amount } }
              : n
          )
        })
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
    (params) =>
      setEdges((edgesSnapshot) => {
        if (!params.source || !params.target) return edgesSnapshot
        const existing = edgesSnapshot.find(
          (e) =>
            e.source === params.source && e.target === params.target,
        )
        if (existing) {
          return edgesSnapshot.filter((e) => e.id !== existing.id)
        }
        return addEdge(params, edgesSnapshot)
      }),
    [],
  )

  // Track if edge reconnection was successful
  const edgeReconnectSuccessful = useRef(true)

  // Called when user starts dragging an edge handle
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false
  }, [])

  // Handle edge reconnection (drag edge to new target)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((edgesSnapshot) => {
        const source = newConnection.source ?? oldEdge.source
        const target = newConnection.target ?? oldEdge.target
        const existing = edgesSnapshot.find(
          (e) =>
            e.id !== oldEdge.id &&
            e.source === source && e.target === target,
        )

        if (existing) {
          edgeReconnectSuccessful.current = true
          return edgesSnapshot.filter((e) => e.id !== oldEdge.id && e.id !== existing.id)
        }

        edgeReconnectSuccessful.current = true
        return reconnectEdge(oldEdge, newConnection, edgesSnapshot)
      })
    },
    [],
  )

  // Handle edge reconnection end - if dropped on empty space (not reconnected), delete the edge
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      // Only delete if reconnection was not successful (dropped on empty space)
      if (!edgeReconnectSuccessful.current) {
        setEdges((edgesSnapshot) => edgesSnapshot.filter((e) => e.id !== edge.id))
      }
      edgeReconnectSuccessful.current = true
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
        onReconnectStart={readOnly ? undefined : onReconnectStart}
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
          <ViewportPortal>
            <AddNodeButton
              key={`add-after-${terminalNodes[terminalNodes.length - 1].id}`}
              nodeId={terminalNodes[terminalNodes.length - 1].id}
              onAddNode={(nodeType) => {
                setPopupOpen(false)
                onAddNodeAfterLast?.(nodeType, terminalNodes[terminalNodes.length - 1].id)
              }}
              onPopupOpen={() => setPopupOpen(true)}
              onPopupClose={() => setPopupOpen(false)}
            />
          </ViewportPortal>
        )}
      </ReactFlow>
    </div>
  )
  },
)

export default CreateWorkFlow
