import type { AppState, User } from './types'

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  state: () => request<AppState>('/api/state'),

  saveHealthCheck: (b: any) => request('/api/health-checks', { method: 'POST', body: JSON.stringify(b) }),
  classDecision: (b: any) => request('/api/class-decision', { method: 'POST', body: JSON.stringify(b) }),
  medExecute: (id: string, b: any) => request(`/api/med-plans/${id}/execute`, { method: 'POST', body: JSON.stringify(b) }),
  medChangeTime: (id: string, b: any) => request(`/api/med-plans/${id}/change-time`, { method: 'POST', body: JSON.stringify(b) }),
  medAdd: (b: any) => request('/api/med-plans', { method: 'POST', body: JSON.stringify(b) }),
  observation: (b: any) => request('/api/observations', { method: 'POST', body: JSON.stringify(b) }),
  transfer: (b: any) => request('/api/care-transfers', { method: 'POST', body: JSON.stringify(b) }),
  transferReturn: (id: string, b: any) => request(`/api/care-transfers/${id}/return`, { method: 'POST', body: JSON.stringify(b) }),

  verify: (personId: string, pin: string) =>
    request('/api/pickups/verify', { method: 'POST', body: JSON.stringify({ personId, pin }) }),
  checkout: (b: any) => request('/api/pickups/checkout', { method: 'POST', body: JSON.stringify(b) }),
  gateDeny: (b: any) => request('/api/gate/deny', { method: 'POST', body: JSON.stringify(b) }),
  pickupChange: (b: any) => request('/api/pickup-changes', { method: 'POST', body: JSON.stringify(b) }),
  approveChange: (id: string, byUser: string) =>
    request(`/api/pickup-changes/${id}/approve`, { method: 'POST', body: JSON.stringify({ byUser }) }),
  rejectChange: (id: string, byUser: string) =>
    request(`/api/pickup-changes/${id}/reject`, { method: 'POST', body: JSON.stringify({ byUser }) }),

  bus: (b: any) => request('/api/bus-records', { method: 'POST', body: JSON.stringify(b) }),
  activity: (b: any) => request('/api/activities', { method: 'POST', body: JSON.stringify(b) }),
  disease: (b: any) => request('/api/disease-alerts', { method: 'POST', body: JSON.stringify(b) }),
  diseaseLift: (id: string) => request(`/api/disease-alerts/${id}/lift`, { method: 'POST' }),
  handover: (b: any) => request('/api/teacher-handovers', { method: 'POST', body: JSON.stringify(b) }),
  communication: (b: any) => request('/api/communications', { method: 'POST', body: JSON.stringify(b) }),
  resolveAlert: (id: string) => request(`/api/alerts/${id}/resolve`, { method: 'POST' }),
  confirmDaily: (childId: string, byUser: string) =>
    request(`/api/daily/${childId}/confirm`, { method: 'POST', body: JSON.stringify({ byUser }) }),

  sync: (events: any[]) => request('/api/sync', { method: 'POST', body: JSON.stringify({ events }) })
}
