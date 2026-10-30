// Full-screen hero: a glowing particle wave field, optionally with the target protein assembling above it.
// Scrolling flies the camera forward and dissolves the protein surface into its atoms.
import {THREE, createStage, makePoints, makeSurface, proteinMaterial, fillSurface, loadProtein, animate, clamp, ease, prog, rng, hdr, lin, K, DOM_COLORS} from './gl.js';

export async function initHero(canvas, {mode = 'protein'} = {}){
  const S = createStage(canvas, {bloom: [.6, .75, .8], exposure: .9, fog: .03});
  const {scene, camera} = S;
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0a0f25, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7aa2ff, 3.2); rim.position.set(5, -2, -6); scene.add(rim);

  // wave field
  const NX = 150, NZ = 70, field = makePoints(NX * NZ, S.glow); scene.add(field.points);
  const CA = hdr('#3f6fff', 1.2), CB = hdr('#9a7bff', 1.2), CREST = hdr('#cfe4ff', 2.2);
  const col = [0, 0, 0];
  // dust
  const dust = makePoints(600, S.glow); scene.add(dust.points);
  const DUST = []; { const r = rng(9); for (let i = 0; i < 600; i++) DUST.push([(r() - .5) * 40, (r() - .2) * 16, -r() * 30 + 4, r() * 6.28, .2 + r() * .6, .02 + r() * .05, .1 + r() * .45]); }
  const DCOL = hdr('#9fb8ff', 1.1);

  // protein
  let P = null, mc = null, atoms = null, B = null, SCAT = null, group = null;
  if (mode === 'protein'){
    P = await loadProtein();
    group = new THREE.Group(); scene.add(group);
    mc = makeSurface(innerWidth < 760 ? 42 : 54, proteinMaterial()); group.add(mc);
    atoms = makePoints(P.N, S.glow); group.add(atoms.points);
    B = new Float32Array(P.N * 3); SCAT = new Float32Array(P.N * 3);
    const r = rng(7);
    for (let i = 0; i < P.N; i++){ const u = r()*2 - 1, th = r()*6.283, s = Math.sqrt(1 - u*u), d = 50 + r()*110;
      SCAT[i*3] = P.CC.x + Math.cos(th)*s*d; SCAT[i*3+1] = P.CC.y + u*d*.6; SCAT[i*3+2] = P.CC.z + Math.sin(th)*s*d; }
  }
  const SITE = lin('#ff7a3a'), C_SITE = hdr('#ff7a3a', 3), C_ICE = hdr('#9cc0ff', 1.4);

  let scrollP = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('scroll', () => { scrollP = clamp(scrollY / innerHeight); }, {passive: true});
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; });

  animate(canvas, (dt, t) => {
    mx += (tmx - mx) * Math.min(1, dt * 2); my += (tmy - my) * Math.min(1, dt * 2);
    const p = scrollP, narrow = S.w < 760;

    // field
    field.n = 0;
    for (let iz = 0; iz < NZ; iz++){
      const z = 6 - iz * .52, fade = clamp(1 - iz / NZ) * clamp(iz / 4);
      for (let ix = 0; ix < NX; ix++){
        const x = -20 + ix * (40 / NX);
        const h = .5 * Math.sin(x * .32 + t * .55) + .38 * Math.sin(z * .42 - t * .45) + .2 * Math.sin((x + z) * .7 + t * .9);
        const crest = clamp((h - .35) * 1.6), k = ix / NX;
        for (let c = 0; c < 3; c++) col[c] = CA[c] + (CB[c] - CA[c]) * k + (CREST[c] - CA[c]) * crest * .6;
        field.push(x, -2.8 + h, z, col, (.18 + .5 * crest) * fade, .05 + .03 * crest);
      }
    }
    field.flush();
    dust.n = 0;
    for (const d of DUST) dust.push(d[0] + Math.sin(t * .05 + d[3]) * d[4], d[1] + Math.cos(t * .07 + d[3]) * d[4] * .5, d[2], DCOL, d[6] * (.6 + .4 * Math.sin(t * .4 + d[3] * 5)), d[5]);
    dust.flush();

    // protein
    if (P){
      const a = ease(prog(t, .3, 2.8)), surf = ease(prog(t, 1.6, 1.6)) * (1 - p * .95);
      P.conform(B, t, .35 - .35 * Math.cos(2 * Math.PI * t / 7));
      group.position.set(narrow ? 0 : 3.1, narrow ? 3.3 + p * 1.2 : .25 + p * 1.2, 0);
      group.rotation.set(.15 + my * .2, t * .08 + p * 1.6 + mx * .5, 0);
      const lit = Math.floor(t / 3.2) % 3, litK = Math.sin(Math.PI * ((t / 3.2) % 1)) * prog(t, 3, 1);
      if (surf > .005){
        fillSurface(mc, P, B, i => { const c = DOM_COLORS[P.dom[i]]; const k = P.siteOf[i] === lit ? litK * .85 : 0; return k ? [c[0] + (SITE[0] - c[0]) * k, c[1] + (SITE[1] - c[1]) * k, c[2] + (SITE[2] - c[2]) * k] : c; });
      }
      mc.visible = surf > .005; mc.material.opacity = surf;
      atoms.n = 0;
      const twinkle = .06 + .6 * Math.sin(Math.PI * a) + p * .5, burst = 1 + p * .5;
      for (let i = 0; i < P.N; i++){
        const j = i*3, dx = B[j] - P.CC.x, dy = B[j+1] - P.CC.y, dz = B[j+2] - P.CC.z, dl = Math.hypot(dx, dy, dz) || 1, push = P.RAD[i] * 1.15 / dl;
        const x = P.CC.x + (dx * (1 + push)) * burst, y = P.CC.y + (dy * (1 + push)) * burst, z = P.CC.z + (dz * (1 + push)) * burst;
        const px = (SCAT[j] + (x - SCAT[j]) * a) * K, py = (SCAT[j+1] + (y - SCAT[j+1]) * a) * K, pz = (SCAT[j+2] + (z - SCAT[j+2]) * a) * K;
        const site = P.siteOf[i] === lit && litK > .05;
        atoms.push(px, py, pz, site ? C_SITE : C_ICE, site ? Math.max(.4 * litK, twinkle * .5) : twinkle * (.5 + .5 * Math.sin(t * 3 + P.phase[i] * 3)), site ? .13 : .05);
      }
      atoms.flush();
    }

    // camera: protein mode looks at the protein; field mode skims low over the waves
    if (P){
      camera.position.set(mx * .8, .4 + p * .8 - my * .4, (narrow ? 18 : 12) - p * 2.5);
      camera.lookAt(narrow ? 0 : 1.3, -.2 - p * .4, 0);
    } else {
      camera.position.set(mx * .8, 1.1 - my * .3, 9 - p * 3);
      camera.lookAt(0, -1.2, -6 - p * 3);
    }
    S.render();
  });
}
