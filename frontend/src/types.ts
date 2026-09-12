export type ComponentKind = 'label' | 'button' | 'text_input' | 'image' | 'table' | 'container' | 'chat'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type ComponentBinding = {
  workflow_id: string
  workflow_name: string
  trigger: 'on_click' | 'on_load'
  input_mapping: Record<string, string>
  output_key?: string | null
}

export type CircuitComponent = {
  id: string
  type: ComponentKind
  name: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  props: Record<string, unknown>
  binding?: ComponentBinding | null
}

export type Screen = {
  id: string
  name: string
  components: CircuitComponent[]
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
