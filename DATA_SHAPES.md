# Actual Supabase schema

The Harrison Titans app uses a single key/value table:

```text
public.app_data

key         text         primary key
value       jsonb
updated_at  timestamptz
```

Observed keys:

```text
history
live_match
photos
players
stats
```

The dashboard reads:

- `history.value` → match history array
- `players.value` → player-name array
- `stats.value` → aggregate stats object
- `live_match.value` → optional, reserved for a future live-match panel

The dashboard deliberately does **not** request `photos`.

No additional database transformation is required. `js/supabase-loader.js`
reconstructs the same object that the old JSON export provided:

```js
window.RAW = {
  players,
  stats,
  history,
  live_match
}
```

The existing dashboard analytics then run unchanged.
