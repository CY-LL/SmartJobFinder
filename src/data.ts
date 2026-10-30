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
  /** The site a re-listed posting came from (e.g. a company careers page found through Google Jobs). */
  via?: string
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
  /** The resume and cover letter as they were when the user applied, edits included. */
  resumeHtml?: string
  coverHtml?: string
}

export const CITIES = ['Ottawa, ON', 'Gatineau, QC', 'Kanata, ON', 'Toronto, ON', 'Montréal, QC', 'Kingston, ON', 'Vancouver, BC', 'Calgary, AB', 'Edmonton, AB', 'Winnipeg, MB', 'Halifax, NS', 'Waterloo, ON', 'Mississauga, ON', 'Québec City, QC', 'Victoria, BC']
export const PROVINCES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU']
export const JOB_TYPES = ['Regular paid', 'Contract', 'Freelance', 'Co-op', 'Internship', 'Volunteer']
export const LEVELS = ['Junior', 'Intermediate', 'Expert']

/** An employer whose public job board is read directly (see netlify/functions/boards.mts). */
export interface Employer { ats: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters'; slug: string; name: string }

/**
 * Where jobs come from, with what each adds. Free sources are public job APIs read by /api/boards;
 * paid ones are Apify scrapers run by /api/jobs, which use Apify credit.
 */
export const SOURCES: { name: string; note: string; paid: boolean }[] = [
  { name: 'Employers', note: 'Career pages you add below', paid: false },
  { name: 'Himalayas', note: 'Remote jobs open to Canada', paid: false },
  { name: 'Jobicy', note: 'Remote jobs open to Canada', paid: false },
  { name: 'Remotive', note: 'Remote jobs · listed a day late', paid: false },
  { name: 'Remote OK', note: 'Remote jobs', paid: false },
  { name: 'LinkedIn', note: 'via Apify', paid: true },
  { name: 'Indeed', note: 'via Apify', paid: true },
  { name: 'Glassdoor', note: 'via Apify', paid: true },
  { name: 'Job Bank', note: 'Government of Canada · via Apify', paid: true },
  { name: 'Workopolis', note: 'via Apify', paid: true },
  { name: 'Google Jobs', note: 'Includes company career pages · via Apify', paid: true },
]
export const SOURCE_NAMES = SOURCES.map((x) => x.name)
export const PAID_SOURCES = SOURCES.filter((x) => x.paid).map((x) => x.name)
/** The site a posting is shown as coming from: an employer's own board shows as their careers page. */
export const sourceLabel = (j: Pick<Job, 'source' | 'company'>) => (j.source === 'Employers' ? `${j.company} careers` : j.source)

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
