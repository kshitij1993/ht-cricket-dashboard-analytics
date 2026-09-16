# Harrison Titans — Live Supabase Dashboard

The dashboard is now wired to the **actual Supabase schema** shown in your Table Editor.

## Your database structure

```text
public.app_data

key         text
value       jsonb
updated_at  timestamptz
```

Relevant rows:

```text
history
players
stats
live_match
```

The dashboard reads the first three and keeps `live_match` available for a future
live-score panel.

## What you need to do

### 1. Add your browser-safe Supabase key

Open:

```text
config.js
```

Replace:

```js
SUPABASE_ANON_KEY: "PASTE_YOUR_PUBLISHABLE_OR_ANON_KEY_HERE"
```

with your **Publishable** key (or legacy `anon` key).

Never use `service_role` or another secret key in GitHub Pages.

Your project URL is already configured:

```text
https://jdmfeaamadqhppjetwil.supabase.co
```

### 2. Apply the read-only RLS policy

Open Supabase → SQL Editor.

Run:

```text
supabase_readonly_rls.sql
```

The policy exposes only:

```text
history
players
stats
live_match
```

It does **not** expose `photos`, and it grants no insert/update/delete access.

### 3. Test before replacing the live dashboard

Deploy the folder to GitHub Pages, then open:

```text
https://YOUR-URL/connection-test.html
```

A successful response should show:

```text
SUCCESS
history ... OK
players ... OK
stats   ... OK
Matches: ...
Players: ...
```

### 4. Use the normal dashboard URL

Your normal:

```text
index.html
```

now loads directly from Supabase on every page load.

There is no JSON export step anymore.

## Realtime

`config.js` defaults to:

```js
realtime: true
```

When one of these rows changes:

```text
history
players
stats
live_match
```

the GitHub Pages dashboard automatically reloads and retrieves the current database
values.

Changes to `photos` are ignored.

If Realtime is not enabled for `app_data`, manual refresh still works.

To enable it, use the SQL line documented in:

```text
supabase_readonly_rls.sql
```

## File structure

```text
index.html
connection-test.html
config.js
supabase-loader.js
dashboard.js
README.md
DATA_SHAPES.md
supabase_readonly_rls.sql
```

## Deployment

Keep `index.html` as the permanent public filename.

Whenever the dashboard code changes, overwrite the existing files in the GitHub repo
and commit. Your public URL remains unchanged.
