// Image-sequence player for the path-traced protein renders (tools/render): frames load progressively, and a
// fractional frame index cross-fades the two neighbouring frames so slow motion stays smooth.
const SMALL = Math.min(innerWidth, innerHeight * .8) < 700;

export function loadSeq(name, count){
  const dir = new URL(`../img/seq/${name}/${SMALL ? 's' : 'l'}/`, import.meta.url).href;
  const frames = new Array(count).fill(null);
  // one retry per frame: a dropped request leaves a gap the neighbours cover, but should not stay missing
  const load = (k, retry = 1) => new Promise(res => { const im = new Image(); im.decoding = 'async';
    im.onload = () => { frames[k] = im; res(); };
    im.onerror = () => retry ? setTimeout(() => load(k, 0).then(res), 800) : res();
    im.src = `${dir}${String(k).padStart(3, '0')}.webp`; });
  // first frame, then every 4th, then the rest: the sequence is usable early and fills in
  const order = [...Array(count).keys()].sort((a, b) => (a % 4 !== 0) - (b % 4 !== 0) || a - b);
  const first = load(order[0]);
  first.then(async () => { for (let i = 1; i < order.length; i += 6) await Promise.all(order.slice(i, i + 6).map(load)); });
  const near = k => { for (let d = 0; d < count; d++){ const a = frames[(k + d) % count], b = frames[(k - d + count) % count]; if (a) return a; if (b) return b; } return null; };
  return {
    count, first,
    get ratio(){ const f = frames.find(Boolean); return f ? f.naturalWidth / f.naturalHeight : 800 / 890; },
    // f: fractional frame; loop: wrap around (seamless loops) or clamp (scrubbed sequences)
    draw(ctx, f, x, y, w, h, loop = false){
      f = loop ? ((f % count) + count) % count : Math.min(count - 1, Math.max(0, f));
      const i = Math.floor(f), j = loop ? (i + 1) % count : Math.min(count - 1, i + 1), k = f - i;
      const A = frames[i] || near(i), B = frames[j];
      if (!A) return;
      const a0 = ctx.globalAlpha;
      ctx.drawImage(A, x, y, w, h);
      if (B && B !== A && k > .01){ ctx.globalAlpha = a0 * k; ctx.drawImage(B, x, y, w, h); }
      ctx.globalAlpha = a0;
    }
  };
}

// a 2D canvas sized to its element at device resolution
export function canvas2d(el){
  const ctx = el.getContext('2d'); const S = {ctx, w: 1, h: 1};
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); S.w = el.clientWidth || 1; S.h = el.clientHeight || 1;
    el.width = S.w * d; el.height = S.h * d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.imageSmoothingQuality = 'high'; };
  new ResizeObserver(fit).observe(el); fit();
  return S;
}
