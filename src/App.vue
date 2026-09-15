<template>
  <div v-if="auth.user" class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">🧸</span>
        <div>
          <div class="title">阳光幼儿园 · 晨检接送与临时托管协同平台</div>
          <div class="sub">{{ data.state.date }} ｜ 规定离园 {{ data.state.deadline }} ｜ 当前 {{ data.localClock }}</div>
        </div>
      </div>
      <div class="statuses">
        <span class="badge" :class="data.sseConnected ? 'badge-green' : 'badge-gray'">
          {{ data.sseConnected ? '🟢 实时已连接' : '⚪ 实时未连接(轮询)' }}
        </span>
        <span class="badge" :class="data.online ? 'badge-blue' : 'badge-red'">
          {{ data.online ? '在线' : '⚠ 离线模式' }}
        </span>
        <span v-if="offline.pendingCount" class="badge badge-amber pulse">
          待补同步 {{ offline.pendingCount }}
        </span>
        <router-link v-if="['health','teacher','principal'].includes(auth.user.role)" to="/daily" class="btn btn-sm">
          📒 当日记录
        </router-link>
        <span class="user-chip">
          <span class="avatar">{{ roleIcon }}</span>
          {{ auth.user.name }} · {{ roleLabel }}
        </span>
        <button class="btn btn-sm" @click="logout">退出</button>
      </div>
    </header>

    <div v-if="myAlerts.length" class="alert-rail">
      <div v-for="a in myAlerts.slice(0, 6)" :key="a.id" class="alert-item" :class="sevClass(a.severity)">
        <span class="a-icon">{{ iconOf(a.type) }}</span>
        <div class="grow">
          <b>{{ a.title }}</b>
          <span v-if="a.message" class="muted"> — {{ a.message }}</span>
        </div>
        <button v-if="canResolve" class="btn btn-sm" @click="resolve(a)">处理完成</button>
      </div>
    </div>

    <main class="content">
      <router-view />
    </main>

    <div v-if="ui.toast" class="toast" :class="ui.toastKind">{{ ui.toast }}</div>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './store/auth'
import { useDataStore } from './store/data'
import { useOfflineStore } from './store/offline'
import { useUiStore } from './store/ui'
import { api } from './api'

const auth = useAuthStore()
const data = useDataStore()
const offline = useOfflineStore()
const ui = useUiStore()
const router = useRouter()

const roleLabels: Record<string, string> = {
  health: '保健老师', teacher: '班主任', guard: '门卫', principal: '园长', parent: '家长'
}
const roleIcons: Record<string, string> = {
  health: '🩺', teacher: '👩‍🏫', guard: '🛡️', principal: '👔', parent: '👨‍👩‍👧'
}
const roleLabel = computed(() => roleLabels[auth.user?.role || ''] || '')
const roleIcon = computed(() => roleIcons[auth.user?.role || ''] || '👤')

const myAlerts = computed(() => auth.user ? data.alertsForRole(auth.user.role) : [])
const canResolve = computed(() => ['health', 'teacher', 'principal', 'guard'].includes(auth.user?.role || ''))

function sevClass(sev: string) {
  return sev === 'critical' ? 'crit' : sev === 'warn' ? 'warn' : 'info'
}
function iconOf(type: string) {
  return ({ fever: '🌡️', symptom: '🤒', med: '💊', nap: '😴', pickup_change: '🔁',
    late: '⏰', disease: '🦠', transfer: '➡️', approval: '🚨' } as Record<string, string>)[type] || '🔔'
}
async function resolve(a: any) {
  await api.resolveAlert(a.id)
  ui.show('预警已处理')
}
function logout() {
  auth.logout()
  router.push('/login')
}

onMounted(async () => {
  if (!auth.user) return
  await data.fetchState()
  data.connectSSE()
  // SSE 断连时的保底轮询；恢复网络后立即拉取并补同步
  setInterval(() => { if (!data.sseConnected) data.fetchState() }, 10_000)
  setInterval(() => data.tickClock(), 10_000)
  window.addEventListener('kg-network-back', () => {
    data.fetchState()
    offline.flush()
  })
  if (navigator.onLine) offline.flush()
})
</script>

<style scoped>
.shell { min-height: 100%; display: flex; flex-direction: column; }
.topbar {
  background: linear-gradient(120deg, #fff7ef, #ffffff 60%);
  border-bottom: 1px solid var(--line);
  padding: 10px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  position: sticky; top: 0; z-index: 20;
}
.brand { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 30px; }
.title { font-weight: 800; font-size: 16px; }
.sub { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.statuses { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.user-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%; background: #ffe7d3;
  display: inline-flex; align-items: center; justify-content: center; font-size: 16px;
}
.content { flex: 1; padding: 16px; }
.alert-rail { padding: 8px 16px 0; display: flex; flex-direction: column; gap: 6px; }
.alert-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px;
  font-size: 13px; border: 1px solid;
}
.alert-item.crit { background: var(--red-bg); border-color: #f6c6c6; }
.alert-item.warn { background: var(--amber-bg); border-color: #f4dfae; }
.alert-item.info { background: var(--blue-bg); border-color: #c8dafd; }
.a-icon { font-size: 17px; }
</style>
