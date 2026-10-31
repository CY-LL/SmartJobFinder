import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Job, JobStatus } from './data'
import { emptyProfile } from './profile'
import type { Profile } from './profile'
import { MIN_SCORE, filteredOut, scoreJob } from './match'
import type { Scored } from './match'
import type { Settings, Patch } from './store'
import type { SearchState } from './search'

export interface Ctx {
  s: Settings
  set: (p: Patch) => void
  go: (path: string) => void
  toast: (msg: string) => void
  reset: () => void
  replace: (next: Settings) => void
  search: SearchState & { run: () => Promise<void> }
}

export const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

export function useProfile(): Profile {
  return useApp().s.profile ?? emptyProfile()
}

export type ScoredJob = Job & Scored & { status: JobStatus; hidden: string | null }

/** All found postings with their match score and status, best matches first. */
export function useJobs(): ScoredJob[] {
  const { s } = useApp()
  const p = useProfile()
  return useMemo(() => {
    const appliedTo = new Set(s.apps.map((a) => `${a.company}|${a.role}`.toLowerCase()))
    return s.jobs
      .map((j) => {
        const status: JobStatus = s.jobStatus[j.id] ?? (s.noReapply && appliedTo.has(`${j.company}|${j.title}`.toLowerCase()) ? 'applied' : 'new')
        return { ...j, ...scoreJob(j, p, s), status, hidden: s.conn[j.source] === false ? 'source' : filteredOut(j, s) }
      })
      .sort((a, b) => b.match - a.match)
  }, [s, p])
}

/** Jobs worth showing: pass the user's filters and clear a minimum match. */
export const MIN_MATCH = MIN_SCORE
export const visibleJobs = (jobs: ScoredJob[]) => jobs.filter((j) => !j.hidden && (j.match >= MIN_MATCH || j.status !== 'new'))

export function Seg<T extends string>({ options, value, onChange, size, labels }: {
  options: readonly T[]
  value: T | T[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  labels?: Partial<Record<T, string>>
}) {
  const isOn = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o)
  return (
    <div className={`seg ${size ?? ''}`} role="group">
      {options.map((o) => (
        <button key={o} type="button" className={isOn(o) ? 'on' : ''} aria-pressed={isOn(o)} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`toggle ${on ? 'on' : ''}`} style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined} onClick={() => onChange(!on)} />
}

export function Stepper({ value, onDown, onUp, width = 72, large, label }: {
  value: ReactNode
  onDown: () => void
  onUp: () => void
  width?: number
  large?: boolean
  label: string
}) {
  return (
    <div className={`stepper ${large ? 'lg' : ''}`}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={onDown}>−</button>
      <div className="v" style={{ minWidth: width, fontSize: large ? 26 : undefined }}>{value}</div>
      <button type="button" aria-label={`Increase ${label}`} onClick={onUp}>+</button>
    </div>
  )
}

export function Status({ colors, children }: { colors: [string, string] | [string, string, string]; children: ReactNode }) {
  const [bg, fg] = colors.length === 3 ? [colors[1], colors[2]] : colors
  return <span className="status" style={{ background: bg, color: fg }}>{children}</span>
}

export function SectionHead({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="section-head">
      <div className="t">{title}</div>
      {hint && <div className="xs muted">{hint}</div>}
    </div>
  )
}
