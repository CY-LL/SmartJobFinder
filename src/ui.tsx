import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { JOBS } from './data'
import type { Job } from './data'
import type { Settings, Patch } from './store'

export interface Ctx {
  s: Settings
  set: (p: Patch) => void
  go: (path: string) => void
  toast: (msg: string) => void
  reset: () => void
}

export const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

export function useJobs(): Job[] {
  const { s } = useApp()
  return JOBS.map((j) => ({ ...j, status: s.jobStatus[j.id] ?? j.status }))
}

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

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
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
