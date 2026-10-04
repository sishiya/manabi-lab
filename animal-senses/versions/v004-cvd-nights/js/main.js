// main.js — state, input (drag to look, keys / on-screen pad), panel UI, main loop, debug hook window.__as.
'use strict';

const S = {
  animal:'human', time:'dusk', split:false,
  pos:new THREE.Vector3(), yaw:0, pitch:0, keys:new Set(),
  uvK:1, uvOnly:false, pit:true, eye:true, blur:3.5,
  batEye:false, sound:false, pol:true, polOn:true,
  clock:{}, hex:{},                  // per animal: chosen time scale index, ommatidium size
  // low vision: type + one value per type (acuity, scotoma radius °, field radius °, cataract 0–1)
  // refraction: type (0 myopia, 1 hyperopia, 2 astigmatism, 3 presbyopia), dioptres per type, age, astig axis
  cv:{ type:1, k:1 }, night:'lit',
  lv:{ type:0, v:[0.1, 8, 12, 0.6] }, rf:{ type:0, d:[3, 2, 2], age:50, axis:0, glasses:false }, book:true,
  t:0, tween:null, paused:false,
};
const $ = id => document.getElementById(id);
const errs = [];
window.addEventListener('error', e => errs.push(String(e.message || e)));
// accommodation (dioptres): Hofstetter's minimum, 15 − 0.25 × age; myopes are assumed young enough to focus near
const accOf = () => S.rf.type === 0 ? 8 : Math.max(0.25, 15 - 0.25 * S.rf.age);
// low-vision blur in half-res pixels. Acuity V resolves ~30·V cycles/degree; sigma ≈ 0.9 / (30·V) degrees
function lvSigma() {
  const t = S.lv.type, pxDeg = (R.size ? R.size[1] : 600) / R.cam.fov;
  if (t === 0) return 0.5 * pxDeg * 0.9 / (30 * S.lv.v[0]);
  return t === 1 ? 10 : t === 2 ? 3 : 5 + 12 * S.lv.v[3];
}
const fullName = a => a.types ? a.name + '・' + a.sub : a.sub ? a.name + a.sub : a.name;
const clockOf = k => { const a = ANIMALS[k]; return a.clocks ? a.clocks[S.clock[k] != null ? S.clock[k] : a.clock][1] : 1; };

// ---------- panel ----------
function buildAnimalButtons() {
  const nav = $('animals');
  for (const [title, keys] of ANIMAL_GROUPS) {
    const h = document.createElement('h3'); h.textContent = title; nav.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'grid'; nav.appendChild(grid);
    for (const k of keys) {
      const a = ANIMALS[k], b = document.createElement('button');
      b.dataset.a = k;
      b.innerHTML = `<span class="ic" aria-hidden="true">${a.icon}</span>${a.name}${a.sub ? `<small>${a.sub}</small>` : ''}`;
      b.onclick = () => setAnimal(k);
      grid.appendChild(b);
    }
  }
}

function senseControls() {
  const box = $('senseCtl'); box.innerHTML = '';
  const k = S.animal, a = ANIMALS[k];
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); return d; };
  if (a.clocks) {
    const cur = S.clock[k] != null ? S.clock[k] : a.clock;
    const d = add(`<div class="row seg" role="group" aria-label="時間の流れ"><span class="lab">時間</span>${a.clocks.map((c, i) => `<button data-i="${i}" aria-pressed="${i === cur}">${c[0]}</button>`).join('')}</div>`);
    d.querySelectorAll('button').forEach(b => b.onclick = () => { S.clock[k] = +b.dataset.i; senseControls(); updateLegend(); });
  }
  if (a.view === 'cube') {
    const h = S.hex[k] || a.hex;
    const d = add(`<label class="row"><span class="lab">個眼の大きさ</span><input type="range" id="hex" min="1" max="8" step="0.25" value="${h}"><span class="mono" id="hexV">${h.toFixed(1)}°</span></label>`);
    d.querySelector('#hex').oninput = e => { S.hex[k] = +e.target.value; $('hexV').textContent = S.hex[k].toFixed(1) + '°'; };
  }
  if (a.types) {
    const st = k === 'low' ? S.lv : k === 'cvd' ? S.cv : S.rf;
    const d = add(`<div class="row seg" role="group" aria-label="見え方"><span class="lab">見え方</span>${a.types.map((t, i) => `<button data-i="${i}" aria-pressed="${i === st.type}">${t[0]}</button>`).join('')}</div>`);
    d.querySelectorAll('button').forEach(b => b.onclick = () => { st.type = +b.dataset.i; senseControls(); updateLegend(); });
    const slider = (label, min, max, step, val, fmt, set) => {
      const r = add(`<label class="row"><span class="lab">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="mono">${fmt(val)}</span></label>`);
      const inp = r.querySelector('input'), out = r.querySelector('.mono');
      inp.oninput = () => { set(+inp.value); out.textContent = fmt(+inp.value); updateLegend(); };
    };
    if (k === 'low') {
      const i = S.lv.type, v = S.lv.v;
      if (i === 0) slider('視力', 0, 1, 0.01, Math.log(v[0] / 0.02) / Math.log(30), x => (0.02 * Math.pow(30, x)).toFixed(2), x => { v[0] = 0.02 * Math.pow(30, x); });
      else if (i === 3) slider('にごり', 0, 1, 0.05, v[3], x => Math.round(x * 100) + '%', x => { v[3] = x; });
      else slider(i === 1 ? '暗点の半径' : '見える半径', 2, i === 1 ? 20 : 40, 1, v[i], x => x + '°', x => { v[i] = x; });
    } else if (k === 'cvd') {
      if (S.cv.type < 3) slider('強さ', 0.2, 1, 0.05, S.cv.k, x => x >= 1 ? '2色覚' : '異常3色覚 ' + Math.round(x * 100) + '%', x => { S.cv.k = x; });
    } else {
      const i = S.rf.type;
      if (i !== 3) slider('度数', 0.5, i === 2 ? 4 : 8, 0.25, S.rf.d[i], x => (i === 0 ? '−' : '') + x.toFixed(2) + 'D', x => { S.rf.d[i] = x; });
      if (i === 1 || i === 3) slider('年齢', 10, 75, 1, S.rf.age, x => x + '歳', x => { S.rf.age = x; });
      if (i === 2) {
        const ax = add(`<div class="row seg" role="group" aria-label="ぶれる向き"><span class="lab">ぶれる向き</span>${['横','縦','斜め'].map((t, j) => `<button data-j="${j}" aria-pressed="${j === S.rf.axis}">${t}</button>`).join('')}</div>`);
        ax.querySelectorAll("button").forEach(b => b.onclick = () => { S.rf.axis = +b.dataset.j; senseControls(); updateLegend(); });
      }
      const g = add(`<label class="row"><input type="checkbox" ${S.rf.glasses ? 'checked' : ''}> 眼鏡をかける</label>`);
      g.querySelector('input').onchange = e => { S.rf.glasses = e.target.checked; updateLegend(); };
    }
    if (a.book) {
      const bk = add(`<label class="row"><input type="checkbox" ${S.book ? 'checked' : ''}> 手に本を持つ（35cm）</label>`);
      bk.querySelector('input').onchange = e => { S.book = e.target.checked; };
    }
  }
  if (k === 'crow') {
    const d = add(`<div class="row seg" role="group" aria-label="紫外線の見せ方"><span class="lab">紫外線</span><button data-m="0">紫で重ねる</button><button data-m="1">紫外線だけ</button></div>
      <label class="row"><span class="lab">強さ</span><input type="range" id="uvK" min="0" max="2" step="0.05" value="${S.uvK}"></label>`);
    d.querySelectorAll('[data-m]').forEach(b => {
      b.setAttribute('aria-pressed', String(+b.dataset.m === +S.uvOnly));
      b.onclick = () => { S.uvOnly = b.dataset.m === '1'; senseControls(); updateLegend(); };
    });
    d.querySelector('#uvK').oninput = e => { S.uvK = +e.target.value; };
  } else if (k === 'snake') {
    const d = add(`<label class="row"><input type="checkbox" id="pit" ${S.pit ? 'checked' : ''}> ピット器官（熱）</label>
      <label class="row"><input type="checkbox" id="eye" ${S.eye ? 'checked' : ''}> 目の像</label>
      <label class="row"><span class="lab">熱のぼやけ</span><input type="range" id="blur" min="0" max="10" step="0.5" value="${S.blur}"></label>`);
    d.querySelector('#pit').onchange = e => { S.pit = e.target.checked; updateLegend(); };
    d.querySelector('#eye').onchange = e => { S.eye = e.target.checked; };
    d.querySelector('#blur').oninput = e => { S.blur = +e.target.value; };
  } else if (k === 'bat') {
    const d = add(`<label class="row"><input type="checkbox" id="snd" ${S.sound ? 'checked' : ''}> こだまを聞く（10倍ゆっくりにした音）</label>
      <label class="row"><input type="checkbox" id="beye" ${S.batEye ? 'checked' : ''}> 目の像も重ねる</label>`);
    d.querySelector('#snd').onchange = e => { S.sound = e.target.checked; if (S.sound) initAudio(); };
    d.querySelector('#beye').onchange = e => { S.batEye = e.target.checked; };
  } else if (k === 'bee') {
    const d = add(`<label class="row"><input type="checkbox" id="pol" ${S.pol ? 'checked' : ''}> 空の偏光（昼・夕方）</label>`);
    d.querySelector('#pol').onchange = e => { S.pol = e.target.checked; };
  } else if (k === 'shrimp') {
    const d = add(`<label class="row"><input type="checkbox" id="polOn" ${S.polOn ? 'checked' : ''}> 偏光（緑のしま）</label>`);
    d.querySelector('#polOn').onchange = e => { S.polOn = e.target.checked; };
  }
}

function updateLegend() {
  const L = $('legend'), k = S.animal;
  const bar = (grad, ends) => `<div class="bar" style="background:${grad}"></div><div class="ends">${ends.map(e => `<span>${e}</span>`).join('')}</div>`;
  let h = '';
  if (k === 'crow') {
    h = S.uvOnly ? '紫外線だけの白黒の像（白いほど紫外線をよく反射）。人の目には見えない。'
      : '<b style="color:#d48cff">紫</b> = 紫外線をよく反射するところ（人には見えない「4つ目の色」の置き換え）';
  } else if (k === 'snake' && S.pit) {
    h = 'ピット器官の熱の像（まわりの空気より何℃温かいか）' + bar('linear-gradient(90deg,#000,#5a0010,#ff5a00,#ffd826,#fffbe6)', ['±0℃', '+8℃', '+16℃以上']);
  } else if (k === 'human' && S.time === 'night') {
    h = '夜は色を区別しない桿体がはたらくので、色がうすく、ぼんやり見える。';
  } else if (k === 'fly') {
    h = (clockOf('fly') < 1 ? 'ハエの速さ: 世界が約1/4の速さで動く（玄関の灯りのちらつきも見える）' : '人と同じ速さ')
      + `<br>ハエたたき: よけた ${SX.dodges} 回・たたかれた ${SX.hits} 回`;
  } else if (k === 'bat') {
    h = '<b style="color:#6f8cff">青い線</b> = 声の波が当たっている所　<b style="color:#bfe6ff">水色〜白</b> = 返ってきたこだま'
      + `<br>つかまえたガ: ${SX.caught} 匹${clockOf('bat') < 1 ? `（時間 ${ANIMALS.bat.clocks[S.clock.bat != null ? S.clock.bat : 1][0]}）` : ''}`;
  } else if (k === 'bee') {
    h = 'ハチの色を人の色にずらして表示: <b style="color:#ff6a5a">赤</b>=ハチの緑　<b style="color:#6fe07a">緑</b>=ハチの青　<b style="color:#6f8cff">青</b>=紫外線';
  } else if (k === 'shrimp') {
    h = '黄色い線の帯の中だけ色（おおまかな12の仲間）。帯が上下に走査する。<b style="color:#3fe0c8">緑のしま</b> = 偏光の強い所';
  } else if (k === 'dog' || k === 'cat') {
    h = '2色型の色（赤と緑が同じような色に）＋ぼやけ' + (k === 'cat' ? '。夜に強い' : '');
  } else if (k === 'thermo') {
    h = 'サーモグラフィ（表面の温度）' + bar('linear-gradient(90deg,#000014,#40008c,#d90d59,#ff8c00,#ffffbf)', ['5℃', '22℃', '40℃']);
  } else if (k === 'low') {
    const t = S.lv.type, v = S.lv.v;
    h = ['視力 ' + v[0].toFixed(2) + ' くらいのぼやけ（目安）',
         '画面の中心（見ている所）の半径 ' + v[1] + '° が見えにくい。ゆがみも出る',
         '画面の中心から半径 ' + v[2] + '° だけが見える。外側の灰色は「見えていない」の置き換え' + (S.time === 'night' ? '。夜はさらに暗い（夜盲）' : ''),
         '白内障: かすみ・まぶしさ・黄ばみ（にごり ' + Math.round(v[3] * 100) + '%）'][t] + '。見え方の一例';
  } else if (k === 'refr') {
    const r = S.rf, acc = accOf(), fmt = m => m >= 10 ? 'どこまでも' : m >= 1 ? m.toFixed(1) + 'm' : Math.round(m * 100) + 'cm';
    if (r.glasses) h = '眼鏡をかけている（ピントが合っている）';
    else if (r.type === 0) h = `近視 −${r.d[0].toFixed(2)}D: はっきり見えるのは約 ${fmt(1 / r.d[0])} まで。それより遠くがぼやける`;
    else if (r.type === 2) h = `乱視 ${r.d[2].toFixed(2)}D: 距離に関係なく、${['横','縦','斜め'][r.axis]}方向にぶれる`;
    else {
      const H = r.type === 1 ? r.d[1] : 0, near = acc > H ? 1 / (acc - H) : Infinity;
      h = (r.type === 1 ? `遠視 +${H.toFixed(2)}D・${r.age}歳` : `老眼・${r.age}歳`) + `（調節力 約${acc.toFixed(1)}D）: `
        + (near > 6 ? '遠くも近くもぼやける' : `約 ${fmt(near)} より近くがぼやける`);
    }
  } else if (k === 'cvd') {
    const t = S.cv.type;
    h = t === 3 ? '1色覚: 色が分からず、明るい所がまぶしい（見え方の一例）'
      : ['1型（P型）: L錐体', '2型（D型）: M錐体', '3型（T型）: S錐体'][t] + (S.cv.k >= 1 ? 'がない（2色覚）' : 'の感じ方がずれている（異常3色覚の目安）') + '。赤いボールと芝生を比べてみて';
  } else if (k === 'nir') {
    h = '近赤外線（0.7〜1µm）の明るさ' + (S.time !== 'day' ? '。カメラの赤外線ライトで照らしている' : '');
  }
  // dark nights: say when this eye can no longer adapt enough
  if (S.time === 'night' && S.night !== 'lit') {
    const nt = NIGHTS[S.night], G = DARK_GAIN[k];
    const other = { snake:'ピット器官の熱', bat:'こだま' }[k];
    const note = G == null ? '（熱やカメラ自身の赤外線ライトを使うので、暗さに関係ない）'
      : other ? `（目は見えにくくなるが、${other}は暗さに関係ない）`
      : G * nt.L >= 1 ? '（目が慣れれば見える明るさ）' : G * nt.L > 0.05 ? '（目が慣れても、かなり見えにくい）' : '（目が慣れても、ほとんど見えない）';
    h = (h ? h + '<br>' : '') + nt.note + note;
  }
  L.innerHTML = h;
}

function updatePanel() {
  const a = ANIMALS[S.animal];
  document.querySelectorAll('#animals button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === S.animal)));
  document.querySelectorAll('#timeRow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === S.time)));
  document.querySelectorAll('#nightRow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.n === S.night)));
  $('nightRow').hidden = S.time !== 'night';
  document.body.classList.toggle('canfly', !!a.fly);
  $('aTitle').textContent = a.sub ? fullName(a) : a.name + 'の感覚';
  $('aLead').textContent = a.lead;
  const cls = { s:['k-sure','確か'], e:['k-est','推定'], a:['k-art','演出'] };
  $('aFacts').innerHTML = a.facts.map(([k, t]) => `<li><span class="k ${cls[k][0]}">${cls[k][1]}</span>${t}</li>`).join('');
  const pp = $('pois'); pp.innerHTML = '';
  a.pois.forEach(p => { const b = document.createElement('button'); b.textContent = p.name; b.onclick = () => goto(p); pp.appendChild(b); });
  $('split').checked = S.split;
  $('splitLabels').hidden = !S.split || S.animal === 'human';
  $('slR').textContent = fullName(a);
  senseControls(); updateLegend();
}

// ---------- state changes ----------
function setAnimal(k, keepPlace = true) {
  const a = ANIMALS[k]; if (!a) return;
  const first = !S.started;
  S.animal = k;
  if (first || !keepPlace) { S.pos.set(...a.start.pos); S.yaw = a.start.yaw; S.pitch = a.start.pitch; }
  else if (!a.fly || S.pos.y < 0.3) S.pos.y = a.eye;          // same spot, this animal's eye height
  S.started = true;
  R.cam.fov = a.fov || 70; R.cam.updateProjectionMatrix();
  S.tween = null;
  updatePanel();
}
// the time preset actually in use: at night, scale moonlight / sky glow by L and switch the lamps (NIGHTS)
function curTime() {
  const base = TIMES[S.time];
  if (S.time !== 'night') return Object.assign({}, base, { L:1, stars:0 });
  const n = NIGHTS[S.night], sc = v => v.map(x => x * n.L);
  return Object.assign({}, base, { L:n.L, lamp:n.lamp, stars:n.stars, sun:sc(base.sun), sky:sc(base.sky), gnd:sc(base.gnd), skyTop:sc(base.skyTop), skyHor:sc(base.skyHor) });
}
function setTime(k) { S.time = k; setTimeUniforms(curTime()); updatePanel(); }
function setNight(m) { S.night = m; setTimeUniforms(curTime()); updatePanel(); }
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
    const k = 0.0045 * Math.sqrt((R.cam.fov || 70) / 70) * (ANIMALS[S.animal].view === 'cube' ? 1.6 : 1);
    // drag toward where you want to look: right -> turn right, up -> look up
    S.yaw += (e.clientX - drag.x) * k;
    S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch - (e.clientY - drag.y) * k));
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
  for (const [m, n] of Object.entries(NIGHTS)) { const b = document.createElement('button'); b.dataset.n = m; b.textContent = n.name; b.onclick = () => setNight(m); $('nightRow').appendChild(b); }
  $('split').onchange = e => { S.split = e.target.checked; updatePanel(); };
}

// ---------- loop ----------
const fwd = new THREE.Vector3();
let legendT = 0;
function step(dt) {
  const k = S.animal, a = ANIMALS[k], clock = clockOf(k);
  S.t += dt * clock;                                       // world time (slowed for fly / bat)
  if (S.tween) {
    const tw = S.tween; tw.t = Math.min(1, tw.t + dt / 0.9);
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
    let dy = tw.to.yaw - tw.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    S.pos.lerpVectors(tw.from.pos, new THREE.Vector3(...tw.to.pos), e);
    S.yaw = tw.from.yaw + dy * e; S.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * e;
    if (tw.t >= 1) S.tween = null;
  }
  // your own movement runs in real time (the point of a faster sense: more time to react)
  const K = S.keys, f = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0), r = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
  const sp = a.speed * dt;
  S.pos.x += (Math.sin(S.yaw) * f + Math.cos(S.yaw) * r) * sp;
  S.pos.z += (-Math.cos(S.yaw) * f + Math.sin(S.yaw) * r) * sp;
  if (a.fly) S.pos.y = Math.max(0.15, Math.min(6, S.pos.y + ((K.has('KeyE') ? 1 : 0) - (K.has('KeyQ') ? 1 : 0)) * sp * 0.8));
  const B = W.bounds;
  S.pos.x = Math.max(B.x0, Math.min(B.x1, S.pos.x)); S.pos.z = Math.max(B.z0, Math.min(B.z1, S.pos.z));

  updateWorld(S.t);
  W.book.visible = !!a.book && S.book;
  R.cam.position.copy(S.pos); R.cam.rotation.set(S.pitch, -S.yaw, 0);
  fwd.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
  swatterStep(S.t, k === 'fly', S.pos);
  if (k === 'bat') batStep(S.t, S.pos, fwd, S.sound);
  if ((k === 'fly' || k === 'bat') && (legendT += dt) > 0.25) { legendT = 0; updateLegend(); }

  renderFrame({
    animal:k, split:S.split && k !== 'human', lampK:lampFlicker(clock, S.t),
    uvK:S.uvK, uvOnly:S.uvOnly, pit:S.pit, eye:k === 'bat' ? S.batEye : S.eye, blur:S.blur, time:S.t,
    calls:SX.calls, nowT:S.t, tau:0.12, hex:S.hex[k] || a.hex || 3, pol:S.pol,
    scan:0.5 + 0.36 * Math.sin(S.t * 0.8), polOn:S.polOn,
    lvType: k === 'low' ? S.lv.type : k === 'cvd' ? S.cv.type : (S.rf.type === 2 ? 2 : 0), lvR: S.lv.v[S.lv.type],
    lvK: k === 'cvd' ? S.cv.k : S.lv.v[3], lvSigma: lvSigma(),
    refH: S.rf.type === 0 ? -S.rf.d[0] : S.rf.type === 1 ? S.rf.d[1] : 0, acc: accOf(), cyl: S.rf.d[2],
    axis: [0, Math.PI / 2, Math.PI / 4][S.rf.axis], glasses: S.rf.glasses,
  });
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
  R.scene.add(R.cam); W.book = buildBook(R.cam);
  buildAnimalButtons();
  initInput();
  setTime(S.time);
  setAnimal('human');
  resizeRender();
  new ResizeObserver(resizeRender).observe($('gl'));
  requestAnimationFrame(loop);
}

window.__as = { S, R, W, SX, err:errs, setAnimal, setTime, goto,
  frame(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  info() { return { animal:S.animal, time:S.time, t:+S.t.toFixed(2), pos:S.pos.toArray().map(v => +v.toFixed(2)), halfFloat:R.halfFloat, err:errs.slice() }; } };
try { init(); } catch (e) { errs.push(String(e && e.stack || e)); console.error(e); }
