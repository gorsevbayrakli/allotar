// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side
// to side, closes from the open (4AKE) to the closed (1AKE) state, and lights up its allosteric site. On the
// fourth panel it gives way to the selectivity map (selmap.js), which this script places on phones.
// The protein is a path-traced render sequence (tools/render) scrubbed by the scroll position.
import {animate, clamp, ease} from './gl.js';
import {loadSeq, canvas2d} from './seq.js';

const FRAMES = 40;   // story sequence: frames 0–23 close the protein, 24–39 light the site

export function initStory(canvas){
  const section = canvas.closest('[data-story]');
  const L = canvas2d(canvas), seq = loadSeq('story', FRAMES);
  const panels = [...section.querySelectorAll('.panel')], map = section.querySelector('.selmap');
  const gut = () => parseFloat(getComputedStyle(section).getPropertyValue('--gut')) || 24;
  let mx = 0, tmx = 0, x = .2, f = 0, cy = 0, bh = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; });

  animate(canvas, (dt, t) => {
    const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const W = L.w, H = L.h, narrow = W < 860, k = Math.min(1, dt * 3), ctx = L.ctx;
    // the protein's three panels take the first three quarters of the scroll; q runs 0–1 over them
    const q = clamp(p * 4 / 3);
    // open on the right, closing on the left, allosteric site lit on the right; it fades out for the fourth panel
    const side = narrow ? 0 : (q < .33 ? .2 : q < .66 ? -.2 : .2);
    x += (side - x) * k;
    f += ((FRAMES - 1) * clamp(q < .62 ? ease(clamp((q - .25) / .37)) * .6 : .6 + .4 * ease(clamp((q - .62) / .22))) - f) * k;
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
    const bw = bh * seq.ratio;
    ctx.clearRect(0, 0, W, H);
    if (show <= 0) return;
    ctx.globalAlpha = show;
    // a single image moving is drawn at sub-pixel positions (smooth glide, no 1 px steps)
    seq.draw(ctx, f, W / 2 + x * W - bw / 2 + mx * 12, cy - bh / 2, bw, bh);
    ctx.globalAlpha = 1;
  });
}
