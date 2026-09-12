import { apiRequest } from './client'
import type { WorkflowSummary } from '../types'

export const listWorkflows = () => apiRequest<WorkflowSummary[]>('/workflows')

export const runWorkflow = (workflowId: string, inputs: Record<string, unknown>) =>
  apiRequest<{ context: { outputs: Record<string, unknown>; errors: string[] } }>(`/workflows/${workflowId}/run`, {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })
