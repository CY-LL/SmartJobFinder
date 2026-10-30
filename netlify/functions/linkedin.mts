// POST /api/linkedin { url } → profile fields scraped from a public LinkedIn profile via Apify.
// Requires APIFY_TOKEN in the Netlify environment. APIFY_LINKEDIN_ACTOR overrides the scraper used.

// harvestapi's scraper needs no cookies and, unlike some others, doesn't ask for full Apify account access.
const DEFAULT_ACTOR = 'harvestapi~linkedin-profile-scraper'
import { apify, json, str } from '../lib/apify.mts'
import type { Json } from '../lib/apify.mts'

const PROFILE_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?(\?.*)?$/i


function year(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object') return (v as Json).year ? year((v as Json).year) : year((v as Json).text)
  return str(v).match(/(19|20)\d{2}/)?.[0] ?? (/present/i.test(str(v)) ? 'NOW' : '')
}

function dates(e: Json): string {
  const from = year(e.jobStartedOn ?? e.startDate ?? e.starts_at ?? e.start)
  const to = e.jobStillWorking === true ? 'NOW' : year(e.jobEndedOn ?? e.endDate ?? e.ends_at ?? e.end) || (from ? 'NOW' : '')
  if (!from) return str(e.caption ?? e.duration)
  return to && to !== from ? `${from}–${to}` : from
}

function monthsOf(e: Json): [number, number] | null {
  const parse = (v: unknown, end: boolean): number | null => {
    if (v && typeof v === 'object') {
      const o = v as Json
      if (typeof o.year === 'number') return o.year * 12 + (typeof o.month === 'number' ? o.month - 1 : end ? 11 : 0)
      return parse(o.text, end)
    }
    const s = str(v)
    if (!s && end) return new Date().getFullYear() * 12 + new Date().getMonth()
    const y = s.match(/(19|20)\d{2}/)
    if (!y) return /present/i.test(s) ? new Date().getFullYear() * 12 + new Date().getMonth() : null
    const m = s.match(/(\d{1,2})[-/]/) ?? null
    return Number(y[0]) * 12 + (m ? Number(m[1]) - 1 : end ? 11 : 0)
  }
  const a = parse(e.jobStartedOn ?? e.startDate ?? e.starts_at, false)
  const b = e.jobStillWorking === true ? parse('', true) : parse(e.jobEndedOn ?? e.endDate ?? e.ends_at, true)
  return a !== null && b !== null && b >= a ? [a, b] : null
}

function normalize(raw: Json) {
  const exps = (raw.experiences ?? raw.experience ?? raw.positions ?? []) as Json[]
  const roles = exps.map((e) => ({
    title: str(e.title ?? e.position),
    org: str(e.companyName ?? e.company ?? e.subtitle).split(' · ')[0],
    dates: dates(e),
  })).filter((r) => r.title)

  const spans = exps.map(monthsOf).filter((x): x is [number, number] => !!x).sort((a, b) => a[0] - b[0])
  let months = 0, s = -1, e = -1
  for (const [a, b] of spans) {
    if (a > e) { if (e >= 0) months += e - s + 1; s = a; e = b } else e = Math.max(e, b)
  }
  if (e >= 0) months += e - s + 1
  const years = Math.round((months / 12) * 10) / 10

  const skills = ((raw.skills ?? []) as unknown[])
    .map((k) => (typeof k === 'string' ? k : str((k as Json)?.title ?? (k as Json)?.name)))
    .filter(Boolean)
  if (!skills.length) skills.push(...str(raw.topSkills).split(/\s*[•,|]\s*/).filter(Boolean))

  const name = str(raw.fullName) || [str(raw.firstName), str(raw.lastName)].filter(Boolean).join(' ')
  const loc = (raw.location ?? {}) as Json
  const city = str(raw.addressWithoutCountry ?? raw.addressWithCountry ?? raw.geoLocationName) || str(raw.location) || str((loc.parsed as Json)?.text) || str(loc.linkedinText)
  return {
    name,
    title: str(raw.headline ?? raw.jobTitle ?? raw.occupation).split(' | ')[0].slice(0, 80),
    city,
    email: str(raw.email) || str((raw.emails as Json[] | undefined)?.map((x) => (typeof x === 'string' ? x : (x as Json)?.email))[0]),
    phone: str(raw.mobileNumber ?? raw.phone),
    linkedin: str(raw.linkedinUrl ?? raw.url ?? raw.profileUrl),
    roles: roles.slice(0, 12),
    skills: [...new Set(skills)].slice(0, 40),
    years,
    level: years >= 7 ? 'Expert' : years >= 3 ? 'Intermediate' : 'Junior',
  }
}

// A lookup takes longer than a Netlify function may run, so POST starts an Apify run
// and the browser polls GET ?run=<id> until the profile is ready.
export default async (req: Request) => {
  const token = Netlify.env.get('APIFY_TOKEN')
  if (!token) return json({ error: 'not_configured', message: 'LinkedIn lookup is not set up on this site yet.' }, 501)
  const actor = Netlify.env.get('APIFY_LINKEDIN_ACTOR') || DEFAULT_ACTOR

  if (req.method === 'GET') {
    const runId = new URL(req.url).searchParams.get('run') ?? ''
    if (!/^\w+$/.test(runId)) return json({ error: 'bad_request', message: 'Missing run id.' }, 400)
    const run = await apify(`actor-runs/${runId}`, token)
    if (run.fail) return run.fail
    const { status, defaultDatasetId } = (run.data as { data: { status: string; defaultDatasetId: string } }).data
    if (status === 'READY' || status === 'RUNNING') return json({ status: 'running' })
    if (status !== 'SUCCEEDED') return json({ error: 'lookup_failed', message: `The LinkedIn lookup ${status.toLowerCase().replace('-', ' ')}.` }, 502)
    const items = await apify(`datasets/${defaultDatasetId}/items?clean=true&limit=1`, token)
    if (items.fail) return items.fail
    const first = Array.isArray(items.data) ? (items.data[0] as Json | undefined) : undefined
    const profile = first && !first.error ? normalize(first) : null
    if (!profile || !profile.name) return json({ error: 'not_found', message: "We couldn't read that profile. Check the link, or it may be private." }, 404)
    return json({ profile })
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let url = ''
  try {
    url = str(((await req.json()) as Json).url)
  } catch {
    return json({ error: 'bad_request', message: 'Send a JSON body with a "url".' }, 400)
  }
  if (!url.startsWith('http')) url = 'https://' + url
  if (!PROFILE_URL.test(url)) return json({ error: 'bad_url', message: 'Use a profile link like linkedin.com/in/your-name.' }, 400)

  const clean = url.split('?')[0]
  // urls: harvestapi; profileUrls: dev_fusion and similar scrapers.
  const run = await apify(`acts/${encodeURIComponent(actor)}/runs?timeout=180`, token, { method: 'POST', body: JSON.stringify({ urls: [clean], profileUrls: [clean] }) })
  if (run.fail) return run.fail
  return json({ runId: (run.data as { data: { id: string } }).data.id }, 202)
}

export const config = { path: '/api/linkedin' }