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
    return {N, P0, P1, RAD: d.rad.map(r => r / 10), dom: d.dom, sites: ['A', 'B', 'C'].map(k => d.sites[k]), act: d.act, siteOf, isAct, phase, CC, conform};
  });
  return proteinPromise;
}

// ---------- stage: renderer + bloom, sized to its canvas ----------
export function createStage(canvas, {bloom = [.35, .6, .88], exposure = .85, fog = .022, bg = '#0d1538', fov = 32, env = true} = {}){
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  if (fog) scene.fog = new THREE.FogExp2(bg, fog);
  const camera = new THREE.PerspectiveCamera(fov, 1, .1, 300);
  if (env){ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = bloom ? new UnrealBloomPass(new THREE.Vector2(1, 1), ...bloom) : null;
  if (bloomPass) composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const glow = glowMaterial();
  const stage = {renderer, scene, camera, composer, glow, w: 1, h: 1, onResize: null};
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, dpr = Math.min(devicePixelRatio || 1, 2);
    stage.w = w; stage.h = h;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    glow.uniforms.uPx.value = h * dpr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    stage.onResize && stage.onResize(w, h);
  };
  new ResizeObserver(resize).observe(canvas); resize();
  stage.resize = resize;
  stage.render = () => composer.render();
  return stage;
}

// ---------- additive glow points ----------
export function glowMaterial(){
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
  return new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: .45, metalness: 0, clearcoat: .45, clearcoatRoughness: .3,
    iridescence: .12, iridescenceIOR: 1.3, sheen: .1, sheenColor: new THREE.Color('#6f8fff'), sheenRoughness: .6, envMapIntensity: .5, transparent: true});
}
export function makeSurface(res, mat, maxPoly = 150000){
  const mc = new MarchingCubes(res, mat, false, true, maxPoly);
  mc.isolation = 80; mc.frustumCulled = false; mc.scale.setScalar(S_BOX / 2 * K);
  return mc;
}
export const DOM_COLORS = ['#6f8bff', '#9a7bff', '#3fa0ff'].map(lin);
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
