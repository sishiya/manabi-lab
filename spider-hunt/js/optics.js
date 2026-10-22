// クモがハエをつかまえるまで — 主眼の光学（ぼけで距離を測るしくみ。Nagata ほか 2012, Science 335:469）
// 薄いレンズの式 1/d + 1/v = 1/F。色でレンズの焦点距離がちがう（色収差。赤のほうが長い）。
// 緑の光は奥の L1 にピントが合い、手前の L2 はいつもぼける。L2 のぼけの量が距離で変わる → 距離がわかる（仮説。神経でどう比べるかの証拠はまだない）。
// Node でも読める（tools/verify.js）。
'use strict';
(function (root) {

const OPT = {
  // 赤と緑の焦点距離のちがい f = 1/Fg − 1/Fr（1/mm）。付録の表 S1 は未確認なので、論文の「赤い光では跳ぶ距離が実際の約0.90倍」
  // （距離 1〜3cm の実験）から、2cm で比 0.90 になる値を逆算した（推定）
  fRG: (1 / 0.90 - 1) / 20,
  // ぼけの絵を描くための目安の数（論文に数がない／種もちがう）: 緑の焦点距離・レンズの口径・L1 と L2 の間
  Fg: 0.5, A: 0.3, dL12: 0.015,
  dRef: 20,   // L1 にピントが合う距離（目安。L1 は階段状で、ピントの合う距離の幅を広げているかもしれない: Blest ほか）
};
const Fr = () => 1 / (1 / OPT.Fg - OPT.fRG);

// 像のできる距離（mm）
function imageDist(d, F) { return 1 / (1 / F - 1 / d); }
// 網膜の層の位置（レンズからの距離 mm）
function layers() { const z1 = imageDist(OPT.dRef, OPT.Fg); return { L1: z1, L2: z1 - OPT.dL12 }; }
// 面 z でのぼけの直径（mm）。口径 A の光の円すいを、焦点からずれた面で切った大きさ
function blur(d, F, z) { const v = imageDist(d, F); return OPT.A * Math.abs(v - z) / v; }
// クモが見積もる距離。緑の光では正しい。赤い光だけだと、同じ L2 のぼけを生む「緑での距離」d′ = d/(1+f·d) と読みちがえる（Nagata の式1）
function estimate(d, color) { return color === 'red' ? d / (1 + OPT.fRG * d) : d; }

const API = { OPT, Fr, imageDist, layers, blur, estimate };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.OP = API;
})(typeof window !== 'undefined' ? window : globalThis);
