<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="hero">
        <div class="logo-big">🧸</div>
        <h1>阳光幼儿园</h1>
        <p class="muted">晨检接送与临时托管协同平台</p>
        <p class="small muted">保健老师 · 班主任 · 门卫 · 园长 · 家长 —— 同一幼儿状态，实时一致</p>
      </div>

      <div class="form">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" placeholder="如 health" @keyup.enter="doLogin" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" placeholder="演示密码 123456" @keyup.enter="doLogin" />
        </label>
        <button class="btn btn-primary login-btn" :disabled="loading" @click="doLogin">
          {{ loading ? '登录中…' : '登录' }}
        </button>
        <p v-if="err" class="err-msg">{{ err }}</p>
      </div>

      <div class="demo">
        <h4>演示账号（密码均为 123456）</h4>
        <div class="acct-grid">
          <button v-for="a in accounts" :key="a.u" class="acct" @click="pick(a)">
            <span class="acct-icon">{{ a.icon }}</span>
            <b>{{ a.label }}</b>
            <span class="muted small">{{ a.u }}</span>
          </button>
        </div>
        <p class="small muted">视图：老师手持设备（保健/班主任）· 门卫大屏 · 家长端（手机）</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { useUiStore } from '../store/ui'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const username = ref('')
const password = ref('123456')
const loading = ref(false)
const err = ref('')

const accounts = [
  { u: 'health', label: '林保健 · 保健老师', icon: '🩺' },
  { u: 'teacher1', label: '王老师 · 小一班', icon: '👩‍🏫' },
  { u: 'guard', label: '陈门卫 · 门卫大屏', icon: '🛡️' },
  { u: 'principal', label: '刘园长', icon: '👔' },
  { u: 'parent1', label: '李妈妈 · 家长端', icon: '👩' },
  { u: 'parent2', label: '张爸爸 · 家长端', icon: '👨' }
]
function pick(a: { u: string }) { username.value = a.u; password.value = '123456'; err.value = '' }

async function doLogin() {
  if (!username.value) { err.value = '请输入用户名'; return }
  loading.value = true
  err.value = ''
  try {
    const u = await auth.login(username.value.trim(), password.value)
    ui.show(`欢迎，${u.name}`)
    router.push(`/${u.role}`)
  } catch (e: any) {
    err.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px;
  background: linear-gradient(140deg, #ffe9d6, #f4f6fb 55%, #e8f0fe);
}
.login-card {
  width: 100%; max-width: 860px; background: #fff; border-radius: 22px; box-shadow: 0 20px 60px rgba(31,42,68,.14);
  display: grid; grid-template-columns: 1fr 1fr; overflow: hidden;
}
.hero {
  background: linear-gradient(160deg, #ff8a3d, #ff6d5a); color: #fff; padding: 40px 32px;
  display: flex; flex-direction: column; justify-content: center; gap: 6px;
}
.hero .muted { color: rgba(255,255,255,.88); }
.logo-big { font-size: 56px; }
.hero h1 { font-size: 28px; margin-top: 8px; }
.form { padding: 40px 32px 16px; }
.login-btn { width: 100%; padding: 11px; font-size: 15px; margin-top: 6px; }
.err-msg { color: var(--red); font-size: 13px; margin-top: 8px; }
.demo { grid-column: 1 / -1; padding: 18px 32px 28px; border-top: 1px dashed var(--line); }
.demo h4 { margin-bottom: 10px; }
.acct-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.acct {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  border: 1px solid var(--line); background: #fafbfe; border-radius: 12px; padding: 10px 12px; cursor: pointer;
  text-align: left;
}
.acct:hover { border-color: var(--brand); background: #fff7ef; }
.acct-icon { font-size: 20px; }
@media (max-width: 720px) {
  .login-card { grid-template-columns: 1fr; }
  .hero { padding: 28px; }
  .acct-grid { grid-template-columns: 1fr 1fr; }
}
</style>
