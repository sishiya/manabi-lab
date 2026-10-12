// The mould picture book (図鑑): 8 entries. For each: how it looks under the microscope (side view of the spore-making
// structure), how the colony looks to the eye, where it lives at home, the conditions it needs, and notes.
// sp: index in SPECIES when the same mould grows in the sandbox (then "found" can be shown).

const ZUKAN = [
  { id: 'clado', sp: 0, name: 'クロカビ', sci: 'クラドスポリウム（Cladosporium）', kind: 'カビ',
    col: '#2b3324', spore: '#3d4a33', looks: '黒〜こい緑。ビロードのような短い毛',
    where: ['浴室のゴムパッキン・目地', '窓のゴムパッキン（結露）', '外の空気（いちばん多い）'],
    aw: 0.86, T: [-3, 22, 32],
    shape: '柄の先から、楕円の胞子が枝分かれした鎖になってつながる。胞子は長さ 3〜7µm ほど',
    notes: [['sure', '外の空気の胞子でいちばん多いのがこのなかま。家の中にも窓や換気から入ってくる'],
      ['sure', '吸いこむと、ぜんそく・鼻炎などアレルギーの原因になることがある'],
      ['sure', '黒い色は菌糸と胞子の壁のメラニン。乾燥や紫外線に強くなる']] },
  { id: 'peni', sp: 1, name: 'アオカビ', sci: 'ペニシリウム（Penicillium）', kind: 'カビ',
    col: '#3c6f5e', spore: '#5fa58a', looks: '青緑で、ふちが白い。粉っぽい',
    where: ['みかん・パン・もち', '押し入れ・北の壁', '冷蔵庫の中（寒くても育つ）'],
    aw: 0.82, T: [0, 24, 35],
    shape: '柄の先が、ほうき（筆）のように枝分かれし、その先に丸い胞子の鎖がのびる。名前はラテン語の「筆」から',
    notes: [['sure', '1928年、フレミングが見つけた抗生物質ペニシリンは、アオカビのなかまが作っていた'],
      ['sure', 'みかんの青い・緑のカビもこのなかま（種類はちがう）'],
      ['sure', '種類によっては、体に悪い物質（カビ毒）を作るものもある。生えた食べものは食べない']] },
  { id: 'asp', sp: 2, name: 'コウジカビのなかま', sci: 'アスペルギルス（Aspergillus）', kind: 'カビ',
    col: '#7d7d3a', spore: '#c2c25a', looks: '種類で黄緑・黒・白など。粉っぽい',
    where: ['ほこり・壁', 'エアコンの中', 'ナッツ・穀物'],
    aw: 0.79, T: [8, 29, 42],
    shape: '柄の先がふくらんだ丸い頭（頂のう）になり、そのまわりから胞子の鎖が放射状にのびる',
    notes: [['sure', '日本酒・みそ・しょうゆを作る麹菌（ニホンコウジカビ）もこのなかま'],
      ['sure', 'なかまの一部（アスペルギルス・フラバス）は、強いカビ毒アフラトキシンを作る'],
      ['sure', '体の抵抗力が弱い人では、肺の病気（アスペルギルス症）の原因になることがある']] },
  { id: 'xero', sp: 3, name: 'カワキコウジカビ', sci: 'アスペルギルス・レストリクタス のなかま', kind: 'カビ',
    col: '#6f8a7c', spore: '#9fb8aa', looks: '灰緑で小さく、ゆっくり広がる',
    where: ['押し入れ・畳', '本・革製品', 'ほこりの中'],
    aw: 0.76, T: [10, 26, 38],
    shape: '小さな頭から、胞子が柱のようにまっすぐ積み重なる',
    notes: [['sure', '湿度 75% くらいでも育つ「乾きに強い」カビ。ほかのカビが育たない所で目立つ'],
      ['est', 'そのかわり育つのはとてもゆっくり。湿った所では、ほかのカビに負けやすい']] },
  { id: 'rhizo', sp: -1, name: 'クモノスカビ', sci: 'リゾプス（Rhizopus）', kind: 'カビ',
    col: '#9a9a92', spore: '#26261f', looks: '白〜灰色のふわふわした綿に、黒いつぶつぶ',
    where: ['パン・果物・もち', '野菜'],
    aw: 0.93, T: [5, 28, 37],
    shape: '根のような仮根で食べものにしがみつき、クモの巣のような走出枝でとなりへ広がる。高い柄の先の黒い丸い袋（胞子のう）の中に、胞子がたくさん入っている',
    notes: [['sure', '育つのがとても速く、パンなら数日で表面をおおう'],
      ['sure', 'インドネシアの発酵食品テンペは、なかまのリゾプスで大豆を固めて作る'],
      ['sure', 'えさの多い食べものでは、見えている所より奥まで菌糸が入りこんでいる']] },
  { id: 'alter', sp: -1, name: 'ススカビ', sci: 'アルテルナリア（Alternaria）', kind: 'カビ',
    col: '#4d4f43', spore: '#5b4a35', looks: 'こい灰色〜黒っぽい緑。毛足が長い',
    where: ['窓のサッシ・結露', 'エアコン', '野菜・果物'],
    aw: 0.86, T: [2, 25, 36],
    shape: 'こん棒の形をした茶色の胞子が鎖になる。胞子の中は、たて・よこのしきりで部屋に分かれている',
    notes: [['sure', 'ぜんそくの原因になるカビとして知られている'],
      ['est', '胞子が大きめ（長さ 20〜60µm）で、目立つ形をしている']] },
  { id: 'fusa', sp: -1, name: 'アカカビ', sci: 'フザリウム（Fusarium）', kind: 'カビ',
    col: '#c67a92', spore: '#e7b7c4', looks: 'ピンク〜赤むらさき。綿のよう',
    where: ['浴室・台所の流し', '小麦・とうもろこし'],
    aw: 0.88, T: [5, 25, 35],
    shape: 'バナナやカヌーの形に曲がった、しきりのある大きな胞子を作る',
    notes: [['sure', '畑の小麦などに付くと、カビ毒（デオキシニバレノールなど）を作ることがある'],
      ['sure', '水が好きなので、いつもぬれている所に出やすい']] },
  { id: 'rhodo', sp: -1, name: 'ピンクのぬめり', sci: 'ロドトルラ（Rhodotorula）', kind: '酵母（カビではない）',
    col: '#e08aa0', spore: '#f0a9b8', looks: 'ピンク〜オレンジのぬるぬる',
    where: ['浴室の床・排水口', '石けん置き'],
    aw: 0.9, T: [5, 25, 35],
    shape: '菌糸をのばさない。丸い細胞が、出芽（こぶのように分かれる）で増える',
    notes: [['sure', 'カビではなく酵母。ピンク色は、にんじんと同じカロテノイドのなかま'],
      ['sure', 'カビより速く数日で出るが、こすれば落ちやすい'],
      ['est', '出てきたら「湿っていて、えさがある」合図。黒カビの前ぶれと考えるとよい']] },
];
ZUKAN.forEach(z => { z.isMold = z.kind === 'カビ'; });
// 英語（I18N.md）: 同じ id に文を上書きする。種類を足したら、ここにも足す
if (LANG === 'en') Object.entries({
  clado: { name: 'Black mold', sci: 'Cladosporium', kind: 'mold', looks: 'Black to dark green, like short velvet',
    where: ['Bathroom rubber seals and grout', 'Window rubber seals (condensation)', 'Outdoor air (the most common)'],
    shape: 'Oval spores grow from the tip of the stalk in branching chains. Each spore is about 3–7 µm long',
    notes: [['sure', 'This group makes up the most spores in outdoor air. They also come indoors through windows and vents'],
      ['sure', 'Breathing them in can cause allergies such as asthma and runny nose'],
      ['sure', 'The black color is melanin in the walls of the hyphae and spores. It makes them tougher against drying and UV light']] },
  peni: { name: 'Blue-green mold', sci: 'Penicillium', kind: 'mold', looks: 'Blue-green with a white edge. Powdery',
    where: ['Mandarin oranges, bread, rice cakes', 'Closets, north-facing walls', 'Inside the fridge (grows even in the cold)'],
    shape: 'The tip of the stalk branches like a broom (or brush), and chains of round spores grow from the ends. The name comes from the Latin for “brush”',
    notes: [['sure', 'Penicillin, the antibiotic Fleming discovered in 1928, was made by a Penicillium mold'],
      ['sure', 'The blue and green mold on oranges belongs to this group too (a different species)'],
      ['sure', 'Some kinds make substances harmful to the body (mycotoxins). Do not eat moldy food']] },
  asp: { name: 'Aspergillus molds', sci: 'Aspergillus', kind: 'mold', looks: 'Yellow-green, black, white and more, depending on the kind. Powdery',
    where: ['Dust, walls', 'Inside air conditioners', 'Nuts, grains'],
    shape: 'The tip of the stalk swells into a round head (vesicle), and chains of spores radiate out from all around it',
    notes: [['sure', 'Kōji mold (Aspergillus oryzae), used to make sake, miso and soy sauce, belongs to this group'],
      ['sure', 'Some members (Aspergillus flavus) make aflatoxin, a powerful mycotoxin'],
      ['sure', 'In people with weak immune systems, it can cause lung disease (aspergillosis)']] },
  xero: { name: 'Dry-loving Aspergillus', sci: 'Aspergillus restrictus group', kind: 'mold', looks: 'Small and gray-green; spreads slowly',
    where: ['Closets, tatami mats', 'Books, leather goods', 'In dust'],
    shape: 'From a small head, spores stack straight up like columns',
    notes: [['sure', 'A “drought-tolerant” mold that grows even at about 75% humidity. It stands out where other molds can’t grow'],
      ['est', 'In exchange, it grows very slowly. In damp places it tends to lose out to other molds']] },
  rhizo: { name: 'Bread mold', sci: 'Rhizopus', kind: 'mold', looks: 'White to gray fluffy cotton with black dots',
    where: ['Bread, fruit, rice cakes', 'Vegetables'],
    shape: 'It holds onto food with root-like rhizoids and spreads sideways with spider-web-like runners (stolons). Many spores are packed in round black sacs (sporangia) on top of tall stalks',
    notes: [['sure', 'It grows very fast and can cover the surface of bread in a few days'],
      ['sure', 'Tempeh, a fermented food from Indonesia, is made by binding soybeans with a Rhizopus mold'],
      ['sure', 'In food with lots of nutrients, hyphae reach deeper than the part you can see']] },
  alter: { name: 'Sooty mold', sci: 'Alternaria', kind: 'mold', looks: 'Dark gray to blackish green. Long, fuzzy',
    where: ['Window frames, condensation', 'Air conditioners', 'Vegetables, fruit'],
    shape: 'Brown club-shaped spores form chains. Inside, each spore is divided into rooms by walls running across and lengthwise',
    notes: [['sure', 'Known as a mold that can cause asthma'],
      ['est', 'Its spores are fairly large (20–60 µm long) with a distinctive shape']] },
  fusa: { name: 'Pink mold', sci: 'Fusarium', kind: 'mold', looks: 'Pink to reddish purple. Like cotton',
    where: ['Bathrooms, kitchen sinks', 'Wheat, corn'],
    shape: 'Makes large curved spores divided by walls, shaped like bananas or canoes',
    notes: [['sure', 'On wheat in the field it can make mycotoxins (such as deoxynivalenol)'],
      ['sure', 'It likes water, so it tends to appear where things are always wet']] },
  rhodo: { name: 'Pink slime', sci: 'Rhodotorula', kind: 'yeast (not a mold)', looks: 'Pink to orange slime',
    where: ['Bathroom floors and drains', 'Soap dishes'],
    shape: 'Does not grow hyphae. Round cells multiply by budding (splitting off like a bump)',
    notes: [['sure', 'Not a mold but a yeast. The pink color comes from carotenoids, the same family of pigments as in carrots'],
      ['sure', 'It shows up faster than mold, within days, but scrubs off easily'],
      ['est', 'If it appears, it is a sign that the spot is “damp and has food”. Think of it as an early warning of black mold']] },
}).forEach(([id, v]) => Object.assign(ZUKAN.find(z => z.id === id), v));
const ZK = { sel: 'clado', found: {} };

// ---- drawings ----
function zkSpore(g, x, y, rx, ry, a, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.8; g.stroke(); }
// side view at the microscope: surface at the bottom, hyphae, the spore-making structure
function zkDrawStructure(cv, e) {
  const W_ = cv.clientWidth, H_ = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W_ < 50) return;
  cv.width = W_ * dpr; cv.height = H_ * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = g.createLinearGradient(0, 0, 0, H_); bg.addColorStop(0, '#1b2420'); bg.addColorStop(1, '#232e29');
  g.fillStyle = bg; g.fillRect(0, 0, W_, H_);
  const base = H_ - 34, rnd = mulberry(e.id.length * 31 + 7), cx = W_ / 2, u = Math.min(W_ / 300, H_ / 220);
  const hy = e.id === 'clado' || e.id === 'alter' ? '#8d8a63' : e.id === 'fusa' ? '#e8c9d2' : '#dfe8d8';
  // the surface (food / wall)
  g.fillStyle = '#4a4436'; g.fillRect(0, base, W_, H_ - base);
  g.strokeStyle = hy; g.lineCap = 'round';
  if (e.id !== 'rhodo') {   // hyphae along the surface
    g.lineWidth = 2.2 * u;
    for (let k = 0; k < 3; k++) { g.beginPath(); let x = 0, y = base - 2 - k * 2; g.moveTo(x, y); while (x < W_) { x += 14 * u; y = base - 2 - k * 2 + (rnd() - 0.5) * 4; g.lineTo(x, y); } g.stroke(); }
  }
  const stalk = (x, h, lean) => { g.strokeStyle = hy; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(x, base - 2); g.quadraticCurveTo(x + lean * 0.5, base - h * 0.5, x + lean, base - h); g.stroke(); return [x + lean, base - h]; };
  const sc = e.spore;
  if (e.id === 'clado') {
    for (const [x, h, l] of [[cx - 70 * u, 90 * u, -6], [cx, 125 * u, 4], [cx + 75 * u, 80 * u, 8]]) {
      const [tx, ty] = stalk(x, h, l * u);
      const chain = (px, py, a, n, d) => { for (let q = 0; q < n; q++) { const nx = px + Math.sin(a) * 9 * u, ny = py - Math.cos(a) * 9 * u; zkSpore(g, (px + nx) / 2, (py + ny) / 2, 3 * u, 5 * u, a, sc); px = nx; py = ny; if (q === 1 && d < 2) { chain(px, py, a - 0.5, n - 2, d + 1); chain(px, py, a + 0.5, n - 2, d + 1); return; } } };
      chain(tx, ty, 0, 8, 0);
    }
  } else if (e.id === 'peni') {
    for (const [x, h, l] of [[cx - 60 * u, 110 * u, -5], [cx + 50 * u, 135 * u, 6]]) {
      const [tx, ty] = stalk(x, h, l * u);
      for (let i = -1; i <= 1; i++) {
        const a1 = i * 0.32, mx = tx + Math.sin(a1) * 13 * u, my = ty - Math.cos(a1) * 13 * u;
        g.strokeStyle = hy; g.lineWidth = 2.6 * u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(mx, my); g.stroke();
        for (let k = -1; k <= 1; k++) {
          const a2 = a1 + k * 0.17, fx = mx + Math.sin(a2) * 10 * u, fy = my - Math.cos(a2) * 10 * u;
          g.strokeStyle = hy; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(mx, my); g.lineTo(fx, fy); g.stroke();
          for (let q = 0; q < 8; q++) zkSpore(g, fx + Math.sin(a2) * (q + 0.7) * 5 * u, fy - Math.cos(a2) * (q + 0.7) * 5 * u, 2.3 * u, 2.3 * u, 0, sc);
        }
      }
    }
  } else if (e.id === 'asp' || e.id === 'xero') {
    const xero = e.id === 'xero';
    for (const [x, h, l] of xero ? [[cx - 50 * u, 70 * u, -3], [cx + 40 * u, 90 * u, 4]] : [[cx, 120 * u, 3]]) {
      const [tx, ty] = stalk(x, h, l * u), vr = (xero ? 6 : 14) * u;
      g.fillStyle = hy; g.beginPath(); g.arc(tx, ty, vr, 0, 7); g.fill();
      const n = xero ? 5 : 15, spread = xero ? 0.45 : 1.45, len = xero ? 11 : 8;
      for (let i = 0; i < n; i++) { const a = -spread + 2 * spread * i / (n - 1); for (let q = 0; q < len; q++) zkSpore(g, tx + Math.sin(a) * (vr + (q + 0.8) * 5 * u), ty - Math.cos(a) * (vr + (q + 0.8) * 5 * u), 2.4 * u, 2.4 * u, 0, sc); }
    }
  } else if (e.id === 'rhizo') {
    // stolon arching between two anchor points, rhizoids below, tall stalks with round black sacs
    const x0 = cx - 90 * u, x1 = cx + 90 * u;
    g.strokeStyle = hy; g.lineWidth = 2.5 * u; g.beginPath(); g.moveTo(x0, base - 2); g.quadraticCurveTo(cx, base - 70 * u, x1, base - 2); g.stroke();
    for (const ax of [x0, x1]) {
      for (let k = 0; k < 5; k++) { g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(ax, base); g.lineTo(ax + (k - 2) * 7 * u, base + 12 + rnd() * 10); g.stroke(); }
      for (const [dx, h] of [[-8, 120], [6, 145], [18, 105]]) {
        const [tx, ty] = stalk(ax + dx * u, h * u, dx * 0.4 * u);
        g.fillStyle = '#c8c8be'; g.beginPath(); g.arc(tx, ty + 3 * u, 6 * u, Math.PI, 0); g.fill();   // columella
        g.fillStyle = sc; g.beginPath(); g.arc(tx, ty - 2 * u, 13 * u, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.25)'; for (let q = 0; q < 10; q++) { g.beginPath(); g.arc(tx + (rnd() - 0.5) * 18 * u, ty - 2 * u + (rnd() - 0.5) * 18 * u, 1.2 * u, 0, 7); g.fill(); }
      }
    }
  } else if (e.id === 'alter') {
    for (const [x, h, l] of [[cx - 50 * u, 70 * u, -4], [cx + 40 * u, 60 * u, 5]]) {
      let [tx, ty] = stalk(x, h, l * u);
      for (let q = 0; q < 3; q++) {   // club-shaped spores with cross walls, beak on top
        const L = 26 * u, w = 9 * u, cy = ty - L / 2;
        g.fillStyle = sc; g.beginPath(); g.ellipse(tx, cy, w, L / 2, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(20,14,8,.8)'; g.lineWidth = 1;
        for (let s = 1; s < 4; s++) { g.beginPath(); g.moveTo(tx - w * 0.9, cy - L / 2 + s * L / 4); g.lineTo(tx + w * 0.9, cy - L / 2 + s * L / 4); g.stroke(); }
        g.beginPath(); g.moveTo(tx, cy - L / 3); g.lineTo(tx, cy + L / 4); g.stroke();
        g.strokeStyle = sc; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(tx, cy - L / 2); g.lineTo(tx, cy - L / 2 - 6 * u); g.stroke();
        ty = cy - L / 2 - 6 * u;
      }
    }
  } else if (e.id === 'fusa') {
    for (const [x, h] of [[cx - 70 * u, 50 * u], [cx + 10 * u, 60 * u], [cx + 80 * u, 45 * u]]) {
      const [tx, ty] = stalk(x, h, 0);
      for (let k = 0; k < 3; k++) {   // banana-shaped macroconidia
        const ox = tx + (k - 1) * 22 * u, oy = ty - 22 * u - k * 6 * u;
        g.strokeStyle = sc; g.lineWidth = 7 * u; g.beginPath(); g.arc(ox, oy + 30 * u, 32 * u, -Math.PI * 0.72, -Math.PI * 0.28); g.stroke();
        g.strokeStyle = 'rgba(120,60,80,.7)'; g.lineWidth = 1;
        for (let s = 1; s < 5; s++) { const a = -Math.PI * 0.72 + s * (Math.PI * 0.44) / 5; g.beginPath(); g.moveTo(ox + Math.cos(a) * 28.5 * u, oy + 30 * u + Math.sin(a) * 28.5 * u); g.lineTo(ox + Math.cos(a) * 35.5 * u, oy + 30 * u + Math.sin(a) * 35.5 * u); g.stroke(); }
      }
    }
  } else {   // rhodo: budding round cells
    for (let k = 0; k < 26; k++) {
      const x = cx + (rnd() - 0.5) * 200 * u, y = base - 10 * u - rnd() * 70 * u, r = (6 + rnd() * 3) * u;
      zkSpore(g, x, y, r, r * 0.85, rnd(), sc);
      if (rnd() < 0.4) zkSpore(g, x + r * 0.9, y - r * 0.7, r * 0.45, r * 0.4, 0, sc);
    }
  }
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.fillStyle = 'rgba(238,242,234,.7)'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(e.id === 'rhodo' ? L('顕微鏡（約1000倍）で見た細胞', 'Cells under the microscope (about 1000×)') : L('顕微鏡（約400倍）で横から見たところ', 'Side view under the microscope (about 400×)'), 8, 12);
  g.fillText(e.id === 'rhizo' ? L('食べもの', 'food') : L('表面', 'surface'), 8, base + 14);
}
// the colony as the eye sees it (on a plate)
function zkDrawColony(cv, e) {
  const S = cv.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (S < 20) return;
  cv.width = cv.height = S * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#e9e4d6'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, 7); g.fill();
  const r = S * 0.36, x = S / 2, y = S / 2, rnd = mulberry(e.id.length * 13 + 5);
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  const edge = { peni: '#f2f4ee', asp: '#eef0dc', rhizo: '#f5f5f0', fusa: '#f3e6ea', rhodo: e.col, xero: '#e6ece8' }[e.id] || mixHexZ(e.col, '#cfcfc0', 0.4);
  grd.addColorStop(0, mixHexZ(e.col, '#000000', 0.15)); grd.addColorStop(0.65, e.col); grd.addColorStop(0.88, edge); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 1.05, 0, 7); g.fill();
  if (e.id === 'rhodo') { g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.12, -0.5, 0, 7); g.fill(); return; }
  // texture: fuzz at the edge, rings, black dots for Rhizopus
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.7;
  for (let i = 0; i < 90; i++) { const a = i / 90 * 6.283 + rnd() * 0.05, l = r * (0.06 + rnd() * (e.id === 'rhizo' || e.id === 'alter' || e.id === 'fusa' ? 0.22 : 0.1)); g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.lineTo(x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l)); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.15)'; for (const f of [0.35, 0.6]) { g.beginPath(); g.arc(x, y, r * f, 0, 7); g.stroke(); }
  if (e.id === 'rhizo') { g.fillStyle = '#1d1d18'; for (let i = 0; i < 70; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r * 0.9; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + rnd() * 1.3, 0, 7); g.fill(); } }
}
function mixHexZ(a, b, f) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join(''); }

// ---- the dialog ----
function zkCondBar(label, v, lo, hi, txt) {
  const p = clamp((v - lo) / (hi - lo), 0, 1) * 100;
  return `<div class="zbar"><span>${label}</span><i><b style="left:${p}%"></b></i><em>${txt}</em></div>`;
}
function zkRender() {
  const e = ZUKAN.find(z => z.id === ZK.sel);
  const FOUND = L('箱庭で見つけた', 'found in the garden');
  $('zkList').innerHTML = ZUKAN.map(z => `<button data-id="${z.id}" aria-pressed="${z.id === ZK.sel}"><canvas class="zmini" data-id="${z.id}"></canvas><span>${z.name}${ZK.found[z.id] ? `<small class="found">${FOUND}</small>` : `<small>${z.isMold ? '' : z.kind}</small>`}</span></button>`).join('');
  $('zkList').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { ZK.sel = b.dataset.id; zkRender(); }));
  $('zkList').querySelectorAll('canvas.zmini').forEach(c => zkDrawColony(c, ZUKAN.find(z => z.id === c.dataset.id)));
  $('zkDetail').innerHTML = `
    <div class="zhead"><h3>${e.name}</h3><span class="zsci">${e.sci}${!e.isMold ? L('・', ' · ') + e.kind : ''}</span>${ZK.found[e.id] ? `<span class="found">${FOUND}</span>` : ''}</div>
    <div class="zpics"><canvas id="zkStruct"></canvas><div class="zcol"><canvas id="zkColony"></canvas><p>${L('目で見ると: ', 'To the eye: ')}${e.looks}</p></div></div>
    <p class="zshape">${tagHtml('sure')} ${e.shape}</p>
    <div class="zconds">
      ${zkCondBar(L('育つ湿り気', 'Dampness needed'), e.aw, 0.7, 1, L(`水分活性 約${e.aw.toFixed(2)} 以上`, `water activity ≥ about ${e.aw.toFixed(2)}`))}
      ${zkCondBar(L('よく育つ温度', 'Best temperature'), e.T[1], 0, 40, L(`約${e.T[1]}℃（${e.T[0]}〜${e.T[2]}℃）`, `about ${e.T[1]}℃ (${e.T[0]}–${e.T[2]}℃)`))}
      <p class="hint">${L('湿り気の目安: 0.76 で乾き気味の押し入れ、0.86 以上でぬれやすい浴室、0.93 以上は食べもの並み。数値は研究のおおよその値', 'Rough guide to dampness: 0.76 is a dry-ish closet, 0.86 and up is a bathroom that gets wet, 0.93 and up is like food. Values are approximate figures from research')} ${tagHtml(e.sp >= 0 ? 'sure' : 'est')}</p>
    </div>
    <p class="zwhere"><b>${L('家の中でいる所', 'Where it lives at home')}</b>${e.where.map(w => `<span>${w}</span>`).join('')}</p>
    <ul class="znotes">${e.notes.map(([t, s]) => `<li>${tagHtml(t)} ${s}</li>`).join('')}</ul>`;
  zkDrawStructure($('zkStruct'), e);
  zkDrawColony($('zkColony'), e);
}
// the picture book is its own page (tab); it draws when the tab is shown (showPage in main.js) and on resize
function buildZukan() {
  window.addEventListener('resize', () => { if (UI.page === 'zukan') zkRender(); });
}
// mark species that made spores in the sandbox
function zkNoteFound() { if (W.stats.foundSp) for (const z of ZUKAN) if (z.sp >= 0 && W.stats.foundSp[z.sp]) ZK.found[z.id] = true; }
