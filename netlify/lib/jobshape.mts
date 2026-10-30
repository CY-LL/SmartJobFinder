// The common shape of a job posting, and helpers that turn raw site data into it.

import { str } from './apify.mts'

export interface FoundJob {
  id: string
  title: string
  company: string
  loc: string
  province: string
  mode: 'On-site' | 'Hybrid' | 'Remote'
  source: string
  /** Where the posting really lives, when a source re-lists other sites (Google Jobs, Job Bank). */
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

export const PROVINCES: Record<string, string> = { ontario: 'ON', quebec: 'QC', québec: 'QC', 'british columbia': 'BC', alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'nova scotia': 'NS', 'new brunswick': 'NB', 'newfoundland and labrador': 'NL', 'prince edward island': 'PE', yukon: 'YT', 'northwest territories': 'NT', nunavut: 'NU' }
export function provinceOf(text: string): string {
  const code = text.match(/\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/)?.[1]
  if (code) return code
  const name = Object.keys(PROVINCES).find((n) => text.toLowerCase().includes(n))
  return name ? PROVINCES[name] : ''
}

export function typeOf(raw: string, title: string): string {
  const t = `${raw} ${title}`.toLowerCase()
  if (/co-?op\b|apprentice/.test(t)) return 'Co-op'
  if (/intern/.test(t)) return 'Internship'
  if (/volunteer/.test(t)) return 'Volunteer'
  if (/freelance/.test(t)) return 'Freelance'
  if (/contract|temporary|fixed[- ]term/.test(t)) return 'Contract'
  return 'Regular paid'
}

export function modeOf(...texts: string[]): FoundJob['mode'] {
  const t = texts.join(' ').slice(0, 1500)
  if (/\bhybrid\b/i.test(t)) return 'Hybrid'
  if (/\bremote\b|work from home|télétravail/i.test(t)) return 'Remote'
  return 'On-site'
}

export function yearsOf(desc: string): { yrs: string; yrsMin: number | null } {
  const m = desc.match(/(\d{1,2})\s*(\+|\s*(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b)/i)
  if (!m) return { yrs: '', yrsMin: null }
  const a = Number(m[1]), b = m[3] ? Number(m[3]) : null
  if (a > 25) return { yrs: '', yrsMin: null }
  return { yrs: b ? `${a}–${b}` : `${a}+`, yrsMin: a }
}

export function levelOf(title: string, seniority: string, yrsMin: number | null): FoundJob['level'] {
  const t = title.toLowerCase()
  const s = seniority.toLowerCase() // LinkedIn: Internship, Entry level, Associate, Mid-Senior level, Director, Executive
  if (/\b(intern|co-?op|junior|jr\.?|entry|graduate|new grad|student|trainee|apprentice)\b/.test(t) || /entry|internship/.test(s)) return 'Junior'
  if (/\b(senior|sr\.?|lead|principal|staff|head|director|vp|chief|architect)\b/.test(t) || /director|executive/.test(s)) return 'Expert'
  if (yrsMin !== null) return yrsMin >= 7 ? 'Expert' : yrsMin <= 1 ? 'Junior' : 'Intermediate'
  return 'Intermediate'
}

export const money = (n: number, unit: 'year' | 'hour') => (unit === 'hour' ? `$${Math.round(n)}` : `$${Math.round(n / 1000)}k`)
export function salaryText(min: number | null, max: number | null, unit: 'year' | 'hour' | null): string {
  if (!unit || (!min && !max)) return ''
  const suffix = unit === 'hour' ? '/hr' : ''
  if (min && max && min !== max) return `${money(min, unit)}–${money(max, unit).replace('$', '')}${suffix}`
  return `${money((min || max)!, unit)}${suffix}`
}

export function clip(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000)
}
export function parseLinkedInSalary(s: string): Pick<FoundJob, 'salMin' | 'salMax' | 'salUnit'> {
  const nums = [...s.matchAll(/([\d,.]+)\s*(k)?/gi)].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)).filter((n) => n > 0)
  if (!nums.length) return { salMin: null, salMax: null, salUnit: null }
  const unit = /\/\s*hr|hour/i.test(s) ? 'hour' : 'year'
  return { salMin: nums[0], salMax: nums[1] ?? nums[0], salUnit: unit }
}

/** Shared tail of every normalizer: work out mode, level, years and the display location. */
export function finish(base: { id: string; title: string; company: string; city: string; province: string; source: string; via?: string; typeText: string; salMin: number | null; salMax: number | null; salUnit: 'year' | 'hour' | null; posted: string; url: string; applyUrl?: string; desc: string; modeText?: string; seniority?: string; tags?: string[] }): FoundJob {
  const desc = clip(base.desc)
  const mode = modeOf(base.modeText ?? '', base.title, base.city, desc)
  const { yrs, yrsMin } = yearsOf(desc)
  return {
    id: base.id,
    title: base.title,
    company: base.company || 'Company not listed',
    loc: mode === 'Remote' ? `Remote · ${base.province || 'Canada'}` : [base.city, base.province].filter(Boolean).join(', ') || 'Canada',
    province: base.province,
    mode,
    source: base.source,
    via: base.via,
    type: typeOf(base.typeText, base.title),
    salary: salaryText(base.salMin, base.salMax, base.salUnit),
    salMin: base.salMin, salMax: base.salMax, salUnit: base.salUnit,
    posted: base.posted,
    url: base.url,
    applyUrl: base.applyUrl || base.url,
    desc,
    level: levelOf(base.title, base.seniority ?? '', yrsMin),
    yrs, yrsMin,
    tags: base.tags ?? [],
  }
}

/** Short stable id for a string (FNV-1a), for sources without their own job ids. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36) + s.length.toString(36)
}

export const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null)
export const unitOf = (v: unknown): 'year' | 'hour' | null => (/hour/i.test(str(v)) ? 'hour' : /year|annual|month/i.test(str(v)) ? 'year' : null)
