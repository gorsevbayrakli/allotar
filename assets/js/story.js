// Pinned protein for the home page story: while the text panels scroll past, the protein drifts from side
// to side, closes from the open (4AKE) to the closed (1AKE) state, and finally lights up its allosteric site.
import {THREE, createStage, makeAtoms, fillAtoms, loadProtein, pacmanView, animate, clamp, ease, lerp, lin, K, DOM_COLORS} from './gl.js';

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
  const mc = makeAtoms(P); pivot.add(mc);
  const B = new Float32Array(P.N * 3), SITE = lin('#F2A37C');
  // soft glow over the allosteric site (it sits in a pocket, so the spheres alone barely show it)
  const halo = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,190,150,1)'); r.addColorStop(.35, 'rgba(242,163,124,.55)'); r.addColorStop(1, 'rgba(242,163,124,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0}));
    sp.scale.setScalar(2.2); pivot.add(sp); return sp; })();
  const siteIdx = P.sites[0];

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
    fillAtoms(mc, P, B, i => { const c = DOM_COLORS[P.dom[i]]; const s = P.siteOf[i] === 0 ? pulse : 0;
      return s ? [lerp(c[0], SITE[0], s), lerp(c[1], SITE[1], s), lerp(c[2], SITE[2], s), s] : c; },
      1, i => P.siteOf[i] === 0 ? 1 + .55 * glow : 1);   // the site swells out of its pocket as it lights up
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
    // last panel: turn the protein so the lit site faces the viewer
    group.rotation.set(.05, .3 * Math.sin(t * .3) * (1 - glow) + mx * .3 - 1.1 * glow, 0);
    let hx = 0, hy = 0, hz = 0; for (const i of siteIdx){ hx += B[i*3]; hy += B[i*3+1]; hz += B[i*3+2]; }
    halo.position.set(hx / siteIdx.length * K, hy / siteIdx.length * K, hz / siteIdx.length * K);
    halo.material.opacity = pulse * .9;
    camera.position.set(0, .6, narrow ? 17 : 13);
    camera.lookAt(0, 0, 0);
    S.render();
  });
}
