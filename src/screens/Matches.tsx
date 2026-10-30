import { useState } from 'react'
import { JOB_STATUS, ago, fmtDate } from '../data'
import type { Application, Job } from '../data'
import { nextRun } from '../store'
import { MIN_MATCH, Status, useApp, useJobs, useProfile, visibleJobs } from '../ui'
import { skillsInJob } from '../match'

type Filter = 'All' | 'New' | 'Applied'

export function Matches() {
  const { s, go, search } = useApp()
  const all = useJobs()
  const [filter, setFilter] = useState<Filter>('New')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const shown = visibleJobs(all)
  const list = shown.filter((j) => filter === 'All' ? j.status !== 'skipped' : filter === 'New' ? j.status === 'new' : j.status === 'applied')
  const hiddenCount = all.length - shown.length
  const counts = { New: shown.filter((j) => j.status === 'new').length, Applied: shown.filter((j) => j.status === 'applied').length }
  const sources = Object.entries(s.conn).filter(([, on]) => on).map(([k]) => k)

  return (
    <div className="screen tight">
      <div className="page-head">
        <div className="h-page">Matches</div>
        <div className="small muted" style={{ paddingBottom: 6 }}>{sources.join(' · ') || 'No sources on'}</div>
      </div>
      <div className="dark-card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em', opacity: 0.6 }}>
              {search.running ? 'SEARCHING' : s.lastRun ? `LAST SEARCH · ${ago(s.lastRun.at).toUpperCase()}` : 'NO SEARCH YET'}
            </div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{search.running ? search.progress : `Next search ${nextRun(s)}`}</div>
          </div>
          <button className="ghost-btn" onClick={() => search.run()} disabled={search.running}>{search.running ? '…' : 'Search now'}</button>
        </div>
        <div className="stats">
          <div><div className="v">{s.lastRun?.found ?? 0}</div><div className="k">found</div></div>
          <div><div className="v">{shown.length}</div><div className="k">match you</div></div>
          <div><div className="v">{counts.Applied}</div><div className="k">applied</div></div>
        </div>
      </div>
      {search.error && <div className="small" role="alert" style={{ color: 'oklch(0.5 0.15 25)' }}>{search.error}</div>}
      {s.lastRun && s.lastRun.failed.length > 0 && !search.running && <div className="xs muted">Some sources didn't respond: {s.lastRun.failed.join('; ')}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['New', 'Applied', 'All'] as const).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}{f !== 'All' && counts[f] > 0 ? ` · ${counts[f]}` : ''}
          </button>
        ))}
      </div>
      <div className="stack">
        {list.length === 0 && (
          <div className="empty">
            {search.running ? 'Looking for jobs that fit your profile…'
              : !s.lastRun ? 'Run your first search to see real jobs that fit your profile.'
              : filter === 'Applied' ? 'You haven’t applied to anything yet.'
              : 'No new matches. Try widening your preferences in Settings.'}
          </div>
        )}
        {list.map((j) => {
          const st = JOB_STATUS[j.status]
          const ex = !!open[j.id]
          return (
            <div key={j.id} className="job-card" role="link" tabIndex={0} onClick={() => go(`job/${j.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`job/${j.id}`)}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{j.title}</div><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{j.company} · {j.loc}</div></div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div className="pct">{j.match}%</div><div className="muted" style={{ fontSize: 10.5 }}>match</div></div>
              </div>
              <div className="row">
                <div className="meta">{[j.type, j.mode, j.salary, j.source, ago(j.posted)].filter(Boolean).join(' · ')}</div>
                <Status colors={st}>{st[0]}</Status>
              </div>
              {ex && (
                <div className="expand">
                  <div className="pretty" style={{ fontSize: 13 }}>{j.desc.slice(0, 320)}{j.desc.length > 320 ? '…' : ''}</div>
                  <div className="kv"><span>Level</span><span>{j.level}</span><span>Experience</span><span>{j.yrs ? `${j.yrs} yrs` : 'Not stated'}</span><span>Your skills</span><span>{j.matched.join(', ') || 'None mentioned'}</span></div>
                </div>
              )}
              <button className="link" style={{ alignSelf: 'flex-start' }} aria-expanded={ex} onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [j.id]: !ex }) }}>
                {ex ? 'Hide summary ▴' : 'Summary & expertise ▾'}
              </button>
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 && !search.running && (
        <div className="xs muted" style={{ textAlign: 'center' }}>
          {hiddenCount} other {hiddenCount === 1 ? 'posting was' : 'postings were'} left out by your preferences or scored under {MIN_MATCH}%. <button className="link" style={{ fontSize: 12 }} onClick={() => go('prefs')}>Adjust preferences</button>
        </div>
      )}
    </div>
  )
}

type JobLike = Pick<Job, 'title' | 'desc' | 'tags'>

function useTailoring(job: JobLike) {
  const { s } = useApp()
  const p = useProfile()
  const skills = p.skills.filter((k) => !s.skillOff.includes(k))
  const matched = skillsInJob(skills, job)
  return { p, matched, rest: skills.filter((k) => !matched.includes(k)) }
}

export function TailoredResume({ job }: { job: JobLike }) {
  const { p, matched, rest } = useTailoring(job)
  return (
    <>
      <div className="serif" style={{ fontSize: 18 }}>{p.name || 'Your name'}</div>
      <div className="muted" style={{ fontSize: '0.95em', marginBottom: 10 }}>{[p.title, p.city, p.email].filter(Boolean).join(' · ')}</div>
      <div className="sec">SUMMARY</div>
      <div className="mb">
        {p.title || 'Professional'}{p.years > 0 && ` with ${p.years} years of experience`}.{' '}
        {matched.length > 0 && <span className="hl">Brings {matched.slice(0, 4).join(', ')} to the {job.title} role.</span>}
      </div>
      <div className="sec">EXPERIENCE</div>
      <div className="mb">
        {p.roles.length === 0 && <div className="muted">No roles on your profile yet.</div>}
        {p.roles.map((r, i) => (
          <div key={i} style={{ fontWeight: 500 }}>{r.title}{r.org && ` — ${r.org}`}{r.dates && `, ${r.dates.replace('NOW', 'now')}`}</div>
        ))}
      </div>
      <div className="sec">SKILLS</div>
      <div>
        {matched.length > 0 && <span className="hl">{matched.join(', ')}</span>}
        {matched.length > 0 && rest.length > 0 && ', '}
        {rest.slice(0, 12).join(', ')}
      </div>
    </>
  )
}

export function CoverLetter({ job, company }: { job: JobLike; company: string }) {
  const { p, matched } = useTailoring(job)
  const [r1, r2] = p.roles
  return (
    <>
      <div className="mb">Dear {company} hiring team,</div>
      <div style={{ marginBottom: 8 }}>
        I'm applying for the {job.title} role.{' '}
        <span className="hl">
          {matched.length > 0
            ? `My background in ${matched.slice(0, 3).join(', ')} lines up closely with what you're looking for.`
            : `My experience${p.title ? ` as a ${p.title}` : ''} lines up with what this role calls for.`}
        </span>
      </div>
      {r1 && (
        <div style={{ marginBottom: 8 }}>
          Most recently I've worked as {r1.title}{r1.org && ` at ${r1.org}`}
          {r2 ? `, and before that as ${r2.title}${r2.org ? ` at ${r2.org}` : ''}` : ''}
          {p.years > 0 ? `, for ${p.years} years of experience in total.` : '.'}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>I'd welcome the chance to talk about how I could contribute.</div>
      <div>{p.name}</div>
    </>
  )
}

/** Plain-text versions of the tailored documents, for copying into an application form. */
function docText(el: HTMLElement | null) {
  return el?.innerText.replace(/\n{3,}/g, '\n\n').trim() ?? ''
}

export function JobDetail({ id }: { id: string }) {
  const { set, go, toast } = useApp()
  const jobs = useJobs()
  const [doc, setDoc] = useState<'resume' | 'cover'>('resume')
  const [docEl, setDocEl] = useState<HTMLDivElement | null>(null)
  const [more, setMore] = useState(false)
  const job = jobs.find((j) => j.id === id)
  if (!job) return <div className="screen"><button className="back" onClick={() => go('matches')}>← Matches</button><div className="empty">That job is no longer in your results.</div></div>

  const markApplied = () => {
    const now = new Date().toISOString()
    const app: Application = {
      id: 'a-' + job.id, jobId: job.id, company: job.company, role: job.title, date: now, source: job.source, url: job.url,
      status: 'Applied', level: job.level, yrs: job.yrs, desc: job.desc, tags: job.tags,
      history: [{ e: 'Tailored resume & cover letter prepared', d: now }, { e: `Applied via ${job.source}`, d: now }],
    }
    set((p) => ({
      jobStatus: { ...p.jobStatus, [job.id]: 'applied' },
      apps: p.apps.some((x) => x.id === app.id) ? p.apps : [app, ...p.apps],
    }))
    toast(`Logged in Applications`)
  }
  const apply = () => {
    window.open(job.applyUrl || job.url, '_blank', 'noopener')
    markApplied()
  }
  const skip = () => {
    set((p) => ({ jobStatus: { ...p.jobStatus, [job.id]: 'skipped' } }))
    go('matches')
  }
  const undo = () => set((p) => {
    const { [job.id]: _undone, ...rest } = p.jobStatus
    return { jobStatus: rest, apps: p.apps.filter((a) => a.jobId !== job.id) }
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(docText(docEl))
      toast(doc === 'resume' ? 'Resume copied' : 'Cover letter copied')
    } catch {
      toast('Couldn’t copy — select the text instead')
    }
  }
  const desc = more || job.desc.length <= 600 ? job.desc : job.desc.slice(0, 600) + '…'

  return (
    <div className="screen" style={{ padding: '6px 20px 24px', gap: 18 }}>
      <button className="back" onClick={() => go('matches')}>← Matches</button>
      <div>
        <div className="eyebrow" style={{ letterSpacing: '.06em' }}>{job.source.toUpperCase()} · {(job.posted ? fmtDate(job.posted) : '').toUpperCase()}</div>
        <div className="h1" style={{ fontSize: 28, marginTop: 6 }}>{job.title}</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{job.company}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{[job.type, job.loc, job.mode === 'Remote' ? '' : job.mode, job.salary].filter(Boolean).join(' · ')}</div>
        <a className="link" href={job.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>View original posting ↗</a>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="pretty" style={{ fontSize: 13.5, whiteSpace: 'pre-line' }}>{desc}</div>
        {job.desc.length > 600 && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(!more)}>{more ? 'Show less ▴' : 'Read full description ▾'}</button>}
        <div className="small muted">Wants {job.level}{job.yrs && ` · ${job.yrs} yrs`}</div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="section-head"><div style={{ fontSize: 14, fontWeight: 600 }}>Why it matched</div><div className="serif" style={{ fontSize: 22 }}>{job.match}%</div></div>
        {job.matched.length > 0
          ? <div className="wrap" style={{ gap: 6 }}>{job.matched.map((h) => <div key={h} className="hit">{h}</div>)}</div>
          : <div className="small muted">None of your listed skills appear in this posting.</div>}
        {job.why.map((w) => <div key={w} className="small muted">{w}</div>)}
      </div>
      <div className="stack">
        <div className="row">
          <div style={{ fontSize: 14, fontWeight: 600 }}>Tailored for this job</div>
          <div className="seg sm" role="group">
            <button className={doc === 'resume' ? 'on' : ''} onClick={() => setDoc('resume')}>Resume</button>
            <button className={doc === 'cover' ? 'on' : ''} onClick={() => setDoc('cover')}>Cover letter</button>
          </div>
        </div>
        <div className="doc" ref={setDocEl}>
          {doc === 'resume' ? <TailoredResume job={job} /> : <CoverLetter job={job} company={job.company} />}
        </div>
        <div className="row">
          <div className="xs muted" style={{ lineHeight: 1.45 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--acc-hl)', borderRadius: 2, marginRight: 6, verticalAlign: -1 }} />
            Built from your profile. Nothing is invented.
          </div>
          <button className="chip" style={{ flexShrink: 0 }} onClick={copy}>Copy text</button>
        </div>
      </div>
      {job.status === 'new' && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn outline" style={{ flex: 1, padding: 15 }} onClick={skip}>Skip</button>
            <button className="btn acc" style={{ flex: 2, padding: 15 }} onClick={apply}>Apply on {job.source} ↗</button>
          </div>
          <div className="xs muted" style={{ textAlign: 'center', marginTop: -8 }}>Opens the posting so you can submit; we log it in Applications.</div>
        </>
      )}
      {job.status === 'applied' && <div className="banner green">Applied · <button className="u" style={{ fontSize: 14 }} onClick={() => go('apps')}>see Applications</button> · <button className="u" style={{ fontSize: 14 }} onClick={undo}>Undo</button></div>}
      {job.status === 'skipped' && <div className="banner neutral">Skipped · <button className="u" style={{ fontSize: 14 }} onClick={undo}>Undo</button></div>}
    </div>
  )
}
