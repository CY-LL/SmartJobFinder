// Job alert emails: reads LinkedIn and Indeed alerts the user has put in one Gmail label.
//   POST /api/mail { script, key, days }          → { jobs, emails, alerts, failed }
//   POST /api/mail { script, key, check: true }   → { label, count, subjects }   (connection check)
//   POST /api/mail { emls: [raw, …] }             → the same as the first, from alert emails saved as .eml files
// Gmail is read through a Google Apps Script the user installs in their own account (see src/gmailScript.ts):
// it has read-only Gmail access, only searches its one label, and answers only to its secret key.
// No mail password is stored anywhere.

import { simpleParser } from 'mailparser'
import { json, str } from '../lib/apify.mts'
import { jobsFromAlert, siteOf } from '../lib/alerts.mts'
import type { FoundJob } from '../lib/jobshape.mts'

const MAX_UPLOADS = 30
// Only the user's own Apps Script web app is ever called.
const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

/** Turns raw emails into postings, newest email first so its copy of a job wins. */
async function parse(raws: (Buffer | string)[]) {
  const jobs: FoundJob[] = []
  const seen = new Set<string>()
  const failed: string[] = []
  const alerts = { LinkedIn: 0, Indeed: 0 }
  const mails = await Promise.all(raws.map((r) => simpleParser(r).catch(() => null)))
  mails.sort((a, b) => (b?.date?.getTime() ?? 0) - (a?.date?.getTime() ?? 0))
  for (const m of mails) {
    if (!m) { failed.push('An email couldn’t be read'); continue }
    const html = typeof m.html === 'string' ? m.html : m.textAsHtml ?? ''
    const site = siteOf(m.from?.text ?? '', html)
    if (!site) continue
    alerts[site]++
    for (const job of jobsFromAlert(site, html, m.date ?? new Date())) {
      if (seen.has(job.id)) continue
      seen.add(job.id)
      jobs.push(job)
    }
  }
  return { jobs, emails: raws.length, alerts, failed }
}

/** Calls the user's Apps Script. Its answer comes back through a Google redirect, which fetch follows. */
async function askScript(url: string, body: object): Promise<{ data?: Record<string, unknown>; fail?: Response }> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow', signal: AbortSignal.timeout(50_000) })
  } catch {
    return { fail: json({ error: 'unreachable', message: 'We couldn’t reach your Gmail script. Try again in a minute.' }, 502) }
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  // A sign-in page instead of JSON means the web app isn't open to "Anyone".
  if (!res.ok || !data) return { fail: json({ error: 'not_shared', message: 'Your Gmail script answered with a Google sign-in page. In Apps Script, deploy it as a web app with “Who has access” set to “Anyone”.' }, 502) }
  if (data.error === 'bad_key') return { fail: json({ error: 'bad_key', message: 'Your Gmail script has a different key. Copy the script from this page again and redeploy it.' }, 403) }
  if (data.error === 'no_label') return { fail: json({ error: 'no_label', message: `There’s no Gmail label called “${str(data.label)}”. Create it in Gmail, or change the label here and copy the script again.` }, 404) }
  if (data.error) return { fail: json({ error: 'script_error', message: `Your Gmail script reported an error (${str(data.error)}).` }, 502) }
  return { data }
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: { script?: string; key?: string; days?: number; check?: boolean; emls?: unknown[] } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "script" and "key", or "emls".' }, 400)
  }

  // Uploaded .eml files need no Gmail connection.
  if (Array.isArray(body.emls)) {
    const raws = body.emls.filter((x): x is string => typeof x === 'string' && x.length < 3_000_000).slice(0, MAX_UPLOADS)
    if (!raws.length) return json({ error: 'bad_request', message: 'No emails to read.' }, 400)
    return json(await parse(raws))
  }

  const script = str(body.script), key = str(body.key)
  if (!SCRIPT_URL.test(script) || !key) return json({ error: 'not_connected', message: 'Connect your Gmail on Settings → Job alert emails first.' }, 400)
  const days = Math.max(1, Math.min(30, Number(body.days) || 7))

  const { data, fail } = await askScript(script, { key, days, check: !!body.check })
  if (fail) return fail
  if (body.check) return json({ label: str(data!.label), count: Number(data!.count) || 0, subjects: (Array.isArray(data!.subjects) ? data!.subjects : []).map(String).slice(0, 10) })
  const raws = (Array.isArray(data!.emails) ? data!.emails : []).filter((x): x is string => typeof x === 'string')
    // Gmail sends each email base64-encoded; Node's base64 decoder also reads the URL-safe alphabet.
    .map((x) => Buffer.from(x, 'base64'))
  return json(await parse(raws))
}
export const config = { path: '/api/mail' }
