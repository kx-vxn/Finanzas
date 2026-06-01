/* politicos.js — tarjetas de stocks ligados a políticos */
(function () {
  async function init() {
    const data = await FZ.getJSON('data/politicos.json');
    const grid = document.getElementById('politicosGrid');
    if (!data || !data.tickers || !data.tickers.length) {
      grid.innerHTML = '<div class="loading">No hay datos disponibles. El robot los generará pronto.</div>';
      return;
    }
    FZ.setText('politicosUpdated', 'Actualizado: ' + (data.updated || '—'));
    grid.innerHTML = data.tickers.map(card).join('');
  }

  function card(t) {
    const dirDay = t.change1d >= 0 ? 'up' : 'down';
    const dir1m = t.ret1m >= 0 ? 'up' : 'down';
    const dir1y = t.ret1y >= 0 ? 'up' : 'down';
    const sparkColor = t.ret1y >= 0 ? '#34D399' : '#F2756B';
    return `
      <article class="politico-card">
        <header class="pc-head">
          <span class="pc-ticker">${esc(t.ticker)}</span>
          <div class="pc-id">
            <h4 class="pc-name">${esc(t.name)}</h4>
            <p class="pc-tag">${esc(t.tag)}</p>
          </div>
          <div class="pc-price">
            <span class="pc-curr">$${fmt(t.price)}</span>
            <span class="pc-day ${dirDay}">${arrow(t.change1d)} ${Math.abs(t.change1d).toFixed(2)}%</span>
          </div>
        </header>

        <div class="pc-spark">${sparkSvg(t.sparkline, sparkColor)}</div>

        <div class="pc-returns">
          <div class="pcr"><span>1 día</span><b class="${dirDay}">${signed(t.change1d, 2)}%</b></div>
          <div class="pcr"><span>1 mes</span><b class="${dir1m}">${signed(t.ret1m, 1)}%</b></div>
          <div class="pcr"><span>1 año</span><b class="${dir1y}">${signed(t.ret1y, 1)}%</b></div>
        </div>

        <div class="pc-gains">
          <div class="pcg-row"><span>$1,000 hace 1 mes</span><b>$${fmt(t.val1k1m)}</b></div>
          <div class="pcg-row"><span>$1,000 hace 1 año</span><b>$${fmt(t.val1k1y)}</b></div>
        </div>

        <div class="pc-proj">
          <div class="pcp-label">Rango estimado a 3 meses <small>(±1σ · vol ${t.annualVol}%)</small></div>
          <div class="pcp-band">
            <span class="pcp-low">$${fmt(t.projLow)}</span>
            <div class="pcp-bar"><span class="pcp-now" title="precio actual"></span></div>
            <span class="pcp-high">$${fmt(t.projHigh)}</span>
          </div>
        </div>
      </article>`;
  }

  // Sparkline SVG
  function sparkSvg(arr, color) {
    if (!arr || arr.length < 2) return '';
    const W = 280, H = 56, P = 2;
    const min = Math.min(...arr), max = Math.max(...arr), rng = max - min || 1;
    const pts = arr.map((v, i) => {
      const x = P + (i / (arr.length - 1)) * (W - 2 * P);
      const y = H - P - ((v - min) / rng) * (H - 2 * P);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const path = 'M ' + pts.join(' L ');
    const area = `M ${P},${H - P} L ${pts.join(' L ')} L ${W - P},${H - P} Z`;
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // Helpers
  const fmt = (n) => Intl.NumberFormat('en-US', { maximumFractionDigits: n < 10 ? 2 : n < 1000 ? 1 : 0 }).format(n);
  const signed = (n, d) => (n >= 0 ? '+' : '') + n.toFixed(d);
  const arrow = (n) => n >= 0 ? '▲' : '▼';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  document.addEventListener('DOMContentLoaded', init);
})();
