// 熱帯雨林の音 — 本物とのくらべ（数の表と、どちらが本物かを当てる聞きくらべ）
'use strict';
window.Compare = (() => {
  const $ = id => document.getElementById(id);
  const ROUND = 10, PASS = 9;    // 10回中9回以上当たれば「聞き分けられる」（偶然でそうなる見こみは約1%）。20回はしんどい（2026-11-14 ユーザー）ので10回に
  const NAME = {
    level_dbfs: ['全体の大きさ（dBFS）', ''],
    L10: ['大きいときの大きさ（L10）', '1秒ごとの大きさで、上から10%の所'],
    L90: ['静かなときの大きさ（L90）', '下から10%の所。いつも鳴っている虫の音の大きさの目安'],
    aci: ['音のゆれ（ACI）', '強さが細かく変わる音（鳥のさえずりなど）が多いほど大きい'],
    H: ['音の散らばり（H）', 'いろいろな高さ・時間に音が散らばるほど 1 に近い'],
    ndsi: ['生き物の帯の強さ（NDSI）', '2〜8 kHz が 1〜2 kHz より強いほど 1 に近い'],
    adi: ['使われている高さの多さ（ADI）', '0〜10 kHz の帯のうち、音のある帯が多くて均等なほど大きい'],
    aei: ['使われている高さのかたより（AEI）', '一部の帯にかたよるほど大きい'],
    onset_1_4k: ['鳴きはじめの数 1〜4 kHz', '1分あたり'],
    onset_4_8k: ['鳴きはじめの数 4〜8 kHz', '1分あたり'],
    onset_8_16k: ['鳴きはじめの数 8〜16 kHz', '1分あたり'],
  };
  const inside = p => p >= 5 && p <= 95;
  const fmt = (v, k) => k.startsWith('active') ? (v * 100).toFixed(0) + '%' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(k.startsWith('onset') || k.startsWith('L') || k.startsWith('level') || k.startsWith('shape') ? 1 : 3);
  const nm = k => NAME[k] ? NAME[k][0] : k.startsWith('shape') ? `${+k.slice(6, 8)}〜${+k.slice(6, 8) + 1} kHz の音の量（全体に対する dB）` : `${+k.slice(7, 9)}〜${+k.slice(7, 9) + 1} kHz で音のある時間`;
  const pc = p => `<span class="${inside(p) ? 'in' : 'out'}">${p.toFixed(0)}</span>`;

  function table(rows, badNames) {
    return '<table><tr><th>くらべるもの</th><th>本物（5%〜95%）</th><th>重ねた森 1・2・3<br><small>本物の中の位置%</small></th>' +
      badNames.map(b => `<th><small>${b}</small></th>`).join('') + '</tr>' + rows.map(r =>
        `<tr><td>${nm(r.key)}${NAME[r.key] && NAME[r.key][1] ? `<br><small>${NAME[r.key][1]}</small>` : ''}</td>` +
        `<td class="num">${fmt(r.ref_p05, r.key)}〜${fmt(r.ref_p95, r.key)}</td><td class="num">${r.mix_pct.map(pc).join(' ')}</td>` +
        badNames.map(b => `<td class="num">${pc(r.bad[b].pct)}</td>`).join('') + '</tr>').join('') + '</table>';
  }

  function render(info) {
    const M = info.metrics, main = M.filter(r => NAME[r.key]), band = M.filter(r => !NAME[r.key]);
    const badNames = Object.keys(M[0].bad);
    const nIn = s => M.filter(r => inside(r.mix_pct[s])).length;
    const badOut = b => M.filter(r => !inside(r.bad[b].pct)).length;
    $('metrics').innerHTML = table(main, badNames) +
      `<p class="summary">本物の 5〜95% に入った数（${M.length} 個のうち）: 重ねた森 ${nIn(0)}・${nIn(1)}・${nIn(2)} 個 ／ 基準に入れていない本物の別の録音 ${Object.values(info.real_other).join('・')} 個</p>` +
      `<p><b>この数で言えること</b>: 大きな外れはありませんでした。ただし、重ねた森は土台の録音と作り方を<b>この基準の数がよくなるほうから選んだ</b>ので、入った数は有利に出ています。基準は3か所だけなので、ほかの場所の本物は外れやすくなっています。だから「本物より本物らしい」とは言えません。</p>` +
      `<p><b>物差しの効き目</b>: わざと悪く作っても、本物の外に出たのは ${badNames.map(b => `${b} ${badOut(b)} 個`).join('・')}だけでした。つまり、<b>この物差しでは本物かどうかをまだ見分けられません</b>。本物らしさを決めるのは、上の耳の聞きくらべです。<br>` +
      `<small>※ 数どうしはつながっている（同じことを別の形で測っている）ので、合計は目安です。数字の色: <span class="in">入った</span>／<span class="out">外れた</span>。</small></p>`;
    $('bands').innerHTML = table(band, badNames);
    const mc = info.machine;
    $('machine').innerHTML = `<p>15秒ずつに切った音の数（下の表の数。全体の大きさはのぞく）から、機械（ロジスティック回帰）に「本物か、重ねた森か」を当てさせました。正解率 <b>50%</b> なら見分けられない、100% ならすぐ見分けられる、です。</p>` +
      `<table><tr><th>作り方</th><th>同じ3分の本物と</th><th>別の時刻の本物と</th></tr>` +
      mc.variants.map(v => `<tr><td>重ねた森（${v.label}）${v.bed === info.method.bed && v.clip === info.method.clip ? ' <b>← いまの音</b>' : ''}</td><td class="num ${v.acc <= 70 ? 'in' : 'out'}">${v.acc.toFixed(0)}%</td><td class="num">${v.acc_time.toFixed(0)}%</td></tr>`).join('') +
      `</table><p><b>同じ3分の本物と</b>: 本物は、土台のもとになった同じ3分（鳥を塗りつぶす前）。虫の音は同じなので、測れるのは<b>鳥の入れかえと塗りつぶしの跡がばれないか</b>だけです。森全体が本物らしいかは、ここでは言えません。本物の15秒が12個しかないので、数字は ±15% ほどぶれます。<br>` +
      `<b>別の時刻の本物と</b>: 同じ場所・同じ日の別の時刻（5時15〜39分の3分×${info.same_windows.length}本）。虫の合唱が時刻で変わるので、本物どうしでも ${mc.base_time.toFixed(0)}% 見分けられます。これより高いぶんが、重ねた森の不自然さの目安です。</p>` +
      `<p><small>参考: <b>別の場所の本物</b>どうしは ${mc.base_site.toFixed(0)}% で見分けられました。場所のちがいはとても大きいので、くらべる本物は同じ場所にしています。<br>` +
      `※ 重ねた森は ${mc.seeds} 本。鳥の入れ方は、この正解率がいちばん低いものを選んだので、いまの音の数字は少し有利に出ています。同じ3分の本物は1本だけなので、15秒ずつを別々に数えています。</small></p>`;
    const m = info.mixes[0], nb = m.birds.reduce((s, b) => s + b.placed, 0), unk = m.birds.find(b => b.code === '????');
    const bi = info.bed_info;
    $('what').innerHTML = `どれも同じ保護区（ペルー Inkaterra Reserva Amazonica）で 2019年1月の夜明けに録った本物の録音です。ひとつの場所で同時に鳴った音そのものではありません。<br>` +
      (bi.kind === 'fill'
        ? `<b>土台</b>: 1か所・1日の録音の<b>連続した3分</b>（つなぎ目なし）から、鳥の声の注釈の箱 ${bi.boxes} 個を、近くの時刻（±90秒）の同じ高さの音で塗りつぶしたもの。残っているのは虫やカエルなどの声で、<b>だれの声かは分けられていません</b>。注釈されなかった遠くの鳥や風の音、塗りきれなかった鳥の声のなごりも入りえます。<br>`
        : `<b>土台</b>: 1か所・1日の録音から、鳥の声の注釈がない区間をつないだもの（つなぎ目 ${bi.joins} 個）。<br>`) +
      `<b>鳥</b>: ほかの録音で本物の鳥が鳴いた時刻の並びを種ごとに写し、そこへ同じ種の声の切り出しをはめました（この3分: ${m.birds.length} 種・${nb} 回` +
      (unk ? `、うち ${unk.placed} 回は<b>鳥だが種がわからない</b>声` : '') + `。切り出しがなく置けなかった種 ${m.missing}）。` +
      ((nm => nm ? `そのうち、ほかの鳥と重ならない切り出しがない ${nm} 種は、重なった切り出しを使いました（別の鳥の声もまざります）。` : '')(m.birds.filter(b => info.messy_species.includes(b.code)).length)) +
      ({ sub: '鳥の切り出しからは、前後1秒のまわりの音（虫など）を引いて、鳥の声だけを残しました（声の響きや弱い部分が少し欠けます）。',
         band: '鳥の声は注釈の高さの範囲だけ残したので、声の響きや高い倍音が少し欠けます。',
         raw: '鳥の声は、まわりの音ごと重ねました（切り出しのあいだは、別の場所の虫の音が二重になります）。' }[info.method.clip]) + `<br>` +
      `どの音も本物の録音で、計算や AI で作った音は入っていません。`;
  }

  // ---- どちらが本物？（伏せた聞きくらべ。20回でまとめて結果を出す）----
  let trial = null, heard = { A: false, B: false }, n = 0, hit = 0, round = 0;
  function newTrial() {
    trial = { realIs: Math.random() < 0.5 ? 'A' : 'B', ref: 1, mix: 1 + Math.floor(Math.random() * 3), at: Math.floor(Math.random() * 160) };   // 本物は同じ3分の1本（ref1）、同じ位置
    heard = { A: false, B: false };
    $('pickA').disabled = $('pickB').disabled = true;
  }
  function src(which) { return which === trial.realIs ? `ref${trial.ref}` : `mix${trial.mix}`; }
  function heardOne(which) {
    heard[which] = true;
    if (heard.A && heard.B) { $('pickA').disabled = $('pickB').disabled = false; $('abResult').textContent = '本物だと思うほうを選んでください'; }
    else $('abResult').textContent = `${which === 'A' ? 'B' : 'A'} も聞いてください`;
  }
  function answer(which) {
    n++; if (which === trial.realIs) hit++;
    if (n < ROUND) {
      $('abResult').textContent = `${n} 回目を記録しました。次の組を用意しました（当たりはずれは ${ROUND} 回のあとにまとめて出します）`;
      $('abScore').textContent = `${round ? `これまでの組: ${round} 組 ・ ` : ''}いまの組: ${n} / ${ROUND} 回`;
    } else {
      round++;
      const ok = hit >= PASS;
      $('abResult').innerHTML = `${ROUND} 回中 <b>${hit} 回</b>当たり → ` + (ok ? '<span class="out">聞き分けられました（本物らしさはまだ足りない）</span>' : '<span class="in">聞き分けられませんでした</span>（ただし10回では小さなちがいは見のがします。本物らしいという証明ではありません）');
      $('abScore').textContent = `目安: ${ROUND} 回中 ${PASS} 回以上当たれば「聞き分けられる」。続けると次の ${ROUND} 回が始まります（${round} 組目まで終わり）`;
      n = 0; hit = 0;
    }
    newTrial();
  }
  return { render, newTrial, src, heardOne, answer, get trial() { return trial; } };
})();
