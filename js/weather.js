/* 3BEL — Weer (Open-Meteo, gratis & zonder API-key) */
const WEATHER = (() => {
  const CACHE_KEY = '3bel-weather';
  const MAX_AGE_MS = 3 * 60 * 60 * 1000;            // 3 uur
  const RAIN_THRESHOLD = 50;                         // % neerslagkans -> waarschuwen
  const LAT = (typeof GEO !== 'undefined' ? GEO.BASE.lat : 51.097);
  const LNG = (typeof GEO !== 'undefined' ? GEO.BASE.lng : 2.593);

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

  async function refresh() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}`
      + `&daily=precipitation_probability_max,weathercode,temperature_2m_max`
      + `&timezone=Europe%2FBrussels&forecast_days=16`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('weer ' + res.status);
    const j = await res.json();
    const days = {};
    const t = j.daily?.time || [];
    for (let i = 0; i < t.length; i++) {
      days[t[i]] = {
        pop: j.daily.precipitation_probability_max?.[i] ?? null,
        code: j.daily.weathercode?.[i] ?? null,
        tmax: j.daily.temperature_2m_max?.[i] ?? null,
      };
    }
    const data = { fetchedAt: Date.now(), days };
    writeCache(data);
    return data;
  }

  // Zorgt dat we (verse) data hebben; valt terug op cache bij offline/fout.
  async function ensure() {
    const c = readCache();
    const fresh = c && (Date.now() - c.fetchedAt) < MAX_AGE_MS;
    if (fresh) return c;
    try { return await refresh(); }
    catch { return c || { fetchedAt: 0, days: {} }; }
  }

  function forDate(iso) {
    const c = readCache();
    return c?.days?.[iso] || null;
  }

  // Geeft een badge terug voor regenachtige dagen, anders null.
  function badge(iso) {
    const d = forDate(iso);
    if (!d || d.pop == null) return null;
    if (d.pop >= RAIN_THRESHOLD) return { emoji: '☔', pop: d.pop };
    return null;
  }

  function label(iso) {
    const d = forDate(iso);
    if (!d || d.pop == null) return null;
    const t = d.tmax != null ? `${Math.round(d.tmax)}°` : '';
    return { pop: d.pop, tmax: t, rainy: d.pop >= RAIN_THRESHOLD };
  }

  return { ensure, refresh, forDate, badge, label, RAIN_THRESHOLD };
})();
