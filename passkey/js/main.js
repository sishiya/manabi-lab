/* Start-up, running flows one at a time, toolbar, address bar, and the debug handle window.__pk. */
'use strict';

let RUNNING = null;
async function run(fn){
  if (RUNNING){ ST.aborting = true; abortWaits(); await RUNNING.catch(() => {}); ST.aborting = false; }
  const p = (async () => {
    W.busy = true;
    try { await fn(); }
    catch (e) { if (e.message !== 'abort'){ console.error(e); window.__pkErr = e; narr('エラー: ' + esc(e.message)); } }
    finally { W.busy = false; ST.cur = null; buildExps(); renderAll(); }
  })();
  RUNNING = p;
  await p;
  if (RUNNING === p) RUNNING = null;
}
function startExp(id){
  if (matchMedia('(max-width:820px)').matches) $('stage').scrollIntoView({ behavior:'smooth', block:'start' });
  run(async () => {
    ST.cur = id; buildExps();
    ST.checks = null;
    await EXP[id]();
    TRIED.add(id + ':' + W.mode);
  });
}

function buildAddrMenu(){
  const m = $('addrMenu');
  const items = [
    ['donguri-bank.example', 'どんぐり銀行（本物）'],
    ['neko-shop.example', 'ねこ商店'],
    ['donguri-bamk.example', 'どんぐり銀行そっくりの偽サイト'],
  ];
  m.innerHTML = items.map(([h, d]) => `<li><button data-h="${h}">${hostHTML(h)}<small>${d}</small></button></li>`).join('');
  m.querySelectorAll('button').forEach(b => b.onclick = () => { m.hidden = true; if (W.busy) return; setOrigin(b.dataset.h); W.thief.active = !!SITES[b.dataset.h].fake; renderThief();
    narr(SITES[b.dataset.h].fake ? '偽サイトを開きました。住所の <span class="mono">ba<em>m</em>k</span> に気づけましたか？ ログインしてみましょう。' : `<span class="mono">${esc(b.dataset.h)}</span> を開きました。`); });
}

async function resetAll(){
  if (RUNNING){ ST.aborting = true; abortWaits(); await RUNNING.catch(() => {}); ST.aborting = false; }
  await resetWorld();
  ST.log = []; ST.sel = null; ST.checks = null; ST.pageMsg = ''; ST.pwTyped = false; ST.browserOwner = 'you';
  ST.phoneUI = { kind:'idle' }; W.origin = 'donguri-bank.example'; ST.viewHost = W.origin;
  $('insp').innerHTML = '<p class="cap">飛んでいる小包や、上の「やりとりの記録」、スマホの金庫の鍵を押すと、ここに中身（本物のバイト列）が出ます。</p>';
  renderAll(); buildExps();
  narr('<b>「試す」</b>（右の欄。スマホでは下のほう）から実験を選ぶか、ブラウザの中のサイトを自由に操作してください。まずは <b>1 ふつうにログイン</b> から。');
}

function wire(){
  document.querySelectorAll('#segMode button').forEach(b => b.onclick = () => {
    if (b.dataset.v === W.mode) return;
    const go = () => { W.mode = b.dataset.v; ST.pageMsg = ''; ST.pwTyped = false; ST.checks = null; syncControls(); renderAll();
      narr(W.mode === 'password' ? '<b>パスワード</b>でログインするサイトにしました。同じ実験をくらべてみましょう。' : '<b>パスキー</b>でログインするサイトにしました。'); };
    if (W.busy){ run(async () => go()); } else go();
  });
  document.querySelectorAll('#segSpeed button').forEach(b => b.onclick = () => { ST.speed = +b.dataset.v; syncControls(); });
  $('btnReset').onclick = resetAll;
  $('addr').onclick = e => { e.stopPropagation(); $('addrMenu').hidden = !$('addrMenu').hidden; };
  document.addEventListener('click', e => { if (!$('addrMenu').contains(e.target)) $('addrMenu').hidden = true; });
  addEventListener('resize', drawWires);
  if (window.ResizeObserver) new ResizeObserver(drawWires).observe($('world'));
}

async function init(){
  if (!window.crypto || !crypto.subtle){
    narr('<em>このページは https（またはこのパソコンの中）で開いたときだけ動きます</em>（ブラウザの暗号の機能を使うため）。');
    return;
  }
  loadDone(); buildQuests(); buildSources(); buildAddrMenu();
  wire();
  await resetAll();
  syncControls();
}

window.__pk = { W, ST, run, startExp, EXP, resetAll, auto:(v = true) => { ST.auto = v; }, quest, DONE: () => [...DONE] };
init().catch(e => { console.error(e); window.__pkErr = e; });
