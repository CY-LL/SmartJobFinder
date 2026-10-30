import { useState } from 'react'
import { APPS, APP_STATUS_COLORS } from '../data'
import type { Application } from '../data'
import { Status, useApp } from '../ui'
import { CoverLetter, TailoredResume } from './Matches'

export function useAllApps(): Application[] {
  const { s } = useApp()
  return [...s.extraApps, ...APPS]
}

export function Applications() {
  const { go } = useApp()
  const all = useAllApps()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const qq = q.trim().toLowerCase()
  const rows = all.filter((a) => !qq || (a.company + ' ' + a.role).toLowerCase().includes(qq))

  return (
    <div className="screen tight">
      <div className="page-head">
        <div className="h-page">Applications</div>
        <div className="small muted" style={{ paddingBottom: 6 }}>{all.length} sent</div>
      </div>
      <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '10px 12px' }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, border: '1.5px solid var(--faint)', flexShrink: 0 }} />
        <input className="text-input" style={{ padding: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or role" aria-label="Search company or role" />
      </label>
      <div className="xs muted" style={{ padding: '0 4px' }}>3 duplicate postings skipped this week</div>
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {rows.length === 0 && <div className="empty">No applications match “{q}”.</div>}
        {rows.map((a) => {
          const ex = !!open[a.id]
          return (
            <div key={a.id}>
              <div className="app-row" role="link" tabIndex={0} onClick={() => go(`apps/${a.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`apps/${a.id}`)}>
                <div className="date">{a.dateShort}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellip" style={{ fontSize: 14.5, fontWeight: 500 }}>{a.company}</div>
                  <div className="ellip small muted">{a.role}</div>
                </div>
                <Status colors={APP_STATUS_COLORS[a.status]}>{a.status}</Status>
                <button className="circle-btn" aria-label={ex ? 'Hide summary' : 'Show summary'} aria-expanded={ex} onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [a.id]: !ex }) }}>{ex ? '▴' : '▾'}</button>
              </div>
              {ex && (
                <div style={{ padding: '2px 4px 14px 60px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="pretty" style={{ fontSize: 13 }}>{a.desc}</div>
                  <div className="kv"><span>Level</span><span>{a.level}</span><span>Experience</span><span>{a.yrs} yrs</span><span>Must have</span><span>{a.req}</span></div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AppDetail({ id }: { id: string }) {
  const { go } = useApp()
  const all = useAllApps()
  const [viewing, setViewing] = useState<'resume' | 'cover' | null>(null)
  const a = all.find((x) => x.id === id)
  if (!a) return <div className="screen"><button className="back" onClick={() => go('apps')}>← Applications</button><div className="empty">Application not found.</div></div>

  const timeline = [
    { e: 'Tailored resume & cover letter generated', d: a.date },
    { e: `Submitted via ${a.source}`, d: a.date },
  ]
  if (a.status === 'Viewed' || a.status === 'Interview') timeline.push({ e: 'Application viewed by employer', d: '2 days later' })
  if (a.status === 'Interview') timeline.push({ e: 'Interview request received', d: 'Oct 27, 2026' })
  if (a.status === 'Rejected') timeline.push({ e: 'Position filled', d: 'Oct 26, 2026' })

  const docs = [
    { kind: 'resume' as const, name: a.file, size: 'Resume · 2 pages · 184 KB' },
    { kind: 'cover' as const, name: a.file.replace('Resume', 'CoverLetter'), size: 'Cover letter · 1 page · 62 KB' },
  ]
  const tailoredFor = { title: a.role, req: a.req, hits: [] }

  return (
    <div className="screen" style={{ padding: '6px 20px 24px', gap: 18 }}>
      <button className="back" onClick={() => go('apps')}>← Applications</button>
      <div>
        <div className="h1" style={{ fontSize: 28 }}>{a.company}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{a.role}</div>
      </div>
      <div className="list">
        {[['Applied', a.date], ['Source', a.source], ['Status', a.status], ['Duplicate key', a.key]].map(([k, v]) => (
          <div key={k} className="li" style={{ fontSize: 13.5, padding: '11px 0' }}><span className="muted">{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Job summary</div>
        <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="pretty" style={{ fontSize: 13.5 }}>{a.desc}</div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <div style={{ flex: 1 }}><div className="serif" style={{ fontSize: 20 }}>{a.level}</div><div className="muted" style={{ fontSize: 11.5 }}>level wanted</div></div>
            <div style={{ flex: 1 }}><div className="serif" style={{ fontSize: 20 }}>{a.yrs} yrs</div><div className="muted" style={{ fontSize: 11.5 }}>experience</div></div>
          </div>
          <div className="small"><span className="muted">Must have · </span>{a.req}</div>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Documents sent</div>
        {docs.map((d) => (
          <div key={d.name} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12 }}>
            <div className="file-ico sm">PDF</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="ellip" style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div><div className="xs muted">{d.size}</div></div>
            <button className="u" onClick={() => setViewing(d.kind)}>View</button>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Timeline</div>
        {timeline.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 9, height: 9, borderRadius: 5, background: 'var(--ink)', marginTop: 5 }} />
              {i < timeline.length - 1 && <div style={{ flex: 1, width: 1, background: 'var(--line-3)' }} />}
            </div>
            <div style={{ paddingBottom: 14 }}><div style={{ fontSize: 13.5 }}>{t.e}</div><div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{t.d}</div></div>
          </div>
        ))}
      </div>

      {viewing && (
        <div className="overlay" onClick={() => setViewing(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Document preview" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div className="ellip" style={{ fontSize: 14, fontWeight: 600 }}>{docs.find((d) => d.kind === viewing)!.name}</div>
              <button className="circle-btn" aria-label="Close" onClick={() => setViewing(null)}>✕</button>
            </div>
            <div className="doc">
              {viewing === 'resume'
                ? <TailoredResume job={tailoredFor} />
                : <CoverLetter job={tailoredFor} company={a.company} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
