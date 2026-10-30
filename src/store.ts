import { useEffect, useState, useCallback } from 'react'
import type { Application, Job, JobStatus } from './data'
import type { Profile } from './profile'

export interface Settings {
  onboarded: boolean
  upload: 'idle' | 'done'
  fileName: string
  profile: Profile | null
  skillOff: string[]
  cities: string[]
  scope: 'all' | 'some'
  provinces: string[]
  types: string[]
  levels: string[]
  salPer: 'Annual' | 'Hourly'
  salMin: number
  salMax: number
  salUnlisted: boolean
  years: number
  freq: 'Daily' | 'Weekdays' | 'Weekly'
  time: string
  noReapply: boolean
  conn: Record<string, boolean>
  /** Postings from the latest searches, newest search first. */
  jobs: Job[]
  jobStatus: Record<string, JobStatus>
  /** The user's edited resume / cover letter for a job, as HTML, keyed by job id. */
  docs: Record<string, { resume?: string; cover?: string }>
  apps: Application[]
  lastRun: { at: string; found: number; failed: string[] } | null
}

export const DEFAULTS: Settings = {
  onboarded: false,
  upload: 'idle',
  fileName: '',
  profile: null,
  skillOff: [],
  cities: [],
  scope: 'all',
  provinces: ['ON', 'QC'],
  types: ['Regular paid', 'Contract', 'Freelance', 'Co-op', 'Internship', 'Volunteer'],
  levels: ['Intermediate', 'Expert'],
  salPer: 'Annual',
  salMin: 60,
  salMax: 200,
  salUnlisted: true,
  years: 5,
  freq: 'Weekdays',
  time: '07:00',
  noReapply: true,
  conn: { LinkedIn: true, Indeed: true, Glassdoor: true, 'Job Bank': true, Workopolis: true, 'Google Jobs': true },
  jobs: [],
  jobStatus: {},
  docs: {},
  apps: [],
  lastRun: null,
}

const KEY = 'sjf:v2'
const OLD_KEY = 'sjf:v1'

// Keys from the first version that held prototype demo data; never carried over.
const DROPPED = ['jobStatus', 'extraApps', 'ran', 'conn', 'mode', 'cap', 'emailOn', 'email', 'emailFreq', 'jobs', 'apps', 'lastRun']

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) } as Settings
    // Coming from v1: keep a real profile and preferences, drop all demo jobs and applications.
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const prev = JSON.parse(old) as Record<string, unknown>
      localStorage.removeItem(OLD_KEY)
      for (const k of DROPPED) delete prev[k]
      const hasRealProfile = !!prev.profile
      return { ...DEFAULTS, ...prev, onboarded: hasRealProfile && !!prev.onboarded, upload: hasRealProfile ? 'done' : 'idle' } as Settings
    }
  } catch {
    // storage unavailable (private mode etc.) — fall back to defaults
  }
  return DEFAULTS
}

export type Patch = Partial<Settings> | ((s: Settings) => Partial<Settings>)

export function useSettings() {
  const [s, setS] = useState<Settings>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // ignore
    }
  }, [s])
  const set = useCallback((p: Patch) => setS((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) })), [])
  const reset = useCallback(() => setS(DEFAULTS), [])
  return [s, set, reset] as const
}
// Hash-based routing so the browser back button and deep links work on any static host.
export function useRoute(): [string[], (path: string) => void] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [parts, setParts] = useState<string[]>(parse)
  useEffect(() => {
    const on = () => {
      setParts(parse())
      document.querySelector('.content')?.scrollTo(0, 0)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((path: string) => {
    window.location.hash = '/' + path
  }, [])
  return [parts, go]
}

const FREQ_HOURS = { Daily: 24, Weekdays: 24, Weekly: 24 * 7 }

/** When the next scheduled search is due, given the last one. */
export function nextRunDate(s: Settings): Date {
  const [h, m] = s.time.split(':').map(Number)
  const from = s.lastRun ? new Date(s.lastRun.at) : new Date(0)
  const d = new Date(Math.max(from.getTime(), Date.now() - FREQ_HOURS[s.freq] * 3600e3))
  d.setHours(h, m, 0, 0)
  while (d.getTime() <= from.getTime() || (s.freq === 'Weekdays' && (d.getDay() === 0 || d.getDay() === 6)) || (s.freq === 'Weekly' && d.getDay() !== 1)) d.setDate(d.getDate() + 1)
  return d
}

export function nextRun(s: Settings) {
  const d = nextRunDate(s)
  const t = s.time.replace(/^0/, '')
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400e3)
  if (days <= 0) return `Today, ${t}`
  if (days === 1) return `Tomorrow, ${t}`
  return `${d.toLocaleDateString('en-CA', { weekday: 'short' })}, ${t}`
}
export const fmtSalary = (s: Settings, v: number) => (s.salPer === 'Hourly' ? `$${v}/hr` : `$${v}k`)

export function toggleIn<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}
