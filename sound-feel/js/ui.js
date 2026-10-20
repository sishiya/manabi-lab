// 心地よい音・いやな音 — つまみ・計算した値の表示・つぎへのツアー
'use strict';
const UI = (() => {
  // つまみ: key・名前・範囲・表示・ひとこと
  const NOTE_NAMES = [[0, '同じ高さ'], [100, '半音'], [200, '全音'], [300, '短3度'], [400, '長3度'], [500, '4度'], [600, '増4度'], [700, '5度'], [800, '短6度'], [900, '長6度'], [1000, '短7度'], [1100, '長7度'], [1200, 'オクターブ']];
  const near = (c) => { const n = NOTE_NAMES.reduce((a, b) => Math.abs(b[0] - c) < Math.abs(a[0] - c) ? b : a); return Math.abs(n[0] - c) <= 15 ? n[1] : ''; };
  const KNOBS = [
    { k: 'f0', lab: '高さ', min: 80, max: 2000, log: true, fmt: v => Math.round(v) + ' Hz', note: '1秒にふるえる回数（いちばん低い成分）' },
    { k: 'bright', lab: '明るさ（倍音）', min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', note: '2倍・3倍…の高さの成分（倍音）をどれだけ強くするか' },
    { k: 'two', lab: '2つ目の音', chk: true, note: '同じ音色の音をもう1つ重ねる' },
    { k: 'cents', lab: '音程', min: 0, max: 1200, step: 1, fmt: v => Math.round(v) + '¢ ' + near(v), note: '2つ目の音の高さのちがい（100 セント＝半音、1200＝1オクターブ）', dep: 'two' },
    { k: 'squeal', lab: 'キーキーの帯', min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', note: '2,500〜5,500 Hz の成分を、1秒に数回ゆっくり揺らしながら足す（黒板の音の性質をまねたもの）' },
    { k: 'amRate', lab: 'ゆらしの速さ', min: 0, max: 200, step: 1, fmt: v => Math.round(v) + ' 回/秒', note: '音の大きさを1秒に何回ゆらすか。30〜150 回で「ザラザラ」' },
    { k: 'amDepth', lab: 'ゆらしの深さ', min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', note: '' },
    { k: 'stretch', lab: '倍音のずれ', min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', note: '倍音を整数倍からずらす（鐘や金属の板のような音）' },
    { k: 'level', lab: '想定の大きさ', min: 40, max: 75, step: 1, fmt: v => Math.round(v) + ' dB', note: '計算で使う音の大きさ（ふつうの会話が約 60 dB）。音もいっしょに大きくなる' },
  ];
  const rows = {};
  let onChange = () => {};

  function build(P, cb) {
    onChange = cb;
    const box = document.getElementById('controls');
    for (const d of KNOBS) {
      const row = document.createElement('div'); row.className = 'row'; row.dataset.k = d.k;
      if (d.chk) {
        row.innerHTML = `<span class="lab">${d.lab}</span><label class="chk"><input type="checkbox"> 重ねる</label><span class="out"></span><span class="note">${d.note}</span>`;
        const inp = row.querySelector('input');
        inp.addEventListener('change', () => { P[d.k] = inp.checked; cb(d.k); });
        rows[d.k] = { row, inp, d };
      } else {
        row.innerHTML = `<span class="lab">${d.lab}</span><input type="range" min="0" max="1000" step="1" aria-label="${d.lab}"><span class="out"></span>` + (d.note ? `<span class="note">${d.note}</span>` : '');
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
    return v;
  }
  function sync(P) {
    for (const k in rows) {
      const r = rows[k];
      if (r.d.chk) r.inp.checked = !!P[k];
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

  // ---- 計算した値 ----
  const VALS = [
    { k: 'N', lab: '大きさ', unit: 'sone', max: 16, note: '耳に聞こえる大きさ。40 phon（静かな部屋の話し声くらい）で 1' },
    { k: 'S', lab: '鋭さ', unit: 'acum', max: 3, note: '高い帯域に大きさが寄るほど鋭い（キンキン）' },
    { k: 'R', lab: '粗さ', unit: 'asper', max: 3, note: '近い高さの成分どうしのうなり・速いゆらし（ザラザラ）' },
    { k: 'valence', lab: '快さの推定', unit: '', max: 1, sym: true, note: '粗さ・鋭さ・大きさから（Aures 1985 の考え方）' },
    { k: 'arousal', lab: '興奮の推定', unit: '', max: 1, sym: true, note: '大きい・鋭い・粗いほど興奮のほう' },
  ];
  const valEls = {};
  function buildVals() {
    const box = document.getElementById('vals');
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
      v.textContent = (d.sym ? (x >= 0 ? '+' : '') + x.toFixed(2) : x.toFixed(2) + ' ' + d.unit);
      const f = d.sym ? (x + 1) / 2 : Math.min(1, x / d.max);
      bar.style.width = (f * 100).toFixed(1) + '%';
      bar.style.background = (k === 'valence' && x < 0) || (k === 'R' && x > 1) ? Draw.C.bad : Draw.C.acc;
    }
  }

  // ---- つぎへのツアー（1歩に新しいもの1つ） ----
  const BASE = { f0: 220, bright: 0.3, two: false, cents: 700, squeal: 0, amRate: 0, amDepth: 0, stretch: 0, level: 60 };
  const TOUR = [
    { t: 'つまみで音を作ると、耳のモデルで計算して、地図の点が動きます。左の「▶ 音を出す」で、小さな音から始まります。', btn: 'はじめる', keys: [], set: BASE, hl: 'map' },
    { t: '①倍音（2倍・3倍…の高さ）がそろった1つの音。地図では「ゆったり」のほう。「明るさ」で倍音をふやすと？', keys: ['f0', 'bright', 'level'], fresh: ['bright'], set: BASE, hl: 'map' },
    { t: '②2つ目の音。半音ちがい（100¢）だとうなってザラザラ（粗さ）。「音程」を 700¢（ド→ソ）へ動かすと、曲線の谷で落ち着きます。', keys: ['f0', 'bright', 'level', 'two', 'cents'], fresh: ['cents'], set: { two: true, cents: 100, bright: 0.5 }, hl: 'curve' },
    { t: '③黒板をひっかく音がもつ 2,500〜5,500 Hz の帯。人がとくにいやがる帯です（Kumar ほか 2008）。耳がいちばん敏感な帯とも重なります。音量に注意。', keys: ['f0', 'bright', 'level', 'two', 'cents', 'squeal'], fresh: ['squeal'], set: { two: false, squeal: 0.6, level: 55 }, hl: 'spec' },
    { t: '④音の大きさを1秒に 30〜150 回ゆらすと「粗さ」。悲鳴や警報の音がもつ性質です（Arnal ほか 2015）。点は興奮のほうへ上がり、快さは下がります。', keys: ['f0', 'bright', 'level', 'two', 'cents', 'squeal', 'amRate', 'amDepth'], fresh: ['amRate', 'amDepth'], set: { squeal: 0, f0: 500, bright: 0.6, amRate: 70, amDepth: 0.9, level: 60 }, hl: 'map' },
    { t: 'ここからは自由に。「倍音のずれ」は鐘のような音（倍音が整数倍からずれる）。点がどこへ動くか試してください。', btn: '最初から', keys: 'all', fresh: ['stretch'], set: { amRate: 0, amDepth: 0 }, hl: null },
  ];
  return { build, sync, show, buildVals, showVals, TOUR, BASE, KNOBS };
})();
window.UI = UI;
