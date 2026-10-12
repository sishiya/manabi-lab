// main.js — state, input (drag to look, keys / on-screen pad), panel UI, main loop, debug hook window.__as.
'use strict';

const S = {
  animal:'human', time:'dusk', split:false,
  pos:new THREE.Vector3(), yaw:0, pitch:0, keys:new Set(),
  uvK:1, uvOnly:false, pit:true, eye:true, blur:3.5,
  batEye:false, sound:false, pol:true, polOn:true, flicker:false,
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
const fullName = a => !a.sub ? a.name : a.types ? a.name + L('・', ', ') + a.sub : a.name + L('', ' ') + a.sub;
const AXES = [L('横', 'Horizontal'), L('縦', 'Vertical'), L('斜め', 'Diagonal')];   // astigmatism blur direction
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
    const d = add(`<div class="row seg" role="group" aria-label="${L('時間の流れ', 'Speed of time')}"><span class="lab">${L('時間', 'Time')}</span>${a.clocks.map((c, i) => `<button data-i="${i}" aria-pressed="${i === cur}">${c[0]}</button>`).join('')}</div>`);
    d.querySelectorAll('button').forEach(b => b.onclick = () => { S.clock[k] = +b.dataset.i; senseControls(); updateLegend(); });
    // the lamp flicker is opt-in (seizure safety, see lampFlicker); with reduced motion it is not offered
    if (!REDUCED_MOTION && clockOf(k) < 1) {
      const f = add(`<label class="row"><input type="checkbox" ${S.flicker ? 'checked' : ''}> ${L('灯りのちらつきを見る（夜。画面が点滅します）', 'Show the lamp flicker (night; the screen flickers)')}</label>`);
      f.querySelector('input').onchange = e => { S.flicker = e.target.checked; updateLegend(); };
    }
  }
  if (a.view === 'cube') {
    const h = S.hex[k] || a.hex;
    const d = add(`<label class="row"><span class="lab">${L('個眼の大きさ', 'Ommatidium size')}</span><input type="range" id="hex" min="1" max="8" step="0.25" value="${h}"><span class="mono" id="hexV">${h.toFixed(1)}°</span></label>`);
    d.querySelector('#hex').oninput = e => { S.hex[k] = +e.target.value; $('hexV').textContent = S.hex[k].toFixed(1) + '°'; };
  }
  if (a.types) {
    const st = k === 'low' ? S.lv : k === 'cvd' ? S.cv : S.rf;
    const d = add(`<div class="row seg" role="group" aria-label="${L('見え方', 'Type')}"><span class="lab">${L('見え方', 'Type')}</span>${a.types.map((t, i) => `<button data-i="${i}" aria-pressed="${i === st.type}">${t[0]}</button>`).join('')}</div>`);
    d.querySelectorAll('button').forEach(b => b.onclick = () => { st.type = +b.dataset.i; senseControls(); updateLegend(); });
    const slider = (label, min, max, step, val, fmt, set) => {
      const r = add(`<label class="row"><span class="lab">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="mono">${fmt(val)}</span></label>`);
      const inp = r.querySelector('input'), out = r.querySelector('.mono');
      inp.oninput = () => { set(+inp.value); out.textContent = fmt(+inp.value); updateLegend(); };
    };
    if (k === 'low') {
      const i = S.lv.type, v = S.lv.v;
      if (i === 0) slider(L('視力', 'Acuity'), 0, 1, 0.01, Math.log(v[0] / 0.02) / Math.log(30), x => (0.02 * Math.pow(30, x)).toFixed(2), x => { v[0] = 0.02 * Math.pow(30, x); });
      else if (i === 3) slider(L('にごり', 'Clouding'), 0, 1, 0.05, v[3], x => Math.round(x * 100) + '%', x => { v[3] = x; });
      else slider(i === 1 ? L('暗点の半径', 'Blind spot radius') : L('見える半径', 'Visible radius'), 2, i === 1 ? 20 : 40, 1, v[i], x => x + '°', x => { v[i] = x; });
    } else if (k === 'cvd') {
      if (S.cv.type < 3) slider(L('強さ', 'Strength'), 0.2, 1, 0.05, S.cv.k, x => x >= 1 ? L('2色覚', 'dichromat') : L('異常3色覚 ', 'anomalous trichromat ') + Math.round(x * 100) + '%', x => { S.cv.k = x; });
    } else {
      const i = S.rf.type;
      if (i !== 3) slider(L('度数', 'Power'), 0.5, i === 2 ? 4 : 8, 0.25, S.rf.d[i], x => (i === 0 ? '−' : '') + x.toFixed(2) + 'D', x => { S.rf.d[i] = x; });
      if (i === 1 || i === 3) slider(L('年齢', 'Age'), 10, 75, 1, S.rf.age, x => x + L('歳', ' y'), x => { S.rf.age = x; });
      if (i === 2) {
        const ax = add(`<div class="row seg" role="group" aria-label="${L('ぶれる向き', 'Blur direction')}"><span class="lab">${L('ぶれる向き', 'Blur direction')}</span>${AXES.map((t, j) => `<button data-j="${j}" aria-pressed="${j === S.rf.axis}">${t}</button>`).join('')}</div>`);
        ax.querySelectorAll("button").forEach(b => b.onclick = () => { S.rf.axis = +b.dataset.j; senseControls(); updateLegend(); });
      }
      const g = add(`<label class="row"><input type="checkbox" ${S.rf.glasses ? 'checked' : ''}> ${L('眼鏡をかける', 'Wear glasses')}</label>`);
      g.querySelector('input').onchange = e => { S.rf.glasses = e.target.checked; updateLegend(); };
    }
    if (a.book) {
      const bk = add(`<label class="row"><input type="checkbox" ${S.book ? 'checked' : ''}> ${L('手に本を持つ（35cm）', 'Hold a book (35 cm)')}</label>`);
      bk.querySelector('input').onchange = e => { S.book = e.target.checked; };
    }
  }
  if (k === 'crow') {
    const d = add(`<div class="row seg" role="group" aria-label="${L('紫外線の見せ方', 'How to show ultraviolet')}"><span class="lab">${L('紫外線', 'UV')}</span><button data-m="0">${L('紫で重ねる', 'Overlay in purple')}</button><button data-m="1">${L('紫外線だけ', 'UV only')}</button></div>
      <label class="row"><span class="lab">${L('強さ', 'Strength')}</span><input type="range" id="uvK" min="0" max="2" step="0.05" value="${S.uvK}"></label>`);
    d.querySelectorAll('[data-m]').forEach(b => {
      b.setAttribute('aria-pressed', String(+b.dataset.m === +S.uvOnly));
      b.onclick = () => { S.uvOnly = b.dataset.m === '1'; senseControls(); updateLegend(); };
    });
    d.querySelector('#uvK').oninput = e => { S.uvK = +e.target.value; };
  } else if (k === 'snake') {
    const d = add(`<label class="row"><input type="checkbox" id="pit" ${S.pit ? 'checked' : ''}> ${L('ピット器官（熱）', 'Pit organ (heat)')}</label>
      <label class="row"><input type="checkbox" id="eye" ${S.eye ? 'checked' : ''}> ${L('目の像', 'Eye image')}</label>
      <label class="row"><span class="lab">${L('熱のぼやけ', 'Heat blur')}</span><input type="range" id="blur" min="0" max="10" step="0.5" value="${S.blur}"></label>`);
    d.querySelector('#pit').onchange = e => { S.pit = e.target.checked; updateLegend(); };
    d.querySelector('#eye').onchange = e => { S.eye = e.target.checked; };
    d.querySelector('#blur').oninput = e => { S.blur = +e.target.value; };
  } else if (k === 'bat') {
    const d = add(`<label class="row"><input type="checkbox" id="snd" ${S.sound ? 'checked' : ''}> ${L('こだまを聞く（10倍ゆっくりにした音）', 'Hear the echoes (slowed down 10 times)')}</label>
      <label class="row"><input type="checkbox" id="beye" ${S.batEye ? 'checked' : ''}> ${L('目の像も重ねる', 'Also overlay the eye image')}</label>`);
    d.querySelector('#snd').onchange = e => { S.sound = e.target.checked; if (S.sound) initAudio(); };
    d.querySelector('#beye').onchange = e => { S.batEye = e.target.checked; };
  } else if (k === 'bee') {
    const d = add(`<label class="row"><input type="checkbox" id="pol" ${S.pol ? 'checked' : ''}> ${L('空の偏光（昼・夕方）', 'Sky polarization (day, dusk)')}</label>`);
    d.querySelector('#pol').onchange = e => { S.pol = e.target.checked; };
  } else if (k === 'shrimp') {
    const d = add(`<label class="row"><input type="checkbox" id="polOn" ${S.polOn ? 'checked' : ''}> ${L('偏光（緑のしま）', 'Polarization (green stripes)')}</label>`);
    d.querySelector('#polOn').onchange = e => { S.polOn = e.target.checked; };
  }
}

function updateLegend() {
  const lg = $('legend'), k = S.animal;
  const bar = (grad, ends) => `<div class="bar" style="background:${grad}"></div><div class="ends">${ends.map(e => `<span>${e}</span>`).join('')}</div>`;
  let h = '';
  if (k === 'crow') {
    h = S.uvOnly ? L('紫外線だけの白黒の像（白いほど紫外線をよく反射）。人の目には見えない。', 'Ultraviolet only, in black and white (whiter = reflects more UV). Invisible to human eyes.')
      : L('<b style="color:#d48cff">紫</b> = 紫外線をよく反射するところ（人には見えない「4つ目の色」の置き換え）', '<b style="color:#d48cff">Purple</b> = reflects a lot of ultraviolet (a stand-in for the “4th color” humans cannot see)');
  } else if (k === 'snake' && S.pit) {
    h = L('ピット器官の熱の像（まわりの空気より何℃温かいか）', 'Heat image from the pit organs (how many °C warmer than the air)') + bar('linear-gradient(90deg,#000,#5a0010,#ff5a00,#ffd826,#fffbe6)', ['±0℃', '+8℃', L('+16℃以上', '+16℃ or more')]);
  } else if (k === 'human' && S.time === 'night') {
    h = L('夜は色を区別しない桿体がはたらくので、色がうすく、ぼんやり見える。', 'At night the rods, which cannot tell colors apart, do the work, so colors fade and things look blurry.');
  } else if (k === 'fly') {
    h = (clockOf('fly') < 1 ? L('ハエの速さ: 世界が約1/4の速さで動く', 'Fly speed: the world moves at about 1/4 speed') + (S.flicker && !REDUCED_MOTION ? L('（玄関の灯りがちらつく。本当はもっと暗くなる）', ' (the porch lamp flickers; really it dims much more)') : '') : L('人と同じ速さ', 'Same speed as humans'))
      + L(`<br>ハエたたき: よけた ${SX.dodges} 回・たたかれた ${SX.hits} 回`, `<br>Fly swatter: dodged ${SX.dodges} · swatted ${SX.hits}`);
  } else if (k === 'bat') {
    const tm = clockOf('bat') < 1 ? ANIMALS.bat.clocks[S.clock.bat != null ? S.clock.bat : 1][0] : '';
    h = L('<b style="color:#6f8cff">青い線</b> = 声の波が当たっている所　<b style="color:#bfe6ff">水色〜白</b> = 返ってきたこだま', '<b style="color:#6f8cff">Blue line</b> = where the call’s sound wave is hitting  <b style="color:#bfe6ff">Light blue to white</b> = echoes that came back')
      + L(`<br>つかまえたガ: ${SX.caught} 匹${tm ? `（時間 ${tm}）` : ''}`, `<br>Moths caught: ${SX.caught}${tm ? ` (time ${tm})` : ''}`);
  } else if (k === 'bee') {
    h = L('ハチの色を人の色にずらして表示: <b style="color:#ff6a5a">赤</b>=ハチの緑　<b style="color:#6fe07a">緑</b>=ハチの青　<b style="color:#6f8cff">青</b>=紫外線', 'Bee colors shifted into human colors: <b style="color:#ff6a5a">red</b> = bee green, <b style="color:#6fe07a">green</b> = bee blue, <b style="color:#6f8cff">blue</b> = ultraviolet');
  } else if (k === 'shrimp') {
    h = L('黄色い線の帯の中だけ色（おおまかな12の仲間）。帯が上下に走査する。<b style="color:#3fe0c8">緑のしま</b> = 偏光の強い所', 'Color only inside the band between the yellow lines (12 rough groups). The band scans up and down. <b style="color:#3fe0c8">Green stripes</b> = strongly polarized light');
  } else if (k === 'dog' || k === 'cat') {
    h = L('2色型の色（赤と緑が同じような色に）＋ぼやけ', 'Two-color vision (red and green look alike) + blur') + (k === 'cat' ? L('。夜に強い', '. Good at night') : '');
  } else if (k === 'thermo') {
    h = L('サーモグラフィ（表面の温度）', 'Thermal camera (surface temperature)') + bar('linear-gradient(90deg,#000014,#40008c,#d90d59,#ff8c00,#ffffbf)', ['5℃', '22℃', '40℃']);
  } else if (k === 'low') {
    const t = S.lv.type, v = S.lv.v;
    h = LANG === 'en'
      ? [`Blur like acuity ${v[0].toFixed(2)} (rough guide)`,
         `A radius of ${v[1]}° around the screen center (where you look) is hard to see, and warped`,
         `Only a radius of ${v[2]}° from the screen center is visible. The gray outside stands in for “not seen”` + (S.time === 'night' ? '. Even darker at night (night blindness)' : ''),
         `Cataract: haze, glare and yellowing (clouding ${Math.round(v[3] * 100)}%)`][t] + '. One example of how it can look'
      : ['視力 ' + v[0].toFixed(2) + ' くらいのぼやけ（目安）',
         '画面の中心（見ている所）の半径 ' + v[1] + '° が見えにくい。ゆがみも出る',
         '画面の中心から半径 ' + v[2] + '° だけが見える。外側の灰色は「見えていない」の置き換え' + (S.time === 'night' ? '。夜はさらに暗い（夜盲）' : ''),
         '白内障: かすみ・まぶしさ・黄ばみ（にごり ' + Math.round(v[3] * 100) + '%）'][t] + '。見え方の一例';
  } else if (k === 'refr') {
    const r = S.rf, acc = accOf(), fmt = m => m >= 10 ? L('どこまでも', 'any distance') : m >= 1 ? m.toFixed(1) + L('m', ' m') : Math.round(m * 100) + L('cm', ' cm');
    if (r.glasses) h = L('眼鏡をかけている（ピントが合っている）', 'Wearing glasses (in focus)');
    else if (r.type === 0) h = L(`近視 −${r.d[0].toFixed(2)}D: はっきり見えるのは約 ${fmt(1 / r.d[0])} まで。それより遠くがぼやける`, `Myopia −${r.d[0].toFixed(2)} D: sharp only up to about ${fmt(1 / r.d[0])}. Farther things are blurry`);
    else if (r.type === 2) h = L(`乱視 ${r.d[2].toFixed(2)}D: 距離に関係なく、${AXES[r.axis]}方向にぶれる`, `Astigmatism ${r.d[2].toFixed(2)} D: blurred in the ${AXES[r.axis].toLowerCase()} direction at any distance`);
    else {
      const H = r.type === 1 ? r.d[1] : 0, near = acc > H ? 1 / (acc - H) : Infinity;
      h = LANG === 'en'
        ? (r.type === 1 ? `Hyperopia +${H.toFixed(2)} D, age ${r.age}` : `Presbyopia, age ${r.age}`) + ` (focusing power about ${acc.toFixed(1)} D): `
          + (near > 6 ? 'blurry both far and near' : `blurry closer than about ${fmt(near)}`)
        : (r.type === 1 ? `遠視 +${H.toFixed(2)}D・${r.age}歳` : `老眼・${r.age}歳`) + `（調節力 約${acc.toFixed(1)}D）: `
          + (near > 6 ? '遠くも近くもぼやける' : `約 ${fmt(near)} より近くがぼやける`);
    }
  } else if (k === 'cvd') {
    const t = S.cv.type;
    h = t === 3 ? L('1色覚: 色が分からず、明るい所がまぶしい（見え方の一例）', 'Achromatopsia: no colors, and bright places are dazzling (one example)')
      : LANG === 'en'
        ? ['Type 1 (protan): L cones', 'Type 2 (deutan): M cones', 'Type 3 (tritan): S cones'][t] + (S.cv.k >= 1 ? ' are missing (dichromat)' : ' work differently (rough guide to anomalous trichromacy)') + '. Compare the red ball with the lawn'
        : ['1型（P型）: L錐体', '2型（D型）: M錐体', '3型（T型）: S錐体'][t] + (S.cv.k >= 1 ? 'がない（2色覚）' : 'の感じ方がずれている（異常3色覚の目安）') + '。赤いボールと芝生を比べてみて';
  } else if (k === 'nir') {
    h = L('近赤外線（0.7〜1µm）の明るさ', 'Brightness in near-infrared (0.7–1 µm)') + (S.time !== 'day' ? L('。カメラの赤外線ライトで照らしている', '. Lit by the camera’s infrared light') : '');
  }
  // dark nights: say when this eye can no longer adapt enough
  if (S.time === 'night' && S.night !== 'lit') {
    const nt = NIGHTS[S.night], G = DARK_GAIN[k];
    const other = { snake:L('ピット器官の熱', 'the pit organs’ heat sense'), bat:L('こだま', 'echolocation') }[k];
    const note = G == null ? L('（熱やカメラ自身の赤外線ライトを使うので、暗さに関係ない）', ' (uses heat or the camera’s own infrared light, so darkness does not matter)')
      : other ? L(`（目は見えにくくなるが、${other}は暗さに関係ない）`, ` (the eyes see less, but ${other} works the same in the dark)`)
      : G * nt.L >= 1 ? L('（目が慣れれば見える明るさ）', ' (bright enough once the eyes adjust)') : G * nt.L > 0.05 ? L('（目が慣れても、かなり見えにくい）', ' (hard to see even after the eyes adjust)') : L('（目が慣れても、ほとんど見えない）', ' (almost nothing visible even after the eyes adjust)');
    h = (h ? h + '<br>' : '') + nt.note + note;
  }
  lg.innerHTML = h;
}

function updatePanel() {
  const a = ANIMALS[S.animal];
  document.querySelectorAll('#animals button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === S.animal)));
  document.querySelectorAll('#timeRow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === S.time)));
  document.querySelectorAll('#nightRow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.n === S.night)));
  $('nightRow').hidden = S.time !== 'night';
  document.body.classList.toggle('canfly', !!a.fly);
  $('aTitle').textContent = a.sub ? fullName(a) : L(a.name + 'の感覚', a.title);
  $('aLead').textContent = a.lead;
  const cls = { s:['k-sure',L('確か', 'Known')], e:['k-est',L('推定', 'Estimate')], a:['k-art',L('演出', 'Display')] };
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
    animal:k, split:S.split && k !== 'human', lampK:lampFlicker(clock, S.t, S.flicker),
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

// texts that live in attributes (HTML holds both languages only for visible text; I18N.md)
function initLang() {
  document.title = L('いきものの感じる世界', 'How Animals Sense the World');
  $('gl').setAttribute('aria-label', L('庭を一人称で見る3Dの画面', '3D first-person view of the garden'));
  $('pad').setAttribute('aria-label', L('移動ボタン', 'Move buttons'));
  const pad = { KeyW:['前へ', 'Forward'], KeyA:['左へ', 'Left'], KeyS:['後ろへ', 'Back'], KeyD:['右へ', 'Right'], KeyE:['上へ', 'Up'], KeyQ:['下へ', 'Down'] };
  document.querySelectorAll('#pad button').forEach(b => b.setAttribute('aria-label', L(...pad[b.dataset.k])));
  $('animals').setAttribute('aria-label', L('生き物を選ぶ', 'Choose an animal'));
  $('timeRow').setAttribute('aria-label', L('時刻', 'Time of day'));
  $('nightRow').setAttribute('aria-label', L('夜の明かり', 'Night light'));
  $('slL').textContent = L('人間', 'Human');
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
}

function init() {
  initLang();
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
