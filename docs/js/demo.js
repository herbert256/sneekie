/* ============================================================
   Sneekie Dreamscape — docs/js/demo.js
   A cinematic, non-playable Three.js tribute to the 1988 game.

   The 1988 board (a walled court of hearts, clubs, smileys, pushable
   stones and deadly arrows) is re-dreamed as a floating temple maze above
   a sea of clouds. A procedurally skinned serpent — lofted every frame
   along its own path, with real scale normals, iridescence and clearcoat —
   hunts ruby hearts and emerald clovers on its own, while an automatic
   director cuts between camera shots. One shot dissolves the scene back
   into the 80x25 text screen it came from.

   Loaded as an ES module by docs/<lang>/demo.html, which maps "three" to
   a pinned jsDelivr build via an import map. Localized strings come from
   the page's inline window.SNEEKIE_TEXT.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TXT = Object.assign({
  presents: 'HerbySoft presents',
  subtitle: 'the serpent of 1988 &middot; dreamed anew',
  levels: ['The Open Court', 'The Maze of Lines', 'The Stone Zigzag', 'The Halls of Doors'],
  level: 'Level',
  era1988: '1988 &middot; GW-BASIC &middot; 80&times;25 text mode',
  era2026: '2026 &middot; Three.js &middot; WebGL',
  nogl: 'This demo needs WebGL2.',
  pause: 'Pause (Space)', play: 'Play (Space)',
  freecam: 'Free camera: drag to orbit, scroll to zoom',
  director: 'Director’s cut',
}, window.SNEEKIE_TEXT || {});

const THREE_VER = '0.180.0';
const FONT_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/fonts/optimer_bold.typeface.json`;

/* ============================================================
   SMALL MATH + NOISE HELPERS (texture and geometry generation)
   ============================================================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const fract = x => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;

function hash2(x, y){
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(x, y, z){ return hash2(x + Math.imul(z | 0, 1442695041), y ^ Math.imul(z | 0, 2246822519)); }
/* value noise, optionally periodic (px/py lattice periods) so textures tile */
function vnoise2(x, y, px = 0, py = 0){
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = px ? mod(ix, px) : ix, x1 = px ? mod(ix + 1, px) : ix + 1;
  const y0 = py ? mod(iy, py) : iy, y1 = py ? mod(iy + 1, py) : iy + 1;
  const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
function fbm2(x, y, oct = 4, px = 0, py = 0){
  let s = 0, a = 0.5, f = 1;
  for(let i = 0; i < oct; i++){
    s += a * vnoise2(x * f, y * f, px * f, py * f);
    f *= 2; a *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
function vnoise3(x, y, z){
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const n = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return lerp(
    lerp(lerp(n(0,0,0), n(1,0,0), fx), lerp(n(0,1,0), n(1,1,0), fx), fy),
    lerp(lerp(n(0,0,1), n(1,0,1), fx), lerp(n(0,1,1), n(1,1,1), fx), fy), fz);
}
function fbm3(x, y, z, oct = 4){
  let s = 0, a = 0.5, f = 1;
  for(let i = 0; i < oct; i++){ s += a * vnoise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}

/* GLSL twins of the helpers above, shared by the sky, clouds and title */
const GLSL_NOISE = /* glsl */`
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.97; }
`;

/* ============================================================
   RENDERER, SCENE, POST
   ============================================================ */
const stage = document.getElementById('main');
const canvas = document.getElementById('dream');
const crtCanvas = document.getElementById('crt');
const loadingEl = document.getElementById('loading');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if(!renderer.capabilities.isWebGL2) throw new Error('no webgl2');
} catch (err){
  loadingEl.innerHTML = `<span>${TXT.nogl}</span>`;
  throw err;
}
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
const REFL_SCALE = 0.36;          // the mirror is blurred and ripple-distorted anyway
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0.055, 0.042, 0.1);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0065);

const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 1500);
camera.position.set(0, 20, 40);

const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(scene, camera);
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.004, maxblur: 0.009 });
bokeh.enabled = false;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.88);
const outputPass = new OutputPass();
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 0 },
    uCA: { value: 0.0022 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uFade, uCA, uGrain; uniform vec2 uRes;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uCA * (0.4 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      col *= mix(1.0, 1.0 - smoothstep(0.12, 0.78, r2 * 1.55), 0.72);       // vignette
      col += vec3(0.010, 0.004, 0.022) * (1.0 - col);                        // lift the blacks toward indigo
      float g = fract(sin(dot(floor(vUv * uRes) + fract(uTime * 7.31) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += g * uGrain * (1.0 - col * 0.6);
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
});
composer.addPass(renderPass);
composer.addPass(bokeh);
composer.addPass(bloom);
composer.addPass(outputPass);
composer.addPass(gradePass);

/* ============================================================
   TEXTURE FACTORY
   ============================================================ */
function dataTex(data, w, h, srgb){
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = MAX_ANISO;
  if(srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
/* tangent-space normal map from a height field (wraps at the borders) */
function heightToNormal(hgt, w, h, strength){
  const out = new Uint8Array(w * h * 4);
  for(let y = 0; y < h; y++){
    const yu = (y + 1) % h, yd = (y - 1 + h) % h;
    for(let x = 0; x < w; x++){
      const xr = (x + 1) % w, xl = (x - 1 + w) % w;
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
      const dy = (hgt[yu * w + x] - hgt[yd * w + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * w + x) * 4;
      out[o] = (-dx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}
function canvasTex(w, h, draw, srgb = true){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = MAX_ANISO;
  if(srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowSprite(){
  return canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.18, 'rgba(255,255,255,.55)');
    r.addColorStop(0.5, 'rgba(255,255,255,.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  }, false);
}

/* ---------- serpent skin ----------
   Scales live on a staggered lattice: NL scales along one texture length,
   NA around the body (even, so the stagger wraps). Each pixel finds its
   nearest scale center under a rhombic metric, which yields overlapping
   diamond scales. The COLOR of a scale is decided once at its center, so
   the diamond chain is "pixelated" by scales exactly like a real python. */
const SN_R = 0.19;                    // body radius (a maze cell is 1)
const SKIN_LEN = 2.0;                 // world length covered by one skin texture repeat
function srgbMix(a, b, t){ return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function genScaleSkin(o){
  const { W, H, NL, NA } = o;
  const col = new Uint8Array(W * H * 4);
  const rough = new Uint8Array(W * H * 4);
  const GW2 = W >> 1, GH2 = H >> 1;
  const glow = new Uint8Array(GW2 * GH2 * 4);
  const hgt = new Float32Array(W * H);
  const cache = new Float32Array(NL * NA * 5).fill(-1);
  for(let y = 0; y < H; y++){
    const v = (y + 0.5) / H * NA;
    const vf = (y + 0.5) / H;
    const j0 = Math.floor(v);
    for(let x = 0; x < W; x++){
      const u = (x + 0.5) / W * NL;
      let best = 9, bdu = 0, bdv = 0, bi = 0, bj = 0;
      for(let dj = -1; dj <= 1; dj++){
        const j = j0 + dj;
        const off = (mod(j, NA) & 1) ? 0.5 : 0;
        const ic = Math.floor(u - off);
        const du = u - (ic + 0.5 + off), dv = v - (j + 0.5);
        const au = Math.abs(du), av = 0.5 * Math.abs(dv);
        const m = 0.55 * (au + av) + 0.45 * Math.hypot(au, av) * 1.25;
        if(m < best){ best = m; bdu = du; bdv = dv; bi = ic; bj = j; }
      }
      const q = Math.min(1, best / 0.5);
      const si = mod(bi, NL), sj = mod(bj, NA);
      const key = (si * NA + sj) * 5;
      if(cache[key] < 0){
        const offC = (sj & 1) ? 0.5 : 0;
        const c = o.pattern((si + 0.5 + offC) / NL, (sj + 0.5) / NA, hash2(si * 7 + 3, sj * 13 + 5));
        cache[key] = c[0]; cache[key + 1] = c[1]; cache[key + 2] = c[2]; cache[key + 3] = c[3]; cache[key + 4] = c[4] ?? 0.35;
      }
      // height: domed scale, raised toward its free (tail-side) edge, small keel, grooves at the rim
      const dome = 1 - q * q;
      let h = dome * (0.6 + (bdu + 0.5) * 0.55) + 0.08 * Math.max(0, 1 - Math.abs(bdv) * 5) * (1 - q);
      h *= smooth(1.0, 0.86, q);
      let r = cache[key], g = cache[key + 1], b = cache[key + 2], gl = cache[key + 3], ro = cache[key + 4];
      // optional ventral plates (wide transverse scutes along the belly band)
      if(o.bellyBand){
        const lat = Math.min(vf, 1 - vf);
        const bb = smooth(o.bellyBand[0], o.bellyBand[1], lat);
        if(bb > 0){
          const fu = fract((x + 0.5) / W * o.NLB);
          const hb = Math.pow(fu, 0.6) * 0.95 * smooth(0.0, 0.08, fu);
          h = lerp(h, hb, bb);
          const plate = Math.floor((x + 0.5) / W * o.NLB);
          const bc = o.belly(hash2(plate, 91));
          r = lerp(r, bc[0], bb); g = lerp(g, bc[1], bb); b = lerp(b, bc[2], bb);
          gl *= 1 - bb; ro = lerp(ro, 0.42, bb);
        }
      }
      hgt[y * W + x] = h;
      // baked cavity: grooves between scales go dark
      const cav = 0.5 + 0.5 * smooth(0.0, 0.4, h);
      const sheen = 1 + 0.08 * (bdu + 0.5);
      const oi = (y * W + x) * 4;
      col[oi] = clamp(r * cav * sheen, 0, 1) * 255;
      col[oi + 1] = clamp(g * cav * sheen, 0, 1) * 255;
      col[oi + 2] = clamp(b * cav * sheen, 0, 1) * 255;
      col[oi + 3] = 255;
      const rr = clamp(ro + (1 - smooth(0, 0.3, h)) * 0.35, 0, 1) * 255;
      rough[oi] = rr; rough[oi + 1] = rr; rough[oi + 2] = rr; rough[oi + 3] = 255;
      if(!(x & 1) && !(y & 1)){
        const go = ((y >> 1) * GW2 + (x >> 1)) * 4;
        const gv = clamp(gl * smooth(0.05, 0.4, h), 0, 1) * 255;
        glow[go] = gv; glow[go + 1] = gv; glow[go + 2] = gv; glow[go + 3] = 255;
      }
    }
  }
  return {
    map: dataTex(col, W, H, true),
    normalMap: dataTex(heightToNormal(hgt, W, H, o.normalStrength), W, H, false),
    roughnessMap: dataTex(rough, W, H, false),
    emissiveMap: dataTex(glow, GW2, GH2, true),
  };
}

const SKIN = {
  dorsal: [0.035, 0.24, 0.13],
  lateral: [0.13, 0.46, 0.20],
  belly: [0.86, 0.80, 0.50],
  dark: [0.015, 0.075, 0.05],
  gold: [0.96, 0.74, 0.24],
  jade: [0.32, 0.76, 0.46],
  fleck: [0.92, 0.95, 0.66],
  cream: [0.88, 0.84, 0.58],
};

function bodySkin(){
  const CIRC = TAU * SN_R * 1.03;
  return genScaleSkin({
    W: 2048, H: 1024, NL: 32, NA: 56, NLB: 24, normalStrength: 2.2,
    bellyBand: [0.335, 0.39],
    belly: rnd => srgbMix(SKIN.belly, SKIN.cream, rnd * 0.6),
    pattern(uf, vf, rnd){
      const uw = uf * SKIN_LEN;
      const lat = Math.min(vf, 1 - vf);          // 0 = spine, .5 = belly
      const latW = lat * CIRC;
      let c = srgbMix(SKIN.dorsal, SKIN.lateral, smooth(0.05, 0.3, lat));
      let glow = 0, rough = 0.34;
      // the dorsal diamond chain (gold-rimmed, jade-hearted)
      const P = 0.5;
      const a = mod(uw, P) - P / 2;
      // organic warp: no two diamonds quite alike (periodic so the texture still tiles)
      const warp = (fbm2(uf * 16, vf * 9, 3, 16, 9) - 0.5) * 0.5;
      const dm = Math.abs(a) / (0.19 + 0.03 * Math.sin(uf * TAU * 4 + 1.3)) + latW / 0.15 + warp;
      if(dm < 1){
        if(dm > 0.8){ c = SKIN.gold.slice(); glow = 1; rough = 0.28; }
        else if(dm < 0.3){ c = SKIN.jade.slice(); glow = 0.45; }
        else c = SKIN.dark.slice();
      }
      // lateral blotches in the gaps between diamonds
      const a2 = mod(uw + P / 2, P) - P / 2;
      const bl = Math.hypot(a2 / 0.1, (latW - 0.27 - warp * 0.06) / 0.068) + warp * 0.6;
      if(bl < 1){
        if(bl > 0.7){ c = srgbMix(SKIN.gold, SKIN.lateral, 0.25); glow = 0.6; }
        else c = srgbMix(SKIN.dark, SKIN.dorsal, 0.3);
      }
      // scattered pale flecks along the back, like a green tree python
      if(rnd > 0.955 && lat < 0.3 && dm >= 1) c = srgbMix(c, SKIN.fleck, 0.7);
      const k = 0.94 + 0.12 * hash2(Math.floor(rnd * 1e6), 3);
      return [c[0] * k, c[1] * k, c[2] * k, glow, rough];
    },
  });
}

/* the head uses its own lattice (bigger crown plates) and markings */
function headSkin(){
  return genScaleSkin({
    W: 1024, H: 1024, NL: 19, NA: 42, normalStrength: 1.5,
    pattern(pu, vc, rnd){
      const lat = Math.abs(vc - 0.5) * 2;        // 0 = crown line, 1 = lip
      let c = srgbMix(SKIN.dorsal, SKIN.lateral, smooth(0.35, 0.85, lat));
      let glow = 0, rough = 0.32;
      if(lat > 0.86) c = srgbMix(c, SKIN.cream, smooth(0.86, 0.95, lat));
      // chevron pointing at the snout
      const arm = (0.78 - pu) * 0.95;
      if(pu > 0.12 && pu < 0.72){
        const d = Math.abs(lat - arm);
        if(d < 0.075) c = SKIN.dark.slice();
        else if(d < 0.12){ c = SKIN.gold.slice(); glow = 0.8; }
      }
      // crown jewel between the eyes
      if(pu > 0.72 && pu < 0.86 && lat < 0.14){ c = SKIN.gold.slice(); glow = 1; }
      // postocular stripe from the eye to the jaw corner
      const ex = 0.58, ey = 0.72, jx = 0.04, jy = 0.9;
      const t = clamp(((pu - ex) * (jx - ex) + (lat - ey) * (jy - ey)) / ((jx - ex) ** 2 + (jy - ey) ** 2), 0, 1);
      const sd = Math.hypot(pu - (ex + (jx - ex) * t), lat - (ey + (jy - ey) * t));
      if(sd < 0.05) c = srgbMix(SKIN.dark, c, 0.15);
      if(pu > 0.9) c = srgbMix(c, SKIN.lateral, 0.35);
      const k = 0.9 + 0.2 * rnd;
      return [c[0] * k, c[1] * k, c[2] * k, glow, rough];
    },
  });
}
function jawSkin(){
  return genScaleSkin({
    W: 512, H: 256, NL: 13, NA: 24, normalStrength: 1.2,
    pattern(pu, vc, rnd){
      const lat = Math.abs(vc - 0.5) * 2;
      let c = srgbMix(SKIN.cream, SKIN.belly, rnd);
      c = srgbMix(c, SKIN.lateral, smooth(0.72, 0.95, lat) * 0.8);
      return [c[0], c[1], c[2], 0, 0.4];
    },
  });
}

function eyeTexture(){
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#050302'; g.fillRect(0, 0, w, w);
    const cx = w / 2;
    const r = g.createRadialGradient(cx, cx, 4, cx, cx, cx * 0.96);
    r.addColorStop(0, '#fff2a0');
    r.addColorStop(0.35, '#f2b529');
    r.addColorStop(0.72, '#b8560e');
    r.addColorStop(0.93, '#3c1603');
    r.addColorStop(1, '#0b0502');
    g.fillStyle = r; g.beginPath(); g.arc(cx, cx, cx * 0.97, 0, TAU); g.fill();
    // fibrous iris streaks
    for(let i = 0; i < 260; i++){
      const a = Math.random() * TAU, r0 = cx * (0.15 + Math.random() * 0.3), r1 = cx * (0.6 + Math.random() * 0.36);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,230,140,.16)' : 'rgba(80,30,0,.22)';
      g.lineWidth = 1 + Math.random() * 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1); g.stroke();
    }
    // the vertical slit pupil
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(cx, cx, 11, cx * 0.8, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(cx, cx, 19, cx * 0.84, 0, 0, TAU); g.fill();
  });
}

/* ---------- temple textures ---------- */
const GW = 32, GH = 20;               // board incl. the wall ring (1988: a walled court)
const MARGIN = 3;                     // walkway around the ring
const FW = GW + MARGIN * 2, FH = GH + MARGIN * 2;

function floorTextures(){
  const PX = 48, W = FW * PX, H = FH * PX;
  const col = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  const tone = [];
  for(let i = 0; i < FW * FH; i++) tone.push([hash2(i, 1), hash2(i, 2), hash2(i, 3)]);
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const fx = x / PX, fy = y / PX;
      let cx = Math.floor(fx), cy = Math.floor(fy);
      const inBoard = cx >= MARGIN && cx < MARGIN + GW && cy >= MARGIN && cy < MARGIN + GH;
      let lx = fx - cx, ly = fy - cy;
      if(!inBoard){                              // walkway: big 2x2 slabs
        const sx = Math.floor(fx / 2), sy = Math.floor(fy / 2);
        lx = (fx - sx * 2) / 2; ly = (fy - sy * 2) / 2; cx = sx + 100; cy = sy + 100;
      }
      const edge = Math.min(lx, 1 - lx, ly, 1 - ly) * (inBoard ? 1 : 2);
      const bevel = smooth(0.015, 0.075, edge);
      const n = fbm2(x * 0.03, y * 0.03, 4);
      const fine = vnoise2(x * 0.35, y * 0.35);
      const ti = mod(cy * 97 + cx, tone.length);
      const [t1, t2, t3] = tone[ti];
      let h = bevel * (0.82 + 0.18 * n) - (fine > 0.86 ? 0.08 : 0);
      // hairline cracks
      const crack = Math.abs(fbm2(x * 0.012 + cx * 3.1, y * 0.012 + cy * 1.7, 3) - 0.5);
      if(crack < 0.012 && bevel > 0.9) h -= 0.12;
      hgt[y * W + x] = h;
      let base = inBoard
        ? srgbMix([0.16, 0.155, 0.19], [0.23, 0.2, 0.19], t1)
        : srgbMix([0.2, 0.18, 0.2], [0.26, 0.23, 0.21], t1);
      if(t2 > 0.8) base = srgbMix(base, [0.14, 0.19, 0.17], 0.6);
      base = srgbMix(base, [base[0] * 1.2, base[1] * 1.15, base[2] * 1.1], n);
      // moss creeping out of the joints
      const moss = (1 - bevel) * smooth(0.35, 0.7, fbm2(x * 0.02 + 40, y * 0.02, 3));
      base = srgbMix(base, [0.07, 0.15, 0.06], moss * 0.85);
      if(bevel < 0.4) base = srgbMix(base, [0.04, 0.04, 0.05], (1 - moss) * 0.7);
      // puddles: big soft blobs; joints stay damp
      const wet = smooth(0.52, 0.6, fbm2(x * 0.0045 + 7, y * 0.0045 + 3, 4)) * smooth(0.2, 0.6, bevel);
      const k = 1 - wet * 0.45;
      const o = (y * W + x) * 4;
      col[o] = clamp(base[0] * k * (0.9 + 0.2 * t3), 0, 1) * 255;
      col[o + 1] = clamp(base[1] * k * (0.9 + 0.2 * t3), 0, 1) * 255;
      col[o + 2] = clamp(base[2] * k * (0.9 + 0.2 * t3), 0, 1) * 255;
      col[o + 3] = 255;
      rough[o] = 0;
      rough[o + 1] = lerp(0.72 + 0.2 * fine + (1 - bevel) * 0.2, 0.08, wet) * 255;
      rough[o + 2] = wet * 255;                 // blue channel: wetness for the reflection
      rough[o + 3] = 255;
    }
  }
  const t = {
    map: dataTex(col, W, H, true),
    normalMap: dataTex(heightToNormal(hgt, W, H, 2.2), W, H, false),
    roughnessMap: dataTex(rough, W, H, false),
  };
  for(const k in t) t[k].wrapS = t[k].wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function wallTextures(){
  const S = 512;
  const noiseCol = (g) => {
    const img = g.createImageData(S, S);
    for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
      const n = fbm2(x * 0.02, y * 0.02, 5, 0, 0), f = vnoise2(x * 0.25, y * 0.25);
      const v = 0.1 + 0.07 * n + 0.03 * f;
      const o = (y * S + x) * 4;
      img.data[o] = v * 255 * 0.95; img.data[o + 1] = v * 255 * 0.93; img.data[o + 2] = v * 255 * 1.15; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
  // one set of glyphs shared by the color, bump and emissive maps
  const glyphs = [];
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for(let gI = 0; gI < 3; gI++){
    const strokes = [];
    const n = 3 + Math.floor(rnd() * 3);
    for(let k = 0; k < n; k++){
      const p = () => [Math.floor(rnd() * 3), Math.floor(rnd() * 4)];
      strokes.push([p(), p(), rnd() < 0.3]);
    }
    glyphs.push(strokes);
  }
  const drawRunes = (g, style, width) => {
    g.strokeStyle = style; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    glyphs.forEach((strokes, gi) => {
      const ox = S * 0.39, oy = S * 0.12 + gi * S * 0.27, sx = S * 0.11, sy = S * 0.055;
      for(const [a, b, arc] of strokes){
        g.beginPath();
        g.moveTo(ox + a[0] * sx, oy + a[1] * sy);
        if(arc) g.quadraticCurveTo(ox + 1.5 * sx, oy + 1.5 * sy, ox + b[0] * sx, oy + b[1] * sy);
        else g.lineTo(ox + b[0] * sx, oy + b[1] * sy);
        g.stroke();
      }
    });
  };
  const map = canvasTex(S, S, (g) => {
    noiseCol(g);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 10; g.strokeRect(22, 22, S - 44, S - 44);
    g.strokeStyle = 'rgba(160,150,190,.08)'; g.lineWidth = 3; g.strokeRect(30, 30, S - 60, S - 60);
    drawRunes(g, 'rgba(10,30,26,.35)', 12);
  });
  const bump = canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
      const v = 0.55 + 0.3 * fbm2(x * 0.03 + 9, y * 0.03, 5) + 0.1 * vnoise2(x * 0.4, y * 0.4);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = '#000'; g.lineWidth = 10; g.strokeRect(22, 22, S - 44, S - 44);
    drawRunes(g, '#111', 13);
  }, false);
  const glow = canvasTex(S, S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.filter = 'blur(6px)'; drawRunes(g, '#3fae90', 18);
    g.filter = 'none'; drawRunes(g, '#d6fff0', 5);
  });
  return { map, bump, glow };
}

/* ============================================================
   ENVIRONMENT — sky dome, cloud sea, reflections
   ============================================================ */
const MOON_DIR = new THREE.Vector3(-0.42, 0.2, -0.88).normalize();
const skyUniforms = { uTime: { value: 0 }, uMoon: { value: MOON_DIR } };
const SKY_FS = /* glsl */`
  uniform float uTime; uniform vec3 uMoon;
  varying vec3 vDir;
  ${GLSL_NOISE}
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zen = vec3(0.003, 0.005, 0.022);
    vec3 mid = vec3(0.018, 0.02, 0.07);
    vec3 hor = vec3(0.065, 0.045, 0.11);
    vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zen, smoothstep(0.2, 0.85, h));
    col = mix(col, vec3(0.012, 0.01, 0.03), 1.0 - smoothstep(-0.3, 0.0, h));
    float md = max(dot(d, uMoon), 0.0);
    col += vec3(0.55, 0.5, 0.85) * pow(md, 90.0) * 0.9 + vec3(0.32, 0.18, 0.5) * pow(md, 7.0) * 0.28;
    float disc = smoothstep(0.99935, 0.99955, md);
    vec3 mp = d * 90.0;
    col = mix(col, vec3(3.4, 3.25, 2.9) * (0.72 + 0.28 * fbm(mp)), disc);
    // stars
    vec3 sd = d * 210.0; vec3 cell = floor(sd); float r = hash13(cell);
    if(r > 0.982){
      vec3 f = fract(sd) - 0.5 - (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 5.1)) - 0.5) * 0.6;
      float s = exp(-dot(f, f) * 90.0);
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + r * 6.0) + r * 60.0);
      col += s * tw * mix(vec3(0.75, 0.85, 1.3), vec3(1.4, 1.0, 0.7), hash13(cell + 9.0)) * 3.2 * smoothstep(0.02, 0.25, h) * (1.0 - disc);
    }
    // nebula veils
    float n1 = fbm(d * 2.4 + vec3(0.0, 0.0, uTime * 0.004));
    col += vec3(0.12, 0.03, 0.18) * smoothstep(0.5, 0.85, n1) * smoothstep(-0.05, 0.45, h);
    col += vec3(0.0, 0.09, 0.12) * smoothstep(0.55, 0.9, fbm(d * 4.1 + 7.0)) * smoothstep(0.05, 0.6, h);
    // aurora curtains
    float az = atan(d.z, d.x);
    for(int i = 0; i < 2; i++){
      float fi = float(i);
      float base = 0.2 + fi * 0.09 + 0.07 * sin(az * 2.0 + fi * 2.3 + uTime * 0.045) + 0.05 * vnoise(vec3(az * 3.0, fi * 5.0, uTime * 0.05));
      float dh = h - base;
      float curtain = smoothstep(0.0, 0.015, dh) * exp(-max(dh, 0.0) * (6.0 + fi * 3.0));
      float rays = 0.35 + 0.65 * vnoise(vec3(az * 42.0 + fi * 13.0, uTime * 0.25, fi));
      float mask = smoothstep(0.35, 0.7, vnoise(vec3(az * 1.3 + fi * 4.0, uTime * 0.02, 3.0)));
      vec3 ac = mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.12, 0.85), smoothstep(0.0, 0.2, dh));
      col += ac * curtain * rays * mask * (0.55 - fi * 0.2);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;
function skyMaterial(){
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; gl_Position.z *= 0.99999; }`,
    fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 64, 32), skyMaterial());
sky.renderOrder = -100;
sky.frustumCulled = false;
scene.add(sky);

function makeEnvironment(){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial()));
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.5, 1.0) });
  for(const [x, z] of [[40, 30], [-40, 30], [40, -30], [-40, -30]]){
    const m = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), warm);
    m.position.set(x, 4, z); env.add(m);
  }
  const cool = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 4.2) }));
  cool.position.copy(MOON_DIR).multiplyScalar(80).add(new THREE.Vector3(0, 25, 0)); env.add(cool);
  const soft = new THREE.Mesh(new THREE.PlaneGeometry(120, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.16, 0.26), side: THREE.DoubleSide }));
  soft.position.set(0, 60, 0); soft.rotation.x = Math.PI / 2; env.add(soft);
  scene.environment = pmrem.fromScene(env, 0.035).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
}

/* the sea of clouds far below the floating temple */
const cloudUniforms = { uTime: { value: 0 }, uMoon: { value: MOON_DIR }, uFog: { value: FOG_COLOR } };
function makeClouds(){
  const mat = (scale, alpha) => new THREE.ShaderMaterial({
    uniforms: Object.assign({ uScale: { value: scale }, uAlpha: { value: alpha } }, cloudUniforms),
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uScale, uAlpha; uniform vec3 uMoon, uFog;
      varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vW.xz * uScale;
        float n = fbm(vec3(p + vec2(uTime * 0.012, uTime * 0.006), uTime * 0.01));
        float n2 = fbm(vec3(p * 2.7 - vec2(uTime * 0.02, 0.0), 4.0));
        float dens = smoothstep(0.38, 0.78, n * 0.8 + n2 * 0.3);
        float dist = length(vW.xz - cameraPosition.xz);
        vec3 toMoon = normalize(vec3(uMoon.x, 0.0, uMoon.z));
        float side = dot(normalize(vW.xz - cameraPosition.xz), toMoon.xz) * 0.5 + 0.5;
        vec3 shadowC = vec3(0.005, 0.004, 0.014);
        vec3 litC = mix(vec3(0.028, 0.028, 0.065), vec3(0.1, 0.095, 0.17), side * side);
        vec3 col = mix(shadowC, litC, smoothstep(0.2, 1.0, dens + n2 * 0.25));
        float island = exp(-length(vW.xz) * 0.035);            // warm underglow of the temple
        col += vec3(0.4, 0.16, 0.05) * island * 0.3;
        float fogK = 1.0 - exp(-dist * 0.0032);
        col = mix(col, uFog, fogK);
        float a = dens * uAlpha * (1.0 - smoothstep(420.0, 780.0, dist));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const g = new THREE.PlaneGeometry(1800, 1800, 1, 1);
  g.rotateX(-Math.PI / 2);
  const low = new THREE.Mesh(g, mat(0.012, 0.95)); low.position.y = -22; low.renderOrder = -50;
  const high = new THREE.Mesh(g, mat(0.02, 0.3)); high.position.y = -13; high.renderOrder = -49;
  scene.add(low, high);
}

/* ============================================================
   LIGHTS
   ============================================================ */
const moonLight = new THREE.DirectionalLight(new THREE.Color(0.72, 0.8, 1.0), 1.75);
moonLight.position.set(-14, 26, -20);
moonLight.target.position.set(0, 0, 0);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, near: 5, far: 80 });
moonLight.shadow.bias = -0.0004;
moonLight.shadow.normalBias = 0.025;
moonLight.shadow.radius = 3;
scene.add(moonLight, moonLight.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.3, 0.34, 0.55), new THREE.Color(0.2, 0.12, 0.1), 0.5));
const flashLight = new THREE.PointLight(0xffffff, 0, 6, 2);
scene.add(flashLight);

/* ============================================================
   THE FLOATING TEMPLE — floor, walls, island, braziers
   ============================================================ */
const cellX = x => x - GW / 2 + 0.5;
const cellZ = y => y - GH / 2 + 0.5;
const worldToCell = (wx, wz) => [Math.floor(wx + GW / 2), Math.floor(wz + GH / 2)];
const gi = (x, y) => y * GW + x;
const inside = (x, y) => x >= 1 && x <= GW - 2 && y >= 1 && y <= GH - 2;

let floorMesh, reflector, floorUniforms;
const reflectHide = [];
function makeFloor(){
  const tex = floorTextures();
  const w = Math.max(256, Math.floor(window.innerWidth * pixelRatio * REFL_SCALE));
  const h = Math.max(256, Math.floor(window.innerHeight * pixelRatio * REFL_SCALE));
  reflector = new Reflector(new THREE.PlaneGeometry(FW, FH), { textureWidth: w, textureHeight: h, clipBias: 0.002 });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = -0.001;
  reflector.material.colorWrite = false;
  reflector.material.depthWrite = false;
  reflector.renderOrder = -20;
  const inner = reflector.onBeforeRender;
  reflector.onBeforeRender = function(r, s, c){
    if(s.overrideMaterial || !QUALITY.reflect) return;
    for(const o of reflectHide) o.visible = false;
    // glass gems would trigger a second transmission pass: mirror cheap stand-ins instead
    for(const it of items) if(it.gem.isMesh){ it.gem.userData.mat = it.gem.material; it.gem.material = reflGemMats[it.type]; }
    inner.call(this, r, s, c);
    for(const it of items) if(it.gem.isMesh) it.gem.material = it.gem.userData.mat;
    for(const o of reflectHide) o.visible = true;
  };
  scene.add(reflector);

  floorUniforms = {
    tReflect: { value: reflector.getRenderTarget().texture },
    uReflMat: { value: new THREE.Matrix4() },
    uReflOn: { value: 1 },
  };
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
    roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.55,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, floorUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMat;\nvarying vec4 vReflUv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uReflMat * (modelMatrix * vec4(transformed, 1.0));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tReflect;\nuniform float uReflOn;\nvarying vec4 vReflUv;')
      .replace('#include <opaque_fragment>', `
        {
          float wet = texture2D(roughnessMap, vRoughnessMapUv).b;
          vec4 ru = vReflUv;
          ru.xy += normal.xy * 0.045 * ru.w;
          vec2 st = ru.xy / ru.w;
          vec2 px = vec2(0.0025, 0.0035);
          vec3 refl = texture2D(tReflect, st).rgb * 0.4
            + texture2D(tReflect, st + px).rgb * 0.15 + texture2D(tReflect, st - px).rgb * 0.15
            + texture2D(tReflect, st + vec2(px.x, -px.y)).rgb * 0.15 + texture2D(tReflect, st + vec2(-px.x, px.y)).rgb * 0.15;
          float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
          outgoingLight += refl * uReflOn * mix(0.05, 1.0, wet) * mix(0.25, 0.95, fres);
        }
        #include <opaque_fragment>`);
  };
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);
  reflectHide.push(floorMesh);

  // gold edge trim and the stone slab it crowns
  const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.7, 0.3), metalness: 1, roughness: 0.35, envMapIntensity: 0.6 });
  const trims = [
    [FW + 0.3, 0.16, 0.16, 0, -0.05, FH / 2 + 0.07], [FW + 0.3, 0.16, 0.16, 0, -0.05, -FH / 2 - 0.07],
    [0.16, 0.16, FH + 0.3, FW / 2 + 0.07, -0.05, 0], [0.16, 0.16, FH + 0.3, -FW / 2 - 0.07, -0.05, 0],
  ];
  for(const [w2, h2, d2, x, y, z] of trims){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), gold);
    m.position.set(x, y, z); m.castShadow = true; scene.add(m);
  }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(FW + 0.2, 0.8, FH + 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.9 }));
  slab.position.y = -0.52; scene.add(slab);
}

/* the rocky underside: superellipse rings shrinking to a jagged point */
function rockCone(hx, hz, depth, seed, rings = 26, seg = 120){
  const pos = [], col = [], idx = [];
  const c1 = new THREE.Color(0.11, 0.085, 0.11), c2 = new THREE.Color(0.035, 0.025, 0.05), moss = new THREE.Color(0.04, 0.08, 0.03);
  for(let k = 0; k <= rings; k++){
    const t = k / rings;
    const s = Math.pow(1 - t, 1.15) * (1 - 0.1 * Math.sin(t * 9 + seed));
    const ex = lerp(6, 2, t);
    for(let i = 0; i <= seg; i++){
      const a = i / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / ex) * hx * s;
      let z = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / ex) * hz * s;
      let y = -t * depth;
      const n = fbm3(x * 0.18 + seed, y * 0.25, z * 0.18, 4);
      const r = k === 0 ? 0 : (n - 0.5) * 2.6 * Math.min(1, t * 5) + (vnoise3(x * 0.9, y * 0.6, z * 0.9) - 0.5) * 0.5;
      const len = Math.hypot(x, z) || 1;
      x += x / len * r; z += z / len * r;
      y += (fbm3(x * 0.3, seed, z * 0.3, 3) - 0.5) * 1.6 * t;
      if(k === rings){ x *= 0.02; z *= 0.02; }
      pos.push(x, y, z);
      const c = c1.clone().lerp(c2, t).lerp(moss, k < 3 ? 0.6 * (1 - k / 3) : 0);
      col.push(c.r, c.g, c.b);
    }
  }
  for(let k = 0; k < rings; k++) for(let i = 0; i < seg; i++){
    const a = k * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
const crystalMats = [];
function crystalCluster(count, placeFn){
  const geo = new THREE.OctahedronGeometry(1, 0);
  geo.scale(0.35, 1.6, 0.35);
  geo.translate(0, 1.2, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  crystalMats.push(mat);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const palette = [new THREE.Color(0.3, 2.4, 2.0), new THREE.Color(1.6, 0.4, 2.6), new THREE.Color(0.5, 1.2, 3.0)];
  for(let i = 0; i < count; i++){
    const { pos, dir, size } = placeFn(i);
    q.setFromUnitVectors(up, dir);
    s.setScalar(size);
    m.compose(p.copy(pos), q, s);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, palette[i % 3].clone().multiplyScalar(0.6 + Math.random() * 0.8));
  }
  return inst;
}
function makeIsland(){
  const g = rockCone(FW / 2 + 0.6, FH / 2 + 0.6, 24, 1.7);
  g.translate(0, -0.85, 0);
  const rock = new THREE.Mesh(g, rockMat);
  scene.add(rock);
  // crystals studding the underside, pointing out and down
  const posAttr = g.getAttribute('position'), nAttr = g.getAttribute('normal');
  const verts = posAttr.count;
  scene.add(crystalCluster(70, (i) => {
    const vi = Math.floor(hash2(i, 77) * verts * 0.8) + Math.floor(verts * 0.08);
    const pos = new THREE.Vector3().fromBufferAttribute(posAttr, Math.min(verts - 1, vi));
    const dir = new THREE.Vector3().fromBufferAttribute(nAttr, Math.min(verts - 1, vi)).add(new THREE.Vector3(0, -0.7, 0)).normalize();
    return { pos, dir, size: 0.25 + hash2(i, 5) * 0.55 };
  }));
  // distant floating islets, each with a crown of crystals
  const islets = [];
  for(let i = 0; i < 9; i++){
    const a = i / 9 * TAU + 0.4 + hash2(i, 1) * 0.4;
    const r = 70 + hash2(i, 2) * 90;
    const size = 3 + hash2(i, 3) * 6;
    const ig = rockCone(size, size * (0.7 + hash2(i, 4) * 0.5), size * 2.6, i * 3.1, 14, 48);
    const m = new THREE.Mesh(ig, rockMat);
    m.position.set(Math.cos(a) * r, -6 + hash2(i, 6) * 22, Math.sin(a) * r);
    m.rotation.y = hash2(i, 7) * TAU;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.95, size * 0.98, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.9 }));
    top.position.y = 0.2; top.scale.z = 0.7 + hash2(i, 4) * 0.5; m.add(top);
    m.add(crystalCluster(6, (k) => ({
      pos: new THREE.Vector3((hash2(i, k + 20) - 0.5) * size, 0.3, (hash2(i, k + 40) - 0.5) * size * 0.6),
      dir: new THREE.Vector3((hash2(i, k) - 0.5) * 0.6, 1, (hash2(k, i) - 0.5) * 0.6).normalize(),
      size: size * (0.15 + hash2(k, i + 3) * 0.25),
    })));
    m.userData = { bob: hash2(i, 9) * TAU, y0: m.position.y };
    islets.push(m);
    scene.add(m);
  }
  return islets;
}

/* ---------- walls: one instance per cell, animated heights ---------- */
const WALL = 1, STONE = 2;
const HEART = 3, CLUB = 5, SMILEY = 1;         // the 1988 CP437 codes
const grid = new Uint8Array(GW * GH);
const wallH = new Float32Array(GW * GH);          // shown height fraction 0..1
const wallTarget = new Float32Array(GW * GH);
const wallDelay = new Float32Array(GW * GH);
const wallGlow = new Float32Array(GW * GH);
let wallMesh, capMesh, wallGlowAttr;
const wallUniforms = { uTime: { value: 0 } };
const isRing = (x, y) => x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
const wallHeight = (x, y) => isRing(x, y) ? 1.2 : 0.82;
function makeWalls(){
  const tex = wallTextures();
  const geo = new RoundedBoxGeometry(0.97, 1, 0.97, 2, 0.06);
  geo.translate(0, 0.5, 0);
  wallGlowAttr = new THREE.InstancedBufferAttribute(new Float32Array(GW * GH), 1);
  wallGlowAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlow', wallGlowAttr);
  const runes = new Float32Array(GW * GH);
  for(let i = 0; i < GW * GH; i++) runes[i] = hash2(i, 57) < 0.28 ? 0.6 + hash2(i, 58) * 0.6 : 0;
  geo.setAttribute('aRune', new THREE.InstancedBufferAttribute(runes, 1));
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map, bumpMap: tex.bump, bumpScale: 2.2, roughness: 0.82, metalness: 0,
    emissiveMap: tex.glow, emissive: new THREE.Color(0.35, 1.0, 0.75), emissiveIntensity: 1.2,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wallUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aRune;\nvarying float vGlow;\nvarying float vRune;\nvarying vec3 vIPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGlow = aGlow;\nvRune = aRune;\nvIPos = (modelMatrix * instanceMatrix[3]).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vGlow;\nvarying float vRune;\nvarying vec3 vIPos;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wave = pow(0.5 + 0.5 * sin(length(vIPos.xz) * 0.42 - uTime * 1.3), 10.0);
        float flick = 0.85 + 0.15 * sin(uTime * 3.1 + vIPos.x * 1.7 + vIPos.z * 2.3);
        totalEmissiveRadiance *= vRune * (0.22 + 1.1 * wave) * flick + vGlow;`);
  };
  wallMesh = new THREE.InstancedMesh(geo, mat, GW * GH);
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  wallMesh.frustumCulled = false;
  const tint = new THREE.Color();
  for(let i = 0; i < GW * GH; i++){
    const h = hash2(i, 31);
    tint.setRGB(0.78 + h * 0.3, 0.76 + h * 0.28, 0.82 + h * 0.3);
    wallMesh.setColorAt(i, tint);
  }
  const capGeo = new RoundedBoxGeometry(1.0, 0.07, 1.0, 1, 0.025);
  capMesh = new THREE.InstancedMesh(capGeo,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.7, 0.3), metalness: 0.85, roughness: 0.55, envMapIntensity: 0.5 }), GW * GH);
  capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  capMesh.castShadow = true; capMesh.frustumCulled = false;
  scene.add(wallMesh, capMesh);
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function writeWall(i){
  const x = i % GW, y = (i / GW) | 0;
  const e = wallH[i];
  const eased = e * e * (3 - 2 * e);
  const H = wallHeight(x, y) * eased;
  if(eased < 0.002) _s.set(0, 0, 0); else _s.set(1, H, 1);
  _m4.compose(_v.set(cellX(x), 0, cellZ(y)), _q.identity(), _s);
  wallMesh.setMatrixAt(i, _m4);
  _m4.compose(_v.set(cellX(x), H + 0.02, cellZ(y)), _q.identity(), _s.setScalar(eased > 0.002 ? 1 : 0));
  capMesh.setMatrixAt(i, _m4);
  wallGlowAttr.setX(i, wallGlow[i]);
}

/* ---------- boulders (the 1988 "Steen") ---------- */
const boulderGeos = [];
function makeBoulderGeos(){
  for(let k = 0; k < 4; k++){
    let g = new THREE.IcosahedronGeometry(0.36, 5);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.getAttribute('position');
    const col = [];
    for(let i = 0; i < p.count; i++){
      _v.fromBufferAttribute(p, i);
      const n = fbm3(_v.x * 2.4 + k * 5, _v.y * 2.4, _v.z * 2.4, 4);
      const s = 0.82 + 0.4 * n + 0.05 * vnoise3(_v.x * 12, _v.y * 12, _v.z * 12);
      _v.multiplyScalar(s);
      if(_v.y < -0.18) _v.y = -0.18 + (_v.y + 0.18) * 0.25;
      p.setXYZ(i, _v.x, _v.y, _v.z);
      const up = clamp((_v.y / 0.36) * 1.3 + (n - 0.5), 0, 1);
      const base = new THREE.Color(0.055, 0.05, 0.06).lerp(new THREE.Color(0.11, 0.095, 0.085), n);
      base.lerp(new THREE.Color(0.025, 0.07, 0.018), smooth(0.45, 0.85, up));
      col.push(base.r, base.g, base.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    boulderGeos.push(g);
  }
}
const boulderMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
const boulders = new Map();          // cell index -> { mesh, s, target }
function setBoulder(i, on){
  let b = boulders.get(i);
  if(on && !b){
    const mesh = new THREE.Mesh(boulderGeos[i % 4], boulderMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(cellX(i % GW), 0.2, cellZ((i / GW) | 0));
    mesh.rotation.y = hash2(i, 5) * TAU;
    mesh.scale.setScalar(0.0001);
    scene.add(mesh);
    b = { mesh, s: 0, target: 1, delay: 0 };
    boulders.set(i, b);
  } else if(b) b.target = on ? 1 : 0;
  return b;
}

/* ---------- braziers at the four corners of the walkway ---------- */
const braziers = [];
const fireUniforms = { uTime: { value: 0 }, uScale: { value: 400 } };
function makeBraziers(){
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3442, roughness: 0.85 });
  const bronze = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.5, 0.25), metalness: 1, roughness: 0.35 });
  const bowlPts = [];
  for(let i = 0; i <= 12; i++){ const t = i / 12; bowlPts.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI * 0.5) * 0.42, t * 0.32)); }
  const bowlGeo = new THREE.LatheGeometry(bowlPts, 32);
  const N = 110;
  const seeds = new Float32Array(N * 4);
  for(let i = 0; i < N * 4; i++) seeds[i] = Math.random();
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const fireMat = new THREE.ShaderMaterial({
    uniforms: fireUniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uScale;
      varying float vLife; varying float vEmber;
      void main(){
        float ember = step(0.86, aSeed.w);
        float rate = mix(1.1 + aSeed.w * 0.7, 0.35, ember);
        float life = fract(uTime * rate + aSeed.x);
        float ang = aSeed.y * 6.2831;
        float rad = mix(0.2 * (1.0 - life) * sqrt(aSeed.z), 0.1 + life * 0.5, ember);
        vec3 p;
        p.x = cos(ang) * rad + sin(uTime * 3.0 + aSeed.y * 20.0) * 0.05 * life;
        p.z = sin(ang) * rad + cos(uTime * 2.6 + aSeed.z * 20.0) * 0.05 * life;
        p.y = life * mix(0.75 + aSeed.z * 0.4, 3.2, ember);
        vLife = life; vEmber = ember;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float size = mix(0.3 * (1.0 - life * 0.65) + 0.05, 0.03, ember);
        gl_PointSize = uScale * size / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vLife; varying float vEmber;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        if(r2 > 1.0) discard;
        float a = pow(1.0 - r2, 1.6);
        vec3 col = mix(vec3(2.6, 1.8, 0.8), vec3(2.0, 0.55, 0.1), smoothstep(0.0, 0.45, vLife));
        col = mix(col, vec3(0.7, 0.1, 0.03), smoothstep(0.45, 1.0, vLife));
        col = mix(col, vec3(4.0, 1.6, 0.4), vEmber);
        float alpha = a * (1.0 - vLife) * mix(0.5, 1.0, vEmber);
        gl_FragColor = vec4(col * alpha, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const X = GW / 2 + 1.5, Z = GH / 2 + 1.5;
  for(const [x, z] of [[X, Z], [-X, Z], [X, -Z], [-X, -Z]]){
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.5, 20), stoneMat);
    ped.position.y = 0.75; ped.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 24), bronze);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.2;
    const bowl = new THREE.Mesh(bowlGeo, bronze);
    bowl.position.y = 1.48; bowl.castShadow = true;
    const fire = new THREE.Points(fg, fireMat);
    fire.position.y = 1.62; fire.frustumCulled = false;
    const light = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.22), 4, 10, 1.8);
    light.position.y = 2.1;
    g.add(ped, ring, bowl, fire, light);
    scene.add(g);
    braziers.push({ g, light, phase: Math.random() * 10 });
  }
}

/* ============================================================
   PARTICLES — one CPU pool for bursts, trails, dust and sparks
   ============================================================ */
const PMAX = 3000;
const P = {
  pos: new Float32Array(PMAX * 3), vel: new Float32Array(PMAX * 3),
  col: new Float32Array(PMAX * 4), size: new Float32Array(PMAX),
  life: new Float32Array(PMAX), ttl: new Float32Array(PMAX), drag: new Float32Array(PMAX), grav: new Float32Array(PMAX),
  base: new Float32Array(PMAX * 3), next: 0,
};
const pGeo = new THREE.BufferGeometry();
const pPosAttr = new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage);
const pColAttr = new THREE.BufferAttribute(P.col, 4).setUsage(THREE.DynamicDrawUsage);
const pSizeAttr = new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage);
pGeo.setAttribute('position', pPosAttr);
pGeo.setAttribute('aCol', pColAttr);
pGeo.setAttribute('aSize', pSizeAttr);
const pointUniforms = { uScale: fireUniforms.uScale };
const pMat = new THREE.ShaderMaterial({
  uniforms: pointUniforms,
  vertexShader: /* glsl */`
    attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
    void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`
    varying vec4 vCol;
    void main(){ vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; if(r2 > 1.0) discard;
      float a = exp(-r2 * 3.5) * 0.7 + exp(-r2 * 26.0) * 0.8;
      gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0); }`,
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
});
const pPoints = new THREE.Points(pGeo, pMat);
pPoints.frustumCulled = false;
scene.add(pPoints);
function emit(x, y, z, vx, vy, vz, r, g, b, size, ttl, drag = 1.5, grav = 0){
  const i = P.next; P.next = (P.next + 1) % PMAX;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.base[i * 3] = r; P.base[i * 3 + 1] = g; P.base[i * 3 + 2] = b;
  P.size[i] = size; P.life[i] = 0; P.ttl[i] = ttl; P.drag[i] = drag; P.grav[i] = grav;
}
function burst(x, y, z, n, col, speed, size, ttl, grav = 0){
  for(let k = 0; k < n; k++){
    const a = Math.random() * TAU, e = Math.random() * 2 - 1, s = speed * (0.35 + Math.random() * 0.8);
    const c = Math.sqrt(1 - e * e);
    emit(x, y, z, Math.cos(a) * c * s, Math.abs(e) * s * 0.9 + speed * 0.2, Math.sin(a) * c * s,
      col[0], col[1], col[2], size * (0.5 + Math.random()), ttl * (0.6 + Math.random() * 0.7), 2.2, grav);
  }
}
function updateParticles(dt){
  for(let i = 0; i < PMAX; i++){
    if(P.ttl[i] <= 0) continue;
    P.life[i] += dt;
    const k = P.life[i] / P.ttl[i];
    if(k >= 1){ P.ttl[i] = 0; P.col[i * 4 + 3] = 0; continue; }
    const d = Math.exp(-P.drag[i] * dt);
    P.vel[i * 3] *= d; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * d - P.grav[i] * dt; P.vel[i * 3 + 2] *= d;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
    const tw = 0.75 + 0.25 * Math.sin(P.life[i] * 30 + i);
    P.col[i * 4] = P.base[i * 3]; P.col[i * 4 + 1] = P.base[i * 3 + 1]; P.col[i * 4 + 2] = P.base[i * 3 + 2];
    P.col[i * 4 + 3] = fade * tw;
  }
  pPosAttr.needsUpdate = true; pColAttr.needsUpdate = true; pSizeAttr.needsUpdate = true;
}

/* GPU fireflies drifting over the maze */
function makeFireflies(){
  const N = 240;
  const base = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for(let i = 0; i < N; i++){
    base[i * 3] = (Math.random() - 0.5) * (FW + 6);
    base[i * 3 + 1] = 0.3 + Math.random() * 2.6;
    base[i * 3 + 2] = (Math.random() - 0.5) * (FH + 6);
    for(let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: fireUniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uScale; varying float vA; varying float vHue;
      void main(){
        vec3 p = position;
        float t = uTime * (0.25 + aSeed.x * 0.3);
        p.x += sin(t + aSeed.y * 40.0) * 1.3 + sin(t * 2.3 + aSeed.z * 10.0) * 0.4;
        p.z += cos(t * 0.9 + aSeed.z * 30.0) * 1.3 + sin(t * 1.7 + aSeed.x * 20.0) * 0.4;
        p.y += sin(t * 1.4 + aSeed.w * 25.0) * 0.35;
        vA = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed.w * 2.0) + aSeed.y * 40.0), 5.0);
        vHue = aSeed.z;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.07 / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vHue;
      void main(){ vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; if(r2 > 1.0) discard;
        vec3 col = mix(vec3(2.2, 3.2, 0.9), vec3(0.8, 3.0, 2.4), vHue);
        gl_FragColor = vec4(col * (exp(-r2 * 5.0) * vA), 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
}

/* ============================================================
   ITEMS — ruby hearts, emerald clovers, golden smileys
   ============================================================ */
const items = [];
const itemAt = new Int16Array(GW * GH).fill(-1);
let heartGeo, clubGeo, smileyProto;
const haloTex = glowSprite();
const itemMats = {};
const reflGemMats = {
  [HEART]: new THREE.MeshStandardMaterial({ color: 0x300008, emissive: new THREE.Color(1.6, 0.05, 0.2), roughness: 0.1, flatShading: true }),
  [CLUB]: new THREE.MeshStandardMaterial({ color: 0x00300c, emissive: new THREE.Color(0.1, 1.3, 0.4), roughness: 0.1, flatShading: true }),
};

function outlineFromRadial(inside, cx, cy, n){
  const pts = [];
  for(let i = 0; i < n; i++){
    const a = i / n * TAU;
    let lo = 0, hi = 3;
    for(let k = 0; k < 28; k++){ const m = (lo + hi) / 2; if(inside(cx + Math.cos(a) * m, cy + Math.sin(a) * m)) lo = m; else hi = m; }
    pts.push(new THREE.Vector2(cx + Math.cos(a) * lo, cy + Math.sin(a) * lo));
  }
  return pts;
}
function gemGeometry(pts, scale){
  const shape = new THREE.Shape(pts);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05 / scale, bevelEnabled: true, bevelThickness: 0.1 / scale, bevelSize: 0.075 / scale,
    bevelSegments: 1, curveSegments: 4, steps: 1,
  });
  g.scale(scale, scale, scale);
  g.center();
  g.computeVertexNormals();
  return g;
}
function makeItemAssets(){
  const heartPts = [];
  for(let i = 0; i < 90; i++){
    const t = i / 90 * TAU;
    heartPts.push(new THREE.Vector2(16 * Math.pow(Math.sin(t), 3), 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
  }
  heartGeo = gemGeometry(heartPts, 0.0125);
  const inClub = (x, y) =>
    Math.hypot(x, y - 0.55) < 0.5 || Math.hypot(x + 0.52, y + 0.02) < 0.5 || Math.hypot(x - 0.52, y + 0.02) < 0.5 ||
    (y < 0.1 && y > -0.95 && Math.abs(x) < 0.09 + (-y + 0.1) * 0.2) || Math.hypot(x, y) < 0.3;
  clubGeo = gemGeometry(outlineFromRadial(inClub, 0, 0.1, 220), 0.2);

  itemMats[HEART] = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1.0, 0.04, 0.1), metalness: 0, roughness: 0.02, transmission: 0.92, thickness: 0.45, ior: 2.1,
    attenuationColor: new THREE.Color(0.7, 0.0, 0.04), attenuationDistance: 0.14,
    emissive: new THREE.Color(0.8, 0.0, 0.05), emissiveIntensity: 0.35, dispersion: 0.4, clearcoat: 1, clearcoatRoughness: 0.03,
    specularIntensity: 1, envMapIntensity: 1.6, flatShading: true,
  });
  itemMats[CLUB] = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.05, 1.0, 0.3), metalness: 0, roughness: 0.02, transmission: 0.92, thickness: 0.45, ior: 1.9,
    attenuationColor: new THREE.Color(0.0, 0.45, 0.1), attenuationDistance: 0.16,
    emissive: new THREE.Color(0.0, 0.6, 0.18), emissiveIntensity: 0.35, dispersion: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 1.6, flatShading: true,
  });
  const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.76, 0.3), metalness: 1, roughness: 0.2,
    emissive: new THREE.Color(0.35, 0.18, 0.02), emissiveIntensity: 0.6, envMapIntensity: 1.5 });
  const obsidian = new THREE.MeshPhysicalMaterial({ color: 0x0a0612, roughness: 0.1, clearcoat: 1, metalness: 0.2,
    emissive: new THREE.Color(0.5, 0.05, 0.9), emissiveIntensity: 0.9 });
  smileyProto = () => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 24), gold);
    ball.castShadow = true; g.add(ball);
    for(const s of [-1, 1]){
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), obsidian);
      e.position.set(s * 0.068, 0.055, 0.172); e.scale.set(1, 1.55, 0.6); g.add(e);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 24, Math.PI), obsidian);
    mouth.rotation.z = Math.PI; mouth.position.set(0, -0.005, 0.166); mouth.rotation.x = -0.2; g.add(mouth);
    return g;
  };
}
const ITEM_GLOW = {
  [HEART]: new THREE.Color(2.4, 0.2, 0.45),
  [CLUB]: new THREE.Color(0.3, 2.2, 0.8),
  [SMILEY]: new THREE.Color(1.4, 0.35, 2.4),
};
function spawnItem(type, cell = -1, delay = 0){
  if(cell < 0) cell = randomFreeCell();
  if(cell < 0) return null;
  const x = cell % GW, y = (cell / GW) | 0;
  const g = new THREE.Group();
  let gem;
  if(type === SMILEY) gem = smileyProto();
  else { gem = new THREE.Mesh(type === HEART ? heartGeo : clubGeo, itemMats[type]); gem.castShadow = true; }
  g.add(gem);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: ITEM_GLOW[type].clone().multiplyScalar(0.35),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  halo.scale.setScalar(1.25);
  g.add(halo);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({
    map: haloTex, color: ITEM_GLOW[type].clone().multiplyScalar(0.3), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(cellX(x), 0.012, cellZ(y));
  scene.add(pool);
  reflectHide.push(pool);
  g.position.set(cellX(x), 0.42, cellZ(y));
  g.scale.setScalar(0.0001);
  scene.add(g);
  const it = { type, cell, g, gem, halo, pool, t: -delay, state: 'spawn', phase: Math.random() * TAU, eatT: 0, sparkT: 0 };
  items.push(it);
  itemAt[cell] = items.length - 1;
  reindexItems();
  return it;
}
function reindexItems(){
  itemAt.fill(-1);
  items.forEach((it, i) => { if(it.state !== 'eaten' && it.state !== 'gone') itemAt[it.cell] = i; });
}
function removeItem(it){
  it.state = 'gone';
  scene.remove(it.g); scene.remove(it.pool);
  const k = reflectHide.indexOf(it.pool); if(k >= 0) reflectHide.splice(k, 1);
  it.halo.material.dispose(); it.pool.material.dispose(); it.pool.geometry.dispose();
  items.splice(items.indexOf(it), 1);
  reindexItems();
}
function countItems(type){ return items.filter(i => i.type === type && (i.state === 'idle' || i.state === 'spawn')).length; }
function updateItems(dt, t){
  for(let i = items.length - 1; i >= 0; i--){
    const it = items[i];
    it.t += dt;
    if(it.t < 0) continue;
    const bob = Math.sin(t * 1.6 + it.phase) * 0.06;
    if(it.state === 'spawn'){
      const k = clamp(it.t / 0.9, 0, 1);
      const el = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.25;
      it.g.scale.setScalar(Math.max(0.0001, el));
      it.pool.material.opacity = k;
      if(Math.random() < 0.6){
        const a = Math.random() * TAU, r = 0.5 * (1 - k) + 0.1;
        const c = ITEM_GLOW[it.type];
        emit(it.g.position.x + Math.cos(a) * r, 0.05 + k * 0.5, it.g.position.z + Math.sin(a) * r, 0, 0.9, 0, c.r, c.g, c.b, 0.07, 0.7, 1, 0);
      }
      if(k >= 1) it.state = 'idle';
    }
    if(it.state === 'idle' || it.state === 'spawn'){
      it.g.position.y = 0.44 + bob;
      if(it.type === SMILEY){
        it.gem.rotation.y = Math.sin(t * 0.9 + it.phase) * 0.8;
        it.gem.rotation.z = Math.sin(t * 1.3 + it.phase) * 0.12;
      } else {
        it.gem.rotation.y = t * 1.1 + it.phase;
        it.gem.rotation.z = Math.sin(t * 0.8 + it.phase) * 0.1;
      }
      it.halo.material.opacity = 0.75 + 0.25 * Math.sin(t * 3 + it.phase);
      it.sparkT -= dt;
      if(it.sparkT < 0){
        it.sparkT = 0.25 + Math.random() * 0.5;
        const c = ITEM_GLOW[it.type];
        emit(it.g.position.x + (Math.random() - 0.5) * 0.4, it.g.position.y + (Math.random() - 0.3) * 0.3, it.g.position.z + (Math.random() - 0.5) * 0.4,
          0, 0.35, 0, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.05, 1.2, 0.5, 0);
      }
    } else if(it.state === 'eaten'){
      it.eatT += dt;
      const k = clamp(it.eatT / 0.2, 0, 1);
      it.g.position.lerp(SN.mouth, 0.35);
      it.g.scale.setScalar(Math.max(0.0001, 1 - k));
      it.pool.material.opacity = 1 - k;
      if(k >= 1) removeItem(it);
    } else if(it.state === 'poof'){
      it.eatT += dt;
      const k = clamp(it.eatT / 0.5, 0, 1);
      it.g.scale.setScalar(Math.max(0.0001, 1 - k));
      it.g.position.y += dt * 0.8;
      it.pool.material.opacity = 1 - k;
      if(k >= 1) removeItem(it);
    }
  }
}

/* ============================================================
   LEVELS — the 1988 layouts, re-cut for a 30x18 court
   ============================================================ */
function segCells(out, x1, y1, x2, y2, v = WALL){
  for(let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for(let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) out[gi(x, y)] = v;
}
const LAYOUTS = [
  // 1: the open court (1988 level 1), a few pillars and boulders
  (g) => {
    for(const [x, y] of [[8, 5], [23, 5], [8, 14], [23, 14]]) g[gi(x, y)] = WALL;
    for(const [x, y] of [[4, 9], [27, 10], [15, 3], [16, 16]]) g[gi(x, y)] = STONE;
  },
  // 2: broken lines with crossings (spirit of BASIC 1230)
  (g) => {
    segCells(g, 1, 6, 12, 6); segCells(g, 19, 13, 30, 13);
    segCells(g, 6, 9, 6, 16); segCells(g, 25, 3, 25, 10);
    segCells(g, 3, 12, 9, 12); segCells(g, 22, 7, 28, 7);
    segCells(g, 12, 14, 18, 14); segCells(g, 13, 4, 19, 4);
    segCells(g, 15, 8, 15, 11); segCells(g, 12, 9, 18, 9);
    g[gi(6, 12)] = WALL; g[gi(25, 7)] = WALL;
  },
  // 3: zigzag rows of stones (spirit of BASIC 1400)
  (g) => {
    for(let x = 3; x <= 28; x += 2){
      g[gi(x, 4 + ((x >> 1) & 1))] = STONE;
      g[gi(x, 14 + (((x >> 1) + 1) & 1))] = STONE;
    }
    for(const [x, y] of [[7, 9], [11, 10], [20, 9], [24, 10]]) g[gi(x, y)] = STONE;
    for(const [x, y] of [[15, 7], [16, 12]]) g[gi(x, y)] = WALL;
  },
  // 4: halls divided by walls with doorways (spirit of BASIC 1500)
  (g) => {
    segCells(g, 10, 1, 10, 18); segCells(g, 21, 1, 21, 18);
    segCells(g, 1, 6, 30, 6); segCells(g, 1, 13, 30, 13);
    for(const x of [10, 21]) for(const y of [3, 9, 16]) segCells(g, x, y, x, y + 1, 0);
    for(const y of [6, 13]) for(const x of [4, 15, 26]) segCells(g, x, y, x + 1, y, 0);
  },
];
let levelIndex = 0;
function layoutGrid(n){
  const g = new Uint8Array(GW * GH);
  for(let x = 0; x < GW; x++){ g[gi(x, 0)] = WALL; g[gi(x, GH - 1)] = WALL; }
  for(let y = 0; y < GH; y++){ g[gi(0, y)] = WALL; g[gi(GW - 1, y)] = WALL; }
  LAYOUTS[n % LAYOUTS.length](g);
  return g;
}
/* morph the board into another layout: old walls sink, new ones rise in a
   ripple from the snake outward, waiting politely while a body lies there */
function applyLayout(n, animated){
  const ng = layoutGrid(n);
  const [hx, hy] = headCell();
  for(let i = 0; i < GW * GH; i++){
    const x = i % GW, y = (i / GW) | 0;
    const d = Math.hypot(x - hx, y - hy);
    const was = grid[i], now = ng[i];
    if(now === WALL){ wallTarget[i] = 1; wallDelay[i] = animated ? 0.4 + d * 0.06 : 0; }
    else { wallTarget[i] = 0; wallDelay[i] = animated ? d * 0.03 : 0; }
    if(!animated){ wallH[i] = wallTarget[i]; wallDelay[i] = 0; }
    if(now === STONE && was !== STONE){ const b = setBoulder(i, true); b.delay = animated ? 0.6 + d * 0.06 : 0; if(!animated){ b.s = 1; b.mesh.scale.setScalar(1); } }
    if(now !== STONE && was === STONE) setBoulder(i, false);
    grid[i] = now;
    if(now !== 0 && itemAt[i] >= 0){ const it = items[itemAt[i]]; it.state = 'poof'; it.eatT = 0; }
  }
  reindexItems();
  for(let i = 0; i < GW * GH; i++) writeWall(i);
  wallMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true; wallGlowAttr.needsUpdate = true;
  if(animated) truncatePlan();
}
function updateWalls(dt){
  let dirty = false;
  const occ = occupiedCells();
  for(let i = 0; i < GW * GH; i++){
    if(wallGlow[i] > 0){ wallGlow[i] = Math.max(0, wallGlow[i] - dt * 0.8); dirty = true; }
    if(wallH[i] === wallTarget[i]){ continue; }
    if(wallDelay[i] > 0){ wallDelay[i] -= dt; continue; }
    if(wallTarget[i] > wallH[i] && occ.has(i)) continue;       // a snake lies here: wait
    const was = wallH[i];
    wallH[i] = wallTarget[i] > wallH[i] ? Math.min(1, wallH[i] + dt / 1.1) : Math.max(0, wallH[i] - dt / 0.8);
    if(was === 0 && wallTarget[i] > 0){
      wallGlow[i] = 3;
      const x = cellX(i % GW), z = cellZ((i / GW) | 0);
      for(let k = 0; k < 10; k++) emit(x + (Math.random() - 0.5), 0.05, z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.5, 0.42, 0.36, 0.09, 1.1, 2.5, 0.3);
      for(let k = 0; k < 6; k++) emit(x + (Math.random() - 0.5) * 0.8, Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, 0.4, 2.2, 1.6, 0.05, 1.3, 1, 0);
    }
    if(was > 0 && wallTarget[i] === 0 && Math.random() < dt * 20){
      const x = cellX(i % GW), z = cellZ((i / GW) | 0);
      emit(x + (Math.random() - 0.5), 0.05, z + (Math.random() - 0.5), (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.45, 0.4, 0.38, 0.1, 1, 2, 0.2);
    }
    dirty = true;
    writeWall(i);
  }
  for(const [i, b] of boulders){
    if(b.delay > 0){ b.delay -= dt; continue; }
    if(b.s === b.target) continue;
    if(b.target > b.s && occ.has(i)) continue;
    b.s = b.target > b.s ? Math.min(1, b.s + dt / 0.7) : Math.max(0, b.s - dt / 0.5);
    const e = b.target ? 1 - Math.pow(1 - b.s, 3) + Math.sin(b.s * Math.PI) * 0.2 : b.s;
    b.mesh.scale.setScalar(Math.max(0.0001, e));
    b.mesh.position.y = 0.2 + (1 - b.s) * (b.target ? 0.8 : -0.2);
    if(b.s === 0 && !b.target){ scene.remove(b.mesh); boulders.delete(i); }
  }
  if(dirty){
    for(let i = 0; i < GW * GH; i++) if(wallGlow[i] > 0) wallGlowAttr.setX(i, wallGlow[i]);
    wallMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true; wallGlowAttr.needsUpdate = true;
  }
}

/* ============================================================
   THE SERPENT — path, planner, lofted body, head
   ============================================================ */
const SN = {
  len: 6.5, maxLen: 12.5,
  headS: 0, speed: 1.2, base: 1.4,
  lift: 0, liftTarget: 0, rearT: 0,
  yaw: 0, jaw: 0, jawTarget: 0,
  tongueT: 9, nextTongue: 1.5,
  swallowT: 0, strike: false,
  waveS: -99, waveAmp: 0, waveColor: new THREE.Color(1, 0.2, 0.3),
  mouth: new THREE.Vector3(), headPos: new THREE.Vector3(), headFwd: new THREE.Vector3(0, 0, -1),
  eaten: 0, score: 0,
};

/* ---------- path: a Catmull-Rom through planned cells plus a serpentine
   lateral wave that is FIXED in space, so every body point follows the
   head's exact track — true lateral undulation ---------- */
const ctrl = [];                 // planned cells [{x, y}]
const seg = [];                  // per generated segment: state to resume from
const PX = [], PZ = [], PS = []; // final path samples + arc length
let genSeg = 0;
const PATH = { baseS: 0, amp: 0.09, lbx: 0, lbz: 0, ltx: 0, ltz: 1, lfx: 0, lfz: 0 };
const WAVE_LEN = 1.9, WAVE_AMP = 0.095, SUB = 24;

function cr(p0, p1, p2, p3, t){
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function crd(p0, p1, p2, p3, t){
  const t2 = t * t;
  return 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
}
function genSegments(){
  while(genSeg + 2 < ctrl.length){
    const i = genSeg;
    const c1 = ctrl[i], c2 = ctrl[i + 1], c3 = ctrl[i + 2];
    const c0 = i > 0 ? ctrl[i - 1] : { x: 2 * c1.x - c2.x, y: 2 * c1.y - c2.y };
    const x0 = cellX(c0.x), x1 = cellX(c1.x), x2 = cellX(c2.x), x3 = cellX(c3.x);
    const z0 = cellZ(c0.y), z1 = cellZ(c1.y), z2 = cellZ(c2.y), z3 = cellZ(c3.y);
    if(PX.length === 0){
      PX.push(x1); PZ.push(z1); PS.push(0);
      Object.assign(PATH, { lbx: x1, lbz: z1, lfx: x1, lfz: z1, baseS: 0 });
    }
    seg[i] = { pi: PX.length, s: PS[PS.length - 1], st: Object.assign({}, PATH) };
    for(let k = 1; k <= SUB; k++){
      const t = k / SUB;
      const bx = cr(x0, x1, x2, x3, t), bz = cr(z0, z1, z2, z3, t);
      let tx = crd(x0, x1, x2, x3, t), tz = crd(z0, z1, z2, z3, t);
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const ds = Math.hypot(bx - PATH.lbx, bz - PATH.lbz);
      PATH.baseS += ds;
      const turn = Math.abs(Math.atan2(PATH.ltx * tz - PATH.ltz * tx, PATH.ltx * tx + PATH.ltz * tz));
      const kappa = ds > 1e-5 ? turn / ds : 0;
      const target = WAVE_AMP * clamp(1 - kappa * 0.55, 0.12, 1);
      PATH.amp += (target - PATH.amp) * Math.min(1, ds / 0.3);
      const off = PATH.amp * Math.sin(PATH.baseS * TAU / WAVE_LEN);
      const fx = bx - tz * off, fz = bz + tx * off;
      const fs = PS[PS.length - 1] + Math.hypot(fx - PATH.lfx, fz - PATH.lfz);
      PX.push(fx); PZ.push(fz); PS.push(fs);
      PATH.lbx = bx; PATH.lbz = bz; PATH.ltx = tx; PATH.ltz = tz; PATH.lfx = fx; PATH.lfz = fz;
    }
    genSeg++;
  }
}
function pathEnd(){ return PS.length ? PS[PS.length - 1] : 0; }
/* position on the path at arc length s (clamped), written into out {x, z} */
let lookHint = 0;
function pathAt(s, out){
  const n = PS.length;
  if(s <= PS[0]){ out.x = PX[0]; out.z = PZ[0]; return out; }
  if(s >= PS[n - 1]){ out.x = PX[n - 1]; out.z = PZ[n - 1]; return out; }
  let i = lookHint;
  if(i >= n - 1 || PS[i] > s || PS[i + 1] < s){
    let lo = 0, hi = n - 1;
    while(hi - lo > 1){ const m = (lo + hi) >> 1; if(PS[m] <= s) lo = m; else hi = m; }
    i = lo;
  }
  while(i > 0 && PS[i] > s) i--;
  while(i < n - 2 && PS[i + 1] < s) i++;
  lookHint = i;
  const k = (s - PS[i]) / Math.max(1e-6, PS[i + 1] - PS[i]);
  out.x = PX[i] + (PX[i + 1] - PX[i]) * k;
  out.z = PZ[i] + (PZ[i + 1] - PZ[i]) * k;
  return out;
}
function segAt(s){
  let lo = 0, hi = genSeg - 1;
  if(hi < 0) return 0;
  while(lo < hi){ const m = (lo + hi + 1) >> 1; if(seg[m].s <= s) lo = m; else hi = m - 1; }
  return lo;
}
function headCell(){ const h = segAt(SN.headS); const c = ctrl[Math.min(ctrl.length - 1, h + 1)] || { x: 15, y: 10 }; return [c.x, c.y]; }
/* drop the not-yet-travelled plan beyond the next couple of cells */
function truncatePlan(){
  const h = segAt(SN.headS);
  const keepSeg = Math.min(genSeg - 1, h + 1);
  if(keepSeg + 1 >= genSeg) { ctrl.length = Math.min(ctrl.length, keepSeg + 3); return; }
  const cut = seg[keepSeg + 1];
  PX.length = cut.pi; PZ.length = cut.pi; PS.length = cut.pi;
  Object.assign(PATH, cut.st);
  genSeg = keepSeg + 1;
  seg.length = genSeg;
  ctrl.length = keepSeg + 3;
}
function trimHistory(){
  if(PX.length < 30000) return;
  const keepFrom = SN.headS - SN.maxLen - 6;
  let sc = 0;
  while(sc < genSeg - 4 && seg[sc + 1].s < keepFrom) sc++;
  if(sc < 50) return;
  const pi = seg[sc].pi;
  PX.splice(0, pi); PZ.splice(0, pi); PS.splice(0, pi);
  seg.splice(0, sc); ctrl.splice(0, sc);
  for(const s of seg) s.pi -= pi;
  genSeg -= sc;
  lookHint = 0;
}

/* ---------- planner: time-expanded BFS (a body cell k steps behind the
   head frees up once the head has moved Lc-k more cells) ---------- */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const bfsDist = new Int16Array(GW * GH), bfsPrev = new Int16Array(GW * GH), freeAt = new Int16Array(GW * GH), bfsQ = new Int16Array(GW * GH);
const blocked = (c) => grid[c] !== 0 || (itemAt[c] >= 0 && items[itemAt[c]].type === SMILEY);
function bodyFreeAt(cells){
  freeAt.fill(0);
  const Lc = Math.ceil(SN.len) + 2;
  for(let k = 1; k <= Lc && cells.length - 1 - k >= 0; k++){
    const c = cells[cells.length - 1 - k];
    const ci = gi(c.x, c.y);
    freeAt[ci] = Math.max(freeAt[ci], Lc - k + 1);
  }
}
function bfs(start){
  bfsDist.fill(-1);
  let qh = 0, qt = 0;
  bfsQ[qt++] = start; bfsDist[start] = 0; bfsPrev[start] = -1;
  while(qh < qt){
    const c = bfsQ[qh++];
    const x = c % GW, y = (c / GW) | 0, d = bfsDist[c] + 1;
    for(const [dx, dy] of DIRS){
      const nx = x + dx, ny = y + dy;
      if(!inside(nx, ny)) continue;
      const n = gi(nx, ny);
      if(bfsDist[n] >= 0 || blocked(n) || d < freeAt[n]) continue;
      bfsDist[n] = d; bfsPrev[n] = c; bfsQ[qt++] = n;
    }
  }
  return qt;
}
function routeTo(goal){
  const out = [];
  for(let c = goal; c >= 0 && bfsDist[c] > 0; c = bfsPrev[c]) out.push({ x: c % GW, y: (c / GW) | 0 });
  return out.reverse();
}
/* would the snake still have room to breathe after taking this route? */
function roomAfter(route){
  const cells = ctrl.slice(-Math.ceil(SN.len) - 3).concat(route);
  bodyFreeAt(cells);
  const end = route[route.length - 1];
  return bfs(gi(end.x, end.y));
}
let planTarget = -1;
function planMore(){
  const last = ctrl[ctrl.length - 1];
  const start = gi(last.x, last.y);
  bodyFreeAt(ctrl);
  bfs(start);
  const Lc = Math.ceil(SN.len) + 2;
  const cands = [];
  for(const it of items){
    if(it.type === SMILEY || it.state === 'eaten' || it.state === 'gone' || it.state === 'poof') continue;
    const d = bfsDist[it.cell];
    if(d > 0) cands.push({ c: it.cell, score: d - (it.type === HEART ? 3 : 0) + (it.cell === planTarget ? -4 : 0) });
  }
  cands.sort((a, b) => a.score - b.score);
  const dist = bfsDist.slice();
  const prev = bfsPrev.slice();
  for(const cand of cands.slice(0, 6)){
    bfsDist.set(dist); bfsPrev.set(prev);
    const route = routeTo(cand.c);
    if(!route.length) continue;
    if(roomAfter(route) >= Lc + 6){ planTarget = cand.c; pushRoute(route); return true; }
  }
  // nothing tasty and safe: wander to the roomiest reachable cell a few steps out
  bfsDist.set(dist); bfsPrev.set(prev);
  let best = -1, bestScore = -1;
  for(let c = 0; c < GW * GH; c++){
    const d = dist[c];
    if(d < 2 || d > 9) continue;
    const s = d + Math.random() * 4;
    if(s > bestScore){ bestScore = s; best = c; }
  }
  if(best >= 0){
    const route = routeTo(best).slice(0, 4);
    if(route.length && roomAfter(route) >= Lc){ pushRoute(route); return true; }
    bfsDist.set(dist); bfsPrev.set(prev);
    const r2 = routeTo(best).slice(0, 2);
    if(r2.length){ pushRoute(r2); return true; }
  }
  // truly boxed in: slip through its own coils (a dream is allowed this)
  for(const [dx, dy] of DIRS){
    const nx = last.x + dx, ny = last.y + dy;
    const prevC = ctrl[ctrl.length - 2];
    if(inside(nx, ny) && !blocked(gi(nx, ny)) && !(prevC && prevC.x === nx && prevC.y === ny)){ pushRoute([{ x: nx, y: ny }]); return true; }
  }
  return false;
}
function pushRoute(route){ for(const c of route) ctrl.push(c); genSegments(); }
function ensureAhead(dist){
  let guard = 0;
  while(pathEnd() - SN.headS < dist && guard++ < 12) if(!planMore()) break;
}
function occupiedCells(){
  const set = new Set();
  const h = segAt(SN.headS);
  const back = Math.ceil(SN.len) + 2;
  for(let i = Math.max(0, h - back); i < Math.min(ctrl.length, h + 4); i++) set.add(gi(ctrl[i].x, ctrl[i].y));
  return set;
}
function initSnake(){
  const hist = [];
  for(let x = 6; x <= 14; x++) hist.push({ x, y: 16 });
  for(let y = 15; y >= 11; y--) hist.push({ x: 14, y });
  for(const c of hist) ctrl.push(c);
  genSegments();
  SN.headS = seg[Math.min(genSeg - 1, 11)].s;
}

/* ---------- body mesh ---------- */
const RS = 30, RV = RS + 1, MAXR = 440, RING_STEP = 0.032;
const body = {
  pos: new Float32Array(MAXR * RV * 3), nor: new Float32Array(MAXR * RV * 3), uv: new Float32Array(MAXR * RV * 2),
  cx: new Float32Array(MAXR), cy: new Float32Array(MAXR), cz: new Float32Array(MAXR), r: new Float32Array(MAXR),
  cosA: new Float32Array(RV), sinA: new Float32Array(RV),
};
let bodyGeo, bodyMesh, bodyMat, headGroup, jawGroup, tongue, fangs = [], eyes = [];
const bodyUniforms = { uWaveS: { value: -99 }, uWaveAmp: { value: 0 }, uWaveColor: { value: SN.waveColor }, uGlowBase: { value: 0.12 } };
function makeSnake(){
  for(let k = 0; k < RV; k++){ const a = k / RS * TAU; body.cosA[k] = Math.cos(a); body.sinA[k] = Math.sin(a); }
  for(let i = 0; i < MAXR; i++) for(let k = 0; k < RV; k++){
    const o = (i * RV + k) * 2;
    body.uv[o] = i * RING_STEP / SKIN_LEN; body.uv[o + 1] = k / RS;
  }
  const idx = [];
  for(let i = 0; i < MAXR - 1; i++) for(let k = 0; k < RS; k++){
    const a = i * RV + k, b = a + 1, c = a + RV, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(body.pos, 3).setUsage(THREE.DynamicDrawUsage));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(body.nor, 3).setUsage(THREE.DynamicDrawUsage));
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(body.uv, 2));
  bodyGeo.setIndex(idx);
  const skin = bodySkin();
  bodyMat = new THREE.MeshPhysicalMaterial({
    map: skin.map, normalMap: skin.normalMap, roughnessMap: skin.roughnessMap, emissiveMap: skin.emissiveMap,
    emissive: new THREE.Color(1.0, 0.72, 0.25), emissiveIntensity: 1,
    normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 0,
    clearcoat: 0.75, clearcoatRoughness: 0.22,
    iridescence: 0.6, iridescenceIOR: 1.32, iridescenceThicknessRange: [160, 520],
    sheen: 0.35, sheenColor: new THREE.Color(0.2, 0.9, 0.45), sheenRoughness: 0.5,
    envMapIntensity: 1.25,
  });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bodyUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyD;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBodyD = uv.x * ${SKIN_LEN.toFixed(3)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyD;\nuniform float uWaveS, uWaveAmp, uGlowBase;\nuniform vec3 uWaveColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wv = exp(-pow((vBodyD - uWaveS) * 1.7, 2.0)) * uWaveAmp;
        totalEmissiveRadiance = totalEmissiveRadiance * uGlowBase + totalEmissiveRadiance.g * uWaveColor * wv * 1.2;`);
  };
  bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  scene.add(bodyMesh);
  makeHead();
}

/* the head: a lofted upper skull + a hinged lower jaw, both closed shells
   that meet along the lip line, plus eyes, fangs and a forked tongue */
const HEAD_SECT = [       // z, half-width, crown height above the lip line, jaw depth below it
  [-0.32, 0.140, 0.108, 0.090],
  [-0.24, 0.184, 0.120, 0.089],
  [-0.14, 0.200, 0.124, 0.083],
  [-0.04, 0.192, 0.120, 0.076],
  [ 0.06, 0.175, 0.113, 0.068],
  [ 0.16, 0.150, 0.101, 0.057],
  [ 0.25, 0.121, 0.086, 0.045],
  [ 0.32, 0.089, 0.069, 0.034],
  [ 0.37, 0.057, 0.050, 0.023],
  [ 0.40, 0.020, 0.026, 0.010],
];
function headSection(z){
  const S = HEAD_SECT;
  if(z <= S[0][0]) return S[0].slice(1);
  for(let i = 0; i < S.length - 1; i++){
    if(z <= S[i + 1][0]){
      const t = (z - S[i][0]) / (S[i + 1][0] - S[i][0]);
      const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
      return [1, 2, 3].map(k => cr(p0[k], p1[k], p2[k], p3[k], t));
    }
  }
  return S[S.length - 1].slice(1);
}
function loft(zs, profile, seamU){
  const N = 34, pos = [], uv = [], idx = [];
  const z0 = zs[0], z1 = zs[zs.length - 1];
  for(let j = 0; j < zs.length; j++){
    for(let s = 0; s <= N; s++){
      const t = s / N;
      const [x, y] = profile(zs[j], t);
      pos.push(x, y, zs[j]);
      uv.push((zs[j] - z0) / (z1 - z0) * seamU, t);
    }
  }
  for(let j = 0; j < zs.length - 1; j++) for(let s = 0; s < N; s++){
    const a = j * (N + 1) + s, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const EYE = { z: 0.105, y: 0.06 };
function makeHead(){
  const zs = [];
  for(let i = 0; i <= 44; i++){ const t = i / 44; zs.push(lerp(-0.32, 0.4, 1 - Math.pow(1 - t, 1.35))); }
  const SE = 2 / 3.2;
  // upper skull: from the left lip over the crown to the right lip
  const upper = loft(zs, (z, t) => {
    const [w, h] = headSection(z);
    const th = Math.PI * (1 - t);
    const c = Math.cos(th), s = Math.sin(th);
    let x = Math.sign(c) * Math.pow(Math.abs(c), SE) * w;
    let y = Math.pow(Math.abs(s), SE) * h;
    // brow ridges over the eyes and a soft groove between them
    const brow = Math.exp(-(((z - EYE.z) / 0.07) ** 2)) * Math.exp(-(((Math.abs(x) - w * 0.72) / 0.05) ** 2));
    y += brow * 0.016;
    y -= Math.exp(-((x / 0.05) ** 2)) * Math.exp(-(((z - 0.16) / 0.12) ** 2)) * 0.008;
    x *= 1 + brow * 0.03;
    return [x, y];
  }, 1);
  // palate (roof of the mouth), spanning lip to lip under the skull
  const palate = loft(zs, (z, t) => {
    const [w, h] = headSection(z);
    return [w * (1 - 2 * t) * 0.985, Math.sin(Math.PI * t) * h * 0.35];
  }, 1);
  const jawZ = zs.map(z => z * 0.965);
  const lower = loft(jawZ, (z, t) => {
    const [w, , d] = headSection(z / 0.965);
    const th = Math.PI + Math.PI * t;
    const c = Math.cos(th), s = Math.sin(th);
    return [-Math.sign(c) * Math.pow(Math.abs(c), SE) * w * 0.975, -Math.pow(Math.abs(s), SE) * d];
  }, 1);
  const mouthFloor = loft(jawZ, (z, t) => {
    const [w, , d] = headSection(z / 0.965);
    return [-w * 0.975 * (1 - 2 * t), -Math.sin(Math.PI * t) * d * 0.4];
  }, 1);
  const hs = headSkin(), js = jawSkin();
  const headMat = new THREE.MeshPhysicalMaterial({
    map: hs.map, normalMap: hs.normalMap, roughnessMap: hs.roughnessMap, emissiveMap: hs.emissiveMap,
    emissive: new THREE.Color(1.0, 0.72, 0.25), emissiveIntensity: 0.14,
    roughness: 1, clearcoat: 0.8, clearcoatRoughness: 0.2,
    iridescence: 0.55, iridescenceIOR: 1.32, iridescenceThicknessRange: [160, 520],
    sheen: 0.3, sheenColor: new THREE.Color(0.2, 0.9, 0.45), envMapIntensity: 1.25, side: THREE.DoubleSide,
  });
  const jawMat = new THREE.MeshPhysicalMaterial({
    map: js.map, normalMap: js.normalMap, roughnessMap: js.roughnessMap, roughness: 1,
    clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
  const mouthMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.05, 0.08), roughness: 0.35,
    emissive: new THREE.Color(0.1, 0.005, 0.015), side: THREE.DoubleSide });
  headGroup = new THREE.Group();
  const up = new THREE.Mesh(upper, headMat);
  const pal = new THREE.Mesh(palate, mouthMat);
  up.castShadow = true;
  headGroup.add(up, pal);
  jawGroup = new THREE.Group();
  jawGroup.position.set(0, 0, -0.2);
  const lo = new THREE.Mesh(lower, jawMat); lo.position.z = 0.2; lo.castShadow = true;
  const fl = new THREE.Mesh(mouthFloor, mouthMat); fl.position.z = 0.2;
  jawGroup.add(lo, fl);
  headGroup.add(jawGroup);
  // eyes: glossy spheres with a planar-projected iris and slit pupil
  const ER = 0.036;
  const eyeGeo = new THREE.SphereGeometry(ER, 32, 24);
  const ep = eyeGeo.getAttribute('position'), euv = eyeGeo.getAttribute('uv');
  for(let i = 0; i < ep.count; i++) euv.setXY(i, 0.5 + ep.getX(i) / ER * 0.5, 0.5 + ep.getY(i) / ER * 0.5);
  const eyeTex = eyeTexture();
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, emissiveMap: eyeTex, emissive: new THREE.Color(1.0, 0.62, 0.15),
    emissiveIntensity: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
  const [ew] = headSection(EYE.z);
  for(const s of [-1, 1]){
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * (ew * 0.84), EYE.y, EYE.z);
    e.lookAt(new THREE.Vector3(s * 1, 0.2, 0.45).add(e.position));
    headGroup.add(e);
    eyes.push(e);
  }
  // nostrils
  const nosMat = new THREE.MeshStandardMaterial({ color: 0x050805, roughness: 0.6 });
  for(const s of [-1, 1]){
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), nosMat);
    n.position.set(s * 0.03, 0.038, 0.372); headGroup.add(n);
  }
  // fangs, only unfolded when the jaw opens
  const fangGeo = new THREE.ConeGeometry(0.011, 0.075, 10);
  fangGeo.rotateX(Math.PI); fangGeo.translate(0, -0.035, 0);
  const fangMat = new THREE.MeshPhysicalMaterial({ color: 0xf8f4e8, roughness: 0.15, clearcoat: 1 });
  for(const s of [-1, 1]){
    const f = new THREE.Mesh(fangGeo, fangMat);
    f.position.set(s * 0.058, 0.005, 0.29); f.rotation.x = 0.35;
    headGroup.add(f); fangs.push(f);
  }
  // forked tongue
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.0075, 0.012, 0.17, 8); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, 0.085); parts.push(shaft);
  for(const s of [-1, 1]){
    const p = new THREE.CylinderGeometry(0.0025, 0.007, 0.095, 6); p.rotateX(Math.PI / 2); p.rotateY(s * 0.32); p.translate(s * 0.015, 0, 0.21); parts.push(p);
  }
  tongue = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.1, 0.005, 0.02),
    roughness: 0.3, clearcoat: 1, emissive: new THREE.Color(0.05, 0.0, 0.01) }));
  tongue.position.set(0, -0.016, 0.3);
  tongue.scale.set(1, 1, 0.001);
  headGroup.add(tongue);
  headGroup.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  scene.add(headGroup);
}

const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 };
const _f = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(), _tmp = new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);
const LIFT_H = 0.62, LIFT_D = 1.75;
function radiusAt(d, L, t){
  let r = SN_R;
  if(d < 0.7) r *= 0.66 + 0.34 * smooth(0, 0.7, d);
  const tt = clamp((d - 0.5 * L) / (0.5 * L), 0, 1);
  r *= Math.pow(1 - tt, 1.15) * 0.985 + 0.015;
  r *= 1 + 0.018 * Math.sin(t * 1.6 - d * 0.7);
  if(SN.waveAmp > 0){ const w = (d - SN.waveS) / 0.28; r *= 1 + 0.32 * SN.waveAmp * Math.exp(-w * w) * (1 - tt); }
  return r;
}
function updateBody(t){
  const L = SN.len;
  const rings = Math.min(MAXR, Math.floor(L / RING_STEP) + 1);
  const s0 = SN.headS - 0.52;
  const liftH = SN.lift * LIFT_H;
  for(let i = 0; i < rings; i++){
    const d = i * RING_STEP;
    pathAt(s0 - d, _a);
    const r = radiusAt(d, L, t);
    body.r[i] = r;
    const lift = d < LIFT_D ? liftH * Math.pow(1 - d / LIFT_D, 2) : 0;
    body.cx[i] = _a.x; body.cz[i] = _a.z;
    body.cy[i] = r * 0.95 * 0.72 + 0.004 + lift;
  }
  const P3 = body.pos, N3 = body.nor;
  for(let i = 0; i < rings; i++){
    const ia = Math.max(0, i - 1), ib = Math.min(rings - 1, i + 1);
    let tx = body.cx[ia] - body.cx[ib], ty = body.cy[ia] - body.cy[ib], tz = body.cz[ia] - body.cz[ib];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // side = up x T, B = T x side
    let nx = tz, nz = -tx; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const bx = -ty * nz, by = tz * nx - tx * nz, bz = ty * nx;
    const r = body.r[i];
    const dr = (body.r[ib] - body.r[ia]) / Math.max(1e-5, (ib - ia) * RING_STEP);
    const rx = r * 1.1, ryT = r * 0.95, ryB = r * 0.95 * 0.72;
    const cx = body.cx[i], cy = body.cy[i], cz = body.cz[i];
    for(let k = 0; k < RV; k++){
      const ca = body.cosA[k], sa = body.sinA[k];
      const ry = ca >= 0 ? ryT : ryB;
      const o = (i * RV + k) * 3;
      P3[o] = cx + bx * ca * ry + nx * sa * rx;
      P3[o + 1] = cy + by * ca * ry;
      P3[o + 2] = cz + bz * ca * ry + nz * sa * rx;
      // ellipse normal, tilted by the taper (n = e + r' T)
      let ex = bx * ca / ry + nx * sa / rx, ey = by * ca / ry, ez = bz * ca / ry + nz * sa / rx;
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      ex -= dr * tx; ey -= dr * ty; ez -= dr * tz;
      const ml = Math.hypot(ex, ey, ez) || 1;
      N3[o] = ex / ml; N3[o + 1] = ey / ml; N3[o + 2] = ez / ml;
    }
  }
  bodyGeo.attributes.position.needsUpdate = true;
  bodyGeo.attributes.normal.needsUpdate = true;
  bodyGeo.setDrawRange(0, (rings - 1) * RS * 6);

  // head frame from the track just ahead of the neck
  pathAt(SN.headS, _a); pathAt(SN.headS - 0.6, _b);
  _f.set(_a.x - _b.x, 0, _a.z - _b.z).normalize();
  _f.applyAxisAngle(UPW, SN.yaw);
  const pitch = -0.1 * SN.lift + Math.sin(t * 2.1) * 0.02 * SN.lift;
  _f.y = Math.sin(pitch); _f.normalize();
  _side.crossVectors(UPW, _f).normalize();
  _up.crossVectors(_f, _side).normalize();
  pathAt(SN.headS - 0.34, _b);
  const headY = 0.1 + liftH * 1.02 + SN.jaw * 0.02;
  headGroup.position.set(_b.x, headY, _b.z);
  _m4.makeBasis(_side, _up, _f);
  headGroup.quaternion.setFromRotationMatrix(_m4);
  headGroup.updateMatrixWorld();
  SN.headPos.copy(headGroup.position);
  SN.headFwd.copy(_f);
  SN.mouth.set(0, -0.02, 0.32).applyMatrix4(headGroup.matrixWorld);
  jawGroup.rotation.x = SN.jaw * 0.62;
  headGroup.children[0].rotation.x = -SN.jaw * 0.12;
  for(const f of fangs) f.scale.setScalar(Math.max(0.0001, smooth(0.2, 0.6, SN.jaw)));
}

/* ---------- serpent behavior ---------- */
const _probe = { x: 0, z: 0 };
function updateSnake(dt, t){
  // pace: stalk, lunge at prey, pause to swallow, or rear up and look around
  let target = SN.base;
  SN.strike = false;
  let preyAhead = 99, prey = null;
  for(let d = 0.05; d < 1.6; d += 0.05){
    pathAt(SN.headS + d, _probe);
    const [cx, cy] = worldToCell(_probe.x, _probe.z);
    if(!inside(cx, cy)) continue;
    const ii = itemAt[gi(cx, cy)];
    if(ii < 0) continue;
    const it = items[ii];
    if(it.type === SMILEY || (it.state !== 'idle' && it.state !== 'spawn')) continue;
    if(Math.hypot(_probe.x - cellX(cx), _probe.z - cellZ(cy)) < 0.2){ preyAhead = d; prey = it; break; }
  }
  if(preyAhead < 1.25){ SN.strike = true; target = SN.base * 2.1; }
  if(SN.swallowT > 0){ SN.swallowT -= dt; target = SN.base * 0.6; }
  if(SN.rearT > 0){
    SN.rearT -= dt;
    target = 0;
    SN.liftTarget = SN.rearT > 1.1 ? 1 : 0;
    SN.yaw = Math.sin(t * 1.25) * 0.42 * SN.lift;
  } else { SN.liftTarget = 0; SN.yaw = damp(SN.yaw, 0, 3, dt); }
  SN.speed = damp(SN.speed, target, SN.strike ? 7 : 3, dt);
  SN.lift = damp(SN.lift, SN.liftTarget, 2.4, dt);
  SN.headS += SN.speed * dt;
  ensureAhead(3.4);
  trimHistory();

  SN.jawTarget = SN.strike ? 0.85 * smooth(1.25, 0.35, preyAhead) : 0;
  SN.jaw = damp(SN.jaw, SN.jawTarget, SN.jawTarget > SN.jaw ? 14 : 9, dt);
  if(prey && preyAhead < 0.1) eat(prey);

  // forked tongue flicks, busier when prey is near or the snake is rearing
  SN.tongueT += dt;
  if(SN.tongueT > SN.nextTongue && SN.jaw < 0.2){
    SN.tongueT = 0;
    SN.nextTongue = (SN.rearT > 0 || preyAhead < 3) ? 0.55 + Math.random() * 0.5 : 1.4 + Math.random() * 2.2;
  }
  const tk = SN.tongueT / 0.42;
  const ext = tk < 1 ? Math.pow(Math.sin(Math.PI * tk), 0.7) : 0;
  tongue.scale.set(1, 1, Math.max(0.001, ext));
  tongue.rotation.x = ext * (Math.sin(SN.tongueT * 48) * 0.28 + 0.12);
  tongue.visible = ext > 0.01;

  if(SN.waveAmp > 0){
    SN.waveS += dt * 2.6;
    if(SN.waveS > SN.len) SN.waveAmp = Math.max(0, SN.waveAmp - dt * 1.5);
  }
  bodyUniforms.uWaveS.value = SN.waveS;
  bodyUniforms.uWaveAmp.value = SN.waveAmp;
  bodyUniforms.uGlowBase.value = 0.1 + 0.06 * Math.sin(t * 0.9);
  updateBody(t);
}
function eat(it){
  it.state = 'eaten'; it.eatT = 0;
  const glowC = ITEM_GLOW[it.type];
  const p = it.g.position;
  burst(p.x, p.y, p.z, 60, [glowC.r, glowC.g, glowC.b], 2.4, 0.05, 1.0, 1.2);
  burst(p.x, p.y, p.z, 26, [2.4, 1.9, 1.0], 1.5, 0.03, 0.8, 0);
  flashLight.position.copy(p).y += 0.3;
  flashLight.color.copy(glowC).multiplyScalar(0.5);
  flashLight.intensity = 14;
  SN.swallowT = 0.7;
  SN.waveS = -0.3; SN.waveAmp = 1; SN.waveColor.copy(glowC).multiplyScalar(0.6);
  SN.len = Math.min(SN.maxLen, SN.len + 0.28);
  SN.eaten++;
  const pts = it.type === HEART ? 10 : 25;
  SN.score += pts;
  pop(p, '+' + pts, it.type === HEART ? 'heart' : 'club');
  Snd.eat(it.type);
  // the 1988 level-17 rule, promoted: every heart eaten seeds a clover
  if(it.type === HEART){
    setTimeout(() => spawnItem(CLUB, -1, 0), 450);
    if(countItems(HEART) < 9) setTimeout(() => spawnItem(HEART), 1400);
    if(Math.random() < 0.25 && countItems(SMILEY) < 6) setTimeout(() => spawnItem(SMILEY), 2600);
  } else if(countItems(HEART) < 7) setTimeout(() => spawnItem(HEART), 900);
}
function randomFreeCell(){
  const occ = occupiedCells();
  const [hx, hy] = headCell();
  for(let tries = 0; tries < 500; tries++){
    const x = 1 + Math.floor(Math.random() * (GW - 2)), y = 1 + Math.floor(Math.random() * (GH - 2));
    const c = gi(x, y);
    if(grid[c] !== 0 || itemAt[c] >= 0 || occ.has(c)) continue;
    if(Math.abs(x - hx) + Math.abs(y - hy) < 4) continue;
    if(wallTarget[c] > 0) continue;
    return c;
  }
  return -1;
}

/* ============================================================
   WISPS — the 1988 arrows, now spirits skimming over the walls
   ============================================================ */
const wisps = [];
function makeWisps(){
  const shape = new THREE.Shape();
  shape.moveTo(-0.38, -0.055); shape.lineTo(0.06, -0.055); shape.lineTo(0.06, -0.19); shape.lineTo(0.4, 0);
  shape.lineTo(0.06, 0.19); shape.lineTo(0.06, 0.055); shape.lineTo(-0.38, 0.055); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  g.center(); g.rotateX(-Math.PI / 2);
  const defs = [
    { axis: 'x', dir: 1, lane: 4, col: new THREE.Color(3.2, 0.5, 2.6), light: true },
    { axis: 'x', dir: -1, lane: 15, col: new THREE.Color(0.5, 2.2, 3.4), light: true },
    { axis: 'z', dir: -1, lane: 22, col: new THREE.Color(3.0, 1.6, 0.4), light: false },
  ];
  for(const d of defs){
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: d.col, fog: false }));
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: d.col.clone().multiplyScalar(0.5),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    core.scale.setScalar(1.3);
    m.add(core);
    let light = null;
    if(d.light){ light = new THREE.PointLight(d.col.clone().multiplyScalar(0.3), 5, 7, 1.8); m.add(light); }
    scene.add(m);
    const w = { ...d, mesh: m, light, u: (Math.random() - 0.5) * 30, speed: 3.2 + Math.random() * 0.8, phase: Math.random() * 10 };
    wisps.push(w);
  }
}
function updateWisps(dt, t){
  for(const w of wisps){
    w.u += w.dir * w.speed * dt;
    const ext = (w.axis === 'x' ? GW : GH) / 2 + 4;
    if(Math.abs(w.u) > ext){
      w.u = -Math.sign(w.u) * ext;
      w.lane = w.axis === 'x' ? 1 + Math.floor(Math.random() * (GH - 2)) : 1 + Math.floor(Math.random() * (GW - 2));
      Snd.whoosh();
    }
    const fade = smooth(ext, ext - 3, Math.abs(w.u));
    const y = 1.5 + Math.sin(t * 2 + w.phase) * 0.15;
    if(w.axis === 'x'){ w.mesh.position.set(w.u, y, cellZ(w.lane)); w.mesh.rotation.set(0, w.dir > 0 ? 0 : Math.PI, Math.sin(t * 3 + w.phase) * 0.15); }
    else { w.mesh.position.set(cellX(w.lane), y, w.u); w.mesh.rotation.set(0, w.dir > 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(t * 3 + w.phase) * 0.15); }
    w.mesh.scale.setScalar(Math.max(0.0001, fade));
    if(w.light) w.light.intensity = 6 * fade;
    for(let k = 0; k < 3; k++){
      const p = w.mesh.position;
      emit(p.x + (Math.random() - 0.5) * 0.15, p.y + (Math.random() - 0.5) * 0.15, p.z + (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3 - 0.1, (Math.random() - 0.5) * 0.3,
        w.col.r * 0.7, w.col.g * 0.7, w.col.b * 0.7, 0.07 * fade, 0.75, 1.2, 0.2);
    }
  }
}

/* ============================================================
   TITLE — gold 3D letters that burn away into sparks
   ============================================================ */
let title = null;
// lives from boot so adding it later never forces a shader recompile
const titleLight = new THREE.PointLight(new THREE.Color(1.0, 0.8, 0.55), 60, 16, 1.6);
titleLight.position.set(-3, 8.5, 5.5);
scene.add(titleLight);
const titleUniforms = { uDissolve: { value: 0 } };
function makeTitle(){
  new FontLoader().load(FONT_URL, (font) => {
    const g = new TextGeometry('SNEEKIE', {
      font, size: 2.8, depth: 0.6, curveSegments: 10,
      bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.1, bevelSegments: 6,
    });
    g.center();
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(1.0, 0.8, 0.4), metalness: 1, roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.06,
      emissive: new THREE.Color(0.16, 0.08, 0.01), envMapIntensity: 3.2,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDissolve = titleUniforms.uDissolve;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\nuniform float uDissolve;\n${GLSL_NOISE}`)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat dn = fbm(vWp * 1.4);\nif(dn < uDissolve * 1.15 - 0.05) discard;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(6.0, 2.8, 0.7) * (1.0 - smoothstep(uDissolve * 1.15 - 0.05, uDissolve * 1.15 + 0.05, dn)) * step(0.001, uDissolve);');
    };
    title = new THREE.Mesh(g, mat);
    title.position.set(0, 9.2, 4);
    title.castShadow = true;
    scene.add(title);
  });
}
function updateTitle(t){
  if(!title) return;
  const d = titleUniforms.uDissolve.value;
  title.rotation.y = Math.sin(t * 0.4) * 0.08;
  title.rotation.x = -0.18;
  title.position.y = 9.2 + Math.sin(t * 0.8) * 0.15;
  // a warm glint sweeping across the letters
  titleLight.position.set(-11 + mod(t * 3.2, 22), 11.5, 8.5);
  if(d > 0 && d < 1){
    const pos = title.geometry.getAttribute('position');
    for(let k = 0; k < 14; k++){
      _v.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count)).applyMatrix4(title.matrixWorld);
      emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6,
        3.2, 1.9, 0.5, 0.08, 1.6 + Math.random(), 0.8, -0.4);
    }
  }
  titleLight.intensity = 60 * (1 - d);
  if(d >= 1){ scene.remove(title); title.geometry.dispose(); title = null; titleLight.intensity = 0; }
}

/* ============================================================
   SOUND — a small Web Audio score: pad, wind, chimes, 1988 beeps
   ============================================================ */
const Snd = (() => {
  let ctx = null, master = null, wet = null, on = false, padTimer = 0, chord = 0;
  const CHORDS = [
    [110, 164.8, 246.9, 261.6], [87.3, 130.8, 164.8, 220], [130.8, 196, 246.9, 329.6], [98, 146.8, 196, 293.7],
  ];
  function init(){
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for(let ch = 0; ch < 2; ch++){ const d = ir.getChannelData(ch); for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.55;
    wet.connect(conv); conv.connect(master);
    // wind
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), nd = nb.getChannelData(0);
    for(let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    ns.connect(bp); bp.connect(wg); wg.connect(master); wg.connect(wet); ns.start();
  }
  function pad(){
    if(!on) return;
    const now = ctx.currentTime, notes = CHORDS[chord++ % CHORDS.length];
    for(const f of notes){
      for(const det of [-6, 6]){
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.018, now + 2.8); g.gain.linearRampToValueAtTime(0.014, now + 6.5); g.gain.linearRampToValueAtTime(0, now + 10);
        o.connect(lp); lp.connect(g); g.connect(master); g.connect(wet);
        o.start(now); o.stop(now + 10.2);
      }
    }
    if(Math.random() < 0.7) setTimeout(() => chime([880, 987.8, 1318.5, 1760][Math.floor(Math.random() * 4)], 0.05), 2500 + Math.random() * 3000);
  }
  function chime(f, vol = 0.08, when = 0){
    if(!on) return;
    const now = ctx.currentTime + when;
    for(const [mul, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]){
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol * v, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2 / mul + 0.3);
      o.connect(g); g.connect(master); g.connect(wet); o.start(now); o.stop(now + 2.8);
    }
  }
  function noiseSweep(f0, f1, dur, vol){
    if(!on) return;
    const now = ctx.currentTime;
    const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + dur * 0.4); g.gain.linearRampToValueAtTime(0, now + dur);
    s.connect(f); f.connect(g); g.connect(master); g.connect(wet); s.start(now);
  }
  return {
    get on(){ return on; },
    toggle(){
      if(!ctx) init();
      on = !on;
      if(ctx.state === 'suspended') ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 0.6);
      clearInterval(padTimer);
      if(on){ pad(); padTimer = setInterval(pad, 8000); }
      return on;
    },
    eat(type){
      if(!on) return;
      const base = type === HEART ? [659.3, 880, 1108.7] : [880, 1318.5, 1760, 2217.5];
      base.forEach((f, i) => chime(f, 0.07, i * 0.07));
      noiseSweep(3000, 800, 0.25, 0.05);
    },
    whoosh(){ noiseSweep(300, 2400, 0.9, 0.035); },
    rumble(){
      if(!on) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(32, now + 3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.25, now + 0.3); g.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
      o.connect(g); g.connect(master); o.start(now); o.stop(now + 3.3);
      noiseSweep(200, 3000, 2.8, 0.06);
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => chime(f, 0.05, 0.8 + i * 0.18));
    },
    beep1988(){      // SOUND 2500,.1: SOUND 3500,.1: SOUND 5000,.1 (BASIC line 2260)
      if(!on) return;
      let tt = ctx.currentTime;
      for(const f of [2500, 3500, 5000, 2500, 3500, 5000]){
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.03;
        o.connect(g); g.connect(master); o.start(tt); o.stop(tt + 0.1 / 18.2 * 4); tt += 0.1 / 18.2 * 4 + 0.01;
      }
    },
  };
})();

/* ============================================================
   UI — captions, score pops, the 1988 CRT overlay
   ============================================================ */
const $ = id => document.getElementById(id);
const ui = { presents: $('presents'), subtitle: $('subtitle'), caption: $('caption'), era: $('era'), pops: $('pops') };
ui.presents.innerHTML = TXT.presents;
ui.subtitle.innerHTML = TXT.subtitle;
const timers = new Map();
function show(el, on, ms = 0){
  clearTimeout(timers.get(el));
  el.classList.toggle('is-on', on);
  if(on && ms) timers.set(el, setTimeout(() => el.classList.remove('is-on'), ms));
}
function caption(small, big, ms = 4200){
  ui.caption.innerHTML = (small ? `<small>${small}</small>` : '') + big;
  show(ui.caption, true, ms);
}
const pops = [];
function pop(pos, text, cls){
  const el = document.createElement('div');
  el.className = 'demo-pop ' + cls;
  el.textContent = text;
  ui.pops.appendChild(el);
  pops.push({ el, pos: pos.clone(), t: 0 });
}
function updatePops(dt){
  const w = stage.clientWidth, h = stage.clientHeight;
  for(let i = pops.length - 1; i >= 0; i--){
    const p = pops[i];
    p.t += dt;
    if(p.t > 1.6){ p.el.remove(); pops.splice(i, 1); continue; }
    _v.copy(p.pos); _v.y += 0.4 + p.t * 0.7;
    _v.project(camera);
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    const a = p.t < 0.15 ? p.t / 0.15 : 1 - smooth(0.9, 1.6, p.t);
    const s = 0.8 + 0.4 * smooth(0, 0.2, p.t);
    p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    p.el.style.opacity = _v.z < 1 ? a : 0;
  }
}

/* The 1988 screen: the live board redrawn as CP437 text-mode glyphs —
   box-drawing walls, a double-line snake with a solid block head — laid
   exactly over the projected board so the two eras dissolve into each other. */
const crt = { ctx: crtCanvas.getContext('2d'), alpha: 0, target: 0 };
function drawCRT(t){
  const c = crt.ctx;
  const W = crtCanvas.width, H = crtCanvas.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#020803'; c.fillRect(0, 0, W, H);
  // project the board corners
  _v.set(-GW / 2, 0, -GH / 2).project(camera);
  const x0 = (_v.x * 0.5 + 0.5) * W, y0 = (-_v.y * 0.5 + 0.5) * H;
  _v.set(GW / 2, 0, GH / 2).project(camera);
  const x1 = (_v.x * 0.5 + 0.5) * W, y1 = (-_v.y * 0.5 + 0.5) * H;
  const cw = (x1 - x0) / GW, ch = (y1 - y0) / GH;
  const green = '#7dff7d', bright = '#d4ffd4', dim = '#3fa94a';
  c.shadowColor = 'rgba(125,255,125,.75)'; c.shadowBlur = Math.max(2, cw * 0.35);
  c.lineCap = 'square';
  const cx = x => x0 + (x + 0.5) * cw, cy = y => y0 + (y + 0.5) * ch;
  // walls: single box-drawing lines joined to wall neighbours
  c.strokeStyle = green; c.lineWidth = Math.max(1, cw * 0.14);
  c.beginPath();
  for(let y = 0; y < GH; y++) for(let x = 0; x < GW; x++){
    if(grid[gi(x, y)] !== WALL) continue;
    const X = cx(x), Y = cy(y);
    const n = [y > 0 && grid[gi(x, y - 1)] === WALL, x < GW - 1 && grid[gi(x + 1, y)] === WALL, y < GH - 1 && grid[gi(x, y + 1)] === WALL, x > 0 && grid[gi(x - 1, y)] === WALL];
    if(!n.some(Boolean)){ c.moveTo(X - cw * 0.3, Y); c.lineTo(X + cw * 0.3, Y); continue; }
    if(n[0]){ c.moveTo(X, Y); c.lineTo(X, Y - ch / 2); }
    if(n[1]){ c.moveTo(X, Y); c.lineTo(X + cw / 2, Y); }
    if(n[2]){ c.moveTo(X, Y); c.lineTo(X, Y + ch / 2); }
    if(n[3]){ c.moveTo(X, Y); c.lineTo(X - cw / 2, Y); }
  }
  c.stroke();
  // glyphs
  const fs = Math.min(cw, ch) * 0.95;
  c.font = `bold ${fs}px ui-monospace, Menlo, Consolas, monospace`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for(let y = 0; y < GH; y++) for(let x = 0; x < GW; x++){
    const i = gi(x, y);
    if(grid[i] === STONE){ c.fillStyle = green; c.fillText('◙', cx(x), cy(y)); }
    const ii = itemAt[i];
    if(ii >= 0){
      const it = items[ii];
      c.fillStyle = it.type === SMILEY ? green : bright;
      c.fillText(it.type === HEART ? '♥' : it.type === CLUB ? '♣' : '☺', cx(x), cy(y));
    }
  }
  for(const w of wisps){
    if(w.mesh.scale.x < 0.3) continue;
    const [gx, gy] = worldToCell(w.mesh.position.x, w.mesh.position.z);
    if(!inside(gx, gy)) continue;
    c.fillStyle = bright;
    c.fillText(w.axis === 'x' ? (w.dir > 0 ? '→' : '←') : '↑', cx(gx), cy(gy));
  }
  // the snake: double lines through its cells, a solid block for the head
  const h = segAt(SN.headS);
  const cells = ctrl.slice(Math.max(0, h + 1 - Math.round(SN.len)), h + 2);
  c.strokeStyle = green; c.lineWidth = Math.max(1, cw * 0.1);
  const gap = cw * 0.16;
  c.beginPath();
  for(let k = 0; k < cells.length - 1; k++){
    const a = cells[k], b = cells[k + 1];
    const ax = cx(a.x), ay = cy(a.y), bx = cx(b.x), by = cy(b.y);
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    for(const s of [-1, 1]){
      c.moveTo(ax + dy * gap * s, ay + dx * gap * s);
      c.lineTo(bx + dy * gap * s, by + dx * gap * s);
    }
  }
  c.stroke();
  const hc = cells[cells.length - 1];
  if(hc){ c.fillStyle = bright; c.fillRect(cx(hc.x) - cw * 0.45, cy(hc.y) - ch * 0.45, cw * 0.9, ch * 0.9); }
  // header and legend rows from BASIC lines 130-190
  c.shadowBlur = Math.max(2, cw * 0.25);
  c.fillStyle = green;
  const tf = Math.max(9, cw * 0.62);
  c.font = `${tf}px ui-monospace, Menlo, Consolas, monospace`;
  c.textAlign = 'left';
  c.fillText("**** Sneekie ****         (c) juli '88 by HerbySoft", x0 + cw, y0 - ch * 0.9);
  c.fillText('♥ 10 punten   ☺ -50 punten   Level ' + (levelIndex + 1) + '   Score ' + String(SN.score).padStart(6, ' '), x0 + cw, y1 + ch * 0.9);
  c.fillText('♣ 25 punten   ◙ Steen        <ESC> vastgelopen', x0 + cw, y1 + ch * 1.9);
  // scanlines and phosphor flicker
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(0,0,0,.28)';
  const step = Math.max(2, Math.round(H / 300));
  for(let y = 0; y < H; y += step * 2) c.fillRect(0, y, W, step);
  c.fillStyle = `rgba(125,255,125,${0.02 + 0.015 * Math.sin(t * 60)})`;
  c.fillRect(0, 0, W, H);
}

/* ============================================================
   DIRECTOR — a playlist of camera shots with cuts, blends, slow-mo
   ============================================================ */
const camS = { pos: new THREE.Vector3(0, 30, 50), look: new THREE.Vector3(0, 4, 0), fov: 45, hf: new THREE.Vector3(0, 0, -1) };
const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, lambda: 3, dof: 0, focus: 3, aperture: 0.003 };
let timeScale = 1, timeScaleTarget = 1;
const SHOTS = {
  chase: {
    dur: 8.5,
    enter(s){ s.side = Math.random() < 0.5 ? -1 : 1; },
    update(s, t){
      camS.hf.lerp(_tmp.set(SN.headFwd.x, 0, SN.headFwd.z).normalize(), 0.04);
      _side.crossVectors(UPW, camS.hf).normalize();
      want.pos.copy(SN.headPos).addScaledVector(camS.hf, -2.5).addScaledVector(_side, 0.45 * s.side).add(_up.set(0, 1.3, 0));
      want.look.copy(SN.headPos).addScaledVector(camS.hf, 1.4).add(_up.set(0, 0.1, 0));
      want.fov = 50; want.lambda = 2.6; want.dof = 0;
    },
  },
  profile: {
    dur: 7.5,
    enter(s){ s.side = Math.random() < 0.5 ? -1 : 1; },
    update(s, t){
      camS.hf.lerp(_tmp.set(SN.headFwd.x, 0, SN.headFwd.z).normalize(), 0.03);
      _side.crossVectors(UPW, camS.hf).normalize();
      want.pos.copy(SN.headPos).addScaledVector(_side, 2.1 * s.side).addScaledVector(camS.hf, -0.3).add(_up.set(0, 1.0, 0));
      want.look.copy(SN.headPos).addScaledVector(camS.hf, -0.7).add(_up.set(0, 0.05, 0));
      want.fov = 38; want.lambda = 2.2; want.dof = 1; want.focus = want.pos.distanceTo(SN.headPos); want.aperture = 0.0035;
    },
  },
  lowFront: {
    dur: 5.5,
    enter(s){
      ensureAhead(4.6);
      pathAt(SN.headS + 3.2, _a); pathAt(SN.headS + 3.0, _b);
      const fx = _a.x - _b.x, fz = _a.z - _b.z, fl = Math.hypot(fx, fz) || 1;
      let best = null;
      for(const side of [1, -1]){
        const px = _a.x + (-fz / fl) * 0.74 * side, pz = _a.z + (fx / fl) * 0.74 * side;
        const [cx, cy] = worldToCell(px, pz);
        const free = inside(cx, cy) && grid[gi(cx, cy)] === 0;
        if(free){ best = [px, pz, 0.28]; break; }
        if(!best) best = [px, pz, 1.25];
      }
      s.pos = new THREE.Vector3(best[0], best[2], best[1]);
      s.snap = true;
    },
    update(s){
      want.pos.copy(s.pos);
      want.look.copy(SN.headPos).add(_up.set(0, 0.06, 0));
      want.fov = 44; want.lambda = 5; want.dof = 1; want.focus = s.pos.distanceTo(SN.headPos); want.aperture = 0.005;
    },
  },
  rear: {
    dur: 6.8,
    enter(s){ SN.rearT = 6.2; s.a = Math.atan2(SN.headFwd.x, SN.headFwd.z) + (Math.random() < 0.5 ? 0.9 : -0.9); },
    update(s, t, st){
      const a = s.a + st * 0.16;
      want.pos.set(SN.headPos.x + Math.sin(a) * 1.75, 0.5 + SN.lift * 0.45, SN.headPos.z + Math.cos(a) * 1.75);
      want.look.copy(SN.headPos).add(_up.set(0, -0.05, 0));
      want.fov = 36; want.lambda = 2.5; want.dof = 1; want.focus = want.pos.distanceTo(SN.headPos); want.aperture = 0.004;
    },
  },
  strike: {
    dur: 9,
    enter(s){
      ensureAhead(6);
      s.item = null;
      for(let d = 2.2; d < 6.5 && !s.item; d += 0.1){
        pathAt(SN.headS + d, _a);
        const [cx, cy] = worldToCell(_a.x, _a.z);
        if(!inside(cx, cy)) continue;
        const ii = itemAt[gi(cx, cy)];
        if(ii >= 0 && items[ii].type !== SMILEY){ s.item = items[ii]; s.d = d; }
      }
      if(!s.item) return false;
      pathAt(SN.headS + s.d, _a); pathAt(SN.headS + s.d - 0.8, _b);
      const fx = _a.x - _b.x, fz = _a.z - _b.z, fl = Math.hypot(fx, fz) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      const ip = s.item.g.position;
      s.pos = new THREE.Vector3(ip.x + (-fz / fl) * 1.9 * side + (fx / fl) * 0.9, 0.55, ip.z + (fx / fl) * 1.9 * side + (fz / fl) * 0.9);
      s.snap = true; s.after = 0; s.eaten = false;
    },
    update(s, t, st, dt){
      const ip = s.item.g.position;
      want.pos.copy(s.pos);
      want.look.copy(ip).lerp(SN.headPos, 0.35).setY(0.3);
      want.fov = 42; want.lambda = 3; want.dof = 1; want.focus = s.pos.distanceTo(ip); want.aperture = 0.004;
      const near = SN.headPos.distanceTo(ip);
      if(s.item.state === 'idle' && near < 1.3) timeScaleTarget = 0.28;
      if(s.item.state === 'eaten' || s.item.state === 'gone'){ s.eaten = true; }
      if(s.eaten){ s.after += dt; timeScaleTarget = s.after < 0.9 ? 0.28 : 1; if(s.after > 2.2) return 'done'; }
      else if(st > 7 || s.item.state === 'poof') return 'done';     // the prey slipped away: never linger in slow motion
    },
    exit(){ timeScaleTarget = 1; },
  },
  crane: {
    dur: 10,
    enter(s){ s.a = Math.random() * TAU; s.r = 21 + Math.random() * 5; s.h = 5.5 + Math.random() * 4; },
    update(s, t, st){
      const a = s.a + st * 0.05;
      _tmp.set(0, 0, 0).lerp(SN.headPos, 0.4);
      const k = narrowK();
      want.pos.set(_tmp.x + Math.sin(a) * s.r * k, (s.h + st * 0.12) * k, _tmp.z + Math.cos(a) * s.r * k);
      want.look.copy(_tmp).setY(0.8);
      want.fov = 42; want.lambda = 1.2; want.dof = 0;
    },
  },
  top1988: {
    dur: 8,
    enter(s){ camera.up.set(0, 0, -1); s.snap = true; },
    update(s, t, st){
      const aspect = camera.aspect;
      const H = 70;
      const half = Math.max(GH / 2 + 4.2, (GW / 2 + 1.6) / aspect);
      want.fov = 2 * Math.atan(half / H) * 180 / Math.PI;
      want.pos.set(0, H + Math.max(0, 4 - st) * 6, 0.001);
      want.look.set(0, 0, 0);
      want.lambda = 2; want.dof = 0;
      const on = st > 1.6 && st < 5.2;
      crt.target = on ? 1 : 0;
      if(st > 1.6 && !s.b1){ s.b1 = true; ui.era.innerHTML = TXT.era1988; ui.era.classList.remove('is-2026'); show(ui.era, true); Snd.beep1988(); }
      if(st > 5.2 && !s.b2){ s.b2 = true; ui.era.innerHTML = TXT.era2026; ui.era.classList.add('is-2026'); show(ui.era, true, 2600); }
    },
    exit(s){ camera.up.set(0, 1, 0); crt.target = 0; if(!s.b2) show(ui.era, false); },
  },
  wisp: {
    dur: 5,
    enter(s){ s.w = wisps[Math.floor(Math.random() * wisps.length)]; s.snap = true; },
    update(s){
      const p = s.w.mesh.position;
      const dir = s.w.axis === 'x' ? _tmp.set(s.w.dir, 0, 0) : _tmp.set(0, 0, s.w.dir);
      want.pos.copy(p).addScaledVector(dir, -2.6).add(_up.set(0.3, 0.9, 0.3));
      want.look.copy(p).addScaledVector(dir, 3).add(_up.set(0, -1.2, 0));
      want.fov = 62; want.lambda = 6; want.dof = 0;
      if(s.w.mesh.scale.x < 0.4) return 'done';
    },
  },
};
const PLAYLIST = ['chase', 'strike', 'crane', 'profile', 'rear', 'lowFront', 'strike', 'top1988', 'wisp', 'chase', 'profile', 'strike', 'crane', 'rear', 'lowFront', 'wisp'];
/* portrait / narrow screens: wide shots back off, every lens widens a touch */
const narrowK = () => clamp(1.55 / camera.aspect, 1, 2.3);
const narrowFov = () => clamp(1.3 / camera.aspect, 1, 1.4);
const director = { mode: 'intro', idx: 0, shot: null, name: '', st: 0, state: {}, pending: null, free: false };
function cutTo(name){
  if(director.shot && director.shot.exit) director.shot.exit(director.state);
  const shot = SHOTS[name];
  const state = {};
  if(shot.enter && shot.enter(state) === false){ return cutTo('chase'); }
  director.shot = shot; director.name = name; director.st = 0; director.state = state;
  shot.update(state, clock.t, 0, 0);
  if(state.snap !== false){ camS.pos.copy(want.pos); camS.look.copy(want.look); camS.fov = want.fov * (name === 'top1988' ? 1 : narrowFov()); }
  camS.hf.set(SN.headFwd.x, 0, SN.headFwd.z).normalize();
}
function nextShot(){
  if(director.pending){ const p = director.pending; director.pending = null; return cutTo(p); }
  cutTo(PLAYLIST[director.idx++ % PLAYLIST.length]);
}
function updateIntro(st){
  // high above the temple, the golden title hangs in the aurora light
  const k1 = smooth(0, 7, st);
  want.look.set(0, lerp(7, 5.5, k1), 0);
  want.pos.set(0, lerp(24, 13, k1), lerp(46, 24, k1)).sub(want.look).multiplyScalar(narrowK()).add(want.look);
  want.fov = 42; want.lambda = 2; want.dof = 0;
  if(st > 0.6 && !director.state.p){ director.state.p = true; show(ui.presents, true, 3600); }
  if(st > 3.8 && !director.state.s){ director.state.s = true; show(ui.subtitle, true, 4200); }
  if(st > 6.8) titleUniforms.uDissolve.value = clamp((st - 6.8) / 2.2, 0, 1);
  if(st > 7.8){
    // swoop down into the chase position
    const k = smooth(7.8, 11.5, st);
    camS.hf.lerp(_tmp.set(SN.headFwd.x, 0, SN.headFwd.z).normalize(), 0.05);
    _side.crossVectors(UPW, camS.hf).normalize();
    _tmp.copy(SN.headPos).addScaledVector(camS.hf, -2.5).add(_up.set(0, 1.3, 0));
    want.pos.lerp(_tmp, k);
    _tmp.copy(SN.headPos).addScaledVector(camS.hf, 1.4);
    want.look.lerp(_tmp, k);
    want.fov = lerp(42, 50, k); want.lambda = lerp(2, 5, k);
  }
  if(st > 11.5){ director.mode = 'play'; director.idx = 0; nextShot(); caption(TXT.level + ' 1', TXT.levels[0]); }
}
function updateDirector(dt){
  director.st += dt;
  if(director.free){
    orbit.target.lerp(SN.headPos, 0.05);
    orbit.update();
    return;
  }
  if(director.mode === 'intro') updateIntro(director.st);
  else {
    const r = director.shot.update(director.state, clock.t, director.st, dt);
    if(r === 'done' || director.st > director.shot.dur) nextShot();
  }
  const k = 1 - Math.exp(-want.lambda * dt);
  camS.pos.lerp(want.pos, k);
  camS.look.lerp(want.look, k);
  camS.fov = lerp(camS.fov, director.name === 'top1988' && director.mode === 'play' ? want.fov : want.fov * narrowFov(), k);
  camera.position.copy(camS.pos);
  // a whisper of handheld breathing
  camera.position.x += Math.sin(clock.t * 0.7) * 0.012; camera.position.y += Math.sin(clock.t * 0.93) * 0.01;
  camera.lookAt(camS.look);
  if(Math.abs(camera.fov - camS.fov) > 0.01){ camera.fov = camS.fov; camera.updateProjectionMatrix(); }
  bokeh.enabled = QUALITY.dof && want.dof > 0;
  if(bokeh.enabled){
    bokeh.uniforms.focus.value = want.focus;
    bokeh.uniforms.aperture.value = want.aperture;
    bokeh.uniforms.maxblur.value = 0.0085;
  }
}

/* ============================================================
   MAIN LOOP, RESIZE, CONTROLS
   ============================================================ */
const QUALITY = { reflect: true, dof: true };
const clock = { t: 0, sim: 0, last: performance.now(), paused: false, levelT: 0, morphAt: 0 };
let orbit;
function resize(){
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  gradePass.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  crtCanvas.width = Math.round(w * Math.min(2, window.devicePixelRatio || 1));
  crtCanvas.height = Math.round(h * Math.min(2, window.devicePixelRatio || 1));
  if(reflector) reflector.getRenderTarget().setSize(Math.floor(w * pixelRatio * REFL_SCALE), Math.floor(h * pixelRatio * REFL_SCALE));
}
function frame(now){
  requestAnimationFrame(frame);
  const raw = (now - clock.last) / 1000;
  clock.last = now;
  tick(Math.min(0.05, raw));
  adaptQuality(raw);
}
function tick(dt){
  clock.t += dt;
  timeScale = damp(timeScale, timeScaleTarget, timeScaleTarget < timeScale ? 10 : 3, dt);
  const sdt = clock.paused ? 0 : dt * timeScale;
  clock.sim += sdt;
  const t = clock.sim;

  if(sdt > 0){
    updateSnake(sdt, t);
    updateItems(sdt, t);
    updateWisps(sdt, t);
    updateWalls(sdt);
    updateParticles(sdt);
    updateTitle(t);
    // level cycle: the board reshapes itself every so often
    if(director.mode === 'play'){
      clock.levelT += sdt;
      if(clock.levelT > 52 && director.name !== 'strike' && director.name !== 'top1988') nextLevel();
    }
  }
  if(clock.morphAt && clock.sim >= clock.morphAt){
    clock.morphAt = 0;
    applyLayout(levelIndex, true);
    Snd.rumble();
    caption(TXT.level + ' ' + (levelIndex + 1), TXT.levels[levelIndex % TXT.levels.length], 4800);
  }
  if(!clock.paused || director.free) updateDirector(dt);

  // lights and shader clocks
  for(const b of braziers){
    b.light.intensity = 4 + Math.sin(t * 9 + b.phase) * 0.8 + Math.sin(t * 23 + b.phase * 2) * 0.55 + (Math.random() - 0.5) * 0.6;
  }
  flashLight.intensity = Math.max(0, flashLight.intensity - sdt * 30);
  skyUniforms.uTime.value = t; cloudUniforms.uTime.value = t; wallUniforms.uTime.value = t; fireUniforms.uTime.value = t;
  gradePass.uniforms.uTime.value = clock.t;
  gradePass.uniforms.uFade.value = Math.min(1, gradePass.uniforms.uFade.value + dt * 0.8);
  fireUniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  sky.position.copy(camera.position);
  for(const m of islets){ m.position.y = m.userData.y0 + Math.sin(t * 0.3 + m.userData.bob) * 0.8; m.rotation.y += sdt * 0.01; }

  // planar reflection matrix (world -> reflection texture)
  if(reflector){
    reflector.updateMatrixWorld();
    floorUniforms.uReflMat.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(_m4.copy(reflector.matrixWorld).invert());
    floorUniforms.uReflOn.value = QUALITY.reflect ? 1 : 0;
  }
  renderer.shadowMap.needsUpdate = true;
  composer.render(dt);

  crt.alpha = damp(crt.alpha, crt.target, 3.2, dt);
  crtCanvas.style.opacity = crt.alpha.toFixed(3);
  if(crt.alpha > 0.01) drawCRT(clock.t);
  updatePops(dt);
}
/* the board reshapes itself: cut wide, then let the walls sink and rise */
function nextLevel(){
  clock.levelT = 0;
  levelIndex++;
  if(!director.free){ director.pending = 'crane'; nextShot(); }
  clock.morphAt = clock.sim + 0.9;
}
/* keep it smooth: step the resolution down if frames run long */
const perf = { t: 0, n: 0, sum: 0, checks: 0 };
function adaptQuality(dt){
  if(document.hidden || dt > 0.5) return;           // tab switches are not slow frames
  perf.t += dt;
  if(perf.t < 4) return;
  perf.n++; perf.sum += dt;
  if(perf.n < 90) return;
  const avg = perf.sum / perf.n;
  perf.n = 0; perf.sum = 0; perf.checks++;
  if(avg > 1 / 38 && perf.checks < 6){
    if(pixelRatio > 1.01) pixelRatio = Math.max(1, pixelRatio * 0.8);
    else if(QUALITY.dof) QUALITY.dof = false;
    else if(pixelRatio > 0.7) pixelRatio *= 0.85;
    else QUALITY.reflect = false;
    resize();
  }
}

function setupControls(){
  orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  orbit.enableDamping = true;
  orbit.maxDistance = 60; orbit.minDistance = 1;
  const bPause = $('b-pause'), bNext = $('b-next'), bCam = $('b-cam'), bSound = $('b-sound'), bFull = $('b-full');
  const togglePause = () => {
    clock.paused = !clock.paused;
    bPause.setAttribute('aria-pressed', clock.paused);
    bPause.innerHTML = clock.paused ? '&#9654;' : '&#10074;&#10074;';
    bPause.title = clock.paused ? TXT.play : TXT.pause;
  };
  const toggleCam = () => {
    director.free = !director.free;
    orbit.enabled = director.free;
    bCam.setAttribute('aria-pressed', director.free);
    if(director.free){
      camera.up.set(0, 1, 0);
      orbit.target.copy(SN.headPos);
      caption('', TXT.freecam, 3200);
    } else if(director.mode === 'play'){ nextShot(); caption('', TXT.director, 1800); }
  };
  const toggleSound = () => bSound.setAttribute('aria-pressed', Snd.toggle());
  const toggleFull = () => {
    if(document.fullscreenElement) document.exitFullscreen();
    else if(stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  };
  const skip = () => {
    if(director.free) return;
    if(director.mode === 'intro'){ director.st = 11.4; titleUniforms.uDissolve.value = 1; return; }
    nextShot();
  };
  bPause.onclick = togglePause; bNext.onclick = skip; bCam.onclick = toggleCam; bSound.onclick = toggleSound; bFull.onclick = toggleFull;
  // grabbing the scene hands over the camera; capture phase so the same drag already orbits
  canvas.addEventListener('pointerdown', () => { if(!director.free && director.mode === 'play') toggleCam(); }, true);
  window.addEventListener('keydown', (e) => {
    if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if(k === ' '){ e.preventDefault(); togglePause(); }
    else if(k === 'n') skip();
    else if(k === 'c') toggleCam();
    else if(k === 'm') toggleSound();
    else if(k === 'f') toggleFull();
  });
  new ResizeObserver(resize).observe(stage);
}

/* ============================================================
   BOOT
   ============================================================ */
let islets = [];
function boot(){
  makeEnvironment();
  makeClouds();
  makeFloor();
  islets = makeIsland();
  makeWalls();
  makeBoulderGeos();
  makeBraziers();
  makeFireflies();
  makeItemAssets();
  makeWisps();
  makeSnake();
  makeTitle();
  applyLayout(0, false);
  initSnake();
  for(let i = 0; i < 9; i++) spawnItem(HEART, -1, 1 + i * 0.25);
  for(let i = 0; i < 3; i++) spawnItem(CLUB, -1, 3 + i * 0.3);
  for(let i = 0; i < 5; i++) spawnItem(SMILEY, -1, 2 + i * 0.3);
  setupControls();
  resize();
  updateSnake(0.016, 0);
  director.mode = 'intro'; director.st = 0; director.state = {};
  camS.pos.set(0, 24, 46); camS.look.set(0, 7, 0);
  loadingEl.classList.add('is-done');
  window.SNEEKIE_DEMO = {
    get shot(){ return director.mode === 'intro' ? 'intro' : director.name; },
    get fps(){ return perf; }, get score(){ return SN.score; }, get eaten(){ return SN.eaten; },
    get level(){ return levelIndex + 1; }, cut: cutTo, nextLevel, quality: QUALITY, SN, scene, bloom, renderer, camera,
    // test hook: advance the demo without requestAnimationFrame (hidden tabs)
    step(seconds, fps = 30){ const n = Math.round(seconds * fps); for(let i = 0; i < n; i++) tick(1 / fps); },
  };
  requestAnimationFrame((t) => { clock.last = t; frame(t); });
}
// let the loading card paint before the texture work blocks the thread
setTimeout(() => {
  try { boot(); }
  catch (err){ loadingEl.innerHTML = `<span>${TXT.nogl}</span>`; console.error(err); }
}, 60);
