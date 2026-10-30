import { useEffect, useRef, useState } from 'react'
import { JOB_STATUS, PROFILE } from '../data'
import type { Application, Job } from '../data'
import { nextRun } from '../store'
import { Status, useApp, useJobs } from '../ui'

type Filter = 'All' | 'Needs approval' | 'Applied'

export function Matches() {
  const { s, set, go } = useApp()
  const jobs = useJobs()
  const [filter, setFilter] = useState<Filter>('All')
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [running, setRunning] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const visible = jobs
    .filter((j) => s.types.includes(j.type))
    .filter((j) => filter === 'All' || (filter === 'Needs approval' ? j.status === 'pending' : j.status === 'applied'))
  const applied = jobs.filter((j) => j.status === 'applied').length
  const runNow = () => {
    if (running) return
    setRunning(true)
    timer.current = window.setTimeout(() => { setRunning(false); set({ ran: true }) }, 2200)
  }
  const sources = Object.values(s.conn).filter(Boolean).length

  return (
    <div className="screen tight">
      <div className="page-head">
        <div className="h-page">Matches</div>
        <div className="small muted" style={{ paddingBottom: 6 }}>{s.mode === 'auto' ? 'Auto-apply on' : 'Approval mode'}</div>
      </div>
      <div className="dark-card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em', opacity: 0.6 }}>{running ? 'RUNNING' : s.ran ? 'LAST RUN · JUST NOW' : 'LAST RUN · TODAY 7:00'}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{running ? `Searching ${sources} sources…` : `Next run ${nextRun(s)}`}</div>
          </div>
          <button className="ghost-btn" onClick={runNow} disabled={running}>{running ? '…' : 'Run now'}</button>
        </div>
        <div className="stats">
          <div><div className="v">{s.ran ? 31 : 24}</div><div className="k">found</div></div>
          <div><div className="v">{applied}</div><div className="k">applied</div></div>
          <div><div className="v">{s.ran ? 4 : 3}</div><div className="k">duplicates skipped</div></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['All', 'Needs approval', 'Applied'] as const).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="stack">
        {visible.length === 0 && <div className="empty">No matches here yet.</div>}
        {visible.map((j) => {
          const st = JOB_STATUS[j.status]
          const ex = !!open[j.id]
          return (
            <div key={j.id} className="job-card" role="link" tabIndex={0} onClick={() => go(`job/${j.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`job/${j.id}`)}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{j.title}</div><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{j.company} · {j.loc}</div></div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div className="pct">{j.match}%</div><div className="muted" style={{ fontSize: 10.5 }}>match</div></div>
              </div>
              <div className="row">
                <div className="meta">{j.type} · {j.mode} · {j.source}</div>
                <Status colors={st}>{st[0]}</Status>
              </div>
              {ex && (
                <div className="expand">
                  <div className="pretty" style={{ fontSize: 13 }}>{j.desc}</div>
                  <div className="kv"><span>Level</span><span>{j.level}</span><span>Experience</span><span>{j.yrs} yrs</span><span>Must have</span><span>{j.req}</span></div>
                </div>
              )}
              <button className="link" style={{ alignSelf: 'flex-start' }} aria-expanded={ex} onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [j.id]: !ex }) }}>
                {ex ? 'Hide summary ▴' : 'Summary & expertise ▾'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TailoredResume({ job }: { job: Pick<Job, 'headline' | 'summary' | 'bullet' | 'skillsLine'> }) {
  return (
    <>
      <div className="serif" style={{ fontSize: 18 }}>{PROFILE.name}</div>
      <div className="muted" style={{ fontSize: '0.95em', marginBottom: 10 }}>{job.headline} · {PROFILE.city}</div>
      <div className="sec">SUMMARY</div>
      <div className="mb">Product designer with 7 years shipping B2B and public-sector tools. <span className="hl">{job.summary}</span></div>
      <div className="sec">EXPERIENCE</div>
      <div style={{ fontWeight: 500 }}>Senior Product Designer — Ledgerline, 2022–now</div>
      <div>• <span className="hl">{job.bullet}</span></div>
      <div style={{ marginBottom: 6 }}>• Cut onboarding drop-off 31% with a redesigned setup flow</div>
      <div style={{ fontWeight: 500 }}>Product Designer — Civic Digital, 2019–22</div>
      <div className="mb">• Designed 40+ WCAG 2.1 AA services for 3 ministries</div>
      <div className="sec">SKILLS</div>
      <div><span className="hl">{job.skillsLine}</span>, Prototyping, Research</div>
    </>
  )
}

export function CoverLetter({ company, title, hook }: { company: string; title: string; hook: string }) {
  return (
    <>
      <div className="mb">Dear {company} hiring team,</div>
      <div style={{ marginBottom: 8 }}>I'm applying for the {title} role. <span className="hl">{hook}</span></div>
      <div style={{ marginBottom: 8 }}>At Ledgerline I lead design for a platform used by 12,000 finance teams, and before that I shipped accessible public services at Civic Digital. Both taught me to pair careful research with fast, measurable iteration.</div>
      <div style={{ marginBottom: 12 }}>I'd welcome the chance to talk about how I could contribute.</div>
      <div>{PROFILE.name}</div>
    </>
  )
}

export function JobDetail({ id }: { id: number }) {
  const { s, set, go, toast } = useApp()
  const jobs = useJobs()
  const [doc, setDoc] = useState<'resume' | 'cover'>('resume')
  const job = jobs.find((j) => j.id === id)
  if (!job) return <div className="screen"><button className="back" onClick={() => go('matches')}>← Matches</button><div className="empty">That job is no longer available.</div></div>

  const approve = () => {
    const appId = 'x' + job.id
    const now = new Date()
    const date = now.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: false })
    const app: Application = {
      id: appId, desc: job.desc, level: job.level, yrs: job.yrs, req: job.req, company: job.company, role: job.title,
      date, dateShort: now.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }).toUpperCase(), source: job.source, status: 'Sent',
      key: job.source.toLowerCase().replace(/\W/g, '').slice(0, 4) + '-' + (91000 + job.id * 137),
      file: `Avery_Resume_${job.company.replace(/\W/g, '')}.pdf`,
    }
    set((p) => ({
      jobStatus: { ...p.jobStatus, [job.id]: 'applied' },
      extraApps: p.extraApps.some((x) => x.id === appId) ? p.extraApps : [app, ...p.extraApps],
    }))
    toast(`Sent to ${job.company} · saved to Applications`)
  }
  const skip = () => {
    set((p) => ({ jobStatus: { ...p.jobStatus, [job.id]: 'skipped' } }))
    go('matches')
  }
  const appliedOn = job.appliedOn ?? s.extraApps.find((a) => a.id === 'x' + job.id)?.date.split(',')[0] ?? 'today'

  return (
    <div className="screen" style={{ padding: '6px 20px 24px', gap: 18 }}>
      <button className="back" onClick={() => go('matches')}>← Matches</button>
      <div>
        <div className="eyebrow" style={{ letterSpacing: '.06em' }}>{job.source} · {job.posted}</div>
        <div className="h1" style={{ fontSize: 28, marginTop: 6 }}>{job.title}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{job.company}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{job.type} · {job.loc} · {job.mode} · {job.salary}</div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="pretty" style={{ fontSize: 13.5 }}>{job.desc}</div>
        <div className="small muted">Wants {job.level} · {job.yrs} yrs · {job.req}</div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="section-head"><div style={{ fontSize: 14, fontWeight: 600 }}>Why it matched</div><div className="serif" style={{ fontSize: 22 }}>{job.match}%</div></div>
        <div className="wrap" style={{ gap: 6 }}>{job.hits.map((h) => <div key={h} className="hit">{h}</div>)}</div>
        <div className="small muted">Asks for {job.yrs} yrs · you have {PROFILE.years}</div>
      </div>
      <div className="stack">
        <div className="row">
          <div style={{ fontSize: 14, fontWeight: 600 }}>Tailored for this job</div>
          <div className="seg sm" role="group">
            <button className={doc === 'resume' ? 'on' : ''} onClick={() => setDoc('resume')}>Resume</button>
            <button className={doc === 'cover' ? 'on' : ''} onClick={() => setDoc('cover')}>Cover letter</button>
          </div>
        </div>
        <div className="doc">
          {doc === 'resume' ? <TailoredResume job={job} /> : <CoverLetter company={job.company} title={job.title} hook={job.coverHook} />}
        </div>
        <div className="xs muted" style={{ lineHeight: 1.45 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--acc-hl)', borderRadius: 2, marginRight: 6, verticalAlign: -1 }} />
          Rewritten to match the posting. Facts are never invented — only reordered and rephrased.
        </div>
      </div>
      {job.status === 'pending' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn outline" style={{ flex: 1, padding: 15 }} onClick={skip}>Skip</button>
          <button className="btn acc" style={{ flex: 2, padding: 15 }} onClick={approve}>Approve &amp; send</button>
        </div>
      )}
      {job.status === 'applied' && <div className="banner green">Applied {appliedOn} · <button className="u" style={{ fontSize: 14 }} onClick={() => go('apps')}>saved to Applications</button></div>}
      {job.status === 'queued' && <div className="banner neutral">Queued — sends on next run ({nextRun(s)})</div>}
      {job.status === 'skipped' && (
        <div className="banner neutral">Skipped · <button className="u" style={{ fontSize: 14 }} onClick={() => set((p) => {
          const { [job.id]: _skipped, ...rest } = p.jobStatus
          return { jobStatus: rest }
        })}>Undo</button></div>
      )}
    </div>
  )
}
