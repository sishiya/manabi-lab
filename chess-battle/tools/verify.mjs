// 棋譜の確かめ（node chess-battle/tools/verify.mjs）: 手数・詰み・特別な手・最後の局面の駒が、games.js の expect と合うか
import { Chess } from '../../lib/chess.js@1.4.0/dist/esm/chess.js';
import { GAMES } from '../js/games.js';
import { build } from '../js/record.js';

let ng = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK ' : 'NG ') + msg); if (!cond) ng++; };
for (const g of GAMES) {
  console.log(`— ${g.title}`);
  const r = build(g, Chess), e = g.expect, last = r.plies[r.plies.length - 1];
  ok(r.plies.length === e.plies, `手数 ${r.plies.length}（期待 ${e.plies}）`);
  ok(last.mate === e.mate, `最後の手で詰み: ${last.mate}`);
  const special = {};
  for (const p of r.plies) for (const f of p.flags) if ('kqep'.includes(f)) special[p.ply] = (special[p.ply] || '') + f;
  ok(JSON.stringify(special) === JSON.stringify(e.special), `特別な手 ${JSON.stringify(special)}（期待 ${JSON.stringify(e.special)}）`);
  const fin = new Chess(last.fen);
  for (const [sq, want] of Object.entries(e.squares)) {
    const p = fin.get(sq), got = p ? p.color + p.type : '-';
    ok(got === want, `${sq} = ${got}（期待 ${want}）`);
  }
  // 部隊の居場所の追跡が chess.js の局面と同じか（全手）
  let track = true;
  r.plies.forEach((p, i) => {
    const b = new Chess(p.fen);
    for (const u of r.states[i + 1]) if (u.sq) { const q = b.get(u.sq); if (!q || q.color !== u.color || q.type !== u.type) track = false; }
    const n = r.states[i + 1].filter(u => u.sq).length, m = b.board().flat().filter(Boolean).length;
    if (n !== m) track = false;
  });
  ok(track, '部隊の居場所が全手で局面と一致');
  ok(r.scenes[r.scenes.length - 1][1] === r.plies.length && r.scenes.every((s, i) => i === 0 ? s[0] === 1 : s[0] === r.scenes[i - 1][1] + 1), `場面 ${r.scenes.length} 個がすき間なくつながる`);
  const m = r.material[r.material.length - 1];
  console.log(`   最後の駒の点数 白 ${m.w}・黒 ${m.b}`);
}
console.log(ng ? `NG ${ng} 件` : 'すべて OK');
process.exit(ng ? 1 : 0);
