<template>
  <div class="handheld col">
    <div class="pill-tabs">
      <button v-for="t in tabs" :key="t.k" :class="{ on: tab === t.k }" @click="tab = t.k">{{ t.label }}</button>
    </div>

    <!-- 班级花名册 + 晨检结论处置 -->
    <div v-if="tab === 'roster'" class="col">
      <div v-for="c in myChildren" :key="c.id" class="card child-row">
        <div class="spread">
          <div class="who">
            <span class="emoji">{{ c.emoji }}</span>
            <div>
              <b style="font-size:15px">{{ c.name }}</b>
              <div class="small muted">
                {{ c.busRoute ? '🚌 ' + c.busRoute + ' · ' : '' }}
                当前接送：{{ pickupName(c.id) }}
                <span v-if="transferMap[c.id]" class="badge badge-purple" style="margin-left:6px">
                  托管至 {{ shortClass(transferMap[c.id].toClassId) }}
                </span>
              </div>
            </div>
          </div>
          <span v-if="hcMap[c.id]" class="badge" :class="concClass(hcMap[c.id].conclusion)">
            晨检·{{ conclusionLabel[hcMap[c.id].conclusion] }}
          </span>
          <span v-else class="badge badge-gray">未晨检</span>
        </div>

        <div v-if="hcMap[c.id]" class="hc-detail small muted">
          🌡️ {{ hcMap[c.id].temperature }}℃
          <span v-if="hcMap[c.id].cough">｜咳嗽</span>
          <span v-if="hcMap[c.id].rash">｜皮疹</span>
          ｜早餐：{{ hcMap[c.id].breakfast || '—' }} ｜情绪：{{ hcMap[c.id].mood || '—' }}
          ｜物品：{{ hcMap[c.id].specialItems || '—' }}
          <span v-if="data.parseMedicine(hcMap[c.id].medicine).length">
            ｜💊 {{ data.parseMedicine(hcMap[c.id].medicine).map(m => m.time + ' ' + m.name).join('，') }}
          </span>
          <span v-if="hcMap[c.id].note">｜备注：{{ hcMap[c.id].note }}</span>
        </div>

        <div class="chips" style="margin-top:10px">
          <button class="chip" :class="{ 'on-green': decisionMap[c.id]?.action === 'join' }" @click="decide(c, 'join')">✅ 安排入班</button>
          <button class="chip" :class="{ on: decisionMap[c.id]?.action === 'observe' }" @click="decide(c, 'observe')">👀 留班观察</button>
          <button class="chip" :class="{ 'on-red': decisionMap[c.id]?.action === 'home' }" @click="decide(c, 'home')">🏠 建议回家/已通知</button>
          <button class="chip" @click="openObserve(c)">📝 异常观察</button>
          <button class="chip" @click="openTransfer(c)">➡️ 临时托管</button>
        </div>
        <div v-if="decisionMap[c.id]" class="small muted" style="margin-top:6px">
          班级处置：{{ actionLabel[decisionMap[c.id].action] }}
          <span v-if="decisionMap[c.id].observeUntil"> 至 {{ decisionMap[c.id].observeUntil }}</span>
          ｜{{ decisionMap[c.id].byUser }}
        </div>
      </div>

      <div v-if="diseaseOfClass.length" class="card" style="border-left:4px solid var(--red)">
        <h3>🦠 本班/相关班级传染病观察</h3>
        <div v-for="d in diseaseOfClass" :key="d.id" class="disease-item">
          <b>{{ className(d.classId) }}</b> · {{ d.diseaseName }}（自 {{ d.sinceDate }} 起观察）
          <p class="small muted" style="margin:4px 0">{{ d.note }}</p>
        </div>
      </div>
    </div>

    <!-- 用药 + 异常观察 -->
    <div v-if="tab === 'care'" class="col">
      <div class="card">
        <h3>💊 用药执行</h3>
        <table class="tbl">
          <tbody>
            <tr v-for="m in myMeds" :key="m.id">
              <td><b>{{ childName(m.childId) }}</b><div class="small muted">{{ m.medName }} {{ m.dose }}</div></td>
              <td>计划 {{ m.plannedTime }}<div v-if="m.actualTime" class="small green">实际 {{ m.actualTime }}</div></td>
              <td>
                <span v-if="m.status === 'done'" class="badge badge-green">已服用</span>
                <template v-else>
                  <button class="btn btn-green btn-sm" @click="executeMed(m)">确认喂药</button>
                  <button class="btn btn-sm" @click="changeMedTime(m)">改时间</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!myMeds.length" class="muted small">今日本班无用药计划</p>
      </div>

      <div class="card">
        <h3>📝 今日异常观察（发热/午睡/皮疹…实时同步保健、园长、家长）</h3>
        <div v-for="o in myObservations" :key="o.id" class="obs-item">
          <span class="badge" :class="o.severity === 'critical' ? 'badge-red' : o.severity === 'warn' ? 'badge-amber' : 'badge-blue'">
            {{ obsTypeLabel[o.type] }}
          </span>
          <b>{{ childName(o.childId) }}</b>
          <span class="muted small">{{ o.content }}</span>
          <span class="muted small" style="margin-left:auto">{{ timeShort(o.createdAt) }} · {{ o.byUser }}</span>
        </div>
        <p v-if="!myObservations.length" class="muted small">暂无异常观察记录</p>
      </div>
    </div>

    <!-- 托管 / 交接 / 活动 -->
    <div v-if="tab === 'ops'" class="col">
      <div class="card">
        <h3>➡️ 临时托管交接</h3>
        <div v-for="t in transfersAll" :key="t.id" class="transfer-item">
          <b>{{ childName(t.childId) }}</b>：{{ shortClass(t.fromClassId) }} → {{ shortClass(t.toClassId) }}
          <span class="badge" :class="t.status === 'active' ? 'badge-purple' : 'badge-gray'">
            {{ t.status === 'active' ? `托管中 ${t.startTime} 起` : `已返班 ${t.endTime || ''}` }}
          </span>
          <div class="small muted">{{ t.reason }} · {{ t.byUser }}</div>
          <button v-if="t.status === 'active'" class="btn btn-sm" @click="returnTransfer(t)">登记返班</button>
        </div>
        <p v-if="!transfersAll.length" class="muted small">今日暂无跨班托管</p>
      </div>

      <div class="card">
        <h3>🔁 班级老师交接</h3>
        <div class="row">
          <label class="field grow"><span>班次</span>
            <input v-model="handover.shift" placeholder="如 早班→午班" />
          </label>
          <label class="field grow"><span>交出老师</span><input v-model="handover.fromTeacher" /></label>
          <label class="field grow"><span>接班老师</span><input v-model="handover.toTeacher" /></label>
        </div>
        <label class="field"><span>交接内容（在园人数、带药、异常、托管、待接）</span>
          <textarea v-model="handover.content" rows="2" />
        </label>
        <button class="btn btn-primary" @click="saveHandover">提交交接</button>
        <div v-for="h in myHandovers" :key="h.id" class="handover-item small">
          <b>{{ h.handoverTime }}</b> {{ h.shift }}：{{ h.fromTeacher }} → {{ h.toTeacher }}
          （在班 {{ h.childrenCount ?? '—' }} 人）<div class="muted">{{ h.content }}</div>
        </div>
      </div>

      <div class="card">
        <h3>🎈 园内活动</h3>
        <div class="row">
          <label class="field grow"><span>活动名称</span><input v-model="activity.name" placeholder="如 户外体能循环" /></label>
          <label class="field" style="min-width:110px"><span>开始</span><input v-model="activity.startTime" type="time" /></label>
          <label class="field" style="min-width:110px"><span>结束</span><input v-model="activity.endTime" type="time" /></label>
          <label class="field grow"><span>地点</span><input v-model="activity.location" /></label>
        </div>
        <button class="btn btn-primary" @click="saveActivity">登记活动</button>
        <div v-for="a in myActivities" :key="a.id" class="small" style="margin-top:6px">
          {{ a.startTime }}–{{ a.endTime }} <b>{{ a.name }}</b> @ {{ a.location || '园内' }}
        </div>
      </div>
    </div>

    <!-- 改接审批 + 家长沟通 -->
    <div v-if="tab === 'approvals'" class="col">
      <div class="card">
        <h3>🔁 接送变更审批（批准后门卫/家长端立即切换授权）</h3>
        <div v-for="pc in pendingChanges" :key="pc.id" class="change-item">
          <div>
            <b>{{ childName(pc.childId) }}</b>
            <span v-if="pc.changeType === 'person'">
              改由 <b class="new-person">{{ pc.newPersonName }}</b>
              （{{ relationLabel[pc.newRelation || 'temporary'] }}，手机 {{ pc.newPhone || '—' }}，证件后四位 {{ pc.newIdLast4 || '—' }}）
            </span>
            <span v-else>改时间为 <b>{{ pc.newTime }}</b></span>
            <div class="small muted">事由：{{ pc.reason }} ｜申请人：{{ pc.requestedBy }} ｜{{ timeShort(pc.createdAt) }}</div>
            <div v-if="pc.status !== 'pending'" class="small">
              状态：<span :class="pc.status === 'approved' ? 'green' : 'red'">
                {{ pc.status === 'approved' ? '已批准 · 各端已同步' : '已驳回 · 维持原授权' }}
              </span>
            </div>
          </div>
          <div v-if="pc.status === 'pending'" class="row" style="gap:6px">
            <button class="btn btn-green btn-sm" @click="approve(pc)">核身批准</button>
            <button class="btn btn-red btn-sm" @click="reject(pc)">驳回</button>
          </div>
          <div v-else-if="pc.changeType === 'person' && pc.status === 'approved'" class="small" style="color:var(--purple)">
            临时授权码：<b>{{ pc.newPin }}</b>（当日有效，已下发家长端与门卫端）
          </div>
        </div>
        <p v-if="!myChanges.length" class="muted small">暂无接送变更申请</p>
      </div>

      <div class="card">
        <h3>💬 家长沟通记录</h3>
        <div v-for="m in communications" :key="m.id" class="msg-item small">
          <b>{{ m.fromName }}</b> → {{ m.toRole === 'parent' ? '家长' : '老师' }}
          <span class="muted" style="margin-left:6px">{{ timeShort(m.createdAt) }}</span>
          <div>{{ m.content }}</div>
        </div>
        <div class="row" style="margin-top:8px">
          <select v-model="msg.childId" class="grow" style="max-width:160px">
            <option value="">选择幼儿</option>
            <option v-for="c in myChildren" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <input v-model="msg.content" class="grow" placeholder="给家长留言，将实时推送到家长端" @keyup.enter="sendMsg" />
          <button class="btn btn-primary" @click="sendMsg">发送</button>
        </div>
      </div>
    </div>

    <!-- 异常观察弹窗 -->
    <div v-if="obsTarget" class="modal-mask" @click.self="obsTarget = null">
      <div class="modal">
        <h3>异常观察 · {{ obsTarget.name }}</h3>
        <div class="chips" style="margin-bottom:10px">
          <button v-for="(label, key) in obsTypeLabel" :key="key" class="chip"
            :class="{ 'on-red': obsForm.type === key }" @click="obsForm.type = key">{{ label }}</button>
        </div>
        <label class="field"><span>情况描述</span><textarea v-model="obsForm.content" rows="3"
          :placeholder="obsForm.type === 'nap' ? '如：午睡 13:20 惊醒、呼吸急促、额温偏高…' : '请描述观察到的情况'" /></label>
        <div class="spread">
          <button class="btn" @click="obsTarget = null">取消</button>
          <button class="btn btn-primary" @click="saveObs">保存并同步</button>
        </div>
      </div>
    </div>

    <!-- 临时托管弹窗 -->
    <div v-if="transferTarget" class="modal-mask" @click.self="transferTarget = null">
      <div class="modal">
        <h3>临时托管 · {{ transferTarget.name }}</h3>
        <label class="field"><span>托管到班级</span>
          <select v-model="transferForm.toClassId">
            <option v-for="cl in otherClasses" :key="cl.id" :value="cl.id">{{ cl.name }}</option>
          </select>
        </label>
        <div class="row">
          <label class="field grow"><span>开始时间</span><input v-model="transferForm.startTime" type="time" /></label>
          <label class="field grow"><span>事由</span><input v-model="transferForm.reason" placeholder="如 教师临时会议" /></label>
        </div>
        <div class="spread">
          <button class="btn" @click="transferTarget = null">取消</button>
          <button class="btn btn-primary" @click="saveTransfer">发起托管（五端联动）</button>
        </div>
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
import { conclusionLabel, actionLabel, relationLabel, timeShort, hhmmNow } from '../helpers'
import type { Child, MedPlan, Observation, CareTransfer, PickupChange } from '../types'

const data = useDataStore()
const auth = useAuthStore()
const ui = useUiStore()
const tab = ref('roster')
const tabs = [
  { k: 'roster', label: '👶 班级名册' },
  { k: 'care', label: '💊 用药观察' },
  { k: 'ops', label: '➡️ 托管交接' },
  { k: 'approvals', label: '🔁 审批沟通' }
]

const myClassId = computed(() => auth.user?.classId || data.state.classes[0]?.id)
const myChildren = computed(() => data.state.children.filter(c => c.classId === myClassId.value))
const myChildIds = computed(() => new Set(myChildren.value.map(c => c.id)))
const hcMap = computed(() => data.healthByChild)
const decisionMap = computed(() => data.decisionByChild)
const transferMap = computed(() => data.activeTransferByChild)

const myMeds = computed(() => data.state.medPlans.filter(m => myChildIds.value.has(m.childId)))
const myObservations = computed(() =>
  [...data.state.observations].filter(o => myChildIds.value.has(o.childId)).reverse())
const transfersAll = computed(() =>
  data.state.careTransfers.filter(t => t.fromClassId === myClassId.value || t.toClassId === myClassId.value))
const otherClasses = computed(() => data.state.classes.filter(c => c.id !== myClassId.value))
const myHandovers = computed(() =>
  data.state.teacherHandovers.filter(h => h.classId === myClassId.value))
const myActivities = computed(() =>
  data.state.activities.filter(a => a.classId === myClassId.value))
const myChanges = computed(() =>
  data.state.pickupChanges.filter(pc => myChildIds.value.has(pc.childId)))
const pendingChanges = computed(() =>
  [...myChanges.value].sort((a, b) =>
    (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)))
const communications = computed(() =>
  data.state.communications.filter(m =>
    myChildIds.value.has(m.childId || '') || m.classId === myClassId.value))
const diseaseOfClass = computed(() =>
  data.state.diseaseAlerts.filter(d => d.classId === myClassId.value))

const obsTypeLabel: Record<string, string> = { fever: '🌡️ 发热', nap: '😴 午睡异常', rash: '🔴 皮疹', diet: '🍚 饮食', other: '📝 其他' }

function className(id?: string | null) { return data.className(id) }
function shortClass(id?: string | null) { return data.className(id).split(' · ')[0] }
function childName(id: string) { return data.childById(id)?.name || '—' }
function concClass(c: string) { return c === 'admit' ? 'badge-green' : c === 'observe' ? 'badge-amber' : 'badge-red' }
function pickupName(childId: string) {
  const p = data.effectivePickupByChild[childId]
  if (!p) return '待安排'
  return `${p.personName || '—'}（${relationLabel[p.relation || ''] || '临时'} ${p.scheduledTime ? p.scheduledTime : ''}）${p.status === 'picked' ? '·已接走' : ''}`
}

async function decide(c: Child, action: string) {
  try {
    await api.classDecision({
      childId: c.id, action,
      observeUntil: action === 'observe' ? '14:00' : null,
      note: action === 'home' ? '已通知家长接回，同步门卫放行名单' : '',
      byUser: auth.user?.name
    })
    ui.show(`已安排：${actionLabel[action]}`)
  } catch (e: any) { ui.show(e.message, 'err') }
}

// 异常观察
const obsTarget = ref<Child | null>(null)
const obsForm = reactive({ type: 'fever', content: '' })
function openObserve(c: Child) {
  obsTarget.value = c
  obsForm.type = 'fever'; obsForm.content = ''
}
async function saveObs() {
  if (!obsForm.content.trim()) { ui.show('请填写观察描述', 'err'); return }
  try {
    await api.observation({
      childId: obsTarget.value!.id, type: obsForm.type, content: obsForm.content,
      severity: obsForm.type === 'fever' ? 'critical' : 'warn', byUser: auth.user?.name
    })
    ui.show('异常观察已记录并同步')
    obsTarget.value = null
  } catch (e: any) { ui.show(e.message, 'err') }
}

// 临时托管
const transferTarget = ref<Child | null>(null)
const transferForm = reactive({ toClassId: '', startTime: hhmmNow(), reason: '' })
function openTransfer(c: Child) {
  transferTarget.value = c
  transferForm.toClassId = otherClasses.value[0]?.id || ''
  transferForm.startTime = hhmmNow()
  transferForm.reason = ''
}
async function saveTransfer() {
  try {
    await api.transfer({
      childId: transferTarget.value!.id,
      fromClassId: myClassId.value,
      toClassId: transferForm.toClassId,
      reason: transferForm.reason, startTime: transferForm.startTime,
      byUser: auth.user?.name
    })
    ui.show('托管已发起，五端联动')
    transferTarget.value = null
  } catch (e: any) { ui.show(e.message, 'err') }
}
async function returnTransfer(t: CareTransfer) {
  await api.transferReturn(t.id, { endTime: hhmmNow() })
  ui.show('已登记返班')
}

// 用药
async function executeMed(m: MedPlan) {
  await api.medExecute(m.id, { actualTime: hhmmNow(), byUser: auth.user?.name })
  ui.show('用药已确认，家长端可见')
}
async function changeMedTime(m: MedPlan) {
  const t = window.prompt(`将「${m.medName}」服药时间改为（HH:MM）`, m.plannedTime)
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return
  await api.medChangeTime(m.id, { plannedTime: t, reason: '班级安排调整', byUser: auth.user?.name })
  ui.show('时间变更已同步各方')
}

// 改接审批
async function approve(pc: PickupChange) {
  await api.approveChange(pc.id, auth.user?.name || '班主任')
  ui.show('已批准，门卫/家长端授权已切换')
}
async function reject(pc: PickupChange) {
  await api.rejectChange(pc.id, auth.user?.name || '班主任')
  ui.show('已驳回，维持原授权')
}

// 交接 / 活动 / 沟通
const handover = reactive({ shift: '午班→晚班', fromTeacher: auth.user?.name || '', toTeacher: '', content: '' })
async function saveHandover() {
  if (!handover.toTeacher || !handover.content) { ui.show('请填写接班老师与交接内容', 'err'); return }
  await api.handover({
    classId: myClassId.value, shift: handover.shift,
    fromTeacher: handover.fromTeacher, toTeacher: handover.toTeacher,
    handoverTime: hhmmNow(), content: handover.content,
    childrenCount: myChildren.value.length, createdBy: auth.user?.name
  })
  handover.content = ''
  ui.show('交接已记录')
}
const activity = reactive({ name: '', startTime: '', endTime: '', location: '' })
async function saveActivity() {
  if (!activity.name) { ui.show('请填写活动名称', 'err'); return }
  await api.activity({ classId: myClassId.value, ...activity, createdBy: auth.user?.name })
  activity.name = activity.location = ''
  ui.show('活动已登记')
}
const msg = reactive({ childId: '', content: '' })
async function sendMsg() {
  if (!msg.content.trim()) return
  await api.communication({
    childId: msg.childId || null, classId: myClassId.value,
    fromUser: auth.user?.name, fromName: auth.user?.name, toRole: 'parent', content: msg.content
  })
  msg.content = ''
  ui.show('已发送给家长')
}
</script>

<style scoped>
.child-row .who { display: flex; gap: 10px; align-items: center; }
.emoji { font-size: 28px; }
.hc-detail { margin-top: 8px; line-height: 1.7; }
.obs-item, .transfer-item, .handover-item, .msg-item, .change-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap;
}
.obs-item:last-child, .transfer-item:last-child, .change-item:last-child { border-bottom: none; }
.change-item { justify-content: space-between; align-items: flex-start; }
.new-person { color: var(--brand-2); }
.green { color: var(--green); font-weight: 700; }
.red { color: var(--red); font-weight: 700; }
</style>
