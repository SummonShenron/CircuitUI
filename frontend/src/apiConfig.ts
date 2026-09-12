export const apiBaseUrl = import.meta.env.VITE_CIRCUITUI_API_URL ?? 'http://127.0.0.1:8020/api'

export function isCircuitApiUrl(url: string): boolean {
  return url.startsWith(apiBaseUrl)
}
