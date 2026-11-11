// AllotarX closed-loop engine, drawn light on a light card: a tilted ring with four stations. A comet in the colour of
// the step it leaves runs clockwise Design → Build → Test → Learn; each station lights up as the comet reaches it, and
// the ring itself is tinted step by step, so the loop reads as one continuous colour cycle.
import {THREE, createStage, makePoints, animate, clamp, ease, rgb, toScreen} from './gl.js';

const NODE_COL = ['#4F8FD9', '#8a6fe0', '#5466c8', '#e0753f'];
const NODE_ANG = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];   // top, right, bottom, left (clockwise on screen)
const R = 2.2, PERIOD = 3.2, RING = 720;

export function initEngine(root){
  const canvas = root.querySelector('canvas'), nodes = [...root.querySelectorAll('.engine-node')];
  const S = createStage(canvas, {light: true, fog: 0, env: false, fov: 30, minDpr: 2});
  const {scene, camera} = S;
  const rig = new THREE.Group(); scene.add(rig);

  const markers = NODE_COL.map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.085, 24, 16), new THREE.MeshBasicMaterial({color: c}));
    m.position.set(Math.cos(NODE_ANG[i]) * R, Math.sin(NODE_ANG[i]) * R, 0); rig.add(m); return m;
  });
  const pts = makePoints(RING + 80, S.glow); rig.add(pts.points);
  const COL = NODE_COL.map(rgb), BASE = rgb('#cdd2ee'), lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // ring colour at angle a: the colour of the step whose quarter it lies in, blended across each station
  const tint = a => {
    const u = ((NODE_ANG[0] - a) / (Math.PI / 2) % 4 + 4) % 4, i = Math.floor(u), f = u - i;
    return lerp(COL[i], COL[(i + 1) % 4], ease(clamp((f - .7) / .3)));
  };
  const level = [0, 0, 0, 0];
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
    camera.position.set(0, 0, S.w < 480 ? 16 : 13); camera.lookAt(0, 0, 0);
    if (hold > 0 && (hold -= dt) <= 0) release();
    if (hover >= 0) cycle0 = t - hover * PERIOD - PERIOD * .5;
    // each period: rest on station i for the first half, then travel clockwise to the next station
    const ph = (t - cycle0) / PERIOD, i = ((Math.floor(ph) % 4) + 4) % 4, f = hover >= 0 ? 0 : ease(clamp(((ph % 1) - .5) / .5));
    const head = NODE_ANG[i] - f * Math.PI / 2, active = hover >= 0 ? hover : f > .98 ? (i + 1) % 4 : i;
    for (let n = 0; n < 4; n++) level[n] += ((n === active ? 1 : 0) - level[n]) * Math.min(1, dt * 4);

    pts.n = 0;
    // the ring: a soft base line, tinted in each step's colour
    for (let k = 0; k < RING; k++){ const a = k / RING * 6.283; const c = tint(a); pts.push(Math.cos(a) * R, Math.sin(a) * R, 0, lerp(BASE, c, .7), .95, .06); }
    // the comet and its trail, in the colour of the step it leaves
    const moving = f > 0 && f < 1;
    for (let k = 0; k < 60; k++){
      const a = head + k * .02, al = (1 - k / 60) * (moving ? 1 : .4);
      pts.push(Math.cos(a) * R, Math.sin(a) * R, 0, COL[i], al, .13 - k * .0015);
    }
    pts.flush();
    markers.forEach((m, n) => m.scale.setScalar(1 + .7 * level[n]));

    rig.updateMatrixWorld();
    nodes.forEach((el, n) => {
      const p = toScreen(markers[n].getWorldPosition(new THREE.Vector3()), camera, S.w, S.h);
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
    });
    if (active !== lastActive){ lastActive = active; nodes.forEach((el, n) => el.classList.toggle('on', n === active)); cards.forEach((el, n) => el.classList.toggle('on', n === active)); }
    S.render();
  });
}
