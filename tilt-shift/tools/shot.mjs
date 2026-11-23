// 見た目の確かめ用（手元だけ）: 絵（#frame）を大きく撮る。Playwright はあそびラボのものを借りる（drop-evolution/tools/pwlib.mjs と同じ）
// 使い方: node tilt-shift/tools/shot.mjs <出力フォルダ> [名前=JSONの設定 ...]
//   例: node tilt-shift/tools/shot.mjs out a='{"stage":"city","mode":0}' b='{"mode":1,"pitch":20}'
//   設定の "run": 秒 で、撮る前に場面の時間を進める。"--gpu" を引数に入れると GPU で描く（速い）
import { chromium } from '../../../ゲーム/tools/playwright/node_modules/playwright/index.mjs';
import { serve } from '../../drop-evolution/tools/pwlib.mjs';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2), gpu = args.includes('--gpu');
const [outDir = 'out', ...specs] = args.filter(a => a !== '--gpu');
fs.mkdirSync(outDir, { recursive: true });
const srv = await serve();
const browser = await chromium.launch(gpu ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(srv.origin + '/tilt-shift/');
await page.waitForFunction(() => window.__tish && window.__tish.ready, null, { timeout: 180000 });
for (const sp of specs.length ? specs : ['default={}']) {
  const i = sp.indexOf('='), name = sp.slice(0, i), st = JSON.parse(sp.slice(i + 1));
  const run = st.run || 0, wait = st.wait || 0; delete st.run; delete st.wait;
  await page.evaluate(st => window.__tish.set(Object.assign({ paused: true }, st)), st);
  if (st.stage) await page.waitForFunction(id => window.__tish.ready && window.__tish.stage && window.__tish.stage.def.id === id, st.stage, { timeout: 180000 });
  const f = await page.evaluate(([st, run]) => { window.__tish.set(st); if (run) window.__tish.simRun(run); return window.__tish.fit; }, [st, run]);
  if (wait) {   // 本物の町: タイルを読み終えて、しばらく増えなくなるまで待つ（最大 wait 秒）
    const t0 = Date.now(); let calm = 0;
    while (Date.now() - t0 < wait * 1000 && calm < 6) { await page.waitForTimeout(500); const n = await page.evaluate(() => { window.__tish.set({}); return window.__tish.stage.api.loading || 0; }); calm = n ? 0 : calm + 1; }
    console.log('  loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  }
  await page.waitForTimeout(400);
  await page.locator('#frame').screenshot({ path: path.join(outDir, name + '.png') });
  console.log(name, f && f.s ? '1/' + Math.round(1 / f.s) : '-', f && f.corr != null ? f.corr.toFixed(2) : '-', JSON.stringify(await page.evaluate(() => window.__tishErr)));
}
await browser.close(); srv.close();
