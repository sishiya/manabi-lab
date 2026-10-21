// 波が育つまで — 遠くの嵐（ボタンで起こす。起こした時刻から、うねりが何日もかけて届く。計算は js/swell.js・地球儀は js/globe.js）
// 海の時計は 1 つ（S.t）。嵐が起きてからの時間 = S.t − STORM.t0。いる所の海 = 風の波 ＋ うねり（js/app.js の syncSea）。
'use strict';
const SW = window.WGswell, GL = window.WGglobe;
const STORM = { on: false, t0: 0 };
let SW_OBS = null, SW_ANG = Math.PI + 0.5, swPlace = 'obs', glbElev = null;

function startStorm() { STORM.on = true; STORM.t0 = S.t; $('stormMore').open = true; S.free = true; if (!S.play && S.t < TMAX) S.play = true; update(); stormDrawPanels(); }
function stopStorm() { STORM.on = false; SW_OBS = null; update(); stormDrawPanels(); }
$('stormBtn').onclick = () => STORM.on ? stopStorm() : startStorm();

// うねりを計算（update のたび）。嵐の前（時間のつまみを嵐より前へもどしたとき）は何も来ない
function stormUpdate() {
  const age = S.t - STORM.t0; SW.P.t = Math.max(0, age);
  SW_OBS = STORM.on && age > 0 ? SW.obs(age) : null;
  const b = $('stormBtn'); b.textContent = STORM.on ? '嵐を消す' : '遠くで嵐を起こす'; b.classList.toggle('on', STORM.on);
  // 画面の左上の札: 嵐の影響
  const chip = $('stStorm'); chip.hidden = !STORM.on;
  if (STORM.on) { const fa = SW.firstArrival(), o = SW_OBS;
    chip.textContent = age < 0 ? '嵐はまだ起きていない（時間を進めると起きる）'
      : SW.P.blocked ? '嵐のうねり: 陸にさえぎられて届かない'
      : o && o.Hm0 > 0.02 ? `嵐のうねり ${fmtLen(o.Hm0)}・周期 ${o.Tp.toFixed(0)} 秒（嵐から ${SW.fmtT(age)}）`
      : age < fa.t ? `嵐のうねりは、あと ${SW.fmtT(fa.t - age)} で届く` : '嵐のうねりは、もう通りすぎた'; }
}
// 嵐の欄の地図・時刻×周期の図・数字（開いているときだけ）
function stormDrawPanels() {
  swLabels();
  const open = $('stormMore').open; if (!open || !STORM.on) { $('swNums').innerHTML = STORM.on ? '' : '「遠くで嵐を起こす」をおすと、いまの時刻に、遠くで嵐が吹きはじめます。'; if (!STORM.on) return; }
  if (!open) return;
  SW.drawMap($('swMap')); SW.drawChart($('swChart'), TMAX);
  const o = SW_OBS || SW.obs(0), s2 = o.src, fa = SW.firstArrival(), lam = o.Tp > 0 ? W.G * o.Tp * o.Tp / (2 * Math.PI) : 0;
  $('swNums').innerHTML = `嵐の海: 高さ <b>${s2.Hm0.toFixed(1)} m</b>・周期 <b>${s2.Tp.toFixed(1)} 秒</b><br>`
    + `いちばん早い波（周期 ${fa.T.toFixed(0)} 秒）が着くのは、嵐から <b>${SW.fmtT(fa.t)}</b> 後<br>`
    + (SW.P.blocked ? '陸にさえぎられて、ここにはうねりが届きません。' : SW_OBS && o.Hm0 > 0.02 ? `いま届いているうねり: 高さ <b>${o.Hm0.toFixed(2)} m</b>・いちばん多い周期 <b>${o.Tp.toFixed(1)} 秒</b>（波長 ${lam.toFixed(0)} m・波の群れの速さ ${(SW.cg(1 / o.Tp) * 3.6).toFixed(0)} km/時）` : 'いまは、まだ（または、もう）うねりがほとんど届いていない');
}
$('stormMore').addEventListener('toggle', stormDrawPanels);
function swLabels() { const P2 = SW.P;
  $('swRl').textContent = (P2.R / 1e3).toFixed(0) + ' km'; $('swUl').textContent = P2.U + ' m/s'; $('swU').value = P2.U;
  $('swDl').textContent = (P2.Ds / 3600).toFixed(0) + ' 時間'; $('swD').value = P2.Ds / 3600; $('swLl').textContent = (P2.Ls / 1e3).toFixed(0) + ' km'; $('swL').value = P2.Ls / 1e3; }
$('swU').addEventListener('input', () => { SW.P.U = +$('swU').value; update(); stormDrawPanels(); });
$('swD').addEventListener('input', () => { SW.P.Ds = +$('swD').value * 3600; update(); stormDrawPanels(); });
$('swL').addEventListener('input', () => { SW.P.Ls = +$('swL').value * 1e3; update(); stormDrawPanels(); });

// 地球儀: 嵐といる所から、距離（大円）・横の広がり（球の上）・陸でさえぎられるか・うねりの来る向き
function swGeo() { const G2 = GL.G, a = GL.angDist(G2.storm, G2.obs), pc = GL.pathClear();
  Object.assign(SW.P, { R: a * GL.Re, Rs: GL.Re * Math.abs(Math.sin(a)), blocked: !pc.clear }); SW_ANG = GL.swellAngle();
  const f = ll => `${Math.abs(ll.lat).toFixed(0)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(0)}°${ll.lon >= 0 ? 'E' : 'W'}`;
  $('swGeo').textContent = `嵐 ${f(G2.storm)} → いる所 ${f(G2.obs)}。` + (pc.clear ? '道はずっと海。' : `嵐から ${(pc.at / 1e3).toFixed(0)} km の所で陸にさえぎられて、うねりは届きません。`);
  if (ocean) ocean.skyChanged(); update(); stormDrawPanels(); }   // いる所が動くと太陽・月の位置もかわる
function setSwPlace(k) { swPlace = k; document.querySelectorAll('#swPlace button').forEach(b => b.classList.toggle('on', b.dataset.p === k)); }
document.querySelectorAll('#swPlace button').forEach(b => b.onclick = () => setSwPlace(b.dataset.p));
$('globeBtn').onclick = () => { if (view !== 'orbit') setView('orbit'); camAnim = null; guideApi.camTo({ dist: 1.6e7, pitch: 1.42 }); };
GL.load().then(() => { glbElev = GL.texture(); swGeo(); }).catch(e => window.__wagrErr.push('地形データ: ' + e));
setSwPlace('storm');

// 地球儀をタップ: 嵐かいる所を置く（地球儀が見えているときだけ。置けたら true）
function stormTap(px, py, r) {
  if (!(SUN.globe && SUN.globe.alpha > 0.4)) return false;
  const b = cam.basis(), [tx, ty] = ocean.txty, nx = px / r.width * 2 - 1, ny = 1 - py / r.height * 2;
  const d0 = [0, 1, 2].map(i => b.cf[i] + nx * tx * b.cr[i] + ny * ty * b.cu[i]), l = Math.hypot(...d0), ll = GL.pick(b.pos, d0.map(v => v / l));
  if (!ll) return true;
  if (!GL.isSea(ll.lat, ll.lon)) { $('swGeo').textContent = 'そこは陸です。海の上をえらんでください。'; $('stormMore').open = true; return true; }
  if (swPlace === 'storm') GL.G.storm = ll; else GL.G.obs = ll;
  GL.moved(); swGeo(); return true;
}
// 高く引いたとき: 地球の丸み・見通し・地球儀（15〜80 km で重ねる）。高く引くほど真下を向く（20 km から、2000 km でほぼ真下）
function stormGlobe(b, dt) {
  const alt = Math.max(1, b.pos[1]);
  SUN.curvR = GL.Re; SUN.far = Math.max(30000, Math.min(400e3, 1.3 * Math.sqrt(2 * GL.Re * alt) + 30000)); SUN.fogL = Math.max(SUN.fogL, 40000); SUN.fogH = 8000;   // 地上の見通し 40 km（晴れの日の目安）、空気は 8 km ごとにうすく
  const a = Math.min(1, Math.max(0, (alt - 15e3) / 65e3)), al = a * a * (3 - 2 * a);
  SUN.globe = al > 0 && glbElev ? { alpha: al, alt, Re: GL.Re, M: new Float32Array(GL.worldToEcef()), elev: glbElev } : null;
  if (cam.dist > 20e3 && !camAnim) { const k = Math.min(1, Math.log(cam.dist / 20e3) / Math.log(100)), want = 0.15 + (1.42 - 0.15) * k; if (cam.pitch < want) cam.pitch += (want - cam.pitch) * Math.min(1, dt * 4); }
}
// 地球儀の上の線: うねりの前の面（周期ごと）・嵐からいる所への道・印
function stormOverlay(g, b, r) {
  if (!(SUN.globe && SUN.globe.alpha > 0.05)) return;
  const age = Math.max(0, S.t - STORM.t0), fr = STORM.on ? [[20, '#ff8f6b'], [15, '#ffc95a'], [11, '#9be07c'], [8, '#7fd0e8']].map(([T, col]) => ({ col, pts: age > 0 ? GL.front((SW.cg(1 / T) * age + SW.P.Ls / 2) / GL.Re) : [] })) : [];
  g.globalAlpha = SUN.globe.alpha; GL.drawOverlay(g, project, b.pos, fr, [[GL.G.storm, '#ff6b5a', STORM.on ? '嵐' : '嵐を起こす所'], [GL.G.obs, '#ffc95a', 'いる所']]); g.globalAlpha = 1;
  g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'left';
  g.fillText(STORM.on ? '線 = うねりの前の面（赤 20 秒・黄 15 秒・緑 11 秒・青 8 秒）' : 'タップで、えらんだほう（嵐・いる所）をそこへ置きます', 12, r.height - 30);
}
