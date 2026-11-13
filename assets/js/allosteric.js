// Allosteric discovery charts (2D canvas, glowing on dark), drawn without any text: conformational landscape,
// probe density vs proximity, and the allosteric profile along the sequence. Three sites are found one by one; at
// each, the trajectory hops state, the site's peak and its probe cluster light up together.
import {animate, rng, clamp, ease} from './gl.js';

const C = {axis: 'rgba(160,180,255,.22)', grid: 'rgba(160,180,255,.06)', dim: '#7d88b3', ink: '#dfe6ff', blue: '#59a8ff', violet: '#a08cff', site: '#ff7a3a', teal: '#19d3a8'};
const CYCLE = 12;

export function initAllosteric(root){
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), btn = root.querySelector('button');
  let W = 1, H = 1, paused = false, clock = 0;
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  new ResizeObserver(resize).observe(cv); resize();
  btn.addEventListener('click', () => { paused = !paused; btn.textContent = paused ? 'Play animation' : 'Pause animation'; btn.setAttribute('aria-pressed', paused); });

  // data
  const r = rng(11), gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / 1.2; };
  const conf = Array.from({length: 320}, (_, i) => { const act = i % 5 < 2; return {x: act ? .7 + gauss() * .09 : .3 + gauss() * .1, y: act ? .68 + gauss() * .09 : .32 + gauss() * .1, p: r() * 6.28, act}; });
  const probes = Array.from({length: 130}, () => ({x: clamp(r() * .95 + .02), y: clamp(Math.pow(r(), 1.4) * .95 + .02), p: r() * 6.28, d: r()}));
  const NRES = 200, f1 = [], f2 = [], SITES = [46, 118, 163];
  for (let i = 0; i < NRES; i++){
    const peak = SITES.reduce((s, c) => s + Math.exp(-((i - c) ** 2) / 40), 0);
    f1.push(clamp(.18 + .55 * peak + .08 * Math.sin(i * .21) + .05 * Math.sin(i * .9)));
    f2.push(clamp(.12 + .45 * peak + .1 * Math.sin(i * .13 + 1) + .05 * Math.cos(i * .7)));
  }
  // three discoveries, one per allosteric site. At each moment, all at once: the trajectory hops to the other
  // state, the site's peak lights up on the profile and its cluster of probes lights up in the probe panel
  // (two clusters top right, one bottom left)
  const EVENTS = [.32, .52, .72], HOP = .05;
  const CLUSTERS = [[.74, .8], [.2, .24], [.9, .6]].map(([cx, cy]) => Array.from({length: 8}, () => ({x: clamp(cx + gauss() * .045), y: clamp(cy + gauss() * .05), p: r() * 6.28})));
  let F = 1;   // end-of-cycle fade, applied to everything

  function panel(x, y, w, h){
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++){ ctx.beginPath(); ctx.moveTo(x + w * k / 4, y); ctx.lineTo(x + w * k / 4, y + h); ctx.moveTo(x, y + h * k / 4); ctx.lineTo(x + w, y + h * k / 4); ctx.stroke(); }
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
  }
  function dot(x, y, rad, col, glow, a = 1){ ctx.globalAlpha = a * F; ctx.shadowColor = col; ctx.shadowBlur = glow; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
  function blob(x, y, rad, col, a){ const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }

  animate(root, dt => {
    if (!paused) clock += dt;
    const t = clock, c = (t % CYCLE) / CYCLE;
    F = 1 - clamp((c - .92) / .06);
    // how far each discovery has played out (0 before, rising to 1 at its moment), and the flash right after it
    const pop = EVENTS.map(e => ease(clamp((c - e) / .03))), flash = EVENTS.map(e => { const u = (c - e) / .08; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; });
    ctx.clearRect(0, 0, W, H);
    const narrow = W < 520, pad = narrow ? 24 : 32, gap = 32, top = narrow ? 56 : 32;   // room for the pause button (top right on phones, bottom right otherwise)
    const pw = narrow ? W - pad * 2 : (W - pad * 2 - gap) / 2, ph = narrow ? H * .2 : H * .36;

    // A: conformational landscape
    const ax = pad, ay = top;
    panel(ax, ay, pw, ph);
    ctx.globalAlpha = F;
    blob(ax + pw * .3, ay + ph * .68, pw * .32, 'rgba(89,168,255,A)', .16);
    blob(ax + pw * .7, ay + ph * .32, pw * .3, 'rgba(160,140,255,A)', .16);
    ctx.globalAlpha = 1;
    const reveal = ease(clamp(c * 5));
    conf.forEach((q, i) => { if (i / conf.length > reveal) return; const x = ax + (q.x + .01 * Math.sin(t * .8 + q.p)) * pw, y = ay + (1 - q.y + .01 * Math.cos(t * .7 + q.p)) * ph; dot(x, y, 1.4, q.act ? C.violet : C.blue, 4, .75); });
    // the trajectory rests in one state and hops to the other, arriving exactly at each discovery
    let state = 0; EVENTS.forEach(e => { state += ease(clamp((c - (e - HOP)) / HOP)); });
    const side = state % 2 <= 1 ? state % 2 : 2 - state % 2;   // 0 inactive … 1 active, back and forth
    const tx = ax + (.3 + .4 * side + .03 * Math.sin(t * 2.3)) * pw, ty = ay + (1 - (.32 + .36 * side + .03 * Math.cos(t * 1.9))) * ph;
    dot(tx, ty, 4 + 3 * Math.max(...flash), C.site, 16 + 14 * Math.max(...flash));

    // B: probe density vs proximity
    const bx = narrow ? pad : pad + pw + gap, by = narrow ? top + ph + 32 : top;
    panel(bx, by, pw, ph);
    const reveal2 = ease(clamp(c * 5 - .3));
    probes.forEach((q, i) => { if (i / probes.length > reveal2) return; dot(bx + q.x * pw, by + (1 - q.y) * ph, 1.8, C.blue, 5, .5 + .3 * q.d); });
    CLUSTERS.forEach((cl, k) => {
      if (pop[k] <= 0) return;
      const mx = cl.reduce((s, q) => s + q.x, 0) / cl.length, my = cl.reduce((s, q) => s + q.y, 0) / cl.length;
      ctx.globalAlpha = F; blob(bx + mx * pw, by + (1 - my) * ph, pw * .14 * (1 + .4 * flash[k]), 'rgba(255,122,58,A)', .22 * pop[k]); ctx.globalAlpha = 1;
      cl.forEach(q => dot(bx + q.x * pw, by + (1 - q.y) * ph, (2.6 + .6 * Math.sin(t * 3 + q.p)) * (.4 + .6 * pop[k]) + 2 * flash[k], C.site, 14, .95 * pop[k]));
    });

    // C: allosteric profile
    const cx = pad, cy = by + ph + 32, cw = W - pad * 2, ch = H - cy - (narrow ? 32 : 64);
    panel(cx, cy, cw, ch);
    const draw = ease(clamp((c - .05) / .2)), n = Math.floor(NRES * draw);
    for (const [arr, col, dash] of [[f1, C.blue, []], [f2, C.violet, [5, 4]]]){
      ctx.globalAlpha = F; ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath();
      for (let i = 0; i < n; i++){ const x = cx + i / (NRES - 1) * cw, y = cy + (1 - arr[i]) * ch; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    SITES.forEach((s, k) => { if (pop[k] <= 0) return; const x = cx + s / (NRES - 1) * cw, y = cy + (1 - f1[s]) * ch;
      const g = ctx.createLinearGradient(0, cy, 0, cy + ch); g.addColorStop(0, `rgba(255,122,58,${.18 * pop[k] + .15 * flash[k]})`); g.addColorStop(1, 'rgba(255,122,58,0)');
      ctx.globalAlpha = F; ctx.fillStyle = g; ctx.fillRect(x - 6, cy, 12, ch); ctx.globalAlpha = 1;
      dot(x, y - 8, (4 + Math.sin(t * 3 + s)) * (.4 + .6 * pop[k]) + 3 * flash[k], C.site, 18 + 14 * flash[k], pop[k]); });
  });
}
