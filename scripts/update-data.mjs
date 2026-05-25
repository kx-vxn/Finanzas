/* update-data.mjs — baja datos diarios a /data (Node 20+, fetch global)
   Lo ejecuta GitHub Actions una vez al día. Cada bloque es tolerante a fallos:
   si una fuente no responde, se conserva el archivo previo. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const TODAY = new Date().toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (compatible; FinanzasBot/1.0; +https://github.com)';

async function get(url, opts = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return opts.text ? r.text() : r.json();
}
async function writeJSON(name, obj) {
  await mkdir(DATA, { recursive: true });
  await writeFile(join(DATA, name), JSON.stringify(obj, null, 2) + '\n');
  console.log('✓ escrito', name);
}
async function readPrev(name) {
  try { return JSON.parse(await readFile(join(DATA, name), 'utf8')); } catch { return null; }
}

/* ---------- 1. Tipo de cambio USD/MXN ---------- */
async function rates() {
  let usdMxn;
  try {
    const d = await get('https://open.er-api.com/v6/latest/USD');
    usdMxn = d?.rates?.MXN;
  } catch (e) { console.warn('rate primario falló', e.message); }
  if (!usdMxn) {
    const d = await get('https://api.frankfurter.app/latest?from=USD&to=MXN');
    usdMxn = d?.rates?.MXN;
  }
  if (!usdMxn) throw new Error('sin tipo de cambio');
  await writeJSON('rates.json', { updated: TODAY, usdMxn: +usdMxn.toFixed(4), source: 'open.er-api.com' });
  return usdMxn;
}

/* ---------- 2. Remesas (estimado sobre tipo medio) ---------- */
async function remesas(mid) {
  // margen (% bajo el tipo medio) y comisión típica en USD por proveedor.
  const conf = [
    { name: 'Wise',          margin: 0.005, fee: 6.5,  color: '#9FE870' },
    { name: 'Remitly',       margin: 0.009, fee: 0,    color: '#5B8DEF' },
    { name: 'Xoom (PayPal)', margin: 0.018, fee: 2.99, color: '#6BA8F2' },
    { name: 'MoneyGram',     margin: 0.026, fee: 1.99, color: '#F2756B' },
    { name: 'Western Union', margin: 0.031, fee: 0,    color: '#FFD200' },
  ];
  const providers = conf.map((p) => ({
    name: p.name, color: p.color, fee: p.fee,
    rate: +(mid * (1 - p.margin)).toFixed(4),
  }));
  await writeJSON('remesas.json', { updated: TODAY, midRate: +mid.toFixed(4), source: 'estimado', providers });
}

/* ---------- 3. Mercado ---------- */
async function stooq(symbol) {
  const csv = await get(`https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`, { text: true });
  const cols = csv.trim().split('\n')[1].split(',');
  const open = +cols[3], close = +cols[6];
  if (!close || Number.isNaN(close)) throw new Error(`stooq ${symbol} sin dato`);
  return { price: close, changePct: open ? ((close - open) / open) * 100 : 0 };
}
async function market() {
  const out = [];
  const idx = [
    ['S&P 500', '^spx'], ['NASDAQ', '^ndq'], ['Oro (oz)', 'xauusd'],
  ];
  for (const [name, sym] of idx) {
    try { const q = await stooq(sym); out.push({ name, price: +q.price.toFixed(2), changePct: +q.changePct.toFixed(2), currency: 'USD' }); }
    catch (e) { console.warn(name, e.message); }
  }
  try {
    const cg = await get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
    if (cg.bitcoin) out.push({ name: 'Bitcoin', price: cg.bitcoin.usd, changePct: +(cg.bitcoin.usd_24h_change || 0).toFixed(2), currency: 'USD' });
    if (cg.ethereum) out.push({ name: 'Ethereum', price: cg.ethereum.usd, changePct: +(cg.ethereum.usd_24h_change || 0).toFixed(2), currency: 'USD' });
  } catch (e) { console.warn('coingecko', e.message); }

  if (!out.length) { const prev = await readPrev('market.json'); if (prev) return; throw new Error('sin datos de mercado'); }
  await writeJSON('market.json', { updated: TODAY, source: 'stooq+coingecko', markets: out });
}

/* ---------- 4. Reddit (vía feed Atom; el .json requiere OAuth) ---------- */
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
}
async function subTop(sub) {
  const xml = await get(`https://www.reddit.com/r/${sub}/top.rss?t=day`, { text: true });
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.map((m) => {
    const e = m[1];
    const title = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const url = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || `https://www.reddit.com/r/${sub}`;
    return { sub, title: decodeEntities(title.trim()), url };
  }).filter((p) => p.title).slice(0, 5);
}
async function collect(subs) {
  const lists = [];
  for (const s of subs) {
    try { lists.push(await subTop(s)); }
    catch (e) { console.warn('r/' + s, e.message); }
  }
  // round-robin para mezclar subreddits y dar variedad
  const out = [];
  for (let i = 0; out.length < 8 && lists.some((l) => l[i]); i++) {
    for (const l of lists) { if (l[i]) out.push(l[i]); if (out.length >= 8) break; }
  }
  return out;
}
async function reddit() {
  const us = await collect(['personalfinance', 'investing', 'Bogleheads', 'financialindependence', 'stocks']);
  const mx = await collect(['MexicoFinanciero', 'MexicoBursatil', 'finanzasmexico']);
  const extra = await collect(['sidehustle', 'beermoney', 'passive_income', 'Flipping', 'Entrepreneur', 'freelance', 'EtsySellers', 'WorkOnline']);
  const prev = await readPrev('reddit.json') || {};
  await writeJSON('reddit.json', {
    updated: TODAY, source: 'reddit',
    us: us.length ? us : (prev.us || []),
    mx: mx.length ? mx : (prev.mx || []),
    extra: extra.length ? extra : (prev.extra || []),
  });
}

/* ---------- main ---------- */
const usdMxn = await rates();
const results = await Promise.allSettled([remesas(usdMxn), market(), reddit()]);
results.forEach((r, i) => { if (r.status === 'rejected') console.warn('bloque', i, 'falló:', r.reason?.message); });
console.log('Listo —', TODAY);
