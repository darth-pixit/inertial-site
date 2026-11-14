# Inertial — launch site (deploy target)

This public repo exists only to serve the launch site on GitHub Pages.
**Do not edit here.** The source of truth is `apps/website/` in the main
(private) repo; changes land there, pass its brand guard and checks, and are
re-pushed with `apps/website/deploy/push-site.sh`.

- `index.html` — the whole site (home · trust · waitlist), self-contained.
- `privacy.html` — the trust page's privacy band as a standalone page,
  served extensionless at `/privacy` (the main page's `#privacy` still works).
- `config.js` — publishable Supabase client values (safe public by design:
  RLS makes the key insert-only; it can never read a signup back).
- `.github/workflows/pages.yml` — deploys to Pages on every push.
