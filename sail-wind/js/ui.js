// 帆船が風で進むしくみ — 操作・つぎへ・表示（速さ・凡例）
'use strict';
const $ = id => document.getElementById(id);
const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);

// つぎへ: 1歩に新しいもの1つ（その歩で増えた矢印は太く）。ふだんの矢印は「船で感じる風」「帆が前へ引く力」「水の抵抗」の3本だけ。
// 揚力・抗力・キールは、くわしい歩（4・5）と「力をくわしく」のときだけ
const BASIC = ['aw', 'drive', 'resist'];
const TOUR = [
  { text: '真後ろからの風。帆は風に押されて進みます。速くなるほど船で感じる風（水色）が弱まり、前へ引く力（黄）が小さくなって、水の抵抗（赤）と同じになったところで止まります。風の半分ほどの速さです。',
    set: { h: 180, twsKn: 6, mode: 'orc', v: 0 }, layers: BASIC, add: 'drive' },
  { text: '真横からの風。船が速くなっても、船で感じる風は弱まらずに前へ回って強くなります。だから帆は前へ引き続け、風より速く走ります（上の2本の棒をくらべてみて）。',
    set: { h: 90, twsKn: 6, mode: 'orc', v: 0 }, layers: BASIC, add: 'aw' },
  { text: 'もし帆が風に押されるだけ（くらべるための仮想の帆）なら、真横の風では前へ引く力が出ず、ほとんど進みません。',
    set: { h: 90, twsKn: 6, mode: 'push', v: 0 }, layers: BASIC },
  { text: 'ふつうの帆が前へ引けるのは、翼だから。帆の力を2つに分けると、船で感じる風に直角な「翼の力（揚力）」が前を向いています。押す力（抗力）は後ろ寄りです。',
    set: { h: 90, twsKn: 6, mode: 'orc' }, layers: ['aw', 'lift', 'drag'], add: 'lift' },
  { text: '翼の力は船を横にも引きます。水の中のキール（船底のひれ）が押し返すので、船は横へ流されずに前へ進みます。',
    set: { h: 90, twsKn: 6, mode: 'orc' }, layers: ['lift', 'keel'], add: 'keel' },
  { text: '風上へ。風に対して約 30° より内側では帆が働かないので、左右にジグザグ（タック）して進みます。',
    set: { h: 318, twsKn: 6, mode: 'orc', v: 2.5 }, layers: BASIC, auto: { a: 42, every: 28 } },
  { text: 'すべての向きの速さ（水色の線）。点線は、風上・風下へいちばん早く着く向きです。風上へは約 45° のジグザグ。風下へは、この帆（主帆とジブ）ではほぼ真後ろです。',
    set: { h: 135, twsKn: 6, mode: 'orc' }, layers: BASIC, polar: true },
  { text: '風を強く（秒速 8 m）。風は 6→16 ノットと約 2.7 倍でも、真横の速さは 7.0→10.6 ノットと 1.5 倍だけ。重い船体は、速くなるほど自分で作る波の抵抗が急に大きくなるためです（帆のせいではありません）。',
    set: { h: 90, twsKn: 16, mode: 'orc' }, layers: BASIC, polar: true },
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
    $('detailBtn').onclick = () => { Draw.detail = !Draw.detail; this.sync(); };
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
    Draw.polar = !!st.polar; Draw.detail = false; Draw.cam = null;   // カメラはすぐ新しい向きへ
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
    $('detailBtn').classList.toggle('on', Draw.detail);
    // 画面の背景（水・風・航跡）だけ。力の矢印は図の中で矢印の先に名前を書く（draw.js）
    $('legend').innerHTML = '<div class="scene"><span><i class="rip"></i>水面（止まっている）</span><span><i class="wnd"></i>風（空気）</span><span><i class="wak"></i>航跡</span><span class="mark">※ 力の矢印の長さは目安</span></div>';
  },
  // 毎コマ: 速さの表示
  hud() {
    const S = Sim.S, f = S.f || {}, vKn = S.v / KN, twa = Math.abs(Sim.twa());
    // 風と船の速さの棒（同じものさし）。船の棒が風の棒をこえたら「風より速い」
    const top = Math.max(S.twsKn, vKn, 1) * 1.1;
    $('barW').style.width = (S.twsKn / top * 100) + '%'; $('barB').style.width = (vKn / top * 100) + '%';
    $('vBoat').textContent = fmt(vKn) + ' kt';
    $('vWind').textContent = S.twsKn + ' kt';
    const r = vKn / S.twsKn;
    $('ratio').textContent = '船は風の ' + fmt(r, 2) + ' 倍' + (r > 1.005 ? '（風より速い）' : '');
    $('ratio').classList.toggle('fast', r > 1.005);
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
