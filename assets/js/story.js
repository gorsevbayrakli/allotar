// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side to side
// and changes state with them: open (4AKE) on the first panel, closed (1AKE) on the second, its allosteric site lit
// on the third. On the fourth panel it gives way to the selectivity map (selmap.js), which this script places on
// phones. Each state is one path-traced still (tools/render, job "states"), all from the same angle; a state change
// is a short dissolve while the protein slides, and in between the image stays still and sharp.
import {animate, clamp} from './gl.js';
import {canvas2d} from './seq.js';

export function initStory(canvas){
  const section = canvas.closest('[data-story]');
  const L = canvas2d(canvas);
  const size = Math.min(innerWidth, innerHeight * .8) < 700 ? 's' : 'l';
  const img = [0, 1, 2].map(k => { const im = new Image(); im.decoding = 'async'; im.src = new URL(`../img/protein/story-${k}-${size}.webp`, import.meta.url).href; return im; });
  const ready = im => im.complete && im.naturalWidth > 0;
  const panels = [...section.querySelectorAll('.panel')], map = section.querySelector('.selmap');
  const gut = () => parseFloat(getComputedStyle(section).getPropertyValue('--gut')) || 24;
  let mx = 0, tmx = 0, x = .2, s = 0, cy = 0, bh = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; });

  animate(canvas, (dt, t) => {
    const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const W = L.w, H = L.h, narrow = W < 860, k = Math.min(1, dt * 3), ctx = L.ctx;
    const n = Math.min(panels.length - 1, Math.floor(p * panels.length));   // same panel index as site.js
    // open on the right, closed on the left, lit on the right; it fades out for the fourth panel
    const side = narrow ? 0 : [.2, -.2, .2, .2][n];
    x += (side - x) * k;
    // state: moves to the panel's still at a fixed rate, so a dissolve takes about half a second
    const target = Math.min(2, n);
    s += Math.sign(target - s) * Math.min(Math.abs(target - s), dt * 2.2);
    const show = 1 - clamp((p - .7) / .06);
    mx += (tmx - mx) * k;
    // phones: the text panels sit at the bottom, so the protein (and the map) fill the band between the nav and
    // the panel on screen
    let tcy = H / 2, tbh = Math.min(H * .62, W * .36);
    const on = panels.find(el => el.classList.contains('on')) || panels[0];
    if (narrow){
      const top = 88, bot = on.offsetTop - 24;   // offsetTop ignores the panel's slide-in transform
      tbh = Math.max(140, bot - top); tcy = (top + bot) / 2;
      if (map){ const mw = Math.min(W - 2 * gut(), tbh * 1.25), mh = Math.min(tbh, mw * .92); Object.assign(map.style, {top: `${top + (tbh - mh) / 2}px`, height: `${mh}px`, width: `${mw}px`}); }
    } else if (map) Object.assign(map.style, {top: '', height: '', width: ''});
    cy = cy ? cy + (tcy - cy) * k : tcy; bh = bh ? bh + (tbh - bh) * k : tbh;
    ctx.clearRect(0, 0, W, H);
    const i = Math.floor(s), a = img[i], b = img[Math.min(2, i + 1)], f = s - i;
    if (show <= 0 || !ready(a)) return;
    const bw = bh * a.naturalWidth / a.naturalHeight, x0 = W / 2 + x * W - bw / 2 + mx * 12, y0 = cy - bh / 2;
    // sub-pixel positions: a single image gliding stays smooth
    ctx.globalAlpha = show; ctx.drawImage(a, x0, y0, bw, bh);
    if (f > .002 && ready(b)){ ctx.globalAlpha = show * f; ctx.drawImage(b, x0, y0, bw, bh); }
    ctx.globalAlpha = 1;
  });
}
