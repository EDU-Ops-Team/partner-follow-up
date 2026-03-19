# Google Groups Backfill Scaffold

This folder holds the first-pass scaffold for backfilling Google Groups history into Convex raw archive tables.

## Current Scope

- browser-driven thread scraping scaffold
- checkpointing to a local JSON file
- batch ingest into `groupThreads` and `groupMessages`

It does **not** yet include:

- calibrated Google Groups selectors
- task signal extraction
- review/apply UI for proposed transitions

## Prerequisites

1. Local `.env.local` must include:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `ADMIN_API_KEY`
2. Install Playwright locally before running:
   - `npm install -D playwright`
3. Copy and calibrate selectors:
   - start from `scripts/groups-backfill/selectors.example.json`

## Usage

```bash
node scripts/groups-backfill/scrape.mjs \
  --group-url "https://groups.google.com/g/YOUR-GROUP/search?q=after%3A2026-01-01" \
  --selectors "scripts/groups-backfill/selectors.example.json" \
  --max-threads 25 \
  --batch-size 5
```

The script will:

1. open a browser
2. wait for you to complete login if needed
3. scrape threads in batches
4. write progress to `.local/groups-backfill-checkpoint.json`

## Calibration Notes

The selector file is intentionally explicit. Google Groups markup is likely to drift, so treat the selector file as the first thing to adjust during live calibration.
