// ui.js — 層のパネル、地名検索、クリックした地点の情報、スケール表示、このアプリについて。
'use strict';

(function () {
  const GV = window.GV;
  const $ = id => document.getElementById(id);
  const tag = t => `<span class="tag tag-${t}">${GV.TAGS[t]}</span>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 言語（I18N.md）: 属性に入る文と JP／EN のボタン ----------
  document.title = L('神の視点マップ', 'God’s-Eye Map');
  for (const [id, a, ja, en] of [
    ['btn-layers', 'title', '層のパネル', 'Layers panel'], ['btn-layers', 'aria-label', '層のパネル', 'Layers panel'],
    ['btn-home', 'title', '日本全体へ', 'Back to all of Japan'], ['btn-home', 'aria-label', '日本全体へ', 'Back to all of Japan'],
    ['btn-about', 'title', 'このアプリについて', 'About this app'], ['btn-about', 'aria-label', 'このアプリについて', 'About this app'],
    ['about-close', 'aria-label', '閉じる', 'Close'],
    ['btn-tear', 'title', '地球を粒にして、ちぎったらどうなるかを計算します', 'Turns Earth into particles and calculates what happens when you tear off a piece'],
    ['search-q', 'placeholder', '地名・住所でさがす（例: 富士山）', 'Search a place or address (e.g. Mount Fuji)'],
  ]) { const el = $(id); if (el) el.setAttribute(a, L(ja, en)); }
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });

  // ---------- 層のパネル ----------
  // v013（2026-10-20）: パネルをシンプルに。いつも出す = 見どころ・背景・よく使う 8 つ、そのときだけ出す = 時刻（昼と夜・衛星・車のとき）・地下の見どころ、
  // くわしい設定にしまう = 陰影・高さの強調・建物の形・地面の濃さ・ワイヤフレーム・大気。「実データ」の札は外し、推定と演出だけに印（凡例で説明）
  const QUICK = [
    ['fuji', L('富士山', 'Mt. Fuji'), () => GV.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(138.727, 35.27, 6200), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-16), roll: 0 }, duration: 3 })],
    ['tokyo', L('東京駅のビル', 'Tokyo Station'), () => GV.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(139.7671, 35.6745, 700), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 }, duration: 3 })],
    ['under', L('地下街', 'Underground mall'), () => GV.gotoUnder('tokyo')],
    ['space', L('宇宙へ', 'To space'), () => GV.gotoL(7.7)],
    ['micro', L('原子の世界へ', 'Into atoms'), () => GV.gotoL(-0.3)],
  ];
  const BASE_SHORT = { photo: L('写真', 'Photo'), std: L('地図', 'Map'), pale: L('淡色', 'Pale'), relief: L('標高', 'Elevation'), today: L('雲', 'Clouds') };
  function buildLayers() {
    const s = GV.state;
    const chk = (id, on, label, extra = '') => `<label class="row"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> <span>${label}</span>${extra}</label>`;
    let h = `<h3>${L('見どころへ飛ぶ', 'Jump to')}</h3><div class="spots" id="quick">` + QUICK.map(([k, l]) => `<button type="button" data-quick="${k}">${l}</button>`).join('') + '</div>';
    h += `<h3>${L('背景', 'Background')}</h3><div class="seg" id="base-seg">` +
      Object.keys(GV.BASES).map(k => `<button type="button" data-base="${k}" title="${GV.BASES[k].label}" class="${s.base === k ? 'on' : ''}">${BASE_SHORT[k] || GV.BASES[k].label}</button>`).join('') + '</div>';
    h += `<div class="status" id="base-note"></div>`;
    h += `<h3>${L('重ねる', 'Show')}</h3>`;
    h += chk('opt-terrain', s.terrain, L('立体の地形', '3D terrain'));
    h += chk('opt-bldg', s.buildings !== 'off' || s.osmBuildings, L('建物', 'Buildings'), ` <small>${L('日本の都市は PLATEAU', 'PLATEAU in Japanese cities')}</small>`);
    h += '<div id="bldg-status" class="status"></div>';
    h += chk('opt-under', s.underground, L('地下を見る', 'See underground'), ` <small>${L('地面を半透明に', 'see-through ground')}</small>`);
    h += '<div id="under-box"><div class="spots">' + Object.entries(GV.UNDER_SPOTS).map(([k, p]) => `<button type="button" data-spot="${k}">${L(p.label + 'へ', 'To ' + p.label)}</button>`).join('') + '</div><div id="under-status" class="status"></div></div>';
    h += chk('opt-light', s.lighting, L('昼と夜', 'Day and night'), ` ${tag('est')} <small>${L('夜は街の明かり', 'city lights at night')}</small>`);
    h += chk('opt-quake', s.quakes, L('地震', 'Earthquakes'), ` <small>${L('過去7日・M2.5以上', 'past 7 days, M2.5+')}</small>`);
    h += chk('opt-sats', s.sats, L('人工衛星・ISS', 'Satellites, ISS'), ` ${tag('est')}`);
    h += '<div id="life-status" class="status"></div>';
    h += chk('opt-transit', s.transit, L('都営の電車・バス', 'Toei trains and buses'), ` <small>${L('いまの位置・東京', 'live, Tokyo')}</small>`);
    h += '<div id="transit-status" class="status"></div>';
    h += chk('opt-agents', s.agents, L('車・人・鳥', 'Cars, people, birds'), ` ${tag('fx')}`);
    h += '<div id="agents-status" class="status"></div>';
    h += `<div id="time-box"><h3>${L('時刻', 'Time')} <b id="time-now">–</b></h3>`;
    h += `<label class="row slider"><input type="range" id="opt-time" min="-24" max="24" step="0.25" value="0" aria-label="${L('時刻をずらす', 'Shift the time')}"> <span id="time-off" class="muted small">${L('いま', 'now')}</span></label>`;
    h += '<div class="seg" id="time-speed">' + [[1, L('実時間', 'Real time')], [600, L('1秒＝10分', '1 s = 10 min')], [3600, L('1秒＝1時間', '1 s = 1 h')]].map(([x, l]) => `<button type="button" data-speed="${x}">${l}</button>`).join('') + `<button type="button" data-now="1">${L('いまへ', 'Now')}</button></div></div>`;
    h += `<details id="more"><summary>${L('くわしい設定', 'More settings')}</summary>`;
    h += `<label class="row slider">${L('高さの強調', 'Height exaggeration')} <input type="range" id="opt-exag" min="1" max="10" step="0.5" value="${s.exaggeration}"> <b id="exag-val">×${s.exaggeration}</b></label>`;
    for (const k in GV.OVERLAYS) h += `<label class="row"><input type="checkbox" data-ov="${k}" ${s.overlays[k] ? 'checked' : ''}> <span>${GV.OVERLAYS[k].label}</span> <small>${L('日本のみ', 'Japan only')}</small></label>`;
    h += `<div class="sub">${L('建物の形', 'Building shape')}</div><div class="seg" id="bldg-seg">` + [['lod1', L('箱', 'Boxes')], ['lod2', L('屋根まで', 'With roofs')]].map(([k, l]) => `<button type="button" data-bldg="${k}" class="${(s.buildings === 'off' ? s.bldgShape || 'lod2' : s.buildings) === k ? 'on' : ''}">${l}</button>`).join('') + '</div>';
    h += chk('opt-btex', s.bldgTexture, L('壁と屋根の写真', 'Wall and roof photos'));
    h += chk('opt-osmb', s.osmBuildings, L('PLATEAU のない所は OSM の建物', 'OSM buildings where there is no PLATEAU'), ` <small>${L('高さは推定を含む', 'heights partly estimated')}</small>`);
    h += '<div id="osmb-status" class="status"></div>';
    h += chk('opt-night', s.nightLights, L('夜の街の明かり', 'City lights at night'), ` <small>${L('2016年', '2016')}</small>`);
    h += `<label class="row slider">${L('地面の濃さ（地下）', 'Ground opacity (underground)')} <input type="range" id="opt-galpha" min="0.05" max="0.9" step="0.05" value="${s.groundAlpha}"></label>`;
    h += chk('opt-wire', s.wireframe, L('ワイヤフレーム', 'Wireframe'), ` <small>${L('地形と PLATEAU の建物', 'terrain and PLATEAU buildings')}</small>`);
    h += chk('opt-atmo', s.atmosphere, L('大気', 'Atmosphere'));
    h += '</details>';
    h += `<p class="legend">${L('印のないものは実データ。', 'Unmarked items are real data. ')}${tag('est')} ${L('計算・推定', 'calculated / estimated')}　${tag('fx')} ${L('演出（本物ではない）', 'for display (not real)')}</p>`;
    $('layers-body').innerHTML = h;

    // 時刻は、時刻で変わるもの（昼と夜・人工衛星・車・人・鳥）を出しているときだけ
    const syncBoxes = () => {
      $('time-box').hidden = !(s.lighting || s.sats || s.agents);
      $('under-box').hidden = !s.underground;
      $('opt-bldg').checked = s.buildings !== 'off' || s.osmBuildings;
      $('base-note').textContent = s.base === 'today' ? L(`NASA の衛星写真（${GV.YESTERDAY}）。雲も写っています`, `NASA satellite image (${GV.YESTERDAY}), clouds included`) : '';
    };
    GV.syncLayerBoxes = syncBoxes;
    syncBoxes();
    const setBldg = on => {
      if (on) { s.buildings = s.bldgShape || 'lod2'; s.osmBuildings = true; $('opt-osmb').checked = true; }
      else { if (s.buildings !== 'off') s.bldgShape = s.buildings; s.buildings = 'off'; s.osmBuildings = false; $('opt-osmb').checked = false; }
      GV.applyBuildings(); GV.applyOsmBuildings();
    };

    $('layers-body').addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'opt-bldg') setBldg(t.checked);
      else if (t.id === 'opt-btex') { s.bldgTexture = t.checked; GV.applyBuildings(); }
      else if (t.id === 'opt-osmb') { s.osmBuildings = t.checked; GV.applyOsmBuildings(); }
      else if (t.id === 'opt-under') { s.underground = t.checked; GV.applyUnderground(); }
      else if (t.id === 'opt-light') { s.lighting = s.nightLights = t.checked; $('opt-night').checked = t.checked; GV.applyView(); GV.applyLife(); }
      else if (t.id === 'opt-night') { s.nightLights = t.checked; if (t.checked && !s.lighting) { s.lighting = true; $('opt-light').checked = true; GV.applyView(); } GV.applyLife(); }
      else if (t.id === 'opt-quake') { s.quakes = t.checked; GV.applyLife(); }
      else if (t.id === 'opt-sats') { s.sats = t.checked; GV.applyLife(); }
      else if (t.id === 'opt-transit') { s.transit = t.checked; GV.applyTransit(); }
      else if (t.id === 'opt-agents') { s.agents = t.checked; GV.applyAgents(); }
      else if (t.dataset.ov) { s.overlays[t.dataset.ov] = t.checked; GV.applyOverlays(); }
      else if (t.id === 'opt-terrain') { s.terrain = t.checked; GV.applyTerrain(); }
      else if (t.id === 'opt-wire') { s.wireframe = t.checked; GV.applyView(); GV.applyBuildings(); }
      else if (t.id === 'opt-atmo') { s.atmosphere = t.checked; GV.applyView(); }
      syncBoxes();
    });
    $('opt-galpha').addEventListener('input', e => { s.groundAlpha = +e.target.value; GV.applyUnderground(); });
    $('opt-time').addEventListener('input', e => { GV.setTimeOffset(+e.target.value); updateTime(true); });
    $('time-speed').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.now) { GV.setTimeOffset(0); GV.setTimeSpeed(1); }
      else GV.setTimeSpeed(+b.dataset.speed);
      updateTime(true);
    });
    $('layers-body').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.spot) { GV.gotoUnder(b.dataset.spot); syncBoxes(); closeOnPhone(); }
      else if (b.dataset.quick) { QUICK.find(q => q[0] === b.dataset.quick)[2](); setTimeout(syncBoxes, 50); closeOnPhone(); }
      else if (b.dataset.base) { s.base = b.dataset.base; GV.applyBase(); $('base-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); syncBoxes(); }
      else if (b.dataset.bldg) {
        s.bldgShape = b.dataset.bldg; if (s.buildings !== 'off') s.buildings = b.dataset.bldg;
        $('bldg-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        GV.applyBuildings();
      }
    });
    $('opt-exag').addEventListener('input', e => {
      s.exaggeration = +e.target.value;
      $('exag-val').textContent = '×' + s.exaggeration;
      GV.applyTerrain();
    });
  }
  // スマホ幅では、飛ぶボタンを押したらパネルを閉じて行き先を見せる
  const closeOnPhone = () => { if (window.innerWidth < 800) document.body.classList.remove('layers-open'); };

  // ---------- Nominatim（OpenStreetMap の検索・住所） ----------
  // 利用規約: 1秒に1回まで、同じ問い合わせはキャッシュ。ここを通してだけ送る
  const nomCache = new Map();
  let nomNext = 0;
  async function nominatim(url) {
    if (nomCache.has(url)) return nomCache.get(url);
    const wait = nomNext - Date.now();
    nomNext = Math.max(Date.now(), nomNext) + 1100;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const res = await fetch(url);
    if (!res.ok) throw new Error('nominatim ' + res.status);
    const j = await res.json();
    nomCache.set(url, j);
    if (nomCache.size > 200) nomCache.delete(nomCache.keys().next().value);
    return j;
  }

  // 日本の住所を「都道府県＋市区町村＋町名」に並べる（OSM の address の項目から）
  const PREF = ',北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県'.split(',');
  function jpAddress(a) {
    const code = /^JP-(\d\d)$/.exec(a['ISO3166-2-lvl4'] || '');
    const parts = [a.province || a.state || (code ? PREF[+code[1]] : ''),
      a.county, a.city, a.town, a.village, a.city_district, a.suburb, a.quarter, a.neighbourhood];
    const out = [];
    parts.forEach((p, i) => {
      if (!p || out.includes(p)) return;
      // 次の項目が今の項目を含む（「芝公園」→「芝公園四丁目」）ときは今の項目を省く
      if (parts.slice(i + 1).some(q => q && q !== p && q.startsWith(p))) return;
      out.push(p);
    });
    return out.join('');
  }
  function placeTitle(r, withName = true) {
    const a = r.address || {};
    if (a.country_code === 'jp' && LANG !== 'en') {
      const addr = jpAddress(a);
      return withName && r.name && !addr.endsWith(r.name) ? `${r.name}（${addr}）` : addr || r.display_name;
    }
    return r.display_name;
  }

  // ---------- 地名検索 ----------
  function setupSearch() {
    const form = $('search'), input = $('search-q'), list = $('search-list');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      list.innerHTML = `<li class="muted">${L('さがしています…', 'Searching…')}</li>`;
      list.hidden = false;
      let res;
      try { res = await nominatim(GV.API.search(q)); }
      catch (err) { list.innerHTML = `<li class="muted">${L('検索できませんでした（通信）', 'Search failed (network)')}</li>`; return; }
      const arr = (res || []).map(r => ({ title: placeTitle(r), lon: +r.lon, lat: +r.lat }));
      if (!arr.length) { list.innerHTML = `<li class="muted">${L('見つかりませんでした', 'Not found')}</li>`; return; }
      list.innerHTML = arr.map((r, i) => `<li data-i="${i}">${esc(r.title)}</li>`).join('') +
        `<li class="muted src">${L('検索: ', 'Search: ')}${GV.CREDIT.osm}${L('（Nominatim）', ' (Nominatim)')}</li>`;
      list.onclick = ev => {
        const li = ev.target.closest('li[data-i]');
        if (!li) return;
        const r = arr[+li.dataset.i];
        list.hidden = true;
        GV.flyToLonLat(r.lon, r.lat, 1500);
        showPoint(r.lon, r.lat);
      };
    });
    document.addEventListener('click', e => { if (!form.contains(e.target)) list.hidden = true; });
  }

  // ---------- クリックした地点（住所: OSM、標高: 地理院・日本のみ） ----------
  let pointSeq = 0;
  // 地震・人工衛星の点をクリックしたとき
  function showThing(id) {
    const box = $('point');
    box.hidden = false;
    let html;
    const ti = (id.bus || id.train || id.railway) && GV.transitInfo(id);
    if (id.agent) {
      const name = { car: L('車', 'Car'), person: L('人', 'Person'), bird: L('鳥', 'Bird') }[id.agent];
      html = LANG === 'en'
        ? `<div class="muted small">${name} ${tag('fx')}</div><b>An imaginary ${name.toLowerCase()}</b><br><small class="muted">Not a real ${name.toLowerCase()}. It moves in plausible numbers and speeds based on the type of OSM road and the time of day (a Cities: Skylines–style display).</small>`
        : `<div class="muted small">${name} ${tag('fx')}</div><b>架空の${name}です</b><br><small class="muted">実在の${name}ではありません。OSM の道路の種類と時間帯から、それらしい数と速さで動かしています（シティーズ・スカイライン風の演出）。</small>`;
    } else if (ti) {
      html = `<div class="muted small">${id.railway ? L('路線', 'Line') : L('いまの位置', 'Current position')} ${tag(id.railway ? 'est' : 'real')} <small>${L('東京都交通局', 'Toei (Tokyo Metropolitan Bureau of Transportation)')}</small></div><b>${esc(ti.title)}</b><br>${esc(ti.sub)}` +
        (id.railway ? '' : `<br><small class="muted">${L(`位置のデータは「どこからどこへ」まで。間のどこにいるかは経過時間からの推定です。取得 ${esc(GV.transitStatus.time)}`, `The position data only says “from where to where”. Where it is in between is estimated from the time passed. Fetched ${esc(GV.transitStatus.time)}`)}</small>`);
    } else if (id.quake) {
      const t = new Date(id.time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      html = L(`<div class="muted small">地震 ${tag('real')} <small>USGS</small></div><b>マグニチュード ${id.mag.toFixed(1)}</b><br>深さ 約 ${Math.round(id.depth)} km<br>${esc(t)}（日本時間）<br><small class="muted">${esc(id.place || '')}</small>`,
        `<div class="muted small">Earthquake ${tag('real')} <small>USGS</small></div><b>Magnitude ${id.mag.toFixed(1)}</b><br>Depth about ${Math.round(id.depth)} km<br>${esc(t)} (Japan time)<br><small class="muted">${esc(id.place || '')}</small>`);
    } else {
      html = `<div class="muted small">${L('人工衛星', 'Satellite')} ${tag('est')} <small>${L('軌道要素から計算', 'calculated from orbital elements')}</small></div><b>${esc(id.name)}</b>`;
      const s = id.name && /^ISS/.test(id.name);
      if (s) html += L('<br>高さ約 400 km を、約 92 分で地球を1周（秒速 約 7.7 km）', '<br>Circles Earth at about 400 km up, once every 92 minutes or so (about 7.7 km per second)');
    }
    box.innerHTML = `<button class="x" aria-label="${L('閉じる', 'Close')}">×</button>${html}`;
    box.querySelector('.x').onclick = () => { box.hidden = true; };
  }

  // PLATEAU の建物の情報（なければ空）
  function bldgHtml(b) {
    if (!b) return '';
    if (b.pipe) {
      return L(`<div class="bldg"><div class="muted small">地下 ${tag('real')} <small>PLATEAU（長岡市）</small></div><b>${esc(b.name)}</b><br>深さ: 約 1.2 m ${tag('est')} <small class="muted">（データは平面の線だけ。道路の下の水道管の標準的な深さで描いています）</small></div>`,
        `<div class="bldg"><div class="muted small">Underground ${tag('real')} <small>PLATEAU (Nagaoka City)</small></div><b>${esc(b.name)}</b><br>Depth: about 1.2 m ${tag('est')} <small class="muted">(the data has only flat lines; drawn at the standard depth of water pipes under roads)</small></div>`);
    }
    if (b.under) {
      const kinds = { mall: L('地下街', 'underground mall'), sewer: L('下水道', 'sewer'), manhole: L('マンホール', 'manhole') };
      return `<div class="bldg"><div class="muted small">${L('地下', 'Underground')} ${tag('real')} <small>PLATEAU${L('・', ' · ')}${esc(kinds[b.under.kind] || '')}</small></div><b>${esc(b.name || b.under.name)}</b>${b.setYear ? `<br>${L('設置の年: ', 'Year installed: ')}${esc(b.setYear)}` : ''}</div>`;
    }
    if (b.osm) {
      return L(`<div class="bldg"><div class="muted small">建物 ${tag('real')} <small>OpenStreetMap</small></div>高さ: 約 <b>${Math.round(b.height)} m</b> <small class="muted">（OSM の高さ・階数タグから。タグがなければ推定）</small></div>`,
        `<div class="bldg"><div class="muted small">Building ${tag('real')} <small>OpenStreetMap</small></div>Height: about <b>${Math.round(b.height)} m</b> <small class="muted">(from OSM height and floor tags; estimated if there are no tags)</small></div>`);
    }
    const rows = [];
    if (b.name) rows.push(`<b>${esc(b.name)}</b>`);
    if (b.usage) rows.push(L('用途: ', 'Use: ') + esc(b.usage));
    if (b.height) rows.push(`${L('高さ: ', 'Height: ')}<b>${esc(Number(b.height).toLocaleString('ja-JP'))} m</b>`);
    if (b.above != null || b.below != null) rows.push(L(`階数: 地上 ${esc(b.above ?? '?')} 階${b.below ? `・地下 ${esc(b.below)} 階` : ''}`, `Floors: ${esc(b.above ?? '?')} above ground${b.below ? `, ${esc(b.below)} below` : ''}`));
    if (b.year) rows.push(L('建築年: ', 'Year built: ') + esc(b.year));
    if (!rows.length) rows.push(L('（属性なし）', '(no attributes)'));
    return `<div class="bldg"><div class="muted small">${L('建物', 'Building')} ${tag('real')} <small>PLATEAU</small></div>${rows.join('<br>')}</div>`;
  }

  async function showPoint(lon, lat, bldg) {
    const box = $('point'), seq = ++pointSeq;
    box.hidden = false;
    const ns = lat >= 0 ? '北緯' : '南緯', ew = lon >= 0 ? '東経' : '西経';
    const ll = L(`${ns} ${Math.abs(lat).toFixed(5)}° ${ew} ${Math.abs(lon).toFixed(5)}°`, `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`);
    box.innerHTML = `<button class="x" aria-label="${L('閉じる', 'Close')}">×</button>${bldgHtml(bldg)}<div class="ll">${ll}</div><div id="pt-addr" class="muted">${L('住所をしらべています…', 'Looking up the address…')}</div><div id="pt-elev" class="muted">${L('標高をしらべています…', 'Looking up the elevation…')}</div>`;
    box.querySelector('.x').onclick = () => { box.hidden = true; };
    const lo = lon.toFixed(5), la = lat.toFixed(5);   // 約1m 単位に丸める（同じ場所はキャッシュが効く）
    const inJ = lon > GV.JAPAN.w && lon < GV.JAPAN.e && lat > GV.JAPAN.s && lat < GV.JAPAN.n;
    const elevP = inJ ? fetch(GV.API.elevation(lo, la)).then(x => x.json()).catch(() => null) : null;
    try {
      const r = await nominatim(GV.API.reverse(lo, la));
      if (seq !== pointSeq) return;
      $('pt-addr').innerHTML = r && r.address ? `${esc(placeTitle(r, false))} ${tag('real')}<br><small class="muted">${L('住所: ', 'Address: ')}${GV.CREDIT.osm}</small>` : L('住所なし（海の上など）', 'No address (at sea, etc.)');
      $('pt-addr').classList.remove('muted');
    } catch (e) { if (seq === pointSeq) $('pt-addr').textContent = L('住所: 取得できませんでした', 'Address: could not be fetched'); }
    if (!elevP) { $('pt-elev').textContent = L('標高: 日本のみ', 'Elevation: Japan only'); return; }
    const r = await elevP;
    if (seq !== pointSeq) return;
    if (!r) { $('pt-elev').textContent = L('標高: 取得できませんでした', 'Elevation: could not be fetched'); return; }
    const el = typeof r.elevation === 'number' ? r.elevation : null;
    $('pt-elev').innerHTML = el == null ? L('標高: データなし', 'Elevation: no data') : `${L('標高', 'Elevation')} <b>${el.toLocaleString('ja-JP')} m</b> <small>${L(`（${esc(r.hsrc)}、地理院の標高 API）`, `(${esc(String(r.hsrc).replace('（レーザ）', ' laser').replace('（写真測量）', ' photogrammetry').replace(/[（）]/g, ' '))}, GSI elevation API)`)}</small> ${tag('real')}`;
    $('pt-elev').classList.remove('muted');
  }
  GV.showPoint = showPoint;

  function setupClick() {
    const v = GV.viewer;
    const h = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    h.setInputAction(ev => {
      // 地震・人工衛星の点
      const top = v.scene.pick(ev.position);
      if (top && top.id && (top.id.quake || top.id.sat || top.id.bus || top.id.train || top.id.railway || top.id.agent)) { showThing(top.id); return; }
      // 建物に当たればその建物の情報も、そうでなければ地面の地点だけ
      const bldg = GV.pickBuilding(ev.position);
      let p = bldg && v.scene.pickPositionSupported ? v.scene.pickPosition(ev.position) : null;
      if (!p) {
        const ray = v.camera.getPickRay(ev.position);
        p = ray && v.scene.globe.pick(ray, v.scene);
      }
      if (!p) return;
      const c = Cesium.Cartographic.fromCartesian(p);
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      // PLATEAU でなければ OSM の建物か（建物の側面・屋根に当たったときは pickPosition の位置で調べる）
      let b = bldg;
      if (!b) {
        const picked = v.scene.pick(ev.position);
        if (picked && picked.id && picked.id.pipe) b = picked.id;   // 水道管などの線
        else if (picked && picked.id && picked.id.osmTile) {
          const q = v.scene.pickPositionSupported && v.scene.pickPosition(ev.position);
          const cq = q ? Cesium.Cartographic.fromCartesian(q) : c;
          b = GV.pickOsmBuilding(Cesium.Math.toDegrees(cq.longitude), Cesium.Math.toDegrees(cq.latitude));
        }
      }
      showPoint(lon, lat, b);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  // ---------- 時刻の表示 ----------
  let lastTimeText = '';
  function updateTime(force) {
    const t = GV.timeText();
    if (!force && t === lastTimeText) return;
    lastTimeText = t;
    const now = $('time-now'), off = $('time-off'), sl = $('opt-time');
    if (now) now.textContent = t;
    const h = GV.timeOffsetHours();
    if (off) off.textContent = Math.abs(h) < 0.05 && GV.state.timeSpeed === 1 ? L('いま', 'now') : (h >= 0 ? '+' : '') + h.toFixed(1) + L(' 時間', ' h');
    if (sl && document.activeElement !== sl) sl.value = Math.max(-24, Math.min(24, h));
  }

  // ---------- スケール表示 ----------
  function buildRuler() {
    // 位置は GV.rulerX（何もない区間は短く縮めてある）
    // スマホ幅は帯がせまいので短い名前（v013: 名前がなくて、どこを押せばよいか分からなかった）
    const SHORT = L(['', '', '素粒子', '原子核', '原子', 'つぶ', '', '街', '地球', '太陽系', '銀河', '宇宙'], ['', '', 'Quark', 'Nucl.', 'Atom', 'Grain', '', 'Town', 'Earth', 'Solar', 'Galaxy', 'Cosmos']);
    const bands = GV.BANDS.map((b, i) => {
      const x0 = GV.rulerX(b.from), x1 = GV.rulerX(b.to);
      const title = b.gap ? L('10^-19〜10^-33 m: 何もない（分かっていない）区間。目盛りでは短く縮めています', '10^-19 to 10^-33 m: an empty (unknown) stretch, shortened on the ruler') : b.label + (b.ready ? '' : L('（準備中）', ' (coming soon)'));
      return `<div class="band ${b.ready ? 'ready' : ''} ${b.gap ? 'gap' : ''}" style="left:${x0 * 100}%;width:${(x1 - x0) * 100}%" title="${title}"><span class="lf">${b.label}</span><span class="ls">${SHORT[i]}</span></div>`;
    }).join('');
    $('ruler-bar').innerHTML = bands + '<div id="ruler-mark"></div>';
    // 帯を押すと、その大きさへ（宇宙の帯なら宇宙へ、地球の帯なら地図へ）
    const bandEls = $('ruler-bar').querySelectorAll('.band');
    GV.BANDS.forEach((b, i) => {
      if (!b.ready) return;
      bandEls[i].addEventListener('click', () => GV.gotoL((b.from + b.to) / 2));
    });
  }
  GV.gotoL = async function (Lt) {
    if (Lt > 7.6) {
      if (GV.stage === 'micro') GV.exitMicro();
      if (GV.stage !== 'space') await GV.enterSpace();
      GV.spaceGoto(Lt);
      return;
    }
    if (Lt < 0.5) {                                  // ミクロの帯（人・細胞・分子・原子核・素粒子）
      if (GV.stage === 'space') { GV.exitSpace(); await new Promise(r => setTimeout(r, 800)); }
      await GV.enterMicro(Lt);
      return;
    }
    if (GV.stage === 'space') GV.exitSpace();
    if (GV.stage === 'micro') GV.exitMicro();
    const c = GV.viewer.camera.positionCartographic;
    GV.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.pow(10, Lt) * 0.87),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.5,
    });
  };
  let lastW = 0;
  function updateScale() {
    const w = GV.viewWidth();
    if (lastW > 0 && Math.abs(Math.log10(w / lastW)) < 0.0013) return;   // 比で判定（v009: 分母を 1e-9 以上にしていたので、1 nm より小さいと更新されなかった）
    lastW = w;
    const Lsc = Math.log10(w), r = GV.nearestRuler(w);
    $('scale-w').textContent = GV.fmtLen(w);
    $('scale-what').textContent = r[1];
    $('scale-pow').innerHTML = `10<sup>${Lsc.toFixed(1)}</sup> m`;
    $('ruler-mark').style.left = (GV.rulerX(Lsc) * 100) + '%';
  }

  // ---------- スマホの下パネル: つまみを押すと小さく⇔大きく、ドラッグで好きな高さ（いのちの系統樹と同じ。v013d） ----------
  // PC（641px〜）では何もしない（パネルは左上の欄）。小さいときは上の数行だけ見え、地図や地球を広く見られる
  const isPhone = () => window.matchMedia('(max-width: 640px)').matches;
  function makeSheet(panel, h0) {
    const grip = panel.querySelector('.grip');
    const maxH = () => Math.round(innerHeight - 64 - 94 - 120);   // 上のバー・下の目盛りの分と、上に地図を 120px は残す
    const h1 = () => Math.min(maxH(), Math.round(innerHeight * 0.62));
    let h = h0;
    const apply = () => {
      if (!isPhone()) { panel.style.height = ''; return; }
      h = Math.max(96, Math.min(maxH(), h));
      panel.style.height = h + 'px';
      grip.setAttribute('aria-expanded', String(h > (h0 + h1()) / 2));
    };
    const toggle = () => { h = h > (h0 + h1()) / 2 ? h0 : h1(); apply(); if (h === h0) panel.scrollTop = 0; };
    grip.setAttribute('aria-label', L('パネルを広げる・縮める（ドラッグで高さを変える）', 'Expand or shrink the panel (drag to change its height)'));
    grip.title = grip.getAttribute('aria-label');
    grip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    grip.addEventListener('pointerdown', e => {
      if (!isPhone()) return;
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (_) { }
      const sy = e.clientY, sh = h, bottom = panel.getBoundingClientRect().bottom;
      let moved = false;
      const move = ev => {
        if (!moved && Math.abs(ev.clientY - sy) < 4) return;
        moved = true; panel.classList.add('dragging');
        h = Math.round(bottom - ev.clientY + 14);
        apply();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        panel.classList.remove('dragging');
        if (!moved) toggle();
        else if (sh !== h && h <= h0) panel.scrollTop = 0;
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    apply();
    window.addEventListener('resize', apply);
  }

  // ---------- パネルの開け閉め・このアプリについて ----------
  function setupPanels() {
    $('btn-layers').onclick = () => document.body.classList.toggle('layers-open');
    $('btn-home').onclick = () => { if (GV.stage === 'tear') GV.exitTear(); if (GV.stage === 'space') GV.exitSpace(); if (GV.stage === 'micro') GV.exitMicro(); GV.home(); };   // 宇宙・ミクロにいるときは地図に戻ってから
    $('btn-about').onclick = () => { $('about').hidden = false; };
    $('about-close').onclick = () => { $('about').hidden = true; };
    $('about').addEventListener('click', e => { if (e.target === $('about')) $('about').hidden = true; });   // 外側を押しても閉じる
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('about').hidden = true; $('point').hidden = true; } });
    // スマホ幅でなければ開いておく（非表示のペインでは読み込み時の幅が 0 になることがある）
    if (!(window.innerWidth > 0 && window.innerWidth < 800)) document.body.classList.add('layers-open');
    makeSheet($('layers'), 190);       // 見どころへ飛ぶ・背景が見える高さ
    makeSheet($('tear-panel'), 150);   // ちぎる大きさ・はなすと が見える高さ
    // 出典の欄: ふだんは1行、押すと全部（もう一度押すと1行に）。閉じているときのリンクは開くだけにする
    document.addEventListener('click', e => {
      const c = e.target.closest('.cesium-widget-credits, #space-credit, #tear-credit');
      if (!c) return;
      if (!document.body.classList.contains('credits-open')) { e.preventDefault(); document.body.classList.add('credits-open'); }
      else if (!e.target.closest('a')) document.body.classList.remove('credits-open');
    }, true);
    // はじめの案内と宇宙の案内は、数秒たつか、さわったら消す（v013: ずっと出ていて地図や宇宙をかくしていた）
    const fade = (el, ms) => {
      if (!el) return;
      el.classList.remove('gone');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.add('gone'), ms);
    };
    GV.onLoaded = () => {
      fade($('hint'), 9000);                         // 地球が出てから数える
      setTimeout(() => { new Image().src = 'data/earth-bluemarble-2048.jpg'; }, 3000);   // 宇宙の地球の写真を先読み（宇宙に出た瞬間に写真つきで出す）
    };
    let touched = 0;
    for (const ev of ['wheel', 'pointerdown']) $('globe').addEventListener(ev, () => { if (++touched > 3) $('hint').classList.add('gone'); }, { passive: true });
    GV.fadeHint = () => fade($('space-hint'), 7000);
  }

  GV.initUI = function () {
    buildLayers();
    setupSearch();
    setupClick();
    buildRuler();
    setupPanels();
    // 画面の幅は地表への pick で測るので重い → カメラが動いたときだけ、0.25 秒に 1 回まで（v005 で軽量化）
    let scaleT = 0, scaleQueued = false;
    const scaleSoon = () => {
      if (scaleQueued) return;
      const wait = Math.max(0, 250 - (performance.now() - scaleT));
      scaleQueued = true;
      setTimeout(() => { scaleQueued = false; scaleT = performance.now(); updateScale(); }, wait);
    };
    GV.viewer.camera.changed.addEventListener(scaleSoon);
    GV.viewer.camera.moveEnd.addEventListener(scaleSoon);
    GV.viewer.scene.globe.tileLoadProgressEvent.addEventListener(n => { if (n === 0) scaleSoon(); });
    GV.onBuildings = () => {
      const st = GV.bldgStatus, el = $('bldg-status');
      if (!el) return;
      if (GV.state.buildings === 'off') el.textContent = '';
      else if (st.active.length) el.textContent = L('表示中: ', 'Showing: ') + st.active.join(L('・', ', ')) + (st.loading ? L('（読み込み中…）', ' (loading…)') : '');
      else el.textContent = '';
      const o = GV.osmStatus, oel = $('osmb-status');
      if (!oel) return;
      if (!GV.state.osmBuildings) oel.textContent = '';
      else if (o.shown || o.loading) oel.textContent = L(`${o.shown} 区画・${o.buildings.toLocaleString('ja-JP')} 棟`, `${o.shown} tiles, ${o.buildings.toLocaleString('en-US')} buildings`) + (o.loading ? L('（読み込み中…）', ' (loading…)') : '');
      else oel.textContent = L('寄ると出ます（高さ 6km より下）', 'Appears when you zoom in (below 6 km)');
    };
    GV.onBuildings();
    GV.onUnderground = (checkBox) => {
      if (checkBox && $('opt-under')) { $('opt-under').checked = GV.state.underground; GV.syncLayerBoxes && GV.syncLayerBoxes(); }
      const el = $('under-status'), u = GV.underStatus;
      if (!el) return;
      if (!GV.state.underground) { el.textContent = ''; return; }
      const parts = [];
      if (u.items.length) parts.push(L('表示中: ', 'Showing: ') + u.items.join(L('・', ', ')));
      if (u.pipes === -1) parts.push(L('水道管などを読み込み中…', 'Loading water pipes and more…'));
      else if (u.pipes > 0) parts.push(L(`水道管・ガス管など ${u.pipes} 本（深さは推定 1.2m）`, `${u.pipes} water pipes, gas pipes, etc. (depth estimated at 1.2 m)`));
      el.textContent = parts.length ? parts.join(' ／ ') : L('PLATEAU の地下データは、東京（東京駅・新宿・渋谷・池袋・上野）・札幌の地下街と、長岡市の地下の管だけ', 'PLATEAU underground data covers only the underground malls of Tokyo (Tokyo Station, Shinjuku, Shibuya, Ikebukuro, Ueno) and Sapporo, and the pipes under Nagaoka City');
    };
    GV.onUnderground();
    GV.onLife = () => {
      const el = $('life-status'), ls = GV.lifeStatus, parts = [];
      if (!el) return;
      if (GV.state.quakes) parts.push(ls.quakes ? L(`地震 ${ls.quakes} 件（色は深さ: 赤 浅い → 青 深い、大きさは規模）`, `${ls.quakes} earthquakes (color is depth: red shallow → blue deep; size is magnitude)`) : L('地震を読み込み中…', 'Loading earthquakes…'));
      if (GV.state.sats) parts.push(ls.satLoading ? L('人工衛星を読み込み中…', 'Loading satellites…') : L(`人工衛星 ${ls.sats} 機（黄色が ISS、線は 1 周分の通り道）。引いて見るとよく分かります`, `${ls.sats} satellites (yellow is the ISS; lines show one orbit). Easier to see when zoomed out`));
      if (GV.state.nightLights) parts.push(L('夜の明かりは、昼と夜の境目より夜の側だけに出ます', 'Night lights appear only on the night side of the day–night line'));
      el.textContent = parts.join(' ／ ');
    };
    GV.onLife();
    GV.onTransit = () => {
      const el = $('transit-status'), T = GV.transitStatus;
      if (!el) return;
      if (!GV.state.transit) { el.textContent = ''; return; }
      el.textContent = T.loading && !T.buses ? L('読み込み中…', 'Loading…') :
        (T.buses || T.trains ? L(`バス ${T.buses} 台（緑）・電車 ${T.trains} 本（路線の色）。${T.time} 取得、30 秒ごとに更新`, `${T.buses} buses (green), ${T.trains} trains (line colors). Fetched ${T.time}, updated every 30 s`) : L('東京都のあたりに近づくと出ます', 'Appears when you get close to Tokyo'));
    };
    GV.onTransit();
    GV.onAgents = () => {
      const el = $('agents-status'), A = GV.agentStatus;
      if (!el) return;
      if (!GV.state.agents) { el.textContent = ''; return; }
      el.textContent = A.car + A.person + A.bird ? L(`車 ${A.car}・人 ${A.person}・鳥 ${A.bird}（時間帯で数が変わる）`, `Cars ${A.car}, people ${A.person}, birds ${A.bird} (numbers change with the time of day)`) : L('高さ 1.2km より近づくと出ます（地下を見るときは出ません）', 'Appears when closer than 1.2 km (not while viewing underground)');
    };
    GV.onAgents();
    GV.viewer.clock.onTick.addEventListener(() => updateTime(false));
    updateTime(true);
    GV.updateScale = () => { lastW = 0; updateScale(); };
    // 宇宙にいるあいだは、宇宙の描画のたびにスケール表示を更新（W が変わったときだけ書きかえる）
    GV.onSpace = (W, msg) => {
      if (msg) { $('space-hint').textContent = msg; $('space-hint').classList.remove('gone'); document.body.classList.add('in-space'); return; }
      if (W) updateScale();
    };
  };
})();
