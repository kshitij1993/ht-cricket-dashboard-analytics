/*
  Harrison Titans — Supabase connection

  Exact schema from your Supabase Table Editor:
    public.app_data
      key        text        (primary key)
      value      jsonb
      updated_at timestamptz

  Dashboard rows used:
    history
    players
    stats

  Optional future row:
    live_match

  IMPORTANT:
  Use only your browser-safe Supabase Publishable/Anon key here.
  NEVER put a service_role / secret key in a GitHub Pages repository.
*/

window.APP_CONFIG = {
  SUPABASE_URL: "https://jdmfeaamadqhppjetwil.supabase.co",

  // Paste the browser-safe Publishable / legacy anon key here.
  SUPABASE_ANON_KEY: "PASTE_YOUR_PUBLISHABLE_OR_ANON_KEY_HERE",

  table: "app_data",

  // Rows required to build the dashboard.
  dashboardKeys: ["history", "players", "stats"],

  // Optional row that can later power a live-match panel.
  liveMatchKey: "live_match",

  // Automatically refresh the page when app_data changes.
  realtime: true,

  // Prevent multiple rapid writes from causing multiple reloads.
  realtimeRefreshDelayMs: 900
};
