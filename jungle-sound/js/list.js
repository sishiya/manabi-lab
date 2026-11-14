// 熱帯雨林の音 — 声の一覧（下にスクロール。声の帯と同じ順・同じ番号）
// 1行 = ON／OFF のボタン（点と ON／OFF の字。2026-11-14 ユーザーの指示でトグルスイッチから戻した）・番号・写真・名前・「だけ」・「次の声へ」。行を押すとその声を選ぶ（写真と出どころが開く）。
// 選んだ声: 帯と一覧に白い縁どり。
// 確かさ: 種まで（録音への専門家の注釈で種が付いた鳥の声）／鳥・種は不明（注釈で種が付かなかった「????」）／分けられていない（土台。虫・カエルなど）
// 文は L('日本語', 'English')（I18N.md）。英語の鳥の名前は録音の注釈の英名（species.json の en）、紹介は desc_en
'use strict';
window.List = (() => {
  const $ = id => document.getElementById(id);
  const KIND = { sp: [L('種まで', 'Species known'), 'k-sp'], bird: [L('鳥・種は不明', 'Bird, species unknown'), 'k-bird'], bed: [L('分けられていない', 'Not separated'), 'k-bed'] };
  let order = [], sp = {}, count = {}, ev = {}, sel = null, soloCode = null, onChange = () => {};
  const kindOf = code => code === 'bed' ? 'bed' : code === '????' ? 'bird' : 'sp';
  const nameOf = code => { const s = sp[code] || {}; return code === 'bed' ? L('虫・カエルなど', 'Insects, frogs, etc.') : code === '????' ? L('種の付かなかった鳥', 'Unidentified birds') : L(s.ja || s.en, s.en); };
  const short = code => code === '????' ? L('種不明の鳥', 'Unknown bird') : nameOf(code);
  const isOn = code => Forest.isOn(code);
  const LABEL = { all: L('全部', 'All'), known: L('種が分かる鳥だけ', 'Known birds only'), unknown: L('種が不明の音だけ', 'Unknown sounds only') };

  function build(forest, species, changed) {
    onChange = changed;
    sp = Object.fromEntries(species.map(s => [s.code, s]));
    for (const s of forest.species) count[s.code] = s.n;
    for (const e of forest.events) (ev[e[0]] = ev[e[0]] || []).push(e);
    order = ['????', ...forest.species.filter(s => s.code !== '????').map(s => s.code)];   // 帯の行の順（種不明の鳥を虫・カエルのすぐ下に。あとは多く鳴く順。2026-11-14 ユーザー）
    const row = (code, i) => {
      const k = kindOf(code), s = sp[code] || {}, name = nameOf(code);
      const pic = s.photo ? `<img src="${s.photo.file}" alt="" loading="lazy">` : `<span class="q">${k === 'sp' ? `<small>${L('写真なし', 'No photo')}</small>` : k === 'bird' ? L('鳥？', 'Bird?') : L('？', '?')}</span>`;
      const n = count[code];
      const sub = k === 'bed' ? L('だれの声か分けられていない', 'Not separated by who is calling') : k === 'bird' ? L(`種は分からない・${n} 回`, `Species unknown · ${n} calls`) : `<i>${s.sci}</i>${L(`・${n} 回`, ` · ${n} call${n > 1 ? 's' : ''}`)}`;
      return `<li class="lr" data-code="${code}">
        <button class="sw" aria-pressed="true" aria-label="${L(`${name}を鳴らす／消す`, `Play or mute ${name}`)}"><span class="sw-dot"></span><span class="sw-txt">ON</span></button>
        <button class="lr-body" aria-expanded="false" aria-label="${L(`${name}を選ぶ`, `Select ${name}`)}">
          <span class="num ${KIND[k][1]}">${code === 'bed' ? L('地', '–') : i + 1}</span>${pic}
          <span class="lr-text"><span class="lr-name">${name} <span class="vc-kind ${KIND[k][1]}">${KIND[k][0]}</span></span><span class="lr-sub">${sub}</span></span>
        </button>
        <button class="solo btn" aria-pressed="false" aria-label="${L(`${name}だけを聞く`, `Hear only ${name}`)}">${L('だけ', 'Solo')}</button>
        ${code === 'bed' ? '' : `<button class="next btn" aria-label="${L(`${name}の次の声へ移動`, `Jump to the next call of ${name}`)}">▶|</button>`}
        <div class="lr-detail" hidden></div></li>`;
    };
    $('voiceList').innerHTML = row('bed', -1) + order.map(row).join('');
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const code = li.dataset.code;
      const sw = li.querySelector('.sw'), solo = li.querySelector('.solo');
      sw.onclick = () => keep(sw, () => { soloCode = null; setOn(code, !isOn(code)); });
      li.querySelector('.lr-body').onclick = () => select(sel === code ? null : code);
      solo.onclick = () => keep(solo, () => { only(c => c === code, L(`「${short(code)}」だけ`, `Only “${short(code)}”`)); soloCode = code; marks(); });
      const nx = li.querySelector('.next'); if (nx) nx.onclick = () => { if (sel !== code) select(code, false); next(code); };
    }
    $('gAll').onclick = () => keep($('gAll'), () => only(() => true, LABEL.all));
    $('gKnown').onclick = () => keep($('gKnown'), () => only(c => kindOf(c) === 'sp', LABEL.known));
    $('gUnknown').onclick = () => keep($('gUnknown'), () => only(c => kindOf(c) !== 'sp', LABEL.unknown));
    credits(); summary(LABEL.all);
  }
  const all = () => ['bed', ...order];
  // 押したボタンが画面の同じ位置に残るようにする（上の文が変わって下がずれ、となりを押しまちがえないように。2026-11-14 ユーザー）
  function keep(el, fn) {
    const y0 = el.getBoundingClientRect().top; fn();
    const dy = el.getBoundingClientRect().top - y0; if (Math.abs(dy) > 0.5) scrollBy(0, dy);
  }
  function setOn(code, on, quiet) {
    Forest.set(code, on);
    const li = $('voiceList').querySelector(`[data-code="${CSS.escape(code)}"]`);
    li.classList.toggle('off', !on); li.querySelector('.sw').setAttribute('aria-pressed', on); li.querySelector('.sw-txt').textContent = on ? 'ON' : 'OFF';
    const nx = li.querySelector('.next'); if (nx) nx.disabled = !on;   // 消している声へは飛べない
    if (!quiet) { marks(); summary(null); onChange(); }
  }
  function only(test, label) { soloCode = null; for (const c of all()) setOn(c, test(c), true); marks(); summary(label); onChange(); }
  function marks() {
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const s = li.dataset.code === soloCode; li.classList.toggle('solo-on', s); li.querySelector('.solo').setAttribute('aria-pressed', s);
    }
  }
  // 画面の文は、いまの状態だけを書く（開発の経緯・前の状態との差は書かない。RULES 9章）
  function summary(label) {
    const on = all().filter(isOn), N = on.length, M = all().length;
    const boost = !isOn('bed') && N > 0 ? Forest.BOOST_DB : 0;   // 虫・カエルを消して鳥だけのときは、聞きやすいように大きく
    Forest.boost(boost);
    // 1行だけ（高さを変えない。+20 dB の注意も同じ行の後ろに）
    $('mixState').innerHTML = `${label ? `<b>${label}</b>${L(' ・ ', ' · ')}` : ''}${L(`鳴らしている声 ${N} / ${M}`, `Playing ${N} / ${M} voices`)}` +
      (boost ? `${L(' ・ ', ' · ')}<span class="boost">${L(`鳥の声を +${boost} dB（本物より大きい）`, `birds +${boost} dB (louder than real)`)}</span>` : '');
    // 上に固定した所の一行は、全部鳴らしているときは出さない（消した声・「だけ」・+20 dB があるときだけ）
    const partial = N < M;
    if (!partial && !boost) { $('pinState').innerHTML = ''; return; }
    $('pinState').innerHTML = (soloCode ? `<b>${L(`「${short(soloCode)}」だけ`, `Only “${short(soloCode)}”`)}</b>` : label && label !== LABEL.all && partial ? `<b>${label}</b>` : L(`鳴らしている ${N} / ${M}`, `Playing ${N} / ${M}`)) +
      (boost ? ` <span class="boost-tag">+${boost} dB</span>` : '');
  }
  // ---- 選ぶ・次の声へ ----
  // 選ぶ = 帯と一覧に白い縁どり。open のときだけ行を開いて写真と説明を出す（▶| では開かない。高さが変わらないように）
  function select(code, open = true) {
    sel = code;
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const s = li.dataset.code === code, d = li.querySelector('.lr-detail'), show = s && open;
      li.classList.toggle('sel', s); li.querySelector('.lr-body').setAttribute('aria-expanded', show);
      if (open || !s) { d.hidden = !show; if (show) d.innerHTML = detail(code); }
      if (show) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    onChange();
  }
  function detail(code) {
    const s = sp[code] || {}, p = s.photo;
    if (code === 'bed') return `<p>${L('虫・カエルなど。ずっと鳴っています（上の帯の灰色の波）。', 'Insects, frogs and more. They call all the time (the gray wave in the lanes above).')}</p>`;
    if (code === '????') return `<p>${L('鳥の声だが、種は分からない声。', 'Bird calls whose species is unknown.')}</p>`;
    // まず短く（写真・名前・紹介1〜2行）、くわしくは開いて（リンク・紹介の出どころ・写真の出どころ）。RULES 9章
    const a = (href, t) => `<a href="${href}" target="_blank" rel="noopener">${t}</a>`, w = s.wiki || {};
    const links = [
      w.ja && a(`https://ja.wikipedia.org/wiki/${encodeURIComponent(w.ja)}`, L('Wikipedia（日本語）', 'Wikipedia (Japanese)')),
      w.en && a(`https://en.wikipedia.org/wiki/${encodeURIComponent(w.en.replace(/ /g, '_'))}`, L('Wikipedia（英語）', 'Wikipedia (English)')),
      a(`https://ebird.org/species/${code}`, L('eBird（分布・写真）', 'eBird (range, photos)')),
      a(`https://xeno-canto.org/species/${s.sci.replace(' ', '-')}`, L('xeno-canto（ほかの場所の声）', 'xeno-canto (calls from other places)')),
    ].filter(Boolean).join(L(' ・ ', ' · '));
    const desc = L(s.desc, s.desc_en);
    return (p ? `<img class="big" src="${p.file}" alt="${L(`${nameOf(code)}の写真`, `Photo of ${nameOf(code)}`)}">` : '') +
      `<p><b>${nameOf(code)}</b>${L('　', ' ')}<i>${s.sci}</i>${L(s.ja ? '' : '（和名は未確認）', '')}</p>` +
      (desc ? `<p class="desc">${desc}</p>` : '') +
      `<details class="more"><summary>${L('くわしく・リンク', 'More & links')}</summary>
        <p>${links}</p>
        ${desc && w.en ? `<p class="cr">${L(`紹介文: 英語版 Wikipedia「${w.en}」（${w.checked} に読んだ版）の事実をもとに、このアプリで書いたもの。`, `Description: written for this app from facts in the English Wikipedia article “${w.en}” (version read on ${w.checked}).`)}</p>` : ''}
        ${p ? `<p class="cr">${L('写真', 'Photo')}: ${p.attribution || p.artist} (${a(p.page, 'Commons')}, ${a(p.license_url, p.license)})${L('・同じ種の別の個体', ' · another individual of the same species')}</p>` : ''}
      </details>`;
  }
  function next(code) {
    const t = Forest.time, list = ev[code] || []; if (!list.length) return;
    const e = list.find(x => x[1] - 1 > t + 0.3) || list[0];   // 次の声の1秒前へ（最後なら最初へ）
    hookSeek(Math.max(0, e[1] - 1), code);
  }
  let hookSeek = () => {};
  // いま鳴いている声の行を光らせる（一覧の写真のまわりが光り、行の地が少し明るくなる）。
  // 大きさの変わらない見た目だけ（影・背景の色）を変えるので、レイアウトはずれない（2026-11-14 ユーザー）。変わった行だけ書きかえる
  let liveNow = {};
  function setLive(lv) {
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const c = li.dataset.code, on = !!lv[c];
      if (!!liveNow[c] !== on) li.classList.toggle('live', on);
    }
    liveNow = { ...lv };
  }
  function credits() {
    $('photoCredits').innerHTML = order.filter(c => sp[c] && sp[c].photo).map(c => {
      const s = sp[c], p = s.photo;
      return `<li>${nameOf(c)} (<i>${s.sci}</i>): ${p.attribution || p.artist}, <a href="${p.page}" target="_blank" rel="noopener">Wikimedia Commons</a>, <a href="${p.license_url}" target="_blank" rel="noopener">${p.license}</a>${L('（このアプリで変えたこと: 幅 320px に縮小・撮影情報を削除）', ' (changes made in this app: resized to 320 px wide, photo data removed)')}</li>`;
    }).join('');
  }
  return {
    build, select, next, isOn, short, nameOf, setLive, get sel() { return sel; }, get order() { return order; },
    set seekHook(f) { hookSeek = f; }, events: code => ev[code] || [],
  };
})();
