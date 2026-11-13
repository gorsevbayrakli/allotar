// Ultra-fast dynamics sampling ("conformational transition in action"): a rendered film of the protein moving
// open → metastable → closed and back, while the free-energy landscape below fills with samples, well by well, in
// step with the film. Open sits front left, closed front right (the deepest minimum), and the shallower metastable
// state between them, further back.
// The film plays on its own transparent layer (white keyed out) so its colours stay exact; the samples are timed
// from the film's own clock, so the two never drift apart.
import {THREE, createStage, makePoints, animate, clamp, ease, hdr, rng, toScreen} from './gl.js';

// three basins, not in a row: open (front left) and closed (front right, the deepest minimum), with the shallower
// metastable basin between them and further back
const XO = -2.15, XC = 2.15, XA = 0, ZA = -.85, ZF = .1;
const g = (x, z, cx, cz, sx, sz) => Math.exp(-((x - cx) ** 2 / sx + (z - cz) ** 2 / sz));
const energy = (x, z) => -.95 * g(x, z, XO, ZF, .55, .7) - 1.1 * g(x, z, XC, ZF, .55, .7) - .5 * g(x, z, XA, ZA, .45, .4)
  + .04 * Math.sin(x * 3.1 + z * 2.3);

// the film's timeline (seconds): the long open form; its first closing is the metastable state; the twist that
// follows ends in the closed state; then back through metastable and open again
const FILM = [[0, XO, ZF], [.4, XO, ZF], [1.8, XA, ZA], [4.4, XA, ZA], [5.8, XC, ZF], [7.2, XC, ZF], [8.6, XA, ZA], [11.2, XA, ZA], [12.8, XO, ZF]];
const LOOP = 12.8;
// where the film is on the landscape at time t, how far into a crossing (0 at rest, 1 on the barrier), and that
// crossing's barrier
function path(t){
  for (let i = 1; i < FILM.length; i++){
    const [t1, x1, z1] = FILM[i], [t0, x0, z0] = FILM[i - 1];
    if (t <= t1){
      const e = ease((t - t0) / (t1 - t0 || 1)), moving = x0 !== x1 || z0 !== z1;
      return {x: x0 + (x1 - x0) * e, z: z0 + (z1 - z0) * e, cross: moving ? Math.sin(Math.PI * e) : 0, bx: (x0 + x1) / 2, bz: (z0 + z1) / 2};
    }
  }
  return {x: XO, z: ZF, cross: 0, bx: 0, bz: 0};
}
// the samples: each appears where it is found, at the moment the film is there, and stays until the loop ends;
// wells fill while the protein rests in them, a few samples scatter along each crossing
function buildSamples(){
  const r = rng(31), S = [];
  const well = (cx, cz, rad, n, t0, t1, back) => { for (let i = 0; i < n; i++){ const a = r() * 6.283, d = Math.sqrt(r()) * rad;
    S.push({x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d * .8, t: t0 + (t1 - t0) * (i + r() * .6) / n, back}); } };
  const cross = (x0, z0, x1, z1, n, t0, t1, back) => { const L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    for (let i = 0; i < n; i++){ const s = clamp((i + .5 + (r() - .5) * 1.4) / n), o = (r() + r() + r() - 1.5) * .3;
      S.push({x: x0 + (x1 - x0) * s + nx * o, z: z0 + (z1 - z0) * s + nz * o, t: t0 + (t1 - t0) * clamp(s + (r() - .5) * .3), back}); } };
  well(XO, ZF, .5, 34, .05, 1.2, false);           // open
  cross(XO, ZF, XA, ZA, 10, .5, 1.8, false);
  well(XA, ZA, .4, 26, 1.8, 4.4, false);           // metastable (shallower, fewer)
  cross(XA, ZA, XC, ZF, 10, 4.4, 5.8, false);
  well(XC, ZF, .55, 48, 5.8, 7.4, false);          // closed, the deepest minimum
  cross(XC, ZF, XA, ZA, 9, 7.2, 8.6, true);
  well(XA, ZA, .4, 12, 8.6, 11.2, true);
  cross(XA, ZA, XO, ZF, 9, 11.2, 12.2, true);
  well(XO, ZF, .5, 8, 12, 12.5, true);
  S.forEach(p => { p.ph = r() * 6.283; p.s = .085 + r() * .06; p.y = energy(p.x, p.z); });
  return S;
}

// film layer: the video drawn through a shader that turns the white background transparent
function filmLayer(canvas){
  const video = Object.assign(document.createElement('video'), {muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous'});
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  video.src = new URL('../video/dynamics-o2c.mp4', import.meta.url).href;
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: false, premultipliedAlpha: true});
  renderer.setClearColor(0x000000, 0);
  const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {map: {value: tex}, px: {value: new THREE.Vector2(1 / 560, 1 / 846)}}, transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D map; uniform vec2 px; varying vec2 vUv;
      float cover(vec2 uv){ vec3 c = texture2D(map, uv).rgb; return 1. - smoothstep(.9, .975, min(min(c.r, c.g), c.b)); }   // the film's background is pure white
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        // erode the matte by ~2 px: compression smears the white into the outline, which read as a bright rim on navy
        float a = cover(vUv);
        for (int i = 0; i < 8; i++){ float t = float(i) * .785398; a = min(a, cover(vUv + vec2(cos(t), sin(t)) * px * 2.)); }
        a = smoothstep(.15, 1., a);
        float a0 = max(cover(vUv), .001);
        vec3 fg = clamp((c - (1. - a0)) / a0, 0., 1.);                   // un-mix any white left in the edge colour
        gl_FragColor = vec4(fg * a, a);
      }`
  })));
  const size = () => { const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); renderer.setPixelRatio(d); renderer.setSize(r.width, r.height, false); };
  new ResizeObserver(size).observe(canvas); size();
  return {video, draw: () => { if (video.readyState >= 2) renderer.render(scene, cam); }};
}

export async function initDynamics(root){
  const canvas = root.querySelector('canvas:not(.dyn-vid)');
  const film = filmLayer(root.querySelector('.dyn-vid'));
  const lbl = {open: root.querySelector('[data-l=open]'), closed: root.querySelector('[data-l=closed]'), alt: root.querySelector('[data-l=alt]'), ts: root.querySelector('[data-l=ts]')};
  const S = createStage(canvas, {bloom: [.3, .55, .93], exposure: .85, fog: 0, fov: 30});
  const {scene, camera} = S;

  // free-energy landscape with glowing contour grid
  const geo = new THREE.PlaneGeometry(7, 3.6, 160, 72); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, energy(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = clamp((vP.y + 1.) / 1.3, 0., 1.);
        vec3 base = mix(vec3(.12, .2, .9), vec3(.55, .35, 1.), h);
        vec2 g = abs(fract(vP.xz * 3.) - .5) / fwidth(vP.xz * 3.);
        float grid = 1. - min(min(g.x, g.y), 1.);
        float iso = 1. - min(abs(fract(vP.y * 7.) - .5) / fwidth(vP.y * 7.), 1.);
        float edge = smoothstep(3.5, 2.8, abs(vP.x)) * smoothstep(1.8, 1.2, abs(vP.z));
        vec3 c = base * (.06 + .5 * grid + .9 * iso);
        gl_FragColor = vec4(c * edge, edge * (.25 + .6 * max(grid, iso)));
      }`
  }));
  land.position.y = -1.55; scene.add(land);

  const SAMPLES = buildSamples(), fx = makePoints(SAMPLES.length, S.glow); scene.add(fx.points);
  const C_FWD = hdr('#ffd38a', 2.6), C_BACK = hdr('#6fb4ff', 2.8);
  const prog = (u, t0, d) => clamp((u - t0) / d);

  // play only while the card is on screen
  new IntersectionObserver(([e]) => { if (e.isIntersecting) film.video.play().catch(() => {}); else film.video.pause(); }).observe(root);

  let mx = 0, tmx = 0;
  root.addEventListener('pointermove', e => { const b = root.getBoundingClientRect(); tmx = (e.clientX - b.left) / b.width - .5; });

  animate(root, dt => {
    mx += (tmx - mx) * Math.min(1, dt * 3);
    const vt = film.video.currentTime || 0, P = path(vt), x = P.x, z = P.z, t = performance.now() / 1000;
    const out = 1 - prog(vt, LOOP - .45, .4);   // everything clears just before the film starts over
    fx.n = 0;
    for (const L of SAMPLES){
      if (vt < L.t) continue;
      const k = ease(prog(vt, L.t, .5)), flash = Math.sin(Math.PI * prog(vt, L.t, .5)), sx = L.x + .025 * Math.sin(t * 2.3 + L.ph), sz = L.z + .025 * Math.cos(t * 2 + L.ph);
      fx.push(sx, L.y - 1.55 + .06, sz, L.back ? C_BACK : C_FWD, (.85 * k + .5 * flash) * out, L.s * (.4 + .6 * k + .5 * flash));
    }
    fx.flush();

    camera.position.set(mx * 2.2, 3.9, 8.4); camera.lookAt(0, 0, 0);   // from above, so the back basin reads as further away
    // labels stay inside the card, however narrow it is
    const place = (el, wx, wy, wz, a) => { const p = toScreen(new THREE.Vector3(wx, wy, wz), camera, S.w, S.h), hw = el.offsetWidth / 2 + 12;
      el.style.transform = `translate(${clamp(p.x, hw, S.w - hw)}px,${p.y}px) translate(-50%,-50%)`; el.style.opacity = a; };
    const near = (cx, cz) => clamp(1 - Math.hypot(x - cx, z - cz) / 1.2);
    // each state is named on the far rim of its basin
    place(lbl.open, XO, -1.2, -.75, .45 + .55 * near(XO, ZF));
    place(lbl.closed, XC, -1.2, -.75, .45 + .55 * near(XC, ZF));
    place(lbl.alt, XA, -1.3, ZA - .62, .45 + .55 * near(XA, ZA));
    // the barrier label shows over the barrier of whichever crossing is under way
    place(lbl.ts, P.bx, -1.55 + energy(P.bx, P.bz) + .12, P.bz, P.cross);
    S.render();
    film.draw();
  });
}
