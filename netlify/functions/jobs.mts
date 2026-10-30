// Real job search through Apify scrapers.
//   POST /api/jobs { searches: [{ keywords, location, remote }], sources: ['Indeed', 'LinkedIn'] }
//     → { runs: [{ id, source }] }   (starts one scraper run per source and search)
//   GET  /api/jobs?runs=<id>:<source>,…
//     → { status: 'running', done, total } until every run has finished, then { jobs, failed }
// Requires APIFY_TOKEN. APIFY_<SOURCE>_ACTOR variables override the scrapers.

import { checkRun, json, notConfigured, startRun, str } from '../lib/apify.mts'
import { htmlToText } from '../lib/fetchdoc.mts'
import type { Json } from '../lib/apify.mts'

// Each search has a kind, and each site only runs the kinds it handles well:
//   title     the user's job titles ("Graphic Designer")       → every site
//   skill     roles from their skills ("Motion Designer")      → Indeed
//   combined  all titles and roles in one OR query             → LinkedIn (it understands OR)
//   volunteer volunteer versions of their main title           → Indeed, Google Jobs
const SOURCES = {
  Indeed: {
    actor: () => Netlify.env.get('APIFY_INDEED_ACTOR') || 'valig~indeed-jobs-scraper',
    // Indeed treats "Remote" as a location.
    input: (s: Search) => (s.kind === 'combined' ? null : { country: 'ca', title: s.keywords, location: s.remote ? 'Remote' : s.location, limit: 50, datePosted: String(Math.min(14, s.days)) }),
    normalize: (j: Json) => fromIndeed(j),
  },
  LinkedIn: {
    actor: () => Netlify.env.get('APIFY_LINKEDIN_JOBS_ACTOR') || 'curious_coder~linkedin-jobs-scraper',
    input: (s: Search) => (s.kind !== 'combined' ? null : { keywords: s.remote ? `${s.keywords} remote` : s.keywords, location: s.remote ? 'Canada' : s.location, datePosted: s.days <= 1 ? 'past24Hours' : s.days <= 7 ? 'pastWeek' : 'pastMonth', limitPerSource: 50, scrapeCompany: false }),
    normalize: (j: Json) => fromLinkedIn(j),
  },
  Glassdoor: {
    actor: () => Netlify.env.get('APIFY_GLASSDOOR_ACTOR') || 'valig~glassdoor-jobs-scraper',
    // Glassdoor only matches places spelled out in full: "Ottawa, Ontario, Canada", not "Ottawa, ON".
    input: (s: Search) => (s.kind !== 'title' ? null : { keywords: s.keywords, location: s.remote ? 'Canada' : fullPlace(s.location), remoteWorkType: s.remote, daysOld: s.days, limit: 30 }),
    normalize: (j: Json) => fromGlassdoor(j),
  },
  'Job Bank': {
    actor: () => Netlify.env.get('APIFY_JOBBANK_ACTOR') || 'getascraper~jobbank-scraper',
    // Job Bank is searched by city; a Canada-wide "remote" search would mostly return unrelated postings.
    input: (s: Search) => (s.remote || s.kind !== 'title' ? null : { searchKeyword: s.keywords, location: s.location.split(',')[0].trim(), datePosted: s.days <= 2 ? '48_hours' : '30_days', maxItems: 30 }),
    normalize: (j: Json) => fromJobBank(j),
  },
  Workopolis: {
    actor: () => Netlify.env.get('APIFY_WORKOPOLIS_ACTOR') || 'shahidirfan~Workopolis-Job-Scraper',
    input: (s: Search) => (s.kind !== 'title' ? null : { keyword: s.remote ? `${s.keywords} remote` : s.keywords, location: s.remote ? 'Canada' : s.location, posted_date: s.days <= 1 ? '24h' : s.days <= 7 ? '7d' : '30d', results_wanted: 30, max_pages: 2 }),
    normalize: (j: Json) => fromWorkopolis(j),
  },
  // Google's job search also lists postings from company career pages and charity boards. It costs far
  // more per job than the other sources, so it only runs the first local title search and a volunteer search.
  'Google Jobs': {
    actor: () => Netlify.env.get('APIFY_GOOGLE_JOBS_ACTOR') || 'orgupdate~google-jobs-scraper',
    input: (s: Search, first: boolean) => (s.remote || !((s.kind === 'title' && first) || s.kind === 'volunteer') ? null : { countryName: 'canada', locationName: fullPlace(s.location).replace(/, Canada$/, ''), targetLocations: [s.location.split(',')[0].trim()], includeKeyword: s.keywords, pagesToFetch: 1, datePosted: s.days <= 1 ? 'today' : s.days <= 3 ? '3days' : s.days <= 7 ? 'week' : 'month' }),
    normalize: (j: Json) => fromGoogle(j),
  },
} as const
type Source = keyof typeof SOURCES
interface Search { keywords: string; location: string; remote: boolean; kind: 'title' | 'skill' | 'combined' | 'volunteer'; days: number }
interface Task { source: Source; search: number }
export interface FoundJob {
  id: string
  title: string
  company: string
  loc: string
  province: string
  mode: 'On-site' | 'Hybrid' | 'Remote'
  source: Source
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

const PROVINCE_NAMES: Record<string, string> = { ON: 'Ontario', QC: 'Quebec', BC: 'British Columbia', AB: 'Alberta', MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' }
/** "Ottawa, ON" → "Ottawa, Ontario, Canada" */
function fullPlace(place: string): string {
  const [city, prov] = place.split(',').map((x) => x.trim())
  // "Ottawa, Canada" (as LinkedIn writes it) has no province; the city alone works on Glassdoor.
  const province = PROVINCE_NAMES[prov?.toUpperCase()] ?? (prov && !/^canada$/i.test(prov) ? prov : '')
  return province ? `${city}, ${province}, Canada` : city
}

/** Shared tail of every normalizer: work out mode, level, years and the display location. */
function finish(base: { id: string; title: string; company: string; city: string; province: string; source: Source; via?: string; typeText: string; salMin: number | null; salMax: number | null; salUnit: 'year' | 'hour' | null; posted: string; url: string; applyUrl?: string; desc: string; modeText?: string; seniority?: string; tags?: string[] }): FoundJob {
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
function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36) + s.length.toString(36)
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null)
const unitOf = (v: unknown): 'year' | 'hour' | null => (/hour/i.test(str(v)) ? 'hour' : /year|annual|month/i.test(str(v)) ? 'year' : null)

function fromGlassdoor(j: Json): FoundJob | null {
  const title = str(j.title)
  if (!title) return null
  const pay = (j.pay ?? {}) as Json
  const loc = (j.location ?? {}) as Json
  const unit = unitOf(pay.period)
  const mult = /month/i.test(str(pay.period)) ? 12 : 1
  const age = typeof j.ageInDays === 'number' ? j.ageInDays : 0
  return finish({
    id: 'gd-' + String(j.id),
    title,
    company: str((j.employer as Json)?.name),
    city: str(loc.name),
    province: provinceOf(str(loc.name)),
    source: 'Glassdoor',
    typeText: title,
    salMin: num(pay.min) && num(pay.min)! * mult, salMax: num(pay.max) && num(pay.max)! * mult, salUnit: unit,
    posted: new Date(Date.now() - age * 86400e3).toISOString(),
    url: str(j.seoUrl) || str(j.url),
    desc: htmlToText(str(j.description)),
  })
}

function fromJobBank(j: Json): FoundJob | null {
  const title = str(j.original_title) || str(j.title)
  if (!title) return null
  const name = str(j.source_name)
  return finish({
    id: 'jb-' + (str(j.internal_id) || str(j.stable_id)),
    // Job Bank titles are often lower-case occupation names ("graphic designer").
    title: title.charAt(0).toUpperCase() + title.slice(1),
    company: str(j.employer),
    city: str(j.city) || str(j.location).split(',')[0],
    province: str(j.province) || provinceOf(str(j.location)),
    source: 'Job Bank',
    via: name && !/job ?bank/i.test(name) ? name : undefined,
    typeText: str(j.employment_type),
    salMin: num(j.salary_min), salMax: num(j.salary_max), salUnit: unitOf(j.salary_unit),
    posted: str(j.date_posted),
    url: str(j.url),
    applyUrl: str(j.application_url) || str(j.url),
    desc: htmlToText(str(j.description)),
    modeText: str(j.work_type),
    tags: [str(j.noc_title)].filter(Boolean),
  })
}

function fromWorkopolis(j: Json): FoundJob | null {
  const title = str(j.title)
  if (!title) return null
  const location = str(j.location)
  const pay = parseLinkedInSalary(str(j.salary))
  return finish({
    id: 'wo-' + (str(j.jobKey) || fingerprint(str(j.url))),
    title,
    company: str(j.company),
    city: location.split(',')[0].trim(),
    province: provinceOf(location),
    source: 'Workopolis',
    typeText: str(j.employmentType),
    ...pay,
    posted: str(j.datePosted),
    url: str(j.url),
    desc: str(j.description_text) || htmlToText(str(j.description_html)) || str(j.snippet),
    modeText: str(j.workSettings),
    tags: str(j.requirements).split(/,\s*/).filter(Boolean),
  })
}

function fromGoogle(j: Json): FoundJob | null {
  const title = str(j.job_title)
  if (!title) return null
  const location = str(j.location).replace(/\s*\(\+\d+ others?\)/, '')
  const salary = str(j.salary)
  const pay = salary && salary !== 'N/A' ? parseLinkedInSalary(salary) : { salMin: null, salMax: null, salUnit: null }
  const url = str(j.URL)
  return finish({
    // Google's links share long tracking suffixes, so fingerprint the whole link plus the title.
    id: 'gj-' + fingerprint(`${url}|${title}|${str(j.company_name)}`),
    title,
    company: str(j.company_name),
    city: location.split(',')[0].trim(),
    province: provinceOf(location),
    source: 'Google Jobs',
    via: str(j.posted_via) || undefined,
    typeText: title,
    ...pay,
    posted: '',
    url,
    desc: str(j.description),
  })
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
  let body: { searches?: Partial<Search>[]; sources?: string[]; tasks?: Task[]; days?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "searches" and "sources".' }, 400)
  }
  const days = Math.max(1, Math.min(30, Number(body.days) || 7))
  // Older app versions send searches without a kind: treat those as title searches.
  const searches: Search[] = (body.searches ?? []).filter((s) => str(s.keywords)).slice(0, 20)
    .map((s) => ({ keywords: str(s.keywords), location: str(s.location), remote: !!s.remote, kind: s.kind ?? 'title', days }))
  const sources = (body.sources ?? []).filter((s): s is Source => s in SOURCES)
  if (searches.length && !searches.some((s) => s.kind === 'combined')) {
    const titles = [...new Set(searches.filter((s) => s.kind === 'title').map((s) => s.keywords))]
    for (const remote of [false, true]) {
      const at = searches.find((s) => s.remote === remote)
      if (at) searches.push({ ...at, kind: 'combined', keywords: titles.map((x) => `\"${x}\"`).join(' OR ') })
    }
  }
  if (!searches.length) return json({ error: 'bad_request', message: 'Add a job title to your profile so we know what to search for.' }, 400)
  if (!sources.length) return json({ error: 'no_sources', message: 'Turn on at least one source in Settings → Job sources.' }, 400)

  // Every (source, search) pair to run. The browser sends back the ones that didn't fit yet as `tasks`.
  const firstLocal = searches.indexOf(searches.find((s) => !s.remote && s.kind === 'title') ?? searches[0])
  const all: Task[] = sources.flatMap((source) => searches.map((_, i) => ({ source, search: i })))
    .filter((t) => SOURCES[t.source].input(searches[t.search], t.search === firstLocal) !== null)
  const todo = body.tasks?.filter((t) => t.source in SOURCES && searches[t.search]) ?? all

  // Start runs one at a time until the account's concurrency limit is reached; queue the rest.
  const runs: { source: Source; id: string }[] = []
  const failed: string[] = []
  let queued: Task[] = []
  for (let k = 0; k < todo.length; k++) {
    const t = todo[k]
    const run = await startRun(SOURCES[t.source].actor(), SOURCES[t.source].input(searches[t.search], t.search === firstLocal)!, token)
    if (run.id) runs.push({ source: t.source, id: run.id })
    else if (run.busy) { queued = todo.slice(k); break }
    else failed.push(`${t.source}: ${run.errorType ?? 'could not start'}`)
  }
  if (!runs.length && !queued.length) return failed.length ? json({ error: 'lookup_failed', message: `No search could start (${failed.join('; ')}).` }, 502) : json({ error: 'no_searches', message: 'Nothing to search: add a city in your preferences.' }, 400)
  return json({ runs, queued, failed, total: all.length }, 202)
}
export const config = { path: '/api/jobs' }
