// Free job sources: public job APIs that allow reuse, read directly with no Apify credit.
//   POST /api/boards { searches, sources, employers: [{ ats, slug, name }], days }
//     → { jobs, failed }   (one synchronous call; every source runs in parallel)
//   GET  /api/boards?detect=<careers page link>
//     → { ats, slug, name, count }   (finds which job-board system an employer uses)
//
// Each source's terms ask for credit and a link back, so every posting keeps the board's own link,
// and the board's name is shown as the source.
//   Remotive   remotive.com/api-documentation   (jobs are delayed 24 h; call at most 4 times a day)
//   Remote OK  remoteok.com/api                 (link back and name Remote OK)
//   Jobicy     jobi.cy/apidocs                  (credit Jobicy; apply buttons go to the original link)
//   Himalayas  himalayas.app/api                (apply with the applicationLink, unchanged)
//   Employers  the public job-board APIs of Greenhouse, Lever, Ashby, Workable and SmartRecruiters,
//              which those systems publish so companies' jobs can be shown elsewhere.

import { json, str } from '../lib/apify.mts'
import { htmlToText, isPublicUrl } from '../lib/fetchdoc.mts'
import { finish, fingerprint, num, provinceOf } from '../lib/jobshape.mts'
import type { Json } from '../lib/apify.mts'
import type { FoundJob } from '../lib/jobshape.mts'

const UA = 'SmartJobFinder/1.0 (personal job search)'
const MAX_EMPLOYERS = 40

interface Search { keywords: string; location: string; remote: boolean; kind: string }
type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters'
export interface Employer { ats: Ats; slug: string; name: string }

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : [])

// ---------- Matching ----------

const SENIORITY = /^(junior|jr|senior|sr|entry|level|intermediate|lead|i|ii|iii)$/
/** "UX/UI Designer" → ['ux', 'ui', 'design']: word stems a matching title must all contain. */
function stems(phrase: string): string[] {
  return phrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !SENIORITY.test(w)).map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w))
}
function titleMatcher(terms: string[]) {
  const sets = terms.map(stems).filter((s) => s.length)
  return (title: string) => {
    const words = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    return sets.some((set) => set.every((st) => words.some((w) => w.startsWith(st))))
  }
}

type Field = 'design' | 'writing' | 'dev' | 'data' | 'marketing' | 'pm'
function fieldsOf(terms: string[]): Field[] {
  const t = terms.join(' ').toLowerCase()
  const f: Field[] = []
  if (/design|illustrat|motion|\bux\b|\bui\b|artist|animat/.test(t)) f.push('design')
  if (/writer|copy|editor|content/.test(t)) f.push('writing')
  if (/developer|engineer|programmer/.test(t)) f.push('dev')
  if (/\bdata\b|analyst/.test(t)) f.push('data')
  if (/marketing|social media/.test(t)) f.push('marketing')
  if (/project|coordinator/.test(t)) f.push('pm')
  return f.length ? f : ['design']
}

const OPEN_TO_CANADA = /canada|worldwide|anywhere|north america|americas|global/i
const CANADA = /canada|\(can\)|\bcan\b|ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward|ottawa|toronto|montr[eé]al|vancouver|calgary|edmonton|winnipeg|halifax|gatineau|kanata|waterloo|mississauga|\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)\b/
const OTHER_COUNTRY = /united states|\busa?\b|united kingdom|\buk\b|europe|emea|apac|latam|india|germany|france|spain|poland|brazil|mexico|australia|philippines|singapore|japan|israel|netherlands|ireland/i
/** An employer posting Chloé could take: in Canada, or remote without a non-Canadian country named. */
function inCanadaOrOpen(location: string, remote: boolean) {
  if (CANADA.test(location)) return true
  return remote && !OTHER_COUNTRY.test(location)
}

// ---------- Remote job boards ----------

const REMOTIVE: Record<Field, string> = { design: 'design', writing: 'writing', dev: 'software-dev', data: 'data', marketing: 'marketing', pm: 'project-management' }
async function remotive(fields: Field[]): Promise<FoundJob[]> {
  const out: FoundJob[] = []
  for (const f of fields) {
    const d = (await getJson(`https://remotive.com/api/remote-jobs?category=${REMOTIVE[f]}`)) as Json
    for (const j of arr(d.jobs)) {
      if (!OPEN_TO_CANADA.test(str(j.candidate_required_location))) continue
      out.push(remoteJob({ id: 'rm-' + String(j.id), title: str(j.title), company: str(j.company_name), source: 'Remotive', typeText: str(j.job_type), posted: str(j.publication_date), url: str(j.url), desc: htmlToText(str(j.description)), tags: arr(j.tags).map(String), where: str(j.candidate_required_location) }))
    }
  }
  return out
}

const REMOTE_OK: Partial<Record<Field, string>> = { design: 'design', writing: 'copywriting', dev: 'dev', data: 'data', marketing: 'marketing' }
async function remoteOk(fields: Field[]): Promise<FoundJob[]> {
  const out: FoundJob[] = []
  for (const f of fields) {
    const tag = REMOTE_OK[f]
    if (!tag) continue
    // The first item is the API's legal notice, not a job.
    for (const j of arr(await getJson(`https://remoteok.com/api?tag=${tag}`)).filter((x) => x.id)) {
      const where = str(j.location)
      if (where && !OPEN_TO_CANADA.test(where) && !CANADA.test(where)) continue
      out.push(remoteJob({ id: 'ro-' + String(j.id), title: str(j.position), company: str(j.company), source: 'Remote OK', typeText: '', posted: str(j.date), url: str(j.url), applyUrl: str(j.apply_url), desc: htmlToText(str(j.description)), tags: arr(j.tags).map(String), where, salMin: num(j.salary_min), salMax: num(j.salary_max) }))
    }
    await wait(500)
  }
  return out
}

const JOBICY: Record<Field, string[]> = { design: ['design-multimedia', 'web-app-design'], writing: ['copywriting'], dev: ['engineering'], data: ['data-science'], marketing: ['marketing'], pm: ['project-management'] }
async function jobicy(fields: Field[]): Promise<FoundJob[]> {
  const out: FoundJob[] = []
  for (const industry of [...new Set(fields.flatMap((f) => JOBICY[f]))]) {
    const d = (await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=canada&industry=${industry}`)) as Json
    for (const j of arr(d.jobs)) {
      const yearly = /year/i.test(str(j.salaryPeriod))
      out.push(remoteJob({ id: 'jc-' + String(j.id), title: htmlToText(str(j.jobTitle)), company: str(j.companyName), source: 'Jobicy', typeText: arr(j.jobType).map(String).join(' '), posted: str(j.pubDate), url: str(j.url), desc: htmlToText(str(j.jobDescription)), tags: arr(j.jobIndustry).map(String), where: str(j.jobGeo), seniority: str(j.jobLevel), salMin: yearly ? num(j.salaryMin) : null, salMax: yearly ? num(j.salaryMax) : null }))
    }
    await wait(500)
  }
  return out
}

async function himalayas(terms: string[]): Promise<FoundJob[]> {
  const out: FoundJob[] = []
  for (const term of terms) {
    const d = (await getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(term)}&country=CA`)) as Json
    for (const j of arr(d.jobs)) {
      const yearly = /year|annual/i.test(str(j.salaryPeriod)) && /cad|usd/i.test(str(j.currency))
      const secs = Number(j.pubDate)
      out.push(remoteJob({ id: 'hm-' + fingerprint(str(j.guid)), title: str(j.title), company: str(j.companyName), source: 'Himalayas', typeText: str(j.employmentType), posted: secs ? new Date(secs * 1000).toISOString() : '', url: str(j.guid) || str(j.applicationLink), applyUrl: str(j.applicationLink), desc: htmlToText(str(j.description)), tags: arr(j.categories).map((c) => String(c).replace(/-/g, ' ')), where: arr(j.locationRestrictions).map(String).join(', '), seniority: arr(j.seniority).map(String).join(' '), salMin: yearly ? num(j.minSalary) : null, salMax: yearly ? num(j.maxSalary) : null }))
    }
    await wait(300)
  }
  return out
}

function remoteJob(b: { id: string; title: string; company: string; source: string; typeText: string; posted: string; url: string; applyUrl?: string; desc: string; tags: string[]; where: string; seniority?: string; salMin?: number | null; salMax?: number | null }): FoundJob {
  const salMin = b.salMin ?? null, salMax = b.salMax ?? null
  return finish({ ...b, city: '', province: '', modeText: 'Remote', salMin, salMax, salUnit: salMin || salMax ? 'year' : null, tags: b.tags.slice(0, 15) })
}

// ---------- Employer job boards ----------

/** Reads an employer's public job board and returns its postings in Canada (or remote for Canada). */
async function employerJobs(e: Employer): Promise<FoundJob[]> {
  const slug = encodeURIComponent(e.slug)
  const make = (b: { id: string; title: string; where: string; remote: boolean; typeText: string; posted: string; url: string; applyUrl?: string; desc: string; tags?: string[] }) => {
    if (!b.title || !inCanadaOrOpen(b.where, b.remote)) return null
    const city = b.remote && !CANADA.test(b.where) ? '' : b.where.split(/[,;(]/)[0].trim()
    return finish({ ...b, id: `em-${e.ats}-${b.id}`, company: e.name, city: /remote/i.test(city) ? '' : city, province: provinceOf(b.where), source: 'Employers', via: atsName[e.ats], salMin: null, salMax: null, salUnit: null, modeText: `${b.remote ? 'Remote' : ''} ${b.where}` })
  }
  let jobs: (FoundJob | null)[] = []
  if (e.ats === 'greenhouse') {
    const d = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)) as Json
    jobs = arr(d.jobs).map((j) => {
      const where = str((j.location as Json)?.name)
      return make({ id: String(j.id), title: str(j.title), where, remote: /remote/i.test(where), typeText: '', posted: str(j.first_published) || str(j.updated_at), url: str(j.absolute_url), desc: htmlToText(htmlToText(str(j.content))), tags: arr(j.departments).map((x) => str(x.name)) })
    })
  } else if (e.ats === 'lever') {
    jobs = arr(await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)).map((j) => {
      const c = (j.categories ?? {}) as Json
      const where = [str(c.location), ...arr(c.allLocations).map(String), str(j.country)].filter(Boolean).join(', ')
      return make({ id: str(j.id), title: str(j.text), where, remote: /remote/i.test(`${str(j.workplaceType)} ${where}`), typeText: str(c.commitment), posted: typeof j.createdAt === 'number' ? new Date(j.createdAt).toISOString() : '', url: str(j.hostedUrl), applyUrl: str(j.applyUrl), desc: str(j.descriptionPlain) + '\n' + str(j.additionalPlain), tags: [str(c.team), str(c.department)].filter(Boolean) })
    })
  } else if (e.ats === 'ashby') {
    const d = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as Json
    jobs = arr(d.jobs).filter((j) => j.isListed !== false).map((j) => {
      const addr = ((j.address as Json)?.postalAddress ?? {}) as Json
      const where = [str(j.location), str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry), ...arr(j.secondaryLocations).map((x) => str(x.location))].filter(Boolean).join(', ')
      return make({ id: str(j.id), title: str(j.title), where, remote: j.isRemote === true || /remote/i.test(str(j.workplaceType)), typeText: str(j.employmentType).replace(/([a-z])([A-Z])/g, '$1 $2'), posted: str(j.publishedAt), url: str(j.jobUrl), applyUrl: str(j.applyUrl), desc: str(j.descriptionPlain), tags: [str(j.department), str(j.team)].filter(Boolean) })
    })
  } else if (e.ats === 'workable') {
    const d = (await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`)) as Json
    jobs = arr(d.jobs).map((j) => {
      const where = [str(j.city), str(j.state), str(j.country)].filter(Boolean).join(', ')
      return make({ id: str(j.shortcode), title: str(j.title), where, remote: j.telecommuting === true, typeText: str(j.employment_type), posted: str(j.published_on) || str(j.created_at), url: str(j.url) || str(j.shortlink), applyUrl: str(j.application_url), desc: '', tags: [str(j.department), str(j.function)].filter(Boolean) })
    })
  } else if (e.ats === 'smartrecruiters') {
    const d = (await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`)) as Json
    jobs = arr(d.content).map((j) => {
      const l = (j.location ?? {}) as Json
      const where = [str(l.city), str(l.region), str(l.country).toLowerCase() === 'ca' ? 'Canada' : str(l.country)].filter(Boolean).join(', ')
      return make({ id: str(j.id), title: str(j.name), where, remote: l.remote === true, typeText: str((j.typeOfEmployment as Json)?.label), posted: str(j.releasedDate), url: `https://jobs.smartrecruiters.com/${slug}/${str(j.id)}`, desc: '', tags: [str((j.function as Json)?.label)].filter(Boolean) })
    })
  }
  return jobs.filter((j): j is FoundJob => !!j)
}

const atsName: Record<Ats, string> = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', smartrecruiters: 'SmartRecruiters' }
const ATS_LINKS: [Ats, RegExp][] = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([\w-]+)/i],
  ['greenhouse', /boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/i],
  ['lever', /jobs\.lever\.co\/([\w.-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([\w.%-]+)/i],
  ['workable', /apply\.workable\.com\/(?!api\b)([\w-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/([\w-]+)/i],
]
const findAts = (text: string): { ats: Ats; slug: string } | null => {
  for (const [ats, re] of ATS_LINKS) {
    const m = text.match(re)
    if (m && !/^(embed|js|v\d|api|jobs)$/i.test(m[1])) return { ats, slug: decodeURIComponent(m[1]) }
  }
  return null
}

/** Works out the job-board system behind a careers link: from the link itself, or from links on the page. */
async function detect(link: string) {
  let found = findAts(link)
  if (!found) {
    const url = /^https?:\/\//i.test(link) ? link : `https://${link}`
    if (!isPublicUrl(url)) return json({ error: 'bad_url', message: 'That doesn’t look like a public web address.' }, 400)
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15_000) }).catch(() => null)
    if (!res?.ok) return json({ error: 'unreachable', message: 'We couldn’t open that page.' }, 502)
    const html = (await res.text()).slice(0, 2_000_000)
    found = findAts(res.url) ?? findAts(html)
    if (!found) return json({ error: 'not_found', message: 'We couldn’t find a supported job board on that page. Look for the link you click to see a job (it often contains greenhouse.io, lever.co, ashbyhq.com, workable.com or smartrecruiters.com) and paste that instead.' }, 404)
  }
  const fallback = found.slug.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  let name = fallback
  if (found.ats === 'greenhouse') name = str(((await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(found.slug)}`).catch(() => ({}))) as Json).name) || name
  const employer: Employer = { ...found, name }
  try {
    const jobs = await employerJobs(employer)
    return json({ ...employer, count: jobs.length })
  } catch {
    return json({ error: 'not_found', message: `${atsName[found.ats]} has no job board called “${found.slug}”.` }, 404)
  }
}

// ---------- Handler ----------

const BOARDS = { Remotive: remotive, 'Remote OK': remoteOk, Jobicy: jobicy } as const

export default async (req: Request) => {
  if (req.method === 'GET') {
    const link = new URL(req.url).searchParams.get('detect')
    return link ? detect(link.trim()) : json({ error: 'bad_request', message: 'Missing ?detect=' }, 400)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: { searches?: Partial<Search>[]; sources?: string[]; employers?: Partial<Employer>[]; days?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "searches" and "sources".' }, 400)
  }
  const days = Math.max(1, Math.min(30, Number(body.days) || 7))
  const sources = new Set(body.sources ?? [])
  // Volunteer and combined searches are for the big sites; the boards are matched on titles and skill roles.
  const terms = [...new Set((body.searches ?? []).filter((s) => !s.kind || s.kind === 'title' || s.kind === 'skill').map((s) => str(s.keywords)).filter(Boolean))].slice(0, 8)
  if (!terms.length) return json({ error: 'bad_request', message: 'Add a job title to your profile so we know what to search for.' }, 400)
  const employers = (body.employers ?? []).filter((e): e is Employer => !!e.ats && e.ats in atsName && !!str(e.slug)).slice(0, MAX_EMPLOYERS).map((e) => ({ ...e, name: str(e.name) || e.slug }))
  const fields = fieldsOf(terms)

  const tasks: { name: string; run: () => Promise<FoundJob[]> }[] = []
  for (const [name, fn] of Object.entries(BOARDS)) if (sources.has(name)) tasks.push({ name, run: () => fn(fields) })
  if (sources.has('Himalayas')) tasks.push({ name: 'Himalayas', run: () => himalayas(terms) })
  if (sources.has('Employers')) for (const e of employers) tasks.push({ name: e.name, run: () => employerJobs(e) })

  const matches = titleMatcher(terms)
  const since = Date.now() - days * 86400e3
  const results = await Promise.allSettled(tasks.map((t) => t.run()))
  const seen = new Set<string>()
  const jobs: FoundJob[] = []
  const failed: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') return failed.push(`${tasks[i].name}: ${r.reason instanceof Error ? r.reason.message : 'failed'}`)
    for (const job of r.value) {
      const t = new Date(job.posted).getTime()
      if (!matches(job.title) || (!isNaN(t) && t < since)) continue
      const key = `${job.company.toLowerCase().match(/[a-z0-9]+/)?.[0]}|${job.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      if (seen.has(job.id) || seen.has(key)) continue
      seen.add(job.id); seen.add(key)
      jobs.push(job)
    }
  })
  return json({ jobs, failed })
}
export const config = { path: '/api/boards' }
