import type { DragEvent, ComponentType } from 'react'
import { Group, Image, MessageCircle, MessagesSquare, MousePointerClick, Rows3, Table2, TextCursorInput, Type } from 'lucide-react'
import { paletteEntries } from '../componentCatalog'
import type { ComponentKind } from '../types'

const icons: Record<ComponentKind, ComponentType<{ size?: number }>> = {
  label: Type,
  table: Table2,
  image: Image,
  text_input: TextCursorInput,
  button: MousePointerClick,
  chat: MessagesSquare,
  container: Group,
  list: Rows3,
  message: MessageCircle,
}

const categories = [...new Set(paletteEntries.map((entry) => entry.category))]

export default function ComponentPalette() {
  const handleDragStart = (event: DragEvent, kind: ComponentKind) => {
    event.dataTransfer.setData('application/circuitui-new-component', kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="builder-palette">
      <div className="builder-palette-scroll">
        {categories.map((category) => (
          <div key={category} className="builder-palette-group">
            <h3>{category}</h3>
            {paletteEntries
              .filter((entry) => entry.category === category)
              .map((entry) => {
                const Icon = icons[entry.kind]
                return (
                  <div
                    key={entry.kind}
                    className="builder-palette-item"
                    draggable
                    onDragStart={(event) => handleDragStart(event, entry.kind)}
                  >
                    <span className="builder-palette-icon"><Icon size={16} /></span>
                    <span className="builder-palette-item-text">
                      <strong>{entry.title}</strong>
                      <span>{entry.description}</span>
                    </span>
                    <span aria-hidden="true" className="builder-palette-chevron">›</span>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </aside>
  )
}
