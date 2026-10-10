// パネル・読み取り・光の道すじの図・見つけてみよう
'use strict';

const $ = id => document.getElementById(id);
const fmt = (v, d) => (isFinite(v) ? v.toFixed(d) : '—');
const KM_PER_M = 1.477e8;      // Gargantua（太陽の約1億倍）の M を km に。太陽 1 個ぶんで 1.477 km
const SEC_PER_M = 492.5;       // 同じく、時間の M を秒に（太陽 1 個ぶんで 4.925 μs）

function segWire(id, fn) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
    fn(b.dataset.v);
  });
}
function segSet(id, v) {
  for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(v)));
}

// ---- 見つけてみよう ----
const QUESTS = [
  { id: 'hat', t: L('穴の<b>上</b>に見える光の帯が、どこの光かを確かめる', 'Find out where the band of light <b>above</b> the hole comes from'), tip: L('「映画の角度」で、穴の上の帯をクリック', 'In “Movie angle”, click the band above the hole') },
  { id: 'under', t: L('上から見ているのに<b>円盤の下の面</b>が見えている所を見つける', 'Find where you can see <b>the underside of the disk</b>, even though you are looking from above'), tip: L('穴のすぐ下の細い帯をクリック', 'Click the thin band just below the hole') },
  { id: 'ring', t: L('<b>後ろ向きに折り返す</b>ほど（180°以上）曲がってきた光を見つける', 'Find light bent so much it <b>turned back</b> (more than 180°)'), tip: L('黒い影のふちの、細い光の輪のすぐそばをクリック', 'Click right next to the thin ring of light at the edge of the black shadow') },
  { id: 'real', t: L('<b>本当の見え方</b>にして、映画とのちがいを見る', 'Switch to <b>the real look</b> and compare it with the movie'), tip: L('「見え方」を切りかえる', 'Switch “Look”') },
  { id: 'spin', t: L('回転を<b>とても速く</b>して、真横から影の形を見る', 'Make the spin <b>very fast</b> and look at the shadow from the side'), tip: L('回転の速さ 0.95 以上、「真横」', 'Spin 0.95 or more, “Edge-on”') },
  { id: 'top', t: L('<b>真上</b>から見ると、円盤はどう見える？', 'What does the disk look like <b>from straight above</b>?'), tip: L('「真上」を押す', 'Press “From above”') },
  { id: 'close', t: L('穴に<b>近づいて</b>、時計の進み方を見る', '<b>Move close</b> to the hole and see how clocks run'), tip: L('ホイール（2本指）か、カメラの距離のつまみで 6M より近く', 'Use the wheel (two fingers) or the camera distance slider to get closer than 6M') },
  { id: 'grid', t: L('円盤をなくして<b>方眼の空</b>にし、空のゆがみを見る', 'Remove the disk and use the <b>grid sky</b> to see how the sky is warped'), tip: L('「まわりのもの」で切りかえる', 'Switch it in “Surroundings”') },
];
const questDone = {};
function buildQuests() {
  $('quests').innerHTML = QUESTS.map(q => `<li id="q-${q.id}"><span class="mk"></span><span>${q.t}<small>${q.tip}</small></span></li>`).join('');
}
function completeQuest(id, msg) {
  if (questDone[id]) return;
  questDone[id] = msg;
  const li = $('q-' + id); li.classList.add('done'); li.querySelector('small').innerHTML = msg;
  toast(msg);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.innerHTML = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6500);
}
function checkStateQuests() {
  if (S.real) completeQuest('real', L('こちらへ回ってくる側（左）が明るく青っぽく、遠ざかる側が暗く赤っぽい。映画では分かりにくいので、このずれを入れなかった', 'The side turning toward us (left) is bright and bluish, and the side moving away is dim and reddish. The movie left this out because it was hard to read.'));
  if (S.a >= 0.95 && Math.abs(S.th - Math.PI / 2) < 0.15)
    completeQuest('spin', L('影の左側がつぶれて平らになった（円盤を「なし」にすると、よく見える）。回転と同じ向きに進む光は、穴のすぐ近くまで寄っても落ちずに回れるから', 'The left side of the shadow got squashed flat (easier to see with the disk “Off”). Light moving the same way as the spin can come very close to the hole without falling in.'));
  if (S.th < 0.3 || S.th > Math.PI - 0.3) completeQuest('top', L('真上から見ると円盤はドーナツの形。円盤の内側は、光が曲げられるので実際より大きく見え、黒い影のすぐ外まで広がっている', 'From straight above, the disk is a donut. Because light is bent, the inner part of the disk looks bigger than it really is and reaches right up to the edge of the black shadow.'));
  if (S.r < 6) { const z = zamo(S.r, S.th, S.a); completeQuest('close', L(`ここの1時間は、遠くの <b>${fmt(1 / z.alpha, 2)} 時間</b>。穴に近いほど時計がゆっくり進む`, `One hour here is <b>${fmt(1 / z.alpha, 2)} hours</b> far away. The closer to the hole, the slower clocks run.`)); }
  if (!S.disk && S.sky === 'grid') completeQuest('grid', L('方眼が影のまわりで大きくゆがみ、影を囲む輪（アインシュタインリング）ができる。穴の真うしろの空が、輪になって見えている', 'The grid is strongly warped around the shadow, and a ring forms around it (an Einstein ring). The sky directly behind the hole is seen as a ring.'));
}
function checkPickQuests(res, ny) {
  if (res.kind === 'disk') {
    const behind = res.hitXYZ[0] < 0;
    const camAbove = Math.cos(S.th) > 0.02;
    if (behind && res.fromTop && ny > 0) completeQuest('hat', L('穴の上の帯は、<b>穴の向こう側の円盤</b>だった。光が穴の上を回り込んで届いている', 'The band above the hole is <b>the disk on the far side of the hole</b>. Its light bends over the top of the hole to reach us.'));
    if (behind && !res.fromTop && camAbove) completeQuest('under', L('上から見ているのに、<b>円盤の下の面</b>から出た光が、穴の下をくぐって届いている', 'Even though you are looking from above, light from <b>the underside of the disk</b> reaches you by passing under the hole.'));
  }
  if (res.kind !== 'hole' && res.kind !== 'lost' && res.bend > Math.PI) completeQuest('ring', L(`この光は <b>${Math.round(res.bend * 180 / Math.PI)}°</b> も曲がってきた。影のふちの細い輪は、穴のまわりを回ってきた光でできている`, `This light was bent by <b>${Math.round(res.bend * 180 / Math.PI)}°</b>. The thin ring at the edge of the shadow is made of light that went around the hole.`));
}

// ---- 読み取り ----
function kmText(m) {
  const km = m * KM_PER_M;
  if (LANG === 'en') return km >= 1e9 ? `${(km / 1e9).toFixed(km < 1e10 ? 2 : 1)} billion km` : `${(km / 1e6).toFixed(km < 1e8 ? 1 : 0)} million km`;
  if (km >= 1e8) return `${(km / 1e8).toFixed(km < 1e9 ? 2 : 1)}億 km`;
  return `${Math.round(km / 1e4).toLocaleString()}万 km`;
}
function hourText(sec) {
  if (sec < 5400) return L(`${Math.round(sec / 60)} 分`, `${Math.round(sec / 60)} min`);
  if (sec < 86400 * 2) return L(`${(sec / 3600).toFixed(1)} 時間`, `${(sec / 3600).toFixed(1)} h`);
  return L(`${(sec / 86400).toFixed(1)} 日`, `${(sec / 86400).toFixed(1)} days`);
}
function updateCamGrid() {
  const z = zamo(S.r, S.th, S.a), rh = horizon(S.a), ri = iscoR(S.a);
  const slow = 1 / z.alpha, slowT = slow < 1.0005 ? '1.00' : fmt(slow, slow < 10 ? 3 : 1);
  const rows = [
    [L('カメラの距離', 'Camera distance'), `${fmt(S.r, 1)} M <small>${kmText(S.r)}</small>`],
    [L('カメラの緯度', 'Camera latitude'), `${fmt(90 - S.th * 180 / Math.PI, 0)}° <small>${L('0° が円盤の面', '0° = plane of the disk')}</small>`],
    [L('ここの1時間は遠くの', '1 hour here is, far away,'), L(`${slowT} 時間`, `${slowT} h`)],
    [L('地平面の半径', 'Horizon radius'), `${fmt(rh, 2)} M <small>${kmText(rh)}</small>`],
    [L('円盤のいちばん内側', 'Inner edge of the disk'), `${fmt(ri, 2)} M <small>${L('1周', 'one orbit')} ${hourText(TAU * (ri ** 1.5 + S.a) * SEC_PER_M)}</small>`],
  ];
  $('camGrid').innerHTML = rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  $('camGrid').insertAdjacentHTML('beforeend', `<p class="ro-note" style="grid-column:1/-1">${L('km と時間は、Gargantua（太陽の約1億倍の重さ。映画の設定）の場合。M は質量を長さにしたもので、この大きさだと地球と太陽の距離とほぼ同じ。', 'km and times are for Gargantua (about 100 million times the mass of the Sun, as set in the movie). M is the mass turned into a length; at this size it is about the distance from the Earth to the Sun.')}</p>`);
}
function updateCaps() {
  $('realCap').innerHTML = S.real
    ? L('円盤のガスの動きによるドップラー効果と、重力による赤方偏移を入れています。明るさは振動数のずれの4乗で変わります。', 'Includes the Doppler effect from the moving gas in the disk and the redshift from gravity. Brightness changes with the 4th power of the frequency shift.')
    : L('映画と同じく、色と明るさのずれを入れていません。円盤の左右は同じ明るさ・同じ色です。', 'Like the movie, the shifts in color and brightness are left out. Both sides of the disk have the same brightness and color.');
  const a = S.a;
  const note = a < 0.01 ? L('回っていないブラックホール。影はまんまる。', 'A non-spinning black hole. The shadow is perfectly round.') : a > 0.9 ? L('とても速い。真横から見ると影の左側が平らになる。', 'Very fast. Seen edge-on, the left side of the shadow becomes flat.') : Math.abs(a - 0.6) < 0.01 ? L('映画の絵に使われた速さ。', 'The spin used for the movie images.') : '';
  $('spinCap').innerHTML = L(`回転の速さ <b class="mono">${a.toFixed(3)}</b>（いちばん速いときを 1 とした値）。${note}`, `Spin <b class="mono">${a.toFixed(3)}</b> (1 = the fastest possible). ${note}`);
}
function probeText() {
  const p = S.pick;
  if (!p) { $('probe').innerHTML = ''; return; }
  const k = (LANG === 'en' ? { hole: 'light that falls into the hole (shadow)', disk: 'light from the disk', sky: 'light from the sky', lost: 'light that keeps circling the hole' }
    : { hole: '穴に落ちる光（影）', disk: '円盤からの光', sky: '空からの光', lost: '穴のまわりを回り続ける光' })[p.res.kind];
  $('probe').innerHTML = L(`クリックした点: <b>${k}</b>`, `Clicked point: <b>${k}</b>`);
}

// ---- 光の道すじ ----
function describeRay(res, ny) {
  const bend = Math.round(res.bend * 180 / Math.PI);
  const near = L(`穴にいちばん近づいた所: <b>${fmt(res.rmin, 2)} M</b>（地平面 ${fmt(horizon(S.a), 2)} M）。`, `Closest approach to the hole: <b>${fmt(res.rmin, 2)} M</b> (horizon ${fmt(horizon(S.a), 2)} M).`);
  let tag = '', html = '';
  if (res.kind === 'hole' || res.kind === 'lost') {
    tag = L('影', 'shadow');
    html = L(`<p>この方向へ光をたどると、<b>穴に落ちてしまいます</b>。だから、ここから届く光はなく、黒く見えます。穴そのものより影が大きいのは、穴のそばをかすめる光も吸いこまれるからです。</p>`,
      `<p>Tracing light back in this direction, it <b>falls into the hole</b>. So no light arrives from here, and it looks black. The shadow is bigger than the hole itself because light that passes close by is also swallowed.</p>`);
  } else if (res.kind === 'disk') {
    const behind = res.hitXYZ[0] < 0;
    const side = behind ? L('向こう側', 'far side') : L('手前', 'near side'), face = res.fromTop ? L('上の面', 'top face') : L('下の面', 'underside');
    tag = L(`円盤の${side}・${face}`, `disk: ${side}, ${face}`);
    let how = '';
    if (behind && res.fromTop && ny > 0) how = L('光は穴の<b>上を回り込んで</b>届きました。だから穴の上に、向こう側の円盤が見えます。', 'The light <b>bent over the top</b> of the hole to reach us. That is why the far side of the disk appears above the hole.');
    else if (behind && !res.fromTop) how = L('光は穴の<b>下をくぐって</b>届きました。円盤の下の面が見えています。', 'The light <b>passed under</b> the hole to reach us. You are seeing the underside of the disk.');
    else if (res.bend > Math.PI * 0.9) how = L('光は穴のまわりを大きく回ってきました。', 'The light swung a long way around the hole.');
    else how = L('光はほぼまっすぐ届きました。', 'The light came almost straight.');
    html = L(`<p>円盤の<b>${side}</b>の<b>${face}</b>、穴の中心から <b>${fmt(res.rHit, 1)} M</b> の所から出た光です。${how}</p>`,
      `<p>Light from the <b>${face}</b> of the disk on the <b>${side}</b>, <b>${fmt(res.rHit, 1)} M</b> from the center of the hole. ${how}</p>`);
    if (S.real) html += L(`<p>この光の振動数は、出たときの <b class="k">${fmt(res.g, 2)} 倍</b>（明るさは ${fmt(res.g ** 4, 2)} 倍）。${res.g > 1 ? 'こちらへ向かって回ってくるガスから出た光なので、青く明るく見えます。' : '遠ざかるガスの光や、穴の近くから重力をのぼってきた光は、赤く暗く見えます。'}</p>`,
      `<p>This light’s frequency is <b class="k">${fmt(res.g, 2)} times</b> what it was when it left (brightness ${fmt(res.g ** 4, 2)} times). ${res.g > 1 ? 'It came from gas swinging toward us, so it looks blue and bright.' : 'Light from gas moving away, or light climbing out of gravity from close to the hole, looks red and dim.'}</p>`);
  } else {
    tag = L('空', 'sky');
    html = L(`<p>遠くの空からの光です。${bend > 20 ? '穴の重力で曲げられて届いたので、星の位置がずれて見えます。' : ''}</p>`,
      `<p>Light from the distant sky. ${bend > 20 ? 'It was bent by the hole’s gravity on the way, so the stars appear shifted.' : ''}</p>`);
  }
  if (res.kind === 'hole' || res.kind === 'lost') html += L(`<p>右の図の灰色の線が、たどった道すじです。</p>`, `<p>The gray line in the diagram is the traced path.</p>`);
  else html += L(`<p>光が曲がった角度: <b>${bend}°</b>。${near}</p>`, `<p>Bending angle: <b>${bend}°</b>. ${near}</p>`);
  return { tag, html };
}

// 1 つの図を大きく。view: 'side'（横から。x が右・z が上）／'top'（上から。x が右・y が上）、zoom: 'all'／'near'
const RAYV = { view: 'side', zoom: 'all' };
function drawRay(res) {
  const cv = $('rayCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const a = S.a, rh = horizon(a), side = RAYV.view === 'side';
  const PX = p => p[0], PY = side ? p => p[2] : p => p[1];
  const cam = toXYZ(S.r, S.th, 0, a);
  // 見せる範囲
  let x0, x1, y0, y1;
  if (RAYV.zoom === 'near') { x0 = -8; x1 = 8; y0 = -8; y1 = 8; }
  else {
    x0 = -S.rout * 1.05; x1 = S.rout * 1.05; y0 = side ? -4 : -S.rout * 1.05; y1 = side ? 4 : S.rout * 1.05;
    const lim = Math.max(S.r, S.rout) * 1.25;
    const pts = [cam].concat(res ? res.pts.filter(p => Math.hypot(...p) < lim) : []);
    for (const p of pts) { x0 = Math.min(x0, PX(p)); x1 = Math.max(x1, PX(p)); y0 = Math.min(y0, PY(p)); y1 = Math.max(y1, PY(p)); }
  }
  const m = 26, sc = Math.min((W - 2 * m) / (x1 - x0), (H - 2 * m) / (y1 - y0));
  const ox = W / 2 - (x0 + x1) / 2 * sc, oy = H / 2 + (y0 + y1) / 2 * sc;
  const X = p => ox + PX(p) * sc, Y = p => oy - PY(p) * sc;
  g.font = '22px "Zen Kaku Gothic New", sans-serif'; g.lineCap = 'round'; g.lineJoin = 'round';
  // 回転軸（横から）
  if (side) {
    g.setLineDash([6, 8]); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ox, 4); g.lineTo(ox, H - 4); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(L('回転軸', 'spin axis'), ox + 8, 26);
  }
  // 円盤
  if (S.disk) {
    g.fillStyle = 'rgba(255,170,90,.25)'; g.strokeStyle = 'rgba(255,170,90,.75)';
    if (side) {
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(ox + S.rin * sc, oy); g.lineTo(ox + S.rout * sc, oy);
      g.moveTo(ox - S.rin * sc, oy); g.lineTo(ox - S.rout * sc, oy); g.stroke();
    } else {
      g.beginPath(); g.arc(ox, oy, S.rout * sc, 0, TAU); g.arc(ox, oy, S.rin * sc, 0, TAU, true); g.fill();
      // 回る向き（上から見て左回り）
      const rr = Math.min(S.rout * 0.9, 7.2) * sc;
      g.strokeStyle = 'rgba(255,210,150,.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(ox, oy, rr, -2.5, -1.7); g.stroke();
      const ex = ox + Math.cos(-2.5) * rr, ey = oy + Math.sin(-2.5) * rr;
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + 3, ey + 13); g.moveTo(ex, ey); g.lineTo(ex + 13, ey + 1); g.stroke();
    }
  }
  // 光が回れる円軌道（点線）と穴
  const ph = photonR(a);
  g.setLineDash([5, 7]); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(ox, oy, ph.retro * sc, 0, TAU); g.stroke();
  if (a > 0.05) { g.beginPath(); g.arc(ox, oy, ph.pro * sc, 0, TAU); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = '#000'; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(ox, oy, Math.max(2, Math.sqrt(rh * rh + a * a) * sc), 0, TAU); g.fill(); g.stroke();
  // 光（実際は、終わりの点 → カメラの向きに進む）
  if (res) {
    const col = { disk: '#ffc277', sky: '#8fc4ff', hole: '#a0a0a0', lost: '#a0a0a0' }[res.kind];
    g.strokeStyle = col; g.lineWidth = 3.5;
    g.beginPath(); res.pts.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)))); g.stroke();
    if (res.kind !== 'hole' && res.kind !== 'lost') {
      // 矢じり（光の進む向き）を道すじの途中に 2 つ
      for (const f of [0.35, 0.75]) {
        const i = Math.max(1, Math.floor(res.pts.length * f)), p = res.pts[i], q = res.pts[i - 1];
        const dx = X(q) - X(p), dy = Y(q) - Y(p), l = Math.hypot(dx, dy);
        if (l < 1e-6) continue;
        const ux = dx / l, uy = dy / l, px = X(q), py = Y(q);
        g.fillStyle = col; g.beginPath(); g.moveTo(px + ux * 9, py + uy * 9);
        g.lineTo(px - ux * 7 - uy * 7, py - uy * 7 + ux * 7); g.lineTo(px - ux * 7 + uy * 7, py - uy * 7 - ux * 7); g.fill();
      }
    }
    const e = res.pts[res.pts.length - 1];
    g.fillStyle = col; g.beginPath(); g.arc(X(e), Y(e), 7, 0, TAU); g.fill();
    if (res.kind === 'disk') { g.fillStyle = col; g.fillText(res.fromTop ? L('円盤の上の面', 'top face of disk') : L('円盤の下の面', 'underside of disk'), Math.min(X(e) + 10, W - 140), Math.max(26, Y(e) + (res.fromTop ? -12 : 30))); }
  }
  // カメラ
  const cx = X(cam), cy = Y(cam);
  if (cx > -10 && cx < W + 10 && cy > -10 && cy < H + 10) {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(L('カメラ', 'camera'), Math.min(cx - 30, W - 80), Math.max(26, cy - 16));
  } else { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(L('カメラは図の外', 'camera is off the diagram'), W - 170, H - 12); }
  g.fillStyle = 'rgba(255,255,255,.4)';
  g.fillText(side ? L('横から見た図', 'side view') : L('上から見た図', 'top view'), 12, H - 12);
}

function showPick(res, ny) {
  const d = describeRay(res, ny);
  $('rayTag').textContent = d.tag;
  $('rayText').innerHTML = d.html;
  drawRay(res);
  probeText();
  checkPickQuests(res, ny);
}

function drawMark() {
  const cv = $('mark'), g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  if (!S.pick) return;
  const x = (S.pick.nx * 0.5 + 0.5) * cv.width, y = (0.5 - S.pick.ny * 0.5) * cv.height, s = devicePixelRatio || 1;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5 * s;
  g.beginPath(); g.arc(x, y, 9 * s, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(x - 14 * s, y); g.lineTo(x - 5 * s, y); g.moveTo(x + 5 * s, y); g.lineTo(x + 14 * s, y);
  g.moveTo(x, y - 14 * s); g.lineTo(x, y - 5 * s); g.moveTo(x, y + 5 * s); g.lineTo(x, y + 14 * s); g.stroke();
}

function syncUI() {
  segSet('segReal', S.real ? 'real' : 'film');
  segSet('segSpin', [0, 0.6, 0.99].find(v => Math.abs(v - S.a) < 0.001) ?? '');
  $('spin').value = S.a;
  segSet('segSky', S.sky); segSet('segDisk', S.disk ? 'on' : 'off');
  segSet('segPreset', S.preset || '');
  $('dist').value = distToSlider(S.r);
  $('btnPause').setAttribute('aria-pressed', String(S.paused));
  $('btnPause').textContent = S.paused ? L('円盤を回す', 'Spin the disk') : L('円盤を止める', 'Stop the disk');
  updateCaps(); updateCamGrid();
}

function buildUI() {
  buildQuests();
  // 言語の切り替え（ページを読み直す）と、言語で変わる属性（I18N.md）
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  document.title = L('ブラックホールの見え方', 'What a Black Hole Looks Like');
  $('view').setAttribute('aria-label', L('ブラックホールと、そのまわりを回るガスの円盤。ドラッグでまわりを回り、クリックするとその点に届いた光の道すじを横の図に出します', 'A black hole and the gas disk orbiting it. Drag to orbit around; click to show, in the diagram, the path of the light that reached that point.'));
  $('toolbar').setAttribute('aria-label', L('見る位置と時間', 'Viewpoint and time'));
  $('rayCv').setAttribute('aria-label', L('クリックした点に届いた光の道すじの図', 'Diagram of the path of light that reached the clicked point'));
  $('spin').setAttribute('aria-label', L('回転の速さ（いちばん速いときを 1 とした値）', 'Spin (1 = the fastest possible)'));
  $('dist').setAttribute('aria-label', L('ブラックホールからカメラまでの距離', 'Distance from the black hole to the camera'));
  segWire('segReal', v => { S.real = v === 'real'; changed(false); });
  segWire('segSpin', v => setSpin(+v));
  $('spin').addEventListener('input', e => setSpin(+e.target.value));
  segWire('segSky', v => { S.sky = v; changed(false); });
  segWire('segDisk', v => { S.disk = v === 'on'; changed(true); });
  segWire('segPreset', v => applyPreset(v));
  $('dist').addEventListener('input', e => { S.r = sliderToDist(+e.target.value); S.preset = ''; changed(true); });
  $('btnPause').addEventListener('click', () => { S.paused = !S.paused; syncUI(); });
  $('hint').addEventListener('click', () => $('hint').classList.toggle('open'));
  segWire('segRayView', v => { RAYV.view = v; segSet('segRayView', v); drawRay(S.pick && S.pick.res); });
  segWire('segRayZoom', v => { RAYV.zoom = v; segSet('segRayZoom', v); drawRay(S.pick && S.pick.res); });
  drawRay(null);
  syncUI();
}
