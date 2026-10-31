// 棋譜 → 手の一覧・部隊の居場所・場面（画面にもブラウザにも依存しない。tools/verify.mjs からも使う）
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
export const UNIT = { p: '歩兵', n: '騎兵', b: '弓兵', r: '盾の重い兵', q: '大部隊', k: '指揮官' };
const SIDE = { w: '白', b: '黒' };

// 初めの局面の駒に名前（id）を付けて、手ごとにどのマスにいるかを追う
function initialUnits(chess) {
  const units = [];
  for (const row of chess.board()) for (const c of row) {
    if (!c) continue;
    const id = c.color + c.type + (c.type === 'k' || c.type === 'q' ? '' : c.square[0]);
    units.push({ id, color: c.color, type: c.type, sq: c.square, out: -1 });
  }
  return units;
}
const clone = us => us.map(u => ({ ...u }));

export function build(game, Chess) {
  const c = new Chess();
  c.loadPgn(game.pgn);
  const moves = c.history({ verbose: true });
  const replay = new Chess();
  let units = initialUnits(replay);
  const states = [clone(units)], plies = [], outCount = { w: 0, b: 0 };
  moves.forEach((m, i) => {
    const ply = i + 1;
    const at = sq => units.find(u => u.sq === sq);
    const mover = at(m.from);
    let victim = null;
    if (m.flags.includes('e')) victim = at(m.to[0] + m.from[1]);   // アンパッサン（いまの局では出ない）
    else if (m.captured) victim = at(m.to);
    if (victim) { victim.sq = null; victim.out = outCount[victim.color]++; }
    mover.sq = m.to;
    if (m.promotion) mover.type = m.promotion;
    let rook = null;
    if (m.flags.includes('k') || m.flags.includes('q')) {   // キャスリング: ルークも動く
      const r = m.from[1], [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
      rook = at(rf + r); rook.sq = rt + r;
    }
    replay.move(m.san);
    const ply_ = {
      ply, san: m.san, color: m.color, piece: m.piece, from: m.from, to: m.to, flags: m.flags,
      captured: m.captured || null, mover: mover.id, victim: victim ? victim.id : null, rook: rook ? rook.id : null,
      castle: rook ? { from: m.flags.includes('k') ? 'h' + m.from[1] : 'a' + m.from[1], to: rook.sq } : null,
      check: replay.inCheck(), mate: replay.isCheckmate(), fen: replay.fen(),
      sac: (game.sac || []).includes(ply), key: (game.key || []).includes(ply),
      num: Math.ceil(ply / 2) + (m.color === 'w' ? '.' : '...'),
    };
    ply_.note = (game.notes || {})[ply] || autoNote(ply_);
    plies.push(ply_);
    states.push(clone(units));
  });
  return { plies, states, scenes: scenes(plies), material: states.map(material) };
}

export function autoNote(p) {
  const who = SIDE[p.color] + 'の' + NAME[p.piece];
  if (p.castle) return SIDE[p.color] + 'はキャスリング。';
  let s = p.captured ? `${who}が ${p.to} の${SIDE[p.color === 'w' ? 'b' : 'w']}の${NAME[p.captured]}を取る。` : `${who}が ${p.to} へ。`;
  if (p.mate) s += 'チェックメイト。'; else if (p.check) s += 'チェック。';
  return s;
}

// 駒の点数（P1・N3・B3・R5・Q9。よく使われる目安）
export function material(units) {
  const m = { w: 0, b: 0 };
  for (const u of units) if (u.sq) m[u.color] += VALUE[u.type];
  return m;
}

// つぎへ1回で進む「場面」: 取る・チェック・キャスリング・見せ場は1手ずつ、静かな手は4手までまとめる
export function scenes(plies) {
  const out = []; let quiet = [];
  const flush = () => { if (quiet.length) out.push([quiet[0], quiet[quiet.length - 1]]); quiet = []; };
  for (const p of plies) {
    const big = p.captured || p.check || p.castle || p.key || p.sac;
    if (big) { flush(); out.push([p.ply, p.ply]); }
    else { quiet.push(p.ply); if (quiet.length >= 4) flush(); }
  }
  flush();
  return out;
}
