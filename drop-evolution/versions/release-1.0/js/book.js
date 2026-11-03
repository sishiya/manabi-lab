// 形の図鑑: 進化の節目の形が「はじめて」現れたら、その1匹（群体ならかたまりごと）の形を写して残す（RELEASE.md 4章の5）
// 節目は画面の側で、いまいる生き物を見て決める（決まりは増やさない）
import { GI } from './sim.js';
import { founderBody, analyze } from './body.js';
import { drawBodyDiagram } from './render.js';

// [かぎ, 見つけ方, 図鑑の名前, 知らせの文, 本物では, 全体のうち何割いたら（たまたま1匹は数秒で起きるもの）, 知らせの文（英語）]。英語の名前と本物では、は下の EN
export const PAGES = [
  ['legs4', o => (o.bp?.n || 0) >= 4, '節が4つ', '節が4つある形が現れた',
    '鞭毛のふえた原生生物はたくさんいる。緑藻のピラミモナスは4本、ジアルジアは8本。', 0, 'a body with 4 segments appeared'],
  ['hunt', o => o.prey > 0, '狩る者', 'ほかの生き物を食べる者（狩る者）が現れた',
    '原生生物を食べる原生生物。ディディニウムはゾウリムシを丸のみにする。', 0, 'a hunter that eats other creatures appeared'],
  ['anch', o => o.anch, '砂にくっつく者', '砂つぶにくっついて、水を流してエサを待つ者がふえてきた',
    '襟鞭毛虫には、柄で物にくっつき、鞭毛で水を流してエサを集めるものがいる。動物にいちばん近い単細胞。', 0.05, 'more creatures stick to sand and wait, pulling water past them for food'],
  ['col4', o => o.colN >= 4, '4細胞の群体', '分かれた子とくっついたまま、4細胞の群体になった',
    '緑藻のシアワセモ（テトラバエナ）は4細胞の群体。ここから多細胞の道が始まる。', 0, 'offspring stayed stuck together in a 4-cell colony'],
  ['sym', o => o.sym > 0, '藍藻を飼う者', '藍藻を消化せずに、体の中で飼う者がふえてきた（葉緑体のはじまり）',
    '藍藻を飼った細胞が、植物や藻の祖先になった（葉緑体）。いまもパウリネラという原生生物が、べつに藍藻を飼いはじめている。', 0.05, 'more creatures keep algae alive inside instead of digesting them (the start of chloroplasts)'],   // 1匹がたまたま飼うのは数秒で起きる
  ['col16', o => o.colN >= 16, '16細胞の群体', '16細胞の群体になった',
    '緑藻のゴニウムは16細胞の平たい群体、パンドリナは16細胞のまり。', 0, 'a 16-cell colony formed'],
  ['fiss3', o => o.g && Math.round(o.g[GI.fiss]) >= 3, '多分裂', '大きく育ってから続けて3回分かれ、一度に8つの子になる者が現れた（多分裂）',
    'クラミドモナスは大きく育ってから続けて分かれ、一度に4〜16の子になる。群体の藻はみなこの分かれ方。', 0, 'a creature grows big, then divides 3 times in a row into 8 young at once (multiple fission)'],
  ['col64', o => o.colN >= 64, '64細胞の群体', '64細胞の大きな群体になった',
    '緑藻のユードリナは32〜64細胞。オオヒゲマワリ（ボルボックス）は数千の細胞で、体の細胞と子になる細胞が分かれている。', 0, 'a big 64-cell colony formed'],
];
// 英語の図鑑の名前と「本物では」（I18N.md: 文の多い表は、同じ鍵に英語を上書き）
const EN = {
  legs4: ['4 segments', 'Many protists have more flagella. The green alga Pyramimonas has 4, and Giardia has 8.'],
  hunt: ['Hunter', 'Protists that eat other protists. Didinium swallows a whole Paramecium.'],
  anch: ['Sand sticker', 'Some choanoflagellates stick to things with a stalk and beat a flagellum to pull food-filled water past them. They are the single cells closest to animals.'],
  col4: ['4-cell colony', 'The green alga Tetrabaena is a 4-cell colony. The road to many-celled life starts here.'],
  sym: ['Algae keeper', 'Cells that kept cyanobacteria became the ancestors of plants and algae (chloroplasts). Today a protist called Paulinella has started keeping them again, on its own.'],
  col16: ['16-cell colony', 'The green alga Gonium is a flat 16-cell colony, and Pandorina is a 16-cell ball.'],
  fiss3: ['Multiple fission', 'Chlamydomonas grows big, then divides again and again into 4 to 16 young at once. All colonial green algae divide this way.'],
  col64: ['64-cell colony', 'The green alga Eudorina has 32 to 64 cells. Volvox has thousands, with body cells and cells that become young split apart.'],
};
if (globalThis.LANG === 'en') for (const p of PAGES) { const e = EN[p[0]]; p[2] = e[0]; p[4] = e[1]; }
export const START = globalThis.LANG === 'en'
  ? { name: 'First two-flagella cell', note: 'Modeled on LECA, the last common ancestor of all eukaryotes (animals, plants, fungi and protists). It has 2 flagella.' }
  : { name: 'はじまりの2本毛', note: 'すべての真核生物（動物・植物・菌・原生生物）の最後の共通祖先 LECA にならった形。鞭毛は2本。' };

// 1匹の形を写す: 群体ならつながりをたどって、かたまりの細胞の位置と節を（多すぎる群体は 160 細胞まで）
const bpCopy = P => ({ n: P.n, tips: P.tips, fwd: P.fwd, frames: P.frames.map(f => ({ pts: f.pts.slice() })) });
export function shapeOf(o) {
  if (!(o.colN > 1) || !o.links?.length) return { bp: bpCopy(o.bp), hue: o.hue };
  const mem = [o], seen = new Set([o]);
  for (let i = 0; i < mem.length && mem.length < 160; i++) for (const q of mem[i].links) if (!seen.has(q) && !q.dead) { seen.add(q); mem.push(q); }
  const cx = mem.reduce((a, q) => a + q.x, 0) / mem.length, cy = mem.reduce((a, q) => a + q.y, 0) / mem.length;
  const idx = new Map(mem.map((q, i) => [q, i])), links = [];
  for (const q of mem) for (const p of q.links) if (idx.has(p) && idx.get(p) > idx.get(q)) links.push(idx.get(q), idx.get(p));
  return {
    hue: o.hue, links,
    cells: mem.map(q => ({ x: q.x - cx, y: q.y - cy, r: q.r, a: q.a, legs: q.bp?.n ? q.bp.frames[0].pts.slice(0, q.bp.n * 4) : null })),
  };
}
export const startShape = () => ({ bp: bpCopy(analyze(founderBody())), hue: 190 });

// 形を描く: 1匹は札と同じ図（先の通る道つき）、群体は細胞の並びとつながり
export function drawShape(cv, s) {
  if (s.bp) { drawBodyDiagram(cv, { bp: s.bp, hue: s.hue }); return; }
  const d = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  const g = cv.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  let ext = 1;
  for (const c of s.cells) ext = Math.max(ext, Math.abs(c.x) + c.r * 2.2, Math.abs(c.y) + c.r * 2.2);
  const k = Math.min(w, h) / 2 / ext * 0.92, X = x => w / 2 + x * k, Y = y => h / 2 + y * k;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(120,220,255,0.35)'; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < s.links.length; i += 2) { const a = s.cells[s.links[i]], b = s.cells[s.links[i + 1]]; g.moveTo(X(a.x), Y(a.y)); g.lineTo(X(b.x), Y(b.y)); }
  g.stroke();
  g.strokeStyle = '#9fe9ff';
  for (const c of s.cells) {
    if (!c.legs) continue;
    const co = Math.cos(c.a), si = Math.sin(c.a);
    g.lineWidth = Math.max(0.8, c.r * k * 0.12);
    g.beginPath();
    for (let i = 0; i < c.legs.length; i += 4) {
      const p = (u, v) => [X(c.x + (u * co - v * si) * c.r), Y(c.y + (u * si + v * co) * c.r)];
      const [ax, ay] = p(c.legs[i], c.legs[i + 1]), [bx, by] = p(c.legs[i + 2], c.legs[i + 3]);
      g.moveTo(ax, ay); g.lineTo(bx, by);
    }
    g.stroke();
  }
  g.fillStyle = '#020c18'; g.lineWidth = 1.2;
  for (const c of s.cells) { g.beginPath(); g.arc(X(c.x), Y(c.y), Math.max(1.5, c.r * k), 0, Math.PI * 2); g.fill(); g.stroke(); }
}
