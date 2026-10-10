// senses.js — per-animal events that run in world time: fluorescent flicker, the fly swatter, bat calls / echoes / catching moths,
// and the bat's time-expanded echo sound (Web Audio, only after the user turns it on).
'use strict';

const SX = {
  calls:[], nextCall:0, caught:0,
  hits:0, dodges:0, sw:{ phase:'idle', t0:0, tx:-0.6, tz:-3.6 },
  audio:null, chirp:null, lastSound:0,
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function toast(msg, ms = 1600, cls = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show ' + cls;
  clearTimeout(toast.h); toast.h = setTimeout(() => { el.className = ''; }, ms);
}

// A magnetic-ballast fluorescent lamp on 50 Hz mains flickers 100 times a second. Only shown when time is slowed
// enough that the flicker is below ~30 Hz on screen (otherwise a 60 fps display would just alias it).
// Seizure safety: on screen that is 2–25 Hz, inside the 3–30 Hz range that can trigger photosensitive seizures, so it is
// off unless the viewer turns it on (never with prefers-reduced-motion) and the lamp only swings 85–100 %
// (the real lamp dips to ~50 %), keeping the change in screen luminance below WCAG's 0.1 "flash" on the lit night scene.
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
function lampFlicker(clock, t, on) {
  if (!on || REDUCED_MOTION || 100 * clock > 30) return 1;
  return (0.85 + 0.15 * Math.abs(Math.sin(2 * Math.PI * 50 * t))) / 0.945;
}

// ---- fly swatter (world-time state machine) ----
const SW_RAISED = 1.35;
function placeSwatter(tx, tz, th) {
  W.swatter.position.set(tx, 0.765, tz + 0.42);
  W.swatter.rotation.x = th;
}
function swatterStep(t, active, cam) {
  const s = SX.sw;
  if (!active) { s.phase = 'idle'; s.t0 = t; placeSwatter(0.35, -3.3, SW_RAISED); return; }
  if (t < s.t0) s.t0 = t;                                   // time was reset
  const e = t - s.t0;
  if (s.phase === 'idle') {
    placeSwatter(0.35, -3.3, SW_RAISED);
    if (e > 2.2) {
      // aim at the fly if it is near the table, otherwise at the plate
      const near = Math.abs(cam.x + 0.6) < 0.9 && Math.abs(cam.z + 3.6) < 0.7 && cam.y < 1.25;
      s.tx = near ? cam.x : -0.6; s.tz = near ? cam.z : -3.6;
      s.phase = 'wind'; s.t0 = t;
      if (near) toast(L('ハエたたきが来る！', 'Here comes the swatter!'), 1200, 'warn');
    }
  } else if (s.phase === 'wind') {
    placeSwatter(s.tx, s.tz, SW_RAISED + 0.12 * Math.sin(e * 9));
    if (e > 0.7) { s.phase = 'strike'; s.t0 = t; }
  } else if (s.phase === 'strike') {
    const k = Math.min(1, e / 0.11);                        // ~0.1 s swing
    placeSwatter(s.tx, s.tz, SW_RAISED * (1 - k * k));
    if (k >= 1) {
      const dh = Math.hypot(cam.x - s.tx, cam.z - s.tz);
      if (dh < 0.12 && Math.abs(cam.y - 0.79) < 0.09) { SX.hits++; toast(L('ペチッ！ たたかれた…', 'Splat! You got swatted…'), 1800, 'bad'); }
      else if (dh < 0.6 && cam.y < 1.25) { SX.dodges++; toast(L('よけた！', 'Dodged!'), 1200, 'good'); }
      s.phase = 'rest'; s.t0 = t;
    }
  } else if (s.phase === 'rest') {
    placeSwatter(s.tx, s.tz, 0);
    if (e > 0.5) { s.phase = 'back'; s.t0 = t; }
  } else {
    const k = Math.min(1, e / 0.9);
    placeSwatter(s.tx + (0.35 - s.tx) * k, s.tz + (-3.3 - s.tz) * k, SW_RAISED * k);
    if (k >= 1) { s.phase = 'idle'; s.t0 = t; }
  }
}

// ---- bat ----
function batStep(t, cam, fwd, sound) {
  if (SX.nextCall - t > 1) SX.nextCall = t;               // time was reset
  let dmin = 99;
  for (const m of W.moths) {
    if (t < m.gone) continue;
    _v.copy(m.position).sub(cam);
    const d = _v.length();
    if (d < 0.2) {
      m.gone = t + 4; SX.caught++;
      toast(L(`ガをつかまえた！（${SX.caught}匹）`, `Caught a moth! (${SX.caught})`), 1500, 'good');
      continue;
    }
    if (_v.dot(fwd) / d > 0.5) dmin = Math.min(dmin, d);    // only moths in the beam change the call rate
  }
  const interval = dmin > 4 ? 0.1 : dmin > 1.5 ? 0.05 : 0.012;   // search -> approach -> feeding buzz
  if (t >= SX.nextCall) {
    SX.calls.unshift(t); if (SX.calls.length > 6) SX.calls.length = 6;
    SX.nextCall = t + interval;
    if (sound) playEchoes(cam, fwd);
  }
  return dmin;
}

function initAudio() {
  if (SX.audio) { SX.audio.resume(); return; }
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  // one call: a 3 ms downward FM sweep (about 80 -> 25 kHz), time-expanded x10 -> 30 ms, 8 -> 2.5 kHz
  const n = Math.round(ac.sampleRate * 0.03), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n, f = 8000 * Math.pow(2500 / 8000, x);
    ph += 2 * Math.PI * f / ac.sampleRate;
    d[i] = Math.sin(ph) * Math.sin(Math.PI * x);
  }
  SX.audio = ac; SX.chirp = buf;
}

function playEchoes(cam, fwd) {
  const ac = SX.audio; if (!ac || ac.state !== 'running') return;
  const now = performance.now();
  if (now - SX.lastSound < 450) return;                   // expanded echoes last ~0.3 s; don't pile them up
  SX.lastSound = now;
  const list = [];
  for (const o of W.echoObjs) {
    let c = o.c;
    if (o.mesh) { if (!o.mesh.parent || !o.mesh.parent.visible) continue; c = o.mesh.getWorldPosition(_w); }
    _v.copy(c).sub(cam);
    const d = _v.length(); if (d > 12 || d < 0.05) continue;
    const cs = _v.dot(fwd) / d; if (cs <= 0) continue;
    const amp = o.b * o.r * o.r * Math.pow(cs, 6) * Math.exp(-0.12 * d) / (d * d + 0.05);
    list.push([2 * Math.max(d - o.r, 0.03) / 343, amp]);
  }
  list.sort((a, b) => b[1] - a[1]);
  const t0 = ac.currentTime + 0.03;
  const play = (when, g) => {
    const s = ac.createBufferSource(), gn = ac.createGain();
    s.buffer = SX.chirp; gn.gain.value = g; s.connect(gn).connect(ac.destination); s.start(when);
  };
  play(t0, 0.12);                                          // the call itself (kept quiet so echoes are audible)
  for (const [delay, amp] of list.slice(0, 24)) play(t0 + delay * 10, Math.min(0.5, amp * 6));
}
