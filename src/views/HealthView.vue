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
import { computed, ref } from 'vue'
import { useDataStore } from '../store/data'
import { useAuthStore } from '../store/auth'
import { useUiStore } from '../store/ui'
import { api } from '../api'
import type { Child, HealthCheck, MedPlan } from '../types'
import { conclusionLabel } from '../helpers'

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
</style>
