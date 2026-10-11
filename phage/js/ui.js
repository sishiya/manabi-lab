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
  function log(sc, html, kind, tMin) {
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

  // ① 着陸
  const hostSel = $('hostSel');
  for (const [id, h] of Object.entries(HOSTS)) {
    const b = document.createElement('button'); b.textContent = h.name; b.dataset.id = id;
    b.addEventListener('click', () => { Land.reset(id); markHost(); $('toInside').hidden = true; });
    hostSel.appendChild(b);
  }
  function markHost() {
    hostSel.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === Land.S.hostId)));
    $('hostDesc').innerHTML = Land.S.host.desc;
  }
  $('landReset').addEventListener('click', () => { Land.reset(); $('toInside').hidden = true; });
  let lastLand = '';
  function landStatus(S) {
    const n = S.fib.filter(f => f.bound).length;
    const legs = S.fib.map(f => `<i class="${f.bound ? 'on' : ''}"></i>`).join('');
    const gap = Math.max(0, Math.round(S.B.y - 3));
    const stage = { free: S.grab ? '光ピンセットで運んでいる' : 'ふらふらゆれている', settle: '基盤が星形に', short: '短い脚がくいこむ', contract: 'さやが縮む', lyso: '細胞壁に穴', dna: 'DNA が入っていく', done: '注入おわり' }[S.phase];
    const bp = S.phase === 'dna' || S.phase === 'done' ? Math.round(T4.genomeBp * S.dnaF).toLocaleString() + ' 塩基対' : '—';
    const html = `<dl class="stat"><dt>様子</dt><dd>${stage}</dd><dt>くっついた脚</dt><dd><span class="legs">${legs}</span> ${n}/6</dd><dt>表面までの高さ</dt><dd>${S.phase === 'free' ? gap + ' nm' : '—'}</dd><dt>入った DNA</dt><dd>${bp}</dd><dt>本当の時間</dt><dd>${S.simMs.toFixed(2)} ミリ秒</dd></dl>`;
    if (html !== lastLand) { $('landStatus').innerHTML = html; lastLand = html; }
    $('landHud').textContent = `1万分の1の速さ ${S.simMs.toFixed(2)}ms`;
  }
  function landDone(hostId) {
    const b = $('toInside'); b.hidden = false;
    b.onclick = () => { Inside.reset({ host: hostId === 'b' ? 'b' : 'k12', variant: 'wt' }); markIn(); setTab('inside'); };
    toast('land', 'DNA が入った！');
  }

  // ② 細菌の中
  const SPEEDS = [[0.25, '1秒＝15秒'], [1, '1秒＝1分'], [2, '1秒＝2分']];
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
    const html = `<dl class="stat"><dt>感染から</dt><dd>${S.t.toFixed(1)} 分</dd><dt>様子</dt><dd>${st}</dd><dt>完成したファージ</dt><dd>${S.done} 個</dd><dt>DNA をつめている頭</dt><dd>${S.burstAt != null ? '—' : (S.packing || 0) + ' 個'}</dd><dt>細菌の DNA</dt><dd>${Math.round((S.hostLeft ?? 1) * 100)}%（目安）</dd></dl>`;
    if (html !== lastIn) { $('inStatus').innerHTML = html; lastIn = html; }
    $('inHud').textContent = `感染から ${S.t.toFixed(1)} 分`;
    $('inPlay').textContent = S.playing ? '⏸' : '▶';
    $('superBtn').disabled = S.failed || S.burstAt != null;
  }
  function loupe(info) {
    if (!info) return;
    hideHint('in');
    $('loupe').innerHTML = `<h3>${info.t} <span class="kind ${info.k}">${KIND[info.k]}</span></h3><p>${info.b}</p>`;
  }

  return { setTab, get tab() { return tab; }, onTab: f => listeners.push(f), clearLog, log, toast, hideHint, landStatus, landDone, inStatus, loupe, markHost, markIn };
})();
