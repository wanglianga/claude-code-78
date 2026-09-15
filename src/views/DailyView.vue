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
            <span v-if="pickup(c.id)!.confirmedBy">｜门卫确认：{{ pickup(c.id)!.confirmedBy }}</span>
            <span v-if="pickup(c.id)!.createdVia === 'offline'">｜门卫离线记录已补传</span>
          </span>
          <span v-if="pickupSource(pickup(c.id)!)" class="small" style="color:var(--purple)">
            📎 授权来源：{{ pickupSource(pickup(c.id)!) }}
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

    <!-- 发热隔离 / 同班观察 / 消毒（班级记录） -->
    <div class="card" v-if="feverIsolations.length">
      <h3>🏥 发热隔离处置记录</h3>
      <div v-for="fi in feverIsolations" :key="fi.id" class="iso-record">
        <div class="spread">
          <b style="font-size:15px">{{ childName(fi.childId) }} · {{ fi.temperature }}℃
            <span v-for="s in fi.symptoms" :key="s" class="badge badge-amber">{{ s }}</span>
          </b>
          <span class="badge" :class="fi.status === 'released' ? 'badge-gray' : 'badge-red'">
            {{ fi.status === 'released' ? `已解除 ${fi.releasedAt || ''}` : fi.status === 'advised' ? '已建议就医' : '隔离中' }}
          </span>
        </div>
        <dl class="kv" style="margin:6px 0">
          <dt>隔离室</dt><dd>{{ fi.isolationRoom }} · {{ fi.startTime }} 起（{{ fi.byUser }}）</dd>
          <dt>通知家长</dt><dd>{{ fi.parentNotifiedAt || '—' }}</dd>
          <dt>同班接触</dt><dd>{{ fi.classContact || '—' }}</dd>
          <dt>就医建议</dt><dd>{{ fi.medicalAdvice || '—' }} <span v-if="fi.adviceAt" class="muted">（{{ fi.adviceAt }} {{ fi.adviceBy }}）</span></dd>
        </dl>
        <div v-if="classmateObs(fi.id).length" class="co-list">
          <b class="small">同班观察：</b>
          <span v-for="co in classmateObs(fi.id)" :key="co.id" class="co-chip" :class="{ ab: co.abnormal }">
            {{ childName(co.childId) }}{{ co.cough ? '·咳嗽' : '' }}{{ co.absent ? '·缺勤' : '' }}{{ co.temperature ? '·' + co.temperature + '℃' : '' }}{{ co.parentFeedback ? '·反馈:' + co.parentFeedback : '' }}
          </span>
        </div>
      </div>
    </div>

    <div class="card" v-if="sanitationPlans.length">
      <h3>🧴 班级消毒记录（已通知保育员）</h3>
      <table class="tbl">
        <thead><tr><th>班级</th><th>范围</th><th>原因</th><th>应完成</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="sp in sanitationPlans" :key="sp.id">
            <td><b>{{ className(sp.classId) }}</b></td>
            <td>{{ sp.scope }}</td>
            <td class="small muted">{{ sp.reason }}</td>
            <td>{{ sp.dueTime }}</td>
            <td>
              <span class="badge" :class="sp.status === 'done' ? 'badge-green' : 'badge-amber'">
                {{ sp.status === 'done' ? `${sp.doneAt} ${sp.doneBy} 已完成` : '待消毒' }}
              </span>
              <span class="small muted">通知 {{ sp.notifiedCleaner }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 当天临时授权档案 -->
    <div class="card">
      <h3>📎 当天临时授权接送档案（后续询问备查）</h3>
      <div v-if="tempAuthorizations.length" class="temp-grid">
        <div v-for="pc in tempAuthorizations" :key="pc.id" class="temp-card">
          <img v-if="pc.idPhotoUrl" :src="pc.idPhotoUrl" class="id-img" />
          <div class="small">
            <b style="font-size:14px">{{ childName(pc.childId) }}</b> → <b>{{ pc.newPersonName }}</b>
            <span class="badge" :class="pc.status==='approved'?'badge-purple':pc.status==='rejected'?'badge-red':'badge-amber'">
              {{ pc.status === 'approved' ? '已批准' : pc.status === 'rejected' ? '已驳回' : '待核身' }}
            </span>
            <div class="muted" style="line-height:1.7;margin-top:4px">
              关系：{{ relationLabel[pc.newRelation || 'temporary'] }} ｜手机：{{ pc.newPhone || '—' }}<br />
              有效期：{{ pc.validFrom?.slice(11) }} – {{ pc.validUntil?.slice(11) }}<br />
              原因：{{ pc.reason }}<br />
              申请人：{{ pc.requestedBy }} ｜核身：{{ pc.approvedBy || '—' }}
              <template v-if="pc.status === 'approved'">｜授权码 <b>{{ pc.newPin }}</b></template>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="muted small">今日无临时授权记录</p>
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
const personById = (pid?: string | null) => data.state.authorizedPersons.find(p => p.id === pid)
const pickupSource = (p: any) => personById(p?.personId)?.source || ''
const tempAuthorizations = computed(() =>
  [...data.state.pickupChanges].filter(pc => pc.changeType === 'person').reverse())
const feverIsolations = computed(() =>
  data.state.feverIsolations.filter(fi => !classFilter.value || childClassOf(fi.childId) === classFilter.value))
const sanitationPlans = computed(() =>
  data.state.sanitationPlans.filter(sp => !classFilter.value || sp.classId === classFilter.value))
function childClassOf(childId: string) {
  return data.childById(childId)?.classId || ''
}
function classmateObs(isoId: string) {
  return data.state.classmateObservations.filter(co => co.isolationId === isoId)
}
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
.temp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.temp-card { display: flex; gap: 10px; border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: #fafbfe; }
.id-img { width: 110px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); flex-shrink: 0; }
.iso-record { border: 1px solid var(--line); border-left: 4px solid var(--red); border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
.co-list { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 4px; }
.co-chip { font-size: 12px; background: #eef1f7; border-radius: 999px; padding: 3px 10px; }
.co-chip.ab { background: var(--red-bg); color: var(--red); font-weight: 700; }
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
