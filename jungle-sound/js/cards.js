// 熱帯雨林の音 — 第二弾: 声のカード（押すと ON／OFF、「だけ」でその声だけ、鳴っているあいだ光る）
// 確かさ: 種まで（録音への専門家の注釈で種が付いた鳥の声）／鳥・種は不明（注釈で種が付かなかった「????」）／分けられていない（土台。虫・カエルなど）
'use strict';
window.Cards = (() => {
  const $ = id => document.getElementById(id);
  const KIND = {
    sp: ['種まで', 'k-sp'],
    bird: ['鳥・種は不明', 'k-bird'],
    bed: ['分けられていない', 'k-bed'],
  };
  let list = [], sp = {}, raf = 0, soloCode = null, lastHear = '';
  const kindOf = code => code === 'bed' ? 'bed' : code === '????' ? 'bird' : 'sp';
  const nameOf = code => { const k = kindOf(code), s = sp[code] || {}; return k === 'bed' ? '虫・カエルなど' : k === 'bird' ? '種の付かなかった鳥' : (s.ja || s.en); };

  function build(forest, species) {
    sp = Object.fromEntries(species.map(s => [s.code, s]));
    const n = Object.fromEntries(forest.species.map(s => [s.code, s.n]));
    list = ['bed', ...forest.species.filter(s => s.code !== '????').map(s => s.code), '????'];
    $('cards').innerHTML = list.map(code => {
      const k = kindOf(code), s = sp[code] || {}, name = nameOf(code);
      // 写真のない「種まで」の鳥は「？」にしない（種のわからない声とまちがえるので）
      const pic = s.photo ? `<img src="${s.photo.file}" alt="" loading="lazy">` : `<span class="q">${k === 'sp' ? '<small>写真なし</small>' : k === 'bird' ? '鳥？' : '？'}</span>`;
      const sub = k === 'bed' ? 'だれの声か分けられていない音（土台）' : k === 'bird' ? '注釈で種が付かなかった鳥の声' : `<i>${s.sci}</i>${s.ja ? '' : '（和名は未確認）'}`;
      const cnt = k === 'bed' ? 'ずっと' : `3分で ${n[code]} 回`;
      return `<div class="vc" data-code="${code}" role="group" aria-label="${name}">
        <button class="vc-main" aria-pressed="true" aria-label="${name}を鳴らす／消す" title="押すと鳴らす／消す">${pic}<span class="vc-kind ${KIND[k][1]}">${KIND[k][0]}</span>
          <span class="vc-name">${name}</span><span class="vc-sub">${sub}</span><span class="vc-cnt">${cnt}</span><span class="vc-state">ON</span></button>
        <button class="vc-solo" aria-pressed="false" aria-label="${name}だけを聞く" title="この声だけを聞く">だけ</button></div>`;
    }).join('');
    for (const el of $('cards').querySelectorAll('.vc')) {
      const code = el.dataset.code;
      el.querySelector('.vc-main').onclick = () => { soloCode = null; setOn(code, !Forest.isOn(code)); };
      el.querySelector('.vc-solo').onclick = () => { only(c => c === code, `「${nameOf(code)}」だけ`); soloCode = code; marks(); };
    }
    $('gAll').onclick = () => only(() => true, '全部');
    $('gKnown').onclick = () => only(c => kindOf(c) === 'sp', '種まで分かる鳥だけ');
    $('gUnknown').onclick = () => only(c => kindOf(c) !== 'sp', '種の分からない音だけ（種の付かなかった鳥＋分けられていない音）');
    credits();
    summary('全部');
  }
  function setOn(code, on, quiet) {
    Forest.set(code, on);
    const el = $('cards').querySelector(`[data-code="${CSS.escape(code)}"]`);
    el.classList.toggle('off', !on); el.querySelector('.vc-main').setAttribute('aria-pressed', on);
    el.querySelector('.vc-state').textContent = on ? 'ON' : 'OFF';
    if (!quiet) { marks(); summary(null); }
  }
  function only(test, label) { soloCode = null; for (const c of list) setOn(c, test(c), true); marks(); summary(label); }
  function marks() {   // 「だけ」で聞いている声に印を残す
    for (const el of $('cards').querySelectorAll('.vc')) {
      const s = el.dataset.code === soloCode; el.classList.toggle('solo', s); el.querySelector('.vc-solo').setAttribute('aria-pressed', s);
    }
  }
  function summary(label) {
    const on = list.filter(c => Forest.isOn(c)), by = k => on.filter(c => kindOf(c) === k).length;
    // 土台を消して鳥だけにしたときは、鳥の声が小さすぎて聞こえないので大きくする（本物の大きさではないことを書く）
    const boost = !Forest.isOn('bed') && on.length > 0 ? Forest.BOOST_DB : 0;
    Forest.boost(boost);
    // 画面の文は、いまの状態だけを書く（開発の経緯・前の状態との差は書かない。2026-11-14 ユーザー）
    $('mixState').innerHTML = (label ? `<b>${label}</b> ・ ` : '') +
      `鳴らしている声 ${on.length} / ${list.length}（種まで ${by('sp')}・種の付かなかった鳥 ${by('bird')}・分けられていない音 ${by('bed')}）` +
      (boost ? `<br><span class="boost">虫・カエルなどを消しているあいだは、鳥の声を聞きやすいように <b>+${boost} dB</b>（約4倍の大きさに感じる）にしています。本物の森ではもっと小さく聞こえます。</span>` : '');
    // 上に固定した部分にも、いまの状態を一行（スマホでスクロールしても見えるように）
    $('pinState').innerHTML = (soloCode ? `<b>「${nameOf(soloCode)}」だけ</b>` : label && label !== '全部' && on.length < list.length ? `<b>${label.split('（')[0]}</b>` : `鳴らしている ${on.length} / ${list.length}`) +
      (boost ? ` <span class="boost-tag">+${boost} dB</span>` : '');
  }
  // 鳴っているあいだ光らせる（実際の音の大きさで。決め打ちの時間表にしない）。再生中だけ描く。
  // 大きさは ON／OFF・+20 dB の前で測る（forest.js）。消している声もうすく光る
  function glow() {
    raf = 0; if (!Forest.playing || Power.away) return;
    let n = { sp: 0, bird: 0, bed: 0 };
    for (const el of $('cards').querySelectorAll('.vc')) {
      // 鳥は遠くて小さい（-70〜-95 dBFS ほど）。鳴っていないときは無音（-120）なので -100 を境に。土台はいつも -45 ほど
      const code = el.dataset.code, db = Forest.level(code), bed = code === 'bed', live = db > (bed ? -70 : -100);
      el.classList.toggle('live', live);
      el.style.setProperty('--lv', Math.max(0, Math.min(1, bed ? (db + 70) / 30 : (db + 100) / 35)).toFixed(2));
      if (live && Forest.isOn(code)) n[kindOf(code)]++;
    }
    const t = `いま聞こえている: 種まで ${n.sp} ・ 種の付かなかった鳥 ${n.bird} ・ 分けられていない音 ${n.bed ? 'あり' : 'なし'}`;
    if (t !== lastHear) { $('nowHear').textContent = t; lastHear = t; }   // 変わったときだけ書く
    raf = requestAnimationFrame(glow);
  }
  function startGlow() { if (!raf) raf = requestAnimationFrame(glow); }
  function stopGlow() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const el of $('cards').querySelectorAll('.vc')) el.classList.remove('live');
    $('nowHear').textContent = lastHear = '止まっています';
  }
  function credits() {
    $('photoCredits').innerHTML = list.filter(c => sp[c] && sp[c].photo).map(c => {
      const s = sp[c], p = s.photo;
      return `<li>${s.ja || s.en}（<i>${s.sci}</i>）: ${p.attribution || p.artist}, <a href="${p.page}" target="_blank" rel="noopener">Wikimedia Commons</a>, <a href="${p.license_url}" target="_blank" rel="noopener">${p.license}</a>（このアプリで変えたこと: 幅 320px に縮小・撮影情報を削除）</li>`;
    }).join('');
  }
  return { build, startGlow, stopGlow };
})();
