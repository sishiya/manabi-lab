// main.js — state, input (drag to look, keys / on-screen pad), panel UI, main loop, debug hook window.__as.
'use strict';

const S = {
  animal:'human', time:'dusk', split:false,
  pos:new THREE.Vector3(), yaw:0, pitch:0, keys:new Set(),
  uvK:1, uvOnly:false, pit:true, eye:true, blur:3.5,
  t:0, tween:null,
};
const SENSE = { human:0, crow:1, snake:2 };
const $ = id => document.getElementById(id);
const errs = [];
window.addEventListener('error', e => errs.push(String(e.message || e)));

// ---------- panel ----------
function buildAnimalButtons() {
  const nav = $('animals');
  for (const k of ANIMAL_ORDER) {
    const a = ANIMALS[k], b = document.createElement('button');
    b.dataset.a = k;
    b.innerHTML = `<span class="ic" aria-hidden="true">${a.icon}</span>${a.name}${a.soon ? '<small>準備中</small>' : ''}`;
    if (a.soon) b.disabled = true;
    b.onclick = () => setAnimal(k);
    nav.appendChild(b);
  }
}

function senseControls() {
  const box = $('senseCtl'); box.innerHTML = '';
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); return d; };
  if (S.animal === 'crow') {
    const d = add(`<div class="row seg" role="group" aria-label="紫外線の見せ方"><span class="lab">紫外線</span><button data-m="0">紫で重ねる</button><button data-m="1">紫外線だけ</button></div>
      <label class="row"><span class="lab">強さ</span><input type="range" id="uvK" min="0" max="2" step="0.05" value="${S.uvK}"></label>`);
    d.querySelectorAll('[data-m]').forEach(b => {
      b.setAttribute('aria-pressed', String(+b.dataset.m === +S.uvOnly));
      b.onclick = () => { S.uvOnly = b.dataset.m === '1'; senseControls(); updateLegend(); };
    });
    d.querySelector('#uvK').oninput = e => { S.uvK = +e.target.value; };
  } else if (S.animal === 'snake') {
    const d = add(`<label class="row"><input type="checkbox" id="pit" ${S.pit ? 'checked' : ''}> ピット器官（熱）</label>
      <label class="row"><input type="checkbox" id="eye" ${S.eye ? 'checked' : ''}> 目の像</label>
      <label class="row"><span class="lab">熱のぼやけ</span><input type="range" id="blur" min="0" max="10" step="0.5" value="${S.blur}"></label>`);
    d.querySelector('#pit').onchange = e => { S.pit = e.target.checked; updateLegend(); };
    d.querySelector('#eye').onchange = e => { S.eye = e.target.checked; };
    d.querySelector('#blur').oninput = e => { S.blur = +e.target.value; };
  }
}

function updateLegend() {
  const L = $('legend');
  if (S.animal === 'crow') {
    L.innerHTML = S.uvOnly
      ? '紫外線だけの白黒の像（白いほど紫外線をよく反射）。人の目には見えない。'
      : '<b style="color:#d48cff">紫</b> = 紫外線をよく反射するところ（人には見えない「4つ目の色」の置き換え）';
  } else if (S.animal === 'snake' && S.pit) {
    L.innerHTML = 'ピット器官の熱の像（まわりの空気より何℃温かいか）<div class="bar" style="background:linear-gradient(90deg,#000,#5a0010,#ff5a00,#ffd826,#fffbe6)"></div><div class="ends"><span>±0℃</span><span>+8℃</span><span>+16℃以上</span></div>';
  } else if (S.animal === 'human' && S.time === 'night') {
    L.innerHTML = '夜は色を区別しない桿体がはたらくので、色がうすく、ぼんやり見える。';
  } else L.innerHTML = '';
}

function updatePanel() {
  const a = ANIMALS[S.animal];
  document.querySelectorAll('#animals button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === S.animal)));
  document.querySelectorAll('#timeRow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === S.time)));
  document.body.classList.toggle('canfly', !!a.fly);
  $('aTitle').textContent = a.name + 'の感覚';
  $('aLead').textContent = a.lead;
  const cls = { s:['k-sure','確か'], e:['k-est','推定'], a:['k-art','演出'] };
  $('aFacts').innerHTML = a.facts.map(([k, t]) => `<li><span class="k ${cls[k][0]}">${cls[k][1]}</span>${t}</li>`).join('');
  const pp = $('pois'); pp.innerHTML = '';
  a.pois.forEach(p => { const b = document.createElement('button'); b.textContent = p.name; b.onclick = () => goto(p); pp.appendChild(b); });
  $('splitLabels').hidden = !S.split || S.animal === 'human';
  $('slR').textContent = a.name;
  senseControls(); updateLegend();
}

// ---------- state changes ----------
function setAnimal(k, keepPlace = true) {
  const a = ANIMALS[k]; if (!a || a.soon) return;
  const first = !S.started;
  S.animal = k;
  if (first || !keepPlace) { S.pos.set(...a.start.pos); S.yaw = a.start.yaw; S.pitch = a.start.pitch; }
  else if (!a.fly || S.pos.y < 0.3) S.pos.y = a.eye;          // same spot, this animal's eye height
  S.started = true;
  R.cam.fov = a.fov; R.cam.updateProjectionMatrix();
  S.tween = null;
  updatePanel();
}
function setTime(k) { S.time = k; setTimeUniforms(TIMES[k]); updatePanel(); }
function goto(p) {
  S.tween = { from:{ pos:S.pos.clone(), yaw:S.yaw, pitch:S.pitch }, to:p, t:0 };
}

// ---------- input ----------
function initInput() {
  const cv = $('gl');
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x:e.clientX, y:e.clientY, id:e.pointerId }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = 0.0045 * (70 / R.cam.fov) ** -0.5;
    S.yaw -= (e.clientX - drag.x) * k; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch - (e.clientY - drag.y) * k));
    drag.x = e.clientX; drag.y = e.clientY; S.tween = null;
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const map = { ArrowUp:'KeyW', ArrowDown:'KeyS', ArrowLeft:'KeyA', ArrowRight:'KeyD', Space:'KeyE', ShiftLeft:'KeyQ' };
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
    const k = map[e.code] || e.code;
    if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(k)) { S.keys.add(k); S.tween = null; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => S.keys.delete(map[e.code] || e.code));
  window.addEventListener('blur', () => S.keys.clear());
  document.querySelectorAll('#pad button').forEach(b => {
    b.addEventListener('pointerdown', e => { S.keys.add(b.dataset.k); S.tween = null; b.setPointerCapture(e.pointerId); e.preventDefault(); });
    const up = () => S.keys.delete(b.dataset.k);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
  document.querySelectorAll('#timeRow button').forEach(b => b.onclick = () => setTime(b.dataset.time));
  $('split').onchange = e => { S.split = e.target.checked; updatePanel(); };
}

// ---------- loop ----------
function step(dt) {
  S.t += dt;
  const a = ANIMALS[S.animal];
  if (S.tween) {
    const tw = S.tween; tw.t = Math.min(1, tw.t + dt / 0.9);
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
    let dy = tw.to.yaw - tw.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    S.pos.lerpVectors(tw.from.pos, new THREE.Vector3(...tw.to.pos), e);
    S.yaw = tw.from.yaw + dy * e; S.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * e;
    if (tw.t >= 1) S.tween = null;
  }
  const K = S.keys, f = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0), r = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
  const sp = a.speed * dt;
  S.pos.x += (Math.sin(S.yaw) * f + Math.cos(S.yaw) * r) * sp;
  S.pos.z += (-Math.cos(S.yaw) * f + Math.sin(S.yaw) * r) * sp;
  if (a.fly) S.pos.y = Math.max(0.15, Math.min(6, S.pos.y + ((K.has('KeyE') ? 1 : 0) - (K.has('KeyQ') ? 1 : 0)) * sp * 0.8));
  const B = W.bounds;
  S.pos.x = Math.max(B.x0, Math.min(B.x1, S.pos.x)); S.pos.z = Math.max(B.z0, Math.min(B.z1, S.pos.z));
  updateWorld(S.t);
  R.cam.position.copy(S.pos); R.cam.rotation.set(S.pitch, -S.yaw, 0);
  renderFrame({ sense:SENSE[S.animal], split:S.split && S.animal !== 'human', uvK:S.uvK, uvOnly:S.uvOnly, pit:S.pit, eye:S.eye, blur:S.blur, time:S.t });
}

let last = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  try { step(S.paused ? 0 : dt); } catch (e) { errs.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}

function init() {
  initRender($('gl'));
  buildWorld(R.scene);
  buildAnimalButtons();
  initInput();
  setTime(S.time);
  setAnimal('human');
  resizeRender();
  new ResizeObserver(resizeRender).observe($('gl'));
  requestAnimationFrame(loop);
}

window.__as = { S, R, W, err:errs, setAnimal, setTime, goto,
  frame(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  info() { return { animal:S.animal, time:S.time, pos:S.pos.toArray().map(v => +v.toFixed(2)), halfFloat:R.halfFloat, err:errs.slice() }; } };
try { init(); } catch (e) { errs.push(String(e && e.stack || e)); console.error(e); }
