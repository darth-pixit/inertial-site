/**
 * Site config for real deployments (GitHub Pages / any static host).
 *
 * These are the same PUBLISHABLE Supabase client values the mobile app ships
 * in its bundle (apps/mobile/.env.production) — safe here BY DESIGN: with RLS
 * on, the anon key can insert a waitlist row but can never read one back
 * (see packages/db/migrations/0008_waitlist.sql).
 *
 * The artifact/preview deployment ships index.html WITHOUT this file, so the
 * waitlist there renders its honest "not collecting numbers yet" state.
 * The form also degrades to that state until 0008_waitlist.sql is applied to
 * the hosted project (it answers 404 until then).
 */
window.INERTIAL_SITE = {
  waitlist: {
    url: 'https://tncfbfxdhamnnnxmzwrg.supabase.co',
    anonKey: 'sb_publishable_sYAqsc86qBgr7dTsh6Fj1A_Yv9npdXl',
  },
};
