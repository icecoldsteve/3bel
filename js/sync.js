/* 3BEL — Sync tussen toestellen (Upstash Redis REST, offline-first)
   - IndexedDB blijft de bron van waarheid; de cloud is enkel de spiegel.
   - Last-write-wins op basis van een revisie-timestamp. */
const SYNC = (() => {
  const CFG_KEY  = '3bel-sync';      // { url, token, code }
  const REV_KEY  = '3bel-rev';       // ISO timestamp laatste lokale wijziging
  const META_KEY = '3bel-sync-meta'; // { lastAt, status }
  let pushTimer = null;

  function getConfig() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { return null; } }
  function setConfig(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
  function clearConfig() { localStorage.removeItem(CFG_KEY); }
  function isConfigured() { const c = getConfig(); return !!(c && c.url && c.token); }

  function getRev() { return localStorage.getItem(REV_KEY) || ''; }
  function setRev(r) { localStorage.setItem(REV_KEY, r); }
  function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch { return null; } }
  function setMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }

  function keyName() { const c = getConfig(); return `3bel:${(c && c.code) || 'andry'}`; }
  function base() { return (getConfig().url || '').replace(/\/+$/, ''); }
  function headers() { return { Authorization: `Bearer ${getConfig().token}` }; }

  // ── Upstash REST ──
  async function remoteGet() {
    const res = await fetch(`${base()}/get/${encodeURIComponent(keyName())}`, { headers: headers() });
    if (!res.ok) throw new Error('GET ' + res.status);
    const j = await res.json();
    if (j.result == null) return null;
    try { return JSON.parse(j.result); } catch { return null; }
  }
  async function remoteSet(payloadObj) {
    const res = await fetch(`${base()}/set/${encodeURIComponent(keyName())}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payloadObj),
    });
    if (!res.ok) throw new Error('SET ' + res.status);
    return res.json();
  }

  async function buildPayload() {
    const data = await DB.exportAll();
    let rev = getRev();
    if (!rev) { rev = new Date().toISOString(); setRev(rev); }
    return { rev, data };
  }

  async function push() {
    if (!isConfigured()) return 'off';
    const payload = await buildPayload();
    await remoteSet(payload);
    setMeta({ lastAt: new Date().toISOString(), status: 'pushed' });
    return 'pushed';
  }

  async function pull() {
    if (!isConfigured()) return null;
    return remoteGet();
  }

  // Hoofd-sync: vergelijkt revisies en kiest pull of push.
  async function sync() {
    if (!isConfigured()) return 'off';
    try {
      const remote = await remoteGet();
      const localRev = getRev();
      if (remote && remote.rev && remote.rev > localRev) {
        await DB.importAll(remote.data, { replace: true }); // interne puts -> markeert niet "dirty"
        setRev(remote.rev);
        setMeta({ lastAt: new Date().toISOString(), status: 'pulled' });
        window.dispatchEvent(new CustomEvent('3bel:synced', { detail: { action: 'pulled' } }));
        return 'pulled';
      } else if (localRev && (!remote || localRev > (remote.rev || ''))) {
        await push();
        return 'pushed';
      }
      setMeta({ lastAt: new Date().toISOString(), status: 'insync' });
      return 'insync';
    } catch (e) {
      setMeta({ lastAt: new Date().toISOString(), status: 'error: ' + e.message });
      throw e;
    }
  }

  // Eerste koppeling: cloud heeft data -> dit toestel neemt cloud over.
  // Cloud leeg -> dit toestel zaait de cloud.
  async function connect() {
    if (!isConfigured()) return 'off';
    const remote = await remoteGet();
    if (remote && remote.data && (remote.data.customers?.length || remote.data.appointments?.length)) {
      await DB.importAll(remote.data, { replace: true });
      setRev(remote.rev || new Date().toISOString());
      setMeta({ lastAt: new Date().toISOString(), status: 'pulled' });
      window.dispatchEvent(new CustomEvent('3bel:synced', { detail: { action: 'pulled' } }));
      return 'pulled';
    } else {
      setRev(new Date().toISOString());
      await push();
      return 'pushed';
    }
  }

  // ── Dirty-tracking: wrap DB-schrijfmethodes zodat elke wijziging een push plant ──
  function _markDirty() {
    if (!isConfigured()) return;
    setRev(new Date().toISOString());
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { push().catch(() => {}); }, 1500);
  }
  function touch() { _markDirty(); }

  function _wrap() {
    if (typeof DB === 'undefined' || DB.__synced) return;
    ['add', 'put', 'remove', 'clear', 'wipe'].forEach((m) => {
      const orig = DB[m];
      if (typeof orig !== 'function') return;
      DB[m] = async function (...args) { const r = await orig.apply(DB, args); _markDirty(); return r; };
    });
    DB.__synced = true;
  }
  _wrap();

  // Sync bij terugkeer naar de app en bij online komen.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isConfigured()) sync().catch(() => {}); });
  window.addEventListener('online', () => { if (isConfigured()) sync().catch(() => {}); });

  return { isConfigured, getConfig, setConfig, clearConfig, getRev, getMeta, sync, connect, push, pull, touch };
})();
