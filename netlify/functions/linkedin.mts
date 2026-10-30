// POST /api/linkedin { url } → profile fields scraped from a public LinkedIn profile via Apify.
// Requires APIFY_TOKEN in the Netlify environment. APIFY_LINKEDIN_ACTOR overrides the scraper used.

const DEFAULT_ACTOR = 'dev_fusion~Linkedin-Profile-Scraper'
const PROFILE_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?(\?.*)?$/i

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const json = (body: unknown, status = 200) => Response.json(body, { status })

function year(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object') return year((v as Json).year)
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

  const name = str(raw.fullName) || [str(raw.firstName), str(raw.lastName)].filter(Boolean).join(' ')
  const city = str(raw.addressWithoutCountry ?? raw.addressWithCountry ?? raw.location ?? raw.geoLocationName)
  return {
    name,
    title: str(raw.headline ?? raw.jobTitle ?? raw.occupation).split(' | ')[0].slice(0, 80),
    city,
    email: str(raw.email),
    phone: str(raw.mobileNumber ?? raw.phone),
    linkedin: str(raw.linkedinUrl ?? raw.url ?? raw.profileUrl),
    roles: roles.slice(0, 12),
    skills: [...new Set(skills)].slice(0, 40),
    years,
    level: years >= 7 ? 'Expert' : years >= 3 ? 'Intermediate' : 'Junior',
  }
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const token = Netlify.env.get('APIFY_TOKEN')
  if (!token) return json({ error: 'not_configured', message: 'LinkedIn lookup is not set up on this site yet.' }, 501)

  let url = ''
  try {
    url = str(((await req.json()) as Json).url)
  } catch {
    return json({ error: 'bad_request', message: 'Send a JSON body with a "url".' }, 400)
  }
  if (!url.startsWith('http')) url = 'https://' + url
  if (!PROFILE_URL.test(url)) return json({ error: 'bad_url', message: 'Use a profile link like linkedin.com/in/your-name.' }, 400)

  const actor = Netlify.env.get('APIFY_LINKEDIN_ACTOR') || DEFAULT_ACTOR
  const res = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=90`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ profileUrls: [url.split('?')[0]] }),
  })
  if (!res.ok) return json({ error: 'lookup_failed', message: `The LinkedIn lookup service returned ${res.status}.` }, 502)
  const items = (await res.json()) as Json[]
  const profile = Array.isArray(items) && items[0] ? normalize(items[0]) : null
  if (!profile || !profile.name) return json({ error: 'not_found', message: "We couldn't read that profile. It may be private." }, 404)
  return json({ profile })
}

export const config = { path: '/api/linkedin' }
