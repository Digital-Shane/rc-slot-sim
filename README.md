# RC Casino Points Simulator

Local-first web app that simulates casino point runs and visualizes outcome distributions.
It models repeated slot sessions to reach a target coin-in and summarizes risk metrics.

## Highlights
- Run thousands of full sessions until a target coin-in is reached.
- Tune RTP, volatility, bet size, top-up amount, and point targets.
- Inspect outcome distributions, percentiles, and tail-risk metrics.
- Compare trajectory samples and best/worst/median runs.
- Save simulations locally and share via JSON export/import.

## How the simulation works
- Each run continues until total coin-in hits the target.
- Every spin pays out from a volatility-specific distribution while preserving RTP.
- The engine tracks net, drawdown, cash-in, and time estimates per run.
- Results aggregate percentiles and tail metrics across all runs.

## Inputs
- RTP (%), machine volatility (low/medium/high), bet size, top-up amount.
- Target RC points (1 point per $5 coin-in).
- Advanced: run count, random seed, spins/sec, trajectory resolution.

## Outputs
- Trajectory chart (sampled runs plus best/worst/median).
- Distribution chart (final net) with summary stats.
- Run snapshot of selected inputs and derived values.

## Data and storage
- Simulations are stored locally in the browser (IndexedDB via Dexie).
- JSON export/import supports sharing and backups.

## Tech stack
- React + TypeScript
- Vite
- ECharts
- Dexie (IndexedDB)
- Web Worker for simulation runs

## Project structure
- `src/App.tsx` app state and layout
- `src/worker/simWorker.ts` simulation loop (Web Worker)
- `src/components/*` charts and UI pieces
- `src/sim/*` types, config, and model utilities

## Getting started
Prereqs: Node.js 18+.

```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

## GitHub Pages
- The workflow in `.github/workflows/deploy-pages.yml` builds and deploys on pushes to `main`.
- In the repo Settings → Pages, set Source to "GitHub Actions".
- The base path auto-detects the repo name in GitHub Actions; override with `VITE_BASE` if you need a custom path.

## Notes
- Results are illustrative; they depend on the selected RTP and volatility model.
- Time estimates use the configured spins/sec and median spins per run.
