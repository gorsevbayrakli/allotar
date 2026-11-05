// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side to side
// and changes state with them: open (4AKE) on the first panel, closed (1AKE) on the second, its allosteric site lit
// on the third. On the fourth panel it gives way to the selectivity map (selmap.js), which this script places on
// phones. Each state is one path-traced still (tools/render, job "states"), all from the same angle.
// Everything follows the scroll position continuously: the protein slides across between panels and drifts upward
// the whole way. At each crossing it dips out at the middle and comes back on the other side; open → closed swaps
// the still there (one image on screen at a time, never a blend of two shapes), and after the second crossing the
// lit still (same shape) fades in.
import {animate, clamp, ease} from './gl.js';
import {canvas2d} from './seq.js';

const SIDE = [.2, -.2, .2, .2];   // horizontal place per panel (fraction of the width from the centre)
const TW = .16;                   // half-width of a transition, in panels

export function initStory(canvas){
  const section = canvas.closest('[data-story]');
  const L = canvas2d(canvas);
  const size = Math.min(innerWidth, innerHeight * .8) < 700 ? 's' : 'l';
  const img = [0, 1, 2].map(k => { const im = new Image(); im.decoding = 'async'; im.src = new URL(`../img/protein/story-${k}-${size}.webp`, import.meta.url).href; return im; });
  const ready = im => im.complete && im.naturalWidth > 0;
  const panels = [...section.querySelectorAll('.panel')], map = section.querySelector('.selmap'), N = panels.length;
  const gut = () => parseFloat(getComputedStyle(section).getPropertyValue('--gut')) || 24;
  let mx = 0, tmx = 0, ps = -1, cy = 0, bh = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; });

  animate(canvas, (dt, t) => {
    const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const W = L.w, H = L.h, narrow = W < 860, k = Math.min(1, dt * 3), ctx = L.ctx;
    // a light low-pass on the scroll position, so wheel steps glide instead of jumping
    ps = ps < 0 ? p : ps + (p - ps) * Math.min(1, dt * 10);
    const seg = ps * N;                                     // 0–4: which panel, continuously
    // horizontal place: holds on each panel, slides across around each panel boundary
    let x = SIDE[Math.min(N - 1, Math.floor(seg))];
    for (let b = 1; b < N; b++){ const u = (seg - (b - TW)) / (2 * TW); if (u > 0 && u < 1) x = SIDE[b - 1] + (SIDE[b] - SIDE[b - 1]) * ease(u); }
    if (narrow) x = 0;
    // at each crossing the image dips out at the middle, where the text panels swap, so it never sits on the text;
    // open → closed swaps the still at that moment, and once across, the lit still fades in on the closed one
    const near = Math.min(Math.abs(seg - 1), Math.abs(seg - 2)), d = clamp(near / TW), dip = d * d * (3 - 2 * d);
    const base = seg < 1 ? 0 : 1, lit = ease(clamp((seg - 2) / .3));
    const show = 1 - clamp((ps - .7) / .06);              // gives way to the map on the fourth panel
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
    const a = img[base];
    if (show <= 0 || !ready(a)) return;
    // a slow upward drift over the whole story keeps it moving with every bit of scroll
    const bw = bh * a.naturalWidth / a.naturalHeight, x0 = W / 2 + x * W - bw / 2 + mx * 12, y0 = cy - bh / 2 - (seg - 1.5) * H * .025;
    // sub-pixel positions: a single image gliding stays smooth
    ctx.globalAlpha = show * dip; ctx.drawImage(a, x0, y0, bw, bh);
    if (lit > .002 && ready(img[2])){ ctx.globalAlpha = show * dip * lit; ctx.drawImage(img[2], x0, y0, bw, bh); }
    ctx.globalAlpha = 1;
  });
}
