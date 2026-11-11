// Selectivity map: binding of each design round across the target and three off-targets. Round by round the
// off-target cells cool down while the target stays lit; the steps Design → Build → Test → Learn run per row.
import {animate, clamp, ease, REDUCED} from './gl.js';

const COLS = ['Target', 'OT-1', 'OT-2', 'OT-3'];
// illustrative binding strengths (0–1), one row per design round; the card says so under the map
const DATA = [
  [.72, .55, .62, .30],
  [.88, .40, .35, .22],
  [.90, .22, .18, .12],
  [.93, .08, .06, .05],
];
const ROW_T = 3.2, HOLD = 3, LOOP = DATA.length * ROW_T + HOLD;
const MONO = "500 11px 'JetBrains Mono', monospace", SANS = "600 13px 'Raleway', sans-serif";
const PEACH = '#e9783f';
// light card: lavender → navy scale on white. Dark card (inside the navy home story): weak binding sinks into the
// navy, strong binding glows pale lavender.
const LIGHT = {ink: '#141a4b', dim: '#6e7493', fill: '27,37,89', dash: '70,86,200', stops: [[238, 240, 248], [154, 143, 214], [35, 50, 109]], strong: .45, onStrong: '#fff', onWeak: '#141a4b'};
const DARK = {ink: '#eef0ff', dim: 'rgba(206,211,245,.6)', fill: '255,255,255', dash: '170,178,255', stops: [[40, 48, 108], [112, 104, 214], [206, 200, 255]], strong: .6, onStrong: '#141a4b', onWeak: '#eef0ff'};
let STOPS = LIGHT.stops;
function heat(v){
  const k = clamp(v) * 2, i = Math.min(1, Math.floor(k)), f = k - i, a = STOPS[i], b = STOPS[i + 1];
  return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
}
const ratio = r => r[0] / Math.max(...r.slice(1));

export function initSelmap(root){
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  // in the home story the map is the fourth panel: it is dark, and its rounds start when that panel opens
  const story = root.closest('[data-story]'), C = story?.dataset.theme === 'navy' ? DARK : LIGHT, INK = C.ink, DIM = C.dim;
  let clock = 0;
  let W = 1, H = 1;
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  new ResizeObserver(resize).observe(cv); resize();
  // rounded rectangle path (drawn by hand so older browsers without roundRect work too)
  // text that shrinks (down to 8 px) to fit the width it has
  const fit = (str, x, y, maxW, px = 11) => { let f = px; do { ctx.font = `500 ${f}px 'JetBrains Mono', monospace`; } while (ctx.measureText(str).width > maxW && --f > 8); ctx.fillText(str, x, y); ctx.font = MONO; };
  const rr = (x, y, w, h, r) => { w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  animate(root, (dt, time) => {
    STOPS = C.stops;
    clock = story && !story.classList.contains('last') ? 0 : clock + dt;
    const t = REDUCED ? LOOP - .5 : clock % LOOP;
    const fade = 1 - clamp((t - (LOOP - .6)) / .6);   // soft reset at the end of the loop
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const pad = W < 420 ? 16 : 32, labW = W < 420 ? 56 : 72, barW = W < 420 ? 64 : 104;
    const gx = pad + labW, gw = W - gx - barW - pad, cw = gw / COLS.length, gap = 4;
    const tight = W < 520, ch = Math.min(cw * .95, (H - (tight ? 108 : 150)) / DATA.length - gap);
    const top = Math.max(tight ? 40 : 56, (H - (tight ? 72 : 64) - DATA.length * (ch + gap)) / 2 + 12);   // grid centred above the status lines

    // headers
    ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    COLS.forEach((c, j) => { ctx.fillStyle = j ? DIM : PEACH; fit(c.toUpperCase(), gx + cw * (j + .5), top - 16, cw - 4); });
    ctx.textAlign = 'left'; ctx.fillStyle = DIM; ctx.fillText(W < 420 ? 'SEL.' : 'SELECTIVITY', gx + gw + 16, top - 16);
    ctx.fillStyle = DIM; ctx.fillText('ROUND', pad, top - 16);

    const cur = Math.min(DATA.length - 1, Math.floor(t / ROW_T)), done = t >= DATA.length * ROW_T;
    DATA.forEach((row, i) => {
      const y = top + i * (ch + gap), local = t - i * ROW_T;
      if (local < 0){ // not reached yet: faint empty row
        ctx.fillStyle = `rgba(${C.fill},.035)`; COLS.forEach((c, j) => { rr(gx + j * cw, y, cw - gap, ch, 8); ctx.fill(); });
        ctx.fillStyle = 'rgba(110,116,147,.45)'; ctx.font = MONO; ctx.fillText(String(i + 1).padStart(2, '0'), pad, y + ch / 2 + 4);
        return;
      }
      ctx.font = MONO; ctx.fillStyle = i === cur && !done ? INK : DIM; ctx.fillText(String(i + 1).padStart(2, '0'), pad, y + ch / 2 + 4);
      const design = clamp(local / .6), build = clamp((local - .6) / .6), test = clamp((local - 1.2) / 1);
      row.forEach((v, j) => {
        const x = gx + j * cw, k = clamp(test * 1.6 - j * .12);   // cells fill left to right
        ctx.globalAlpha = fade;
        // placeholder while designing / building
        ctx.fillStyle = `rgba(${C.fill},${.04 + .05 * build * (k < 1 ? .5 + .5 * Math.sin(time * 8 + j) : 0)})`;
        rr(x, y, cw - gap, ch, 8); ctx.fill();
        if (design < 1){ ctx.strokeStyle = `rgba(${C.dash},${.35 * design})`; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; rr(x + .5, y + .5, cw - gap - 1, ch - 1, 8); ctx.stroke(); ctx.setLineDash([]); }
        if (k > 0){
          ctx.globalAlpha = fade * ease(k); ctx.fillStyle = heat(v); rr(x, y, cw - gap, ch, 8); ctx.fill();
          if (cw > 46){ ctx.globalAlpha = fade * ease(k); ctx.font = MONO; ctx.textAlign = 'center'; ctx.fillStyle = v > C.strong ? C.onStrong : C.onWeak; ctx.fillText(v.toFixed(2), x + (cw - gap) / 2, y + ch / 2 + 4); ctx.textAlign = 'left'; }
        }
        // learn: off-target cells that still bind are flagged for the next design
        const learn = clamp((local - 2.2) / .4) * (1 - clamp((local - ROW_T - .4) / .6));
        if (j && v > .3 && learn > 0 && i < DATA.length - 1){ ctx.globalAlpha = fade * learn; ctx.strokeStyle = PEACH; ctx.lineWidth = 2; rr(x + 1, y + 1, cw - gap - 2, ch - 2, 7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
      // selectivity bar
      const s = clamp((local - 2) / .8), rat = ratio(row), bx = gx + gw + 16, bw = barW - 16 - (W < 420 ? 0 : 32);
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(${C.fill},.07)`; rr(bx, y + ch / 2 - 3, bw, 6, 3); ctx.fill();
      if (s > 0){
        const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#9A8FD6'); g.addColorStop(1, PEACH);
        ctx.fillStyle = g; rr(bx, y + ch / 2 - 3, bw * clamp(Math.log(rat) / Math.log(25)) * ease(s), 6, 3); ctx.fill();
        if (W >= 420){ ctx.globalAlpha = fade * s; ctx.font = MONO; ctx.fillStyle = INK; ctx.fillText(rat.toFixed(1) + '×', bx + bw + 8, y + ch / 2 + 4); }
      }
      ctx.globalAlpha = 1;
    });

    // final row: selective hit
    if (done){
      const k = ease(clamp((t - DATA.length * ROW_T) / .6)) * fade, y = top + (DATA.length - 1) * (ch + gap);
      ctx.globalAlpha = k; ctx.strokeStyle = PEACH; ctx.lineWidth = 2; rr(gx - 6, y - 6, gw - gap + 12, ch + 12, 12); ctx.stroke();
      // wide cards label the hit under its row; narrow ones say it in the status line instead
      if (!tight){ ctx.font = SANS; ctx.fillStyle = PEACH; ctx.textAlign = 'right'; ctx.fillText('Selective hit', gx + gw - gap, y + ch + 24); ctx.textAlign = 'left'; }
      ctx.globalAlpha = 1;
    }

    // what is happening now (the four cards below the map name the steps)
    const local = t - cur * ROW_T, step = done ? -1 : local < .6 ? 0 : local < 1.2 ? 1 : local < 2.2 ? 2 : 3;
    const sy = H - (W < 520 ? 44 : 32);
    ctx.globalAlpha = fade; ctx.font = MONO; ctx.textAlign = 'left'; ctx.fillStyle = INK;
    fit(done ? (tight ? 'Selective hit · off-target binding designed out' : 'Off-target binding designed out') : `Round ${cur + 1} · ${['designing for the target site', 'building the candidate', 'binding measured on 4 proteins', 'off-target hits feed the next design'][step]}`, pad, sy, W - pad * 2);
    // narrow cards: the label takes its own line under the status, so neither crowds the headers
    ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = W < 520 ? 'left' : 'right'; ctx.fillText('Illustrative values', W < 520 ? pad : W - pad, W < 520 ? sy + 18 : sy);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  });
}
