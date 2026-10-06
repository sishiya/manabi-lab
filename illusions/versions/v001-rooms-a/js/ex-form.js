// 部屋「ないものが見える・止まっているのに動く」: カニッツァの三角形、周辺ドリフト
'use strict';

// ---------- カニッツァの三角形 ----------
defEx({
  id: 'kanizsa', room: 'form',
  title: 'カニッツァの三角形', en: 'Kanizsa triangle',
  who: 'ガエタノ・カニッツァ', where: 'イタリア', year: 1955,
  lead: 'まん中に白い三角形が見えます。でも、三角形のふちはどこにも描かれていません。',
  bg: '#ffffff',
  steps: [
    'まん中の白い三角形のふちを目でたどってみてください。まわりより少し明るく見える人も多いはずです。',
    '「欠けた円を回す」を押すと、同じ部品なのに三角形が消えます。',
    '「答え合わせ」で、本当に描かれている線を確かめましょう。',
  ],
  controls: [
    { type: 'toggle', id: 'turn', label: '欠けた円を回す', val: false },
    { type: 'toggle', id: 'outline', label: '線の三角形', val: true },
    { type: 'range', id: 'r', label: '円の大きさ', min: 0.05, max: 0.14, step: 0.005, val: 0.1, fmt: v => Math.round(v * 1000) / 10 + '%' },
    { type: 'toggle', id: 'reveal', label: '答え合わせ（描いている所に色）', val: false },
  ],
  init(st) {},
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const cx = S / 2, cy = S * 0.54, R = S * 0.3, r = S * st.r;
    const P = a => [cx + Math.cos(a * Math.PI / 180) * R, cy + Math.sin(a * Math.PI / 180) * R];
    const up = [-90, 30, 150].map(P), dn = [90, -30, -150].map(P);
    const ink = st.reveal ? '#d2333c' : '#111';
    if (st.outline) {
      g.save();
      g.beginPath(); g.rect(0, 0, S, S); g.moveTo(...up[0]); g.lineTo(...up[1]); g.lineTo(...up[2]); g.closePath();
      g.clip('evenodd');
      g.strokeStyle = ink; g.lineWidth = Math.max(2, S * 0.008); g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(...dn[0]); g.lineTo(...dn[1]); g.lineTo(...dn[2]); g.closePath(); g.stroke();
      g.restore();
    }
    g.fillStyle = ink;
    up.forEach(([x, y], i) => {
      let dir = Math.atan2(cy - y, cx - x);
      if (st.turn) dir += [Math.PI, Math.PI * 0.75, -Math.PI * 0.6][i];
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, dir + Math.PI / 6, dir - Math.PI / 6 + TAU); g.closePath(); g.fill();
    });
  },
  why: [
    ['sure', '三角形のふち（主観的輪郭）は描かれていません。それでも、脳の視覚野（V2）には、この「ないふち」に反応する細胞があることが、サルの実験（1984年）で確かめられています。'],
    ['theory', '脳は「欠けた円が3つ偶然そろっている」より「白い三角形が手前にあって円を隠している」ほうがありそうだと判断し、その三角形を見せる、という説明。ものの一部が隠れていても全体をとらえるための、ふだん役に立つしくみです。'],
    ['sure', '欠けた円の向きをずらすと、三角形は消えます。ふちの手がかりがそろうことが大事です。'],
  ],
  facts: [
    'このような「ないふち」は1900年にシューマン（ドイツ）も報告していましたが、1955年のカニッツァの図で広く知られるようになりました。',
  ],
});

// ---------- 周辺ドリフト ----------
const DRIFT_PAL = {
  gray:  ['#000000', '#5a5a5a', '#ffffff', '#b4b4b4'],
  color: ['#000000', '#2b48c9', '#ffffff', '#e8d23a'],
};
defEx({
  id: 'drift', room: 'form',
  title: '周辺ドリフト錯視', en: 'Peripheral drift illusion',
  who: 'フレイザーとウィルコックス（1979）／北岡明佳・蘆田宏（2003）', where: 'イギリス／日本', year: '1979／2003',
  lead: '止まった絵なのに、輪がゆっくり回って見えます。',
  bg: '#8a8a8a',
  steps: [
    '絵全体をながめて、視線をあちこちに動かしてください。見ていない所の輪が回って見えます。',
    'まん中の1つをじっと見つめると、その輪は止まります。まばたきをすると、また動きます。',
    '「並びを変える」で色の順番を変えると、動きがほとんど消えます。',
  ],
  controls: [
    { type: 'choice', id: 'pal', label: '色', opts: [['gray', '灰色'], ['color', '青と黄']], val: 'color' },
    { type: 'toggle', id: 'bad', label: '並びを変える', val: false },
  ],
  init(st) {},
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const pal = DRIFT_PAL[st.pal], order = st.bad ? [0, 2, 1, 3] : [0, 1, 2, 3];
    const fr = [0.32, 0.18, 0.32, 0.18];
    const D = [[0.26, 0.26, 1], [0.74, 0.26, -1], [0.26, 0.74, -1], [0.74, 0.74, 1]];
    for (const [ux, uy, sgn] of D) {
      const cx = ux * S, cy = uy * S, R = S * 0.235, rings = 4, w = R / (rings + 0.7);
      for (let k = 0; k < rings; k++) {
        const ro = R - k * w, ri = ro - w, rm = (ro + ri) / 2;
        let M = Math.max(6, Math.round(TAU * rm / (w * 2.8)));
        const dir = (k % 2 ? -1 : 1) * sgn, phase = k * 0.37;
        for (let m = 0; m < M; m++) {
          let a = m / M * TAU + phase;
          for (let p = 0; p < 4; p++) {
            const da = fr[p] / M * TAU * dir;
            g.beginPath(); g.arc(cx, cy, ro, a, a + da, dir < 0); g.arc(cx, cy, ri, a + da, a, dir > 0); g.closePath();
            g.fillStyle = pal[order[p]]; g.fill();
            a += da;
          }
        }
      }
      disc(g, cx, cy, R - rings * w, '#8a8a8a');
    }
  },
  why: [
    ['sure', '絵は1ミリも動いていません。輪の模様は「黒 → 濃い色 → 白 → 薄い色」の順にくり返していて、この順番がそろっているときだけ、黒から濃い色の向き（白から薄い色の向き）に動いて見えます。順番を変えると消えます。'],
    ['theory', 'コントラストの強い所（黒と白）は、弱い所（灰色や薄い色）より脳に早く届くので、その時間差が「動き」の信号として読まれる、という説明。目が動いたりまばたきしたりして模様が新しく映るたびに起きるので、見つめると止まります。'],
    ['sure', 'まわりの視野でよく起きます。見えにくい人もいて、年齢が上がると弱くなるという報告もあります。'],
  ],
  facts: [
    '1979年にフレイザーとウィルコックスが見つけ、1999年に「周辺ドリフト錯視」と名づけられました。北岡明佳さん（立命館大学）と蘆田宏さんが2003年に、強く動いて見える並べ方を見つけ、「蛇の回転」という作品で世界中に知られました。',
    'この展示の絵は、その原理を使ってこのアプリが描いたものです（作品そのものではありません）。',
  ],
});
