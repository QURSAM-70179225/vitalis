# Security & privacy

VITALIS handles health data, so security and privacy are part of its design. This page explains the model and how to report a problem.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Contact the project owner privately through their GitHub profile ([QURSAM-70179225](https://github.com/QURSAM-70179225)) with a description, steps to reproduce and the impact. You will get a reply as soon as possible, and credit in the changelog if you want it.

## Where data lives

| Mode | Data location | Leaves the device when… |
|---|---|---|
| Local / demo | IndexedDB on the device | You tap *Send to Ground*, export a file, send a hand-off file, or turn on the optional AI layer |
| Accounts (Supabase) | IndexedDB + Supabase Postgres | Your records sync to your mission; protected by Row Level Security |

## Protections

- **Row Level Security** on every table (`supabase/schema.sql`), tested by `supabase/tests/rls_test.sql`:
  astronauts read only their own health data; CMO and ground read the crew; **journals are owner-only**; roles come from invite codes and cannot be self-assigned; alert acknowledgement only through a checked function.
- **Keys:** the browser holds only the Supabase **anon/publishable** key (`sb_publishable_…`). The **secret / service_role** key must never be used in the app, in a `VITE_` variable, in a commit, or pasted anywhere public. If it leaks, rotate it in Supabase → Project Settings → API Keys.
- **Anything in a `VITE_` variable is public:** it is copied into the website files.
- **Passwords** are handled by Supabase Auth (hashed). The optional local passcode lock uses PBKDF2-SHA-256 with 120,000 iterations.
- **Hand-off files** (device to device) contain health records and the private journal and are **not encrypted**: send them only to your own devices. Passcode and settings are never included.
- **Ground packets** and the Ground Console never include journal notes.
- The **AI layer** is off by default; when on, only the rule-engine summary is sent, never journal notes.

## Not for real patient data (yet)

VITALIS is a prototype and decision-support tool, not a certified medical device. Supabase's free plan is not certified for regulated health data (e.g. HIPAA). Use made-up data unless you deploy on a compliant plan or provider.

## Checklist for contributors

- [ ] No `.env`, keys or tokens in commits (`git status` before committing).
- [ ] New tables: RLS enabled, policies + grants, a check in `rls_test.sql`.
- [ ] Journal data never added to CMO/ground views, packets or exports for others.
- [ ] No client code that sets `profiles.role` or `mission_id`.
