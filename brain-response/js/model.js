/* model.js — builds one "trial": which stations (brain places) respond, when, how strongly, and on which side.
   Station: { id, reg, side 'L'|'R', t (ms, used for playback), t1/t2 (range), ev, src[], gain, label, note, from, hot, way }
   - reg: key into SPECIES[sp].reg (omit for a waypoint outside the brain; then `way` gives a screen point per side)
   - hot: {u, v} replaces the region centre (maps: retinotopy, somatotopy, tonotopy); array = several spots
   - from: id of the station the signal comes from, or 'sensor' (default: the previous station)
   Peaks: the scalp-wave (evoked potential) peaks for the human chart: { name, t, amp, w, note } */

const other = s => (s === 'L' ? 'R' : 'L');
const both = (st, o) => [Object.assign({}, st, { id: st.id + 'L', side: 'L', gain: (o && o.L) != null ? o.L : st.gain }),
                         Object.assign({}, st, { id: st.id + 'R', side: 'R', gain: (o && o.R) != null ? o.R : st.gain })];
const sideName = s => (s === 'L' ? '左' : '右');

/* screen points outside the brain (logical canvas 1000×640, see draw.js) */
const WAY = {
  chiasm: { L: [500, 468], R: [500, 468] },
  plexus: { L: [430, 535], R: [570, 535] },     // brachial plexus (shoulder)
  cochN:  { L: [330, 515], R: [670, 515] },     // cochlear nerve
  trig:   { L: [455, 530], R: [545, 530] },     // trigeminal ganglion
  root:   { L: [470, 590], R: [530, 590] }      // dorsal root / spinal entry
};

/* sensors (screen points); the figure is seen from behind so its left is on the left */
const SENSORS = {
  eyeL: [462, 515], eyeR: [538, 515],
  earL: [260, 540], earR: [740, 540],
  faceL: [488, 508], faceR: [512, 508],
  handL: [400, 575], handR: [600, 575],
  footL: [478, 630], footR: [522, 630],
  whiskL: [440, 520], whiskR: [560, 520],
  pawFL: [420, 575], pawFR: [580, 575], pawHL: [455, 625], pawHR: [545, 625]
};

function trialEmpty(msg) { return { stations: [], peaks: [], sensors: [], missing: msg, notes: [] }; }

/* ---------- light ---------- */
function v1HotHuman(x, y) {
  const ecc = Math.min(1, Math.hypot(x, y));
  const ud = ecc < 1e-3 ? 0 : (y / ecc) * Math.min(1, ecc * 4);
  // fovea at the occipital pole, periphery forward along the calcarine (medial); upper field below the calcarine
  return { u: 0.985 - 0.19 * Math.pow(ecc, 0.7), v: 0.50 + 0.05 * ud, deep: ecc > 0.35 };
}
function v1HotMacaque(x, y) {
  const ecc = Math.min(1, Math.hypot(x, y));
  const ud = ecc < 1e-3 ? 0 : (y / ecc) * Math.min(1, ecc * 4);
  // centre of gaze on the lateral surface just behind the lunate sulcus, periphery toward the medial side
  return { u: 0.875 + 0.12 * Math.pow(ecc, 0.7), v: 0.46 + 0.07 * ud, deep: ecc > 0.55 };
}

function buildLight(sp, w, cond, opt) {
  const x = w.x, y = w.y, side = x < 0 ? 'R' : 'L', tgt = side;
  const half = x < 0 ? '左' : '右';
  const T = { stations: [], peaks: [], sensors: ['eyeL', 'eyeR'], notes: [] };
  T.notes.push(`${half}の視野の光は、両目とも、反対側＝<b>${sideName(tgt)}の脳</b>へ届きます（視交叉で、鼻側の網膜からの線維だけが交差するため）。`);
  if (cond === 'blind') {
    T.notes.push('目から信号が出ないので、光に対する脳の反応はありません。このアプリでは、早くから目が見えない人の脳が<b>触る課題</b>でどう働くかを「触る」→「点字」で見られます。');
    T.stations = []; T.sensors = ['eyeL', 'eyeR']; T.dead = true; return T;
  }
  const d = cond === 'ms' ? opt.msDelay : 0;
  const S = T.stations;
  if (sp === 'human') {
    const hot = v1HotHuman(x, y);
    S.push({ id: 'chi', way: WAY.chiasm, side: tgt, t: 25 + d * 0.5, ev: 'order', label: '視神経・視交叉', src: ['kandel13'], from: 'sensor',
      note: '網膜から視神経を通って、視交叉で左右の視野ごとに分かれます。ヒトでここを通る時刻は確かめていません。' });
    S.push({ id: 'LGN', reg: 'LGN', side: tgt, t: 40 + d, ev: 'order', label: '視床（外側膝状体）', src: ['kandel13'],
      note: '視覚の中継所。ヒトの頭の表面からは測れないので、時刻は V1 より前の「およそ」です。' });
    S.push({ id: 'V1', reg: 'V1', side: tgt, hot, t: 56 + d, ev: 'measured', label: '一次視覚野 V1', src: ['foxe02', 'horton91'],
      note: '後頭部の反応のはじまりは平均 56 ms（Foxe & Simpson 2002）。光った場所は視野の位置で変わります: 中心ほど後頭葉のいちばん後ろ、端ほど前（内側の鳥距溝の奥）。上の視野は溝の下側、下の視野は上側。中心の視野に広い面積が使われます（Horton & Hoyt 1991）。' });
    S.push({ id: 'PPC', reg: 'PPC', side: tgt, t: 68 + d, ev: 'order', label: '頭頂葉（背側の流れ）', src: ['foxe02'], from: 'V1',
      note: '「どこに・どう動く」の流れ。V1 のあと、前頭より前に反応します（背側が腹側より先）。' });
    S.push({ id: 'PFC', reg: 'PFC', side: tgt, t: 80 + d, ev: 'measured', label: '前頭（背外側）', src: ['foxe02'], from: 'PPC',
      note: '光から 80 ms で前頭まで届きます。V1 から 30 ms たらずで、頭頂・前頭まで広がります（Foxe & Simpson 2002）。' });
    S.push({ id: 'V4', reg: 'V4', side: tgt, t: 92 + d, ev: 'order', label: '腹側の流れ（形・色）', src: ['foxe02'], from: 'V1',
      note: '「何か」の流れ。背側の流れより遅れて反応します。時刻はおよそ。' });
    T.peaks = [
      { name: 'N75', t: 75 + d, amp: -0.55 }, { name: 'P100', t: 100 + d, amp: 1 }, { name: 'N135', t: 135 + d, amp: -0.6 }];
    T.peakSrc = ['odom16'];
    T.peakNote = '目の検査（パターン反転の視覚誘発電位）の波。名前の数字がおよその時刻（ms）で、P100 がいちばん大きい山です。';
    if (cond === 'ms') T.notes.push(`多発性硬化症では、視神経の髄鞘（電線の被覆）がこわれて伝わりが遅れ、P100 が遅れます。51人中49人で片目か両目に遅れがあり、視神経炎になったことがない人でも多くみられました（Halliday ほか 1973）。遅れの大きさは人と場所によってちがうので、ここではスライダーで <b>${d} ms</b> にしています。`);
  } else if (sp === 'macaque') {
    const hot = v1HotMacaque(x, y);
    S.push({ id: 'chi', way: WAY.chiasm, side: tgt, t: 20, ev: 'order', label: '視神経・視交叉', src: ['kandel13'], from: 'sensor', note: 'ここを通る時刻は確かめていません。' });
    S.push({ id: 'LGNm', reg: 'LGNm', side: tgt, t: 33, ev: 'measured', label: '外側膝状体 M 層（速い）', src: ['schmolesky98'],
      note: '大細胞層（M）はいちばん早く、平均 33 ms。動きやちらつきに強い流れのはじまり。' });
    S.push({ id: 'LGNp', reg: 'LGNp', side: tgt, t: 50, ev: 'measured', label: '外側膝状体 P 層（遅い）', src: ['schmolesky98'], from: 'chi',
      note: '小細胞層（P）は M 層より平均 17 ms 遅い（Schmolesky ほか 1998）。色や細かい形の流れ。' });
    S.push({ id: 'V1', reg: 'V1', side: tgt, hot, t: 65, ev: 'measured', label: '一次視覚野 V1', src: ['thiru26', 'schmolesky98'], from: 'LGNm',
      note: '大脳でいちばん早く反応する（中央値 65 ms）。サルでは視野の中心が、後頭葉の外側の、月状溝のすぐ後ろにあります。' });
    S.push({ id: 'MT', reg: 'MT', side: tgt, t: 73, ev: 'measured', label: 'MT・MST（動き）', src: ['thiru26', 'schmolesky98'], from: 'V1',
      note: 'V1 の次の波。中央値 73 ms。V3・前頭眼野とほぼ同時。' });
    S.push({ id: 'V3', reg: 'V3', side: tgt, t: 73, ev: 'order', label: 'V3', src: ['schmolesky98'], from: 'V1',
      note: 'MT・MST・前頭眼野と同じ「次の波」で反応（数値は確かめていないので、MT と同じ時刻に置いた）。' });
    S.push({ id: 'FEF', reg: 'FEF', side: tgt, t: 73, ev: 'measured', label: '前頭眼野 FEF', src: ['thiru26', 'schmolesky98'], from: 'MT',
      note: '目を動かす前頭の場所。中央値 73 ms で、V2 より早く反応します。' });
    S.push({ id: 'V2', reg: 'V2', side: tgt, t: 85, ev: 'order', label: 'V2', src: ['schmolesky98'], from: 'V1',
      note: 'V3・MT より遅く、ばらつきが大きい（数値は確かめていない）。' });
    S.push({ id: 'V4', reg: 'V4', side: tgt, t: 104, ev: 'measured', label: 'V4（形・色）', src: ['schmolesky98'], from: 'V2',
      note: '9つの場所でいちばん遅い（平均 104 ms、72〜159 ms と幅が大きい）。腹側の流れはゆっくりで、ばらつく。' });
    T.noScalp = 'サルのデータは1つ1つの神経細胞の記録です（頭の表面の波ではない）。';
  } else {
    S.push({ id: 'chi', way: WAY.chiasm, side: tgt, t: 15, ev: 'order', label: '視神経・視交叉', src: ['kandel13'], from: 'sensor', note: 'ここを通る時刻は確かめていません。' });
    S.push({ id: 'LGN', reg: 'LGN', side: tgt, t: 25, t1: 25, t2: 40, ev: 'range', label: '外側膝状体', src: ['kara93'],
      note: 'フラッシュから 25〜40 ms で最初の興奮（麻酔したラット）。' });
    S.push({ id: 'V1', reg: 'V1', side: tgt, t: 30, t1: 30, t2: 60, ev: 'range', label: '一次視覚野 V1', src: ['kara93'],
      note: 'フラッシュから 30〜60 ms で興奮（麻酔したラット）。ラットの V1 は脳の上の後ろ、小さめ。' });
    T.noScalp = 'ラットのデータは脳に入れた電極の記録です（頭の表面の波ではない）。';
  }
  return T;
}

function buildFace(sp, w, cond, opt) {
  const T = { stations: [], peaks: [], sensors: ['eyeL', 'eyeR'], notes: [] };
  if (sp === 'rat') return trialEmpty(MISSING['rat:face']);
  if (cond === 'blind') { T.dead = true; T.notes.push('目から信号が出ないので、顔の写真に対する脳の反応はありません。'); return T; }
  const S = T.stations, d = cond === 'ms' ? opt.msDelay : 0;
  T.notes.push('顔は視野の真ん中に出すので、<b>左右両方の脳</b>が受け取ります。');
  if (sp === 'human') {
    S.push(...both({ id: 'chi', way: WAY.chiasm, t: 25 + d * 0.5, ev: 'order', label: '視神経・視交叉', src: ['kandel13'], from: 'sensor', gain: 1, note: '時刻は確かめていません。' }));
    S.push(...both({ id: 'LGN', reg: 'LGN', t: 40 + d, ev: 'order', label: '視床（外側膝状体）', src: ['kandel13'], gain: 1, note: '時刻はおよそ。' }));
    S.forEach((s, i) => { if (s.reg === 'LGN') s.from = 'chi' + s.side; });
    S.push(...both({ id: 'V1', reg: 'V1', t: 56 + d, ev: 'measured', label: '一次視覚野 V1', src: ['foxe02'], gain: 1, hot: { u: 0.985, v: 0.5 }, note: '後頭部の反応のはじまり 56 ms。' }));
    S.forEach(s => { if (s.reg === 'V1') s.from = 'LGN' + s.side; });
    S.push(...both({ id: 'V4', reg: 'V4', t: 100, ev: 'order', label: '腹側の流れ', src: ['foxe02'], gain: 1, note: '形を見分ける流れ。時刻はおよそ。' }));
    S.forEach(s => { if (s.reg === 'V4') { s.from = 'V1' + s.side; s.t += d; } });
    S.push(...both({ id: 'FFA', reg: 'FFA', t: 172 + d, ev: 'measured', label: '顔の領域（N170）', src: ['bentin96', 'kanwisher97'], note: '顔だけに出る N170（172 ms）。物・動物の顔・手では出ない。右の脳の方が大きい（Bentin ほか 1996）。紡錘状回の顔領域は、物より顔でよく働く（Kanwisher ほか 1997）。' }, { L: 0.6, R: 1 }));
    S.forEach(s => { if (s.reg === 'FFA') s.from = 'V4' + s.side; });
    T.peaks = [{ name: 'P1', t: 100 + d, amp: 0.7 }, { name: 'N170', t: 172 + d, amp: -1.1 }];
    T.peakSrc = ['bentin96'];
    T.peakNote = '側頭の後ろで測った波。顔のときだけ N170 が大きく出ます（右が大きい）。';
    if (cond === 'ms') T.notes.push(`多発性硬化症の遅れ（${d} ms）を、目から先のすべてに足しています。N170 の遅れそのものは確かめていません（P100 の遅れをそのまま後ろへずらした見通し）。`);
  } else {
    S.push(...both({ id: 'chi', way: WAY.chiasm, t: 20, ev: 'order', label: '視神経・視交叉', src: ['kandel13'], from: 'sensor', gain: 1, note: '時刻は確かめていません。' }));
    S.push(...both({ id: 'V1', reg: 'V1', t: 65, ev: 'measured', label: 'V1', src: ['thiru26'], gain: 1, hot: { u: 0.875, v: 0.46 }, note: '中央値 65 ms（光のとき）。' }));
    S.forEach(s => { if (s.reg === 'V1') s.from = 'chi' + s.side; });
    S.push(...both({ id: 'V4', reg: 'V4', t: 104, ev: 'measured', label: 'V4', src: ['schmolesky98'], gain: 1, note: '平均 104 ms（光のとき）。' }));
    S.forEach(s => { if (s.reg === 'V4') s.from = 'V1' + s.side; });
    S.push(...both({ id: 'FACE', reg: 'FACE', t: 130, ev: 'place', label: '顔パッチ', src: ['tsao06'], gain: 1, note: 'fMRI で見つけた顔の場所に電極を入れると、反応する細胞の 97% が顔に強く反応した（Tsao ほか 2006）。時刻は確かめていません。' }));
    S.forEach(s => { if (s.reg === 'FACE') s.from = 'V4' + s.side; });
    T.noScalp = 'サルのデータは神経細胞と fMRI の記録です。';
  }
  return T;
}

/* ---------- sound ---------- */
function a1Hot(sp, f) {
  if (sp === 'human') {
    // two mirror-symmetric maps along Heschl's gyrus share a low-frequency border (Formisano 2003)
    const c = { u: 0.535, v: 0.535 }, k = 0.035 * f;
    return f < 0.08 ? [c] : [{ u: c.u + k, v: c.v - k * 0.35 }, { u: c.u - k, v: c.v + k * 0.35 }];
  }
  if (sp === 'macaque') return [{ u: 0.50 + 0.035 * (f - 0.5), v: 0.555 - 0.01 * (f - 0.5) }];
  return [{ u: 0.73 - 0.06 * f, v: 0.47 }];      // rat: high frequencies forward (rostral), low backward (Sally & Kelly 1988)
}

function buildSound(sp, w, cond, opt) {
  const s = w.side, o = other(s), f = w.f;
  const T = { stations: [], peaks: [], sensors: ['ear' + s], notes: [] }, S = T.stations;
  const fName = f < 0.34 ? '低い' : f < 0.67 ? '中くらいの' : '高い';
  T.notes.push(`${sideName(s)}耳の音は、脳幹で左右に分かれて<b>両方の脳</b>へ届きます（反対側の${sideName(o)}がやや強い）。${fName}音は、聴覚野の中の決まった場所が受け持ちます。`);
  const hot = a1Hot(sp, f);
  if (sp === 'human') {
    S.push({ id: 'n8', way: WAY.cochN, side: s, t: 1.49, ev: 'measured', label: '蝸牛神経（I波）', src: ['sotelo26', 'kandel13'], from: 'sensor',
      note: '耳の奥の蝸牛から出た神経。聴性脳幹反応の I 波（1.49 ms）。' });
    S.push({ id: 'soc', reg: 'SOC', side: s, t: 3.66, ev: 'measured', label: '蝸牛神経核・上オリーブ（III波）', src: ['sotelo26', 'kandel13'],
      note: 'III 波（3.66 ms）。ここから左右両方へ分かれます（左右の耳の音の時間差・強さの差を比べる場所）。' });
    S.push(...both({ id: 'ic', reg: 'IC', t: 5.59, ev: 'measured', label: '下丘（V波）', src: ['sotelo26', 'kandel13'], from: 'soc', note: 'V 波（5.59 ms）。耳から 6 ms たらずで中脳まで。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'mgn', reg: 'MGN', t: 15, ev: 'order', label: '視床（内側膝状体）', src: ['kandel13'], note: '聴覚の中継所。時刻はおよそ（V 波と 30 ms のあいだ）。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'a1', reg: 'A1', hot, t: 30, ev: 'measured', label: '一次聴覚野（30 ms）', src: ['liegeois94', 'formisano03'], note: 'ヘシュル回の内側の後ろ（一次聴覚野）で 30 ms（脳の中の電極、Liégeois-Chauvel ほか 1994）。音の高さの地図が2つ、鏡写しに並び、低い音の場所を共有します（Formisano ほか 2003）。高い音では光る点が2つに分かれます。' }, { [s]: 0.75, [o]: 1 }));
    S.push(...both({ id: 'hgl', reg: 'HGL', t: 50, t1: 50, t2: 75, ev: 'range', label: 'ヘシュル回の外側（50〜75 ms）', src: ['liegeois94'], note: '50 ms は一次聴覚野の外側、60〜75 ms はさらに外側の二次聴覚野。' }, { [s]: 0.75, [o]: 1 }));
    const asd = cond === 'asd' ? 11 : 0;
    S.push(...both({ id: 'stg', reg: 'STG', t: 100, ev: 'measured', label: '上側頭回（M100）', src: ['roberts10'], note: '音から約 100 ms の大きな反応（脳波で N1、脳磁図で M100）。' }, { [s]: 0.8, [o]: 1 }));
    S.forEach(x => { if (x.reg === 'MGN') x.from = 'ic' + x.side; if (x.reg === 'A1') x.from = 'mgn' + x.side; if (x.reg === 'HGL') x.from = 'a1' + x.side; if (x.reg === 'STG') x.from = 'hgl' + x.side; });
    if (asd) {
      const r = S.find(x => x.id === 'stgR'); r.t += asd; r.cond = true;
      r.note += ' 自閉スペクトラムの子ども（25人）では、右の M100 が平均 11 ms 遅れた（Roberts ほか 2010）。50 ms の M50 には差がなかった。';
      T.notes.push('自閉スペクトラムの子どもでは、<b>右の上側頭回の M100 が平均 11 ms 遅れる</b>（定型発達の子ども17人と比べて。Roberts ほか 2010）。M50 は差なし。ほかの研究では結果がそろわないこともあります。');
    }
    T.peaks = [{ name: 'I', t: 1.49, amp: 0.18 }, { name: 'III', t: 3.66, amp: 0.18 }, { name: 'V', t: 5.59, amp: 0.3 },
               { name: 'Pa', t: 30, amp: 0.45 }, { name: asd ? 'M100（右）' : 'N1/M100', t: 100 + asd, amp: -1 }];
    T.peakSrc = ['sotelo26', 'liegeois94', 'roberts10'];
    T.peakNote = '最初の 6 ms の小さな波が聴性脳幹反応（I・III・V 波）、30 ms ごろが Pa、100 ms ごろが N1（脳磁図では M100）。';
  } else if (sp === 'macaque') {
    S.push({ id: 'soc', reg: 'SOC', side: s, t: 3, ev: 'place', label: '蝸牛神経核・上オリーブ', src: ['kandel13'], from: 'sensor', note: '時刻は確かめていません。' });
    S.push(...both({ id: 'ic', reg: 'IC', t: 6, ev: 'place', label: '下丘', src: ['kandel13'], from: 'soc', note: '時刻は確かめていません。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'mgn', reg: 'MGN', t: 10, ev: 'place', label: '内側膝状体', src: ['kandel13'], note: '時刻は確かめていません。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'a1', reg: 'A1', hot, t: 18, ev: 'place', label: '一次聴覚野', src: ['formisano03'], note: 'サルにもヒトと同じような音の高さの地図があります（Formisano ほか 2003 が比べている）。時刻は確かめていません。' }, { [s]: 0.75, [o]: 1 }));
    S.forEach(x => { if (x.reg === 'MGN') x.from = 'ic' + x.side; if (x.reg === 'A1') x.from = 'mgn' + x.side; });
    T.noScalp = 'サルの聴覚の時刻は、このアプリでは確かめた数値がありません（場所と順番だけ）。';
  } else {
    S.push({ id: 'soc', reg: 'SOC', side: s, t: 2.5, ev: 'order', label: '蝸牛神経核・上オリーブ', src: ['kandel13'], from: 'sensor', note: '時刻はおよそ。' });
    S.push(...both({ id: 'ic', reg: 'IC', t: 4.5, ev: 'order', label: '下丘', src: ['kandel13'], from: 'soc', note: 'ラットでは大脳と小脳のあいだから見えます。時刻はおよそ。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'mgn', reg: 'MGN', t: 7, ev: 'order', label: '内側膝状体', src: ['kandel13'], note: '時刻はおよそ。ここから大脳の聴覚野と、扁桃体へ直接の近道が出ます。' }, { [s]: 0.7, [o]: 1 }));
    S.push(...both({ id: 'a1', reg: 'A1', hot, t: 11, ev: 'order', label: '一次聴覚野', src: ['sally88'], note: '短い時間で反応し、高い音は前、低い音は後ろが受け持つ（Sally & Kelly 1988）。時刻はおよそ。' }, { [s]: 0.75, [o]: 1 }));
    const fear = cond === 'fear';
    S.push(...both({ id: 'la', reg: 'LA', t: 12, ev: 'measured', label: '扁桃体外側核（15 ms より速い）', src: ['quirk95'], note: '視床からの近道で、15 ms より速く反応する成分がある。' + (fear ? ' 音と電気ショックを組み合わせると、この速い反応が強くなる（数回の組み合わせで変わることも多い。Quirk ほか 1995）。強さの倍率は模式。' : '') }, { [s]: fear ? 0.8 : 0.25, [o]: fear ? 1 : 0.3 }));
    S.forEach(x => { if (x.reg === 'MGN') x.from = 'ic' + x.side; if (x.reg === 'A1' || x.reg === 'LA') x.from = 'mgn' + x.side; if (fear && x.reg === 'LA') x.cond = true; });
    if (fear) T.notes.push('この音をこわい経験（足への電気ショック）と組み合わせたあとでは、<b>扁桃体外側核の 15 ms より速い反応が強くなる</b>（Quirk ほか 1995）。大脳を回らない近道が、すばやく身構えるのに役立つと考えられています。');
    T.noScalp = 'ラットのデータは脳に入れた電極の記録です。';
  }
  return T;
}

/* ---------- touch ---------- */
const S1_POS = { foot: 0.04, hand: 0.42, finger: 0.47, face: 0.74 };   // along the central-sulcus strip, top → bottom (Penfield)
function stripHot(reg, k) {
  const a = reg.strip[0], b = reg.strip[1];
  return { u: a[0] + (b[0] - a[0]) * k, v: a[1] + (b[1] - a[1]) * k, deep: k < 0.08 };
}

function buildTouch(sp, w, cond, opt) {
  const s = w.side, o = other(s), part = w.part;
  const T = { stations: [], peaks: [], sensors: [], notes: [] }, S = T.stations, REG = SPECIES[sp].reg;
  const pn = { hand: '手首（正中神経）', finger: '指先', foot: '足首（脛骨神経）', face: 'ほお', whisk: 'ひげ1本', pawF: '前足', pawH: '後ろ足', braille: '指先で点字を読む' }[part];
  T.notes.push(`${sideName(s)}の${pn}の刺激は、脳幹か脊髄で交差して、反対側＝<b>${sideName(o)}の脳</b>の体の地図へ届きます。`);
  if (sp === 'human') {
    if (part === 'hand' || part === 'braille') {
      T.sensors = ['hand' + s];
      S.push({ id: 'n9', way: WAY.plexus, side: s, t: 9, ev: 'measured', label: '腕神経叢（N9）', src: ['cruccu08'], from: 'sensor', note: '肩のあたり（エルブ点）で測る N9。名前の数字がおよその時刻（ms）です。' });
      S.push({ id: 'n13', reg: 'CORD', side: s, t: 13, ev: 'measured', label: '頸髄（N13）', src: ['cruccu08'], note: '首の脊髄で測る N13。' });
      S.push({ id: 'p14', reg: 'MED', side: s, t: 14, ev: 'measured', label: '延髄（P14）', src: ['cruccu08', 'kandel13'], note: '延髄で交差して、反対側へ（内側毛帯）。' });
      S.push({ id: 'vpl', reg: 'VPL', side: o, t: 17, ev: 'order', label: '視床（中継核）', src: ['kandel13'], note: '時刻はおよそ（P14 と N20 のあいだ）。' });
      S.push({ id: 's1', reg: 'S1', side: o, hot: stripHot(REG.S1, S1_POS[part === 'braille' ? 'finger' : 'hand']), t: 20, ev: 'measured', label: '一次体性感覚野・手（N20）', src: ['cruccu08', 'penfield37'],
        note: '大脳に最初に届く N20（約 20 ms）。手の場所は、中心溝のうしろの帯の真ん中あたり。手と顔は広く、胴は狭い（ペンフィールドの体の地図）。' });
      T.peaks = [{ name: 'N9', t: 9, amp: -0.35 }, { name: 'N13', t: 13, amp: -0.4 }, { name: 'P14', t: 14, amp: 0.3 }, { name: 'N20', t: 20, amp: -1 }];
      T.peakSrc = ['cruccu08']; T.peakNote = '手首の神経を電気で刺激したときの体性感覚誘発電位。肩・首・頭で測った山を並べています（名前の数字がおよその時刻）。';
      if (part === 'braille') {
        const blind = cond === 'blind';
        T.notes.push(blind
          ? '早くから目が見えない人が点字を<b>読み分ける</b>とき、<b>視覚野（V1・V2）も働く</b>（PET。Sadato ほか 1996）。ただ触るだけの課題では働かない。後の研究で、目の見えない人の視覚野は言葉の課題でも働くことがわかり、何をしているのかは議論が続いています。'
          : '目が見える人が指で読み分けると、視覚野の活動は<b>下がる</b>（Sadato ほか 1996）。病気・特性で「早くから目が見えない人」を選ぶと比べられます。');
        S.push(...both({ id: 'v1x', reg: 'V1', t: 80, ev: 'place', label: blind ? '視覚野が働く' : '視覚野は下がる', src: ['sadato96'], from: 's1', hot: { u: 0.93, v: 0.5 },
          note: blind ? '触る課題で、一次・二次視覚野の血流が増えた（PET。時刻は測っていない）。' : '見える人では、触る課題で視覚野の血流が下がった（PET）。' }, { L: blind ? 0.8 : -0.5, R: blind ? 0.8 : -0.5 }));
        if (blind) S.push(...both({ id: 'v2x', reg: 'V2', t: 90, ev: 'place', label: '二次視覚野', src: ['sadato96'], note: '時刻は測っていない。' }, { L: 0.6, R: 0.6 }));
        S.forEach(x => { if (x.id.startsWith('v1x')) x.from = 's1'; if (x.id.startsWith('v2x')) x.from = 'v1x' + x.side; if (blind && (x.id.startsWith('v1x') || x.id.startsWith('v2x'))) x.cond = true; });
      }
    } else if (part === 'foot') {
      T.sensors = ['foot' + s];
      S.push({ id: 'root', way: WAY.root, side: s, t: 22, ev: 'order', label: '腰の脊髄に入る', src: ['kandel13'], from: 'sensor', note: '時刻はおよそ。' });
      S.push({ id: 'cord', reg: 'CORD', side: s, t: 30, ev: 'order', label: '脊髄を上る', src: ['kandel13'], note: '時刻はおよそ。' });
      S.push({ id: 'med', reg: 'MED', side: s, t: 33, ev: 'order', label: '延髄（ここで交差）', src: ['kandel13'], note: '時刻はおよそ。' });
      S.push({ id: 'vpl', reg: 'VPL', side: o, t: 36, ev: 'order', label: '視床（中継核）', src: ['kandel13'], note: '時刻はおよそ。' });
      S.push({ id: 's1', reg: 'S1', side: o, hot: stripHot(REG.S1, S1_POS.foot), t: 40, ev: 'measured', label: '一次体性感覚野・足（P40）', src: ['cruccu08', 'penfield37'],
        note: '足首の神経の刺激で、頭のてっぺんで測る P40（約 40 ms）。足の場所は体の地図のいちばん上で、左右の脳のあいだの内側に回り込む。手より神経が長いぶん遅い。' });
      T.peaks = [{ name: 'P40', t: 40, amp: 1 }];
      T.peakSrc = ['cruccu08']; T.peakNote = '足首の神経（脛骨神経）を刺激したとき、頭のてっぺんで測る P40。';
    } else {
      T.sensors = ['face' + s];
      S.push({ id: 'trg', way: WAY.trig, side: s, t: 4, ev: 'place', label: '三叉神経', src: ['kandel13'], from: 'sensor', note: '時刻は確かめていません。' });
      S.push({ id: 'med', reg: 'MED', side: s, t: 7, ev: 'place', label: '脳幹（三叉神経の核）で交差', src: ['kandel13'], note: '時刻は確かめていません。' });
      S.push({ id: 'vpm', reg: 'VPL', side: o, t: 10, ev: 'place', label: '視床（中継核）', src: ['kandel13'], note: '時刻は確かめていません。' });
      S.push({ id: 's1', reg: 'S1', side: o, hot: stripHot(REG.S1, S1_POS.face), t: 14, ev: 'place', label: '一次体性感覚野・顔', src: ['penfield37'], note: '顔の場所は体の地図の下のほう（外側）。顔の刺激の時刻は、このアプリでは確かめた数値がありません。' });
      T.noScalp = '顔の刺激の頭の表面の波は、確かめた数値がないので出していません。';
    }
  } else if (sp === 'macaque') {
    const k = { hand: S1_POS.hand, foot: S1_POS.foot, face: S1_POS.face }[part];
    T.sensors = [(part === 'hand' ? 'hand' : part === 'foot' ? 'foot' : 'face') + s];
    S.push({ id: 'in', reg: part === 'face' ? 'MED' : 'CORD', side: s, t: 6, ev: 'place', label: part === 'face' ? '脳幹' : '脊髄', src: ['kandel13'], from: 'sensor', note: '時刻は確かめていません。' });
    if (part !== 'face') S.push({ id: 'med', reg: 'MED', side: s, t: 8, ev: 'place', label: '延髄で交差', src: ['kandel13'], note: '時刻は確かめていません。' });
    S.push({ id: 'vpl', reg: 'VPL', side: o, t: 10, ev: 'place', label: '視床（中継核）', src: ['kandel13'], note: '時刻は確かめていません。' });
    S.push({ id: 's1', reg: 'S1', side: o, hot: stripHot(REG.S1, k), t: 14, ev: 'place', label: '一次体性感覚野', src: ['nelson80'], note: '中心溝のうしろに、反対側の体の地図が少なくとも2つ並ぶ（3b 野と 1 野。Nelson ほか 1980）。時刻は確かめていません。' });
    T.noScalp = 'サルの触覚の時刻は、このアプリでは確かめた数値がありません（場所と順番だけ）。';
  } else {
    if (part === 'whisk') {
      T.sensors = ['whisk' + s];
      S.push({ id: 'trg', way: WAY.trig, side: s, t: 1.5, ev: 'order', label: '三叉神経', src: ['kandel13'], from: 'sensor', note: '時刻はおよそ。' });
      S.push({ id: 'prv', reg: 'PRV', side: s, t: 3, ev: 'order', label: '脳幹（三叉神経の核）で交差', src: ['kandel13'], note: '時刻はおよそ。' });
      S.push({ id: 'vpm', reg: 'VPM', side: o, t: 5, ev: 'order', label: '視床（VPM）', src: ['kandel13'], note: '時刻はおよそ。' });
      S.push({ id: 'bf4', reg: 'BF', side: o, t: 8, ev: 'measured', label: 'たる皮質 4層（8 ms）', src: ['brecht02', 'vdl73'], hot: { u: 0.52, v: 0.31 },
        note: 'ひげ1本に、脳の「たる」1つ。そのたるの4層の細胞が 8±1.4 ms で反応しはじめる（Brecht & Sakmann 2002）。となりのひげには、遅れて弱く反応する。' });
      S.push({ id: 'bf23', reg: 'BF', side: o, t: 10.5, t1: 10, t2: 11, ev: 'measured', label: '2・3層（4層の 2〜3 ms あと）', src: ['armstrong92'], hot: { u: 0.505, v: 0.29 },
        note: '同じ柱の上の層へ、2〜3 ms 遅れて伝わる。そのあと、となりのたるへ横に広がる（Armstrong-James ほか 1992）。' });
    } else {
      const fl = part === 'pawF';
      T.sensors = [(fl ? 'pawF' : 'pawH') + s];
      S.push({ id: 'cord', reg: 'CORD', side: s, t: 4, ev: 'place', label: '脊髄', src: ['kandel13'], from: 'sensor', note: '時刻は確かめていません。' });
      S.push({ id: 'med', reg: 'MED', side: s, t: 6, ev: 'place', label: '延髄で交差', src: ['kandel13'], note: '時刻は確かめていません。' });
      S.push({ id: 'vpl', reg: 'VPL', side: o, t: 8, ev: 'place', label: '視床（VPL）', src: ['kandel13'], note: '時刻は確かめていません。' });
      S.push({ id: 's1', reg: fl ? 'FL' : 'HL', side: o, t: 11, ev: 'place', label: fl ? '前足の体性感覚野' : '後ろ足の体性感覚野', src: ['chapin84'], note: 'ラットの体の地図（Chapin & Lin 1984）。ひげの場所（たる皮質）がとても広い。時刻は確かめていません。' });
    }
    T.noScalp = 'ラットのデータは脳に入れた電極の記録です。';
  }
  return T;
}

/* ---------- heat pain (laser) ---------- */
function buildPain(sp, w, cond, opt) {
  if (sp !== 'human') return trialEmpty(MISSING[sp + ':pain']);
  const s = w.side, o = other(s), fm = cond === 'fm', g = fm ? 1.6 : 1;
  const T = { stations: [], peaks: [], sensors: ['hand' + s], notes: [] }, S = T.stations;
  T.notes.push(`熱い痛みは<b>2回</b>届きます。速い線維（Aδ）で 0.2〜0.4 秒、遅い線維（C）で約 1 秒。痛みの信号は${sideName(s)}の脊髄で交差して上り、<b>両側</b>の頭頂弁蓋・島と、前帯状皮質が受け取ります。`);
  S.push({ id: 'cord', reg: 'CORD', side: s, t: 45, ev: 'order', label: '脊髄（ここで交差）', src: ['kandel13'], from: 'sensor', note: '痛み・温度の線維は、脊髄に入ってすぐ反対側へ渡って上る。時刻はおよそ。' });
  S.push({ id: 'thal', reg: 'thal', side: o, t: 100, ev: 'order', label: '視床', src: ['kandel13'], note: '時刻はおよそ。' });
  S.push(...both({ id: 'op', reg: 'S2', t: 140, t1: 120, t2: 150, ev: 'range', label: '頭頂弁蓋・S2（150 ms より前から）', src: ['garcia03'], note: 'いちばん確かな発生源の1つ。150 ms より前から働く（Garcia-Larrea ほか 2003）。' }, { L: g, R: g }));
  S.push({ id: 's1', reg: 'S1', side: o, hot: stripHot(SPECIES.human.reg.S1, S1_POS.hand), t: 150, ev: 'place', label: '一次体性感覚野（議論あり）', src: ['garcia03'], from: 'thal', gain: 0.6 * g, note: 'S1 も弁蓋とほぼ同じ時間に働くという証拠が出てきているが、議論がある（Garcia-Larrea ほか 2003）。' });
  S.push(...both({ id: 'ins', reg: 'INS', t: 220, t1: 200, t2: 400, ev: 'range', label: '島（N2）', src: ['garcia03', 'azevedo16'], note: '頭のてっぺんで測る N2–P2 は 200〜400 ms（手の甲）。発生源は両側の弁蓋・島と前帯状皮質。' }, { L: g, R: g }));
  S.push(...both({ id: 'acc', reg: 'ACC', t: 330, t1: 200, t2: 400, ev: 'range', label: '前帯状皮質（P2）', src: ['garcia03', 'azevedo16'], note: '前帯状皮質は、いちばん確かな発生源のもう1つ。' }, { L: g, R: g }));
  S.push(...both({ id: 'cIns', reg: 'INS', t: 806, ev: 'measured', label: 'C線維の波（N2、806 ms）', src: ['azevedo16'], note: 'C 線維だけを刺激すると、N2 が 806±61 ms（20人）。場所は Aδ と同じあたりと考えた（この研究は場所を調べていない＝推定）。' }, { L: 0.8 * g, R: 0.8 * g }));
  S.push(...both({ id: 'cAcc', reg: 'ACC', t: 1033, ev: 'measured', label: 'C線維の波（P2、1033 ms）', src: ['azevedo16'], note: 'P2 が 1033±60 ms。場所は推定（上と同じ）。' }, { L: 0.8 * g, R: 0.8 * g }));
  S.forEach(x => {
    if (x.reg === 'S2' && x.id !== 's1') x.from = 'thal';
    if (x.id.startsWith('ins')) x.from = 'op' + x.side;
    if (x.id.startsWith('acc')) x.from = 'thal';
    if (x.id.startsWith('cIns')) x.from = 'thal';
    if (x.id.startsWith('cAcc')) x.from = 'cIns' + x.side;
    if (fm && x.reg !== 'CORD' && x.reg !== 'thal') x.cond = true;
  });
  T.peaks = [{ name: 'N2', t: 240, amp: -1 }, { name: 'P2', t: 370, amp: 1.1 }, { name: 'C の N2', t: 806, amp: -0.55 }, { name: 'C の P2', t: 1033, amp: 0.65 }];
  if (fm) T.peaks.forEach(p => p.amp *= 1.4);
  T.peakSrc = ['azevedo16'];
  T.peakNote = 'レーザーで手の甲を温めたときの、頭のてっぺんの波。N2・P2 の時刻は 200〜400 ms の範囲の中に置いた例。C 線維の波は 806・1033 ms（研究の値）。' + (fm ? ' 線維筋痛症の大きさは模式（脳波ではなく fMRI の研究）。' : '');
  if (fm) T.notes.push('線維筋痛症では、<b>同じ強さの刺激</b>で、健康な人より強く・多くの場所が反応する（親指の爪への圧で、患者の方が強かったのは 13 か所、健康な人の方が強かったのは 1 か所。fMRI。Gracely ほか 2002）。痛みの感じ方が同じになるように刺激を強めると、反応の形は似ていた。ここでは強さを模式的に 1.6 倍にしています。');
  return T;
}

/* ---------- paired clicks (P50 gating) ---------- */
function buildClick(sp, w, cond, opt) {
  if (sp !== 'human') return trialEmpty(MISSING[sp + ':click']);
  const scz = cond === 'scz', g2 = scz ? 0.75 : 0.35;
  const T = { stations: [], peaks: [], sensors: ['earL', 'earR'], notes: [] }, S = T.stations;
  T.notes.push('同じ「カチッ」を 0.5 秒あけて2回。ふつうは<b>2回目の反応（P50）が小さくなります</b>（同じものはもう知っている、と入口で絞る＝感覚ゲーティング）。');
  if (scz) T.notes.push('統合失調症では、<b>2回目が小さくなりにくい</b>（20 研究・患者 421 人と健康な人 401 人のまとめで、効果量 1.56＝大きな差。P50 の時刻には差がない。Bramon ほか 2004）。グラフの高さは模式です。');
  for (const k of [0, 500]) {
    const g = k ? g2 : 1, tag = k ? '2' : '1';
    S.push(...both({ id: 'ic' + tag, reg: 'IC', t: k + 5.59, ev: 'measured', label: `${tag}回目: 下丘（V波）`, src: ['sotelo26'], from: 'sensor', note: '耳から 6 ms たらず。' }, { L: 0.7, R: 0.7 }));
    S.push(...both({ id: 'p' + tag, reg: 'A1', t: k + 50, ev: 'measured', label: `${tag}回目: 聴覚野（P50）`, src: ['bramon04'], note: k ? (scz ? '2回目があまり小さくならない（高さは模式）。' : '2回目は小さくなる（高さは模式）。') : '音から約 50 ms の P50。' }, { L: g, R: g }));
  }
  S.forEach(x => {
    if (x.id.startsWith('p')) x.from = 'ic' + x.id[1] + x.side;
    if (x.id.startsWith('ic')) x.sensorKey = 'ear' + x.side;
    if (scz && x.id.startsWith('p2')) x.cond = true;
  });
  T.peaks = [{ name: 'P50（1回目）', t: 50, amp: 1 }, { name: 'P50（2回目）', t: 550, amp: g2 }];
  T.peakSrc = ['bramon04'];
  T.peakNote = '2回目の山の高さ ÷ 1回目の高さ（P50 の比）で、絞り込みの強さを測ります。高さは模式（比そのものの数値は研究ごとにちがう）。';
  return T;
}

const BUILD = { light: buildLight, face: buildFace, sound: buildSound, touch: buildTouch, pain: buildPain, click: buildClick };

/* resolve `from` defaults and the time axis */
function buildTrial(sp, stim, where, cond, opt) {
  if (MISSING[sp + ':' + stim]) return finishTrial(trialEmpty(MISSING[sp + ':' + stim]));
  const T = BUILD[stim](sp, where, cond, opt);
  return finishTrial(T);
}
function finishTrial(T) {
  let prev = 'sensor';
  for (const s of T.stations) {
    if (!s.from) s.from = prev;
    if (s.gain == null) s.gain = 1;
    prev = s.id;
  }
  const tmax = Math.max(0, ...T.stations.map(s => Math.max(s.t, s.t2 || 0)), ...T.peaks.map(p => p.t));
  T.tmax = Math.max(150, tmax * 1.35);
  return T;
}

/* time axis: log-like so 1 ms and 1000 ms both fit */
let TAU = 2;   // set per trial in main.js fire(): about the first station's time, so the empty start does not take half the axis
function tAxis(t, tmax) { return Math.log(1 + Math.max(0, t) / TAU) / Math.log(1 + tmax / TAU); }
function tInv(p, tmax) { return TAU * (Math.pow(1 + tmax / TAU, p) - 1); }

/* activation (0..1, signed by gain) at playhead position p (axis units) */
function activation(st, p, tmax) {
  const x = (p - tAxis(st.t, tmax)) / 0.045;
  if (x <= 0) return 0;
  const a = x < 1 ? x : 0.3 + 0.7 * Math.exp(-(x - 1) / 2.2);
  return a * st.gain;
}

/* scalp wave as a sum of bumps on the same axis */
function waveAt(peaks, p, tmax) {
  let y = 0;
  for (const k of peaks) { const d = (p - tAxis(k.t, tmax)) / (k.w || 0.028); y += k.amp * Math.exp(-d * d); }
  return y;
}
