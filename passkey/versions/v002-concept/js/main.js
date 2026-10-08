/* Start-up, running one story at a time, the toolbar, and the debug handle window.__pk. */
'use strict';

let RUNNING = null;
async function stopRunning(){
  if (!RUNNING) return;
  ST.aborting = true; abortWaits();
  await RUNNING.catch(() => {});
  ST.aborting = false;
}
async function run(fn){
  await stopRunning();
  const p = (async () => {
    W.busy = true;
    try { return await fn(); }
    catch (e) { if (e.message !== 'abort'){ console.error(e); window.__pkErr = e; narr('エラー: ' + esc(e.message)); } }
    finally { W.busy = false; }
  })();
  RUNNING = p;
  const r = await p;
  if (RUNNING === p) RUNNING = null;
  return r;
}
function startExp(id, mode){
  if (mode && mode !== W.mode){ W.mode = mode; }
  if (matchMedia('(max-width:820px)').matches) $('stage').scrollIntoView({ behavior:'smooth', block:'start' });
  run(async () => {
    ST.cur = id + ':' + W.mode; syncControls(); renderAll();
    const r = await EXP[id]();
    if (r) RES[id + ':' + W.mode] = r;
    ST.cur = null; buildScore();
  }).then(() => { ST.cur = null; buildScore(); });
}

async function resetAll(){
  await stopRunning();
  await resetWorld();
  for (const k in RES) delete RES[k];
  ST.log = []; ST.sel = null; ST.badges = null; ST.gateStop = null; ST.cur = null;
  ST.phoneUI = { kind:'idle' }; W.origin = 'donguri-bank.example';
  $('insp').innerHTML = '<p class="cap">上の記録を押すと、その小包の中身が出ます。</p>';
  renderAll(); syncControls();
  narr('右の表の<b>「試す」</b>を押してみよう（スマホでは下）');
}

function wire(){
  document.querySelectorAll('#segMode button').forEach(b => b.onclick = async () => {
    if (b.dataset.v === W.mode) return;
    await stopRunning();
    W.mode = b.dataset.v; ST.badges = null; ST.gateStop = null;
    syncControls(); renderAll();
    narr(W.mode === 'password' ? '🗝 <b>合言葉</b>（パスワード）でログインする世界' : '🔑 <b>パスキー</b>でログインする世界');
  });
  document.querySelectorAll('#segSpeed button').forEach(b => b.onclick = () => { ST.speed = +b.dataset.v; syncControls(); });
  $('btnReset').onclick = resetAll;
  addEventListener('resize', drawWires);
  if (window.ResizeObserver) new ResizeObserver(drawWires).observe($('world'));
}

async function init(){
  if (!window.crypto || !crypto.subtle){ narr('<em>https か、このパソコンの中のサーバーで開いてください</em>（暗号の機能を使うため）'); return; }
  buildSources(); wire();
  await resetAll();
}

window.__pk = { W, ST, RES, run, startExp, EXP, resetAll, auto:(v = true) => { ST.auto = v; } };
init().catch(e => { console.error(e); window.__pkErr = e; });
