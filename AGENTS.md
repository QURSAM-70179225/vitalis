# AGENTS.md — Contributor guide

Rules for anyone changing this repository. Read [ARCHITECTURE_ESSENTIALS.md](ARCHITECTURE_ESSENTIALS.md) first; details are in [ARCHITECTURE.md](ARCHITECTURE.md) and requirements in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Project in one paragraph
VITALIS is an offline-first React + TypeScript PWA for astronaut health monitoring. A pure, rule-based triage engine turns readings into status → explanation → action → escalation. Sensors (Bluetooth GATT, USB/Wi-Fi suit telemetry, simulator) stream into a device hub. An optional Supabase backend adds accounts, Row-Level-Security-protected sync and a realtime Ground Console. Without Supabase env vars it runs fully local; `?demo=1` loads a seeded 90-day Mars mission. Everything works offline after the first load, and a hand-off file moves data between a person's own devices with no network.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server on http://localhost:5173  (try /?demo=1&tour=1)
npm run typecheck    # TypeScript strict
npm run lint         # ESLint (must be clean)
npm test             # Vitest unit tests (must all pass)
npm run build        # production build + service-worker precache list
npm run preview      # serve the build on http://localhost:4173
npm start            # same as preview, for hosts that need a start command (Render)
```

Database security tests (needs PostgreSQL ≥ 14 locally):
```bash
psql -d <testdb> -f supabase/tests/00_local_auth_stub.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
```
Never run `00_local_auth_stub.sql` against Supabase.

## Definition of done
A change is done only when **all** of these pass: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. If you touched `supabase/schema.sql`, also run the RLS tests and add a check for the new rule. If you changed UI, load it in a browser (demo mode at least) and confirm there are no console errors. If you touched offline behaviour, check it on the production build (`npm run build && npm run preview`) with the network turned off.

## Rules

### Code
- TypeScript **strict**; **no `any`** (lint enforces). Prefer narrow types from `src/types.ts`.
- `src/engine/` and `src/data/` must stay **pure**: no React, store, IndexedDB, `window` or network imports. Add/adjust tests next to engine changes (`*.test.ts`).
- Every threshold in `src/engine/thresholds.ts` and `src/devices/channels.ts` needs a **source** comment/field. Bands are **inclusive** ("at or beyond the bound"); where a guideline says "≥ X is normal", put the bound just below X.
- State changes go through the store (`src/store/useApp.ts`). Writes that must reach the cloud call `mirror()` in the store; do not call Supabase from pages.
- Cross-module signals use the event bus (`src/utils/bus.ts`) to avoid import cycles.
- `useEffect` must return nothing or a cleanup function. **Never** write `useEffect(() => something())` when `something` returns a value (e.g. `scrollIntoView` returns a Promise in new Chromium and crashes React).
- Effects must be StrictMode-safe (dev runs them twice). Read-and-clear one-shot values atomically (see the camera → check-in hand-off).
- Overlays/drawers render through a **portal** (`createPortal`) so they sit above the sticky header.
- Keep pages lazy-loaded in `src/App.tsx`; heavy libraries (recharts, jspdf) must not enter the entry chunk.
- Sounds go through `alertSound()` / `stopAlertSound()` in `src/utils/sound.ts`, never a raw `AudioContext`. Buttons that silence alarms get the `data-silence-alerts` attribute.
- Data written on one device must survive a hand-off: new local tables need a place in `SyncTables` (`src/types.ts`), `readSyncTables`/`writeSyncTables` (`src/store/db.ts`) and the merge rules (`src/engine/merge.ts` + test).

### UX, accessibility and safety
- Status is never colour-only: use `StatusBadge` (icon + text + colour) and `LEVEL_META`.
- Touch targets ≥ 44 px (check-in controls 56 px); everything keyboard-operable; ARIA labels on icon buttons.
- Use **plain words** a non-medical person understands ("Oxygen in your blood", "Take action today"). Put medical terms in the glossary (`src/data/glossary.ts`), not in alert text.
- Keep the **decision-support, not diagnosis** language. The assistant must never diagnose or dose and must end answers with the triage footer.
- Every new alert needs: `why`, `actions`, `escalateWhen`, `hazards`, `guidanceIds`.

### Privacy and security
- **Never commit `.env`** or any key. Only the Supabase **anon/publishable** key may be used in the client; never the secret/service_role key.
- Journal entries are **owner-only**: never show them in CMO/ground views or include them in packets.
- Roles come from invite codes. Do not add client paths that set `profiles.role` or `mission_id`.
- Schema changes must keep RLS enabled on every table and be **idempotent** (`create … if not exists`, `drop policy if exists`).
- Do not use real patient data with the free Supabase tier.
- Hand-off files contain the private journal: keep the "only send it to your own devices" warning wherever they are created.
- Never put a secret in a `VITE_` variable: everything starting with `VITE_` is published in the website files.

### Dependencies
- Ask the project owner before adding a runtime dependency. Prefer small, hand-written solutions (the router and service worker are hand-written on purpose).

### Git
- Work on a branch, small commits with clear messages that say what changed and why. Do not push to `main` without the owner's OK.
- Commit messages and files carry no generator or tool credits.
- `node_modules/`, `dist/`, `.env*` and `*.zip` are ignored — keep it that way.

## Where to make common changes

| Task | Files |
|---|---|
| New triage rule | `src/engine/triage.ts` (`RULESET`), test in `src/engine/triage.test.ts`, guidance card in `src/data/guidance.ts` |
| New indicator | `src/types.ts` (`IndicatorId`), `src/data/indicators.ts`, `src/engine/thresholds.ts`, check-in steps in `src/pages/CheckIn.tsx` |
| New sensor channel | `src/types.ts` (`ChannelId`), `src/devices/channels.ts`, aliases in `src/devices/protocol.ts` |
| New Bluetooth profile | `src/devices/gatt.ts` (parser + `BLE_PROFILES`), `src/devices/hub.ts` (`connectBluetooth`) + tests |
| New synced table | `supabase/schema.sql` (table + RLS + grants + realtime), `src/types.ts` (`SyncTable`), `src/cloud/mappers.ts` (+ test), `src/cloud/sync.ts` (pull + realtime), store `mirror()` |
| New page | `src/pages/X.tsx`, route in `src/hooks/useRoute.ts`, lazy import in `src/App.tsx`, nav in `src/components/Layout.tsx` (and `GROUND_PAGES` if Mission Control may see it) |
| New local table | `src/store/db.ts` (new Dexie version), `src/types.ts` (`SyncTables`), `src/engine/merge.ts` (+ test) so hand-off files carry it |
| Alarm / alert sound | `src/utils/sound.ts` (tones, queueing, stop), `src/devices/hub.ts` (live alarms, repeat) |
| Offline / install / battery | `public/sw.js`, `vite.config.ts`, `src/utils/install.ts`, `src/utils/device.ts`, `src/pages/Devices.tsx` |
| Hosting config | `render.yaml`, `docs/DEPLOYMENT.md`, `vite.config.ts` (`preview.allowedHosts`) |
| Database function | `supabase/schema.sql` (built-in functions only: Supabase keeps extensions in the `extensions` schema), check in `supabase/tests/rls_test.sql` |

## Gotchas
- Demo/local mode and cloud mode share code: check `mission.demo` and `cloud.userId` before syncing or simulating.
- The ground-link simulator must stay disabled in cloud mode (real replies come from people).
- Health data can only be recorded for the signed-in user: pages that record data are wrapped in `OwnDataGuard`.
- The service worker precache list is generated at build time; test offline with `npm run build && npm run preview`, not the dev server.
- Web Bluetooth / Web Serial need Chrome/Edge and HTTPS (or localhost).
- Browsers block sound until the user taps the page. `AudioContext.resume()` is async: play only after it resolves (see `alertSound`).
- `beforeinstallprompt` fires once, early: it is captured in `src/main.tsx` via `initInstallPrompt()`.
- The Battery Status API exists only in Chromium; always handle `null`.
- After a redeploy, old tabs may request page files that no longer exist; `ErrorBoundary` reloads once. Hosts must serve `/sw.js` with `Cache-Control: no-cache`.

## Documentation map
| File | Read it when… |
|---|---|
| [README.md](README.md) | You want the overview, features, how to run |
| [ARCHITECTURE_ESSENTIALS.md](ARCHITECTURE_ESSENTIALS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) | You change how parts fit together |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | You add or change a feature (add/update its FR row) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | You open a pull request |
| [SECURITY.md](SECURITY.md) | You touch keys, RLS, privacy or report a vulnerability |
| [CHANGELOG.md](CHANGELOG.md) | You finish a user-visible change (add a line) |
| [docs/OFFLINE_AND_DEVICES.md](docs/OFFLINE_AND_DEVICES.md) | Offline use, install, hand-off, watches, battery |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) · [docs/SENSORS.md](docs/SENSORS.md) | Hosting · accounts · sensors |
