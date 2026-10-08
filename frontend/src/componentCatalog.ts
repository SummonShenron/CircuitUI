import type { ComponentKind } from './types'

export const paletteEntries: Array<{ kind: ComponentKind; title: string; description: string; category: string }> = [
  { kind: 'label', title: 'Label', description: 'Static or workflow-bound text', category: 'Display' },
  { kind: 'table', title: 'Table', description: 'Render workflow output rows', category: 'Display' },
  { kind: 'image', title: 'Image', description: 'Show an image by URL', category: 'Display' },
  { kind: 'message', title: 'Message bubble', description: 'One chat message - user or assistant', category: 'Display' },
  { kind: 'text_input', title: 'Text input', description: 'Collect a value from the user', category: 'Inputs' },
  { kind: 'button', title: 'Button', description: 'Trigger a workflow run', category: 'Actions' },
  { kind: 'chat', title: 'Chat', description: 'Conversation thread bound to an event-triggered workflow', category: 'Actions' },
  { kind: 'container', title: 'Container', description: 'Group components together', category: 'Layout' },
  { kind: 'list', title: 'List', description: 'Repeats a template once per item in an array', category: 'Layout' },
]

export const defaultProps: Record<ComponentKind, Record<string, unknown>> = {
  label: { text: 'Label', fontSize: 16 },
  button: { text: 'Click me' },
  text_input: { placeholder: '', value: '' },
  image: { src: '', alt: '' },
  table: { rows: [] },
  container: { showLabel: true },
  chat: { placeholder: 'Type a message…' },
  list: { source: 'workflow', variable_name: '', row_height: 72 },
  message: { text: 'Message', role: 'assistant' },
}

export const defaultScreenSize = { width: 1280, height: 800 }

export const defaultSize: Record<ComponentKind, { width: number; height: number }> = {
  label: { width: 160, height: 32 },
  button: { width: 140, height: 40 },
  text_input: { width: 220, height: 40 },
  image: { width: 200, height: 150 },
  table: { width: 360, height: 220 },
  container: { width: 320, height: 240 },
  chat: { width: 340, height: 420 },
  list: { width: 320, height: 300 },
  message: { width: 280, height: 44 },
}
