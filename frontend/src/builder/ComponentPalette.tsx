import type { DragEvent } from 'react'
import { paletteEntries } from '../componentCatalog'
import type { ComponentKind } from '../types'

const categories = [...new Set(paletteEntries.map((entry) => entry.category))]

export default function ComponentPalette() {
  const handleDragStart = (event: DragEvent, kind: ComponentKind) => {
    event.dataTransfer.setData('application/circuitui-new-component', kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="builder-palette">
      {categories.map((category) => (
        <div key={category} className="builder-palette-group">
          <h3>{category}</h3>
          {paletteEntries
            .filter((entry) => entry.category === category)
            .map((entry) => (
              <div
                key={entry.kind}
                className="builder-palette-item"
                draggable
                onDragStart={(event) => handleDragStart(event, entry.kind)}
              >
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
              </div>
            ))}
        </div>
      ))}
    </aside>
  )
}
