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
                <span v-if="tempSource(c.id)" class="badge badge-purple" style="margin-left:6px" :title="tempSource(c.id)">📎 临时授权</span>
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

      <!-- 发热隔离同班观察待办 -->
      <div v-for="fi in myActiveIsolations" :key="fi.id" class="card" style="border-left:4px solid var(--red)">
        <h3>🌡️ 同班观察待办：{{ childName(fi.childId) }} {{ fi.temperature }}℃ 已入{{ fi.isolationRoom }}</h3>
        <p class="small muted">
          请逐一记录同班其他儿童的<b>咳嗽、缺勤、家长反馈</b>，结果同步保健并影响次日晨检与消毒安排。
          <span v-if="fi.classContact">接触情况：{{ fi.classContact }}</span>
        </p>
        <table class="tbl">
          <thead><tr><th>同班儿童</th><th>咳嗽</th><th>缺勤</th><th>体温</th><th>家长反馈</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in classmatesOf(fi)" :key="c.id">
              <td>{{ c.emoji }} {{ c.name }}</td>
              <td>
                <button class="chip btn-sm" :class="{ 'on-red': coForm(fi.id, c.id).cough }" @click="coForm(fi.id, c.id).cough = !coForm(fi.id, c.id).cough">咳嗽</button>
              </td>
              <td>
                <button class="chip btn-sm" :class="{ 'on': coForm(fi.id, c.id).absent }" @click="coForm(fi.id, c.id).absent = !coForm(fi.id, c.id).absent">缺勤</button>
              </td>
              <td><input v-model="coForm(fi.id, c.id).temperature" type="number" step="0.1" placeholder="选填" style="width:78px" /></td>
              <td><input v-model="coForm(fi.id, c.id).parentFeedback" placeholder="家长反馈（选填）" /></td>
            </tr>
          </tbody>
        </table>
        <button class="btn btn-primary btn-sm" style="margin-top:8px" @click="submitClassmate(fi)">提交同班观察</button>
      </div>

      <!-- 本班消毒安排 -->
      <div v-if="mySanitation.length" class="card">
        <h3>🧴 本班消毒安排（已通知保育员）</h3>
        <div v-for="sp in mySanitation" :key="sp.id" class="transfer-item">
          <span class="badge" :class="sp.status === 'done' ? 'badge-green' : 'badge-amber'">
            {{ sp.status === 'done' ? '已消毒' : '待消毒' }}
          </span>
          <b>{{ sp.dueTime }} 前</b> {{ sp.scope }}
          <span class="muted small">{{ sp.reason }}｜{{ sp.notifiedCleaner }}</span>
          <span v-if="sp.doneAt" class="small green">{{ sp.doneAt }} {{ sp.doneBy }} 完成，已入班级记录</span>
        </div>
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
        <h3>🔁 临时授权接送核身（批准后门卫/家长端立即切换，到期自动恢复原名单）</h3>
        <div v-for="pc in pendingChanges" :key="pc.id" class="change-item">
          <div class="change-main">
            <b style="font-size:15px">{{ childName(pc.childId) }}</b>
            <span v-if="pc.changeType === 'person'">
              改由 <b class="new-person">{{ pc.newPersonName }}</b>
              <span class="badge" :class="relClass(pc.newRelation)">{{ relationLabel[pc.newRelation || 'temporary'] }}</span>
            </span>
            <span v-else>改时间为 <b>{{ pc.newTime }}</b></span>

            <div v-if="pc.changeType === 'person'" class="idcard-row">
              <img v-if="pc.idPhotoUrl" :src="pc.idPhotoUrl" class="id-thumb" title="点击查看证件照" @click="idPreview = pc.idPhotoUrl" />
              <dl class="kv">
                <dt>手机</dt><dd>{{ pc.newPhone || '—' }}</dd>
                <dt>证件尾号</dt><dd>{{ pc.newIdLast4 || '—' }}</dd>
                <dt>有效期</dt><dd>
                  <b :class="isExpired(pc) ? 'red' : ''">
                    {{ pc.validFrom?.slice(11) }} – {{ pc.validUntil?.slice(11) }}
                    <span v-if="isExpired(pc)" class="badge badge-red" style="margin-left:4px">已过期</span>
                  </b>
                </dd>
                <dt>事由</dt><dd>{{ pc.reason }}</dd>
                <dt>申请人</dt><dd>{{ pc.requestedBy }} ｜ {{ timeShort(pc.createdAt) }}</dd>
              </dl>
            </div>
            <div v-else class="small muted">事由：{{ pc.reason }} ｜{{ pc.requestedBy }} ｜{{ timeShort(pc.createdAt) }}</div>

            <div v-if="pc.status !== 'pending'" class="small">
              状态：<span :class="pc.status === 'approved' ? 'green' : 'red'">
                {{ pc.status === 'approved' ? `已核身批准 · ${pc.approvedBy} · 各端已同步` : '已驳回 · 维持原授权' }}
              </span>
            </div>
          </div>
          <div v-if="pc.status === 'pending'" class="col" style="gap:6px; align-items:flex-end">
            <button class="btn btn-green btn-sm" @click="openIdCheck(pc)">核身批准</button>
            <button class="btn btn-red btn-sm" @click="reject(pc)">驳回</button>
          </div>
          <div v-else-if="pc.changeType === 'person' && pc.status === 'approved'" class="approved-box small">
            <div>临时授权码：<b style="font-size:15px">{{ pc.newPin }}</b></div>
            <div class="muted">有效期 {{ pc.validFrom?.slice(11) }}–{{ pc.validUntil?.slice(11) }}，已下发家长与门卫端</div>
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

    <!-- 证件照放大预览 -->
    <div v-if="idPreview" class="modal-mask" @click.self="idPreview = ''">
      <div class="modal" style="max-width:420px">
        <h3>临时接送人证件照</h3>
        <img :src="idPreview" class="id-full" />
        <div style="text-align:right;margin-top:10px"><button class="btn" @click="idPreview = ''">关闭</button></div>
      </div>
    </div>

    <!-- 证件核身弹窗 -->
    <div v-if="idCheck" class="modal-mask" @click.self="idCheck = null">
      <div class="modal">
        <h3>核身批准 · {{ childName(idCheck.childId) }}</h3>
        <div class="idcheck-body">
          <img :src="idCheck.idPhotoUrl!" class="id-full" />
          <dl class="kv">
            <dt>接送人</dt><dd><b>{{ idCheck.newPersonName }}</b>（{{ relationLabel[idCheck.newRelation || 'temporary'] }}）</dd>
            <dt>手机</dt><dd>{{ idCheck.newPhone || '—' }}</dd>
            <dt>证件尾号</dt><dd>{{ idCheck.newIdLast4 || '—' }}</dd>
            <dt>有效期</dt><dd>{{ idCheck.validFrom?.slice(11) }} – {{ idCheck.validUntil?.slice(11) }}</dd>
            <dt>事由</dt><dd>{{ idCheck.reason }}</dd>
            <dt>申请人</dt><dd>{{ idCheck.requestedBy }}</dd>
          </dl>
        </div>
        <label class="check-line"><input type="checkbox" v-model="idConfirmed" style="width:auto" /> 已电话向家长复核，并确认来人证件与照片一致</label>
        <div class="spread" style="margin-top:10px">
          <button class="btn" @click="idCheck = null">取消</button>
          <button class="btn btn-green" :disabled="!idConfirmed" @click="doApprove">确认核身并批准（生成临时授权码）</button>
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
// 本班相关、未解除的发热隔离（含隔离幼儿本身属于本班的）
const myActiveIsolations = computed(() =>
  data.state.feverIsolations.filter(fi =>
    childClassOf(fi.childId) === myClassId.value && fi.status !== 'released'))
function childClassOf(childId: string) {
  return data.childById(childId)?.classId
}
// 同班观察对象：排除被隔离幼儿本人
function classmatesOf(fi: any) {
  return myChildren.value.filter(c => c.id !== fi.childId)
}
// 每个隔离 × 每名同班儿童的观察表单（用已提交数据初始化）
const coForms = reactive<Record<string, any>>({})
function coForm(isoId: string, childId: string) {
  const key = `${isoId}|${childId}`
  if (!coForms[key]) {
    const saved = data.state.classmateObservations.find(co => co.isolationId === isoId && co.childId === childId)
    coForms[key] = reactive({
      cough: !!saved?.cough, absent: !!saved?.absent,
      temperature: saved?.temperature ?? '', parentFeedback: saved?.parentFeedback || ''
    })
  }
  return coForms[key]
}
async function submitClassmate(fi: any) {
  const items = classmatesOf(fi).map(c => ({ childId: c.id, ...coForm(fi.id, c.id) }))
  const r = await api.classmateObservations({ isolationId: fi.id, items })
  ui.show(`同班观察已提交，异常 ${r.abnormalCount} 名，已影响次日晨检`)
}
const mySanitation = computed(() =>
  data.state.sanitationPlans.filter(sp => sp.classId === myClassId.value))
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
function tempSource(childId: string) {
  const p = data.effectivePickupByChild[childId]
  const a = data.state.authorizedPersons.find(x => x.id === p?.personId)
  return a?.source?.startsWith('临时授权') ? (a.source || '') : ''
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
const idCheck = ref<PickupChange | null>(null)
const idConfirmed = ref(false)
const idPreview = ref('')
function nowLocalStamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function isExpired(pc: PickupChange) {
  return !!pc.validUntil && pc.validUntil <= nowLocalStamp()
}
function relClass(r?: string | null) {
  return ({ parent: 'badge-blue', grandparent: 'badge-green', nanny: 'badge-amber', temporary: 'badge-purple' } as Record<string, string>)[r || ''] || 'badge-gray'
}
function openIdCheck(pc: PickupChange) {
  if (isExpired(pc)) { ui.show('该授权已过有效期，请让家长重新申请', 'err'); return }
  idCheck.value = pc
  idConfirmed.value = false
}
async function doApprove() {
  if (!idCheck.value || !idConfirmed.value) return
  await api.approveChange(idCheck.value.id, auth.user?.name || '班主任')
  ui.show('已核身批准，门卫/家长端授权已切换')
  idCheck.value = null
}
async function approve(pc: PickupChange) { openIdCheck(pc) }
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
.change-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.idcard-row { display: flex; gap: 14px; align-items: flex-start; }
.id-thumb {
  width: 88px; height: 58px; object-fit: cover; border-radius: 8px;
  border: 1px solid var(--line); cursor: zoom-in; background: #f4f6fb;
}
.id-full { width: 100%; max-height: 260px; object-fit: contain; border-radius: 10px; border: 1px solid var(--line); background: #f4f6fb; }
.idcheck-body { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
.idcheck-body .id-full { width: 180px; flex-shrink: 0; }
.approved-box { background: var(--purple-bg); border-radius: 10px; padding: 8px 10px; color: var(--purple); }
.check-line { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-top: 8px; }
.new-person { color: var(--brand-2); }
.green { color: var(--green); font-weight: 700; }
.red { color: var(--red); font-weight: 700; }
</style>
