// ひとしずくの進化 — 画面と操作
import { World, DT, GI, GENES, eSplit, speedOf, W, H, founderGenome, cladeNameEn } from './sim.js';
import { founderBody } from './body.js';
import { Renderer, drawBodyDiagram } from './render.js';
import { Graph, cladeColor, fmtT } from './graph.js';
import { makeSim } from './simlink.js';
import { get as getSave, put as putSave } from './save.js';
import { PAGES, START, shapeOf, startShape, drawShape } from './book.js';
import { PRESETS } from './presets.js';

const $ = id => document.getElementById(id);
// 系統の呼び名: 日本語は記録された名前、英語は遺伝子と体から作る（Worker から届く写しには name_en）
const nameOf = c => LANG !== 'en' ? c.name : c.name_en || (c.g && c.b ? cladeNameEn(c.g, c.b) : c.name);
// 言語: JP／EN のボタン（押すと読み直す）と、英語のときの題名・aria-label・title（HTML は日本語で書いてある）
document.querySelectorAll('.langsw button').forEach(b => { b.classList.toggle('on', b.dataset.l === LANG); b.onclick = () => setLang(b.dataset.l); });
if (LANG === 'en') {
  document.title = 'Evolution in a Drop';
  for (const [sel, attr, v] of [
    ['#view', 'aria-label', 'Microscope view'], ['#cardClose', 'aria-label', 'Close'], ['#cBody', 'aria-label', 'Body shape'], ['#bookBig', 'aria-label', 'Shape'],
    ['#aboutBtn', 'aria-label', 'About this app'], ['#aboutBtn', 'title', 'About this app'], ['#menuBtn', 'aria-label', 'Menu'], ['#menuBtn', 'title', 'Menu'], ['#menu', 'aria-label', 'Menu'],
    ['#bookBtn', 'title', 'Field guide of shapes'], ['#env', 'aria-label', 'Sea'], ['#envBtn', 'title', 'Sea nutrients, light and current'], ['#speedBtn', 'title', 'Speed'], ['.speeds', 'aria-label', 'Speed'],
    ['.stats .gen', 'title', 'Average generation of the creatures alive now, counted from the beginning'], ['#sTampered', 'title', 'A drop where creatures were added from outside the rules'],
    ['#starts', 'aria-label', 'Where to start'], ['[aria-label="一滴の大きさ"]', 'aria-label', 'Size of the drop'], ['[aria-label="砂つぶ"]', 'aria-label', 'Sand grains'], ['[aria-label="はじめの数"]', 'aria-label', 'Number at the start'],
  ]) document.querySelectorAll(sel).forEach(e => e.setAttribute(attr, v));
  for (const id of ['foodOut', 'lightOut', 'flowOut']) $(id).textContent = 'normal';
  $('sTime').textContent = '0s';
}
const q = new URLSearchParams(location.search);
let seed = +(q.get('seed') || (Date.now() % 100000));
let size = ['s', 'm', 'l'].includes(q.get('size')) ? q.get('size') : 'm';   // 一滴の大きさ
let sand = ['0', '1', '2'].includes(q.get('sand')) ? +q.get('sand') : 1;   // 砂つぶ（地形）
let pop = ['1', '10', '50', '150'].includes(q.get('pop')) ? +q.get('pop') : 150;   // はじめの数（2026-11-01 ユーザー「初期個体数も入れて。1体も選びたい」）
// 計算は Web Worker で（js/simlink.js・worker.js）。?noworker で今までどおり画面側で回す。world は一滴（Worker のときは届いた写し）
let sim = makeSim(!q.has('noworker'));
let world = null;
sim.onInit = () => onWorld();   // 一滴を作るのは、ページの準備がすべて終わってから（いちばん下）
// Worker が動かなければ、画面側で回す形にかえて、同じ一滴を作りなおす
sim.onFail = () => { const last = sim.last; sim = makeSim(false); sim.onInit = () => onWorld(); window.__sim = sim; if (last) sim[last[0]](last[1]); sim.run(speed, playing); };
const view = $('view'), ren = new Renderer(view), graph = new Graph($('graph'));
ren.style = 'abyss';         // 造形は「深海の発光」F3（2026-10-31 ユーザーが選んだ。abyss.js。その前は案B「燐光」・案A「設計図」。ほかの案は look/）
if (q.has('test')) document.body.classList.add('test');
let speed = 4, playing = true, sel = null, follow = false, selClade = null;
let realTime = 0;

function resize() {
  ren.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  graph.resize();
  const fz = ren.fitZoom();
  if (ren.cam.z < fz) ren.cam.z = fz;
  clampCam();
}
addEventListener('resize', resize);
resize();
ren.cam.z = Math.max(ren.fitZoom(), Math.min(1.3, Math.min(ren.w, ren.h) / 500));

function clampCam() {
  const c = ren.cam, hw = ren.w / 2 / c.z, hh = ren.h / 2 / c.z;
  const m = 60;
  c.x = hw * 2 > W + m * 2 ? W / 2 : Math.min(Math.max(c.x, hw - m), W + m - hw);
  c.y = hh * 2 > H + m * 2 ? H / 2 : Math.min(Math.max(c.y, hh - m), H + m - hh);
}

// ── 置くメニュー（右クリック・指の長押し）: 砂つぶを落とす。?test のときは決まった生き物も置ける（その一滴には「手を加えた」印） ──
let ctxAt = null;
function openCtx(sx, sy) {
  if (!world || title) return;
  ctxAt = ren.toWorld(sx, sy);
  const m = $('ctx'); m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(sx, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(sy, innerHeight - r.height - 8) + 'px';
}
const closeCtx = () => { $('ctx').hidden = true; };
view.addEventListener('contextmenu', e => { e.preventDefault(); openCtx(e.clientX, e.clientY); });
addEventListener('pointerdown', e => { if (!$('ctx').hidden && !e.target.closest('#ctx')) closeCtx(); }, true);
$('ctx').querySelectorAll('[data-grain]').forEach(b => b.onclick = () => { sim.addGrain(ctxAt.x, ctxAt.y, +b.dataset.grain); closeCtx(); });
if (q.has('test')) {
  $('ctxOrgs').hidden = false;
  $('ctxOrgs').innerHTML = `<p>${L('生き物（確かめ用）', 'Creatures (for testing)')}</p>` + PRESETS.map(p => `<button type="button" data-spawn="${p.id}">${L(p.name, p.name_en)}</button>`).join('');
  $('ctxOrgs').querySelectorAll('[data-spawn]').forEach(b => b.onclick = () => { sim.spawn(b.dataset.spawn, ctxAt.x, ctxAt.y, 3); closeCtx(); toast(L('この一滴は「手を加えた一滴」になりました', 'This drop is now marked as “changed by hand”')); });
}

// ── 見る操作（ドラッグ・ホイール・指2本） ──
const ptrs = new Map();
let down = null, pinch = null;
view.addEventListener('pointerdown', e => {
  try { view.setPointerCapture(e.pointerId); } catch (_) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    down = { x: e.clientX, y: e.clientY, cx: ren.cam.x, cy: ren.cam.y, moved: false };
    // 指の長押しで、置くメニュー（右クリックと同じ）
    if (e.pointerType !== 'mouse') { const d = down; d.timer = setTimeout(() => { if (down === d && !d.moved) { d.long = true; openCtx(d.x, d.y); } }, 550); }
  }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: ren.cam.z }; down = null; }
});
view.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / ren.cam.z);
  } else if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) { down.moved = true; clearTimeout(down.timer); follow = false; view.classList.add('drag'); }
    if (down.moved) { ren.cam.x = down.cx - dx / ren.cam.z; ren.cam.y = down.cy - dy / ren.cam.z; clampCam(); }
  }
});
const up = e => {
  ptrs.delete(e.pointerId);
  view.classList.remove('drag');
  if (down) clearTimeout(down.timer);
  if (down && !down.moved && !down.long && e.type === 'pointerup') pick(e.clientX, e.clientY);
  if (ptrs.size < 2) pinch = null;
  down = null;
};
view.addEventListener('pointerup', up);
view.addEventListener('pointercancel', up);
view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

// はじめの寄り: 「はじめから」で入ったら、まん中近くの1匹にぐっと寄って 6 秒、そこから 24 秒かけて一滴全体へ引く。さわったらやめる（RELEASE.md 4章の9）
let intro = null, introNext = false;
const defZoom = () => Math.max(ren.fitZoom(), Math.min(1.3, Math.min(ren.w, ren.h) / 500));
function startIntro() { intro = { t: 0, o: null, z0: Math.min(ren.w, ren.h) / 110 }; }
function stepIntro(fdt) {
  const I = intro;
  // Worker のときは、生き物の写しが届いてから選ぶ
  if (!I.o) { if (!world?.orgs.length) return; I.o = world.orgs.reduce((a, b) => Math.hypot(b.x - W / 2, b.y - H / 2) < Math.hypot(a.x - W / 2, a.y - H / 2) ? b : a); }
  I.t += fdt;
  const u = Math.min(1, Math.max(0, (I.t - 6) / 24)), e = u * u * (3 - 2 * u), zd = defZoom();
  if (!I.o.dead) { I.x = I.o.x; I.y = I.o.y; }
  ren.cam.z = Math.exp(Math.log(I.z0) + (Math.log(zd) - Math.log(I.z0)) * e);
  ren.cam.x = I.x + (W / 2 - I.x) * e; ren.cam.y = I.y + (H / 2 - I.y) * e; clampCam();
  if (u >= 1) intro = null;
}
view.addEventListener('pointerdown', () => { intro = null; }, true);
view.addEventListener('wheel', () => { intro = null; }, true);
function zoomAt(sx, sy, k) {
  const before = ren.toWorld(sx, sy);
  ren.cam.z = Math.min(12, Math.max(ren.fitZoom(), ren.cam.z * k));
  const after = ren.toWorld(sx, sy);
  if (!follow) { ren.cam.x += before.x - after.x; ren.cam.y += before.y - after.y; }
  clampCam();
}

function pick(sx, sy) {
  const p = ren.toWorld(sx, sy);
  const o = world.orgAt(p.x, p.y, 14 / ren.cam.z);
  select(o);
}

function select(o) {
  if (o) intro = null;
  sel = o; follow = !!o; selClade = o ? o.clade : null;
  $('card').hidden = !o;
  document.body.classList.toggle('picked', !!o);
  if (o) { $('toast').hidden = true; toastT = 0; }
  if (o && ren.cam.z < 2.2) ren.cam.z = Math.max(ren.cam.z, Math.min(3, ren.fitZoom() * 4));
  if (o) { hintOnce = true; renderCard(true); }
}

// 系統樹から系統を選ぶ → その系統のいちばん年上を追う
$('graph').addEventListener('click', e => {
  if (graph.mode !== 'tree') return;
  const r = e.currentTarget.getBoundingClientRect();
  const id = graph.hitTree(e.clientX - r.left, e.clientY - r.top);
  if (!id) return;
  const live = world.orgs.filter(o => o.clade === id);
  if (live.length) select(live.reduce((a, b) => a.age > b.age ? a : b));
  else { const c = world.clades.get(id); if (!c) return; selClade = id; toast(L(`「${c.name}」(系統 ${c.id}) は ${fmtT(c.died)} に絶えた`, `“${nameOf(c)}” (lineage ${c.id}) died out at ${fmtT(c.died)}`)); }
});

// ── 下の操作 ──
$('play').onclick = () => setPlaying(!playing);
function setPlaying(p) { playing = p; sim.run(speed, playing); $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? L('止める', 'Pause') : L('動かす', 'Play')); }
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
function setSpeed(s) { speed = s; sim.run(speed, playing); $('speedBtn').textContent = `×${s}`; $('speedBtn').classList.remove('slow'); openPop(null); document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s)); if (!playing) setPlaying(true); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  graph.mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || $('book').open || $('menu').open || $('help').open || $('extinct').open || !$('gate').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16);
  else if (e.key === '4') setSpeed(256); else if (e.key === '5') setSpeed(1024);
  else if (e.key === 'Escape') { closeCtx(); select(null); }
  else if (e.key === 'm' || e.key === 'M') openMenu();
});

// 速さと環境のたたみ: ボタンで開き、もう一度押すか外を押すと閉じる
function openPop(which) {
  const sp = which === 'speed' && !$('transport').classList.contains('speedOpen'), en = which === 'env' && !$('env').classList.contains('open');
  $('transport').classList.toggle('speedOpen', sp); $('speedBtn').setAttribute('aria-expanded', sp);
  $('env').classList.toggle('open', en); $('envBtn').setAttribute('aria-expanded', en);
}
$('speedBtn').onclick = () => openPop('speed');
$('envBtn').onclick = () => openPop('env');
addEventListener('pointerdown', e => { if (!e.target.closest('.transport, #env')) openPop(null); });
// ── 環境 ──
const level = (v, lo, hi, few = L('少ない', 'low'), many = L('多い', 'high')) => v < lo ? few : v > hi ? many : L('ふつう', 'normal');
$('food').oninput = e => { const v = +e.target.value; sim.set('foodRate', v); $('foodOut').textContent = level(v, 0.6, 1.5); };
if (q.has('food')) { $('food').value = q.get('food'); $('food').oninput({ target: $('food') }); }   // URL の ?food= で海の栄養をはじめから
$('light').oninput = e => { const v = +e.target.value; sim.set('light', v); $('lightOut').textContent = v < 0.05 ? L('まっくら', 'dark') : level(v, 0.4, 0.8, L('弱い', 'weak'), L('強い', 'strong')); };
if (q.has('light')) { $('light').value = q.get('light'); $('light').oninput({ target: $('light') }); }   // URL の ?light= で光をはじめから
$('flow').oninput = e => { const v = +e.target.value; sim.set('flow', v); $('flowOut').textContent = v < 0.05 ? L('とまる', 'still') : level(v, 0.6, 1.4, L('弱い', 'weak'), L('強い', 'strong')); };
// ── メニュー（新しく始めるのはここからだけ。もう一度たずねる） ──
let playingBeforeMenu = true;
function openMenu() {
  playingBeforeMenu = playing; setPlaying(false);
  $('menuMain').hidden = false; $('menuConfirm').hidden = true;
  $('menuSeed').textContent = L(`一滴の番号 ${seed}・${fmtT(world ? world.t : 0)}`, `Drop no. ${seed} · ${fmtT(world ? world.t : 0)}`);
  $('menu').showModal();
}
$('menu').addEventListener('close', () => { if (!$('help').open && $('gate').hidden) setPlaying(playingBeforeMenu); });   // タイトルにもどったときは止めたまま
$('menuBtn').onclick = openMenu;
$('mResume').onclick = () => $('menu').close();
// メニューと「このアプリについて」は、外（うしろの暗い所）を押したら閉じる
for (const id of ['menu', 'help', 'extinct', 'book']) $(id).addEventListener('click', e => {
  if (e.target !== $(id)) return;
  const r = $(id).getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $(id).close();
});
// すべていなくなったとき: 自動でやり直さず、まん中に知らせる（1つの一滴につき1回）
let extinctShown = false, exWasPlaying = true;
function checkExtinct() {
  if (extinctShown || title || !world || world.orgs.length || world.t < 1) return;
  extinctShown = true;
  $('exText').textContent = L(`${fmtT(world.t)} に、さいごの生き物がいなくなりました。はじめから始めるか、生き物のいない一滴をこのまま眺めるかを選べます。`, `At ${fmtT(world.t)}, the last creature was gone. You can start over, or keep watching the empty drop.`);
  exWasPlaying = playing; setPlaying(false);   // 選ぶまで止める
  $('extinct').showModal(); $('exNew').focus();
}
$('exNew').onclick = () => { $('extinct').close(); fromTitle = false; openMenu(); openNew(); };
$('exWatch').onclick = () => $('extinct').close();
$('extinct').addEventListener('close', () => { if (!$('menu').open) setPlaying(exWasPlaying); });   // 眺めるなら元の速さで
// このアプリについて（右上の ？）
$('aboutBtn').onclick = () => { playingBeforeMenu = playing; setPlaying(false); $('help').showModal(); };
$('help').addEventListener('close', () => setPlaying(playingBeforeMenu));
let newSize = size, newSand = sand, newPop = pop;
const showPop = () => document.querySelectorAll('[data-pop]').forEach(b => { b.classList.toggle('on', +b.dataset.pop === newPop); b.setAttribute('aria-checked', +b.dataset.pop === newPop); });
document.querySelectorAll('[data-pop]').forEach(b => b.onclick = () => { newPop = +b.dataset.pop; showPop(); });
const showSize = () => document.querySelectorAll('[data-size]').forEach(b => { b.classList.toggle('on', b.dataset.size === newSize); b.setAttribute('aria-checked', b.dataset.size === newSize); });
document.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { newSize = b.dataset.size; showSize(); });
const showSand = () => document.querySelectorAll('[data-sand]').forEach(b => { b.classList.toggle('on', +b.dataset.sand === newSand); b.setAttribute('aria-checked', +b.dataset.sand === newSand); });
document.querySelectorAll('[data-sand]').forEach(b => b.onclick = () => { newSand = +b.dataset.sand; showSand(); });
// どこから始めるか: はじまりの2本毛か、進化の節目の一滴（data/turns.json。祖先から決まりどおりに回して保存したもの）
let turns = [], newTurn = '';
// 並びは進化の時間の順（祖先から回した時間、同じなら代の数）
fetch('data/turns.json').then(r => r.ok ? r.json() : []).then(t => { turns = t.sort((a, b) => (a.hours - b.hours) || (a.gen - b.gen)); $('gatePeek').hidden = $('mPeek').hidden = !turns.length; }).catch(() => {});
// 「新しく始める」（2本毛から。大きさ・砂・数を選ぶ）と「途中からのぞく」（節目の一滴を選ぶ）は別の窓。同じ窓に両方を並べると役目が重なって見えた（2026-11-03 ユーザー）
function showStarts() {
  const box = $('starts');
  box.hidden = !newTurn;
  box.innerHTML = turns.map(t =>
    `<button type="button" role="radio" data-turn="${t.id}" class="${t.id === newTurn ? 'on' : ''}" aria-checked="${t.id === newTurn}">${L(t.title, t.title_en || t.title)}<small>${L(t.sub, t.sub_en || t.sub)}</small></button>`).join('');
  box.querySelectorAll('[data-turn]').forEach(b => b.onclick = () => { newTurn = b.dataset.turn; showStarts(); });
  $('newShape').hidden = !!newTurn;
  // タイトルの「途中からのぞく」から開いたときは、消える一滴があるときだけ「消えます」と書く
  const gone = !(fromTitle && $('gateCont').hidden);
  $('newNote').textContent = newTurn
    ? L(`${gone ? 'いまの一滴の生き物と記録は消えて、' : ''}はじまりの2本毛から同じ決まりで何時間も回して保存した一滴の、その時点から続きを見ます。`,
      `${gone ? 'The creatures and records in this drop will be erased. ' : ''}These drops were run for hours from the first two-flagella cell under the same rules, then saved. You watch on from that point.`)
    : L(`${gone ? 'いまの一滴の生き物と記録は消えて、' : ''}はじまりの2本毛（すべての真核生物の祖先）から始まります。大きさ・砂つぶ・はじめの数も選べます。`,
      `${gone ? 'The creatures and records in this drop will be erased. ' : ''}It starts again from the first two-flagella cell (the ancestor of all eukaryotes). You can also choose the size, the sand grains and how many to start with.`);
  $('newTitle').textContent = newTurn ? L('どこからのぞきますか？', 'Where do you want to look in?') : L('新しく始めますか？', 'Start a new drop?');
  $('mNewYes').textContent = newTurn ? L('のぞく', 'Look in') : L('新しく始める', 'Start new');
  $('mNewYes').className = fromTitle && $('gateCont').hidden ? 'primary' : 'danger';
}
function openNew(peek = false) { newSize = size; showSize(); newSand = sand; showSand(); newPop = pop; showPop(); newTurn = peek ? turns[0]?.id || '' : ''; showStarts(); $('menuMain').hidden = true; $('menuConfirm').hidden = false; $('mNewNo').focus(); }
$('mNew').onclick = () => { fromTitle = false; openNew(); };
$('mPeek').onclick = () => { fromTitle = false; openNew(true); };
$('mNewNo').onclick = () => { if (fromTitle) { fromTitle = false; $('menu').close(); return; } $('menuMain').hidden = false; $('menuConfirm').hidden = true; };
$('mNewYes').onclick = async () => {
  if (newTurn) {
    const t = turns.find(x => x.id === newTurn);
    let d;
    try { d = await (await fetch(`data/${newTurn}.json`)).json(); } catch { toast(L('その一滴を読みこめませんでした', 'Could not load that drop')); return; }
    sim.restoreWorld(d);
    ({ seed, size, sand } = d.opt);
    for (const [id, v] of [['food', d.opt.foodRate], ['light', d.opt.light], ['flow', d.opt.flow]]) { $(id).value = v; $(id).oninput({ target: $(id) }); }
    startWorld(L(`「${t.title}」をのぞいています`, `Looking into “${t.title_en || t.title}”`));
    return;
  }
  seed = (seed * 7919 + 13) % 100000;
  size = newSize; sand = newSand; pop = newPop;
  introNext = true;   // 画面側で回すときは、次の行の中ですぐ onWorld が呼ばれる
  sim.newWorld({ seed, size, sand, founders: pop === 150 ? undefined : pop, foodRate: +$('food').value, light: +$('light').value, flow: +$('flow').value });
  startWorld(L('新しく始めました', 'Started a new drop'));
};
// 新しい一滴が届いたとき（画面側で回すときはすぐ、Worker のときは少しあと）: 見え方を初めにもどす
function onWorld() {
  world = sim.world;
  if (q.has('test')) sim.set('profOn', true);   // 計算の部分ごとの時間も測る
  extinctShown = false;
  ren.ghosts = []; ren.prev.clear(); ren.eatPrev = null; ren.flashes = [];
  ren.cam.x = W / 2; ren.cam.y = H / 2; ren.cam.z = Math.max(ren.fitZoom(), Math.min(1.3, Math.min(ren.w, ren.h) / 500)); clampCam();
  select(null); lastEvent = 0; seen = null; book = new Map(); intro = null;
  if (introNext) { introNext = false; startIntro(); }
}
function startWorld(msg) {
  playingBeforeMenu = true; fromTitle = false;
  if (!$('gate').hidden) hideTitle();
  $('menu').close();
  toast(msg);
}
$('cardClose').onclick = () => select(null);

// ── 選んだ1匹の札 ──
const LABELS = {
  size: [L('大きさ', 'Size'), v => `${v.toFixed(0)} µm`],
  range: [L('感じる範囲', 'Sensing range'), v => `${v.toFixed(0)} µm`],
  food: [L('エサへ', 'Toward food'), v => v.toFixed(1)],
  kinesis: [L('エサの中でゆるめる', 'Slow down in food'), v => v.toFixed(2)],
  eatRest: [L('のみこむ間は休む', 'Rest while swallowing'), v => v.toFixed(2)],
  backup: [L('ぶつかると下がる', 'Back up on bumping'), v => v.toFixed(2)],
  attach: [L('砂つぶにくっつく', 'Stick to sand'), v => v.toFixed(2)],
  mouth: [L('食べる所の場所', 'Mouth position'), v => v < 0.35 ? L('前', 'front') : v < 1.1 ? L('ななめ前', 'front-side') : L('横', 'side')],
  small: [L('小さい相手へ', 'Toward smaller prey'), v => v.toFixed(1)],
  big: [L('大きい相手から', 'Away from bigger ones'), v => v.toFixed(1)],
  mix: [L('仲間と混ぜる', 'Mix genes'), v => v.toFixed(2)],
  stick: [L('子とくっつく', 'Stay with offspring'), v => v.toFixed(2)],
  keep: [L('藍藻を飼う', 'Keep algae'), v => v.toFixed(2)],
  colMax: [L('群体の大きさ', 'Colony size'), v => L(`${Math.round(2 ** v)} 細胞`, `${Math.round(2 ** v)} cells`)],
  fiss: [L('続けて分かれる回数', 'Divisions in a row'), v => L(`${Math.max(1, Math.round(v))} 回`, `${Math.max(1, Math.round(v))}×`)],
  plane: [L('一列にのびる', 'Grow in a line'), v => v.toFixed(2)],
  exDig: [L('体の外で消化', 'Digest outside'), v => v.toFixed(2)],
  share: [L('仲間と分けあう', 'Share food'), v => v.toFixed(2)],
  signal: [L('仲間の合図を聞く', 'Listen to signals'), v => v.toFixed(2)],
  inBeat: [L('内の細胞が打つ', 'Inner cells beat'), v => v.toFixed(2)],
  outDiv: [L('外の細胞が分かれる', 'Outer cells divide'), v => v.toFixed(2)],
};
let hintOnce = false;
function renderCard(full) {
  if (!sel) return;
  const o = sel, c = world.clades.get(o.clade);
  if (!c || !o.g) return;   // Worker のとき、系統の知らせがまだ届いていないことがある
  $('cSwatch').style.background = cladeColor(c);
  $('cName').textContent = nameOf(c);
  $('cMeta').textContent = L(`系統 ${c.id}・${o.gen + 1} 代目` + (o.anch || o.colAnch ? '・くっついて待つ' : '') + (o.sym ? `・藍藻 ${o.sym} を飼う` : '') + (o.colN > 1 ? `・${o.colN} 細胞の群体の${o.inner ? '内' : '外'}` : '') + (o.mateT > 0 ? '・接合中' : o.mixes ? `・混ぜた ${o.mixes} 回` : ''),
    `Lineage ${c.id} · generation ${o.gen + 1}` + (o.anch || o.colAnch ? ' · stuck, waiting' : '') + (o.sym ? ` · keeps ${o.sym} algae` : '') + (o.colN > 1 ? ` · ${o.inner ? 'inner' : 'outer'} cell of a ${o.colN}-cell colony` : '') + (o.mateT > 0 ? ' · mating' : o.mixes ? ` · mixed genes ${o.mixes}×` : ''));
  const pct = Math.round(Math.min(1, o.e / eSplit(o.g, o.b)) * 100);
  $('cStats').innerHTML = `<div><dt>${L('食べた', 'Ate')}</dt><dd>${o.ate}</dd></div><div><dt>${L('狩った', 'Hunted')}</dt><dd>${o.prey}</dd></div><div><dt>${L('子', 'Young')}</dt><dd>${o.kids}</dd></div><div><dt>${L('おなか', 'Full')}</dt><dd>${pct}%</dd></div>`;
  if (full) {
    const P = o.bp;
    drawBodyDiagram($('cBody'), o);
    $('cBodyLine').textContent = P.n
      ? L(`節 ${P.n}・1秒に ${(1 / o.b.T).toFixed(0)} 回打つ・速さ ${speedOf(o.g, o.b).toFixed(0)} µm/s・とどく ${(P.reach * o.g[GI.size]).toFixed(0)} µm`, `${P.n} segments · beats ${(1 / o.b.T).toFixed(0)}×/s · speed ${speedOf(o.g, o.b).toFixed(0)} µm/s · reach ${(P.reach * o.g[GI.size]).toFixed(0)} µm`)
      : L('節がない（泳げない）', 'No segments (cannot swim)');
    $('cGenes').innerHTML = Object.entries(LABELS).map(([k, [lab, f]]) => {
      const i = GI[k], [, lo, hi, init] = GENES[i];
      const v = o.g[i], w = (v - lo) / (hi - lo) * 100, s = (init - lo) / (hi - lo) * 100;
      return `<div class="gene"><span>${lab}</span><span class="bar"><i style="width:${w}%;background:${cladeColor(c, 0.9)}"></i><u style="left:${s}%" title="${L('はじまり', 'At the start')}"></u></span><em>${f(v)}</em></div>`;
    }).join('');
    $('cHint').textContent = L('点線は、ひと打ちの間に節の先が通る道。琥珀色の線は、はじまりの値。', 'The dotted line is the path of the segment tips in one beat. The amber line is the starting value.');
  }
}

// ── できごとの知らせ: 進化の節目の「はじめて」と、一滴のできごとだけ（系統が分かれた・絶えたは数秒ごとに出て意味が読めないので、グラフの中だけ。RELEASE.md 4章） ──
// 節目（js/book.js の PAGES）は画面の側で、いまいる生き物を見て決め、その形を図鑑に写す。読みこんだ一滴にもうあるものは、知らせずに「のぞいたときにもういた」として写す
let seen = null;   // 見た節目（一滴ごと。null は「次に見たものを知らせずに覚える」）
let book = new Map();   // 図鑑: かぎ → { t, gen, shape, pre }
let lastEvent = 0, tickerT = 0, tickerPage = null;
function tick(text, page) {
  $('ticker').textContent = text;
  $('ticker').classList.toggle('first', !!page); tickerPage = page;
  $('ticker').classList.remove('fade'); tickerT = page ? 10 : 6;
}
function showEvents() {
  const quiet = !seen;
  if (quiet) seen = new Set(book.keys());
  for (const [k, test, , text, , share = 0, text_en] of PAGES) {
    if (seen.has(k)) continue;
    const hit = world.orgs.filter(test);
    if (!hit.length || hit.length < (share ? Math.max(1, share * world.orgs.length) : 1)) continue;
    seen.add(k);
    // その節目がいちばんよくわかる形を写す: あてはまる中で、いちばん小さなかたまり（群体の節目なら、ちょうどその大きさ）
    const o = hit.reduce((a, b) => (b.colN || 1) < (a.colN || 1) ? b : a);
    book.set(k, { t: world.t, gen: o.gen + 1, shape: shapeOf(o), pre: quiet });
    if (!quiet) tick(L(`${fmtT(world.t)}　はじめて、${text}`, `${fmtT(world.t)}  First: ${text_en}`), k);
  }
  $('bookN').textContent = book.size + 1;
  const ev = world.events;
  for (let i = ev.length - 1; i >= lastEvent; i--) if (!ev[i].clade) { tick(`${fmtT(ev[i].t)}　${L(ev[i].text, ev[i].text_en || ev[i].text)}`, null); break; }
  lastEvent = ev.length;
  if (world.events.length > 400) { world.events.splice(0, 200); lastEvent = world.events.length; }
}
// 図鑑を開く: ページの一覧（まだのページは名前だけ）と、選んだページの形・時刻・本物では
$('ticker').onclick = () => { if (tickerPage) openBook(tickerPage); };
$('bookBtn').onclick = () => openBook();
let bookSel = '';
function openBook(k) {
  playingBeforeMenu = playing; setPlaying(false);
  bookSel = k ?? ([...book.keys()].pop() || '');
  $('book').showModal(); drawBook();
}
$('book').addEventListener('close', () => setPlaying(playingBeforeMenu));
function drawBook() {
  const all = [['', null, START.name], ...PAGES];
  $('bookGrid').innerHTML = all.map(([k, , name]) => {
    const has = !k || book.has(k);
    return `<button type="button" data-page="${k}" class="${k === bookSel ? 'on' : ''}"${has ? '' : ' disabled'} aria-pressed="${k === bookSel}">${has ? '<canvas></canvas>' : '<i>?</i>'}<span>${name}</span></button>`;
  }).join('');
  $('bookGrid').querySelectorAll('[data-page]').forEach(b => {
    const k = b.dataset.page, cv = b.querySelector('canvas');
    if (cv) drawShape(cv, k ? book.get(k).shape : startShape());
    b.onclick = () => { bookSel = k; drawBook(); };
  });
  const p = PAGES.find(x => x[0] === bookSel), e = book.get(bookSel);
  $('bookName').textContent = p ? p[2] : START.name;
  $('bookWhen').textContent = !p ? L('はじまり', 'The beginning') : e.pre ? L('のぞいたときに、もういた', 'Already there when you looked in') : L(`${fmtT(e.t)}・${e.gen} 代目`, `${fmtT(e.t)} · generation ${e.gen}`);
  $('bookNote').textContent = p ? p[4] : START.note;
  drawShape($('bookBig'), p ? e.shape : startShape());
  $('bookCount').textContent = `${book.size + 1} / ${PAGES.length + 1}`;
}
const saveBook = () => putSave('book', [...book]).catch(() => {});
let toastT = 0;
function toast(s) { $('toast').textContent = s; $('toast').hidden = false; toastT = 3; }

// ── まわす ──
let last = performance.now(), uiT = 0, simRate = 0, selGone = false;
const perf = { sim: 0, draw: 0, fps: 60 };   // 1こまの計算と描く時間（ms）。?test のときだけ右下に出す
function frame(now) {
  const fdt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // 最初のこまは、ブラウザの時刻が始めた時刻より前のことがある
  realTime += fdt;
  // タイトルを見せている間は、うしろの数匹だけを描く
  if (title) { drawTitle(fdt); requestAnimationFrame(frame); return; }
  // 計算: 画面側ならここで回す。Worker なら、届いている最新の写しを描き、次の分を頼む
  sim.tick(fdt);
  if (!world) { requestAnimationFrame(frame); return; }
  simRate = sim.simRate;
  // 1こまあたりの計算の時間（Worker のときは、別のコアで1こまの間に使った時間）
  const simMs = sim.usesWorker ? sim.stepMs * sim.simRate / DT / Math.max(1, perf.fps) : sim.lastMs || 0;
  perf.sim = perf.sim * 0.9 + simMs * 0.1;
  if (sel && sel.dead && !selGone) {
    // 死んだら、その場で追うのをやめる（ほかの1匹へ移すと、カメラが急に飛んだ。2026-11-03 ユーザー）。食べられたかどうかだけ知らせる（Worker のときは答えを待つ）
    const gone = sel; selGone = true;
    sim.eatenBy(gone, by => {
      selGone = false;
      if (sel !== gone) return;
      toast(by ? L('この1匹は食べられた', 'This one was eaten') : L('この1匹はエネルギーが尽きた', 'This one ran out of energy'));
      select(null);
    });
  }
  if (intro) stepIntro(fdt);
  if (sel && follow) {
    // 札とグラフにかくれない所（空いている所のまん中）に追う1匹を置く
    const fx = (focus.x - ren.w / 2) / ren.cam.z, fy = (focus.y - ren.h / 2) / ren.cam.z;
    ren.cam.x += (sel.x - fx - ren.cam.x) * 0.12; ren.cam.y += (sel.y - fy - ren.cam.y) * 0.12; clampCam();
  }
  const d0 = performance.now();
  ren.draw(world, sel, realTime);
  perf.draw = perf.draw * 0.9 + (performance.now() - d0) * 0.1;
  perf.fps = perf.fps * 0.9 + (1 / Math.max(fdt, 1e-3)) * 0.1;
  if (perfLog) logPerf(fdt);
  uiT -= fdt;
  if (uiT <= 0) {
    uiT = 0.25;
    $('sTime').textContent = fmtT(world.t);
    // 進化の時計は代（本物の実験も「何百代で群体になった」と代で数える。RELEASE.md 4章の7）
    $('sGen').textContent = world.orgs.length ? Math.round(world.orgs.reduce((a, o) => a + o.gen, 0) / world.orgs.length) + 1 : '–';
    checkExtinct();
    $('sTampered').hidden = !world.tampered;
    // 選んだ速さが出ないときは、ボタンに出せている速さを書く（RELEASE.md 4章の10）
    const slow = playing && simRate < speed * 0.8;
    $('speedBtn').textContent = `×${slow ? Math.max(1, Math.round(simRate)) : speed}`;
    $('speedBtn').classList.toggle('slow', slow);
    $('speedBtn').title = slow ? L(`×${speed} を選んでいますが、計算が追いつかず いまは ×${Math.max(1, Math.round(simRate))} です`, `×${speed} is selected, but the computer can only keep up at ×${Math.max(1, Math.round(simRate))} now`) : L('はやさ', 'Speed');
    $('sPop').textContent = world.orgs.length;
    if (perfLog) $('perfText').textContent = `計算${sim.usesWorker ? '（別のコア）' : ''} ${perf.sim.toFixed(1)} ms ・ 1刻み ${sim.stepMs.toFixed(1)} ms ・ 描く ${perf.draw.toFixed(1)} ms ・ ${Math.round(perf.fps)} こま/秒 ・ ${world.orgs.length} 匹`;
    $('sClades').textContent = world.liveClades().length;
    $('sPred').textContent = world.orgs.filter(o => o.prey > 0).length;
    graph.draw(world, selClade);
    renderCard(false);
    showEvents();
    updateScale();
    updateFocus();
  }
  if (tickerT > 0 && (tickerT -= fdt) <= 0) $('ticker').classList.add('fade');
  if (toastT > 0 && (toastT -= fdt) <= 0) $('toast').hidden = true;
  requestAnimationFrame(frame);
}

// ── 確かめ用の計測ログ（?test のとき）: 開いたページごとに番号をつけ、10 秒ごとに計算量を記録して、「ログを保存」で CSV に ──
const perfLog = q.has('test') ? { id: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), rows: [], acc: 0, real: 0 } : null;
const SIM_PARTS = ['env', 'orgs', 'collide', 'colonies', 'predation', 'divide'], DRAW_PARTS = ['water', 'wake', 'glow', 'light', 'gel', 'crisp', 'crisp_build', 'crisp_gpu', 'crisp_copy', 'sel', 'motes'];
const PERF_HEAD = 'real_s,sim_s,speed,sim_rate,sim_ms,draw_ms,fps,orgs,visible,algae,colony_cells,zoom,view_w,view_h,dpr,' + SIM_PARTS.map(k => 's_' + k).join(',') + ',' + DRAW_PARTS.map(k => 'd_' + k).join(',');
function logPerf(fdt) {
  perfLog.real += fdt; perfLog.acc += fdt;
  if (perfLog.acc < 10) return;
  perfLog.acc = 0;
  const c = ren.cam, hw = ren.w / 2 / c.z, hh = ren.h / 2 / c.z;
  const vis = world.orgs.filter(o => Math.abs(o.x - c.x) < hw + 20 && Math.abs(o.y - c.y) < hh + 20).length;
  perfLog.rows.push([perfLog.real.toFixed(0), world.t.toFixed(0), playing ? speed : 0, simRate.toFixed(2), perf.sim.toFixed(2), perf.draw.toFixed(2), perf.fps.toFixed(1),
    world.orgs.length, vis, world.fn, world.orgs.filter(o => o.colN > 1).length, c.z.toFixed(3), ren.w, ren.h, ren.dpr ?? devicePixelRatio,
    ...SIM_PARTS.map(k => (world.prof?.[k] ?? 0).toFixed(3)), ...DRAW_PARTS.map(k => (ren.prof?.[k] ?? 0).toFixed(3))].join(','));
  if (perfLog.rows.length > 4000) perfLog.rows.shift();
  try { localStorage.setItem('drop-perf-' + perfLog.id, perfCSV()); } catch {}
}
function perfCSV() {
  const env = `# drop-perf ${perfLog.id} / ${navigator.userAgent} / cores ${navigator.hardwareConcurrency || '?'} / screen ${screen.width}x${screen.height} / seed ${seed} / 描き方 ${ren.glCrisp ? 'WebGL' : '2D'} / 計算 ${sim.usesWorker ? 'Worker' : '画面側'}`;
  return [env, PERF_HEAD, ...perfLog.rows].join('\n') + '\n';
}
if (perfLog) $('perfSave').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([perfCSV()], { type: 'text/csv' }));
  a.download = `drop-perf-${perfLog.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const focus = { x: 0, y: 0 };
function updateFocus() {
  let l = 0, r = ren.w, t = 0, b = ren.h;
  const card = $('card'), env = $('env');
  if (!card.hidden) { const c = card.getBoundingClientRect(); if (c.width > ren.w * 0.6) t = Math.max(t, c.bottom); else r = Math.min(r, c.left); }
  if (env.offsetParent && innerWidth > 760) l = Math.max(l, env.getBoundingClientRect().right);
  b = Math.min(b, $('bottom').getBoundingClientRect().top + 30);
  focus.x = (l + r) / 2; focus.y = (t + b) / 2;
}
updateFocus();

function updateScale() {
  const opts = [10, 20, 50, 100, 200, 500];
  const um = opts.find(v => v * ren.cam.z >= 60) || 500;
  $('scale').querySelector('i').style.width = `${um * ren.cam.z}px`;
  $('scale').querySelector('span').textContent = `${um} µm`;
}

sim.newWorld({ seed, size, sand, founders: pop === 150 ? undefined : pop, foodRate: +$('food').value, light: +$('light').value, flow: +$('flow').value });
requestAnimationFrame(frame);
setTimeout(() => { if (!hintOnce) toast(L('生き物を押すと、追いかけて遺伝子を見られます', 'Tap a creature to follow it and see its genes')); }, 2500);

// ── タイトル: 開くたびに出す（?nogate・?test では出さない）。「つづきから」「はじめから」・注意書き・「もどる」。どちらかを選ぶまで一滴は止めておく ──
let title = null;   // タイトルのうしろで泳ぐ数匹（本番とは別の小さな一滴）
let titleRen = null;   // タイトルの描き手は 1 つだけ作って使いまわす（WebGL の数をふやさない）
let fromTitle = false;   // 「はじめから」の選び方をタイトルから開いたか（やめるでタイトルにもどる）
function showTitle() {
  $('gate').hidden = false; title = makeTitle(); setPlaying(false);
  // 保存した一滴があれば「つづきから」を大きく
  $('gateCont').hidden = true; $('gateNew').className = 'gatePrimary'; $('gateNew').focus();
  refreshCont();
}
function refreshCont() {
  getSave('meta').then(m => {
    if (!m || $('gate').hidden) return;
    $('gateContSub').textContent = L(`${fmtT(m.t)}・${m.n} 匹`, `${fmtT(m.t)} · ${m.n} creatures`);
    $('gateCont').hidden = false; $('gateNew').className = 'gateGhost'; $('gateCont').focus();
  }).catch(() => {});
}
function hideTitle() { $('gate').hidden = true; title = null; }
$('gateCont').onclick = async () => {
  $('gateCont').disabled = true;
  const ok = await sim.load().catch(() => false);
  $('gateCont').disabled = false;
  if (!ok) { toast(L('前の一滴を読みこめませんでした', 'Could not load the last drop')); return; }
  book = new Map(await getSave('book').catch(() => null) || []);
  hideTitle(); setPlaying(true); toast(L('つづきから', 'Continuing'));
};
// はじめから: 消える一滴がない（つづきからがない）ときは、たずねずにすぐ始める。タイトルの間は一滴は止まっているので、うしろの一滴がそのまま「はじまり」（RELEASE.md 4章）
$('gateNew').onclick = () => {
  if ($('gateCont').hidden) { hideTitle(); setPlaying(true); startIntro(); return; }
  fromTitle = true; openMenu(); openNew();
};
// 途中からのぞく: 節目の一滴を選ぶ窓（「新しく始める」と同じ窓で、はじめから節目の一滴を選んでおく。RELEASE.md 4章の8）
$('gatePeek').onclick = () => { fromTitle = true; openMenu(); openNew(true); };
// もどる: ブラウザの前のページへ（前のページがなければ保管庫へ）
$('gateBack').onclick = () => { if (history.length > 1 && document.referrer) history.back(); else location.href = '../archive.html'; };
if (q.has('nogate') || q.has('test')) $('gate').hidden = true;
else showTitle();
// メニューの「タイトルにもどる」: いまの一滴を保存して止め、タイトルを出す
$('mTitle').onclick = () => { $('menu').close(); showTitle(); if (world) { saveBook(); Promise.resolve(sim.save()).then(refreshCont); } };
// 30 秒ごとと、タブを閉じる・ほかのタブに移るときに、いまの一滴を保存する（このブラウザの中だけ）
setInterval(() => { if (!title && world && playing) { sim.save(); saveBook(); } }, 30000);
addEventListener('visibilitychange', () => { if (document.hidden && !title && world) { sim.save(); saveBook(); } });
addEventListener('pagehide', () => { if (!title && world) { sim.save(); saveBook(); } });


// タイトル: はじまりの2本毛を 5 匹だけ、まん中に置く。砂なし。カメラは 5 匹のまん中をゆっくり追う（群れや群体は出さない。2026-11-01 ユーザー「数匹をクローズアップしてゆったり泳いでいる様子を（グロくない範囲で）」）
function makeTitle() {
  const r = titleRen || (titleRen = new Renderer($('gateView'))); r.style = 'abyss'; r.ghosts = []; r.prev.clear();
  const w = new World({ seed: 11, size, sand: 0, founders: 0, initFood: 260 });
  const g0 = founderGenome(), b0 = founderBody();
  for (let i = 0; i < 5; i++) w.addOrg(w.mutate(g0, 0.5), 1, W / 2 + (w.r() - 0.5) * 70, H / 2 + (w.r() - 0.5) * 50, eSplit(g0, b0) * 0.6, 0, b0);
  r.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  r.cam.x = W / 2; r.cam.y = H / 2; r.cam.z = Math.min(innerWidth, innerHeight) / 160;   // 少し寄せる。あくまで背景（主役は題名とボタン）
  return { r, w, acc: 0 };
}
function drawTitle(fdt) {
  const T = title; T.acc += fdt;
  while (T.acc >= DT) { T.w.step(); T.acc -= DT; }
  const os = T.w.orgs; if (!os.length) return;
  // 1 匹を選んでゆっくり追う
  if (!T.lead || T.lead.dead) T.lead = os[0];
  T.r.cam.x += (T.lead.x - T.r.cam.x) * 0.02; T.r.cam.y += (T.lead.y - T.r.cam.y) * 0.02;
  T.r.draw(T.w, null, realTime);
}
addEventListener('resize', () => { if (title) title.r.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1)); });

// 確かめ用（tools から）
window.__sim = sim;
window.__drop = { get world() { return world; }, get sel() { return sel; }, get book() { return book; }, ren, select, setSpeed, setPlaying, openBook };
