import { apiRequest } from './client'
import type { CircuitApp, CircuitAppSummary } from '../types'

export const listApps = () => apiRequest<CircuitAppSummary[]>('/apps')

export const getApp = (appId: string) => apiRequest<CircuitApp>(`/apps/${appId}`)

export const createApp = (name: string, description: string) =>
  apiRequest<CircuitApp>('/apps', { method: 'POST', body: JSON.stringify({ name, description }) })

export const updateApp = (appId: string, patch: Partial<Pick<CircuitApp, 'name' | 'description' | 'screens'>>) =>
  apiRequest<CircuitApp>(`/apps/${appId}`, { method: 'PUT', body: JSON.stringify(patch) })

export const deleteApp = (appId: string) => apiRequest<void>(`/apps/${appId}`, { method: 'DELETE' })
