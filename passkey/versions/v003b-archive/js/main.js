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
  clearPoint();
  run(async () => {
    ST.cur = id + ':' + W.mode; syncControls(); renderAll();
    const r = await EXP[id]();
    if (r) RES[id + ':' + W.mode] = r;
    ST.cur = null; buildScore();
    if (r){
      const mark = r === 'hit' ? '<em>✕ 入られた</em>' : r === 'safe' ? '<strong>◯ 守れた</strong>' : '<strong>✓ できた</strong>';
      await ask(`<span style="font-size:22px">${mark}</span><br>${$('narrText').innerHTML}`, ['OK']);
    }
  }).then(() => { ST.cur = null; buildScore(); if (!W.busy) pointNext(); });
}
/* point at the next square of the table that has not been tried */
function pointNext(){
  const order = [];
  for (const e of EXPS) for (const m of ['passkey', 'password']) if (!e.only || e.only === m) order.push([e.id, m]);
  const left = order.filter(([id, m]) => !RES[id + ':' + m]);
  if (!left.length){ clearPoint(); return; }
  const [id, m] = left[0];
  const b = document.querySelector(`#score button[data-id="${id}"][data-m="${m}"]`);
  if (b){ b.classList.add('want'); pointAt(b, left.length === order.length ? 'ここから' : 'つぎはここ'); }
}

async function resetAll(){
  await stopRunning();
  await resetWorld();
  for (const k in RES) delete RES[k];
  ST.log = []; ST.sel = null; ST.badges = null; ST.gateStop = null; ST.cur = null;
  ST.phoneUI = { kind:'idle' }; W.origin = 'donguri-bank.example';
  $('insp').innerHTML = '<p class="cap">上の記録を押すと、その小包の中身が出ます。</p>';
  renderAll(); syncControls();
  narr('<b>「試す」</b>の表から始めよう（スマホでは下のほう）');
  pointNext();
}

function wire(){
  document.querySelectorAll('#segMode button').forEach(b => b.onclick = async () => {
    if (b.dataset.v === W.mode) return;
    await stopRunning();
    W.mode = b.dataset.v; ST.badges = null; ST.gateStop = null;
    syncControls(); renderAll();
    narr(W.mode === 'password' ? '🗝 <b>合言葉</b>（パスワード）でログインする世界' : '🔑 <b>パスキー</b>でログインする世界');
    pointNext();
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
