// Ultra-fast dynamics sampling: the protein switches between open and closed states while a marker
// crosses the free-energy landscape below it, over the transition state.
import {THREE, createStage, makePoints, makeSurface, proteinMaterial, fillSurface, loadProtein, animate, clamp, ease, prog, hdr, lin, K, DOM_COLORS, toScreen} from './gl.js';

const BX = 1.7;   // basin x positions (open at -BX, closed at +BX)
const energy = (x, z) => -1.0 * Math.exp(-((x + BX) ** 2 / .9 + z * z / .8)) - .9 * Math.exp(-((x - BX) ** 2 / .8 + z * z / .7))
  + .25 * Math.exp(-(x * x / .5 + (z - .1) ** 2 / 2)) + .05 * Math.sin(x * 3.1 + z * 2.3);

// conformational coordinate over an 8 s cycle: dwell open, cross, dwell closed, cross back
function lamAt(t){
  const c = t % 8, j = .04 * Math.sin(t * 5.3) + .03 * Math.sin(t * 8.1);
  if (c < 2.5) return .04 + j;
  if (c < 4) return .04 + .92 * ease((c - 2.5) / 1.5);
  if (c < 6.5) return .96 + j;
  return .96 - .92 * ease((c - 6.5) / 1.5);
}

export async function initDynamics(root){
  const canvas = root.querySelector('canvas');
  const lbl = {open: root.querySelector('[data-l=open]'), closed: root.querySelector('[data-l=closed]'), ts: root.querySelector('[data-l=ts]')};
  const clock = root.querySelector('[data-clock]');
  const S = createStage(canvas, {bloom: [.55, .6, .8], exposure: .9, fog: 0, fov: 30});
  const {scene, camera} = S;
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0a0f25, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7aa2ff, 3); rim.position.set(5, -2, -6); scene.add(rim);

  // free-energy landscape with glowing contour grid
  const geo = new THREE.PlaneGeometry(7, 3.6, 140, 72); geo.rotateX(-Math.PI / 2);
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
        float edge = smoothstep(3.5, 2.6, abs(vP.x)) * smoothstep(1.8, 1.2, abs(vP.z));
        vec3 c = base * (.06 + .5 * grid + .9 * iso);
        gl_FragColor = vec4(c * edge, edge * (.25 + .6 * max(grid, iso)));
      }`
  }));
  land.position.y = -1.55; scene.add(land);

  const P = await loadProtein();
  const group = new THREE.Group(); group.scale.setScalar(.78); group.position.y = .55; scene.add(group);
  const mc = makeSurface(innerWidth < 760 ? 40 : 50, proteinMaterial()); group.add(mc);
  const atoms = makePoints(P.N, S.glow); group.add(atoms.points);
  const fx = makePoints(400, S.glow); scene.add(fx.points);
  const B = new Float32Array(P.N * 3);
  const TEAL = lin('#19d3a8'), C_TEAL = hdr('#19d3a8', 3), C_ICE = hdr('#9cc0ff', 1.3), C_BALL = hdr('#ffd38a', 4), C_TRAIL = hdr('#ff9a62', 2.2);
  const trail = [];

  let mx = 0, tmx = 0, simMs = 0;
  root.addEventListener('pointermove', e => { const b = root.getBoundingClientRect(); tmx = (e.clientX - b.left) / b.width - .5; });

  animate(root, (dt, t) => {
    mx += (tmx - mx) * Math.min(1, dt * 3);
    const lam = lamAt(t), closed = clamp((lam - .5) * 3 + .5);
    P.conform(B, t, lam);
    group.rotation.y = t * .15; group.rotation.x = .1;
    fillSurface(mc, P, B, i => { const c = DOM_COLORS[P.dom[i]]; if (!P.isAct[i]) return c; const k = closed * .8; return [c[0] + (TEAL[0] - c[0]) * k, c[1] + (TEAL[1] - c[1]) * k, c[2] + (TEAL[2] - c[2]) * k]; });
    atoms.n = 0;
    for (let i = 0; i < P.N; i++){
      const j = i*3, act = P.isAct[i];
      atoms.push(B[j] * K, B[j+1] * K, B[j+2] * K, act ? C_TEAL : C_ICE, act ? .35 * closed : .05 + .05 * Math.sin(t * 3 + P.phase[i] * 3), act ? .14 : .05);
    }
    atoms.flush();

    // marker on the landscape
    const x = -BX + 2 * BX * lam, z = .35 * Math.sin(Math.PI * lam), y = energy(x, z) - 1.55 + .1;
    trail.unshift([x, y, z]); if (trail.length > 60) trail.pop();
    fx.n = 0;
    fx.push(x, y, z, C_BALL, 1, .32);
    trail.forEach((p, k) => fx.push(p[0], p[1], p[2], C_TRAIL, (1 - k / trail.length) * .6, .1 - k * .001));
    fx.flush();

    camera.position.set(mx * 2.2, 2.1, 9.2); camera.lookAt(0, -.25, 0);
    const place = (el, wx, wy, wz, a) => { const p = toScreen(new THREE.Vector3(wx, wy, wz), camera, S.w, S.h); el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; el.style.opacity = a; };
    const crossing = Math.sin(Math.PI * clamp((lam - .15) / .7));
    place(lbl.open, -BX, -1.55 + energy(-BX, 0) - .3, .9, .5 + .5 * (1 - closed));
    place(lbl.closed, BX, -1.55 + energy(BX, 0) - .3, .9, .5 + .5 * closed);
    place(lbl.ts, 0, -1.55 + energy(0, .1) + .45, .2, crossing);
    simMs += dt * .37;
    clock.textContent = simMs.toFixed(3).padStart(7, '0');
    S.render();
  });
}
