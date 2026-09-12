import { apiRequest } from './client'
import type { ChatMessage, WorkflowSummary } from '../types'

export const listWorkflows = () => apiRequest<WorkflowSummary[]>('/workflows')

export const runWorkflow = (workflowId: string, inputs: Record<string, unknown>) =>
  apiRequest<{ context: { outputs: Record<string, unknown>; errors: string[] } }>(`/workflows/${workflowId}/run`, {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })

export const runConsole = (workflowId: string, eventName: string, conversationId: string, message: string, history: ChatMessage[]) =>
  apiRequest<unknown>(`/workflows/${workflowId}/console`, {
    method: 'POST',
    body: JSON.stringify({ event_name: eventName, conversation_id: conversationId, message, history }),
  })
