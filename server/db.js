import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'

const DATA_DIR = process.env.DATA_DIR || '/data'
mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(`${DATA_DIR}/app.db`)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,            -- health | teacher | guard | principal | parent
  phone TEXT,
  class_id TEXT
);

CREATE TABLE IF NOT EXISTS parent_links (
  user_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  UNIQUE(user_id, child_id)
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  emoji TEXT DEFAULT '🧒',
  bus_route TEXT
);

CREATE TABLE IF NOT EXISTS authorized_persons (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,         -- parent | grandparent | nanny | temporary
  phone TEXT,
  id_last4 TEXT,
  pin TEXT NOT NULL,              -- 4 位接送授权码
  photo_url TEXT,
  active INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',   -- active | pending
  valid_until TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS health_checks (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  temperature REAL,
  cough INTEGER DEFAULT 0,
  rash INTEGER DEFAULT 0,
  medicine TEXT,                  -- 自带药品说明 JSON
  breakfast TEXT,
  mood TEXT,
  special_items TEXT,
  conclusion TEXT,                -- admit | observe | home
  note TEXT,
  by_user TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(child_id, date)
);

CREATE TABLE IF NOT EXISTS class_decisions (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  action TEXT NOT NULL,           -- join | observe | home
  observe_until TEXT,
  note TEXT,
  by_user TEXT,
  created_at TEXT,
  UNIQUE(child_id, date)
);

CREATE TABLE IF NOT EXISTS med_plans (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  med_name TEXT NOT NULL,
  dose TEXT,
  planned_time TEXT NOT NULL,
  actual_time TEXT,
  status TEXT DEFAULT 'pending',  -- pending | done | skipped
  by_user TEXT,
  note TEXT,
  source TEXT DEFAULT 'morning',  -- morning | manual
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,             -- fever | nap | rash | diet | other
  content TEXT NOT NULL,
  severity TEXT DEFAULT 'info',   -- info | warn | alert
  by_user TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS care_transfers (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  from_class_id TEXT NOT NULL,
  to_class_id TEXT NOT NULL,
  reason TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT DEFAULT 'active',   -- active | returned
  by_user TEXT
);

CREATE TABLE IF NOT EXISTS pickups (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  person_id TEXT,
  person_name TEXT,
  relation TEXT,
  method TEXT DEFAULT 'walk',     -- walk | bus
  scheduled_time TEXT,
  actual_time TEXT,
  photo_url TEXT,
  pin_verified INTEGER DEFAULT 0,
  is_late INTEGER DEFAULT 0,
  status TEXT DEFAULT 'planned',  -- planned | picked | cancelled | replaced
  created_via TEXT DEFAULT 'online',
  synced_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pickups_date ON pickups(date);

CREATE TABLE IF NOT EXISTS gate_logs (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  child_id TEXT,
  child_name TEXT,
  person_name TEXT,
  result TEXT NOT NULL,           -- pass | denied
  reason TEXT,
  created_via TEXT DEFAULT 'online',
  synced_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS pickup_changes (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  change_type TEXT NOT NULL,      -- person | time
  old_person_id TEXT,
  new_person_id TEXT,
  new_person_name TEXT,
  new_relation TEXT,
  new_phone TEXT,
  new_id_last4 TEXT,
  new_pin TEXT,
  new_time TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  requested_by TEXT,
  approved_by TEXT,
  created_at TEXT,
  handled_at TEXT
);

CREATE TABLE IF NOT EXISTS bus_records (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  route TEXT,
  board_morning TEXT,
  alight_morning TEXT,
  board_evening TEXT,
  alight_evening TEXT,
  escort_teacher TEXT,
  updated_by TEXT,
  UNIQUE(child_id, date)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location TEXT,
  created_by TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS disease_alerts (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  disease_name TEXT NOT NULL,
  since_date TEXT NOT NULL,
  status TEXT DEFAULT 'active',    -- active | lifted
  note TEXT,
  created_by TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS teacher_handovers (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  date TEXT NOT NULL,
  shift TEXT,
  from_teacher TEXT NOT NULL,
  to_teacher TEXT NOT NULL,
  handover_time TEXT NOT NULL,
  content TEXT,
  children_count INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  child_id TEXT,
  class_id TEXT,
  channel TEXT DEFAULT 'app',
  from_user TEXT,
  from_name TEXT,
  to_role TEXT,
  content TEXT NOT NULL,
  acked INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  child_id TEXT,
  class_id TEXT,
  type TEXT NOT NULL,              -- fever | symptom | med | nap | pickup_change | late | disease | transfer | approval
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'warn',    -- info | warn | critical
  for_roles TEXT DEFAULT '*',      -- 逗号分隔，* 为所有角色
  status TEXT DEFAULT 'open',      -- open | resolved
  created_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_confirmations (
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  UNIQUE(child_id, date)
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 登录会话（演示用 Bearer token，服务端签发与校验，不信任客户端角色）
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 接送放行一次性核验令牌：verify 成功后签发，checkout 成功后销毁
CREATE TABLE IF NOT EXISTS pickup_verifications (
  token TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  date TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_via TEXT DEFAULT 'online',  -- online | offline
  created_by TEXT,
  created_at TEXT NOT NULL
);

-- 门卫离线许可：联网时按门卫会话当日签发（批量有效），断网期间的本机放行据此在补传时鉴权
CREATE TABLE IF NOT EXISTS gate_offline_permits (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 园内发热隔离记录
CREATE TABLE IF NOT EXISTS fever_isolations (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  temperature REAL,
  symptoms TEXT,               -- JSON 数组：咳嗽/皮疹/咽痛/呕吐/精神差...
  isolation_room TEXT,         -- 隔离室
  start_time TEXT NOT NULL,
  parent_notified_at TEXT,     -- 通知家长时间
  class_contact TEXT,          -- 同班接触情况
  medical_advice TEXT,         -- 带回就医建议
  advice_at TEXT,
  advice_by TEXT,
  released INTEGER DEFAULT 0,
  released_at TEXT,
  status TEXT DEFAULT 'isolating', -- isolating | advised | released
  by_user TEXT,
  created_at TEXT
);

-- 同班儿童观察（隔离期间对同班其他幼儿的咳嗽/缺勤/家长反馈追踪）
CREATE TABLE IF NOT EXISTS classmate_observations (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  isolation_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  cough INTEGER DEFAULT 0,
  absent INTEGER DEFAULT 0,
  parent_feedback TEXT,
  temperature REAL,
  abnormal INTEGER DEFAULT 0,  -- 是否判定异常（影响次日晨检提醒）
  by_user TEXT,
  created_at TEXT,
  UNIQUE(isolation_id, child_id)
);

-- 班级消毒安排（通知保育员，完成后进入班级记录）
CREATE TABLE IF NOT EXISTS sanitation_plans (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  date TEXT NOT NULL,
  scope TEXT,                  -- 教室/午睡室/玩具/餐具...
  reason TEXT,                 -- 关联发热/传染病
  isolation_id TEXT,
  due_time TEXT,
  status TEXT DEFAULT 'pending', -- pending | done
  notified_cleaner TEXT,
  done_at TEXT,
  done_by TEXT,
  created_by TEXT,
  created_at TEXT
);
`)

// 旧版本库结构的幂等列迁移（CREATE TABLE IF NOT EXISTS 不会补列）
function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  if (!cols.includes(column)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run()
}
// 临时授权接送：证件照片、有效起止时间、来源与核身批准人
addColumn('pickup_changes', 'id_photo_url', 'id_photo_url TEXT')
addColumn('pickup_changes', 'valid_from', 'valid_from TEXT')
addColumn('pickup_changes', 'valid_until', 'valid_until TEXT')
// 授权人有效期窗口（NULL=常驻长期授权）与来源
addColumn('authorized_persons', 'valid_from', 'valid_from TEXT')
addColumn('authorized_persons', 'valid_until', 'valid_until TEXT')
addColumn('authorized_persons', 'source', "source TEXT DEFAULT '常驻授权'")
addColumn('authorized_persons', 'granted_by', 'granted_by TEXT')
// 接送落库时的门卫确认人（在线=登录门卫，离线补传=离线许可持有门卫）
addColumn('pickups', 'confirmed_by', 'confirmed_by TEXT')

export function nowStr() {
  return new Date().toISOString()
}

export function nowHHMM() {
  return new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

let counter = 0
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1_000_000
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}
