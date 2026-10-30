// Job alert emails from LinkedIn and Indeed → postings.
// Both sites send cards of jobs: a link to the job (title), then the company, location and a few
// extra lines. The HTML differs between versions, so instead of relying on its layout, this follows the
// job links: every line from one job's link up to the next job's link belongs to that job.

import { finish, fingerprint, parseLinkedInSalary, provinceOf } from './jobshape.mts'
import type { FoundJob } from './jobshape.mts'

export type AlertSite = 'LinkedIn' | 'Indeed'

const LINKEDIN_JOB = /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#"']*?-)?(\d{6,})/i
const INDEED_JOB = /indeed\.[a-z.]+\/(?:rc\/clk|pagead\/clk|viewjob|m\/viewjob|m\/basecamp\/viewjob|applystart)/i

/** Which site sent an alert: by sender, or for forwarded alerts by the job links inside. */
export function siteOf(from: string, html: string): AlertSite | null {
  if (/linkedin\.com/i.test(from)) return 'LinkedIn'
  if (/indeed\.(com|ca)/i.test(from)) return 'Indeed'
  if (LINKEDIN_JOB.test(html)) return 'LinkedIn'
  if (INDEED_JOB.test(html) || /[?&]jk=[0-9a-f]{12,}/i.test(html)) return 'Indeed'
  return null
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;/g, '·').replace(/&bull;/g, '•').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’')
}

interface Line { text: string; href?: string }
/** The email as lines of text, with each link's address kept on its line. */
function lines(html: string): Line[] {
  const marked = html
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => `\n\u0001${href}\u0002${inner.replace(/<[^>]+>/g, ' ')}\n`)
    .replace(/<(br|p|div|tr|td|th|li|h[1-6]|table|tbody|section)\b[^>]*>|<\/(p|div|tr|td|th|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const out: Line[] = []
  for (const raw of marked.split('\n')) {
    const m = raw.match(/\u0001([^\u0002]*)\u0002(.*)/)
    const text = decode(m ? m[2] : raw).replace(/[\s​-‍﻿͏]+/g, ' ').trim()
    if (m) out.push({ text, href: decode(m[1]) })
    else if (text) out.push({ text })
  }
  return out
}

/** The job a link points to, or null for other links (logos, settings, footer). */
function jobKey(site: AlertSite, href: string): string | null {
  if (site === 'LinkedIn') return href.match(LINKEDIN_JOB)?.[1] ?? null
  const jk = href.match(/[?&](?:jk|vjk)=([0-9a-f]{8,})/i)?.[1]
  if (jk) return jk
  return INDEED_JOB.test(href) ? 'x' + fingerprint(href) : null
}

// Lines in a job card that say nothing about the job itself.
const NOISE = /^(easy ?apply|easily apply|apply( now)?|view (job|details)|see (all|more)( jobs)?.*|actively (recruiting|hiring)|promoted|new|be an early applicant|responsive employer|urgently hiring|hiring multiple candidates|top applicant|save|job alert|fast growing|.*\b(connections?|alumni|applicants?|reviews?)\b.*|\d(\.\d)?\s*(★|stars?|out of 5)?|[★☆\s]+|·|•|-)$/i
const POSTED = /^(just posted|today|posted today|\d+\+? (minutes?|hours?|days?) ago|(posted )?\d+\+? (minutes?|hours?|days?) ago|posted \d+\+? days? ago)$/i
const SALARY = /\$\s?\d/

function postedFrom(text: string | undefined, sent: Date): string {
  if (!text) return sent.toISOString()
  const n = Number(text.match(/(\d+)/)?.[1] ?? 0)
  const ms = /minute/i.test(text) ? n * 60e3 : /hour/i.test(text) ? n * 3600e3 : /day/i.test(text) ? n * 86400e3 : 0
  return new Date(sent.getTime() - ms).toISOString()
}

/** Every job in one alert email. `sent` is the email's date, used for "2 days ago" and as the posting date. */
export function jobsFromAlert(site: AlertSite, html: string, sent: Date): FoundJob[] {
  const blocks: { key: string; href: string; title: string; lines: string[] }[] = []
  const byKey = new Map<string, (typeof blocks)[number]>()
  let cur: (typeof blocks)[number] | null = null
  for (const l of lines(html)) {
    const key = l.href ? jobKey(site, l.href) : null
    if (key) {
      cur = byKey.get(key) ?? null
      if (!cur) {
        cur = { key, href: l.href!, title: '', lines: [] }
        byKey.set(key, cur)
        blocks.push(cur)
      }
      // The first link with words in it is the title; later ones (company, "Apply") are card lines.
      if (l.text && !NOISE.test(l.text)) {
        if (!cur.title) cur.title = l.text
        else if (l.text !== cur.title) cur.lines.push(l.text)
      }
      continue
    }
    // Any other link (settings, "see all jobs") ends the card.
    if (l.href) { cur = null; continue }
    if (cur && cur.lines.length < 10) cur.lines.push(l.text)
  }

  const out: FoundJob[] = []
  for (const b of blocks) {
    let rest = b.lines.filter((x) => !NOISE.test(x) && x !== b.title)
    const title = b.title || rest.shift() || ''
    if (!title || title.length > 120) continue
    const posted = rest.find((x) => POSTED.test(x))
    const salary = rest.find((x) => SALARY.test(x) && x.length < 80)
    rest = rest.filter((x) => x !== posted && x !== salary)
    let company = '', where = ''
    // LinkedIn: "KOHO · Ottawa, ON (Remote)"; Indeed: company and location on their own lines.
    const dotted = rest.findIndex((x) => / · /.test(x))
    if (site === 'LinkedIn' && dotted >= 0) {
      ;[company, where] = rest[dotted].split(/ · /, 2)
      rest.splice(dotted, 1)
    } else {
      company = rest.shift() ?? ''
      where = rest.shift() ?? ''
    }
    const pay = salary ? parseLinkedInSalary(salary) : { salMin: null, salMax: null, salUnit: null }
    const linkedIn = site === 'LinkedIn'
    const url = linkedIn ? `https://www.linkedin.com/jobs/view/${b.key}/` : /^x/.test(b.key) ? b.href : `https://ca.indeed.com/viewjob?jk=${b.key}`
    const city = where.replace(/\((remote|hybrid|on-?site)\)/i, '').replace(/^(remote|hybrid( work)?)( in)?\s*/i, '').split(',')[0].trim()
    out.push(finish({
      // Same ids as the Apify LinkedIn and Indeed searches, so a job found both ways shows once.
      id: (linkedIn ? 'li-' : 'in-') + b.key,
      title,
      company,
      city,
      province: provinceOf(where),
      source: 'Email alerts',
      via: site,
      typeText: [title, ...rest].join(' '),
      ...pay,
      posted: postedFrom(posted, sent),
      url,
      desc: rest.join('\n'),
      modeText: where,
    }))
  }
  return out
}
