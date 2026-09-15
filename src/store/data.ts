import { defineStore } from 'pinia'
import { api } from '../api'
import type { AppState, Alert, Role, Pickup, Child } from '../types'

const empty: AppState = {
  serverTime: '', clockHHMM: '', date: '', deadline: '17:30',
  users: [], classes: [], children: [], parentLinks: [], authorizedPersons: [],
  healthChecks: [], classDecisions: [], medPlans: [], observations: [], careTransfers: [],
  pickups: [], gateLogs: [], pickupChanges: [], busRecords: [], activities: [],
  diseaseAlerts: [], teacherHandovers: [], communications: [], alerts: [], confirmations: []
}

let debounceTimer: number | undefined

export const useDataStore = defineStore('data', {
  state: () => ({
    state: { ...empty } as AppState,
    loaded: false,
    online: navigator.onLine,
    sseConnected: false,
    lastSyncAt: '' as string,
    syncing: false,
    localClock: '',
    lastKind: '',
    simOffline: false
  }),
  getters: {
    childrenByClass: (s) => {
      const m: Record<string, Child[]> = {}
      for (const c of s.state.children) (m[c.classId] ||= []).push(c)
      return m
    },
    className: (s) => (id: string | null | undefined) =>
      s.state.classes.find(c => c.id === id)?.name || '—',
    childById: (s) => (id: string | null | undefined) =>
      s.state.children.find(c => c.id === id),
    healthByChild: (s) => {
      const m: Record<string, AppState['healthChecks'][number]> = {}
      s.state.healthChecks.forEach(h => { m[h.childId] = h })
      return m
    },
    decisionByChild: (s) => {
      const m: Record<string, AppState['classDecisions'][number]> = {}
      s.state.classDecisions.forEach(d => { m[d.childId] = d })
      return m
    },
    // 今日有效接送（planned / picked），replaced/cancelled 不展示为当前授权
    effectivePickupByChild: (s) => {
      const m: Record<string, Pickup> = {}
      for (const p of s.state.pickups) {
        if (p.status === 'replaced' || p.status === 'cancelled') continue
        const cur = m[p.childId]
        if (!cur || p.createdAt > cur.createdAt) m[p.childId] = p
      }
      return m
    },
    activeTransferByChild: (s) => {
      const m: Record<string, AppState['careTransfers'][number]> = {}
      s.state.careTransfers.filter(t => t.status === 'active').forEach(t => { m[t.childId] = t })
      return m
    },
    isLate: (s) => (hhmm: string | null | undefined) => !!hhmm && hhmm > s.state.deadline
  },
  actions: {
    tickClock() {
      const d = new Date()
      this.localClock = d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
    },
    async fetchState() {
      this.syncing = true
      try {
        this.state = await api.state()
        this.loaded = true
        this.lastSyncAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        if (!this.localClock) this.tickClock()
      } finally {
        this.syncing = false
      }
    },
    scheduleFetch(kind = 'sync') {
      this.lastKind = kind
      if (this.simOffline) return // 门卫端模拟断网期间冻结画面，恢复后整屏刷新
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => this.fetchState(), 250)
    },
    connectSSE() {
      this.tickClock()
      setInterval(() => this.tickClock(), 30_000)

      const es = new EventSource('/events')
      es.addEventListener('hello', () => { this.sseConnected = true })
      es.addEventListener('sync', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data)
          this.sseConnected = true
          this.scheduleFetch(data.kind)
        } catch { /* noop */ }
      })
      es.onerror = () => { this.sseConnected = false }

      window.addEventListener('online', () => {
        this.online = true
        window.dispatchEvent(new CustomEvent('kg-network-back'))
      })
      window.addEventListener('offline', () => { this.online = false })
    },
    alertsForRole(role: Role | '*' = '*'): Alert[] {
      return this.state.alerts.filter(a =>
        a.status === 'open' && (a.forRoles === '*' || a.forRoles.split(',').includes(role)))
    },
    parseMedicine(raw: string | null | undefined): { name: string; dose: string; time: string }[] {
      if (!raw) return []
      try { return JSON.parse(raw) } catch { return [] }
    }
  }
})
