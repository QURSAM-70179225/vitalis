# VITALIS — Architecture Essentials

The one-page version of [ARCHITECTURE.md](ARCHITECTURE.md).

## What it is
An **offline-first PWA** (React + TypeScript + Vite) that turns astronaut health readings into **status → explanation → action → escalation**. Optional **Supabase** backend adds accounts, sync and a realtime **Ground Console** for Mission Control.

## The picture

```
Sensors (Bluetooth · USB/Wi-Fi suit · simulator)
        │
        ▼
 device hub ──alarms──► toast/beep + shared alert
        │ 1-min avg         │
        ▼                   ▼
  Zustand store ◄──► IndexedDB (Dexie) ──outbox──► Supabase (Auth · Postgres+RLS · Realtime)
        │                                                   │
        ▼                                                   ▼
 triage engine (pure TS) ──► UI pages                Ground Console (Mission Control)
```

## Six things to know

1. **The engine is pure.** `src/engine/` has no React, storage or network imports; everything there is unit-tested. Thresholds live in `src/engine/thresholds.ts` with a source for each.
2. **Triage = 3 layers.** Absolute bands → personal baseline (14-day mean/SD, |z| ≥ 2, 3-day trends) → 11 combination rules. Every alert has *why*, actions, escalate-when.
3. **Local first, always.** Writes go to IndexedDB, then an outbox uploads them when online. The app never waits for the network.
4. **Security lives in the database.** Row Level Security in `supabase/schema.sql`: astronauts see only their own data; CMO/ground see the crew; journals are owner-only; roles come from invite codes. Client holds only the anon/publishable key.
5. **Works with no internet, across devices.** Service worker + IndexedDB keep every page working offline; a hand-off file moves data between your own phone, tablet and laptop (merge, never replace) when there is no network.
6. **Two modes, one codebase.** No Supabase env vars → local/demo mode (simulated ground link). With them → sign-in, missions, real sync. `?demo=1` always stays local.

## Where things are

| Need to change… | Go to |
|---|---|
| A threshold or rule | `src/engine/thresholds.ts`, `src/engine/triage.ts` (+ `triage.test.ts`) |
| Live sensor alarm limits | `src/devices/channels.ts` |
| A new Bluetooth device type | `src/devices/gatt.ts`, `src/devices/hub.ts` |
| Sync behaviour | `src/cloud/sync.ts`, `src/cloud/mappers.ts` |
| Database / permissions | `supabase/schema.sql` (+ `supabase/tests/rls_test.sql`) |
| A page | `src/pages/*` (routes in `src/hooks/useRoute.ts`, nav in `src/components/Layout.tsx`) |
| Offline caching | `public/sw.js`, `vite.config.ts` (precache plugin) |
| Device hand-off / battery / install | `src/engine/merge.ts`, `src/pages/Devices.tsx`, `src/utils/device.ts`, `src/utils/install.ts` |
| Alarm sounds | `src/utils/sound.ts`, `src/devices/hub.ts` |

## Data at a glance
- **Local:** mission, settings, crew, checkIns, cognitive, journal, events, attachments, packets, vitals, messages, alerts, outbox.
- **Cloud:** missions, profiles, check_ins, cognitive_results, journal_entries, vital_samples, alerts, packets, ground_messages, mission_events.

## Quality gates
`npm run typecheck` · `npm run lint` · `npm test` (112) · `npm run build` · RLS SQL tests (21).
