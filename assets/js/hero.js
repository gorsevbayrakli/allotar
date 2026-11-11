// Full-screen hero: a meshed free-energy surface with wells, optionally with the target protein above it.
// Lights tell the sampling story. Each light is one sampled conformation: it appears where it is found and
// stays until the loop ends. First the deepest well fills, then samples appear along the minimum path, partly
// filling each small local minimum on the way before moving on, and fill the second-deepest well (forward,
// yellow); the way back runs along a different route through its own local minima (backward, blue). The protein is a path-traced loop (tools/render, job "breathe") drawn on its own layer: 60 full renders of half
// a breathing cycle (the lid opens a little, the protein turns, the allosteric site warms up), played forwards then
// backwards with cosine timing so it eases to rest at both ends and never jumps. Neighbouring frames differ by a
// pixel or two, so the soft blend between them reads as motion, not as a double image. Until the whole loop has
// loaded, the first frame floats on its own.
import {canvas2d} from './seq.js';
import {THREE, createStage, makePoints, animate, clamp, ease, prog, rng, hdr, rgb} from './gl.js';

// ---------- landscape (same function on the GPU and the CPU) ----------
const BASE_Y = -2.6, AMP = .75;
// wells: x, z, depth, radius
const W1 = [-2.4, -7.2, 2.4, 2.1], W2 = [5.6, -8.6, 2.0, 2.0];
// small local minima between the two big wells: forward route (F) and return route (R)
const F1 = [-.5, -6.3, .65, .7], F2 = [1.5, -6, .95, 1.1], F3 = [3.7, -6.8, .65, .7];
const R1 = [3.6, -11.5, .75, .8], R2 = [-.4, -11.2, .75, .8];
const WELLS = [W1, W2, F1, F2, F3, R1, R2, [11, -3, .7, 2], [-10, -4, .8, 2.4], [-8.5, -15.5, 1, 3], [12.5, -15, .9, 2.6], [2, -17.5, .6, 2.6]];
function energy(x, z, t){
  let e = .35 * Math.sin(x * .28 + t * .25) + .25 * Math.sin(z * .35 - t * .2) + .12 * Math.sin((x + z) * .6 + t * .4);
  for (const w of WELLS){ const dx = x - w[0], dz = z - w[1]; e -= w[2] * Math.exp(-(dx * dx + dz * dz) / (w[3] * w[3])); }
  return e;
}
const surfY = (x, z, t) => BASE_Y + energy(x, z, t) * AMP;
const GLSL_WELLS = WELLS.map(w => `e -= ${w[2].toFixed(2)} * exp(-dot(p - vec2(${w[0].toFixed(2)}, ${w[1].toFixed(2)}), p - vec2(${w[0].toFixed(2)}, ${w[1].toFixed(2)})) / ${(w[3] * w[3]).toFixed(2)});`).join('\n');

function makeLandscape(light){
  const geo = new THREE.PlaneGeometry(48, 34, 240, 170); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -9);
  return new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {uT: {value: 0}, uLight: {value: light ? 1 : 0}},
    vertexShader: `uniform float uT; varying vec3 vP; varying float vE; varying float vZ;
      float energy(vec2 p){
        float e = .35 * sin(p.x * .28 + uT * .25) + .25 * sin(p.y * .35 - uT * .2) + .12 * sin((p.x + p.y) * .6 + uT * .4);
        ${GLSL_WELLS}
        return e;
      }
      void main(){
        vec3 pos = position; vE = energy(pos.xz); pos.y = ${BASE_Y.toFixed(2)} + vE * ${AMP.toFixed(2)}; vP = pos;
        vec4 mv = modelViewMatrix * vec4(pos, 1.); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uLight; varying vec3 vP; varying float vE; varying float vZ;
      void main(){
        vec2 q = vP.xz / .62;
        vec2 g = abs(fract(q) - .5) / fwidth(q);
        float grid = 1. - min(min(g.x, g.y), 1.);
        float iso = 1. - min(abs(fract(vE * 3.) - .5) / fwidth(vE * 3.), 1.);
        float deep = clamp(-vE / 2.2, 0., 1.);
        vec3 col = mix(vec3(.18, .32, 1.), vec3(.62, .45, 1.15), deep);
        float fade = smoothstep(46., 12., vZ) * smoothstep(23.5, 18., abs(vP.x)) * smoothstep(-26., -21., vP.z);
        float a = (.05 + .42 * grid + .35 * iso * deep) * fade;
        // on a light page: a clean grid only (no contour rings), thinned where the lines bunch up on steep walls,
        // and a soft lavender tint that marks the wells
        if (uLight > .5){
          vec2 fw = fwidth(q); float dense = smoothstep(.22, .55, max(fw.x, fw.y));
          float la = (.05 + .5 * grid * (1. - dense)) * fade, fill = .16 * deep * fade;
          vec3 c = mix(vec3(.36, .42, .70), vec3(.52, .44, .78), deep);
          gl_FragColor = vec4(c, min(1., la + fill)); return;
        }
        gl_FragColor = vec4(col * a * (1.2 + deep), a);
      }`
  }));
}

// ---------- the lights' route ----------
const xz = (x, z) => new THREE.Vector3(x, 0, z);
const route = (a, m, b) => new THREE.CatmullRomCurve3([xz(a[0], a[1]), xz(m[0], m[1]), xz(b[0], b[1])]);
const FWD = [route(W1, [-1.5, -6.7], F1), route(F1, [.5, -6.1], F2), route(F2, [2.6, -6.2], F3), route(F3, [4.7, -7.6], W2)];
const BACK = [route(W2, [4.9, -10.5], R1), route(R1, [1.6, -11.8], R2), route(R2, [-1.8, -10.2], W1)];
const LOOP = 31, FADE_AT = 28.8;
const BF = 60, BREATH = 9;   // protein loop: frames in half a cycle, seconds for a whole cycle
// every sample: where it appears, when, and whether it belongs to the forward or the backward transition
function buildSamples(){
  const r = rng(21), S = [];
  const well = (w, n, t0, t1, k, back = false) => { for (let i = 0; i < n; i++){ const a = r() * 6.283, d = Math.sqrt(r()) * w[3] * k;
    S.push({x: w[0] + Math.cos(a) * d, z: w[1] + Math.sin(a) * d, t: t0 + (t1 - t0) * (i + r() * .6) / n, back}); } };
  // path samples scatter to either side of the route and appear in loose order, not as a line
  const path = (c, n, t0, t1, back = false) => { for (let i = 0; i < n; i++){ const s = clamp((i + .5 + (r() - .5) * 1.6) / n), p = c.getPoint(s), q = c.getTangent(s), o = (r() + r() + r() - 1.5) * .75;
    S.push({x: p.x - q.z * o, z: p.z + q.x * o, t: t0 + (t1 - t0) * clamp(s + (r() - .5) * .3), back}); } };
  well(W1, 60, .3, 4.5, .55);          // the deepest well fills first
  // forward along the minimum path, partly filling each local minimum before moving on
  path(FWD[0], 10, 4.5, 5.5);
  well(F1, 12, 5.5, 7, .45);
  path(FWD[1], 8, 7, 7.8);
  well(F2, 18, 7.8, 9.8, .45);
  path(FWD[2], 9, 9.8, 10.7);
  well(F3, 12, 10.7, 12.2, .45);
  path(FWD[3], 10, 12.2, 13.2);
  well(W2, 46, 13.2, 17.2, .5);         // second-deepest well
  // back by another route, through its own local minima
  path(BACK[0], 12, 17.2, 18.6, true);
  well(R1, 14, 18.6, 20.3, .45, true);
  path(BACK[1], 13, 20.3, 21.7, true);
  well(R2, 14, 21.7, 23.4, .45, true);
  path(BACK[2], 11, 23.4, 24.7, true);
  well(W1, 12, 24.7, 26.3, .45, true);
  S.forEach(p => { p.ph = r() * 6.283; p.s = .1 + r() * .07; });
  return S;
}

export async function initHero(canvas, {mode = 'protein', light = false} = {}){
  const S = createStage(canvas, {bloom: [.3, .55, .93], exposure: .85, fog: .02, light});
  const {scene, camera} = S;
  scene.add(new THREE.HemisphereLight(0xdfe4f2, 0x1a1f33, .4));
  const key = new THREE.DirectionalLight(0xfff3e8, 1.35); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xaab6d6, 1.1); rim.position.set(5, -2, -6); scene.add(rim);

  const land = makeLandscape(light); scene.add(land);

  // lights
  const SAMPLES = buildSamples(), lights = makePoints(SAMPLES.length, S.glow); scene.add(lights.points);
  const C_FWD = light ? rgb('#e9783f') : hdr('#ffd38a', 2.6), C_BACK = light ? rgb('#3d6fd6') : hdr('#6fb4ff', 2.8);

  // dust
  const dust = makePoints(300, S.glow); if (!light) scene.add(dust.points);
  const DUST = []; { const r = rng(9); for (let i = 0; i < 300; i++) DUST.push([(r() - .5) * 40, (r() - .1) * 14, -r() * 30 + 4, r() * 6.28, .1 + r() * .25, .02 + r() * .05, .1 + r() * .4]); }
  const DCOL = hdr('#9fb8ff', 1.1);

  // protein: path-traced stills on their own 2D layer above the landscape
  let seq = null, layer = null;
  if (mode === 'protein'){
    const el = document.createElement('canvas'); el.className = 'hero-seq'; el.setAttribute('aria-hidden', 'true');
    canvas.after(el); layer = canvas2d(el);
    const size = Math.min(innerWidth, innerHeight * .8) < 700 ? 's' : 'l';
    const img = k => { const im = new Image(); im.decoding = 'async'; im.src = new URL(`../img/protein/breathe/${size}/${String(k).padStart(3, '0')}.webp`, import.meta.url).href; return im; };
    const first = img(0), frames = [first];
    first.decode?.().catch(() => {}).finally(() => { for (let k = 1; k < BF; k++) frames[k] = img(k); });
    const ok = im => im && im.complete && im.naturalWidth > 0;
    seq = {frames, first, ok, get all(){ return frames.length === BF && frames.every(ok); }, get ratio(){ return ok(first) ? first.naturalWidth / first.naturalHeight : .85; }};
  }

  let scrollP = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  // phones: the protein sits in the band between the nav and the headline, whatever the screen height
  const h1 = canvas.closest('.hero')?.querySelector('h1');
  addEventListener('scroll', () => { scrollP = clamp(scrollY / innerHeight); }, {passive: true});
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; });

  animate(canvas, (dt, t) => {
    mx += (tmx - mx) * Math.min(1, dt * 2); my += (tmy - my) * Math.min(1, dt * 2);
    const p = scrollP, narrow = S.w < 1000;
    land.material.uniforms.uT.value = t;

    // lights: each sample fades in where it is found and stays until the loop fades out
    lights.n = 0;
    const u = t % LOOP, out = 1 - prog(u, FADE_AT, LOOP - FADE_AT - .3);
    for (const L of SAMPLES){
      if (u < L.t) continue;
      const k = ease(prog(u, L.t, .6)), flash = Math.sin(Math.PI * prog(u, L.t, .6)), x = L.x + .03 * Math.sin(t * 2.3 + L.ph), z = L.z + .03 * Math.cos(t * 2 + L.ph);
      lights.push(x, surfY(x, z, t) + .08, z, L.back ? C_BACK : C_FWD, (.85 * k + .5 * flash) * out, L.s * (.4 + .6 * k + .5 * flash));
    }
    lights.flush();

    dust.n = 0;
    for (const d of DUST) dust.push(d[0] + Math.sin(t * .05 + d[3]) * d[4], d[1] + Math.cos(t * .07 + d[3]) * d[4] * .5, d[2], DCOL, d[6] * (.75 + .25 * Math.sin(t * .25 + d[3] * 5)), d[5]);
    dust.flush();

    // protein
    if (seq){
      const W = layer.w, H = layer.h, phone = W < 1000 && h1, narrow2 = W < 1000, ctx = layer.ctx;   // phones and tablets: fit above the headline
      let cx, cy, bh;
      if (phone){ const top = 88, bot = h1.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 16; bh = Math.max(120, bot - top); cy = (top + bot) / 2; cx = W / 2; }
      else if (narrow2){ bh = H * .44; cx = W / 2; cy = 88 + bh / 2; }
      else { bh = Math.min(H * .42, W * .3); cx = W * .76; cy = H * .5; }
      const intro = ease(prog(t, .2, 1.6)), sc = (.94 + .06 * intro) * bh * (1 + .012 * Math.sin(t * .4)), bw = sc * seq.ratio;
      // slow float; sub-pixel positions keep the glide smooth
      const x0 = cx - bw / 2 + mx * 14, y0 = cy - sc / 2 - p * H * .22 + my * 8 + 6 * Math.sin(t * .55);
      ctx.clearRect(0, 0, W, H);
      const a = intro * clamp(1 - p * 1.15);
      if (seq.all){
        // the loop starts at frame 0 whenever it starts: forwards over the first half, backwards over the second
        if (seq.t0 === undefined) seq.t0 = t;
        const c = ((t - seq.t0) / BREATH) % 1, f = (c < .5 ? c * 2 : 2 - c * 2) * (BF - 1), i = Math.min(BF - 2, Math.floor(f)), w = f - i;
        ctx.globalAlpha = a; ctx.drawImage(seq.frames[i], x0, y0, bw, sc);
        if (w > .01){ ctx.globalAlpha = a * w; ctx.drawImage(seq.frames[i + 1], x0, y0, bw, sc); }
      } else if (seq.ok(seq.first)){ ctx.globalAlpha = a; ctx.drawImage(seq.first, x0, y0, bw, sc); }
      ctx.globalAlpha = 1;
      camera.position.set(mx * .8, 2.2 + p * .8 - my * .4, (narrow ? 18 : 12.5) - p * 2.5);
      camera.lookAt(narrow ? 0 : -2.7, (narrow ? -1.4 : -.6) - p * .4, -3);   // desktop: the sampled lights sit lower and further right, clear of the copy
    } else {
      camera.position.set(mx * .8 - 1, 3 - my * .3, 8.6 - p * 2.5);
      camera.lookAt(narrow ? -1 : -5.8, -2.6, -8 - p * 2);   // wells (and their lights) sit right of the headline and copy
    }
    S.render();
  });
}
