// Fetches resumes and portfolio pages from the web, following links to a resume or CV.

import type { Source } from './claude.mts'

const MAX_BYTES = 4 * 1024 * 1024
const MAX_TEXT = 60_000

/** Refuse URLs that point at this server's own network (basic SSRF guard). */
export function isPublicUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local') || !h.includes('.')) return false
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.startsWith('[')) return false
  return true
}

/** Turn share links for Google Docs/Drive and Dropbox into direct downloads. */
export function directUrl(raw: string): string {
  const doc = raw.match(/docs\.google\.com\/document\/d\/([\w-]+)/)
  if (doc) return `https://docs.google.com/document/d/${doc[1]}/export?format=txt`
  const drive = raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/)
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`
  if (/^https?:\/\/(www\.)?dropbox\.com\//.test(raw)) {
    const u = new URL(raw)
    u.searchParams.set('dl', '1')
    return u.toString()
  }
  return raw
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s*•\s*$/gm, '')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()
}

/** Links on a page that look like a resume/CV or an about page, resolved to absolute URLs. */
function resumeLinks(html: string, base: string): string[] {
  const out: { url: string; rank: number }[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim()
    const label = htmlToText(m[2]).toLowerCase()
    let url: string
    try {
      url = new URL(href, base).toString()
    } catch {
      continue
    }
    const hay = `${href.toLowerCase()} ${label}`
    const rank = /\b(resume|résumé|cv|curriculum)\b/.test(hay) ? 2 : /\b(about|experience)\b/.test(hay) && new URL(url).host === new URL(base).host ? 1 : 0
    if (rank && isPublicUrl(url) && url !== base) out.push({ url, rank })
  }
  return [...new Map(out.sort((a, b) => b.rank - a.rank).map((x) => [x.url, x])).keys()].slice(0, 2)
}

async function get(url: string): Promise<{ type: string; body: ArrayBuffer; finalUrl: string } | null> {
  try {
    const res = await fetch(directUrl(url), {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SmartJobFinder resume reader)', Accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5' },
    })
    if (!res.ok || !isPublicUrl(res.url || url)) return null
    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return null
    return { type: res.headers.get('content-type') ?? '', body, finalUrl: res.url || url }
  } catch {
    return null
  }
}

const isPdf = (type: string, body: ArrayBuffer) => type.includes('pdf') || new TextDecoder().decode(body.slice(0, 5)) === '%PDF-'

/** Fetch a URL (and up to two resume/about links it points to) as sources for Claude. */
export async function fetchSources(url: string, depth = 1): Promise<{ sources: Source[]; read: string[] }> {
  const page = await get(url)
  if (!page) return { sources: [], read: [] }
  if (isPdf(page.type, page.body)) {
    return { sources: [{ kind: 'pdf', name: page.finalUrl, base64: Buffer.from(page.body).toString('base64') }], read: [page.finalUrl] }
  }
  const raw = new TextDecoder().decode(page.body)
  const isHtml = page.type.includes('html') || /<html|<body|<div/i.test(raw.slice(0, 2000))
  const text = (isHtml ? htmlToText(raw) : raw).slice(0, MAX_TEXT)
  const sources: Source[] = text.length > 40 ? [{ kind: 'text', name: page.finalUrl, text }] : []
  const read = sources.length ? [page.finalUrl] : []
  if (isHtml && depth > 0) {
    const linked = await Promise.all(resumeLinks(raw, page.finalUrl).map((u) => fetchSources(u, 0)))
    for (const l of linked) { sources.push(...l.sources); read.push(...l.read) }
  }
  return { sources, read }
}
