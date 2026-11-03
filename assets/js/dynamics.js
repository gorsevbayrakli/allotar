// Ultra-fast dynamics sampling: a rendered film of the protein folding from open to closed, then shifting
// into a shallower third state, while a marker follows the same path across the free-energy landscape.
// The film plays on its own transparent layer (white keyed out) so its colours stay exact; the landscape
// and marker are read from the film's own clock, so the two never drift apart.
import {THREE, createStage, makePoints, animate, clamp, ease, hdr, toScreen} from './gl.js';

// three basins along the path: open and closed are the deepest, the shifted state is shallower
const XO = -2.15, XC = 0, XA = 2.15;
const g = (x, z, cx, sx, sz) => Math.exp(-((x - cx) ** 2 / sx + z * z / sz));
const energy = (x, z) => -1.0 * g(x, z, XO, .55, .8) - .95 * g(x, z, XC, .55, .75) - .55 * g(x, z, XA, .5, .7)
  + .04 * Math.sin(x * 3.1 + z * 2.3);
const TS1 = (XO + XC) / 2, TS2 = (XC + XA) / 2;   // barriers between the basins

// the film's timeline (seconds): open → closes → closed → shifts → shifted → back → closed → opens
const FILM = [[0, XO], [.4, XO], [1.8, XC], [4.4, XC], [5.8, XA], [7.2, XA], [8.6, XC], [11.2, XC], [12.8, XO]];
function pathX(t){
  for (let i = 1; i < FILM.length; i++){ const [t1, x1] = FILM[i], [t0, x0] = FILM[i - 1]; if (t <= t1) return x0 + (x1 - x0) * ease((t - t0) / (t1 - t0 || 1)); }
  return XO;
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
    uniforms: {map: {value: tex}}, transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        float a = 1. - smoothstep(.9, .985, min(min(c.r, c.g), c.b));   // the film's background is pure white
        vec3 fg = clamp((c - (1. - a)) / max(a, .001), 0., 1.);           // un-mix the white from soft edges
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

  const fx = makePoints(400, S.glow); scene.add(fx.points);
  const C_BALL = hdr('#ffd38a', 4), C_TRAIL = hdr('#ff9a62', 2.2);
  const trail = [];

  // play only while the card is on screen
  new IntersectionObserver(([e]) => { if (e.isIntersecting) film.video.play().catch(() => {}); else film.video.pause(); }).observe(root);

  let mx = 0, tmx = 0;
  root.addEventListener('pointermove', e => { const b = root.getBoundingClientRect(); tmx = (e.clientX - b.left) / b.width - .5; });

  animate(root, dt => {
    mx += (tmx - mx) * Math.min(1, dt * 3);
    const vt = film.video.currentTime || 0, x = pathX(vt), z = .3 * Math.sin(Math.PI * (x - XO) / (XC - XO)) * (x < XC ? 1 : 0), y = energy(x, z) - 1.55 + .1;
    trail.unshift([x, y, z]); if (trail.length > 60) trail.pop();
    fx.n = 0;
    fx.push(x, y, z, C_BALL, 1, .32);
    trail.forEach((p, k) => fx.push(p[0], p[1], p[2], C_TRAIL, (1 - k / trail.length) * .6, .1 - k * .001));
    fx.flush();

    camera.position.set(mx * 2.2, 2.1, 9.2); camera.lookAt(0, -.25, 0);
    const place = (el, wx, wy, wz, a) => { const p = toScreen(new THREE.Vector3(wx, wy, wz), camera, S.w, S.h); el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; el.style.opacity = a; };
    const near = cx => clamp(1 - Math.abs(x - cx) / 1.2);
    // the barrier label shows over whichever barrier the marker is crossing
    const tsx = x < XC ? TS1 : TS2, crossing = Math.sin(Math.PI * clamp(x < XC ? (x - XO) / (XC - XO) : (x - XC) / (XA - XC))) * (Math.abs(x - XC) > .05 ? 1 : 0);
    // state labels float just behind the rim of each basin, so they stay inside the card
    place(lbl.open, XO, -1.35, -1.25, .45 + .55 * near(XO));
    place(lbl.closed, XC, -1.35, -1.25, .45 + .55 * near(XC));
    place(lbl.alt, XA, -1.35, -1.25, .45 + .55 * near(XA));
    place(lbl.ts, tsx, -1.55 + energy(tsx, .1) + .45, .2, crossing);
    S.render();
    film.draw();
  });
}
