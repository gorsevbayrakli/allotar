// Site-wide behaviour: loader, smooth scroll, nav, reveals, text effects, cursor, media, forms,
// and lazy start of the WebGL scenes when they come near the viewport.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {get(k){ try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v){ try { sessionStorage.setItem(k, v); } catch {} }};

// ---------- loader (first page of the visit only) ----------
const loader = $('.loader');
if (loader){
  if (store.get('seen') || REDUCED) loader.remove();
  else {
    store.set('seen', 1);
    const pct = $('.pct', loader), bar = $('.bar i', loader), t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 3);
      pct.textContent = String(Math.round(e * 100)).padStart(3, '0'); bar.style.transform = `scaleX(${e})`;
      if (k < 1) requestAnimationFrame(tick); else { loader.classList.add('done'); setTimeout(() => loader.remove(), 1100); }
    };
    requestAnimationFrame(tick);
  }
}

// ---------- smooth scroll ----------
let lenis = null;
if (window.Lenis && !REDUCED){
  lenis = new Lenis({duration: 1.15, smoothWheel: true});
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
}
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href'); if (id.length < 2) return; const el = $(id); if (!el) return;
  e.preventDefault(); lenis ? lenis.scrollTo(el, {offset: -70}) : el.scrollIntoView({behavior: 'smooth'});
}));

// ---------- nav ----------
const nav = $('.nav');
if (nav){
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('solid', y > 40);
    nav.classList.toggle('hide', y > 500 && y > lastY && !nav.classList.contains('open'));
    lastY = y;
  };
  addEventListener('scroll', onScroll, {passive: true}); onScroll();
  $('.burger', nav).addEventListener('click', () => { const o = nav.classList.toggle('open'); $('.burger', nav).setAttribute('aria-expanded', o); });
  const page = document.body.dataset.page;
  $$('ul a', nav).forEach(a => { if (a.dataset.page === page) a.classList.add('on'); });
}

// ---------- headings split into lines that slide up ----------
const splitHeading = h => {
  const words = h.innerHTML.trim().split(/\s+/);
  h.innerHTML = words.map(w => `<span class="w" style="display:inline-block">${w}</span>`).join(' ');
  const lines = []; let top = null;
  $$('.w', h).forEach(w => { if (w.offsetTop !== top){ top = w.offsetTop; lines.push([]); } lines[lines.length - 1].push(w.innerHTML); });
  h.innerHTML = lines.map((l, i) => `<span class="split-line"><span style="transition-delay:${i * .09}s">${l.join(' ')}</span></span>`).join('');
};
// measure lines only once the web fonts are in, otherwise the breaks are wrong
const splits = $$('[data-split]'); splits.forEach(h => h.dataset.html = h.innerHTML);
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => splits.forEach(splitHeading));
let splitW = innerWidth;
addEventListener('resize', () => { if (Math.abs(innerWidth - splitW) < 60) return; splitW = innerWidth; splits.forEach(h => { const inn = h.classList.contains('in'); h.innerHTML = h.dataset.html; splitHeading(h); if (inn) h.classList.add('in'); }); });

// ---------- scramble text ----------
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]_-+*#';
function scramble(el){
  const text = el.dataset.text || (el.dataset.text = el.textContent);
  if (REDUCED){ el.textContent = text; return; }
  const t0 = performance.now(), dur = 900;
  const step = () => {
    const k = (performance.now() - t0) / dur; let s = '';
    for (let i = 0; i < text.length; i++){ const r = i / text.length * .6; s += (k > r + .4 || text[i] === ' ') ? text[i] : k > r ? GLYPHS[Math.random() * GLYPHS.length | 0] : ' '; }
    el.textContent = s; if (k < 1) requestAnimationFrame(step); else el.textContent = text;
  };
  step();
}

// ---------- count-up numbers ----------
function countUp(el){
  const end = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1800;
  if (REDUCED){ el.textContent = pre + end + suf; return; }
  const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = pre + Math.round(end * e) + suf; if (k < 1) requestAnimationFrame(step); };
  step();
}

// ---------- reveal on scroll ----------
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target; el.classList.add('in'); io.unobserve(el);
  if (el.matches('[data-scramble]')) scramble(el);
  $$('[data-scramble]', el).forEach(scramble);
  if (el.matches('[data-count]')) countUp(el);
  $$('[data-count]', el).forEach(countUp);
}), {threshold: .15, rootMargin: '0px 0px -6% 0px'});
$$('[data-reveal],[data-split],.label,[data-count],.pipe').forEach(el => io.observe(el));
$$('.label').forEach(l => l.setAttribute('data-scramble', ''));

// ---------- card spotlight ----------
$$('.card').forEach(c => c.addEventListener('pointermove', e => {
  const b = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - b.left) + 'px'); c.style.setProperty('--my', (e.clientY - b.top) + 'px');
}));

// ---------- cursor ----------
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !REDUCED){
  const cur = document.createElement('div'); cur.className = 'cursor'; document.body.appendChild(cur);
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; });
  const loop = () => { cx += (x - cx) * .2; cy += (y - cy) * .2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); }; loop();
  document.addEventListener('pointerover', e => cur.classList.toggle('hot', !!e.target.closest('a,button,.video-card,summary')));
}

// ---------- video modal ----------
const modal = $('.modal');
if (modal){
  const v = $('video', modal), close = () => { modal.classList.remove('open'); v.pause(); lenis && lenis.start(); };
  $$('[data-video]').forEach(c => c.addEventListener('click', () => { v.src = c.dataset.video; modal.classList.add('open'); lenis && lenis.stop(); v.play().catch(() => {}); $('button', modal).focus(); }));
  $('button', modal).addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
}
$$('.video-card').forEach(c => c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); c.click(); } }));

// ---------- programs slideshow ----------
const slides = $('.slides');
if (slides){
  const items = $$('.slide', slides), dots = $$('.dots button[data-i]', slides), pauseBtn = $('.dots .pause', slides);
  let i = 0, timer = null, paused = REDUCED;
  const show = n => { i = (n + items.length) % items.length; items.forEach((s, k) => s.classList.toggle('on', k === i)); dots.forEach((d, k) => { d.classList.remove('on'); void d.offsetWidth; d.classList.toggle('on', k === i); d.setAttribute('aria-current', k === i); }); };
  const run = () => { clearInterval(timer); if (!paused) timer = setInterval(() => show(i + 1), 10000); };
  dots.forEach(d => d.addEventListener('click', () => { show(+d.dataset.i); run(); }));
  pauseBtn.addEventListener('click', () => { paused = !paused; slides.classList.toggle('paused', paused); pauseBtn.textContent = paused ? 'Play' : 'Pause'; run(); });
  if (REDUCED){ slides.classList.add('paused'); pauseBtn.textContent = 'Play'; }
  show(0); run();
}

// ---------- contact form: visual only for now, nothing is sent ----------
const form = $('form[name=contact]');
if (form){
  const msg = $('.form-msg', form);
  form.addEventListener('submit', e => {
    e.preventDefault();
    msg.innerHTML = 'The form is not active yet. Please write to <a href="mailto:contact@allotar.com" style="color:var(--ink)">contact@allotar.com</a>.';
    msg.style.color = 'var(--soft)';
  });
}

// ---------- WebGL scenes start when they approach the viewport ----------
const scenes = {
  hero: el => import('./hero.js').then(m => m.initHero(el, {mode: el.dataset.mode || 'protein'})),
  engine: el => import('./engine.js').then(m => m.initEngine(el)),
  dynamics: el => import('./dynamics.js').then(m => m.initDynamics(el)),
  allo: el => import('./allosteric.js').then(m => m.initAllosteric(el)),
};
const glo = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return; glo.unobserve(e.target);
  scenes[e.target.dataset.gl](e.target).catch(err => console.warn('scene failed', e.target.dataset.gl, err));
}), {rootMargin: '400px 0px'});
$$('[data-gl]').forEach(el => glo.observe(el));
$$('iframe[data-src]').forEach(f => new IntersectionObserver((en, o) => { if (en[0].isIntersecting){ f.src = f.dataset.src; o.disconnect(); } }, {rootMargin: '300px 0px'}).observe(f));
