/* 3BEL — App logica (Vanilla JS) */
(() => {
  'use strict';

  // ─────────────────────────── Helpers ───────────────────────────
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const DAYS_NL   = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  const DOW_SHORT = ['ma','di','wo','do','vr','za','zo'];
  const MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const FREQ = { week1: { dagen: 7,  label: '1 week' }, week2: { dagen: 14, label: '2 weken' }, week4: { dagen: 28, label: '4 weken' } };
  const STATUS = { planned: 'gepland', sent: 'WhatsApp', done: 'voltooid' };

  const isoOf    = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const todayISO = () => isoOf(new Date());
  const fmtDayDate = (d) => `${DAYS_NL[d.getDay()]} ${d.getDate()} ${MONTHS_NL[d.getMonth()]}`;
  const fmtBE    = (d) => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  const timeToMin = (t) => { const [a,b] = t.split(':').map(Number); return a*60+b; };
  const minToTime = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
  function weekStartMonday(date) { const d = new Date(date); const off = (d.getDay()+6)%7; d.setDate(d.getDate()-off); d.setHours(0,0,0,0); return d; }

  function waNumber(tel) {
    let d = (tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '32' + d.slice(1);
    return d;
  }
  function freqDays(c) { return (FREQ[c.frequentie] || FREQ.week2).dagen; }
  function nextDue(c) { return c.laatsteWasbeurt ? addDays(parseISO(c.laatsteWasbeurt), freqDays(c)) : new Date(0); }
  function isDue(c, ref = new Date()) { return nextDue(c) <= ref; }

  function customerAddress(c) {
    const street = [c.straat, c.huisnummer].filter(Boolean).join(' ');
    const city = [c.postcode, c.gemeente].filter(Boolean).join(' ');
    return [street, city].filter(Boolean).join(', ');
  }
  // Bouwt een Google Maps route-URL (auto) langs de stops in volgorde, startend vanuit De Panne.
  function mapsRouteUrl(stops) {
    const addrs = stops.map(customerAddress).filter(Boolean).map(a => `${a}, België`);
    if (!addrs.length) return null;
    const origin = `${GEO.BASE.lat},${GEO.BASE.lng}`;
    const destination = encodeURIComponent(addrs[addrs.length - 1]);
    const wp = addrs.slice(0, -1).map(encodeURIComponent).join('%7C');
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${origin}&destination=${destination}`;
    if (wp) url += `&waypoints=${wp}`;
    return url;
  }

  // ─────────────────────────── Settings ───────────────────────────
  const SET_KEY = '3bel-settings';
  const DEFAULTS = { workStart: '17:00', workEnd: '22:00', duration: 30, planDays: [0,1,2,3,4] }; // ma-vr
  function getSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
  function saveSettings(s) { localStorage.setItem(SET_KEY, JSON.stringify(s)); }

  // ─────────────────────────── Toast / Modal ───────────────────────────
  function toast(msg, type = '') {
    const host = $('#toast-host');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2400);
  }
  function openModal(html) {
    const host = $('#modal-host');
    host.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-handle"></div>${html}</div>`;
    host.hidden = false;
    host.onclick = (e) => { if (e.target === host) closeModal(); };
  }
  function closeModal() { const host = $('#modal-host'); host.hidden = true; host.innerHTML = ''; }

  // ─────────────────────────── State ───────────────────────────
  const state = {
    view: 'kalender',
    calMode: 'maand',
    calDate: new Date(),
    selectedDate: todayISO(),
    planWeekStart: weekStartMonday(new Date()),
    plan: null,
    custSearch: '',
    exportDate: todayISO(),
  };

  // ─────────────────────────── Navigation ───────────────────────────
  const VIEW_TITLES = { kalender: 'Kalender', klanten: 'Klanten', autoplan: 'Auto-plan', afsluiting: 'Dagafsluiting', instellingen: 'Instellingen' };
  function setView(name) {
    state.view = name;
    $$('.view').forEach(v => { v.hidden = v.dataset.view !== name; });
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.goto === name));
    $('#view-title').textContent = VIEW_TITLES[name] || '';
    $('#main').scrollTop = 0;
    render();
  }
  function render() {
    ({ kalender: renderKalender, klanten: renderKlanten, autoplan: renderAutoplan, afsluiting: renderAfsluiting, instellingen: renderInstellingen }[state.view] || (()=>{}))();
  }

  // ─────────────────────────── Kalender ───────────────────────────
  async function renderKalender() {
    const root = $('#view-kalender');
    root.innerHTML = `
      <div class="view-toggle">
        <button data-action="cal-mode" data-mode="maand" class="${state.calMode==='maand'?'is-active':''}">Maand</button>
        <button data-action="cal-mode" data-mode="dag" class="${state.calMode==='dag'?'is-active':''}">Dag</button>
      </div>
      <div id="cal-content"></div>`;
    if (state.calMode === 'maand') await renderMonth();
    else await renderDay();
  }

  async function renderMonth() {
    const c = $('#cal-content');
    await WEATHER.ensure();
    const d = state.calDate;
    const year = d.getFullYear(), month = d.getMonth();
    const first = new Date(year, month, 1);
    const startOff = (first.getDay()+6)%7;            // ma-start
    const gridStart = addDays(first, -startOff);
    const from = isoOf(gridStart), to = isoOf(addDays(gridStart, 41));
    const appts = await DB.appointmentsBetween(from, to);
    const byDate = {};
    appts.forEach(a => (byDate[a.datum] = byDate[a.datum] || []).push(a));

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const cd = addDays(gridStart, i);
      const iso = isoOf(cd);
      const other = cd.getMonth() !== month;
      const today = iso === todayISO();
      const list = byDate[iso] || [];
      const dots = list.slice(0,4).map(a => `<span class="dot s-${a.status}"></span>`).join('');
      const wx = (!other && iso >= todayISO()) ? WEATHER.badge(iso) : null;
      cells += `<div class="cal-cell ${other?'is-other':''} ${today?'is-today':''}" data-action="open-day" data-date="${iso}">
        <span class="d">${cd.getDate()}</span>
        ${list.length ? `<span class="count">${list.length}</span>` : ''}
        ${wx ? `<span class="wx" title="${wx.pop}% kans op neerslag">${wx.emoji}</span>` : ''}
        <span class="dots">${dots}</span>
      </div>`;
    }
    c.innerHTML = `
      <div class="cal-toolbar">
        <button class="btn btn-ghost icon-btn" data-action="cal-prev" aria-label="Vorige maand">‹</button>
        <div class="cal-title">${MONTHS_NL[month]} ${year}</div>
        <button class="btn btn-ghost icon-btn" data-action="cal-next" aria-label="Volgende maand">›</button>
      </div>
      <div class="cal-grid">${DOW_SHORT.map(x=>`<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
      <p class="muted center" style="margin-top:14px;font-size:.85rem">Tik op een dag om de planning te openen.</p>`;
  }

  async function renderDay() {
    const c = $('#cal-content');
    const s = getSettings();
    await WEATHER.ensure();
    const date = parseISO(state.selectedDate);
    const appts = (await DB.appointmentsByDate(state.selectedDate)).sort((a,b)=>a.startTijd.localeCompare(b.startTijd));
    const custs = await DB.getAll('customers');
    const cmap = Object.fromEntries(custs.map(c => [c.id, c]));
    const stops = appts.map(a => cmap[a.customerId]).filter(Boolean);
    const routeUrl = stops.length ? mapsRouteUrl(stops) : null;
    const wl = WEATHER.label(state.selectedDate);

    const start = timeToMin(s.workStart), end = timeToMin(s.workEnd), step = s.duration;
    let rows = '';
    for (let m = start; m + step <= end; m += step) {
      const t = minToTime(m);
      const here = appts.filter(a => timeToMin(a.startTijd) <= m && m < timeToMin(a.startTijd) + a.duur);
      if (here.length && timeToMin(here[0].startTijd) === m) {
        const a = here[0]; const cu = cmap[a.customerId] || {};
        rows += `<div class="slot">
          <div class="slot-time">${t}</div>
          <div class="appt s-${a.status}" data-action="open-appt" data-id="${a.id}">
            <div class="appt-main">
              <div class="appt-name">${esc(cu.naam || 'Klant')}</div>
              <div class="appt-sub">${esc(cu.gemeente || '')} · ${a.duur} min</div>
            </div>
            <span class="appt-badge">${STATUS[a.status]||a.status}</span>
          </div></div>`;
      } else if (!here.length) {
        rows += `<div class="slot">
          <div class="slot-time">${t}</div>
          <div class="slot-body free" data-action="new-appt" data-time="${t}">+ Vrij</div></div>`;
      }
    }

    c.innerHTML = `
      <div class="cal-toolbar">
        <button class="btn btn-ghost icon-btn" data-action="day-prev" aria-label="Vorige dag">‹</button>
        <div class="cal-title" style="text-transform:capitalize">${fmtDayDate(date)}</div>
        <button class="btn btn-ghost icon-btn" data-action="day-next" aria-label="Volgende dag">›</button>
      </div>
      ${wl ? `<div class="wx-banner ${wl.rainy?'is-rainy':''}">${wl.rainy?'☔':'🌤️'} ${wl.pop}% kans op neerslag${wl.tmax?` · ${wl.tmax}`:''}${wl.rainy?' — misschien beter verschuiven':''}</div>` : ''}
      ${routeUrl ? `<a class="btn btn-soft route-btn" href="${routeUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
        Route openen in Maps (${stops.length} ${stops.length===1?'stop':'stops'})</a>` : ''}
      <div class="day-banner"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Hoofdberoep 07:00–17:00 — geblokkeerd</div>
      <div class="day-banner"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Nacht 22:00–03:00 — geblokkeerd</div>
      <p class="muted" style="margin:10px 2px 6px;font-size:.85rem;font-weight:600">Werkblok ${s.workStart}–${s.workEnd}</p>
      ${rows || '<div class="empty">Geen vrije slots in dit werkblok. Pas het werkblok aan in instellingen.</div>'}`;
  }

  // ─────────────────────────── Klanten ───────────────────────────
  async function renderKlanten() {
    const root = $('#view-klanten');
    let custs = await DB.getAll('customers');
    custs.sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
    const q = state.custSearch.toLowerCase();
    if (q) custs = custs.filter(c => `${c.naam} ${c.gemeente} ${c.postcode}`.toLowerCase().includes(q));

    const today = new Date();
    const list = custs.map(c => {
      const due = isDue(c, today);
      const init = (c.naam||'?').trim().charAt(0).toUpperCase();
      return `<div class="card cust" data-action="open-customer" data-id="${c.id}">
        <div class="cust-avatar">${esc(init)}</div>
        <div class="cust-info">
          <div class="cust-name">${esc(c.naam||'Naamloos')}</div>
          <div class="cust-sub">${esc([c.straat, c.huisnummer].filter(Boolean).join(' '))}${c.gemeente?` · ${esc(c.postcode||'')} ${esc(c.gemeente)}`:''}</div>
        </div>
        <div style="text-align:right">
          <span class="pill ${due?'pill-due':''}">${due?'Nu wassen':FREQ[c.frequentie]?.label||'—'}</span>
        </div>
      </div>`;
    }).join('');

    root.innerHTML = `
      <div class="field" style="margin-bottom:10px">
        <input id="cust-search" type="search" placeholder="Zoek klant, gemeente of postcode…" value="${esc(state.custSearch)}">
      </div>
      <button class="btn" data-action="add-customer" style="margin-bottom:14px">+ Nieuwe klant</button>
      ${custs.length ? list : '<div class="empty"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>Nog geen klanten.<br>Voeg je eerste klant toe.</p></div>'}`;

    const search = $('#cust-search');
    if (search) search.oninput = (e) => { state.custSearch = e.target.value; const sel = e.target.selectionStart; renderKlanten().then(()=>{ const s2=$('#cust-search'); if(s2){s2.focus(); s2.setSelectionRange(sel,sel);} }); };
  }

  function customerForm(c = {}) {
    const F = (f) => esc(c[f] ?? '');
    return `
      <h3>${c.id ? 'Klant bewerken' : 'Nieuwe klant'}</h3>
      <p class="modal-sub">Gegevens voor planning en WhatsApp.</p>
      <div class="field"><label>Naam</label><input id="f-naam" value="${F('naam')}" placeholder="Naam klant"></div>
      <div class="field-row-3">
        <div class="field"><label>Straat</label><input id="f-straat" value="${F('straat')}" placeholder="Straat"></div>
        <div class="field"><label>Nr.</label><input id="f-huisnummer" value="${F('huisnummer')}" placeholder="12"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Postcode</label><input id="f-postcode" inputmode="numeric" value="${F('postcode')}" placeholder="8660"></div>
        <div class="field"><label>Gemeente</label><input id="f-gemeente" value="${F('gemeente')}" placeholder="De Panne"></div>
      </div>
      <div class="field"><label>Telefoon (WhatsApp)</label><input id="f-telefoon" type="tel" inputmode="tel" value="${F('telefoon')}" placeholder="0470 12 34 56"></div>
      <div class="field"><label>Frequentie</label>
        <select id="f-frequentie">
          <option value="week1" ${c.frequentie==='week1'?'selected':''}>Elke week</option>
          <option value="week2" ${(c.frequentie==='week2'||!c.frequentie)?'selected':''}>Om de 2 weken</option>
          <option value="week4" ${c.frequentie==='week4'?'selected':''}>Om de 4 weken (1 maand)</option>
        </select>
      </div>
      <div class="field"><label>Laatst gewassen (optioneel)</label><input id="f-laatste" type="date" value="${F('laatsteWasbeurt')}"></div>
      <div class="field"><label>Notities (optioneel)</label><textarea id="f-notities" placeholder="bv. sleutel bij buur, achteraan langs poort…">${F('notities')}</textarea></div>
      <div class="modal-actions">
        <button class="btn" data-action="save-customer" data-id="${c.id??''}">Opslaan</button>
        ${c.id ? `<button class="btn btn-danger" data-action="delete-customer" data-id="${c.id}">Klant verwijderen</button>` : ''}
        <button class="btn btn-ghost" data-action="close-modal">Annuleren</button>
      </div>`;
  }

  async function saveCustomer(id) {
    const naam = $('#f-naam').value.trim();
    if (!naam) { toast('Naam is verplicht', 'err'); return; }
    const obj = {
      naam,
      straat: $('#f-straat').value.trim(),
      huisnummer: $('#f-huisnummer').value.trim(),
      postcode: $('#f-postcode').value.trim(),
      gemeente: $('#f-gemeente').value.trim(),
      telefoon: $('#f-telefoon').value.trim(),
      frequentie: $('#f-frequentie').value,
      laatsteWasbeurt: $('#f-laatste').value || null,
      notities: $('#f-notities').value.trim(),
      actief: true,
    };
    if (id) { obj.id = Number(id); await DB.put('customers', obj); toast('Klant bijgewerkt', 'ok'); }
    else { await DB.add('customers', obj); toast('Klant toegevoegd', 'ok'); }
    closeModal(); render();
  }

  // ─────────────────────────── Afspraak modals ───────────────────────────
  async function openNewApptModal(time) {
    const custs = (await DB.getAll('customers')).filter(c => c.actief !== false).sort((a,b)=>(a.naam||'').localeCompare(b.naam||''));
    if (!custs.length) { toast('Voeg eerst een klant toe', 'err'); setView('klanten'); return; }
    const opts = custs.map(c => `<option value="${c.id}">${esc(c.naam)}${c.gemeente?` — ${esc(c.gemeente)}`:''}</option>`).join('');
    openModal(`
      <h3>Nieuwe afspraak</h3>
      <p class="modal-sub" style="text-transform:capitalize">${fmtDayDate(parseISO(state.selectedDate))} om ${time}</p>
      <div class="field"><label>Klant</label><select id="a-cust">${opts}</select></div>
      <div class="field"><label>Tijd</label><input id="a-time" type="time" value="${time}" step="900"></div>
      <div class="field"><label>Duur</label>
        <select id="a-dur"><option value="30">30 minuten</option><option value="60">60 minuten</option></select>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="save-appt">Inplannen</button>
        <button class="btn btn-ghost" data-action="close-modal">Annuleren</button>
      </div>`);
  }
  async function saveAppt() {
    const appt = {
      customerId: Number($('#a-cust').value),
      datum: state.selectedDate,
      startTijd: $('#a-time').value,
      duur: Number($('#a-dur').value),
      status: 'planned',
      createdAt: new Date().toISOString(),
    };
    await DB.add('appointments', appt);
    toast('Afspraak ingepland', 'ok');
    closeModal(); render();
  }

  async function openApptModal(id) {
    const a = await DB.get('appointments', Number(id));
    if (!a) return;
    const cu = await DB.get('customers', a.customerId) || {};
    const dateD = parseISO(a.datum);
    openModal(`
      <h3>${esc(cu.naam || 'Klant')}</h3>
      <p class="modal-sub" style="text-transform:capitalize">${fmtDayDate(dateD)} om ${a.startTijd} · ${a.duur} min · ${STATUS[a.status]||a.status}</p>
      <div class="card" style="margin:0 0 14px">
        <div class="cust-sub" style="white-space:normal">${esc([cu.straat,cu.huisnummer].filter(Boolean).join(' '))}<br>${esc(cu.postcode||'')} ${esc(cu.gemeente||'')}</div>
        ${cu.notities?`<div class="cust-sub" style="white-space:normal;margin-top:6px">📝 ${esc(cu.notities)}</div>`:''}
      </div>
      <div class="modal-actions">
        ${a.status!=='done' ? `<button class="btn btn-wa" data-action="send-wa" data-id="${a.id}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm4.96 13.92c-.2.56-1.16 1.08-1.6 1.14-.44.07-.85.03-1.82-.38-.97-.41-3.26-1.35-4.23-3.49-.97-2.14-.03-3.34.26-3.72.29-.38.64-.48.85-.48.22 0 .43.01.62.01.2 0 .47-.07.73.56.26.63.88 2.16.95 2.32.08.16.13.35.03.56-.1.22-.15.35-.3.54-.15.19-.32.42-.46.56-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.44.3.14.47.12.65-.07.18-.19.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.79.84 2.1.99.31.15.51.22.58.34.07.12.07.71-.13 1.27z"/></svg>
          Stuur WhatsApp</button>` : ''}
        ${a.status!=='done' ? `<button class="btn btn-slate" data-action="mark-done" data-id="${a.id}">Markeer als voltooid</button>` : `<button class="btn btn-ghost" data-action="reopen" data-id="${a.id}">Heropenen</button>`}
        <button class="btn btn-danger" data-action="delete-appt" data-id="${a.id}">Verwijder afspraak</button>
        <button class="btn btn-ghost" data-action="close-modal">Sluiten</button>
      </div>`);
  }

  async function sendWhatsApp(id) {
    const a = await DB.get('appointments', Number(id));
    const cu = await DB.get('customers', a.customerId) || {};
    const d = parseISO(a.datum);
    const dag = DAYS_NL[d.getDay()];
    const datum = `${d.getDate()} ${MONTHS_NL[d.getMonth()]}`;
    const msg = `Het is hier met Andry van 3BEL. Ik kom op ${dag} ${datum} om ${a.startTijd} uw ramen wassen. Graag een bericht terug moest dit niet passen voor jou.`;
    const num = waNumber(cu.telefoon);
    const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    if (!num) toast('Geen telefoonnummer — bericht geopend zonder ontvanger', 'err');
    a.status = 'sent'; a.updatedAt = new Date().toISOString();
    await DB.put('appointments', a);
    window.open(url, '_blank');
    closeModal(); render();
  }
  async function markDone(id) {
    const a = await DB.get('appointments', Number(id));
    a.status = 'done'; a.updatedAt = new Date().toISOString();
    await DB.put('appointments', a);
    let extra = '';
    const cu = await DB.get('customers', a.customerId);
    if (cu) {
      cu.laatsteWasbeurt = a.datum; await DB.put('customers', cu); // reset frequentie-cyclus
      const next = await scheduleNextFor(cu, a.datum);
      if (next) extra = ` · volgende beurt ${fmtBE(parseISO(next.datum))} voorgesteld`;
    }
    toast('Afgevinkt als voltooid ✓' + extra, 'ok');
    closeModal(); render();
  }
  // Plant automatisch de volgende beurt (laatste datum + frequentie),
  // tenzij er al een toekomstige, niet-voltooide afspraak voor deze klant bestaat.
  async function scheduleNextFor(cu, fromISO) {
    const existing = await DB.byIndex('appointments', 'customerId', cu.id);
    const hasFuture = existing.some(a => a.status !== 'done' && a.datum > fromISO);
    if (hasFuture) return null;
    const nextISO = isoOf(addDays(parseISO(fromISO), freqDays(cu)));
    const s = getSettings();
    const id = await DB.add('appointments', {
      customerId: cu.id, datum: nextISO, startTijd: s.workStart, duur: s.duration,
      status: 'planned', auto: true, createdAt: new Date().toISOString(),
    });
    return { id, datum: nextISO };
  }
  async function reopenAppt(id) { const a = await DB.get('appointments', Number(id)); a.status = 'planned'; await DB.put('appointments', a); closeModal(); render(); }
  async function deleteAppt(id) { await DB.remove('appointments', Number(id)); toast('Afspraak verwijderd'); closeModal(); render(); }

  // ─────────────────────────── Auto-plan ───────────────────────────
  function freeSlotsFor(existing, s) {
    const start = timeToMin(s.workStart), end = timeToMin(s.workEnd), step = s.duration;
    const occ = existing.map(a => [timeToMin(a.startTijd), timeToMin(a.startTijd) + a.duur]);
    const slots = [];
    for (let m = start; m + step <= end; m += step) {
      if (!occ.some(([o1,o2]) => m < o2 && m + step > o1)) slots.push(minToTime(m));
    }
    return slots;
  }

  async function buildPlan() {
    const s = getSettings();
    const wk = state.planWeekStart;
    const dayDates = s.planDays.map(off => isoOf(addDays(wk, off)));
    const weekEnd = addDays(wk, Math.max(...s.planDays));

    const allAppts = await DB.appointmentsBetween(dayDates[0], dayDates[dayDates.length-1]);
    const apptByDate = {};
    allAppts.forEach(a => (apptByDate[a.datum] = apptByDate[a.datum] || []).push(a));

    const days = dayDates.map(iso => ({ dateISO: iso, freeSlots: freeSlotsFor(apptByDate[iso] || [], s), stops: [] }));

    const custs = (await DB.getAll('customers')).filter(c => c.actief !== false);
    const due = custs.filter(c => isDue(c, weekEnd));
    const clusters = GEO.clusterByGemeente(due);

    let di = 0; const overflow = [];
    for (const cluster of clusters) {
      if (di < days.length && days[di].stops.length > 0) di++;          // nieuwe gemeente -> nieuwe dag
      for (const cust of GEO.routeOrder(cluster.customers)) {
        while (di < days.length && days[di].stops.length >= days[di].freeSlots.length) di++;
        if (di >= days.length) { overflow.push(cust); continue; }
        days[di].stops.push(cust);
      }
    }
    for (const day of days) {
      if (!day.stops.length) continue;
      const routed = GEO.routeOrder(day.stops);
      day.gemeenteLabel = [...new Set(routed.map(c => c.gemeente || GEO.coords(c.postcode)?.naam || '—'))].join(' + ');
      day.stops = routed.map((c, i) => ({ customer: c, time: day.freeSlots[i] }));
    }
    return { days, due: due.length, scheduled: days.reduce((n,d)=>n+d.stops.length,0), overflow, defaultDur: s.duration };
  }

  async function renderAutoplan() {
    const root = $('#view-autoplan');
    await WEATHER.ensure();
    const wk = state.planWeekStart, wkEnd = addDays(wk, 6);
    const range = `${wk.getDate()} ${MONTHS_NL[wk.getMonth()]} – ${wkEnd.getDate()} ${MONTHS_NL[wkEnd.getMonth()]}`;
    let body = '';
    if (state.plan) {
      const p = state.plan;
      body = `
        <div class="plan-summary">
          <div class="stat"><div class="n">${p.due}</div><div class="l">due deze week</div></div>
          <div class="stat"><div class="n">${p.scheduled}</div><div class="l">ingepland</div></div>
          <div class="stat"><div class="n">${p.overflow.length}</div><div class="l">past niet</div></div>
        </div>`;
      const filled = p.days.filter(d => d.stops.length);
      if (!filled.length) body += `<div class="empty">Geen klanten om te plannen deze week. 🎉</div>`;
      filled.forEach(d => {
        const dd = parseISO(d.dateISO);
        const wx = WEATHER.badge(d.dateISO);
        body += `<div class="card"><div class="plan-day-title">${fmtDayDate(dd)} <span class="gem">· ${esc(d.gemeenteLabel)}</span>${wx?`<span class="wx-tag" title="${wx.pop}% kans op neerslag">${wx.emoji} ${wx.pop}%</span>`:''}</div>`;
        d.stops.forEach(st => {
          body += `<div class="plan-item"><span class="t">${st.time}</span><div class="cust-info"><div class="cust-name">${esc(st.customer.naam)}</div><div class="cust-sub">${esc(st.customer.postcode||'')} ${esc(st.customer.gemeente||'')}</div></div></div>`;
        });
        body += `</div>`;
      });
      if (p.overflow.length) {
        body += `<div class="card" style="border-color:var(--st-planned)"><div class="plan-day-title" style="color:#B45309">⚠ Past niet in deze week</div>${p.overflow.map(c=>`<div class="plan-item"><div class="cust-info"><div class="cust-name">${esc(c.naam)}</div><div class="cust-sub">${esc(c.gemeente||'')}</div></div></div>`).join('')}</div>`;
      }
      if (p.scheduled) body += `<button class="btn btn-green" data-action="autoplan-confirm" style="margin-top:6px">Bevestig & plaats ${p.scheduled} afspraken</button>`;
      body += `<button class="btn btn-ghost" data-action="autoplan-clear" style="margin-top:10px">Wissen</button>`;
    } else {
      body = `<div class="empty"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="13 2 13 9 20 9"/><path d="M3 7l4-4 4 4M7 3v8"/></svg><p>Druk op <b>Automatisch plannen</b> om klanten die "due" zijn te verdelen over de week — gegroepeerd per gemeente, met een logische route.</p></div>`;
    }
    root.innerHTML = `
      <div class="cal-toolbar">
        <button class="btn btn-ghost icon-btn" data-action="week-prev" aria-label="Vorige week">‹</button>
        <div class="cal-title" style="font-size:.98rem">Week ${range}</div>
        <button class="btn btn-ghost icon-btn" data-action="week-next" aria-label="Volgende week">›</button>
      </div>
      <button class="btn" data-action="autoplan-run">⚙ Automatisch plannen</button>
      <div style="margin-top:16px">${body}</div>`;
  }

  async function confirmPlan() {
    if (!state.plan) return;
    let n = 0;
    for (const day of state.plan.days) {
      for (const st of day.stops) {
        await DB.add('appointments', { customerId: st.customer.id, datum: day.dateISO, startTijd: st.time, duur: state.plan.defaultDur, status: 'planned', createdAt: new Date().toISOString() });
        n++;
      }
    }
    state.plan = null;
    toast(`${n} afspraken geplaatst ✓`, 'ok');
    state.calMode = 'maand'; state.calDate = new Date(state.planWeekStart);
    setView('kalender');
  }

  // ─────────────────────────── Dagafsluiting / Dexxter ───────────────────────────
  async function renderAfsluiting() {
    const root = $('#view-afsluiting');
    const appts = (await DB.appointmentsByDate(state.exportDate)).filter(a => a.status === 'done').sort((a,b)=>a.startTijd.localeCompare(b.startTijd));
    const custs = Object.fromEntries((await DB.getAll('customers')).map(c => [c.id, c]));
    const d = parseISO(state.exportDate);
    const lines = appts.map(a => { const c = custs[a.customerId] || {}; return `${fmtBE(d)} - ${c.naam||'Klant'} - ${c.gemeente||''} - Ramen wassen`; });

    root.innerHTML = `
      <div class="field"><label>Datum</label><input id="exp-date" type="date" value="${state.exportDate}"></div>
      <div class="plan-summary" style="grid-template-columns:1fr 1fr">
        <div class="stat"><div class="n">${appts.length}</div><div class="l">voltooid</div></div>
        <div class="stat"><div class="n">${fmtBE(d)}</div><div class="l">datum</div></div>
      </div>
      ${appts.length ? `
        <div class="export-box" id="exp-box">${esc(lines.join('\n'))}</div>
        <button class="btn btn-green" data-action="export-copy" style="margin-top:12px">📋 Kopieer voor Dexxter</button>
      ` : `<div class="empty">Nog geen voltooide afspraken op deze dag.<br><span class="muted">Vink afspraken af in de dagplanning.</span></div>`}`;

    const di = $('#exp-date');
    if (di) di.onchange = (e) => { state.exportDate = e.target.value; renderAfsluiting(); };
  }
  async function exportCopy() {
    const txt = $('#exp-box')?.textContent || '';
    try { await navigator.clipboard.writeText(txt); toast('Gekopieerd naar klembord ✓', 'ok'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Gekopieerd ✓', 'ok'); } catch { toast('Kopiëren mislukt', 'err'); }
      ta.remove();
    }
  }

  // ─────────────────────────── Instellingen ───────────────────────────
  function renderInstellingen() {
    const s = getSettings();
    const root = $('#view-instellingen');
    const cfg = SYNC.getConfig() || {};
    const meta = SYNC.getMeta();
    const on = SYNC.isConfigured();
    const lastTxt = meta?.lastAt ? new Date(meta.lastAt).toLocaleString('nl-BE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : null;
    const syncStatus = on
      ? `Automatisch aan${lastTxt ? ` · laatste sync ${lastTxt}` : ' · nog niet gesynct'}`
      : 'Uitgeschakeld — data staat enkel op dit toestel.';
    const syncCard = `
      <div class="card">
        <h3 style="margin:0 0 6px">Synchronisatie tussen toestellen</h3>
        <p class="muted" style="font-size:.85rem;margin-top:0">${esc(syncStatus)}</p>
        <div class="field"><label>Sync-code (zelfde op gsm én tablet)</label><input id="sync-code" value="${esc(cfg.code||'andry')}"></div>
        <div class="btn-row" style="margin-bottom:10px">
          <button class="btn btn-sm" data-action="sync-save" style="flex:1">Opslaan &amp; sync</button>
          <button class="btn btn-soft btn-sm" data-action="sync-now" style="flex:1">Sync nu</button>
        </div>
        ${on ? `<button class="btn btn-ghost btn-sm" data-action="sync-disconnect">Sync uitzetten</button>`
             : `<button class="btn btn-ghost btn-sm" data-action="sync-enable">Sync aanzetten</button>`}
        <p class="muted" style="font-size:.78rem">Werkt vanzelf op elk toestel — gebruik gewoon dezelfde sync-code op gsm én tablet. Data wordt veilig via de server bewaard; er staat geen sleutel in de app.</p>
      </div>`;
    root.innerHTML = `
      <div class="card">
        <h3 style="margin:0 0 12px">Werkblok</h3>
        <div class="field-row">
          <div class="field"><label>Start</label><input id="s-start" type="time" value="${s.workStart}" step="900"></div>
          <div class="field"><label>Einde</label><input id="s-end" type="time" value="${s.workEnd}" step="900"></div>
        </div>
        <div class="field"><label>Standaard duur per klant</label>
          <select id="s-dur"><option value="30" ${s.duration===30?'selected':''}>30 minuten</option><option value="60" ${s.duration===60?'selected':''}>60 minuten</option></select>
        </div>
        <p class="muted" style="font-size:.82rem">Hoofdberoep 07:00–17:00 en nacht 22:00–03:00 blijven steeds geblokkeerd.</p>
        <button class="btn" data-action="save-settings">Opslaan</button>
      </div>
      ${syncCard}
      <div class="card">
        <h3 style="margin:0 0 8px">Back-up</h3>
        <p class="muted" style="font-size:.85rem;margin-top:0">Data staat lokaal op dit toestel. Maak een back-up om over te zetten naar je gsm/tablet.</p>
        <div class="btn-row" style="margin-bottom:10px"><button class="btn btn-soft btn-sm" data-action="backup-export" style="flex:1">⬇ Exporteer back-up</button></div>
        <label class="btn btn-soft btn-sm" style="display:flex"><input id="backup-file" type="file" accept="application/json" hidden> ⬆ Importeer back-up</label>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px">Demo</h3>
        <button class="btn btn-ghost btn-sm" data-action="seed-demo" style="margin-bottom:10px">Voeg demo-klanten toe</button>
        <button class="btn btn-danger btn-sm" data-action="wipe">Alle data wissen</button>
      </div>
      <p class="muted center" style="font-size:.78rem;margin-top:18px">3BEL · gebouwd door <a href="https://www.smsak.be" style="color:var(--blue)">SMSAK</a></p>`;
    const fi = $('#backup-file');
    if (fi) fi.onchange = (e) => importBackup(e.target.files[0]);
  }
  function saveSettingsFromForm() {
    const s = getSettings();
    s.workStart = $('#s-start').value; s.workEnd = $('#s-end').value; s.duration = Number($('#s-dur').value);
    saveSettings(s); toast('Instellingen opgeslagen', 'ok'); render();
  }
  async function backupExport() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `3bel-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('Back-up gedownload', 'ok');
  }
  function importBackup(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      try { await DB.importAll(JSON.parse(r.result), { replace: true }); SYNC.touch(); toast('Back-up geïmporteerd ✓', 'ok'); render(); }
      catch { toast('Ongeldig back-up bestand', 'err'); }
    };
    r.readAsText(file);
  }
  async function syncSave() {
    const code = ($('#sync-code').value || '').trim() || 'andry';
    SYNC.setConfig({ code, on: true });
    toast('Synchroniseren…');
    try {
      const r = await SYNC.connect();
      toast(r === 'pulled' ? 'Cloud-data opgehaald ✓' : 'Cloud bijgewerkt ✓', 'ok');
      render();
    } catch { toast('Sync mislukt — controleer je verbinding', 'err'); }
  }
  async function syncNow() {
    if (!SYNC.isConfigured()) { toast('Zet sync eerst aan', 'err'); return; }
    toast('Synchroniseren…');
    try {
      const r = await SYNC.sync();
      toast(r === 'pulled' ? 'Bijgewerkt vanaf cloud ✓' : r === 'pushed' ? 'Cloud bijgewerkt ✓' : 'Alles up-to-date ✓', 'ok');
      render();
    } catch { toast('Sync mislukt — controleer verbinding', 'err'); }
  }
  async function syncEnable() {
    SYNC.setConfig({ on: true }); toast('Sync aangezet');
    try { await SYNC.connect(); } catch {}
    render();
  }
  function syncDisconnect() { SYNC.clearConfig(); toast('Sync uitgezet'); render(); }
  async function wipeAll() {
    openModal(`<h3>Alles wissen?</h3><p class="modal-sub">Alle klanten en afspraken worden definitief verwijderd.</p>
      <div class="modal-actions"><button class="btn btn-danger" data-action="wipe-confirm">Ja, wis alles</button><button class="btn btn-ghost" data-action="close-modal">Annuleren</button></div>`);
  }
  async function seedDemo() {
    const today = new Date();
    const demo = [
      { naam:'Familie Vandromme', straat:'Zeelaan', huisnummer:'112', postcode:'8660', gemeente:'De Panne', telefoon:'0470 11 22 33', frequentie:'week2', laatsteWasbeurt: isoOf(addDays(today,-15)) },
      { naam:'Bistro De Kust', straat:'Dynastielaan', huisnummer:'8', postcode:'8660', gemeente:'De Panne', telefoon:'0471 22 33 44', frequentie:'week1', laatsteWasbeurt: isoOf(addDays(today,-8)) },
      { naam:'Mevr. Deprez', straat:'Houtsaegerlaan', huisnummer:'24', postcode:'8660', gemeente:'De Panne', telefoon:'0472 33 44 55', frequentie:'week4', laatsteWasbeurt: isoOf(addDays(today,-30)) },
      { naam:'Apotheek Koksijde', straat:'Zeelaan', huisnummer:'201', postcode:'8670', gemeente:'Koksijde', telefoon:'0473 44 55 66', frequentie:'week2', laatsteWasbeurt: isoOf(addDays(today,-16)) },
      { naam:'Dhr. Mortier', straat:'Strandlaan', huisnummer:'45', postcode:'8670', gemeente:'Koksijde', telefoon:'0474 55 66 77', frequentie:'week2', laatsteWasbeurt: isoOf(addDays(today,-20)) },
      { naam:'Slagerij Veurne', straat:'Grote Markt', huisnummer:'14', postcode:'8630', gemeente:'Veurne', telefoon:'0475 66 77 88', frequentie:'week1', laatsteWasbeurt: isoOf(addDays(today,-9)) },
      { naam:'Familie Lampaert', straat:'Pannestraat', huisnummer:'77', postcode:'8630', gemeente:'Veurne', telefoon:'0476 77 88 99', frequentie:'week4', laatsteWasbeurt: null },
      { naam:'B&B Nieuwpoort', straat:'Langestraat', huisnummer:'30', postcode:'8620', gemeente:'Nieuwpoort', telefoon:'0477 88 99 00', frequentie:'week2', laatsteWasbeurt: isoOf(addDays(today,-18)) },
    ];
    for (const c of demo) await DB.add('customers', { ...c, actief: true });
    toast('8 demo-klanten toegevoegd', 'ok'); render();
  }

  // ─────────────────────────── Event delegation ───────────────────────────
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tab'); if (tab) { setView(tab.dataset.goto); return; }
    if (e.target.closest('#btn-settings')) { setView('instellingen'); return; }
    const el = e.target.closest('[data-action]'); if (!el) return;
    const id = el.dataset.id, A = el.dataset.action;
    const actions = {
      'goto': () => setView(el.dataset.view),
      'cal-mode': () => { state.calMode = el.dataset.mode; renderKalender(); },
      'cal-prev': () => { state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth()-1, 1); renderKalender(); },
      'cal-next': () => { state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth()+1, 1); renderKalender(); },
      'open-day': () => { state.selectedDate = el.dataset.date; state.calMode = 'dag'; renderKalender(); },
      'day-prev': () => { state.selectedDate = isoOf(addDays(parseISO(state.selectedDate), -1)); renderKalender(); },
      'day-next': () => { state.selectedDate = isoOf(addDays(parseISO(state.selectedDate), 1)); renderKalender(); },
      'new-appt': () => openNewApptModal(el.dataset.time),
      'save-appt': () => saveAppt(),
      'open-appt': () => openApptModal(id),
      'send-wa': () => sendWhatsApp(id),
      'mark-done': () => markDone(id),
      'reopen': () => reopenAppt(id),
      'delete-appt': () => deleteAppt(id),
      'add-customer': () => openModal(customerForm()),
      'open-customer': async () => openModal(customerForm(await DB.get('customers', Number(id)))),
      'save-customer': () => saveCustomer(id),
      'delete-customer': async () => { await DB.remove('customers', Number(id)); toast('Klant verwijderd'); closeModal(); render(); },
      'autoplan-run': async () => { state.plan = await buildPlan(); renderAutoplan(); },
      'autoplan-confirm': () => confirmPlan(),
      'autoplan-clear': () => { state.plan = null; renderAutoplan(); },
      'week-prev': () => { state.planWeekStart = addDays(state.planWeekStart, -7); state.plan = null; renderAutoplan(); },
      'week-next': () => { state.planWeekStart = addDays(state.planWeekStart, 7); state.plan = null; renderAutoplan(); },
      'export-copy': () => exportCopy(),
      'save-settings': () => saveSettingsFromForm(),
      'sync-save': () => syncSave(),
      'sync-now': () => syncNow(),
      'sync-enable': () => syncEnable(),
      'sync-disconnect': () => syncDisconnect(),
      'backup-export': () => backupExport(),
      'seed-demo': () => seedDemo(),
      'wipe': () => wipeAll(),
      'wipe-confirm': async () => { await DB.wipe(); closeModal(); toast('Alle data gewist'); render(); },
      'close-modal': () => closeModal(),
    };
    if (actions[A]) actions[A]();
  });

  // ─────────────────────────── Boot ───────────────────────────
  async function boot() {
    await DB.open();
    setView('kalender');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    window.addEventListener('3bel:synced', () => render());
    WEATHER.ensure().then(() => { if (state.view === 'kalender') render(); }).catch(() => {});
    if (SYNC.isConfigured()) SYNC.sync().catch(() => {});
  }
  boot();
})();
