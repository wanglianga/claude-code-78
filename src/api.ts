import type { AppState, User } from './types'

function token(): string | null {
  try { return JSON.parse(localStorage.getItem('kg_auth') || 'null')?.token || null } catch { return null }
}

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {})
    }
  })
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('kg-unauthorized'))
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || '未登录或会话已失效')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User; token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }).catch(() => {}),
  state: () => request<AppState>('/api/state'),

  saveHealthCheck: (b: any) => request('/api/health-checks', { method: 'POST', body: JSON.stringify(b) }),
  classDecision: (b: any) => request('/api/class-decision', { method: 'POST', body: JSON.stringify(b) }),
  medExecute: (id: string, b: any) => request(`/api/med-plans/${id}/execute`, { method: 'POST', body: JSON.stringify(b) }),
  medChangeTime: (id: string, b: any) => request(`/api/med-plans/${id}/change-time`, { method: 'POST', body: JSON.stringify(b) }),
  medAdd: (b: any) => request('/api/med-plans', { method: 'POST', body: JSON.stringify(b) }),
  observation: (b: any) => request('/api/observations', { method: 'POST', body: JSON.stringify(b) }),
  transfer: (b: any) => request('/api/care-transfers', { method: 'POST', body: JSON.stringify(b) }),
  transferReturn: (id: string, b: any) => request(`/api/care-transfers/${id}/return`, { method: 'POST', body: JSON.stringify(b) }),

  // 服务端核验授权码，成功返回一次性放行令牌（姓名/关系以服务端返回为准）
  verify: (personId: string, pin: string) =>
    request<{ token: string; person: any; child: any }>('/api/pickups/verify', {
      method: 'POST', body: JSON.stringify({ personId, pin })
    }),
  // 放行只提交核验令牌与照片，身份字段完全由服务端从令牌反查
  checkout: (verificationToken: string, photoUrl: string) =>
    request('/api/pickups/checkout', { method: 'POST', body: JSON.stringify({ verificationToken, photoUrl }) }),
  gateDeny: (b: any) => request('/api/gate/deny', { method: 'POST', body: JSON.stringify(b) }),
  offlinePermit: () =>
    request<{ permitToken: string; date: string }>('/api/gate/offline-permit', { method: 'POST' }),
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

  // permitToken 为门卫断网前领取的当日离线许可，服务端据此鉴权补传
  sync: (events: any[], permitToken?: string | null) =>
    request('/api/sync', { method: 'POST', body: JSON.stringify({ events, permitToken }) })
}
