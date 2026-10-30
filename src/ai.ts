// Client side of /api/parse: reads resumes, websites and LinkedIn links with Claude.

import { emptyProfile, levelFor } from './profile'
import type { Profile } from './profile'

export class ReaderError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

interface ParseRequest {
  file?: { name: string; pdf?: string; text?: string }
  urls?: string[]
  context?: { name: string; text: string }
}

export interface ParseResult {
  profile: Profile
  read: string[]
  skipped: string[]
}

/** PDFs larger than this are sent as extracted text instead (Netlify caps request bodies at ~6 MB). */
export const MAX_PDF_BYTES = 4 * 1024 * 1024

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export async function readWithClaude(req: ParseRequest): Promise<ParseResult> {
  let res: Response
  try {
    res = await fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  } catch {
    throw new ReaderError('Couldn’t reach the resume reader.', 'network')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.profile) throw new ReaderError(data.message ?? `The resume reader failed (${res.status}).`, data.error ?? 'failed')
  const p = data.profile as Profile & { years: number }
  return {
    profile: { ...emptyProfile(), ...p, level: p.level ?? levelFor(p.years ?? 0), readBy: 'claude' },
    read: data.read ?? [],
    skipped: data.skipped ?? [],
  }
}

/** Plain-text version of a profile, given to Claude as known facts to merge with new sources. */
export function profileAsText(p: Profile, extra = ''): string {
  return [
    `Name: ${p.name}`,
    `Headline: ${p.title}`,
    `Location: ${p.city}`,
    p.email && `Email: ${p.email}`,
    p.linkedin && `LinkedIn: ${p.linkedin}`,
    'Experience:',
    ...p.roles.map((r) => `- ${r.title} at ${r.org} (${r.dates})`),
    `Skills: ${p.skills.join(', ')}`,
    extra,
  ].filter(Boolean).join('\n')
}
