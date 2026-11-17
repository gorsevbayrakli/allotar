// Site-wide behaviour: loader, smooth scroll, nav, reveals, text effects, cursor, media, forms,
// and lazy start of the WebGL scenes when they come near the viewport.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {get(k){ try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v){ try { sessionStorage.setItem(k, v); } catch {} }};

// ---------- loader (first page of the visit only) ----------
const loader = $('.loader');
if (loader){
  if (store.get('seen') || REDUCED || innerWidth < 760) loader.remove();   // phones go straight to the page
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

// ---------- section themes: the page background follows the section in the middle of the screen ----------
const themed = $$('[data-theme]');
const orbs = document.createElement('div'); orbs.className = 'orbs'; orbs.setAttribute('aria-hidden', 'true'); orbs.innerHTML = '<i></i><i></i><i></i>';
document.body.prepend(orbs);
const orbEls = $$('i', orbs), ORB = [[.9, -.06, 40], [-.7, .05, 52], [.6, -.1, 46]];
let tone = '';
function onScrollFx(){
  const y = scrollY, mid = innerHeight * .55;
  let t = 'light';
  for (const s of themed){ const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid){ t = s.dataset.theme; break; } }
  if (t !== tone){ tone = t; document.documentElement.dataset.tone = t; }
  // orbs drift slowly on their own and move at different speeds with the scroll
  const now = performance.now() / 1000;
  orbEls.forEach((o, i) => { const [sx, sy, a] = ORB[i]; o.style.transform = `translate3d(${Math.sin(now * .07 + i * 2) * a + sx * (y % 2400) * .02}px, ${Math.cos(now * .05 + i) * a + sy * y}px, 0)`; });
  // sideways statement
  $$('.statement').forEach(st => {
    const r = st.getBoundingClientRect(), p = clamp01(-r.top / Math.max(1, r.height - innerHeight));
    st.style.setProperty('--x', `${(.5 - p) * innerWidth * .07}px`);
    st.style.setProperty('--o', clamp01((p - .2) / .3));
  });
  // pinned story: which panel is showing
  $$('[data-story]').forEach(st => {
    const P = $$('.panel', st), r = st.getBoundingClientRect(), p = clamp01(-r.top / Math.max(1, r.height - innerHeight)), n = Math.min(P.length - 1, Math.floor(p * P.length));
    const inView = r.top < innerHeight * .75 && r.bottom > innerHeight * .5;   // the first panel is already up as the story comes in
    P.forEach((el, i) => el.classList.toggle('on', i === n && inView));
    st.classList.toggle('last', n === P.length - 1 && inView);   // the closing panel brings in the selectivity map
    $$('.count i', st).forEach((el, i) => el.classList.toggle('on', i === n));
  });
  // parallax
  $$('[data-speed]').forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > innerHeight + 200) return;
    el.style.transform = `translate3d(0, ${(r.top + r.height / 2 - innerHeight / 2) * -+el.dataset.speed}px, 0)`; });
}
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
if (!REDUCED){ const fx = () => { onScrollFx(); requestAnimationFrame(fx); }; requestAnimationFrame(fx); }
else { addEventListener('scroll', onScrollFx, {passive: true}); onScrollFx(); }

// ---------- smooth scroll ----------
let lenis = null;
if (window.Lenis && !REDUCED){
  lenis = new Lenis({lerp: .14, smoothWheel: true});   // light smoothing: the page follows the wheel closely instead of gliding behind it
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
}
// ---------- home, desktop mouse: one wheel step = one screen ----------
// The page moves between fixed stops: the hero, the statement, each story panel, then each block below (each approach
// row on its own). A wheel step (or one trackpad swipe) glides to the next stop; further wheel events are swallowed
// until the glide has finished and the wheel has been still for a moment, so one gesture never skips two screens.
if (document.body.dataset.page === 'home' && matchMedia('(hover: hover) and (pointer: fine)').matches){
  const H = () => innerHeight, maxY = () => document.documentElement.scrollHeight - innerHeight;
  const top = el => el.getBoundingClientRect().top + scrollY;
  const centre = el => top(el) + el.offsetHeight / 2 - H() / 2;
  function stops(){
    const s = [0];
    const st = $('.statement'); if (st && st.offsetHeight > H()) s.push(top(st) + .65 * (st.offsetHeight - H()));
    const story = $('[data-story]');
    if (story){ const n = $$('.panel', story).length || 4, run = story.offsetHeight - H(); for (let i = 0; i < n; i++) s.push(top(story) + (i + .5) / n * run); }
    const after = story ? top(story) + story.offsetHeight - H() : 0;
    for (const sec of $$('main > section, footer')){
      if (top(sec) <= after) continue;
      if (sec.classList.contains('words')){ $$('.row', sec).forEach((r, i) => s.push(i ? centre(r) : Math.min(centre(r), top(sec) - 24))); continue; }   // the first stop keeps the heading in view
      if (sec.offsetHeight <= H() * 1.15){ s.push(centre(sec)); continue; }
      for (let y = top(sec); y < top(sec) + sec.offsetHeight - H(); y += H() * .8) s.push(y);
    }
    s.push(maxY());
    return s.map(y => Math.round(Math.min(maxY(), Math.max(0, y)))).sort((a, b) => a - b).filter((y, i, a) => !i || y - a[i - 1] > 60);
  }
  let busy = false, lastWheel = 0;
  addEventListener('wheel', e => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || innerWidth < 1000) return;   // pinch-zoom, sideways, narrow windows: leave alone
    e.preventDefault(); e.stopImmediatePropagation();
    const now = performance.now(), quiet = now - lastWheel > 180; lastWheel = now;
    if (busy || !quiet || Math.abs(e.deltaY) < 2) return;
    const y = lenis ? lenis.scroll : scrollY, S = stops(), dir = Math.sign(e.deltaY);
    const to = dir > 0 ? S.find(v => v > y + 8) : [...S].reverse().find(v => v < y - 8);
    if (to === undefined) return;
    busy = true;
    const done = () => { busy = false; };
    if (lenis) lenis.scrollTo(to, {duration: 1.05, lock: true, force: true, onComplete: done});
    else { scrollTo({top: to, behavior: REDUCED ? 'auto' : 'smooth'}); setTimeout(done, REDUCED ? 50 : 900); }
  }, {passive: false, capture: true});
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
// on phones the hero text shows at once: no line-by-line entrance while the page is still loading
if (innerWidth < 760) $$('.hero [data-split], .hero [data-reveal]').forEach(el => { el.removeAttribute('data-split'); el.removeAttribute('data-reveal'); });
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
// a scene's module is fetched when it nears the screen; if the fetch fails (flaky connection), try again a few times
// with a fresh URL instead of leaving the card empty
const load = (name, n = 0) => import(`./${name}.js${n ? `?retry=${n}` : ''}`).catch(err => {
  if (n >= 4) throw err;
  return new Promise(r => setTimeout(r, 800 * (n + 1))).then(() => load(name, n + 1));
});
const scenes = {
  hero: el => load('hero').then(m => m.initHero(el, {mode: el.dataset.mode || 'protein', light: el.closest('[data-theme]')?.dataset.theme !== 'navy'})),
  story: el => load('story').then(m => m.initStory(el)),
  engine: el => load('engine').then(m => m.initEngine(el)),
  selmap: el => load('selmap').then(m => m.initSelmap(el)),
  dynamics: el => load('dynamics').then(m => m.initDynamics(el)),
  allo: el => load('allosteric').then(m => m.initAllosteric(el)),
};
const glo = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return; glo.unobserve(e.target);
  scenes[e.target.dataset.gl](e.target).catch(err => console.warn('scene failed', e.target.dataset.gl, err));
}), {rootMargin: '400px 0px'});
$$('[data-gl]').forEach(el => glo.observe(el));
$$('iframe[data-src]').forEach(f => new IntersectionObserver((en, o) => { if (en[0].isIntersecting){ f.src = f.dataset.src; o.disconnect(); } }, {rootMargin: '300px 0px'}).observe(f));

// looping videos play only while on screen, so off-screen ones don't keep decoding during scroll
const vio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ if (!REDUCED) e.target.play().catch(() => {}); } else e.target.pause(); }), {rootMargin: '200px 0px'});
$$('video[autoplay]').forEach(v => { v.autoplay = false; v.pause(); vio.observe(v); });
