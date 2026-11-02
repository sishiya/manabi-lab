// 到達点の生き物を手で組んで一滴に入れ、いまの決まりで生きのびるか・祖先に勝つかを見る（試験だけ。本番の一滴には入れない）
// node drop-evolution/tools/endpoint-check.mjs <到達点> [alone|race] [秒=1800] [シード=1] [光=0.6] [砂=1]
//   alone: 到達点だけ 150 匹で始める。race: はじまりの生き物 75 と到達点 75 で始める
// 到達点は、いまの遺伝子で組めるものだけ（PLAN.md「到達点」の表。組めないものは足りない部品を表に書く）
import { World, GI, founderGenome, eSplit, W, H } from '../js/sim.js';
import { founderBody } from '../js/body.js';

const set = (g, o) => { for (const k in o) g[GI[k]] = o[k]; return g; };
export const ENDPOINTS = {
  // オオヒゲマワリ: 藍藻を飼う細胞が百数十の球になって泳ぐ。外の体細胞は打つが分かれず、中の細胞が子になる。仲間と分けあう
  volvox: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 7, outDiv: 0, inBeat: 0, share: 1, mix: 0.3 }),
  // 海綿のはじまり: 砂つぶに柄でつき、群体の細胞みなが毛を打って水を流し、流れてくるエサを食べる。外の細胞は分かれず、中の細胞が子になる
  // 多分裂つき（生殖細胞が 7 回続けて分かれ、一度に 128 細胞の子の群体に）
  volvoxF: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 7, fiss: 7, outDiv: 0, inBeat: 0, share: 1, mix: 0.3 }),
  sponge: () => set(founderGenome(), { attach: 1, stick: 1, colMax: 6, outDiv: 0, inBeat: 1, share: 1, mouth: 0 }),
  // 動いて狩る群体（板形動物の手前）: 群体ごと泳いでエサと獲物へ向かい、合図で向きをそろえる。外の細胞は分かれない
  hunter: () => set(founderGenome(), { stick: 1, colMax: 5, outDiv: 0, inBeat: 0, share: 1, signal: 1, food: 1.5, small: 1, kinesis: 0.5 }),
  // くっつくだけの群体（8 細胞まで）。捕食者への強さをくらべる用（Boraas 1998・Herron 2019 の実験にならう）
  col8: () => set(founderGenome(), { stick: 1, colMax: 3 }),
  // 糸状の緑藻（シオグサ・アオミドロのなかま）: 藍藻を飼う細胞が、体の軸の前へ分かれて一列の糸になる（32 細胞まで）
  filament: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 5, plane: 1 }),
  // 立つ藻のはじまり: 糸が砂つぶにつき、上（前）へのびる
  stand: () => set(founderGenome(), { keep: 1, stick: 1, colMax: 5, plane: 1, attach: 1 }),
  // 板形動物の手前: 群体で相手を囲み、体の外で消化する（細胞より大きな相手を食べる）。小さい相手へ向かい、仲間と分けあう
  placo: () => set(founderGenome(), { stick: 1, colMax: 5, exDig: 1, small: 1, share: 1 }),
  // くらべ: 同じで、外で消化しない
  placo0: () => set(founderGenome(), { stick: 1, colMax: 5, exDig: 0, small: 1, share: 1 }),
  founder: () => founderGenome(),
};

const [name = 'volvox', mode = 'alone'] = process.argv.slice(2);
const secs = +(process.argv[4] || 1800), seed = +(process.argv[5] || 1), light = +(process.argv[6] ?? 0.6), sand = +(process.argv[7] ?? 1);
const w = new World({ seed, light, sand, foodRate: +(process.env.FOOD || 1), flow: +(process.env.FLOW || 1), founders: mode === 'race' ? 75 : 0 });   // FOOD=3 で海の栄養を3倍
// OV='outDiv=1,colMax=5' で遺伝子を上書き（壁の原因をさがす用）
const g0 = set(ENDPOINTS[name](), Object.fromEntries((process.env.OV || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const b0 = founderBody(), c0 = w.newClade(g0, 0, b0);
for (let i = 0; i < (mode === 'race' ? 75 : 150); i++) {
  const g = w.mutate(g0, 0.5);
  let x, y; do { x = w.r() * W; y = w.r() * H; } while (w.inSand(x, y, 12));
  w.addOrg(g, c0.id, x, y, eSplit(g, b0) * (0.3 + w.r() * 0.4), 0, b0);
}
// PRED=30 で、獲物を追う単細胞（半径 16 µm・小さい相手へ 2）を入れる（本物の実験の捕食者のかわり）
if (+process.env.PRED) {
  const gp = set(founderGenome(), { size: 16, small: 2, food: 0.3 }), cp = w.newClade(gp, 0, b0);
  for (let i = 0; i < +process.env.PRED; i++) w.addOrg(w.mutate(gp, 0.5), cp.id, w.r() * W, w.r() * H, eSplit(gp, b0) * 0.6, 0, b0);
}
const root = id => { let c = w.clades.get(id); while (c && c.parent) { if (c.id === c0.id) return true; c = w.clades.get(c.parent); } return c?.id === c0.id; };
const t0 = Date.now();
const fmtCols = os => { const m = new Map(); for (const o of os) if (o.colN > 1) m.set(o.col, o.colN); const v = [...m.values()]; return v.length ? `群体${v.length} 最大${Math.max(...v)}` : '群体0'; };
let line = `${name} ${mode} 捕食者${+process.env.PRED || 0} seed${seed} 光${light} 砂${sand}:`;
for (let s = 300; s <= secs; s += 300) {
  while (w.t < s) w.step();
  const mine = w.orgs.filter(o => root(o.clade)), keep = mine.filter(o => o.sym > 0).length;
  line += ` ${s / 60}分:${mine.length}/${w.orgs.length}(${fmtCols(mine)} 飼う${keep} 着${mine.filter(o => o.anch || o.colAnch).length} 栄養${(w.nut.reduce((a, b) => a + b, 0) / w.nut.length).toFixed(2)} 母${Math.max(0, ...mine.map(o => o.e / o.eS)).toFixed(1)} 狩る${w.orgs.filter(o => o.g[GI.small] > 0.5).length} 群体で狩った${mine.filter(o => o.colN > 1).reduce((a, o) => a + o.prey, 0)})`;
}
const mine = w.orgs.filter(o => root(o.clade));
const avg = k => (mine.reduce((a, o) => a + o.g[GI[k]], 0) / Math.max(1, mine.length)).toFixed(2);
console.log(line + `\n  終わりの遺伝子平均: stick ${avg('stick')} colMax ${avg('colMax')} keep ${avg('keep')} attach ${avg('attach')} outDiv ${avg('outDiv')} share ${avg('share')}  ちぎれ${w.stats.breaks || 0} 藍藻${w.fn} 計算${((Date.now() - t0) / 1000).toFixed(0)}s`);
