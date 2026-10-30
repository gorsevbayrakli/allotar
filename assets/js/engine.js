// AllotarX closed-loop engine: a tilted ring with four stations; a pulse travels Design → Build → Test → Learn.
import {THREE, createStage, makePoints, animate, clamp, ease, hdr, toScreen} from './gl.js';

const NODE_COL = ['#4F8FD9', '#8a6fe0', '#6a7cff', '#e0753f'];
const NODE_ANG = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];   // top, right, bottom, left (clockwise order)
const R = 2.2, PERIOD = 3.2;

export function initEngine(root){
  const canvas = root.querySelector('canvas'), nodes = [...root.querySelectorAll('.engine-node')];
  const S = createStage(canvas, {bloom: [.5, .55, .75], exposure: 1, fog: 0, env: false, fov: 30});
  const {scene, camera} = S;
  const rig = new THREE.Group(); scene.add(rig);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, .012, 8, 220), new THREE.MeshBasicMaterial({color: '#28356e'})); rig.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R + .16, .004, 6, 220), new THREE.MeshBasicMaterial({color: '#1a2350'})); rig.add(ring2);
  // fresnel core
  const core = new THREE.Mesh(new THREE.SphereGeometry(.68, 48, 32), new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {uT: {value: 0}},
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - max(dot(vN, vV), 0.), 2.4);
      vec3 c = mix(vec3(.05, .08, .2), vec3(.45, .65, 1.6), f) * (.9 + .1 * sin(uT * 2.)); gl_FragColor = vec4(c, 1.); }`
  }));
  rig.add(core);
  const markers = NODE_COL.map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.09, 24, 16), new THREE.MeshBasicMaterial({color: new THREE.Color(c).multiplyScalar(2)}));
    m.position.set(Math.cos(NODE_ANG[i]) * R, Math.sin(NODE_ANG[i]) * R, 0); rig.add(m); return m;
  });
  const pts = makePoints(700, S.glow); rig.add(pts.points);
  const C_RING = hdr('#6f8dff', 1.2), C_TEAL = hdr('#19d3a8', 1.6), C_HEAD = NODE_COL.map(c => hdr(c, 3));
  const SAT = [hdr('#8a6fe0', 2.5), hdr('#4F8FD9', 2.5), hdr('#f0b34a', 2.5)];

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  root.addEventListener('pointermove', e => { const b = root.getBoundingClientRect(); tmx = (e.clientX - b.left) / b.width - .5; tmy = (e.clientY - b.top) / b.height - .5; });
  root.addEventListener('pointerleave', () => { tmx = tmy = 0; });
  let lastActive = -1;

  animate(root, (dt, t) => {
    mx += (tmx - mx) * Math.min(1, dt * 3); my += (tmy - my) * Math.min(1, dt * 3);
    rig.rotation.set(-.42 + my * .3, mx * .4, 0);
    camera.position.set(0, 0, S.w < 480 ? 14.5 : 11.2); camera.lookAt(0, 0, 0);
    core.material.uniforms.uT.value = t;

    const ph = t / PERIOD, i = Math.floor(ph) % 4, f = ease(clamp(((ph % 1) - .5) / .5));
    const head = NODE_ANG[i] - f * Math.PI / 2, active = f > .98 ? (i + 1) % 4 : i;
    pts.n = 0;
    for (let k = 0; k < 220; k++){ const a = k / 220 * 6.283 - t * .08; pts.push(Math.cos(a) * R, Math.sin(a) * R, 0, C_RING, .22, .05); }
    for (let k = 0; k < 70; k++){
      const a = head + k * .022, al = (1 - k / 70) * (f > 0 && f < 1 ? 1 : .35);
      pts.push(Math.cos(a) * R, Math.sin(a) * R, 0, C_HEAD[i], al, .14 - k * .0012);
    }
    for (let k = 0; k < 56; k++){ if (k % 2) continue; const a = k / 56 * 6.283 + t * .25; pts.push(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0, C_TEAL, .45, .045); }
    SAT.forEach((c, s) => { const a = t * (.35 + s * .12) + s * 2.1, r = s === 1 ? R : 1.45; pts.push(Math.cos(a) * r, Math.sin(a) * r, 0, c, .9, .16); });
    for (let k = 0; k < 90; k++){ const a = k * 2.399 + t * .3, r = .3 + (k % 9) * .04; pts.push(Math.cos(a) * r, Math.sin(a * 1.3) * r, Math.sin(a) * r * .5, C_RING, .12, .04); }
    pts.flush();
    markers.forEach((m, n) => m.scale.setScalar(n === active ? 1.6 + .3 * Math.sin(t * 6) : 1));

    rig.updateMatrixWorld();
    nodes.forEach((el, n) => {
      const p = toScreen(markers[n].getWorldPosition(new THREE.Vector3()), camera, S.w, S.h);
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
    });
    if (active !== lastActive){ lastActive = active; nodes.forEach((el, n) => el.classList.toggle('on', n === active)); }
    S.render();
  });
}
