import { useCallback, useEffect, useRef, useState } from 'react'
import { PAID_SOURCES, SOURCE_NAMES } from './data'
import type { Job } from './data'
import { searchesFor } from './match'
import type { PlannedSearch } from './match'
import { nextRunDate } from './store'
import type { Patch, Settings } from './store'

export interface SearchState {
  running: boolean
  progress: string
  error: string
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/** The free sources: public job APIs read in one call by /api/boards. */
async function freeSearch(s: Settings, searches: PlannedSearch[], sources: string[], failed: string[]): Promise<Job[]> {
  const res = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searches, sources, employers: s.employers ?? [], days: s.postedWithin ?? 7 }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.jobs) throw new Error(data.message ?? 'The free job sources aren’t available right now.')
  failed.push(...(data.failed ?? []))
  return data.jobs
}

/** The paid sources: Apify scrapers started by /api/jobs, then polled until every run has finished. */
async function apifySearch(s: Settings, searches: PlannedSearch[], sources: string[], failed: string[], progress: (text: string) => void): Promise<Job[]> {
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
  failed.push(...first.failed)
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
    progress(`Searching ${sources.length} paid sites… ${done} of ${first.total} searches done`)
  }
  if (!data.jobs || queued.length) throw new Error('The search is taking too long. Try again in a few minutes.')
  failed.push(...(data.failed ?? []))
  return data.jobs
}

/** One list from every source: the same posting often appears on several, so keep the first copy. */
function merge(...lists: Job[][]): Job[] {
  const seen = new Set<string>()
  return lists.flat().filter((j) => {
    // Company names differ between sites ("Barracuda" vs "Barracuda Networks"), so compare the first word.
    const key = `${j.company.toLowerCase().match(/[a-z0-9]+/)?.[0]}|${j.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (seen.has(j.id) || seen.has(key)) return false
    seen.add(j.id); seen.add(key)
    return true
  })
}

/** Runs job searches through /api/boards and /api/jobs, and runs one automatically when the schedule says it's due. */
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
      if (!sources.length) throw new Error('Turn on at least one source in Settings → Job sources.')
      const paid = sources.filter((k) => PAID_SOURCES.includes(k))
      const free = sources.filter((k) => !PAID_SOURCES.includes(k))
      const searches = searchesFor(s.profile, s)
      const failed: string[] = []
      // Both kinds run at once; if one fails, the other's results are still kept.
      const freeJobs = free.length ? freeSearch(s, searches, free, failed) : Promise.resolve([])
      if (!paid.length) setState((x) => ({ ...x, progress: `Searching ${free.length} free sources…` }))
      const paidJobs = paid.length ? apifySearch(s, searches, paid, failed, (progress) => setState((x) => ({ ...x, progress }))) : Promise.resolve([])
      const [f, p] = await Promise.allSettled([freeJobs, paidJobs])
      if (f.status === 'rejected' && p.status === 'rejected') throw p.reason
      if (f.status === 'rejected') failed.push(`Free sources: ${errorText(f.reason, 'failed')}`)
      if (p.status === 'rejected') failed.push(`Apify sources: ${errorText(p.reason, 'failed')}`)
      const got = (r: PromiseSettledResult<Job[]>) => (r.status === 'fulfilled' ? r.value : [])
      // Employers' own boards first, so a posting found there keeps the employer's direct link.
      const direct = got(f).filter((j) => j.source === 'Employers')
      const found = merge(direct, got(p), got(f).filter((j) => j.source !== 'Employers'))
      set((prev) => {
        // Keep postings the user acted on; replace everything else with the fresh results.
        const keep = prev.jobs.filter((j) => prev.jobStatus[j.id] && !found.some((x) => x.id === j.id))
        return { jobs: [...found, ...keep], lastRun: { at: new Date().toISOString(), found: found.length, failed } }
      })
      setState({ running: false, progress: '', error: '' })
    } catch (e) {
      setState({ running: false, progress: '', error: errorText(e, 'Job search failed.') })
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
