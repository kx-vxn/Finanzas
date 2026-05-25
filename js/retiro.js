/* retiro.js — calculador de retiro estilo SSA (ahorro + Seguro Social) */
(function () {
  let chart = null;

  // Parámetros del Seguro Social (SSA, valores 2025)
  const SS_WAGE_BASE = 176100;   // tope de ingreso sujeto a SS
  const BEND1 = 1226, BEND2 = 7391; // bend points mensuales
  const FRA = 67;                // edad plena de retiro

  const $ = (id) => document.getElementById(id);
  const num = (id) => +$(id).value || 0;

  // Beneficio mensual de SS en dólares de hoy
  function estimateSS(annualIncome, retireAge) {
    const aime = Math.min(annualIncome, SS_WAGE_BASE) / 12;
    let pia = 0.9 * Math.min(aime, BEND1)
      + 0.32 * Math.max(0, Math.min(aime, BEND2) - BEND1)
      + 0.15 * Math.max(0, aime - BEND2);
    const claim = Math.max(62, Math.min(70, retireAge)); // SS se cobra entre 62 y 70
    let factor = 1;
    if (claim < FRA) {
      const m = (FRA - claim) * 12;
      const red = Math.min(36, m) * (5 / 9 / 100) + Math.max(0, m - 36) * (5 / 12 / 100);
      factor = 1 - red;
    } else if (claim > FRA) {
      factor = 1 + (claim - FRA) * 0.08; // créditos por retraso (~8%/año)
    }
    return { monthly: pia * factor, claim };
  }

  function render() {
    const age = num('rAge'), retire = num('rRetire');
    const current = num('rCurrent'), monthly = num('rMonthly'), spend = num('rSpend');
    const income = num('rIncome');
    const ret = num('rReturn'), infl = num('rInfl');
    $('rValReturn').textContent = ret + '%';
    $('rValInfl').textContent = infl + '%';

    const years = Math.max(0, retire - age);
    const r = ret / 100 / 12;
    const inflFactor = Math.pow(1 + infl / 100, years);

    // Crecimiento del ahorro año por año
    let bal = current;
    const labels = [`${age}`], series = [Math.round(current)];
    for (let y = 1; y <= years; y++) {
      for (let mo = 0; mo < 12; mo++) bal = bal * (1 + r) + monthly;
      labels.push(`${age + y}`);
      series.push(Math.round(bal));
    }
    const nestNominal = bal;
    const nestReal = nestNominal / inflFactor;

    // Ingreso mensual: regla del 4% sobre el ahorro + Seguro Social
    const fromSavingsNominal = (nestNominal * 0.04) / 12;
    const fromSavingsReal = fromSavingsNominal / inflFactor;
    const ss = estimateSS(income, retire);                 // hoy
    const ssNominal = ss.monthly * inflFactor;             // SS sube con la inflación (COLA)
    const totalNominal = fromSavingsNominal + ssNominal;
    const totalReal = fromSavingsReal + ss.monthly;

    $('rNestNominal').textContent = FZ.fmtUSD(nestNominal);
    $('rNestReal').textContent = FZ.fmtUSD(nestReal);
    $('rIncNominal').textContent = FZ.fmtUSD(totalNominal) + '/mes';
    $('rIncReal').textContent = FZ.fmtUSD(totalReal) + '/mes';
    $('rbSavings').textContent = FZ.fmtUSD(fromSavingsReal) + '/mes';
    $('rbSS').textContent = FZ.fmtUSD(ss.monthly) + '/mes';

    // Cobertura del gasto actual (en dólares de hoy)
    const cov = spend > 0 ? (totalReal / spend) * 100 : 0;
    $('rbCoverage').textContent = Math.round(cov) + '%';
    const covEl = $('rbCoverage');
    covEl.className = cov >= 100 ? 'accent-em' : 'neg';

    const note = $('rbNote');
    if (years <= 0) note.textContent = 'Tu edad de retiro debe ser mayor a tu edad actual.';
    else if (cov >= 100) note.textContent = `En ${years} años tu ingreso de retiro cubriría tu gasto actual de ${FZ.fmtUSD(spend)}/mes. Vas bien.`;
    else note.textContent = `En ${years} años tu ingreso cubriría ${Math.round(cov)}% de tu gasto actual. Considera ahorrar más o retirarte más tarde.`;

    drawChart(labels, series);
  }

  function drawChart(labels, series) {
    const ctx = $('retiroCanvas').getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, 'rgba(229,192,123,.30)');
    g.addColorStop(1, 'rgba(229,192,123,0)');
    const ds = [{
      label: 'Ahorro acumulado', data: series,
      borderColor: '#E5C07B', backgroundColor: g, borderWidth: 3,
      fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5,
    }];
    if (!chart) {
      Chart.defaults.font.family = "'Manrope', sans-serif";
      Chart.defaults.color = '#93A1B5';
      chart = new Chart(ctx, {
        type: 'line', data: { labels, datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#10151F', borderColor: 'rgba(255,255,255,.13)', borderWidth: 1, padding: 12,
              titleColor: '#EAF0F7', bodyColor: '#93A1B5',
              titleFont: { family: "'JetBrains Mono', monospace" }, bodyFont: { family: "'JetBrains Mono', monospace" },
              callbacks: { title: (c) => 'Edad ' + c[0].label, label: (c) => ' ' + FZ.fmtUSD(c.parsed.y) },
            },
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { maxRotation: 0, autoSkipPadding: 24 } },
            y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: (v) => '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v), font: { family: "'JetBrains Mono', monospace" } } },
          },
        },
      });
    } else {
      chart.data.labels = labels; chart.data.datasets = ds; chart.update();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['rAge', 'rRetire', 'rCurrent', 'rMonthly', 'rSpend', 'rIncome', 'rReturn', 'rInfl']
      .forEach((id) => $(id).addEventListener('input', render));
    render();
  });
})();
