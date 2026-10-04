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
    h += '<h3>表示</h3>';
    h += `<label class="row"><input type="checkbox" id="opt-wire" ${s.wireframe ? 'checked' : ''}> ワイヤフレーム</label>`;
    h += `<label class="row"><input type="checkbox" id="opt-light" ${s.lighting ? 'checked' : ''}> 昼と夜（いまの太陽の位置） ${tag('est')}</label>`;
    h += `<label class="row"><input type="checkbox" id="opt-atmo" ${s.atmosphere ? 'checked' : ''}> 大気</label>`;
    h += '<p class="soon">準備中: 建物の立体・電車とバス・人や動物・地下の管・宇宙・ミクロ</p>';
    $('layers-body').innerHTML = h;

    $('layers-body').addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'base') { s.base = t.value; GV.applyBase(); }
      else if (t.dataset.ov) { s.overlays[t.dataset.ov] = t.checked; GV.applyOverlays(); }
      else if (t.id === 'opt-terrain') { s.terrain = t.checked; GV.applyTerrain(); }
      else if (t.id === 'opt-wire') { s.wireframe = t.checked; GV.applyView(); }
      else if (t.id === 'opt-light') { s.lighting = t.checked; GV.applyView(); }
      else if (t.id === 'opt-atmo') { s.atmosphere = t.checked; GV.applyView(); }
    });
    $('opt-exag').addEventListener('input', e => {
      s.exaggeration = +e.target.value;
      $('exag-val').textContent = '×' + s.exaggeration;
      GV.applyTerrain();
    });
  }

  // ---------- 地名検索（地理院の地名検索 API） ----------
  function setupSearch() {
    const form = $('search'), input = $('search-q'), list = $('search-list');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      list.innerHTML = '<li class="muted">さがしています…</li>';
      list.hidden = false;
      // 施設名・世界の地名は OpenStreetMap、日本の住所は地理院。両方の結果を並べる
      const get = url => fetch(url).then(r => r.json()).catch(() => []);
      const [osm, gsi] = await Promise.all([get(GV.API.nominatim(q)), get(GV.API.search(q))]);
      const arr = [];
      for (const r of osm || []) arr.push({ title: r.display_name, lon: +r.lon, lat: +r.lat, src: 'OSM' });
      // 地理院は1文字だけ合う住所（「東京タワー」→「…東」）も返すので、OSM に結果があるときは文字列を含むものだけ
      const gsiHit = (gsi || []).filter(r => !(osm && osm.length) || r.properties.title.includes(q));
      for (const r of gsiHit.slice(0, 8)) arr.push({ title: r.properties.title, lon: r.geometry.coordinates[0], lat: r.geometry.coordinates[1], src: '住所' });
      if (!arr.length) { list.innerHTML = '<li class="muted">見つかりませんでした</li>'; return; }
      list.innerHTML = arr.map((r, i) => `<li data-i="${i}">${esc(r.title)} <small class="muted">${r.src}</small></li>`).join('');
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

  // ---------- クリックした地点 ----------
  let muni = null;
  async function loadMuni() {
    if (muni) return muni;
    muni = {};
    try {
      const txt = await (await fetch(GV.API.muni)).text();
      // GSI.MUNI_ARRAY["13103"] = '13,東京都,13103,港区';
      for (const m of txt.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g)) {
        const p = m[2].split(',');
        muni[m[1]] = (p[1] || '') + (p[3] || '').replace(/　/g, '');
      }
    } catch (e) { /* 住所なしで続ける */ }
    return muni;
  }

  async function showPoint(lon, lat) {
    const box = $('point');
    box.hidden = false;
    const ll = `北緯 ${lat.toFixed(5)}° 東経 ${lon.toFixed(5)}°`;
    box.innerHTML = `<button class="x" aria-label="閉じる">×</button><div class="ll">${ll}</div><div id="pt-addr" class="muted">住所をしらべています…</div><div id="pt-elev" class="muted">標高をしらべています…</div>`;
    box.querySelector('.x').onclick = () => { box.hidden = true; };
    const inJ = lon > GV.JAPAN.w && lon < GV.JAPAN.e && lat > GV.JAPAN.s && lat < GV.JAPAN.n;
    if (!inJ) {
      $('pt-addr').textContent = '日本の外（住所・標高は日本のみ）';
      $('pt-elev').textContent = '';
      return;
    }
    const lo = lon.toFixed(6), la = lat.toFixed(6);
    try {
      const [r, m] = await Promise.all([fetch(GV.API.reverse(lo, la)).then(x => x.json()), loadMuni()]);
      const res = r && r.results;
      $('pt-addr').innerHTML = res ? `${esc((m[String(+res.muniCd)] || '') + res.lv01Nm)} ${tag('real')}` : '住所なし（海や山の中など）';
      $('pt-addr').classList.remove('muted');
    } catch (e) { $('pt-addr').textContent = '住所: 取得できませんでした'; }
    try {
      const r = await (await fetch(GV.API.elevation(lo, la))).json();
      const el = typeof r.elevation === 'number' ? r.elevation : null;
      $('pt-elev').innerHTML = el == null ? '標高: データなし' : `標高 <b>${el.toLocaleString('ja-JP')} m</b> <small>（${esc(r.hsrc)}）</small> ${tag('real')}`;
      $('pt-elev').classList.remove('muted');
    } catch (e) { $('pt-elev').textContent = '標高: 取得できませんでした'; }
  }
  GV.showPoint = showPoint;

  function setupClick() {
    const v = GV.viewer;
    const h = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    h.setInputAction(ev => {
      const ray = v.camera.getPickRay(ev.position);
      const p = ray && v.scene.globe.pick(ray, v.scene);
      if (!p) return;
      const c = Cesium.Cartographic.fromCartesian(p);
      showPoint(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude));
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
    GV.updateScale = () => { lastW = 0; updateScale(); };
  };
})();
