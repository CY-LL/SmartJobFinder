# SmartJobFinder

A personal job-search assistant built for Chloé, an entry-level graphic, UX/UI and motion designer in Ottawa. She adds her resume, LinkedIn profile or portfolio once. SmartJobFinder then searches job sites, job boards, employers' own career pages and her job alert emails for postings that fit her. It scores each posting against her experience and prepares a tailored resume and cover letter that she can edit before applying on the employer's site.

- **Live site:** https://smartjobfinder-99kh.netlify.app (private: behind Netlify's login)
- **Built with:** React, TypeScript and Vite in the browser, plus Netlify Functions for anything that has to run on a server
- **Design:** built from the Claude Design prototype in [`design/`](design/). On phones it uses a bottom tab bar and can be added to the home screen; on desktop it switches to a sidebar layout.
- **No AI service, no accounts:** resumes are read with pattern rules in the browser, and everything she enters stays in her browser (see [Backup](#backup)).
- **Not a product for sale:** it relies on her own Apify account and her own Gmail, so it isn't set up for other users.

## Screens

- **Onboarding**
  - Import from a resume (PDF or DOCX), LinkedIn, or a website or portfolio, or restore a backup.
  - Review the profile it read: summary, roles with their bullet points, education and skills.
  - Set what to search: job titles, roles that use her skills, "posted within", cities, remote, job types, levels, salary and years of experience.
  - Set the search schedule.
- **Matches**
  - Search status and a feed of matches with New, Applied and All filters.
  - Quick filters for Government and Volunteer, and "Show hidden" with the reason each posting was hidden.
  - "Also check" links to sites the app can't search.
  - Each job opens to its details with an editable tailored resume and cover letter.
- **Applications** — a log of applications, each with the documents exactly as sent and its status (Applied, Interview, Offer, Rejected).
- **Settings**
  - Search profile.
  - Free and paid job sources, and the employers to watch.
  - Job alert emails, backup and restore, and CSV export.

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

`/api/mail` ([`netlify/functions/mail.mts`](netlify/functions/mail.mts)) reads LinkedIn and Indeed job alert emails from one Gmail label (default `joboffers`) and turns each job card into a posting ([`netlify/lib/alerts.mts`](netlify/lib/alerts.mts)). Jobs keep the same ids as the Apify LinkedIn and Indeed searches, so a job found both ways shows once.

Gmail is read through a Google Apps Script the user installs in their own account, from Settings → Job alert emails ([`src/gmailScript.ts`](src/gmailScript.ts) generates it). The script:

- has read-only Gmail access (`gmail.readonly`), so it can't send, change or delete mail
- only searches the one label written into it, from the "posted within" window (up to 50 emails)
- answers only to a random key written into it, which the app keeps in the browser
- asks Gmail for messages by the label's id (not a search for its name) and checks each message still carries the label before returning it; nothing in a request can change what is read
- is deployed as a web app that runs as the user, open to "Anyone" so the function can call it; the key keeps others out

No mail password is stored anywhere, and access can be revoked at myaccount.google.com/permissions. The function only calls `https://script.google.com/macros/s/…/exec` addresses. A Gmail filter (`from:(jobalerts-noreply@linkedin.com OR alert@indeed.com)` → label `joboffers`) files alerts automatically. Without Gmail, alert emails saved as `.eml` files can be added on the same page.

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

What gets searched ([`src/match.ts`](src/match.ts) `searchesFor`): the user's job titles on every site; roles implied by their skills, projects and courses (e.g. Motion Designer, UX/UI Designer, Illustrator) on Indeed; one OR query of all of them on LinkedIn; and volunteer searches when Volunteer is one of their job types. Titles, skill roles and a "posted within" window (24 hours to 2 weeks) are editable in Preferences. Government and public-sector employers are tagged.

Matches links to sites that aren't searched:
- The Ontario Public Service (a CAPTCHA) and the City of Ottawa (bot protection) block automated access.
- GC Jobs only shows results in a full browser that runs JavaScript.
- Volunteer Ottawa and CharityVillage have no reader yet. CharityVillage postings still arrive through Google Jobs.

Runs start in the background and the browser polls until they finish. The free Apify plan runs at most 5 scrapers at once, so the function starts what fits and returns the rest as `queued`; the browser starts those as earlier runs finish. Results are de-duplicated across sites, then scored and filtered in the browser ([`src/match.ts`](src/match.ts)). A full search costs roughly $0.60 of Apify credit with every source on and the default titles and roles; each source can be switched off in Settings.

There's no server-side scheduler or user accounts: a scheduled search runs when the app is open and one is due, and all data lives in the browser's local storage.

## Backup

Settings → Backup saves everything (profile, preferences, sources, saved jobs, applications with the documents sent, and the Gmail connection) to a `smartjobfinder-backup-<date>.json` file ([`src/backup.ts`](src/backup.ts)). Restoring it, from Settings or from the first screen, brings the app back after browser data is cleared or on another device. The file includes the Gmail script key, so it should be kept private.

## Applying

Each match gets a resume and cover letter built from the user's own bullets and education (education comes first for recent graduates; the most relevant program and its best point go into the cover letter) ([`src/match.ts`](src/match.ts) `tailor`). Both can be edited per job before applying ([`src/screens/DocBox.tsx`](src/screens/DocBox.tsx)), copied as text, or printed / saved as PDF. "Apply on …" opens the posting; the documents exactly as sent are stored with the application.

Applications are not submitted automatically; the user submits on the employer's site.

## Costs

| Part | Cost |
|---|---|
| Netlify hosting and functions | Free plan |
| Free job sources and job alert emails | Free |
| Apify (LinkedIn import and the six paid sources) | About $0.60 per full search with every paid source on. The free plan's $5 a month covers only a handful of full searches, so turn paid sources off or move to a paid plan for daily use. |

## Project log

### 2026-10-30: first build

Everything below was built in one session with Claude Code, from the Claude Design prototype to a deployed app.

**Built**
1. **App from the design:** the onboarding, Matches, Applications and Settings screens, put on GitHub (private) and Netlify.
2. **Real data only:** the prototype's demo jobs, applications and sample profile were removed, and older saved data is cleaned up when the app loads.
3. **Resume reading:** PDF and DOCX are read in the browser with pattern rules. It picks out roles, dates, bullet points, summary, education (including honours like Dean's List) and skills.
4. **LinkedIn and website import:**
   - LinkedIn profiles are read through Apify.
   - Portfolios and websites are read by `/api/fetch`, which also follows "Resume" or "CV" links. Google Docs, Drive and Dropbox links work.
   - Results from several sources are merged into one profile.
5. **Tailored documents:**
   - A resume and cover letter for each job, built from her own bullets and education. Nothing is reworded; the most relevant points are picked and ordered.
   - Both can be edited for each job before applying, and the exact versions sent are kept with the application.
6. **Job search across six sites through Apify** (LinkedIn, Indeed, Glassdoor, Job Bank, Workopolis, Google Jobs):
   - Searches start in the background and are queued, because the free plan runs only 5 scrapers at once.
   - Duplicates across sites are removed.
7. **Better searches, after comparing with Grok's results:**
   - Search real job titles: "Graphic Designer", not "Graphic Design Intern".
   - Add roles implied by her skills (Motion Designer, UX/UI Designer, Illustrator, Social Media Designer).
   - Send LinkedIn one combined query, add volunteer searches, and add a "posted within" window.
   - Tag government employers.
   - Add "Show hidden", which lists each filtered-out posting with the reason.
8. **Free sources** (no Apify):
   - The remote-job APIs Himalayas, Jobicy, Remotive and Remote OK.
   - Employers' own job boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters), found from a careers page link. KOHO's "Junior Designer", one of the jobs Grok found, now comes straight from KOHO's own board.
9. **Job alert emails:**
   - LinkedIn and Indeed alerts filed under a Gmail label are turned into postings.
   - Gmail is read through a read-only Google Apps Script in her own account, not an app password. 32 access tests against a simulated mailbox confirmed it only returns emails with the `joboffers` label.
   - Alerts saved as `.eml` files also work.
10. **Backup and restore:** everything is saved to a `.json` file and restored from Settings or the first screen.

**Decisions**
- **No Claude API** for reading resumes, because of the ongoing cost. The built-in pattern reader is used instead.
- **Built for Chloé only,** not sold to others. Each user would need their own Apify account and Gmail script.
- **Terms of service checked before adding sources:**
  - LinkedIn, Indeed and Glassdoor forbid scraping.
  - Job Bank's terms forbid scripts and scrapers.
  - Remotive, Remote OK, Jobicy, Himalayas and the employer job boards allow reuse, with credit and a link back.
- **No CAPTCHA or bot-protection workarounds:** the Ontario Public Service and City of Ottawa are linked instead.
- **Gmail through a read-only script rather than an app password,** which would open the whole mailbox.

**Tested and not yet tested**
- Tested on real postings: the job sources (all four of Grok's jobs found), employer board detection, the free sources, backup and restore, and the Apify LinkedIn job-detail scraper.
- Tested only with sample emails and a simulated Gmail: the alert-email reader and the Gmail script. They haven't run against Chloé's real Gmail yet.

**Open items**
- Chloé: install the Gmail script (Settings → Job alert emails), check that the listed subjects are only job alerts, and save a backup.
- Decide whether to keep the Apify Job Bank scraper, since Job Bank's terms forbid scrapers.
- Choose between upgrading Apify and running fewer paid searches.
- Fetch the full LinkedIn description for jobs from alert emails. A free Apify scraper (`northbell~linkedin-job-detail-scraper`) was tested at about $0.00006 per job.
- Read government and charity alert emails (GC Jobs, Ontario Public Service, City of Ottawa, CharityVillage), and fix the "Also check" note in the app, which says all five sites block automated searches.
- Run scheduled searches on Netlify (Scheduled Functions and Blobs), so searches happen without the app open, and optionally send a notification when there are new matches.

## Development

```bash
npm install
npm run dev
```

`npm run dev` also serves the functions locally; set `APIFY_TOKEN` in your shell first for Apify sources. `npm run build` type-checks the app and functions and outputs a static site to `dist/`. Deployed on Netlify via [`netlify.toml`](netlify.toml).
