import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    toast: '' as string,
    toastKind: 'ok' as 'ok' | 'err',
    timer: 0 as any
  }),
  actions: {
    show(msg: string, kind: 'ok' | 'err' = 'ok') {
      this.toast = msg
      this.toastKind = kind
      clearTimeout(this.timer)
      this.timer = setTimeout(() => { this.toast = '' }, 2600)
    }
  }
})
