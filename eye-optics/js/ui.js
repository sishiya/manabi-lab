// 目のなかの光の道 — 操作（ボタン・ドラッグ・説明・案内）と、数字・見え方の表示
'use strict';

const $ = id => document.getElementById(id);

// 距離のスライダー（左が遠く・右が近く。目の外の図と同じ向き）。0〜30 は「遠く」
const SL_INF = 30, SL_MAX = 1000;
const slToD = v => v < SL_INF ? Infinity : D_MAX * Math.pow(D_MIN / D_MAX, (v - SL_INF) / (SL_MAX - SL_INF));
const dToSl = d => !isFinite(d) ? 0 : SL_INF + (SL_MAX - SL_INF) * Math.log(D_MAX / d) / Math.log(D_MAX / D_MIN);

// 下の段のボタン
function buildControls() {
  const box = $('controls'); box.innerHTML = '';
  // 見る先（いちばん上）: 近く ⇄ 遠く の切りかえと、距離のスライダー
  const look = document.createElement('div'); look.className = 'grp look';
  look.innerHTML = `<span class="gname">見る先</span><button id="lookNear">近く ${fmtD(NEAR_D)}</button><button id="lookFar">遠く ${fmtD(FAR_D)}</button>` +
    `<input type="range" id="dist" min="0" max="${SL_MAX}" step="1" aria-label="物までの距離">`;
  box.appendChild(look);
  $('lookNear').onclick = () => { S.anim = null; applyCond({ d: NEAR_D }); };
  $('lookFar').onclick = () => { S.anim = null; applyCond({ d: FAR_D }); };
  $('swap').onclick = () => { S.anim = null; applyCond({ d: S.d === NEAR_D ? FAR_D : NEAR_D }); };
  $('dist').oninput = e => { if (S.replay) tlResume(); S.anim = null; S.d = slToD(+e.target.value); markEvent('物を動かす', true); retarget(); syncControls(); };
  const groups = [
    ['年齢', AGES.map(a => ({ key: a, label: a + '歳' })), () => S.age, 'age'],
    ['目の長さ', LENGTHS, () => S.len, 'len'],
    ['乱視', ASTIG_POWERS, () => S.astigP, 'astigP'],
    ['強い向き', ASTIG_AXES, () => S.astigAx, 'astigAx'],
    ['断面', SECS, () => S.sec, 'sec'],
    ['メガネ', GLASSES, () => S.glasses, 'glasses'],
    ['明るさ', LIGHTS, () => S.light, 'light'],
  ];
  for (const [name, items, get, key] of groups) {
    const row = document.createElement('div'); row.className = 'grp';
    row.innerHTML = `<span class="gname">${name}</span>`;
    for (const it of items) {
      const b = document.createElement('button'); b.textContent = it.label; b.dataset.k = it.key;
      b.onclick = () => { S.anim = null; applyCond({ [key]: it.key }); };
      row.appendChild(b);
    }
    row._get = get; row._key = key; box.appendChild(row);
  }
  const t = document.createElement('label'); t.className = 'grp chk';
  t.innerHTML = '<input type="checkbox" id="showTop"> 物の上の端からの光も';
  box.appendChild(t);
  $('showTop').onchange = e => { S.showTop = e.target.checked; };
  for (const b of document.querySelectorAll('.vtabs button')) b.onclick = () => { S.chart = b.dataset.c; syncControls(); };
}
function syncControls() {
  for (const row of document.querySelectorAll('#controls .grp')) {
    if (!row._get) continue;
    for (const b of row.querySelectorAll('button')) b.classList.toggle('on', String(row._get()) === b.dataset.k);
    if (row._key === 'sec' || row._key === 'astigAx') row.hidden = S.astigP === 0;   // 向き・断面の切りかえは乱視のときだけ
  }
  for (const b of document.querySelectorAll('.vtabs button')) b.classList.toggle('on', b.dataset.c === S.chart);
  $('showTop').checked = S.showTop;
  $('lookNear').classList.toggle('on', S.d === NEAR_D); $('lookFar').classList.toggle('on', S.d === FAR_D);
  $('swap').textContent = S.d === NEAR_D ? `⇄ 遠くを見る（${fmtD(FAR_D)}）` : `⇄ 近くを見る（${fmtD(NEAR_D)}）`;
  tlSync();
}
function syncSlider() { const el = $('dist'); if (el && document.activeElement !== el) el.value = Math.round(dToSl(S.d)); }

// 案内
function setTour(i) {
  if (S.replay) tlResume();
  S.tour = i; const st = TOUR[i];
  S.anim = null; S.sched = null;
  if (st.set) applyCond(st.set);
  if (st.win) TL.win = st.win;
  S.hl = st.hl; S.anim = st.anim ? { ...st.anim, t: 0 } : null;
  if (S.anim) { S.d = S.anim.from; markEvent('物を近づける'); }
  recompute(); syncControls();
  if (st.settle) { dynSettle(S, S.At, S.stopRt); darkSettle(S, lightOf().L); tlClear(); }   // 新しい場面: 目をすぐ合わせ、グラフも空にしてから始める
  S.sched = (st.go || []).map(g => { const o = { ...g }; delete o.at; return { t: S.t + g.at, o }; });
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
      if (S.replay) tlResume();
      drag = true; cv.setPointerCapture(e.pointerId); S.anim = null;
      S.d = xToD(Math.min(x, LAY.trackR)); markEvent('物を動かす', true); retarget(); syncControls(); hideTip();
    } else if (e.pointerType === 'touch') {   // さわった部分の説明（マウスのない画面）
      const h = hitTest(x, y); if (h) { showTip(h, x, y); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 4000); } else hideTip();
    }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (drag) { S.d = xToD(Math.min(x, LAY.trackR)); markEvent('物を動かす', true); retarget(); syncControls(); return; }
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
  const W = (tip.offsetParent || $('app')).clientWidth, w = tip.offsetWidth;
  const cb = $('cv').getBoundingClientRect(), sb = (tip.offsetParent || $('app')).getBoundingClientRect(), ox = cb.left - sb.left, oy = cb.top - sb.top;   // 吹き出しの基準（パソコン #stage、スマホ #app）
  tip.style.left = Math.max(8, Math.min(W - w - 8, ox + x + 14)) + 'px'; tip.style.top = (oy + y + 16) + 'px';
}
function hideTip() { $('tip').hidden = true; }
