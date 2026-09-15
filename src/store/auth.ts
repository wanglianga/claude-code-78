import { defineStore } from 'pinia'
import { api } from '../api'
import type { User } from '../types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('kg_user') || 'null') as User | null
  }),
  actions: {
    async login(username: string, password: string) {
      const { user } = await api.login(username, password)
      this.user = user
      localStorage.setItem('kg_user', JSON.stringify(user))
      return user
    },
    logout() {
      this.user = null
      localStorage.removeItem('kg_user')
    }
  }
})
