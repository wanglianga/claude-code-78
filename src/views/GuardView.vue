<template>
  <div class="bigscreen">
    <!-- 离线横幅 -->
    <div v-if="!effectiveOnline" class="offline-banner">
      ⚠ 网络异常 · 门卫端离线记录中 —— 接送记录保存在本机，恢复后自动补同步，授权以本机最后一次同步名单为准
      <span class="badge badge-amber pulse" style="margin-left:10px">待补同步 {{ offline.pendingCount }} 条</span>
    </div>

    <div class="board-grid">
      <!-- 左：核验放行 -->
      <div class="col">
        <div class="card verify-card">
          <div class="spread">
            <h3 style="font-size:18px">🛡️ 接送核验放行</h3>
            <button class="btn btn-sm" :class="data.simOffline ? 'btn-red' : ''" @click="toggleSimOffline">
              {{ data.simOffline ? '🔴 演示断网中（点击恢复）' : '📶 模拟断网' }}
            </button>
          </div>

          <label class="field">
            <span style="font-size:14px">选择幼儿（搜索姓名）</span>
            <input v-model="keyword" placeholder="输入幼儿姓名…" class="big-input" />
          </label>
          <div v-if="filteredChildren.length" class="child-pick">
            <button v-for="c in filteredChildren.slice(0, 8)" :key="c.id" class="child-pick-btn"
              :class="{ sel: child?.id === c.id }" @click="pickChild(c)">
              <span style="font-size:22px">{{ c.emoji }}</span>
              <b>{{ c.name }}</b>
              <span class="small muted">{{ shortClass(c.classId) }}</span>
              <span v-if="needsHome(c.id)" class="badge badge-red">晨检建议回家</span>
            </button>
          </div>

          <div v-if="child" class="person-panel">
            <template v-if="pickup">
              <div class="person-head">
                <div>
                  <div class="small muted">当前有效接送授权（每次变更实时更新）</div>
                  <b style="font-size:20px">{{ pickup.personName }}</b>
                  <span class="badge" :class="relClass(pickup.relation)" style="margin-left:8px">
                    {{ relationLabel[pickup.relation || ''] || '临时授权人' }}
                  </span>
                </div>
                <div v-if="pickup.status === 'picked'" class="badge badge-gray">已于 {{ pickup.actualTime }} 接走</div>
              </div>

              <!-- 在线核验授权码 -->
              <template v-if="effectiveOnline && pickup.status !== 'picked'">
                <label class="field"><span>请接送人输入 4 位接送授权码</span>
                  <input v-model="pin" inputmode="numeric" maxlength="4" class="pin-input" placeholder="••••" />
                </label>
                <div class="row" style="gap:10px">
                  <button class="btn btn-primary big-btn" @click="doVerify">① 核验身份</button>
                  <button class="btn btn-red big-btn" @click="openDeny">🚫 拒绝放行</button>
                </div>
                <p v-if="verifyErr" class="verify-err">❌ {{ verifyErr }}</p>
              </template>

              <!-- 离线登记 -->
              <template v-if="!effectiveOnline && pickup.status !== 'picked'">
                <div class="offline-note">
                  离线期间无法在线核验授权码，请登记接送人信息并拍照，回园系统补传后追溯。
                </div>
                <div class="row">
                  <label class="field grow"><span>接送人姓名</span><input v-model="off.personName" /></label>
                  <label class="field grow"><span>与幼儿关系</span>
                    <select v-model="off.relation">
                      <option value="parent">家长</option><option value="grandparent">祖辈</option>
                      <option value="nanny">保姆</option><option value="temporary">临时授权人</option>
                    </select>
                  </label>
                  <label class="field grow"><span>证件后四位</span><input v-model="off.idLast4" maxlength="4" /></label>
                </div>
                <PhotoCapture v-model="off.photoUrl" />
                <div class="row" style="gap:10px; margin-top:10px">
                  <button class="btn btn-primary big-btn" @click="offlineCheckout">📝 离线登记放行</button>
                  <button class="btn btn-red big-btn" @click="openDeny">🚫 拒绝放行</button>
                </div>
              </template>
            </template>
            <p v-else class="muted">该幼儿今日暂无有效接送计划，请联系班主任核实后登记。</p>
          </div>

          <!-- 核验通过后的放行确认 -->
          <div v-if="verified" class="pass-panel">
            <div class="pass-title">✅ 身份核验通过</div>
            <dl class="kv">
              <dt>幼儿</dt><dd><b>{{ child?.name }}</b>（{{ shortClass(child?.classId) }}）</dd>
              <dt>接送人</dt><dd>{{ verified.person.name }} · {{ relationLabel[verified.person.relation] }} · {{ verified.person.phone }}</dd>
              <dt>授权码</dt><dd class="green">✔ 核验正确</dd>
            </dl>
            <div style="margin:10px 0"><PhotoCapture v-model="photoUrl" /></div>
            <div class="row" style="gap:10px">
              <button class="btn btn-green big-btn" @click="onlineCheckout">② 拍照确认放行</button>
              <button class="btn" @click="verified = null">返回</button>
            </div>
          </div>
        </div>

        <!-- 离线待传队列 -->
        <div v-if="offline.events.length" class="card">
          <h3>📤 本机接送记录（{{ effectiveOnline ? '同步状态' : '待联网补传' }}）</h3>
          <div v-for="e in [...offline.events].reverse().slice(0, 6)" :key="e.clientId" class="queue-item">
            <span class="badge" :class="e.synced ? 'badge-green' : 'badge-amber'">
              {{ e.synced ? '已补同步' : '待补传' }}
            </span>
            <b>{{ labelOf(e) }}</b>
            <span class="muted small">{{ new Date(e.createdAt).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
            <span v-if="e.error" class="small" style="color:var(--red)">{{ e.error }}</span>
          </div>
          <button v-if="effectiveOnline && offline.pendingCount" class="btn btn-sm" style="margin-top:8px" @click="offline.flush">
            立即补同步
          </button>
        </div>
      </div>

      <!-- 右：实时大屏 -->
      <div class="col">
        <div class="card stats-card">
          <div class="stat"><b>{{ stats.inSchool }}</b><span>在园待接</span></div>
          <div class="stat green"><b>{{ stats.picked }}</b><span>已接走</span></div>
          <div class="stat red"><b>{{ stats.late }}</b><span>晚接预警</span></div>
          <div class="stat purple"><b>{{ stats.transfer }}</b><span>跨班托管</span></div>
        </div>

        <div class="card board-card">
          <h3 style="font-size:17px">
            今日离园大屏
            <span class="small muted" style="margin-left:auto">最后同步 {{ data.lastSyncAt || '—' }}</span>
          </h3>
          <table class="tbl big-tbl">
            <thead>
              <tr><th>幼儿</th><th>班级</th><th>授权接送人</th><th>计划</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in boardRows" :key="p.id" :class="{ rowlate: p.isLate || (p.status==='planned' && isPastDeadline) }">
                <td><b>{{ childName(p.childId) }}</b>
                  <span v-if="needsHome(p.childId)" class="badge badge-red" style="margin-left:4px">发热接回</span>
                </td>
                <td>{{ shortClass(childById(p.childId)?.classId) }}</td>
                <td>{{ p.personName }}
                  <span class="badge" :class="relClass(p.relation)" style="margin-left:4px">{{ relationLabel[p.relation || ''] || '临时' }}</span>
                </td>
                <td>{{ p.scheduledTime || '—' }}</td>
                <td>
                  <span v-if="p.status === 'picked'" class="badge badge-green">✔ {{ p.actualTime }} 已接走{{ p.isLate ? ' ·晚接' : '' }}</span>
                  <span v-else-if="p.status === 'replaced'" class="badge badge-gray">旧授权已作废</span>
                  <span v-else-if="isPastDeadline" class="badge badge-red pulse">⏰ 超时未接</span>
                  <span v-else class="badge badge-blue">待接</span>
                  <span v-if="p.createdVia === 'offline'" class="badge badge-amber" style="margin-left:4px">离线补传</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>🚦 门卫放行/拦截记录</h3>
          <div v-for="g in data.state.gateLogs.slice(0, 8)" :key="g.id" class="gate-item">
            <span class="badge" :class="g.result === 'pass' ? 'badge-green' : 'badge-red'">
              {{ g.result === 'pass' ? '放行' : '拦截' }}
            </span>
            <b>{{ g.childName || '—' }}</b>
            <span class="muted small">{{ g.personName }} · {{ g.reason }}</span>
            <span class="muted small" style="margin-left:auto">{{ timeShort(g.createdAt) }}{{ g.createdVia === 'offline' ? ' ·补传' : '' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 拦截弹窗 -->
    <div v-if="denyOpen" class="modal-mask" @click.self="denyOpen = false">
      <div class="modal">
        <h3>🚫 未授权拦截登记</h3>
        <div class="row">
          <label class="field grow"><span>来人姓名</span><input v-model="denyForm.personName" /></label>
          <label class="field grow"><span>声称接的幼儿</span>
            <input v-model="denyForm.childName" placeholder="幼儿姓名" />
          </label>
        </div>
        <label class="field"><span>拦截原因</span>
          <select v-model="denyForm.reason">
            <option>不在今日授权名单</option>
            <option>授权码核验失败</option>
            <option>临时授权未审批</option>
            <option>拒绝出示有效证件</option>
          </select>
        </label>
        <div class="spread">
          <button class="btn" @click="denyOpen = false">取消</button>
          <button class="btn btn-red" @click="doDeny">记录拦截并报警园长/班主任</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDataStore } from '../store/data'
import { useOfflineStore } from '../store/offline'
import { useUiStore } from '../store/ui'
import { api } from '../api'
import PhotoCapture from '../components/PhotoCapture.vue'
import { relationLabel, timeShort } from '../helpers'
import type { Child, AuthorizedPerson, Pickup } from '../types'

const data = useDataStore()
const offline = useOfflineStore()
const ui = useUiStore()

const effectiveOnline = computed(() => data.online && !data.simOffline)
function toggleSimOffline() {
  data.simOffline = !data.simOffline
  ;(window as any).__kg_sim_offline = data.simOffline
  if (!data.simOffline) {
    // 恢复网络：立即刷新大屏 + 补传本机记录
    data.fetchState()
    offline.flush()
    ui.show('网络已恢复，开始补同步')
  } else {
    ui.show('已模拟断网：可离线登记接送', 'err')
  }
}
const keyword = ref('')
const child = ref<Child | null>(null)
const pin = ref('')
const verifyErr = ref('')
const verified = ref<{ person: AuthorizedPerson } | null>(null)
const photoUrl = ref('')
const denyOpen = ref(false)
const off = ref({ personName: '', relation: 'temporary', idLast4: '', photoUrl: '' })
const denyForm = ref({ personName: '', childName: '', reason: '不在今日授权名单' })

const filteredChildren = computed(() => {
  const k = keyword.value.trim()
  const list = [...data.state.children].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return k ? list.filter(c => c.name.includes(k)) : list
})
function childById(id?: string | null) { return data.childById(id) }
function childName(id: string) { return data.childById(id)?.name || '—' }
function shortClass(id?: string | null) { return data.className(id).split(' · ')[0] }
function relClass(r?: string) {
  return ({ parent: 'badge-blue', grandparent: 'badge-green', nanny: 'badge-amber', temporary: 'badge-purple' } as Record<string, string>)[r || ''] || 'badge-gray'
}
const pickup = computed<Pickup | undefined>(() =>
  child.value ? data.effectivePickupByChild[child.value.id] : undefined)
function needsHome(childId: string) {
  const hc = data.healthByChild[childId]
  const dec = data.decisionByChild[childId]
  return hc?.conclusion === 'home' || dec?.action === 'home'
}

const boardRows = computed(() =>
  [...data.state.pickups].sort((a, b) => (b.scheduledTime || '').localeCompare(a.scheduledTime || '')))
const isPastDeadline = computed(() => data.localClock > data.state.deadline)

const stats = computed(() => {
  let picked = 0, late = 0
  const inSchoolIds = new Set<string>()
  for (const p of data.state.pickups) {
    if (p.status === 'picked') { picked++; if (p.isLate) late++ }
    if (p.status === 'planned') inSchoolIds.add(p.childId)
  }
  return {
    picked, late,
    inSchool: inSchoolIds.size,
    transfer: data.state.careTransfers.filter(t => t.status === 'active').length
  }
})

function pickChild(c: Child) {
  child.value = c
  pin.value = ''; verifyErr.value = ''; verified.value = null; photoUrl.value = ''
  const p = data.effectivePickupByChild[c.id]
  off.value = { personName: p?.personName || '', relation: (p?.relation as any) || 'parent', idLast4: '', photoUrl: '' }
}

async function doVerify() {
  verifyErr.value = ''
  if (!pickup.value?.personId) { verifyErr.value = '今日无有效授权，请勿放行'; return }
  if (!/^\d{4}$/.test(pin.value)) { verifyErr.value = '请输入 4 位授权码'; return }
  try {
    const r = await api.verify(pickup.value.personId, pin.value)
    if (!r.ok) { verifyErr.value = r.error || '核验失败'; return }
    verified.value = { person: r.person }
    ui.show('身份核验通过，请拍照放行')
  } catch (e: any) {
    verifyErr.value = e.message
  }
}

async function onlineCheckout() {
  if (!verified.value || !child.value || !pickup.value) return
  await api.checkout({
    childId: child.value.id, childName: child.value.name,
    personId: pickup.value.personId, personName: verified.value.person.name,
    relation: verified.value.person.relation,
    pinVerified: true, photoUrl: photoUrl.value, actualTime: undefined
  })
  ui.show('已放行，离园记录同步各方')
  verified.value = null; photoUrl.value = ''; pin.value = ''
}

function offlineCheckout() {
  if (!child.value) return
  if (!off.value.personName) { ui.show('请登记接送人姓名', 'err'); return }
  offline.enqueue('checkout', {
    childId: child.value.id, childName: child.value.name,
    personName: off.value.personName, relation: off.value.relation,
    idLast4: off.value.idLast4, photoUrl: off.value.photoUrl,
    pinVerified: false
  })
  ui.show('已离线记录，联网后自动补同步')
  off.value = { personName: '', relation: 'temporary', idLast4: '', photoUrl: '' }
}

function openDeny() {
  denyForm.value = { personName: '', childName: child.value?.name || '', reason: '不在今日授权名单' }
  denyOpen.value = true
}
async function doDeny() {
  const payload = {
    childId: child.value?.id || null, childName: denyForm.value.childName,
    personName: denyForm.value.personName, reason: denyForm.value.reason
  }
  if (effectiveOnline.value) {
    await api.gateDeny(payload)
    ui.show('已拦截并报警班主任/园长')
  } else {
    offline.enqueue('gate_deny', payload)
    ui.show('拦截已离线记录，恢复后补传报警')
  }
  denyOpen.value = false
}
function labelOf(e: any) {
  if (e.type === 'checkout') return `${e.payload.childName || ''} 由 ${e.payload.personName} 接走`
  if (e.type === 'gate_deny') return `拦截 ${e.payload.personName || '未知人员'}`
  return e.type
}
</script>

<style scoped>
.board-grid { display: grid; grid-template-columns: minmax(380px, 5fr) minmax(420px, 6fr); gap: 14px; align-items: start; }
.big-input { padding: 12px 14px; font-size: 16px; }
.child-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.child-pick-btn {
  display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fafbfe;
  border-radius: 12px; padding: 10px; cursor: pointer; text-align: left;
}
.child-pick-btn.sel { border-color: var(--brand); background: #fff7ef; }
.person-panel { border-top: 1px dashed var(--line); padding-top: 12px; }
.person-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pin-input { width: 180px; font-size: 26px; letter-spacing: 10px; text-align: center; padding: 8px; }
.big-btn { padding: 11px 18px; font-size: 15px; }
.verify-err { color: var(--red); background: var(--red-bg); padding: 8px 12px; border-radius: 8px; font-weight: 700; }
.offline-note { background: var(--amber-bg); color: #92600a; padding: 9px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 10px; }
.pass-panel { background: var(--green-bg); border: 1px solid #bfe8d8; border-radius: 12px; padding: 14px; margin-top: 12px; }
.pass-title { font-size: 17px; font-weight: 800; color: var(--green); margin-bottom: 8px; }
.green { color: var(--green); font-weight: 700; }
.queue-item, .gate-item { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--line); }
.stats-card { display: flex; gap: 10px; }
.stat { flex: 1; text-align: center; background: #f4f6fb; border-radius: 12px; padding: 12px 6px; }
.stat b { display: block; font-size: 28px; color: var(--blue); }
.stat.green b { color: var(--green); }
.stat.red b { color: var(--red); }
.stat.purple b { color: var(--purple); }
.stat span { font-size: 12px; color: var(--ink-2); }
.big-tbl { font-size: 14px; }
.rowlate td { background: #fff5f5 !important; }
.offline-banner {
  background: var(--red); color: #fff; padding: 10px 16px; font-weight: 700;
  border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center;
}
@media (max-width: 1000px) { .board-grid { grid-template-columns: 1fr; } }
</style>
