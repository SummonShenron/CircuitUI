export type ComponentKind = 'label' | 'button' | 'text_input' | 'image' | 'table' | 'container' | 'chat' | 'list' | 'message'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type ComponentBinding = {
  workflow_id: string
  workflow_name: string
  trigger: 'on_click' | 'on_load'
  input_mapping: Record<string, string>
  output_key?: string | null
}

export type ComponentStyle = {
  base?: string
  hover?: string
  active?: string
}

// One click/load can now do several things in order, not just run a single
// workflow - `binding` above still works as-is (and is what chat's own
// event-triggered reply uses), `actions` is the newer, more general list.
export type ActionStep =
  | { type: 'run_workflow'; workflow_id: string; workflow_name: string; input_mapping: Record<string, string>; output_key?: string | null }
  | { type: 'set_variable'; name: string; value: string }
  | { type: 'navigate'; screen_id: string }
  | { type: 'send_chat_message'; target_component_id: string; message: string }
  // Pushes one structured entry onto a variable (creating it as a list if it
  // isn't one yet) - each field's value is its own formula, evaluated at run
  // time. This is how a custom-built chat feed grows: e.g. variable
  // "messages", fields [{key:"role",value:'"user"'}, {key:"content",value:"{{input1}}"}].
  | { type: 'append_to_list'; variable: string; fields: { key: string; value: string }[] }

export type CircuitComponent = {
  id: string
  type: ComponentKind
  name: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  props: Record<string, unknown>
  binding?: ComponentBinding | null
  style?: ComponentStyle | null
  parent_id?: string | null
  trigger?: 'on_click' | 'on_load'
  actions?: ActionStep[]
  // A formula (see builder/expressions.ts); blank/absent means always visible.
  visibility_expression?: string | null
}

export type Screen = {
  id: string
  name: string
  components: CircuitComponent[]
  size: { width: number; height: number }
}

export type CircuitApp = {
  id: string
  name: string
  description: string
  screens: Screen[]
  updated_at?: string
}

export type CircuitAppSummary = {
  id: string
  name: string
  description: string
  screen_count: number
  updated_at: string
}

export type WorkflowInputSchema = { key: string; label: string; type: string; required: boolean }

export type WorkflowGraphNode = { id: string; type: string; config?: Record<string, unknown> }

export type WorkflowSummary = {
  id: string
  name: string
  description?: string
  inputs?: WorkflowInputSchema[]
  graph?: { nodes: WorkflowGraphNode[] }
}
