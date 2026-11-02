// Selectivity map: binding of each design round across the target and five off-targets. Round by round the
// off-target cells cool down while the target stays lit; the steps Design → Build → Test → Learn run per row.
import {animate, clamp, ease, REDUCED} from './gl.js';

const COLS = ['Target', 'OT-1', 'OT-2', 'OT-3', 'OT-4', 'OT-5'];
// illustrative binding strengths (0–1), one row per design round
const DATA = [
  [.72, .55, .62, .30, .48, .20],
  [.80, .40, .35, .22, .30, .15],
  [.86, .22, .18, .12, .16, .10],
  [.91, .08, .06, .05, .07, .04],
];
const STEPS = ['Design', 'Build', 'Test', 'Learn'];
const ROW_T = 3.2, HOLD = 3, LOOP = DATA.length * ROW_T + HOLD;
const MONO = "500 10px 'JetBrains Mono', monospace", SANS = "600 13px 'Raleway', sans-serif";
const INK = '#141a4b', DIM = '#6e7493', LINE = 'rgba(27,37,89,.1)', PEACH = '#e9783f', ACCENT = '#4656c8';
// lavender → navy scale
const STOPS = [[238, 240, 248], [154, 143, 214], [35, 50, 109]];
function heat(v){
  const k = clamp(v) * 2, i = Math.min(1, Math.floor(k)), f = k - i, a = STOPS[i], b = STOPS[i + 1];
  return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
}
const ratio = r => r[0] / Math.max(...r.slice(1));

export function initSelmap(root){
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  let W = 1, H = 1;
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  new ResizeObserver(resize).observe(cv); resize();
  // rounded rectangle path (drawn by hand so older browsers without roundRect work too)
  const rr = (x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  animate(root, (dt, time) => {
    const t = REDUCED ? LOOP - .5 : time % LOOP;
    const fade = 1 - clamp((t - (LOOP - .6)) / .6);   // soft reset at the end of the loop
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const pad = W < 420 ? 16 : 28, labW = W < 420 ? 54 : 74, barW = W < 420 ? 64 : 104;
    const gx = pad + labW, gw = W - gx - barW - pad, cw = gw / COLS.length, gap = 5;
    const ch = Math.min(cw * .95, (H - 150) / DATA.length - gap);
    const top = Math.max(58, (H - 64 - DATA.length * (ch + gap)) / 2 + 12);   // grid centred above the step row

    // headers
    ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    COLS.forEach((c, j) => { ctx.fillStyle = j ? DIM : PEACH; ctx.fillText(W < 420 && j ? c.replace('OT-', '') : c.toUpperCase(), gx + cw * (j + .5), top - 12); });
    ctx.textAlign = 'left'; ctx.fillStyle = DIM; ctx.fillText(W < 420 ? 'SEL.' : 'SELECTIVITY', gx + gw + 14, top - 12);
    ctx.fillStyle = DIM; ctx.fillText('ROUND', pad, top - 12);

    const cur = Math.min(DATA.length - 1, Math.floor(t / ROW_T)), done = t >= DATA.length * ROW_T;
    DATA.forEach((row, i) => {
      const y = top + i * (ch + gap), local = t - i * ROW_T;
      if (local < 0){ // not reached yet: faint empty row
        ctx.fillStyle = 'rgba(27,37,89,.035)'; COLS.forEach((c, j) => { rr(gx + j * cw, y, cw - gap, ch, 8); ctx.fill(); });
        ctx.fillStyle = 'rgba(110,116,147,.45)'; ctx.font = MONO; ctx.fillText(String(i + 1).padStart(2, '0'), pad, y + ch / 2 + 4);
        return;
      }
      ctx.font = MONO; ctx.fillStyle = i === cur && !done ? INK : DIM; ctx.fillText(String(i + 1).padStart(2, '0'), pad, y + ch / 2 + 4);
      const design = clamp(local / .6), build = clamp((local - .6) / .6), test = clamp((local - 1.2) / 1);
      row.forEach((v, j) => {
        const x = gx + j * cw, k = clamp(test * 1.6 - j * .12);   // cells fill left to right
        ctx.globalAlpha = fade;
        // placeholder while designing / building
        ctx.fillStyle = `rgba(27,37,89,${.04 + .05 * build * (k < 1 ? .5 + .5 * Math.sin(time * 8 + j) : 0)})`;
        rr(x, y, cw - gap, ch, 8); ctx.fill();
        if (design < 1){ ctx.strokeStyle = `rgba(70,86,200,${.35 * design})`; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; rr(x + .5, y + .5, cw - gap - 1, ch - 1, 8); ctx.stroke(); ctx.setLineDash([]); }
        if (k > 0){
          ctx.globalAlpha = fade * ease(k); ctx.fillStyle = heat(v); rr(x, y, cw - gap, ch, 8); ctx.fill();
          if (cw > 46){ ctx.globalAlpha = fade * ease(k); ctx.font = MONO; ctx.textAlign = 'center'; ctx.fillStyle = v > .45 ? '#fff' : INK; ctx.fillText(v.toFixed(2), x + (cw - gap) / 2, y + ch / 2 + 4); ctx.textAlign = 'left'; }
        }
        // learn: off-target cells that still bind are flagged for the next design
        const learn = clamp((local - 2.2) / .4) * (1 - clamp((local - ROW_T - .4) / .6));
        if (j && v > .3 && learn > 0 && i < DATA.length - 1){ ctx.globalAlpha = fade * learn; ctx.strokeStyle = PEACH; ctx.lineWidth = 2; rr(x + 1, y + 1, cw - gap - 2, ch - 2, 7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
      // selectivity bar
      const s = clamp((local - 2) / .8), rat = ratio(row), bx = gx + gw + 14, bw = barW - 14 - (W < 420 ? 0 : 34);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(27,37,89,.06)'; rr(bx, y + ch / 2 - 3, bw, 6, 3); ctx.fill();
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
      ctx.font = SANS; ctx.fillStyle = PEACH; ctx.textAlign = 'right'; ctx.fillText('Selective hit', gx + gw - gap, y + ch + 24); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }

    // step indicator
    const local = t - cur * ROW_T, step = done ? -1 : local < .6 ? 0 : local < 1.2 ? 1 : local < 2.2 ? 2 : 3;
    const sy = H - 44; let sx = pad;
    ctx.font = MONO;
    STEPS.forEach((st, i) => {
      const w = ctx.measureText(st.toUpperCase()).width + 24, on = i === step;
      ctx.globalAlpha = fade; ctx.fillStyle = on ? INK : 'rgba(27,37,89,.05)'; rr(sx, sy - 15, w, 26, 13); ctx.fill();
      ctx.fillStyle = on ? '#fff' : DIM; ctx.fillText(st.toUpperCase(), sx + 12, sy + 2);
      sx += w + 8;
    });
    ctx.globalAlpha = fade; ctx.fillStyle = DIM; ctx.textAlign = 'right';
    const cap = done ? 'Off-target binding designed out' : `Round ${cur + 1} · ${['designing for the target site', 'building the candidate', 'binding measured on 6 proteins', 'off-target hits feed the next design'][step]}`;
    if (W >= 520) ctx.fillText(cap, W - pad, sy + 2);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  });
}
