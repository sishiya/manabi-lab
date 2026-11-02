// 保管庫のカードの絵: thumbs/drop-evolution.jpg と動くサムネイル thumbs/drop-evolution.mp4（640×360・4秒・音なし）
// 2倍の細かさで描いて縮める。動画は時計を止めて1コマずつ進めて撮り、ffmpeg でつなぐ（静止画は最初のコマ）。
// node drop-evolution/tools/thumb.mjs [秒=600] [シード=6] [寄り=2.2] [はやさ=2]
import { serve, launch, safeContext, ROOT } from './pwlib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const secs = +(process.argv[2] || 600), seed = +(process.argv[3] || 6), zoom = +(process.argv[4] || 2.2), speed = +(process.argv[5] || 2);
const FPS = 15, LEN = 4;
const srv = await serve(), br = await launch();
const ctx = await safeContext(br, srv.origin, { width: 640, height: 360, scale: 2 });
const pg = await ctx.newPage();
await pg.goto(`${srv.origin}/drop-evolution/?seed=${seed}&noworker&nogate`);
await pg.addStyleTag({ content: '#top,#env,#bottom,#card,#scale,#toast{display:none!important}' });
await pg.evaluate(([s, z]) => {
  __drop.setPlaying(false);
  const w = __drop.world; while (w.t < s) w.step();
  // いちばん生き物が集まっている所へ寄る
  let best = null, bn = -1;
  for (const o of w.orgs) { const n = w.orgs.filter(q => Math.hypot(q.x - o.x, q.y - o.y) < 120).length; if (n > bn) { bn = n; best = o; } }
  Object.assign(__drop.ren.cam, { x: best.x, y: best.y, z });
}, [secs, zoom]);
await pg.waitForTimeout(800);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-thumb-'));
for (let f = 0; f < FPS * LEN; f++) {
  await pg.evaluate(([f, n]) => {
    const w = __drop.world;
    for (let k = 0; k < n; k++) w.step();
    __drop.ren.draw(w, null, f / 15);
  }, [f, f === 0 ? 0 : Math.round(speed * 30 / FPS)]);
  await pg.screenshot({ path: path.join(tmp, `f${String(f).padStart(3, '0')}.png`), scale: 'css' });
}
await br.close(); srv.close();
const jpg = path.join(ROOT, 'assets', 'thumbs', 'drop-evolution.jpg'), mp4 = path.join(ROOT, 'assets', 'thumbs', 'drop-evolution.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(tmp, 'f000.png'), '-q:v', '4', jpg]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-an', '-movflags', '+faststart', mp4]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(jpg, mp4, `${Math.round(fs.statSync(mp4).size / 1024)}KB`);
