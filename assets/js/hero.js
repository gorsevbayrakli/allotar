// Full-screen hero: a meshed free-energy surface with wells, optionally with the target protein above it.
// Small lights tell the sampling story: they fill the deepest well one by one, follow the minimum path
// through a shallow intermediate well (where they linger) into the second-deepest well, and come back by
// a different route. Scrolling dissolves the protein surface into its atoms.
import {THREE, createStage, makePoints, makeSurface, proteinMaterial, fillSurface, loadProtein, animate, clamp, ease, prog, rng, hdr, lin, K, DOM_COLORS} from './gl.js';

// ---------- landscape (same function on the GPU and the CPU) ----------
const BASE_Y = -2.6, AMP = .75;
// wells: x, z, depth, radius
const W1 = [-6, -7, 2.4, 2.3], W3 = [-.6, -5.6, .95, 1.5], W2 = [6, -9.2, 2.0, 2.2];
const WELLS = [W1, W3, W2, [10.5, -3, .7, 2], [-12.5, -4, .8, 2.4], [-9.5, -15.5, 1, 3], [12.5, -14.5, .9, 2.6], [1, -17, .6, 2.6]];
function energy(x, z, t){
  let e = .35 * Math.sin(x * .28 + t * .25) + .25 * Math.sin(z * .35 - t * .2) + .12 * Math.sin((x + z) * .6 + t * .4);
  for (const w of WELLS){ const dx = x - w[0], dz = z - w[1]; e -= w[2] * Math.exp(-(dx * dx + dz * dz) / (w[3] * w[3])); }
  return e;
}
const surfY = (x, z, t) => BASE_Y + energy(x, z, t) * AMP;
const GLSL_WELLS = WELLS.map(w => `e -= ${w[2].toFixed(2)} * exp(-dot(p - vec2(${w[0].toFixed(2)}, ${w[1].toFixed(2)}), p - vec2(${w[0].toFixed(2)}, ${w[1].toFixed(2)})) / ${(w[3] * w[3]).toFixed(2)});`).join('\n');

function makeLandscape(){
  const geo = new THREE.PlaneGeometry(48, 34, 240, 170); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -9);
  return new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {uT: {value: 0}},
    vertexShader: `uniform float uT; varying vec3 vP; varying float vE; varying float vZ;
      float energy(vec2 p){
        float e = .35 * sin(p.x * .28 + uT * .25) + .25 * sin(p.y * .35 - uT * .2) + .12 * sin((p.x + p.y) * .6 + uT * .4);
        ${GLSL_WELLS}
        return e;
      }
      void main(){
        vec3 pos = position; vE = energy(pos.xz); pos.y = ${BASE_Y.toFixed(2)} + vE * ${AMP.toFixed(2)}; vP = pos;
        vec4 mv = modelViewMatrix * vec4(pos, 1.); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vP; varying float vE; varying float vZ;
      void main(){
        vec2 q = vP.xz / .62;
        vec2 g = abs(fract(q) - .5) / fwidth(q);
        float grid = 1. - min(min(g.x, g.y), 1.);
        float iso = 1. - min(abs(fract(vE * 3.) - .5) / fwidth(vE * 3.), 1.);
        float deep = clamp(-vE / 2.2, 0., 1.);
        vec3 col = mix(vec3(.18, .32, 1.), vec3(.62, .45, 1.15), deep);
        float fade = smoothstep(46., 12., vZ) * smoothstep(23.5, 18., abs(vP.x)) * smoothstep(-26., -21., vP.z);
        float a = (.05 + .42 * grid + .35 * iso * deep) * fade;
        gl_FragColor = vec4(col * a * (1.2 + deep), a);
      }`
  }));
}

// ---------- the lights' route ----------
const xz = (x, z) => new THREE.Vector3(x, 0, z);
const P1a = new THREE.CatmullRomCurve3([xz(W1[0], W1[1]), xz(-4.6, -6.5), xz(-3, -6.1), xz(W3[0], W3[1])]);
const P1b = new THREE.CatmullRomCurve3([xz(W3[0], W3[1]), xz(1.6, -6.4), xz(3.6, -7.8), xz(W2[0], W2[1])]);
const P2 = new THREE.CatmullRomCurve3([xz(W2[0], W2[1]), xz(5.2, -12), xz(1.5, -13.4), xz(-2.6, -12.6), xz(-5.2, -10), xz(W1[0], W1[1])]);
const LOOP = 26;
// u: a light's own time in the loop -> [x, z, spread] (spread = how far it may sit from the path / well centre)
function route(u){
  const at = (c, s) => c.getPoint(clamp(s)), well = (w, k) => [w[0], w[1], w[3] * k];
  if (u < 6) return well(W1, .5);
  if (u < 8.5){ const p = at(P1a, ease((u - 6) / 2.5)); return [p.x, p.z, .12]; }
  if (u < 11) return well(W3, .32);                                  // lingers in the shallow well
  if (u < 13.5){ const p = at(P1b, ease((u - 11) / 2.5)); return [p.x, p.z, .12]; }
  if (u < 19) return well(W2, .48);
  if (u < 23.5){ const p = at(P2, ease((u - 19) / 4.5)); return [p.x, p.z, .14]; }   // a different way home
  return well(W1, .5);
}

export async function initHero(canvas, {mode = 'protein'} = {}){
  const S = createStage(canvas, {bloom: [.35, .6, .88], exposure: .85, fog: .02});
  const {scene, camera} = S;
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0a0f25, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7aa2ff, 3.2); rim.position.set(5, -2, -6); scene.add(rim);

  const land = makeLandscape(); scene.add(land);

  // lights
  const NL = 200, lights = makePoints(NL, S.glow); scene.add(lights.points);
  const LR = []; { const r = rng(21); for (let i = 0; i < NL; i++) LR.push({d: i * .035, a: r() * 6.283, r: Math.sqrt(r()), ph: r() * 6.283, s: .1 + r() * .08}); }
  const C_LIGHT = hdr('#ffd38a', 2.6), C_LINGER = hdr('#ff9a62', 2.8);

  // dust
  const dust = makePoints(500, S.glow); scene.add(dust.points);
  const DUST = []; { const r = rng(9); for (let i = 0; i < 500; i++) DUST.push([(r() - .5) * 40, (r() - .1) * 14, -r() * 30 + 4, r() * 6.28, .2 + r() * .6, .02 + r() * .05, .1 + r() * .4]); }
  const DCOL = hdr('#9fb8ff', 1.1);

  // protein
  let P = null, mc = null, atoms = null, B = null, SCAT = null, group = null;
  if (mode === 'protein'){
    P = await loadProtein();
    group = new THREE.Group(); scene.add(group);
    mc = makeSurface(innerWidth < 760 ? 42 : 54, proteinMaterial()); group.add(mc);
    atoms = makePoints(P.N, S.glow); group.add(atoms.points);
    B = new Float32Array(P.N * 3); SCAT = new Float32Array(P.N * 3);
    const r = rng(7);
    for (let i = 0; i < P.N; i++){ const u = r()*2 - 1, th = r()*6.283, s = Math.sqrt(1 - u*u), d = 50 + r()*110;
      SCAT[i*3] = P.CC.x + Math.cos(th)*s*d; SCAT[i*3+1] = P.CC.y + u*d*.6; SCAT[i*3+2] = P.CC.z + Math.sin(th)*s*d; }
  }
  const SITE = lin('#F2A37C'), C_SITE = hdr('#F2A37C', 1.8), C_ICE = hdr('#9cc0ff', .9);

  let scrollP = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('scroll', () => { scrollP = clamp(scrollY / innerHeight); }, {passive: true});
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; });

  animate(canvas, (dt, t) => {
    mx += (tmx - mx) * Math.min(1, dt * 2); my += (tmy - my) * Math.min(1, dt * 2);
    const p = scrollP, narrow = S.w < 760;
    land.material.uniforms.uT.value = t;

    // lights: they appear one by one in the deepest well, then travel the loop
    lights.n = 0;
    for (const L of LR){
      if (t < L.d) continue;
      const u = (t - L.d) % LOOP, [cx, cz, spread] = route(u);
      const lingering = u >= 8.5 && u < 11;
      const x = cx + Math.cos(L.a + t * .3) * spread * L.r + .05 * Math.sin(t * 3 + L.ph);
      const z = cz + Math.sin(L.a + t * .3) * spread * L.r + .05 * Math.cos(t * 2.6 + L.ph);
      const drop = 1.6 * (1 - ease(prog(t, L.d, .8)));
      lights.push(x, surfY(x, z, t) + .08 + drop, z, lingering ? C_LINGER : C_LIGHT, .85 * prog(t, L.d, .4), L.s);
    }
    lights.flush();

    dust.n = 0;
    for (const d of DUST) dust.push(d[0] + Math.sin(t * .05 + d[3]) * d[4], d[1] + Math.cos(t * .07 + d[3]) * d[4] * .5, d[2], DCOL, d[6] * (.6 + .4 * Math.sin(t * .4 + d[3] * 5)), d[5]);
    dust.flush();

    // protein
    if (P){
      const a = ease(prog(t, .3, 2.8)), surf = ease(prog(t, 1.6, 1.6)) * (1 - p * .95);
      P.conform(B, t, .35 - .35 * Math.cos(2 * Math.PI * t / 7));
      group.position.set(narrow ? 0 : 3.4, narrow ? 3.3 + p * 1.2 : .9 + p * 1.2, 0);
      group.rotation.set(.15 + my * .2, t * .08 + p * 1.6 + mx * .5, 0);
      const lit = Math.floor(t / 3.2) % 3, litK = Math.sin(Math.PI * ((t / 3.2) % 1)) * prog(t, 3, 1);
      if (surf > .005){
        fillSurface(mc, P, B, i => { const c = DOM_COLORS[P.dom[i]]; const k = P.siteOf[i] === lit ? litK * .85 : 0; return k ? [c[0] + (SITE[0] - c[0]) * k, c[1] + (SITE[1] - c[1]) * k, c[2] + (SITE[2] - c[2]) * k] : c; });
      }
      mc.visible = surf > .005; mc.material.opacity = surf;
      atoms.n = 0;
      const twinkle = .02 + .45 * Math.sin(Math.PI * a) + p * .35, burst = 1 + p * .5;
      for (let i = 0; i < P.N; i++){
        const j = i*3, dx = B[j] - P.CC.x, dy = B[j+1] - P.CC.y, dz = B[j+2] - P.CC.z, dl = Math.hypot(dx, dy, dz) || 1, push = P.RAD[i] * 1.15 / dl;
        const x = P.CC.x + (dx * (1 + push)) * burst, y = P.CC.y + (dy * (1 + push)) * burst, z = P.CC.z + (dz * (1 + push)) * burst;
        const px = (SCAT[j] + (x - SCAT[j]) * a) * K, py = (SCAT[j+1] + (y - SCAT[j+1]) * a) * K, pz = (SCAT[j+2] + (z - SCAT[j+2]) * a) * K;
        const site = P.siteOf[i] === lit && litK > .05;
        atoms.push(px, py, pz, site ? C_SITE : C_ICE, site ? Math.max(.25 * litK, twinkle * .5) : twinkle * (.5 + .5 * Math.sin(t * 3 + P.phase[i] * 3)), site ? .13 : .05);
      }
      atoms.flush();
      camera.position.set(mx * .8, 2.2 + p * .8 - my * .4, (narrow ? 18 : 12.5) - p * 2.5);
      camera.lookAt(narrow ? 0 : -.6, -1.4 - p * .4, -3);
    } else {
      camera.position.set(mx * .8, 2.6 - my * .3, 8 - p * 2.5);
      camera.lookAt(-4.2, -2.4, -7 - p * 2);   // landscape sits right of the headline
    }
    S.render();
  });
}
