<template>
  <div class="handheld col">
    <!-- 晨检进度 -->
    <div class="card">
      <div class="spread">
        <h3>🩺 今日晨检 <span class="muted small">{{ data.state.date }}</span></h3>
        <div class="small">
          <span class="badge badge-green">已检 {{ checked.length }}</span>
          <span class="badge badge-gray" style="margin-left:6px">未检 {{ unchecked.length }}</span>
        </div>
      </div>
      <div class="child-grid">
        <button v-for="c in children" :key="c.id" class="child-card"
          :class="hcMap[c.id]?.conclusion || 'none'" @click="openCheck(c)">
          <span class="emoji">{{ c.emoji }}</span>
          <b>{{ c.name }}</b>
          <span class="cls small muted">{{ shortClass(c.classId) }}</span>
          <span v-if="hcMap[c.id]" class="badge" :class="concClass(hcMap[c.id].conclusion)">
            {{ conclusionLabel[hcMap[c.id].conclusion] }}
          </span>
          <span v-else class="badge badge-gray">未晨检</span>
          <span v-if="hcMap[c.id]?.temperature" class="temp"
            :class="(hcMap[c.id].temperature! >= 37.3) ? 'hot' : ''">{{ hcMap[c.id].temperature }}℃</span>
        </button>
      </div>
    </div>

    <!-- 用药执行监控 -->
    <div class="card">
      <h3>💊 带药与用药执行（时间变更实时同步各方）</h3>
      <table v-if="meds.length" class="tbl">
        <thead><tr><th>幼儿</th><th>药品</th><th>计划</th><th>实际</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="m in meds" :key="m.id">
            <td><b>{{ childName(m.childId) }}</b></td>
            <td>{{ m.medName }} {{ m.dose }}</td>
            <td>{{ m.plannedTime }}</td>
            <td>{{ m.actualTime || '—' }}</td>
            <td>
              <span class="badge" :class="m.status === 'done' ? 'badge-green' : 'badge-amber'">
                {{ m.status === 'done' ? '已服用' : '待服用' }}
              </span>
            </td>
            <td v-if="m.status !== 'done'">
              <button class="btn btn-sm" @click="changeMedTime(m)">改时间</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted small">今日暂无带药登记</p>
    </div>

    <!-- 次日晨检重点提醒（来自昨日发热隔离/同班异常） -->
    <div v-if="morningFlags.length" class="card" style="border-left:4px solid var(--red)">
      <h3>🔔 次日晨检重点提醒</h3>
      <div v-for="c in morningFlags" :key="c.id" class="flag-item">
        <span style="font-size:20px">{{ c.emoji }}</span>
        <b>{{ c.name }}</b> <span class="muted small">{{ shortClass(c.classId) }}</span>
        <span v-if="c.isolated" class="badge badge-red">昨日发热隔离，需复核退热与返园证明</span>
        <span v-if="c.contact" class="badge badge-amber">昨日同班观察异常，重点晨检</span>
        <button class="btn btn-sm" style="margin-left:auto" @click="openCheck(c)">立即晨检</button>
      </div>
    </div>

    <!-- 园内发热隔离工作台 -->
    <div class="card">
      <div class="spread">
        <h3>🏥 园内发热隔离（午后发热处置闭环）</h3>
        <button class="btn btn-primary btn-sm" @click="openIso">+ 登记发热隔离</button>
      </div>
      <div v-if="!isolations.length" class="muted small">今日暂无隔离记录</div>
      <div v-for="fi in isolations" :key="fi.id" class="iso-item">
        <div class="spread">
          <div>
            <b style="font-size:15px">{{ childName(fi.childId) }}</b>
            <span class="muted small">{{ shortClass(childById(fi.childId)?.classId || '') }} · {{ fi.isolationRoom }} · {{ fi.startTime }} 起</span>
            <span class="badge" :class="fi.status === 'released' ? 'badge-gray' : 'badge-red'">
              {{ fi.status === 'released' ? `已解除 ${fi.releasedAt || ''}` : fi.status === 'advised' ? '已建议就医' : '隔离中' }}
            </span>
            <span class="badge badge-red">{{ fi.temperature }}℃</span>
            <span v-for="s in fi.symptoms" :key="s" class="badge badge-amber">{{ s }}</span>
          </div>
          <div class="row" style="gap:6px">
            <button v-if="fi.status !== 'released'" class="btn btn-sm btn-primary" @click="openAdvice(fi)">带回就医建议</button>
            <button v-if="fi.status !== 'released'" class="btn btn-sm" @click="release(fi)">解除隔离</button>
          </div>
        </div>
        <dl class="kv" style="margin-top:6px">
          <dt>通知家长</dt><dd>{{ fi.parentNotifiedAt || '—' }}</dd>
          <dt>同班接触</dt><dd>{{ fi.classContact || '—' }}</dd>
          <dt>就医建议</dt><dd>{{ fi.medicalAdvice || '待生成' }} <span v-if="fi.adviceAt" class="muted small">（{{ fi.adviceAt }} {{ fi.adviceBy }}）</span></dd>
        </dl>
        <div v-if="classmateObs(fi.id).length" class="co-list">
          <b class="small">同班观察：</b>
          <span v-for="co in classmateObs(fi.id)" :key="co.id" class="co-chip" :class="{ ab: co.abnormal }">
            {{ childName(co.childId) }}{{ co.cough ? '·咳嗽' : '' }}{{ co.absent ? '·缺勤' : '' }}{{ co.temperature ? '·' + co.temperature + '℃' : '' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 消毒安排 -->
    <div class="card">
      <h3>🧴 班级消毒安排（完成后通知保育员并进入班级记录）</h3>
      <div v-for="sp in sanitationPlans" :key="sp.id" class="sp-item small">
        <span class="badge" :class="sp.status === 'done' ? 'badge-green' : 'badge-amber'">{{ sp.status === 'done' ? '已消毒' : '待消毒' }}</span>
        <b>{{ className(sp.classId) }}</b>
        {{ sp.dueTime }} 前 · {{ sp.scope }}
        <span class="muted">{{ sp.reason }}｜通知 {{ sp.notifiedCleaner }}</span>
        <span v-if="sp.doneAt" class="green">{{ sp.doneAt }} {{ sp.doneBy }} 完成</span>
      </div>
      <div class="row" style="margin-top:10px">
        <select v-model="spForm.classId" class="grow" style="max-width:170px">
          <option value="">选择班级</option>
          <option v-for="c in data.state.classes" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <input v-model="spForm.scope" class="grow" placeholder="消毒范围：午睡室、口杯毛巾、玩具表面…" />
        <input v-model="spForm.dueTime" type="time" style="max-width:110px" />
        <button class="btn btn-primary btn-sm" @click="addSanitation">安排并通知保育员</button>
      </div>
    </div>

    <!-- 发热隔离登记弹窗 -->
    <div v-if="isoForm.open" class="modal-mask" @click.self="isoForm.open = false">
      <div class="modal">
        <h3>登记午后发热隔离</h3>
        <label class="field"><span>幼儿</span>
          <select v-model="isoForm.childId">
            <option value="" disabled>请选择</option>
            <option v-for="c in data.state.children" :key="c.id" :value="c.id">{{ c.emoji }} {{ c.name }}（{{ shortClass(c.classId) }}）</option>
          </select>
        </label>
        <div class="row">
          <label class="field grow"><span>体温 (℃)</span><input v-model.number="isoForm.temperature" type="number" step="0.1" /></label>
          <label class="field grow"><span>隔离室</span>
            <select v-model="isoForm.isolationRoom">
              <option>保健观察室</option><option>临时隔离室A</option><option>临时隔离室B</option>
            </select>
          </label>
          <label class="field grow"><span>开始时间（不得晚于当前）</span><input v-model="isoForm.startTime" type="time" :max="nowHHMM" /></label>
        </div>
        <label class="field"><span>伴随症状</span>
          <div class="chips">
            <button v-for="s in symptomOptions" :key="s" type="button" class="chip"
              :class="{ 'on-red': isoForm.symptoms.includes(s) }" @click="toggleSymptom(s)">{{ s }}</button>
          </div>
        </label>
        <label class="field"><span>通知家长时间（补录不得早于开始）</span><input v-model="isoForm.parentNotifiedAt" type="time" :max="nowHHMM" /></label>
        <label class="field"><span>同班接触情况</span>
          <textarea v-model="isoForm.classContact" rows="2" placeholder="如同餐、午睡邻床、共同活动的儿童与范围" />
        </label>
        <div class="spread">
          <button class="btn" @click="isoForm.open = false">取消</button>
          <button class="btn btn-primary" @click="saveIso">登记并通知班主任/园长/保育员</button>
        </div>
      </div>
    </div>

    <!-- 就医建议弹窗 -->
    <div v-if="adviceTarget" class="modal-mask" @click.self="adviceTarget = null">
      <div class="modal">
        <h3>带回就医建议 · {{ childName(adviceTarget.childId) }}</h3>
        <p class="small muted">将通过家长端推送并写入当日档案；建议明确就诊科室、返园条件。补录历史时不得早于隔离开始（{{ adviceTarget.startTime }}）。</p>
        <label class="field"><span>建议内容</span><textarea v-model="adviceText" rows="4"
          placeholder="如：立即带回就医，行退热及呼吸道检查，退热满48小时、凭医疗机构返园证明复园" /></label>
        <div class="row">
          <label class="field grow"><span>家长通知时间</span><input v-model="adviceNotifyAt" type="time" :max="nowHHMM" /></label>
          <label class="field grow"><span>建议发生时间</span><input v-model="adviceAt" type="time" :max="nowHHMM" /></label>
        </div>
        <div class="spread">
          <button class="btn" @click="adviceTarget = null">取消</button>
          <button class="btn btn-primary" @click="saveAdvice">生成建议并通知家长</button>
        </div>
      </div>
    </div>

    <!-- 晨检弹窗 -->
    <div v-if="current" class="modal-mask" @click.self="current = null">
      <div class="modal">
        <h3>晨检登记 · {{ current.name }}</h3>
        <div class="row">
          <label class="field grow">
            <span>体温 (℃)</span>
            <input v-model.number="form.temperature" type="number" step="0.1" placeholder="36.8" />
          </label>
          <div class="grow">
            <span class="lbl">症状排查</span>
            <div class="chips">
              <button type="button" class="chip" :class="{ 'on-red': form.cough }" @click="form.cough = !form.cough">咳嗽</button>
              <button type="button" class="chip" :class="{ 'on-red': form.rash }" @click="form.rash = !form.rash">皮疹</button>
            </div>
          </div>
        </div>

        <span class="lbl">自带药品（名称 / 剂量 / 服用时间）</span>
        <div v-for="(m, i) in form.medicine" :key="i" class="med-row">
          <input v-model="m.name" placeholder="药品名称" />
          <input v-model="m.dose" placeholder="剂量 如5ml" style="max-width:110px" />
          <input v-model="m.time" type="time" style="max-width:120px" />
          <button class="btn btn-sm" @click="form.medicine.splice(i, 1)">删</button>
        </div>
        <button class="btn btn-sm" style="margin:6px 0 12px" @click="form.medicine.push({ name: '', dose: '', time: '12:30' })">+ 添加药品</button>

        <label class="field">
          <span>早餐情况</span>
          <input v-model="form.breakfast" placeholder="如：正常 / 少量 / 未吃" />
        </label>
        <label class="field">
          <span>情绪</span>
          <div class="chips">
            <button v-for="o in moodOptions" :key="o" type="button" class="chip"
              :class="{ on: form.mood === o }" @click="form.mood = o">{{ o }}</button>
          </div>
        </label>
        <label class="field">
          <span>特殊物品携带</span>
          <input v-model="form.specialItems" placeholder="如：退烧药、过敏食物、安抚玩具；无则填无" />
        </label>

        <span class="lbl">晨检结论（班主任将据此安排入班/观察/回家）</span>
        <div class="chips" style="margin-bottom:12px">
          <button type="button" class="chip" :class="{ 'on-green': form.conclusion === 'admit' }" @click="form.conclusion = 'admit'">✅ 准予入园</button>
          <button type="button" class="chip" :class="{ on: form.conclusion === 'observe' }" @click="form.conclusion = 'observe'">👀 加强观察</button>
          <button type="button" class="chip" :class="{ 'on-red': form.conclusion === 'home' }" @click="form.conclusion = 'home'">🏠 建议回家</button>
        </div>
        <p v-if="autoHint" class="hint">{{ autoHint }}</p>

        <label class="field">
          <span>备注 / 家长嘱托</span>
          <textarea v-model="form.note" rows="2" />
        </label>

        <div class="spread">
          <button class="btn" @click="current = null">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">保存并同步五端</button>
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
import type { Child, HealthCheck, MedPlan, FeverIsolation } from '../types'
import { conclusionLabel, hhmmNow } from '../helpers'

const data = useDataStore()
const auth = useAuthStore()
const ui = useUiStore()

const children = computed(() =>
  [...data.state.children].sort((a, b) => a.classId.localeCompare(b.classId) || a.name.localeCompare(b.name)))
const hcMap = computed(() => data.healthByChild)
const checked = computed(() => children.value.filter(c => hcMap.value[c.id]))
const unchecked = computed(() => children.value.filter(c => !hcMap.value[c.id]))
const meds = computed<MedPlan[]>(() => data.state.medPlans)

const current = ref<Child | null>(null)
const saving = ref(false)
const form = ref<any>({})
const moodOptions = ['😀 兴奋', '🙂 愉快', '😐 平静', '😟 低落', '😢 哭闹']

function shortClass(id: string) { return data.className(id).split(' · ')[0] }
function childName(id: string) { return data.childById(id)?.name || '—' }
function concClass(c: string) { return c === 'admit' ? 'badge-green' : c === 'observe' ? 'badge-amber' : 'badge-red' }

const autoHint = computed(() => {
  const t = Number(form.value.temperature)
  if (t >= 37.3) return '⚠ 体温≥37.3℃，建议「加强观察」或「建议回家」，系统已自动通知班主任/门卫/园长/家长。'
  if (form.value.rash) return '⚠ 发现皮疹，结合同班传染病观察提示，建议加强观察并通知园长。'
  return ''
})

function openCheck(c: Child) {
  const old: HealthCheck | undefined = hcMap.value[c.id]
  current.value = c
  form.value = {
    temperature: old?.temperature ?? '',
    cough: !!old?.cough,
    rash: !!old?.rash,
    medicine: data.parseMedicine(old?.medicine).length ? data.parseMedicine(old?.medicine) : [],
    breakfast: old?.breakfast || '',
    mood: old?.mood || '🙂 愉快',
    specialItems: old?.specialItems || '',
    conclusion: old?.conclusion || 'admit',
    note: old?.note || ''
  }
}

async function save() {
  if (!form.value.temperature) { ui.show('请填写体温', 'err'); return }
  saving.value = true
  try {
    await api.saveHealthCheck({
      childId: current.value!.id,
      temperature: Number(form.value.temperature),
      cough: form.value.cough,
      rash: form.value.rash,
      medicine: form.value.medicine.filter((m: any) => m.name),
      breakfast: form.value.breakfast,
      mood: form.value.mood,
      specialItems: form.value.specialItems,
      conclusion: form.value.conclusion,
      note: form.value.note,
      byUser: auth.user?.name
    })
    ui.show('晨检已保存，五端实时同步')
    current.value = null
    await data.fetchState()
  } catch (e: any) {
    ui.show(e.message, 'err')
  } finally {
    saving.value = false
  }
}

async function changeMedTime(m: MedPlan) {
  const t = window.prompt(`将「${m.medName}」服药时间改为（HH:MM）`, m.plannedTime)
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return
  try {
    await api.medChangeTime(m.id, { plannedTime: t, reason: '保健老师调整', byUser: auth.user?.name })
    ui.show('服药时间已变更并同步')
  } catch (e: any) { ui.show(e.message, 'err') }
}

// ---------- 次日晨检提醒 / 发热隔离 / 消毒 ----------
function childById(id?: string | null) { return data.childById(id) }
function className(id?: string | null) { return data.className(id) }
const morningFlags = computed(() => {
  const flags = data.state.nextDayMorningFlags || {}
  return data.state.children
    .filter(c => flags[c.id] && (flags[c.id].isolatedYesterday || flags[c.id].abnormalContactYesterday))
    .map(c => ({
      ...c,
      isolated: flags[c.id].isolatedYesterday,
      contact: flags[c.id].abnormalContactYesterday
    }))
})
const isolations = computed<FeverIsolation[]>(() =>
  [...data.state.feverIsolations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const sanitationPlans = computed(() =>
  [...data.state.sanitationPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
function classmateObs(isoId: string) {
  return data.state.classmateObservations.filter(co => co.isolationId === isoId)
}

// 每分钟刷新当前时刻，供 time 输入 max 使用
const nowHHMM = ref(hhmmNow())
setInterval(() => { nowHHMM.value = hhmmNow() }, 30_000)

const symptomOptions = ['咳嗽', '皮疹', '咽痛', '呕吐', '精神差', '腹泻']
const isoForm = reactive({
  open: false, childId: '', temperature: 38.0, symptoms: [] as string[],
  isolationRoom: '保健观察室', startTime: hhmmNow(), parentNotifiedAt: hhmmNow(), classContact: ''
})
function openIso() {
  Object.assign(isoForm, {
    open: true, childId: '', temperature: 38.0, symptoms: [],
    isolationRoom: '保健观察室', startTime: hhmmNow(), parentNotifiedAt: hhmmNow(), classContact: ''
  })
}
function toggleSymptom(s: string) {
  const i = isoForm.symptoms.indexOf(s)
  if (i >= 0) isoForm.symptoms.splice(i, 1); else isoForm.symptoms.push(s)
}
async function saveIso() {
  if (!isoForm.childId) { ui.show('请选择幼儿', 'err'); return }
  if (!(isoForm.temperature >= 37.3)) { ui.show('体温需 ≥37.3℃', 'err'); return }
  if (isoForm.startTime > nowHHMM.value) { ui.show('开始时间不能晚于当前时刻', 'err'); return }
  if (isoForm.parentNotifiedAt && isoForm.parentNotifiedAt < isoForm.startTime) {
    ui.show('家长通知时间不能早于隔离开始', 'err'); return
  }
  try {
    await api.createIsolation({ ...isoForm })
    ui.show('隔离已登记，班主任/保育员已联动')
    isoForm.open = false
  } catch (e: any) { ui.show(e.message, 'err') }
}

const adviceTarget = ref<FeverIsolation | null>(null)
const adviceText = ref('')
const adviceNotifyAt = ref(hhmmNow())
const adviceAt = ref(hhmmNow())
function openAdvice(fi: FeverIsolation) {
  adviceTarget.value = fi
  adviceText.value = fi.medicalAdvice || '建议立即带回就医，行退热及相关检查，退热满48小时、凭医疗机构返园证明复园。'
  adviceNotifyAt.value = fi.parentNotifiedAt || hhmmNow()
  adviceAt.value = hhmmNow()
}
async function saveAdvice() {
  if (!adviceTarget.value) return
  if (adviceAt.value < adviceTarget.value.startTime) { ui.show('建议时间不能早于隔离开始', 'err'); return }
  if (adviceNotifyAt.value > adviceAt.value) { ui.show('家长通知不能晚于建议时间', 'err'); return }
  await api.isolationAdvice(adviceTarget.value.id, {
    advice: adviceText.value, adviceAt: adviceAt.value, parentNotifiedAt: adviceNotifyAt.value
  })
  ui.show('就医建议已推送家长端并入档')
  adviceTarget.value = null
}
async function release(fi: FeverIsolation) {
  await api.isolationRelease(fi.id, { releasedAt: hhmmNow() })
  ui.show('隔离已解除')
}

const spForm = reactive({ classId: '', scope: '', dueTime: '17:00' })
async function addSanitation() {
  if (!spForm.classId || !spForm.scope.trim()) { ui.show('请选择班级并填写消毒范围', 'err'); return }
  const isoForClass = isolations.value.find(fi => childById(fi.childId)?.classId === spForm.classId && fi.status !== 'released')
  await api.sanitationPlan({
    ...spForm,
    reason: isoForClass ? `关联发热隔离：${childName(isoForClass.childId)} ${isoForClass.temperature}℃` : '预防性消毒'
  })
  spForm.scope = ''
  ui.show('消毒安排已通知保育员')
}
</script>

<style scoped>
.child-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.child-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: #fff; cursor: pointer; text-align: left;
}
.child-card:hover { border-color: var(--brand); box-shadow: 0 4px 14px rgba(255,138,61,.15); }
.child-card.home { border-left: 4px solid var(--red); }
.child-card.observe { border-left: 4px solid var(--amber); }
.child-card.admit { border-left: 4px solid var(--green); }
.emoji { font-size: 26px; }
.temp { font-size: 12px; color: var(--green); font-weight: 700; }
.temp.hot { color: var(--red); }
.lbl { display: block; font-size: 12px; color: var(--ink-2); font-weight: 600; margin-bottom: 4px; }
.med-row { display: flex; gap: 6px; margin-bottom: 6px; }
.hint { font-size: 12px; color: #b45309; background: var(--amber-bg); padding: 7px 10px; border-radius: 8px; margin: 0 0 10px; }
.flag-item, .iso-item, .sp-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap; }
.iso-item:last-child, .sp-item:last-child, .flag-item:last-child { border-bottom: none; }
.co-list { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; align-items: center; }
.co-chip { font-size: 12px; background: #eef1f7; border-radius: 999px; padding: 3px 10px; }
.co-chip.ab { background: var(--red-bg); color: var(--red); font-weight: 700; }
.green { color: var(--green); font-weight: 700; }
</style>
