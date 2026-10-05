// ui.js — 層のパネル、地名検索、クリックした地点の情報、スケール表示、このアプリについて。
'use strict';

(function () {
  const GV = window.GV;
  const $ = id => document.getElementById(id);
  const tag = t => `<span class="tag tag-${t}">${GV.TAGS[t]}</span>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 層のパネル ----------
  function buildLayers() {
    const s = GV.state;
    let h = '<h3>背景</h3>';
    for (const k in GV.BASES) {
      const b = GV.BASES[k];
      h += `<label class="row"><input type="radio" name="base" value="${k}" ${s.base === k ? 'checked' : ''}> ${b.label} ${tag(b.tag)}</label>`;
    }
    h += '<h3>重ねる</h3>';
    for (const k in GV.OVERLAYS) {
      const o = GV.OVERLAYS[k];
      h += `<label class="row"><input type="checkbox" data-ov="${k}" ${s.overlays[k] ? 'checked' : ''}> ${o.label} ${tag(o.tag)} <small>日本のみ</small></label>`;
    }
    h += '<h3>地形</h3>';
    h += `<label class="row"><input type="checkbox" id="opt-terrain" ${s.terrain ? 'checked' : ''}> 立体の地形 ${tag('real')}</label>`;
    h += `<label class="row slider">高さの強調 <input type="range" id="opt-exag" min="1" max="10" step="0.5" value="${s.exaggeration}"> <b id="exag-val">×${s.exaggeration}</b></label>`;
    h += '<h3>建物 ' + tag('real') + ' <small>日本の都市（PLATEAU）</small></h3>';
    for (const [k, label] of [['off', 'なし'], ['lod1', '箱の形（LOD1）'], ['lod2', '屋根の形まで（LOD2）']]) {
      h += `<label class="row"><input type="radio" name="bldg" value="${k}" ${s.buildings === k ? 'checked' : ''}> ${label}</label>`;
    }
    h += `<label class="row"><input type="checkbox" id="opt-btex" ${s.bldgTexture ? 'checked' : ''}> 壁と屋根の写真（LOD2）</label>`;
    h += '<div id="bldg-status" class="status"></div>';
    h += `<label class="row"><input type="checkbox" id="opt-osmb" ${s.osmBuildings ? 'checked' : ''}> PLATEAU のない所は OSM の建物 ${tag('real')}<small>高さは推定を含む</small></label>`;
    h += '<div id="osmb-status" class="status"></div>';
    h += '<h3>地下</h3>';
    h += `<label class="row"><input type="checkbox" id="opt-under" ${s.underground ? 'checked' : ''}> 地下を見る（地面を半透明に）</label>`;
    h += `<label class="row slider">地面の濃さ <input type="range" id="opt-galpha" min="0.05" max="0.9" step="0.05" value="${s.groundAlpha}"></label>`;
    h += '<div class="spots">' + Object.entries(GV.UNDER_SPOTS).map(([k, p]) => `<button type="button" data-spot="${k}">${p.label}へ</button>`).join('') + '</div>';
    h += '<div id="under-status" class="status"></div>';
    h += '<h3>表示</h3>';
    h += `<label class="row"><input type="checkbox" id="opt-wire" ${s.wireframe ? 'checked' : ''}> ワイヤフレーム（地形と PLATEAU の建物）</label>`;
    h += `<label class="row"><input type="checkbox" id="opt-light" ${s.lighting ? 'checked' : ''}> 昼と夜（いまの太陽の位置） ${tag('est')}</label>`;
    h += `<label class="row"><input type="checkbox" id="opt-atmo" ${s.atmosphere ? 'checked' : ''}> 大気</label>`;
    h += '<p class="soon">準備中: 電車とバス・人や動物・宇宙・ミクロ</p>';
    $('layers-body').innerHTML = h;

    $('layers-body').addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'base') { s.base = t.value; GV.applyBase(); }
      else if (t.name === 'bldg') { s.buildings = t.value; GV.applyBuildings(); GV.applyOsmBuildings(); }
      else if (t.id === 'opt-btex') { s.bldgTexture = t.checked; GV.applyBuildings(); }
      else if (t.id === 'opt-osmb') { s.osmBuildings = t.checked; GV.applyOsmBuildings(); }
      else if (t.id === 'opt-under') { s.underground = t.checked; GV.applyUnderground(); }
      else if (t.dataset.ov) { s.overlays[t.dataset.ov] = t.checked; GV.applyOverlays(); }
      else if (t.id === 'opt-terrain') { s.terrain = t.checked; GV.applyTerrain(); }
      else if (t.id === 'opt-wire') { s.wireframe = t.checked; GV.applyView(); GV.applyBuildings(); }
      else if (t.id === 'opt-light') { s.lighting = t.checked; GV.applyView(); }
      else if (t.id === 'opt-atmo') { s.atmosphere = t.checked; GV.applyView(); }
    });
    $('opt-galpha').addEventListener('input', e => { s.groundAlpha = +e.target.value; GV.applyUnderground(); });
    $('layers-body').addEventListener('click', e => {
      const b = e.target.closest('button[data-spot]');
      if (b) GV.gotoUnder(b.dataset.spot);
    });
    $('opt-exag').addEventListener('input', e => {
      s.exaggeration = +e.target.value;
      $('exag-val').textContent = '×' + s.exaggeration;
      GV.applyTerrain();
    });
  }

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
    if (a.country_code === 'jp') {
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
      list.innerHTML = '<li class="muted">さがしています…</li>';
      list.hidden = false;
      let res;
      try { res = await nominatim(GV.API.search(q)); }
      catch (err) { list.innerHTML = '<li class="muted">検索できませんでした（通信）</li>'; return; }
      const arr = (res || []).map(r => ({ title: placeTitle(r), lon: +r.lon, lat: +r.lat }));
      if (!arr.length) { list.innerHTML = '<li class="muted">見つかりませんでした</li>'; return; }
      list.innerHTML = arr.map((r, i) => `<li data-i="${i}">${esc(r.title)}</li>`).join('') +
        `<li class="muted src">検索: ${GV.CREDIT.osm}（Nominatim）</li>`;
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
  // PLATEAU の建物の情報（なければ空）
  function bldgHtml(b) {
    if (!b) return '';
    if (b.pipe) {
      return `<div class="bldg"><div class="muted small">地下 ${tag('real')} <small>PLATEAU（長岡市）</small></div><b>${esc(b.name)}</b><br>深さ: 約 1.2 m ${tag('est')} <small class="muted">（データは平面の線だけ。道路の下の水道管の標準的な深さで描いています）</small></div>`;
    }
    if (b.under) {
      const kinds = { mall: '地下街', sewer: '下水道', manhole: 'マンホール' };
      return `<div class="bldg"><div class="muted small">地下 ${tag('real')} <small>PLATEAU・${esc(kinds[b.under.kind] || '')}</small></div><b>${esc(b.name || b.under.name)}</b>${b.setYear ? `<br>設置の年: ${esc(b.setYear)}` : ''}</div>`;
    }
    if (b.osm) {
      return `<div class="bldg"><div class="muted small">建物 ${tag('real')} <small>OpenStreetMap</small></div>高さ: 約 <b>${Math.round(b.height)} m</b> <small class="muted">（OSM の高さ・階数タグから。タグがなければ推定）</small></div>`;
    }
    const rows = [];
    if (b.name) rows.push(`<b>${esc(b.name)}</b>`);
    if (b.usage) rows.push('用途: ' + esc(b.usage));
    if (b.height) rows.push(`高さ: <b>${esc(Number(b.height).toLocaleString('ja-JP'))} m</b>`);
    if (b.above != null || b.below != null) rows.push(`階数: 地上 ${esc(b.above ?? '?')} 階${b.below ? `・地下 ${esc(b.below)} 階` : ''}`);
    if (b.year) rows.push('建築年: ' + esc(b.year));
    if (!rows.length) rows.push('（属性なし）');
    return `<div class="bldg"><div class="muted small">建物 ${tag('real')} <small>PLATEAU</small></div>${rows.join('<br>')}</div>`;
  }

  async function showPoint(lon, lat, bldg) {
    const box = $('point'), seq = ++pointSeq;
    box.hidden = false;
    const ns = lat >= 0 ? '北緯' : '南緯', ew = lon >= 0 ? '東経' : '西経';
    const ll = `${ns} ${Math.abs(lat).toFixed(5)}° ${ew} ${Math.abs(lon).toFixed(5)}°`;
    box.innerHTML = `<button class="x" aria-label="閉じる">×</button>${bldgHtml(bldg)}<div class="ll">${ll}</div><div id="pt-addr" class="muted">住所をしらべています…</div><div id="pt-elev" class="muted">標高をしらべています…</div>`;
    box.querySelector('.x').onclick = () => { box.hidden = true; };
    const lo = lon.toFixed(5), la = lat.toFixed(5);   // 約1m 単位に丸める（同じ場所はキャッシュが効く）
    const inJ = lon > GV.JAPAN.w && lon < GV.JAPAN.e && lat > GV.JAPAN.s && lat < GV.JAPAN.n;
    const elevP = inJ ? fetch(GV.API.elevation(lo, la)).then(x => x.json()).catch(() => null) : null;
    try {
      const r = await nominatim(GV.API.reverse(lo, la));
      if (seq !== pointSeq) return;
      $('pt-addr').innerHTML = r && r.address ? `${esc(placeTitle(r, false))} ${tag('real')}<br><small class="muted">住所: ${GV.CREDIT.osm}</small>` : '住所なし（海の上など）';
      $('pt-addr').classList.remove('muted');
    } catch (e) { if (seq === pointSeq) $('pt-addr').textContent = '住所: 取得できませんでした'; }
    if (!elevP) { $('pt-elev').textContent = '標高: 日本のみ'; return; }
    const r = await elevP;
    if (seq !== pointSeq) return;
    if (!r) { $('pt-elev').textContent = '標高: 取得できませんでした'; return; }
    const el = typeof r.elevation === 'number' ? r.elevation : null;
    $('pt-elev').innerHTML = el == null ? '標高: データなし' : `標高 <b>${el.toLocaleString('ja-JP')} m</b> <small>（${esc(r.hsrc)}、地理院の標高 API）</small> ${tag('real')}`;
    $('pt-elev').classList.remove('muted');
  }
  GV.showPoint = showPoint;

  function setupClick() {
    const v = GV.viewer;
    const h = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    h.setInputAction(ev => {
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

  // ---------- スケール表示 ----------
  function buildRuler() {
    const span = GV.L_MAX - GV.L_MIN;
    const bands = GV.BANDS.map(b =>
      `<div class="band ${b.ready ? 'ready' : ''}" style="left:${(b.from - GV.L_MIN) / span * 100}%;width:${(b.to - b.from) / span * 100}%" title="${b.label}${b.ready ? '' : '（準備中）'}"><span>${b.label}</span></div>`
    ).join('');
    $('ruler-bar').innerHTML = bands + '<div id="ruler-mark"></div>';
  }
  let lastW = 0;
  function updateScale() {
    const w = GV.viewWidth();
    if (Math.abs(w - lastW) / Math.max(w, 1e-9) < 0.003) return;
    lastW = w;
    const L = Math.log10(w), r = GV.nearestRuler(w);
    $('scale-w').textContent = GV.fmtLen(w);
    $('scale-what').textContent = r[1];
    $('scale-pow').innerHTML = `10<sup>${L.toFixed(1)}</sup> m`;
    $('ruler-mark').style.left = ((L - GV.L_MIN) / (GV.L_MAX - GV.L_MIN) * 100) + '%';
  }

  // ---------- パネルの開け閉め・このアプリについて ----------
  function setupPanels() {
    $('btn-layers').onclick = () => document.body.classList.toggle('layers-open');
    $('btn-home').onclick = () => GV.home();
    $('btn-about').onclick = () => { $('about').hidden = false; };
    $('about-close').onclick = () => { $('about').hidden = true; };
    // スマホ幅でなければ開いておく（非表示のペインでは読み込み時の幅が 0 になることがある）
    if (!(window.innerWidth > 0 && window.innerWidth < 800)) document.body.classList.add('layers-open');
  }

  GV.initUI = function () {
    buildLayers();
    setupSearch();
    setupClick();
    buildRuler();
    setupPanels();
    GV.viewer.scene.postRender.addEventListener(updateScale);
    GV.onBuildings = () => {
      const st = GV.bldgStatus, el = $('bldg-status');
      if (!el) return;
      if (GV.state.buildings === 'off') el.textContent = '';
      else if (st.active.length) el.textContent = '表示中: ' + st.active.join('・') + (st.loading ? '（読み込み中…）' : '');
      else el.textContent = '高さ 25km より近づくと、PLATEAU のある都市で出ます';
      const o = GV.osmStatus, oel = $('osmb-status');
      if (!oel) return;
      if (!GV.state.osmBuildings) oel.textContent = '';
      else if (o.shown || o.loading) oel.textContent = `${o.shown} 区画・${o.buildings.toLocaleString('ja-JP')} 棟` + (o.loading ? '（読み込み中…）' : '');
      else oel.textContent = '高さ 6km より近づくと出ます';
    };
    GV.onBuildings();
    GV.onUnderground = (checkBox) => {
      if (checkBox && $('opt-under')) $('opt-under').checked = GV.state.underground;
      const el = $('under-status'), u = GV.underStatus;
      if (!el) return;
      if (!GV.state.underground) { el.textContent = ''; return; }
      const parts = [];
      if (u.items.length) parts.push('表示中: ' + u.items.join('・'));
      if (u.pipes === -1) parts.push('水道管などを読み込み中…');
      else if (u.pipes > 0) parts.push(`水道管・ガス管など ${u.pipes} 本（深さは推定 1.2m）`);
      el.textContent = parts.length ? parts.join(' ／ ') : 'PLATEAU の地下データは、東京（東京駅・新宿・渋谷・池袋・上野）・札幌の地下街と、長岡市の地下の管だけ';
    };
    GV.onUnderground();
    GV.updateScale = () => { lastW = 0; updateScale(); };
  };
})();
