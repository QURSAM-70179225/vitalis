# VITALIS — Product Requirements Document

| | |
|---|---|
| **Product** | VITALIS — Astronaut Health Command Center |
| **Context** | NASA Space Apps Challenge 2026 — *Create Health Monitoring Software for Astronauts on Space Missions* |
| **Status** | v1 built and tested (local/demo mode, real accounts via Supabase, sensor integration, Ground Console) |
| **Owner** | QURSAM-70179225 |
| **Last updated** | 2026-11-13 |

---

## 1. Problem

On deep-space missions the one-way communication delay to Earth is **4–22 minutes** (Mars), so a question to a flight surgeon and its answer take up to ~45 minutes. There is no resupply and no quick return. NASA's Human Research Program lists **Distance from Earth** as one of the five hazards of spaceflight for exactly this reason: crews must detect, understand and act on medical issues **autonomously**.

Raw numbers do not help a non-medical crew member. Seeing "BP 133/82" they need to know: *Is that bad? Why? What do I do now? When do I escalate?*

## 2. Product vision

> An offline-first app that helps astronauts check their own health, spot risky trends early, and know exactly what to do — even when Earth is 20 minutes away.

**Core insight:** VITALIS turns readings into **status → explanation → action → escalation**, works fully offline, and keeps Mission Control in the loop whenever a link exists.

## 3. Goals and non-goals

### Goals
1. Give each astronaut a **clear status** (🟢 Nominal / 🟡 Monitor / 🟠 Act Now / 🔴 Contact Flight Surgeon) with a plain-language **why** for every flag.
2. Detect changes that are **"normal on paper but abnormal for you"** using personal baselines.
3. Tell the crew **what to do now**, with checklists timed to the communication delay.
4. Measure **automatically** from medical devices, suits and wearables wherever possible.
5. Work **100% offline**; sync to Earth when a link is available.
6. Let **Mission Control** follow the crew live, receive critical alerts instantly, acknowledge them and message the crew.
7. Be usable with gloves, under stress, by non-experts (accessible, calm, large targets).

### Non-goals
- Diagnosing disease or prescribing medication (VITALIS is decision support only).
- Replacing certified flight medical systems or suit caution-and-warning systems.
- Storing real patient data on non-certified infrastructure.

## 4. Users and personas

| Persona | Needs | Primary surfaces |
|---|---|---|
| **Astronaut** (non-medical) | Fast daily check-in, clear status, what to do, privacy | Dashboard, Check-In, Live Monitor, Mind, Guidance, Schedule |
| **Crew Medical Officer (CMO)** | See the whole crew, triage alerts, act before the ground answers | Crew view, Ground Console, alert queue |
| **Mission Control / flight surgeon** (Earth) | Live crew status, critical alerts in real time, send guidance | Ground Console, Trends, Dashboard per crew member |
| **Hackathon judge** | Understand the value in 60 seconds | Demo mode (`?demo=1&tour=1`), guided tour |

## 5. User stories

- As an **astronaut**, I complete a daily check-in in under 3 minutes, with vitals auto-filled from my devices.
- As an **astronaut**, when something is off, I see *why* in one sentence and a checklist of what to do now.
- As an **astronaut**, during an EVA my suit telemetry is monitored and I get an audible alarm within seconds if something goes wrong.
- As an **astronaut**, my private journal is never visible to anyone else.
- As an **astronaut**, the app keeps working with no connection and uploads later.
- As a **CMO**, I see every crewmate's status and an alert queue sorted by severity.
- As a **flight surgeon on Earth**, I get a realtime notification for critical alerts, can acknowledge them, and can message the astronaut.
- As **Mission Control**, I create a mission and invite crew with a code; roles come from the code.
- As a **judge**, one link loads a 90-day Mars mission with a guided tour.

## 6. Functional requirements

Status: ✅ implemented and tested · 🧪 implemented, needs real-world validation

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| **FR-1** | Mission context | Choose environment (ISS, Gateway, Lunar surface, Mars transit, Mars surface, Rover); sets gravity, comm delay, radiation baseline, emphasized risks. Persistent top bar: mission day, environment, delay, last sync, crew member. | ✅ |
| **FR-2** | Daily check-in | Guided wizard ≤ 3 min; 16 indicators + 12 symptoms; ±/slider/keyboard input; live status chip per value; "How to measure in space" panel per indicator. | ✅ |
| **FR-3** | Triage engine | Absolute thresholds + personal baseline (14-day mean/SD, \|z\| ≥ 2, 3-day sustained trends) + 11 combination rules; every alert has *why*, actions, escalate-when, hazards, guidance links. Thresholds in one sourced config. | ✅ |
| **FR-4** | Comm-delay-aware escalation | Act/critical alerts state the earliest ground response (2 × one-way delay) and say to start steps now. | ✅ |
| **FR-5** | Interactive body map | Front/back SVG, 8 systems coloured by status, keyboard accessible, heart pulses at latest HR, glow on flagged regions, side panel with details. | ✅ |
| **FR-6** | Trends & insights | Charts for every indicator with normal band, personal baseline band, event markers, 7/30/90-day ranges, correlation insights. | ✅ |
| **FR-7** | Cognitive & behavioral | PVT reaction test, mood journal with isolation wellbeing score, connect-with-home reminder, 4-7-8 breathing. | ✅ |
| **FR-8** | Guidance library | Sourced countermeasure cards; flagged indicators link to their card; recommended cards first. | ✅ |
| **FR-9** | Adaptive schedule & prompts | Daily routine; extra checks added while a risk is elevated; prompts at scheduled times. | ✅ |
| **FR-10** | Gamification (crew-positive) | XP/streaks/badges for habits, cooperative crew challenges, readiness score 0–100; no health leaderboards. | ✅ |
| **FR-11** | CMO crew view | All crew cards, severity-sorted alert queue with acknowledge. | ✅ |
| **FR-12** | Ground link & report | Compressed JSON packet + one-page PDF; private notes excluded. Demo: simulated light-time + reply. Cloud: real upload. | ✅ |
| **FR-13** | Camera vitals (experimental) | rPPG heart-rate with waveform and confidence; image log per body region. | 🧪 |
| **FR-14** | Health assistant | Offline rule-engine explanations; optional LLM layer OFF by default; never diagnoses; always shows triage level + escalation. | ✅ |
| **FR-15** | Demo mode + tour | One click/URL loads 90 days × 4 crew with scripted events; ~60 s guided tour. | ✅ |
| **FR-16** | Calm mode | One-tap full-screen high-contrast emergency checklist. | ✅ |
| **FR-17** | Accounts | Email + password via Supabase Auth; sign up once, stay signed in, works offline; password reset. | ✅ (mocked API) 🧪 (live project) |
| **FR-18** | Missions & roles | Create mission; separate crew and ground invite codes; role assigned by code; CMO option. | ✅ (RLS tests) |
| **FR-19** | Data privacy (RLS) | Astronaut: own data only; CMO/ground: mission crew; journals owner-only; other missions isolated. | ✅ (16 SQL checks) |
| **FR-20** | Offline sync | Local-first writes; outbox survives reloads; uploads automatically on reconnect; status badge with pending count. | ✅ (mocked API) |
| **FR-21** | Live sensor monitoring | Bluetooth GATT health profiles; USB/Wi-Fi suit telemetry (JSON lines); simulator with fault injection; debounced alarms; 1-min aggregates; check-in auto-fill. | ✅ (simulator, parsers) 🧪 (real devices) |
| **FR-22** | Ground Console | Crew cards with live sensor strips; realtime act/critical alert feed with acknowledge; per-crew messages; packets with PDF. | ✅ (demo + mocked API) 🧪 (live Realtime) |
| **FR-24** | Radiation exposure summary | Dashboard panel: today's dose (× environment typical), mission total vs NASA 600 mSv career limit with progress bar, peak day, days left at the current 7-day rate; CSA radiation-monitoring resource linked. | ✅ |
| **FR-25** | Sources & non-endorsement | About & Sources page lists the 5 official Space Apps resources (NASA HRP hazards, risks, ongoing research; CSA radiation monitoring; CSA science in space) with how each is used, Benefits on Earth, and a non-endorsement statement; guides and body-system panels link to the relevant resource. | ✅ |
| **FR-26** | Health journey | Health map of 8 body areas × days for 30/40/60/90 days with events; animated body replay; first-vs-latest comparison with plain explanations of how space affects each measure. | ✅ |
| **FR-27** | Input methods & report scan | Check-in offers typing, report scan (photo via browser text detector, or pasted text), Bluetooth device, camera; values found in reports are confirmed by the user before use. | ✅ (text) 🧪 (photo: browsers with a text detector) |
| **FR-28** | Emotional wellbeing far from home | Days away, 30-day mood calendar, mood-aware support suggestions, coping question about distance from home. | ✅ |
| **FR-29** | Status banner & alert sounds | Plain-language banner; chime when all good, repeating beep + vibration when urgent; replay button; setting to turn off. | ✅ |
| **FR-30** | Plain language | Everyday names for statuses, measurements, body areas and alerts; glossary of medical words. | ✅ |
| **FR-31** | Chatbot daily summary | Assistant opens with today's condition, readings and actions; answers progress-over-time questions. | ✅ |
| **FR-23** | Settings & data | Units, high contrast, reduced motion, threshold editing, passcode lock, export/import/wipe, invite codes, sign out. | ✅ |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Offline** | Every feature works without a network after first load (service worker precache + IndexedDB). Verified by reloading the production build with the network cut. |
| **Accessibility** | WCAG 2.1 AA; colour never the only signal (icon + text); keyboard operable; ≥ 44 px targets (56 px check-in controls); high-contrast and reduced-motion modes. Lighthouse accessibility 96–100. |
| **Privacy** | Local mode: nothing leaves the device unless *Send to Ground*. Cloud mode: RLS enforced server-side; journals owner-only; no passwords in app tables; only the anon/publishable key in the client. |
| **Security** | Roles cannot be self-assigned; invite codes hidden from crew; alert acknowledgements only via RPC by CMO/ground. |
| **Reliability** | Error boundary per page; outbox retries with poison-item protection; idempotent upserts with device-generated IDs. |
| **Performance** | Code-split pages; heavy libraries (charts, PDF) lazy-loaded; charts mount on scroll. |
| **Quality** | TypeScript strict, no `any`; ESLint clean; 103 unit tests; RLS SQL tests. |
| **Safety** | Every screen states decision support, not diagnosis; thresholds carry sources; LLM output always followed by rule-engine triage. |

## 8. Success metrics

| Metric | Target |
|---|---|
| Daily check-in completion time | < 3 min (≈ 1 min with device auto-fill) |
| Time from sensor critical value to on-screen alarm | ≤ 3 s |
| Time from alarm to Mission Control notification (link up) | ≤ 5 s |
| Unsynced data loss after offline period | 0 records |
| Accessibility (Lighthouse) | ≥ 90 on every page |
| Judge comprehension | Core value understood within the 60-second tour |

## 9. Release scope

| Release | Contents | State |
|---|---|---|
| **v1.0 — Hackathon** | FR-1 … FR-16, PWA, demo, docs | Done |
| **v1.1 — Real app** | FR-17 … FR-23 (accounts, RLS, sync, sensors, Ground Console) | Done; needs validation on a live Supabase project and real devices |
| **v1.2 — Next** | Deployment, live-project validation, image sync to Storage, private Realtime channels for live streams | Planned |

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Misplaced trust in a non-certified tool | Disclaimers everywhere; "escalate when" on every alert; never diagnose |
| False alarms from noisy sensors | Debounced alarms (3 s critical / 8 s act); physical range validation; personal baselines |
| Data leakage between users | RLS tested with 16 SQL checks; column privileges; roles from invite codes |
| Data loss offline | IndexedDB outbox with retries; sign-out warns if uploads are pending |
| Suit integration access | Open JSON-lines protocol; vendor bridge required for flight suits |
| Browser support (Web Bluetooth/Serial) | Clear notices; Chrome/Edge required; simulator fallback |
| Real medical data on free cloud tier | Documented: prototype data only until a compliant plan/provider is used |

## 11. Open questions

1. Should Mission Control be able to edit an astronaut's thresholds remotely?
2. Should image attachments sync (Supabase Storage) or stay on-device for privacy?
3. Should live sensor streams move to private Realtime channels with RLS authorization?
4. Which devices to certify as "recommended" for the demo kit?

---

> ⚠️ VITALIS is decision support, not diagnosis. It never replaces the Crew Medical Officer or flight surgeon.
