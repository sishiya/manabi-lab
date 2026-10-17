// 打鍵の音（ブラウザの中で合成する。外の音の素材は読まない）。本物の打鍵音の作りを、音の部品に分けてまねたもの（数はどれも目安）:
//  ① 指がキーに触れる音 → 約 10ms 後に ② キーが板に当たる音と板・ケースの響き（低い所だけ通した雑音）。③ 長いキーは支え（スタビライザー）の音。
//  ④ 離す音は小さく。形は打鍵音の測定（Asonov & Agrawal 2004）による。周波数・長さ・大きさは目安
// キーボードの種類で変える: ノートパソコン（うすい）は響きが高く短く小さい。毎回、大きさと高さを少しゆらす（同じ音のくり返しは機械っぽく聞こえる）。
// キーの左右の位置で、音を左右に少し振り分ける
'use strict';
let AC = null, NOISE = null, OUT = null;
const SND = { vol: 2.8 }; // 2026-10-17 もうひとまわりやわらかく（ユーザー）: 3.2 → 2.8、高い音を 5kHz で丸め、触れる音を低く小さく、出だしを 2.5ms に // 全体の大きさ（続けて打ったときのいちばん大きい所が 0.56 くらい（割れ止めの手前）。2026-10-17 に OfflineAudioContext で測って決めた。前の 11 では 1.18 になって割れ、「ブツブツ」の原因になった）
function sndInit() {
  if (AC) return true;
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
  AC = new C();
  NOISE = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
  const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // 出口: ごく低い音（耳には「ブツッ」と聞こえる）を切る。圧縮（コンプレッサー）は音量がこまかく上下して雑音のもとになったのでやめた（2026-10-17）
  OUT = AC.createBiquadFilter(); OUT.type = 'highpass'; OUT.frequency.value = 120; OUT.Q.value = 0.7;
  const soft = AC.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5000; soft.Q.value = 0.5; // 高い音を丸める（耳にきつい「チッ」を弱く）
  // 割れ止め: 1 に近づいたときだけ強く抑える（ふだんの大きさでは働かない）
  const lim = AC.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.05;
  OUT.connect(soft); soft.connect(lim); lim.connect(AC.destination);
  return true;
}
// 雑音の一部を、帯域のフィルターに通して鳴らす
function sndNoise(t, dur, freq, q, gain, decay, pan, type) {
  const src = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = NOISE; bp.type = type || 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  // 出だしは 1.5ms で上げ、終わりは 0 まで下げてから止める（急に始まる・切れる所が「ブツッ」と鳴らないように）
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.0025); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.0025 + decay); g.gain.linearRampToValueAtTime(0, t + 0.0045 + decay);
  src.connect(bp); bp.connect(g); g.connect(pan);
  src.start(t, Math.random() * 0.4, Math.max(dur, decay + 0.01));
}
// 短く消える音程の音（響き）
function sndTone(t, f0, f1, gain, decay, pan, type) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g); g.connect(pan); o.start(t); o.stop(t + decay + 0.02);
}
// speed: 再生の速さ（触れてから底に当たるまでの時間を、再生の速さに合わせる）
function keySound(m, up, speed) {
  if (!$('chkSound').checked || !sndInit()) return;
  if (AC.state === 'suspended') AC.resume();
  const k = KEYS[m]; if (!k) return;
  // 鳴らす時刻は 25ms 先（5ms では画面の処理が少し遅れると、出だしが途中から急に始まって「ブツッ」と鳴った）。毎回のゆらぎ ±6%
  const t = AC.currentTime + 0.025, r = () => 1 + (Math.random() - 0.5) * 0.12;
  const thin = KB.DEPTH < 2, big = k.w >= 1.75 || k.d > 1;
  const pan = AC.createStereoPanner ? AC.createStereoPanner() : AC.createGain();
  if (pan.pan) pan.pan.value = Math.max(-0.6, Math.min(0.6, keyX(m) / 250));
  const vol = AC.createGain(); vol.gain.value = SND.vol * (thin ? 0.55 : 1); pan.connect(vol); vol.connect(OUT);
  // 本物の打鍵音の形（Asonov & Agrawal 2004 の測定）: 押す音は約 10ms のあいだに「指がキーに触れる音（はっきり）」と「キーが板に当たる音」の
  // 2つの山に分かれ、あいだは静か。離す音は押す音よりかなり小さい。どちらでも板が震える（ここでは低い所だけ通した雑音で、響きにした）
  const plate = (at, g, len) => { // 板とケースの響き: 大きいキーほど低く長い（目安）
    const fb = (thin ? 1400 : big ? 450 : 750 + 60 * (2 - k.row)) * r();
    sndNoise(at, 0.06, fb, 0.8, g * r(), len, pan); // 帯域を通す（ローパスはごく低い音まで通して「ブツッ」と鳴った）
  };
  if (up) { // ④ 離す音: キーが上に戻って当たる（小さく）
    sndNoise(t, 0.02, (thin ? 3800 : 3000) * r(), 1.5, 0.09 * r(), 0.004, pan);
    plate(t, 0.08, 0.010);
    return;
  }
  // ① 指がキーに触れる音（いちばんはっきり、2〜3ms）
  sndNoise(t, 0.02, (thin ? 2800 : 2200) * r(), 0.8, 0.22 * r(), 0.003, pan);
  // ② キーが底（板）に当たる音: 触れてから TK（hand.js、約 10ms）おくれて。短い「カッ」と板の響き
  const th = t + TK / (speed || 1);
  sndNoise(th, 0.02, (thin ? 2000 : 1600) * r(), 1.0, 0.18 * r(), 0.003, pan);
  plate(th, thin ? 0.12 : big ? 0.5 : 0.32, thin ? 0.012 : big ? 0.035 : 0.022);
  // ③ 長いキーの支え（スタビライザー）が少しおくれて当たる
  if (big && !thin) sndNoise(th + 0.005 * r(), 0.02, 1800 * r(), 1.5, 0.10, 0.006, pan);
}
