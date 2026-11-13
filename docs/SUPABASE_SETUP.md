# Setting up real accounts (Supabase)

With Supabase configured, VITALIS becomes a multi-user app:

- every astronaut **creates an account once** and stays signed in (it keeps working offline),
- their check-ins, sensor data, alerts and health packets **sync to the mission database** whenever a connection exists,
- **Mission Control** (flight surgeons, engineers on Earth) sign in to the **Ground Console**, see the crew live, get critical alerts in real time, acknowledge them and message the crew.

Without these settings the app runs fully on one device (demo/local mode), exactly as before.

## 1. Create a Supabase project (free)

1. Go to <https://supabase.com>, sign up, and click **New project**.
2. Pick a name (e.g. `vitalis`), a strong database password and the region closest to you. Wait ~2 minutes.

## 2. Create the database tables and security rules

1. In your project open **SQL Editor → New query**.
2. Open the file `supabase/schema.sql` from this project, copy **all** of it, paste it in, and click **Run**.
   You should see "Success. No rows returned". Running it again is safe.

This creates the tables, the invite-code functions and the **Row Level Security** rules:

| Who | Can see |
|---|---|
| Astronaut | Only their own health data. Crewmates' names, but not their health data |
| Crew Medical Officer (CMO) | The whole crew's health data (not journals) |
| Mission Control (ground) | The whole crew's health data (not journals), invite codes, and can message crew and acknowledge alerts |
| Anyone else | Nothing |

Journal entries are readable **only by their owner**. Passwords are stored by Supabase Auth as secure hashes; VITALIS tables never contain them.

## 3. Authentication settings

**Authentication → Providers → Email** is enabled by default. Two options:

- **Keep "Confirm email" ON** (recommended for real use): new users click a link in their email before signing in.
- **Turn it OFF** for a quick hackathon demo, so users can sign in right after creating an account.

Under **Authentication → URL Configuration**, set **Site URL** to where the app runs (e.g. `http://localhost:5173` while developing, or your deployed URL). Confirmation and password-reset links point there.

## 4. Connect the app

1. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
2. In the project folder copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`) and fill in:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   > ⚠️ Only the **anon** key goes in the app. It is safe to ship because Row Level Security protects the data. **Never** use the `service_role` key here.

3. Restart the dev server (`Ctrl+C`, then `npm run dev`). The app now opens on the **Sign in / Create account** screen.

## 5. Create the mission and invite people

1. Mission Control creates an account → **Create a new mission** → role **Mission Control (ground)**.
2. Open **Settings**: you'll see two invite codes:
   - **Crew code** → astronauts (tick "I'm the Crew Medical Officer" for the CMO),
   - **Ground code** → other flight surgeons/engineers.
3. Each astronaut creates their own account and joins with the crew code. Their role comes from the code, so nobody can make themselves "ground".

## 6. Realtime

`schema.sql` adds the alert, message, packet, check-in and vitals tables to Supabase Realtime automatically. If live updates don't appear, check **Database → Publications → supabase_realtime** and make sure those tables are enabled.

Live sensor streams (every 2 s) use Realtime **Broadcast** on a channel named after the mission's private UUID; they are not stored. One-minute averages are stored in `vital_samples`.

## 7. Deploying (optional)

Build with `npm run build` and host the `dist/` folder on any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the host's settings, and add the deployed URL to Supabase **Site URL**. Web Bluetooth, Web Serial and the camera require **HTTPS** (or `localhost`).

## Testing the security rules yourself

`supabase/tests/` contains a script that loads `schema.sql` into plain PostgreSQL with a stand-in `auth` schema and checks 16 access rules (e.g. "astronaut cannot read a crewmate's health data", "crew cannot read invite codes", "journal is private"). It is for local testing only. Do **not** run the stub file in Supabase.

## Important limits

- Supabase's free plan is **not certified for real patient data** (e.g. HIPAA). Use it for prototypes and made-up data. A real program needs a provider and plan with the required agreements.
- A real deep-space mission would not use the public internet. The outbox/sync design (store locally → forward when a link exists) is the same idea as NASA's Delay/Disruption Tolerant Networking, and Supabase stands in for the ground segment.
