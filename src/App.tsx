import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoute, useSettings } from './store'
import { AppCtx, useApp, useJobs } from './ui'
import type { Ctx } from './ui'
import { ONB, OnboardingHeader, Prefs, Review, Schedule, Upload } from './screens/Onboarding'
import { JobDetail, Matches } from './screens/Matches'
import { AppDetail, Applications } from './screens/Applications'
import { EmailPreview, Settings } from './screens/Settings'

const TABS = [['matches', 'Matches'], ['apps', 'Applications'], ['settings', 'Settings']] as const

function Nav({ active }: { active: string }) {
  const jobs = useJobs()
  const { s, go } = useApp()
  const pending = jobs.filter((j) => j.status === 'pending' && s.types.includes(j.type)).length
  const items = TABS.map(([k, label]) => ({ k, label, on: active === k, badge: k === 'matches' ? pending : 0 }))
  return (
    <>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">SmartJobFinder</div>
        <div className="tag">Tailored applications, sent while you sleep.</div>
        {items.map((t) => (
          <button key={t.k} className={`side-item ${t.on ? 'on' : ''}`} aria-current={t.on ? 'page' : undefined} onClick={() => go(t.k)}>
            <span>{t.label}</span>
            {t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </nav>
      <nav className="tabbar" aria-label="Main">
        {items.map((t) => (
          <button key={t.k} className={`tab ${t.on ? 'on' : ''}`} aria-current={t.on ? 'page' : undefined} onClick={() => go(t.k)}>
            <div className="bar" />
            <div>{t.label}</div>
            {t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  const [s, set, reset] = useSettings()
  const [parts, go] = useRoute()
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(0)
  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 2600)
  }, [])

  const ctx: Ctx = { s, set, go, toast, reset }

  const [screen, param] = parts
  const onbIdx = ONB.indexOf(screen as (typeof ONB)[number])
  const known = ['matches', 'job', 'apps', 'settings', 'email']
  // Not set up yet: everything outside onboarding redirects to its first step.
  const fallback = s.onboarded ? 'matches' : 'upload'
  const valid = onbIdx >= 0 || (s.onboarded && known.includes(screen))
  useEffect(() => {
    if (!valid) window.location.replace('#/' + fallback)
  }, [valid, fallback])
  if (!valid) return null

  const active = screen === 'job' || screen === 'email' ? (screen === 'job' ? 'matches' : 'settings') : screen

  let body
  switch (screen) {
    case 'upload': body = <Upload />; break
    case 'review': body = <Review />; break
    case 'prefs': body = <Prefs />; break
    case 'schedule': body = <Schedule />; break
    case 'matches': body = <Matches />; break
    case 'job': body = <JobDetail id={Number(param)} />; break
    case 'apps': body = param ? <AppDetail id={param} /> : <Applications />; break
    case 'settings': body = <Settings />; break
    case 'email': body = <EmailPreview />; break
  }

  const onboarding = onbIdx >= 0
  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        {!onboarding && <Nav active={active} />}
        <main className="main">
          <div className={`content ${onboarding ? 'onb' : ''}`}>
            {onboarding && <OnboardingHeader step={onbIdx} />}
            {body}
          </div>
        </main>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  )
}
