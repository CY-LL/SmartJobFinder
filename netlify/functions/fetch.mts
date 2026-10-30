// POST /api/fetch { urls: string[] } — downloads portfolio pages, online resumes and the resume/CV
// files they link to, so the browser can read them (browsers can't fetch other sites directly).
// → { sources: [{ kind: 'pdf', name, base64 } | { kind: 'text', name, text }], read, skipped }

import { fetchSources, isPublicUrl } from '../lib/fetchdoc.mts'
import type { Source } from '../lib/fetchdoc.mts'
import { json } from '../lib/apify.mts'

// Netlify caps a function response at 6 MB; leave room for JSON overhead.
const MAX_RESPONSE = 5 * 1024 * 1024

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let urls: string[] = []
  try {
    urls = ((await req.json()) as { urls?: string[] }).urls ?? []
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "urls".' }, 400)
  }
  urls = urls.map((u) => u.trim()).filter(Boolean).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)).filter(isPublicUrl).slice(0, 4)
  if (!urls.length) return json({ error: 'bad_url', message: 'Paste a full website link, e.g. yourname.com.' }, 400)

  const fetched = await Promise.all(urls.map((u) => fetchSources(u)))
  const sources: Source[] = []
  const read: string[] = []
  const skipped: string[] = []
  let size = 0
  fetched.forEach((f, i) => {
    if (!f.sources.length) skipped.push(urls[i])
    f.sources.forEach((s, k) => {
      const bytes = s.kind === 'pdf' ? s.base64.length : s.text.length
      if (size + bytes > MAX_RESPONSE) return
      size += bytes
      sources.push(s)
      read.push(f.read[k])
    })
  })
  if (!sources.length) return json({ error: 'nothing_read', message: `We couldn't open ${skipped.join(', ')}. The page may be private or block automated access.`, skipped }, 422)
  return json({ sources, read, skipped })
}

export const config = { path: '/api/fetch' }
