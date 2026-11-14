# Contributing to VITALIS

Thanks for helping. Please read [AGENTS.md](AGENTS.md) (rules and where things live) and [ARCHITECTURE_ESSENTIALS.md](ARCHITECTURE_ESSENTIALS.md) first.

## Set up

```bash
npm install
npm run dev          # http://localhost:5173/?demo=1&tour=1
```

Node 18+ (tested on 22). No accounts or keys are needed: without a `.env` the app runs fully local.

## Make a change

1. Create a branch from `main`: `git checkout -b short-description`.
2. Keep the change small and focused. Follow the rules in AGENTS.md (pure engine, plain language, sources for thresholds, no `any`, accessibility).
3. Add or update tests next to engine changes (`*.test.ts`).
4. User-visible change? Add a line to [CHANGELOG.md](CHANGELOG.md) and update the FR table in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Before you open a pull request

All of these must pass:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

- UI change: try it in demo mode and check the browser console is clean.
- Offline change: `npm run build && npm run preview`, then turn the network off and reload.
- Database change: run the RLS tests (see AGENTS.md) and add a check.
- New dependency: ask the project owner first.

## Pull request

- Title says what changes, e.g. "Add hydration reminder after EVA".
- Describe what changed, why, and how you tested it; add a screenshot for UI changes.
- Never include `.env` files, keys or real health data.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, browser and device, and the text under **Details** on the error screen (if any). Security problems: see [SECURITY.md](SECURITY.md).
