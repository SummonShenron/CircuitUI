import type { CircuitComponent, WorkflowSummary } from '../types'
import { findEventName } from './runtime'

const STATIC_OPTION = '__static__'
const COMPONENT_REF_PATTERN = /^\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}$/

// Components with a live value another component can bind to (typed text or on-screen text).
const bindableTypes = new Set(['text_input', 'label'])

function parseMapping(value: string | undefined): { componentId: string | null; staticValue: string } {
  const match = value?.match(COMPONENT_REF_PATTERN)
  return match ? { componentId: match[1], staticValue: '' } : { componentId: null, staticValue: value ?? '' }
}

export default function PropertiesPanel({
  component,
  workflows,
  workflowsLoading,
  onRefreshWorkflows,
  screenComponents,
  onChange,
  onDelete,
}: {
  component: CircuitComponent | null
  workflows: WorkflowSummary[]
  workflowsLoading: boolean
  onRefreshWorkflows: () => void
  screenComponents: CircuitComponent[]
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
  const boundWorkflow = workflows.find((workflow) => workflow.id === component.binding?.workflow_id)
  const sourceOptions = screenComponents.filter((item) => item.id !== component.id && bindableTypes.has(item.type))

  const setBindingWorkflow = (workflowId: string) => {
    const workflow = workflows.find((item) => item.id === workflowId)
    onChange({
      binding: workflowId
        ? {
            workflow_id: workflowId,
            workflow_name: workflow?.name ?? '',
            trigger: component.type === 'button' ? 'on_click' : 'on_load',
            input_mapping: {},
            output_key: null,
          }
        : null,
    })
  }

  const setMappingValue = (inputKey: string, value: string) => {
    if (!component.binding) return
    onChange({ binding: { ...component.binding, input_mapping: { ...component.binding.input_mapping, [inputKey]: value } } })
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

      {component.type === 'chat' && (
        <label>
          Input placeholder
          <input
            value={String(component.props.placeholder ?? '')}
            onChange={(event) => setProp('placeholder', event.target.value)}
          />
        </label>
      )}

      <hr />

      <div className="builder-properties-workflow-row">
        <label>
          Bound workflow
          <select value={component.binding?.workflow_id ?? ''} onChange={(event) => setBindingWorkflow(event.target.value)}>
            <option value="">None</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="builder-properties-refresh"
          onClick={onRefreshWorkflows}
          disabled={workflowsLoading}
          title="Re-fetch workflows and their inputs from workflow_builder"
        >
          {workflowsLoading ? 'Refreshing…' : '↻ Refresh workflows'}
        </button>
      </div>

      {component.binding && component.type === 'chat' && (
        <>
          {boundWorkflow && findEventName(boundWorkflow) && (
            <p className="builder-properties-hint builder-properties-hint-ok">
              ✓ Chat-ready via event "{findEventName(boundWorkflow)}" — every message sends automatically.
            </p>
          )}
          {boundWorkflow && !findEventName(boundWorkflow) && (
            <p className="builder-properties-hint builder-properties-hint-warn">
              ⚠ This workflow has no "External event" Schedule node. Add one in workflow_builder before this chat will work.
            </p>
          )}
        </>
      )}

      {component.binding && component.type !== 'chat' && (
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

          {boundWorkflow && (boundWorkflow.inputs?.length ?? 0) === 0 && (
            <p className="builder-properties-hint">This workflow has no declared inputs, so there's nothing to map here.</p>
          )}

          {(boundWorkflow?.inputs?.length ?? 0) > 0 && (
            <div className="builder-properties-mapping">
              <span className="builder-properties-mapping-title">Workflow inputs</span>
              {boundWorkflow!.inputs!.map((input) => {
                const { componentId, staticValue } = parseMapping(component.binding!.input_mapping[input.key])
                return (
                  <label key={input.key}>
                    {input.label || input.key}{input.required ? ' *' : ''}
                    <select
                      value={componentId ?? STATIC_OPTION}
                      onChange={(event) => {
                        const value = event.target.value
                        setMappingValue(input.key, value === STATIC_OPTION ? '' : `{{${value}}}`)
                      }}
                    >
                      <option value={STATIC_OPTION}>Static value…</option>
                      {sourceOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                    {componentId === null && (
                      <input
                        value={staticValue}
                        onChange={(event) => setMappingValue(input.key, event.target.value)}
                        placeholder="Enter a value"
                      />
                    )}
                  </label>
                )
              })}
              {sourceOptions.length === 0 && (
                <p className="builder-properties-hint">Add a text input or label to this screen to bind it as a source.</p>
              )}
            </div>
          )}

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
