// いのちの系統樹 — 開いている生きものが、シルエット（PhyloPic）になって名前の右であそぶ
//   ・開いた枝の先（閉じている名前）の右に「ぽこっ」と出てくる。閉じると親へ「きゅぽん」と吸いこまれる
//   ・名前の右の空いている所だけを動く（文字にかぶらない）。押すと詳細
//   ・動き方はグループごとの演出（本物の歩き方ではない）。シルエットは条件の合うものだけ、作者・条件は詳細に
'use strict';
const C = (() => {
  const MAX = 18;            // いちどに出す数（多すぎると文字が読みにくい。v018 で 14 → 18）
  const SIZE = 25;           // 長いほうの大きさ（世界の単位）
  const YARD = 64;           // 名前の右で動ける幅
  const INKC = '#3c4436';
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let on = true;
  const byName = new Map();  // 学名 → Promise<シルエット | null>
  const live = new Map();    // ふし → いきもの
  const imgs = new Map();    // src → { img, tinted, ok }

  // ---------- シルエットを選ぶ: そのまとまり → なければ近い祖先（5段まで） ----------
  function lookup(name) {
    if (!byName.has(name)) byName.set(name, API.phylopic(name).catch(() => null));
    return byName.get(name);
  }
  async function silhouette(n) {
    let m = n, hops = 0;
    while (m && hops < 6) {
      if (m.name && m.rank !== 'root') {
        const s = await lookup(m.name);
        if (s) return Object.assign({ from: m === n ? '' : (m.ja || m.name) }, s);
        hops++;
      }
      m = m.parent;
    }
    return null;
  }
  // 絵を読み、墨の色に染めた絵を作っておく（黒のままだと紙の上で強すぎる）
  function image(src) {
    if (imgs.has(src)) return imgs.get(src);
    const rec = { ok: false };
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = 96 / Math.max(img.width, img.height);
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = INKC; x.fillRect(0, 0, c.width, c.height);
      rec.tinted = c; rec.ok = true;
    };
    img.src = src;
    rec.img = img;
    imgs.set(src, rec);
    return rec;
  }

  // ---------- 動き方（演出）: 祖先の名前で決める ----------
  const KIND = [
    ['fly', /^(Aves|Chiroptera|Pterosauria|Odonata|Lepidoptera)$/],
    ['swim', /^(Actinopterygii|Chondrichthyes|Myxini|Petromyzontida|Cetacea|Sirenia|Cephalopoda|Cnidaria|Ctenophora|Echinodermata|Porifera|Actinistia|Dipnoi)$/],
    ['slither', /^(Serpentes|Annelida|Nematoda|Platyhelminthes|Nemertea)$/],
    ['hop', /^(Anura|Lagomorpha|Macropodidae|Orthoptera|Arachnida|Insecta|Collembola)$/],
    ['sway', /^(Plantae|Chloroplastida|Archaeplastida|Fungi|Rhodophyta|Embryophyta|Tracheophyta|Bryophyta)$/],
    ['drift', /^(Bacteria|Archaea|SAR|Chromista|Protozoa|Amoebozoa|Excavata|Discoba|Metamonada)$/],
  ];
  function kindOf(n) {
    for (let m = n; m; m = m.parent) for (const [k, re] of KIND) if (re.test(m.name)) return k;
    return 'walk';
  }

  // ---------- 出す・消す ----------
  // 出すのは、見えていて閉じている名前（開いた枝の先）。画面の中で、上から MAX まで
  function wanted() {
    if (!on) return [];
    if (V.is3d) return V3.shown.filter(n => !n.more && n.rank !== 'root' && !V.kidsOf(n).length).slice(0, MAX);   // 3D: 名前の札を出したもの
    const [W, H] = V.size, k = V.cam.k;
    if (k < 0.35) return [];   // 小さすぎるときは出さない（形を見わたすとき）
    // シルエットのいる場所（名前の右、はば約 90）が画面に少しでもかかっていれば、出しておく（早く消えすぎないように）
    const inView = n => {
      const sx = (n.x + n.lw + 20) * k + V.cam.x, sy = n.y * k + V.cam.y;
      return sx + 90 * k > -30 && sx < W + 30 && sy > -40 && sy < H + 40;
    };
    const ok = n => n.name && !n.more && n.rank !== 'root' && V.isVis(n) && !V.kidsOf(n).length && inView(n);
    // いまいるものを先に残し（動かすたびに入れかわらないように）、あいた分を上から足す
    const out = [];
    for (const n of live.keys()) if (out.length < MAX && ok(n)) out.push(n);
    const y0 = (-V.cam.y - 40) / k, y1 = (V.size[1] - V.cam.y + 40) / k;
    for (const n of V.vis) {
      if (out.length >= MAX) break;
      if (n.y < y0 || n.y > y1 || live.has(n) || !ok(n)) continue;
      out.push(n);
    }
    return out;
  }
  function spawn(n) {
    const c = { n, sil: null, kind: kindOf(n), t: 0, born: -1, dying: -1, x: 0, y: 0, dir: Math.random() < 0.5 ? -1 : 1,
      speed: 8 + Math.random() * 8, pause: Math.random() * 2, phase: Math.random() * 10, hopT: 0 };
    c.x = YARD * (0.2 + Math.random() * 0.6);
    silhouette(n).then(s => { c.sil = s; if (s) { c.rec = image(s.src); } });
    live.set(n, c);
  }
  // 吸いこまれる先: 見えていればそのふし、見えていなければ見えている祖先の点
  function anchorOf(n) {
    if (V.isVis(n)) return [n.ax, n.ay];
    let a = n.parent; while (a && !V.isVis(a)) a = a.parent;
    return a ? [a.ax, a.ay] : null;
  }

  // ---------- 1コマ ----------
  function step(dt) {
    const want = new Set(wanted());
    for (const n of want) if (!live.has(n)) spawn(n);
    for (const [n, c] of live) {
      // 見えなくなった: 枝を閉じた（ふしが消えた）ときは親へきゅぽん、画面の外や名前が出なくなっただけのときは、その場でふわっと消える
      if (!want.has(n) && c.dying < 0) {
        if (V.isVis(n)) c.fade = Math.min(1, (c.fade || 0) + dt / 0.35);
        else { c.dying = 0; c.from = basePos(c); }
      } else if (want.has(n) && c.fade > 0) c.fade = Math.max(0, c.fade - dt / 0.25);   // また見えたら、もどる
      if (c.fade >= 1) { live.delete(n); continue; }
      c.t += dt;
      if (c.born < 0 && c.rec && c.rec.ok) c.born = 0;
      if (c.born >= 0 && c.born < 1) c.born = Math.min(1, c.born + dt / 0.45);
      if (c.dying >= 0) { c.dying += dt / 0.3; if (c.dying >= 1 || c.born < 0) live.delete(n); continue; }
      if (c.born < 0 || reduce) continue;
      move(c, dt);
    }
    return live.size > 0;
  }
  function move(c, dt) {
    if (c.kind === 'sway') return;   // 植物・キノコは歩かない（その場でゆれる）
    if (c.pause > 0) { c.pause -= dt; return; }
    const sp = c.kind === 'fly' ? c.speed * 2.2 : c.kind === 'slither' ? c.speed * 0.5 : c.kind === 'drift' ? c.speed * 0.35 : c.speed;
    c.x += c.dir * sp * dt;
    if (c.x < 2 || c.x > YARD) { c.dir *= -1; c.x = Math.max(2, Math.min(YARD, c.x)); }
    if (Math.random() < dt * (c.kind === 'walk' ? 0.35 : 0.15)) c.pause = 0.6 + Math.random() * 1.6;
    if (Math.random() < dt * 0.12) c.dir *= -1;
    if (c.kind === 'hop' && c.hopT <= 0 && Math.random() < dt * 1.2) c.hopT = 0.38;
    if (c.hopT > 0) c.hopT -= dt;
  }
  // 名前の右の、動ける場所の左はし（地面の高さ）
  function basePos(c) {
    const n = c.n;
    return [n.ax + n.lw + 22, n.ay + 1];   // 「先がある線」（点の高さ）の上に立つ
  }

  // ---------- 描く（V.draw の中、枝のあと・名前の前。世界の座標） ----------
  const easeBack = u => { const s = 1.4; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); };
  // 動き方ごとの上下・かたむき・大きさ（演出）。居場所の地面からのずれで返す
  function pose(c) {
    let dx = 0, dy = 0, sc = 1, rot = 0, alpha = 0.88;
    const t = c.t + c.phase;
    if (c.kind === 'walk') dy -= Math.abs(Math.sin(t * 9)) * (c.pause > 0 ? 0 : 1.4);
    if (c.kind === 'fly') { dy -= 9 + Math.sin(t * 2.2) * 4; sc = 1 + Math.sin(t * 16) * 0.05; }
    if (c.kind === 'swim') { dy -= 4 + Math.sin(t * 1.8) * 3; rot = Math.sin(t * 1.8 + 1) * 0.12; }
    if (c.kind === 'slither') rot = Math.sin(t * 5) * 0.08;
    if (c.kind === 'hop' && c.hopT > 0) dy -= Math.sin((1 - c.hopT / 0.38) * Math.PI) * 9;
    if (c.kind === 'sway') rot = Math.sin(t * 1.3) * 0.06;
    if (c.kind === 'drift') { dy -= 3 + Math.sin(t * 1.1) * 3; dx += Math.sin(t * 2.7) * 1.2; }
    // ぽこっ: 居場所で、地面から少し大きくなってもどる（名前の上は通らない）
    if (c.born < 1) {
      const u = c.born, e = easeBack(u);
      dy += (1 - Math.min(1, u * 1.4)) * 5;
      sc *= Math.max(0, e); alpha *= Math.min(1, u * 3);
    }
    return { dx, dy, sc, rot, alpha };
  }
  function put(g, c, im, x, y, w, h, sc, rot, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y); g.rotate(rot);
    g.scale(sc * (c.dir < 0 && c.kind !== 'sway' ? -1 : 1), sc);
    g.drawImage(im, -w / 2, -h, w, h);   // 足もとが地面
    g.restore();
  }
  function size(im) { const ar = im.width / im.height; return ar > 1 ? [SIZE, SIZE / ar] : [SIZE * ar, SIZE]; }
  // 2D（V.draw の中、世界の座標）
  function draw(g) {
    for (const [n, c] of live) {
      if (!c.rec || !c.rec.ok || c.born < 0) continue;
      const im = c.rec.tinted, [w, h] = size(im);
      const [bx, by] = c.dying >= 0 ? c.from : basePos(c);
      const q = pose(c);
      let x = bx + c.x + q.dx, y = by + q.dy, sc = q.sc, alpha = q.alpha;
      // きゅぽん: 祖先の点へ、加速しながら小さく
      if (c.dying >= 0) {
        const tgt = anchorOf(n) || [x, y], e = c.dying * c.dying * c.dying;
        x += (tgt[0] - x) * e; y += (tgt[1] - y) * e; sc *= 1 - e * 0.95; alpha *= 1 - c.dying * 0.5;
      }
      const fd = c.fade || 0;
      put(g, c, im, x, y, w, h, sc * (1 - 0.25 * fd), q.rot, alpha * (1 - fd) * (n.alpha === undefined ? 1 : n.alpha));
      c.hit = fd > 0.5 ? null : [x - w / 2 * sc, y - h * sc, w * sc, h * sc];
      c.hit3 = null;
    }
  }
  // 3D（画面の座標）: placeOf(ふし) → 名前の札の右はし { x, y, s（大きさの倍率） } か null
  function draw3d(g, placeOf) {
    // 3D: 名前の札の右に。札が出なくなったとき（重なり）は、さっきの場所でふわっと消える
    const now = performance.now();
    for (const [n, c] of live) {
      c.hit = null; c.hit3 = null;
      if (!c.rec || !c.rec.ok || c.born < 0 || c.dying >= 0) continue;
      const dt = Math.min(0.05, (now - (c.t3 || now)) / 1000) || 0.016; c.t3 = now;
      const pl = placeOf(n);
      if (pl) c.pl = pl;
      c.a3 = (c.a3 === undefined ? 0 : c.a3) + ((pl ? 1 : 0) - (c.a3 || 0)) * Math.min(1, dt * 10);
      if (!c.pl || c.a3 < 0.02) continue;
      const P3 = c.pl, im = c.rec.tinted, [w, h] = size(im), q = pose(c), fd = c.fade || 0;
      const x = P3.x + (c.x + q.dx) * P3.s, y = P3.y + q.dy * P3.s, sc = q.sc * P3.s * (1 - 0.25 * fd);
      put(g, c, im, x, y, w, h, sc, q.rot, q.alpha * c.a3 * (1 - fd));
      if (pl && c.a3 > 0.5) c.hit3 = [x - w / 2 * sc, y - h * sc, w * sc, h * sc];
    }
  }
  function hit3(px, py) {
    for (const [n, c] of live) {
      if (!c.hit3) continue;
      const [x, y, w, h] = c.hit3;
      if (px >= x - 4 && px <= x + w + 4 && py >= y - 4 && py <= y + h + 4) return n;
    }
    return null;
  }
  // 押したいきもの → そのふし
  function hit(wx, wy) {
    for (const [n, c] of live) {
      if (!c.hit || c.dying >= 0) continue;
      const [x, y, w, h] = c.hit;
      if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 4 && wy <= y + h + 4) return n;
    }
    return null;
  }

  // 自分のコマ送り（いきものがいる間だけ）
  let raf = 0, last = 0;
  function kick() {
    if (raf) return;
    last = performance.now();
    let frame = 0, cost = 0;
    raf = requestAnimationFrame(function loop(t) {
      const more = step(Math.min(0.05, (t - last) / 1000)); last = t;
      // いきもののための描きなおし。木全体を描くのに時間がかかるとき（たくさん開いたとき）は回数を減らす
      //   8ms をこえたら2コマに1回、16ms をこえたら3コマに1回（ふだんは毎コマ。ほかの動き・アニメは自分で描くので変わらない）
      const every = cost > 16 ? 3 : cost > 8 ? 2 : 1;
      if (frame++ % every === 0) { const s = performance.now(); V.draw(); cost = cost * 0.8 + (performance.now() - s) * 0.2; }
      raf = more ? requestAnimationFrame(loop) : 0;
    });
  }
  return {
    draw, draw3d, hit, hit3, step, kick, silhouette,
    get on() { return on; }, set on(v) { on = !!v; kick(); },
    get count() { return live.size; },
  };
})();
