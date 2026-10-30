// Reads portfolio sites, online resumes and the links on a LinkedIn profile.
// The server only downloads them (/api/fetch); parsing happens here with the built-in reader.

import { pdfText } from './extract'
import { emptyProfile, parseResume } from './profile'
import type { Education, Profile } from './profile'

export interface WebRead {
  profile: Profile
  read: string[]
  skipped: string[]
}

type Source = { kind: 'pdf'; name: string; base64: string } | { kind: 'text'; name: string; text: string }

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export async function readWebsites(urls: string[]): Promise<WebRead> {
  let res: Response
  try {
    res = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) })
  } catch {
    throw new Error('Couldn’t reach the website reader.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.sources) throw new Error(data.message ?? `Couldn’t read that website (${res.status}).`)

  // Read each page and file on its own, then combine. The page the user gave comes first: its title
  // is usually their name and headline; a linked resume PDF then adds roles and skills.
  const profiles = await Promise.all((data.sources as Source[]).map(async (s) => parseResume(s.kind === 'pdf' ? await pdfText(base64ToBuffer(s.base64)).catch(() => '') : s.text)))
  const merged = profiles.reduce((acc, p) => mergeProfiles(acc, p), emptyProfile())
  const notSkills = new Set([merged.name, ...merged.roles.map((r) => r.org)].map((x) => x.toLowerCase()))
  const profile = { ...merged, skills: merged.skills.filter((k) => !notSkills.has(k.toLowerCase())) }
  return { profile, read: data.read ?? [], skipped: data.skipped ?? [] }
}

const GENERIC_ORG_WORDS = new Set(['agence', 'agency', 'company', 'group', 'studio', 'studios', 'limited', 'canada', 'services', 'solutions', 'the'])

/** Add bullets that say something new; skip ones that mostly repeat an existing bullet's words. */
function mergeBullets(base: string[], extra: string[]): string[] {
  const bag = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 3))
  const out = [...base]
  for (const b of extra) {
    const w = bag(b)
    const repeats = out.some((o) => {
      const ow = bag(o)
      const shared = [...w].filter((x) => ow.has(x)).length
      return shared / Math.min(w.size, ow.size || 1) > 0.6
    })
    if (!repeats) out.push(b)
  }
  return out.slice(0, 8)
}

/** Combine education lists: the same program (same school, same start year) keeps one entry with both sets of points. */
function mergeEducation(base: Education[], extra: Education[]): Education[] | undefined {
  const schoolWords = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !['college', 'university', 'school', 'institute'].includes(w))
  const out: Education[] = base.map((e) => ({ ...e, highlights: [...(e.highlights ?? [])] }))
  for (const e of extra) {
    const match = out.find((b) => b.dates.slice(0, 4) === e.dates.slice(0, 4) && b.dates && schoolWords(b.school).some((w) => schoolWords(e.school).includes(w)))
    if (!match) out.push({ ...e })
    else {
      match.highlights = mergeBullets(match.highlights ?? [], e.highlights ?? [])
      match.school ||= e.school
      match.credential ||= e.credential
    }
  }
  // Most recent first by end year ("2023–26" ends in 2026); ongoing courses after finished programs, undated last.
  const endYear = (d: string) => {
    if (/ongoing|now/i.test(d)) return 1
    const m = d.match(/(\d{4})(?:–(\d{2,4}))?/)
    if (!m) return 0
    return m[2] ? Number(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]) : Number(m[1])
  }
  const all = out.map((e) => (e.highlights?.length ? e : { ...e, highlights: undefined })).sort((a, b) => endYear(b.dates) - endYear(a.dates))
  return all.length ? all : undefined
}

/** Fill gaps in a profile with what another source found, without overwriting what's already there. */
export function mergeProfiles(base: Profile, extra: Profile): Profile {
  // The same job is often worded differently on each source ("Christelle agency" vs "Agence Christelle"),
  // so treat roles as one when they start the same year at an employer sharing a distinctive word.
  const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_ORG_WORDS.has(w))
  const sameRole = (a: Profile['roles'][number], b: Profile['roles'][number]) =>
    a.dates.slice(0, 4) === b.dates.slice(0, 4) && (words(a.org).some((w) => words(b.org).includes(w)) || (!a.org && !b.org && a.title.toLowerCase() === b.title.toLowerCase()))
  // A matching role keeps the base's title and employer but gains the other source's bullets.
  // When several base roles match (LinkedIn lists one internship as two jobs), use the one whose title fits best.
  const titleFit = (a: Profile['roles'][number], b: Profile['roles'][number]) => words(a.title).filter((w) => words(b.title).includes(w)).length
  const roles: Profile['roles'] = base.roles.map((r) => ({ ...r, highlights: [...(r.highlights ?? [])] }))
  for (const r of extra.roles) {
    const match = roles.filter((b) => sameRole(b, r)).sort((x, y) => titleFit(y, r) - titleFit(x, r))[0]
    if (!match) roles.push({ ...r })
    else match.highlights = mergeBullets(match.highlights ?? [], r.highlights ?? [])
  }
  roles.sort((a, b) => (b.dates.slice(0, 4) || '0').localeCompare(a.dates.slice(0, 4) || '0'))
  const skills = [...base.skills, ...extra.skills.filter((k) => !base.skills.some((b) => b.toLowerCase() === k.toLowerCase()))]
  return {
    ...base,
    name: base.name || extra.name,
    title: base.title || extra.title,
    city: base.city || extra.city,
    email: base.email || extra.email,
    phone: base.phone || extra.phone,
    linkedin: base.linkedin || extra.linkedin,
    website: base.website || extra.website,
    summary: base.summary || extra.summary,
    education: mergeEducation(base.education ?? [], extra.education ?? []),
    roles: roles.slice(0, 15).map((r) => (r.highlights?.length ? r : { ...r, highlights: undefined })),
    skills: skills.slice(0, 50),
    years: Math.max(base.years, extra.years),
    level: base.years >= extra.years ? base.level : extra.level,
  }
}
