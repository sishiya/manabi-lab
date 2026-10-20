// 心地よい音・いやな音 — つまみ・計算した値の表示・タブとつぎへのツアー
'use strict';
const UI = (() => {
  // つまみ: key・名前・範囲・表示・ひとこと（chk: チェック、opts: 選ぶボタン）
  const NOTE_NAMES = [[0, '同じ高さ'], [100, '半音'], [200, '全音'], [300, '短3度'], [400, '長3度'], [500, '4度'], [600, '増4度'], [700, '5度'], [800, '短6度'], [900, '長6度'], [1000, '短7度'], [1100, '長7度'], [1200, 'オクターブ']];
  const near = (c) => { const n = NOTE_NAMES.reduce((a, b) => Math.abs(b[0] - c) < Math.abs(a[0] - c) ? b : a); return Math.abs(n[0] - c) <= 15 ? n[1] : ''; };
  const pct = v => Math.round(v * 100) + '%';
  const KNOBS = [
    { k: 'f0', lab: '高さ', min: 80, max: 2000, log: true, fmt: v => Math.round(v) + ' Hz', note: '1秒にふるえる回数（いちばん低い成分）' },
    { k: 'bright', lab: '明るさ（倍音）', min: 0, max: 1, step: 0.01, fmt: pct, note: '2倍・3倍…の高さの成分（倍音）をどれだけ強くするか' },
    { k: 'level', lab: '想定の大きさ', min: 40, max: 75, step: 1, fmt: v => Math.round(v) + ' dB', note: '計算で使う音の大きさ（ふつうの会話が約 60 dB）。音もいっしょに大きくなる' },
    { k: 'two', lab: '2つ目の音', chk: '重ねる', note: '同じ音色の音をもう1つ重ねる' },
    { k: 'cents', lab: '音程', min: 0, max: 1200, step: 1, fmt: v => Math.round(v) + '¢ ' + near(v), note: '2つ目の音の高さのちがい（100 セント＝半音、1200＝1オクターブ）' },
    { k: 'squeal', lab: 'キーキーの帯', min: 0, max: 1, step: 0.01, fmt: pct, note: '2,500〜5,500 Hz の成分を、1秒に数回ゆっくり揺らしながら足す（黒板の音の性質をまねたもの）' },
    { k: 'amRate', lab: 'ゆらしの速さ', min: 0, max: 200, step: 1, fmt: v => Math.round(v) + ' 回/秒', note: '音の大きさを1秒に何回ゆらすか。30〜150 回で「ザラザラ」' },
    { k: 'amDepth', lab: 'ゆらしの深さ', min: 0, max: 1, step: 0.01, fmt: pct, note: '' },
    { k: 'bpm', lab: '拍の速さ', min: 0, max: 180, step: 1, snap: v => v < 30 ? 0 : v, fmt: v => v ? Math.round(v) + ' 拍/分' : 'なし', note: '音を1分に何回鳴らしなおすか（左はしで「なし」＝鳴りっぱなし）' },
    { k: 'nature', lab: '自然の音', opts: [['none', 'なし'], ['rain', '雨'], ['wave', '波'], ['wind', '風'], ['pink', 'ピンク'], ['white', 'ザー']], note: 'ノイズをフィルタで形づけた合成（録音ではない）。ピンク・ザー（ホワイト）はくらべる用' },
    { k: 'noise', lab: '自然の音の量', min: 0, max: 1, step: 0.01, fmt: pct, note: '' },
    { k: 'tone', lab: '音程のある音の量', min: 0, max: 1, step: 0.01, fmt: pct, note: '0 にすると自然の音だけ' },
    { k: 'wobble', lab: 'ゆらぎ', min: 0, max: 1, step: 0.01, fmt: pct, note: '高さと大きさを、ゆっくり不規則に揺らす（いくつかの速さの揺れを足した 1/f に近い形）。「1/f ゆらぎで落ち着く」という説は根拠がまちまちなので、推定の点は動かしません' },
    { k: 'stretch', lab: '倍音のずれ', min: 0, max: 1, step: 0.01, fmt: pct, note: '倍音を整数倍からずらす（鐘や金属の板のような音）' },
  ];
  const rows = {};

  function build(P, cb) {
    const box = document.getElementById('controls');
    for (const d of KNOBS) {
      const row = document.createElement('div'); row.className = 'row'; row.dataset.k = d.k;
      const note = d.note ? `<span class="note">${d.note}</span>` : '';
      if (d.chk) {
        row.innerHTML = `<span class="lab">${d.lab}</span><label class="chk"><input type="checkbox"> ${d.chk}</label><span class="out"></span>${note}`;
        const inp = row.querySelector('input');
        inp.addEventListener('change', () => { P[d.k] = inp.checked; cb(d.k); });
        rows[d.k] = { row, inp, d };
      } else if (d.opts) {
        row.innerHTML = `<span class="lab">${d.lab}</span><span class="opts">${d.opts.map(([v, s]) => `<button type="button" data-v="${v}">${s}</button>`).join('')}</span>${note}`;
        row.querySelectorAll('.opts button').forEach(b => b.addEventListener('click', () => {
          P[d.k] = b.dataset.v;
          if (P[d.k] !== 'none' && P.noise < 0.05) P.noise = 0.6;   // 選んだのに聞こえない、をふせぐ
          sync(P); cb(d.k);
        }));
        rows[d.k] = { row, d };
      } else {
        row.innerHTML = `<span class="lab">${d.lab}</span><input type="range" min="0" max="1000" step="1" aria-label="${d.lab}"><span class="out"></span>${note}`;
        const inp = row.querySelector('input');
        inp.addEventListener('input', () => { P[d.k] = fromPos(d, +inp.value); rows[d.k].out.textContent = d.fmt(P[d.k]); cb(d.k); });
        rows[d.k] = { row, inp, d, out: row.querySelector('.out') };
      }
      box.appendChild(row);
    }
    sync(P);
  }
  const toPos = (d, v) => d.log ? 1000 * Math.log(v / d.min) / Math.log(d.max / d.min) : 1000 * (v - d.min) / (d.max - d.min);
  function fromPos(d, p) {
    let v = d.log ? d.min * Math.pow(d.max / d.min, p / 1000) : d.min + (d.max - d.min) * p / 1000;
    if (d.step) v = Math.round(v / d.step) * d.step;
    if (d.snap) v = d.snap(v);
    return v;
  }
  function sync(P) {
    for (const k in rows) {
      const r = rows[k];
      if (r.d.chk) r.inp.checked = !!P[k];
      else if (r.d.opts) r.row.querySelectorAll('.opts button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P[k])));
      else { r.inp.value = Math.round(toPos(r.d, P[k])); r.out.textContent = r.d.fmt(P[k]); }
    }
  }
  // 見せるつまみと、新しく出したつまみ（光らせる）
  function show(keys, fresh) {
    for (const k in rows) {
      rows[k].row.hidden = keys !== 'all' && !keys.includes(k);
      rows[k].row.classList.toggle('new', !!fresh && fresh.includes(k));
    }
  }

  // ---- 計算した値（見るだけ） ----
  const VALS = [
    { k: 'N', lab: '大きさ', unit: 'sone', max: 24, note: '耳に聞こえる大きさ。40 phon（静かな部屋の話し声くらい）で 1' },
    { k: 'S', lab: '鋭さ', unit: 'acum', max: 3, note: '高い帯域に大きさが寄るほど鋭い（キンキン）' },
    { k: 'R', lab: '粗さ', unit: 'asper', max: 3, note: '近い高さの成分どうしのうなり・速いゆらし（ザラザラ）' },
    { k: 'T', lab: '音らしさ', unit: '', max: 1, note: '音程のある成分の大きさの割合（ノイズだけなら 0）' },
    { k: 'valence', lab: '快さの推定', unit: '', max: 1, sym: true, note: '粗さ・鋭さ・大きさ・音らしさから（Aures 1985 の考え方）' },
    { k: 'arousal', lab: '興奮の推定', unit: '', max: 1, sym: true, note: '大きい・鋭い・粗い・テンポが速いほど興奮のほう' },
  ];
  const valEls = {};
  function buildVals() {
    const box = document.getElementById('valgrid');
    for (const d of VALS) {
      const el = document.createElement('div'); el.className = 'val';
      el.innerHTML = `<div class="k">${d.lab}</div><div class="v"></div><div class="bar"><i></i></div><div class="n">${d.note}</div>`;
      box.appendChild(el);
      valEls[d.k] = { v: el.querySelector('.v'), bar: el.querySelector('.bar i'), d };
    }
  }
  function showVals(res) {
    for (const k in valEls) {
      const { v, bar, d } = valEls[k], x = res[k];
      v.textContent = d.sym ? (x >= 0 ? '+' : '') + x.toFixed(2) : x.toFixed(2) + (d.unit ? ' ' + d.unit : '');
      const f = d.sym ? (x + 1) / 2 : Math.min(1, x / d.max);
      bar.style.width = (f * 100).toFixed(1) + '%';
      bar.classList.toggle('bad', (k === 'valence' && x < 0) || (k === 'R' && x > 1));
    }
  }

  // ---- タブとつぎへのツアー（1歩に新しいもの1つ。どのタブからでも始められるよう、set は BASE からの差） ----
  const BASE = { f0: 220, bright: 0.3, two: false, cents: 700, squeal: 0, amRate: 0, amDepth: 0, stretch: 0, level: 60, tone: 1, nature: 'none', noise: 0, bpm: 0, wobble: 0 };
  const K1 = ['f0', 'bright', 'level'], K2 = [...K1, 'two', 'cents'], K3 = [...K2, 'squeal'], K4 = [...K3, 'amRate', 'amDepth'], K5 = [...K4, 'bpm'], K6 = [...K5, 'nature', 'noise', 'tone'];
  const TOUR = [
    { tab: 'はじめに', t: 'つまみ（青緑）で音を作ると、耳のモデルで計算して、地図の白い点が動きます。左の「▶ 音を出す」で、小さな音から始まります。', btn: 'はじめる', keys: [], set: {}, hl: 'map' },
    { tab: '①1つの音', t: '①倍音（2倍・3倍…の高さ）がそろった1つの音。地図では「ゆったり」のほう。「明るさ」で倍音をふやすと？', keys: K1, fresh: ['bright'], set: {}, hl: 'map' },
    { tab: '②2つの音', t: '②2つ目の音。半音ちがい（100¢）だとうなってザラザラ（粗さ）。「音程」を 700¢（ド→ソ）へ動かすと、曲線の谷で落ち着きます。', keys: K2, fresh: ['cents'], set: { two: true, cents: 100, bright: 0.5 }, hl: 'curve' },
    { tab: '③キーキー', t: '③黒板をひっかく音がもつ 2,500〜5,500 Hz の帯。人がとくにいやがる帯です（Kumar ほか 2008）。耳がいちばん敏感な帯とも重なります。音量に注意。', keys: K3, fresh: ['squeal'], set: { squeal: 0.6, level: 55 }, hl: 'spec' },
    { tab: '④ザラザラ', t: '④音の大きさを1秒に 30〜150 回ゆらすと「粗さ」。悲鳴や警報の音がもつ性質です（Arnal ほか 2015）。点は興奮のほうへ上がり、快さは下がります。', keys: K4, fresh: ['amRate', 'amDepth'], set: { f0: 500, bright: 0.6, amRate: 70, amDepth: 0.9 }, hl: 'map' },
    { tab: '⑤テンポ', t: '⑤拍の速さ。速いテンポほど呼吸・心拍・血圧が上がり、音楽を止めた間で下がりました（Bernardi ほか 2006）。60 と 150 で点をくらべて。', keys: K5, fresh: ['bpm'], set: { f0: 330, bpm: 60 }, hl: 'map' },
    { tab: '⑥自然の音', t: '⑥波・雨・風（ノイズを形づけた合成）。耳のモデルでは快さが低めに出ますが、自然の音でストレスからの回復が速い傾向も（Alvarsson ほか 2010）。「じぶんの感じ方」を置いてくらべて。', keys: K6, fresh: ['nature', 'me'], set: { tone: 0.3, nature: 'wave', noise: 0.8, level: 52 }, hl: 'map' },
    { tab: '自由に', t: 'ここからは自由に。「ゆらぎ」「倍音のずれ」（鐘のような音）も使えます。気になった音は「じぶんの感じ方」を置いて、推定とくらべてみてください。', btn: '最初から', keys: 'all', fresh: ['wobble', 'stretch'], set: null, hl: null },
  ];
  return { build, sync, show, buildVals, showVals, TOUR, BASE, KNOBS };
})();
window.UI = UI;
