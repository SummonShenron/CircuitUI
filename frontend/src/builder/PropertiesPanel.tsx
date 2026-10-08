import { useState } from 'react'
import { defaultScreenSize } from '../componentCatalog'
import type { ActionStep, CircuitComponent, Screen, WorkflowSummary } from '../types'
import { findEventName } from './runtime'
import { activeEffects, baseEffects, hoverEffects } from '../effectPresets'

const STATIC_OPTION = '__static__'
const COMPONENT_REF_PATTERN = /^\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}$/

// Components with a live value another component can bind to (typed text or on-screen text).
const bindableTypes = new Set(['text_input', 'label'])

function FormulaCheatSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="builder-formula-modal-overlay" onClick={onClose}>
      <div className="builder-formula-modal" onClick={(event) => event.stopPropagation()}>
        <div className="builder-formula-modal-header">
          <h3>Formula cheat sheet</h3>
          <button type="button" className="builder-properties-action-remove" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="builder-properties-hint">
          Used in "Visible when" and "Set variable" fields. Not <code>eval</code> — a small, safe language with this grammar:
        </p>
        <pre className="builder-formula-code">{`true, false, null, 42, 3.14        literals
"some text", 'also fine'           string literals
exampleUsed, count, selectedRow    bare words look up a variable
{{component_id}}                   a component's current live value
{{item}} / {{item.field}}          current row, inside a List's template only

==  !=  <  <=  >  >=               comparison
&&  ||  !                          and / or / not
+   -   *   /                      arithmetic
( )                                grouping`}</pre>
        <p className="builder-properties-hint">
          A blank formula is always <code>true</code>. A formula that fails to parse also evaluates to <code>true</code> (visible) rather than
          crashing or hiding something unexpectedly.
        </p>
        <p className="builder-properties-hint builder-properties-hint-warn">
          Gotcha: a bare word is a <em>variable lookup</em>, not a string. <code>name == "bob"</code> compares against the text "bob" —{' '}
          <code>name == bob</code> compares against a variable named "bob" instead (probably undefined).
        </p>
        <p className="builder-properties-hint">
          Example: a button with actions <code>send_chat_message(chat1, "…")</code> then <code>set_variable(exampleUsed, true)</code>, and
          "Visible when" set to <code>exampleUsed != true</code>, asks a canned question and then hides itself.
        </p>
      </div>
    </div>
  )
}

function parseMapping(value: string | undefined): { componentId: string | null; staticValue: string } {
  const match = value?.match(COMPONENT_REF_PATTERN)
  return match ? { componentId: match[1], staticValue: '' } : { componentId: null, staticValue: value ?? '' }
}

// Shared by the legacy single "Bound workflow" section and a `run_workflow`
// action step - both need the same "static value or {{component}}" mapping UI.
function WorkflowInputMapping({
  workflow,
  mapping,
  sourceOptions,
  onChange,
}: {
  workflow: WorkflowSummary | undefined
  mapping: Record<string, string>
  sourceOptions: CircuitComponent[]
  onChange: (key: string, value: string) => void
}) {
  if (!workflow || (workflow.inputs?.length ?? 0) === 0) return null
  return (
    <div className="builder-properties-mapping">
      <span className="builder-properties-mapping-title">Workflow inputs</span>
      {workflow.inputs!.map((input) => {
        const { componentId, staticValue } = parseMapping(mapping[input.key])
        return (
          <label key={input.key}>
            {input.label || input.key}{input.required ? ' *' : ''}
            <select
              value={componentId ?? STATIC_OPTION}
              onChange={(event) => {
                const value = event.target.value
                onChange(input.key, value === STATIC_OPTION ? '' : `{{${value}}}`)
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
                onChange={(event) => onChange(input.key, event.target.value)}
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
  )
}

export default function PropertiesPanel({
  component,
  screen,
  screens,
  workflows,
  workflowsLoading,
  onRefreshWorkflows,
  screenComponents,
  onChange,
  onScreenChange,
  onDelete,
}: {
  component: CircuitComponent | null
  screen: Screen
  screens: Screen[]
  workflows: WorkflowSummary[]
  workflowsLoading: boolean
  onRefreshWorkflows: () => void
  screenComponents: CircuitComponent[]
  onChange: (patch: Partial<CircuitComponent>) => void
  onScreenChange: (patch: Partial<Screen>) => void
  onDelete: () => void
}) {
  const [showFormulaHelp, setShowFormulaHelp] = useState(false)

  if (!component) {
    const screenSize = screen.size ?? defaultScreenSize
    const setScreenSize = (patch: Partial<{ width: number; height: number }>) =>
      onScreenChange({ size: { ...screenSize, ...patch } })
    return (
      <aside className="builder-properties">
        <div className="builder-properties-scroll">
          <h3>Screen</h3>
          <p className="builder-properties-empty">Select a component to edit its properties, or set the screen's size below.</p>
          <label>
            Screen name
            <input value={screen.name} onChange={(event) => onScreenChange({ name: event.target.value })} />
          </label>
          <div className="builder-properties-mapping">
            <span className="builder-properties-mapping-title">Screen size</span>
            <label>
              Width
              <input
                type="number"
                min={320}
                value={screenSize.width}
                onChange={(event) => setScreenSize({ width: Number(event.target.value) || screenSize.width })}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                min={320}
                value={screenSize.height}
                onChange={(event) => setScreenSize({ height: Number(event.target.value) || screenSize.height })}
              />
            </label>
          </div>
        </div>
      </aside>
    )
  }

  const setProp = (key: string, value: unknown) => onChange({ props: { ...component.props, [key]: value } })
  const setStyle = (patch: { base?: string; hover?: string; active?: string }) =>
    onChange({ style: { base: 'flat', hover: 'none', active: 'none', ...component.style, ...patch } })
  const boundWorkflow = workflows.find((workflow) => workflow.id === component.binding?.workflow_id)
  const sourceOptions = screenComponents.filter((item) => item.id !== component.id && bindableTypes.has(item.type))
  const chatOptions = screenComponents.filter((item) => item.type === 'chat')
  const hasTrigger = Boolean(component.binding) || (component.actions?.length ?? 0) > 0

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

  const actions = component.actions ?? []

  const replaceAction = (index: number, next: ActionStep) => {
    onChange({ actions: actions.map((action, i) => (i === index ? next : action)) })
  }

  const removeAction = (index: number) => {
    onChange({ actions: actions.filter((_, i) => i !== index) })
  }

  const addAction = () => {
    const patch: Partial<CircuitComponent> = { actions: [...actions, { type: 'set_variable', name: '', value: '' }] }
    if (!component.trigger) patch.trigger = component.binding?.trigger ?? (component.type === 'button' ? 'on_click' : 'on_load')
    onChange(patch)
  }

  const changeActionType = (index: number, type: ActionStep['type']) => {
    let next: ActionStep
    switch (type) {
      case 'run_workflow':
        next = { type: 'run_workflow', workflow_id: '', workflow_name: '', input_mapping: {}, output_key: null }
        break
      case 'navigate':
        next = { type: 'navigate', screen_id: screens[0]?.id ?? '' }
        break
      case 'send_chat_message':
        next = { type: 'send_chat_message', target_component_id: chatOptions[0]?.id ?? '', message: '' }
        break
      case 'append_to_list':
        next = { type: 'append_to_list', variable: '', fields: [{ key: '', value: '' }] }
        break
      default:
        next = { type: 'set_variable', name: '', value: '' }
    }
    replaceAction(index, next)
  }

  return (
    <aside className="builder-properties">
    <div className="builder-properties-scroll">
      <h3>{component.name}</h3>

      <label>
        Name
        <input value={component.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>

      <label>
        Visible when (blank = always)
        <input
          value={component.visibility_expression ?? ''}
          onChange={(event) => onChange({ visibility_expression: event.target.value })}
          placeholder='e.g. exampleUsed != true'
        />
      </label>

      {(component.type === 'label' || component.type === 'button' || component.type === 'message') && (
        <label>
          Text
          <input value={String(component.props.text ?? '')} onChange={(event) => setProp('text', event.target.value)} />
        </label>
      )}

      {component.type === 'message' && (
        <label>
          Role
          <input
            value={String(component.props.role ?? 'assistant')}
            onChange={(event) => setProp('role', event.target.value)}
            placeholder='assistant, user, or {{item.role}}'
          />
        </label>
      )}

      {component.type === 'label' && (
        <label>
          Font size
          <input
            type="number"
            min={8}
            max={96}
            value={Number(component.props.fontSize ?? 16)}
            onChange={(event) => setProp('fontSize', Number(event.target.value) || 16)}
          />
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

      {component.type === 'container' && (
        <>
          <label className="builder-properties-checkbox-row">
            <input
              type="checkbox"
              checked={component.props.showLabel !== false}
              onChange={(event) => setProp('showLabel', event.target.checked)}
            />
            Show label
          </label>
          <label className="builder-properties-checkbox-row">
            <input
              type="checkbox"
              checked={component.props.fillScreen === true}
              onChange={(event) => setProp('fillScreen', event.target.checked)}
            />
            Fill screen
          </label>
        </>
      )}

      {component.type === 'list' && (
        <div className="builder-properties-mapping">
          <span className="builder-properties-mapping-title">List data</span>
          <p className="builder-properties-hint">
            Drop components onto this List to build one row's template. In Preview it repeats once per item, with{' '}
            <code>{'{{item}}'}</code> / <code>{'{{item.field}}'}</code> resolving to the current row inside the template's own fields.
          </p>
          <label>
            Data source
            <select value={String(component.props.source ?? 'workflow')} onChange={(event) => setProp('source', event.target.value)}>
              <option value="workflow">Bound workflow's output (below)</option>
              <option value="variable">A variable</option>
            </select>
          </label>
          {component.props.source === 'variable' && (
            <label>
              Variable name
              <input
                value={String(component.props.variable_name ?? '')}
                onChange={(event) => setProp('variable_name', event.target.value)}
                placeholder="e.g. messages"
              />
            </label>
          )}
          <label>
            Row height (px)
            <input
              type="number"
              min={16}
              value={Number(component.props.row_height ?? 72)}
              onChange={(event) => setProp('row_height', Number(event.target.value) || 72)}
            />
          </label>
        </div>
      )}

      <div className="builder-properties-mapping">
        <span className="builder-properties-mapping-title">Style</span>
        <label>
          Base
          <select value={component.style?.base ?? 'flat'} onChange={(event) => setStyle({ base: event.target.value })}>
            {baseEffects.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
        </label>
        <label>
          Hover effect
          <select value={component.style?.hover ?? 'none'} onChange={(event) => setStyle({ hover: event.target.value })}>
            {hoverEffects.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
        </label>
        <label>
          Active effect
          <select value={component.style?.active ?? 'none'} onChange={(event) => setStyle({ active: event.target.value })}>
            {activeEffects.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
        </label>
      </div>

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
          className="btn-3d-quiet builder-properties-refresh"
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
          <WorkflowInputMapping workflow={boundWorkflow} mapping={component.binding.input_mapping} sourceOptions={sourceOptions} onChange={setMappingValue} />
          {boundWorkflow && (boundWorkflow.inputs?.length ?? 0) === 0 && (
            <p className="builder-properties-hint">This workflow has no declared inputs, so there's nothing to map here.</p>
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

      {component.type !== 'chat' && hasTrigger && (
        <label>
          Trigger
          <select
            value={component.trigger ?? component.binding?.trigger ?? 'on_click'}
            onChange={(event) => onChange({ trigger: event.target.value as 'on_click' | 'on_load' })}
          >
            <option value="on_click">On click</option>
            <option value="on_load">On screen load</option>
          </select>
        </label>
      )}

      <div className="builder-properties-mapping">
        <span className="builder-properties-mapping-title">Actions</span>
        {actions.map((action, index) => (
          <div key={index} className="builder-properties-action">
            <div className="builder-properties-action-header">
              <select value={action.type} onChange={(event) => changeActionType(index, event.target.value as ActionStep['type'])}>
                <option value="run_workflow">Run workflow</option>
                <option value="set_variable">Set variable</option>
                <option value="navigate">Navigate to screen</option>
                <option value="send_chat_message">Send message to chat</option>
                <option value="append_to_list">Append to list</option>
              </select>
              <button type="button" className="builder-properties-action-remove" onClick={() => removeAction(index)} title="Remove action">✕</button>
            </div>

            {action.type === 'run_workflow' && (
              <>
                <select
                  value={action.workflow_id}
                  onChange={(event) => {
                    const workflow = workflows.find((item) => item.id === event.target.value)
                    replaceAction(index, { ...action, workflow_id: event.target.value, workflow_name: workflow?.name ?? '' })
                  }}
                >
                  <option value="">Choose a workflow…</option>
                  {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
                <WorkflowInputMapping
                  workflow={workflows.find((item) => item.id === action.workflow_id)}
                  mapping={action.input_mapping}
                  sourceOptions={sourceOptions}
                  onChange={(key, value) => replaceAction(index, { ...action, input_mapping: { ...action.input_mapping, [key]: value } })}
                />
                <input
                  placeholder="Output key to display (optional)"
                  value={action.output_key ?? ''}
                  onChange={(event) => replaceAction(index, { ...action, output_key: event.target.value })}
                />
              </>
            )}

            {action.type === 'set_variable' && (
              <>
                <input
                  placeholder="Variable name (e.g. exampleUsed)"
                  value={action.name}
                  onChange={(event) => replaceAction(index, { ...action, name: event.target.value })}
                />
                <input
                  placeholder='Value or formula (e.g. true, {{count}} + 1)'
                  value={action.value}
                  onChange={(event) => replaceAction(index, { ...action, value: event.target.value })}
                />
              </>
            )}

            {action.type === 'navigate' && (
              <select value={action.screen_id} onChange={(event) => replaceAction(index, { ...action, screen_id: event.target.value })}>
                <option value="">Choose a screen…</option>
                {screens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}

            {action.type === 'send_chat_message' && (
              <>
                <select
                  value={action.target_component_id}
                  onChange={(event) => replaceAction(index, { ...action, target_component_id: event.target.value })}
                >
                  <option value="">Choose a chat…</option>
                  {chatOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input
                  placeholder="Message to send"
                  value={action.message}
                  onChange={(event) => replaceAction(index, { ...action, message: event.target.value })}
                />
                {chatOptions.length === 0 && (
                  <p className="builder-properties-hint">Add a chat component to this screen to send messages into it.</p>
                )}
              </>
            )}

            {action.type === 'append_to_list' && (
              <>
                <input
                  placeholder="Variable name (e.g. messages)"
                  value={action.variable}
                  onChange={(event) => replaceAction(index, { ...action, variable: event.target.value })}
                />
                {action.fields.map((field, fieldIndex) => (
                  <div key={fieldIndex} className="builder-properties-field-row">
                    <input
                      placeholder="Field (e.g. role)"
                      value={field.key}
                      onChange={(event) => {
                        const fields = action.fields.map((f, i) => (i === fieldIndex ? { ...f, key: event.target.value } : f))
                        replaceAction(index, { ...action, fields })
                      }}
                    />
                    <input
                      placeholder='Value or formula (e.g. "user", {{input1}})'
                      value={field.value}
                      onChange={(event) => {
                        const fields = action.fields.map((f, i) => (i === fieldIndex ? { ...f, value: event.target.value } : f))
                        replaceAction(index, { ...action, fields })
                      }}
                    />
                    <button
                      type="button"
                      className="builder-properties-action-remove"
                      onClick={() => replaceAction(index, { ...action, fields: action.fields.filter((_, i) => i !== fieldIndex) })}
                      title="Remove field"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-3d-quiet"
                  onClick={() => replaceAction(index, { ...action, fields: [...action.fields, { key: '', value: '' }] })}
                >
                  + Add field
                </button>
              </>
            )}
          </div>
        ))}
        <div className="builder-properties-action-footer">
          <button type="button" className="btn-3d-quiet" onClick={addAction}>+ Add action</button>
          <button type="button" className="btn-3d-quiet" onClick={() => setShowFormulaHelp(true)}>View formulas</button>
        </div>
      </div>

      {showFormulaHelp && <FormulaCheatSheet onClose={() => setShowFormulaHelp(false)} />}

      <button className="btn-3d-quiet builder-properties-delete" onClick={onDelete}>Delete component</button>
    </div>
    </aside>
  )
}
