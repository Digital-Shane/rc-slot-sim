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
- Production defaults to `/` for `https://rccasinopointsim.com/`, including in GitHub Actions. The repository name does not change the URL base. Set `VITE_BASE=/your-subdirectory/` (or `BASE_URL`) only when intentionally hosting beneath a subdirectory; `VITE_BASE=/` keeps root hosting.
- Base-path regression check: `node --import tsx tests/vite-base-regression.mts`.

## Notes
- Results are illustrative; they depend on the selected RTP and volatility model.
- Time estimates use the configured spins/sec and median spins per run.

## Editing information and appearance

All existing prose remains in `src/content/`. Edit these Markdown files directly;
Vite updates the page while the dev server is running. No service or login is needed.

| Content | File |
| --- | --- |
| About this simulator | `src/content/intro.md` |
| Full words of caution | `src/content/caution.md` |
| Volatility & payout logic | `src/content/volatility.md` |
| Determining machine volatility | `src/content/volatility-determination.md` |
| Video poker tradeoffs | `src/content/video-poker.md` |
| Industry metrics | `src/content/scores.md` |
| My point strategy | `src/content/point-strategy.md` |

Edit card titles, summaries, and ordering in `src/content/guide.ts`. Add an import
and one entry there to add another article. Keep the literal `VOLATILITY_GRAPHS`
marker in the volatility Markdown where the embedded chart should appear. Markdown
tables scroll horizontally inside their own region on small phones.

The short page introductions and teaching prompts live in `src/content/interface.ts`.
The design tokens at the top of `src/styles.css` control colors. The personal notebook
design uses Georgia headings, a few local handwritten annotations, and Avenir text
with local fallbacks; no font downloads.
Reference cards open a native modal on desktop and a bottom sheet on phones, with
an independently scrolling article, keyboard focus containment, Escape to close,
and focus returned to the card. The inline “Let’s try it” link jumps to the simulator, and the footer links back
to the site header. The underlying simulation model and IndexedDB schema are unchanged.
Existing saves remain associated with their original browser origin: use the same
host and port to see them, or export/import JSON to move between origins.

## Verification

```bash
npm test             # deterministic comparisons against pre-redesign worker outputs
npm run typecheck
npm run build
```

`tests/simulation-baseline.json` was captured before the visual changes. The test
compares every run, aggregate, input, and trajectory for LOW, MEDIUM, and HIGH
volatility, excluding only random/time-based metadata. The worker's two TypeScript
non-null assertions change no emitted JavaScript; the production worker asset is
still `simWorker-Cfqs9fdr.js`, identical to the original build.

`tests/responsive-regression.mjs` exports a browser regression function accepting a
Playwright-compatible page, a viewport setter, and an optional observation callback.
It was executed using the bundled CUA browser with `tab.playwright`, the viewport
capability, and `tab.getAXState({emit: false})`. It can also run in an existing
Playwright environment without a test-framework dependency. Start the local app,
open it, and invoke `checkResponsiveUI(page, size => page.setViewportSize(size))`.

Verified viewports: **1440×1000, 1280×800, 768×1024, 390×844, and 320×740**.
Coverage includes all five articles, repeated opening/closing, Enter/Escape,
Tab/Shift+Tab focus containment and restoration, scroll reset, local table scrolling,
page overflow, input sizing, and chart-container sizing. Browser flows also cover
numeric drafts and blur, RTP keyboard changes, advanced settings, seeded and default
simulations, cancellation, trajectory visibility and resampling, probability range
inputs and keyboard sliders, local save/reload/load, and JSON export/import. An
exported browser run was compared to the original worker including resampling.

Browser checks use mock/local simulation data and do not involve financial transactions.
Phone sizes were emulated in Chromium; physical iOS/Android and Safari were not
available for this pass. Vite retains its existing large-bundle warning from ECharts;
code splitting was outside this visual redesign.


## Connected loss/profit plot

`src/components/probabilityChart.ts` retains the original loss/profit threshold
calculations. The chart is now **one ECharts instance, one grid, and one shared
signed-dollar x-axis**, rendered as SVG. Negative thresholds are losses; positive
thresholds are profits. The left probability scale runs upward and the right scale
runs downward, preserving the original complementary reading. Both use identical
plot bounds and fixed 25% ticks. The series touch at $0, with no inner gutters or
mobile stacking. If some runs finish at exactly $0, a neutral vertical step represents
that probability mass instead of pretending the two strict probabilities sum to one.

`npm test` now also runs `tests/probability-regression.mts`: it checks strict thresholds,
all-profit/all-loss/break-even cases, and 16 actual ECharts SVG layouts with shared
$0 coordinates, aligned y bounds, and equal dollar scaling on both sides.
`tests/probability-browser-regression.mjs` measures the actual rendered red/green SVG
path endpoints in the browser at 1440×1000, 768×1024, 390×844, and 320×740.
The measured horizontal and vertical gaps at the shared boundary were **0px** at
every size for a simulation with no exact-$0 outcomes.

## Notebook interaction polish

The existing help copy now uses `src/components/InfoTip.tsx`: real labelled buttons,
readable help cards positioned inside the viewport, mouse hover/tap/keyboard opening,
Escape, Tab-away and outside-click dismissal. Keyboard focus stays on the help button.
The card stays attached while the page moves and is hidden if its control leaves view.
No help wording, model assumptions or simulation behavior changed.

The two headline net metrics have stronger type hierarchy. Distribution markers use
a small readable key, avoiding overlapping labels on narrow plots. Phone derived values sit
below their inputs, and the reading-sheet/footer padding respect safe areas.
`tests/polish-browser-regression.mjs` supplies the focused 1280×800/320×740 smoke test
for help geometry/accessibility/dismissal, long-sheet scrolling and focus, and the
unchanged actual-SVG probability seam. It uses the same browser adapter pattern as
`tests/probability-browser-regression.mjs`.


## Header and introduction layout

The personal introduction (`notebookCopy.introduction` in `src/content/interface.ts`)
appears directly below “What does a casino point actually cost?” on desktop and
phones, immediately before the simulation controls. The disclaimer is a single paragraph edited
in `src/content/interface.ts`; the repetitive subtitle has been removed. The former “About
this model” card content is rendered inline from `src/content/intro.md`, once, near
the top of the page. The large question heading sits below the notes, immediately
above the simulator. The old kicker and page-navigation menu have been removed.

The coin-in explanation lives in the main paragraph in `src/content/intro.md`;
there is no separate sticky note. All of `src/content/caution.md` is immediately
visible beside the introduction on desktop and below it on smaller screens. Its paragraph breaks organize
the original text without shortening or duplicating it.

The site name is “Royal Caribbean Casino Points Simulator,” edited in
`src/content/interface.ts` (and the browser-tab title in `index.html`). The title stands alone; there is no logo or typographic RC mark. No external
font is required. The caution
uses a simple divider and the same reading typography as the introduction; it
never collapses, clips, or scrolls inside a separate panel.
