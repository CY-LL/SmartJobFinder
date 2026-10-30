// Job alert emails: reads LinkedIn and Indeed alerts the user has put in one mail folder.
//   GET  /api/mail                      → { configured, account, host, folders }   (connection check)
//   POST /api/mail { folder, days }     → { jobs, emails, alerts, failed }   (reads the folder over IMAP)
//   POST /api/mail { emls: [raw, …] }   → the same, from alert emails saved as .eml files
// The folder is opened read-only: nothing is marked read, moved, deleted or sent.
// Needs MAIL_USER and MAIL_PASSWORD (for Gmail, an app password); MAIL_HOST and MAIL_PORT default to Gmail.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { json, str } from '../lib/apify.mts'
import { jobsFromAlert, siteOf } from '../lib/alerts.mts'
import type { FoundJob } from '../lib/jobshape.mts'

const MAX_EMAILS = 60
const MAX_UPLOADS = 30

function account() {
  const user = Netlify.env.get('MAIL_USER')
  const pass = Netlify.env.get('MAIL_PASSWORD')
  if (!user || !pass) return null
  return { user, pass, host: Netlify.env.get('MAIL_HOST') || 'imap.gmail.com', port: Number(Netlify.env.get('MAIL_PORT')) || 993 }
}
const notConfigured = () => json({ error: 'not_configured', message: 'Email alerts aren’t set up on this site yet (MAIL_USER and MAIL_PASSWORD are missing).' }, 501)
/** "chloe.landry@gmail.com" → "ch•••@gmail.com", so the page can say which account without showing it in full. */
const masked = (address: string) => address.replace(/^(.{2})[^@]*/, '$1•••')

function client(a: NonNullable<ReturnType<typeof account>>) {
  return new ImapFlow({ host: a.host, port: a.port, secure: a.port === 993, auth: { user: a.user, pass: a.pass }, logger: false, connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 40_000 })
}

function loginError(e: unknown): string {
  const text = e instanceof Error ? `${e.message} ${(e as { responseText?: string }).responseText ?? ''}` : ''
  if (/auth|credential|password|login|invalid/i.test(text)) return 'The mail server refused the login. Check MAIL_USER and MAIL_PASSWORD (for Gmail, use an app password, not your normal password).'
  if (/timeout|ENOTFOUND|ECONNREFUSED/i.test(text)) return 'We couldn’t reach the mail server. Check MAIL_HOST and MAIL_PORT.'
  return 'We couldn’t read your mail folder.'
}

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

export default async (req: Request) => {
  if (req.method === 'GET') {
    const a = account()
    if (!a) return json({ configured: false })
    const c = client(a)
    try {
      await c.connect()
      const folders = (await c.list()).filter((f) => !f.flags?.has('\\Noselect')).map((f) => f.path)
      return json({ configured: true, account: masked(a.user), host: a.host, folders })
    } catch (e) {
      return json({ configured: true, account: masked(a.user), host: a.host, error: loginError(e) })
    } finally {
      await c.logout().catch(() => {})
    }
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { folder?: string; days?: number; emls?: unknown[] } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request', message: 'Send JSON with "folder" or "emls".' }, 400)
  }

  // Uploaded .eml files need no mail account.
  if (Array.isArray(body.emls)) {
    const raws = body.emls.filter((x): x is string => typeof x === 'string' && x.length < 3_000_000).slice(0, MAX_UPLOADS)
    if (!raws.length) return json({ error: 'bad_request', message: 'No emails to read.' }, 400)
    return json(await parse(raws))
  }

  const a = account()
  if (!a) return notConfigured()
  const folder = str(body.folder)
  if (!folder || folder.length > 200) return json({ error: 'bad_request', message: 'Choose the mail folder your job alerts go to.' }, 400)
  const days = Math.max(1, Math.min(30, Number(body.days) || 7))

  const c = client(a)
  try {
    await c.connect()
  } catch (e) {
    return json({ error: 'login_failed', message: loginError(e) }, 502)
  }
  try {
    let lock
    try {
      lock = await c.getMailboxLock(folder, { readOnly: true })
    } catch {
      return json({ error: 'no_folder', message: `There’s no folder called “${folder}” in ${masked(a.user)}.` }, 404)
    }
    try {
      const since = new Date(Date.now() - days * 86400e3)
      const found = (await c.search({ since }, { uid: true })) || []
      const uids = found.slice(-MAX_EMAILS)
      if (!uids.length) return json({ jobs: [], emails: 0, alerts: { LinkedIn: 0, Indeed: 0 }, failed: [] })
      const messages = await c.fetchAll(uids, { source: true }, { uid: true })
      return json(await parse(messages.map((m) => m.source).filter((s): s is Buffer => !!s)))
    } finally {
      lock.release()
    }
  } catch (e) {
    return json({ error: 'read_failed', message: loginError(e) }, 502)
  } finally {
    await c.logout().catch(() => {})
  }
}
export const config = { path: '/api/mail' }
