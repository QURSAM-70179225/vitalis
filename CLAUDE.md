# CLAUDE.md

Project instructions for Claude Code. The full, tool-agnostic guide is in AGENTS.md and is imported below so both stay in sync.

@AGENTS.md

## Claude-specific notes

- Start by reading `ARCHITECTURE_ESSENTIALS.md`; open `ARCHITECTURE.md` or `PRODUCT_REQUIREMENTS.md` only when the task needs it.
- Before finishing any change, run: `npm run typecheck && npm run lint && npm test && npm run build`, and report the results honestly (including failures).
- For UI changes, verify in a browser with `/?demo=1` (Playwright is fine) and check for console errors.
- Ask before adding a runtime dependency, changing `supabase/schema.sql` security rules, or pushing to `main`.
- Never print, log or commit Supabase/Groq keys. If a user pastes a secret key, tell them to use the anon/publishable key and to rotate the secret one.
- Keep user-facing copy calm, plain and non-diagnostic.
