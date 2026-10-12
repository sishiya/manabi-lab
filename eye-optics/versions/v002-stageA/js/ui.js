// 目のなかの光の道 — 操作（ボタン・ドラッグ・説明・案内）と、数字・見え方の表示
'use strict';

const $ = id => document.getElementById(id);

// 下の段のボタン
function buildControls() {
  const groups = [
    ['年齢', AGES.map(a => ({ key: a, label: a + '歳' })), () => S.age, v => { S.age = v; }],
    ['目の長さ', LENGTHS, () => S.len, v => { S.len = v; }],
    ['メガネ', GLASSES, () => S.glasses, v => { S.glasses = v; }],
    ['明るさ', LIGHTS, () => S.light, v => { S.light = v; }],
  ];
  const box = $('controls'); box.innerHTML = '';
  for (const [name, items, get, set] of groups) {
    const row = document.createElement('div'); row.className = 'grp';
    row.innerHTML = `<span class="gname">${name}</span>`;
    for (const it of items) {
      const b = document.createElement('button'); b.textContent = it.label; b.dataset.k = it.key;
      b.onclick = () => { set(it.key); S.anim = null; recompute(); syncControls(); };
      row.appendChild(b);
    }
    row._get = get; box.appendChild(row);
  }
  const t = document.createElement('label'); t.className = 'grp chk';
  t.innerHTML = '<input type="checkbox" id="showTop"> 物の上の端からの光も';
  box.appendChild(t);
  $('showTop').onchange = e => { S.showTop = e.target.checked; };
}
function syncControls() {
  for (const row of document.querySelectorAll('#controls .grp')) {
    if (!row._get) continue;
    for (const b of row.querySelectorAll('button')) b.classList.toggle('on', String(row._get()) === b.dataset.k);
  }
  $('showTop').checked = S.showTop;
}

// 案内
function setTour(i) {
  S.tour = i; const st = TOUR[i];
  if (st.set) { Object.assign(S, st.set); }
  S.hl = st.hl; S.anim = st.anim ? { ...st.anim, t: 0 } : null;
  if (S.anim) S.d = S.anim.from;
  recompute(); syncControls();
  $('tourText').textContent = typeof st.text === 'function' ? st.text() : st.text;
  $('tourNum').textContent = `${i + 1} / ${TOUR.length}`;
  $('next').textContent = i === TOUR.length - 1 ? 'はじめから' : 'つぎへ';
}

// ドラッグと説明
function hitTest(x, y) {
  const r = S.res; if (!r) return null;
  if (Math.abs(x - LAY.objX) < 18 && y > LAY.objTop - 14 && y < LAY.oy + 12) return 'object';
  const z = (x - LAY.ox) / LAY.s, yy = (LAY.oy - y) / LAY.s, ay = Math.abs(yy), e = r.eye;
  if (S.P != null && Math.abs(z - OPT.glassesZ) < 1.6 && ay < 7.5) return 'glasses';
  const [c1, c2, l1, l2] = e.surfs;
  if (Math.abs(z - e.stopZ) < 0.6 && ay > e.stopR && ay < 6.2) return 'iris';
  if (ay < 5.8 && z > c1.z + sag(c1, ay) - 0.3 && z < c2.z + sag(c2, ay) + 0.3) return 'cornea';
  if (ay < 4.6 && z > l1.z + sag(l1, ay) && z < l2.z + sag(l2, ay)) return 'lens';
  const zl = (l1.z + l2.z) / 2;
  if (ay > 4.6 && ay < 7 && z > e.stopZ && z < zl + 3) return 'ciliary';
  const dz = z - e.retinaC, dist = Math.hypot(dz, yy), ang = Math.atan2(yy, dz), R = OPT.retinaR;
  if (LAY.nerve && Math.abs(ang - LAY.nerve.a) < LAY.nerve.w * 1.3 && dist > R - 0.5 && dist < R + 4.5) return 'nerve';
  if (Math.hypot(z - e.L, yy) < 0.9) return 'fovea';
  if (Math.abs(dist - R) < 0.45 && z > l2.z) return 'retina';
  if (dist > R + 0.2 && dist < R + 1.2) return 'sclera';
  if (dist < R && z > l2.z + sag(l2, Math.min(ay, 4.6))) return 'vitreous';
  if (ay < 6 && z > c2.z && z < l1.z + 0.3) return 'aqueous';
  return null;
}
let tipTimer = 0;
function initPointer() {
  const cv = $('cv'); let drag = false;
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = pos(e);
    if (hitTest(x, y) === 'object' || (Math.abs(y - LAY.oy) < 60 && x < LAY.trackR + 10)) {
      drag = true; cv.setPointerCapture(e.pointerId); S.anim = null;
      S.d = xToD(Math.min(x, LAY.trackR)); retarget(); hideTip();
    } else if (e.pointerType === 'touch') {   // さわった部分の説明（マウスのない画面）
      const h = hitTest(x, y); if (h) { showTip(h, x, y); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 4000); } else hideTip();
    }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (drag) { S.d = xToD(Math.min(x, LAY.trackR)); retarget(); return; }
    const h = hitTest(x, y);
    cv.style.cursor = h === 'object' || (Math.abs(y - LAY.oy) < 60 && x < LAY.trackR + 10) ? 'ew-resize' : 'default';
    if (h && e.pointerType !== 'touch') showTip(h, x, y); else hideTip();
  });
  const end = () => { drag = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', hideTip);
}
function showTip(key, x, y) {
  const p = PARTS[key], tip = $('tip'); if (!p) return;
  tip.innerHTML = `<b>${p.name}</b><br>${p.text()}`; tip.hidden = false;
  const W = $('stage').clientWidth, w = tip.offsetWidth;
  const cvb = $('cv'), ox = cvb.offsetLeft, oy = cvb.offsetTop;
  tip.style.left = Math.max(8, Math.min(W - w - 8, ox + x + 14)) + 'px'; tip.style.top = (oy + y + 16) + 'px';
}
function hideTip() { $('tip').hidden = true; }

// 見え方（視力表）。視力 V の段のランドルト環は、すきま 1/V 分・外の直径 5/V 分（ISO 8596 の形）
const ROWS = [0.2, 0.4, 0.7, 1.0, 1.5];
const CHART_FOV = 100;   // 表示する高さ（分＝1/60度）
let chartPx = 0;
function drawChart() {
  const c = $('chart'), lab = $('chartLab'), box = c.parentElement;
  const Wp = box.clientWidth, Hp = box.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const k of [c, lab]) { k.width = Wp * dpr; k.height = Hp * dpr; }
  const g = c.getContext('2d'), gl = lab.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); gl.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, Wp, Hp);
  const k = Hp / CHART_FOV; chartPx = k;   // 1分あたりの px
  let y = 6 * k; const dirs = [0, 2, 1, 3, 0, 3, 2, 1, 1, 0, 2, 3, 1, 3, 0, 2, 3, 0, 1, 2];
  let di = 0;
  gl.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-mono'); gl.fillStyle = '#5b6670'; gl.textAlign = 'left';
  for (const v of ROWS) {
    const D = 5 / v * k, gap = D / 5, n = v < 0.3 ? 2 : v < 0.8 ? 3 : 4;
    const total = n * D + (n - 1) * D * 0.8, x0 = (Wp - total) / 2 + 12;
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * D * 1.8 + D / 2, cy = y + D / 2, dir = dirs[di++ % dirs.length];
      g.save(); g.translate(cx, cy); g.rotate(dir * Math.PI / 2);
      g.beginPath(); g.arc(0, 0, D / 2, 0, Math.PI * 2); g.arc(0, 0, D / 2 - gap, 0, Math.PI * 2, true); g.fillStyle = '#16181a'; g.fill('evenodd');
      g.fillStyle = '#f4f1ea'; g.fillRect(0, -gap / 2, D / 2 + 1, gap);
      g.restore();
    }
    gl.fillText(v.toFixed(1), 6, y + D / 2 + 3);
    y += D + Math.max(D * 0.55, 3.5 * k);
  }
}
let lastBlur = -1;
function updateView() {
  const r = S.res; if (!r) return;
  const diam = r.main.blurD / r.scale;                  // ぼけの円の直径（ラジアン）
  const radArcmin = diam / 2 * 3437.75;
  const sigma = radArcmin / 2 * chartPx;                // 円板を同じ広がりのぼかしで近似（σ ≈ 半径/2）
  if (Math.abs(sigma - lastBlur) > 0.05) { $('chart').style.filter = `blur(${sigma.toFixed(2)}px)`; lastBlur = sigma; }
  const Amax = maxAccommodation(S.age);
  const err = S.err, errTxt = Math.abs(err) < 0.2 ? '正視（遠くにピントが合う）' : (err < 0 ? '近視 ' : '遠視 ') + fmtDi(Math.round(err * 4) / 4);
  $('info').innerHTML =
    `<div><span>物までの距離</span><b>${fmtD(S.d)}</b></div>` +
    `<div><span>調節（水晶体のふくらみ）</span><b>${S.A.toFixed(1)} D</b><small> ／ 最大 ${Amax.toFixed(1)} D</small></div>` +
    `<div><span>目の屈折</span><b>${errTxt}</b></div>` +
    `<div><span>ひとみ</span><b>${pupilDiameter(lightOf().L).toFixed(1)} mm</b></div>` +
    `<div><span>網膜のぼけ</span><b>${(r.main.blurD * 1000).toFixed(r.main.blurD < 0.01 ? 1 : 0)} µm</b><small>（${(radArcmin * 2).toFixed(1)} 分）</small></div>` +
    `<div class="state ${r.state}">${r.stateText}</div>`;
  $('viewHead').textContent = `見え方（視力表を ${fmtD(S.d)} に置いたら）`;
}

window.addEventListener('resize', () => { drawChart(); lastBlur = -1; });
