'use strict';
/* ============================================================
   SNEEKIE 2026 — the 3D remake of the 1988 original.
   Written by Claude Fable, July 2026.

   Hand-written WebGL2 + Web Audio. No engine, no framework, no
   dependency — the 2026 equivalent of POKEing straight into
   video memory. The rules are the 1988 rules: eat every heart
   (and club), dodge the smileys, push the stones, and never
   trust a maze. Walls bump, hazards kill, greed is punished.

   Loaded by <lang>/game.html and <lang>/bot.html when the
   1988/2026 era switch is set to 2026 (see the inline era
   loader in those pages). The faithful 1988 port stays in
   docs/js/game.js and is untouched by this file.
   ============================================================ */
(() => {

/* ---------- error banner (same contract as game.js) ---------- */
let errorBanner = null;
const seenErrors = new Set();
function showError(text){
  if(seenErrors.has(text) || !document.body) return;
  seenErrors.add(text);
  if(!errorBanner){
    errorBanner = document.createElement('div');
    errorBanner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;'+
      'background:#3a0d0d;color:#ffb3b3;border:1px solid #a33;border-radius:4px;'+
      'padding:8px 14px;font:12px/1.5 monospace;max-width:90vw;';
    document.body.appendChild(errorBanner);
  }
  const line = document.createElement('div');
  line.textContent = text;
  errorBanner.appendChild(line);
}
window.onerror = (msg, src, line, col) => showError('Error: ' + msg + ' (line ' + line + ':' + col + ')');
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  showError('Error: ' + ((r && (r.message || r)) || 'unhandled rejection'));
});

/* ---------- localized text ----------
   Pages provide window.SNEEKIE_TEXT3D (inline, localized). English is the
   built-in fallback so the file also works standalone. */
const T3D_EN = {
  title2026: 'SNEEKIE 2026',
  byline: "© July '88 by HerbySoft · 3D remake 2026 by Claude Fable",
  score: 'Score', best: 'Best', level: 'Level', lives: 'Lives', bonus: 'Bonus',
  tapToStart: 'Tap, click or press any key',
  getReady: 'Eat every ♥ and ♣ — dodge the rest',
  stuck: 'No way out!',
  zapped: 'Zapped!',
  gameOver: 'Game over',
  newBest: 'New high score!',
  finalScore: 'Final score',
  playAgain: 'Play again',
  levelClear: 'Level cleared!',
  extraLife: '+1 life',
  theEnd: 'The End',
  allCleared: 'All 32 levels cleared — the snake rests.',
  botBadge: 'LIVE · Fable autopilot',
  webglMissing: 'The 2026 version needs WebGL2, which this browser or device does not provide. The 1988 version still plays!',
};
function tx(k){
  const t = window.SNEEKIE_TEXT3D || {};
  return t[k] !== undefined ? t[k] : (T3D_EN[k] !== undefined ? T3D_EN[k] : k);
}
/* mute-button labels reuse the page's 1988 SNEEKIE_TEXT strings */
function muteText(on){
  const t = window.SNEEKIE_TEXT || {};
  return on ? (t.soundOn || 'Sound: on') : (t.soundOff || 'Sound: off');
}
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } },
};

const BOT = window.SNEEKIE3D_BOT === true;   // the Bot page loads this file with the autopilot on

/* ---------- tiny math kit (column-major mat4, like WebGL wants) ---------- */
function m4ident(o){
  o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
}
function m4perspective(o, fovy, aspect, near, far){
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0);
  o[0] = f / aspect; o[5] = f;
  o[10] = (far + near) * nf; o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}
function m4lookAt(o, eye, at, up){
  let zx = eye[0]-at[0], zy = eye[1]-at[1], zz = eye[2]-at[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx*eye[0] + xy*eye[1] + xz*eye[2]);
  o[13] = -(yx*eye[0] + yy*eye[1] + yz*eye[2]);
  o[14] = -(zx*eye[0] + zy*eye[1] + zz*eye[2]);
  o[15] = 1;
  return o;
}
function m4ortho(o, l, r, b, t, n, f){
  o.fill(0);
  o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
  o[15] = 1;
  return o;
}
function m4mul(o, a, b){                     // o = a * b (o may not alias a or b)
  for(let c = 0; c < 4; c++){
    const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
    o[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
    o[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
    o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
    o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
  }
  return o;
}
/* model = translate(pos) * rotateY(yaw) * scale(s); normal mat3 = rotY * 1/s */
function m4compose(o, x, y, z, yaw, sx, sy, sz){
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o[0] = c*sx;  o[1] = 0;  o[2] = -s*sx; o[3] = 0;
  o[4] = 0;     o[5] = sy; o[6] = 0;     o[7] = 0;
  o[8] = s*sz;  o[9] = 0;  o[10] = c*sz; o[11] = 0;
  o[12] = x;    o[13] = y; o[14] = z;    o[15] = 1;
  return o;
}
function m3normalFromCompose(o, yaw, sx, sy, sz){
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o[0] = c/sx;  o[1] = 0;    o[2] = -s/sx;
  o[3] = 0;     o[4] = 1/sy; o[5] = 0;
  o[6] = s/sz;  o[7] = 0;    o[8] = c/sz;
  return o;
}
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function hash1(n){ const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/* ============================================================
   AUDIO — a small synthesizer. Where 1988 had one square-wave
   PC speaker, 2026 gets layered oscillators, filtered noise,
   a compressor, and a slow ambient pad. All synthesized live;
   no samples, no files.
   ============================================================ */
const Snd = (() => {
  let ac = null, master = null, sfxBus = null, padBus = null;
  let muted = false, padTimer = 0, padVoice = 0, started = false;
  let noiseBuf = null;

  function ensure(){
    if(!ac){
      try{
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = muted ? 0 : 1;
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 8;
        master.connect(comp); comp.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
        padBus = ac.createGain(); padBus.gain.value = 0.0; padBus.connect(master);
      }catch(_){ ac = null; }
    }
    if(ac && ac.state === 'suspended') ac.resume()?.catch(() => {});
    if(ac && !started){ started = true; startPad(); }
  }
  function setMuted(m){
    muted = m;
    if(master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.03);
  }
  function noise(){
    if(!noiseBuf){
      const len = ac.sampleRate * 0.5 | 0;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  /* one enveloped oscillator note */
  function tone({f = 440, f2 = 0, type = 'sine', vol = 0.2, at = 0.004, dur = 0.15,
                 rel = 0.06, delay = 0, lpf = 0, q = 1, bus = null}){
    if(!ac) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if(f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at);
    g.gain.setValueAtTime(vol, t0 + Math.max(at, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    let head = o;
    if(lpf){
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = lpf; fl.Q.value = q;
      o.connect(fl); head = fl;
    }
    head.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + rel + 0.05);
  }
  function hiss({vol = 0.1, dur = 0.15, bp = 0, hp = 0, lp = 0, q = 2, delay = 0, rate = 1}){
    if(!ac) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noise(); src.loop = true;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let head = src;
    if(bp){ const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; head.connect(f); head = f; }
    if(hp){ const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; head.connect(f); head = f; }
    if(lp){ const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; head.connect(f); head = f; }
    head.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  /* ---- the ambient pad: two detuned voices on a slow pentatonic drift ---- */
  const CHORDS = [
    [110.00, 164.81, 220.00, 329.63],   // A minor-ish
    [ 87.31, 130.81, 174.61, 261.63],   // F
    [ 98.00, 146.83, 196.00, 293.66],   // G
    [110.00, 130.81, 220.00, 246.94],   // Am add9 shade
  ];
  function padChord(freqs){
    if(!ac) return;
    const t0 = ac.currentTime;
    const dur = 11;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(1, t0 + 3.5);
    g.gain.setValueAtTime(1, t0 + dur - 3.5);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 420; fl.Q.value = 0.8;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 190;
    lfo.connect(lg); lg.connect(fl.frequency); lfo.start(t0); lfo.stop(t0 + dur);
    g.connect(fl); fl.connect(padBus);
    for(const f of freqs){
      for(const det of [-4, 3]){
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        og.gain.value = 0.016;
        o.connect(og); og.connect(g);
        o.start(t0); o.stop(t0 + dur);
      }
    }
    const bo = ac.createOscillator(), bg2 = ac.createGain();   // sub-bass root
    bo.type = 'triangle'; bo.frequency.value = freqs[0] / 2;
    bg2.gain.value = 0.07;
    bo.connect(bg2); bg2.connect(g);
    bo.start(t0); bo.stop(t0 + dur);
  }
  function startPad(){
    if(padTimer) return;
    padBus.gain.setTargetAtTime(1, ac.currentTime, 2);
    const step = () => {
      if(!ac) return;
      padChord(CHORDS[padVoice % CHORDS.length]);
      padVoice++;
      padTimer = setTimeout(step, 8000);
    };
    step();
    document.addEventListener('visibilitychange', () => {
      if(!ac) return;
      padBus.gain.setTargetAtTime(document.hidden ? 0 : 1, ac.currentTime, 0.4);
    });
  }

  /* ---- the game's voice ---- */
  return {
    ensure, setMuted,
    get muted(){ return muted; },
    eat(combo){                                     // heart: a rising pluck
      const p = Math.min(combo, 12);
      const f = 520 * Math.pow(2, p / 12);
      tone({f, type: 'triangle', vol: 0.22, dur: 0.09, lpf: 3200 });
      tone({f: f * 2, type: 'sine', vol: 0.10, dur: 0.14, delay: 0.012});
      hiss({vol: 0.05, dur: 0.06, hp: 6000});
    },
    club(){                                         // club: a two-note chime
      tone({f: 784, type: 'sine', vol: 0.20, dur: 0.16});
      tone({f: 1175, type: 'sine', vol: 0.16, dur: 0.26, delay: 0.07});
      tone({f: 2350, type: 'sine', vol: 0.05, dur: 0.30, delay: 0.07});
    },
    smiley(){                                       // -50: a sour descending womp
      tone({f: 340, f2: 70, type: 'sawtooth', vol: 0.22, dur: 0.5, lpf: 900, q: 6});
      tone({f: 220, f2: 55, type: 'square', vol: 0.10, dur: 0.5, lpf: 500});
    },
    bump(){                                         // nose against a wall
      tone({f: 130, f2: 70, type: 'sine', vol: 0.16, dur: 0.08});
      hiss({vol: 0.05, dur: 0.05, bp: 400, q: 3});
    },
    push(){                                         // shoving a stone
      hiss({vol: 0.12, dur: 0.16, bp: 300, q: 2, rate: 0.6});
      tone({f: 75, f2: 55, type: 'sine', vol: 0.16, dur: 0.14});
    },
    zap(){                                          // touched a hazard
      hiss({vol: 0.2, dur: 0.2, bp: 2600, q: 1.5});
      tone({f: 1800, f2: 120, type: 'sawtooth', vol: 0.16, dur: 0.22, lpf: 4000});
    },
    death(){                                        // the long fall
      tone({f: 110, f2: 36, type: 'sine', vol: 0.5, dur: 0.9, rel: 0.2});
      tone({f: 220, f2: 48, type: 'sawtooth', vol: 0.12, dur: 0.7, lpf: 700, q: 4});
      hiss({vol: 0.18, dur: 0.6, lp: 900, rate: 0.5});
    },
    stuckAlarm(){                                   // trapped: red-flash klaxon
      for(let i = 0; i < 3; i++)
        tone({f: 640, f2: 480, type: 'square', vol: 0.10, dur: 0.12, lpf: 2200, delay: i * 0.19});
    },
    fanfare(){                                      // level cleared
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone({f, type: 'sawtooth', vol: 0.11, dur: 0.16, lpf: 3600, delay: i * 0.09});
        tone({f: f * 2, type: 'sine', vol: 0.05, dur: 0.2, delay: i * 0.09});
      });
      tone({f: 1568, type: 'sine', vol: 0.09, dur: 0.5, delay: 0.36, rel: 0.3});
    },
    bonusTick(n){                                   // bonus draining into score
      tone({f: 900 + (n % 8) * 60, type: 'square', vol: 0.035, dur: 0.03, lpf: 5000});
    },
    extraLife(){
      [660, 880, 1320].forEach((f, i) => tone({f, type: 'triangle', vol: 0.12, dur: 0.12, delay: i * 0.07}));
    },
    ui(){ tone({f: 1200, type: 'sine', vol: 0.06, dur: 0.04}); },
    gameOver(){
      [392, 311.1, 261.6, 196].forEach((f, i) =>
        tone({f, type: 'triangle', vol: 0.14, dur: 0.3, delay: i * 0.24, lpf: 2000}));
      tone({f: 98, f2: 49, type: 'sine', vol: 0.3, dur: 1.4, delay: 0.9, rel: 0.4});
    },
    theEnd(){
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
        tone({f, type: 'triangle', vol: 0.12, dur: 0.4, delay: i * 0.13, rel: 0.25}));
    },
  };
})();

/* ============================================================
   WEBGL2 CORE — shaders, geometry, dynamic buffers.
   ============================================================ */
const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aInstA;
layout(location=4) in float aInstT;
uniform mat4 uVP;
uniform mat4 uModel;
uniform mat3 uNMat;
uniform mat4 uLightVP;
uniform float uInstanced;
out vec3 vPos;
out vec3 vNorm;
out vec3 vNormObj;
out vec2 vUV;
out float vTint;
out vec4 vShadow;
void main(){
  vNormObj = aNorm;
  vUV = aUV;
  vec3 p;
  if(uInstanced > 0.5){
    p = vec3(aPos.x, aPos.y * aInstA.w, aPos.z) + aInstA.xyz;
    vNorm = aNorm;
    vTint = aInstT;
  } else {
    p = (uModel * vec4(aPos, 1.0)).xyz;
    vNorm = uNMat * aNorm;
    vTint = 0.0;
  }
  vPos = p;
  vShadow = uLightVP * vec4(p, 1.0);
  gl_Position = uVP * vec4(p, 1.0);
}`;

/* depth-only pass for the shadow map: same attribute layout, no color */
const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 aInstA;
uniform mat4 uVP;
uniform mat4 uModel;
uniform float uInstanced;
void main(){
  vec3 p = uInstanced > 0.5
    ? vec3(aPos.x, aPos.y * aInstA.w, aPos.z) + aInstA.xyz
    : (uModel * vec4(aPos, 1.0)).xyz;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const DEPTH_FS = `#version 300 es
precision mediump float;
void main(){}`;

const LIT_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNorm;
in vec3 vNormObj;
in vec2 vUV;
in float vTint;
in vec4 vShadow;
uniform vec3 uColor;
uniform vec3 uColorB;
uniform float uMode;      // 0 plain, 1 floor, 2 stone, 3 snakeskin, 4 smiley
uniform float uAmb;
uniform float uSpec;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uTime;
uniform float uRim;
uniform mediump sampler2DShadow uShadow;
uniform float uShadowTexel;
uniform sampler2D uRefl;
uniform vec2 uViewport;
uniform float uReflOn;
uniform vec3 uLPos[12];
uniform vec3 uLCol[12];
uniform int uLCount;
out vec4 frag;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
/* 3x3 PCF against the sun's depth map */
float shadowFactor(vec3 N){
  vec3 s = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if(s.x <= 0.01 || s.x >= 0.99 || s.y <= 0.01 || s.y >= 0.99 || s.z >= 1.0) return 1.0;
  s.z -= clamp(0.0022 * (1.0 - dot(N, normalize(uLightDir))) + 0.0008, 0.0008, 0.0035);
  float sum = 0.0;
  for(int i = -1; i <= 1; i++)
    for(int j = -1; j <= 1; j++)
      sum += texture(uShadow, vec3(s.xy + vec2(float(i), float(j)) * uShadowTexel * 1.3, s.z));
  return sum / 9.0;
}
/* screen-space surface-gradient bump from a procedural height field */
vec3 bumpNormal(vec3 N, float h, float k){
  vec3 dpx = dFdx(vPos), dpy = dFdy(vPos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = (r1 * dhx + r2 * dhy) * (sign(det) / max(abs(det), 1e-6));
  return normalize(N - k * g);
}
void main(){
  vec3 N = normalize(vNorm);
  vec3 base = uColor;
  float spec = uSpec;
  float amb = uAmb;
  float gloss = 48.0;
  float h = 0.0;
  float bumpK = 0.0;
  float wet = 0.0;
  int mode = int(uMode + 0.5);
  if(mode == 1){
    // polished wet flagstones with grout lines
    vec2 g = vPos.xz;
    float n = vnoise(g * 0.33) * 0.55 + vnoise(g * 1.7) * 0.45;
    base *= 0.72 + 0.55 * n;
    float check = mod(floor(g.x) + floor(g.y), 2.0);
    base *= 0.95 + 0.09 * check;
    vec2 cellp = abs(fract(g) - 0.5);
    vec2 aa = fwidth(g) * 1.4;
    vec2 lm = smoothstep(vec2(0.5) - aa - vec2(0.02), vec2(0.5) - aa * 0.25, cellp);
    float line = max(lm.x, lm.y);
    base = mix(base, uColorB, line * 0.5);
    h = -line * 0.7 + n * 0.35 + vnoise(g * 6.0) * 0.12;
    bumpK = 0.22;
    wet = 0.30 + 0.70 * smoothstep(0.42, 0.72, vnoise(g * 0.37 + vec2(9.1)));  // puddle patches
    base *= 1.0 - wet * 0.18;
    spec = 0.45 + wet * 0.5; gloss = 120.0;
  } else if(mode == 2){
    // stone bricks, mapped per dominant face axis so courses stay level
    vec3 g = vPos;
    vec3 aN = abs(N);
    vec2 buv = aN.y > 0.6 ? g.xz : (aN.x > aN.z ? vec2(g.z, g.y) : vec2(g.x, g.y));
    float course = floor(buv.y * 2.0);
    vec2 bp = vec2(buv.x * 1.5 + mod(course, 2.0) * 0.5, buv.y * 2.0);
    float tint = hash21(floor(bp) + vec2(vTint));
    base *= 0.86 + 0.30 * tint;
    vec2 m = abs(fract(bp) - 0.5);
    float mortar = smoothstep(0.40, 0.5, max(m.x, m.y));
    base *= 1.0 - 0.30 * mortar;
    base *= 0.90 + 0.20 * vnoise(buv * 3.1);
    base *= 0.80 + 0.20 * clamp(g.y * 1.6, 0.0, 1.0);
    h = (1.0 - mortar) * 0.9 + tint * 0.3 + vnoise(buv * 7.0) * 0.35;
    bumpK = 0.45;
    spec = 0.10; gloss = 26.0;
    float moss = smoothstep(0.52, 0.80, vnoise(buv * 0.9 + vec2(3.7))) * clamp(1.3 - g.y, 0.0, 1.0);
    base = mix(base, vec3(0.012, 0.045, 0.010), moss * 0.75);
  } else if(mode == 3){
    // python skin: staggered diamond scales with per-scale glints, dark dorsal
    // saddles, pale flat belly, and a faint iridescent drift along the spine
    float u = vUV.x;
    float v = vUV.y;
    float dSide = abs(u - 0.5);
    float belly = 1.0 - smoothstep(0.13, 0.30, dSide);
    vec2 p = vec2(u * 20.0, v * 16.0);
    p.x += mod(floor(p.y), 2.0) * 0.5;
    vec2 f = fract(p) - 0.5;
    float dd = abs(f.x) + abs(f.y);
    float ridge = smoothstep(0.34, 0.62, dd);
    float glint = hash21(floor(p) + vec2(7.0));
    float saddle = smoothstep(0.52, 0.70, vnoise(vec2(v * 1.4, u * 2.4))) * (1.0 - belly);
    float fleck = smoothstep(0.76, 0.95, vnoise(vec2(v * 1.4 + 31.0, u * 2.4))) * (1.0 - belly);
    base = mix(base, uColor * 0.36, saddle * 0.9);
    base = mix(base, uColor * 1.55, fleck * 0.55);
    base = mix(base, uColorB, belly);
    base *= 0.74 + 0.34 * smoothstep(0.02, 0.30, dSide);            // dark dorsal crest
    base *= 0.86 + 0.28 * vnoise(vec2(v * 0.55 + 13.0, u * 1.2));   // organic mottling
    base += vec3(0.03, 0.09, 0.05) * sin(v * 0.9) * (1.0 - belly);
    base *= 1.0 - 0.22 * ridge;
    base *= 0.92 + 0.16 * glint;
    float dome = clamp(1.0 - dd * 1.55, 0.0, 1.0);
    h = dome * 0.9 + glint * 0.18;
    bumpK = 0.55;
    // matte skin: sparse per-scale glints instead of one wet plastic stripe
    spec = 0.30; gloss = 34.0;
    spec *= (1.0 - 0.7 * ridge) * (0.45 + 1.1 * glint);
  } else if(mode == 4){
    vec3 No = normalize(vNormObj);
    amb = max(amb, 0.55);
    if(No.z > 0.25){
      vec2 p = No.xy / No.z;
      float eye = min(length(p - vec2(-0.30, 0.28)), length(p - vec2(0.30, 0.28)));
      float face = smoothstep(0.11, 0.08, eye);
      float mouth = abs(length(p - vec2(0.0, 0.10)) - 0.46);
      face = max(face, smoothstep(0.085, 0.055, mouth) * step(p.y, -0.16));
      base = mix(base, vec3(0.020, 0.012, 0.004), face);
    }
    spec = 0.5; gloss = 60.0;
  } else if(mode == 5){
    // snake head skin: same scales and glints as the body, no belly banding
    float u = vUV.x;
    float v = vUV.y;
    vec2 p = vec2(u * 20.0, v * 16.0);
    p.x += mod(floor(p.y), 2.0) * 0.5;
    vec2 f = fract(p) - 0.5;
    float dd = abs(f.x) + abs(f.y);
    float ridge = smoothstep(0.34, 0.62, dd);
    float glint = hash21(floor(p) + vec2(7.0));
    base *= 0.86 + 0.28 * vnoise(vec2(v * 2.0 + 13.0, u * 2.0));
    base *= 1.0 - 0.22 * ridge;
    base *= 0.92 + 0.16 * glint;
    float dome = clamp(1.0 - dd * 1.55, 0.0, 1.0);
    h = dome * 0.9 + glint * 0.18;
    bumpK = 0.5;
    spec = 0.30; gloss = 34.0;
    spec *= (1.0 - 0.7 * ridge) * (0.45 + 1.1 * glint);
  }
  if(bumpK > 0.0) N = bumpNormal(N, h, bumpK);
  vec3 V = normalize(uCamPos - vPos);
  if(mode == 3 || mode == 5){
    // iridescent sheen creeping in at grazing angles
    float f2 = pow(1.0 - max(dot(N, V), 0.0), 1.6);
    base = mix(base, vec3(0.05, 0.22, 0.38), f2 * 0.30);
  }
  vec3 L = normalize(uLightDir);
  float sh = shadowFactor(N);
  float dif = max(dot(N, L), 0.0) * sh;
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), gloss) * spec * sh;
  vec3 sun = vec3(1.50, 1.40, 1.14);
  float hemi = 0.55 + 0.45 * max(N.y, 0.0);
  vec3 col = base * amb * hemi * vec3(0.72, 0.94, 0.86)
           + base * dif * sun
           + sun * sp;
  for(int i = 0; i < 12; i++){                // dynamic point lights
    if(i >= uLCount) break;
    vec3 ld = uLPos[i] - vPos;
    float d2 = dot(ld, ld);
    float att = 1.0 / (1.0 + 0.85 * d2);
    if(att < 0.004) continue;
    vec3 Ln = ld * inversesqrt(max(d2, 1e-4));
    vec3 Hp = normalize(Ln + V);
    col += uLCol[i] * att * (base * max(dot(N, Ln), 0.0)
         + vec3(0.7) * pow(max(dot(N, Hp), 0.0), gloss) * spec);
  }
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += vec3(0.10, 0.55, 0.18) * (rim * uRim);
  if(mode == 1 && uReflOn > 0.5){
    // planar reflection of the mirrored scene, rippled by the floor bump
    vec2 suv = gl_FragCoord.xy / uViewport + N.xz * 0.05;
    vec3 re = texture(uRefl, suv).rgb;
    vec3 rc = re * re * 4.0;
    float fresF = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    col += rc * (0.06 + 0.50 * fresF) * wet;
  }
  float fog = smoothstep(uFogRange.x, uFogRange.y, length(vPos - uCamPos));
  col = mix(col, uFogColor, fog * 0.9);
  frag = vec4(sqrt(clamp(col, 0.0, 4.0) * 0.25), 1.0);   // sqrt-encoded for the 8-bit HDR-ish target
}`;

const GLOW_VS = `#version 300 es
layout(location=0) in vec3 aCenter;
layout(location=1) in vec2 aCorner;
layout(location=2) in float aSize;
layout(location=3) in vec4 aColor;
uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vC;
out vec4 vCol;
out float vRing;
void main(){
  vC = aCorner;
  vCol = aColor;
  vRing = aSize < 0.0 ? 1.0 : 0.0;      // negative size marks a shockwave ring
  vec3 p = aCenter + (uRight * aCorner.x + uUp * aCorner.y) * abs(aSize);
  gl_Position = uVP * vec4(p, 1.0);
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vC;
in vec4 vCol;
in float vRing;
out vec4 frag;
void main(){
  float d = length(vC);
  float a;
  if(vRing > 0.5){
    a = smoothstep(0.30, 0.0, abs(d - 0.72));
    a *= a;
  } else {
    a = smoothstep(1.0, 0.0, d);
    a *= a;
  }
  frag = vec4(sqrt(clamp(vCol.rgb, 0.0, 4.0) * 0.25), vCol.a * a);
}`;

/* ---------- post stack: bright extract, blur, filmic composite ---------- */
const POST_VS = `#version 300 es
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
out vec4 frag;
void main(){
  vec3 e = texture(uScene, vUV).rgb;
  vec3 c = e * e * 4.0;
  frag = vec4(max(c - vec3(1.05), 0.0) / 3.0, 1.0);
}`;
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.227;
  c += texture(uTex, vUV + uDir * 1.385).rgb * 0.316;
  c += texture(uTex, vUV - uDir * 1.385).rgb * 0.316;
  c += texture(uTex, vUV + uDir * 3.231).rgb * 0.070;
  c += texture(uTex, vUV - uDir * 3.231).rgb * 0.070;
  frag = vec4(c, 1.0);
}`;
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uRipple;    // xy = screen uv of the blast, z = age in seconds
out vec4 frag;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03)) / (x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV;
  if(uRipple.z < 1.4){
    vec2 d = uv - uRipple.xy;
    d.x *= uRes.x / uRes.y;
    float dist = length(d);
    float w = sin(dist * 46.0 - uRipple.z * 15.0) * exp(-dist * 4.2) * exp(-uRipple.z * 2.6) * 0.016;
    uv += (dist > 1e-4 ? d / dist : vec2(0.0)) * w;
  }
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 off = cc * (0.0012 + 0.0030 * r2);       // subtle chromatic aberration
  vec3 col;
  col.r = texture(uScene, uv - off).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv + off).b;
  col = col * col * 4.0;                        // decode
  col += texture(uBloom, uv).rgb * 3.0 * 0.8;   // bloom
  col *= 1.22;                                  // exposure
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.22);              // filmic saturation push
  col *= 1.0 - 0.32 * smoothstep(0.12, 0.72, r2);       // vignette
  col += (hash21(vUV * uRes + fract(uTime) * 61.7) - 0.5) * 0.014;  // grain
  frag = vec4(col, 1.0);
}`;

function compileShader(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function makeProgram(gl, vsSrc, fsSrc, uniforms){
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('program: ' + gl.getProgramInfoLog(p));
  const u = {};
  for(const name of uniforms) u[name] = gl.getUniformLocation(p, name);
  return { p, u };
}

/* ---------- geometry builders (plain JS arrays) ---------- */
function buildCube(){
  // unit footprint, y from 0..1 so instances can scale height alone
  const P = [], N = [], U = [], I = [];
  // no bottom face (coplanar with the floor); every quad wound so that the
  // shared (base, base+2, base+1)(base, base+3, base+2) index pattern faces out
  const faces = [
    [[ .5,0,-.5],[ .5,0,.5],[ .5,1,.5],[ .5,1,-.5],[ 1,0,0]],
    [[-.5,0,.5],[-.5,0,-.5],[-.5,1,-.5],[-.5,1,.5],[-1,0,0]],
    [[-.5,1,-.5],[ .5,1,-.5],[ .5,1,.5],[-.5,1,.5],[ 0,1,0]],
    [[-.5,1,.5],[ .5,1,.5],[ .5,0,.5],[-.5,0,.5],[ 0,0,1]],
    [[ .5,1,-.5],[-.5,1,-.5],[-.5,0,-.5],[ .5,0,-.5],[ 0,0,-1]],
  ];
  for(const [a, b, c, d, n] of faces){
    const base = P.length / 3;
    for(const v of [a, b, c, d]){ P.push(...v); N.push(...n); }
    U.push(0,0, 1,0, 1,1, 0,1);
    I.push(base, base+2, base+1, base, base+3, base+2);
  }
  return { pos: P, norm: N, uv: U, idx: I };
}

function buildIcosphere(subdiv){
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v => { const l = Math.hypot(...v); return [v[0]/l, v[1]/l, v[2]/l]; });
  let faces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];
  const midCache = new Map();
  function midpoint(a, b){
    const key = a < b ? a + '_' + b : b + '_' + a;
    if(midCache.has(key)) return midCache.get(key);
    const va = verts[a], vb = verts[b];
    const m = [(va[0]+vb[0])/2, (va[1]+vb[1])/2, (va[2]+vb[2])/2];
    const l = Math.hypot(...m);
    verts.push([m[0]/l, m[1]/l, m[2]/l]);
    const idx = verts.length - 1;
    midCache.set(key, idx);
    return idx;
  }
  for(let s = 0; s < subdiv; s++){
    const next = [];
    for(const [a, b, c] of faces){
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = [], norm = [], uv = [], idx = [];
  for(const v of verts){
    pos.push(...v); norm.push(...v);
    uv.push(Math.atan2(v[2], v[0]) / (2 * Math.PI) + 0.5, Math.asin(clamp(v[1], -1, 1)) / Math.PI + 0.5);
  }
  for(const f of faces) idx.push(...f);
  return { pos, norm, uv, idx };
}

function recomputeNormals(mesh){
  const { pos, idx } = mesh;
  const n = new Array(pos.length).fill(0);
  for(let i = 0; i < idx.length; i += 3){
    const a = idx[i]*3, b = idx[i+1]*3, c = idx[i+2]*3;
    const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2];
    const vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    for(const o of [a, b, c]){ n[o] += nx; n[o+1] += ny; n[o+2] += nz; }
  }
  for(let i = 0; i < n.length; i += 3){
    const l = Math.hypot(n[i], n[i+1], n[i+2]) || 1;
    n[i] /= l; n[i+1] /= l; n[i+2] /= l;
  }
  mesh.norm = n;
  return mesh;
}

function buildRock(seed){
  const m = buildIcosphere(1);
  for(let i = 0; i < m.pos.length; i += 3){
    const h = hash1(seed * 91 + i * 7.3) - 0.5;
    const s = 1 + h * 0.52;
    m.pos[i] *= s; m.pos[i+1] *= s * 0.72; m.pos[i+2] *= s;
  }
  return recomputeNormals(m);
}

/* simple ear-clipping for a small simple polygon (used by the heart) */
function earClip(pts){
  const n = pts.length;
  let area = 0;
  for(let i = 0; i < n; i++){
    const [x1, y1] = pts[i], [x2, y2] = pts[(i+1)%n];
    area += x1*y2 - x2*y1;
  }
  const order = [];
  for(let i = 0; i < n; i++) order.push(area >= 0 ? i : n - 1 - i);   // force CCW
  const tris = [];
  const inTri = (p, a, b, c) => {
    const s1 = (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
    const s2 = (c[0]-b[0])*(p[1]-b[1]) - (c[1]-b[1])*(p[0]-b[0]);
    const s3 = (a[0]-c[0])*(p[1]-c[1]) - (a[1]-c[1])*(p[0]-c[0]);
    return s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9;
  };
  let guard = 0;
  while(order.length > 3 && guard++ < 5000){
    let clipped = false;
    for(let i = 0; i < order.length; i++){
      const i0 = order[(i + order.length - 1) % order.length];
      const i1 = order[i];
      const i2 = order[(i + 1) % order.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cross = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
      if(cross <= 1e-9) continue;                       // reflex corner
      let blocked = false;
      for(const j of order){
        if(j === i0 || j === i1 || j === i2) continue;
        if(inTri(pts[j], a, b, c)){ blocked = true; break; }
      }
      if(blocked) continue;
      tris.push(i0, i1, i2);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if(!clipped) break;                                 // degenerate: bail with what we have
  }
  if(order.length === 3) tris.push(order[0], order[1], order[2]);
  return tris;
}

/* extrude a 2D outline (xy) into a solid with depth on z */
function extrudeOutline(pts, depth){
  const tris = earClip(pts);
  const pos = [], norm = [], uv = [], idx = [];
  const n = pts.length;
  for(const [x, y] of pts){ pos.push(x, y, depth); norm.push(0, 0, 1); uv.push(0, 0); }
  for(const [x, y] of pts){ pos.push(x, y, -depth); norm.push(0, 0, -1); uv.push(0, 0); }
  for(let i = 0; i < tris.length; i += 3) idx.push(tris[i], tris[i+1], tris[i+2]);
  for(let i = 0; i < tris.length; i += 3) idx.push(n + tris[i], n + tris[i+2], n + tris[i+1]);
  for(let i = 0; i < n; i++){
    const j = (i + 1) % n;
    const [x1, y1] = pts[i], [x2, y2] = pts[j];
    let nx = y2 - y1, ny = x1 - x2;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const base = pos.length / 3;
    pos.push(x1, y1, depth,  x2, y2, depth,  x2, y2, -depth,  x1, y1, -depth);
    for(let k = 0; k < 4; k++){ norm.push(nx, ny, 0); uv.push(0, 0); }
    idx.push(base, base+2, base+1, base, base+3, base+2);
  }
  return { pos, norm, uv, idx };
}

function buildHeart(){
  const pts = [];
  const STEPS = 40;
  for(let i = 0; i < STEPS; i++){
    const t = (i / STEPS) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
    pts.push([x * 0.021, y * 0.021 + 0.02]);
  }
  return extrudeOutline(pts, 0.09);
}

function appendMesh(dst, src, tx, ty, tz, s){
  const base = dst.pos.length / 3;
  const sv = Array.isArray(s) ? s : [s, s, s];
  for(let i = 0; i < src.pos.length; i += 3){
    dst.pos.push(src.pos[i] * sv[0] + tx, src.pos[i+1] * sv[1] + ty, src.pos[i+2] * sv[2] + tz);
    const nx = src.norm[i] / sv[0], ny = src.norm[i+1] / sv[1], nz = src.norm[i+2] / sv[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    dst.norm.push(nx/l, ny/l, nz/l);
  }
  for(let i = 0; i < src.pos.length / 3; i++) dst.uv.push(0, 0);
  for(const i of src.idx) dst.idx.push(base + i);
  return dst;
}

function buildClub(){
  const m = { pos: [], norm: [], uv: [], idx: [] };
  const ball = buildIcosphere(1);
  appendMesh(m, ball, 0, 0.17, 0, 0.165);
  appendMesh(m, ball, -0.155, -0.03, 0, 0.165);
  appendMesh(m, ball, 0.155, -0.03, 0, 0.165);
  appendMesh(m, ball, 0, -0.20, 0, [0.055, 0.14, 0.055]);   // stem
  return m;
}

/* ---------- GPU-side mesh + dynamic-buffer helpers ---------- */
function uploadMesh(gl, mesh){
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bind = (loc, data, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  bind(0, mesh.pos, 3);
  bind(1, mesh.norm, 3);
  bind(2, mesh.uv, 2);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.idx.length };
}

const WALL_MAX = 1024;
function uploadInstancedCube(gl){
  const mesh = buildCube();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bind = (loc, data, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  bind(0, mesh.pos, 3);
  bind(1, mesh.norm, 3);
  bind(2, mesh.uv, 2);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, WALL_MAX * 5 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 20, 0);
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16);
  gl.vertexAttribDivisor(4, 1);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.idx.length, instBuf: inst, data: new Float32Array(WALL_MAX * 5), used: 0 };
}

/* snake tube: interleaved pos(3) norm(3) uv(2), streamed every frame */
const RING_SEG = 14, TUBE_MAX_RINGS = 1500;
function makeTube(gl){
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, TUBE_MAX_RINGS * RING_SEG * 8 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const idx = new Uint32Array((TUBE_MAX_RINGS - 1) * RING_SEG * 6);
  let k = 0;
  for(let r = 0; r < TUBE_MAX_RINGS - 1; r++){
    for(let s = 0; s < RING_SEG; s++){
      const a = r * RING_SEG + s;
      const b = r * RING_SEG + (s + 1) % RING_SEG;
      const c = a + RING_SEG, d = b + RING_SEG;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vb, verts: new Float32Array(TUBE_MAX_RINGS * RING_SEG * 8), rings: 0 };
}

/* billboards: interleaved center(3) corner(2) size(1) color(4), 6 verts/quad */
const BB_MAX = 700;
function makeBillboards(gl){
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, BB_MAX * 6 * 10 * 4, gl.DYNAMIC_DRAW);
  const stride = 40;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
  gl.bindVertexArray(null);
  return { vao, vb, data: new Float32Array(BB_MAX * 6 * 10), used: 0 };
}
const BB_CORNERS = [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
function pushBillboard(bb, x, y, z, size, r, g, b, a){
  if(bb.used >= BB_MAX) return;
  let o = bb.used * 60;
  for(const [cx, cy] of BB_CORNERS){
    bb.data[o] = x; bb.data[o+1] = y; bb.data[o+2] = z;
    bb.data[o+3] = cx; bb.data[o+4] = cy;
    bb.data[o+5] = size;
    bb.data[o+6] = r; bb.data[o+7] = g; bb.data[o+8] = b; bb.data[o+9] = a;
    o += 10;
  }
  bb.used++;
}

/* ============================================================
   THE WORLD — board constants, camera, and the frame renderer.
   ============================================================ */
/* the playfield: a 36x20 court inside a wall ring (38x22 with border),
   the same "whole maze on one screen" stage the 1988 game had */
const GW = 38, GH = 22;
const EMPTY = 0, WALL = 1, STONE = 2, HEART = 3, CLUB = 4, SMILEY = 5, SNAKE = 6;
const gxToWorld = gx => gx - GW / 2 + 0.5;
const gyToWorld = gy => gy - GH / 2 + 0.5;

/* albedos are authored in sRGB and converted to linear once: the whole
   pipeline lights in linear space and tonemaps at composite */
const lin = c => c.map(x => Math.pow(x, 2.2));
const COL = {
  bg:     lin([0.014, 0.024, 0.018]),
  floor:  lin([0.135, 0.170, 0.140]),
  floorB: lin([0.19, 0.28, 0.20]),
  wall:   lin([0.36, 0.40, 0.37]),
  stone:  lin([0.47, 0.41, 0.34]),
  snake:  lin([0.16, 0.52, 0.22]),
  belly:  lin([0.76, 0.80, 0.52]),
  head:   lin([0.15, 0.49, 0.20]),
  heart:  lin([0.92, 0.10, 0.22]),
  club:   lin([0.15, 0.76, 0.30]),
  smiley: lin([0.97, 0.80, 0.12]),
  eye:    lin([0.90, 0.60, 0.10]),
  pupil:  lin([0.02, 0.02, 0.02]),
  tongue: lin([0.80, 0.12, 0.16]),
  maw:    lin([0.48, 0.07, 0.08]),
  fang:   lin([0.92, 0.90, 0.82]),
  wisp:   [1.6, 0.35, 1.35],           // emissive: already linear, allowed >1
};
const ENC_BG = COL.bg.map(x => Math.sqrt(Math.min(4, x) * 0.25));
const LIGHT_DIR = (() => { const v = [-0.58, 0.70, 0.40], l = Math.hypot(...v); return v.map(x => x / l); })();

function buildTongue(){
  // a flat forked tongue in the xz plane, pointing +z, drawn double-sided
  const pos = [], norm = [], uv = [], idx = [];
  const quad = (a, b, c, d) => {
    const base = pos.length / 3;
    for(const v of [a, b, c, d]){ pos.push(...v); norm.push(0, 1, 0); uv.push(0, 0); }
    idx.push(base, base+1, base+2, base, base+2, base+3);
  };
  quad([-0.016, 0, 0], [0.016, 0, 0], [0.014, 0, 0.20], [-0.014, 0, 0.20]);          // shaft
  quad([-0.014, 0, 0.20], [0.002, 0, 0.20], [-0.052, 0, 0.34], [-0.068, 0, 0.31]);   // left prong
  quad([-0.002, 0, 0.20], [0.014, 0, 0.20], [0.068, 0, 0.31], [0.052, 0, 0.34]);     // right prong
  return { pos, norm, uv, idx };
}

/* ---------- canvas + GL ---------- */
const cv = document.getElementById('screen3d');
const bezel3d = document.getElementById('bezel3d');
let gl = null, R = null, glDead = false;

const SHADOW_SIZE = 2048;
function initGL(){
  gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if(!gl) return false;
  R = {
    lit: makeProgram(gl, LIT_VS, LIT_FS, ['uVP','uModel','uNMat','uInstanced','uColor','uColorB','uMode','uAmb','uSpec','uLightDir','uCamPos','uFogColor','uFogRange','uTime','uRim','uLightVP','uShadow','uShadowTexel','uRefl','uViewport','uReflOn','uLPos[0]','uLCol[0]','uLCount']),
    glow: makeProgram(gl, GLOW_VS, GLOW_FS, ['uVP','uRight','uUp']),
    depth: makeProgram(gl, DEPTH_VS, DEPTH_FS, ['uVP','uModel','uInstanced']),
    bright: makeProgram(gl, POST_VS, BRIGHT_FS, ['uScene']),
    blur: makeProgram(gl, POST_VS, BLUR_FS, ['uTex','uDir']),
    comp: makeProgram(gl, POST_VS, COMP_FS, ['uScene','uBloom','uTime','uRes','uRipple']),
    floor: uploadMesh(gl, (() => {
      const e = GW / 2 + 16, ez = GH / 2 + 12;
      return { pos: [-e,0,-ez, e,0,-ez, e,0,ez, -e,0,ez],
               norm: [0,1,0, 0,1,0, 0,1,0, 0,1,0], uv: [0,0, 1,0, 1,1, 0,1], idx: [0,2,1, 0,3,2] };
    })()),
    walls: uploadInstancedCube(gl),
    rocks: [0, 1, 2, 3].map(s => uploadMesh(gl, buildRock(s + 1))),
    heart: uploadMesh(gl, buildHeart()),
    club: uploadMesh(gl, buildClub()),
    ball: uploadMesh(gl, buildIcosphere(2)),
    bead: uploadMesh(gl, buildIcosphere(1)),
    tongue: uploadMesh(gl, buildTongue()),
    tube: makeTube(gl),
    bb: makeBillboards(gl),        // camera-facing additive glows
    fbb: makeBillboards(gl),       // floor-flat additive (shockwave rings)
    fsVAO: gl.createVertexArray(),
    model: new Float32Array(16),
    nmat: new Float32Array(9),
    vp: new Float32Array(16),
    proj: new Float32Array(16),
    view: new Float32Array(16),
    tmp: new Float32Array(16),
    lightVP: new Float32Array(16),
    rvp: new Float32Array(16),
    lpos: new Float32Array(36),
    lcol: new Float32Array(36),
    lcount: 0,
    tw: 0, th: 0,
    ripple: [0.5, 0.5, 99],
  };
  /* the sun's shadow map: one static directional light over the whole board */
  m4lookAt(R.view, [LIGHT_DIR[0] * 45, LIGHT_DIR[1] * 45, LIGHT_DIR[2] * 45], [0, 0, 0], [0, 1, 0]);
  m4ortho(R.tmp, -28, 28, -19, 19, 5, 95);
  m4mul(R.lightVP, R.tmp, R.view);
  R.shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, R.shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  R.shadowFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R.shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  return true;
}

/* offscreen render targets: 4x MSAA scene buffer, resolve texture, and a
   quarter-res ping-pong pair for the bloom blur — rebuilt on resize */
function makeTargets(){
  const w = cv.width, h = cv.height;
  if(!gl || (R.tw === w && R.th === h)) return;
  for(const k of ['msaaFBO', 'sceneFBO', 'bloomFBOA', 'bloomFBOB', 'reflFBO'])
    if(R[k]){ gl.deleteFramebuffer(R[k]); R[k] = null; }
  for(const k of ['msaaColor', 'msaaDepth', 'reflDepth'])
    if(R[k]){ gl.deleteRenderbuffer(R[k]); R[k] = null; }
  for(const k of ['sceneTex', 'bloomTexA', 'bloomTexB', 'reflTex'])
    if(R[k]){ gl.deleteTexture(R[k]); R[k] = null; }
  R.tw = w; R.th = h;
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 4);
  R.msaaColor = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, R.msaaColor);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
  R.msaaDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, R.msaaDepth);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  R.msaaFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.msaaFBO);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, R.msaaColor);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, R.msaaDepth);
  const tex = (w2, h2) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w2, h2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const fboFor = t => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return f;
  };
  R.sceneTex = tex(w, h);
  R.sceneFBO = fboFor(R.sceneTex);
  R.bw = Math.max(2, w >> 2); R.bh = Math.max(2, h >> 2);
  R.bloomTexA = tex(R.bw, R.bh);
  R.bloomFBOA = fboFor(R.bloomTexA);
  R.bloomTexB = tex(R.bw, R.bh);
  R.bloomFBOB = fboFor(R.bloomTexB);
  /* half-res planar-reflection target with its own depth */
  R.rw = Math.max(2, w >> 1); R.rh = Math.max(2, h >> 1);
  R.reflTex = tex(R.rw, R.rh);
  R.reflFBO = fboFor(R.reflTex);
  R.reflDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, R.reflDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, R.rw, R.rh);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, R.reflDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ---------- camera: a fixed tilt that always frames the whole maze ---------- */
const cam = {
  pitch: 0.90,             // radians down from horizontal
  fov: 0.78,
  dist: 30,                // distance that frames the whole maze (fitCamera)
  zoom: 0,                 // smoothed live distance: swoops in during play
  lx: 0, lz: 0,            // smoothed look-at target
  eye: [0, 20, 14], look: [0, 0, 0],
  right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
  aspect: 16 / 9,
  shake: 0, kick: 0, roll: 0,
};
function cameraDir(){
  return [0, Math.sin(cam.pitch), Math.cos(cam.pitch)];
}
function cornerFits(dist){
  const dir = cameraDir();
  const eye = [0, dir[1] * dist, dir[2] * dist];
  m4perspective(R.proj, cam.fov, cam.aspect, 0.1, 300);
  m4lookAt(R.view, eye, [0, 0, 0], [0, 1, 0]);
  m4mul(R.tmp, R.proj, R.view);
  const m = R.tmp;
  const ex = GW / 2 + 1.4, ez = GH / 2 + 1.2;
  for(const [x, y, z] of [[-ex,0,-ez],[ex,0,-ez],[-ex,1.4,ez],[ex,1.4,ez],[0,0,ez],[0,0,-ez]]){
    const w = m[3]*x + m[7]*y + m[11]*z + m[15];
    const cx = (m[0]*x + m[4]*y + m[8]*z + m[12]) / w;
    const cy = (m[1]*x + m[5]*y + m[9]*z + m[13]) / w;
    if(Math.abs(cx) > 0.94 || Math.abs(cy) > 0.92) return false;
  }
  return true;
}
function fitCamera(){
  if(!R) return;
  let lo = 8, hi = 120;
  for(let i = 0; i < 28; i++){
    const mid = (lo + hi) / 2;
    if(cornerFits(mid)) hi = mid; else lo = mid;
  }
  cam.dist = hi;
}
function checkResize(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(cv.clientWidth * dpr));
  const h = Math.max(2, Math.round(cv.clientHeight * dpr));
  if(cv.width !== w || cv.height !== h){
    cv.width = w; cv.height = h;
    cam.aspect = w / h;
    if(gl && R) makeTargets();
    fitCamera();
  }
}

/* ---------- shockwave rings + drifting firefly motes ---------- */
const shocks = [];
function spawnShock(x, z, size1, ttl, r, g, b, a){
  if(shocks.length < 24) shocks.push({ x, z, t: 0, ttl, size1, r, g, b, a });
}
function updateShocks(dt){
  for(let i = shocks.length - 1; i >= 0; i--){
    shocks[i].t += dt;
    if(shocks[i].t >= shocks[i].ttl) shocks.splice(i, 1);
  }
}
const motes = [];
for(let i = 0; i < 34; i++){
  motes.push({
    x: (Math.random() - 0.5) * (GW + 6),
    y: 0.3 + Math.random() * 1.8,
    z: (Math.random() - 0.5) * (GH + 6),
    ph: Math.random() * 9,
  });
}
const mists = [];
for(let i = 0; i < 7; i++){
  mists.push({ x: (Math.random() - 0.5) * GW, z: (Math.random() - 0.5) * GH, ph: Math.random() * 9 });
}
function updateMotes(dt, t){
  for(const mo of motes){
    mo.x += Math.sin(t * 0.13 + mo.ph) * dt * 0.5;
    mo.z += Math.cos(t * 0.11 + mo.ph * 1.7) * dt * 0.5;
    mo.y = clamp(mo.y + Math.sin(t * 0.4 + mo.ph) * dt * 0.14, 0.15, 2.4);
    if(mo.x > GW / 2 + 4) mo.x -= GW + 8;
    if(mo.x < -GW / 2 - 4) mo.x += GW + 8;
    if(mo.z > GH / 2 + 4) mo.z -= GH + 8;
    if(mo.z < -GH / 2 - 4) mo.z += GH + 8;
  }
  for(const mi of mists){
    mi.x += Math.sin(t * 0.05 + mi.ph) * dt * 0.45;
    mi.z += Math.cos(t * 0.045 + mi.ph * 1.3) * dt * 0.35;
    if(mi.x > GW / 2 + 2) mi.x -= GW + 4;
    if(mi.x < -GW / 2 - 2) mi.x += GW + 4;
    if(mi.z > GH / 2 + 2) mi.z -= GH + 4;
    if(mi.z < -GH / 2 - 2) mi.z += GH + 4;
  }
}

/* ---------- particles ---------- */
const PARTS_MAX = 320;
const parts = [];
function spawnBurst(x, y, z, col, n, speed, ttl, size, grav = 3.4){
  for(let i = 0; i < n; i++){
    if(parts.length >= PARTS_MAX) return;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
    const s = speed * (0.35 + Math.random() * 0.85);
    const horiz = Math.sqrt(Math.max(0, 1 - u * u));
    parts.push({
      x, y, z,
      vx: Math.cos(a) * horiz * s, vy: Math.abs(u) * s * 1.25 + speed * 0.3, vz: Math.sin(a) * horiz * s,
      ttl: ttl * (0.6 + Math.random() * 0.6), life: 0,
      size: size * (0.7 + Math.random() * 0.7),
      r: col[0], g: col[1], b: col[2], grav,
    });
  }
}
function updateParts(dt){
  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.life += dt;
    if(p.life >= p.ttl){ parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if(p.y < 0.03){ p.y = 0.03; p.vy = Math.abs(p.vy) * 0.35; }
  }
}

/* ---------- snake spine + tube streaming ---------- */
const spine = [];        // flat scratch: {x,y,z} points reused per frame
function catmull(p0, p1, p2, p3, t){
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3) * t2 + (-p0 + 3*p1 - 3*p2 + p3) * t3);
}
/* Fills R.tube.verts with rings along the snake and returns ring count.
   pts = [{x,z}...] head..tail world coords. */
function buildTubeMesh(pts, time){
  const SUB = 3;
  const n = pts.length;
  if(n < 2) return 0;
  spine.length = 0;
  for(let i = 0; i < n - 1; i++){
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for(let s = 0; s < SUB; s++){
      const t = s / SUB;
      spine.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), z: catmull(p0.z, p1.z, p2.z, p3.z, t) });
    }
  }
  spine.push({ x: pts[n-1].x, z: pts[n-1].z });
  const m = spine.length;
  // muscular sideways undulation, quiet at the head, alive along the body
  for(let i = 1; i < m - 1; i++){
    const tx = spine[i+1].x - spine[i-1].x, tz = spine[i+1].z - spine[i-1].z;
    const l = Math.hypot(tx, tz) || 1;
    const fade = Math.min(1, i / 9) * Math.min(1, (m - 1 - i) / 5) * 0.10;
    const w = Math.sin(i * 0.30 - time * 5.5) * fade;
    spine[i].x += (-tz / l) * w;
    spine[i].z += (tx / l) * w;
  }
  const rings = Math.min(m, TUBE_MAX_RINGS);
  const v = R.tube.verts;
  const pulses = G.pulses;
  let o = 0;
  let px = 0, pz = 0;
  for(let i = 0; i < rings; i++){
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(m - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    let l = Math.hypot(tx, tz);
    if(l < 1e-6){ tx = px; tz = pz; l = Math.hypot(tx, tz) || 1; }
    tx /= l; tz /= l; px = tx; pz = tz;
    // frames: N = up, B = T x N (horizontal, perpendicular)
    const bx = -tz, bz = tx;
    const along = i / (rings - 1);              // 0 head .. 1 tail
    let prof = 1;
    if(along < 0.10) prof = 0.60 + 0.40 * (along / 0.10);          // neck behind the skull
    if(along > 0.62) prof = Math.max(0.10, 1 - Math.pow((along - 0.62) / 0.38, 1.2) * 0.92);
    let r = 0.44 * prof;
    for(const pu of pulses){                    // a swallowed meal traveling down the body
      const d = i - pu.d;
      r *= 1 + 0.34 * Math.exp(-d * d / 26) * prof;
    }
    const rh = r * 1.08, ry = r * 0.86;         // flattened belly resting on the floor
    const cy = ry + 0.012;
    for(let s = 0; s < RING_SEG; s++){
      const ang = (s / RING_SEG) * Math.PI * 2;
      const cN = Math.cos(ang), sB = Math.sin(ang);
      const nx = bx * sB, ny = cN, nz = bz * sB;
      v[o++] = spine[i].x + bx * sB * rh;
      v[o++] = cy + cN * ry;
      v[o++] = spine[i].z + bz * sB * rh;
      v[o++] = nx; v[o++] = ny; v[o++] = nz;
      v[o++] = s / RING_SEG + (s === 0 ? 0.0001 : 0);   // u: 0 top, .5 belly
      v[o++] = i * 0.42;                                 // v along the body
    }
  }
  return rings;
}

/* ---------- per-draw helpers ---------- */
function drawLit(mesh, x, y, z, yaw, sx, sy, sz, color, colorB, mode, amb, spec, rim = 0){
  m4compose(R.model, x, y, z, yaw, sx, sy, sz);
  m3normalFromCompose(R.nmat, yaw, sx, sy, sz);
  gl.uniformMatrix4fv(R.lit.u.uModel, false, R.model);
  gl.uniformMatrix3fv(R.lit.u.uNMat, false, R.nmat);
  gl.uniform3fv(R.lit.u.uColor, color);
  gl.uniform3fv(R.lit.u.uColorB, colorB || color);
  gl.uniform1f(R.lit.u.uMode, mode);
  gl.uniform1f(R.lit.u.uAmb, amb);
  gl.uniform1f(R.lit.u.uSpec, spec);
  gl.uniform1f(R.lit.u.uRim, rim);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawBillboards(bb, additive, flatOnFloor){
  if(!bb.used) return;
  gl.useProgram(R.glow.p);
  gl.uniformMatrix4fv(R.glow.u.uVP, false, R.vp);
  gl.uniform3fv(R.glow.u.uRight, flatOnFloor ? [1, 0, 0] : cam.right);
  gl.uniform3fv(R.glow.u.uUp, flatOnFloor ? [0, 0, 1] : cam.up);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(bb.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bb.vb);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bb.data.subarray(0, bb.used * 60));
  gl.drawArrays(gl.TRIANGLES, 0, bb.used * 6);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

/* ============================================================
   GAME — the 1988 rules on a 2026 board.
   Levels echo the eight original layout archetypes in the same
   order the BASIC dispatched them: open court, line maze, rooms
   with doors, stone zigzag, walls with crawling gaps, climbing
   hazards, sweeping hazards, walls + stones. 32 levels, four
   difficulty tiers, faster and meaner each time around.
   ============================================================ */
const grid = new Uint8Array(GW * GH);
const gi = (x, y) => y * GW + x;
const inField = (x, y) => x >= 1 && x <= GW - 2 && y >= 1 && y <= GH - 2;

const G = {
  state: 'boot', stateT: 0, time: 0,
  level: 1, score: 0, best: 0, lives: 3,
  bonus: 10000, bdrain: 6,
  heartsLeft: 0, clubsLeft: 0,
  cells: [], tailGhost: { x: 18, y: 14 },
  dir: { x: 0, y: -1 }, queue: [],
  growPending: 0,
  cps: 5.2, stepDur: 1 / 5.2, acc: 0, idleAcc: 0,
  idle: false, bumped: false,
  clickTarget: null,
  combo: 0, lastEatAt: -9,
  wisps: [], gates: [], gatePeriod: 0.95, gateAcc: 0,
  pulses: [], eatFlash: 0, gape: 0,
  deathCause: '', explodeAt: 0, deathPos: null,
  speedMul: 1,
  wallsDirty: true,
};
const tierOf = level => Math.min(3, (level - 1) >> 3);

function setCells(x1, y1, x2, y2, v){
  for(let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for(let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      grid[gi(x, y)] = v;
}
const wallSeg = (x1, y1, x2, y2) => setCells(x1, y1, x2, y2, WALL);
const stoneAt = (x, y) => { grid[gi(x, y)] = STONE; };

/* level 1 shape: the empty court */
function layOpen(){}

/* level 2 shape: broken line segments (spirit of BASIC 1230) */
function laySegments(){
  wallSeg(5, 4, 14, 4);   wallSeg(23, 17, 32, 17);
  wallSeg(23, 4, 32, 4);  wallSeg(5, 17, 14, 17);
  wallSeg(5, 8, 5, 13);   wallSeg(32, 8, 32, 13);
  wallSeg(9, 10, 15, 10); wallSeg(22, 11, 28, 11);
  wallSeg(12, 13, 12, 16); wallSeg(25, 5, 25, 8);
}

/* level 3 shape: a grid of rooms with door gaps (spirit of 1500) */
function layRooms(){
  wallSeg(12, 1, 12, 20); wallSeg(25, 1, 25, 20);
  wallSeg(1, 7, 36, 7);   wallSeg(1, 14, 36, 14);
  for(const x of [12, 25]) for(const y of [3, 10, 17]) setCells(x, y, x, y + 1, EMPTY);
  for(const y of [7, 14]) for(const x of [5, 18, 31]) setCells(x, y, x + 1, y, EMPTY);
}

/* level 4 shape: zigzag rows of pushable stones (spirit of 1400) */
function layZigzag(){
  for(let x = 4; x <= 33; x += 3){
    stoneAt(x, 6 + ((x / 3) & 1));
    stoneAt(x, 15 + (((x / 3) + 1) & 1));
  }
  for(const [x, y] of [[6,10],[10,11],[14,10],[22,11],[26,10],[30,11]]) stoneAt(x, y);
}

/* levels 5+8 machinery: vertical walls whose gap crawls (spirit of 1670+2130) */
function gateOpenAt(g, y){ return ((y - g.gap + 20) % 20) < 4; }
function applyGate(g){
  for(let y = 1; y <= GH - 2; y++) grid[gi(g.x, y)] = gateOpenAt(g, y) ? EMPTY : WALL;
}
function layGates(){
  G.gates = [5, 11, 17, 23, 29].map((x, i) => ({ x, gap: 3 + i * 4 }));
  for(const g of G.gates) applyGate(g);
}
function gateStep(){
  for(const g of G.gates){
    const closing = g.gap;
    const opening = ((g.gap - 1 + 4) % 20) + 1;
    if(grid[gi(g.x, closing)] !== EMPTY) continue;    // a snake or stone sits in the door
    grid[gi(g.x, closing)] = WALL;
    grid[gi(g.x, opening)] = EMPTY;
    g.gap = (g.gap % 20) + 1;
    G.wallsDirty = true;
  }
}

/* levels 6/7 machinery: free-flying plasma wisps (spirit of the 1988 arrows) */
function makeWisp(x, y, dx, dy, speed){
  return { x, y, dx, dy, speed, phase: Math.random() * 7, trail: [] };
}
function layRisers(){
  const mul = 1 + tierOf(G.level) * 0.28;
  for(let x = 3; x <= 36; x += 3){
    if(x === 18) continue;                            // keep the spawn column honest
    G.wisps.push(makeWisp(x, 2 + ((x * 7) % 17), 0, -1, 2.1 * mul));
  }
}
function laySweepers(){
  const mul = 1 + tierOf(G.level) * 0.28;
  let flip = 1;
  for(let y = 3; y <= 18; y += 3){
    G.wisps.push(makeWisp(2 + ((y * 11) % 30), y, flip, 0, 2.9 * mul));
    flip = -flip;
  }
}

/* level 8 shape: crawling gates plus stone posts (spirit of 1750) */
function layStoneGates(){
  layGates();
  let k = 0;
  for(const x of [8, 14, 20, 26, 32]){
    for(let y = 4 + (k % 2) * 2; y <= 18; y += 5) if(!(x === 18)) stoneAt(x, y);
    k++;
  }
}

const LAYOUTS = [layOpen, laySegments, layRooms, layZigzag, layGates, layRisers, laySweepers, layStoneGates];

/* random item drop on an empty cell (the 1150 'place' of 2026) */
function placeItem(type){
  for(let tries = 0; tries < 400; tries++){
    const x = 1 + (Math.random() * (GW - 2) | 0);
    const y = 1 + (Math.random() * (GH - 2) | 0);
    if(grid[gi(x, y)] !== EMPTY) continue;
    if(G.gates.some(g => g.x === x)) continue;        // never drop loot in a doorway
    const h = G.cells[0];
    if(h && Math.abs(x - h.x) + Math.abs(y - h.y) < 3) continue;
    grid[gi(x, y)] = type;
    return true;
  }
  return false;
}

function buildLevel(level){
  const tier = tierOf(level);
  grid.fill(EMPTY);
  for(let x = 0; x < GW; x++){ grid[gi(x, 0)] = WALL; grid[gi(x, GH - 1)] = WALL; }
  for(let y = 0; y < GH; y++){ grid[gi(0, y)] = WALL; grid[gi(GW - 1, y)] = WALL; }
  G.gates = []; G.wisps = [];
  LAYOUTS[(level - 1) % 8]();
  setCells(18, 8, 18, 15, EMPTY);                     // the spawn lane stays clear
  G.cells = [];
  for(let y = 9; y <= 14; y++) G.cells.push({ x: 18, y });
  for(const c of G.cells) grid[gi(c.x, c.y)] = SNAKE;
  G.tailGhost = { x: 18, y: 15 };
  G.dir = { x: 0, y: -1 };
  G.queue = [];
  G.growPending = 0;
  G.clickTarget = null;
  G.idle = false; G.bumped = false;
  G.acc = 0; G.idleAcc = 0; G.gateAcc = 0;
  G.pulses = []; G.eatFlash = 0; G.gape = 0;
  G.combo = 0;
  G.bonus = 10000;
  G.bdrain = 6 + tier * 2;
  G.cps = [5.2, 6.2, 7.2, 8.2][tier];
  G.stepDur = 1 / (G.cps * G.speedMul);
  G.gatePeriod = 0.95 / (1 + tier * 0.25);
  G.heartsLeft = 0; G.clubsLeft = 0;
  for(let i = 0; i < 22; i++) if(placeItem(HEART)) G.heartsLeft++;
  for(let i = 0; i < 5 + tier * 2; i++) placeItem(SMILEY);
  G.wallsDirty = true;
  hudLevel(); hudBonus(); hudLives(); hudScore();
  markLevelTabs();
}

/* ---------- scoring ---------- */
let bestTimer = 0;
function addScore(n){
  G.score += n;
  if(G.score > G.best){
    G.best = G.score;
    if(!bestTimer) bestTimer = setTimeout(() => {
      bestTimer = 0; store.set('sneekie.highscore3d', String(G.best));
    }, 500);
  }
  hudScore();
}
addEventListener('pagehide', () => {
  if(bestTimer){ clearTimeout(bestTimer); bestTimer = 0; store.set('sneekie.highscore3d', String(G.best)); }
});

/* ---------- movement ---------- */
function headWorld(){
  const prog = G.idle || G.cells.length < 2 ? 1 : clamp(G.acc / G.stepDur, 0, 1);
  const cur = G.cells[0], from = G.cells[1] || G.tailGhost;
  return {
    x: gxToWorld(lerp(from.x, cur.x, prog)),
    z: gyToWorld(lerp(from.y, cur.y, prog)),
  };
}
function isPassableFor(v){ return v === EMPTY || v === HEART || v === CLUB; }
function canLeaveBy(dx, dy){
  const h = G.cells[0];
  const v = grid[gi(h.x + dx, h.y + dy)];
  if(isPassableFor(v) || v === SMILEY) return true;
  if(v === STONE) return grid[gi(h.x + dx * 2, h.y + dy * 2)] === EMPTY;
  return false;
}
function isStuck(){
  return ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => canLeaveBy(dx, dy));
}

function bump(){
  if(!G.bumped){
    G.bumped = true;
    Snd.bump();
    addScore(-10);
    cam.shake = Math.max(cam.shake, 0.10);
  }
  G.idle = true;
  if(isStuck()) startDeath('stuck');
}

function tryStep(){
  if(BOT) botSteer();
  else if(G.queue.length){
    const d = G.queue.shift();
    if(!(d.x === -G.dir.x && d.y === -G.dir.y)){ G.dir = d; G.bumped = false; }
  } else if(G.clickTarget){
    const d = routeNext(G.clickTarget);
    if(d){ G.dir = d; G.bumped = false; }
    else G.clickTarget = null;
  }
  if(G.bonus > 0){ G.bonus = Math.max(0, G.bonus - G.bdrain); hudBonus(); }
  const h = G.cells[0];
  const nx = h.x + G.dir.x, ny = h.y + G.dir.y;
  const c = grid[gi(nx, ny)];
  if(c === WALL || c === SNAKE){ bump(); return; }
  if(c === STONE){
    const bx = nx + G.dir.x, by = ny + G.dir.y;
    if(!inField(bx, by) || grid[gi(bx, by)] !== EMPTY){ bump(); return; }
    grid[gi(bx, by)] = STONE;
    grid[gi(nx, ny)] = EMPTY;
    Snd.push();
    spawnBurst(gxToWorld(bx), 0.25, gyToWorld(by), [0.55, 0.48, 0.38], 6, 1.4, 0.4, 0.09);
  }
  let grow = 0;
  if(c === HEART){
    G.heartsLeft--;
    grow = 2;
    G.combo = (G.time - G.lastEatAt < 3.5) ? G.combo + 1 : 0;
    G.lastEatAt = G.time;
    Snd.eat(G.combo);
    addScore(10);
    floatLabel(gxToWorld(nx), 0.8, gyToWorld(ny), G.combo >= 2 ? '+10 ×' + (G.combo + 1) : '+10', true);
    spawnBurst(gxToWorld(nx), 0.5, gyToWorld(ny), COL.heart, 16, 2.6, 0.6, 0.11);
    spawnShock(gxToWorld(nx), gyToWorld(ny), 1.8, 0.5, 1.3, 0.22, 0.35, 0.55);
    if(G.pulses.length < 12) G.pulses.push({ d: 0 });  // the meal travels down the body
    G.eatFlash = 1;
    cam.shake = Math.max(cam.shake, 0.07);
    cam.kick = Math.max(cam.kick, 0.045);
    placeItem(SMILEY);                                 // 1988: every heart seeds a smiley
    if(tierOf(G.level) >= 2 && placeItem(CLUB)) G.clubsLeft++;   // 17+: and a club to chase
  } else if(c === CLUB){
    G.clubsLeft--;
    grow = 3;
    Snd.club();
    addScore(25);
    floatLabel(gxToWorld(nx), 0.8, gyToWorld(ny), '+25', true);
    spawnBurst(gxToWorld(nx), 0.5, gyToWorld(ny), COL.club, 18, 2.8, 0.65, 0.11);
    spawnShock(gxToWorld(nx), gyToWorld(ny), 2.2, 0.55, 0.25, 1.3, 0.4, 0.55);
    if(G.pulses.length < 12) G.pulses.push({ d: 0 });
    G.eatFlash = 1;
    cam.shake = Math.max(cam.shake, 0.08);
    cam.kick = Math.max(cam.kick, 0.05);
  } else if(c === SMILEY){
    Snd.smiley();
    addScore(-50);
    floatLabel(gxToWorld(nx), 0.8, gyToWorld(ny), '-50', false);
    spawnBurst(gxToWorld(nx), 0.5, gyToWorld(ny), COL.smiley, 8, 1.8, 0.5, 0.10);
    placeItem(SMILEY);                                 // it always comes back
  }
  grid[gi(nx, ny)] = SNAKE;
  G.cells.unshift({ x: nx, y: ny });
  if(G.growPending > 0) G.growPending--;
  else {
    const t = G.cells.pop();
    grid[gi(t.x, t.y)] = EMPTY;
    G.tailGhost = t;
  }
  G.growPending += grow;
  G.idle = false; G.bumped = false;
  if(G.clickTarget && nx === G.clickTarget.x && ny === G.clickTarget.y) G.clickTarget = null;
  if(G.cells.length >= 420) { startDeath('stuck'); return; }   // the 15000-cell cap, scaled down
  if(G.heartsLeft <= 0 && G.clubsLeft <= 0) startClear();
}

/* ---------- routing: the 1988 click-route BFS, now on the 3D board ---------- */
const bfsSeen = new Uint8Array(GW * GH);
const bfsFirst = new Int8Array(GW * GH);
const bfsQueue = new Int16Array(GW * GH);
const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
function wispNear(x, y, pad){
  for(const w of G.wisps){
    const dx = x - w.x, dy = y - w.y;
    if(dx * dx + dy * dy < pad * pad) return true;
    const ahead = dx * w.dx + dy * w.dy;
    const side = Math.abs(dx * w.dy) + Math.abs(dy * w.dx);
    if(ahead > 0 && ahead < 3 && side < 0.9) return true;
  }
  return false;
}
function routeNext(target){
  const h = G.cells[0];
  const start = gi(h.x, h.y);
  const tgt = gi(target.x, target.y);
  if(start === tgt) return null;
  bfsSeen.fill(0);
  let head = 0, tail = 0;
  bfsSeen[start] = 1;
  bfsQueue[tail++] = start;
  let best = -1, bestDist = Math.abs(h.x - target.x) + Math.abs(h.y - target.y);
  while(head < tail){
    const idx = bfsQueue[head++];
    const x = idx % GW, y = (idx / GW) | 0;
    const dist = Math.abs(x - target.x) + Math.abs(y - target.y);
    if(idx !== start && dist < bestDist){ best = idx; bestDist = dist; }
    if(idx === tgt) break;
    for(let d = 0; d < 4; d++){
      const nx2 = x + DIRS[d].x, ny2 = y + DIRS[d].y;
      if(!inField(nx2, ny2)) continue;
      const ni = gi(nx2, ny2);
      if(bfsSeen[ni]) continue;
      const v = grid[ni];
      if(!isPassableFor(v)) continue;                  // routes around smileys, like 1988
      if(G.wisps.length && wispNear(nx2, ny2, 1.7)) continue;
      bfsSeen[ni] = 1;
      bfsFirst[ni] = idx === start ? d : bfsFirst[idx];
      bfsQueue[tail++] = ni;
    }
  }
  const end = bfsSeen[tgt] ? tgt : best;
  if(end < 0 || end === start || !bfsSeen[end]) return null;
  return DIRS[bfsFirst[end]];
}

/* ---------- the autopilot (Bot page) ---------- */
function floodCount(sx, sy){
  bfsSeen.fill(0);
  let head = 0, tail = 0, count = 0;
  bfsSeen[gi(sx, sy)] = 1;
  bfsQueue[tail++] = gi(sx, sy);
  while(head < tail && count < 260){
    const idx = bfsQueue[head++];
    count++;
    const x = idx % GW, y = (idx / GW) | 0;
    for(let d = 0; d < 4; d++){
      const nx2 = x + DIRS[d].x, ny2 = y + DIRS[d].y;
      if(!inField(nx2, ny2)) continue;
      const ni = gi(nx2, ny2);
      if(bfsSeen[ni]) continue;
      const v = grid[ni];
      if(v === WALL || v === SNAKE || v === STONE) continue;
      bfsSeen[ni] = 1;
      bfsQueue[tail++] = ni;
    }
  }
  return count;
}
const botSeen = new Uint8Array(GW * GH);
const botFirst = new Int8Array(GW * GH);
function botHunt(avoidDanger){
  const h = G.cells[0];
  const start = gi(h.x, h.y);
  botSeen.fill(0);
  let head = 0, tail = 0;
  botSeen[start] = 1;
  bfsQueue[tail++] = start;
  while(head < tail){
    const idx = bfsQueue[head++];
    const x = idx % GW, y = (idx / GW) | 0;
    if(idx !== start && (grid[idx] === HEART || grid[idx] === CLUB)) return DIRS[botFirst[idx]];
    for(let d = 0; d < 4; d++){
      const nx2 = x + DIRS[d].x, ny2 = y + DIRS[d].y;
      if(!inField(nx2, ny2)) continue;
      const ni = gi(nx2, ny2);
      if(botSeen[ni]) continue;
      const v = grid[ni];
      if(!isPassableFor(v)) continue;
      if(avoidDanger && G.wisps.length && wispNear(nx2, ny2, 1.9)) continue;
      botSeen[ni] = 1;
      botFirst[ni] = idx === start ? d : botFirst[idx];
      bfsQueue[tail++] = ni;
    }
  }
  return null;
}
function botSteer(){
  let dir = botHunt(true) || botHunt(false);
  if(!dir){
    // survival: take the move with the most breathing room
    const h = G.cells[0];
    let bestScore = -1;
    for(let d = 0; d < 4; d++){
      const dd = DIRS[d];
      if(dd.x === -G.dir.x && dd.y === -G.dir.y) continue;
      const nx2 = h.x + dd.x, ny2 = h.y + dd.y;
      const v = grid[gi(nx2, ny2)];
      let ok = isPassableFor(v) || v === SMILEY;
      if(!ok && v === STONE) ok = grid[gi(nx2 + dd.x, ny2 + dd.y)] === EMPTY;
      if(!ok) continue;
      let s = (v === STONE) ? 4 : floodCount(nx2, ny2);
      if(v === SMILEY) s -= 60;
      if(G.wisps.length && wispNear(nx2, ny2, 1.7)) s -= 400;
      if(dd.x === G.dir.x && dd.y === G.dir.y) s += 2;
      if(s > bestScore){ bestScore = s; dir = dd; }
    }
  }
  if(dir){
    if(!(dir.x === -G.dir.x && dir.y === -G.dir.y)){
      if(dir.x !== G.dir.x || dir.y !== G.dir.y) G.bumped = false;
      G.dir = dir;
    }
  }
}

/* ---------- hazards ---------- */
function updateWisps(dt){
  for(const w of G.wisps){
    w.x += w.dx * w.speed * dt;
    w.y += w.dy * w.speed * dt;
    if(w.y < 1) w.y += GH - 2;
    if(w.y > GH - 2) w.y -= GH - 2;
    if(w.x < 1) w.x += GW - 2;
    if(w.x > GW - 2) w.x -= GW - 2;
    w.trail.unshift([w.x, w.y]);
    if(w.trail.length > 10) w.trail.pop();
    if(Math.random() < dt * 5)
      spawnBurst(gxToWorld(w.x), 0.5, gyToWorld(w.y), COL.wisp, 1, 0.8, 0.5, 0.06, 0.6);
  }
  if(G.state !== 'play') return;
  const hw = headWorld();
  for(const w of G.wisps){
    const dx = gxToWorld(w.x) - hw.x, dz = gyToWorld(w.y) - hw.z;
    if(dx * dx + dz * dz < 0.42){ startDeath('zapped'); return; }
  }
}

/* ---------- state changes ---------- */
function startDeath(cause){
  if(G.state !== 'play') return;
  G.state = 'dying'; G.stateT = 0; G.explodeAt = 0;
  G.deathCause = cause;
  G.clickTarget = null;
  G.deathPos = headWorld();
  spawnShock(G.deathPos.x, G.deathPos.z, 5.5, 0.9, 1.7, 0.55, 0.18, 0.8);
  spawnBurst(G.deathPos.x, 0.5, G.deathPos.z, [1.4, 0.6, 0.15], 26, 3.6, 1.0, 0.13);
  if(R){
    const uv = worldToUV(G.deathPos.x, 0.4, G.deathPos.z);
    if(uv) R.ripple = [uv[0], uv[1], 0];
  }
  cam.shake = 0.55;
  cam.kick = -0.10;
  cam.roll = 0.05;
  Snd.death();
  if(cause === 'zapped') Snd.zap();
  if(cause === 'stuck'){ Snd.stuckAlarm(); hudToast(tx('stuck')); }
  else if(cause === 'zapped') hudToast(tx('zapped'));
  hudFlash('red');
}
function startClear(){
  G.state = 'clear'; G.stateT = 0;
  G.clickTarget = null;
  spawnShock(0, 0, 24, 1.3, 0.8, 1.5, 0.5, 0.55);
  if(R){
    const uv = worldToUV(0, 0.4, 0);
    if(uv) R.ripple = [uv[0], uv[1], 0];
  }
  Snd.fanfare();
  hudFlash('green');
  hudCard(tx('levelClear'), tx('extraLife'), '');
  for(let i = 0; i < 5; i++){
    const c = G.cells[Math.min(G.cells.length - 1, i * 7)];
    if(c) spawnBurst(gxToWorld(c.x), 0.6, gyToWorld(c.y), [0.6, 1, 0.5], 14, 3, 0.9, 0.12, 2);
  }
}
function showIntro(){
  G.state = 'intro'; G.stateT = 0;
  if(G.level === 1 && !BOT) hudCard(tx('title2026'), tx('byline') + ' · ' + tx('getReady'), tx('tapToStart'));
  else hudCard(tx('level') + ' ' + G.level, tx('getReady'), BOT ? '' : tx('tapToStart'));
}
function beginPlay(){
  if(G.state !== 'intro') return;
  hudCardHide();
  G.state = 'play'; G.stateT = 0; G.acc = 0; G.idleAcc = 0;
  if(!BOT){ G.idle = true; G.bumped = true; }   // 1988 manners: wait for the first command
}
function resetGame(){
  G.score = 0; G.lives = 3; G.level = 1;
  hudScore(); hudLives();
  buildLevel(1);
  showIntro();
}
function skipLevel(){                                  // F10, as in 1988
  if(G.state !== 'play' && G.state !== 'intro') return;
  G.level = G.level >= 32 ? 1 : G.level + 1;
  buildLevel(G.level);
  showIntro();
}

/* ============================================================
   HUD, INPUT, RENDER FRAME, MAIN LOOP.
   ============================================================ */
const hudEls = {};
function buildHud(){
  const hud = document.getElementById('hud3d');
  if(!hud) return;
  hud.innerHTML =
    '<div class="hud-top">' +
      '<span class="chip"><span class="lbl"></span> <b id="h3-score">0</b></span>' +
      '<span class="chip"><span class="lbl"></span> <b id="h3-best">0</b></span>' +
      '<span class="chip"><span class="lbl"></span> <b id="h3-level">1</b></span>' +
      '<span class="chip chip-lives"><span class="lbl"></span> <b id="h3-lives"></b></span>' +
      '<span class="chip chip-bonus"><span class="lbl"></span> <i class="bonusbar"><i id="h3-bonus"></i></i></span>' +
    '</div>' +
    '<div class="hud-flash" id="h3-flash"></div>' +
    '<div class="hud-toast" id="h3-toast" hidden></div>' +
    '<div class="hud-badge" id="h3-badge" hidden></div>' +
    '<div class="hud-card" id="h3-card" hidden><div>' +
      '<h2 id="h3-card-title"></h2><p id="h3-card-sub"></p><p class="hud-tap" id="h3-card-tap"></p>' +
    '</div></div>';
  const labels = [tx('score'), tx('best'), tx('level'), tx('lives'), tx('bonus')];
  hud.querySelectorAll('.chip .lbl').forEach((el, i) => { el.textContent = labels[i]; });
  for(const id of ['h3-score','h3-best','h3-level','h3-lives','h3-bonus','h3-flash','h3-toast','h3-badge','h3-card','h3-card-title','h3-card-sub','h3-card-tap'])
    hudEls[id] = document.getElementById(id);
  if(BOT && hudEls['h3-badge']){
    hudEls['h3-badge'].textContent = tx('botBadge');
    hudEls['h3-badge'].hidden = false;
  }
}
const hudCache = {};
function hudSet(id, value){
  if(hudCache[id] === value || !hudEls[id]) return;
  hudCache[id] = value;
  hudEls[id].textContent = value;
}
function hudScore(){
  const prev = hudCache['h3-score'];
  hudSet('h3-score', String(G.score));
  hudSet('h3-best', String(G.best));
  const el = hudEls['h3-score'];
  if(el && prev !== undefined && prev !== hudCache['h3-score']){
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
}
function hudLevel(){ hudSet('h3-level', String(G.level)); }
function hudLives(){
  const n = clamp(G.lives, 0, 99);
  hudSet('h3-lives', n <= 6 ? '♥'.repeat(n) : '♥×' + n);
}
function hudBonus(){
  if(!hudEls['h3-bonus']) return;
  const pct = clamp(G.bonus / 10000 * 100, 0, 100).toFixed(1) + '%';
  if(hudCache['h3-bonus'] !== pct){ hudCache['h3-bonus'] = pct; hudEls['h3-bonus'].style.width = pct; }
}
let flashTimer = 0;
function hudFlash(color){
  const el = hudEls['h3-flash'];
  if(!el) return;
  el.className = 'hud-flash is-' + color;
  if(flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = 'hud-flash'; flashTimer = 0; }, 650);
}
let toastTimer = 0;
function hudToast(msg){
  const el = hudEls['h3-toast'];
  if(!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); el.hidden = true; toastTimer = 0; }, 1600);
}
function hudCard(title, sub, tap){
  if(!hudEls['h3-card']) return;
  hudEls['h3-card-title'].textContent = title;
  hudEls['h3-card-sub'].textContent = sub;
  hudEls['h3-card-tap'].textContent = tap;
  hudEls['h3-card-tap'].hidden = !tap;
  hudEls['h3-card'].hidden = false;
}
function hudCardHide(){ if(hudEls['h3-card']) hudEls['h3-card'].hidden = true; }
/* floating score numbers rising from the point of impact */
function floatLabel(wx, wy, wz, text, good){
  const hud = document.getElementById('hud3d');
  if(!hud || !R) return;
  const uv = worldToUV(wx, wy, wz);
  if(!uv || uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) return;
  const el = document.createElement('span');
  el.className = 'hud-float' + (good ? '' : ' bad');
  el.textContent = text;
  el.style.left = (uv[0] * 100) + '%';
  el.style.top = ((1 - uv[1]) * 100) + '%';
  hud.appendChild(el);
  setTimeout(() => el.remove(), 980);
}

/* ---------- bot page UI: level tabs + speed slider ---------- */
const botTabs = new Map();
function markLevelTabs(){
  if(!BOT || !botTabs.size) return;
  const active = ((G.level - 1) % 8) + 1;
  botTabs.forEach((b, n) => b.setAttribute('aria-pressed', String(n === active)));
}
function initBotUI(){
  const tablist = document.getElementById('leveltabs');
  if(tablist){
    tablist.innerHTML = '';
    for(let n = 1; n <= 8; n++){
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tx('level') + ' ' + n;
      b.addEventListener('click', () => {
        Snd.ensure();
        G.level = n;
        buildLevel(n);
        showIntro();
      });
      tablist.appendChild(b);
      botTabs.set(n, b);
    }
    markLevelTabs();
  }
  const speed = document.getElementById('speed');
  const speedout = document.getElementById('speedout');
  if(speed){
    speed.min = '0'; speed.max = '10'; speed.step = '1';
    const apply = () => {
      const v = Number(speed.value);
      G.speedMul = 0.4 + v * 0.16;
      G.stepDur = 1 / (G.cps * G.speedMul);
      const label = G.speedMul.toFixed(1) + '×';
      if(speedout){ speedout.value = label; speedout.textContent = label; }
      speed.setAttribute('aria-valuetext', label);
    };
    speed.addEventListener('input', apply);
    apply();
  }
}

/* ---------- input ---------- */
function queueDir(d){
  Snd.ensure();
  if(G.state === 'intro'){
    beginPlay();
    if(!(d.x === -G.dir.x && d.y === -G.dir.y)) G.dir = d;
    return;
  }
  if(G.state === 'gameover' || G.state === 'theend'){ confirmEnd(); return; }
  if(G.state !== 'play') return;
  G.clickTarget = null;
  G.bumped = false;
  if(G.queue.length < 3) G.queue.push(d);
  if(G.idle){ G.idle = false; G.acc = G.stepDur; }    // stalled against a wall: react now
}
function confirmEnd(){
  if(G.stateT < 0.6) return;
  Snd.ui();
  resetGame();
}
function tapAt(clientX, clientY){
  if(G.state === 'intro'){ beginPlay(); return; }
  if(G.state === 'gameover' || G.state === 'theend'){ confirmEnd(); return; }
  if(G.state !== 'play') return;
  const cell = pickCell(clientX, clientY);
  if(cell){
    G.clickTarget = cell;
    G.bumped = false;
    if(G.idle){ G.idle = false; G.acc = G.stepDur; }
  }
}
function pickCell(clientX, clientY){
  const rect = cv.getBoundingClientRect();
  if(!rect.width || !rect.height) return null;
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  const tf = Math.tan(cam.fov / 2);
  const dx = cam.right[0] * nx * tf * cam.aspect + cam.up[0] * ny * tf + cam.fwd[0];
  const dy = cam.right[1] * nx * tf * cam.aspect + cam.up[1] * ny * tf + cam.fwd[1];
  const dz = cam.right[2] * nx * tf * cam.aspect + cam.up[2] * ny * tf + cam.fwd[2];
  if(Math.abs(dy) < 1e-6) return null;
  const t0 = (0.35 - cam.eye[1]) / dy;    // aim at item height, not the floor, to cancel parallax
  if(t0 <= 0) return null;
  const wx = cam.eye[0] + dx * t0, wz = cam.eye[2] + dz * t0;
  return {
    x: clamp(Math.round(wx + GW / 2 - 0.5), 1, GW - 2),
    y: clamp(Math.round(wz + GH / 2 - 0.5), 1, GH - 2),
  };
}
function initInput(){
  addEventListener('keydown', e => {
    if(BOT){ Snd.ensure(); return; }
    const k = e.key;
    let d = null;
    if(k === 'ArrowUp' || k === 'w' || k === 'W') d = { x: 0, y: -1 };
    else if(k === 'ArrowDown' || k === 's' || k === 'S') d = { x: 0, y: 1 };
    else if(k === 'ArrowLeft' || k === 'a' || k === 'A') d = { x: -1, y: 0 };
    else if(k === 'ArrowRight' || k === 'd' || k === 'D') d = { x: 1, y: 0 };
    if(d){ e.preventDefault(); queueDir(d); return; }
    if(k === 'F9'){                                   // extra life — shh!
      e.preventDefault();
      if(G.state === 'play' || G.state === 'intro'){ G.lives++; hudLives(); Snd.extraLife(); }
      return;
    }
    if(k === 'F10'){ e.preventDefault(); Snd.ensure(); skipLevel(); return; }
    if(k === 'Escape'){
      if(G.state === 'play'){ e.preventDefault(); startDeath('esc'); }
      return;
    }
    Snd.ensure();
    if(k === ' ' || k === 'Enter') e.preventDefault();
    if(G.state === 'intro') beginPlay();
    else if(G.state === 'gameover' || G.state === 'theend') confirmEnd();
  });

  let tStart = null;
  cv.addEventListener('touchstart', e => {
    Snd.ensure();
    const t = e.changedTouches[0];
    tStart = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    if(!tStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
    tStart = null;
    e.preventDefault();
    if(BOT) return;
    if(Math.hypot(dx, dy) < 24){ tapAt(t.clientX, t.clientY); return; }
    if(Math.abs(dx) > Math.abs(dy)) queueDir({ x: dx > 0 ? 1 : -1, y: 0 });
    else queueDir({ x: 0, y: dy > 0 ? 1 : -1 });
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    if(e.pointerType === 'touch') return;
    Snd.ensure();
    e.preventDefault();
    if(BOT) return;
    if(e.button === 0) tapAt(e.clientX, e.clientY);
  });

  const muteBtn = document.getElementById('mute');
  if(muteBtn){
    const paint = () => { muteBtn.textContent = muteText(!Snd.muted); };
    muteBtn.addEventListener('click', () => {
      Snd.ensure();
      Snd.setMuted(!Snd.muted);
      paint();
    });
    paint();
  }

  const fsBtn = document.getElementById('fs');
  if(fsBtn && bezel3d && bezel3d.requestFullscreen){
    fsBtn.addEventListener('click', () => {
      Snd.ensure();
      if(document.fullscreenElement) document.exitFullscreen()?.catch(() => {});
      else bezel3d.requestFullscreen()?.catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      fsBtn.setAttribute('aria-pressed', String(fs));
      if(fs && screen.orientation && screen.orientation.lock)
        screen.orientation.lock('landscape').catch(() => {});
      else if(!fs && screen.orientation && screen.orientation.unlock){
        try{ screen.orientation.unlock(); }catch(_){ }
      }
      if(navigator.keyboard && navigator.keyboard.lock){
        if(fs) navigator.keyboard.lock(['Escape']).catch(() => {});
        else navigator.keyboard.unlock();
      }
    });
  } else if(fsBtn){
    fsBtn.style.display = 'none';
  }

  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); glDead = true; });
  cv.addEventListener('webglcontextrestored', () => {
    try{ if(initGL()){ glDead = false; G.wallsDirty = true; fitCamera(); } }
    catch(err){ showError('WebGL restore: ' + err.message); }
  });
}

/* ---------- per-state update ---------- */
let drainAcc = 0, drainTick = 0;
function update(dt, t){
  G.time = t;
  G.stateT += dt;
  updateParts(dt);
  updateShocks(dt);
  updateMotes(dt, t);
  cam.shake *= Math.exp(-3.4 * dt);
  cam.kick *= Math.exp(-6.5 * dt);
  cam.roll *= Math.exp(-4.0 * dt);
  G.eatFlash *= Math.exp(-3.0 * dt);
  if(R && R.ripple[2] < 90) R.ripple[2] += dt;
  /* the jaws gape when prey is within striking range */
  let gapeT = 0;
  if(G.state === 'play'){
    const h = G.cells[0];
    for(let dy = -2; dy <= 2 && !gapeT; dy++) for(let dx = -2; dx <= 2; dx++){
      if(Math.abs(dx) + Math.abs(dy) > 2) continue;
      const v = grid[gi(clamp(h.x + dx, 0, GW - 1), clamp(h.y + dy, 0, GH - 1))];
      if(v === HEART || v === CLUB){ gapeT = 1; break; }
    }
  }
  G.gape += (gapeT - G.gape) * Math.min(1, dt * 7);
  if(G.state === 'play' && !G.idle && G.pulses.length){
    // swallowed meals stay put in the world, so they slide tailward at body speed
    const v = G.cps * G.speedMul * 3 * dt;
    for(const pu of G.pulses) pu.d += v;
    const maxD = G.cells.length * 3 + 8;
    G.pulses = G.pulses.filter(pu => pu.d < maxD);
  }
  updateWisps(dt);

  if(G.state === 'play'){
    G.gateAcc += dt;
    while(G.gateAcc >= G.gatePeriod){ G.gateAcc -= G.gatePeriod; gateStep(); }
    if(G.idle && !BOT){
      // stalled against a wall (or waiting for the first command): the snake
      // holds still until new input, but the bonus keeps draining — no camping
      G.idleAcc += dt;
      while(G.idleAcc >= G.stepDur){
        G.idleAcc -= G.stepDur;
        if(G.bonus > 0){ G.bonus = Math.max(0, G.bonus - G.bdrain); hudBonus(); }
      }
    } else {
      G.acc += dt;
      let guard = 0;
      while(G.acc >= G.stepDur && guard++ < 5){
        G.acc -= G.stepDur;
        tryStep();
        if(G.state !== 'play') break;
        if(G.idle){ G.acc = 0; break; }
      }
    }
  } else if(G.state === 'dying'){
    const want = Math.floor(clamp(G.stateT / 0.9, 0, 1) * G.cells.length);
    while(G.explodeAt < want){
      const c = G.cells[G.explodeAt];
      if(c) spawnBurst(gxToWorld(c.x), 0.35, gyToWorld(c.y), [0.9, 0.28, 0.14], 5, 2.6, 0.7, 0.11);
      G.explodeAt++;
    }
    if(G.stateT > 1.25){
      G.lives--;
      hudLives();
      if(G.lives <= 0){
        G.state = 'gameover'; G.stateT = 0;
        Snd.gameOver();
        const nb = G.score >= G.best && G.score > 0;
        store.set('sneekie.highscore3d', String(G.best));
        hudCard(tx('gameOver'), tx('finalScore') + ': ' + G.score + (nb ? ' · ' + tx('newBest') : ''), BOT ? '' : tx('playAgain'));
      } else {
        buildLevel(G.level);
        showIntro();
      }
    }
  } else if(G.state === 'clear'){
    if(G.bonus > 0){
      drainAcc += dt * 9000;
      const k = Math.min(G.bonus, Math.floor(drainAcc));
      if(k > 0){
        drainAcc -= k;
        G.bonus -= k;
        addScore(k);
        hudBonus();
        drainTick += k;
        if(drainTick > 320){ drainTick = 0; Snd.bonusTick(G.bonus); }
      }
    }
    if(G.bonus <= 0 && G.stateT > 1.7){
      G.lives++;                                       // 1070: LIVE = LIVE + 1
      hudLives();
      Snd.extraLife();
      hudCardHide();
      G.level++;
      if(G.level > 32){
        G.state = 'theend'; G.stateT = 0;
        Snd.theEnd();
        hudCard(tx('theEnd'), tx('allCleared') + ' · ' + tx('finalScore') + ': ' + G.score, BOT ? '' : tx('playAgain'));
      } else {
        buildLevel(G.level);
        showIntro();
      }
    }
  } else if(G.state === 'intro'){
    if(BOT && G.stateT > 0.8) beginPlay();
  } else if(G.state === 'gameover' || G.state === 'theend'){
    if(BOT && G.stateT > 3) resetGame();
  }
}

/* ---------- the frame ---------- */
function bindLitCommon(vp, eye, withRefl){
  gl.useProgram(R.lit.p);
  gl.uniformMatrix4fv(R.lit.u.uVP, false, vp || R.vp);
  gl.uniformMatrix4fv(R.lit.u.uLightVP, false, R.lightVP);
  gl.uniform3fv(R.lit.u.uLightDir, LIGHT_DIR);
  gl.uniform3fv(R.lit.u.uCamPos, eye || cam.eye);
  gl.uniform3fv(R.lit.u.uFogColor, COL.bg);
  gl.uniform2f(R.lit.u.uFogRange, cam.zoom * 1.3, cam.zoom * 3.6);
  gl.uniform1f(R.lit.u.uTime, G.time);
  gl.uniform1f(R.lit.u.uInstanced, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, R.shadowTex);
  gl.uniform1i(R.lit.u.uShadow, 0);
  gl.uniform1f(R.lit.u.uShadowTexel, 1 / SHADOW_SIZE);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, withRefl ? R.reflTex : null);
  gl.uniform1i(R.lit.u.uRefl, 1);
  gl.uniform1f(R.lit.u.uReflOn, withRefl ? 1 : 0);
  gl.uniform2f(R.lit.u.uViewport, R.tw, R.th);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform3fv(R.lit.u['uLPos[0]'], R.lpos);
  gl.uniform3fv(R.lit.u['uLCol[0]'], R.lcol);
  gl.uniform1i(R.lit.u.uLCount, R.lcount);
}

/* six braziers burn on top of the border walls */
const BRAZIERS = [[-18.5, -10.5], [18.5, -10.5], [-18.5, 10.5], [18.5, 10.5], [0, -10.5], [0, 10.5]];
function brazierFlick(i, t){
  const k = Math.floor(t * 9) + i * 77;
  return lerp(hash1(k), hash1(k + 1), (t * 9) % 1);
}

/* up to 12 dynamic point lights: the death fireball, brazier fires, wisps,
   the eat-flash on the snake, then glowing loot near the head */
function collectLights(hw, t){
  R.lcount = 0;
  const add = (x, y, z, r, g, b) => {
    if(R.lcount >= 12) return;
    const o = R.lcount * 3;
    R.lpos[o] = x; R.lpos[o + 1] = y; R.lpos[o + 2] = z;
    R.lcol[o] = r; R.lcol[o + 1] = g; R.lcol[o + 2] = b;
    R.lcount++;
  };
  if(G.state === 'dying' && G.stateT < 0.7 && G.deathPos){
    const k = (1 - G.stateT / 0.7) * 5;
    add(G.deathPos.x, 0.8, G.deathPos.z, 2.2 * k, 0.8 * k, 0.25 * k);
  }
  for(let i = 0; i < BRAZIERS.length; i++){
    const f = 0.65 + 0.5 * brazierFlick(i, t);
    add(BRAZIERS[i][0], 1.75, BRAZIERS[i][1], 1.45 * f, 0.62 * f, 0.16 * f);
  }
  const nearWisps = G.wisps
    .map(w => ({ w, d: (gxToWorld(w.x) - cam.lx) ** 2 + (gyToWorld(w.y) - cam.lz) ** 2 }))
    .sort((a, b2) => a.d - b2.d)
    .slice(0, 4);
  for(const { w } of nearWisps)
    add(gxToWorld(w.x), 0.6, gyToWorld(w.y), 1.35, 0.30, 1.15);
  if(G.eatFlash > 0.05 && hw)
    add(hw.x, 0.7, hw.z, 0.35 * G.eatFlash, 2.2 * G.eatFlash, 0.55 * G.eatFlash);
  if(R.lcount < 12 && hw){
    const loot = [];
    for(let y = 1; y < GH - 1; y++) for(let x = 1; x < GW - 1; x++){
      const v = grid[gi(x, y)];
      if(v !== HEART && v !== CLUB) continue;
      const wx = gxToWorld(x), wz = gyToWorld(y);
      loot.push([(wx - hw.x) * (wx - hw.x) + (wz - hw.z) * (wz - hw.z), wx, wz, v]);
    }
    loot.sort((a, b2) => a[0] - b2[0]);
    for(const [, wx, wz, v] of loot){
      if(R.lcount >= 12) break;
      if(v === HEART) add(wx, 0.55, wz, 0.85, 0.06, 0.14);
      else add(wx, 0.55, wz, 0.10, 0.75, 0.20);
    }
  }
}

/* transforms shared by the shadow pass and the scene pass */
function drawDepth(mesh, x, y, z, yaw, sx, sy, sz){
  m4compose(R.model, x, y, z, yaw, sx, sy, sz);
  gl.uniformMatrix4fv(R.depth.u.uModel, false, R.model);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}
function headPose(){
  if(chainPts.length < 2) return null;
  const a = chainPts[0], b = chainPts[Math.min(2, chainPts.length - 1)];
  let hx = a.x - b.x, hz = a.z - b.z;
  const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  return { hx, hz, yaw: Math.atan2(hx, hz), hpx: a.x + hx * 0.22, hpz: a.z + hz * 0.22 };
}
/* renders every caster into the sun's depth map; item transforms must stay
   in step with the scene pass below */
function renderShadow(rings, t){
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFBO);
  gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(R.depth.p);
  gl.uniformMatrix4fv(R.depth.u.uVP, false, R.lightVP);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2, 6);
  gl.cullFace(gl.FRONT);
  if(R.walls.used){
    gl.uniform1f(R.depth.u.uInstanced, 1);
    gl.bindVertexArray(R.walls.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, R.walls.count, gl.UNSIGNED_SHORT, 0, R.walls.used);
  }
  gl.uniform1f(R.depth.u.uInstanced, 0);
  for(let y = 1; y < GH - 1; y++) for(let x = 1; x < GW - 1; x++){
    const v = grid[gi(x, y)];
    if(v < STONE || v > SMILEY) continue;
    const wx = gxToWorld(x), wz = gyToWorld(y);
    const ph = hash1(x * 31 + y * 17) * 7;
    if(v === STONE) drawDepth(R.rocks[(x * 7 + y * 13) & 3], wx, 0.26, wz, ph * 2, 0.46, 0.46, 0.46);
    else {
      const bobY = 0.48 + Math.sin(t * 2.1 + ph) * 0.06;
      if(v === HEART) drawDepth(R.heart, wx, bobY, wz, t * 1.5 + ph, 1.1, 1.1, 1.1);
      else if(v === CLUB) drawDepth(R.club, wx, bobY, wz, -t * 1.3 + ph, 1.15, 1.15, 1.15);
      else drawDepth(R.ball, wx, bobY, wz, 0, 0.34, 0.34, 0.34);
    }
  }
  if(rings > 1){
    m4ident(R.model);
    gl.uniformMatrix4fv(R.depth.u.uModel, false, R.model);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(R.tube.vao);
    gl.drawElements(gl.TRIANGLES, (rings - 1) * RING_SEG * 6, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
  }
  const hp = headPose();
  if(hp && (G.state !== 'dying' || G.explodeAt === 0)){
    drawDepth(R.ball, hp.hpx, 0.40, hp.hpz, hp.yaw, 0.45, 0.33, 0.68);
    drawDepth(R.ball, hp.hpx + hp.hx * 0.46, 0.33, hp.hpz + hp.hz * 0.46, hp.yaw, 0.31, 0.22, 0.42);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.cullFace(gl.BACK);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* resolve MSAA, extract brights, blur at quarter res, composite filmically */
function postProcess(t){
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.msaaFBO);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.sceneFBO);
  gl.blitFramebuffer(0, 0, R.tw, R.th, 0, 0, R.tw, R.th, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(R.fsVAO);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomFBOA);
  gl.viewport(0, 0, R.bw, R.bh);
  gl.useProgram(R.bright.p);
  gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
  gl.uniform1i(R.bright.u.uScene, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(R.blur.p);
  gl.uniform1i(R.blur.u.uTex, 0);
  for(let i = 0; i < 2; i++){
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomFBOB);
    gl.bindTexture(gl.TEXTURE_2D, R.bloomTexA);
    gl.uniform2f(R.blur.u.uDir, 1 / R.bw, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.bloomFBOA);
    gl.bindTexture(gl.TEXTURE_2D, R.bloomTexB);
    gl.uniform2f(R.blur.u.uDir, 0, 1 / R.bh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R.tw, R.th);
  gl.useProgram(R.comp.p);
  gl.bindTexture(gl.TEXTURE_2D, R.sceneTex);
  gl.uniform1i(R.comp.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, R.bloomTexA);
  gl.uniform1i(R.comp.u.uBloom, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(R.comp.u.uTime, t);
  gl.uniform2f(R.comp.u.uRes, R.tw, R.th);
  gl.uniform3fv(R.comp.u.uRipple, R.ripple);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
}
function rebuildWalls(){
  const w = R.walls;
  let k = 0;
  for(let y = 0; y < GH; y++) for(let x = 0; x < GW; x++){
    if(grid[gi(x, y)] !== WALL || k >= WALL_MAX) continue;
    const border = x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
    const o = k * 5;
    w.data[o] = gxToWorld(x);
    w.data[o + 1] = 0;
    w.data[o + 2] = gyToWorld(y);
    w.data[o + 3] = border ? 1.12 : 0.84 + hash1(x * 51 + y) * 0.14;
    w.data[o + 4] = hash1(x * 7 + y * 131) * 8;
    k++;
  }
  w.used = k;
  gl.bindBuffer(gl.ARRAY_BUFFER, w.instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, w.data.subarray(0, k * 5));
  G.wallsDirty = false;
}
/* ---------- draw units shared by the reflection and scene passes ---------- */
const chainPts = [];
function worldToUV(x, y, z){
  const m = R.vp;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if(w <= 0) return null;
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5,
          (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5];
}
function drawBoardMeshes(t, withGlow){
  for(let y = 1; y < GH - 1; y++) for(let x = 1; x < GW - 1; x++){
    const v = grid[gi(x, y)];
    if(v < STONE || v > SMILEY) continue;
    const wx = gxToWorld(x), wz = gyToWorld(y);
    const ph = hash1(x * 31 + y * 17) * 7;
    if(v === STONE){
      drawLit(R.rocks[(x * 7 + y * 13) & 3], wx, 0.26, wz, ph * 2, 0.46, 0.46, 0.46, COL.stone, null, 2, 0.38, 0.22);
    } else {
      const bobY = 0.48 + Math.sin(t * 2.1 + ph) * 0.06;
      if(v === HEART){
        drawLit(R.heart, wx, bobY, wz, t * 1.5 + ph, 1.1, 1.1, 1.1, COL.heart, null, 0, 0.58, 1.0);
        if(withGlow) pushBillboard(R.bb, wx, bobY, wz, 0.72 + Math.sin(t * 2.4 + ph) * 0.10, 1, 0.2, 0.3, 0.22);
      } else if(v === CLUB){
        drawLit(R.club, wx, bobY, wz, -t * 1.3 + ph, 1.15, 1.15, 1.15, COL.club, null, 0, 0.55, 0.9);
        if(withGlow) pushBillboard(R.bb, wx, bobY, wz, 0.7, 0.3, 1, 0.4, 0.18);
      } else if(v === SMILEY){
        const yaw = Math.atan2(cam.eye[0] - wx, cam.eye[2] - wz);
        drawLit(R.ball, wx, bobY, wz, yaw, 0.34, 0.34, 0.34, COL.smiley, null, 4, 0.5, 0.5);
        if(withGlow) pushBillboard(R.bb, wx, bobY, wz, 0.5, 1, 0.85, 0.2, 0.11);
      }
    }
  }
}
function drawWalls(){
  if(!R.walls.used) return;
  gl.uniform1f(R.lit.u.uInstanced, 1);
  gl.uniform3fv(R.lit.u.uColor, COL.wall);
  gl.uniform3fv(R.lit.u.uColorB, COL.wall);
  gl.uniform1f(R.lit.u.uMode, 2);
  gl.uniform1f(R.lit.u.uAmb, 0.28);
  gl.uniform1f(R.lit.u.uSpec, 0.06);
  gl.uniform1f(R.lit.u.uRim, 0);
  gl.bindVertexArray(R.walls.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, R.walls.count, gl.UNSIGNED_SHORT, 0, R.walls.used);
  gl.uniform1f(R.lit.u.uInstanced, 0);
}
function drawSnakeTube(rings){
  if(rings < 2) return;
  m4ident(R.model);
  gl.uniformMatrix4fv(R.lit.u.uModel, false, R.model);
  R.nmat.fill(0); R.nmat[0] = R.nmat[4] = R.nmat[8] = 1;
  gl.uniformMatrix3fv(R.lit.u.uNMat, false, R.nmat);
  gl.uniform3fv(R.lit.u.uColor, COL.snake);
  gl.uniform3fv(R.lit.u.uColorB, COL.belly);
  gl.uniform1f(R.lit.u.uMode, 3);
  gl.uniform1f(R.lit.u.uAmb, 0.36);
  gl.uniform1f(R.lit.u.uSpec, 0.40);
  gl.uniform1f(R.lit.u.uRim, 0.20);
  gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(R.tube.vao);
  gl.drawElements(gl.TRIANGLES, (rings - 1) * RING_SEG * 6, gl.UNSIGNED_INT, 0);
  gl.enable(gl.CULL_FACE);
}
/* the head: broad viper skull, tapered snout, amber slit-pupil eyes, nostrils,
   a jaw that gapes with bared fangs when prey is near, and a forked tongue */
function drawHead(t, visible, full){
  if(!visible || chainPts.length < 2) return;
  const a = chainPts[0], b = chainPts[Math.min(2, chainPts.length - 1)];
  let hx = a.x - b.x, hz = a.z - b.z;
  const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  const yaw = Math.atan2(hx, hz);
  const px = -hz, pz = hx;
  const bob = Math.sin(t * 2.1) * 0.015;
  const gape = G.gape;
  const hpx = a.x + hx * 0.22, hpz = a.z + hz * 0.22;
  /* the head wears the same scaled skin as the body, not smooth rubber */
  drawLit(R.ball, hpx, 0.40 + gape * 0.04 + bob, hpz, yaw, 0.45, 0.33, 0.68, COL.head, null, 5, 0.38, 0.4, 0.22);
  drawLit(R.ball, hpx + hx * 0.46, 0.33 + gape * 0.06 + bob, hpz + hz * 0.46, yaw, 0.31, 0.22, 0.42, COL.head, null, 5, 0.38, 0.4, 0.22);
  drawLit(R.ball, hpx + hx * 0.30, 0.245 - gape * 0.09 + bob, hpz + hz * 0.30, yaw, 0.27, 0.09, 0.36, COL.head, null, 5, 0.38, 0.4, 0.15);
  if(gape > 0.15){
    drawLit(R.ball, hpx + hx * 0.38, 0.30 + bob, hpz + hz * 0.38, yaw, 0.19, 0.03 + 0.12 * gape, 0.26, COL.maw, null, 0, 0.65, 0.3);
    if(full) for(const s of [-1, 1])
      drawLit(R.bead, hpx + hx * 0.58 + px * 0.11 * s, 0.37 + bob, hpz + hz * 0.58 + pz * 0.11 * s, yaw, 0.017, 0.05, 0.017, COL.fang, null, 0, 0.6, 0.8);
  }
  if(!full) return;
  for(const s of [-1, 1]){
    const ex = hpx + hx * 0.14 + px * 0.36 * s, ez = hpz + hz * 0.14 + pz * 0.36 * s;
    drawLit(R.bead, ex, 0.52 + bob, ez, yaw, 0.088, 0.088, 0.088, COL.eye, null, 0, 0.55, 1.6);
    drawLit(R.bead, ex + hx * 0.048 + px * 0.028 * s, 0.525 + bob, ez + hz * 0.048 + pz * 0.028 * s,
      yaw, 0.024, 0.058, 0.024, COL.pupil, null, 0, 0.2, 2.0);
    const nx2 = hpx + hx * 0.72 + px * 0.085 * s, nz2 = hpz + hz * 0.72 + pz * 0.085 * s;
    drawLit(R.bead, nx2, 0.44 + gape * 0.06 + bob, nz2, yaw, 0.019, 0.019, 0.019, COL.pupil, null, 0, 0.3, 0.2);
  }
  const cyc = (t * 1.1 + 0.3) % 2.0;
  if(cyc < 0.62){
    const ext = Math.sin(Math.PI * cyc / 0.62);
    gl.disable(gl.CULL_FACE);
    drawLit(R.tongue, hpx + hx * 0.80, 0.36 + bob, hpz + hz * 0.80, yaw + Math.sin(t * 37) * 0.09,
      1.5, 1.5, 1.55 * Math.max(0.05, ext), COL.tongue, null, 0, 0.8, 0.4);
    gl.enable(gl.CULL_FACE);
  }
  /* a soft aura keeps the hero readable against the dark floor */
  pushBillboard(R.bb, hpx, 0.5, hpz, 0.8 + G.eatFlash * 0.9, 0.35, 1.0, 0.45, 0.05 + G.eatFlash * 0.45);
}
/* the mirrored world, rendered into the floor's reflection texture */
function renderReflection(rings, t){
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.reflFBO);
  gl.viewport(0, 0, R.rw, R.rh);
  gl.clearColor(ENC_BG[0], ENC_BG[1], ENC_BG[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const eyeR = [cam.eye[0], -cam.eye[1], cam.eye[2]];
  m4lookAt(R.tmp, eyeR, [cam.lx, 0, cam.lz], [Math.sin(cam.roll), Math.cos(cam.roll), 0]);
  m4mul(R.rvp, R.proj, R.tmp);
  bindLitCommon(R.rvp, eyeR, false);
  gl.frontFace(gl.CW);            // mirrored geometry flips the winding
  drawWalls();
  drawBoardMeshes(t, false);
  drawSnakeTube(rings);
  drawHead(t, G.state !== 'dying' || G.explodeAt === 0, false);
  gl.frontFace(gl.CCW);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function render(t, dt){
  if(!gl || glDead) return;
  makeTargets();
  R.bb.used = 0; R.fbb.used = 0;

  /* snake chain (world space, interpolated between steps) */
  const prog = (G.idle || G.state !== 'play') ? 1 : clamp(G.acc / G.stepDur, 0, 1);
  const startIdx = G.state === 'dying' ? Math.min(G.explodeAt, Math.max(0, G.cells.length - 2)) : 0;
  chainPts.length = 0;
  for(let i = startIdx; i < G.cells.length; i++){
    const cur = G.cells[i], from = G.cells[i + 1] || G.tailGhost;
    chainPts.push({ x: gxToWorld(lerp(from.x, cur.x, prog)), z: gyToWorld(lerp(from.y, cur.y, prog)) });
  }
  const hw = chainPts[0] || { x: 0, z: 0 };

  /* camera: whole-maze establishing shot on cards, swoop in and ride
     alongside the snake during play */
  const inAction = G.state === 'play' || G.state === 'dying';
  const wantZoom = inAction ? cam.dist * 0.60 : cam.dist;
  const k = Math.min(1, (dt || 0.016) * 2.2);
  cam.zoom = cam.zoom ? cam.zoom + (wantZoom - cam.zoom) * k : cam.dist;
  const r01 = clamp(cam.zoom / cam.dist, 0, 1);
  const maxLx = (GW / 2 + 2) * (1 - r01), maxLz = (GH / 2 + 2) * (1 - r01);
  const wantLx = inAction ? clamp(hw.x + G.dir.x * 1.6, -maxLx, maxLx) : 0;
  const wantLz = inAction ? clamp(hw.z + G.dir.y * 1.6, -maxLz, maxLz) : 0;
  const kl = Math.min(1, (dt || 0.016) * 3.2);
  cam.lx += (wantLx - cam.lx) * kl;
  cam.lz += (wantLz - cam.lz) * kl;
  const dir = cameraDir();
  const sh = cam.shake;
  const shx = Math.sin(t * 63) * sh, shy = Math.sin(t * 71 + 1) * sh * 0.6, shz = Math.sin(t * 57 + 2) * sh * 0.5;
  const lookX = cam.lx + shx * 0.4, lookZ = cam.lz + shz * 0.4;
  cam.eye = [lookX + shx, dir[1] * cam.zoom + Math.sin(t * 0.5) * 0.25 + shy, lookZ + dir[2] * cam.zoom + shz];
  m4perspective(R.proj, cam.fov - cam.kick, cam.aspect, 0.1, 300);
  m4lookAt(R.view, cam.eye, [lookX, 0, lookZ], [Math.sin(cam.roll), Math.cos(cam.roll), 0]);
  m4mul(R.vp, R.proj, R.view);
  cam.right = [R.view[0], R.view[4], R.view[8]];
  cam.up = [R.view[1], R.view[5], R.view[9]];
  cam.fwd = [-R.view[2], -R.view[6], -R.view[10]];

  /* prepare dynamic geometry, then render the sun's shadow map */
  let rings = 0;
  if(chainPts.length >= 2){
    rings = buildTubeMesh(chainPts, t);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.tube.vb);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, R.tube.verts.subarray(0, rings * RING_SEG * 8));
  }
  if(G.wallsDirty) rebuildWalls();
  collectLights(hw, t);
  renderShadow(rings, t);
  renderReflection(rings, t);

  /* scene pass into the MSAA target */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.msaaFBO);
  gl.viewport(0, 0, R.tw, R.th);
  gl.clearColor(ENC_BG[0], ENC_BG[1], ENC_BG[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  bindLitCommon(null, null, true);
  drawLit(R.floor, 0, 0, 0, 0, 1, 1, 1, COL.floor, COL.floorB, 1, 0.40, 0.04);

  drawBoardMeshes(t, true);
  drawWalls();
  drawSnakeTube(rings);

  /* braziers: stone bowls and layered flame sprites on the border walls */
  for(let i = 0; i < BRAZIERS.length; i++){
    const [bx, bz] = BRAZIERS[i];
    const f = brazierFlick(i, t);
    drawLit(R.rocks[i & 3], bx, 1.18, bz, i * 2.1, 0.44, 0.30, 0.44, COL.stone, null, 2, 0.32, 0.1);
    pushBillboard(R.bb, bx, 1.52 + f * 0.10, bz, 0.52 + f * 0.22, 1.6, 0.70, 0.16, 0.55);
    pushBillboard(R.bb, bx, 1.74 + f * 0.16, bz, 0.28 + f * 0.16, 1.8, 1.15, 0.35, 0.8);
    pushBillboard(R.bb, bx, 1.60, bz, 1.25 + f * 0.3, 1.5, 0.55, 0.12, 0.10);
  }

  drawHead(t, startIdx === 0, true);

  /* wisps + particles (additive), snake/item shadows (multiply-ish) */
  for(const w of G.wisps){
    const wx = gxToWorld(w.x), wz = gyToWorld(w.y);
    const wy = 0.5 + Math.sin(t * 3 + w.phase) * 0.08;
    pushBillboard(R.bb, wx, wy, wz, 1.05 + Math.sin(t * 5.2 + w.phase) * 0.12, COL.wisp[0], COL.wisp[1], COL.wisp[2], 0.36);
    pushBillboard(R.bb, wx, wy, wz, 0.36, 1, 0.92, 1, 0.9);
    for(let i = 1; i < w.trail.length; i++){
      const [tx2, ty2] = w.trail[i];
      const f = 1 - i / w.trail.length;
      pushBillboard(R.bb, gxToWorld(tx2), wy, gyToWorld(ty2), 0.34 * f + 0.08, COL.wisp[0], COL.wisp[1], COL.wisp[2], 0.18 * f);
    }
  }
  for(const p of parts){
    const f = 1 - p.life / p.ttl;
    pushBillboard(R.bb, p.x, p.y, p.z, p.size * (0.6 + f * 0.7), p.r, p.g, p.b, 0.8 * f);
  }
  for(const mo of motes)
    pushBillboard(R.bb, mo.x, mo.y, mo.z, 0.05 + 0.035 * Math.sin(t * 1.7 + mo.ph),
      0.55, 1.0, 0.6, 0.10 + 0.08 * Math.sin(t * 2.3 + mo.ph * 2.1));
  for(const s of shocks){
    const pr = s.t / s.ttl;
    const ease = 1 - (1 - pr) * (1 - pr);
    pushBillboard(R.fbb, s.x, 0.05, s.z, -(0.3 + s.size1 * ease), s.r, s.g, s.b, s.a * (1 - pr));
  }
  for(const mi of mists)
    pushBillboard(R.fbb, mi.x, 0.12, mi.z, 5.5, 0.10, 0.16, 0.11, 0.045);

  drawBillboards(R.fbb, true, true);    // shockwave rings lie flat on the floor
  drawBillboards(R.bb, true, false);    // glows face the camera

  postProcess(t);
}

/* ---------- main loop ---------- */
let lastT = 0;
function frame(tms){
  requestAnimationFrame(frame);
  const t = tms / 1000;
  let dt = t - (lastT || t);
  lastT = t;
  if(document.hidden || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  if(G.state === 'dying' && G.stateT < 0.5) dt *= 0.35;   // slow-motion death
  checkResize();
  update(dt, t);
  render(t, dt);
}

/* ---------- go ---------- */
function start(){
  buildHud();
  if(!cv || !bezel3d){ showError('SNEEKIE 2026: page is missing the #screen3d stage'); return; }
  let ok = false;
  try{ ok = initGL(); }
  catch(err){ showError('WebGL2: ' + (err && err.message || err)); }
  if(!ok){
    hudCard(tx('title2026'), tx('webglMissing'), '');
    return;
  }
  G.best = parseInt(store.get('sneekie.highscore3d') || '0', 10) || 0;
  initInput();
  if(BOT) initBotUI();
  checkResize();
  buildLevel(1);
  showIntro();
  hudScore();
  requestAnimationFrame(frame);
}
start();

/* tiny read-only debug/inspection handle (used by tests; not an API) */
window.SNEEKIE3D = {
  get state(){ return G.state; },
  get level(){ return G.level; },
  get lives(){ return G.lives; },
  get score(){ return G.score; },
  get bonus(){ return G.bonus; },
  get length(){ return G.cells.length; },
  get cause(){ return G.deathCause; },
  get hearts(){ return G.heartsLeft; },
  get cam(){ return { dist: cam.dist, zoom: cam.zoom, lx: cam.lx, lz: cam.lz, eye: cam.eye.slice(), aspect: cam.aspect }; },
  count(type){ let n = 0; for(let i = 0; i < grid.length; i++) if(grid[i] === type) n++; return n; },
};

})();
