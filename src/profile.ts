// Candidate profile, built from an uploaded resume (parsed in the browser) or a LinkedIn import.

export interface Role {
  title: string
  org: string
  dates: string
  /** What they did there, word for word from the resume, portfolio or LinkedIn. */
  highlights?: string[]
}

export interface Profile {
  name: string
  title: string
  city: string
  email: string
  phone: string
  linkedin: string
  website?: string
  /** Their own summary: a resume Summary section, LinkedIn About, or a portfolio intro. */
  summary?: string
  roles: Role[]
  skills: string[]
  years: number
  level: 'Junior' | 'Intermediate' | 'Expert'
}

export const emptyProfile = (): Profile => ({ name: '', title: '', city: '', email: '', phone: '', linkedin: '', roles: [], skills: [], years: 0, level: 'Junior' })

export const levelFor = (years: number): Profile['level'] => (years >= 7 ? 'Expert' : years >= 3 ? 'Intermediate' : 'Junior')

export const firstName = (p: Profile) => p.name.split(/\s+/)[0] || 'there'
export const lastName = (p: Profile) => p.name.split(/\s+/).slice(-1)[0] || 'Candidate'

// ---------- Resume text parsing ----------

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december'
const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const DATE = `(?:(?:${MONTHS})\\.?\\s+|\\d{1,2}\\s*/\\s*)?(?:19|20)\\d{2}`
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now|today)`, 'i')
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i
const PROVINCES = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC'
const CITY_RE = new RegExp(`\\b([A-Z][A-Za-zÀ-ÿ.'-]+(?:[ -][A-Z][A-Za-zÀ-ÿ.'-]+){0,2}),\\s*(${PROVINCES}|Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|Canada|United States|USA|United Kingdom|UK)\\b`)

const TITLE_WORDS = /\b(designer|engineer|developer|manager|director|lead|head|analyst|specialist|consultant|intern|co-?op|coordinator|officer|assistant|associate|architect|scientist|administrator|advisor|adviser|strategist|researcher|writer|editor|accountant|technician|representative|supervisor|president|founder|owner|partner|teacher|instructor|nurse|programmer|planner|producer|vp|cto|ceo|cfo|principal|staff|senior|junior|sr\.?|jr\.?|tutor|receptionist|cashier|clerk|barista|server|illustrator|photographer|videographer|animator|artist|translator|mentor|trainer|ambassador|agent|operator|bookkeeper|copywriter|marketer|nurse|chef|cook)\b/i

const SECTIONS: [RegExp, string][] = [
  [/^(work |professional |relevant )?(experience|employment( history)?|work history|career history)$/i, 'experience'],
  [/^(top |technical |core |key )?(skills|competencies|skills (&|and) (tools|expertise)|tools|technologies|expertise|areas of expertise)$/i, 'skills'],
  [/^(education|academic background|education (&|and) training)$/i, 'education'],
  [/^(summary|profile|about( me)?|professional summary|objective|career objective)$/i, 'summary'],
  [/^(contact|contact information|contact info)$/i, 'contact'],
  [/^(languages|certifications|licenses( (&|and) certifications)?|honors(-awards)?|awards|publications|projects|volunteer( experience)?|interests|references|activities)$/i, 'other'],
]

function sectionOf(line: string): string | null {
  const t = line.replace(/[:•\s]+$/, '').trim()
  if (t.length > 40) return null
  for (const [re, name] of SECTIONS) if (re.test(t)) return name
  return null
}

function parseDate(s: string, end: boolean): number | null {
  const t = s.toLowerCase().trim()
  if (/present|current|now|today/.test(t)) {
    const d = new Date()
    return d.getFullYear() * 12 + d.getMonth()
  }
  const y = t.match(/(19|20)\d{2}/)
  if (!y) return null
  const year = Number(y[0])
  const m = t.match(new RegExp(MONTHS, 'i'))
  const num = t.match(/^(\d{1,2})\s*\//)
  const month = m ? MONTH_INDEX[m[0].slice(0, 3)] : num ? Number(num[1]) - 1 : end ? 11 : 0
  return year * 12 + month
}

function shortDates(from: string, to: string): string {
  const y1 = from.match(/(19|20)\d{2}/)?.[0] ?? ''
  if (/present|current|now|today/i.test(to)) return `${y1}–NOW`
  const y2 = to.match(/(19|20)\d{2}/)?.[0] ?? ''
  return y1.slice(0, 2) === y2.slice(0, 2) && y1 !== y2 ? `${y1}–${y2.slice(2)}` : y1 === y2 ? y1 : `${y1}–${y2}`
}

/** Common tools and skills, used when a resume or portfolio has no skills section of its own. */
const KNOWN_SKILLS = [
  'Adobe Illustrator', 'Photoshop', 'InDesign', 'After Effects', 'Premiere Pro', 'Lightroom', 'Adobe XD', 'Figma', 'Sketch', 'Canva', 'Cinema 4D', 'Blender',
  'Branding', 'Typography', 'Visual identity', 'Packaging design', 'Editorial design', 'Motion graphics', 'Illustration', 'Photography', 'Video editing',
  'UI design', 'UX design', 'UI/UX', 'Wireframing', 'Prototyping', 'User research', 'Usability testing', 'Design systems', 'Accessibility', 'WCAG',
  'Social media', 'Content creation', 'Copywriting', 'Editing', 'Proofreading', 'SEO', 'Email marketing', 'Google Analytics',
  'HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'C#', 'C++', 'SQL', 'PostgreSQL', 'MongoDB',
  'AWS', 'Azure', 'Docker', 'Kubernetes', 'Git', 'GitHub', 'WordPress', 'Shopify', 'Webflow',
  'Excel', 'PowerPoint', 'Microsoft Word', 'Google Workspace', 'Asana', 'Trello', 'Jira', 'Notion', 'Slack',
  'Project management', 'Agile', 'Scrum', 'Customer service', 'Bilingual', 'French', 'English', 'Spanish',
]
const isBullet = (l: string) => /^[•●▪◦\-*–·]\s/.test(l)
const SINGLE_YEAR_RE = new RegExp(`^(${DATE})$`, 'i')
const WORK_WORDS = /^(remote|hybrid|on-?site|volunteer|full-time|part-time|contract|freelance|internship|co-?op|self-employed)$/i
// Site titles like "Chloé Landry Design" or "Jane Doe — Portfolio" carry the person's name.
const NAME_SUFFIX = /\s*(?:[-–—|·]\s*)?\b(design|designs|portfolio|studio|creative|resume|résumé|cv|website|photography)$/i
const isNameLike = (l: string) => /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3}$/.test(l) && l.length <= 40
const clean = (l: string) => l.replace(/\s+/g, ' ').replace(/^[|•·,\s-]+|[|•·,\s-]+$/g, '').trim()

/** Pull a candidate profile out of plain resume text. Heuristic: the user reviews and corrects it next. */
export function parseResume(text: string): Profile {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const p = emptyProfile()

  p.email = text.match(EMAIL_RE)?.[0] ?? ''
  p.phone = text.match(PHONE_RE)?.[0]?.trim() ?? ''
  const li = text.match(LINKEDIN_RE)?.[0]
  if (li) p.linkedin = li.startsWith('http') ? li : 'https://' + li

  // Tag each line with the section it falls in.
  const tagged: { line: string; section: string | null }[] = []
  let section: string | null = null
  for (const line of lines) {
    const s = sectionOf(line)
    if (s) { section = s; tagged.push({ line, section: 'header' }); continue }
    tagged.push({ line, section })
  }

  // Location: first "City, Province" outside experience/education blocks.
  let locIdx = -1
  for (let i = 0; i < Math.min(tagged.length, 60); i++) {
    const { line, section } = tagged[i]
    if (section === 'experience' || section === 'education') continue
    const m = line.match(CITY_RE)
    if (m && line.length < 160) { p.city = m[0]; locIdx = i; break }
  }

  // Name: score name-like lines near the top.
  let best = -Infinity, nameIdx = -1
  for (let i = 0; i < Math.min(tagged.length, 40); i++) {
    const { section } = tagged[i]
    const line = tagged[i].line.replace(NAME_SUFFIX, '')
    if (!isNameLike(line) || sectionOf(line)) continue
    let score = 0
    if (i < 3) score += 3
    if (locIdx > i && locIdx - i <= 3) score += 3
    if (section === 'skills' || section === 'other' || section === 'experience' || section === 'education') score -= 4
    if (TITLE_WORDS.test(line)) score -= 3
    if (/\b(university|college|school|concentration|minor|major|bachelor|master|degree|diploma|certificate|interaction|design|engineering|science)\b/i.test(line)) score -= 4
    if (score > best) { best = score; nameIdx = i }
  }
  if (nameIdx >= 0) p.name = tagged[nameIdx].line.replace(NAME_SUFFIX, '')

  // Headline: the line after the name, if it isn't contact info or the location.
  if (nameIdx >= 0) {
    for (let i = nameIdx + 1; i < Math.min(tagged.length, nameIdx + 4); i++) {
      const l = tagged[i].line
      if (tagged[i].section === 'header' || EMAIL_RE.test(l) || PHONE_RE.test(l) || LINKEDIN_RE.test(l)) continue
      if (l.includes(p.name) || /\b(skip to|menu|navigation|home|cookie)\b/i.test(l)) continue
      if (i === locIdx) continue
      // Only accept a line that reads like a job title (skips menus and taglines); otherwise the latest role is used below.
      if (l.length <= 100 && TITLE_WORDS.test(l)) { p.title = clean(l.split(/\s[|•]\s/)[0]).slice(0, 80); break }
    }
  }

  // Experience: anchor on date ranges (or a lone year inside an Experience section), then take the
  // title and employer from the same line, the lines after it, or the lines before it.
  const spans: [number, number][] = []
  const anchors: { line: number; role: number | null }[] = []
  const usable = (t?: { line: string; section: string | null }) => !!t && t.section !== 'header' && !isBullet(t.line) && !RANGE_RE.test(t.line) && !SINGLE_YEAR_RE.test(t.line) && t.line.length < 90
  for (let i = 0; i < tagged.length; i++) {
    const { line, section } = tagged[i]
    if (section === 'education' || section === 'header') continue
    const single = section === 'experience' ? line.match(SINGLE_YEAR_RE) : null
    const m = line.match(RANGE_RE) ?? (single ? [single[0], single[1], single[1]] : null)
    if (!m) continue
    if (section !== 'experience' && !TITLE_WORDS.test(line) && !TITLE_WORDS.test(tagged[i - 1]?.line ?? '') && !TITLE_WORDS.test(tagged[i - 2]?.line ?? '')) continue
    const from = parseDate(m[1], false), to = parseDate(m[2], true)
    if (from !== null && to !== null && to >= from) spans.push([from, to])

    const rest = clean(line.replace(m[0], '').replace(/\(.*?\)/g, ''))
    let title = '', org = ''
    const parts = rest.split(/\s+(?:—|–|-|\||@|·|at)\s+|,\s+/).map(clean).filter(Boolean)
    if (parts.length >= 2) {
      const ti = parts.findIndex((x) => TITLE_WORDS.test(x))
      title = parts[ti >= 0 ? ti : 0]
      org = parts.find((_, k) => k !== (ti >= 0 ? ti : 0)) ?? ''
    } else {
      // Portfolio sites often put the date first, then the title and employer below it;
      // resumes and LinkedIn PDFs put them above. Use whichever side holds a job title.
      const after = [tagged[i + 1], tagged[i + 2]].filter(usable).map((t) => clean(t!.line))
      const before = [tagged[i - 1], tagged[i - 2]].filter(usable).map((t) => clean(t!.line))
      const useAfter = !parts[0] && after[0] !== undefined && TITLE_WORDS.test(after[0]) && !(before[0] && TITLE_WORDS.test(before[0]))
      const cand = [...(parts[0] ? [parts[0]] : []), ...(useAfter ? after : before)]
      const ti = cand.findIndex((x) => TITLE_WORDS.test(x))
      title = cand[ti >= 0 ? ti : 0] ?? ''
      org = cand.find((x, k) => k !== (ti >= 0 ? ti : 0) && !CITY_RE.test(x.split(' · ')[0])) ?? ''
    }
    const at = !org && title.match(/^(.+?)\s+(?:at|@|—|–|\||·)\s+(.+)$/)
    if (at) { title = at[1]; org = at[2] }
    // "Agence Christelle · Remote · Gatineau, QC" → "Agence Christelle"
    org = org.split(/\s+·\s+/).find((x) => !WORK_WORDS.test(x) && !CITY_RE.test(x)) ?? ''
    anchors.push({ line: i, role: title ? p.roles.length : null })
    if (title) p.roles.push({ title: title.slice(0, 80), org: org.slice(0, 80), dates: shortDates(m[1], m[2]) })
  }

  // What they did in each role: bullets and sentences between its dates and the next role or heading.
  // PDFs wrap long bullets onto several lines, so a line that continues an unfinished sentence is joined to it.
  anchors.forEach((a, k) => {
    if (a.role === null) return
    const end = anchors[k + 1]?.line ?? tagged.length
    const items: string[] = []
    for (let j = a.line + 1; j < end; j++) {
      const { line, section } = tagged[j]
      if (section === 'header' || section === 'education' || section === 'skills') break
      const text = clean(line.replace(/^[•●▪◦\-*–·¶]\s*/, ''))
      const last = items.length - 1
      if (isBullet(line) || /^[¶•]/.test(line)) items.push(text)
      else if (last >= 0 && !/[.!?]$/.test(items[last]) && /^[a-z(&,]/.test(text)) items[last] += ' ' + text
      else if (text.length > 60 && /\s\w+\s/.test(text)) items.push(text)
    }
    const kept = items.filter((x) => x.length >= 25 && x.length <= 400 && !/[\u0000-\u001f\ufffd]/.test(x)).slice(0, 6)
    if (kept.length) p.roles[a.role].highlights = kept
  })

  // Their own summary: a Summary/Profile section, or a first-person intro on a portfolio page.
  // Only full sentences count: menus and taglines also sit under headings like "About".
  const summaryLines = tagged.filter((t) => t.section === 'summary').map((t) => clean(t.line)).filter((l) => l.length > 40 && /[.!]/.test(l)).slice(0, 3)
  const intro = tagged.slice(0, 80).map((t) => t.line).find((l) => /^(I['’]m|I am|Hi,? I['’]m)\b/i.test(l) && l.length > 50)
  const summary = (intro ?? summaryLines.join(' ')).trim()
  if (summary) p.summary = summary.slice(0, 700)

  p.roles = p.roles.filter((r, i, a) => a.findIndex((x) => x.title === r.title && x.org === r.org && x.dates === r.dates) === i).slice(0, 12)

  // Years: union of all experience spans.
  spans.sort((a, b) => a[0] - b[0])
  let months = 0, curS = -1, curE = -1
  for (const [s, e] of spans) {
    if (s > curE) { if (curE >= 0) months += curE - curS + 1; curS = s; curE = e } else curE = Math.max(curE, e)
  }
  if (curE >= 0) months += curE - curS + 1
  p.years = Math.round((months / 12) * 10) / 10
  p.level = levelFor(p.years)

  // Skills: items from skills sections.
  const skills: string[] = []
  for (const { line, section } of tagged) {
    // Skip prose: bullets and long sentences under a skills heading are achievements, not skill lists.
    if (section !== 'skills' || /^languages?\s*:/i.test(line) || isBullet(line) || /^[¶•]/.test(line) || line.split(' ').length > 14) continue
    for (const raw of line.replace(/^[^:]{2,30}:\s*/, '').split(/[,;|•●▪·]|\s{2,}|\s-\s/)) {
      const k = clean(raw).replace(/^(and|or|&)\s+/i, '')
      if (k.length >= 2 && k.length <= 40 && k.split(' ').length <= 4 && !/\.$/.test(k) && !/[¶°]/.test(k) && !/^(using|with|including|for|to|in)\b/i.test(k)) skills.push(k)
    }
  }
  // Drop glyphs a PDF font couldn't map, and names of people or employers that slipped into the list.
  const notSkills = new Set([p.name, ...p.roles.map((r) => r.org)].map((x) => x.toLowerCase()).filter(Boolean))
  // No skills heading (common on portfolio sites): pick out well-known tools and skills mentioned in the text.
  if (skills.length < 5) skills.push(...KNOWN_SKILLS.filter((k) => new RegExp(`(^|[^\\w])${k.replace(/[.+#]/g, '\\$&')}($|[^\\w])`, 'i').test(text)))
  p.skills = [...new Map(skills.filter((k) => !/[\u0000-\u001f\ufffd]/.test(k) && !notSkills.has(k.toLowerCase())).map((k) => [k.toLowerCase(), k])).values()].slice(0, 40)
  if (!p.title && p.roles[0]) p.title = p.roles[0].title
  return p
}

