import type { CircuitComponent, ComponentKind, Screen, WorkflowInputSchema, WorkflowSummary } from '../types'
import { componentLiveValue } from './expressions'

// `.` is allowed so `{{item.field}}` matches as one token (see below).
const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

function componentDisplayValue(component: CircuitComponent, runtimeValues: Record<string, unknown>): string {
  const value = componentLiveValue(component, runtimeValues)
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Replaces `{{component_id}}` references with that component's current live
 * value, as plain display text. `{{item}}`/`{{item.field}}` resolve against
 * `item` instead - the current row when this is evaluated inside a List
 * template (see Canvas.tsx). Anything else passes through as a literal.
 */
export function resolveTemplate(template: string, screen: Screen, runtimeValues: Record<string, unknown>, item?: unknown): string {
  return template.replace(TEMPLATE_PATTERN, (_match, token: string) => {
    if (token === 'item') return item === undefined || item === null ? '' : String(item)
    if (token.startsWith('item.')) {
      const field = token.slice('item.'.length)
      const value = item && typeof item === 'object' ? (item as Record<string, unknown>)[field] : undefined
      return value === undefined || value === null ? '' : String(value)
    }
    const component = screen.components.find((candidate) => candidate.id === token)
    return component ? componentDisplayValue(component, runtimeValues) : ''
  })
}

function coerce(value: string, schema: WorkflowInputSchema | undefined): unknown {
  if (schema?.type === 'number') return Number(value)
  if (schema?.type === 'boolean') return value === 'true'
  return value
}

export function buildWorkflowInputs(
  mapping: Record<string, string>,
  inputSchemas: WorkflowInputSchema[],
  screen: Screen,
  runtimeValues: Record<string, unknown>,
): Record<string, unknown> {
  const schemaByKey = new Map(inputSchemas.map((schema) => [schema.key, schema]))
  const inputs: Record<string, unknown> = {}
  for (const [key, template] of Object.entries(mapping)) {
    inputs[key] = coerce(resolveTemplate(template, screen, runtimeValues), schemaByKey.get(key))
  }
  return inputs
}

/** The event name of a workflow's "External event" Schedule node, if it has one — the console/chat endpoint needs this to find the right trigger. */
export function findEventName(workflow: WorkflowSummary | undefined): string | null {
  const node = workflow?.graph?.nodes.find(
    (item) => item.type === 'schedule' && item.config?.trigger_mode === 'event' && typeof item.config?.event_name === 'string',
  )
  return (node?.config?.event_name as string | undefined) ?? null
}

/** workflow_builder's /console endpoint returns either the HTTP Response node's own body (conventionally `{ message }`) or, if no response node is configured, the full run result — mirrors workflow_builder's own frontend's extraction. */
export function extractConsoleReply(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) return String((body as { message?: unknown }).message)
  return JSON.stringify(body, null, 2)
}

/** How a workflow output value overrides a component's own props when it lands on that component. */
export function outputOverrideProps(kind: ComponentKind, value: unknown): Record<string, unknown> {
  switch (kind) {
    case 'label':
      return { text: typeof value === 'string' ? value : JSON.stringify(value) }
    case 'image':
      return { src: String(value ?? '') }
    case 'table':
      return { rows: Array.isArray(value) ? value : [] }
    case 'text_input':
      return { value: typeof value === 'string' ? value : JSON.stringify(value) }
    case 'chat':
      return { draft: typeof value === 'string' ? value : '' }
    default:
      return {}
  }
}
