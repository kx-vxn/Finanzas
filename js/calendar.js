/* calendar.js — calendario de gastos con localStorage */
(function () {
  const K_CFG = 'fz.cfg', K_REC = 'fz.recurring', K_EXP = 'fz.expenses';
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  let cfg = load(K_CFG, { quincenal: 0, pay1: 15, pay2: 30 });
  let recurring = load(K_REC, []);
  let expenses = load(K_EXP, {});
  const today = new Date();
  let view = { y: today.getFullYear(), m: today.getMonth() };
  let modalDate = null;

  function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const clampDay = (d, y, m) => Math.min(d, daysIn(y, m));

  /* ---------- Config ---------- */
  function initConfig() {
    const q = document.getElementById('cfgQuincenal');
    const p1 = document.getElementById('cfgPay1');
    const p2 = document.getElementById('cfgPay2');
    q.value = cfg.quincenal || ''; p1.value = cfg.pay1; p2.value = cfg.pay2;
    [q, p1, p2].forEach((el) => el.addEventListener('input', () => {
      cfg = { quincenal: +q.value || 0, pay1: +p1.value || 15, pay2: +p2.value || 30 };
      save(K_CFG, cfg); renderCalendar(); renderSummary();
    }));

    document.getElementById('recurringForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('recName').value.trim();
      const amount = +document.getElementById('recAmount').value;
      const day = clampDay(+document.getElementById('recDay').value || 1, 2000, 0);
      if (!name || !amount) return;
      recurring.push({ id: uid(), name, amount, day });
      save(K_REC, recurring); e.target.reset();
      renderRecurring(); renderCalendar(); renderSummary();
    });
  }

  function renderRecurring() {
    const wrap = document.getElementById('recurringList');
    if (!recurring.length) { wrap.innerHTML = '<p class="hint">Sin gastos fijos aún.</p>'; return; }
    wrap.innerHTML = recurring.map((r) => `
      <div class="rec-item">
        <span>${esc(r.name)}</span>
        <span class="rec-day">día ${r.day}</span>
        <span class="rec-amt">-${FZ.fmtUSD(r.amount)}</span>
        <button data-id="${r.id}" title="Eliminar">×</button>
      </div>`).join('');
    wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      recurring = recurring.filter((r) => r.id !== b.dataset.id);
      save(K_REC, recurring); renderRecurring(); renderCalendar(); renderSummary();
    }));
  }

  /* ---------- Calendar grid ---------- */
  function renderCalendar() {
    const { y, m } = view;
    document.getElementById('calMonth').textContent = `${MONTHS[m]} ${y}`;
    const grid = document.getElementById('calGrid');
    const dim = daysIn(y, m);
    let startW = new Date(y, m, 1).getDay();      // 0=Sun
    startW = (startW + 6) % 7;                      // Mon-first
    const cells = [];
    for (let i = 0; i < startW; i++) cells.push('<div class="cal-cell empty"></div>');

    for (let d = 1; d <= dim; d++) {
      const income = payOnDay(d, y, m);
      const exp = expenseOnDay(d, y, m);
      const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
      let cls = 'cal-cell';
      if (income) cls += ' has-income';
      if (income - exp > 0 && (income || exp)) cls += ' surplus';
      if (exp > income && exp) cls += ' deficit';
      if (isToday) cls += ' today';
      cells.push(`
        <div class="${cls}" data-day="${d}">
          <span class="cc-day">${d}</span>
          ${income ? `<span class="cc-income">+${compact(income)}</span>` : ''}
          ${exp ? `<span class="cc-expense">-${compact(exp)}</span>` : ''}
        </div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.cal-cell:not(.empty)').forEach((c) =>
      c.addEventListener('click', () => openModal(+c.dataset.day)));
  }

  function payOnDay(d, y, m) {
    let inc = 0;
    if (clampDay(cfg.pay1, y, m) === d) inc += cfg.quincenal;
    if (cfg.pay2 && clampDay(cfg.pay2, y, m) === d) inc += cfg.quincenal;
    return inc;
  }
  function expenseOnDay(d, y, m) {
    let e = 0;
    recurring.forEach((r) => { if (clampDay(r.day, y, m) === d) e += r.amount; });
    (expenses[key(y, m, d)] || []).forEach((x) => e += x.amount);
    return e;
  }

  /* ---------- Summary ---------- */
  function renderSummary() {
    const { y, m } = view;
    const dim = daysIn(y, m);
    let income = 0, expense = 0;
    for (let d = 1; d <= dim; d++) { income += payOnDay(d, y, m); expense += expenseOnDay(d, y, m); }
    const net = income - expense;

    const isCur = y === today.getFullYear() && m === today.getMonth();
    const remDays = isCur ? Math.max(1, dim - today.getDate() + 1) : dim;
    const daily = net / remDays;

    FZ.setText('sumIncome', FZ.fmtUSD(income));
    FZ.setText('sumExpense', '-' + FZ.fmtUSD(expense));
    const netEl = document.getElementById('sumNet');
    netEl.textContent = (net >= 0 ? '' : '-') + FZ.fmtUSD(Math.abs(net));
    netEl.className = net >= 0 ? 'pos' : 'neg';
    FZ.setText('sumNetMxn', FZ.fmtMXN(FZ.usdToMxn(net)) + ' MXN');
    FZ.setText('sumDaily', (daily >= 0 ? '' : '-') + FZ.fmtUSD(Math.abs(daily)) + ' / día');

    const pct = income > 0 ? Math.max(0, Math.min(100, (net / income) * 100)) : 0;
    document.getElementById('sumGauge').style.width = pct + '%';

    const v = document.getElementById('sumVerdict');
    if (!cfg.quincenal) { v.textContent = 'Configura tu ingreso para ver tu plan.'; v.className = 'sum-verdict'; }
    else if (net >= 0) { v.textContent = `Te sobran ${FZ.fmtUSD(net)} este mes. Puedes gastar ~${FZ.fmtUSD(daily)} al día.`; v.className = 'sum-verdict good'; }
    else { v.textContent = `Te faltan ${FZ.fmtUSD(Math.abs(net))} este mes. Revisa tus gastos fijos.`; v.className = 'sum-verdict bad'; }
  }

  /* ---------- Modal (gastos puntuales) ---------- */
  function openModal(d) {
    modalDate = key(view.y, view.m, d);
    document.getElementById('expModalDate').textContent = `${d} de ${MONTHS[view.m]}`;
    renderModalList();
    const mod = document.getElementById('expModal');
    mod.hidden = false;
    setTimeout(() => document.getElementById('expName').focus(), 50);
  }
  function renderModalList() {
    const list = document.getElementById('expList');
    const items = expenses[modalDate] || [];
    if (!items.length) { list.innerHTML = '<p class="exp-empty">Aún no hay gastos este día.</p>'; return; }
    list.innerHTML = items.map((x) => `
      <div class="exp-row"><span>${esc(x.name)}</span><span class="ex-amt">-${FZ.fmtUSD(x.amount)}</span>
        <button data-id="${x.id}" title="Eliminar">×</button></div>`).join('');
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      expenses[modalDate] = (expenses[modalDate] || []).filter((x) => x.id !== b.dataset.id);
      if (!expenses[modalDate].length) delete expenses[modalDate];
      save(K_EXP, expenses); renderModalList(); renderCalendar(); renderSummary();
    }));
  }
  function initModal() {
    const mod = document.getElementById('expModal');
    const close = () => { mod.hidden = true; modalDate = null; };
    document.getElementById('expClose').addEventListener('click', close);
    mod.addEventListener('click', (e) => { if (e.target === mod) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mod.hidden) close(); });
    document.getElementById('expForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('expName').value.trim();
      const amount = +document.getElementById('expAmount').value;
      if (!name || !amount || !modalDate) return;
      (expenses[modalDate] ||= []).push({ id: uid(), name, amount });
      save(K_EXP, expenses); e.target.reset();
      renderModalList(); renderCalendar(); renderSummary();
      document.getElementById('expName').focus();
    });
  }

  function compact(n) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : '$' + n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('calPrev').addEventListener('click', () => { if (--view.m < 0) { view.m = 11; view.y--; } renderCalendar(); renderSummary(); });
    document.getElementById('calNext').addEventListener('click', () => { if (++view.m > 11) { view.m = 0; view.y++; } renderCalendar(); renderSummary(); });
    initConfig(); initModal();
    renderRecurring(); renderCalendar(); renderSummary();
    FZ.onFxReady(renderSummary);
  });
})();
