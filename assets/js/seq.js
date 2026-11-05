// Canvas helper for the path-traced protein stills (tools/render) drawn by hero.js and story.js.
// a 2D canvas sized to its element at device resolution
export function canvas2d(el){
  const ctx = el.getContext('2d'); const S = {ctx, w: 1, h: 1};
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); S.w = el.clientWidth || 1; S.h = el.clientHeight || 1;
    el.width = S.w * d; el.height = S.h * d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.imageSmoothingQuality = 'high'; };
  new ResizeObserver(fit).observe(el); fit();
  return S;
}
