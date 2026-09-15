export const relationLabel: Record<string, string> = {
  parent: '家长', grandparent: '祖辈', nanny: '保姆', temporary: '临时授权人'
}

export const conclusionLabel: Record<string, string> = {
  admit: '准予入园', observe: '加强观察', home: '建议回家'
}

export const actionLabel: Record<string, string> = {
  join: '安排入班', observe: '留班观察', home: '通知接回'
}

export function hhmmNow() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function timeShort(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

// 压缩 dataUrl，避免 localStorage / 请求体过大
export function compressDataUrl(dataUrl: string, maxSize = 480, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
