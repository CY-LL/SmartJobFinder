import { useCallback, useEffect, useRef, useState } from 'react'
import type { Job } from './data'
import { searchesFor } from './match'
import { nextRunDate } from './store'
import type { Patch, Settings } from './store'

export interface SearchState {
  running: boolean
  progress: string
  error: string
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Runs job searches through /api/jobs, and runs one automatically when the schedule says it's due. */
export function useSearch(s: Settings, set: (p: Patch) => void) {
  const [state, setState] = useState<SearchState>({ running: false, progress: '', error: '' })
  const busy = useRef(false)

  const run = useCallback(async () => {
    if (busy.current || !s.profile) return
    busy.current = true
    setState({ running: true, progress: 'Starting search…', error: '' })
    try {
      const sources = Object.entries(s.conn).filter(([, on]) => on).map(([k]) => k)
      let res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searches: searchesFor(s.profile, s), sources }) })
      let data = await res.json().catch(() => ({}))
      if (!res.ok || !data.runs) throw new Error(data.message ?? 'Job search isn’t available right now.')
      const runs = data.runs.map((r: { id: string; source: string }) => `${r.id}:${r.source}`).join(',')
      for (let tries = 0; tries < 80; tries++) {
        await wait(4000)
        res = await fetch(`/api/jobs?runs=${encodeURIComponent(runs)}`)
        data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.message ?? 'Job search failed.')
        if (data.jobs) break
        setState((x) => ({ ...x, progress: `Searching ${sources.join(' and ')}… ${data.done ?? 0} of ${data.total ?? '?'} searches done` }))
      }
      if (!data.jobs) throw new Error('The search is taking too long. Try again in a few minutes.')
      const found = data.jobs as Job[]
      set((prev) => {
        // Keep postings the user acted on; replace everything else with the fresh results.
        const keep = prev.jobs.filter((j) => prev.jobStatus[j.id] && !found.some((f) => f.id === j.id))
        return { jobs: [...found, ...keep], lastRun: { at: new Date().toISOString(), found: found.length, failed: data.failed ?? [] } }
      })
      setState({ running: false, progress: '', error: '' })
    } catch (e) {
      setState({ running: false, progress: '', error: e instanceof Error ? e.message : 'Job search failed.' })
    } finally {
      busy.current = false
    }
  }, [s, set])

  // Scheduled search: there's no server-side scheduler, so a due search runs when the app is open.
  const due = s.onboarded && !!s.profile && nextRunDate(s).getTime() <= Date.now()
  useEffect(() => {
    if (due && !busy.current && !state.error) void run()
  }, [due, run, state.error])

  return { ...state, run }
}
