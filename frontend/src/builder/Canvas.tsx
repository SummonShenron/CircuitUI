import { useRef, type DragEvent } from 'react'
import type { CircuitComponent, Screen, ComponentKind } from '../types'
import { defaultSize } from '../componentCatalog'

function ComponentPreview({ component }: { component: CircuitComponent }) {
  switch (component.type) {
    case 'label':
      return <span>{String(component.props.text ?? '')}</span>
    case 'button':
      return <button type="button">{String(component.props.text ?? 'Button')}</button>
    case 'text_input':
      return <input readOnly placeholder={String(component.props.placeholder ?? '')} />
    case 'image':
      return component.props.src ? (
        <img src={String(component.props.src)} alt={String(component.props.alt ?? '')} />
      ) : (
        <div className="canvas-placeholder">Image</div>
      )
    case 'table':
      return <div className="canvas-placeholder">Table (bind a workflow to populate rows)</div>
    case 'container':
      return <div className="canvas-placeholder">Container</div>
  }
}

export default function Canvas({
  screen,
  selectedId,
  onSelect,
  onAddComponent,
  onMoveComponent,
}: {
  screen: Screen
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddComponent: (kind: ComponentKind, position: { x: number; y: number }) => void
  onMoveComponent: (id: string, position: { x: number; y: number }) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const canvasRect = canvasRef.current!.getBoundingClientRect()
    const newKind = event.dataTransfer.getData('application/circuitui-new-component') as ComponentKind | ''
    const movedId = event.dataTransfer.getData('application/circuitui-move-component')

    if (newKind) {
      const size = defaultSize[newKind]
      onAddComponent(newKind, {
        x: event.clientX - canvasRect.left - size.width / 2,
        y: event.clientY - canvasRect.top - size.height / 2,
      })
    } else if (movedId) {
      onMoveComponent(movedId, {
        x: event.clientX - canvasRect.left - dragOffset.current.x,
        y: event.clientY - canvasRect.top - dragOffset.current.y,
      })
    }
  }

  return (
    <div
      ref={canvasRef}
      className="builder-canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onClick={() => onSelect(null)}
    >
      {screen.components.map((component) => (
        <div
          key={component.id}
          className={`canvas-component ${selectedId === component.id ? 'canvas-component-selected' : ''}`}
          style={{
            left: component.position.x,
            top: component.position.y,
            width: component.size.width,
            height: component.size.height,
          }}
          draggable
          onDragStart={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
            event.dataTransfer.setData('application/circuitui-move-component', component.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(component.id)
          }}
        >
          <ComponentPreview component={component} />
          {component.binding && <span className="canvas-binding-badge">⚡ {component.binding.workflow_name || 'bound'}</span>}
        </div>
      ))}
    </div>
  )
}
