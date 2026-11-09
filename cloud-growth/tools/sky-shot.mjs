// 雲ができるまで（3次元の試作）— 画面なしの Chrome で計算を進めて絵を撮る（Browser ペインが隠れていると WebGPU が止まるため）
// node cloud-growth/tools/sky-shot.mjs <場面> <出力先> <秒:視点-太陽,視点-太陽> [<秒:...> ...] [--w=1280 --h=800 --q=nz=64 --ui]
// 例: node cloud-growth/tools/sky-shot.mjs cumulus out 3400:up-morn,far-eve
import { chromium } from '../../../ゲーム/tools/playwright/node_modules/playwright/index.mjs';
import { serve, safeContext } from '../../drop-evolution/tools/pwlib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const pos = process.argv.slice(2).filter(a => !a.startsWith('--')), opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [scene, out, ...plan] = pos, W = +opt.w || 1280, H = +opt.h || 800;
fs.mkdirSync(out, { recursive: true });
const srv = await serve();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--mute-audio'] });
const ctx = await safeContext(browser, srv.origin, { width: W, height: H });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const T0 = Date.now();
await page.goto(`${srv.origin}/cloud-growth/sky.html?s=${scene}${opt.q ? '&' + opt.q : ''}`);
await page.waitForFunction(() => window.__sky || document.getElementById('err').textContent, null, { timeout: 180000 });
console.log(`準備 ${(Date.now() - T0) / 1000} 秒`);
await page.evaluate(() => {
  const S = window.__sky, st = S.state;
  if (st.running) document.getElementById('play').click();
  window.__adv = async (T, ms) => {
    const t0 = performance.now(); let n = 0;
    await S.dev.queue.onSubmittedWorkDone();
    while (S.sim.t < T && performance.now() - t0 < ms) {
      S.sim.step(st.dt); await S.dev.queue.onSubmittedWorkDone();
      if (++n % 30 === 0) { const s = await S.sim.stats(); if (s) { st.stat = s; st.dt = Math.min(S.dtMax, Math.max(0.25, 0.5 / (s.um / S.sim.dx + s.vm / S.sim.dy + s.wm / S.sim.dz + 1e-3))); } }
    }
    const s = await S.sim.stats(); if (s) st.stat = s;
    return { t: S.sim.t, stat: st.stat };
  };
  window.__shot = async (c, s) => {
    const cam = S.CAMS[c]; st.cam = { ...cam, pos: [...cam.pos] };
    if (s === 'dawn') S.syncDawn(); else { st.sun = s; const u = S.SUNS[s]; S.rd.setSun(u.az + (S.sunRot || 0), u.el, u.wb); }
    await S.dev.queue.onSubmittedWorkDone();
    const e = S.dev.createCommandEncoder(); S.rd.updateVolume(e); S.rd.draw(e, st.cam, S.SUNS[st.sun].ex); S.dev.queue.submit([e.finish()]);
    return S.rd.canvas.toDataURL('image/png');   // WebGPU のカンバスは同じ処理の中でしか読めない
  };
});
for (const p of plan) {
  const [T, list] = p.split(':');
  let r; do { r = await page.evaluate(([T]) => window.__adv(T, 20000), [+T]); } while (r.t < +T);
  console.log(`t=${Math.round(r.t)} 雲の底 ${r.stat?.base} 上面 ${r.stat?.top} 割合 ${Math.round((r.stat?.cover ?? 0) * 100)}% 上昇 ${r.stat?.wm}　(${Math.round((Date.now() - T0) / 1000)} 秒)`);
  for (const v of (list || '').split(',').filter(Boolean)) {
    const [c, s] = v.split('-');
    const url = await page.evaluate(([c, s]) => window.__shot(c, s), [c, s]);
    const f = path.join(out, `${scene}-${Math.round(+T / 60)}m-${c}-${s}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(f);
  }
}
if (opt.ui) { await page.evaluate(() => { window.__sky.state.dirty = true; }); await page.waitForTimeout(800); await page.screenshot({ path: path.join(out, `${scene}-ui-${W}.png`) }); }
const ms = await page.evaluate(async () => { const S = window.__sky; await S.dev.queue.onSubmittedWorkDone(); const t0 = performance.now(); const e = S.dev.createCommandEncoder(); S.rd.updateVolume(e); S.rd.draw(e, S.state.cam, 0.5); S.dev.queue.submit([e.finish()]); await S.dev.queue.onSubmittedWorkDone(); return performance.now() - t0; });
console.log(`描画 1 回 ${Math.round(ms)} ms`);
const err = await page.evaluate(() => window.__skyErr || null);
console.log('エラー', JSON.stringify(errors), JSON.stringify(err));
await browser.close(); srv.close();
