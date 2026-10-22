// クモがハエをつかまえるまで — クモの目の中（主眼の4層の網膜。ぼけで距離を知るしくみ）。模式図（※ 目印）
// 層の位置・ピントの位置は optics.js の薄いレンズの式。ただし層の間・ずれは見やすく大きくしてある（絶対の大きさは出さない）
'use strict';
const RT = (() => {
const C = SC.C;
const GREEN = '#7be38a', UV = '#b48cff', RED = '#ff6a5a';

// 獲物の小さなかげ（像のタイル用）
function preyIcon(g, cx, cy, sz, col) {
  if (!(sz > 2)) return;   // 枠がとても小さいときは描かない（半径がマイナスになるのを防ぐ）
  g.fillStyle = col;
  g.beginPath(); g.ellipse(cx, cy, sz * 0.42, sz * 0.2, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(cx + sz * 0.38, cy - sz * 0.02, sz * 0.13, sz * 0.15, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(cx - sz * 0.05, cy - sz * 0.2, sz * 0.32, sz * 0.08, -0.3, 0, 7); g.fill();
}

function draw(g, w, h, s, P) {
  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  if (w < 60 || h < 60) return;   // 隠れている・小さすぎるときは描かない
  const red = P.color === 'red', L = OP.layers(), D = Math.max(1, s.D);
  const narrow = w < 520;
  // --- 断面（左、または上）
  const dw = narrow ? w : w * 0.6, dh = narrow ? h * 0.58 : h;
  const lensX = dw * 0.18, cy = dh * 0.52, ap = dh * 0.32;           // レンズと口径（見た目）
  const xL1 = dw * 0.8, gap = Math.min(40, dw * 0.08);                // L1 と L2 の間を見やすく広げる
  const X = z => xL1 + (z - L.L1) / OP.OPT.dL12 * gap;               // 網膜の奥行き → 画面x
  // 層（奥から L1・L2 は緑、手前の L3・L4 は紫外線）
  const band = (x, wd, col, lab) => { g.fillStyle = col; g.globalAlpha = 0.28; g.fillRect(x, cy - ap * 1.15, wd, ap * 2.3); g.globalAlpha = 1; g.fillStyle = col; g.font = '11px "IBM Plex Mono",monospace'; g.textAlign = 'center'; g.fillText(lab, x + wd / 2, cy + ap * 1.15 + 13); };
  band(X(L.L1), 10, GREEN, 'L1'); band(X(L.L2) - 4, 8, GREEN, 'L2');
  band(X(L.L2) - gap * 0.75, 6, UV, 'L3'); band(X(L.L2) - gap * 1.4, 6, UV, 'L4');
  g.textAlign = 'left';
  // レンズ
  g.strokeStyle = 'rgba(232,240,244,.7)'; g.fillStyle = 'rgba(232,240,244,.08)'; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(lensX, cy, 7, Math.max(1, ap * 1.05), 0, 0, 7); g.fill(); g.stroke();
  // 光の線: 獲物の1点から来た光がレンズで曲がり、どこで1点に集まるか
  const ray = (F, col) => {
    const xf = X(OP.imageDist(D, F));
    g.strokeStyle = col; g.lineWidth = 1.2; g.globalAlpha = 0.9;
    for (const yy of [-ap, -ap * 0.5, ap * 0.5, ap]) {
      g.beginPath(); g.moveTo(0, cy + yy * 0.25); g.lineTo(lensX, cy + yy);
      const xe = Math.min(dw - 4, xf + (xf - lensX) * 0.25), ye = cy + yy - (yy) * (xe - lensX) / (xf - lensX);
      g.lineTo(xe, ye); g.stroke();
    }
    g.globalAlpha = 1; g.fillStyle = col; g.beginPath(); g.arc(Math.min(dw - 4, xf), cy, 3, 0, 7); g.fill();
    return xf;
  };
  ray(OP.OPT.Fg, GREEN);
  if (red) ray(OP.Fr(), RED);
  // L2 での光のはば（ぼけ）を矢印で
  const xb = X(L.L2), bw = OP.blur(D, red ? OP.Fr() : OP.OPT.Fg, L.L2) / OP.OPT.A * ap * (X(OP.imageDist(D, OP.OPT.Fg)) - lensX) / (xb - lensX) * 0.9;
  g.strokeStyle = C.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(xb + 14, cy - bw / 2); g.lineTo(xb + 14, cy + bw / 2); g.stroke();
  g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.fillStyle = C.muted;
  g.fillText('←獲物から', 4, cy - ap * 0.25 - 8);
  g.fillText('レンズ', lensX - 16, cy - ap * 1.05 - 6);
  g.fillText('紫外線', X(L.L2) - gap * 1.45 - 6, cy - ap * 1.15 - 6);
  g.fillText('緑', X(L.L2) - 2, cy - ap * 1.15 - 6);
  g.fillText('※ 模式図（層の間は広げて描いた）', 4, dh - 6);

  // --- L1 と L2 の像（右、または下）。ぼけは「遠いとき（向きを変えた距離）」とくらべた相対の大きさ
  const tx = narrow ? 8 : dw + 10, ty = narrow ? dh + 6 : 14, tw = narrow ? (w - 24) / 2 : (w - dw - 20) / 2, th = narrow ? h - dh - 62 : h * 0.5;
  const Fuse = red ? OP.Fr() : OP.OPT.Fg, far = s.D0 || 73;
  const b1 = OP.blur(D, Fuse, L.L1), b2 = OP.blur(D, Fuse, L.L2), b2far = OP.blur(far, OP.OPT.Fg, L.L2);
  const tile = (x, lab, b) => {
    if (tw < 8 || th < 8) return;
    g.fillStyle = '#0b1d10'; g.fillRect(x, ty, tw, th); g.strokeStyle = C.line; g.strokeRect(x + 0.5, ty + 0.5, tw - 1, th - 1);
    g.save(); g.beginPath(); g.rect(x, ty, tw, th); g.clip();
    g.filter = `blur(${Math.min(14, b / b2far * 2.2).toFixed(1)}px)`; preyIcon(g, x + tw / 2, ty + th / 2, Math.min(tw, th) * 0.8, GREEN); g.filter = 'none';
    g.restore();
    g.fillStyle = C.ink; g.font = '12px "Zen Kaku Gothic New",sans-serif'; g.fillText(lab, x + 4, ty + th + 14);
  };
  tile(tx, 'L1 の像', b1); tile(tx + tw + 8, 'L2 の像', b2);
  // L2 のぼけの大きさ（相対）と、赤い光での読みちがえ
  g.font = '12px "Zen Kaku Gothic New",sans-serif'; g.fillStyle = C.ink;
  const ly = narrow ? ty + th + 32 : ty + th + 36;
  g.fillText(`L2 のぼけ: 見つけたとき（${far.toFixed(0)}mm）の ${(b2 / b2far).toFixed(1)} 倍`, tx, ly);
  {
    g.fillStyle = red ? RED : C.muted;
    const msg = s.short ? `赤い光: ${s.Dp.toFixed(1)}mm から ${(s.Dp - s.short).toFixed(1)}mm のつもりで跳び、${s.short.toFixed(1)}mm 手前に着地` :
      red ? '赤い光: 近くのものほど、もっと近くに見積もる' : '近づくほど L2 のぼけが大きくなる';
    g.fillText(msg, tx, ly + 18, w - tx - 6);
  }
}
return { draw };
})();
