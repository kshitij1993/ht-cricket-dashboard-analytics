-- Harrison Titans — GitHub Pages READ-ONLY access
--
-- Your schema:
-- public.app_data(key text primary key, value jsonb, updated_at timestamptz)
--
-- This policy exposes ONLY the cricket rows required by the public dashboard.
-- It does NOT expose the "photos" row and does NOT grant write access.

alter table public.app_data enable row level security;

drop policy if exists "Public dashboard can read cricket data" on public.app_data;

create policy "Public dashboard can read cricket data"
on public.app_data
for select
to anon
using (
  key in ('history', 'players', 'stats', 'live_match')
);

grant select on table public.app_data to anon;

-- OPTIONAL REALTIME
-- If app_data is not already enabled for Realtime, run:
--
-- alter publication supabase_realtime add table public.app_data;
--
-- If Supabase reports that the table is already in the publication,
-- no further action is needed.
