<template>
  <div class="cleaner-wrap col">
    <div class="card hero-card">
      <h2>🧹 保育员工作台 · {{ auth.user?.name }}</h2>
      <p class="muted small">接收发热/传染病关联的班级消毒安排，完成后标记并自动进入班级记录。</p>
      <div class="stat-row">
        <div class="stat-box"><b>{{ pending.length }}</b><span>待消毒</span></div>
        <div class="stat-box green"><b>{{ done.length }}</b><span>今日已完成</span></div>
      </div>
    </div>

    <div v-for="sp in pending" :key="sp.id" class="card task-card">
      <div class="spread">
        <div>
          <span class="badge badge-amber pulse">待消毒</span>
          <b style="font-size:16px">{{ className(sp.classId) }}</b>
          <span class="badge badge-red" style="margin-left:6px">{{ sp.dueTime }} 前完成</span>
        </div>
        <button class="btn btn-green" @click="finish(sp)">✅ 标记完成消毒</button>
      </div>
      <dl class="kv" style="margin-top:10px">
        <dt>消毒范围</dt><dd>{{ sp.scope }}</dd>
        <dt>原因</dt><dd>{{ sp.reason }}</dd>
        <dt>通知人</dt><dd>{{ sp.createdBy }} ｜ 接收 {{ sp.notifiedCleaner }}</dd>
      </dl>
    </div>

    <div class="card">
      <h3>已完成记录</h3>
      <div v-for="sp in done" :key="sp.id" class="done-item">
        <span class="badge badge-green">已消毒</span>
        <b>{{ className(sp.classId) }}</b>
        <span class="muted small">{{ sp.scope }}</span>
        <span class="small green" style="margin-left:auto">{{ sp.doneAt }} {{ sp.doneBy }} 完成</span>
      </div>
      <p v-if="!done.length" class="muted small">今日暂无完成记录</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '../store/data'
import { useAuthStore } from '../store/auth'
import { useUiStore } from '../store/ui'
import { api } from '../api'

const data = useDataStore()
const auth = useAuthStore()
const ui = useUiStore()

const todayPlans = computed(() =>
  data.state.sanitationPlans.filter(sp => sp.date === data.state.date))
const pending = computed(() => todayPlans.value.filter(sp => sp.status === 'pending'))
const done = computed(() => todayPlans.value.filter(sp => sp.status === 'done'))
function className(id: string) { return data.className(id) }

async function finish(sp: any) {
  await api.sanitationDone(sp.id)
  ui.show('消毒已完成，已进入班级记录')
}
</script>

<style scoped>
.cleaner-wrap { max-width: 760px; margin: 0 auto; }
.hero-card { background: linear-gradient(120deg, #e8f8f1, #fff); }
.hero-card h2 { margin-bottom: 4px; }
.stat-row { display: flex; gap: 12px; margin-top: 12px; }
.stat-box { flex: 1; background: #fef4e0; border-radius: 12px; padding: 14px; text-align: center; }
.stat-box b { display: block; font-size: 28px; color: var(--amber); }
.stat-box.green { background: var(--green-bg); }
.stat-box.green b { color: var(--green); }
.stat-box span { font-size: 12px; color: var(--ink-2); }
.task-card { border-left: 4px solid var(--amber); }
.done-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap; }
</style>
