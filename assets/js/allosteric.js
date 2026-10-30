// Allosteric discovery charts (2D canvas, glowing on dark): conformational landscape,
// probe density vs proximity, and the allosteric profile along the sequence.
import {animate, rng, clamp, ease} from './gl.js';

const MONO = "500 10px 'JetBrains Mono', monospace";
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
  probes.forEach(q => q.allo = q.x > .55 && q.y > .55);
  const NRES = 200, f1 = [], f2 = [], SITES = [46, 118, 163];
  for (let i = 0; i < NRES; i++){
    const peak = SITES.reduce((s, c) => s + Math.exp(-((i - c) ** 2) / 40), 0);
    f1.push(clamp(.18 + .55 * peak + .08 * Math.sin(i * .21) + .05 * Math.sin(i * .9)));
    f2.push(clamp(.12 + .45 * peak + .1 * Math.sin(i * .13 + 1) + .05 * Math.cos(i * .7)));
  }

  function panel(x, y, w, h, title, xl, yl){
    ctx.font = MONO; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(title, x, y - 10);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++){ ctx.beginPath(); ctx.moveTo(x + w * k / 4, y); ctx.lineTo(x + w * k / 4, y + h); ctx.moveTo(x, y + h * k / 4); ctx.lineTo(x + w, y + h * k / 4); ctx.stroke(); }
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.fillStyle = C.dim; ctx.textAlign = 'center'; ctx.fillText(xl, x + w / 2, y + h + 16);
    ctx.save(); ctx.translate(x - 12, y + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, 0, 0); ctx.restore();
  }
  function dot(x, y, rad, col, glow, a = 1){ ctx.globalAlpha = a; ctx.shadowColor = col; ctx.shadowBlur = glow; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
  function blob(x, y, rad, col, a){ const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }

  animate(root, dt => {
    if (!paused) clock += dt;
    const t = clock, c = (t % CYCLE) / CYCLE;
    ctx.clearRect(0, 0, W, H);
    const narrow = W < 520, pad = narrow ? 34 : 44, gap = 46, top = 36;
    const pw = narrow ? W - pad * 2 : (W - pad * 2 - gap) / 2, ph = narrow ? H * .2 : H * .36;

    // A: conformational landscape
    const ax = pad, ay = top;
    panel(ax, ay, pw, ph, 'CONFORMATIONAL LANDSCAPE', 'PC1', 'PC2');
    blob(ax + pw * .3, ay + ph * .68, pw * .32, 'rgba(89,168,255,A)', .16);
    blob(ax + pw * .7, ay + ph * .32, pw * .3, 'rgba(160,140,255,A)', .16);
    ctx.font = MONO; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
    ctx.fillText('inactive', ax + pw * .3, ay + ph * .97); ctx.fillText('active', ax + pw * .72, ay + 12);
    const reveal = ease(clamp(c * 4));
    conf.forEach((q, i) => { if (i / conf.length > reveal) return; const x = ax + (q.x + .01 * Math.sin(t * .8 + q.p)) * pw, y = ay + (1 - q.y + .01 * Math.cos(t * .7 + q.p)) * ph; dot(x, y, 1.4, q.act ? C.violet : C.blue, 4, .75); });
    // trajectory hopping between the two states
    const hop = .5 - .5 * Math.cos(t * .9), tx = ax + (.3 + .4 * hop + .05 * Math.sin(t * 2.3)) * pw, ty = ay + (1 - (.32 + .36 * hop + .05 * Math.cos(t * 1.9))) * ph;
    dot(tx, ty, 4, C.site, 16);

    // B: probe density vs proximity
    const bx = narrow ? pad : pad + pw + gap, by = narrow ? top + ph + 58 : top;
    panel(bx, by, pw, ph, 'PROBE DENSITY VS PROXIMITY', 'PROXIMITY', 'PERSISTENCE');
    ctx.fillStyle = 'rgba(255,122,58,.08)'; ctx.fillRect(bx + pw * .55, by, pw * .45, ph * .45);
    ctx.fillStyle = 'rgba(89,168,255,.05)'; ctx.fillRect(bx, by, pw * .55, ph * .45);
    ctx.font = MONO; ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.fillText('persistent', bx + pw * .27, by + 14); ctx.fillStyle = C.site; ctx.fillText('allosteric', bx + pw * .78, by + 14);
    const reveal2 = ease(clamp(c * 4 - .6));
    probes.forEach((q, i) => {
      if (i / probes.length > reveal2) return;
      const x = bx + q.x * pw, y = by + (1 - q.y) * ph;
      if (q.allo) dot(x, y, 2.6 + .8 * Math.sin(t * 3 + q.p), C.site, 14, .95); else dot(x, y, 1.8, C.blue, 5, .5 + .3 * q.d);
    });

    // C: allosteric profile
    const cx = pad, cy = by + ph + 64, cw = W - pad * 2, ch = H - cy - 62;
    panel(cx, cy, cw, ch, 'ALLOSTERIC PROFILE', 'RESIDUE', 'SCORE');
    const draw = ease(clamp(c * 2.2 - .5)), n = Math.floor(NRES * draw);
    for (const [arr, col, dash] of [[f1, C.blue, []], [f2, C.violet, [5, 4]]]){
      ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath();
      for (let i = 0; i < n; i++){ const x = cx + i / (NRES - 1) * cw, y = cy + (1 - arr[i]) * ch; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
    }
    SITES.forEach(s => { if (s > n) return; const x = cx + s / (NRES - 1) * cw, y = cy + (1 - f1[s]) * ch;
      const g = ctx.createLinearGradient(0, cy, 0, cy + ch); g.addColorStop(0, 'rgba(255,122,58,.18)'); g.addColorStop(1, 'rgba(255,122,58,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 6, cy, 12, ch); dot(x, y - 8, 4 + Math.sin(t * 3 + s), C.site, 18); });

    // legend
    const ly = H - 18; ctx.font = MONO; ctx.textAlign = 'left';
    const items = [['Feature I', C.blue, 'line'], ['Feature II', C.violet, 'dash'], ['Allosteric site', C.site, 'dot']];
    let lx = narrow ? pad - 12 : W / 2 - 150;
    items.forEach(([label, col, kind]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(kind === 'dash' ? [4, 3] : []);
      if (kind === 'dot') dot(lx + 8, ly - 3, 4, col, 10); else { ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx + 18, ly - 3); ctx.stroke(); }
      ctx.setLineDash([]); ctx.fillStyle = C.dim; ctx.fillText(label.toUpperCase(), lx + 26, ly); lx += ctx.measureText(label.toUpperCase()).width + (narrow ? 40 : 58);
    });
  });
}
