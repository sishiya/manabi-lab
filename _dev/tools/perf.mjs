// 処理の重さを測る（読むだけ）。ヘッドレスの Chrome（GPU つき）で _dev/tools/thumb.html?app=<app> を開き、
// サムネイルと同じ準備（thumb.html の SETUP）のあと数秒そのまま動かして、次を測る:
//   - メインスレッドの忙しさ（Performance.getMetrics の TaskDuration・ScriptDuration・Layout・RecalcStyle。秒あたり）
//   - requestAnimationFrame の1コマの JS の時間（平均・95%・最大）とコマ数（アプリの window の rAF を包んで測る）
//   - JS のヒープ、重い関数の上位（CPU プロファイルの自分の時間）
// Worker の中の計算は入らない（Worker を使うアプリは「worker」と書く）。GPU の重さ（シェーダー）も入らない。
// 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
//   node _dev/tools/perf.mjs                       # 全アプリ（数分）
//   node _dev/tools/perf.mjs black-hole,quantum    # 一部
//   node _dev/tools/perf.mjs quantum --sec 8 --top 15 --out before.json
// 結果は _dev/tools/out/perf-last.json と、表を画面に。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEC = +opt('--sec', 6), TOP = +opt('--top', 8), PORT = +opt('--port', 8765), DBG = +opt('--debug-port', 9341);
const OUT = opt('--out', path.join(root, '_dev/tools/out/perf-last.json'));
const GPU = !argv.includes('--soft');
const base = `http://localhost:${PORT}`;
let apps = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).flatMap(a => a.split(',')).filter(Boolean);
if (!apps.length) {
  apps = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !/^[_.]|^(assets|lib)$/.test(d.name))
    .map(d => d.name).filter(n => {
      const f = path.join(root, n, 'index.html');
      return fs.existsSync(f) && !/http-equiv="refresh"/.test(fs.readFileSync(f, 'utf8'));
    });
}

// アプリより先に動かす: rAF の1コマの JS の時間を測る（どのフレームでも）
const hook = `(() => { if (window.__perfHooked) return; window.__perfHooked = true;
  const P = window.__perf = { n: 0, sum: 0, max: 0, list: [] }; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { const t0 = performance.now(); try { cb(t); } finally {
    const d = performance.now() - t0; P.n++; P.sum += d; if (d > P.max) P.max = d; if (P.list.length < 5000) P.list.push(d); } });
  // DOM の書きかえを数える（同じ値を書いても、配置の計算がやりなおしになることが多い）。P.dom[場所] = [回数, 同じ値だった回数]
  P.dom = {}; const name = e => e.id ? '#' + e.id : e.nodeName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
  const wrap = (proto, prop) => { const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
    Object.defineProperty(proto, prop, Object.assign({}, d, { set(v) { if (P.domOn && this.nodeType === 1) { let same = false; try { same = String(d.get.call(this)) === String(v); } catch (e) {}
      const k = name(this) + ' ' + prop, c = P.dom[k] || (P.dom[k] = [0, 0]); c[0]++; if (same) c[1]++; } d.set.call(this, v); } })); };
  wrap(Node.prototype, 'textContent'); wrap(Element.prototype, 'innerHTML'); wrap(Element.prototype, 'className'); wrap(HTMLElement.prototype, 'hidden');
  wrap(HTMLInputElement.prototype, 'value');
})();`;

const chrome = [process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe', process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe']
  .find(p => p && fs.existsSync(p));
const prof = path.join(os.tmpdir(), 'manabi-perf-' + DBG);
const proc = spawn(chrome, ['--headless=new', ...(GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--hide-scrollbars', '--mute-audio', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); } catch { await sleep(200); } }
if (!ver) throw new Error('Chrome が起動しない');

async function openTab() {
  const t = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const events = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method) events.push(d); };
  const send = (method, params = {}, ms = 60000) => new Promise((r, j) => {
    const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (wait.has(i)) { wait.delete(i); j(new Error('timeout ' + method)); } }, ms);
  });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
  return { ws, send, ev, events, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${DBG}/json/close/${t.id}`).catch(() => {}); } };
}
const metrics = async tab => Object.fromEntries((await tab.send('Performance.getMetrics')).result.metrics.map(m => [m.name, m.value]));
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const usesWorker = app => {
  const dir = path.join(root, app); let hit = false;
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === 'versions' || f.name === 'node_modules') continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(js|html)$/.test(f.name) && /new\s+Worker\s*\(/.test(fs.readFileSync(p, 'utf8'))) hit = true;
  } };
  walk(dir); return hit;
};

const results = [];
try {
  for (const app of apps) {
    const tab = await openTab();
    const r = { app, worker: usesWorker(app) };
    try {
      for (const d of ['Runtime.enable', 'Page.enable', 'Performance.enable', 'Profiler.enable']) await tab.send(d);
      await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: hook });
      await tab.send('Profiler.setSamplingInterval', { interval: 250 });
      const t0 = Date.now();
      await tab.send('Page.navigate', { url: `${base}/_dev/tools/thumb.html?app=${app}&lang=ja` });
      while (Date.now() - t0 < 120000) { await sleep(500); if (await tab.ev('document.title').catch(() => '') === 'ready') break; }
      r.readySec = +((Date.now() - t0) / 1000).toFixed(1);
      await sleep(1500);
      await tab.ev(`(() => { const w = document.getElementById('f').contentWindow; for (const P of [window.__perf, w.__perf]) if (P) { P.n = 0; P.sum = 0; P.max = 0; P.list = []; P.dom = {}; P.domOn = true; } })()`);
      const m0 = await metrics(tab);
      await tab.send('Profiler.start');
      await sleep(SEC * 1000);
      const p = (await tab.send('Profiler.stop')).result.profile;
      const m1 = await metrics(tab);
      const f = await tab.ev(`JSON.stringify((document.getElementById('f').contentWindow || {}).__perf || null)`);
      const P = f ? JSON.parse(f) : null;
      const dt = m1.Timestamp - m0.Timestamp;
      const per = k => +(((m1[k] || 0) - (m0[k] || 0)) / dt * 1000).toFixed(0);   // 1 秒あたりのミリ秒
      Object.assign(r, { taskMs: per('TaskDuration'), scriptMs: per('ScriptDuration'), layoutMs: per('LayoutDuration'), styleMs: per('RecalcStyleDuration'),
        heapMB: +((m1.JSHeapUsedSize || 0) / 1048576).toFixed(1), nodes: m1.Nodes });
      if (P) Object.assign(r, { fps: +(P.n / dt).toFixed(1), rafAvg: +(P.sum / Math.max(1, P.n)).toFixed(2), rafP95: +pct(P.list, 0.95).toFixed(2), rafMax: +P.max.toFixed(1) });
      // 1 秒あたりの DOM の書きかえ（多い順）: [場所, 回数, そのうち同じ値]
      if (P && P.dom) r.dom = Object.entries(P.dom).map(([k, [n, same]]) => [k, +(n / dt).toFixed(1), +(same / dt).toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 8);
      // プロファイル: 関数ごとの自分の時間
      const byId = new Map(p.nodes.map(n => [n.id, n])); const self = new Map();
      const dts = p.timeDeltas; let total = 0;
      p.samples.forEach((s, i) => { const n = byId.get(s); const d = (dts[i + 1] ?? dts[i] ?? 0) / 1000; const cf = n.callFrame;
        if (['(idle)', '(program)', '(garbage collector)'].includes(cf.functionName) && !cf.url) { if (cf.functionName === '(garbage collector)') { self.set('(GC)', (self.get('(GC)') || 0) + d); total += d; } return; }
        const k = `${cf.functionName || '(無名)'} ${cf.url ? cf.url.replace(base + '/', '').replace(/\?.*$/, '') + ':' + (cf.lineNumber + 1) : ''}`;
        self.set(k, (self.get(k) || 0) + d); total += d; });
      r.top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => [k, +(v / dt).toFixed(1)]);   // 1 秒あたりのミリ秒
      const ex = tab.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
      if (ex.length) r.errors = ex.slice(0, 3).map(s => String(s).slice(0, 160));
    } catch (e) { r.fail = String(e.message || e); }
    await tab.close();
    results.push(r);
    console.log(`${app.padEnd(16)} task ${String(r.taskMs).padStart(4)}ms/s  js ${String(r.scriptMs).padStart(4)}  layout ${String(r.layoutMs).padStart(3)}  style ${String(r.styleMs).padStart(3)}  fps ${String(r.fps ?? '-').padStart(5)}  rAF avg ${String(r.rafAvg ?? '-').padStart(6)} p95 ${String(r.rafP95 ?? '-').padStart(6)} max ${String(r.rafMax ?? '-').padStart(6)}  heap ${r.heapMB}MB${r.worker ? '  worker' : ''}${r.fail ? '  失敗: ' + r.fail : ''}`);
  }
} finally {
  proc.kill();
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), sec: SEC, gpu: GPU, results }, null, 1));
console.log('\n結果: ' + OUT);
