// Shared Apify helpers for the Netlify functions.

export type Json = Record<string, unknown>
export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const json = (body: unknown, status = 200) => Response.json(body, { status })

export const notConfigured = () => json({ error: 'not_configured', message: 'Job sources are not set up on this site yet (APIFY_TOKEN is missing).' }, 501)

/** Calls the Apify API. Returns { data } on success or { fail } with a ready-made error response. */
export async function apify(path: string, token: string, init?: RequestInit): Promise<{ data?: unknown; fail?: Response }> {
  const res = await fetch(`https://api.apify.com/v2/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  if (res.ok) return { data: (await res.json()) as unknown }
  const detail = ((await res.json().catch(() => ({}))) as { error?: { type?: string; message?: string } }).error
  console.error('Apify error', path.split('?')[0], res.status, detail?.type, detail?.message)
  return { fail: json({ error: 'lookup_failed', message: detail?.message ? `Apify: ${detail.message}` : `Apify returned ${res.status}.` }, 502) }
}

export async function startRun(actor: string, input: Json, token: string) {
  const r = await apify(`acts/${encodeURIComponent(actor)}/runs?timeout=180`, token, { method: 'POST', body: JSON.stringify(input) })
  return r.fail ? { fail: r.fail } : { id: (r.data as { data: { id: string } }).data.id }
}

export type RunState = { state: 'running' } | { state: 'done'; items: Json[] } | { state: 'failed'; message: string }

export async function checkRun(runId: string, token: string, limit = 200): Promise<RunState> {
  const run = await apify(`actor-runs/${runId}`, token)
  if (run.fail) return { state: 'failed', message: 'Could not check the search.' }
  const { status, defaultDatasetId } = (run.data as { data: { status: string; defaultDatasetId: string } }).data
  if (status === 'READY' || status === 'RUNNING') return { state: 'running' }
  // A run that hit its time limit still has the results it collected so far.
  if (status !== 'SUCCEEDED' && status !== 'TIMED-OUT') return { state: 'failed', message: `Search ${status.toLowerCase()}.` }
  const items = await apify(`datasets/${defaultDatasetId}/items?clean=true&limit=${limit}`, token)
  if (items.fail || !Array.isArray(items.data)) return { state: 'failed', message: 'Could not read search results.' }
  return { state: 'done', items: items.data as Json[] }
}
