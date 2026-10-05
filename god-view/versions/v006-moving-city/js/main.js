// main.js — 起動。デバッグ用の窓口 window.__gv、例外は window.__gvErr に入る。
'use strict';

(function () {
  const GV = window.GV;
  window.__gvErr = [];
  GV.err = e => { window.__gvErr.push(String(e && (e.stack || e.message) || e)); };
  window.addEventListener('error', e => GV.err(e.error || e.message));
  window.addEventListener('unhandledrejection', e => GV.err(e.reason));

  // file:// では Cesium の Worker が読めず地球が出ない → 案内を出して止める
  if (location.protocol === 'file:') {
    const f = document.getElementById('fatal');
    f.innerHTML = 'このアプリはファイルを直接開くと動きません。<br>god-view フォルダの <b>start.bat</b> をダブルクリックしてください<br>（http://localhost:8765/god-view/ で開きます）。';
    f.hidden = false;
    return;
  }

  try {
    GV.initEarth('globe');
    GV.initBuildings();
    GV.initOsmBuildings();
    GV.initUnderground();
    GV.initLife();
    GV.initTransit();
    GV.initAgents();
    GV.initUI();
    GV.home(0);
  } catch (e) {
    GV.err(e);
    document.getElementById('fatal').hidden = false;
  }

  window.__gv = {
    GV,
    get viewer() { return GV.viewer; },
    width: () => GV.viewWidth(),
    state: () => JSON.parse(JSON.stringify(GV.state)),
    terrain: () => GV.terrainStats,
    goto: (lon, lat, h) => GV.flyToLonLat(lon, lat, h || 1500),
    home: () => GV.home(0),
    // ペインが非表示で requestAnimationFrame が止まっているときの検証用: n 回描画を進める
    run: async (n = 40, dt = 150) => {
      for (let i = 0; i < n; i++) {
        GV.viewer.resize(); GV.viewer.scene.requestRender(); GV.viewer.render();
        await new Promise(r => setTimeout(r, dt));
      }
      return { w: GV.viewWidth(), t: GV.terrainStats, err: window.__gvErr.length };
    },
  };
})();
