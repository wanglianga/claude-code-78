// 极简 SSE 事件总线：任一写操作广播一条 sync 事件，所有端收到后拉取同一快照，保证状态一致
const clients = new Set()
let rev = 0

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write(`event: hello\ndata: ${JSON.stringify({ rev, at: new Date().toISOString() })}\n\n`)
  clients.add(res)
  const ping = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`) } catch { /* noop */ }
  }, 25000)
  req.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
}

export function broadcast(kind = 'state', extra = {}) {
  rev += 1
  const payload = JSON.stringify({ rev, kind, at: new Date().toISOString(), ...extra })
  for (const res of clients) {
    try {
      res.write(`event: sync\ndata: ${payload}\n\n`)
    } catch {
      clients.delete(res)
    }
  }
}

export function currentRev() {
  return rev
}
