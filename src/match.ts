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

/** "Graphic Design Intern" → "Graphic Designer": drop internship / student wording so searches find real jobs. */
export function cleanTitle(raw: string): string {
  const t = raw.split(/\s*[,|@•·]\s*|\s+at\s+|\s+-\s+/i)[0]
    .replace(/\(.*?\)/g, '')
    .replace(/\b(intern(ship)?|co-?op|student|trainee|apprentice|volunteer|part[- ]time|summer|placement)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  // What's left of "Graphic Design Intern" is the field, not a job title.
  return (/\bdesign$/i.test(t) ? `${t}er` : t).slice(0, 60)
}

/**
 * The job titles to search for when the user hasn't picked their own: their headline, then for early-career
 * profiles the junior version of it ("Junior Designer"), then their latest role. Older roles in other
 * fields (tutor, receptionist) aren't searched.
 */
export function suggestedTitles(p: Profile): string[] {
  const main = cleanTitle(p.title) || cleanTitle(p.roles[0]?.title ?? '')
  const junior = main && (p.level === 'Junior' || p.years < 3) && !/^junior\b/i.test(main) ? `Junior ${main.split(' ').pop()}` : ''
  const latest = cleanTitle(p.roles[0]?.title ?? '')
  return [main, junior, latest]
    .filter((t) => t && t.split(' ').length <= 5)
    .filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 2)
}

/** The searches to run: each job title near the user's first city, and remote in Canada. */
export function searchesFor(p: Profile, s: Settings) {
  const titles = (s.searchTitles?.length ? s.searchTitles : suggestedTitles(p)).slice(0, 3)
  const city = s.cities[0] ?? p.city ?? ''
  return titles.flatMap((keywords) => [
    ...(city ? [{ keywords, location: city, remote: false }] : []),
    { keywords, location: 'Canada', remote: true },
  ])
}

// ---------- Tailoring ----------

export interface TailoredRole {
  title: string
  org: string
  dates: string
  /** Bullets to show, most relevant to the posting first. */
  bullets: { text: string; relevant: boolean }[]
  score: number
}

export interface Tailored {
  matched: string[]
  rest: string[]
  summary: string
  roles: TailoredRole[]
  /** The single most relevant bullet, with its role, for the cover letter. */
  best: { text: string; title: string; org: string }[]
  education: TailoredEducation[]
  /** Recent graduates and early-career profiles lead with education. */
  educationFirst: boolean
  /** The most relevant program, and one of its points if it fits the posting, for the cover letter. */
  bestEducation?: { credential: string; school: string; dates: string; recent: boolean; point?: string }
}

export interface TailoredEducation {
  credential: string
  school: string
  dates: string
  bullets: { text: string; relevant: boolean }[]
}

const HONOURS = /\b(honou?rs?|dean'?s|award|scholarship|gpa|distinction|cum laude|valedictorian|medal)\b/i

/** The year a program or role ends: "Ongoing"/"NOW" count as this year, "2023–26" as 2026. */
export function endYearOf(dates: string): number {
  if (/ongoing|now|present/i.test(dates)) return new Date().getFullYear()
  const m = dates.match(/(\d{4})(?:–(\d{2,4}))?/)
  if (!m) return 0
  return m[2] ? Number(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]) : Number(m[1])
}

const keywordsOf = (text: string) => new Set(words(text).filter((w) => w.length > 3))

/**
 * Picks and orders the user's own bullets for one posting. Nothing is reworded: bullets that share
 * the posting's words (and skills it asks for) move to the front, and older or unrelated roles keep fewer.
 */
export function tailor(p: Profile, skills: string[], job: Pick<Job, 'title' | 'desc' | 'tags'>): Tailored {
  const matched = skillsInJob(skills, job)
  const jobWords = keywordsOf(`${job.title} ${job.title} ${job.tags.join(' ')} ${job.desc}`)
  const titleWords = keywordsOf(job.title)
  const scoreBullet = (b: string) => {
    const bw = keywordsOf(b)
    const shared = [...bw].filter((w) => jobWords.has(w)).length
    const skillHits = matched.filter((k) => b.toLowerCase().includes(k.toLowerCase())).length
    return shared + 2 * skillHits
  }

  const scored = p.roles.map((r) => {
    const bullets = (r.highlights ?? []).map((text, i) => ({ text, i, score: scoreBullet(text) }))
    const titleFit = [...keywordsOf(r.title)].filter((w) => titleWords.has(w)).length
    return { r, bullets, score: Math.max(0, ...bullets.map((b) => b.score)) + 3 * titleFit }
  })
  const ranking = [...scored].sort((a, b) => b.score - a.score)
  const roles: TailoredRole[] = scored.map(({ r, bullets, score }, idx) => {
    const rank = ranking.findIndex((x) => x.r === r)
    // The two most relevant roles show up to 3 bullets, others 2; an older, unrelated role keeps 1.
    const keep = rank < 2 ? 3 : score === 0 && idx >= 2 ? 1 : 2
    const top = [...bullets].sort((a, b) => b.score - a.score || a.i - b.i).slice(0, keep)
    const threshold = Math.max(2, ...bullets.map((b) => b.score)) / 2
    return { title: r.title, org: r.org, dates: r.dates, score, bullets: top.map((b) => ({ text: b.text, relevant: b.score >= threshold && b.score >= 2 })) }
  })

  const summary = (p.summary ?? '').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')
  // Two different points for the cover letter: skip one that mostly repeats the first
  // (LinkedIn and a portfolio often describe the same work twice).
  const overlap = (a: string, b: string) => {
    const wa = keywordsOf(a), wb = keywordsOf(b)
    return [...wa].filter((w) => wb.has(w)).length / Math.max(1, Math.min(wa.size, wb.size))
  }
  const best: Tailored['best'] = []
  for (const b of scored
    .flatMap(({ r, bullets }) => bullets.map((x) => ({ text: x.text, title: r.title, org: r.org, score: x.score })))
    .sort((a, b) => b.score - a.score)) {
    if (best.length === 2 || b.score === 0) break
    if (best.every((x) => overlap(x.text, b.text) < 0.4)) best.push({ text: b.text, title: b.title, org: b.org })
  }

  // Education: the most relevant program keeps two points, others one if it fits the posting; honours always stay.
  const eduScored = (p.education ?? []).map((e) => {
    const bullets = (e.highlights ?? []).map((text, i) => ({ text, i, score: scoreBullet(text) + (HONOURS.test(text) ? 3 : 0) }))
    const fit = [...keywordsOf(e.credential)].filter((w) => jobWords.has(w)).length
    return { e, bullets, score: Math.max(0, ...bullets.map((b) => b.score)) + 3 * fit }
  })
  const topEdu = [...eduScored].sort((a, b) => b.score - a.score || endYearOf(b.e.dates) - endYearOf(a.e.dates))[0]
  // Finished programs newest first, then ongoing courses, then undated entries.
  const eduOrder = (d: string) => (/ongoing|now|present/i.test(d) ? 1 : endYearOf(d))
  const education: TailoredEducation[] = [...eduScored].sort((a, b) => eduOrder(b.e.dates) - eduOrder(a.e.dates)).map(({ e, bullets }) => {
    const keep = topEdu && e === topEdu.e ? 2 : 1
    const honours = bullets.filter((b) => HONOURS.test(b.text))
    const points = bullets.filter((b) => !HONOURS.test(b.text)).sort((a, b) => b.score - a.score || a.i - b.i).filter((b) => b.score > 0 || e === topEdu?.e).slice(0, keep)
    return {
      credential: e.credential, school: e.school, dates: e.dates,
      bullets: [...honours.slice(0, 1).map((b) => ({ text: b.text, relevant: false })), ...points.map((b) => ({ text: b.text, relevant: b.score >= 2 }))],
    }
  })
  const thisYear = new Date().getFullYear()
  const latestEnd = Math.max(0, ...(p.education ?? []).map((e) => (/ongoing/i.test(e.dates) ? 0 : endYearOf(e.dates))))
  const educationFirst = education.length > 0 && (p.years < 3 || latestEnd >= thisYear - 1)
  const eduPoint = topEdu?.bullets.filter((b) => b.score >= 3 && !HONOURS.test(b.text) && best.every((x) => overlap(x.text, b.text) < 0.4)).sort((a, b) => b.score - a.score)[0]
  const bestEducation = topEdu && topEdu.e.credential && !/ongoing/i.test(topEdu.e.dates)
    ? { credential: topEdu.e.credential, school: topEdu.e.school, dates: topEdu.e.dates, recent: endYearOf(topEdu.e.dates) >= thisYear - 1, point: eduPoint?.text }
    : undefined

  return { matched, rest: skills.filter((k) => !matched.includes(k)), summary, roles, best, education, educationFirst, bestEducation }
}

/** Plain-language reason a posting is hidden, for the "show hidden" view. */
export function hiddenReason(job: Job, s: Settings, match: number): string {
  switch (filteredOut(job, s)) {
    case 'job type':
      return `${job.type} isn't one of your job types`
    case 'no salary listed':
      return 'No salary listed (you turned these off)'
    case 'salary':
      return `Pays ${job.salary || 'less'}, under your minimum of ${s.salPer === 'Hourly' ? `$${s.salMin}/hr` : `$${s.salMin}k`}`
    case 'experience':
      return `Asks for ${job.yrs} years; your limit is ${s.years}`
    case 'location':
      return job.mode === 'Remote' ? `Remote in ${job.province}, outside your provinces` : `${job.loc} isn't one of your cities`
    case 'source':
      return `${job.source} is turned off`
    default:
      return match < MIN_SCORE ? `Low match (${match}%)` : ''
  }
}

/** Postings scoring below this are hidden unless the user asks to see everything. */
export const MIN_SCORE = 30
