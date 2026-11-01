// 書きかえの前後で挙動が同じかを確かめる（読むだけ）。軽くするためのリファクタリングの確認用。
// ヘッドレスの Chrome でアプリを開き、乱数（Math.random）を種つきに、時計（performance.now・Date.now）と
// requestAnimationFrame をこちらで止めて1コマずつ進め、決まったコマごとに次の指紋（ハッシュ）をとる:
//   - すべての canvas の絵（toDataURL）、画面の文字（innerText）、--expr で渡した式の値（状態の配列など）
// 前（git stash などで元に戻した状態）と後で同じ指紋なら、少なくともこの道すじでは挙動が同じ。
// 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
//   node _dev/tools/same.mjs air-flow --frames 300 --every 50 --out before.json
//   node _dev/tools/same.mjs air-flow --frames 300 --every 50 --cmp before.json
//   --expr "<式>"  アプリの window で評価して指紋に足す（例: "Array.from(__af.age)"）
//   --setup "<式>" 開いたあと、進める前に一度だけ評価する（例: "__af.loadScene('hood')"）
//   --path <パス> index.html 以外を開く（例: galaxy.html）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const app = argv[0];
const FRAMES = +opt('--frames', 240), EVERY = +opt('--every', 60), MS = +opt('--ms', 1000 / 60);
const PORT = +opt('--port', 8765), DBG = +opt('--debug-port', 9342), WAIT = +opt('--wait', 2500);
const EXPR = opt('--expr', ''), SETUP = opt('--setup', ''), PAGE = opt('--path', ''), OUT = opt('--out'), CMP = opt('--cmp');
const GPU = argv.includes('--gpu');

// アプリより先に動かす: 乱数と時計を決まったものに
const hook = `(() => {
  let s = 123456789; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  let now = 1000; const D0 = 1767225600000;
  performance.now = () => now; Date.now = () => D0 + now;
  const q = []; let id = 0;
  window.requestAnimationFrame = cb => { q.push([++id, cb]); return id; };
  window.cancelAnimationFrame = i => { const k = q.findIndex(e => e[0] === i); if (k >= 0) q.splice(k, 1); };
  window.__sameStep = (n, ms) => { for (let f = 0; f < n; f++) { now += ms; const cur = q.splice(0); for (const [, cb] of cur) { try { cb(now); } catch (e) { (window.__sameErr = window.__sameErr || []).push(String(e && e.stack || e)); } } } };
})();`;

const chrome = [process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe', process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe']
  .find(p => p && fs.existsSync(p));
const proc = spawn(chrome, ['--headless=new', ...(GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--disable-accelerated-2d-canvas', '--disable-gpu-rasterization', '--deterministic-mode',
  '--hide-scrollbars', '--mute-audio', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${path.join(os.tmpdir(), 'manabi-same-' + DBG)}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 50 && !ok; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); ok = true; } catch { await sleep(200); } }

const fp = [];
try {
  const t = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const exc = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') exc.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
  for (const d of ['Runtime.enable', 'Page.enable']) await send(d);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: hook });
  await send('Page.navigate', { url: `http://localhost:${PORT}/${app}/${PAGE}` });
  await sleep(WAIT);
  if (SETUP) await ev(SETUP);
  const grab = `(async () => { const h = []; for (const c of document.querySelectorAll('canvas')) { try { h.push(c.width + 'x' + c.height + ':' + c.toDataURL()); } catch (e) { h.push('x'); } }
    let x = ''; ${EXPR ? `try { x = JSON.stringify(${EXPR}); } catch (e) { x = 'ERR ' + e; }` : ''}
    return JSON.stringify({ c: h, t: document.body.innerText, x, err: window.__sameErr || null }); })()`;
  const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
  for (let f = 0; f <= FRAMES; f += EVERY) {
    if (f) await ev(`window.__sameStep(${EVERY}, ${MS})`);
    const g = JSON.parse(await ev(grab));
    fp.push({ frame: f, canvas: g.c.map(sha), text: sha(g.t), expr: EXPR ? (argv.includes('--raw') ? g.x : sha(g.x)) : null, err: g.err ? g.err.slice(0, 2) : null });
  }
  if (exc.length) fp.push({ exceptions: exc.slice(0, 3) });
  ws.close();
} finally { proc.kill(); }

if (OUT) fs.writeFileSync(OUT, JSON.stringify(fp, null, 1));
if (CMP) {
  const a = JSON.parse(fs.readFileSync(CMP, 'utf8'));
  let diff = 0;
  for (let k = 0; k < Math.max(a.length, fp.length); k++) {
    const x = JSON.stringify(a[k]), y = JSON.stringify(fp[k]);
    if (x !== y) { diff++; console.log('ちがう: ' + x + '\n   →   ' + y); }
  }
  console.log(diff ? `前後でちがう: ${diff} か所` : `前後で同じ（${fp.length} 回の指紋）`);
  process.exitCode = diff ? 1 : 0;
} else console.log(JSON.stringify(fp, null, 1));
