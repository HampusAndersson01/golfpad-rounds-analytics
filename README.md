# GolfPad Rounds Analytics

GolfPad Rounds Analytics is a local-first dashboard for exploring round history exported from Golf Pad. Upload the official Golf Pad ZIP export, and the app parses rounds, holes, and shots directly in the browser into score trends, putting and GIR/FIR metrics, club performance, recent form, and blow-up hole analysis.

![GolfPad Rounds Analytics dashboard](docs/dashboard.png)

## What it does

- Imports the official Golf Pad ZIP export without sending the file to a server.
- Detects `Rounds.csv`, `Holes.csv`, and `Shots.csv` inside the archive.
- Stores normalized round data in a persistent Docker volume when run with Docker.
- Falls back to browser localStorage when running as a static/development frontend without the persistence API.
- Skips duplicate rounds on repeated imports.
- Shows overview KPIs, score trends, category trends, recent form, club analytics, round detail, and blow-up analysis.
- Lets you export or clear the local browser database.

## Simple usage

1. Export your data from Golf Pad as a ZIP file.
2. Open this website locally.
3. Go to `Import`.
4. Upload or drag the Golf Pad ZIP file into the import panel.
5. Review the dashboard tabs once the import finishes.

The ZIP is parsed in your browser. After import, the original file reference is cleared and only normalized round data is saved.

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

Docker stores the database in the named volume `golfpad-data`, mounted at `/data` in the container. The app writes the database to `/data/rounds.json`, so parsed rounds survive container rebuilds, image updates, and restarts.

Update the container without deleting stored rounds:

```bash
docker compose up --build -d
```

Do not run `docker compose down -v` unless you intentionally want to delete the persistent database volume.

## Data and privacy

Golf Pad export files are parsed in the browser with `JSZip` and `Papa Parse`; the original ZIP is not uploaded or stored by the backend. When run with Docker, imported rounds are saved as normalized JSON in `/data/rounds.json` inside the persistent `golfpad-data` volume. When run with the Vite development server only, the app falls back to the browser localStorage key `golfpad.analytics.rounds.v1`.

Use the dashboard `Export` action to download the normalized JSON database, or `Clear` to remove all stored rounds.

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
  storage.ts                   Persistent API client with localStorage fallback
  main.tsx                     App shell and dashboard views
  components/                  Import, chart, KPI, club, and round detail UI
server.mjs                     Static file server and persistent JSON database API
docs/
  dashboard.png                README dashboard screenshot
```
