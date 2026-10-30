import { useEffect, useState, useCallback } from 'react'
import type { Application, JobStatus } from './data'

export interface Settings {
  onboarded: boolean
  upload: 'idle' | 'parsing' | 'done'
  fileName: string
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
  mode: 'auto' | 'review'
  cap: number
  noReapply: boolean
  emailOn: boolean
  email: string
  emailFreq: 'After each run' | 'Daily digest' | 'Weekly'
  conn: Record<string, boolean>
  jobStatus: Record<number, JobStatus>
  extraApps: Application[]
  ran: boolean
}

export const DEFAULTS: Settings = {
  onboarded: false,
  upload: 'idle',
  fileName: 'Jordan_Avery_Resume.pdf',
  skillOff: [],
  cities: ['Ottawa, ON', 'Gatineau, QC'],
  scope: 'all',
  provinces: ['ON', 'QC'],
  types: ['Regular paid', 'Contract', 'Freelance', 'Co-op', 'Internship', 'Volunteer'],
  levels: ['Intermediate', 'Expert'],
  salPer: 'Annual',
  salMin: 90,
  salMax: 140,
  salUnlisted: true,
  years: 7,
  freq: 'Weekdays',
  time: '07:00',
  mode: 'auto',
  cap: 10,
  noReapply: true,
  emailOn: true,
  email: 'jordan.avery@mail.com',
  emailFreq: 'After each run',
  conn: { LinkedIn: true, Indeed: true, Glassdoor: true, 'Job Bank (Canada)': true, 'Company career pages': true, Workopolis: false },
  jobStatus: {},
  extraApps: [],
  ran: false,
}

const KEY = 'sjf:v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = { ...DEFAULTS, ...JSON.parse(raw) } as Settings
      // A half-finished upload shouldn't be restored as "parsing"
      if (saved.upload === 'parsing') saved.upload = 'idle'
      return saved
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

export function nextRun(s: Settings) {
  const t = s.time.replace(/^0/, '')
  const d = s.freq === 'Weekly' ? 'Mon' : 'Tomorrow'
  return `${d}, ${t}`
}

export const fmtSalary = (s: Settings, v: number) => (s.salPer === 'Hourly' ? `$${v}/hr` : `$${v}k`)

export function toggleIn<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}
