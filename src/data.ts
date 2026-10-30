// Shared types and fixed lists. Jobs come from /api/jobs; applications are logged as the user applies.

export type JobStatus = 'new' | 'applied' | 'skipped'
export type AppStatus = 'Applied' | 'Interview' | 'Offer' | 'Rejected'

/** A posting returned by the job search function (see netlify/functions/jobs.mts). */
export interface Job {
  id: string
  title: string
  company: string
  loc: string
  province: string
  mode: 'On-site' | 'Hybrid' | 'Remote'
  source: string
  type: string
  salary: string
  salMin: number | null
  salMax: number | null
  salUnit: 'year' | 'hour' | null
  posted: string
  url: string
  applyUrl: string
  desc: string
  level: 'Junior' | 'Intermediate' | 'Expert'
  yrs: string
  yrsMin: number | null
  tags: string[]
}

export interface Application {
  id: string
  jobId: string
  company: string
  role: string
  date: string
  source: string
  url: string
  status: AppStatus
  level: string
  yrs: string
  desc: string
  tags: string[]
  history: { e: string; d: string }[]
}

export const CITIES = ['Ottawa, ON', 'Gatineau, QC', 'Kanata, ON', 'Toronto, ON', 'Montréal, QC', 'Kingston, ON', 'Vancouver, BC', 'Calgary, AB', 'Edmonton, AB', 'Winnipeg, MB', 'Halifax, NS', 'Waterloo, ON', 'Mississauga, ON', 'Québec City, QC', 'Victoria, BC']
export const PROVINCES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU']
export const JOB_TYPES = ['Regular paid', 'Contract', 'Freelance', 'Co-op', 'Internship', 'Volunteer']
export const LEVELS = ['Junior', 'Intermediate', 'Expert']

/** Sources with a working scraper behind /api/jobs. */
export const LIVE_SOURCES = ['LinkedIn', 'Indeed']
export const PLANNED_SOURCES = ['Glassdoor', 'Job Bank (Canada)', 'Company career pages', 'Workopolis']

export const APP_STATUS_COLORS: Record<AppStatus, [string, string]> = {
  Applied: ['var(--line-2)', 'var(--ink)'],
  Interview: ['var(--green-bg)', 'var(--green-fg)'],
  Offer: ['oklch(0.94 0.04 80)', 'oklch(0.42 0.1 80)'],
  Rejected: ['#F1ECE4', 'var(--faint)'],
}

export const JOB_STATUS: Record<JobStatus, [string, string, string]> = {
  new: ['New', 'oklch(0.94 0.05 45)', 'oklch(0.45 0.13 45)'],
  applied: ['Applied', 'var(--green-bg)', 'var(--green-fg)'],
  skipped: ['Skipped', '#F1ECE4', 'var(--faint)'],
}

export function fmtDate(iso: string, withTime = false) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  return withTime ? `${date} · ${d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}` : date
}

export function ago(iso: string) {
  const d = new Date(iso).getTime()
  if (isNaN(d)) return ''
  const h = Math.round((Date.now() - d) / 3600e3)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}
