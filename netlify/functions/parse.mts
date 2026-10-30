// POST /api/parse — read a resume or portfolio with Claude.
// Body (all optional, at least one source needed):
//   { file: { name, pdf?: base64, text? },   an uploaded resume
//     urls: string[],                         websites, portfolio pages or resume links to fetch
//     context: { name, text } }               already-known data, e.g. a LinkedIn import, to merge with
// → { profile, read: [urls actually read] }
// Requires ANTHROPIC_API_KEY; without it returns 501 so the app falls back to its built-in reader.

import Anthropic from '@anthropic-ai/sdk'
import { claudeConfigured, extractProfile } from '../lib/claude.mts'
import type { Source } from '../lib/claude.mts'
import { fetchSources, isPublicUrl } from '../lib/fetchdoc.mts'
import { json, str } from '../lib/apify.mts'

interface Body {
  file?: { name?: string; pdf?: string; text?: string }
  urls?: string[]
  context?: { name?: string; text?: string }
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!claudeConfigured()) return json({ error: 'not_configured', message: 'Claude reading is not set up on this site yet (ANTHROPIC_API_KEY is missing).' }, 501)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON.' }, 400)
  }

  const sources: Source[] = []
  const read: string[] = []
  if (body.context?.text) sources.push({ kind: 'text', name: str(body.context.name) || 'Known profile', text: body.context.text.slice(0, 30_000) })
  if (body.file?.pdf) sources.push({ kind: 'pdf', name: str(body.file.name) || 'resume.pdf', base64: body.file.pdf })
  else if (body.file?.text) sources.push({ kind: 'text', name: str(body.file.name) || 'resume', text: body.file.text.slice(0, 60_000) })

  const urls = (body.urls ?? []).map((u) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`)).filter(isPublicUrl).slice(0, 4)
  const skipped: string[] = []
  const fetched = await Promise.all(urls.map((u) => fetchSources(u)))
  fetched.forEach((f, i) => {
    if (!f.sources.length) skipped.push(urls[i])
    sources.push(...f.sources)
    read.push(...f.read)
  })

  // The context alone isn't new material: there must be a file or at least one readable page.
  if (sources.length === (body.context?.text ? 1 : 0)) {
    return json({ error: 'nothing_read', message: urls.length ? `We couldn't read ${skipped.join(', ')}. The page may be private or block automated access.` : 'Nothing to read.' }, 422)
  }

  try {
    const profile = await extractProfile(sources)
    return json({ profile, read, skipped })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'claude_auth', message: 'The Anthropic API key on this site is not valid.' }, 502)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'claude_busy', message: 'Claude is busy right now. Try again in a minute.' }, 503)
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message)
      return json({ error: 'claude_failed', message: `Claude couldn't read this (${e.status ?? 'network error'}).` }, 502)
    }
    console.error('Parse error', e)
    return json({ error: 'claude_failed', message: e instanceof Error ? e.message : 'Claude couldn’t read this.' }, 502)
  }
}

export const config = { path: '/api/parse' }
