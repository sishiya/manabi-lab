// 帆船が風で進むしくみ — 操作・つぎへ・表示（速さ・凡例）
'use strict';
const $ = id => document.getElementById(id);
const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);

// つぎへ: 1歩に新しいもの1つ（その歩で増えた矢印は太く）
const TOUR = [
  { text: '真後ろからの風（白い点線）。帆は押されて（抗力・赤）進み、青い水面の波が後ろへ流れて航跡がのびます。速くなるほど船の上で感じる風（見かけの風・水色）が弱まり、風の半分ほどで落ちつきます。',
    set: { h: 180, twsKn: 6, mode: 'orc', v: 0 }, layers: ['aw', 'drag'], add: 'aw' },
  { text: '真横からの風。帆は翼になり、見かけの風と直角の力（揚力・黄）が出ます。真後ろの約2倍の速さで、風よりも少し速くなります。',
    set: { h: 90, twsKn: 6, mode: 'orc', v: 0 }, layers: ['aw', 'drag', 'lift'], add: 'lift' },
  { text: '帆の力は船を横にも引きます。水の中のキール（船底の板）がもう1枚の翼になって、横の力を受け止めます（緑）。',
    set: { h: 90, twsKn: 6, mode: 'orc' }, layers: ['aw', 'drag', 'lift', 'keel'], add: 'keel' },
  { text: '帆を「押されるだけ」にすると（比べるための仮想の帆）、揚力がないので、真横の風ではほとんど進みません。',
    set: { h: 90, twsKn: 6, mode: 'push', v: 0 }, layers: ['aw', 'drag', 'lift', 'keel'] },
  { text: '風上へ。風に対して約 30° より内側では帆が働きません。左右にジグザグ（タック）して風上へ進みます。',
    set: { h: 318, twsKn: 6, mode: 'orc', v: 2.5 }, layers: ['aw', 'drag', 'lift', 'keel'], auto: { a: 42, every: 28 } },
  { text: 'すべての向きの速さ（右上・水色の線）。点線は、風上・風下へいちばん早く着く向きです。風上へは約 45° のジグザグ。風下へは、この帆（主帆とジブ）ではほぼ真後ろです。',
    set: { h: 135, twsKn: 6, mode: 'orc' }, layers: ['aw', 'drag', 'lift', 'keel'], polar: true },
  { text: '風を強く（秒速 8 m）。風は 6→16 ノットと約 2.7 倍でも、真横の速さは 7.0→10.6 ノットと 1.5 倍だけ。重い船体は、速くなるほど自分で作る波の抵抗が急に大きくなるためです（帆のせいではありません）。',
    set: { h: 90, twsKn: 16, mode: 'orc' }, layers: ['aw', 'drag', 'lift', 'keel'], polar: true },
];

const UI = {
  step: -1,
  init() {
    $('next').onclick = () => this.go((this.step + 1) % TOUR.length);
    const hold = (el, d) => {
      const on = e => { e.preventDefault(); Sim.S.auto = null; Sim.S.turn = d; el.classList.add('on'); };
      const off = () => { if (Sim.S.turn === d) Sim.S.turn = 0; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
    };
    hold($('left'), -1); hold($('right'), 1);
    window.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { Sim.S.auto = null; Sim.S.turn = -1; } if (e.key === 'ArrowRight') { Sim.S.auto = null; Sim.S.turn = 1; } });
    window.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') Sim.S.turn = 0; });
    window.addEventListener('blur', () => { Sim.S.turn = 0; });
    $('wind').oninput = e => { Sim.S.twsKn = +e.target.value; this.sync(); };
    $('modeBtn').onclick = () => { Sim.S.mode = Sim.S.mode === 'orc' ? 'push' : 'orc'; this.sync(); };
    for (const b of document.querySelectorAll('[data-mul]')) b.onclick = () => { Sim.S.mul = +b.dataset.mul; this.sync(); };
    $('pause').onclick = () => { Sim.S.paused = !Sim.S.paused; this.sync(); };
    $('polarBtn').onclick = () => { Draw.polar = !Draw.polar; this.sync(); };
    $('dirs').onclick = e => { const b = e.target.closest('button'); if (!b) return; Sim.S.auto = null; Sim.setHeading(+b.dataset.h); };
    this.go(0);
  },
  go(i) {
    const st = TOUR[i]; this.step = i;
    Sim.S.auto = st.auto ? { ...st.auto, side: -1, tLeft: st.auto.every } : null;
    Sim.S.turn = 0;
    if (st.set.h != null) Sim.setHeading(st.set.h);
    for (const k of ['twsKn', 'mode', 'v']) if (st.set[k] != null) Sim.S[k] = st.set[k];
    Draw.layers = {}; for (const l of st.layers) Draw.layers[l] = true;
    this.added = Draw.added = st.add || null;
    Draw.polar = !!st.polar;
    $('tourNum').textContent = (i + 1) + ' / ' + TOUR.length;
    $('tourText').textContent = st.text;
    $('next').textContent = i === TOUR.length - 1 ? '最初から' : 'つぎへ';
    this.sync();
  },
  sync() {
    const S = Sim.S;
    $('wind').value = S.twsKn;
    $('windVal').textContent = S.twsKn + ' ノット（秒速 ' + fmt(S.twsKn * KN) + ' m）';
    $('modeBtn').textContent = S.mode === 'orc' ? '翼の帆（ふつうの帆）' : '押されるだけの帆（仮想）';
    $('modeBtn').classList.toggle('on', S.mode === 'push');
    for (const b of document.querySelectorAll('[data-mul]')) b.classList.toggle('on', +b.dataset.mul === S.mul);
    $('pause').textContent = S.paused ? '動かす' : '止める';
    $('polarBtn').classList.toggle('on', Draw.polar);
    // 画面の背景（水・風・航跡）だけ。力の矢印は図の中で矢印の先に名前を書く（draw.js）
    $('legend').innerHTML = '<div class="scene"><span><i class="rip"></i>水面（止まっている）</span><span><i class="wnd"></i>風（空気）</span><span><i class="wak"></i>航跡</span><span class="mark">※ 力の矢印の長さは目安</span></div>';
  },
  // 毎コマ: 速さの表示
  hud() {
    const S = Sim.S, f = S.f || {}, vKn = S.v / KN, twa = Math.abs(Sim.twa());
    $('vBoat').textContent = fmt(vKn) + ' kt';
    $('vBoatMs').textContent = '秒速 ' + fmt(S.v) + ' m';
    $('vWind').textContent = S.twsKn + ' kt';
    $('ratio').textContent = '風の ' + fmt(vKn / S.twsKn, 2) + ' 倍';
    $('angle').textContent = '風に対して ' + Math.round(twa) + '°';
    $('aws').textContent = f.aws != null ? '見かけの風 ' + fmt(f.aws / KN) + ' kt・' + Math.round(Math.abs(f.awa)) + '°' : '';
    $('heel').textContent = f.heel != null ? '傾き ' + Math.round(f.heel) + '°' : '';
    // 横の力がつりあわない表の点（ok = 0）でも、真後ろ近くは帆が横へ押す力がほぼないので出さない。
    // 帆の横の力（揚力と抗力の横向き）が、横流れ 6° のキールの力を 1 割以上こえるときだけ
    const ar = (f.awa || 0) * Math.PI / 180, side = Math.abs(f.lift * Math.cos(ar) + f.drag * Math.sin(ar));
    $('drift').hidden = !(f.ok < 0.5 && f.fnet > 0 && side > 1.1 * f.keel + 50);
    $('nogo').hidden = !(twa < 30 && vKn < 1.5);
  },
};
