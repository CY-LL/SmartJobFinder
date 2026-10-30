import { useApp, useJobs, Seg, Toggle } from '../ui'
import { fmtSalary } from '../store'
import { useAllApps } from './Applications'

function exportCsv(rows: ReturnType<typeof useAllApps>) {
  const head = ['Date', 'Company', 'Role', 'Source', 'Status', 'Duplicate key', 'Resume file']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [head, ...rows.map((a) => [a.date, a.company, a.role, a.source, a.status, a.key, a.file])].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'smartjobfinder-applications.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function Settings() {
  const { s, set, go, toast, reset } = useApp()
  const apps = useAllApps()
  const hourly = s.salPer === 'Hourly'
  const rows: [string, string, string][] = [
    ['Resume', s.fileName, 'upload'],
    ['On-site', s.cities.join(', ') || 'None', 'prefs'],
    ['Remote', s.scope === 'all' ? 'Anywhere in Canada' : s.provinces.join(', ') || 'None', 'prefs'],
    ['Job type', s.types.join(', ') || 'None', 'prefs'],
    ['Salary', `${fmtSalary(s, s.salMin)}–${fmtSalary(s, s.salMax)}${hourly ? '' : ' /yr'}`, 'prefs'],
    ['Level', `${s.levels.join(', ') || 'None'} · ≤${s.years} yrs`, 'prefs'],
    ['Schedule', `${s.freq} ${s.time}`, 'schedule'],
    ['Mode', s.mode === 'auto' ? 'Auto-apply' : 'Ask first', 'schedule'],
  ]

  return (
    <div className="screen tight" style={{ gap: 20 }}>
      <div className="h-page" style={{ padding: '0 4px' }}>Settings</div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>SEARCH PROFILE</div>
        <div className="list">
          {rows.map(([k, v, to]) => (
            <button key={k} className="li" onClick={() => go(to)}>
              <span>{k}</span>
              <span className="muted ellip" style={{ textAlign: 'right', maxWidth: '60%' }}>{v} ›</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>EMAIL NOTIFICATIONS</div>
        <div className="list">
          <div className="li" style={{ padding: '11px 0' }}>
            <div><div>Email me when jobs are applied to</div><div className="xs muted">Includes a summary of each application</div></div>
            <Toggle label="Email notifications" on={s.emailOn} onChange={(v) => set({ emailOn: v })} />
          </div>
          {s.emailOn && (
            <>
              <label className="li" style={{ padding: '11px 0' }}>
                <span className="muted">Send to</span>
                <input className="text-input" type="email" style={{ textAlign: 'right', padding: 0, flex: 1 }} value={s.email} onChange={(e) => set({ email: e.target.value })} />
              </label>
              <div className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '11px 0' }}>
                <span className="muted">How often</span>
                <Seg size="md" options={['After each run', 'Daily digest', 'Weekly'] as const} value={s.emailFreq} onChange={(v) => set({ emailFreq: v })} />
              </div>
              <button className="li" onClick={() => go('email')}><span>Preview latest email</span><span className="muted">›</span></button>
            </>
          )}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>JOB SOURCES</div>
        <div className="list">
          {Object.entries(s.conn).map(([name, on]) => (
            <div key={name} className="li" style={{ padding: '11px 0' }}>
              <div><div>{name}</div><div className="xs" style={{ color: on ? 'var(--green)' : 'var(--faint)' }}>{on ? 'Connected · via Apify' : 'Off'}</div></div>
              <Toggle label={name} on={on} onChange={(v) => set({ conn: { ...s.conn, [name]: v } })} />
            </div>
          ))}
        </div>
        <div className="xs muted" style={{ padding: '0 4px', lineHeight: 1.45 }}>Searches run through Apify scrapers. Applications are submitted through each site's apply flow when supported; otherwise they're flagged for you to finish.</div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>ACCOUNT</div>
        <div className="list">
          <div className="li"><span>Web app</span><span className="muted">{window.location.host}</span></div>
          <button className="li" onClick={() => { exportCsv(apps); toast('Application log exported') }}><span>Export application log</span><span className="muted">CSV ›</span></button>
          <button className="li" onClick={() => { if (confirm('Reset all settings and start onboarding again?')) { reset(); go('upload') } }}><span>Reset demo data</span><span className="muted">›</span></button>
        </div>
      </div>
    </div>
  )
}

export function EmailPreview() {
  const { s, go } = useApp()
  const jobs = useJobs()
  const applied = jobs.filter((j) => j.status === 'applied')
  const pend = jobs.filter((j) => j.status === 'pending' && s.types.includes(j.type)).length
  const sources = Object.values(s.conn).filter(Boolean).length

  return (
    <div className="screen" style={{ padding: '6px 20px 24px', gap: 14 }}>
      <button className="back" onClick={() => go('settings')}>← Settings</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 2px' }}>
        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>Applied to {applied.length} jobs — Oct 30 run</div>
        <div className="small muted">SmartJobFinder &lt;runs@smartjobfinder.com&gt;</div>
        <div className="small muted">To {s.email} · Today 7:06</div>
      </div>
      <div className="doc" style={{ borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13.5, lineHeight: 1.5 }}>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.15 }}>Good morning, Jordan.</div>
        <div>This morning's run searched {sources} sources and applied to {applied.length} jobs that matched your profile. A tailored resume and cover letter were sent with each.</div>
        <div className="stats" style={{ borderTop: '1px solid var(--line-2)', borderBottom: '1px solid var(--line-2)', padding: '12px 0' }}>
          <div><div className="v" style={{ fontSize: 22 }}>{s.ran ? 31 : 24}</div><div className="k" style={{ fontSize: 11 }}>jobs found</div></div>
          <div><div className="v" style={{ fontSize: 22 }}>{applied.length}</div><div className="k" style={{ fontSize: 11 }}>applied</div></div>
          <div><div className="v" style={{ fontSize: 22 }}>{s.ran ? 4 : 3}</div><div className="k" style={{ fontSize: 11 }}>duplicates skipped</div></div>
        </div>
        <div className="eyebrow" style={{ fontSize: 10.5 }}>APPLIED</div>
        {applied.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 14, borderBottom: '1px solid var(--line-2)' }}>
            <div className="row" style={{ alignItems: 'baseline' }}><div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div><div className="serif" style={{ fontSize: 16 }}>{m.match}%</div></div>
            <div className="small muted">{m.company} · {m.loc} · {m.salary}</div>
            <div className="small" style={{ lineHeight: 1.45, marginTop: 2 }}>{m.desc}</div>
            <div className="xs muted">Wants {m.level} · {m.yrs} yrs · via {m.source}</div>
            <button className="link" style={{ textDecoration: 'underline', alignSelf: 'flex-start', marginTop: 2 }} onClick={() => go(`job/${m.id}`)}>View resume &amp; cover letter sent</button>
          </div>
        ))}
        {pend > 0 && <div style={{ background: 'var(--acc-soft)', borderRadius: 8, padding: 12, fontSize: 13 }}>{pend} more {pend === 1 ? 'job is' : 'jobs are'} waiting for your approval in Matches.</div>}
        <button className="btn sm" onClick={() => go('apps')}>Open Applications log</button>
        <div className="faint" style={{ fontSize: 11, lineHeight: 1.45 }}>You're receiving this because email summaries are on. Change frequency or turn off in Settings.</div>
      </div>
    </div>
  )
}
