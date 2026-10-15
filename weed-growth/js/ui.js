// 雑草がふえるまで — 画面の部品（速さ・道具・数字・いまのようす・時間のグラフ・できごと・説明・寄って見る）
'use strict';
const $ = id => document.getElementById(id);
const SPEEDS = [['1日<span class="ps">/秒</span>', 1], ['1週<span class="ps">/秒</span>', 7], ['1<span class="ps">か</span>月<span class="ps">/秒</span>', 30], ['1年<span class="ps">/秒</span>', 365]];   // 狭い画面では「/秒」を隠す
const UI = { speed: 7, playing: true, lastRo: 0, lastTl: 0 };

function fmtNumS(n) { n = Math.round(n); return n >= 100000 ? (n / 10000).toFixed(n >= 1e6 ? 0 : 1) + '万' : n.toLocaleString('ja-JP'); }
function fmtDate(day) { const d = dateOf(day); return `${yearOf(day)}年目 ${d.m}月${d.d}日`; }

function seg(el, items, cur, on) {
  el.innerHTML = '';
  for (const [label, v] of items) {
    const b = document.createElement('button'); b.innerHTML = label; b.setAttribute('aria-pressed', String(v === cur));
    b.onclick = () => { for (const c of el.children) c.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); on(v); };
    el.appendChild(b);
  }
}
function setPressed(el, v) { el.setAttribute('aria-pressed', String(!!v)); }

function buildUI() {
  seg($('segSpeed'), SPEEDS, UI.speed, v => { UI.speed = v; });
  setTool(TOOL);
  for (const b of $('menu').querySelectorAll('.mcard[data-sp]')) b.onclick = () => chooseSeed(b.dataset.sp);
  $('scenNote').textContent = SCENARIOS[S.scen].note;
  $('play').onclick = () => { UI.playing = !UI.playing; syncPlay(); };
  $('tgSnd').onclick = () => { SND.on = !SND.on; setPressed($('tgSnd'), SND.on); };
  $('zIn').onclick = () => zoomAt(VIEW.w / 2, VIEW.h / 2, 2);
  $('zOut').onclick = () => zoomAt(VIEW.w / 2, VIEW.h / 2, 0.5);
  $('zAll').onclick = () => resetView();
  $('tgXray').onclick = () => { S.opts.xray = !S.opts.xray; setPressed($('tgXray'), S.opts.xray); applyKindUI(); };
  $('tgNoDorm').onclick = () => {
    S.opts.noDorm = !S.opts.noDorm; setPressed($('tgNoDorm'), S.opts.noDorm);
    if (S.opts.noDorm) { for (let i = 0; i < NX * NZ; i++) { S.SN[i] += S.SD[i]; S.SD[i] = 0; } }
    logEvent(fmtDate(S.day).replace(/^\S+ /, '') + (S.opts.noDorm ? ' 実験: 休眠をなくした（土の中のタネが全部目ざめた）' : ' 実験: 休眠をもとにもどした（これから落ちるタネは眠る）'), 'act');
  };
  $('tgAutoPull').onclick = () => {
    S.opts.autoPull = !S.opts.autoPull; setPressed($('tgAutoPull'), S.opts.autoPull);
    logEvent(fmtDate(S.day).replace(/^\S+ /, '') + ' 実験: ' + kindUI().autoPull + (S.opts.autoPull ? '（はじめた）' : '（やめた）'), 'act');
  };
  const tl = $('tl');
  tl.addEventListener('click', e => {
    const r = tl.getBoundingClientRect(), d = (e.clientX - r.left - TLM.l) / (r.width - TLM.l - TLM.r) * tlDays();
    if (d < S.day - 0.5) { restoreSnap(snapIndexAt(Math.max(0, d))); UI.lastTl = 0; updateReadout(true); }
  });
}
// はじめかた: まっさらな土なら「なんのタネを落とす？」を出して止めておく（タネを落とすと動きだす）
function startScenario(v) {
  restartSim(v); $('scenNote').textContent = SCENARIOS[v].note; UI.lastTl = 0;
  const empty = !!SCENARIOS[v].empty;
  $('menu').hidden = !empty;
  if (empty) { UI.playing = false; resetView(); kindUI().start(); }
  else { UI.playing = true; resetView(); if (TOOL === 'seed') setTool('look'); }
  syncPlay(); updateReadout(true);
}
// メニューで種をえらぶ: 仲間（タネ／竹）がかわるときは世界の大きさもかえて、まっさらな土から
function chooseSeed(sp) {
  const kind0 = SP.kind; SP = SPECIES[sp];
  if (SP.kind !== kind0) {
    setWorld(SP.world); restartSim(SP.kind === 'clone' ? 'bEmpty' : 'empty');
    UI.playing = false; syncPlay(); resetView(); kindUI().start(); UI.lastTl = 0;
    $('scenNote').textContent = SCENARIOS[S.scen].note;
  }
  $('menu').hidden = true; TOOL = 'seed'; applyKindUI(); updateReadout(true);
}
function setTool(v) {
  TOOL = v; cv.classList.toggle('tool', v !== 'look');
  seg($('segTool'), kindUI().tools, v, t => { TOOL = t; cv.classList.toggle('tool', t !== 'look'); });
}
function syncPlay() { $('play').textContent = UI.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-label', UI.playing ? '止める' : '進める'); }

// ---------- 数字といまのようす ----------
function updateReadout(force) {
  const now = performance.now(); if (!force && now - UI.lastRo < 250) return; UI.lastRo = now;
  const c = counts(), T = tempAt(S.day), A = BED_W * BED_D;
  $('clock').textContent = fmtDate(S.day);
  $('temp').textContent = T.toFixed(0) + '℃';
  if (SP.kind === 'clone') { bReadout(c); $('now').innerHTML = bNowText(c); renderLog(); return; }
  $('roUp').textContent = c.up.toLocaleString('ja-JP');
  $('roHeads').textContent = '穂 ' + c.heads.toLocaleString('ja-JP') + (c.under ? '・土の中の芽 ' + c.under : '');
  $('roBank').textContent = fmtNumS(c.perM2);
  $('roDorm').textContent = c.bank ? '眠る ' + Math.round(c.dorm / c.bank * 100) + '%' : '眠る –';
  $('roShed').textContent = fmtNumS(S.yr.shed / A);
  $('roOnPlant').textContent = '穂に ' + fmtNumS(c.onPlant / A);
  $('now').innerHTML = nowText(c, T);
  renderLog();
}
function nowText(c, T) {
  const d = dateOf(S.day), A = BED_W * BED_D, out = [];
  const bank = `土の中にはタネが <b>1m² に ${fmtNumS(c.perM2)} 粒</b>（花だん全体で ${c.bank.toLocaleString('ja-JP')} 粒）`;
  if (S.opts.autoPull) out.push('実験中: 穂が出た株は、その日のうちに抜いている。');
  if (c.up === 0 && c.under === 0) {
    out.push(T < SP.tb ? `寒くて（${T.toFixed(0)}℃）タネは芽を出せない。` : 'いまは地上に株がない。');
    out.push(bank + (c.dorm ? `。そのうち ${Math.round(c.dorm / Math.max(1, c.bank) * 100)}% は眠っている（休眠）。眠っているタネは、冬の寒さで少しずつ目ざめる。` : '。'));
    if (SCENARIOS[S.scen].empty && S.tot.dropped && !S.tot.germ && c.bank) {
      let top = 0; for (let x = 0; x < NX; x++) top += S.SD[x] + S.SN[x];
      if (top === c.bank) out.push('落としたタネは地面の表面にある。表面は乾きやすくて芽を出しにくく、虫や鳥に食べられることもある（推定）。1粒だとなかなか出ない。何粒か落とすか、「耕す」で土にまぜると出やすい。');
    }
    if (SCENARIOS[S.scen].empty && !S.tot.dropped) out.push('まだタネがない。上の「タネ」をえらんで、花だんの上をタップ（なぞる）してタネを落としてみよう。');
    if (!c.bank && S.tot.shed > 0) out.push('タネがなくなった。もう生えてこない。');
  } else {
    if (c.under) out.push(`土の中で <b>${c.under} 本</b>の芽が地上へのびている。`);
    if (c.up) {
      const young = c.up - c.heads;
      out.push(`地上に <b>${c.up.toLocaleString('ja-JP')} 本</b>` + (c.heads ? `（穂が出たもの ${c.heads.toLocaleString('ja-JP')} 本）` : '') + '。' +
        (young > c.heads * 3 && c.up > 50 ? 'こみあうと、背の低い芽は光が足りなくて枯れていく。' : ''));
    }
    if (c.onPlant) out.push(`穂には育っているタネが 1m² あたり ${fmtNumS(c.onPlant / A)} 粒。`);
    if (S.yr.shed) out.push(`今年はもう <b>1m² に ${fmtNumS(S.yr.shed / A)} 粒</b>花だんに落ちた（タネは株のまわりに落ちる。通路に落ちた分は数えない）。`);
    out.push(bank + '。');
  }
  if (d.m >= 3 && d.m <= 5 && c.bank && c.up < 5 && T > SP.tb) out.push('暖かくなってきた。浅いところ（2〜15mm）の目ざめたタネから芽を出す。');
  return out.join(' ');
}
function renderLog() {
  const el = $('log'), n = S.ev.length;
  if (el._n === n) return; el._n = n;
  el.innerHTML = '';
  for (let i = n - 1; i >= Math.max(0, n - 40); i--) {
    const e = S.ev[i], li = document.createElement('li');
    li.className = e.kind; li.textContent = (e.kind === 'act' || e.kind === 'start' ? `${yearOf(e.day)}年目 ` : fmtDate(e.day) + ' ') + e.text.replace(/（\d+年目）/, '');
    el.appendChild(li);
  }
}

// ---------- 時間のグラフ（たては対数） ----------
const TLM = { l: 34, r: 8, t: 8, b: 20 };
function tlDays() { return Math.min(MAX_DAYS, Math.max(3 * 365, Math.ceil((S.day + 30) / 365) * 365)); }
function drawTimeline(force) {
  const now = performance.now(); if (!force && now - UI.lastTl < 400) return; UI.lastTl = now;
  const c = $('tl'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, Hh = r.height, pw = W - TLM.l - TLM.r, ph = Hh - TLM.t - TLM.b, D = tlDays();
  x.clearRect(0, 0, W, Hh);
  const lmax = 6, Yv = v => TLM.t + ph * (1 - Math.log10(Math.max(1, v)) / lmax), Xd = d => TLM.l + pw * d / D;
  x.font = '10px ' + getComputedStyle(document.body).fontFamily; x.fillStyle = '#6f8494'; x.strokeStyle = 'rgba(190,215,235,.12)'; x.lineWidth = 1;
  for (let k = 0; k <= lmax; k += 1) { const yy = Yv(10 ** k); x.beginPath(); x.moveTo(TLM.l, yy); x.lineTo(W - TLM.r, yy); x.stroke(); x.textAlign = 'right'; x.fillText(['1', '10', '100', '1千', '1万', '10万', '100万'][k], TLM.l - 4, yy + 3); }
  x.textAlign = 'center';
  for (let y = 0; y * 365 <= D; y++) { const xx = Xd(y * 365); x.beginPath(); x.moveTo(xx, TLM.t); x.lineTo(xx, Hh - TLM.b); x.stroke(); if (y * 365 < D) x.fillText((y + 1) + '年目', Xd(y * 365 + 182), Hh - 6); }
  // 冬（日平均 7℃ 未満）の帯
  x.fillStyle = 'rgba(120,160,220,.07)';
  for (let d = 0; d < D; d += 3) if (normalT(doyOf(d)) < 9) x.fillRect(Xd(d), TLM.t, Math.max(1, pw * 3 / D), ph);
  const line = (arr, col, w) => {
    x.strokeStyle = col; x.lineWidth = w; x.beginPath(); let pen = false;
    const step = Math.max(1, Math.floor(D / pw / 2));
    for (let d = 0; d <= Math.min(D, S.day); d += step) {
      const v = arr[d]; if (!(v >= 0)) { pen = false; continue; }
      const xx = Xd(d), yy = Yv(v); if (pen) x.lineTo(xx, yy); else { x.moveTo(xx, yy); pen = true; }
    }
    x.stroke();
  };
  line(H.bank, '#f0cf72', 1.6); line(H.plants, '#9be37a', 1.6); line(H.heads, '#e9a0c8', 1.2);
  const cx = Xd(S.day); x.strokeStyle = '#e8f0f4'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, TLM.t); x.lineTo(cx, Hh - TLM.b); x.stroke();
}

// ---------- マウスを乗せたときの説明 ----------
function describeAt(px, py) {
  if (SP.kind === 'clone') return bDescribe(px, py);
  const w = toWorld(px, py), s = VIEW.s, tol = 10 / s;
  if (w.y < 0 && w.y > -SOIL_D && w.x >= 0 && w.x <= BED_W) {
    if (S.opts.xray) {
      for (const p of S.plants) if (p.st === 0 && Math.abs(p.x - w.x) < tol && w.y < 0.001 && w.y > -p.z0 - 0.004) {
        const q = sproutGeom(p);
        return `<b>土の中でのびる芽</b>（深さ ${(p.z0 * 100).toFixed(1)}cm` + (p.n > 1 ? `、同じころの ${p.n} 本をまとめて計算` : '') + `）<br>タネの中の胚乳（でんぷん）を使って、地上まであと ${Math.max(0, (q.shootTop * -100)).toFixed(1)}cm。` +
          (p.z0 > SP.depthMax ? '<br>深すぎて、弁当が足りずに地上に届かない。' : '');
      }
      if (SP.rootDia * s > 4) for (const p of S.plants) if (p.st === 1 || p.st === 2) for (const t of rootGeom(p).tips)
        if (Math.hypot(t.x - w.x, t.y - w.y) < tol * 1.5) return `<b>根の先</b>（太さ 約${(t.w * 1000).toFixed(1)}mm）<br>先の細胞がふえて、のびながら土の中をおし進む。うしろの根毛から水を吸う。`;
      const xi = Math.floor(w.x / DXC), zi = Math.floor(-w.y / DZC), i = zi * NX + xi;
      const len = SP.seedLen * s, cap = seedCap(DXC * s);
      for (const [A, awake, off] of [[S.SN, true, 50000], [S.SD, false, 0]]) {
        for (let k = 0; k < seedShown(A[i], DXC * s); k++) {
          const sp = seedSpot(i, k + off);
          if (Math.hypot(sp.x - w.x, sp.y - w.y) * s < Math.max(5, len / 2)) return seedText(awake, -sp.y);
        }
      }
      const d = S.SD[i], a = S.SN[i];
      return `<b>土の中</b> 深さ ${(-w.y * 100).toFixed(1)}cm<br>このます目（横1cm・深さ0.5cm・奥行き15cm）に タネ ${d + a} 粒（眠る ${d}・目ざめた ${a}）。` +
        (DXC * s > 15 ? '<br>寄っているので、描いているのは手前の薄い切り口のぶんだけ。' : '') +
        (zi < ZG ? (DF[zi] >= 1 ? '<br>芽を出しやすい深さ。' : '<br>ここからも芽を出せる（出にくい）。') : '<br>深すぎて芽を出さない。耕すと浅いところへ上がる。');
    }
    return '<b>土</b><br>ふだんは中が見えない。「土を透かして見る」で、眠っているタネや根が見える。';
  }
  if (w.y >= 0) {
    let best = null, bd = 1e9;
    for (const p of S.plants) {
      if (p.st === 0) continue;
      const sp = 0.02 + 0.25 * Math.sqrt(p.W / SP.wmax) + 6 / s, top = Math.max(p.H, 0.006) + 6 / s;
      if (Math.abs(p.x + p.lean * w.y - w.x) < sp && w.y < top) { const d = Math.abs(p.x - w.x) + Math.abs(top - w.y) * 0.3; if (d < bd) { bd = d; best = p; } }
    }
    if (best) return plantText(best);
    if (w.y < 6 / s && w.x >= 0 && w.x <= BED_W) { const n = S.SD[Math.floor(w.x / DXC)] + S.SN[Math.floor(w.x / DXC)]; return `<b>地面</b><br>この 1cm の表面にタネ ${n} 粒。表面のタネは虫や鳥に食べられたり、雨で土の中へ入ったりする。`; }
  }
  return null;
}
function seedText(awake, depth) {
  return `<b>${awake ? '目ざめたタネ' : '眠っているタネ（休眠）'}</b>（深さ ${(depth * 100).toFixed(1)}cm、長さ約2mm）<br>` +
    (awake ? (depth <= SP.depthMax ? '暖かくなれば（10℃ より上）芽を出せる。' : '深すぎて芽を出さない。浅いところへ上がるのを待つ。')
      : '暖かくても芽を出さない。冬の寒さで少しずつ目ざめる。一度に全部が芽を出さないので、抜いても次が出てくる。');
}
function plantText(p) {
  const age = p.em >= 0 ? Math.round(S.day - p.em) : 0, st = panState(p);
  const state = p.st === 3 ? '枯れた株' : p.st === 2 ? (st.flower ? '穂が出て花が咲いている' : '穂のタネが熟していく') : p.H < 0.03 ? '芽生え' : '葉をふやしている';
  let t = `<b>エノコログサ</b>（${state}。芽が出て ${age}日）` + (p.n > 1 ? `<br>ここに同じころ生えた <b>${p.n} 本</b>をまとめて計算（描くのは1本。数値は1本あたり）` : '') + `<br>高さ ${(p.H * 100).toFixed(0)}cm・重さ ${p.W < 1 ? (p.W * 1000).toFixed(0) + 'mg' : p.W.toFixed(1) + 'g'}（乾いた重さ）・茎 ${1 + p.til} 本`;
  if (p.st !== 3) t += `・光 ${Math.round(p.light * 100)}%`;
  if (p.st >= 2) t += `<br>穂で作ったタネ ${Math.round(p.made / p.n).toLocaleString('ja-JP')} 粒（熟して穂にある ${Math.round(p.ripe / p.n).toLocaleString('ja-JP')}・落とした ${Math.round(p.shedN / p.n).toLocaleString('ja-JP')}）`;
  if (TOOL === 'pull') t += '<br><span style="color:var(--acc)">タップで抜く（なぞると次々に）</span>';
  return t;
}
function showTip(px, py, html) {
  const el = $('tip');
  if (!html) { el.hidden = true; return; }
  el.innerHTML = html; el.hidden = false;
  const fw = cv.clientWidth, fh = cv.clientHeight, ew = el.offsetWidth, eh = el.offsetHeight;
  el.style.left = Math.max(4, Math.min(fw - ew - 4, px + 14)) + 'px';
  el.style.top = Math.max(4, py + 16 + eh > fh ? py - eh - 12 : py + 16) + 'px';
}

// ---------- 寄って見る ----------
function jump(kind) {
  const msg = $('jumpMsg'); msg.textContent = '';
  if (SP.kind === 'clone') { bJump(kind); return; }
  if (kind !== 'flower' && kind !== 'sprout' && !S.opts.xray) { S.opts.xray = true; setPressed($('tgXray'), true); $('legendFl').hidden = false; }
  if (kind === 'seed') {
    let best = null, bd = 1e9;
    for (let z = 1; z < 24; z++) for (let x = 0; x < NX; x++) {
      const i = z * NX + x; if (!S.SD[i] && !S.SN[i]) continue;
      const d = Math.abs(x * DXC - VIEW.cx) + z * 0.002; if (d < bd) { bd = d; best = i; }
    }
    if (best == null) { msg.textContent = '土の中にタネがない。'; return; }
    const sp = seedSpot(best, S.SN[best] ? 50000 : 0);
    aimAt(sp.x, sp.y, 0.007); return;
  }
  if (kind === 'sprout') {
    const p = S.plants.filter(p => p.st === 0).sort((a, b) => Math.abs(a.x - VIEW.cx) - Math.abs(b.x - VIEW.cx))[0];
    if (!p) { msg.textContent = 'いまは土の中で芽をのばしているタネがない（芽が出るのは暖かいとき。春〜秋）。'; return; }
    if (!S.opts.xray) { S.opts.xray = true; setPressed($('tgXray'), true); }
    UI.speed = 1; seg($('segSpeed'), SPEEDS, 1, v => { UI.speed = v; });
    aimAt(p.x, -p.z0 / 2, Math.max(0.012, p.z0 * 1.6)); msg.textContent = '速さを 1日/秒 にした。芽が土の中をのびていく。'; return;
  }
  const alive = S.plants.filter(p => p.st === 1 || p.st === 2);
  if (kind === 'root') {
    const p = alive.sort((a, b) => b.W - a.W)[0];
    if (!p) { msg.textContent = 'いまは根のある株がない（春〜秋に）。'; return; }
    // 底に届いていない根の先を、先から 1.2mm 根もと側を中心に（根冠から根毛まで入る）
    const tips = rootGeom(p).tips, t = tips.find(t => t.y > -SOIL_D + 0.02 && t.w >= SP.rootDia) || tips[0], ao = t.a - Math.PI;
    aimAt(t.x - Math.sin(ao) * 0.0012, t.y + Math.cos(ao) * 0.0012, 0.0036); return;
  }
  if (kind === 'flower') {
    const hs = alive.filter(p => p.st === 2);
    const p = hs.find(p => panState(p).flower) || hs.sort((a, b) => b.made - a.made)[0];
    if (!p) { msg.textContent = 'いまは穂のある株がない（穂が出るのは夏〜秋）。'; return; }
    const pn = plantGeom(p).pans[0], q = panAt(pn, 0.5); aimAt(q.x, q.y, 0.014);
  }
}
