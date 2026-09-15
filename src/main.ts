import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Login from './views/Login.vue'
import HealthView from './views/HealthView.vue'
import TeacherView from './views/TeacherView.vue'
import GuardView from './views/GuardView.vue'
import PrincipalView from './views/PrincipalView.vue'
import ParentView from './views/ParentView.vue'
import CleanerView from './views/CleanerView.vue'
import DailyView from './views/DailyView.vue'
import { useAuthStore } from './store/auth'
import './styles.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login },
    { path: '/', redirect: () => {
      const s = JSON.parse(localStorage.getItem('kg_auth') || 'null')
      return s?.user ? `/${s.user.role}` : '/login'
    }},
    { path: '/health', component: HealthView, meta: { roles: ['health'] } },
    { path: '/teacher', component: TeacherView, meta: { roles: ['teacher'] } },
    { path: '/guard', component: GuardView, meta: { roles: ['guard'] } },
    { path: '/principal', component: PrincipalView, meta: { roles: ['principal'] } },
    { path: '/parent', component: ParentView, meta: { roles: ['parent'] } },
    { path: '/cleaner', component: CleanerView, meta: { roles: ['cleaner'] } },
    { path: '/daily', component: DailyView, meta: { roles: ['health', 'teacher', 'principal'] } }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path !== '/login' && !auth.user) return '/login'
  const roles = to.meta.roles as string[] | undefined
  if (roles && auth.user && !roles.includes(auth.user.role)) return `/${auth.user.role}`
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
