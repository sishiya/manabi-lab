// 熱帯雨林の音 — 声の一覧（下にスクロール。声の帯と同じ順・同じ番号）
// 1行 = ON／OFF のスイッチ・番号・写真・名前・「だけ」・「次の声へ」。行を押すとその声を選ぶ（写真と出どころが開く）。
// 選んだ声: 帯・グラフ・一覧に白い縁どり。上に固定した所に「次の声へ」「くり返す」。
// 確かさ: 種まで（録音への専門家の注釈で種が付いた鳥の声）／鳥・種は不明（注釈で種が付かなかった「????」）／分けられていない（土台。虫・カエルなど）
'use strict';
window.List = (() => {
  const $ = id => document.getElementById(id);
  const KIND = { sp: ['種まで', 'k-sp'], bird: ['鳥・種は不明', 'k-bird'], bed: ['分けられていない', 'k-bed'] };
  let order = [], sp = {}, count = {}, ev = {}, sel = null, soloCode = null, onChange = () => {};
  const kindOf = code => code === 'bed' ? 'bed' : code === '????' ? 'bird' : 'sp';
  const nameOf = code => { const s = sp[code] || {}; return code === 'bed' ? '虫・カエルなど' : code === '????' ? '種の付かなかった鳥' : (s.ja || s.en); };
  const short = code => code === '????' ? '種不明の鳥' : nameOf(code);
  const isOn = code => Forest.isOn(code);

  function build(forest, species, changed) {
    onChange = changed;
    sp = Object.fromEntries(species.map(s => [s.code, s]));
    for (const s of forest.species) count[s.code] = s.n;
    for (const e of forest.events) (ev[e[0]] = ev[e[0]] || []).push(e);
    order = ['????', ...forest.species.filter(s => s.code !== '????').map(s => s.code)];   // 帯の行の順（種不明の鳥を虫・カエルのすぐ下に。あとは多く鳴く順。2026-11-14 ユーザー）
    const row = (code, i) => {
      const k = kindOf(code), s = sp[code] || {}, name = nameOf(code);
      const pic = s.photo ? `<img src="${s.photo.file}" alt="" loading="lazy">` : `<span class="q">${k === 'sp' ? '<small>写真なし</small>' : k === 'bird' ? '鳥？' : '？'}</span>`;
      const sub = k === 'bed' ? 'だれの声か分けられていない' : k === 'bird' ? `種は分からない・${count[code]} 回` : `<i>${s.sci}</i>・${count[code]} 回`;
      return `<li class="lr" data-code="${code}">
        <button class="sw" aria-pressed="true" aria-label="${name}を鳴らす／消す"><span class="sw-dot"></span><span class="sw-txt">ON</span></button>
        <button class="lr-body" aria-expanded="false" aria-label="${name}を選ぶ">
          <span class="num ${KIND[k][1]}">${code === 'bed' ? '地' : i + 1}</span>${pic}
          <span class="lr-text"><span class="lr-name">${name} <span class="vc-kind ${KIND[k][1]}">${KIND[k][0]}</span></span><span class="lr-sub">${sub}</span></span>
        </button>
        <button class="solo" aria-pressed="false" aria-label="${name}だけを聞く">だけ</button>
        ${code === 'bed' ? '' : `<button class="next" aria-label="${name}の次の声へ移動">▶|</button>`}
        <div class="lr-detail" hidden></div></li>`;
    };
    $('voiceList').innerHTML = row('bed', -1) + order.map(row).join('');
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const code = li.dataset.code;
      const sw = li.querySelector('.sw'), solo = li.querySelector('.solo');
      sw.onclick = () => keep(sw, () => { soloCode = null; setOn(code, !isOn(code)); });
      li.querySelector('.lr-body').onclick = () => select(sel === code ? null : code);
      solo.onclick = () => keep(solo, () => { only(c => c === code, `「${short(code)}」だけ`); soloCode = code; marks(); });
      const nx = li.querySelector('.next'); if (nx) nx.onclick = () => { select(code, true); next(); };
    }
    $('gAll').onclick = () => keep($('gAll'), () => only(() => true, '全部'));
    $('gKnown').onclick = () => keep($('gKnown'), () => only(c => kindOf(c) === 'sp', '種まで分かる鳥だけ'));
    $('gUnknown').onclick = () => keep($('gUnknown'), () => only(c => kindOf(c) !== 'sp', '種の分からない音だけ'));
    $('selNext').onclick = next;
    $('selLoop').onclick = () => toggleLoop();
    $('selClear').onclick = () => select(null);
    credits(); summary('全部'); selBar();
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
    if (!quiet) { marks(); summary(null); selBar(); onChange(); }
  }
  function only(test, label) { soloCode = null; for (const c of all()) setOn(c, test(c), true); marks(); summary(label); selBar(); onChange(); }
  function marks() {
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const s = li.dataset.code === soloCode; li.classList.toggle('solo-on', s); li.querySelector('.solo').setAttribute('aria-pressed', s);
    }
  }
  // 画面の文は、いまの状態だけを書く（開発の経緯・前の状態との差は書かない。RULES 9章）
  function summary(label) {
    const on = all().filter(isOn), by = k => on.filter(c => kindOf(c) === k).length;
    const boost = !isOn('bed') && on.length > 0 ? Forest.BOOST_DB : 0;   // 虫・カエルを消して鳥だけのときは、聞きやすいように大きく
    Forest.boost(boost);
    // 高さが変わらないように、いつも2行（1行目: いま鳴らしている数、2行目: 大きくしているときだけの注意）
    $('mixState').innerHTML = `<span>${label ? `<b>${label}</b> ・ ` : ''}鳴らしている声 ${on.length} / ${all().length}</span>` +
      `<span class="boost">${boost ? `鳥の声を +${boost} dB 大きくしています（本物より大きい）` : ''}</span>`;
    // 上に固定した所の一行は、全部鳴らしているときは出さない（消した声・「だけ」・+20 dB があるときだけ）
    const partial = on.length < all().length;
    $('pinState').hidden = !partial && !boost;
    $('pinState').innerHTML = (soloCode ? `<b>「${short(soloCode)}」だけ</b>` : label && label !== '全部' && partial ? `<b>${label.split('（')[0]}</b>` : `鳴らしている ${on.length} / ${all().length}`) +
      (boost ? ` <span class="boost-tag">+${boost} dB</span>` : '');
  }
  // ---- 選ぶ・次の声へ・くり返す ----
  function select(code, keepScroll) {
    sel = code; Forest.loop(null);
    for (const li of $('voiceList').querySelectorAll('.lr')) {
      const s = li.dataset.code === code, d = li.querySelector('.lr-detail');
      li.classList.toggle('sel', s); li.querySelector('.lr-body').setAttribute('aria-expanded', s);
      d.hidden = !s; if (s) d.innerHTML = detail(code);
      if (s && !keepScroll) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    selBar(); onChange();
  }
  function detail(code) {
    const s = sp[code] || {}, p = s.photo;
    if (code === 'bed') return `<p>虫・カエルなど。ずっと鳴っています（上の帯の灰色の波）。</p>`;
    if (code === '????') return `<p>鳥の声だが、種は分からない声。</p>`;
    return (p ? `<img class="big" src="${p.file}" alt="${nameOf(code)}の写真">` : '') +
      `<p><b>${nameOf(code)}</b>　<i>${s.sci}</i>${s.ja ? '' : '（和名は未確認）'}</p>` +
      (p ? `<p class="cr">写真: ${p.attribution || p.artist}（<a href="${p.page}" target="_blank" rel="noopener">Commons</a>, <a href="${p.license_url}" target="_blank" rel="noopener">${p.license}</a>）・同じ種の別の個体</p>` : '');
  }
  function next() {
    if (!sel || sel === 'bed') return;
    const t = Forest.time, list = ev[sel] || []; if (!list.length) return;
    const e = list.find(x => x[1] - 1 > t + 0.3) || list[0];   // 次の声の1秒前へ（最後なら最初へ）
    hookSeek(Math.max(0, e[1] - 1), sel);
    if (Forest.loopAB) Forest.loop([Math.max(0, e[1] - 3), e[1] + e[3] + 3]);
    selBar();
  }
  function toggleLoop() {
    if (Forest.loopAB) { Forest.loop(null); selBar(); onChange(); return; }
    const t = Forest.time, list = ev[sel] || []; if (!list.length) return;
    // いまに近い声（なければ次の声）の前後3秒をくり返す
    const e = list.reduce((b, x) => (!b || Math.abs(x[1] - t) < Math.abs(b[1] - t) ? x : b), null);
    Forest.loop([Math.max(0, e[1] - 3), Math.min(Forest.data.length_s, e[1] + e[3] + 3)]); hookSeek(Math.max(0, e[1] - 3), sel); selBar(); onChange();
  }
  let hookSeek = () => {};
  function selBar() {
    $('selBar').hidden = !sel;
    if (!sel) return;
    $('selName').textContent = short(sel);
    const bed = sel === 'bed';
    $('selNext').hidden = bed; $('selLoop').hidden = bed;
    $('selNext').disabled = $('selLoop').disabled = !isOn(sel);   // 消している声へは飛べない
    $('selLoop').textContent = Forest.loopAB ? '■ くり返しをやめる' : '⟲ くり返す';
    $('selLoop').classList.toggle('on', !!Forest.loopAB);
  }
  function credits() {
    $('photoCredits').innerHTML = order.filter(c => sp[c] && sp[c].photo).map(c => {
      const s = sp[c], p = s.photo;
      return `<li>${nameOf(c)}（<i>${s.sci}</i>）: ${p.attribution || p.artist}, <a href="${p.page}" target="_blank" rel="noopener">Wikimedia Commons</a>, <a href="${p.license_url}" target="_blank" rel="noopener">${p.license}</a>（このアプリで変えたこと: 幅 320px に縮小・撮影情報を削除）</li>`;
    }).join('');
  }
  return {
    build, select, next, isOn, short, nameOf, get sel() { return sel; }, get order() { return order; },
    set seekHook(f) { hookSeek = f; }, events: code => ev[code] || [],
  };
})();
