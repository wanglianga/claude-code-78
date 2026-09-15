import { defineStore } from 'pinia'
import { api } from '../api'
import type { User } from '../types'

interface Session { user: User; token: string }

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: JSON.parse(localStorage.getItem('kg_auth') || 'null') as Session | null
  }),
  getters: {
    user: (s) => s.session?.user || null,
    token: (s) => s.session?.token || null
  },
  actions: {
    async login(username: string, password: string) {
      const r = await api.login(username, password)
      this.session = { user: r.user, token: r.token }
      localStorage.setItem('kg_auth', JSON.stringify(this.session))
      localStorage.removeItem('kg_user')
      return r.user
    },
    async logout() {
      await api.logout()
      this.session = null
      localStorage.removeItem('kg_auth')
    }
  }
})
