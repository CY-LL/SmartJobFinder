import { LIVE_SOURCES, PLANNED_SOURCES, fmtDate } from '../data'
import type { Application } from '../data'
import { fmtSalary } from '../store'
import { Toggle, useApp } from '../ui'

function exportCsv(rows: Application[]) {
  const head = ['Date', 'Company', 'Role', 'Source', 'Status', 'Posting']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [head, ...rows.map((a) => [fmtDate(a.date, true), a.company, a.role, a.source, a.status, a.url])].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'smartjobfinder-applications.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function Settings() {
  const { s, set, go, toast, reset } = useApp()
  const hourly = s.salPer === 'Hourly'
  const rows: [string, string, string][] = [
    ['Resume', s.fileName || 'Not added', 'upload'],
    ['Profile', s.profile ? [s.profile.name, s.profile.title].filter(Boolean).join(' · ') : 'Not set up', 'review'],
    ['On-site', s.cities.join(', ') || 'Anywhere', 'prefs'],
    ['Remote', s.scope === 'all' ? 'Anywhere in Canada' : s.provinces.join(', ') || 'None', 'prefs'],
    ['Job type', s.types.join(', ') || 'None', 'prefs'],
    ['Salary', `${fmtSalary(s, s.salMin)}+${hourly ? '' : ' /yr'}`, 'prefs'],
    ['Level', `${s.levels.join(', ') || 'None'} · ≤${s.years} yrs`, 'prefs'],
    ['Schedule', `${s.freq} ${s.time}`, 'schedule'],
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
        <div className="eyebrow" style={{ padding: '0 4px' }}>JOB SOURCES</div>
        <div className="list">
          {LIVE_SOURCES.map((name) => {
            const on = s.conn[name] !== false
            return (
              <div key={name} className="li" style={{ padding: '11px 0' }}>
                <div><div>{name}</div><div className="xs" style={{ color: on ? 'var(--green)' : 'var(--faint)' }}>{on ? 'Searching · via Apify' : 'Off'}</div></div>
                <Toggle label={name} on={on} onChange={(v) => set({ conn: { ...s.conn, [name]: v } })} />
              </div>
            )
          })}
          {PLANNED_SOURCES.map((name) => (
            <div key={name} className="li" style={{ padding: '11px 0' }}>
              <div><div className="muted">{name}</div><div className="xs faint">Not available yet</div></div>
              <Toggle label={name} on={false} disabled onChange={() => {}} />
            </div>
          ))}
        </div>
        <div className="xs muted" style={{ padding: '0 4px', lineHeight: 1.45 }}>Searches run through Apify scrapers and use your Apify credit (about $0.10 per search). You apply on the employer's site; SmartJobFinder prepares your documents and keeps the log.</div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>ACCOUNT</div>
        <div className="list">
          <div className="li"><span>Web app</span><span className="muted">{window.location.host}</span></div>
          <button className="li" disabled={!s.apps.length} onClick={() => { exportCsv(s.apps); toast('Application log exported') }}><span>Export application log</span><span className="muted">CSV ›</span></button>
          <button className="li" onClick={() => { if (confirm('Clear found jobs? Your profile, preferences and applications stay.')) { set({ jobs: [], jobStatus: Object.fromEntries(Object.entries(s.jobStatus).filter(([k]) => s.apps.some((a) => a.jobId === k))), lastRun: null }); toast('Found jobs cleared') } }}><span>Clear found jobs</span><span className="muted">›</span></button>
          <button className="li" onClick={() => { if (confirm('Start over? This deletes your profile, preferences, found jobs and applications from this browser.')) { reset(); go('upload') } }}><span>Start over</span><span className="muted">›</span></button>
        </div>
        <div className="xs muted" style={{ padding: '0 4px', lineHeight: 1.45 }}>Everything is stored in this browser only. Searches run when the app is open and one is due.</div>
      </div>
    </div>
  )
}
