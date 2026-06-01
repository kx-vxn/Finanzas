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

/* ---------- 5. Tickers ligados a políticos (Yahoo Finance, sin clave) ---------- */
const POLITICOS = [
  { ticker: 'DJT',   name: 'Trump Media & Technology', tag: 'Empresa fundada por Donald Trump' },
  { ticker: 'NVDA',  name: 'NVIDIA',                   tag: 'Compras reportadas por Nancy Pelosi (calls de NVDA)' },
  { ticker: 'GOOGL', name: 'Alphabet (Google)',        tag: 'Paul Pelosi y otros congresistas reportados' },
  { ticker: 'AAPL',  name: 'Apple',                    tag: 'Operada por varios congresistas (Pelosi, Tuberville)' },
  { ticker: 'TSLA',  name: 'Tesla',                    tag: 'Tommy Tuberville y otros senadores la han operado' },
  { ticker: 'PLTR',  name: 'Palantir',                 tag: 'Contratos con el gobierno; operada por varios' },
  { ticker: 'MSFT',  name: 'Microsoft',                tag: 'Reportada por Pelosi y otros senadores' },
  { ticker: 'AMZN',  name: 'Amazon',                   tag: 'Operada por varios congresistas' },
];
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function yahooSeries(ticker) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`, { headers: { 'User-Agent': CHROME_UA } });
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`yahoo ${ticker} vacío`);
  const closes = (r.indicators?.quote?.[0]?.close || []).map((v, i) => ({ v, t: r.timestamp[i] })).filter((x) => x.v != null);
  const cur = r.meta?.regularMarketPrice ?? closes[closes.length - 1]?.v;
  if (!cur || closes.length < 30) throw new Error(`yahoo ${ticker} datos insuficientes`);
  const c1y = closes[0].v;
  const cYesterday = closes[closes.length - 2].v;
  const c1m = closes[Math.max(0, closes.length - 22)].v;

  const ret1y = (cur / c1y - 1) * 100;
  const ret1m = (cur / c1m - 1) * 100;
  const change1d = (cur / cYesterday - 1) * 100;
  const val1k1m = 1000 * (cur / c1m);
  const val1k1y = 1000 * (cur / c1y);

  // Volatilidad anualizada (desviación estándar de log-retornos diarios * √252)
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i].v / closes[i - 1].v));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const annualVol = Math.sqrt(variance * 252) * 100;

  // Rango estimado a 3 meses (±1σ, log-normal)
  const s3m = (annualVol / 100) * Math.sqrt(0.25);
  const projLow = cur * Math.exp(-s3m);
  const projHigh = cur * Math.exp(+s3m);

  // Sparkline ~52 puntos
  const step = Math.max(1, Math.floor(closes.length / 52));
  const sparkline = [];
  for (let i = 0; i < closes.length; i += step) sparkline.push(+closes[i].v.toFixed(2));
  if (sparkline[sparkline.length - 1] !== +cur.toFixed(2)) sparkline.push(+cur.toFixed(2));

  return {
    price: +cur.toFixed(2),
    change1d: +change1d.toFixed(2),
    ret1m: +ret1m.toFixed(1),
    ret1y: +ret1y.toFixed(1),
    val1k1m: Math.round(val1k1m),
    val1k1y: Math.round(val1k1y),
    annualVol: +annualVol.toFixed(0),
    projLow: +projLow.toFixed(2),
    projHigh: +projHigh.toFixed(2),
    sparkline,
  };
}

async function politicos() {
  const out = [];
  for (const p of POLITICOS) {
    try { out.push({ ...p, ...(await yahooSeries(p.ticker)) }); }
    catch (e) { console.warn('yahoo', p.ticker, e.message); }
  }
  if (!out.length) { const prev = await readPrev('politicos.json'); if (prev) return; throw new Error('sin datos de tickers'); }
  await writeJSON('politicos.json', { updated: TODAY, source: 'yahoo+curated', tickers: out });
}

/* ---------- main ---------- */
const usdMxn = await rates();
const results = await Promise.allSettled([remesas(usdMxn), market(), reddit(), politicos()]);
results.forEach((r, i) => { if (r.status === 'rejected') console.warn('bloque', i, 'falló:', r.reason?.message); });
console.log('Listo —', TODAY);
