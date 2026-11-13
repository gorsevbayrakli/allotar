// Ultra-fast dynamics sampling ("conformational transition in action"): a rendered film of the protein moving
// between its open, metastable and closed states, while a marker follows the same path across the free-energy
// landscape. Open sits front left, closed front right (the deepest minimum), and the shallower metastable state
// between them, further back.
// The film plays on its own transparent layer (white keyed out) so its colours stay exact; the landscape
// and marker are read from the film's own clock, so the two never drift apart.
import {THREE, createStage, makePoints, animate, clamp, ease, hdr, toScreen} from './gl.js';

// three basins, not in a row: open (front left) and closed (front right, the deepest minimum), with the shallower
// metastable basin between them and further back
const XO = -2.15, XC = 2.15, XA = 0, ZA = -.85;
const g = (x, z, cx, cz, sx, sz) => Math.exp(-((x - cx) ** 2 / sx + (z - cz) ** 2 / sz));
const energy = (x, z) => -.95 * g(x, z, XO, .1, .55, .7) - 1.1 * g(x, z, XC, .1, .55, .7) - .5 * g(x, z, XA, ZA, .45, .4)
  + .04 * Math.sin(x * 3.1 + z * 2.3);

// the film's timeline (seconds): open → closes → closed → shifts → metastable → back → closed → opens. Open ↔ closed
// runs across the front over one barrier; closed ↔ metastable runs to the back basin and returns.
const FILM = [[0, XO, .1], [.4, XO, .1], [1.8, XC, .1], [4.4, XC, .1], [5.8, XA, ZA], [7.2, XA, ZA], [8.6, XC, .1], [11.2, XC, .1], [12.8, XO, .1]];
// position on the landscape at film time t, plus how far into a crossing it is (0 at rest, 1 on the barrier) and
// where that segment's barrier is
function path(t){
  for (let i = 1; i < FILM.length; i++){
    const [t1, x1, z1] = FILM[i], [t0, x0, z0] = FILM[i - 1];
    if (t <= t1){
      const u = (t - t0) / (t1 - t0 || 1), e = ease(u), moving = x0 !== x1 || z0 !== z1;
      const bow = x0 !== x1 && z0 === z1 ? .35 * Math.sin(Math.PI * e) : 0;   // the front crossing bows towards the viewer
      return {x: x0 + (x1 - x0) * e, z: z0 + (z1 - z0) * e + bow, cross: moving ? Math.sin(Math.PI * e) : 0, bx: (x0 + x1) / 2, bz: (z0 + z1) / 2 + (bow ? .35 : 0)};
    }
  }
  return {x: XO, z: .1, cross: 0, bx: 0, bz: 0};
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

  const fx = makePoints(400, S.glow); scene.add(fx.points);
  const C_BALL = hdr('#ffd38a', 4), C_TRAIL = hdr('#ff9a62', 2.2);
  const trail = [];

  // play only while the card is on screen
  new IntersectionObserver(([e]) => { if (e.isIntersecting) film.video.play().catch(() => {}); else film.video.pause(); }).observe(root);

  let mx = 0, tmx = 0;
  root.addEventListener('pointermove', e => { const b = root.getBoundingClientRect(); tmx = (e.clientX - b.left) / b.width - .5; });

  animate(root, dt => {
    mx += (tmx - mx) * Math.min(1, dt * 3);
    const vt = film.video.currentTime || 0, P = path(vt), x = P.x, z = P.z, y = energy(x, z) - 1.55 + .1;
    trail.unshift([x, y, z]); if (trail.length > 60) trail.pop();
    fx.n = 0;
    fx.push(x, y, z, C_BALL, 1, .32);
    trail.forEach((p, k) => fx.push(p[0], p[1], p[2], C_TRAIL, (1 - k / trail.length) * .6, .1 - k * .001));
    fx.flush();

    camera.position.set(mx * 2.2, 3.9, 8.4); camera.lookAt(0, -.15, 0);   // from above, so the back basin reads as further away
    const place = (el, wx, wy, wz, a) => { const p = toScreen(new THREE.Vector3(wx, wy, wz), camera, S.w, S.h); el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; el.style.opacity = a; };
    const near = (cx, cz) => clamp(1 - Math.hypot(x - cx, z - cz) / 1.2);
    // each state is named on the far rim of its basin
    place(lbl.open, XO, -1.2, -.75, .45 + .55 * near(XO, .1));
    place(lbl.closed, XC, -1.2, -.75, .45 + .55 * near(XC, .1));
    place(lbl.alt, XA, -1.3, ZA - .62, .45 + .55 * near(XA, ZA));
    // the barrier label shows over the barrier of whichever crossing is under way
    place(lbl.ts, P.bx, -1.55 + energy(P.bx, P.bz) + .45, P.bz, P.cross);
    S.render();
    film.draw();
  });
}
