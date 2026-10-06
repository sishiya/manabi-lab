// 部屋「長さと大きさ」: ミュラー・リヤー、エビングハウス、ポンゾ（どれも自分で測れる）
'use strict';

// ---------- ミュラー・リヤー ----------
function mlLine(g, cx, y, len, fin, ang, out) {
  const x1 = cx - len / 2, x2 = cx + len / 2;
  seg(g, x1, y, x2, y);
  const a = ang * Math.PI / 180, fx = Math.cos(a) * fin, fy = Math.sin(a) * fin;
  // out=true: 外向きのひれ（>—<）、false: 矢じり（<—>）
  const s = out ? 1 : -1;
  seg(g, x1, y, x1 - s * fx, y - fy); seg(g, x1, y, x1 - s * fx, y + fy);
  seg(g, x2, y, x2 + s * fx, y - fy); seg(g, x2, y, x2 + s * fx, y + fy);
}
defEx({
  id: 'muller-lyer', room: 'size',
  title: 'ミュラー・リヤー錯視', en: 'Müller-Lyer illusion',
  who: 'フランツ・カール・ミュラー＝リヤー', where: 'ドイツ', year: 1889,
  lead: '2本の線は同じ長さ。でも下のほうが長く見えます。',
  bg: '#f6f3ec',
  steps: [
    '上と下の横線（ひれを除いた部分）の長さを比べてください。',
    '「測ってみる」のスライダーで下の線の長さを変え、上と同じに見えるところで「同じに見えた」を押します。',
    'ひれの角度や長さを変えて、もう一度測ると、だまされ方が変わります。',
  ],
  controls: [
    { type: 'range', id: 'ang', label: 'ひれの角度', min: 15, max: 80, step: 1, val: 35, fmt: v => v + '°' },
    { type: 'range', id: 'fin', label: 'ひれの長さ', min: 0.08, max: 0.4, step: 0.01, val: 0.22, fmt: v => Math.round(v * 100) + '%' },
    { type: 'toggle', id: 'nofin', label: 'ひれを消す', val: false },
  ],
  init(st) { st.adj = 1; st.shift = 0; },
  measure: {
    q: '下の線の長さを、上と同じに見えるところに合わせてください。',
    label: '下の線の長さ',
    min: 0.6, max: 1.25, step: 0.002,
    start(st) { st.adj = rnd(0.72, 1.18); st.shift = rnd(-0.06, 0.06); },
    result(st) {
      const v = (1 / st.adj - 1) * 100;
      return {
        big: pct(v),
        text: v > 0 ? `外向きのひれの線（下）は、内向き（上）より約 ${Math.abs(v).toFixed(1)}% 長く見えていました。`
                    : `下の線のほうが短く見えていました（${Math.abs(v).toFixed(1)}%）。この形ではだまされにくい目かもしれません。`,
        typ: '目安: 多くの人で 10〜30% くらい。ひれの角度が小さく、ひれが長いほど強くなります（研究によって数値は違います）。',
      };
    },
  },
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const L = S * 0.46, y1 = S * 0.33, y2 = S * 0.67, fin = L * st.fin * (st.nofin ? 0 : 1);
    g.strokeStyle = '#1d1d1d'; g.lineWidth = Math.max(2, S * 0.007); g.lineCap = 'round';
    mlLine(g, S / 2, y1, L, fin, st.ang, false);
    const cx2 = S / 2 + st.shift * S, L2 = L * st.adj;
    mlLine(g, cx2, y2, L2, fin, st.ang, true);
    if (st.reveal) {
      guide(g, S / 2 - L / 2, y1 - S * 0.12, S / 2 - L / 2, y2 + S * 0.12, S);
      guide(g, S / 2 + L / 2, y1 - S * 0.12, S / 2 + L / 2, y2 + S * 0.12, S);
      label(g, `上の線 = 100`, S / 2, y1 - S * 0.16, S);
      label(g, `下の線 = ${Math.round(st.adj * 100)}`, cx2, y2 + S * 0.17, S);
    }
  },
  why: [
    ['sure', '線の長さは同じ（または、あなたが合わせた長さ）なのに、ひれの向きで見かけの長さが変わります。ひれの角度が鋭く、ひれが長いほど強く、ひれを消すとなくなります。'],
    ['theory', '奥行きの手がかり説（グレゴリー）: 内向きのひれは「手前に出っぱった建物の角」、外向きは「奥へへこんだ部屋の角」に似ていて、脳が「遠くにあるはず」と見たほうを大きく補正してしまう、という説明。'],
    ['theory', 'まとめて見る説: 脳は線とひれを1つのかたまりとして長さを見積もるので、ひれの広がりが長さに混ざる、という説明。ひれの代わりに円や四角を置いても似た錯覚が起きることが、この説を支えます。'],
    ['open', 'どちらの説明も一部の結果しか説明できず、決着はついていません。'],
  ],
  facts: [
    '1960年代の国際比較（シーガルら）で、まっすぐな壁や角の少ない環境で育った人たちは錯覚が小さいと報告され、「育った環境で見え方が変わる」例として有名になりました。ただし、目の色素や実験のやり方の違いが影響したという反論もあります。',
    'ハト（日本の研究、2006年）や魚、ミツバチなど、ヒト以外の動物でもこの錯覚が起きることが報告されています。',
  ],
});

// ---------- エビングハウス ----------
function ebbGroup(g, cx, cy, rC, rS, dist, n, noS) {
  if (!noS) for (let i = 0; i < n; i++) {
    const a = i / n * TAU + Math.PI / n;
    disc(g, cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, rS, '#8b9299');
  }
  disc(g, cx, cy, rC, '#e2772f');
}
defEx({
  id: 'ebbinghaus', room: 'size',
  title: 'エビングハウス錯視', en: 'Ebbinghaus illusion (Titchener circles)',
  who: 'ヘルマン・エビングハウス（ティチェナーが1901年に紹介）', where: 'ドイツ', year: '1890年代',
  lead: 'まん中のオレンジの円は同じ大きさ。小さな円に囲まれたほうが大きく見えます。',
  bg: '#f4f4f1',
  steps: [
    '左右のオレンジの円の大きさを比べてください。',
    '「測ってみる」で右の円の大きさを変え、左と同じに見えたら「同じに見えた」を押します。',
    '「まわりを消す」で本当の大きさを確かめましょう。',
  ],
  controls: [
    { type: 'toggle', id: 'noS', label: 'まわりを消す', val: false },
    { type: 'range', id: 'big', label: '左のまわりの円の大きさ', min: 0.04, max: 0.085, step: 0.001, val: 0.075, fmt: v => Math.round(v / 0.06 * 100) + '%' },
  ],
  init(st) { st.adj = 1; },
  measure: {
    q: '右のオレンジの円の大きさを、左と同じに見えるところに合わせてください。',
    label: '右の円の大きさ',
    min: 0.7, max: 1.3, step: 0.002,
    start(st) { st.adj = rnd(0.78, 1.2); },
    result(st) {
      const v = (1 / st.adj - 1) * 100;
      return {
        big: pct(v),
        text: v > 0 ? `小さな円に囲まれた右の円は、大きな円に囲まれた左より、直径で約 ${Math.abs(v).toFixed(1)}% 大きく見えていました。`
                    : `右の円のほうが小さく見えていました（${Math.abs(v).toFixed(1)}%）。`,
        typ: '目安: 直径で数%〜10%前後という報告が多い（図の形や測り方で変わります）。',
      };
    },
  },
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const r0 = S * 0.06, cy = S * 0.5;
    const rb = S * st.big, db = r0 + rb + S * 0.035;
    ebbGroup(g, S * 0.27, cy, r0, rb, db, 6, st.noS);
    ebbGroup(g, S * 0.74, cy, r0 * st.adj, S * 0.026, r0 * st.adj + S * 0.05, 8, st.noS);
    if (st.reveal) {
      guide(g, S * 0.16, cy - r0, S * 0.86, cy - r0, S);
      guide(g, S * 0.16, cy + r0, S * 0.86, cy + r0, S);
      label(g, '左 = 100', S * 0.27, cy + S * 0.3, S);
      label(g, `右 = ${Math.round(st.adj * 100)}`, S * 0.74, cy + S * 0.3, S);
    }
  },
  why: [
    ['sure', '同じ大きさの円でも、まわりに大きなものがあると小さく、小さなものがあると大きく見えます。まわりとの距離も効き、まわりの円が遠いと効果は弱まります。'],
    ['theory', '比べっこ説: 大きさは、ものだけでなくまわりとの比で見積もられる、という説明。まわりとの「すき間」の大きさが手がかりになるという研究もあります。'],
    ['open', '見た目はだまされても、指でつまむ動きはだまされにくいという報告（1995年）があり、「見るための視覚」と「動くための視覚」が別にあるという考えの根拠とされました。ただし、その後の実験で反対の結果も出ていて、議論が続いています。'],
  ],
  facts: [
    'ナミビアのヒンバの人々（伝統的な暮らしをしている人たち）は、イギリスの人たちよりこの錯覚が小さいという報告があります（2007年）。全体よりも細部に注目しやすいためと考えられています。',
    '7歳くらいまでの子どもは、大人よりこの錯覚が小さいという報告もあります。',
  ],
});

// ---------- ポンゾ ----------
defEx({
  id: 'ponzo', room: 'size',
  title: 'ポンゾ錯視', en: 'Ponzo illusion',
  who: 'マリオ・ポンゾ', where: 'イタリア', year: 1911,
  lead: '2本の横棒は同じ長さ。でも上（線路の奥）のほうが長く見えます。',
  bg: '#f3efe6',
  steps: [
    '2本の黄色い横棒の長さを比べてください。',
    '「測ってみる」で上の棒の長さを変え、下と同じに見えたら「同じに見えた」を押します。',
    '「線路を消す」「枕木」を切りかえて、奥行きの手がかりで強さが変わるか見てみましょう。',
  ],
  controls: [
    { type: 'toggle', id: 'norail', label: '線路を消す', val: false },
    { type: 'toggle', id: 'ties', label: '枕木（奥行きの手がかり）', val: false },
  ],
  init(st) { st.adj = 1; st.shift = 0; },
  measure: {
    q: '上の棒の長さを、下と同じに見えるところに合わせてください。',
    label: '上の棒の長さ',
    min: 0.7, max: 1.3, step: 0.002,
    start(st) { st.adj = rnd(0.78, 1.18); st.shift = rnd(-0.03, 0.03); },
    result(st) {
      const v = (1 / st.adj - 1) * 100;
      return {
        big: pct(v),
        text: v > 0 ? `奥（上）の棒は、手前（下）より約 ${Math.abs(v).toFixed(1)}% 長く見えていました。`
                    : `上の棒のほうが短く見えていました（${Math.abs(v).toFixed(1)}%）。`,
        typ: '目安: 5〜15% くらい。写真のように奥行きの手がかりが多いほど強くなるという報告があります。',
      };
    },
  },
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const ax = S * 0.5, ay = S * 0.02, by = S * 0.98, hw = S * 0.44;
    const halfAt = y => (y - ay) / (by - ay) * hw;
    if (!st.norail) {
      if (st.ties) {
        g.fillStyle = '#9c8f7a';
        for (let k = 0; k < 14; k++) {
          const z = 1 + k * 0.55, y = ay + (by - ay) * (1.6 / (z + 0.6));
          if (y > by || y < ay + S * 0.05) continue;
          const h = halfAt(y) * 1.12, th = Math.max(1, S * 0.03 * (y - ay) / (by - ay));
          g.fillRect(ax - h, y - th / 2, 2 * h, th);
        }
      }
      g.strokeStyle = '#3a3530'; g.lineWidth = Math.max(2, S * 0.008); g.lineCap = 'round';
      seg(g, ax, ay, ax - hw, by); seg(g, ax, ay, ax + hw, by);
    }
    const L = S * 0.22, yU = S * 0.36, yD = S * 0.74, th = S * 0.026;
    g.fillStyle = '#e8b51e'; g.strokeStyle = '#6b5208'; g.lineWidth = 1;
    const cU = ax + st.shift * S, LU = L * st.adj;
    g.fillRect(cU - LU / 2, yU - th / 2, LU, th); g.strokeRect(cU - LU / 2, yU - th / 2, LU, th);
    g.fillRect(ax - L / 2, yD - th / 2, L, th); g.strokeRect(ax - L / 2, yD - th / 2, L, th);
    if (st.reveal) {
      guide(g, ax - L / 2, yU - S * 0.06, ax - L / 2, yD + S * 0.03, S);
      guide(g, ax + L / 2, yU - S * 0.06, ax + L / 2, yD + S * 0.03, S);
      label(g, `上 = ${Math.round(st.adj * 100)}`, ax, yU - S * 0.08, S);
      label(g, '下 = 100', ax, yD + S * 0.07, S);
    }
  },
  why: [
    ['sure', '同じ長さの棒でも、狭まっていく線の間に置くと、狭いほう（奥）の棒が長く見えます。線を消すとなくなります。'],
    ['theory', '大きさの恒常性の説: 脳は2本の線を「遠くへのびる線路」と受けとり、奥にあるものは本当はもっと大きいはずと補正する、という説明。遠くの人が小人に見えないのと同じしくみが、平面の絵に働いてしまう。'],
    ['theory', 'まわりとの比の説: 上の棒は線との「すき間」が小さいので相対的に長く見える、という説明もあります。'],
  ],
  facts: [
    '月が地平線の近くで大きく見える「月の錯視」の説明に、この錯覚が使われることがあります（月の錯視の原因はまだ決着していません）。',
  ],
});
