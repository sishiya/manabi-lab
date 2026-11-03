// 一滴をまるごと書き出す・もとにもどす（進化の節目の一滴を、画面ですぐ見られるように）
// 砂は同じシードから同じ形に作りなおせるので書かない。生き物どうしのつながり（群体・糸・接合の相手）は番号にして、もどすときにつなぎなおす
import { World, orgBox } from './sim.js';
import { analyze, expressBody } from './body.js';

const ORG_REFS = ['links', 'fr', 'col', 'mate'];
// 画面や感じる量のように、次のこまで作りなおせる一時の値は書かない
const SKIP = new Set(['xb', 'bp', 'tp', 'tpN', 'tpX', 'tpY', 'sL', 'sR', 'pL', 'pR', 'dL', 'dR', 'dead']);
const round = (v, k = 10) => Math.round(v * k) / k;
// 数を小数3けたに丸める（入れ子もまとめて）
const r3 = v => typeof v === 'number' ? round(v, 1000) : Array.isArray(v) ? v.map(r3) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r3(x)])) : v;

export function snapshot(w, note = {}) {
  // からだ（節の木）は多くの生き物で同じものを指すので、1つずつにまとめる
  const bodies = [], bi = new Map();
  const body = b => { if (!bi.has(b)) { bi.set(b, bodies.length); bodies.push(b); } return bi.get(b); };
  const orgs = w.orgs.filter(o => !o.dead).map(o => {
    const s = {};
    for (const k in o) {
      if (SKIP.has(k) || ORG_REFS.includes(k)) continue;
      const v = o[k];
      if (k === 'b') s.b = body(v);
      else if (k === 'next') s.next = v ? { g: r3(v.g), b: body(v.b) } : null;
      else s[k] = r3(v);
    }
    s.links = o.links.filter(q => !q.dead).map(q => q.id);
    s.fr = o.fr && !o.fr.dead ? o.fr.id : null;
    s.mate = o.mate && !o.mate.dead ? o.mate.id : null;
    return s;
  });
  // 系統は、生きている系統とその祖先だけ（系統樹に要る分）
  const keepC = new Set();
  for (const o of w.orgs) for (let c = w.clades.get(o.clade); c && !keepC.has(c.id); c = w.clades.get(c.parent)) keepC.add(c.id);
  const clades = [...w.clades.values()].filter(c => keepC.has(c.id)).map(c => r3({ ...c, b: body(c.b) }));
  // 記録は 300 点まで間引き、残した系統の数だけ
  let hist = w.history, every = w.histEvery;
  while (hist.length > 300) { hist = hist.filter((_, i) => i % 2 === 0); every *= 2; }
  hist = hist.map(h => r3({ ...h, counts: Object.fromEntries(Object.entries(h.counts).filter(([id]) => keepC.has(+id))) }));
  const live = [];
  for (let i = 0; i < w.fn; i++) if (w.fage[i] < 1e8) live.push(round(w.fx[i]), round(w.fy[i]), round(w.fage[i]), round(w.fh[i], 100));
  return {
    v: 1, note,
    opt: { seed: w.seed, size: w.size, sand: w.sand, foodRate: w.foodRate, light: w.light, flow: w.flow },
    t: w.t, stepN: w.stepN, hue0: w.hue0, nextId: w.nextId, nextClade: w.nextClade,
    histEvery: every, histAcc: w.histAcc, stats: r3(w.stats), events: w.events.slice(-200).map(r3), history: hist,
    fa: w.fa, nut: Array.from(w.nut, v => round(v, 1000)), algae: live,
    poos: r3(w.poos), pieces: r3(w.pieces), bodies: r3(bodies), clades, orgs,
    extraGrains: w.extraGrains || [], tampered: !!w.tampered,   // あとから置いた砂つぶ・手を加えた印
  };
}

export function restore(d) {
  const w = new World({ ...d.opt, founders: 0, initFood: 0 });
  for (const [x, y, R] of d.extraGrains || []) w.addGrain(x, y, R);   // 知らせは下で保存した分に置きかわる
  w.tampered = !!d.tampered;
  for (const k of ['t', 'stepN', 'hue0', 'nextId', 'nextClade', 'histEvery', 'histAcc', 'stats', 'events', 'history', 'fa', 'poos', 'pieces']) w[k] = d[k];
  w.nut.set(d.nut);
  w.clades = new Map(d.clades.map(c => [c.id, { ...c, b: d.bodies[c.b] }]));
  for (let i = 0; i < d.algae.length; i += 4) {
    const k = w.fn++;
    w.fx[k] = d.algae[i]; w.fy[k] = d.algae[i + 1]; w.fage[k] = d.algae[i + 2]; w.fh[k] = d.algae[i + 3];
  }
  const byId = new Map();
  w.orgs = d.orgs.map(s => {
    const o = Object.assign(orgBox(), s, { b: d.bodies[s.b], next: s.next ? { g: s.next.g, b: d.bodies[s.next.b] } : null });   // 書かなかった一時の値は 0 から（次の感じるこまで作りなおす）。入れ物の形は sim.js の orgBox にそろえる
    o.xb = expressBody(o.b, o.inner); o.bp = analyze(o.xb);
    byId.set(o.id, o);
    return o;
  });
  for (const o of w.orgs) {
    o.links = o.links.map(id => byId.get(id)).filter(Boolean);
    o.fr = byId.get(o.fr) || null;
    o.mate = byId.get(o.mate) || null;
    o.col = o;     // 群体のまとめ役は、次のこまで数えなおす
  }
  w.colonies();
  return w;
}
