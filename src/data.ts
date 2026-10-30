// Demo data. Mirrors the Claude Design prototype until a real backend (resume parsing,
// Apify scrapers, application submission) is wired in.

export type JobStatus = 'pending' | 'applied' | 'queued' | 'skipped'
export type AppStatus = 'Sent' | 'Viewed' | 'Interview' | 'Rejected'

export interface Job {
  id: number
  title: string
  company: string
  loc: string
  mode: 'On-site' | 'Remote'
  source: string
  type: string
  match: number
  salary: string
  posted: string
  status: JobStatus
  appliedOn?: string
  yrs: string
  level: string
  req: string
  desc: string
  hits: string[]
  headline: string
  summary: string
  bullet: string
  skillsLine: string
  coverHook: string
}

export interface Application {
  id: string
  company: string
  role: string
  date: string
  dateShort: string
  source: string
  status: AppStatus
  key: string
  file: string
  level: string
  yrs: string
  req: string
  desc: string
}

export const CITIES = ['Ottawa, ON', 'Gatineau, QC', 'Kanata, ON', 'Toronto, ON', 'Montréal, QC', 'Kingston, ON', 'Vancouver, BC', 'Calgary, AB', 'Halifax, NS', 'Waterloo, ON']
export const PROVINCES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU']
export const JOB_TYPES = ['Regular paid', 'Contract', 'Freelance', 'Co-op', 'Internship', 'Volunteer']
export const LEVELS = ['Junior', 'Intermediate', 'Expert']

export const PROFILE = {
  name: 'Jordan Avery',
  title: 'Product Designer',
  city: 'Ottawa, ON',
  email: 'jordan.avery@mail.com',
  years: 7.2,
  level: 'Expert',
  roles: [
    { title: 'Senior Product Designer', org: 'Ledgerline', dates: '2022–NOW' },
    { title: 'Product Designer', org: 'Civic Digital', dates: '2019–22' },
    { title: 'UX Designer', org: 'Northlight Studio', dates: '2017–19' },
  ],
  skills: ['Product design', 'Design systems', 'Figma', 'User research', 'Accessibility', 'WCAG 2.1', 'Prototyping', 'Service design', 'B2B SaaS', 'Journey mapping', 'Design tokens', 'Fintech UX', 'Workshop facilitation', 'HTML/CSS', 'French (B2)'],
}

type JobSeed = Omit<Job, 'type'> & { type?: string }

const JOB_SEEDS: JobSeed[] = [
  { id: 1, desc: "Own end-to-end design for Shopwell's merchant dashboard, partnering with PMs and engineers to evolve the shared design system.", level: 'Expert', req: 'Design systems, Figma, B2B SaaS', title: 'Senior Product Designer', company: 'Shopwell', loc: 'Ottawa, ON', mode: 'On-site', source: 'LinkedIn', match: 94, salary: '$118–135k', posted: '2h ago', status: 'pending', yrs: '5+', hits: ['Design systems', 'B2B SaaS', 'Figma', 'Accessibility'], headline: 'Senior Product Designer', summary: 'Focused on commerce tooling and scalable design systems for merchant teams.', bullet: 'Led a 140-component design system adopted by 9 product squads', skillsLine: 'Design systems, Commerce UX, Figma', coverHook: 'Shopwell’s push to unify its merchant tools maps directly to the design system work I’ve led for three years.' },
  { id: 2, desc: 'Design patient and clinician workflows for a virtual-care platform, from research through hand-off, with a strong accessibility bar.', level: 'Intermediate', req: 'User research, Accessibility, Prototyping', title: 'Product Designer II', company: 'Northvale Health', loc: 'Remote · Canada', mode: 'Remote', source: 'Indeed', match: 89, salary: '$98–112k', posted: '5h ago', status: 'pending', yrs: '3–6', hits: ['Healthcare', 'Research', 'Accessibility'], headline: 'Product Designer', summary: 'Experienced in regulated, accessibility-first products for clinicians and patients.', bullet: 'Ran 60+ usability sessions to redesign a high-stakes approval workflow', skillsLine: 'User research, WCAG 2.1, Service design', coverHook: 'Designing for clinicians demands the same rigor I brought to accessible government services.' },
  { id: 3, desc: 'Redesign federal benefit journeys with policy and IT teams; lead discovery, journey mapping and usability testing in both official languages.', level: 'Intermediate', req: 'Service design, Bilingual (EN/FR), WCAG 2.1', title: 'Service Designer', company: 'Gov. of Canada — ESDC', loc: 'Ottawa, ON', mode: 'On-site', source: 'Job Bank', match: 91, salary: '$95–108k', posted: 'Yesterday', status: 'applied', appliedOn: 'Oct 30', yrs: '4+', hits: ['Public sector', 'Service design', 'Bilingual'], headline: 'Service Designer', summary: 'Three years designing bilingual, WCAG-compliant federal services end to end.', bullet: 'Mapped 14 benefit journeys and cut call-centre volume 18%', skillsLine: 'Service design, Journey mapping, WCAG 2.1', coverHook: 'My work on federal benefit journeys gives me direct context for ESDC’s modernization goals.' },
  { id: 4, desc: "Maintain and extend Fieldnote's token-based design system, write documentation and support product teams adopting components.", level: 'Expert', req: 'Design tokens, Documentation, Figma', title: 'Design Systems Designer', company: 'Fieldnote', loc: 'Remote · ON, QC', mode: 'Remote', source: 'Glassdoor', match: 86, salary: '$105–120k', posted: '1d ago', status: 'applied', appliedOn: 'Oct 30', yrs: '5+', hits: ['Design systems', 'Tokens', 'Docs'], headline: 'Product Designer, Design Systems', summary: 'Builds and documents token-based systems that engineering teams actually adopt.', bullet: 'Shipped token pipeline syncing Figma to 3 codebases', skillsLine: 'Design tokens, Documentation, Figma', coverHook: 'I’ve spent the last three years turning a scattered UI into a token-driven system — Fieldnote’s exact brief.' },
  { id: 5, desc: 'Lead a team of 4 designers across enterprise products, set research cadence and raise design quality across releases.', level: 'Expert', req: 'Design leadership, Enterprise UX, Mentoring', title: 'UX Lead', company: 'Kanata Systems', loc: 'Kanata, ON', mode: 'On-site', source: 'Career page', match: 82, salary: '$125–140k', posted: '1d ago', status: 'queued', yrs: '7+', hits: ['Leadership', 'Enterprise', 'Research'], headline: 'Senior Product Designer', summary: 'Mentors designers and leads research programs across enterprise products.', bullet: 'Mentored 4 designers and set up the team’s research cadence', skillsLine: 'Design leadership, Enterprise UX, Research ops', coverHook: 'I’m ready to step into a lead role, and Kanata Systems’ enterprise focus fits where I’ve grown.' },
  { id: 7, desc: 'Four-month co-op supporting UX research and prototyping for network-configuration tools used by field engineers.', level: 'Junior', req: 'Figma, Prototyping, Enrolled student', title: 'UX Design Co-op (Winter 2027)', company: 'Ciena', loc: 'Ottawa, ON', mode: 'On-site', source: 'Company career pages', type: 'Co-op', match: 80, salary: '$28/hr', posted: '3h ago', status: 'pending', yrs: '0–2', hits: ['Prototyping', 'Research', 'Figma'], headline: 'UX Designer', summary: 'Hands-on prototyping and research across hardware and software teams.', bullet: 'Prototyped 12 network-config flows tested with field engineers', skillsLine: 'Prototyping, User research, Figma', coverHook: 'A co-op term at Ciena would let me apply my research practice to complex networking tools.' },
  { id: 8, desc: 'Advise staff a few hours a week on improving the online donation and volunteer sign-up experience.', level: 'Junior', req: 'Accessibility, Any UX background', title: 'Volunteer UX Advisor', company: 'Ottawa Food Bank', loc: 'Remote · Canada', mode: 'Remote', source: 'Indeed', type: 'Volunteer', match: 77, salary: 'Unpaid · 4 hrs/wk', posted: '1d ago', status: 'queued', yrs: 'Any', hits: ['Non-profit', 'Accessibility'], headline: 'Product Designer', summary: 'Volunteers design time to make community services easier to reach.', bullet: 'Audited a donation flow for accessibility and fixed 22 issues', skillsLine: 'Accessibility, Service design, Workshops', coverHook: 'I’d like to give back by making the Food Bank’s volunteer and donor journeys simpler.' },
  { id: 9, desc: 'Summer internship designing civic-tech features for municipal clients, mentored by a senior designer.', level: 'Junior', req: 'Figma, Portfolio, Interest in public sector', title: 'Product Design Intern', company: 'Lumen Civic', loc: 'Toronto, ON', mode: 'Remote', source: 'LinkedIn', type: 'Internship', match: 72, salary: '$24/hr', posted: '2d ago', status: 'queued', yrs: '0–1', hits: ['Public sector', 'Figma'], headline: 'Product Designer', summary: 'Public-sector design experience applied to civic technology.', bullet: 'Designed 40+ WCAG 2.1 AA services for 3 ministries', skillsLine: 'Service design, Figma, Research', coverHook: 'Lumen Civic’s mission matches the public-service work I care most about.' },
  { id: 10, desc: 'Six-month contract to audit and redesign a provincial licensing portal; reports to the digital services lead.', level: 'Expert', req: 'Service design, WCAG 2.1, Government experience', title: 'UX Contractor (6 months)', company: 'Ontario Digital Service', loc: 'Remote · ON', mode: 'Remote', source: 'LinkedIn', type: 'Contract', match: 85, salary: '$85–95/hr', posted: '6h ago', status: 'pending', yrs: '5+', hits: ['Public sector', 'Accessibility', 'Service design'], headline: 'Senior Product Designer', summary: 'Contract-ready designer with deep public-sector and accessibility experience.', bullet: 'Designed 40+ WCAG 2.1 AA services for 3 ministries', skillsLine: 'Service design, WCAG 2.1, Research', coverHook: 'I can start immediately and bring direct experience redesigning government services.' },
  { id: 11, desc: 'Freelance project to design a mobile booking flow and component kit for a local fitness studio chain.', level: 'Intermediate', req: 'Mobile UX, Figma, Portfolio', title: 'Freelance Product Designer', company: 'Pulse Studios', loc: 'Remote · Canada', mode: 'Remote', source: 'Indeed', type: 'Freelance', match: 76, salary: '$6–8k fixed', posted: '1d ago', status: 'queued', yrs: '3+', hits: ['Mobile UX', 'Figma'], headline: 'Product Designer', summary: 'Independent designer who ships polished mobile flows on tight timelines.', bullet: 'Cut onboarding drop-off 31% with a redesigned setup flow', skillsLine: 'Mobile UX, Figma, Prototyping', coverHook: 'I’d love to help Pulse Studios turn bookings into a two-tap experience.' },
  { id: 6, desc: 'Simplify complex money-movement and reconciliation flows for business customers on a growing fintech platform.', level: 'Expert', req: 'Fintech UX, Data-heavy UI, Figma', title: 'Senior UX Designer', company: 'Maplefin', loc: 'Remote · Canada', mode: 'Remote', source: 'Workopolis', match: 79, salary: '$110–125k', posted: '2d ago', status: 'queued', yrs: '5+', hits: ['Fintech', 'Figma'], headline: 'Senior Product Designer', summary: 'Fintech experience simplifying complex money workflows for business users.', bullet: 'Redesigned reconciliation flow used by 12,000 finance teams', skillsLine: 'Fintech UX, Data-heavy UI, Figma', coverHook: 'Simplifying complex money workflows is what I’ve done at Ledgerline for three years.' },
]

export const JOBS: Job[] = JOB_SEEDS.map((j) => ({ ...j, type: j.type ?? 'Regular paid' }))

export const APPS: Application[] = [
  { id: 'a1', desc: 'Redesign federal benefit journeys with policy and IT teams; lead discovery, journey mapping and usability testing in both official languages.', level: 'Intermediate', yrs: '4+', req: 'Service design, Bilingual (EN/FR), WCAG 2.1', company: 'Gov. of Canada — ESDC', role: 'Service Designer', date: 'Oct 30, 2026 · 7:04', dateShort: 'OCT 30', source: 'Job Bank', status: 'Sent', key: 'jobbank-44120871', file: 'Avery_Resume_ESDC_ServiceDesigner.pdf' },
  { id: 'a2', desc: "Maintain and extend Fieldnote's token-based design system, write documentation and support product teams adopting components.", level: 'Expert', yrs: '5+', req: 'Design tokens, Documentation, Figma', company: 'Fieldnote', role: 'Design Systems Designer', date: 'Oct 30, 2026 · 7:05', dateShort: 'OCT 30', source: 'Glassdoor', status: 'Sent', key: 'gd-JV_IC2296722', file: 'Avery_Resume_Fieldnote_DesignSystems.pdf' },
  { id: 'a3', desc: 'Design new onboarding and analytics features for a lab-automation SaaS product.', level: 'Intermediate', yrs: '3–5', req: 'Figma, B2B SaaS, Research', company: 'Ridgeway Labs', role: 'Product Designer', date: 'Oct 28, 2026 · 7:02', dateShort: 'OCT 28', source: 'LinkedIn', status: 'Viewed', key: 'li-3982211045', file: 'Avery_Resume_Ridgeway_ProductDesigner.pdf' },
  { id: 'a4', desc: 'Lead UX for rider-facing trip planning and fare payment across web and mobile.', level: 'Expert', yrs: '6+', req: 'Mobile UX, Accessibility, Research', company: 'Capital Transit Co.', role: 'Senior UX Designer', date: 'Oct 24, 2026 · 7:01', dateShort: 'OCT 24', source: 'Indeed', status: 'Interview', key: 'in-8f2a91c0e4', file: 'Avery_Resume_CapitalTransit_SrUX.pdf' },
  { id: 'a5', desc: 'Design learning tools for K–12 teachers, working closely with curriculum specialists.', level: 'Intermediate', yrs: '3+', req: 'EdTech, Prototyping, Research', company: 'Brightpath Learning', role: 'Product Designer', date: 'Oct 21, 2026 · 7:03', dateShort: 'OCT 21', source: 'Workopolis', status: 'Rejected', key: 'wp-551203', file: 'Avery_Resume_Brightpath_ProductDesigner.pdf' },
  { id: 'a6', desc: 'Design clinical-research data tools used by investigators and study coordinators.', level: 'Intermediate', yrs: '3+', req: 'Healthcare, Data-heavy UI, Accessibility', company: 'Ottawa Hospital Research', role: 'UX Designer', date: 'Oct 17, 2026 · 7:00', dateShort: 'OCT 17', source: 'Career page', status: 'Viewed', key: 'cp-ohri-2026-118', file: 'Avery_Resume_OHRI_UX.pdf' },
]

export const APP_STATUS_COLORS: Record<AppStatus, [string, string]> = {
  Sent: ['var(--line-2)', 'var(--ink)'],
  Viewed: ['oklch(0.94 0.04 80)', 'oklch(0.42 0.1 80)'],
  Interview: ['var(--green-bg)', 'var(--green-fg)'],
  Rejected: ['#F1ECE4', 'var(--faint)'],
}

export const JOB_STATUS: Record<JobStatus, [string, string, string]> = {
  pending: ['Needs approval', 'oklch(0.94 0.05 45)', 'oklch(0.45 0.13 45)'],
  applied: ['Applied', 'var(--green-bg)', 'var(--green-fg)'],
  queued: ['Queued', 'var(--line-2)', 'var(--muted)'],
  skipped: ['Skipped', '#F1ECE4', 'var(--faint)'],
}
