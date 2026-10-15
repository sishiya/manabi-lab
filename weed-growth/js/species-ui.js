// 雑草がふえるまで — 種の仲間（seed: タネでふえる草 / clone: 竹）ごとの、画面の言葉と動き
'use strict';
const KIND_UI = {
  seed: {
    tools: [['見る', 'look'], ['タネ', 'seed'], ['抜く', 'pull'], ['刈る', 'mow'], ['耕す', 'till'], ['おおう', 'cover']],
    widths: [['10cm', 0.1], ['30cm', 0.3], ['全部', 2.2]],
    jumps: [['seed', '土の中のタネ', '眠っている・目ざめた'], ['sprout', '芽を出すところ', '土の中で'], ['root', '根の先', '細胞・根毛'], ['flower', '穂の花・実', '小穂']],
    legend: ['地上の株（本）', '土の中のタネ（粒/m²）', '穂のある株'],
    autoPull: '穂が出たらすぐ抜く',
    words: () => ({ jumps3: SP.words.flowerJump, legend2: SP.words.heads, autoPull: SP.words.head + 'が出たらすぐ抜く' }),
    ro: [['地上の株', '本'], ['土の中のタネ', '粒/m²'], ['今年落ちたタネ', '粒/m²']],
    start: () => { aimAt(BED_W / 2, 0.14, 0.6, 0.01); viewTick(1); },
    hint: () => TOOL === 'seed' ? '花だんの上をタップ（なぞる）してタネを落とそう ↓' : '「タネ」をえらんで、花だんの上をタップ ↓',
    started: () => S.tot.dropped > 0,
  },
  clone: {
    tools: [['見る', 'look'], ['植える', 'seed'], ['掘る', 'pull'], ['切る', 'mow'], ['耕す', 'till'], ['根止め', 'cover']],
    widths: [['50cm', 0.5], ['2m', 2], ['全部', 20]],
    jumps: [['seed', '地下茎の先', '土の中をのびる'], ['sprout', 'タケノコ', '中の節'], ['root', '竹の中', '空洞と節の仕切り'], ['flower', '竹の花', '約67年に1度']],
    legend: ['地上の竹（本）', '地下茎（cm）', 'タケノコ（本）'],
    autoPull: 'タケノコを出たらすぐ掘る',
    ro: [['地上の竹', '本'], ['地下茎', 'm'], ['今年のタケノコ', '本']],
    start: () => { aimAt(BED_W / 2, 2.5, 12, 0.01); viewTick(1); },
    hint: () => TOOL === 'seed' ? '地面をタップして竹を植えよう ↓' : '「植える」をえらんで、地面をタップ ↓',
    started: () => B.tot.planted > 0,
  },
};
function kindUI() { return KIND_UI[SP.kind]; }

// 種の仲間を切りかえたとき・はじめに: 見せる部品と言葉をそろえる
function applyKindUI() {
  const K = kindUI();
  for (const el of document.querySelectorAll('[data-kind]')) el.hidden = el.dataset.kind !== SP.kind;
  $('legendFl').hidden = SP.kind !== 'seed' || !S.opts.xray; $('legendFlB').hidden = SP.kind !== 'clone' || !S.opts.xray;
  if (!K.widths.some(w => w[1] === TOOL_W)) TOOL_W = K.widths[1][1];
  seg($('segWidth'), K.widths, TOOL_W, v => { TOOL_W = v; });
  setTool(TOOL);
  const js = $('jumps'); js.innerHTML = '';
  for (const [j, t, sm] of K.jumps) { const b = document.createElement('button'); b.className = 'btn act'; b.dataset.j = j; b.innerHTML = `${t}<small>${sm}</small>`; b.onclick = () => jump(j); js.appendChild(b); }
  const Wd = K.words ? K.words() : null;
  if (Wd) { K.jumps[3] = ['flower', Wd.jumps3[0], Wd.jumps3[1]]; js.lastChild.innerHTML = `${Wd.jumps3[0]}<small>${Wd.jumps3[1]}</small>`; }
  $('lgP').textContent = K.legend[0]; $('lgB').textContent = K.legend[1]; $('lgH').textContent = Wd ? Wd.legend2 : K.legend[2];
  $('tgAutoPull').textContent = Wd ? Wd.autoPull : K.autoPull;
  K.ro.forEach(([l, u], i) => { $('roL' + (i + 1)).textContent = l; $('roU' + (i + 1)).textContent = u; });
  seg($('segScen'), Object.entries(SCENARIOS).filter(([, v]) => v.kind === SP.kind).map(([k, v]) => [v.name, k]), S.scen, v => startScenario(v));
  $('jumpMsg').textContent = '';
  if (SP.kind === 'seed') $('brandSeed').textContent = `抜いても抜いても、いつのまにか生えてくる雑草。そのわけは土の中にある。${SP.name}の一生を、長さ1.5mの花だんを横から切った図で計算してみよう。`;
}

// ---------- 竹: 数字・いまのようす・説明・寄って見る ----------
function bReadout(c) {
  $('roUp').textContent = c.culms; $('roHeads').textContent = 'タケノコ ' + c.shoots;
  $('roBank').textContent = c.rh.toFixed(1); $('roDorm').textContent = 'のびている先 ' + c.tips;
  $('roShed').textContent = B.yr.shoots; $('roOnPlant').textContent = B.yr.maxD ? `太さ 最大 ${(B.yr.maxD * 100).toFixed(0)}cm` : '–';
}
function bNowText(c) {
  if (SCENARIOS[S.scen].empty && !B.tot.planted) return '竹がまだない。上の「植える」をえらんで、地面をタップして竹を植えてみよう（地下茎のついた若い竹）。';
  const out = [], doy = doyOf(S.day);
  if (S.opts.autoPull) out.push('実験中: タケノコは出たらすぐ掘っている。');
  out.push(`地上の竹 <b>${c.culms} 本</b>` + (c.maxD ? `（いちばん太いもの ${(c.maxD * 100).toFixed(1)}cm）` : '') + '。');
  if (c.shoots) out.push(`タケノコが <b>${c.shoots} 本</b>のびている。`);
  out.push(`土の中の地下茎は合わせて <b>${c.rh.toFixed(1)}m</b>` + (c.tips ? `、のびている先が ${c.tips} 本` : '') + '。');
  if (doy >= SP.shootWin[0] - 25 && doy < SP.shootWin[0]) out.push('もうすぐタケノコの季節。地下茎の芽がふくらんでいる。');
  else if (doy >= SP.shootWin[0] && doy < SP.shootWin[1] + 30) out.push('タケノコの季節（春）。ためた養分で、地下茎の節の芽からタケノコが出る。');
  else if (doy >= SP.rhWin[0] && doy < SP.rhWin[1]) out.push('地下茎がのびる季節（夏の終わり〜秋）。土の中で先がのびていく。地上からは見えない。');
  else out.push('竹の葉が養分を作り、地下茎にためている。');
  out.push(`ためた養分 ${c.R.toFixed(1)}kg（推定の目安）。`);
  if (B.tot.out) out.push(`地下茎はもう ${B.tot.out} 回、帯の外（となりの土地）へ出ていった。`);
  if (!c.culms && !c.shoots && c.rh > 0) out.push('地上に竹はないが、地下茎は生きている。');
  if (!c.rh && !c.culms && B.tot.planted) out.push('地下茎がなくなった。もう生えてこない。');
  return out.join(' ');
}
function bDescribe(px, py) {
  const w = toWorld(px, py), s = VIEW.s, tol = 8 / s;
  if (w.y < 0) {
    if (!S.opts.xray) return '<b>土</b><br>ふだんは中が見えない。「土を透かして見る」で地下茎が見える。';
    for (const bx of B.barrier) if (Math.abs(w.x - bx) < Math.max(tol, 0.02) && w.y > -SP.barrierDepth) return '<b>根止めの板</b>（深さ 50cm）<br>これより浅いところを走る地下茎は、ここで止まる。';
    for (const sg of B.rh) {
      const a = Math.min(sg.x0, sg.x1), b = Math.max(sg.x0, sg.x1);
      if (w.x >= a - tol && w.x <= b + tol && Math.abs(-sg.z - w.y) < Math.max(tol, SP.rhDia)) {
        const tip = B.tips.find(t => t.alive && t.seg === sg.id && Math.abs(sg.x1 - w.x) < Math.max(3 * tol, 0.05));
        return `<b>${tip ? '地下茎の先' : '地下茎'}</b>（深さ ${Math.round(sg.z * 100)}cm・${Math.max(1, Math.ceil((S.day - sg.born) / 365))}年目）<br>` +
          (tip ? '7月下旬〜11月上旬に、とがった先で土をおし進む。' : '節ごとに芽と根がある。3〜4年目の地下茎がいちばんタケノコを出す（林野庁）。');
      }
    }
    return `<b>土の中</b> 深さ ${(-w.y * 100).toFixed(0)}cm`;
  }
  let best = null, bd = 1e9;
  for (const c of B.culms) {
    if (c.st === 4) continue;
    const h = Math.max(0.05, c.st === 0 ? c.H : (c.H || c.Hf)), d = Math.abs(c.x - w.x);
    if (d < Math.max(tol, c.D) && w.y < h + tol && d < bd) { bd = d; best = c; }
  }
  if (!best) return null;
  const c = best, age = Math.max(1, Math.ceil((S.day - c.em) / 365));
  if (c.st === 0) {
    const a = S.day - c.em, rate = (shootH(c, a + 1) - shootH(c, a)) * 100;
    return `<b>タケノコ</b>（地上に出て ${Math.round(a)}日）<br>高さ ${c.H.toFixed(2)}m・きょうは ${rate.toFixed(0)}cm のびる。<br>${SP.growDays}日ほどで ${c.Hf.toFixed(1)}m（太さ ${(c.D * 100).toFixed(1)}cm）になる。`;
  }
  if (c.st === 2) return '<b>枯れた竹</b><br>やがて倒れる。';
  return `<b>竹（稈）</b> 太さ ${(c.D * 100).toFixed(1)}cm・高さ ${c.Hf.toFixed(1)}m・${age}年目<br>一度のびたら、太くも高くもならない（長野県）。光 ${Math.round(c.light * 100)}%` +
    (TOOL === 'mow' ? '<br><span style="color:var(--acc)">タップ（なぞる）で切る</span>' : '');
}
function bJump(kind) {
  const msg = $('jumpMsg');
  if (kind !== 'flower' && !S.opts.xray && (kind === 'seed')) { S.opts.xray = true; setPressed($('tgXray'), true); applyKindUI(); }
  if (kind === 'seed') {
    const t = B.tips.find(t => t.alive && segById(t.seg));
    const sg = t ? segById(t.seg) : B.rh[B.rh.length - 1];
    if (!sg) { msg.textContent = '地下茎がない。「植える」で竹を植えてみよう。'; return; }
    if (!t) msg.textContent = 'いまは地下茎の先がのびていない（のびるのは 7月下旬〜11月上旬）。';
    aimAt(sg.x1, -sg.z, 0.3); return;
  }
  if (kind === 'sprout') {
    const sh = B.culms.filter(c => c.st === 0).sort((a, b) => a.H - b.H)[0];
    if (!sh) { msg.textContent = 'いまはタケノコがない（出るのは 3月下旬〜5月）。'; return; }
    if (sh.H < 1.6) aimAt(sh.x, Math.max(0.05, sh.H / 2), Math.max(0.25, sh.H * 1.3, sh.D * 1.6 * 5));   // タケノコ全体が入るように
    else aimAt(sh.x, Math.min(sh.H, 1.2), 2.5);
    return;
  }
  if (kind === 'root') {
    const c = B.culms.filter(c => c.st === 1).sort((a, b) => b.D - a.D)[0];
    if (!c) { msg.textContent = 'いまは竹がない。'; return; }
    aimAt(c.x, 1.2, Math.max(0.15, c.D * 4)); return;
  }
  msg.textContent = `モウソウチクの花は約${SP.flowerYears}年に1回（長野県）。咲くと竹やぶがまだらに枯れる。この10年では咲かない。`;
}
