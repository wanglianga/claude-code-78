import express from 'express'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, nowStr, todayStr, nowHHMM, uid } from './db.js'
import { sseHandler, broadcast } from './hub.js'
import { isEmpty, seed } from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { existsSync } from 'node:fs'
// 容器内多阶段构建将 dist 复制为 public；本地开发时直接使用 vite 产物 dist
const PUBLIC_DIR = existsSync(join(__dirname, '..', 'public'))
  ? join(__dirname, '..', 'public')
  : join(__dirname, '..', 'dist')
const DEADLINE = process.env.PICKUP_DEADLINE || '17:30'

if (process.env.SEED_ON_EMPTY !== 'false' && isEmpty()) {
  seed()
  console.log('[seed] demo data inserted')
}

const app = express()
app.use(express.json({ limit: '12mb' }))

// ---------- 工具 ----------
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
function toCamel(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(toCamel)
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [camel(k), v]))
}
const all = (sql, ...p) => db.prepare(sql).all(...p).map(toCamel)
const one = (sql, ...p) => {
  const r = db.prepare(sql).get(...p)
  return r ? toCamel(r) : null
}
const today = () => todayStr()

// ---------- 会话鉴权（服务端签发 token，不信任客户端角色）----------
function sessionUser(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  const row = db.prepare(
    `SELECT u.id AS id, u.username, u.name, u.role, u.phone, u.class_id AS classId, s.token AS token
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  ).get(token)
  return row ? toCamel(row) : null
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.path === '/api/health' || req.path === '/api/auth/login') return next()
  const u = sessionUser(req)
  if (!u) return res.status(401).json({ error: '未登录或会话已失效，请重新登录' })
  req.user = u
  next()
})

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `该操作仅 ${roles.join('/')} 角色可执行` })
    }
    next()
  }
}

// 门禁校验失败（携带 HTTP 状态码），调用方必须保证抛出前无任何写库
class GateError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function pushAlert({ type, title, message = '', severity = 'warn', forRoles = '*', childId = null, classId = null, dedupe = false }) {
  if (dedupe) {
    const exist = db.prepare(
      `SELECT id FROM alerts WHERE child_id IS ? AND class_id IS ? AND type=? AND status='open'
       AND date(created_at)=date('now','+8 hours')`
    ).get(childId ?? null, classId ?? null, type)
    if (exist) return exist.id
  }
  const id = uid('al')
  db.prepare(`INSERT INTO alerts (id,child_id,class_id,type,title,message,severity,for_roles,status,created_at)
    VALUES (?,?,?,?,?,?,?,?, 'open', ?)`)
    .run(id, childId, classId, type, title, message, severity, forRoles, nowStr())
  return id
}

function resolveAlert(id) {
  db.prepare(`UPDATE alerts SET status='resolved', resolved_at=? WHERE id=?`).run(nowStr(), id)
}

function childClass(childId) {
  return one('SELECT class_id AS classId FROM children WHERE id=?', childId)?.classId || null
}

const ROLES_ALL = 'health,teacher,guard,principal,parent'

// ---------- 健康检查 / 静态资源 ----------
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, at: nowStr(), openAlerts: db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE status='open'").get().c }))

// ---------- 认证：服务端签发会话 token ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const u = db.prepare('SELECT id,username,name,role,phone,class_id AS classId FROM users WHERE username=? AND password=?')
    .get(username, password)
  if (!u) return res.status(401).json({ error: '用户名或密码错误' })
  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').run(token, u.id, nowStr())
  res.json({ user: toCamel(u), token })
})

app.post('/api/auth/logout', (req, res) => {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(h.slice(7))
  }
  res.json({ ok: true })
})

// SSE 同样需要会话（EventSource 无法自定义头，使用 query token）
app.get('/events', (req, res) => {
  const token = String(req.query.token || '')
  const row = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(token)
  if (!row) { res.writeHead(401); return res.end('unauthorized') }
  sseHandler(req, res)
})

// ---------- 全量快照（所有端拉同一份，配合 SSE 保证实时一致）----------
app.get('/api/state', (_req, res) => {
  const date = today()
  res.json({
    serverTime: nowStr(),
    clockHHMM: nowHHMM(),
    date,
    deadline: DEADLINE,
    users: all(`SELECT id,username,name,role,phone,class_id AS classId FROM users`),
    classes: all('SELECT * FROM classes ORDER BY sort'),
    children: all('SELECT * FROM children'),
    parentLinks: all('SELECT user_id AS userId, child_id AS childId FROM parent_links'),
    authorizedPersons: all('SELECT * FROM authorized_persons WHERE active=1 ORDER BY created_at'),
    healthChecks: all('SELECT * FROM health_checks WHERE date=?', date),
    classDecisions: all('SELECT * FROM class_decisions WHERE date=?', date),
    medPlans: all('SELECT * FROM med_plans WHERE date=? ORDER BY planned_time', date),
    observations: all('SELECT * FROM observations WHERE date=? ORDER BY created_at', date),
    careTransfers: all('SELECT * FROM care_transfers WHERE date=? ORDER BY start_time', date),
    pickups: all('SELECT * FROM pickups WHERE date=? ORDER BY scheduled_time, created_at', date),
    gateLogs: all('SELECT * FROM gate_logs WHERE date(created_at)=? ORDER BY created_at DESC LIMIT 50', date),
    pickupChanges: all('SELECT * FROM pickup_changes WHERE date=? ORDER BY created_at DESC', date),
    busRecords: all('SELECT * FROM bus_records WHERE date=?', date),
    activities: all('SELECT * FROM activities WHERE date=? ORDER BY start_time', date),
    diseaseAlerts: all("SELECT * FROM disease_alerts WHERE status='active' ORDER BY since_date DESC"),
    teacherHandovers: all('SELECT * FROM teacher_handovers WHERE date=? ORDER BY handover_time DESC', date),
    communications: all('SELECT * FROM communications WHERE date(created_at)=? ORDER BY created_at DESC LIMIT 100', date),
    alerts: all("SELECT * FROM alerts WHERE status='open' OR date(created_at)=? ORDER BY created_at DESC LIMIT 100", date),
    confirmations: all('SELECT * FROM daily_confirmations WHERE date=?', date)
  })
})

// ---------- 晨检 ----------
app.post('/api/health-checks', (req, res) => {
  const b = req.body
  const date = today()
  const t = nowStr()
  const medJson = b.medicine ? JSON.stringify(b.medicine) : null
  db.prepare(`INSERT INTO health_checks
    (id,child_id,date,temperature,cough,rash,medicine,breakfast,mood,special_items,conclusion,note,by_user,created_at,updated_at)
    VALUES (@id,@child_id,@date,@temperature,@cough,@rash,@medicine,@breakfast,@mood,@special_items,@conclusion,@note,@by_user,@created_at,@updated_at)
    ON CONFLICT(child_id,date) DO UPDATE SET
      temperature=excluded.temperature, cough=excluded.cough, rash=excluded.rash,
      medicine=excluded.medicine, breakfast=excluded.breakfast, mood=excluded.mood,
      special_items=excluded.special_items, conclusion=excluded.conclusion, note=excluded.note,
      by_user=excluded.by_user, updated_at=excluded.updated_at`).run({
    id: uid('hc'), child_id: b.childId, date,
    temperature: b.temperature ?? null, cough: b.cough ? 1 : 0, rash: b.rash ? 1 : 0,
    medicine: medJson, breakfast: b.breakfast || '', mood: b.mood || '', special_items: b.specialItems || '',
    conclusion: b.conclusion, note: b.note || '', by_user: b.byUser || '保健老师',
    created_at: t, updated_at: t
  })

  const child = one('SELECT name, class_id AS classId FROM children WHERE id=?', b.childId)
  // 同步带药计划（晨检登记的药品 -> 待执行用药计划，已执行的保留）
  db.prepare(`DELETE FROM med_plans WHERE child_id=? AND date=? AND source='morning' AND status='pending'`)
    .run(b.childId, date)
  const meds = Array.isArray(b.medicine) ? b.medicine : []
  const insMp = db.prepare(`INSERT INTO med_plans (id,child_id,date,med_name,dose,planned_time,status,source,created_at)
    VALUES (?,?,?,?,?,?,'pending','morning',?)`)
  meds.forEach(m => {
    if (m.name && m.time) insMp.run(uid('mp'), b.childId, date, m.name, m.dose || '', m.time, t)
  })

  // 联动预警（按当日同类型 open 预警去重）
  if (b.temperature && Number(b.temperature) >= 37.3) {
    pushAlert({
      type: 'fever', childId: b.childId, classId: child?.classId, severity: 'critical', forRoles: ROLES_ALL,
      title: `晨检发热：${child?.name} ${b.temperature}℃`,
      message: b.note || '保健老师建议重点关注 / 接回', dedupe: true
    })
  }
  if (b.conclusion === 'home') {
    pushAlert({
      type: 'symptom', childId: b.childId, classId: child?.classId, severity: 'critical', forRoles: ROLES_ALL,
      title: `晨检结论：${child?.name} 建议回家`,
      message: b.note || '门卫放行需核对接应人，班主任跟进离园', dedupe: true
    })
  }
  if (meds.length) {
    pushAlert({
      type: 'med', childId: b.childId, classId: child?.classId, severity: 'warn',
      forRoles: 'health,teacher,principal,parent',
      title: `带药登记：${child?.name} ${meds.map(m => `${m.time} ${m.name}`).join('；')}`,
      message: '服药时间变更将实时同步各方', dedupe: true
    })
  }
  broadcast('health')
  res.json({ ok: true })
})

// 班级处置
app.post('/api/class-decision', (req, res) => {
  const b = req.body
  const date = today()
  db.prepare(`INSERT INTO class_decisions (id,child_id,date,action,observe_until,note,by_user,created_at)
    VALUES (@id,@child_id,@date,@action,@observe_until,@note,@by_user,@created_at)
    ON CONFLICT(child_id,date) DO UPDATE SET action=excluded.action,
      observe_until=excluded.observe_until, note=excluded.note, by_user=excluded.by_user`)
    .run({
      id: uid('cd'), child_id: b.childId, date, action: b.action,
      observe_until: b.observeUntil || null, note: b.note || '', by_user: b.byUser || '班主任', created_at: nowStr()
    })
  broadcast('decision')
  res.json({ ok: true })
})

// 用药：执行 / 改时间 / 新增
app.post('/api/med-plans/:id/execute', (req, res) => {
  const mp = one('SELECT * FROM med_plans WHERE id=?', req.params.id)
  if (!mp) return res.status(404).json({ error: '用药计划不存在' })
  const actual = req.body.actualTime || nowHHMM()
  db.prepare(`UPDATE med_plans SET status='done', actual_time=?, by_user=?, note=COALESCE(?,'') WHERE id=?`)
    .run(actual, req.body.byUser || '班主任', req.body.note || null, req.params.id)
  const child = one('SELECT name FROM children WHERE id=?', mp.childId)
  pushAlert({
    type: 'med', childId: mp.childId, severity: 'info', forRoles: 'health,teacher,principal,parent',
    title: `用药已执行：${child?.name} ${mp.medName} ${mp.dose}`,
    message: `计划 ${mp.plannedTime}，实际 ${actual}，执行人 ${req.body.byUser || '班主任'}`
  })
  broadcast('med')
  res.json({ ok: true })
})

app.post('/api/med-plans/:id/change-time', (req, res) => {
  const mp = one('SELECT * FROM med_plans WHERE id=?', req.params.id)
  if (!mp) return res.status(404).json({ error: '用药计划不存在' })
  db.prepare('UPDATE med_plans SET planned_time=?, note=COALESCE(?,"") WHERE id=?')
    .run(req.body.plannedTime, req.body.reason || null, req.params.id)
  const child = one('SELECT name FROM children WHERE id=?', mp.childId)
  pushAlert({
    type: 'med', childId: mp.childId, severity: 'warn', forRoles: 'health,teacher,principal,parent',
    title: `服药时间变更：${child?.name} ${mp.medName}`,
    message: `${mp.plannedTime} → ${req.body.plannedTime}（${req.body.byUser || ''}：${req.body.reason || '无'}）`
  })
  broadcast('med')
  res.json({ ok: true })
})

app.post('/api/med-plans', (req, res) => {
  const b = req.body
  db.prepare(`INSERT INTO med_plans (id,child_id,date,med_name,dose,planned_time,status,source,note,created_at)
    VALUES (?,?,?,?,?,?,'pending','manual',?,?)`)
    .run(uid('mp'), b.childId, today(), b.medName, b.dose || '', b.plannedTime, b.note || '', nowStr())
  broadcast('med')
  res.json({ ok: true })
})

// 异常观察（发热 / 午睡 / 皮疹等，支持离线 client_id 幂等）
app.post('/api/observations', (req, res) => {
  const b = req.body
  const date = today()
  if (b.clientId && one('SELECT id FROM observations WHERE client_id=?', b.clientId)) {
    return res.json({ ok: true, duplicated: true })
  }
  db.prepare(`INSERT INTO observations (id,client_id,child_id,date,type,content,severity,by_user,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uid('ob'), b.clientId || null, b.childId, date, b.type, b.content, b.severity || 'info', b.byUser || '', nowStr())
  const child = one('SELECT name, class_id AS classId FROM children WHERE id=?', b.childId)
  const typeMap = {
    fever: ['发热观察', 'critical', true],
    nap: ['午睡异常', 'warn', false],
    rash: ['皮疹观察', 'warn', false],
    diet: ['饮食异常', 'warn', false],
    other: ['异常观察', 'warn', false]
  }
  const [prefix, sev, dedupe] = typeMap[b.type] || typeMap.other
  pushAlert({
    type: b.type === 'nap' ? 'nap' : b.type, childId: b.childId, classId: child?.classId,
    severity: b.severity || sev, forRoles: ROLES_ALL,
    title: `${prefix}：${child?.name}`, message: b.content, dedupe
  })
  broadcast('observation')
  res.json({ ok: true })
})

// 临时托管到其他班级
app.post('/api/care-transfers', (req, res) => {
  const b = req.body
  const date = today()
  if (b.clientId && one('SELECT id FROM care_transfers WHERE client_id=?', b.clientId)) {
    return res.json({ ok: true, duplicated: true })
  }
  const child = one('SELECT class_id AS classId, name FROM children WHERE id=?', b.childId)
  const id = uid('ct')
  db.prepare(`INSERT INTO care_transfers (id,client_id,child_id,date,from_class_id,to_class_id,reason,start_time,status,by_user)
    VALUES (?,?,?,?,?,?,?,?,'active',?)`)
    .run(id, b.clientId || null, b.childId, date, b.fromClassId || child?.classId, b.toClassId,
      b.reason || '', b.startTime || nowHHMM(), b.byUser || '')
  const toClass = one('SELECT name FROM classes WHERE id=?', b.toClassId)
  pushAlert({
    type: 'transfer', childId: b.childId, classId: child?.classId, severity: 'warn', forRoles: ROLES_ALL,
    title: `临时托管：${child?.name} → ${toClass?.name}`,
    message: `${b.startTime || nowHHMM()} 起，${b.reason || '跨班托管'}，返班需登记`
  })
  broadcast('transfer')
  res.json({ ok: true, id })
})

app.post('/api/care-transfers/:id/return', (req, res) => {
  db.prepare(`UPDATE care_transfers SET status='returned', end_time=? WHERE id=?`)
    .run(req.body.endTime || nowHHMM(), req.params.id)
  broadcast('transfer')
  res.json({ ok: true })
})

// ---------- 接送 ----------
function findPlannedPickup(childId) {
  return db.prepare(`SELECT * FROM pickups WHERE child_id=? AND date=? AND status='planned'
    ORDER BY scheduled_time DESC LIMIT 1`).get(childId, today())
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// 当日有效授权人（active 且临时授权未过期）
function findActivePerson(personId, date = today()) {
  if (!personId) return null
  const person = one('SELECT * FROM authorized_persons WHERE id=? AND active=1', personId)
  if (!person) return null
  if (person.validUntil && person.validUntil < date) return null
  return person
}

// 接送照片门禁：必须是真实的内嵌图片 dataURL 且有最小体积，防止空串/伪造占位
function hasValidPhoto(photoUrl) {
  return typeof photoUrl === 'string'
    && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]{500,}/i.test(photoUrl)
}

// ① 门卫在线核验授权码 → 签发一次性放行令牌（不返回可直接放行的布尔结果给业务端滥用）
function issueVerification({ personId, pin, guardName }) {
  const date = today()
  const person = findActivePerson(personId, date)
  if (!person) throw new GateError(404, '授权人不存在、已失效或临时授权已过期')
  if (person.pin !== String(pin)) throw new GateError(403, '接送授权码错误，已拒绝')
  const pickup = findPlannedPickup(person.childId)
  if (!pickup) {
    const picked = one("SELECT * FROM pickups WHERE child_id=? AND date=? AND status='picked'", person.childId, date)
    throw new GateError(409, picked ? '该幼儿今日已离园，不能重复放行' : '该幼儿今日无有效接送计划，请联系班主任核实')
  }
  // 当日有效授权匹配：临时改接批准后旧授权人的 personId 与当前计划不一致 → 拒绝
  if (pickup.person_id !== person.id) {
    throw new GateError(403, '授权人与当前有效接送计划不匹配：该幼儿可能已临时改接，旧授权已作废')
  }
  const token = randomBytes(18).toString('hex')
  db.prepare(`INSERT INTO pickup_verifications
    (token,child_id,person_id,date,used,created_via,created_by,created_at)
    VALUES (?,?,?,?,0,'online',?,?)`)
    .run(token, person.childId, person.id, date, guardName, nowStr())
  const child = one('SELECT * FROM children WHERE id=?', person.childId)
  return {
    token,
    person: { id: person.id, name: person.name, relation: person.relation, phone: person.phone },
    child: { id: child.id, name: child.name, classId: child.class_id }
  }
}

// ② 凭核验结果落库放行。所有身份字段以服务端数据库为准，绝不采信客户端的 personName/pinVerified
function finalizeCheckout(args) {
  const { childId, personId, photoUrl, actualTime, via, clientId, gateClientId, logCreatedAt } = args
  // 幂等优先（离线重放）：已存在则直接返回，不再做任何写入
  if (clientId) {
    const dup = one('SELECT * FROM pickups WHERE client_id=?', clientId)
    if (dup) return { ok: true, duplicated: true, row: dup }
  }
  const date = today()
  const person = findActivePerson(personId, date)
  if (!person) throw new GateError(404, '授权人不存在、已失效或临时授权已过期，禁止放行')
  if (person.childId !== childId) throw new GateError(403, '授权人与被接送幼儿不匹配，禁止放行')
  const planned = findPlannedPickup(childId)
  if (!planned) {
    const picked = one("SELECT * FROM pickups WHERE child_id=? AND date=? AND status='picked'", childId, date)
    throw new GateError(409, picked ? '该幼儿今日已离园，不能重复放行' : '该幼儿今日无有效接送计划，禁止放行')
  }
  if (planned.person_id !== person.id) {
    throw new GateError(403, '授权人与当前有效接送计划不匹配（旧授权已作废），禁止放行')
  }
  if (!hasValidPhoto(photoUrl)) throw new GateError(400, '缺少有效的接送照片，必须拍照留影后方可放行')

  const actual = actualTime || nowHHMM()
  const late = actual > DEADLINE ? 1 : 0
  db.prepare(`UPDATE pickups SET
    person_id=?, person_name=?, relation=?,
    actual_time=?, photo_url=?, pin_verified=1, is_late=?, status='picked',
    created_via=?, synced_at=?, client_id=COALESCE(?,client_id) WHERE id=?`)
    .run(person.id, person.name, person.relation, actual, photoUrl, late,
      via, nowStr(), clientId || null, planned.id)
  db.prepare(`INSERT INTO gate_logs (id,client_id,child_id,child_name,person_name,result,reason,created_via,synced_at,created_at)
    VALUES (?,?,?,?,?, 'pass', ?, ?, ?, ?)`)
    .run(uid('gl'), gateClientId || null, childId, args.childName || null, person.name,
      `${via === 'offline' ? '离线补传 · ' : ''}接送离园${late ? '（晚接）' : ''}`, via, nowStr(), logCreatedAt || nowStr())
  const child = one('SELECT name, class_id AS classId FROM children WHERE id=?', childId)
  if (late) {
    pushAlert({
      type: 'late', childId, classId: child?.classId, severity: 'critical',
      forRoles: 'guard,teacher,principal,parent',
      title: `晚接预警：${child?.name} ${actual} 离园`,
      message: `超过规定离园时间 ${DEADLINE}，接送人 ${person.name}，请班主任陪伴并通知家长`
    })
  }
  return { ok: true, id: planned.id, late: !!late }
}

app.post('/api/pickups/verify', requireRole('guard'), wrap((req, res) => {
  const { personId, pin } = req.body || {}
  if (!personId || !pin) throw new GateError(400, '缺少授权人或授权码')
  res.json(issueVerification({ personId, pin: String(pin), guardName: req.user.name }))
}))

app.post('/api/pickups/checkout', requireRole('guard'), wrap((req, res) => {
  const { verificationToken, photoUrl } = req.body || {}
  if (!verificationToken) throw new GateError(401, '未检测到放行核验结果，请先核验接送授权码')
  const v = db.prepare(`SELECT * FROM pickup_verifications
    WHERE token=? AND date=? AND used=0 AND created_via='online'`).get(verificationToken, today())
  if (!v) throw new GateError(401, '核验结果无效、已使用或已过期，请重新核验授权码')
  // 令牌消费与放行落库在同一事务内：任何门禁失败都不会消耗令牌、不写接送计划、不写门卫流水
  const r = db.transaction(() => {
    const out = finalizeCheckout({
      childId: v.child_id, personId: v.person_id,
      photoUrl, via: 'online', childName: undefined
    })
    db.prepare('UPDATE pickup_verifications SET used=1 WHERE token=?').run(verificationToken)
    return out
  })()
  broadcast('pickup')
  res.json(r)
}))

// 门卫断网前领取当日离线许可（证明该设备联网时持有有效门卫会话）
app.post('/api/gate/offline-permit', requireRole('guard'), wrap((req, res) => {
  const date = today()
  let row = one('SELECT * FROM gate_offline_permits WHERE user_id=? AND date=?', req.user.id, date)
  if (!row) {
    const token = randomBytes(20).toString('hex')
    db.prepare('INSERT INTO gate_offline_permits (token,user_id,user_name,date,created_at) VALUES (?,?,?,?,?)')
      .run(token, req.user.id, req.user.name, date, nowStr())
    row = { token }
  }
  res.json({ permitToken: row.token, date })
}))

app.post('/api/gate/deny', requireRole('guard'), wrap((req, res) => {
  const b = req.body || {}
  if (b.clientId && one('SELECT id FROM gate_logs WHERE client_id=?', b.clientId)) {
    return res.json({ ok: true, duplicated: true })
  }
  // 幼儿姓名同样以库为准（客户端只能传 childId）
  const child = b.childId ? one('SELECT name FROM children WHERE id=?', b.childId) : null
  const childName = child?.name ?? (b.childName || null)
  db.prepare(`INSERT INTO gate_logs (id,client_id,child_id,child_name,person_name,result,reason,created_via,synced_at,created_at)
    VALUES (?,?,?,?,?, 'denied', ?, ?, ?, ?)`)
    .run(uid('gl'), b.clientId || null, b.childId || null, childName, b.personName || '未知人员',
      b.reason || '未授权', b.createdVia === 'offline' ? 'offline' : 'online', nowStr(), nowStr())
  pushAlert({
    type: 'approval', childId: b.childId || null, classId: b.childId ? childClass(b.childId) : null,
    severity: 'critical', forRoles: 'guard,teacher,principal',
    title: `门卫拦截：${childName ? childName + ' - ' : ''}${b.personName || '未知人员'}`,
    message: b.reason || '未授权人员试图接走幼儿，已拒绝放行，请班主任/园长立即核实'
  })
  broadcast('deny')
  res.json({ ok: true })
}))

// 临时改接 / 改时间申请
app.post('/api/pickup-changes', (req, res) => {
  const b = req.body
  const id = uid('pc')
  db.prepare(`INSERT INTO pickup_changes
    (id,child_id,date,change_type,old_person_id,new_person_id,new_person_name,new_relation,new_phone,new_id_last4,new_pin,new_time,reason,status,requested_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`)
    .run(id, b.childId, today(), b.changeType, b.oldPersonId || null, null,
      b.newPersonName || null, b.newRelation || 'temporary', b.newPhone || null, b.newIdLast4 || null,
      b.newPin || null, b.newTime || null, b.reason || '', b.requestedBy || '家长', nowStr())
  const child = one('SELECT name, class_id AS classId FROM children WHERE id=?', b.childId)
  pushAlert({
    type: 'pickup_change', childId: b.childId, classId: child?.classId, severity: 'warn',
    forRoles: 'teacher,guard,principal,parent',
    title: `临时${b.changeType === 'time' ? '改时间' : '改接'}申请：${child?.name}`,
    message: b.changeType === 'time'
      ? `申请改为 ${b.newTime} 接（${b.reason || ''}），待审批`
      : `申请人「${b.newPersonName}」(${ { grandparent: '祖辈', nanny: '保姆', temporary: '临时授权人', parent: '家长' }[b.newRelation] || '临时授权人' })，待审批；审批前门卫端不放行`
  })
  broadcast('change-request')
  res.json({ ok: true, id })
})

app.post('/api/pickup-changes/:id/approve', (req, res) => {
  const pc = one('SELECT * FROM pickup_changes WHERE id=?', req.params.id)
  if (!pc || pc.status !== 'pending') return res.status(400).json({ error: '申请不存在或已处理' })
  const date = today()
  db.prepare(`UPDATE pickup_changes SET status='approved', approved_by=?, handled_at=? WHERE id=?`)
    .run(req.body.byUser || '班主任', nowStr(), req.params.id)

  const child = one('SELECT name, class_id AS classId FROM children WHERE id=?', pc.childId)
  if (pc.changeType === 'person') {
    // 建立当日临时授权（含接送授权码），旧计划置 replaced，新建今日 planned —— 三端同时切换
    const apId = uid('ap')
    db.prepare(`INSERT INTO authorized_persons
      (id,child_id,name,relation,phone,id_last4,pin,active,status,valid_until,created_at)
      VALUES (?,?,?,?,?,?,?,1,'active',?,?)`)
      .run(apId, pc.childId, pc.newPersonName, pc.newRelation || 'temporary',
        pc.newPhone, pc.newIdLast4, pc.newPin || '0000', date, nowStr())
    db.prepare(`UPDATE pickups SET status='replaced' WHERE child_id=? AND date=? AND status='planned'`)
      .run(pc.childId, date)
    db.prepare(`INSERT INTO pickups
      (id,client_id,child_id,date,person_id,person_name,relation,method,scheduled_time,status,created_via,synced_at,created_at)
      VALUES (?,?,?,?,?,?,?, 'walk', ?, 'planned','online',?,?)`)
      .run(uid('pk'), null, pc.childId, date, apId, pc.newPersonName, pc.newRelation || 'temporary',
        pc.newTime || DEADLINE, nowStr(), nowStr())
  } else {
    db.prepare(`UPDATE pickups SET scheduled_time=? WHERE child_id=? AND date=? AND status='planned'`)
      .run(pc.newTime, pc.childId, date)
  }
  pushAlert({
    type: 'approval', childId: pc.childId, classId: child?.classId, severity: 'critical', forRoles: ROLES_ALL,
    title: `改接已批准：${child?.name}`,
    message: pc.changeType === 'person'
      ? `接送人已变更为「${pc.newPersonName}」，授权码已下发，门卫/家长端已同步，旧授权今日失效`
      : `接离时间已变更为 ${pc.newTime}，各端已同步`
  })
  broadcast('change-approved')
  res.json({ ok: true })
})

app.post('/api/pickup-changes/:id/reject', (req, res) => {
  db.prepare(`UPDATE pickup_changes SET status='rejected', approved_by=?, handled_at=? WHERE id=?`)
    .run(req.body.byUser || '班主任', nowStr(), req.params.id)
  const pc = one('SELECT * FROM pickup_changes WHERE id=?', req.params.id)
  const child = one('SELECT name FROM children WHERE id=?', pc.childId)
  pushAlert({
    type: 'approval', childId: pc.childId, severity: 'warn', forRoles: ROLES_ALL,
    title: `改接申请未通过：${child?.name}`, message: `审批人：${req.body.byUser || '班主任'}，原授权维持不变`
  })
  broadcast('change-rejected')
  res.json({ ok: true })
})

// ---------- 校车 / 活动 / 传染病 / 交接 / 沟通 ----------
app.post('/api/bus-records', (req, res) => {
  const b = req.body
  const date = today()
  db.prepare(`INSERT INTO bus_records
    (id,child_id,date,route,board_morning,alight_morning,board_evening,alight_evening,escort_teacher,updated_by)
    VALUES (@id,@child_id,@date,@route,@board_morning,@alight_morning,@board_evening,@alight_evening,@escort_teacher,@updated_by)
    ON CONFLICT(child_id,date) DO UPDATE SET
      route=COALESCE(excluded.route,bus_records.route),
      board_morning=COALESCE(excluded.board_morning,bus_records.board_morning),
      alight_morning=COALESCE(excluded.alight_morning,bus_records.alight_morning),
      board_evening=COALESCE(excluded.board_evening,bus_records.board_evening),
      alight_evening=COALESCE(excluded.alight_evening,bus_records.alight_evening),
      escort_teacher=COALESCE(excluded.escort_teacher,bus_records.escort_teacher),
      updated_by=excluded.updated_by`)
    .run({
      id: uid('br'), child_id: b.childId, date,
      route: b.route || null, board_morning: b.boardMorning || null, alight_morning: b.alightMorning || null,
      board_evening: b.boardEvening || null, alight_evening: b.alightEvening || null,
      escort_teacher: b.escortTeacher || null, updated_by: b.updatedBy || ''
    })
  broadcast('bus')
  res.json({ ok: true })
})

app.post('/api/activities', (req, res) => {
  const b = req.body
  db.prepare(`INSERT INTO activities (id,class_id,date,name,start_time,end_time,location,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uid('ac'), b.classId, today(), b.name, b.startTime || null, b.endTime || null,
      b.location || '', b.createdBy || '', nowStr())
  broadcast('activity')
  res.json({ ok: true })
})

app.post('/api/disease-alerts', (req, res) => {
  const b = req.body
  db.prepare(`INSERT INTO disease_alerts (id,class_id,disease_name,since_date,status,note,created_by,created_at)
    VALUES (?,?,?,?,'active',?,?,?)`)
    .run(uid('da'), b.classId, b.diseaseName, today(), b.note || '', b.createdBy || '园长', nowStr())
  const cls = one('SELECT name FROM classes WHERE id=?', b.classId)
  pushAlert({
    type: 'disease', classId: b.classId, severity: 'critical', forRoles: '*',
    title: `传染病班级观察：${cls?.name} ${b.diseaseName}`,
    message: b.note || '该班级进入观察期，加强晨午检与缺勤追踪'
  })
  broadcast('disease')
  res.json({ ok: true })
})

app.post('/api/disease-alerts/:id/lift', (_req, res) => {
  db.prepare(`UPDATE disease_alerts SET status='lifted' WHERE id=?`, _req.params.id)
  broadcast('disease')
  res.json({ ok: true })
})

app.post('/api/teacher-handovers', (req, res) => {
  const b = req.body
  db.prepare(`INSERT INTO teacher_handovers
    (id,class_id,date,shift,from_teacher,to_teacher,handover_time,content,children_count,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(uid('th'), b.classId, today(), b.shift || '', b.fromTeacher, b.toTeacher,
      b.handoverTime || nowHHMM(), b.content || '', b.childrenCount ?? null, nowStr())
  broadcast('handover')
  res.json({ ok: true })
})

app.post('/api/communications', (req, res) => {
  const b = req.body
  db.prepare(`INSERT INTO communications (id,child_id,class_id,channel,from_user,from_name,to_role,content,acked,created_at)
    VALUES (?,?,?, 'app', ?, ?, ?, ?, 0, ?)`)
    .run(uid('cm'), b.childId || null, b.classId || null, b.fromUser || '', b.fromName || '',
      b.toRole || 'parent', b.content || '', nowStr())
  broadcast('communication')
  res.json({ ok: true })
})

app.post('/api/alerts/:id/resolve', (_req, res) => {
  resolveAlert(_req.params.id)
  broadcast('alert')
  res.json({ ok: true })
})

// 家长确认当日记录
app.post('/api/daily/:childId/confirm', (req, res) => {
  db.prepare(`INSERT INTO daily_confirmations (child_id,date,confirmed_by,confirmed_at)
    VALUES (?,?,?,?) ON CONFLICT(child_id,date) DO UPDATE SET confirmed_by=excluded.confirmed_by, confirmed_at=excluded.confirmed_at`)
    .run(req.params.childId, today(), req.body.byUser || '家长', nowStr())
  broadcast('confirm')
  res.json({ ok: true })
})

// ---------- 门卫离线补同步：outbox 幂等回放 ----------
// 安全要求：补传时必须持有门卫会话 + 断网前领取的当日离线许可；
// 放行事件以服务端当日有效授权与照片为准，任何一条不通过 → 整体 4xx，不写接送计划、不写门卫流水。
app.post('/api/sync', requireRole('guard'), (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : []
  const permitToken = req.body?.permitToken
  const date = today()
  const permit = permitToken
    ? one('SELECT * FROM gate_offline_permits WHERE token=? AND user_id=? AND date=?', permitToken, req.user.id, date)
    : null
  if (!permit) {
    return res.status(401).json({ error: '缺少有效的当日离线许可（请在联网状态下以门卫账号重新获取），拒绝补传放行记录' })
  }

  const checkoutEvents = events.filter(e => e.type === 'checkout')
  // ① 预校验阶段（只读）：幂等的跳过；任何非幂等放行不满足门禁立即 4xx
  const planned = {}
  for (const e of checkoutEvents) {
    const p = { ...(e.payload || {}), clientId: e.clientId }
    if (e.clientId && one('SELECT id FROM pickups WHERE client_id=?', e.clientId)) continue
    if (e.clientId && one('SELECT id FROM gate_logs WHERE client_id=?', `${e.clientId}_gate`)) continue
    if (!p.childId) return res.status(400).json({ error: '离线放行缺少幼儿标识，已拒绝整批补传' })
    const person = findActivePerson(p.personId, date)
    if (!person || person.childId !== p.childId) {
      return res.status(403).json({ error: `离线放行核验失败：${p.childName || p.childId} 的授权人无效或不匹配（可能已临时改接），请到园人工复核，整批未写入` })
    }
    const plan = findPlannedPickup(p.childId)
    if (!plan) {
      const picked = one("SELECT id FROM pickups WHERE child_id=? AND date=? AND status='picked'", p.childId, date)
      return res.status(409).json({ error: `${p.childName || p.childId} ${picked ? '已离园，不能重复放行' : '今日无有效接送计划'}，整批未写入` })
    }
    if (plan.person_id !== person.id) {
      return res.status(403).json({ error: `离线授权人「${person.name}」与 ${p.childName || p.childId} 当前有效接送计划不匹配（旧授权已作废），整批未写入` })
    }
    if (!hasValidPhoto(p.photoUrl)) {
      return res.status(400).json({ error: `离线放行缺少 ${p.childName || p.childId} 的有效接送照片，整批未写入` })
    }
    planned[e.clientId] = { plan, person }
  }

  // ② 写入阶段：全部通过门禁后事务落库
  const results = []
  const tx = db.transaction((evs) => {
    for (const e of evs) {
      try {
        const p = { ...(e.payload || {}), clientId: e.clientId, createdVia: 'offline' }
        // 离线登记时刻优先作为实际时间（避免用补传时刻误判晚接）
        if (!p.actualTime && e.createdAt) {
          const d = new Date(e.createdAt)
          if (!isNaN(d.getTime())) {
            p.actualTime = d.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' })
            p.logCreatedAt = e.createdAt
          }
        }
        if (e.type === 'checkout') {
          if (e.clientId && one('SELECT id FROM pickups WHERE client_id=?', e.clientId)) {
            results.push({ clientId: e.clientId, ok: true, duplicated: true })
            continue
          }
          const matched = planned[e.clientId]
          results.push({ clientId: e.clientId, ...finalizeCheckout({
            childId: p.childId, childName: p.childName, personId: matched.person.id,
            photoUrl: p.photoUrl, actualTime: p.actualTime, via: 'offline',
            clientId: e.clientId, gateClientId: `${e.clientId}_gate`, logCreatedAt: p.logCreatedAt
          }) })
        } else if (e.type === 'gate_deny') {
          if (!e.clientId || !one('SELECT id FROM gate_logs WHERE client_id=?', e.clientId)) {
            const child = p.childId ? one('SELECT name FROM children WHERE id=?', p.childId) : null
            db.prepare(`INSERT INTO gate_logs (id,client_id,child_id,child_name,person_name,result,reason,created_via,synced_at,created_at)
              VALUES (?,?,?,?,?, 'denied', ?, 'offline', ?, ?)`)
              .run(uid('gl'), e.clientId || null, p.childId || null, child?.name ?? p.childName ?? null,
                p.personName || '未知人员', p.reason || '离线记录-未授权', nowStr(), e.createdAt || nowStr())
            pushAlert({
              type: 'approval', childId: p.childId || null, severity: 'critical', forRoles: 'guard,teacher,principal',
              title: `门卫拦截（离线补传）：${child?.name ? child.name + ' - ' : ''}${p.personName || '未知人员'}`,
              message: p.reason || '离线期间记录，已补同步'
            })
          }
          results.push({ clientId: e.clientId, ok: true })
        } else if (e.type === 'observation') {
          if (!e.clientId || !one('SELECT id FROM observations WHERE client_id=?', e.clientId)) {
            db.prepare(`INSERT INTO observations (id,client_id,child_id,date,type,content,severity,by_user,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
              .run(uid('ob'), e.clientId || null, p.childId, today(), p.type || 'other',
                p.content || '', p.severity || 'info', `${req.user.name}(离线)`, e.createdAt || nowStr())
          }
          results.push({ clientId: e.clientId, ok: true })
        } else if (e.type === 'transfer') {
          if (!e.clientId || !one('SELECT id FROM care_transfers WHERE client_id=?', e.clientId)) {
            db.prepare(`INSERT INTO care_transfers (id,client_id,child_id,date,from_class_id,to_class_id,reason,start_time,status,by_user)
              VALUES (?,?,?,?,?,?,?,?,'active',?)`)
              .run(uid('ct'), e.clientId || null, p.childId, today(),
                p.fromClassId || null, p.toClassId, p.reason || '离线登记', p.startTime || nowHHMM(), `${req.user.name}(离线)`)
          }
          results.push({ clientId: e.clientId, ok: true })
        } else {
          results.push({ clientId: e.clientId, ok: false, error: 'unknown-type' })
        }
      } catch (err) {
        throw err
      }
    }
  })
  tx(events)
  if (events.length) broadcast('sync')
  res.json({ ok: true, syncedAt: nowStr(), results })
})

// ---------- 静态前端 ----------
app.use(express.static(PUBLIC_DIR))
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/events')) {
    return res.sendFile(join(PUBLIC_DIR, 'index.html'))
  }
  next()
})

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message)
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT}, data=${process.env.DATA_DIR || '/data'}`)
})
