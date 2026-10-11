// 細菌にとりつくウイルス — タブ・右の欄・記録・ルーペ
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  const KIND = { sure: '研究の値', est: '目安', art: '模式' };
  let tab = 'land';
  const listeners = [];

  // タブ
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('.page').forEach(p => p.hidden = p.dataset.page !== t);
    listeners.forEach(f => f(t));
  }

  // 記録
  function clearLog(sc) { $(sc === 'land' ? 'landLog' : 'inLog').innerHTML = ''; }
  function goZoom(id) { setTab('zoom'); Zoom.open(id); }
  function log(sc, html, kind, tMin, zid) {
    const ol = $(sc === 'land' ? 'landLog' : 'inLog'), li = document.createElement('li');
    if (kind) li.className = kind;
    let tm = '';
    if (sc === 'land') tm = `${Land.S.simMs.toFixed(2)}ms`;
    else if (tMin != null) tm = `${tMin.toFixed(1)}分`;
    li.innerHTML = `<span class="tm">${tm}</span>${html}${kind ? ` <span class="kind ${kind}">${KIND[kind]}</span>` : ''}`;
    ol.prepend(li);
  }
  const toastT = {};
  function toast(sc, msg) {
    const el = $(sc === 'land' ? 'landToast' : 'inToast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT[sc]); toastT[sc] = setTimeout(() => el.classList.remove('on'), 1800);
  }
  function hideHint(sc) { $(sc === 'land' ? 'landHint' : 'inHint').classList.add('off'); }

  // 「つぎへ」: 図の上に大きなボタンを出す。items = [[文字, 押したとき, 目立たせるか], …]。null で消す
  const nextKey = {};
  function next(sc, items, key) {
    const el = $(sc === 'land' ? 'landNext' : sc === 'in' ? 'inNext' : 'zNext');
    const tabNext = { land: 'inside', in: 'zoom' }[sc];
    if (!items) { el.hidden = true; el.innerHTML = ''; nextKey[sc] = null; if (tabNext) document.querySelector(`#tabs button[data-tab="${tabNext}"]`).classList.remove('pulse'); return; }
    if (nextKey[sc] === key) return;
    nextKey[sc] = key; el.innerHTML = '';
    for (const [label, fn, primary] of items) { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.addEventListener('click', fn); el.appendChild(b); }
    el.hidden = false;
    if (tabNext) document.querySelector(`#tabs button[data-tab="${tabNext}"]`).classList.add('pulse');
  }

  // ルーペのカード（図の上の左下に、さわったものの説明。しばらくすると消える）
  const cardT = {};
  function card(sc, info) {
    if (!info) return;
    const el = $(sc === 'land' ? 'landCard' : sc === 'in' ? 'inCard' : 'zCard');
    el.innerHTML = `<button class="x" aria-label="閉じる">×</button><b>🔍 ${info.t}</b> <span class="kind ${info.k}">${KIND[info.k]}</span><p>${info.b}</p>`;
    el.hidden = false; el.querySelector('.x').addEventListener('click', () => { el.hidden = true; });
    clearTimeout(cardT[sc]); cardT[sc] = setTimeout(() => { el.hidden = true; }, 12000);
  }
  function landLoupe(info) {
    if (!info) return;
    $('landLoupe').innerHTML = `<h3>${info.t} <span class="kind ${info.k}">${KIND[info.k]}</span></h3><p>${info.b}</p>`;
    card('land', info);
  }

  // 目的の札（図の上）: title と、進み具合の札 chips = [[文字, 'done'|'now'|'warn'|''], …]
  const goalKey = {};
  function goal(sc, title, chips) {
    const el = $(sc === 'land' ? 'landGoal' : sc === 'in' ? 'inGoal' : 'zGoal');
    const key = title + JSON.stringify(chips || []);
    if (goalKey[sc] === key) return; goalKey[sc] = key;
    el.innerHTML = `<b>目的: ${title}</b>` + (chips && chips.length ? `<div class="chips">${chips.map(([t, c]) => `<span class="${c}">${c === 'done' ? '✓ ' : ''}${t}</span>`).join('<i>→</i>')}</div>` : '');
  }

  // ① 着陸
  const hostSel = $('hostSel');
  for (const [id, h] of Object.entries(HOSTS)) {
    const b = document.createElement('button'); b.textContent = h.name; b.dataset.id = id;
    b.addEventListener('click', () => { Land.reset(id); markHost(); });
    hostSel.appendChild(b);
  }
  function markHost() {
    hostSel.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === Land.S.hostId)));
    $('hostDesc').innerHTML = Land.S.host.desc;
  }
  $('landReset').addEventListener('click', () => { Land.reset(); });
  let lastLand = '';
  function landStatus(S) {
    const n = S.fib.filter(f => f.bound).length;
    const legs = S.fib.map(f => `<i class="${f.bound ? 'on' : ''}"></i>`).join('');
    const gap = Math.max(0, Math.round((S.phase === 'approach' ? S.A.y : S.B.y) - 3));
    const stage = { approach: S.grab ? '細菌へ運んでいる' : '細菌から離れている', zoomin: '表面へ寄っている', free: S.grab ? '光ピンセットで運んでいる' : 'ふらふらゆれている', settle: '基盤が星形に', short: '短い脚がくいこむ', contract: 'さやが縮む', lyso: '細胞壁に穴', dna: 'DNA が入っていく', done: '注入おわり' }[S.phase];
    const bp = S.phase === 'dna' || S.phase === 'done' ? Math.round(T4.genomeBp * S.dnaF).toLocaleString() + ' 塩基対' : '—';
    const html = `<dl class="stat"><dt>様子</dt><dd>${stage}</dd><dt>くっついた脚</dt><dd><span class="legs">${legs}</span> ${n}/6</dd><dt>表面までの高さ</dt><dd>${S.phase === 'free' || S.phase === 'approach' ? gap + ' nm' : '—'}</dd><dt>入った DNA</dt><dd>${bp}</dd><dt>本当の時間</dt><dd>${S.simMs.toFixed(2)} ミリ秒</dd></dl>`;
    if (html !== lastLand) { $('landStatus').innerHTML = html; lastLand = html; }
    $('landHud').textContent = `1万分の1の速さ ${S.simMs.toFixed(2)}ms`;
    const pre = S.phase === 'approach' || S.phase === 'zoomin', free = S.phase === 'free';
    const d1 = !pre, d2 = !pre && !free, d3 = S.done;
    const st = (d, prev) => d ? 'done' : prev ? 'now' : '';
    let c2 = ['脚を3本くっつける', st(d2, d1)];
    if (S.saidNoRec && !d2) c2 = ['この細菌には脚がくっつかない → ほかの細菌を', 'warn'];
    const c1 = ['細菌の表面まで運ぶ', st(d1, true)];
    goal('land', 'ファージを大腸菌に突き刺して、DNA を注入しよう！', [c1, c2, ['刺さって DNA が入る', st(d3, d2)]]);
  }
  function landDone(hostId) {
    next('land', [['つぎへ: ② 細菌の中で増える →', () => { Inside.reset({ host: hostId === 'b' ? 'b' : 'k12', variant: 'wt' }); markIn(); setTab('inside'); }, true]], 'done');
    toast('land', 'DNA が入った！');
  }

  // ② 細菌の中
  const SPEEDS = [[0.25, '1秒＝15秒'], [0.5, '1秒＝30秒'], [1, '1秒＝1分']];
  for (const [v, lab] of SPEEDS) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.v = v;
    b.addEventListener('click', () => { Inside.setSpeed(v); markIn(); });
    $('speeds').appendChild(b);
  }
  const mkSeg = (el, items, key) => items.forEach(([v, lab]) => {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.v = v;
    b.addEventListener('click', () => { Inside.reset({ [key]: v }); markIn(); });
    $(el).appendChild(b);
  });
  mkSeg('inHost', [['k12', '大腸菌 K-12'], ['b', '大腸菌 B']], 'host');
  mkSeg('inVar', [['wt', 'ふつう'], ['gt', 'DNA に糖のない変異']], 'variant');
  function markIn() {
    const S = Inside.S;
    $('speeds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === S.speed)));
    $('inHost').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.host)));
    $('inVar').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.variant)));
  }
  $('inPlay').addEventListener('click', () => Inside.toggle());
  $('inReset').addEventListener('click', () => { Inside.reset(); markIn(); });
  $('superBtn').addEventListener('click', () => Inside.superinfect());
  let lastIn = '';
  function inStatus(S) {
    const st = S.failed ? '失敗（DNA が切られた）' : S.burstAt != null ? '破裂した' : S.lin ? '破裂がおくれている' : '増えている';
    const n = v => Math.round(v || 0).toLocaleString(), t = S.t, on = c => c ? ' on' : '';
    const flow = S.failed ? '' : `<ol class="flow">
      <li class="${on(t >= TL.hostDnaFrom)}"><i style="background:#6ea9ff"></i><b>材料</b>: 細菌の DNA をこわして使う（残り ${Math.round((S.hostLeft ?? 1) * 100)}%・目安）</li>
      <li class="${on(true)}"><i style="background:#ff9f6b"></i><b>設計図</b>: T4 の DNA をコピー → 約${n(S.genomes || 1)}本ぶん<small>（目安）</small></li>
      <li class="${on(t >= TL.hostStop)}"><i style="background:#dcc8aa"></i><b>工場</b>: 細菌のリボソームが、設計図の写し（mRNA）のとおりに T4 の部品だけを作る</li>
      <li class="${on(t >= TL.late)}"><i style="background:#5fe0c4"></i><b>部品</b>: 頭の殻 gp23 約${n(S.gp23)}個・さや gp18 約${n(S.gp18)}個<small>（1つに960個・138個 × 作った数）</small></li>
      <li class="${on((S.packing || 0) + (S.done || 0) > 0)}"><i style="background:#c39bff"></i><b>組み立て</b>: 頭 ${S.building || 0}・DNA をつめている ${S.packing || 0}（しっぽが寄ってくる）</li>
      <li class="${on(S.done > 0)}"><i style="background:#f2f7f9"></i><b>完成</b>: ${S.done} 個</li></ol>`;
    const html = `<dl class="stat"><dt>感染から</dt><dd>${t.toFixed(1)} 分</dd><dt>様子</dt><dd>${st}</dd></dl>${flow}`;
    if (html !== lastIn) { $('inStatus').innerHTML = html; lastIn = html; }
    $('inHud').textContent = `感染から ${S.t.toFixed(1)} 分`;
    if (S.failed) goal('in', '細菌の中で T4 が増えて、破って出るまでを見届けよう', [['DNA が切られて失敗（細菌の勝ち）', 'warn']]);
    else {
      const ds = [S.t >= 1, S.t >= 5, S.done > 0, S.burstAt != null];
      const lab = ['細菌の工場を乗っとる', 'DNA をコピー', '部品を作って組み立てる', '細菌を破って出る'];
      goal('in', '細菌の中で T4 が増えて、破って出るまでを見届けよう', lab.map((t, i) => [t, ds[i] ? 'done' : (i === 0 || ds[i - 1]) ? 'now' : '']));
    }
    $('inPlay').textContent = S.playing ? '⏸' : '▶';
    $('superBtn').disabled = S.failed || S.burstAt != null;
    if ((S.burstAt != null && S.burst > 2.5) || S.failed) next('in', [['つぎへ: ③ 分子の大きさで寄って見る →', () => goZoom('form'), true]], 'end');
    else next('in', null);
  }
  function loupe(info) {
    if (!info) return;
    hideHint('in');
    $('loupe').innerHTML = `<h3>${info.t} <span class="kind ${info.k}">${KIND[info.k]}</span></h3><p>${info.b}</p>`;
    card('in', info);
  }

  return { card, landLoupe, goal, next, goZoom, setTab, get tab() { return tab; }, onTab: f => listeners.push(f), clearLog, log, toast, hideHint, landStatus, landDone, inStatus, loupe, markHost, markIn };
})();
