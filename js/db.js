/* 3BEL — IndexedDB wrapper (Vanilla JS, geen frameworks) */
const DB = (() => {
  const NAME = '3bel-db';
  const VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('customers')) {
          const cs = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
          cs.createIndex('gemeente', 'gemeente', { unique: false });
          cs.createIndex('actief', 'actief', { unique: false });
        }
        if (!db.objectStoreNames.contains('appointments')) {
          const as = db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
          as.createIndex('datum', 'datum', { unique: false });
          as.createIndex('customerId', 'customerId', { unique: false });
          as.createIndex('status', 'status', { unique: false });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }
  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Generic CRUD
  async function add(store, value)  { return reqP((await tx(store, 'readwrite')).add(value)); }
  async function put(store, value)  { return reqP((await tx(store, 'readwrite')).put(value)); }
  async function get(store, id)     { return reqP((await tx(store, 'readonly')).get(id)); }
  async function getAll(store)      { return reqP((await tx(store, 'readonly')).getAll()); }
  async function remove(store, id)  { return reqP((await tx(store, 'readwrite')).delete(id)); }
  async function clear(store)       { return reqP((await tx(store, 'readwrite')).clear()); }

  async function byIndex(store, index, value) {
    const os = await tx(store, 'readonly');
    return reqP(os.index(index).getAll(value));
  }

  // Appointments by date string (YYYY-MM-DD)
  async function appointmentsByDate(datum) { return byIndex('appointments', 'datum', datum); }
  // Appointments in date range (inclusive) — uses IDBKeyRange on datum index
  async function appointmentsBetween(from, to) {
    const os = await tx('appointments', 'readonly');
    return reqP(os.index('datum').getAll(IDBKeyRange.bound(from, to)));
  }

  // Full backup / restore (lost de "toestel-gebonden" beperking gedeeltelijk op)
  async function exportAll() {
    return {
      meta: { app: '3BEL', version: VERSION, exportedAt: new Date().toISOString() },
      customers: await getAll('customers'),
      appointments: await getAll('appointments'),
    };
  }
  async function importAll(data, { replace = true } = {}) {
    if (replace) { await clear('customers'); await clear('appointments'); }
    for (const c of (data.customers || [])) await put('customers', c);
    for (const a of (data.appointments || [])) await put('appointments', a);
  }
  async function wipe() { await clear('customers'); await clear('appointments'); }

  return {
    open, add, put, get, getAll, remove, clear, byIndex,
    appointmentsByDate, appointmentsBetween,
    exportAll, importAll, wipe,
  };
})();
