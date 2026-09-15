<template>
  <div class="col daily">
    <div class="card spread">
      <h3 style="margin:0">📒 {{ data.state.date }} 当日在园记录（离园归档 · 供次日晨检与班级安全复盘）</h3>
      <div class="row" style="gap:8px">
        <select v-model="classFilter" style="width:auto">
          <option value="">全部班级</option>
          <option v-for="c in data.state.classes" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button class="btn btn-sm" @click="print">🖨️ 打印/导出</button>
      </div>
    </div>

    <div v-for="c in filteredChildren" :key="c.id" class="card child-daily">
      <div class="spread" style="margin-bottom:8px">
        <div class="row" style="align-items:center; gap:10px">
          <span style="font-size:26px">{{ c.emoji }}</span>
          <div>
            <b style="font-size:16px">{{ c.name }}</b>
            <span class="muted small"> · {{ className(c.classId) }}</span>
          </div>
          <span v-if="hc[c.id]" class="badge" :class="concClass(hc[c.id].conclusion)">
            晨检 {{ conclusionLabel[hc[c.id].conclusion] }} {{ hc[c.id].temperature }}℃
          </span>
          <span v-else class="badge badge-gray">今日未晨检（缺勤？）</span>
          <span v-if="confirmedSet[c.id]" class="badge badge-green">家长已确认 {{ confirmedSet[c.id] }}</span>
          <span v-else class="badge badge-gray">家长待确认</span>
        </div>
        <div>
          <span v-if="pickup(c.id)?.status === 'picked'" class="badge badge-green">
            {{ pickup(c.id)!.actualTime }} 由 {{ pickup(c.id)!.personName }} 接走
            <template v-if="pickup(c.id)!.isLate"> · 晚接</template>
          </span>
          <span v-else class="badge badge-blue">尚未离园</span>
        </div>
      </div>

      <div class="timeline">
        <div class="t-item">
          <b>🩺 晨检</b>
          <span class="muted small">
            咳嗽 {{ hc[c.id]?.cough ? '有' : '无' }} ｜ 皮疹 {{ hc[c.id]?.rash ? '有' : '无' }}
            ｜ 早餐 {{ hc[c.id]?.breakfast || '—' }} ｜ 情绪 {{ hc[c.id]?.mood || '—' }}
            ｜ 物品 {{ hc[c.id]?.specialItems || '—' }}
          </span>
          <span v-if="medReg(c.id).length" class="small">
            带药：{{ medReg(c.id).map(m => `${m.time} ${m.name}`).join('；') }}
          </span>
          <span v-if="hc[c.id]?.note" class="small">嘱托：{{ hc[c.id].note }}</span>
        </div>

        <div v-if="dec[c.id]" class="t-item">
          <b>👩‍🏫 班级处置</b>
          <span class="small">{{ actionLabel[dec[c.id].action] }} {{ dec[c.id].note }}（{{ dec[c.id].byUser }}）</span>
        </div>

        <div v-for="m in meds(c.id)" :key="m.id" class="t-item">
          <b>💊 用药执行</b>
          <span class="small">
            {{ m.medName }} {{ m.dose }} ｜ 计划 {{ m.plannedTime }}
            ｜<b :class="m.status === 'done' ? 'green' : 'red'">
              {{ m.status === 'done' ? ` ${m.actualTime} 已服用（${m.byUser}）` : ' 未执行' }}
            </b>
          </span>
        </div>

        <div v-for="o in obs(c.id)" :key="o.id" class="t-item">
          <b>📝 异常观察</b>
          <span class="small">[{{ obsType[o.type] }}] {{ o.content }}（{{ timeShort(o.createdAt) }} {{ o.byUser }}）</span>
        </div>

        <div v-for="t in transfers(c.id)" :key="t.id" class="t-item">
          <b>➡️ 托管交接</b>
          <span class="small">
            {{ shortClass(t.fromClassId) }} → {{ shortClass(t.toClassId) }}
            ｜{{ t.startTime }}{{ t.endTime ? ' ~ ' + t.endTime : ' 起' }}
            ｜{{ t.status === 'active' ? '未返班' : '已返班' }}｜{{ t.reason }}
          </span>
        </div>

        <div v-if="pickup(c.id)" class="t-item">
          <b>🚸 接送</b>
          <span class="small">
            {{ pickup(c.id)!.personName }}（{{ relationLabel[pickup(c.id)!.relation || ''] || '临时授权人' }}）
            ｜计划 {{ pickup(c.id)!.scheduledTime || '—' }}
            ｜{{ pickup(c.id)!.status === 'picked' ? `实际 ${pickup(c.id)!.actualTime}` : '未离园' }}
            ｜授权码{{ pickup(c.id)!.pinVerified ? '已核验' : '未核验(离线)' }}
            <span v-if="pickup(c.id)!.createdVia === 'offline'">｜门卫离线记录已补传</span>
          </span>
          <img v-if="pickup(c.id)!.photoUrl" :src="pickup(c.id)!.photoUrl ?? ''" class="pick-thumb" />
        </div>

        <div v-for="g in gates(c.id)" :key="g.id" class="t-item">
          <b>🚦 门卫</b>
          <span class="small">{{ g.result === 'pass' ? '放行' : '拦截' }} · {{ g.personName }} · {{ g.reason }} · {{ timeShort(g.createdAt) }}</span>
        </div>

        <div v-for="m in msgs(c.id)" :key="m.id" class="t-item">
          <b>💬 沟通</b>
          <span class="small">{{ m.fromName }}：{{ m.content }}（{{ timeShort(m.createdAt) }}）</span>
        </div>
      </div>
    </div>

    <!-- 班级安全复盘 -->
    <div class="card">
      <h3>🛡️ 班级安全复盘（今日关键事件）</h3>
      <div class="review-grid">
        <div>
          <h4>🦠 传染病班级观察</h4>
          <div v-for="d in data.state.diseaseAlerts" :key="d.id" class="small review-line">
            {{ className(d.classId) }} · {{ d.diseaseName }}（{{ d.sinceDate }} 起）{{ d.note }}
          </div>
          <p v-if="!data.state.diseaseAlerts.length" class="muted small">无</p>

          <h4>🔁 班级老师交接</h4>
          <div v-for="h in data.state.teacherHandovers" :key="h.id" class="small review-line">
            {{ shortClass(h.classId) }} {{ h.handoverTime }} {{ h.shift }}：{{ h.fromTeacher }} → {{ h.toTeacher }}
            （{{ h.childrenCount ?? '—' }} 人）{{ h.content }}
          </div>
          <p v-if="!data.state.teacherHandovers.length" class="muted small">无</p>
        </div>
        <div>
          <h4>🚨 预警时间线</h4>
          <div v-for="a in [...data.state.alerts].reverse().slice(0, 20)" :key="a.id" class="small review-line">
            <span :class="a.severity === 'critical' ? 'red' : ''">●</span>
            {{ timeShort(a.createdAt) }} {{ a.title }}
            <span class="muted">{{ a.status === 'resolved' ? '（已处理）' : '' }}</span>
          </div>

          <h4>🚦 门卫拦截 / ⏰ 晚接</h4>
          <div v-for="g in data.state.gateLogs.filter(g => g.result === 'denied')" :key="g.id" class="small review-line red">
            拦截：{{ g.childName || '—' }} - {{ g.personName }} · {{ g.reason }}
          </div>
          <div v-for="p in data.state.pickups.filter(p => p.isLate)" :key="p.id" class="small review-line red">
            晚接：{{ childName(p.childId) }} {{ p.actualTime }} {{ p.personName }}
          </div>
          <p v-if="!data.state.gateLogs.some(g => g.result === 'denied') && !data.state.pickups.some(p => p.isLate)"
             class="muted small">无</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDataStore } from '../store/data'
import { conclusionLabel, actionLabel, relationLabel, timeShort } from '../helpers'

const data = useDataStore()
const classFilter = ref('')

const filteredChildren = computed(() =>
  data.state.children.filter(c => !classFilter.value || c.classId === classFilter.value))

const hc = computed(() => data.healthByChild)
const dec = computed(() => data.decisionByChild)
const className = (id: string) => data.className(id)
const shortClass = (id?: string | null) => data.className(id).split(' · ')[0]
const childName = (id: string) => data.childById(id)?.name || '—'
const pickup = (id: string) => data.effectivePickupByChild[id]
const meds = (id: string) => data.state.medPlans.filter(m => m.childId === id)
const medReg = (id: string) => data.parseMedicine(hc.value[id]?.medicine)
const obs = (id: string) => data.state.observations.filter(o => o.childId === id)
const transfers = (id: string) => data.state.careTransfers.filter(t => t.childId === id)
const gates = (id: string) => data.state.gateLogs.filter(g => g.childId === id)
const msgs = (id: string) => data.state.communications.filter(m => m.childId === id)
const confirmedSet = computed(() => {
  const m: Record<string, string> = {}
  data.state.confirmations.forEach(c => {
    m[c.childId] = c.confirmedAt
      ? new Date(c.confirmedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
      : ''
  })
  return m
})
const obsType: Record<string, string> = { fever: '发热', nap: '午睡异常', rash: '皮疹', diet: '饮食', other: '其他' }

function concClass(c: string) { return c === 'admit' ? 'badge-green' : c === 'observe' ? 'badge-amber' : 'badge-red' }
function print() { window.print() }
</script>

<style scoped>
.child-dilly { }
.timeline { display: flex; flex-direction: column; gap: 5px; border-left: 3px solid var(--line); padding-left: 12px; margin-top: 6px; }
.t-item { display: flex; flex-direction: column; gap: 1px; }
.t-item b { font-size: 13px; }
.pick-thumb { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; margin-top: 4px; }
.review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.review-line { padding: 4px 0; border-bottom: 1px dashed #f0f2f8; line-height: 1.6; }
.review-line.red { color: var(--red); }
h4 { font-size: 13px; margin: 10px 0 4px; }
.green { color: var(--green); }
.red { color: var(--red); }
@media print {
  .daily .card { box-shadow: none; break-inside: avoid; }
}
@media (max-width: 900px) { .review-grid { grid-template-columns: 1fr; } }
</style>
