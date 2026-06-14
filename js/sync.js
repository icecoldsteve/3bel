/* 3BEL — Sync tussen toestellen via server-side proxy (/api/sync).
   Offline-first: IndexedDB blijft de bron van waarheid, de cloud is de spiegel.
   Geen tokens in de browser — die staan server-side op Vercel. Standaard automatisch aan. */
const SYNC = (() => {
  const ENDPOINT = '/api/sync';
  const CODE_KEY = '3bel-sync-code';   // gedeelde bucket-code (zelfde op alle toestellen)
  const ON_KEY   = '3bel-sync-on';     // '0' = uit, anders aan
  const REV_KEY  = '3bel-rev';
  const META_KEY = '3bel-sync-meta';
  let pushTimer = null;

  function getCode() { return localStorage.getItem(CODE_KEY) || 'andry'; }
  function setCode(c) { localStorage.setItem(CODE_KEY, (c || 'andry')); }
  function isOn() { return localStorage.getItem(ON_KEY) !== '0'; }   // standaard AAN
  function setOn(v) { localStorage.setItem(ON_KEY, v ? '1' : '0'); }

  function getConfig() { return { code: getCode(), on: isOn() }; }
  function setConfig(c) { if (c && c.code != null) setCode(c.code); if (c && c.on != null) setOn(c.on); }
  function clearConfig() { setOn(false); }
  function isConfigured() { return isOn(); }

  function getRev() { return localStorage.getItem(REV_KEY) || ''; }
  function setRev(r) { localStorage.setItem(REV_KEY, r); }
  function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch { return null; } }
  function setMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }

  function ep() { return `${ENDPOINT}?code=${encodeURIComponent(getCode())}`; }

  async function remoteGet() {
    const r = await fetch(ep(), { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('GET ' + r.status);
    return r.json();                       // null of { rev, data }
  }
  async function remoteSet(payload) {
    const r = await fetch(ep(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('SET ' + r.status);
    return r.json();
  }

  async function buildPayload() {
    const data = await DB.exportAll();
    let rev = getRev();
    if (!rev) { rev = new Date().toISOString(); setRev(rev); }
    return { rev, data };
  }

  async function push() {
    if (!isOn()) return 'off';
    await remoteSet(await buildPayload());
    setMeta({ lastAt: new Date().toISOString(), status: 'pushed' });
    return 'pushed';
  }
  async function pull() { if (!isOn()) return null; return remoteGet(); }

  async function sync() {
    if (!isOn()) return 'off';
    try {
      const remote = await remoteGet();
      const localRev = getRev();
      if (remote && remote.rev && remote.rev > localRev) {
        await DB.importAll(remote.data, { replace: true });    // interne puts -> markeert niet "dirty"
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

  // Eerste koppeling van een toestel: cloud heeft data -> overnemen; cloud leeg -> zaaien.
  async function connect() {
    setOn(true);
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

  function _markDirty() {
    if (!isOn()) return;
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

  document.addEventListener('visibilitychange', () => { if (!document.hidden && isOn()) sync().catch(() => {}); });
  window.addEventListener('online', () => { if (isOn()) sync().catch(() => {}); });

  return { isConfigured, getConfig, setConfig, clearConfig, getCode, setCode, getRev, getMeta, sync, connect, push, pull, touch };
})();
