/* interes.js — calculadora de interés compuesto + comparación de activos */
(function () {
  let chart = null;
  let scenario = 'base';

  const ASSETS = [
    { key: 'sp500', name: 'S&P 500', rate: 10, color: '#E5C07B' },
    { key: 'cetes', name: 'CETES (MX)', rate: 10, color: '#6BA8F2' },
    { key: 'realestate', name: 'Bienes raíces', rate: 6, color: '#E59866' },
    { key: 'bonds', name: 'Bonos', rate: 4, color: '#8FA3B8' },
    { key: 'savings', name: 'Ahorro', rate: 1.5, color: '#5C6878' },
  ];

  const $ = (id) => document.getElementById(id);
  const fmtCompact = (n) => '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  function inputs() {
    return {
      monthly: +$('inMonthly').value,
      rate: +$('inRate').value,
      years: +$('inYears').value,
      initial: +$('inInitial').value,
    };
  }

  // Saldo año por año con aporte mensual
  function series(annualRate, monthly, years, initial) {
    const r = annualRate / 100 / 12;
    let bal = initial;
    const pts = [initial];
    for (let y = 1; y <= years; y++) {
      for (let mo = 0; mo < 12; mo++) bal = bal * (1 + r) + monthly;
      pts.push(Math.round(bal));
    }
    return pts;
  }

  function scenarioRate(base) {
    const off = scenario === 'pesimista' ? -3 : scenario === 'optimista' ? 3 : 0;
    return Math.max(0.5, base + off);
  }

  function render() {
    const { monthly, rate, years, initial } = inputs();
    $('valMonthly').textContent = '$' + monthly;
    $('valRate').textContent = rate + '%';
    $('valYears').textContent = years;
    $('valInitial').textContent = '$' + Intl.NumberFormat('en-US').format(initial);

    const effRate = scenarioRate(rate);
    const labels = Array.from({ length: years + 1 }, (_, i) => i === 0 ? 'Hoy' : `Año ${i}`);
    const mine = series(effRate, monthly, years, initial);

    const compare = $('inCompare').checked;
    const datasets = [{
      label: 'Tu inversión',
      data: mine,
      borderColor: '#34D399',
      backgroundColor: makeGradient(),
      borderWidth: 3,
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 5,
      order: 0,
    }];
    if (compare) {
      ASSETS.forEach((a) => datasets.push({
        label: a.name,
        data: series(a.rate, monthly, years, initial),
        borderColor: a.color,
        backgroundColor: 'transparent',
        borderWidth: 1.6,
        borderDash: [4, 4],
        fill: false,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 1,
      }));
    }

    if (!chart) chart = build(labels, datasets);
    else { chart.data.labels = labels; chart.data.datasets = datasets; chart.update(); }

    // Resultado
    const final = mine[mine.length - 1];
    const contrib = initial + monthly * 12 * years;
    $('irContrib').textContent = FZ.fmtUSD(contrib);
    $('irInterest').textContent = FZ.fmtUSD(Math.max(0, final - contrib));
    $('irFinal').textContent = FZ.fmtUSD(final);
    $('irFinalMxn').textContent = FZ.fmtMXN(FZ.usdToMxn(final)) + ' MXN';

    renderLegend(compare);
  }

  function makeGradient() {
    const ctx = $('interesCanvas').getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 400);
    g.addColorStop(0, 'rgba(52,211,153,.32)');
    g.addColorStop(1, 'rgba(52,211,153,0)');
    return g;
  }

  function build(labels, datasets) {
    const ctx = $('interesCanvas').getContext('2d');
    Chart.defaults.font.family = "'Manrope', sans-serif";
    Chart.defaults.color = '#93A1B5';
    return new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#10151F',
            borderColor: 'rgba(255,255,255,.13)',
            borderWidth: 1,
            padding: 12,
            titleColor: '#EAF0F7',
            bodyColor: '#93A1B5',
            titleFont: { family: "'JetBrains Mono', monospace" },
            bodyFont: { family: "'JetBrains Mono', monospace" },
            callbacks: { label: (c) => ` ${c.dataset.label}: ${FZ.fmtUSD(c.parsed.y)}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { maxRotation: 0, autoSkipPadding: 20 } },
          y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: (v) => fmtCompact(v), font: { family: "'JetBrains Mono', monospace" } } },
        },
      },
    });
  }

  function renderLegend(compare) {
    const items = [{ name: 'Tu inversión', color: '#34D399' }];
    if (compare) ASSETS.forEach((a) => items.push({ name: `${a.name} (${a.rate}%)`, color: a.color }));
    $('assetLegend').innerHTML = items.map((i) =>
      `<span class="lg"><i style="background:${i.color}"></i>${i.name}</span>`).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['inMonthly', 'inRate', 'inYears', 'inInitial', 'inCompare'].forEach((id) =>
      $(id).addEventListener('input', render));
    document.querySelectorAll('.scenario-toggle button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.scenario-toggle button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active'); scenario = b.dataset.scn; render();
      }));
    render();
    FZ.onFxReady(render);
  });
})();
