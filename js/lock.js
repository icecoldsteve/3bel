/* 3BEL — PIN-slot. Vergrendelt de app bij het openen; geeft pas vrij (en synct pas)
   na de juiste code. We bewaren geen platte pincode — enkel een SHA-256 hash. */
const LOCK = (() => {
  const LEN = 6;
  const SES_KEY = '3bel-unlocked';
  // Standaard PIN-hash (SHA-256). Te overschrijven via localStorage '3bel-pinhash'.
  const DEFAULT_HASH = '94417ee1e936c9b30d436fcef7753e936c0439960125c62e1c2613c2f08f86e5';
  function pinHash() { return localStorage.getItem('3bel-pinhash') || DEFAULT_HASH; }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  let entered = '', resolveFn = null, onKey = null;

  function dotsHTML() {
    let d = '';
    for (let i = 0; i < LEN; i++) d += `<span class="lock-dot ${i < entered.length ? 'is-on' : ''}"></span>`;
    return d;
  }
  function renderDots() { const el = document.getElementById('lock-dots'); if (el) el.innerHTML = dotsHTML(); }

  function shakeClear(msg) {
    const card = document.querySelector('.lock-card');
    const err = document.getElementById('lock-err');
    if (err) err.textContent = msg || 'Verkeerde code';
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    entered = ''; renderDots();
  }

  async function submit() {
    const ok = (await sha256(entered)) === pinHash();
    if (ok) {
      sessionStorage.setItem(SES_KEY, '1');
      const scr = document.getElementById('lock-screen');
      if (scr) { scr.classList.add('lock-out'); setTimeout(() => scr.remove(), 220); }
      document.removeEventListener('keydown', onKey);
      const r = resolveFn; resolveFn = null; if (r) r();
    } else {
      shakeClear('Verkeerde code — probeer opnieuw');
    }
  }

  function press(d) {
    if (entered.length >= LEN) return;
    entered += d; renderDots();
    if (entered.length === LEN) setTimeout(submit, 120);
  }
  function del() { entered = entered.slice(0, -1); renderDots(); }

  function showLock(resolve) {
    resolveFn = resolve; entered = '';
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    const pad = keys.map(k => k === ''
      ? `<span class="lock-key lock-key-empty"></span>`
      : `<button type="button" class="lock-key" data-k="${k}">${k}</button>`).join('');
    const el = document.createElement('div');
    el.id = 'lock-screen'; el.className = 'lock';
    el.innerHTML = `
      <div class="lock-card">
        <span class="lock-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
        </span>
        <div class="lock-title">3BEL</div>
        <div class="lock-sub">Voer je pincode in</div>
        <div class="lock-dots" id="lock-dots">${dotsHTML()}</div>
        <div class="lock-err" id="lock-err"></div>
        <div class="lock-pad">${pad}</div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]'); if (!k) return;
      const v = k.dataset.k; if (v === '⌫') del(); else press(v);
    });
    onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') del();
    };
    document.addEventListener('keydown', onKey);
  }

  function ensureUnlocked() {
    if (sessionStorage.getItem(SES_KEY) === '1') return Promise.resolve();
    return new Promise((resolve) => showLock(resolve));
  }
  function lock() { sessionStorage.removeItem(SES_KEY); location.reload(); }
  // Voor latere PIN-wijziging (optioneel, geen UI): LOCK.setPin('123456')
  async function setPin(pin) { localStorage.setItem('3bel-pinhash', await sha256(String(pin))); }

  return { ensureUnlocked, lock, setPin };
})();
