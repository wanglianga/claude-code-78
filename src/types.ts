export type Role = 'health' | 'teacher' | 'guard' | 'principal' | 'parent' | 'cleaner'

export interface User {
  id: string
  username: string
  name: string
  role: Role
  phone?: string | null
  classId?: string | null
}

export interface ClassRoom {
  id: string
  name: string
  sort: number
}

export interface Child {
  id: string
  name: string
  classId: string
  emoji: string
  busRoute?: string | null
}

export interface AuthorizedPerson {
  id: string
  childId: string
  name: string
  relation: 'parent' | 'grandparent' | 'nanny' | 'temporary'
  phone?: string | null
  idLast4?: string | null
  pin: string
  photoUrl?: string | null
  active: number
  status: string
  validFrom?: string | null
  validUntil?: string | null
  source?: string | null
  grantedBy?: string | null
}

export interface MedicineItem { name: string; dose: string; time: string }

export interface HealthCheck {
  id: string
  childId: string
  date: string
  temperature?: number | null
  cough: number
  rash: number
  medicine?: string | null
  breakfast?: string
  mood?: string
  specialItems?: string
  conclusion: 'admit' | 'observe' | 'home'
  note?: string
  byUser?: string
}

export interface ClassDecision {
  id: string
  childId: string
  date: string
  action: 'join' | 'observe' | 'home'
  observeUntil?: string | null
  note?: string
  byUser?: string
}

export interface MedPlan {
  id: string
  childId: string
  date: string
  medName: string
  dose?: string
  plannedTime: string
  actualTime?: string | null
  status: 'pending' | 'done' | 'skipped'
  byUser?: string | null
  note?: string | null
  source: string
}

export interface Observation {
  id: string
  clientId?: string | null
  childId: string
  date: string
  type: 'fever' | 'nap' | 'rash' | 'diet' | 'other'
  content: string
  severity: 'info' | 'warn' | 'alert' | 'critical'
  byUser?: string
  createdAt: string
}

export interface CareTransfer {
  id: string
  clientId?: string | null
  childId: string
  date: string
  fromClassId: string
  toClassId: string
  reason?: string
  startTime: string
  endTime?: string | null
  status: 'active' | 'returned'
  byUser?: string
}

export interface Pickup {
  id: string
  clientId?: string | null
  childId: string
  date: string
  personId?: string | null
  personName?: string
  relation?: string
  method: string
  scheduledTime?: string | null
  actualTime?: string | null
  photoUrl?: string | null
  pinVerified: number
  isLate: number
  status: 'planned' | 'picked' | 'cancelled' | 'replaced' | 'expired'
  createdAt: string
  createdVia: string
  syncedAt?: string | null
  confirmedBy?: string | null
}

export interface GateLog {
  id: string
  clientId?: string | null
  childId?: string | null
  childName?: string | null
  personName?: string
  result: 'pass' | 'denied'
  reason?: string
  createdAt: string
  createdVia: string
}

export interface PickupChange {
  id: string
  childId: string
  date: string
  changeType: 'person' | 'time'
  newPersonName?: string | null
  newRelation?: string | null
  newPhone?: string | null
  newIdLast4?: string | null
  newPin?: string | null
  newTime?: string | null
  reason?: string
  idPhotoUrl?: string | null
  validFrom?: string | null
  validUntil?: string | null
  status: 'pending' | 'approved' | 'rejected'
  requestedBy?: string
  approvedBy?: string | null
  createdAt: string
  handledAt?: string | null
}

export interface BusRecord {
  id: string
  childId: string
  date: string
  route?: string | null
  boardMorning?: string | null
  alightMorning?: string | null
  boardEvening?: string | null
  alightEvening?: string | null
  escortTeacher?: string | null
  updatedBy?: string
}

export interface Activity {
  id: string
  classId: string
  date: string
  name: string
  startTime?: string | null
  endTime?: string | null
  location?: string
  createdBy?: string
}

export interface DiseaseAlert {
  id: string
  classId: string
  diseaseName: string
  sinceDate: string
  status: 'active' | 'lifted'
  note?: string
  createdBy?: string
}

export interface TeacherHandover {
  id: string
  classId: string
  date: string
  shift?: string
  fromTeacher: string
  toTeacher: string
  handoverTime: string
  content?: string
  childrenCount?: number | null
}

export interface Communication {
  id: string
  childId?: string | null
  classId?: string | null
  fromUser?: string
  fromName?: string
  toRole?: string
  content: string
  acked: number
  createdAt: string
}

export interface Alert {
  id: string
  childId?: string | null
  classId?: string | null
  type: string
  title: string
  message?: string
  severity: 'info' | 'warn' | 'critical'
  forRoles: string
  status: 'open' | 'resolved'
  createdAt: string
}

export interface AppState {
  serverTime: string
  clockHHMM: string
  date: string
  deadline: string
  users: User[]
  classes: ClassRoom[]
  children: Child[]
  parentLinks: { userId: string; childId: string }[]
  authorizedPersons: AuthorizedPerson[]
  healthChecks: HealthCheck[]
  classDecisions: ClassDecision[]
  medPlans: MedPlan[]
  observations: Observation[]
  careTransfers: CareTransfer[]
  pickups: Pickup[]
  gateLogs: GateLog[]
  pickupChanges: PickupChange[]
  busRecords: BusRecord[]
  activities: Activity[]
  diseaseAlerts: DiseaseAlert[]
  teacherHandovers: TeacherHandover[]
  communications: Communication[]
  alerts: Alert[]
  confirmations: { childId: string; date: string; confirmedBy?: string; confirmedAt?: string }[]
  feverIsolations: FeverIsolation[]
  classmateObservations: ClassmateObservation[]
  sanitationPlans: SanitationPlan[]
  nextDayMorningFlags: Record<string, { isolatedYesterday?: boolean; abnormalContactYesterday?: boolean }>
}

export interface FeverIsolation {
  id: string
  clientId?: string | null
  childId: string
  date: string
  temperature?: number | null
  symptoms: string[]
  isolationRoom?: string
  startTime: string
  parentNotifiedAt?: string | null
  classContact?: string
  medicalAdvice?: string | null
  adviceAt?: string | null
  adviceBy?: string | null
  released: number
  releasedAt?: string | null
  status: 'isolating' | 'advised' | 'released'
  byUser?: string
  createdAt: string
}

export interface ClassmateObservation {
  id: string
  isolationId: string
  classId: string
  childId: string
  date: string
  cough: number
  absent: number
  parentFeedback?: string
  temperature?: number | null
  abnormal: number
  byUser?: string
  createdAt: string
}

export interface SanitationPlan {
  id: string
  classId: string
  date: string
  scope?: string
  reason?: string
  isolationId?: string | null
  dueTime?: string | null
  status: 'pending' | 'done'
  notifiedCleaner?: string | null
  doneAt?: string | null
  doneBy?: string | null
  createdBy?: string
  createdAt: string
}
