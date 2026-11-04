// Shared WebGL helpers for every 3D scene on the site.
import * as THREE from 'three';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

export {THREE, MarchingCubes};
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ease = x => { x = clamp(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
export const prog = (t, a, d) => clamp((t - a) / d);
export const lerp = (a, b, k) => a + (b - a) * k;
export function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const hdr = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r*k, c.g*k, c.b*k]; };
export const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
// display (sRGB) components, for shaders that write straight to a transparent canvas
export const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// ---------- protein: E. coli adenylate kinase, open (4AKE) and closed (1AKE) heavy atoms ----------
let proteinPromise = null;
export function loadProtein(){
  if (!proteinPromise) proteinPromise = fetch(new URL('../data/protein.json', import.meta.url)).then(r => r.json()).then(d => {
    const N = d.dom.length, P0 = Float32Array.from(d.p0), P1 = Float32Array.from(d.p1);
    const siteOf = new Int8Array(N).fill(-1); ['A', 'B', 'C'].forEach((k, i) => d.sites[k].forEach(a => siteOf[a] = i));
    const isAct = new Uint8Array(N); d.act.forEach(a => isAct[a] = 1);
    const phase = new Float32Array(N); for (let i = 0; i < N; i++) phase[i] = (i * 2.399963) % (Math.PI * 2);
    const CC = new THREE.Vector3(); for (let i = 0; i < N; i++) CC.x += P0[i*3], CC.y += P0[i*3+1], CC.z += P0[i*3+2]; CC.divideScalar(N);
    // lam: 0 = open, 1 = closed; small thermal fluctuations on top
    const conform = (B, t, lam) => {
      const tt = t * 4;
      for (let i = 0; i < N; i++){
        const j = i*3, jit = .18 * Math.sin(tt + phase[i]);
        B[j] = P0[j] + (P1[j] - P0[j]) * lam + jit; B[j+1] = P0[j+1] + (P1[j+1] - P0[j+1]) * lam + jit*.7; B[j+2] = P0[j+2] + (P1[j+2] - P0[j+2]) * lam;
      }
    };
    // burial: neighbours within 8 Å; buried atoms are shaded darker, like ambient occlusion in a render
    const ao = new Float32Array(N); { let lo = 1e9, hi = 0; const nb = new Float32Array(N);
      for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++){ const dx = P0[i*3] - P0[k*3], dy = P0[i*3+1] - P0[k*3+1], dz = P0[i*3+2] - P0[k*3+2];
        if (dx*dx + dy*dy + dz*dz < 64){ nb[i]++; nb[k]++; } }
      for (let i = 0; i < N; i++){ lo = Math.min(lo, nb[i]); hi = Math.max(hi, nb[i]); }
      for (let i = 0; i < N; i++) ao[i] = 1 - .5 * Math.pow((nb[i] - lo) / (hi - lo), 1.4); }
    return {N, P0, P1, RAD: d.rad.map(r => r / 10), dom: d.dom, sites: ['A', 'B', 'C'].map(k => d.sites[k]), act: d.act, siteOf, isAct, phase, CC, conform, ao};
  });
  return proteinPromise;
}

// textbook "Pac-Man" view of adenylate kinase: CORE as the body with LID and NMP as the jaws around the open
// cleft. Returns the rotation that brings the structure into that view.
export function pacmanView(P, roll = -103 * Math.PI / 180){
  const cen = k => { const c = new THREE.Vector3(); let n = 0; for (let i = 0; i < P.N; i++) if (P.dom[i] === k){ c.x += P.P0[i*3]; c.y += P.P0[i*3+1]; c.z += P.P0[i*3+2]; n++; } return c.divideScalar(n); };
  const core = cen(0), nmp = cen(1), lid = cen(2);
  const u = lid.clone().add(nmp).multiplyScalar(.5).sub(core).normalize();            // body → mouth: screen right
  const v = lid.clone().sub(nmp); v.addScaledVector(u, -v.dot(u)).normalize();          // NMP → LID: screen up
  const w = new THREE.Vector3().crossVectors(u, v);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w).transpose());
  // roll in the screen plane; the default matches the client's reference films: CORE on top, NMP left, LID lower right
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll).multiply(q);
}

// ---------- stage: renderer + bloom, sized to its canvas ----------
// light: transparent canvas over a light page, no bloom, glow points drawn as soft opaque dots
// minDpr: render at least at this pixel ratio (supersampling), for small scenes whose edges would look jagged at 1×
export function createStage(canvas, {bloom = [.55, .7, .82], exposure = .85, fog = .022, bg = '#0a1030', fov = 32, env = true, light = false, minDpr = 1} = {}){
  const renderer = new THREE.WebGLRenderer({canvas, antialias: light, alpha: light, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  const scene = new THREE.Scene();
  if (light) renderer.setClearColor(0, 0);
  else {
    const bgc = untoned(bg, exposure);   // so the canvas matches the page background after tone mapping
    scene.background = bgc;
    if (fog) scene.fog = new THREE.FogExp2(bgc, fog);
  }
  const camera = new THREE.PerspectiveCamera(fov, 1, .1, 300);
  if (env){ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; }
  const composer = light ? null : new EffectComposer(renderer);
  if (composer){
    composer.addPass(new RenderPass(scene, camera));
    if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), ...bloom));
    composer.addPass(new OutputPass());
  }
  const glow = glowMaterial(light);
  const stage = {renderer, scene, camera, composer, glow, light, w: 1, h: 1, onResize: null};
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, dpr = Math.min(Math.max(devicePixelRatio || 1, minDpr), 2);
    stage.w = w; stage.h = h;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); if (composer){ composer.setPixelRatio(dpr); composer.setSize(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    glow.uniforms.uPx.value = h * dpr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    stage.onResize && stage.onResize(w, h);
  };
  new ResizeObserver(resize).observe(canvas); resize();
  stage.resize = resize;
  stage.render = () => composer ? composer.render() : renderer.render(scene, camera);
  return stage;
}

// linear colour that comes out as `hex` after ACES filmic tone mapping (as in three.js), found by iteration
function untoned(hex, exposure){
  const IN = [[.59719, .35458, .04823], [.076, .90834, .01566], [.0284, .13383, .83777]];
  const OUT = [[1.60475, -.53108, -.07367], [-.10208, 1.10813, -.00605], [-.00327, -.07276, 1.07602]];
  const mul = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const aces = c => mul(OUT, mul(IN, c.map(x => x * exposure / .6)).map(v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .432951) + .238081))).map(x => clamp(x));
  const t = new THREE.Color(hex), want = [t.r, t.g, t.b], c = [...want];
  for (let k = 0; k < 60; k++){ const got = aces(c); for (let i = 0; i < 3; i++) c[i] = Math.max(0, c[i] + (want[i] - got[i]) * 1.5); }
  return new THREE.Color(c[0], c[1], c[2]);
}

// ---------- additive glow points ----------
export function glowMaterial(light = false){
  if (light) return new THREE.ShaderMaterial({
    uniforms: {uPx: {value: 800}}, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uPx; varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx / -mv.z; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); float core = smoothstep(.24, .16, d), halo = smoothstep(.5, .16, d) * .28; float a = clamp(core + halo, 0., 1.) * vA;
        if (a < .004) discard; gl_FragColor = vec4(vC, a); }`
  });
  return new THREE.ShaderMaterial({
    uniforms: {uPx: {value: 800}}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uPx; varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx / -mv.z; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); a *= a; if (vA * a < .002) discard; gl_FragColor = vec4(vC * a * vA, 1.); }`
  });
}
export function makePoints(n, mat){
  const g = new THREE.BufferGeometry();
  const L = {pos: new Float32Array(n*3), col: new Float32Array(n*3), alpha: new Float32Array(n), size: new Float32Array(n), n: 0};
  g.setAttribute('position', new THREE.BufferAttribute(L.pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(L.col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(L.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(L.size, 1).setUsage(THREE.DynamicDrawUsage));
  L.points = new THREE.Points(g, mat); L.points.frustumCulled = false;
  L.push = (x, y, z, c, a, s) => { if (L.n >= n) return; const i = L.n++; L.pos[i*3] = x; L.pos[i*3+1] = y; L.pos[i*3+2] = z; L.col[i*3] = c[0]; L.col[i*3+1] = c[1]; L.col[i*3+2] = c[2]; L.alpha[i] = a; L.size[i] = s; };
  L.flush = () => { for (const k in g.attributes) g.attributes[k].needsUpdate = true; g.setDrawRange(0, L.n); };
  return L;
}

// ---------- molecular surface ----------
export const S_BOX = 78, K = .055;
export function proteinMaterial(){
  return new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: .72, metalness: 0, clearcoat: .08, clearcoatRoughness: .6,
    envMapIntensity: .3, transparent: true});
}
export function makeSurface(res, mat, maxPoly = 150000){
  const mc = new MarchingCubes(res, mat, false, true, maxPoly);
  mc.isolation = 80; mc.frustumCulled = false; mc.scale.setScalar(S_BOX / 2 * K);
  return mc;
}
// space-filling (CPK) model: one instanced sphere per heavy atom at its van der Waals radius
export function makeAtoms(P, {detail = innerWidth < 760 ? [10, 7] : [14, 10]} = {}){
  const mat = new THREE.MeshStandardMaterial({roughness: .62, metalness: 0, envMapIntensity: .35});
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, detail[0], detail[1]), mat, P.N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
const _m = new THREE.Matrix4(), _c = new THREE.Color();
// grow: 0..1 sphere size (assembly); colorOf(i) -> [r,g,b] linear; sizeOf(i) -> extra scale (a lit site swells out of its pocket)
export function fillAtoms(mesh, P, B, colorOf, grow = 1, sizeOf = null){
  for (let i = 0; i < P.N; i++){
    const j = i*3, r = P.RAD[i] * K * grow * (sizeOf ? sizeOf(i) : 1);
    _m.makeScale(r, r, r).setPosition(B[j] * K, B[j+1] * K, B[j+2] * K); mesh.setMatrixAt(i, _m);
    const c = colorOf(i), a = c[3] ? 1 + c[3] * .6 : P.ao[i]; mesh.setColorAt(i, _c.setRGB(c[0] * a, c[1] * a, c[2] * a));   // c[3]: glow
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
}
export const DOM_COLORS = ['#6f7ca6', '#8a80a8', '#5f7fa2'].map(lin);   // muted Allotar palette: slate periwinkle, dusty lavender, steel blue
// colorOf(i) -> [r,g,b] (linear)
export function fillSurface(mc, P, B, colorOf){
  mc.reset();
  for (let i = 0; i < P.N; i++){
    const j = i*3;
    mc.addBall(B[j]/S_BOX + .5, B[j+1]/S_BOX + .5, B[j+2]/S_BOX + .5, .046 * P.RAD[i] / 1.7, 14, colorOf(i));
  }
  mc.update();
}

// ---------- render only while on screen ----------
export function animate(el, frame){
  let visible = false, last = performance.now(), started = false;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }, {rootMargin: '120px'}).observe(el);
  const t0 = performance.now();
  const loop = now => {
    requestAnimationFrame(loop);
    if (!visible || document.hidden){ last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (REDUCED && started) return;
    started = true;
    frame(dt, (now - t0) / 1000);
  };
  requestAnimationFrame(loop);
}

// project a world point to element pixels
const tmp = new THREE.Vector3();
export function toScreen(p, camera, w, h){ tmp.copy(p).project(camera); return {x: (tmp.x * .5 + .5) * w, y: (-tmp.y * .5 + .5) * h, z: tmp.z}; }
