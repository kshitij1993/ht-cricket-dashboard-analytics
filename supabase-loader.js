(() => {
  const cfg = window.APP_CONFIG || {};
  const statusEl = document.getElementById("dataStatus");

  function setStatus(message, type = "") {
    if (!statusEl) return;
    statusEl.className = `data-status ${type}`.trim();
    statusEl.innerHTML = message;
  }

  function assertConfig() {
    if (!cfg.SUPABASE_URL || !/^https:\/\/.+\.supabase\.co\/?$/.test(cfg.SUPABASE_URL)) {
      throw new Error("SUPABASE_URL is missing or invalid in js/config.js.");
    }
    if (!cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("PASTE_")) {
      throw new Error("Add your Supabase Publishable/Anon key in js/config.js.");
    }
    if (!cfg.table) throw new Error("Supabase table is not configured.");
  }

  function normalizeRaw(rows) {
    const byKey = Object.fromEntries((rows || []).map(row => [row.key, row.value]));

    const history = byKey.history;
    const players = byKey.players;
    const stats = byKey.stats;

    if (!Array.isArray(history)) {
      throw new Error('app_data["history"].value must be a JSON array of matches.');
    }
    if (!Array.isArray(players)) {
      throw new Error('app_data["players"].value must be a JSON array of player names.');
    }
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
      throw new Error('app_data["stats"].value must be a JSON object.');
    }

    return {
      players,
      stats,
      history,
      live_match: byKey[cfg.liveMatchKey] ?? null,
      exportDate: new Date().toISOString()
    };
  }

  async function fetchDashboardRows(client) {
    const required = cfg.dashboardKeys || ["history", "players", "stats"];
    const requested = [...new Set([...required, cfg.liveMatchKey].filter(Boolean))];

    const { data, error } = await client
      .from(cfg.table)
      .select("key,value,updated_at")
      .in("key", requested);

    if (error) throw error;

    const found = new Set((data || []).map(row => row.key));
    const missing = required.filter(k => !found.has(k));

    if (missing.length) {
      throw new Error(`Missing app_data row(s): ${missing.join(", ")}.`);
    }

    return data || [];
  }

  function validateMatchShape(raw) {
    const sample = raw.history?.[0];
    if (!sample) throw new Error("The history row contains no matches.");

    const missing = ["date", "teamA", "teamB"].filter(k => sample[k] === undefined);
    if (missing.length) {
      throw new Error(
        `History loaded but match objects are missing: ${missing.join(", ")}.`
      );
    }
  }

  function loadDashboardScript() {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `dashboard.js?v=${Date.now()}`;
      s.dataset.dashboard = "true";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load js/dashboard.js"));
      document.body.appendChild(s);
    });
  }

  async function boot(client) {
    setStatus("<b>Syncing Supabase…</b><br>Reading live cricket data.");

    const rows = await fetchDashboardRows(client);
    const raw = normalizeRaw(rows);
    validateMatchShape(raw);

    window.RAW = raw;

    await loadDashboardScript();

    const matchCount = raw.history.length;
    const latest = rows
      .map(r => r.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    setStatus(
      `<b>Live Supabase data</b><br>` +
      `${matchCount} match${matchCount === 1 ? "" : "es"} loaded` +
      `${latest ? ` · updated ${new Date(latest).toLocaleString()}` : ""}.`,
      "ok"
    );

    setTimeout(() => {
      if (statusEl) statusEl.style.opacity = "0.42";
    }, 4000);
  }

  async function startRealtime(client) {
    if (!cfg.realtime) return;

    let timer = null;
    const relevantKeys = new Set([
      ...(cfg.dashboardKeys || []),
      cfg.liveMatchKey
    ].filter(Boolean));

    client
      .channel("harrison-titans-app-data-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: cfg.table },
        payload => {
          const changedKey = payload?.new?.key || payload?.old?.key;

          // Ignore unrelated app_data rows, such as photos.
          if (changedKey && !relevantKeys.has(changedKey)) return;

          clearTimeout(timer);
          timer = setTimeout(() => {
            location.reload();
          }, cfg.realtimeRefreshDelayMs || 900);
        }
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          console.warn(
            "Supabase Realtime is unavailable. Manual page refresh will still load current data."
          );
        }
      });
  }

  async function init() {
    try {
      assertConfig();

      if (!window.supabase?.createClient) {
        throw new Error("Supabase JavaScript library did not load.");
      }

      const client = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      window.htSupabase = client;

      await boot(client);
      await startRealtime(client);

    } catch (err) {
      console.error(err);

      setStatus(
        `<b>Dashboard could not connect</b><br>` +
        `${String(err.message || err)}<br><br>` +
        `Check <code>config.js</code> and the read-only RLS policy on <code>public.app_data</code>.`,
        "error"
      );
    }
  }

  init();
})();
