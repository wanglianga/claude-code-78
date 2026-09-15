import { db, uid, nowStr, todayStr, nowHHMM } from './db.js'

export function isEmpty() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0
}

export function seed() {
  const t = nowStr()
  const date = todayStr()

  const classes = [
    { id: 'cls_sunflower', name: '小一班 · 向日葵', sort: 1 },
    { id: 'cls_littlebee', name: '小二班 · 小蜜蜂', sort: 2 },
    { id: 'cls_star', name: '中一班 · 星星', sort: 3 }
  ]
  const insClass = db.prepare('INSERT INTO classes (id,name,sort) VALUES (?,?,?)')
  classes.forEach(c => insClass.run(c.id, c.name, c.sort))

  // 用户（密码均为 123456，演示环境明文仅为演示）
  const users = [
    ['u_health', 'health', '林保健', 'health', '13800000001', null],
    ['u_teacher1', 'teacher1', '王老师', 'teacher', '13800000002', 'cls_sunflower'],
    ['u_teacher2', 'teacher2', '赵老师', 'teacher', '13800000003', 'cls_littlebee'],
    ['u_guard', 'guard', '陈门卫', 'guard', '13800000004', null],
    ['u_principal', 'principal', '刘园长', 'principal', '13800000005', null],
    ['u_parent1', 'parent1', '李妈妈', 'parent', '13900000001', null],
    ['u_parent2', 'parent2', '张爸爸', 'parent', '13900000002', null],
    ['u_parent3', 'parent3', '陈妈妈', 'parent', '13900000003', null],
    ['u_parent4', 'parent4', '周妈妈', 'parent', '13900000004', null]
  ]
  const insUser = db.prepare('INSERT INTO users (id,username,password,name,role,phone,class_id) VALUES (?,?,?,?,?,?,?)')
  users.forEach(u => insUser.run(u[0], u[1], '123456', u[2], u[3], u[4], u[5]))

  const children = [
    { id: 'c_lele', name: '李乐乐', class_id: 'cls_sunflower', emoji: '🧒', bus_route: 'A线', parent: 'u_parent1' },
    { id: 'c_duoduo', name: '张朵朵', class_id: 'cls_sunflower', emoji: '👧', bus_route: null, parent: 'u_parent2' },
    { id: 'c_kangkang', name: '周康康', class_id: 'cls_littlebee', emoji: '👦', bus_route: 'B线', parent: 'u_parent4' },
    { id: 'c_an_an', name: '陈安安', class_id: 'cls_littlebee', emoji: '🧒', bus_route: null, parent: 'u_parent3' }
  ]
  const insChild = db.prepare('INSERT INTO children (id,name,class_id,emoji,bus_route) VALUES (?,?,?,?,?)')
  const insLink = db.prepare('INSERT INTO parent_links (user_id,child_id) VALUES (?,?)')
  children.forEach(c => {
    insChild.run(c.id, c.name, c.class_id, c.emoji, c.bus_route)
    if (c.parent) insLink.run(c.parent, c.id)
  })

  // 授权接送人
  const persons = [
    ['ap_lele_mom', 'c_lele', '李妈妈', 'parent', '13900000001', '1001', '1234', 'active'],
    ['ap_lele_dad', 'c_lele', '李爸爸', 'parent', '13900000002', '1002', '1234', 'active'],
    ['ap_lele_grandma', 'c_lele', '李奶奶', 'grandparent', '13900000003', '1003', '5678', 'active'],
    ['ap_duoduo_dad', 'c_duoduo', '张爸爸', 'parent', '13900000002', '2001', '1234', 'active'],
    ['ap_duoduo_nanny', 'c_duoduo', '王阿姨', 'nanny', '13900000004', '2002', '8888', 'active'],
    ['ap_kangkang_mom', 'c_kangkang', '周妈妈', 'parent', '13900000005', '3001', '1234', 'active'],
    ['ap_anan_mom', 'c_an_an', '陈妈妈', 'parent', '13900000006', '4001', '1234', 'active']
  ]
  const insAp = db.prepare(`INSERT INTO authorized_persons
    (id,child_id,name,relation,phone,id_last4,pin,active,status,created_at) VALUES (?,?,?,?,?,?,?,1,?,?)`)
  persons.forEach(p => insAp.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], t))

  // 今日晨检：乐乐发热（建议回家），朵朵带药观察，康康正常，安安未检
  const insHc = db.prepare(`INSERT INTO health_checks
    (id,child_id,date,temperature,cough,rash,medicine,breakfast,mood,special_items,conclusion,note,by_user,created_at,updated_at)
    VALUES (@id,@child_id,@date,@temperature,@cough,@rash,@medicine,@breakfast,@mood,@special_items,@conclusion,@note,@by_user,@created_at,@updated_at)`)
  insHc.run({
    id: uid('hc'), child_id: 'c_lele', date, temperature: 37.9, cough: 1, rash: 0,
    medicine: null, breakfast: '少量粥', mood: '😟 低落', special_items: '无',
    conclusion: 'home', note: '体温偏高伴轻咳，建议回家休息观察，退热 48 小时后返园',
    by_user: '林保健', created_at: t, updated_at: t
  })
  insHc.run({
    id: uid('hc'), child_id: 'c_duoduo', date, temperature: 36.6, cough: 0, rash: 0,
    medicine: JSON.stringify([{ name: '氨溴索口服液', dose: '5ml', time: '12:30' }]),
    breakfast: '正常', mood: '🙂 愉快', special_items: '退烧药 1 瓶（已登记）',
    conclusion: 'observe', note: '带药幼儿，午间服药，注意观察咳嗽情况',
    by_user: '林保健', created_at: t, updated_at: t
  })
  insHc.run({
    id: uid('hc'), child_id: 'c_kangkang', date, temperature: 36.5, cough: 0, rash: 0,
    medicine: null, breakfast: '正常', mood: '😀 兴奋', special_items: '无',
    conclusion: 'admit', note: '', by_user: '林保健', created_at: t, updated_at: t
  })

  // 班级处置
  const insCd = db.prepare(`INSERT INTO class_decisions
    (id,child_id,date,action,observe_until,note,by_user,created_at) VALUES (?,?,?,?,?,?,?,?)`)
  insCd.run(uid('cd'), 'c_lele', date, 'home', null, '已通知李妈妈接回，门卫放行需核对接应人', '王老师', t)
  insCd.run(uid('cd'), 'c_duoduo', date, 'observe', '14:00', '午间服药后观察，午睡重点看护', '王老师', t)
  insCd.run(uid('cd'), 'c_kangkang', date, 'join', null, '正常入班', '赵老师', t)

  // 用药计划（朵朵 12:30）
  db.prepare(`INSERT INTO med_plans (id,child_id,date,med_name,dose,planned_time,status,source,created_at)
    VALUES (?,?,?,?,?,?,?, 'morning', ?)`).run(uid('mp'), 'c_duoduo', date, '氨溴索口服液', '5ml', '12:30', 'pending', t)

  // 今日接送计划
  const insPickup = db.prepare(`INSERT INTO pickups
    (id,client_id,child_id,date,person_id,person_name,relation,method,scheduled_time,actual_time,photo_url,pin_verified,is_late,status,created_via,synced_at,created_at)
    VALUES (@id,@client_id,@child_id,@date,@person_id,@person_name,@relation,@method,@scheduled_time,NULL,NULL,0,0,@status,'online',@synced_at,@created_at)`)
  function plannedPickup(childId, personId, personName, relation, time, method = 'walk') {
    insPickup.run({
      id: uid('pk'), client_id: uid('cli'), child_id: childId, date, person_id: personId,
      person_name: personName, relation, method, scheduled_time: time,
      status: 'planned', synced_at: t, created_at: t
    })
  }
  plannedPickup('c_lele', 'ap_lele_mom', '李妈妈', 'parent', '09:30')   // 发热提前接回
  plannedPickup('c_duoduo', 'ap_duoduo_nanny', '王阿姨', 'nanny', '17:00')
  plannedPickup('c_kangkang', 'ap_kangkang_mom', '周妈妈', 'parent', '17:10', 'bus')
  plannedPickup('c_an_an', 'ap_anan_mom', '陈妈妈', 'parent', '17:00')

  // 晨检入园 gate log（演示一条）
  db.prepare(`INSERT INTO gate_logs (id,client_id,child_id,child_name,person_name,result,reason,created_via,synced_at,created_at)
    VALUES (?,?,?,?,?,?,'晨检入园','online',?,?)`)
    .run(uid('gl'), uid('cli'), 'c_kangkang', '周康康', '周妈妈', 'pass', t, `${date}T07:55:00+08:00`)

  // 校车记录
  const insBus = db.prepare(`INSERT INTO bus_records
    (id,child_id,date,route,board_morning,alight_morning,board_evening,alight_evening,escort_teacher,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
  insBus.run(uid('br'), 'c_kangkang', date, 'B线', '07:40', '08:05', null, null, '孙老师', '赵老师')
  insBus.run(uid('br'), 'c_lele', date, 'A线', '07:45', '08:10', null, null, '孙老师', '林保健')

  // 园内活动
  db.prepare(`INSERT INTO activities (id,class_id,date,name,start_time,end_time,location,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uid('ac'), 'cls_sunflower', date, '户外体能循环', '10:00', '10:45', '操场东', '王老师', t)

  // 传染病观察：小二班手足口观察
  db.prepare(`INSERT INTO disease_alerts (id,class_id,disease_name,since_date,status,note,created_by,created_at)
    VALUES (?,?,?,?,'active',?,?,?)`)
    .run(uid('da'), 'cls_littlebee', '手足口病', date, '同班 1 例确诊，观察期 10 天，加强晨午检与手卫生', '刘园长', t)

  // 班级老师交接
  db.prepare(`INSERT INTO teacher_handovers (id,class_id,date,shift,from_teacher,to_teacher,handover_time,content,children_count,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(uid('th'), 'cls_sunflower', date, '早班→午班', '王老师', '李副班', '11:30',
      '朵朵带药 12:30 服用；乐乐发热已通知接回；午睡重点观察朵朵咳嗽', 3, t)

  // 预警
  const insAlert = db.prepare(`INSERT INTO alerts (id,child_id,class_id,type,title,message,severity,for_roles,status,created_at)
    VALUES (?,?,?,?,?,?,?,?, 'open', ?)`)
  insAlert.run(uid('al'), 'c_lele', 'cls_sunflower', 'fever', '晨检发热：李乐乐 37.9℃',
    '伴轻咳，保健建议回家，待家长接回', 'critical', 'health,teacher,guard,principal,parent', t)
  insAlert.run(uid('al'), 'c_duoduo', 'cls_sunflower', 'med', '带药登记：张朵朵 12:30 氨溴索 5ml',
    '服药时间变更将实时通知各方', 'warn', 'health,teacher,principal,parent', t)
  insAlert.run(uid('al'), null, 'cls_littlebee', 'disease', '传染病观察：小二班 手足口病',
    '同班出现确诊病例，观察期内加强晨午检', 'critical', '*', t)
  insAlert.run(uid('al'), 'c_lele', 'cls_sunflower', 'pickup_change', '临时改接申请：李乐乐',
    '李妈妈申请 09:30 提前接回（发热），待审批', 'warn', 'teacher,guard,principal,parent', t)

  // 家长沟通
  db.prepare(`INSERT INTO communications (id,child_id,class_id,channel,from_user,from_name,to_role,content,acked,created_at)
    VALUES (?,?,?, 'app', ?, ?, ?, ?, 0, ?)`)
    .run(uid('cm'), 'c_lele', 'cls_sunflower', '林保健', '林保健', 'parent',
      '乐乐妈妈您好，乐乐晨检体温 37.9℃ 伴轻咳，建议接回休息，退热 48 小时后返园。', t)
}
