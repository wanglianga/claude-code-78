import { defineStore } from 'pinia'
import { api } from '../api'

export type OfflineType = 'checkout' | 'gate_deny' | 'observation' | 'transfer'

export interface OfflineEvent {
  clientId: string
  type: OfflineType
  payload: any
  createdAt: string
  synced: boolean
  error?: string
}

const KEY = 'kg_offline_outbox_v1'

// 门卫端可手动模拟设备断网（window.__kg_sim_offline），用于演示离线记录
function isOnline() {
  return navigator.onLine && !(window as any).__kg_sim_offline
}

function load(): OfflineEvent[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export const useOfflineStore = defineStore('offline', {
  state: () => ({
    events: load() as OfflineEvent[],
    syncing: false
  }),
  getters: {
    pending: (s) => s.events.filter(e => !e.synced),
    pendingCount: (s) => s.events.filter(e => !e.synced).length
  },
  actions: {
    save() {
      localStorage.setItem(KEY, JSON.stringify(this.events))
    },
    enqueue(type: OfflineType, payload: any): OfflineEvent {
      const ev: OfflineEvent = {
        clientId: `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        payload,
        createdAt: new Date().toISOString(),
        synced: false
      }
      this.events.push(ev)
      this.save()
      // 在线则立即尝试补同步；离线则等待 network-back
      if (isOnline()) this.flush()
      return ev
    },
    async flush() {
      if (this.syncing) return
      const pending = this.pending
      if (!pending.length) return
      this.syncing = true
      try {
        const { results } = await api.sync(pending.map(e => ({
          clientId: e.clientId, type: e.type, payload: e.payload, createdAt: e.createdAt
        })))
        for (const r of results || []) {
          const ev = this.events.find(e => e.clientId === r.clientId)
          if (!ev) continue
          if (r.ok || r.duplicated) {
            ev.synced = true
            ev.error = undefined
          } else {
            ev.error = r.error || '同步失败'
          }
        }
        // 清理 24 小时前已同步事件
        const cutoff = Date.now() - 86400_000
        this.events = this.events.filter(e => !e.synced || new Date(e.createdAt).getTime() > cutoff)
        this.save()
      } catch (e) {
        // 保持待同步，下次再试
      } finally {
        this.syncing = false
      }
    }
  }
})
