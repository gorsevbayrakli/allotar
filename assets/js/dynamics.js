// Ultra-fast dynamics sampling: a rendered film of the protein folding from open to closed, then shifting into a
// shallower third state. The film plays on its own transparent layer (white keyed out) so its colours stay exact.
import * as THREE from 'three';

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
  const film = filmLayer(root.querySelector('.dyn-vid'));
  // play only while the card is on screen
  let on = false;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) film.video.play().catch(() => {}); else film.video.pause(); }).observe(root);
  const loop = () => { if (on) film.draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
