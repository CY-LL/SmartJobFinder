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
- **LinkedIn URL** — `POST /api/linkedin` ([`netlify/functions/linkedin.mts`](netlify/functions/linkedin.mts)) runs an Apify LinkedIn profile scraper (`harvestapi~linkedin-profile-scraper`). The website, portfolio and resume links on the profile are then fetched and merged in the same way. Set these in Netlify → Project configuration → Environment variables:
  - `APIFY_TOKEN` (required) — your Apify API token
  - `APIFY_LINKEDIN_ACTOR` (optional) — a different profile scraper
- **LinkedIn PDF fallback** — when the lookup isn't configured or fails, the app walks the user through LinkedIn's *Save to PDF* and parses that file instead.
## Job search

`/api/jobs` ([`netlify/functions/jobs.mts`](netlify/functions/jobs.mts)) searches **Indeed** (`valig~indeed-jobs-scraper`) and **LinkedIn** (`curious_coder~linkedin-jobs-scraper`) on Apify, using the profile's title near the user's city and remote in Canada. Runs start in the background and the browser polls until they finish. Results are de-duplicated across sites, then scored and filtered in the browser ([`src/match.ts`](src/match.ts)) by title fit, skills found in the posting, level, years of experience, job type, salary and location.

- Override the scrapers with `APIFY_INDEED_ACTOR` / `APIFY_LINKEDIN_JOBS_ACTOR`.
- A full search costs about $0.10 of Apify credit.
- There's no server-side scheduler or user accounts: a scheduled search runs when the app is open and one is due, and all data lives in the browser's local storage.
- The user applies on the employer's site ("Apply on Indeed ↗"); the app prepares the tailored resume and cover letter and logs the application.

## Status

Glassdoor, Job Bank, company career pages and Workopolis are listed in Settings but not connected yet. Applications are not submitted automatically.

Locally, `npm run dev` serves the functions too; set `APIFY_TOKEN` in your shell first.

## Development

```bash
npm install
npm run dev
```

`npm run build` outputs a static site to `dist/`. Deployed on Netlify via [`netlify.toml`](netlify.toml).
