/* remesas.js — comparador de envíos EE.UU. → México */
(function () {
  let providers = [];

  async function init() {
    const data = await FZ.getJSON('data/remesas.json');
    if (data && data.providers) {
      providers = data.providers;
      FZ.setText('remesasUpdated', 'Actualizado: ' + (data.updated || '—'));
    } else {
      document.getElementById('remesasBody').innerHTML =
        '<tr><td colspan="5" class="loading">No hay datos disponibles. El robot los generará pronto.</td></tr>';
      return;
    }
    const input = document.getElementById('remAmount');
    input.addEventListener('input', render);
    render();
  }

  function render() {
    const amount = Math.max(0, +document.getElementById('remAmount').value || 0);
    const rows = providers
      .map((p) => ({ ...p, received: Math.max(0, (amount - (p.fee || 0)) * p.rate) }))
      .sort((a, b) => b.received - a.received);

    const body = document.getElementById('remesasBody');
    body.innerHTML = rows.map((p, i) => `
      <tr class="${i === 0 ? 'best' : ''}">
        <td>
          <div class="prov-cell">
            <span class="prov-logo" style="background:${p.color || '#34D399'}">${initials(p.name)}</span>
            ${esc(p.name)} ${i === 0 ? '<span class="rank-tag">★ mejor</span>' : ''}
          </div>
        </td>
        <td class="num">${p.rate.toFixed(3)}</td>
        <td class="num">${p.fee ? FZ.fmtUSD(p.fee) : 'Gratis'}</td>
        <td class="num recibe">${FZ.fmtMXN(p.received)}</td>
        <td class="num"><span class="rank-tag">#${i + 1}</span></td>
      </tr>`).join('');

    if (rows[0]) {
      FZ.setText('remesasBestValue', FZ.fmtMXN(rows[0].received));
    }
  }

  function initials(name) {
    return name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '$';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  document.addEventListener('DOMContentLoaded', init);
})();
