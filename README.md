# SmartJobFinder

Upload your resume once; SmartJobFinder finds matching jobs and applies with a tailored resume and cover letter for each one.

A responsive web app (React + TypeScript + Vite) built from the Claude Design prototype in [`design/`](design/). On phones it uses a bottom tab bar and can be installed to the home screen; on desktop it switches to a sidebar layout.

## Screens

- **Onboarding** — resume upload, parsed profile review, location/type/level/salary preferences, search schedule and apply mode
- **Matches** — run status, filterable match feed, job detail with tailored resume and cover letter, approve or skip
- **Applications** — searchable log, application detail with documents and timeline
- **Settings** — search profile, email summaries (with preview), job sources, CSV export

## Resume and LinkedIn import

- **Upload** — PDF and DOCX resumes are read in the browser ([`src/extract.ts`](src/extract.ts)) and parsed with pattern rules ([`src/profile.ts`](src/profile.ts)) into name, contact, roles, skills and years of experience. The user corrects anything on the review screen.
- **LinkedIn URL** — `POST /api/linkedin` ([`netlify/functions/linkedin.mts`](netlify/functions/linkedin.mts)) runs an Apify LinkedIn profile scraper. Set these in Netlify → Project configuration → Environment variables:
  - `APIFY_TOKEN` (required) — your Apify API token
  - `APIFY_LINKEDIN_ACTOR` (optional) — defaults to `dev_fusion~Linkedin-Profile-Scraper`
- **LinkedIn PDF fallback** — when the lookup isn't configured or fails, the app walks the user through LinkedIn's *Save to PDF* and parses that file instead.

## Status

Job search and application submission are still simulated with the demo jobs in [`src/data.ts`](src/data.ts). Tailored resumes and cover letters are generated from the user's parsed profile. Settings and actions are saved in the browser's local storage.

## Development

```bash
npm install
npm run dev
```

`npm run build` outputs a static site to `dist/`. Deployed on Netlify via [`netlify.toml`](netlify.toml).
