<template>
  <div class="col">
    <div class="pill-tabs">
      <button v-for="t in tabs" :key="t.k" :class="{ on: tab === t.k }" @click="tab = t.k">{{ t.label }}</button>
    </div>

    <!-- 总览 -->
    <div v-if="tab === 'overview'" class="overview-grid">
      <div class="card kpi"><b>{{ data.state.children.length }}</b><span>在园幼儿</span></div>
      <div class="card kpi green"><b>{{ stats.admit }}</b><span>正常在班</span></div>
      <div class="card kpi amber"><b>{{ stats.observe }}</b><span>观察中</span></div>
      <div class="card kpi red"><b>{{ stats.home }}</b><span>建议回家/发热</span></div>
      <div class="card kpi purple"><b>{{ activeTransfers.length }}</b><span>跨班托管</span></div>
      <div class="card kpi purple"><b>{{ activeIsolationCount }}</b><span>发热隔离中</span></div>
      <div class="card kpi red"><b>{{ stats.late }}</b><span>晚接</span></div>
    </div>

    <div v-if="tab === 'overview'" class="two-col">
      <div class="card">
        <h3>🚨 待处理协同预警（保健/班主任/门卫/家长围绕同一幼儿联动）</h3>
        <div v-for="a in openAlerts" :key="a.id" class="alert-line" :class="a.severity">
          <b>{{ iconOf(a.type) }} {{ a.title }}</b>
          <div class="small muted">{{ a.message }}</div>
          <div class="small muted">通知：{{ roleScope(a.forRoles) }} ｜ {{ timeShort(a.createdAt) }}</div>
          <button class="btn btn-sm" @click="resolve(a)">标记处理</button>
        </div>
        <p v-if="!openAlerts.length" class="muted small">暂无待处理预警</p>
      </div>

      <div class="card">
        <h3>🏥 发热隔离与消毒</h3>
        <div v-for="fi in recentIsolations" :key="fi.id" class="iso-line">
          <b>{{ childName(fi.childId) }}</b>
          <span class="badge badge-red">{{ fi.temperature }}℃</span>
          <span class="muted small">{{ fi.startTime }} {{ fi.isolationRoom }}</span>
          <span class="badge" :class="fi.status === 'released' ? 'badge-gray' : fi.status === 'advised' ? 'badge-amber' : 'badge-red'">
            {{ fi.status === 'released' ? '已解除' : fi.status === 'advised' ? '已建议就医' : '隔离中' }}
          </span>
          <span v-if="abnormalOf(fi.id)" class="badge badge-red">同班异常 {{ abnormalOf(fi.id) }}</span>
        </div>
        <p v-if="!recentIsolations.length" class="muted small">今日无隔离</p>
        <h4 style="margin-top:12px">🧴 今日消毒</h4>
        <div v-for="sp in data.state.sanitationPlans.filter(s => s.date === data.state.date)" :key="sp.id" class="iso-line small">
          <span class="badge" :class="sp.status === 'done' ? 'badge-green' : 'badge-amber'">{{ sp.status === 'done' ? '已消毒' : '待消毒' }}</span>
          {{ className(sp.classId) }} · {{ sp.scope }}
          <span v-if="sp.doneAt" class="green">{{ sp.doneAt }} {{ sp.doneBy }}</span>
        </div>
      </div>

      <div class="card">
        <h3>👶 全园幼儿状态</h3>
        <table class="tbl">
          <thead><tr><th>幼儿</th><th>班级</th><th>晨检</th><th>处置</th><th>接送状态</th></tr></thead>
          <tbody>
            <tr v-for="c in data.state.children" :key="c.id">
              <td>{{ c.emoji }} <b>{{ c.name }}</b></td>
              <td>{{ shortClass(c.classId) }}</td>
              <td>
                <span v-if="hc[c.id]" class="badge" :class="concClass(hc[c.id].conclusion)">
                  {{ hc[c.id].temperature }}℃ · {{ conclusionLabel[hc[c.id].conclusion] }}
                </span>
                <span v-else class="badge badge-gray">未检</span>
              </td>
              <td>
                <span v-if="dec[c.id]" class="badge" :class="decClass(dec[c.id].action)">
                  {{ actionLabel[dec[c.id].action] }}
                </span>
                <span v-else class="muted small">—</span>
              </td>
              <td>
                <span v-if="transferMap[c.id]" class="badge badge-purple">托管中</span>
                <span v-else-if="pickup(c.id)?.status === 'picked'" class="badge badge-green">
                  {{ pickup(c.id)?.actualTime }} 已接走
                </span>
                <span v-else-if="pickup(c.id)" class="badge badge-blue">待接 · {{ pickup(c.id)?.personName }}</span>
                <span v-else class="badge badge-gray">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 传染病班级观察 -->
    <div v-if="tab === 'disease'" class="two-col">
      <div class="card">
        <h3>🦠 传染病班级观察</h3>
        <div v-for="d in data.state.diseaseAlerts" :key="d.id" class="disease-line">
          <b>{{ className(d.classId) }}</b> · {{ d.diseaseName }}
          <span class="badge badge-red">观察中（自 {{ d.sinceDate }}）</span>
          <p class="small muted" style="margin:4px 0">{{ d.note }}</p>
          <button class="btn btn-sm btn-green" @click="lift(d)">解除观察</button>
        </div>
        <div class="row" style="margin-top:14px">
          <label class="field grow"><span>班级</span>
            <select v-model="disease.classId">
              <option v-for="cl in data.state.classes" :key="cl.id" :value="cl.id">{{ cl.name }}</option>
            </select>
          </label>
          <label class="field grow"><span>传染病名称</span>
            <input v-model="disease.diseaseName" placeholder="如 手足口病 / 流感" />
          </label>
        </div>
        <label class="field"><span>观察措施</span>
          <textarea v-model="disease.note" rows="2" placeholder="加强晨午检、缺勤追踪、消毒通风…" />
        </label>
        <button class="btn btn-primary" @click="addDisease">发布班级观察（全园+家长端提醒）</button>
      </div>

      <div class="card">
        <h3>📝 异常观察时间线（按幼儿）</h3>
        <div v-for="o in [...data.state.observations].reverse()" :key="o.id" class="obs-line">
          <span class="badge" :class="o.severity === 'critical' ? 'badge-red' : 'badge-amber'">
            {{ obsType[o.type] || o.type }}
          </span>
          <b>{{ childName(o.childId) }}</b>
          <span class="muted small">{{ o.content }}</span>
          <span class="muted small" style="margin-left:auto">{{ timeShort(o.createdAt) }} {{ o.byUser }}</span>
        </div>
        <p v-if="!data.state.observations.length" class="muted small">暂无</p>
      </div>
    </div>

    <!-- 校车 + 晚接 -->
    <div v-if="tab === 'bus'" class="two-col">
      <div class="card">
        <h3>🚌 校车儿童接送闭环</h3>
        <table class="tbl">
          <thead><tr><th>幼儿</th><th>线路</th><th>早上车</th><th>早到园</th><th>晚上车</th><th>晚到家</th><th>跟车</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in busChildren" :key="c.id">
              <td><b>{{ c.name }}</b></td>
              <td>{{ c.busRoute }}</td>
              <td>{{ bus(c.id)?.boardMorning || '—' }}</td>
              <td>{{ bus(c.id)?.alightMorning || '—' }}</td>
              <td>{{ bus(c.id)?.boardEvening || '—' }}</td>
              <td>{{ bus(c.id)?.alightEvening || '—' }}</td>
              <td>{{ bus(c.id)?.escortTeacher || '孙老师' }}</td>
              <td><button class="btn btn-sm" @click="markEvening(c)">晚接送车</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>⏰ 晚接监管（超过 {{ data.state.deadline }}）</h3>
        <div v-for="p in lateList" :key="p.id" class="late-line">
          <b>{{ childName(p.childId) }}</b>
          <span v-if="p.status === 'picked'" class="badge badge-red">{{ p.actualTime }} 已晚接 · {{ p.personName }}</span>
          <span v-else class="badge badge-red pulse">超时未接 · 计划 {{ p.scheduledTime }} · {{ p.personName }}</span>
        </div>
        <p v-if="!lateList.length" class="muted small">暂无晚接</p>

        <h3 style="margin-top:18px">➡️ 跨班托管监管</h3>
        <div v-for="t in activeTransfers" :key="t.id" class="obs-line">
          <b>{{ childName(t.childId) }}</b>
          {{ shortClass(t.fromClassId) }} → {{ shortClass(t.toClassId) }}
          <span class="badge badge-purple">{{ t.startTime }} 起</span>
          <span class="muted small">{{ t.reason }}</span>
        </div>
        <p v-if="!activeTransfers.length" class="muted small">暂无进行中的托管</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useDataStore } from '../store/data'
import { useAuthStore } from '../store/auth'
import { useUiStore } from '../store/ui'
import { api } from '../api'
import { conclusionLabel, actionLabel, timeShort } from '../helpers'

const data = useDataStore()
const auth = useAuthStore()
const ui = useUiStore()
const tab = ref('overview')
const tabs = [
  { k: 'overview', label: '🏠 全园总览' },
  { k: 'disease', label: '🦠 传染病观察' },
  { k: 'bus', label: '🚌 校车/晚接' }
]

const hc = computed(() => data.healthByChild)
const dec = computed(() => data.decisionByChild)
const transferMap = computed(() => data.activeTransferByChild)
const pickup = (id: string) => data.effectivePickupByChild[id]
const childName = (id: string) => data.childById(id)?.name || '—'
const className = (id: string) => data.className(id)
const shortClass = (id?: string | null) => data.className(id).split(' · ')[0]

const stats = computed(() => {
  let admit = 0, observe = 0, home = 0, late = 0
  for (const c of data.state.children) {
    const con = hc.value[c.id]?.conclusion
    if (con === 'home') home++; else if (con === 'observe') observe++; else if (con === 'admit') admit++
  }
  for (const p of data.state.pickups) {
    if ((p.status === 'planned' && (p.scheduledTime || '') > data.state.deadline) || p.isLate) late++
  }
  return { admit, observe, home, late }
})

const openAlerts = computed(() => data.alertsForRole('principal'))
const activeIsolationCount = computed(() =>
  data.state.feverIsolations.filter(fi => fi.status !== 'released').length)
const recentIsolations = computed(() =>
  data.state.feverIsolations.filter(fi => fi.date === data.state.date).slice(0, 10))
function abnormalOf(isoId: string) {
  return data.state.classmateObservations.filter(co => co.isolationId === isoId && co.abnormal).length
}
const activeTransfers = computed(() => data.state.careTransfers.filter(t => t.status === 'active'))
const busChildren = computed(() => data.state.children.filter(c => c.busRoute))
const bus = (id: string) => data.state.busRecords.find(b => b.childId === id)
const lateList = computed(() => data.state.pickups.filter(p =>
  p.isLate || (p.status === 'planned' && (p.scheduledTime || '99') > data.state.deadline)))

const obsType: Record<string, string> = { fever: '发热', nap: '午睡', rash: '皮疹', diet: '饮食', other: '其他' }

function concClass(c: string) { return c === 'admit' ? 'badge-green' : c === 'observe' ? 'badge-amber' : 'badge-red' }
function decClass(a: string) { return a === 'join' ? 'badge-green' : a === 'observe' ? 'badge-amber' : 'badge-red' }
function iconOf(t: string) {
  return ({ fever: '🌡️', symptom: '🤒', med: '💊', nap: '😴', pickup_change: '🔁', late: '⏰',
    disease: '🦠', transfer: '➡️', approval: '🚨' } as Record<string, string>)[t] || '🔔'
}
function roleScope(s: string) { return s === '*' ? '全部角色' : s.split(',').map(r => ({
  health: '保健', teacher: '班主任', guard: '门卫', principal: '园长', parent: '家长'
} as Record<string, string>)[r]).join('、') }

async function resolve(a: any) { await api.resolveAlert(a.id); ui.show('已处理') }

const disease = reactive({ classId: '', diseaseName: '', note: '' })
async function addDisease() {
  if (!disease.diseaseName) { ui.show('请填写传染病名称', 'err'); return }
  await api.disease({
    classId: disease.classId || data.state.classes[0]?.id,
    diseaseName: disease.diseaseName, note: disease.note, createdBy: auth.user?.name
  })
  disease.diseaseName = disease.note = ''
  ui.show('观察提醒已发布，全端同步')
}
async function lift(d: any) {
  await api.diseaseLift(d.id)
  ui.show('已解除班级观察')
}
async function markEvening(c: any) {
  const now = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
  await api.bus({ childId: c.id, route: c.busRoute, boardEvening: now, escortTeacher: '孙老师', updatedBy: auth.user?.name })
  ui.show(`${c.name} 晚接送车已登记，家长端同步`)
}
</script>

<style scoped>
.overview-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
.kpi { text-align: center; padding: 18px 8px; }
.kpi b { display: block; font-size: 30px; color: var(--blue); }
.kpi.green b { color: var(--green); }
.kpi.amber b { color: var(--amber); }
.kpi.red b { color: var(--red); }
.kpi.purple b { color: var(--purple); }
.kpi span { font-size: 12px; color: var(--ink-2); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.alert-line { border-left: 4px solid var(--amber); background: #fafbfe; border-radius: 0 10px 10px 0; padding: 9px 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.alert-line.critical { border-left-color: var(--red); }
.alert-line.info { border-left-color: var(--blue); }
.obs-line { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap; }
.disease-line { padding: 10px 0; border-bottom: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.late-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.iso-line { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap; }
.green { color: var(--green); font-weight: 700; }
@media (max-width: 1000px) {
  .overview-grid { grid-template-columns: repeat(3, 1fr); }
  .two-col { grid-template-columns: 1fr; }
}
</style>
