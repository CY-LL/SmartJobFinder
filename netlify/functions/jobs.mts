// Real job search through Apify scrapers.
//   POST /api/jobs { searches: [{ keywords, location, remote }], sources: ['Indeed', 'LinkedIn'] }
//     → { runs: [{ id, source }] }   (starts one scraper run per source and search)
//   GET  /api/jobs?runs=<id>:<source>,…
//     → { status: 'running', done, total } until every run has finished, then { jobs, failed }
// Requires APIFY_TOKEN. APIFY_INDEED_ACTOR / APIFY_LINKEDIN_JOBS_ACTOR override the scrapers.

import { checkRun, json, notConfigured, startRun, str } from '../lib/apify.mts'
import type { Json } from '../lib/apify.mts'

const SOURCES = {
  Indeed: {
    actor: () => Netlify.env.get('APIFY_INDEED_ACTOR') || 'valig~indeed-jobs-scraper',
    // Indeed treats "Remote" as a location.
    input: (s: Search) => ({ country: 'ca', title: s.keywords, location: s.remote ? 'Remote' : s.location, limit: 50, datePosted: '14' }),
    normalize: (j: Json) => fromIndeed(j),
  },
  LinkedIn: {
    actor: () => Netlify.env.get('APIFY_LINKEDIN_JOBS_ACTOR') || 'curious_coder~linkedin-jobs-scraper',
    input: (s: Search) => ({ keywords: s.remote ? `${s.keywords} remote` : s.keywords, location: s.remote ? 'Canada' : s.location, datePosted: 'pastWeek', limitPerSource: 25, scrapeCompany: false }),
    normalize: (j: Json) => fromLinkedIn(j),
  },
} as const
type Source = keyof typeof SOURCES
interface Search { keywords: string; location: string; remote: boolean }

export interface FoundJob {
  id: string
  title: string
  company: string
  loc: string
  province: string
  mode: 'On-site' | 'Hybrid' | 'Remote'
  source: Source
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

// ---------- Normalizing ----------

const PROVINCES: Record<string, string> = { ontario: 'ON', quebec: 'QC', québec: 'QC', 'british columbia': 'BC', alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'nova scotia': 'NS', 'new brunswick': 'NB', 'newfoundland and labrador': 'NL', 'prince edward island': 'PE', yukon: 'YT', 'northwest territories': 'NT', nunavut: 'NU' }
function provinceOf(text: string): string {
  const code = text.match(/\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/)?.[1]
  if (code) return code
  const name = Object.keys(PROVINCES).find((n) => text.toLowerCase().includes(n))
  return name ? PROVINCES[name] : ''
}

function typeOf(raw: string, title: string): string {
  const t = `${raw} ${title}`.toLowerCase()
  if (/co-?op\b|apprentice/.test(t)) return 'Co-op'
  if (/intern/.test(t)) return 'Internship'
  if (/volunteer/.test(t)) return 'Volunteer'
  if (/freelance/.test(t)) return 'Freelance'
  if (/contract|temporary|fixed[- ]term/.test(t)) return 'Contract'
  return 'Regular paid'
}

function modeOf(...texts: string[]): FoundJob['mode'] {
  const t = texts.join(' ').slice(0, 1500)
  if (/\bhybrid\b/i.test(t)) return 'Hybrid'
  if (/\bremote\b|work from home|télétravail/i.test(t)) return 'Remote'
  return 'On-site'
}

function yearsOf(desc: string): { yrs: string; yrsMin: number | null } {
  const m = desc.match(/(\d{1,2})\s*(\+|\s*(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b)/i)
  if (!m) return { yrs: '', yrsMin: null }
  const a = Number(m[1]), b = m[3] ? Number(m[3]) : null
  if (a > 25) return { yrs: '', yrsMin: null }
  return { yrs: b ? `${a}–${b}` : `${a}+`, yrsMin: a }
}

function levelOf(title: string, seniority: string, yrsMin: number | null): FoundJob['level'] {
  const t = title.toLowerCase()
  const s = seniority.toLowerCase() // LinkedIn: Internship, Entry level, Associate, Mid-Senior level, Director, Executive
  if (/\b(intern|co-?op|junior|jr\.?|entry|graduate|new grad|student|trainee|apprentice)\b/.test(t) || /entry|internship/.test(s)) return 'Junior'
  if (/\b(senior|sr\.?|lead|principal|staff|head|director|vp|chief|architect)\b/.test(t) || /director|executive/.test(s)) return 'Expert'
  if (yrsMin !== null) return yrsMin >= 7 ? 'Expert' : yrsMin <= 1 ? 'Junior' : 'Intermediate'
  return 'Intermediate'
}

const money = (n: number, unit: 'year' | 'hour') => (unit === 'hour' ? `$${Math.round(n)}` : `$${Math.round(n / 1000)}k`)
function salaryText(min: number | null, max: number | null, unit: 'year' | 'hour' | null): string {
  if (!unit || (!min && !max)) return ''
  const suffix = unit === 'hour' ? '/hr' : ''
  if (min && max && min !== max) return `${money(min, unit)}–${money(max, unit).replace('$', '')}${suffix}`
  return `${money((min || max)!, unit)}${suffix}`
}

function clip(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000)
}

function fromIndeed(j: Json): FoundJob | null {
  const title = str(j.title)
  if (!title || j.expired === true) return null
  const loc = (j.location ?? {}) as Json
  const employer = (j.employer ?? {}) as Json
  const attrs = Object.values((j.attributes ?? {}) as Record<string, string>)
  const desc = clip(str(((j.description ?? {}) as Json).text))
  const pay = (j.baseSalary ?? {}) as Json
  const unitRaw = str(pay.unitOfWork)
  const unit = unitRaw === 'HOUR' ? 'hour' : unitRaw === 'YEAR' ? 'year' : unitRaw === 'MONTH' ? 'year' : null
  const mult = unitRaw === 'MONTH' ? 12 : 1
  const salMin = typeof pay.min === 'number' ? pay.min * mult : null
  const salMax = typeof pay.max === 'number' ? pay.max * mult : null
  const city = str(loc.city)
  const province = str(loc.admin1Code) || provinceOf(str(loc.formattedAddressShort))
  const mode = modeOf(attrs.join(' '), title, city, desc)
  const { yrs, yrsMin } = yearsOf(desc)
  return {
    id: 'in-' + str(j.key),
    title,
    company: str(employer.name) || 'Company not listed',
    loc: mode === 'Remote' ? `Remote · ${province || 'Canada'}` : [city, province].filter(Boolean).join(', ') || 'Canada',
    province,
    mode,
    source: 'Indeed',
    type: typeOf(Object.values((j.jobTypes ?? {}) as Record<string, string>).join(' '), title),
    salary: salaryText(salMin, salMax, unit),
    salMin, salMax, salUnit: unit,
    posted: str(j.datePublished) || str(j.dateOnIndeed),
    url: str(j.url),
    applyUrl: str(j.jobUrl) || str(j.url),
    desc,
    level: levelOf(title, '', yrsMin),
    yrs, yrsMin,
    tags: attrs.filter((a) => !/remote|hybrid|work|pay|bonus|commission|benefit/i.test(a)).slice(0, 15),
  }
}

function parseLinkedInSalary(s: string): Pick<FoundJob, 'salMin' | 'salMax' | 'salUnit'> {
  const nums = [...s.matchAll(/([\d,.]+)\s*(k)?/gi)].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)).filter((n) => n > 0)
  if (!nums.length) return { salMin: null, salMax: null, salUnit: null }
  const unit = /\/\s*hr|hour/i.test(s) ? 'hour' : 'year'
  return { salMin: nums[0], salMax: nums[1] ?? nums[0], salUnit: unit }
}

function fromLinkedIn(j: Json): FoundJob | null {
  const title = str(j.title)
  if (!title) return null
  const location = str(j.location)
  const desc = clip(str(j.descriptionText))
  const pay = parseLinkedInSalary(str(j.salary))
  const province = provinceOf(location)
  const mode = modeOf(title, location, desc)
  const { yrs, yrsMin } = yearsOf(desc)
  const city = location.split(',')[0].trim()
  return {
    id: 'li-' + str(j.id),
    title,
    company: str(j.companyName) || 'Company not listed',
    loc: mode === 'Remote' ? `Remote · ${province || 'Canada'}` : [city, province].filter(Boolean).join(', ') || location,
    province,
    mode,
    source: 'LinkedIn',
    type: typeOf(str(j.employmentType), title),
    salary: salaryText(pay.salMin, pay.salMax, pay.salUnit),
    ...pay,
    posted: str(j.postedAt),
    url: str(j.link).split('?')[0],
    applyUrl: str(j.applyUrl) || str(j.link).split('?')[0],
    desc,
    level: levelOf(title, str(j.seniorityLevel), yrsMin),
    yrs, yrsMin,
    tags: [str(j.industries), str(j.jobFunction)].filter(Boolean),
  }
}

// ---------- Handler ----------

export default async (req: Request) => {
  const token = Netlify.env.get('APIFY_TOKEN')
  if (!token) return notConfigured()

  if (req.method === 'GET') {
    const runs = (new URL(req.url).searchParams.get('runs') ?? '').split(',').filter(Boolean).map((r) => {
      const [id, source] = r.split(':')
      return { id, source: source as Source }
    })
    if (!runs.length || runs.some((r) => !/^\w+$/.test(r.id) || !(r.source in SOURCES))) return json({ error: 'bad_request', message: 'Missing run ids.' }, 400)
    const states = await Promise.all(runs.map((r) => checkRun(r.id, token)))
    const done = states.filter((s) => s.state !== 'running').length
    if (done < runs.length) return json({ status: 'running', done, total: runs.length })

    const seen = new Set<string>()
    const jobs: FoundJob[] = []
    const failed: string[] = []
    states.forEach((st, i) => {
      if (st.state === 'failed') return failed.push(`${runs[i].source}: ${st.message}`)
      if (st.state !== 'done') return
      for (const raw of st.items) {
        const job = SOURCES[runs[i].source].normalize(raw)
        // The same posting often shows up on several sites and searches.
        // Company names differ between sites ("Barracuda" vs "Barracuda Networks"), so compare the first word.
        const key = `${job?.company.toLowerCase().match(/[a-z0-9]+/)?.[0]}|${job?.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        if (!job || seen.has(job.id) || seen.has(key)) continue
        seen.add(job.id); seen.add(key)
        jobs.push(job)
      }
    })
    return json({ jobs, failed })
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: { searches?: Search[]; sources?: string[] } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "searches" and "sources".' }, 400)
  }
  const searches = (body.searches ?? []).filter((s) => str(s.keywords)).slice(0, 4)
  const sources = (body.sources ?? []).filter((s): s is Source => s in SOURCES)
  if (!searches.length) return json({ error: 'bad_request', message: 'Add a job title to your profile so we know what to search for.' }, 400)
  if (!sources.length) return json({ error: 'no_sources', message: 'Turn on LinkedIn or Indeed in Settings → Job sources.' }, 400)

  const started = await Promise.all(sources.flatMap((source) => searches.map(async (s) => {
    const run = await startRun(SOURCES[source].actor(), SOURCES[source].input(s), token)
    return run.fail ? { source, fail: run.fail } : { source, id: run.id! }
  })))
  const runs = started.filter((r) => 'id' in r) as { source: Source; id: string }[]
  if (!runs.length) return (started[0] as { fail: Response }).fail
  return json({ runs }, 202)
}

export const config = { path: '/api/jobs' }
