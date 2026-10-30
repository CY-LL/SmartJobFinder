// Reads portfolio sites, online resumes and the links on a LinkedIn profile.
// The server only downloads them (/api/fetch); parsing happens here with the built-in reader.

import { pdfText } from './extract'
import { emptyProfile, parseResume } from './profile'
import type { Profile } from './profile'

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

/** Fill gaps in a profile with what another source found, without overwriting what's already there. */
export function mergeProfiles(base: Profile, extra: Profile): Profile {
  const key = (r: Profile['roles'][number]) => `${r.title}|${r.org}`.toLowerCase().replace(/[^a-z0-9|]/g, '')
  const roles = [...base.roles, ...extra.roles.filter((r) => !base.roles.some((b) => key(b) === key(r)))]
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
    roles: roles.slice(0, 15),
    skills: skills.slice(0, 50),
    years: Math.max(base.years, extra.years),
    level: base.years >= extra.years ? base.level : extra.level,
  }
}
