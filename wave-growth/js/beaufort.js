// 波が育つまで — 気象庁風力階級表（2006）: 風速の範囲（m/s）・海のようす（要約）・参考の波の高さ（m。かっこ内はおおよその最大）
// 表の波の高さは、陸から遠い外洋のおおよその目安（表の注）。波の高さから風力を決めるのには使わない。
'use strict';
window.WGbeaufort = (() => {
  const T = [
    [0, 0.0, 0.2, L('波がなく、鏡のような海面', 'Calm, mirror-like sea'), null, null],
    [1, 0.3, 1.5, L('うろこのような細かいさざ波', 'Ripples like fish scales'), 0.1, 0.1],
    [2, 1.6, 3.3, L('小さなさざ波が一面に', 'Small wavelets everywhere'), 0.2, 0.3],
    [3, 3.4, 5.4, L('ところどころに白い波頭', 'Scattered white crests'), 0.6, 1],
    [4, 5.5, 7.9, L('白波がかなり多くなる', 'Many white horses'), 1, 1.5],
    [5, 8.0, 10.7, L('多くが白波におおわれる', 'Mostly covered in whitecaps'), 2, 2.5],
    [6, 10.8, 13.8, L('大きな波ができはじめる', 'Large waves begin to form'), 3, 4],
    [7, 13.9, 17.1, L('波頭のしぶきが風に流される', 'Foam blown from crests'), 4, 5.5],
    [8, 17.2, 20.7, L('大波が砕け、しぶきが激しい', 'High waves breaking, heavy spray'), 5.5, 7.5],
    [9, 20.8, 24.4, L('大波が崩れ、しぶきで見通しが悪い', 'High waves tumbling, spray cuts visibility'), 7, 10],
    [10, 24.5, 28.4, L('海面全体が白く見える', 'The whole sea looks white'), 9, 12.5],
    [11, 28.5, 32.6, L('山のような大波', 'Mountainous waves'), 11.5, 16],
    [12, 32.7, Infinity, L('泡としぶきで空気が満ちる', 'Air filled with foam and spray'), 14, null],
  ];
  function at(U) { for (const r of T) if (U <= r[2] + 0.05) return r; return T[T.length - 1]; }
  return { T, at };
})();
