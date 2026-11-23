// 手元だけ: ページを開いて JS を評価する（デバッグ用）。使い方: node tilt-shift/tools/eval.mjs '{"stage":"rail"}' 'JSの式'
import { chromium } from '../../../ゲーム/tools/playwright/node_modules/playwright/index.mjs';
import { serve } from '../../drop-evolution/tools/pwlib.mjs';
const [st, expr] = process.argv.slice(2);
const srv = await serve();
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(srv.origin + '/tilt-shift/');
await page.waitForFunction(() => window.__tish && window.__tish.ready, null, { timeout: 180000 });
const s = JSON.parse(st || '{}');
await page.evaluate(s => window.__tish.set(Object.assign({ paused: true }, s)), s);
if (s.stage) await page.waitForFunction(id => window.__tish.ready && window.__tish.stage && window.__tish.stage.def.id === id, s.stage, { timeout: 180000 });
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await browser.close(); srv.close();
