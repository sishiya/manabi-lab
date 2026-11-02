// 画面を幅ごとに撮る（時間を先へ進めてから）: node drop-evolution/tools/view-check.mjs [秒=900] [シード=4]
import { serve, launch, safeContext, outDir } from './pwlib.mjs';
import path from 'node:path';
const secs = +(process.argv[2] || 1800), seed = +(process.argv[3] || 1);
const srv = await serve(), br = await launch(), dir = outDir('drop-evolution');
const errors = [];
for (const [w, h] of [[1280, 720], [1024, 768], [375, 740], [812, 375]]) {
  const ctx = await safeContext(br, srv.origin, { width: w, height: h });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  await pg.goto(`${srv.origin}/drop-evolution/?seed=${seed}&noworker&nogate`);
  await pg.waitForTimeout(800);
  await pg.evaluate(s => { const w = __drop.world; while (w.t < s) w.step(); }, secs);
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.join(dir, `${w}x${h}-a-all.png`) });
  const hscroll = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (hscroll) errors.push(`${w}x${h}: 横にはみ出し`);
  await pg.evaluate(() => { const w = __drop.world; const o = w.orgs.reduce((a, b) => (a.bp.n * 100 + a.r > b.bp.n * 100 + b.r ? a : b)); __drop.select(o); });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: path.join(dir, `${w}x${h}-b-sel.png`) });
  await pg.click('[data-mode="tree"]');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(dir, `${w}x${h}-c-tree.png`) });
  await pg.click('#menuBtn'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(dir, `${w}x${h}-e-menu.png`) });
  await pg.click('#mNew'); await pg.waitForTimeout(200);
  await pg.screenshot({ path: path.join(dir, `${w}x${h}-f-confirm.png`) });
  await pg.click('#mNewNo'); await pg.click('#mResume'); await pg.waitForTimeout(200);
  if (w === 1280) { await pg.click('[data-mode="traits"]'); await pg.waitForTimeout(400); await pg.screenshot({ path: path.join(dir, `${w}x${h}-d-traits.png`) }); }
  await ctx.close();
}
await br.close(); srv.close();
console.log(dir); console.log(errors.length ? errors.join('\n') : 'エラーなし');
