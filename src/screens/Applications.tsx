import { useState } from 'react'
import { APP_STATUS_COLORS, fmtDate } from '../data'
import type { AppStatus } from '../data'
import { Seg, Status, useApp } from '../ui'
import { CoverLetter, TailoredResume } from './Matches'

const STATUSES: AppStatus[] = ['Applied', 'Interview', 'Offer', 'Rejected']

export function Applications() {
  const { s, go } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const qq = q.trim().toLowerCase()
  const rows = s.apps.filter((a) => !qq || (a.company + ' ' + a.role).toLowerCase().includes(qq))

  return (
    <div className="screen tight">
      <div className="page-head">
        <div className="h-page">Applications</div>
        <div className="small muted" style={{ paddingBottom: 6 }}>{s.apps.length} sent</div>
      </div>
      {s.apps.length > 0 && (
        <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, border: '1.5px solid var(--faint)', flexShrink: 0 }} />
          <input className="text-input" style={{ padding: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or role" aria-label="Search company or role" />
        </label>
      )}
      <div style={{ borderTop: s.apps.length ? '1px solid var(--line)' : undefined }}>
        {s.apps.length === 0 && (
          <div className="empty">
            Nothing here yet. When you apply to a match, it's logged here with the resume and cover letter you used.
            <div style={{ marginTop: 14 }}><button className="btn sm" style={{ width: 'auto', display: 'inline-block', padding: '10px 16px' }} onClick={() => go('matches')}>See your matches</button></div>
          </div>
        )}
        {s.apps.length > 0 && rows.length === 0 && <div className="empty">No applications match “{q}”.</div>}
        {rows.map((a) => {
          const ex = !!open[a.id]
          return (
            <div key={a.id}>
              <div className="app-row" role="link" tabIndex={0} onClick={() => go(`apps/${a.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`apps/${a.id}`)}>
                <div className="date">{new Date(a.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellip" style={{ fontSize: 14.5, fontWeight: 500 }}>{a.company}</div>
                  <div className="ellip small muted">{a.role}</div>
                </div>
                <Status colors={APP_STATUS_COLORS[a.status]}>{a.status}</Status>
                <button className="circle-btn" aria-label={ex ? 'Hide summary' : 'Show summary'} aria-expanded={ex} onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [a.id]: !ex }) }}>{ex ? '▴' : '▾'}</button>
              </div>
              {ex && (
                <div style={{ padding: '2px 4px 14px 60px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="pretty" style={{ fontSize: 13 }}>{a.desc.slice(0, 300)}{a.desc.length > 300 ? '…' : ''}</div>
                  <div className="kv"><span>Level</span><span>{a.level}</span><span>Experience</span><span>{a.yrs ? `${a.yrs} yrs` : 'Not stated'}</span><span>Source</span><span>{a.source}</span></div>
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
  const { s, set, go } = useApp()
  const [viewing, setViewing] = useState<'resume' | 'cover' | null>(null)
  const a = s.apps.find((x) => x.id === id)
  if (!a) return <div className="screen"><button className="back" onClick={() => go('apps')}>← Applications</button><div className="empty">Application not found.</div></div>

  const job = { title: a.role, desc: a.desc, tags: a.tags }
  const setStatus = (status: AppStatus) => {
    if (status === a.status) return
    const now = new Date().toISOString()
    set((p) => ({ apps: p.apps.map((x) => (x.id === a.id ? { ...x, status, history: [...x.history, { e: `Marked as ${status}`, d: now }] } : x)) }))
  }
  const remove = () => {
    if (!confirm(`Remove ${a.company} from your Applications?`)) return
    set((p) => {
      const { [a.jobId]: _gone, ...jobStatus } = p.jobStatus
      return { apps: p.apps.filter((x) => x.id !== a.id), jobStatus }
    })
    go('apps')
  }
  const docs = [
    { kind: 'resume' as const, name: `Resume — ${a.company}`, size: 'Tailored resume' },
    { kind: 'cover' as const, name: `Cover letter — ${a.company}`, size: 'Tailored cover letter' },
  ]

  return (
    <div className="screen" style={{ padding: '6px 20px 24px', gap: 18 }}>
      <button className="back" onClick={() => go('apps')}>← Applications</button>
      <div>
        <div className="h1" style={{ fontSize: 28 }}>{a.company}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{a.role}</div>
        {a.url && <a className="link" href={a.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>View posting ↗</a>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Status</div>
        <Seg size="md" options={STATUSES} value={a.status} onChange={setStatus} />
      </div>
      <div className="list">
        {[['Applied', fmtDate(a.date, true)], ['Source', a.source], ['Level wanted', a.level], ['Experience', a.yrs ? `${a.yrs} yrs` : 'Not stated']].map(([k, v]) => (
          <div key={k} className="li" style={{ fontSize: 13.5, padding: '11px 0' }}><span className="muted">{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Documents</div>
        {docs.map((d) => (
          <div key={d.kind} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12 }}>
            <div className="file-ico sm">DOC</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="ellip" style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div><div className="xs muted">{d.size}</div></div>
            <button className="u" onClick={() => setViewing(d.kind)}>View</button>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Timeline</div>
        {a.history.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 9, height: 9, borderRadius: 5, background: 'var(--ink)', marginTop: 5 }} />
              {i < a.history.length - 1 && <div style={{ flex: 1, width: 1, background: 'var(--line-3)' }} />}
            </div>
            <div style={{ paddingBottom: 14 }}><div style={{ fontSize: 13.5 }}>{t.e}</div><div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{fmtDate(t.d, true)}</div></div>
          </div>
        ))}
      </div>
      <button className="link" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={remove}>Remove from Applications</button>

      {viewing && (
        <div className="overlay" onClick={() => setViewing(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Document preview" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div className="ellip" style={{ fontSize: 14, fontWeight: 600 }}>{docs.find((d) => d.kind === viewing)!.name}</div>
              <button className="circle-btn" aria-label="Close" onClick={() => setViewing(null)}>✕</button>
            </div>
            <div className="doc">
              {viewing === 'resume' ? <TailoredResume job={job} /> : <CoverLetter job={job} company={a.company} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
