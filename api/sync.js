/* 3BEL — server-side sync proxy (Vercel Serverless Function)
   Houdt de Upstash-token GEHEIM (server-side env var); de browser praat enkel met /api/sync.
   GET  /api/sync?code=andry   -> { rev, data } | null
   POST /api/sync?code=andry   (body = { rev, data })  -> { ok: true }
*/
const BASE = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.KV_REST_API_TOKEN || '';

function safeCode(c) {
  const s = String(c || 'andry').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return s || 'andry';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!BASE || !TOKEN) { res.status(500).json({ error: 'sync niet geconfigureerd' }); return; }

  const url = new URL(req.url, 'http://x');
  const key = `3bel:${safeCode(url.searchParams.get('code'))}`;
  const auth = { Authorization: `Bearer ${TOKEN}` };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${BASE}/get/${encodeURIComponent(key)}`, { headers: auth });
      const j = await r.json();
      if (j.result == null) { res.status(200).json(null); return; }
      let val = null; try { val = JSON.parse(j.result); } catch {}
      res.status(200).json(val);
      return;
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
      if (!body || typeof body !== 'object') { res.status(400).json({ error: 'ongeldige body' }); return; }
      const r = await fetch(`${BASE}/set/${encodeURIComponent(key)}`, {
        method: 'POST', headers: auth, body: JSON.stringify(body),
      });
      if (!r.ok) { res.status(502).json({ error: 'upstash set ' + r.status }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
