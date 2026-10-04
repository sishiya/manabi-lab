// main.js — 起動。デバッグ用の窓口 window.__gv、例外は window.__gvErr に入る。
'use strict';

(function () {
  const GV = window.GV;
  window.__gvErr = [];
  GV.err = e => { window.__gvErr.push(String(e && (e.stack || e.message) || e)); };
  window.addEventListener('error', e => GV.err(e.error || e.message));
  window.addEventListener('unhandledrejection', e => GV.err(e.reason));

  try {
    GV.initEarth('globe');
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
