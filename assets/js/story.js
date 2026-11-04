// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side
// to side, closes from the open (4AKE) to the closed (1AKE) state, and finally lights up its allosteric site.
// The protein is a path-traced render sequence (tools/render) scrubbed by the scroll position.
import {animate, clamp, ease} from './gl.js';
import {loadSeq, canvas2d} from './seq.js';

const FRAMES = 40;   // story sequence: frames 0–23 close the protein, 24–39 light the site

export function initStory(canvas){
  const section = canvas.closest('[data-story]');
  const L = canvas2d(canvas), seq = loadSeq('story', FRAMES);
  const panels = [...section.querySelectorAll('.panel')];
  let mx = 0, tmx = 0, x = .2, f = 0, cy = 0, bh = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; });

  animate(canvas, (dt, t) => {
    const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const W = L.w, H = L.h, narrow = W < 760, k = Math.min(1, dt * 3), ctx = L.ctx;
    // three panels: open on the right, closing on the left, allosteric site lit on the right
    const side = narrow ? 0 : (p < .33 ? .2 : p < .66 ? -.2 : .2);
    x += (side - x) * k;
    // sequence position: closes over the first two panels, the site lights up on the third
    f += ((FRAMES - 1) * clamp(p < .62 ? ease(clamp((p - .25) / .37)) * .6 : .6 + .4 * ease(clamp((p - .62) / .22))) - f) * k;
    mx += (tmx - mx) * k;
    // phones: the text panels sit at the bottom, so the protein fills the band between the nav and the panel on screen
    let tcy = H / 2, tbh = Math.min(H * .78, W * .5);
    if (narrow){
      const on = panels.find(el => el.classList.contains('on')) || panels[0];
      const top = 88, bot = on.offsetTop - 24;   // offsetTop ignores the panel's slide-in transform
      tbh = Math.max(140, bot - top); tcy = (top + bot) / 2;
    }
    cy = cy ? cy + (tcy - cy) * k : tcy; bh = bh ? bh + (tbh - bh) * k : tbh;
    const bw = bh * seq.ratio;
    ctx.clearRect(0, 0, W, H);
    // whole pixels: sub-pixel placement resamples the render every frame and reads as shimmer
    seq.draw(ctx, f, Math.round(W / 2 + x * W - bw / 2 + mx * 12), Math.round(cy - bh / 2), Math.round(bw), Math.round(bh));
  });
}
