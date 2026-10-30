import { useState } from 'react'
import { SOURCES, fmtDate } from '../data'
import type { Application, Employer } from '../data'
import { fmtSalary } from '../store'
import { suggestedSkillRoles, suggestedTitles } from '../match'
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
    ['Job titles', (s.searchTitles.length ? s.searchTitles : s.profile ? suggestedTitles(s.profile) : []).join(', ') || 'From your profile', 'prefs'],
    ['Skill roles', (s.searchSkills.length ? s.searchSkills : s.profile ? suggestedSkillRoles(s.profile) : []).join(', ') || 'None', 'prefs'],
    ['Posted within', `${s.postedWithin ?? 7} ${s.postedWithin === 1 ? 'day' : 'days'}`, 'prefs'],
    ['On-site', s.cities.join(', ') || 'Anywhere', 'prefs'],
    ['Remote', s.scope === 'all' ? 'Anywhere in Canada' : s.provinces.join(', ') || 'None', 'prefs'],
    ['Job type', s.types.join(', ') || 'None', 'prefs'],
    ['Salary', `${fmtSalary(s, s.salMin)}+${hourly ? '' : ' /yr'}`, 'prefs'],
    ['Level', `${s.levels.join(', ') || 'None'} · ≤${s.years} yrs`, 'prefs'],
    ['Schedule', `${s.freq} ${s.time}`, 'schedule'],
    ['Job alert emails', s.conn['Email alerts'] === false ? 'Off' : s.mailScript ? `Gmail label: ${s.mailFolder || 'joboffers'}` : 'Not connected', 'alerts'],
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
        <div className="eyebrow" style={{ padding: '0 4px' }}>FREE JOB SOURCES</div>
        <SourceList paid={false} />
        <div className="xs muted" style={{ padding: '0 4px', lineHeight: 1.45 }}>Public job feeds that allow their jobs to be shown elsewhere, read directly at no cost. Each posting links back to the site it came from.</div>
        <EmployerList />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ padding: '0 4px' }}>PAID JOB SOURCES</div>
        <SourceList paid />
        <div className="xs muted" style={{ padding: '0 4px', lineHeight: 1.45 }}>Read through Apify scrapers, which use your Apify credit (about $0.60 per search with all six on; turn sites off to spend less). You apply on the employer's site; SmartJobFinder prepares your documents and keeps the log.</div>
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

function SourceList({ paid }: { paid: boolean }) {
  const { s, set } = useApp()
  return (
    <div className="list">
      {SOURCES.filter((x) => x.paid === paid).map(({ name, note }) => {
        const on = s.conn[name] !== false
        const extra = name === 'Employers' ? ` · ${s.employers.length} added` : ''
        return (
          <div key={name} className="li" style={{ padding: '11px 0' }}>
            <div><div>{name}</div><div className="xs" style={{ color: on ? 'var(--green)' : 'var(--faint)' }}>{on ? `Searching · ${note}${extra}` : 'Off'}</div></div>
            <Toggle label={name} on={on} onChange={(v) => set({ conn: { ...s.conn, [name]: v } })} />
          </div>
        )
      })}
    </div>
  )
}

/** Employers whose own job boards are read: paste a careers page, and the board behind it is found. */
function EmployerList() {
  const { s, set, toast } = useApp()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const same = (a: Employer, b: Employer) => a.ats === b.ats && a.slug.toLowerCase() === b.slug.toLowerCase()

  const add = async () => {
    const v = link.trim()
    if (!v || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/boards?detect=${encodeURIComponent(v)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ats) throw new Error(data.message ?? 'We couldn’t read that careers page.')
      const e: Employer = { ats: data.ats, slug: data.slug, name: data.name }
      if (s.employers.some((x) => same(x, e))) throw new Error(`${e.name} is already on your list.`)
      set({ employers: [...s.employers, e] })
      setLink('')
      toast(`${e.name} added · ${data.count} open ${data.count === 1 ? 'job' : 'jobs'} in Canada or remote`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t read that careers page.')
    } finally {
      setBusy(false)
    }
  }
  const rename = (e: Employer) => {
    const name = prompt('Company name', e.name)?.trim()
    if (name) set({ employers: s.employers.map((x) => (same(x, e) ? { ...x, name } : x)) })
  }

  return (
    <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Employers to watch</div>
      <div className="xs muted" style={{ lineHeight: 1.45 }}>Paste a company's careers page. If it uses Greenhouse, Lever, Ashby, Workable or SmartRecruiters (most tech companies and agencies do), its jobs in Canada and remote are checked on every search, straight from the source.</div>
      {s.employers.length > 0 && (
        <div className="wrap" style={{ gap: 6 }}>
          {s.employers.map((e) => (
            <div key={`${e.ats}:${e.slug}`} className="city-chip">
              <button className="link" style={{ fontSize: 'inherit', color: 'inherit' }} title="Rename" onClick={() => rename(e)}>{e.name}</button>
              <button aria-label={`Remove ${e.name}`} onClick={() => set({ employers: s.employers.filter((x) => !same(x, e)) })}>✕</button>
            </div>
          ))}
        </div>
      )}
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="text-input" style={{ flex: 1 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="e.g. koho.ca/careers" aria-label="Careers page link" disabled={busy} />
        <button className="btn sm" style={{ width: 'auto', padding: '10px 16px' }} type="submit" disabled={busy || !link.trim()}>{busy ? 'Checking…' : 'Add'}</button>
      </form>
      {error && <div className="xs" style={{ color: 'var(--acc-fg)', lineHeight: 1.45 }}>{error}</div>}
    </div>
  )
}
