// 細菌にとりつくウイルス — 数値と文（大きさは nm、時間は分。出どころは PLAN.md と画面の「このアプリについて」）
'use strict';

// T4 ファージの大きさ（nm）
const T4 = {
  headLen: 120, headW: 86,          // 頭（Rao ら 2023 の総説: 120×86nm）
  neck: 8,                          // 首（えり）。模式
  sheathLen: 92.5, sheathShort: 42, // しっぽのさや 縮む前 92.5nm → 縮んだあと 42nm（Leiman ら 2010。Miller ら 2003 は 98.4→36nm）
  sheathW: 24, sheathWShort: 33,    // さやの太さ 24nm → 縮むと 33nm（Leiman ら 2010）
  tubeW: 9,                         // 中の管（模式）
  plateW: 52, plateWStar: 61,       // 基盤 六角形 → 星形（模式の値。Taylor ら 2016 の形の変わり方）
  fib1: 70, fib2: 75,               // 長い脚 根もと側・先側（あわせて約145nm。Yap と Rossmann 2014）
  genomeBp: 168903,                 // DNA の長さ（Miller ら 2003）
  bpNm: 0.34,                       // 1塩基対の長さ（nm）。168,903 × 0.34nm ≈ 57µm
};

// ブラウン運動（ストークス・アインシュタインの見積もり。ファージを半径約75nmの球とみなす）
const BROWN = { D: 3e6 /* nm²/秒 */, Dr: 400 /* rad²/秒 */, slow: 1e-4 /* 画面の1秒 = 0.1ミリ秒 */ };

// 着陸の場面で選べる細菌。layers は外側（y=0）から下へ（nm）
const HOSTS = {
  k12: {
    name: L('大腸菌 K-12', "E. coli K-12"), short: 'K-12', gram: '-', receptor: 'ompc',
    desc: L('実験でいちばん使われる大腸菌。T4 の長い脚は外膜のたんぱく質 <b>OmpC</b>（穴の開いた筒）の先にくっつく。', "The E. coli used most in labs. T4's long legs stick to the tip of <b>OmpC</b>, an outer-membrane protein (a tube with a hole)."),
    recName: 'OmpC', lps: 'short', ompc: true, ompf: true,
  },
  b: {
    name: L('大腸菌 B', "E. coli B"), short: 'B', gram: '-', receptor: 'lps',
    desc: L('もうひとつの実験用の大腸菌。<b>OmpC を持っていない</b>。T4 は外膜の表面の糖の鎖（LPS）の<b>ブドウ糖</b>を目印にくっつく。', "Another lab strain of E. coli. It <b>has no OmpC</b>. T4 sticks to the <b>glucose</b> on the sugar chains (LPS) of the outer surface instead."),
    recName: L('LPS のブドウ糖', "Glucose of LPS"), lps: 'glc', ompc: false, ompf: true,
  },
  mut: {
    name: L('受け手をなくした大腸菌', "E. coli that lost its receptors"), short: L('変異', "mutant"), gram: '-', receptor: null,
    desc: L('K-12 の変異。<b>OmpC がなく、LPS の糖の鎖も短い</b>（ブドウ糖まで届かない）。T4 がくっつく印がどこにもない。こうした変異で T4 が効かなくなる。', "A K-12 mutant. <b>No OmpC, and its LPS sugar chains are short</b> (they do not reach the glucose). T4 has nothing to grab. Mutations like this make T4 stop working."),
    recName: L('なし', "none"), lps: 'cut', ompc: false, ompf: true,
  },
  bsub: {
    name: L('枯草菌', "Bacillus subtilis"), short: L('枯草菌', "Bacillus subtilis"), gram: '+', receptor: null,
    desc: L('納豆菌のなかま（グラム陽性）。<b>外膜がなく</b>、細胞壁（ペプチドグリカン）が厚い。T4 の印はない。', "A relative of the natto bacterium (Gram-positive). <b>No outer membrane</b> and a thick cell wall (peptidoglycan). It has no T4 receptor."),
    recName: L('なし', "none"), lps: null, ompc: false, ompf: false,
  },
};
// 細胞の外側の層（nm）。大腸菌は Matias ら 2003（凍らせた切片の電子顕微鏡）のおおよその値。枯草菌の壁は20〜80nm（ここでは約35）
const ENV_NEG = { om: [0, -7], pg: [-10, -16], im: [-28, -35] };
const ENV_POS = { pg: [0, -35], im: [-38, -45] };

// 細菌の中の時刻（分。37℃・栄養のある液での目安。条件で変わる）
const TL = {
  hostStop: 1,      // 細菌のたんぱく質が作られなくなる（Miller ら 2003: 感染1分後には細菌のたんぱく質がほぼ見えない）
  hostDnaFrom: 2, hostDnaTo: 10, // 細菌の DNA がこわされる（目安の幅。推定）
  exclusion: 4,     // 重感染排除（Miller ら 2003: 約4分で、あとから来たファージの DNA は外膜と内膜のあいだへ）
  repl: 5,          // T4 の DNA のコピーが始まる（約5分）
  lin: 5,           // 溶菌阻止が起きるようになる（Miller ら 2003: 5分以降に別のファージが来ると溶菌が大きくおくれる）
  late: 9,          // 頭・しっぽ・脚の部品（後期の遺伝子。約9分）
  packBp: 700, packBpMax: 2000, // 頭に DNA をつめるモーター（Fuller ら 2007: 平均約700 bp/秒、最大約2000）
  lysis: [22, 25],  // 破裂（約22〜25分）
  linLysis: 60,     // 溶菌阻止のときの破裂（実際は数十分〜数時間。アプリでは60分にする）
};

// ルーペの説明。kind: sure=研究の値・確かなこと, est=目安・推定, art=模式（見せ方）
const INFO = {
  envelope: { z: 'attach', t: L('細菌の外側（外膜・細胞壁・内膜）', "Cell envelope (outer membrane, cell wall, inner membrane)"), k: 'sure', b: L('大腸菌は2枚の膜にはさまれた細胞壁（ペプチドグリカン）を持つ。外膜は約7nm、全体で30〜40nm ほど（Matias ら 2003）。T4 の管はここを突きぬける。', "E. coli has a cell wall (peptidoglycan) sandwiched between two membranes. The outer membrane is about 7 nm, about 30-40 nm in all (Matias et al. 2003). T4's tube pierces through here.") },
  hostDna: { z: 'cut', t: L('細菌の DNA（核様体）', "Bacterial DNA (nucleoid)"), k: 'est', b: L('大腸菌の DNA は約460万塩基対。T4 の酵素がこわして細かくし、T4 の DNA の材料にする。こわれる時刻はここでは2〜10分の目安。', "E. coli DNA is about 4.6 million base pairs. T4 enzymes chop it into small pieces and use them to build T4 DNA. Here it breaks down over 2 to 10 minutes (rough guide).") },
  ribo: { z: 'read', t: L('リボソーム（たんぱく質の工場）', "Ribosome (protein factory)"), k: 'sure', b: L('細菌の工場はそのまま、作る物だけが T4 のたんぱく質に入れかわる。感染から1分で細菌自身のたんぱく質はほとんど作られなくなる（Miller ら 2003）。', "The bacterial factory stays the same; only the product switches to T4 proteins. About 1 minute after infection, the bacterium makes almost none of its own proteins (Miller et al. 2003).") },
  t4Dna: { z: 'copy', t: L('T4 の DNA', "T4 DNA"), k: 'sure', b: L('168,903 塩基対、約300の遺伝子（Miller ら 2003）。シトシンのかわりに、ブドウ糖のついたヒドロキシメチルシトシンを使うので、細菌の多くの制限酵素に切られない。約5分からコピーが始まる。', "168,903 base pairs and about 300 genes (Miller et al. 2003). Instead of cytosine it uses hydroxymethylcytosine with glucose attached, so most bacterial restriction enzymes cannot cut it. Copying starts at about 5 minutes.") },
  early: { z: 'read', t: L('早い時期の T4 のたんぱく質', "Early T4 proteins"), k: 'est', b: L('細菌の DNA をこわす酵素、T4 の DNA をコピーする酵素など。最初の数分で作られる（数は模式）。', "Enzymes that break down bacterial DNA, enzymes that copy T4 DNA, and more. Made in the first few minutes (numbers are schematic).") },
  head: { z: 'head', t: L('頭（からっぽの殻 → DNA をつめる）', "Head (empty shell → filled with DNA)"), k: 'sure', b: L('120×86nm の細長い正二十面体。根もとのモーターが DNA を押しこむ（平均 毎秒約700塩基対、最大約2000。Fuller ら 2007）。いっぱいになるまで（ゲノムより約3%長い）つめて切る＝ヘッドフル。1つにつめるのに約4分かかる計算。', "An elongated icosahedron, 120×86 nm. A motor at its base pushes DNA in (about 700 base pairs per second on average, up to about 2,000; Fuller et al. 2007). It packs until full (about 3% longer than the genome) and cuts: headful packaging. Packing one head takes about 4 minutes by this estimate.") },
  tail: { z: 'tail', t: L('しっぽ（さやと管と基盤）', "Tail (sheath, tube and baseplate)"), k: 'sure', b: L('基盤 → 管 → さやの順に、頭とは別に組み立てられ、DNA のつまった頭にあとから付く。最後に長い脚が付いて完成。', "Built separately from the head, in the order baseplate → tube → sheath, and attached later to a head full of DNA. The long legs go on last.") },
  phage: { z: 'form', t: L('完成した T4 ファージ', "Finished T4 phage"), k: 'sure', b: L('最初の完成品は約12〜15分。破裂するまでに細菌1つの中に100〜150個たまる（Miller ら 2003）。', "The first finished phages appear at about 12-15 minutes. By the time it bursts, one bacterium holds 100-150 of them (Miller et al. 2003).") },
  holin: { z: 'lysis', t: L('ホリン（内膜に穴をあけるたんぱく）', "Holin (protein that makes holes in the inner membrane)"), k: 'sure', b: L('内膜にたまっていき、決まった時刻にいっせいに穴をあける。すると溶菌酵素（リゾチーム）が細胞壁に届いて、細菌が破れる。ホリンが穴をあける時刻が、破裂の時刻を決める（Miller ら 2003）。', "It builds up in the inner membrane and, at a set time, makes holes all at once. Then the lysis enzyme (lysozyme) reaches the cell wall and the bacterium bursts. The timing of the holin holes sets the time of bursting (Miller et al. 2003).") },
  second: { z: 'lysis', t: L('あとから来たファージの DNA', "DNA of a phage that came later"), k: 'sure', b: L('約4分すぎからは、あとから来たファージの DNA は中に入れず、外膜と内膜のあいだに捨てられる（重感染排除。Imm・Sp というたんぱく）。', "From about 4 minutes on, the DNA of a phage that arrives later cannot get in. It is dumped between the outer and inner membranes (superinfection exclusion, by proteins called Imm and Sp).") },
  cut: { z: 'cut', t: L('切られた DNA', "Cut DNA"), k: 'sure', b: L('DNA にブドウ糖の目印がない変異の T4 は、大腸菌の制限酵素（K-12 では McrBC）に切られる。この働きをなくした変異の大腸菌の中なら増えられる（Revel 1967）。細菌のほうは生き残る。', "A mutant T4 whose DNA lacks the glucose tags is cut by E. coli restriction enzymes (McrBC in K-12). It can grow only in mutant E. coli that lost this enzyme (Revel 1967). The bacterium survives.") },
};
