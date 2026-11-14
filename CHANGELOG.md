# Changelog

All notable changes to VITALIS. Newest first.

## 1.4.1 — Accurate privacy wording (November 2026)

### Added
- README: "How data reaches Earth (and what 'works offline' means)".

### Fixed
- With an account, some screens said journal notes "stay on this device"/"never leave the device" and that "nothing leaves until you tap Send to Ground". Journal entries do sync to the owner's account (never visible to the medical officer or ground team) and check-ins sync automatically. Settings, Mind, Ground Link and the assistant now show the correct text for each mode.
- Docs: 17 check-in measurements, 21 database security checks, 17 screens.

## 1.4.0 — Organ body map & working replay (November 2026)

### Added
- **Full human body with organs:** brain, eyes, windpipe, lungs, heart and main arteries, liver, stomach, intestines, bladder, spleen, lymph nodes and skeleton (front); spine, shoulder blades, lungs and kidneys (back). Shaded organs and a pointer-following tilt give a 3D look; the heart beats at your heart rate. Status shows as a glowing outline plus a "!" marker. Tap an organ to open that body area.
- Health Journey replay explains what it does and shows each day's readings (heart, blood pressure, oxygen, sleep, mood, radiation) as it plays.

### Fixed
- The body outline was not symmetric, so organs did not line up; it is now drawn from one mirrored half.
- With only one day of check-ins the replay and "How space is changing your body" did nothing; they now explain that 2+ days are needed and link to today's check-in.

## 1.3.1 — Photo scanning everywhere (November 2026)

### Added
- **Scan a health report from a photo in every browser** (including Chrome/Edge on Windows): on-device text reading with Tesseract.js, with a progress bar. The reader (~7 MB) is served by VITALIS itself, downloaded on the first scan and kept for offline use. Photos are never uploaded.

## 1.3.0 — Real NASA data (November 2026)

### Added
- **Real NASA dataset:** 15,358 radiation readings from NASA's Curiosity rover (RAD) on its cruise to Mars, from the Planetary Data System. The demo mission's radiation now comes from it; day 42 is the real solar storm of 8 Mar 2012.
- "Real NASA data" badge on the radiation panel and a chart of all 218 days on About & Sources.
- `data/nasa/` (CSV + method), `scripts/nasa-data/` (download + rebuild), dataset tests.
- `DATA_SOURCES.md`: every resource, dataset, published value and library, with where it is used and its license.
- `LICENSE` (MIT).

### Changed
- Day 42 of the demo is now "Take action today: go to the shelter" (real storm ≈ 6× normal) instead of a made-up 22× spike.

## 1.2.0 — Everyday use (November 2026)

### Added
- **Devices & Sync page:** install as an app, offline readiness, storage protection, battery status.
- **Offline hand-off between your own devices:** send a file via share sheet, Bluetooth, Nearby Share, AirDrop, USB or memory card; it merges (never deletes) and is safe to repeat. A new device can start from a hand-off file on the welcome screen, with no internet.
- **Low-battery warnings** at 20 % and 10 % with a shortcut to hand off.
- **Connect your watch** over Bluetooth heart rate, with instructions per brand.
- App-icon shortcuts (Check-in, Live monitor, Hand-off).
- **Test beep** on the Live Monitor; danger alarms repeat every 20 s while active.
- **Health Journey:** health map over 30/40/60/90 days, body replay, "How space is changing your body".
- Check-in input choices: type, **scan a health report**, Bluetooth device, camera.
- **Feelings & home:** days away, mood calendar, mood-aware suggestions.
- Status banner with chime / urgent beep + vibration on opening the app.
- Assistant opens with a daily summary of your condition and what to do.
- Twinkling starfield with shooting stars.
- **About & Sources** page with all Space Apps resources, Benefits on Earth, non-endorsement; Radiation exposure panel.
- Hosting on **Render** (`render.yaml`, `npm start`).
- Docs: offline & devices guide, contributing, security, changelog.

### Changed
- Plain language everywhere: status names, measurements, body areas, alerts; "Medical words made simple" glossary.
- The error screen reloads once automatically after a redeploy and offers **Repair app** and error details.

### Fixed
- Live alarms made no sound (tone played before the audio engine had resumed).
- Pressing *Alarm sound off* could play a queued alarm.
- "Create mission" failed on Supabase (`gen_random_bytes` does not exist); invite codes now use built-in functions.
- Number formatting such as "6.8 below limit 6.8".

## 1.1.0 — Real app

### Added
- Accounts, missions and invite codes (Supabase Auth); Row Level Security with SQL tests.
- Offline outbox sync and realtime updates.
- Live Monitor: Bluetooth health devices, USB/Wi-Fi suit telemetry, EVA simulator with faults, debounced alarms.
- Ground Console for Mission Control: live crew status, alert feed with acknowledge, messages.

## 1.0.0 — NASA Space Apps 2026

### Added
- Rule-based triage engine (absolute limits, personal baseline, 11 combination rules) with comm-delay-aware escalation.
- Daily check-in, camera heart rate, body map, trends, reaction test, mood journal, guidance library, schedule, achievements, CMO view, ground link with PDF report, assistant, demo mission and guided tour, calm mode.
- Offline-first PWA with a hand-written service worker.
