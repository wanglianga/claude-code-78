<template>
  <div class="phone">
    <div class="phone-card" v-for="c in myChildren" :key="c.id">
      <div class="child-head">
        <span class="big-emoji">{{ c.emoji }}</span>
        <div class="grow">
          <h2>{{ c.name }}</h2>
          <span class="muted small">{{ className(c.classId) }}{{ c.busRoute ? ' · 🚌 ' + c.busRoute : '' }}</span>
        </div>
        <span v-if="hc[c.id]" class="badge" :class="concClass(hc[c.id].conclusion)">
          {{ conclusionLabel[hc[c.id].conclusion] }}
        </span>
        <span v-else class="badge badge-gray">尚未晨检</span>
      </div>

      <!-- 晨检信息 -->
      <div v-if="hc[c.id]" class="info-box">
        <div class="temp-line">
          <span class="temp" :class="hc[c.id].temperature! >= 37.3 ? 'hot' : ''">🌡️ {{ hc[c.id].temperature }}℃</span>
          <span v-if="hc[c.id].cough" class="badge badge-red">咳嗽</span>
          <span v-if="hc[c.id].rash" class="badge badge-red">皮疹</span>
        </div>
        <dl class="kv">
          <dt>早餐</dt><dd>{{ hc[c.id].breakfast || '—' }}</dd>
          <dt>情绪</dt><dd>{{ hc[c.id].mood || '—' }}</dd>
          <dt>特殊物品</dt><dd>{{ hc[c.id].specialItems || '—' }}</dd>
          <dt>保健嘱托</dt><dd>{{ hc[c.id].note || '—' }}</dd>
        </dl>
      </div>
      <div v-if="dec[c.id]" class="teacher-line">
        👩‍🏫 班主任处置：<b>{{ actionLabel[dec[c.id].action] }}</b>
        <span v-if="dec[c.id].note" class="muted">（{{ dec[c.id].note }}）</span>
      </div>

      <!-- 发热隔离与就医建议 -->
      <div v-if="isolation(c.id)" class="sub iso-box">
        <h4>🏥 园内发热隔离{{ isolation(c.id)!.status === 'released' ? `（已解除 ${isolation(c.id)!.releasedAt || ''}）` : '' }}</h4>
        <div class="iso-line">
          <span class="badge badge-red">{{ isolation(c.id)!.temperature }}℃</span>
          <span v-for="s in isolation(c.id)!.symptoms" :key="s" class="badge badge-amber">{{ s }}</span>
          <span class="muted small">{{ isolation(c.id)!.startTime }} 入{{ isolation(c.id)!.isolationRoom }}</span>
          <span class="muted small">家长通知 {{ isolation(c.id)!.parentNotifiedAt || '—' }}</span>
        </div>
        <div v-if="isolation(c.id)!.medicalAdvice" class="advice-box">
          <b>🩺 带回就医建议（{{ isolation(c.id)!.adviceBy }} {{ isolation(c.id)!.adviceAt }}）：</b>
          {{ isolation(c.id)!.medicalAdvice }}
        </div>
      </div>

      <!-- 用药与异常 -->
      <div v-if="meds(c.id).length" class="sub">
        <h4>💊 今日用药</h4>
        <div v-for="m in meds(c.id)" :key="m.id" class="med-line">
          {{ m.plannedTime }} {{ m.medName }} {{ m.dose }}
          <span class="badge" :class="m.status === 'done' ? 'badge-green' : 'badge-amber'">
            {{ m.status === 'done' ? `已于 ${m.actualTime} 服用（${m.byUser}）` : '待服用' }}
          </span>
        </div>
      </div>
      <div v-if="obs(c.id).length" class="sub">
        <h4>📝 园内观察</h4>
        <div v-for="o in obs(c.id)" :key="o.id" class="med-line">
          <span class="badge badge-amber">{{ obsType[o.type] }}</span>
          {{ o.content }} <span class="muted small">{{ timeShort(o.createdAt) }} {{ o.byUser }}</span>
        </div>
      </div>
      <div v-if="transfer(c.id)" class="sub">
        <h4>➡️ 临时托管</h4>
        <div class="med-line">
          {{ transfer(c.id)!.startTime }} 起托管至 <b>{{ shortClass(transfer(c.id)!.toClassId) }}</b>
          （{{ transfer(c.id)!.reason || '跨班托管' }}）
          <span class="badge" :class="transfer(c.id)!.status === 'active' ? 'badge-purple' : 'badge-gray'">
            {{ transfer(c.id)!.status === 'active' ? '托管中' : `已返班 ${transfer(c.id)!.endTime}` }}
          </span>
        </div>
      </div>

      <!-- 接送安排 -->
      <div class="sub pickup-box">
        <h4>🚸 今日接送（任何变更各端同步，旧授权立即失效）</h4>
        <template v-if="pickup(c.id)">
          <div class="pickup-line">
            <div>
              接送人：<b>{{ pickup(c.id)!.personName }}</b>
              <span class="badge" :class="relClass(pickup(c.id)!.relation)">
                {{ relationLabel[pickup(c.id)!.relation || ''] || '临时授权人' }}
              </span>
              <div class="small muted">
                计划 {{ pickup(c.id)!.scheduledTime || '—' }}
                <span v-if="pickup(c.id)!.status === 'picked'">
                  ｜实际 <b :class="pickup(c.id)!.isLate ? 'red' : 'green'">{{ pickup(c.id)!.actualTime }}</b>
                  {{ pickup(c.id)!.isLate ? '（晚接，老师陪伴中）' : '已安全接走' }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="pickup(c.id)!.photoUrl" class="pickup-photo">
            <img :src="pickup(c.id)!.photoUrl!" />
            <span class="small muted">门卫接送留影</span>
          </div>
        </template>
        <p v-else class="muted small">接送安排待确认，请联系班主任。</p>

        <div v-if="pickup(c.id)?.status !== 'picked'" class="row" style="margin-top:8px; gap:8px">
          <button class="btn btn-sm btn-primary" @click="openChange(c, 'person')">🔁 申请临时改接</button>
          <button class="btn btn-sm" @click="openChange(c, 'time')">⏰ 申请改时间</button>
        </div>

        <!-- 改接申请状态 -->
        <div v-for="pc in changes(c.id)" :key="pc.id" class="change-status">
          <template v-if="pc.changeType === 'person'">
            改接「{{ pc.newPersonName }}」：
            <span :class="statusColor(pc.status)">{{ statusText(pc.status) }}</span>
            <span v-if="pc.validFrom" class="muted"> 有效期 {{ pc.validFrom.slice(11) }}–{{ pc.validUntil?.slice(11) }}</span>
            <span v-if="pc.status === 'approved'" class="pin-box">临时授权码 <b>{{ pc.newPin }}</b>（请当面告知接送人，门卫核验）</span>
          </template>
          <template v-else>
            改时间 {{ pc.newTime }}：<span :class="statusColor(pc.status)">{{ statusText(pc.status) }}</span>
          </template>
        </div>

        <details class="auth-list">
          <summary class="small muted">常驻授权接送人（{{ regularPersons(c.id).length }} 人）</summary>
          <div v-for="p in regularPersons(c.id)" :key="p.id" class="person-line small">
            <b>{{ p.name }}</b>（{{ relationLabel[p.relation] }}）{{ p.phone }} · 授权码 {{ p.pin }}
          </div>
        </details>
      </div>

      <!-- 家长沟通 -->
      <div v-if="msgs(c.id).length" class="sub">
        <h4>💬 家园沟通</h4>
        <div v-for="m in msgs(c.id)" :key="m.id" class="msg small">
          <b>{{ m.fromName }}</b> <span class="muted">{{ timeShort(m.createdAt) }}</span>
          <div>{{ m.content }}</div>
        </div>
      </div>

      <!-- 当日确认 -->
      <div class="confirm-box">
        <template v-if="confirmed(c.id)">
          ✅ 您已于 {{ confirmedTime(c.id) }} 确认孩子今日在园/离园记录
        </template>
        <template v-else>
          <button class="btn btn-green btn-sm" @click="confirm(c)">确认当日记录已知悉</button>
        </template>
      </div>
    </div>

    <!-- 改接申请弹窗 -->
    <div v-if="changeForm.open" class="modal-mask" @click.self="changeForm.open = false">
      <div class="modal">
        <h3>{{ changeForm.changeType === 'person' ? '临时改接申请' : '接送时间变更' }} · {{ changeForm.childName }}</h3>
        <template v-if="changeForm.changeType === 'person'">
          <p class="small muted">提交后由班主任核身批准，批准前门卫端不放行；批准后自动生成当日一次性接送授权码，授权到期自动恢复原接送名单。</p>
          <div class="row">
            <label class="field grow"><span>接送人姓名</span><input v-model="changeForm.newPersonName" placeholder="如 李奶奶" /></label>
            <label class="field grow"><span>授权关系</span>
              <select v-model="changeForm.newRelation">
                <option value="grandparent">祖辈</option>
                <option value="nanny">保姆</option>
                <option value="temporary">临时授权人（亲友/同事）</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label class="field grow"><span>手机号</span><input v-model="changeForm.newPhone" /></label>
            <label class="field grow"><span>身份证后四位</span><input v-model="changeForm.newIdLast4" maxlength="4" /></label>
          </div>
          <label class="field">
            <span>身份证照片（核身与当天档案留存，必填）</span>
            <PhotoCapture v-model="changeForm.idPhotoUrl" />
          </label>
          <div class="row">
            <label class="field grow"><span>授权生效时间</span><input v-model="changeForm.validFrom" type="datetime-local" /></label>
            <label class="field grow"><span>授权失效时间</span>
              <input v-model="changeForm.validUntil" type="datetime-local" />
            </label>
          </div>
          <p class="small muted">临时授权仅限当日，失效后门卫端自动恢复原接送名单，临时接送人无法再次刷入。</p>
        </template>
        <template v-else>
          <label class="field"><span>新的接离时间</span><input v-model="changeForm.newTime" type="time" /></label>
        </template>
        <label class="field"><span>事由</span><textarea v-model="changeForm.reason" rows="2" /></label>
        <div class="spread">
          <button class="btn" @click="changeForm.open = false">取消</button>
          <button class="btn btn-primary" @click="submitChange">提交申请（同步班主任/门卫/园长）</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useDataStore } from '../store/data'
import { useAuthStore } from '../store/auth'
import { useUiStore } from '../store/ui'
import { api } from '../api'
import { conclusionLabel, actionLabel, relationLabel, timeShort } from '../helpers'
import PhotoCapture from '../components/PhotoCapture.vue'
import type { Child } from '../types'

const data = useDataStore()
const auth = useAuthStore()
const ui = useUiStore()

const myChildIds = computed(() =>
  new Set(data.state.parentLinks.filter(l => l.userId === auth.user?.id).map(l => l.childId)))
const myChildren = computed(() => data.state.children.filter(c => myChildIds.value.has(c.id)))

const hc = computed(() => data.healthByChild)
const dec = computed(() => data.decisionByChild)
const className = (id: string) => data.className(id)
const shortClass = (id?: string | null) => data.className(id).split(' · ')[0]
const meds = (id: string) => data.state.medPlans.filter(m => m.childId === id)
const obs = (id: string) => data.state.observations.filter(o => o.childId === id)
const transfer = (id: string) => data.activeTransferByChild[id]
const isolation = (id: string) =>
  [...data.state.feverIsolations].filter(fi => fi.childId === id && fi.date === data.state.date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
const pickup = (id: string) => data.effectivePickupByChild[id]
const persons = (id: string) => data.state.authorizedPersons.filter(p => p.childId === id)
const regularPersons = (id: string) => persons(id).filter(p => !p.validUntil)
const changes = (id: string) => data.state.pickupChanges.filter(pc => pc.childId === id)
const msgs = (id: string) => data.state.communications.filter(m => m.childId === id)
const confirmed = (id: string) => data.state.confirmations.find(c => c.childId === id)
const confirmedTime = (id: string) => {
  const t = confirmed(id)?.confirmedAt
  return t ? new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''
}

const obsType: Record<string, string> = { fever: '发热', nap: '午睡异常', rash: '皮疹', diet: '饮食', other: '其他' }

function concClass(c: string) { return c === 'admit' ? 'badge-green' : c === 'observe' ? 'badge-amber' : 'badge-red' }
function relClass(r?: string) {
  return ({ parent: 'badge-blue', grandparent: 'badge-green', nanny: 'badge-amber', temporary: 'badge-purple' } as Record<string, string>)[r || ''] || 'badge-gray'
}
function statusText(s: string) { return s === 'pending' ? '⏳ 待班主任审批（门卫暂不放行）' : s === 'approved' ? '✅ 已批准，各端已同步' : '❌ 未通过，维持原授权' }
function statusColor(s: string) { return s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'muted' }

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStamps(addMin = 120) {
  const d = new Date()
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const to = new Date(d.getTime() + addMin * 60_000)
  return {
    date,
    from: `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    until: `${date}T${pad(to.getHours())}:${pad(to.getMinutes())}`
  }
}

const changeForm = reactive({
  open: false, childId: '', childName: '', changeType: 'person' as 'person' | 'time',
  newPersonName: '', newRelation: 'grandparent', newPhone: '', newIdLast4: '',
  idPhotoUrl: '', validFrom: '', validUntil: '', newTime: '17:00', reason: ''
})
function openChange(c: Child, type: 'person' | 'time') {
  const t = todayStamps()
  Object.assign(changeForm, {
    open: true, childId: c.id, childName: c.name, changeType: type,
    newPersonName: '', newRelation: 'grandparent', newPhone: '', newIdLast4: '',
    idPhotoUrl: '', validFrom: t.from, validUntil: t.until,
    newTime: pickup(c.id)?.scheduledTime || '17:00', reason: ''
  })
}
async function submitChange() {
  const body: any = { childId: changeForm.childId, changeType: changeForm.changeType, requestedBy: auth.user?.name }
  if (changeForm.changeType === 'person') {
    if (!changeForm.newPersonName.trim()) { ui.show('请填写接送人姓名', 'err'); return }
    if (!changeForm.idPhotoUrl) { ui.show('请上传身份证照片', 'err'); return }
    if (!changeForm.reason.trim()) { ui.show('请填写接送原因', 'err'); return }
    Object.assign(body, {
      newPersonName: changeForm.newPersonName,
      newRelation: changeForm.newRelation,
      newPhone: changeForm.newPhone,
      newIdLast4: changeForm.newIdLast4,
      idPhotoUrl: changeForm.idPhotoUrl,
      // datetime-local('YYYY-MM-DDTHH:MM') → 服务端要求 'YYYY-MM-DD HH:MM'
      validFrom: changeForm.validFrom.replace('T', ' '),
      validUntil: changeForm.validUntil.replace('T', ' '),
      reason: changeForm.reason
    })
  } else {
    body.newTime = changeForm.newTime
    body.reason = changeForm.reason
  }
  await api.pickupChange(body)
  changeForm.open = false
  ui.show('申请已提交，等待班主任核身批准')
}
async function confirm(c: Child) {
  await api.confirmDaily(c.id, auth.user?.name || '家长')
  ui.show('已确认当日记录')
}
</script>

<style scoped>
.phone { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.phone-card { background: #fff; border-radius: 18px; box-shadow: var(--shadow); padding: 16px; }
.child-head { display: flex; align-items: center; gap: 10px; }
.big-emoji { font-size: 38px; }
.info-box { background: #fafbfe; border-radius: 12px; padding: 10px 12px; margin-top: 10px; }
.temp-line { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.temp { font-size: 20px; font-weight: 800; color: var(--green); }
.temp.hot { color: var(--red); }
.teacher-line { margin-top: 8px; font-size: 13px; background: var(--blue-bg); padding: 8px 12px; border-radius: 10px; }
.sub { margin-top: 12px; }
.sub h4 { font-size: 13px; margin-bottom: 6px; }
.med-line, .msg { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 5px 0; flex-wrap: wrap; }
.pickup-box { background: #fff7ef; border-radius: 12px; padding: 10px 12px; }
.pickup-line { display: flex; justify-content: space-between; gap: 10px; }
.pickup-photo { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.pickup-photo img { width: 96px; height: 96px; border-radius: 10px; object-fit: cover; border: 2px solid #fff; box-shadow: var(--shadow); }
.change-status { font-size: 12px; margin-top: 8px; padding: 6px 8px; background: #fff; border-radius: 8px; }
.pin-box { display: inline-block; margin-left: 6px; color: var(--purple); font-weight: 700; }
.auth-list { margin-top: 8px; }
.person-line { padding: 3px 0; }
.iso-box { background: var(--red-bg); border-radius: 12px; padding: 10px 12px; }
.iso-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.advice-box { background: #fff; border-radius: 8px; padding: 8px 10px; font-size: 13px; line-height: 1.6; }
.confirm-box { margin-top: 12px; text-align: center; font-size: 13px; color: var(--green); font-weight: 700; }
.green { color: var(--green); }
.red { color: var(--red); }
.muted { color: var(--ink-2); }
</style>
