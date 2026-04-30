# GolfPad Rounds Analytics

GolfPad Rounds Analytics is a local-first dashboard for exploring round history exported from Golf Pad. Upload the official Golf Pad ZIP export, and the app parses rounds, holes, and shots directly in the browser into score trends, putting and GIR/FIR metrics, club performance, recent form, and blow-up hole analysis.

![GolfPad Rounds Analytics dashboard](docs/dashboard.png)

## What it does

- Imports the official Golf Pad ZIP export without sending the file to a server.
- Detects `Rounds.csv`, `Holes.csv`, and `Shots.csv` inside the archive.
- Stores normalized round data in browser localStorage.
- Skips duplicate rounds on repeated imports.
- Shows overview KPIs, score trends, category trends, recent form, club analytics, round detail, and blow-up analysis.
- Lets you export or clear the local browser database.

## Simple usage

1. Export your data from Golf Pad as a ZIP file.
2. Open this website locally.
3. Go to `Import`.
4. Upload or drag the Golf Pad ZIP file into the import panel.
5. Review the dashboard tabs once the import finishes.

The ZIP is parsed in your browser. After import, the original file reference is cleared and only normalized round data remains in localStorage.

## Run locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

Build the production bundle:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Run with Docker

Build and start the container:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:36490
```

## Data and privacy

This project is designed to run as a static client-side app. Golf Pad export files are parsed in the browser with `JSZip` and `Papa Parse`; there is no backend upload endpoint in this repository. Imported rounds are stored in the browser under the localStorage key `golfpad.analytics.rounds.v1`.

Use the dashboard `Export` action to download the local normalized JSON database, or `Clear` to remove all locally stored rounds from the browser.

## Expected Golf Pad export files

The importer looks for CSV files in the ZIP by name:

- `Rounds.csv` is required.
- `Holes.csv` is optional, but enables hole-level analysis.
- `Shots.csv` is optional, but enables club and shot analytics.

If `Holes.csv` or `Shots.csv` are missing, the app still imports round summaries, but some dashboard sections will have limited data.

## Tech stack

- React
- TypeScript
- Vite
- Recharts
- JSZip
- Papa Parse
- Docker optional runtime

## Project structure

```text
src/
  analytics.ts                 Round normalization and dashboard metrics
  golfpadParser.ts             ZIP and CSV parsing
  storage.ts                   Browser localStorage persistence
  main.tsx                     App shell and dashboard views
  components/                  Import, chart, KPI, club, and round detail UI
docs/
  dashboard.png                README dashboard screenshot
```

