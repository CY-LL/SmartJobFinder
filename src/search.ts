import { useCallback, useEffect, useRef, useState } from 'react'
import { SOURCE_NAMES } from './data'
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
      // A source missing from saved settings (added in a later version) counts as on.
      const sources = SOURCE_NAMES.filter((k) => s.conn[k] !== false)
      const searches = searchesFor(s.profile, s)
      // The Apify account runs only a few scrapers at once, so the server starts what fits and hands back
      // the rest as `queued`; those are started here as earlier runs finish.
      const start = async (tasks?: unknown[]) => {
        const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searches, sources, tasks, days: s.postedWithin ?? 7 }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.runs) throw new Error(data.message ?? 'Job search isn’t available right now.')
        return data as { runs: { id: string; source: string }[]; queued: unknown[]; failed: string[]; total: number }
      }
      const first = await start()
      const runs = [...first.runs]
      let queued = first.queued
      const failed = [...first.failed]
      const total = first.total
      let data: { jobs?: Job[]; failed?: string[]; done?: number; message?: string } = {}
      let lastDone = 0
      for (let tries = 0; tries < 120; tries++) {
        await wait(4000)
        const res = await fetch(`/api/jobs?runs=${encodeURIComponent(runs.map((r) => `${r.id}:${r.source}`).join(','))}`)
        data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.message ?? 'Job search failed.')
        const done = data.jobs ? runs.length : data.done ?? 0
        if (queued.length && (done > lastDone || data.jobs)) {
          const more = await start(queued)
          runs.push(...more.runs)
          failed.push(...more.failed)
          queued = more.queued
          lastDone = done
          continue
        }
        if (data.jobs && !queued.length) break
        setState((x) => ({ ...x, progress: `Searching ${sources.length} job sites… ${done} of ${total} searches done` }))
      }
      if (!data.jobs || queued.length) throw new Error('The search is taking too long. Try again in a few minutes.')
      const found = data.jobs
      set((prev) => {
        // Keep postings the user acted on; replace everything else with the fresh results.
        const keep = prev.jobs.filter((j) => prev.jobStatus[j.id] && !found.some((f) => f.id === j.id))
        return { jobs: [...found, ...keep], lastRun: { at: new Date().toISOString(), found: found.length, failed: [...failed, ...(data.failed ?? [])] } }
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
