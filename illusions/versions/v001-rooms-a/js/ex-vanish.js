// 部屋「消える」: トロクスラー効果、運動誘発盲、ライラック・チェイサー
'use strict';

// ---------- トロクスラー効果 ----------
const TROX_COLS = ['205,120,150', '120,160,205', '150,195,120', '205,175,105', '160,130,205', '110,190,180'];
defEx({
  id: 'troxler', room: 'vanish',
  title: 'トロクスラー効果', en: 'Troxler fading',
  who: 'イグナツ・パウル・ヴィタール・トロクスラー', where: 'スイス', year: 1804,
  lead: 'まん中の＋だけを見つめていると、まわりのぼんやりした色が消えていきます。',
  bg: '#969696',
  steps: [
    '画面から少し離れて（50cm くらい）、まん中の黒い＋だけを見つめます。目を動かさないのがコツ。',
    '「見つめはじめる」を押して、まわりの色が消えたら「消えた！」を押してください。',
    'まばたきをしたり、目を少し動かしたりすると、色が戻ってきます。',
    'ぼかしを小さくしたり、濃さを上げたりすると、消えにくくなります。',
  ],
  controls: [
    { type: 'timer', id: 'tm', start: '見つめはじめる', lap: '消えた！' },
    { type: 'range', id: 'blur', label: 'ぼかし', min: 0.1, max: 1, step: 0.05, val: 0.9, fmt: v => Math.round(v * 100) + '%' },
    { type: 'range', id: 'con', label: '濃さ', min: 0.15, max: 1, step: 0.05, val: 0.45, fmt: v => Math.round(v * 100) + '%' },
    { type: 'toggle', id: 'jig', label: '色を少しゆらす', val: false },
  ],
  anim: st => st.jig,
  init(st) {},
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const R = S * 0.33, r = S * 0.115;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU - Math.PI / 2;
      let x = S / 2 + Math.cos(a) * R, y = S / 2 + Math.sin(a) * R;
      if (st.jig) { x += Math.sin(t * 2.1 + i * 1.7) * S * 0.012; y += Math.cos(t * 1.7 + i * 2.3) * S * 0.012; }
      blob(g, x, y, r, TROX_COLS[i], st.con, st.blur);
    }
    fixCross(g, S / 2, S / 2, S * 0.018, '#111');
  },
  why: [
    ['sure', '目の細胞や神経は、変化しないものへの反応をだんだん弱めます（順応）。まわりの視野はとくにぼやけていて、ふちのぼんやりした形は、目がわずかに動いても網膜の上でほとんど変化しないので、順応して消えてしまいます。'],
    ['sure', '目はじっと見つめているつもりでも、小さくふるえるように動いています（固視微動、マイクロサッカード）。この動きが大きいほど消えにくく、消えかけた色が戻るきっかけになることが、2006年の研究で確かめられています。'],
    ['sure', '消えた所は、穴があくのではなく、まわりの灰色で「塗りつぶされ」ます（充填）。盲点が見えないのと似たしくみです。'],
  ],
  facts: [
    'トロクスラーはスイスの医師・哲学者。1804年に、見つめていると周りのものが消えることを書き残しました。',
  ],
});

// ---------- 運動誘発盲 ----------
defEx({
  id: 'mib', room: 'vanish',
  title: '運動誘発盲', en: 'Motion-induced blindness',
  who: 'ボネー、クーパーマン、サギ', where: 'イスラエル', year: 2001,
  lead: '黄色い点はずっと表示されています。でも、青い模様が回っていると、点が消えたり現れたりします。',
  bg: '#000000',
  steps: [
    'まん中の白い点を見つめます。黄色い点は見ないでください。',
    'しばらくすると、黄色い点が1つ、2つ、ときには3つ同時に消えます（10秒くらいで起きる人が多い）。',
    '「模様を止める」を押すと、点はずっとそこにあったことが分かります。',
  ],
  controls: [
    { type: 'range', id: 'spd', label: '回る速さ', min: 0, max: 180, step: 5, val: 70, fmt: v => v + '°/秒' },
    { type: 'range', id: 'n', label: '黄色い点の数', min: 1, max: 3, step: 1, val: 3, fmt: v => v + '個' },
    { type: 'range', id: 'dsz', label: '黄色い点の大きさ', min: 0.006, max: 0.03, step: 0.001, val: 0.013, fmt: v => Math.round(v * 1000) / 10 + '%' },
    { type: 'toggle', id: 'stop', label: '模様を止める', val: false },
  ],
  anim: () => true,
  init(st) { st.ang = 0; st.lt = null; },
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    if (st.lt != null && !st.stop) st.ang += (t - st.lt) * st.spd * Math.PI / 180;
    st.lt = t;
    g.save(); g.translate(S / 2, S / 2); g.rotate(st.ang);
    g.strokeStyle = '#2f5cff'; g.lineWidth = Math.max(1.5, S * 0.006); g.lineCap = 'butt';
    const sp = S * 0.085, c = S * 0.022, n = 9;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = i * sp, y = j * sp;
      if (x * x + y * y < (S * 0.03) ** 2) continue;
      seg(g, x - c, y, x + c, y); seg(g, x, y - c, x, y + c);
    }
    g.restore();
    const R = S * 0.3, angs = [-150, -30, 90];
    for (let k = 0; k < st.n; k++) {
      const a = angs[k] * Math.PI / 180;
      disc(g, S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R, S * st.dsz, '#ffe14a');
    }
    disc(g, S / 2, S / 2, S * 0.008, '#ffffff');
  },
  why: [
    ['sure', '黄色い点は一度も消していません（プログラムはずっと描いています）。それでも、動く模様と重なると、止まっている目立つ点が意識から消えます。消えている間も、点（たとえば傾いた線）の向きに目が慣れて起きる残効が生じるので、脳の一部では処理が続いていると考えられています。'],
    ['theory', '脳が「動く模様が手前、点は見まちがい（目の傷のようなもの）」と判断して消すという説や、点と模様が注意を奪い合い、点が負けると見えなくなるという説があります。'],
    ['open', 'どの説が正しいのか、まだ決着はついていません。トロクスラー効果と同じしくみが一部関わっていると考えられています。'],
  ],
  facts: [
    '元の実験では、見つめる点が小さくちらついていました。この展示では、ちらつきを避けるため点は光り続けています。',
  ],
});

// ---------- ライラック・チェイサー ----------
const LILAC = { lilac: '214,130,214', cyan: '90,200,215', yellow: '230,205,70' };
defEx({
  id: 'lilac', room: 'vanish',
  title: 'ライラック・チェイサー', en: 'Lilac chaser',
  who: 'ジェレミー・ヒントン', where: 'イギリス', year: 2005,
  lead: '円く並んだ薄紫の点が1つずつ消えていきます。見つめていると、紫が消え、緑の点がぐるぐる走りはじめます。',
  bg: '#c4c4c4',
  steps: [
    '「動かす」を押してください（点が1つずつ消えるので、小さくちらつきます）。',
    'まん中の＋を見つめ続けます。20秒くらいで、すき間が緑の点に変わり、回って見えます。',
    'さらに見つめていると、紫の点が消え、緑の点だけが回ります。',
    '目を動かすと紫の点が戻ります。色を変えると、走る点の色も変わります。',
  ],
  controls: [
    { type: 'toggle', id: 'run', label: '動かす（小さくちらつきます）', val: false },
    { type: 'range', id: 'rate', label: '速さ', min: 4, max: 12, step: 1, val: 9, fmt: v => v + ' 個/秒' },
    { type: 'choice', id: 'col', label: '点の色', opts: [['lilac', '薄紫'], ['cyan', '水色'], ['yellow', '黄色']], val: 'lilac' },
    { type: 'range', id: 'blur', label: 'ぼかし', min: 0.1, max: 1, step: 0.05, val: 0.85, fmt: v => Math.round(v * 100) + '%' },
  ],
  anim: st => st.run,
  init(st) { st.t0 = null; },
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    if (st.run && st.t0 == null) st.t0 = t;
    if (!st.run) st.t0 = null;
    const miss = st.run ? Math.floor((t - st.t0) * st.rate) % 12 : -1;
    const R = S * 0.34, r = S * 0.07;
    for (let i = 0; i < 12; i++) {
      if (i === miss) continue;
      const a = i / 12 * TAU - Math.PI / 2;
      blob(g, S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R, r, LILAC[st.col], 1, st.blur);
    }
    fixCross(g, S / 2, S / 2, S * 0.022, '#111');
  },
  why: [
    ['sure', '緑の点はどこにも描いていません。紫を見つめた所の目の細胞が疲れて、紫が消えた瞬間にその反対の色（補色＝緑）が見える「残像」です。'],
    ['sure', '残像が順番に現れるので、1つの点が動いているように見えます（仮現運動。パラパラまんがと同じ）。'],
    ['sure', '紫の点が消えるのは、ぼやけた形を見つめ続けると消えるトロクスラー効果。3つのしくみが重なっています。'],
  ],
  facts: [
    'ヒントンが2005年ごろに作り、ウェブで広まって「錯視の中でも特に印象的」と話題になりました。',
  ],
});
