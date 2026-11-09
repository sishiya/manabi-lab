// 動かしている間の表を、毎コマ計算する代わりに、先に作った表をまぜて作る（毎コマの計算は 20〜35 ms で、コマに間に合わない）。
// 止まったら細かい表を今までどおり直接計算するので、止めた絵の正確さは変わらない。Worker が使えないときや、まだできていない所は直接計算。
'use strict';
const LC = { w: null, id: 0, a: 0, W: 0, ls: null, tabs: null, timer: 0 };

function lcStop() { if (LC.w) { LC.w.terminate(); LC.w = null; } }
function lcStart() {
  lcStop();
  if (!LC.tabs || LC.tabs.every(Boolean)) return;
  try {
    LC.w = new Worker('js/lut-worker.js?v=7');
    const id = LC.id;
    LC.w.onmessage = e => {
      if (e.data.id !== id) return;
      LC.tabs[e.data.j] = e.data.data;
      if (LC.tabs.every(Boolean)) lcStop();
    };
    LC.w.onerror = lcStop;
    LC.w.postMessage({ id, a: LC.a, W: LC.W, ls: LC.ls, have: LC.tabs.map(Boolean) });
  } catch (err) { LC.w = null; }
}
// 形が決まってから作りはじめる（スライダーで形を変えている間は作らない）
function lcPrepare(a, W, lMax) {
  clearTimeout(LC.timer); lcStop();
  LC.id++; LC.a = a; LC.W = W; LC.tabs = null;
  LC.timer = setTimeout(() => { LC.ls = lutGrid(a, lMax); LC.tabs = new Array(LC.ls.length).fill(null); if (!Power.away) lcStart(); }, 400);
}
Power.on({ pause: lcStop, resume: lcStart });

// 位置 l の表（なければ null）
function lcLookup(shape, l, out) {
  if (!LC.tabs || shape.a !== LC.a || shape.W !== LC.W) return null;
  return mixLUT(shape, l, LC.ls, LC.tabs, out);
}
