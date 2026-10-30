# SmartJobFinder

Upload your resume once; SmartJobFinder finds matching jobs and applies with a tailored resume and cover letter for each one.

A responsive web app (React + TypeScript + Vite) built from the Claude Design prototype in [`design/`](design/). On phones it uses a bottom tab bar and can be installed to the home screen; on desktop it switches to a sidebar layout.

## Screens

- **Onboarding** — resume upload, parsed profile review, location/type/level/salary preferences, search schedule and apply mode
- **Matches** — run status, filterable match feed, job detail with tailored resume and cover letter, approve or skip
- **Applications** — searchable log, application detail with documents and timeline
- **Settings** — search profile, email summaries (with preview), job sources, CSV export

## Status

This is a front-end build. Resume parsing, job search (Apify scrapers) and application submission are simulated with the demo data in [`src/data.ts`](src/data.ts). Settings and actions are saved in the browser's local storage.

## Development

```bash
npm install
npm run dev
```

`npm run build` outputs a static site to `dist/`. Deployed on Netlify via [`netlify.toml`](netlify.toml).
