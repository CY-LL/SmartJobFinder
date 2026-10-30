# SmartJobFinder

Upload your resume once; SmartJobFinder finds matching jobs and applies with a tailored resume and cover letter for each one.

A responsive web app (React + TypeScript + Vite) built from the Claude Design prototype in [`design/`](design/). On phones it uses a bottom tab bar and can be installed to the home screen; on desktop it switches to a sidebar layout.

## Screens

- **Onboarding** — resume upload, parsed profile review, location/type/level/salary preferences, search schedule and apply mode
- **Matches** — run status, filterable match feed, job detail with tailored resume and cover letter, approve or skip
- **Applications** — searchable log, application detail with documents and timeline
- **Settings** — search profile, email summaries (with preview), job sources, CSV export

## Resume and LinkedIn import

All reading is done in the browser with pattern rules ([`src/profile.ts`](src/profile.ts)); no AI service is used. The user corrects anything on the review screen.

- **Upload** — PDF and DOCX resumes, turned into text in the browser ([`src/extract.ts`](src/extract.ts)).
- **Website** — paste a portfolio, personal site, PDF link, or shared Google Doc / Drive / Dropbox file. `POST /api/fetch` ([`netlify/functions/fetch.mts`](netlify/functions/fetch.mts)) downloads it, plus up to two "resume"/"CV" links on the page ([`netlify/lib/fetchdoc.mts`](netlify/lib/fetchdoc.mts)), because browsers can't fetch other sites directly. Each page and file is parsed separately and combined ([`src/web.ts`](src/web.ts)).
- **LinkedIn URL** — `POST /api/linkedin` ([`netlify/functions/linkedin.mts`](netlify/functions/linkedin.mts)) runs an Apify LinkedIn profile scraper (`harvestapi~linkedin-profile-scraper`). Any website links the scraper returns, plus an optional portfolio URL the user types, are then fetched and merged in the same way. LinkedIn only shows the Contact-info website to signed-in members, so it usually has to be typed. After any import, "Add a portfolio or website" merges another site into the profile. Set these in Netlify → Project configuration → Environment variables:
  - `APIFY_TOKEN` (required) — your Apify API token
  - `APIFY_LINKEDIN_ACTOR` (optional) — a different profile scraper
- **LinkedIn PDF fallback** — when the lookup isn't configured or fails, the app walks the user through LinkedIn's *Save to PDF* and parses that file instead.
## Job search

Jobs come from free sources and paid ones. Both run at once; if one side fails, the other's results are kept.

### Free sources

`/api/boards` ([`netlify/functions/boards.mts`](netlify/functions/boards.mts)) reads public job APIs whose terms allow showing their jobs elsewhere. It needs no key and costs nothing. Every posting keeps the board's own link and shows the board as its source, as their terms ask.

| Source | What it reads | Terms |
|---|---|---|
| Employers | The public job boards of employers the user adds in Settings (Greenhouse, Lever, Ashby, Workable, SmartRecruiters). Paste a careers page and `GET /api/boards?detect=<link>` finds the board behind it. Only postings in Canada, or remote without another country named, are kept. | Published by each system for showing a company's jobs elsewhere |
| Himalayas | `himalayas.app/jobs/api/search`, one call per title or role, jobs open to Canada | Apply with the `applicationLink`, unchanged |
| Jobicy | `jobicy.com/api/v2/remote-jobs?geo=canada`, by industry | Credit Jobicy; apply buttons go to the original link |
| Remotive | `remotive.com/api/remote-jobs`, by category | Link back and name Remotive; jobs are delayed 24 h; at most 4 calls a day |
| Remote OK | `remoteok.com/api`, by tag | Link back and name Remote OK |

Postings are kept when their title contains the words of one of the user's titles or skill roles, and when they fall inside the "posted within" window.

### Job alert emails

`/api/mail` ([`netlify/functions/mail.mts`](netlify/functions/mail.mts)) reads LinkedIn and Indeed job alert emails from one mail folder (default `joboffers`, set on Settings → Job alert emails). It connects over IMAP read-only, reads the emails from the "posted within" window (up to 60), and turns each job card into a posting ([`netlify/lib/alerts.mts`](netlify/lib/alerts.mts)). Jobs keep the same ids as the Apify LinkedIn and Indeed searches, so a job found both ways shows once. Set in Netlify:

- `MAIL_USER` — the email address
- `MAIL_PASSWORD` — for Gmail, an app password (myaccount.google.com/apppasswords; needs 2-Step Verification)
- `MAIL_HOST`, `MAIL_PORT` — only for providers other than Gmail (defaults `imap.gmail.com`, `993`)

A Gmail filter (`from:jobalerts-noreply@linkedin.com OR from:alert@indeed.com` → label `joboffers`) files alerts automatically. Without a mailbox, alert emails saved as `.eml` files can be added on the same page. Outlook.com no longer allows app passwords for IMAP.

Not used: Job Bank's own site (its terms forbid scripts and scrapers; its open data is only monthly), Adzuna (paid), Arbeitnow (Europe only).

### Paid sources

`/api/jobs` ([`netlify/functions/jobs.mts`](netlify/functions/jobs.mts)) searches six sources through Apify scrapers, using the profile's title near the user's city and remote in Canada:

| Source | Scraper | Override |
|---|---|---|
| LinkedIn | `curious_coder~linkedin-jobs-scraper` | `APIFY_LINKEDIN_JOBS_ACTOR` |
| Indeed | `valig~indeed-jobs-scraper` | `APIFY_INDEED_ACTOR` |
| Glassdoor | `valig~glassdoor-jobs-scraper` | `APIFY_GLASSDOOR_ACTOR` |
| Job Bank | `getascraper~jobbank-scraper` (local searches only) | `APIFY_JOBBANK_ACTOR` |
| Workopolis | `shahidirfan~Workopolis-Job-Scraper` | `APIFY_WORKOPOLIS_ACTOR` |
| Google Jobs | `orgupdate~google-jobs-scraper` (first local search only; includes company career pages) | `APIFY_GOOGLE_JOBS_ACTOR` |

What gets searched ([`src/match.ts`](src/match.ts) `searchesFor`): the user's job titles on every site; roles implied by their skills, projects and courses (e.g. Motion Designer, UX/UI Designer, Illustrator) on Indeed; one OR query of all of them on LinkedIn; and volunteer searches when Volunteer is one of their job types. Titles, skill roles and a "posted within" window (24 hours to 2 weeks) are editable in Preferences. Government and public-sector employers are tagged. GC Jobs, the Ontario Public Service and the City of Ottawa block automated access, so Matches links to them instead.

Runs start in the background and the browser polls until they finish. The free Apify plan runs at most 5 scrapers at once, so the function starts what fits and returns the rest as `queued`; the browser starts those as earlier runs finish. Results are de-duplicated across sites, then scored and filtered in the browser ([`src/match.ts`](src/match.ts)). A full search costs roughly $0.60 of Apify credit with every source on and the default titles and roles; each source can be switched off in Settings.

There's no server-side scheduler or user accounts: a scheduled search runs when the app is open and one is due, and all data lives in the browser's local storage.

## Applying

Each match gets a resume and cover letter built from the user's own bullets and education (education comes first for recent graduates; the most relevant program and its best point go into the cover letter) ([`src/match.ts`](src/match.ts) `tailor`). Both can be edited per job before applying ([`src/screens/DocBox.tsx`](src/screens/DocBox.tsx)), copied as text, or printed / saved as PDF. "Apply on …" opens the posting; the documents exactly as sent are stored with the application.

## Status

Applications are not submitted automatically; the user submits on the employer's site.

Locally, `npm run dev` serves the functions too; set `APIFY_TOKEN` in your shell first.

## Development

```bash
npm install
npm run dev
```

`npm run build` outputs a static site to `dist/`. Deployed on Netlify via [`netlify.toml`](netlify.toml).
