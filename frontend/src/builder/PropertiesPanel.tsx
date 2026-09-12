import type { CircuitComponent, WorkflowSummary } from '../types'

export default function PropertiesPanel({
  component,
  workflows,
  onChange,
  onDelete,
}: {
  component: CircuitComponent | null
  workflows: WorkflowSummary[]
  onChange: (patch: Partial<CircuitComponent>) => void
  onDelete: () => void
}) {
  if (!component) {
    return (
      <aside className="builder-properties">
        <p className="builder-properties-empty">Select a component to edit its properties.</p>
      </aside>
    )
  }

  const setProp = (key: string, value: unknown) => onChange({ props: { ...component.props, [key]: value } })

  const setBindingWorkflow = (workflowId: string) => {
    const workflow = workflows.find((item) => item.id === workflowId)
    onChange({
      binding: workflowId
        ? {
            workflow_id: workflowId,
            workflow_name: workflow?.name ?? '',
            trigger: component.type === 'button' ? 'on_click' : 'on_load',
            input_mapping: component.binding?.input_mapping ?? {},
            output_key: component.binding?.output_key ?? null,
          }
        : null,
    })
  }

  return (
    <aside className="builder-properties">
      <h3>{component.name}</h3>

      <label>
        Name
        <input value={component.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>

      {(component.type === 'label' || component.type === 'button') && (
        <label>
          Text
          <input value={String(component.props.text ?? '')} onChange={(event) => setProp('text', event.target.value)} />
        </label>
      )}

      {component.type === 'text_input' && (
        <label>
          Placeholder
          <input
            value={String(component.props.placeholder ?? '')}
            onChange={(event) => setProp('placeholder', event.target.value)}
          />
        </label>
      )}

      {component.type === 'image' && (
        <label>
          Image URL
          <input value={String(component.props.src ?? '')} onChange={(event) => setProp('src', event.target.value)} />
        </label>
      )}

      <hr />

      <label>
        Bound workflow
        <select value={component.binding?.workflow_id ?? ''} onChange={(event) => setBindingWorkflow(event.target.value)}>
          <option value="">None</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
          ))}
        </select>
      </label>

      {component.binding && (
        <>
          <label>
            Trigger
            <select
              value={component.binding.trigger}
              onChange={(event) => onChange({ binding: { ...component.binding!, trigger: event.target.value as 'on_click' | 'on_load' } })}
            >
              <option value="on_click">On click</option>
              <option value="on_load">On screen load</option>
            </select>
          </label>
          <label>
            Output key to display
            <input
              value={component.binding.output_key ?? ''}
              onChange={(event) => onChange({ binding: { ...component.binding!, output_key: event.target.value } })}
              placeholder="e.g. response"
            />
          </label>
        </>
      )}

      <button className="builder-properties-delete" onClick={onDelete}>Delete component</button>
    </aside>
  )
}
