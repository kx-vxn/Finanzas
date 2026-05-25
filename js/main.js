/* main.js — utilidades compartidas, carga de datos, animaciones */
window.FZ = (function () {
  const state = { fx: 17.0, fxReady: false, cbs: [] };

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  const fmtUSD = (n) => (Math.abs(n) >= 1000 || Number.isInteger(n)) ? usd.format(n) : usd2.format(n);
  const fmtMXN = (n) => mxn.format(n);
  const usdToMxn = (n) => n * state.fx;

  async function getJSON(path) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.warn('No se pudo cargar', path, e);
      return null;
    }
  }

  function onFxReady(cb) {
    if (state.fxReady) cb(state.fx);
    else state.cbs.push(cb);
  }

  async function loadRates() {
    const data = await getJSON('data/rates.json');
    if (data && data.usdMxn) {
      state.fx = data.usdMxn;
    }
    state.fxReady = true;
    const val = state.fx.toFixed(2);
    setText('navFxValue', val);
    setText('heroFx', '$' + val);
    state.cbs.forEach((cb) => cb(state.fx));
    return data;
  }

  function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

  // Reveal on scroll
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.section-head, .card, .region-card, .market-card').forEach((el) => {
      el.style.opacity = '0';
      io.observe(el);
    });
  }

  // Active nav link
  function initNavSpy() {
    const links = [...document.querySelectorAll('.nav-links a')];
    const map = {};
    links.forEach((a) => { const id = a.getAttribute('href').slice(1); map[id] = a; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((l) => l.style.color = '');
          if (map[en.target.id]) map[en.target.id].style.color = 'var(--text)';
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('main .section').forEach((s) => io.observe(s));
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadRates();
    initReveal();
    initNavSpy();
  });

  return { getJSON, onFxReady, fmtUSD, fmtMXN, usdToMxn, setText, get fx() { return state.fx; } };
})();
