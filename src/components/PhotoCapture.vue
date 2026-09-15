<template>
  <div>
    <div v-if="!dataUrl" class="photo-box" @click="startCamera">
      <span style="font-size:22px">📷</span>
      <span class="small">接送拍照</span>
    </div>
    <div v-else class="photo-preview">
      <img :src="dataUrl" alt="接送照片" />
      <div class="row" style="gap:6px; margin-top:6px">
        <button type="button" class="btn btn-sm" @click="startCamera">重拍</button>
        <button type="button" class="btn btn-sm" @click="clear">清除</button>
      </div>
    </div>
    <input ref="fileInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onFile" />
    <video v-if="streaming" ref="video" autoplay playsinline class="cam"></video>
    <div v-if="streaming" class="cam-actions">
      <button type="button" class="btn btn-primary btn-sm" @click="snap">📸 拍照</button>
      <button type="button" class="btn btn-sm" @click="chooseFile">相册上传</button>
      <button type="button" class="btn btn-sm" @click="stopCamera">取消</button>
    </div>
    <p v-if="error" class="small" style="color:var(--red)">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { fileToDataUrl, compressDataUrl } from '../helpers'

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const props = defineProps<{ modelValue?: string }>()

const dataUrl = ref(props.modelValue || '')
const streaming = ref(false)
const error = ref('')
const video = ref<HTMLVideoElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let stream: MediaStream | null = null

async function startCamera() {
  error.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    streaming.value = true
    setTimeout(() => { if (video.value) video.value.srcObject = stream }, 50)
  } catch {
    chooseFile()
  }
}
function chooseFile() { stopCamera(); fileInput.value?.click() }
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const raw = await fileToDataUrl(f)
  await setData(await compressDataUrl(raw))
}
function snap() {
  if (!video.value) return
  const canvas = document.createElement('canvas')
  canvas.width = video.value.videoWidth || 480
  canvas.height = video.value.videoHeight || 360
  canvas.getContext('2d')!.drawImage(video.value, 0, 0)
  setData(canvas.toDataURL('image/jpeg', 0.72))
  stopCamera()
}
async function setData(v: string) {
  dataUrl.value = await compressDataUrl(v)
  emit('update:modelValue', dataUrl.value)
}
function stopCamera() {
  streaming.value = false
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}
function clear() { dataUrl.value = ''; emit('update:modelValue', '') }

onBeforeUnmount(stopCamera)
</script>

<style scoped>
.photo-preview img { width: 120px; height: 120px; object-fit: cover; border-radius: 12px; border: 1px solid var(--line); }
.cam { width: 220px; border-radius: 12px; margin-top: 8px; background: #000; }
.cam-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
</style>
