import { useEffect, useState } from 'react'
import type { Job } from '../data'
import { merge } from '../search'
import { SectionHead, Toggle, useApp } from '../ui'

interface Check { configured: boolean; account?: string; host?: string; folders?: string[]; error?: string }
interface Result { jobs: Job[]; emails: number; alerts: { LinkedIn: number; Indeed: number }; failed: string[] }

/** Job alert emails: the mail folder LinkedIn and Indeed alerts are put in, read on every search. */
export function Alerts() {
  const { s, set, go, toast } = useApp()
  const [check, setCheck] = useState<Check | null>(null)
  const [folder, setFolder] = useState(s.mailFolder || 'joboffers')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const on = s.conn['Email alerts'] !== false

  useEffect(() => {
    fetch('/api/mail').then((r) => r.json()).then(setCheck).catch(() => setCheck({ configured: false, error: 'We couldn’t check your mail settings.' }))
  }, [])

  const ready = !!check?.configured && !check.error
  const other = result ? result.emails - result.alerts.LinkedIn - result.alerts.Indeed : 0
  const folderMissing = ready && !!check.folders && !check.folders.includes(folder)

  /** Adds jobs read from emails to the found jobs, without running a full search. */
  const keep = (r: Result) => {
    setResult(r)
    if (r.jobs.length) set((prev) => ({ jobs: merge(r.jobs, prev.jobs) }))
    toast(r.jobs.length ? `${r.jobs.length} jobs added from ${r.emails} emails` : 'No jobs found in those emails')
  }

  const read = async (body: object) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.jobs) throw new Error(data.message ?? 'We couldn’t read those emails.')
      keep(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t read those emails.')
    } finally {
      setBusy(false)
    }
  }

  const saveFolder = (v: string) => {
    setFolder(v)
    set({ mailFolder: v.trim() })
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const emls = await Promise.all([...files].slice(0, 30).map((f) => f.text()))
    await read({ emls })
  }

  return (
    <div className="screen tight" style={{ gap: 20 }}>
      <div>
        <button className="link" style={{ fontSize: 13 }} onClick={() => go('settings')}>‹ Settings</button>
        <div className="h-page" style={{ padding: '6px 4px 0' }}>Job alert emails</div>
        <div className="small muted" style={{ padding: '6px 4px 0', lineHeight: 1.5 }}>Put LinkedIn and Indeed job alert emails in one mail folder, and every search reads the jobs in them. It's free, and it covers jobs only those sites show.</div>
      </div>

      <div className="list">
        <div className="li" style={{ padding: '11px 0' }}>
          <div><div>Read alert emails on every search</div><div className="xs" style={{ color: on && ready ? 'var(--green)' : 'var(--faint)' }}>{!on ? 'Off' : ready ? `Folder “${s.mailFolder || 'joboffers'}” in ${check.account}` : 'Waiting for setup below'}</div></div>
          <Toggle label="Read alert emails on every search" on={on} onChange={(v) => set({ conn: { ...s.conn, 'Email alerts': v } })} />
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Mailbox" hint={check === null ? 'Checking…' : ready ? 'Connected' : check.configured ? 'Can’t connect' : 'Not set up'} />
        <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {check === null && <div className="small muted">Checking the mail connection…</div>}
          {check?.error && <div className="small" style={{ color: 'var(--acc-fg)', lineHeight: 1.45 }}>{check.error}</div>}
          {ready && <div className="small" style={{ lineHeight: 1.45 }}>Reading <b>{check.account}</b> on {check.host}, read-only. Nothing is marked read, moved, deleted or sent.</div>}
          {check && !check.configured && <Setup />}
          {check?.configured && (
            <>
              <label className="small" htmlFor="mail-folder">Folder (or Gmail label) with the alerts</label>
              <input id="mail-folder" className="text-input" list="mail-folders" value={folder} onChange={(e) => saveFolder(e.target.value)} placeholder="joboffers" />
              <datalist id="mail-folders">{check.folders?.map((f) => <option key={f} value={f} />)}</datalist>
              {folderMissing && <div className="xs" style={{ color: 'var(--acc-fg)', lineHeight: 1.45 }}>There’s no folder called “{folder}” yet. Create it (in Gmail, a label), or pick one from the list.</div>}
              <button className="btn sm" disabled={busy || !ready || !folder.trim()} onClick={() => void read({ folder: folder.trim(), days: s.postedWithin ?? 7 })}>{busy ? 'Reading…' : `Read the last ${s.postedWithin ?? 7} days now`}</button>
            </>
          )}
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Or add emails as files" hint="No mailbox needed" />
        <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="xs muted" style={{ lineHeight: 1.45 }}>Save alert emails as .eml files (in Gmail: ⋮ → Download message; in Outlook: drag the email to a folder) and add them here, up to 30 at a time.</div>
          <label className="btn soft" style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Reading…' : 'Choose .eml files'}
            <input type="file" accept=".eml,message/rfc822" multiple hidden disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </div>

      {error && <div className="small" style={{ color: 'var(--acc-fg)', lineHeight: 1.45, padding: '0 4px' }}>{error}</div>}
      {result && (
        <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{result.jobs.length} {result.jobs.length === 1 ? 'job' : 'jobs'} from {result.emails} {result.emails === 1 ? 'email' : 'emails'}</div>
          <div className="xs muted">{result.alerts.LinkedIn} LinkedIn {result.alerts.LinkedIn === 1 ? 'alert' : 'alerts'} · {result.alerts.Indeed} Indeed {result.alerts.Indeed === 1 ? 'alert' : 'alerts'}{other > 0 ? ` · ${other} other ${other === 1 ? 'email' : 'emails'} skipped` : ''}</div>
          {result.jobs.slice(0, 8).map((j) => <div key={j.id} className="small ellip">{j.title} · <span className="muted">{j.company}</span></div>)}
          {result.jobs.length > 0 && <button className="btn sm" onClick={() => go('matches')}>See your matches</button>}
        </div>
      )}
    </div>
  )
}

/** How to connect a mailbox: the password goes in Netlify, never in the app. */
function Setup() {
  return (
    <div className="small" style={{ lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>To read a mail folder, the site needs a login for it. For Gmail:</div>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Create a label called <b>joboffers</b>. To skip moving emails by hand, add a filter: <i>From</i> <code>jobalerts-noreply@linkedin.com OR alert@indeed.com</code> → <i>Apply the label</i> joboffers.</li>
        <li>Turn on 2-Step Verification, then create an app password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>.</li>
        <li>In Netlify → Project configuration → Environment variables, add <code>MAIL_USER</code> (the Gmail address) and <code>MAIL_PASSWORD</code> (the app password), then redeploy.</li>
      </ol>
      <div className="xs muted">Other providers: also set <code>MAIL_HOST</code> (e.g. imap.mail.yahoo.com, imap.mail.me.com) and, if needed, <code>MAIL_PORT</code>. Outlook.com and Hotmail no longer allow app passwords, so use the .eml files below or forward alerts to Gmail.</div>
    </div>
  )
}
