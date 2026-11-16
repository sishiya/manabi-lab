// 見た目の確かめ用（手元だけ）: 絵（#frame）を大きく撮る。Playwright はあそびラボのものを借りる（drop-evolution/tools/pwlib.mjs と同じ）
// 使い方: node tilt-shift/tools/shot.mjs <出力フォルダ> [名前=JSONの設定 ...]
//   例: node tilt-shift/tools/shot.mjs out a='{"mode":0}' b='{"mode":1,"pitch":20}'
import { chromium } from '../../../ゲーム/tools/playwright/node_modules/playwright/index.mjs';
import { serve } from '../../drop-evolution/tools/pwlib.mjs';
import path from 'node:path';
import fs from 'node:fs';

const [outDir = 'out', ...specs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const srv = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(srv.origin + '/tilt-shift/');
await page.waitForFunction(() => window.__tish && window.__tish.fit && window.__tish.ready, null, { timeout: 120000 });
for (const sp of specs.length ? specs : ['default={}']) {
  const i = sp.indexOf('='), name = sp.slice(0, i), st = JSON.parse(sp.slice(i + 1));
  const f = await page.evaluate(st => { window.__tish.set(Object.assign({ paused: true }, st)); return window.__tish.fit; }, st);
  await page.waitForTimeout(300);
  await page.locator('#frame').screenshot({ path: path.join(outDir, name + '.png') });
  console.log(name, f && f.s ? '1/' + Math.round(1 / f.s) : '-', f && f.corr != null ? f.corr.toFixed(2) : '-');
}
await browser.close(); srv.close();
