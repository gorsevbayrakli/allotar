// AllotarX closed-loop engine: a still, tilted ring with four stations; one soft highlight moves Design → Build → Test → Learn.
import {THREE, createStage, makePoints, animate, hdr, toScreen} from './gl.js';

const NODE_COL = ['#4F8FD9', '#8a6fe0', '#6a7cff', '#e0753f'];
const NODE_ANG = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];   // top, right, bottom, left (clockwise order)
const R = 2.2, PERIOD = 3.6;

export function initEngine(root){
  const canvas = root.querySelector('canvas'), nodes = [...root.querySelectorAll('.engine-node')];
  const S = createStage(canvas, {bloom: [.7, .6, .7], exposure: 1, fog: 0, env: false, fov: 30});
  const {scene, camera} = S;
  const rig = new THREE.Group(); scene.add(rig);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, .012, 8, 220), new THREE.MeshBasicMaterial({color: '#28356e'})); rig.add(ring);
  // fresnel core
  const core = new THREE.Mesh(new THREE.SphereGeometry(.92, 64, 48), new THREE.ShaderMaterial({
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
  const pts = makePoints(240, S.glow); rig.add(pts.points);
  const C_RING = hdr('#6f8dff', 1.2), C_HEAD = NODE_COL.map(c => hdr(c, 2.4));
  const level = [0, 0, 0, 0];   // how lit each station is, eased towards the active one
  let lastActive = -1, hover = -1, hold = 0, cycle0 = 0;
  // the step cards under the ring follow the same highlight; hovering (or tapping) a node or card takes over the loop
  const cards = [...document.querySelectorAll('.steps-linked .step')];
  const pick = n => { hover = n; hold = 0; };
  const release = () => { hover = -1; };
  [nodes, cards].forEach(list => list.forEach((el, n) => {
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pick(n); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') release(); });
    el.addEventListener('click', () => { pick(n); hold = 4; });   // touch: stay on the tapped step for a few seconds
  }));

  animate(root, (dt, t) => {
    rig.rotation.set(-.42, 0, 0);
    camera.position.set(0, 0, S.w < 480 ? 14.5 : 11.2); camera.lookAt(0, 0, 0);

    if (hold > 0 && (hold -= dt) <= 0) release();
    // after a hover the loop resumes from the step that was picked
    if (hover >= 0) cycle0 = t - hover * PERIOD;
    const active = hover >= 0 ? hover : Math.floor((t - cycle0) / PERIOD) % 4;
    for (let n = 0; n < 4; n++) level[n] += ((n === active ? 1 : 0) - level[n]) * Math.min(1, dt * 2.5);
    pts.n = 0;
    for (let k = 0; k < 220; k++){ const a = k / 220 * 6.283; pts.push(Math.cos(a) * R, Math.sin(a) * R, 0, C_RING, .22, .05); }
    // one soft halo per station, only the active one visible
    for (let n = 0; n < 4; n++) if (level[n] > .01) pts.push(Math.cos(NODE_ANG[n]) * R, Math.sin(NODE_ANG[n]) * R, 0, C_HEAD[n], .55 * level[n], .7);
    pts.flush();
    markers.forEach((m, n) => m.scale.setScalar(1 + .45 * level[n]));

    rig.updateMatrixWorld();
    nodes.forEach((el, n) => {
      const p = toScreen(markers[n].getWorldPosition(new THREE.Vector3()), camera, S.w, S.h);
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
    });
    if (active !== lastActive){ lastActive = active; nodes.forEach((el, n) => el.classList.toggle('on', n === active)); cards.forEach((el, n) => el.classList.toggle('on', n === active)); }
    S.render();
  });
}
