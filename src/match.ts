// Scores postings against the user's profile and filters them by their preferences.

import type { Job } from './data'
import type { Profile } from './profile'
import type { Settings } from './store'

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'a', 'an', 'at', 'on', 'or', 'senior', 'junior', 'sr', 'jr', 'lead', 'ii', 'iii', 'i', 'remote', 'canada', 'hybrid', 'full', 'time', 'part', 'contract'])
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '')

export interface Scored {
  match: number
  matched: string[]
  why: string[]
}

/** Profile skills that appear in the posting. */
export function skillsInJob(skills: string[], job: Pick<Job, 'title' | 'desc' | 'tags'>): string[] {
  const hay = norm(`${job.title} ${job.tags.join(' ')} ${job.desc}`)
  return skills.filter((k) => {
    const n = norm(k)
    return n.length > 2 ? hay.includes(n) : new RegExp(`\\b${k.replace(/[^\w]/g, '\\$&')}\\b`, 'i').test(`${job.title} ${job.desc}`)
  })
}

export function scoreJob(job: Job, p: Profile, s: Settings): Scored {
  const skills = p.skills.filter((k) => !s.skillOff.includes(k))
  const matched = skillsInJob(skills, job)

  // Title fit: how much of the posting's title the user's own titles cover.
  const mine = new Set(words([p.title, ...p.roles.slice(0, 4).map((r) => r.title)].join(' ')))
  const theirs = words(job.title)
  const title = theirs.length ? theirs.filter((w) => mine.has(w)).length / theirs.length : 0

  const skill = skills.length ? Math.min(1, matched.length / Math.min(6, Math.max(3, skills.length / 3))) : 0.5
  const level = s.levels.includes(job.level) ? 1 : 0.4
  const years = job.yrsMin === null ? 0.8 : job.yrsMin <= p.years ? 1 : Math.max(0, 1 - (job.yrsMin - p.years) / 5)
  const match = Math.round(100 * Math.min(0.99, 0.45 * title + 0.3 * skill + 0.12 * level + 0.13 * years))

  const why: string[] = []
  if (title >= 0.5) why.push('Title matches your experience')
  if (job.yrsMin !== null) why.push(`Asks for ${job.yrs} yrs · you have ${p.years}`)
  return { match, matched, why }
}

const toAnnual = (n: number, unit: Job['salUnit']) => (unit === 'hour' ? n * 2000 : n)

/** Why a posting is filtered out by the user's preferences, or null if it passes. */
export function filteredOut(job: Job, s: Settings): string | null {
  if (!s.types.includes(job.type)) return 'job type'
  if (job.type !== 'Volunteer') {
    if (job.salMax === null && job.salMin === null) {
      if (!s.salUnlisted) return 'no salary listed'
    } else {
      const wantMin = s.salPer === 'Hourly' ? s.salMin * 2000 : s.salMin * 1000
      if (toAnnual(job.salMax ?? job.salMin ?? 0, job.salUnit) < wantMin) return 'salary'
    }
  }
  if (job.yrsMin !== null && job.yrsMin > s.years) return 'experience'
  if (job.mode === 'Remote') {
    if (s.scope === 'some' && job.province && !s.provinces.includes(job.province)) return 'location'
  } else if (s.cities.length) {
    const cities = s.cities.map((c) => c.split(',')[0].trim().toLowerCase())
    const here = job.loc.split(',')[0].trim().toLowerCase()
    if (!cities.some((c) => here.includes(c) || c.includes(here))) return 'location'
  }
  return null
}

/** The searches to run for a profile: its main title(s), near each on-site city and remote. */
export function searchesFor(p: Profile, s: Settings) {
  const titles = [p.title.split(/\s*[,|@•·]\s*|\s+at\s+|\s+-\s+/i)[0], p.roles[0]?.title ?? '']
    .map((t) => t.replace(/\(.*?\)/g, '').trim().slice(0, 60))
    .filter((t, i, a) => t && a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 2)
  const city = s.cities[0] ?? p.city ?? ''
  return titles.flatMap((keywords) => [
    ...(city ? [{ keywords, location: city, remote: false }] : []),
    { keywords, location: 'Canada', remote: true },
  ]).slice(0, 4)
}
