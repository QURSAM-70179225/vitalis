# Deploying VITALIS

VITALIS is a **static site** (HTML/JS/CSS + service worker). Any static host works; no server is needed. Supabase (optional) is the backend.

Recommended: **Vercel** (free, builds straight from GitHub, HTTPS automatically). Netlify and Cloudflare Pages work the same way.

> HTTPS is required for the camera, Web Bluetooth, Web Serial and the service worker. All hosts below provide it.

## Option A — Vercel (recommended)

1. Go to <https://vercel.com>, **Sign up with GitHub**.
2. **Add New… → Project** → import **QURSAM-70179225/vitalis**.
3. Vercel detects **Vite**. Check:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. **Environment Variables** (only for real accounts; skip for demo-only):
   - `VITE_SUPABASE_URL` = `https://<your-project-id>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your **anon public** / **publishable** key (never the secret key)
5. Click **Deploy**. You get a URL like `https://vitalis-xxxx.vercel.app`.
6. Every `git push` to `main` redeploys automatically.

## Option B — Netlify

1. <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** → choose `vitalis`.
2. Build command `npm run build`, publish directory `dist`.
3. **Site configuration → Environment variables**: add the same two `VITE_SUPABASE_*` variables.
4. **Deploy site**.

## Option C — Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → `vitalis`.
2. Framework preset **Vite** (build `npm run build`, output `dist`).
3. Add the two environment variables → **Save and Deploy**.

## Option D — Render
**Blueprint (easiest):** the repo has a `render.yaml`. In Render choose **New + → Blueprint**, pick the repo, enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key only) or leave them empty for demo mode, then **Apply**. It creates a free Static Site with the right cache headers.

**Manual Static Site:** Build `npm ci && npm run build`, Publish directory `dist`, env `NODE_VERSION=22`, header `/sw.js` → `Cache-Control: no-cache`.

**Web Service (sleeps when idle on the free plan):** Build `npm ci && npm run build`, Start `npm start`, no health check path.

## After deploying (real-accounts mode)

1. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: your deployed URL (e.g. `https://vitalis-xxxx.vercel.app`)
   - **Redirect URLs**: add the same URL (and `http://localhost:5173` for local development)
   This makes confirmation and password-reset emails link to the live app.
2. Open the URL, create the Mission Control account, create the mission, share the crew code.

## Important notes

- `VITE_*` variables are **baked into the JavaScript at build time** and visible to anyone. That is fine for the Supabase **anon/publishable** key (RLS protects the data) but **not** for secret keys. Do **not** set `VITE_GROQ_API_KEY` on a public deployment — put an LLM behind a server/Edge Function instead.
- After changing environment variables, **redeploy** (Vercel: Deployments → ⋯ → Redeploy).
- Routing uses `#/` URLs, so no rewrite rules are needed.
- The service worker updates itself on the next visit after a deploy; a hard refresh (Ctrl+Shift+R) forces it.
- Demo link for judges: `https://<your-url>/?demo=1&tour=1` (always local, never touches the database).
