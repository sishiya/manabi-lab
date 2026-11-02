// shots.mjs・hero-lineup.mjs で共通の道具: 読むだけのサーバーと、外へ出ないまっさらなブラウザ（RULES 9章）
// あそびラボの tools/playwright/lib.mjs を写したもの（2026-11-02 まなびラボへ移したとき）。Playwright はあそびラボ側に入れたものを使う
import { chromium } from '../../../ゲーム/tools/playwright/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 外から読んでよいもの（フォントと three.js）。それ以外の外への通信と、外のページへの移動は止める
const LIBS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' };

// 127.0.0.1 だけ・GET だけ・フォルダの中だけ・「.」で始まるもの（.private-words.txt・.env・.git）は出さない
export async function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    let file = path.resolve(ROOT, rel);
    const bad = req.method !== 'GET' || !(file === ROOT || file.startsWith(ROOT + path.sep)) || rel.split('/').some(p => p.startsWith('.'));
    if (!bad && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (bad || !fs.existsSync(file)) { res.writeHead(bad ? 403 : 404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

// 毎回まっさらなブラウザ（保存したパスワード・自動入力・Cookie・拡張機能・履歴なし）。音は消す
export const launch = () => chromium.launch({ args: ['--mute-audio'] });

// 外へ出ない窓。blocked に止めた通信がたまる
export async function safeContext(browser, origin, { width, height, scale = 1 }) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: phone, hasTouch: phone, locale: 'ja-JP' });
  ctx.blocked = [];
  await ctx.route('**/*', route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === origin) return route.continue();
    if (req.method() === 'GET' && !req.isNavigationRequest() && LIBS.includes(u.hostname)) return route.continue();
    ctx.blocked.push(u.origin + u.pathname);
    return route.abort();
  });
  return ctx;
}

export function outDir(kind) {
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16);
  const dir = path.join(ROOT, '_dev', kind, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
