// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side
// to side, closes from the open (4AKE) to the closed (1AKE) state, and finally lights up its allosteric site.
import {THREE, createStage, makeSurface, proteinMaterial, fillSurface, loadProtein, pacmanView, animate, clamp, ease, lerp, lin, DOM_COLORS} from './gl.js';

export async function initStory(canvas){
  const section = canvas.closest('[data-story]');
  const S = createStage(canvas, {exposure: .9, fov: 30, light: true});
  const {scene, camera} = S;
  scene.add(new THREE.HemisphereLight(0xe6eaf7, 0x1a1f33, .55));
  const key = new THREE.DirectionalLight(0xfff3e8, 1.5); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb8c4ea, 1.4); rim.position.set(5, -2, -6); scene.add(rim);

  const P = await loadProtein();
  const group = new THREE.Group(); scene.add(group);
  const pivot = new THREE.Group(); pivot.quaternion.copy(pacmanView(P)); group.add(pivot);
  const mc = makeSurface(innerWidth < 760 ? 40 : 52, proteinMaterial()); pivot.add(mc);
  mc.material.opacity = 1;
  const B = new Float32Array(P.N * 3), SITE = lin('#F2A37C');

  const panels = [...section.querySelectorAll('.panel')];
  let mx = 0, tmx = 0, x = 2, lam = 0, glow = 0, fy = 1.2, fs = 1;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; });

  animate(canvas, (dt, t) => {
    const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const narrow = S.w < 760, k = Math.min(1, dt * 3);
    // three panels: open on the right, closing on the left, allosteric site lit on the right
    const side = narrow ? 0 : (p < .33 ? 2.2 : p < .66 ? -2.2 : 2.2);
    x += (side - x) * k;
    lam += (ease(clamp((p - .3) / .3)) - lam) * k;
    glow += ((p > .62 ? 1 : 0) - glow) * k;
    mx += (tmx - mx) * k;

    P.conform(B, t, lam);
    const pulse = glow * (.65 + .35 * Math.sin(t * 2.4));
    fillSurface(mc, P, B, i => { const c = DOM_COLORS[P.dom[i]]; const s = P.siteOf[i] === 0 ? pulse : 0;
      return s ? [lerp(c[0], SITE[0], s), lerp(c[1], SITE[1], s), lerp(c[2], SITE[2], s)] : c; });
    // phones: the text panels sit at the bottom, so fit the protein into the band between the nav and the panel on screen
    let ty = 0, ts = 1;
    if (narrow){
      const camZ = 17, upp = 2 * camZ * Math.tan(15 * Math.PI / 180) / S.h;   // world units per pixel at the protein's depth
      const on = panels.find(el => el.classList.contains('on')) || panels[0];
      const bot = on.offsetTop - 24, top = 88;   // offsetTop ignores the panel's slide-in transform
      ts = clamp((bot - top) * upp / 3.5, .4, 1);   // ~3.5 units: the open protein's height including its sway
      ty = (S.h / 2 - (top + bot) / 2) * upp + .6 * (1 - ts);
    }
    fy += (ty - fy) * k; fs += (ts - fs) * k;
    group.position.set(x, narrow ? fy : 0, 0);
    group.scale.setScalar(narrow ? fs : 1);
    group.rotation.set(.05, .3 * Math.sin(t * .3) + mx * .3, 0);
    camera.position.set(0, .6, narrow ? 17 : 13);
    camera.lookAt(0, 0, 0);
    S.render();
  });
}
