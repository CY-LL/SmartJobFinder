import { useEffect, useState } from 'react'
import type { Job } from '../data'
import { SCRIPT_MANIFEST, SCRIPT_URL_RE, newScriptKey, scriptCode } from '../gmailScript'
import { merge } from '../search'
import { SectionHead, Toggle, useApp } from '../ui'

interface Result { jobs: Job[]; emails: number; alerts: { LinkedIn: number; Indeed: number }; failed: string[] }

const post = async (body: object) => {
  const res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message ?? 'We couldn’t read your job alert emails.')
  return data
}

/** Job alert emails: a Gmail label of LinkedIn and Indeed alerts, read through a script in the user's own Gmail. */
export function Alerts() {
  const { s, set, go, toast } = useApp()
  const label = s.mailFolder || 'joboffers'
  const [url, setUrl] = useState(s.mailScript)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const on = s.conn['Email alerts'] !== false
  const connected = !!s.mailScript

  // The key is made once and written into the script she copies; a new one means copying the script again.
  useEffect(() => {
    if (!s.mailKey) set({ mailKey: newScriptKey() })
  }, [s.mailKey, set])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const connect = () => run(async () => {
    const v = url.trim()
    if (!SCRIPT_URL_RE.test(v)) throw new Error('Paste the web app URL from Apps Script. It starts with https://script.google.com/macros/s/ and ends with /exec.')
    const data = await post({ script: v, key: s.mailKey, check: true, days: s.postedWithin ?? 7 })
    set({ mailScript: v })
    setStatus({ ok: true, text: `Connected · ${data.count} ${data.count === 1 ? 'email' : 'emails'} in “${data.label}” from the last ${s.postedWithin ?? 7} days` })
    toast('Gmail connected')
  })

  const readNow = () => run(async () => keep(await post({ script: s.mailScript, key: s.mailKey, days: s.postedWithin ?? 7 })))

  /** Adds jobs read from emails to the found jobs, without running a full search. */
  const keep = (r: Result) => {
    setResult(r)
    if (r.jobs.length) set((prev) => ({ jobs: merge(r.jobs, prev.jobs) }))
    toast(r.jobs.length ? `${r.jobs.length} jobs added from ${r.emails} emails` : 'No jobs found in those emails')
  }

  const upload = (files: FileList | null) => {
    if (!files?.length) return
    void run(async () => keep(await post({ emls: await Promise.all([...files].slice(0, 30).map((f) => f.text())) })))
  }

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast('Copy failed: select the text and copy it'))
  }

  const other = result ? result.emails - result.alerts.LinkedIn - result.alerts.Indeed : 0
  const card = { borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } as const
  const code = s.mailKey ? scriptCode(label, s.mailKey) : ''

  return (
    <div className="screen tight" style={{ gap: 20 }}>
      <div>
        <button className="link" style={{ fontSize: 13 }} onClick={() => go('settings')}>‹ Settings</button>
        <div className="h-page" style={{ padding: '6px 4px 0' }}>Job alert emails</div>
        <div className="small muted" style={{ padding: '6px 4px 0', lineHeight: 1.5 }}>Put LinkedIn and Indeed job alerts under one Gmail label, and every search reads the jobs in them. It's free, and it covers jobs only those sites show.</div>
      </div>

      <div className="list">
        <div className="li" style={{ padding: '11px 0' }}>
          <div><div>Read alert emails on every search</div><div className="xs" style={{ color: on && connected ? 'var(--green)' : 'var(--faint)' }}>{!on ? 'Off' : connected ? `Gmail label “${label}”` : 'Connect Gmail below'}</div></div>
          <Toggle label="Read alert emails on every search" on={on} onChange={(v) => set({ conn: { ...s.conn, 'Email alerts': v } })} />
        </div>
      </div>

      {connected && (
        <div className="card" style={card}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Gmail connected</div>
          {status && <div className="small" style={{ color: 'var(--green)' }}>{status.text}</div>}
          <div className="xs muted" style={{ lineHeight: 1.45 }}>Read-only, through the script in your Gmail. Only the “{label}” label is read; nothing is marked read, moved, deleted or sent.</div>
          <button className="btn sm" disabled={busy} onClick={() => void readNow()}>{busy ? 'Reading…' : `Read the last ${s.postedWithin ?? 7} days now`}</button>
          <button className="link" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => { set({ mailScript: '' }); setStatus(null) }}>Disconnect</button>
        </div>
      )}

      <div className="stack">
        <SectionHead title={connected ? 'Gmail setup' : 'Connect Gmail'} hint="About 10 minutes, once" />
        <div className="card" style={card}>
          <Step n={1} title="Make the label">
            <label className="small" htmlFor="mail-label">Gmail label for the alerts</label>
            <input id="mail-label" className="text-input" value={s.mailFolder} onChange={(e) => set({ mailFolder: e.target.value })} placeholder="joboffers" />
            <div className="xs muted" style={{ lineHeight: 1.5 }}>Create it in Gmail. To file alerts automatically, search Gmail for <code>from:(jobalerts-noreply@linkedin.com OR alert@indeed.com)</code>, choose ⋯ → Filter messages like these → Create filter → Apply the label “{label}”.</div>
          </Step>

          <Step n={2} title="Add the script to your Google account">
            <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a> signed in to that Gmail, and name the project SmartJobFinder.</li>
              <li>Replace everything in Code.gs with the script below.</li>
              <li>Project Settings (⚙) → tick “Show appsscript.json manifest file”. Back in the Editor, replace appsscript.json with the manifest below.</li>
              <li>Deploy → New deployment → type Web app. Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Deploy.</li>
              <li>Authorize with your Google account. Google says it hasn't verified the app because it's your own script: choose Advanced → Go to SmartJobFinder → Allow. It asks only to <i>view</i> your email.</li>
              <li>Copy the Web app URL.</li>
            </ol>
            <CodeBox title="Code.gs" text={code} onCopy={() => copy(code, 'Script')} />
            <CodeBox title="appsscript.json" text={SCRIPT_MANIFEST} onCopy={() => copy(SCRIPT_MANIFEST, 'Manifest')} />
            <div className="xs muted" style={{ lineHeight: 1.5 }}>The script holds a private key so only this app can use it; don't share it. “Anyone” lets the app reach the script without signing in, and the key keeps everyone else out. If you change the label, copy the script again, then in Apps Script choose Deploy → Manage deployments → ✎ → Version: New version → Deploy. The URL stays the same.</div>
          </Step>

          <Step n={3} title="Connect">
            <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void connect() }}>
              <input className="text-input" style={{ flex: 1 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label="Web app URL" disabled={busy} />
              <button className="btn sm" style={{ width: 'auto', padding: '10px 16px' }} type="submit" disabled={busy || !url.trim()}>{busy ? 'Checking…' : connected ? 'Check' : 'Connect'}</button>
            </form>
            <details className="xs muted" style={{ lineHeight: 1.5 }}>
              <summary style={{ cursor: 'pointer' }}>Using SmartJobFinder on another phone or computer?</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
                <div>Each browser keeps its own settings. On the other device, paste this key, then the same Web app URL, instead of installing the script again.</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.mailKey}</code>
                  <button className="link" style={{ fontSize: 12 }} onClick={() => copy(s.mailKey, 'Key')}>Copy key</button>
                </div>
                <input className="text-input" placeholder="Paste a key from your other device" aria-label="Key from another device" onChange={(e) => { const v = e.target.value.trim(); if (/^[\w-]{24,}$/.test(v)) { set({ mailKey: v }); toast('Key updated') } }} />
              </div>
            </details>
          </Step>
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Or add emails as files" hint="No Gmail needed" />
        <div className="card" style={card}>
          <div className="xs muted" style={{ lineHeight: 1.45 }}>Save alert emails as .eml files (in Gmail: ⋮ → Download message; in Outlook: drag the email to a folder) and add them here, up to 30 at a time.</div>
          <label className="btn soft" style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Reading…' : 'Choose .eml files'}
            <input type="file" accept=".eml,message/rfc822" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </div>

      {error && <div className="small" style={{ color: 'var(--acc-fg)', lineHeight: 1.45, padding: '0 4px' }}>{error}</div>}
      {result && (
        <div className="card" style={{ ...card, gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{result.jobs.length} {result.jobs.length === 1 ? 'job' : 'jobs'} from {result.emails} {result.emails === 1 ? 'email' : 'emails'}</div>
          <div className="xs muted">{result.alerts.LinkedIn} LinkedIn {result.alerts.LinkedIn === 1 ? 'alert' : 'alerts'} · {result.alerts.Indeed} Indeed {result.alerts.Indeed === 1 ? 'alert' : 'alerts'}{other > 0 ? ` · ${other} other ${other === 1 ? 'email' : 'emails'} skipped` : ''}</div>
          {result.jobs.slice(0, 8).map((j) => <div key={j.id} className="small ellip">{j.title} · <span className="muted">{j.company}</span></div>)}
          {result.jobs.length > 0 && <button className="btn sm" onClick={() => go('matches')}>See your matches</button>}
        </div>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{n}. {title}</div>
      {children}
    </div>
  )
}

function CodeBox({ title, text, onCopy }: { title: string; text: string; onCopy: () => void }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
        <span className="xs" style={{ fontFamily: 'ui-monospace, monospace' }}>{title}</span>
        <button className="link" style={{ fontSize: 12 }} onClick={onCopy}>Copy</button>
      </div>
      <pre style={{ margin: 0, padding: 10, maxHeight: 160, overflow: 'auto', fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre' }}>{text}</pre>
    </div>
  )
}
