/* feeds.js — pulso de mercado + foros de finanzas */
(function () {
  async function initMarket() {
    const data = await FZ.getJSON('data/market.json');
    const grid = document.getElementById('marketGrid');
    if (!data || !data.markets) { grid.innerHTML = '<div class="loading">Sin datos de mercado por ahora.</div>'; return; }
    FZ.setText('marketUpdated', 'Actualizado: ' + (data.updated || '—'));
    FZ.setText('footerUpdated', data.updated || '—');

    grid.innerHTML = data.markets.map((m) => {
      const up = (m.changePct || 0) >= 0;
      return `<div class="market-card">
        <div class="mc-name">${esc(m.name)}</div>
        <div class="mc-price">${fmtPrice(m)}</div>
        <div class="mc-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(m.changePct || 0).toFixed(2)}%</div>
      </div>`;
    }).join('');

    const sp = data.markets.find((m) => /s&p|sp500/i.test(m.name));
    const btc = data.markets.find((m) => /bitcoin|btc/i.test(m.name));
    if (sp) FZ.setText('heroSp', fmtPrice(sp));
    if (btc) FZ.setText('heroBtc', fmtPrice(btc));
  }

  function fmtPrice(m) {
    const n = m.price || 0;
    const f = new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 });
    return (m.currency === 'USD' || !m.currency ? '$' : '') + f.format(n);
  }

  async function initReddit() {
    const data = await FZ.getJSON('data/reddit.json');
    renderForum('forumUS', data && data.us);
    renderForum('forumMX', data && data.mx);
    renderForum('forumExtra', data && data.extra);
  }

  function renderForum(id, items) {
    const wrap = document.getElementById(id);
    if (!items || !items.length) { wrap.innerHTML = '<div class="loading">Sin publicaciones por ahora.</div>'; return; }
    wrap.innerHTML = items.slice(0, 8).map((p) => `
      <a class="forum-item" href="${esc(p.url)}" target="_blank" rel="noopener">
        <div class="fi-top">
          <span class="fi-sub">r/${esc(p.sub)}</span>
          ${p.score != null ? `<span class="fi-score">▲ ${fmtScore(p.score)}</span>` : '<span class="fi-score">↗ ver hilo</span>'}
        </div>
        <div class="fi-title">${esc(p.title)}</div>
      </a>`).join('');
  }

  const fmtScore = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : (n || 0);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  document.addEventListener('DOMContentLoaded', () => { initMarket(); initReddit(); });
})();
