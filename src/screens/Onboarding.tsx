import { useRef, useState } from 'react'
import { CITIES, JOB_TYPES, LEVELS, PROVINCES } from '../data'
import { fmtSalary, toggleIn } from '../store'
import type { Settings } from '../store'
import { emptyProfile, levelFor, parseResume } from '../profile'
import type { Profile, Role } from '../profile'
import { extractText } from '../extract'
import { MAX_PDF_BYTES, fileToBase64, profileAsText, readWithClaude } from '../ai'
import { Seg, SectionHead, Stepper, Toggle, useApp, useProfile } from '../ui'

export const ONB = ['upload', 'review', 'prefs', 'schedule'] as const

export function OnboardingHeader({ step }: { step: number }) {
  const { s, go } = useApp()
  // Once set up, these screens are reached from Settings, so "back" returns there.
  const back = () => (s.onboarded ? go('settings') : go(ONB[Math.max(0, step - 1)]))
  return (
    <div className="onb-head">
      <button className="back-btn" aria-label="Back" onClick={back} style={{ visibility: s.onboarded || step > 0 ? 'visible' : 'hidden' }}>←</button>
      <div className="onb-steps">
        {ONB.map((k, i) => <div key={k} className={i <= step ? 'on' : ''} />)}
      </div>
      <div className="mono xs muted" style={{ width: 36, textAlign: 'right' }}>{step + 1}/4</div>
    </div>
  )
}

function NextButton({ next, label }: { next: string; label: string }) {
  const { s, go } = useApp()
  return <button className="btn" onClick={() => go(s.onboarded ? 'settings' : next)}>{s.onboarded ? 'Save' : label}</button>
}

// Seed search preferences from what the resume says.
function prefsFrom(p: Profile): Partial<Settings> {
  return {
    years: Math.max(1, Math.ceil(p.years)),
    levels: p.level === 'Expert' ? ['Intermediate', 'Expert'] : [p.level],
    ...(p.city ? { cities: [p.city] } : {}),
  }
}

type Panel = 'none' | 'linkedin' | 'website'

export function Upload() {
  const { s, set, go } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [panel, setPanel] = useState<Panel>('none')
  const [url, setUrl] = useState('')
  const [site, setSite] = useState('')
  const [fallback, setFallback] = useState(false)
  const useClaude = s.reader === 'claude'

  const applyProfile = (profile: Profile, fileName: string) => {
    set({ profile, fileName, upload: 'done', skillOff: [], ...prefsFrom(profile) })
  }
  const fail = (e: unknown, fallbackMsg: string) => setError(e instanceof Error ? e.message : fallbackMsg)

  const onFile = async (f?: File) => {
    if (input.current) input.current.value = ''
    if (!f) return
    setError('')
    setNote('')
    if (!/\.(pdf|docx)$/i.test(f.name)) return setError(/\.doc$/i.test(f.name) ? 'Older .doc files can’t be read. Save it as .docx or PDF first.' : 'Please choose a PDF or DOCX file.')
    if (f.size > 10 * 1024 * 1024) return setError('That file is over 10 MB.')
    try {
      if (useClaude) {
        setBusy(`Claude is reading ${f.name}…`)
        try {
          const isPdf = /\.pdf$/i.test(f.name)
          const file = isPdf && f.size <= MAX_PDF_BYTES ? { name: f.name, pdf: await fileToBase64(f) } : { name: f.name, text: await extractText(f) }
          const { profile } = await readWithClaude({ file })
          return applyProfile(profile, f.name)
        } catch (e) {
          // Claude unavailable: fall through to the built-in reader and say so.
          setNote(`${e instanceof Error ? e.message : 'Claude couldn’t read it.'} Read with the basic reader instead — check the next screen carefully.`)
        }
      }
      setBusy(`Reading ${f.name}…`)
      const profile = parseResume(await extractText(f))
      if (!profile.name && !profile.roles.length && !profile.skills.length) {
        throw new Error('We couldn’t find any text in that file. If it’s a scanned image, export a text-based PDF or DOCX instead.')
      }
      applyProfile({ ...profile, readBy: 'rules' }, f.name)
    } catch (e) {
      fail(e, 'Something went wrong reading that file.')
    } finally {
      setBusy('')
    }
  }

  const importWebsite = async () => {
    setError('')
    setNote('')
    const u = site.trim()
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(u)) return setError('Paste a link to your portfolio, personal site or online resume.')
    if (!useClaude) return setError('Reading websites needs the Claude reader. Turn it on in Settings → Resume reader.')
    setBusy('Claude is reading your site and any resume it links to…')
    try {
      const { profile, read } = await readWithClaude({ urls: [u] })
      applyProfile(profile, read[0] ? `Website · ${new URL(read[0]).host}` : `Website · ${u}`)
      if (read.length > 1) setNote(`Also read: ${read.slice(1).join(', ')}`)
    } catch (e) {
      fail(e, 'Couldn’t read that website.')
    } finally {
      setBusy('')
    }
  }

  const importLinkedIn = async () => {
    setError('')
    setNote('')
    setFallback(false)
    if (!/linkedin\.com\/in\/[\w%-]+/i.test(url)) return setError('Paste your profile link, e.g. linkedin.com/in/your-name.')
    setBusy('Looking up your LinkedIn profile… this can take up to a minute.')
    try {
      let res = await fetch('/api/linkedin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      let data = await res.json().catch(() => ({}))
      // The lookup runs in the background; check on it every few seconds for up to ~3 minutes.
      for (let tries = 0; res.ok && data.runId && !data.profile && tries < 60; tries++) {
        await new Promise((r) => setTimeout(r, 3000))
        res = await fetch(`/api/linkedin?run=${encodeURIComponent(data.runId)}`)
        const next = await res.json().catch(() => ({}))
        data = next.status === 'running' ? data : next
      }
      if (!res.ok || !data.profile) {
        setFallback(true)
        setError(data.message ?? (data.runId ? 'The LinkedIn lookup is taking too long. Try again in a minute.' : 'LinkedIn lookup isn’t available right now.'))
        return
      }
      const handle = decodeURIComponent(url.match(/linkedin\.com\/in\/([\w%-]+)/i)?.[1] ?? 'profile')
      const { links = [], details = '', ...li } = data.profile as Profile & { links?: string[]; details?: string }
      let profile: Profile = { ...emptyProfile(), ...li, linkedin: li.linkedin || url.trim(), readBy: 'rules' }

      // Follow the portfolio / resume links on the profile and merge what they say.
      if (links.length && useClaude) {
        setBusy(`Reading ${links.length === 1 ? 'the link' : `${links.length} links`} on the profile: ${links.map((l) => l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)).join(', ')}…`)
        try {
          const merged = await readWithClaude({ urls: links, context: { name: `LinkedIn profile ${profile.linkedin}`, text: profileAsText(profile, details) } })
          profile = { ...merged.profile, linkedin: profile.linkedin }
          const missed = merged.skipped.length ? ` Couldn’t open: ${merged.skipped.join(', ')}.` : ''
          setNote(`Combined LinkedIn with ${merged.read.join(', ')}.${missed}`)
        } catch (e) {
          setNote(`Imported LinkedIn only. ${e instanceof Error ? e.message : ''} Links on the profile: ${links.join(', ')}`)
        }
      } else if (links.length) {
        setNote(`This profile links to ${links.join(', ')}. Turn on the Claude reader in Settings to include them.`)
      }
      applyProfile(profile, `LinkedIn · ${handle}`)
    } catch {
      setFallback(true)
      setError('LinkedIn lookup isn’t available right now.')
    } finally {
      setBusy('')
    }
  }

  const p = s.profile
  const profileLink = /linkedin\.com\/in\//i.test(url) ? (url.startsWith('http') ? url : 'https://' + url.trim()) : 'https://www.linkedin.com/in/me/'
  const togglePanel = (x: Panel) => { setPanel(panel === x ? 'none' : x); setError('') }
  const fieldStyle = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: '#fff' }
  const smallBtn = { width: 'auto', padding: '10px 16px', fontSize: 14, borderRadius: 10 }

  return (
    <div className="screen" style={{ paddingTop: 28 }}>
      <div>
        <div className="eyebrow acc" style={{ marginBottom: 10 }}>SMARTJOBFINDER</div>
        <div className="display">Start with the resume you already have.</div>
        <div className="lede">We read it once, then write a tailored version for every job you apply to.</div>
      </div>
      <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {busy && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{busy}</div>
            <div className="spinner" />
          </div>
          <div className="progress"><div /></div>
        </div>
      )}

      {!busy && s.upload === 'idle' && (
        <>
          <button
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}
          >
            <div style={{ width: 44, height: 52, borderRadius: 6, border: '1.5px solid var(--ink)', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 8, right: 8, top: 14, height: 2, background: 'var(--ink)', boxShadow: '0 7px 0 var(--ink), 0 14px 0 var(--ink)' }} />
            </div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>Upload resume</div>
            <div className="small muted">PDF or DOCX · up to 10 MB</div>
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn soft" aria-expanded={panel === 'linkedin'} onClick={() => togglePanel('linkedin')}>LinkedIn</button>
            <button className="btn soft" aria-expanded={panel === 'website'} onClick={() => togglePanel('website')}>Website</button>
            <button className="btn soft" onClick={() => input.current?.click()}>Files</button>
          </div>

          {panel === 'linkedin' && (
            <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Your LinkedIn profile</div>
              <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); importLinkedIn() }}>
                <input className="text-input" style={fieldStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="linkedin.com/in/your-name" aria-label="LinkedIn profile URL" inputMode="url" autoFocus />
                <button className="btn" type="submit" style={smallBtn}>Import</button>
              </form>
              <div className="xs muted" style={{ lineHeight: 1.45 }}>
                We read your public profile once{useClaude ? ', plus any portfolio or resume it links to' : ''}. Import your own profile only.
              </div>
              {(fallback || !error) && (
                <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="small" style={{ fontWeight: 500 }}>{fallback ? 'Use your LinkedIn PDF instead' : 'Or upload LinkedIn’s PDF'}</div>
                  <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    <li><a href={profileLink} target="_blank" rel="noreferrer">Open your profile on LinkedIn</a></li>
                    <li>Click <b>Resources</b> (or <b>More</b>) → <b>Save to PDF</b></li>
                    <li>Upload the downloaded file here</li>
                  </ol>
                  <button className="btn soft" onClick={() => input.current?.click()}>Upload LinkedIn PDF</button>
                </div>
              )}
            </div>
          )}

          {panel === 'website' && (
            <div className="card" style={{ borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Portfolio or online resume</div>
              <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); importWebsite() }}>
                <input className="text-input" style={fieldStyle} value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourname.com or a resume link" aria-label="Website URL" inputMode="url" autoFocus />
                <button className="btn" type="submit" style={smallBtn}>Read</button>
              </form>
              <div className="xs muted" style={{ lineHeight: 1.45 }}>Works with personal sites and portfolios, PDF links, and shared Google Docs, Google Drive or Dropbox files. If the page links to a resume or CV, we read that too.</div>
            </div>
          )}
        </>
      )}

      {error && <div className="small" role="alert" style={{ color: 'oklch(0.5 0.15 25)' }}>{error}</div>}

      {!busy && s.upload === 'done' && (
        <>
          <div className="card" style={{ padding: 20, borderRadius: 18 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="file-ico">{s.fileName.startsWith('LinkedIn') ? 'IN' : s.fileName.startsWith('Website') ? 'WEB' : /\.docx$/i.test(s.fileName) ? 'DOC' : 'PDF'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellip" style={{ fontSize: 14.5, fontWeight: 500 }}>{s.fileName || 'Your profile'}</div>
                <div className="small" style={{ color: 'var(--green)' }}>
                  {p ? `${p.readBy === 'claude' ? 'Read by Claude' : 'Read'} · ${p.roles.length} ${p.roles.length === 1 ? 'role' : 'roles'} · ${p.skills.length} skills` : ''}
                </div>
              </div>
              <button className="u muted" onClick={() => { set({ upload: 'idle' }); setError(''); setNote('') }}>Replace</button>
            </div>
          </div>
          {note && <div className="xs muted" style={{ lineHeight: 1.45, overflowWrap: 'anywhere' }}>{note}</div>}
          <button className="btn" onClick={() => go('review')}>Review what we found</button>
        </>
      )}

      <div className="xs faint pretty">
        {useClaude
          ? 'Your resume is sent to Anthropic’s Claude API to be read. You can switch to the basic in-browser reader in Settings.'
          : 'Your resume is read in your browser with the basic reader and isn’t sent anywhere.'}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="li" style={{ padding: '8px 0' }}>
      <span className="muted" style={{ fontSize: 13, width: 72, flexShrink: 0 }}>{label}</span>
      <input className="text-input" style={{ padding: '2px 0', textAlign: 'right' }} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function Review() {
  const { s, set } = useApp()
  const p = useProfile()
  const [skill, setSkill] = useState('')
  const [role, setRole] = useState<Role>({ title: '', org: '', dates: '' })
  const edit = (patch: Partial<Profile>) => set({ profile: { ...p, ...patch } })
  const addSkill = () => {
    const k = skill.trim()
    if (k && !p.skills.some((x) => x.toLowerCase() === k.toLowerCase())) edit({ skills: [...p.skills, k] })
    setSkill('')
  }

  return (
    <div className="screen">
      <div>
        <div className="h1">Here's what we found.</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>Fix anything we got wrong. Tap a skill to exclude it from matching.</div>
      </div>
      <div className="list">
        <Field label="Name" value={p.name} placeholder="Your name" onChange={(v) => edit({ name: v })} />
        <Field label="Headline" value={p.title} placeholder="e.g. Product Designer" onChange={(v) => edit({ title: v })} />
        <Field label="Location" value={p.city} placeholder="City, Province" onChange={(v) => edit({ city: v })} />
        <Field label="Email" value={p.email} placeholder="you@example.com" onChange={(v) => edit({ email: v })} />
        <Field label="Website" value={p.website ?? ''} placeholder="Portfolio link" onChange={(v) => edit({ website: v })} />
        <div className="li" style={{ padding: '10px 0' }}>
          <div>
            <div className="serif" style={{ fontSize: 22 }}>{p.level}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>suggested level</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Stepper label="years of experience" width={44} value={p.years} onDown={() => { const y = Math.max(0, Math.round(p.years - 1)); edit({ years: y, level: levelFor(y) }) }} onUp={() => { const y = Math.round(p.years + 1); edit({ years: y, level: levelFor(y) }) }} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>years relevant</div>
          </div>
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>EXPERIENCE</div>
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {p.roles.length === 0 && <div className="small muted" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>We couldn't find any roles. Add them below.</div>}
          {p.roles.map((r, i) => (
            <div key={i} className="row" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 500 }}>{r.title}</div><div className="muted" style={{ fontSize: 13 }}>{r.org}</div></div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <div className="mono muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.dates}</div>
                <button className="circle-btn" aria-label={`Remove ${r.title}`} onClick={() => edit({ roles: p.roles.filter((_, k) => k !== i) })}>✕</button>
              </div>
            </div>
          ))}
          <form
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto', gap: 6, paddingTop: 10 }}
            onSubmit={(e) => { e.preventDefault(); if (role.title.trim()) { edit({ roles: [...p.roles, role] }); setRole({ title: '', org: '', dates: '' }) } }}
          >
            {(['title', 'org', 'dates'] as const).map((k) => (
              <input key={k} className="text-input" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '7px 8px', background: 'var(--card)', fontSize: 13 }} placeholder={{ title: 'Title', org: 'Company', dates: '2020–22' }[k]} aria-label={`New role ${k}`} value={role[k]} onChange={(e) => setRole({ ...role, [k]: e.target.value })} />
            ))}
            <button className="chip" type="submit">Add</button>
          </form>
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>SKILLS</div>
        <div className="wrap">
          {p.skills.map((k) => {
            const off = s.skillOff.includes(k)
            return <button key={k} className={`chip skill ${off ? 'struck' : ''}`} aria-pressed={!off} onClick={() => set({ skillOff: toggleIn(s.skillOff, k) })}>{k}</button>
          })}
          <form onSubmit={(e) => { e.preventDefault(); addSkill() }}>
            <input className="chip" style={{ width: 120, outline: 'none' }} placeholder="+ Add skill" aria-label="Add a skill" value={skill} onChange={(e) => setSkill(e.target.value)} onBlur={addSkill} />
          </form>
        </div>
      </div>
      <NextButton next="prefs" label="Looks right — continue" />
    </div>
  )
}

export function Prefs() {
  const { s, set } = useApp()
  const [q, setQ] = useState('')
  const qq = q.trim().toLowerCase()
  const suggest = qq ? CITIES.filter((c) => c.toLowerCase().includes(qq) && !s.cities.includes(c)).slice(0, 4) : []
  const custom = q.trim()
  const addCity = (c: string) => { set({ cities: [...s.cities, c] }); setQ('') }
  const step = 5
  const toAnnual = () => set({ salPer: 'Annual', salMin: 60 })
  const toHourly = () => set({ salPer: 'Hourly', salMin: 25 })

  return (
    <div className="screen" style={{ gap: 24 }}>
      <div className="h1">Where and what you'll take.</div>

      <div className="stack">
        <SectionHead title="On-site" hint="Cities you'd commute to" />
        <div className="card" style={{ borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.cities.length > 0 && (
            <div className="wrap" style={{ gap: 6 }}>
              {s.cities.map((c) => (
                <div key={c} className="city-chip">{c}<button aria-label={`Remove ${c}`} onClick={() => set({ cities: s.cities.filter((x) => x !== c) })}>✕</button></div>
              ))}
            </div>
          )}
          <input
            className="text-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom) addCity(suggest[0] ?? custom)
            }}
            placeholder="Add a city…"
            aria-label="Add a city"
          />
          {suggest.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column' }}>
              {suggest.map((c) => (
                <button key={c} className="row" style={{ padding: '10px 4px', fontSize: 14 }} onClick={() => addCity(c)}><span>{c}</span><span className="faint">+</span></button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Remote" hint="Where a remote employer can be" />
        <div className="card" style={{ borderRadius: 14, padding: '4px 14px' }}>
          <div className="row" style={{ padding: '12px 0', borderBottom: '1px solid var(--line-2)' }}>
            <span className="muted" style={{ fontSize: 14 }}>Country</span>
            <select className="select" defaultValue="Canada" aria-label="Country"><option>Canada</option></select>
          </div>
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Seg size="md" options={['all', 'some'] as const} value={s.scope} onChange={(v) => set({ scope: v })} labels={{ all: 'Anywhere in Canada', some: 'Specific provinces' }} />
            {s.scope === 'some' && (
              <div className="wrap" style={{ gap: 6 }}>
                {PROVINCES.map((p) => {
                  const on = s.provinces.includes(p)
                  return <button key={p} className={`prov ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ provinces: toggleIn(s.provinces, p) })}>{p}</button>
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Job type" hint="Pick any" />
        <div className="type-grid">
          {JOB_TYPES.map((t) => {
            const on = s.types.includes(t)
            return <button key={t} className={`type-opt ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ types: toggleIn(s.types, t) })}><span>{t}</span><span className="xs">{on ? '✓' : ''}</span></button>
          })}
        </div>
      </div>

      <div className="stack">
        <SectionHead title="Expertise level" hint="Pick any" />
        <Seg options={LEVELS} value={s.levels} onChange={(v) => set({ levels: toggleIn(s.levels, v) })} />
      </div>

      <div className="stack">
        <div className="row">
          <div style={{ fontSize: 15, fontWeight: 600 }}>Minimum salary</div>
          <Seg size="sm" options={['Annual', 'Hourly'] as const} value={s.salPer} onChange={(v) => (v === 'Hourly' ? toHourly() : toAnnual())} />
        </div>
        <div className="card" style={{ borderRadius: 14, padding: '4px 14px' }}>
          <div className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
            <span className="muted" style={{ fontSize: 14 }}>At least</span>
            <Stepper label="minimum salary" value={fmtSalary(s, s.salMin)} onDown={() => set({ salMin: Math.max(0, s.salMin - step) })} onUp={() => set({ salMin: s.salMin + step })} />
          </div>

          <div className="row" style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 13.5 }}>Include postings with no salary listed</div>
            <Toggle label="Include postings with no salary listed" on={s.salUnlisted} onChange={(v) => set({ salUnlisted: v })} />
          </div>
        </div>
        <div className="xs muted">Volunteer roles are exempt from the salary filter.</div>
      </div>

      <div className="card row" style={{ borderRadius: 14, padding: '12px 14px' }}>
        <div><div style={{ fontSize: 15, fontWeight: 600 }}>Years of experience</div><div className="xs muted" style={{ marginTop: 2 }}>Skip postings asking for more</div></div>
        <Stepper large label="years of experience" width={28} value={s.years} onDown={() => set({ years: Math.max(0, s.years - 1) })} onUp={() => set({ years: Math.min(30, s.years + 1) })} />
      </div>

      <NextButton next="schedule" label="Continue" />
    </div>
  )
}

export function Schedule() {
  const { s, set, go } = useApp()
  return (
    <div className="screen" style={{ gap: 24 }}>
      <div className="h1">When should we search?</div>
      <div className="stack">
        <div style={{ fontSize: 15, fontWeight: 600 }}>Frequency</div>
        <Seg options={['Daily', 'Weekdays', 'Weekly'] as const} value={s.freq} onChange={(v) => set({ freq: v })} />
        <div style={{ display: 'flex', gap: 8 }}>
          {['07:00', '12:00', '18:00', '22:00'].map((t) => (
            <button key={t} className={`time-opt ${s.time === t ? 'on' : ''}`} aria-pressed={s.time === t} onClick={() => set({ time: t })}>{t}</button>
          ))}
        </div>
        <div className="xs muted" style={{ lineHeight: 1.45 }}>A search runs when you open SmartJobFinder and one is due. You can also search any time from Matches.</div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: '4px 14px' }}>
        <div className="row" style={{ padding: '12px 0' }}>
          <div><div style={{ fontSize: 14, fontWeight: 500 }}>Never re-apply</div><div className="xs muted" style={{ lineHeight: 1.4 }}>Marks postings already in your Applications log, even if reposted on another site</div></div>
          <Toggle label="Never re-apply" on={s.noReapply} onChange={(v) => set({ noReapply: v })} />
        </div>
      </div>
      <div className="xs muted" style={{ lineHeight: 1.45 }}>For each match we prepare a tailored resume and cover letter from your profile. You submit on the employer's site, and we log it in Applications.</div>
      {s.onboarded
        ? <button className="btn" onClick={() => go('settings')}>Save</button>
        : <button className="btn acc" onClick={() => { set({ onboarded: true, lastRun: null }); go('matches') }}>Find my first matches</button>}
    </div>
  )
}