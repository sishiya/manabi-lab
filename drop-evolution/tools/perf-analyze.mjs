// 確かめ用の計測ログ（?test の「ログを保存」で出る drop-perf-*.csv）を読んで、計算と描くのどちらが重いかをまとめる
// node drop-evolution/tools/perf-analyze.mjs <csv かフォルダ> ...
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DT = 1 / 30;
const files = process.argv.slice(2).flatMap(p => statSync(p).isDirectory() ? readdirSync(p).filter(f => /^drop-perf-.*\.csv$/.test(f)).map(f => path.join(p, f)) : [p]);
if (!files.length) { console.log('drop-perf-*.csv が見つかりません'); process.exit(1); }
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const fit = (xs, ys) => {   // ys = a + b·xs（最小二乗）
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0; return { a: my - b * mx, b };
};
for (const f of files) {
  const lines = readFileSync(f, 'utf8').trim().split(/\r?\n/), env = lines.find(l => l.startsWith('#')) || '';
  const head = lines.find(l => l.startsWith('real_s')).split(','), rows = lines.filter(l => /^\d/.test(l)).map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], +v])));
  const run = rows.filter(r => r.speed > 0);
  console.log(`\n== ${path.basename(f)}  ${env.slice(2)}`);
  if (!run.length) { console.log('  動かしていた間の記録がありません'); continue; }
  console.log(`  記録 ${rows.length} 点（動かしていた ${run.length}）・ ${Math.round(rows.at(-1).real_s / 60)} 分`);
  // 速さごと: 1こまの計算・描く・こま/秒、ねらいの速さに追いついたか
  for (const sp of [...new Set(run.map(r => r.speed))].sort((a, b) => a - b)) {
    const rs = run.filter(r => r.speed === sp), frame = med(rs.map(r => r.sim_ms + r.draw_ms));
    const lag = rs.filter(r => r.sim_rate < sp * 0.8).length;
    console.log(`  ×${sp}: 計算 ${med(rs.map(r => r.sim_ms)).toFixed(1)} ms ・ 描く ${med(rs.map(r => r.draw_ms)).toFixed(1)} ms ・ 合わせて ${frame.toFixed(1)} ms ・ ${med(rs.map(r => r.fps)).toFixed(0)} こま/秒 ・ 追いつかなかった ${lag}/${rs.length} 点 ・ 生き物 ${med(rs.map(r => r.orgs))}（見えている ${med(rs.map(r => r.visible))}）`);
  }
  // 生き物の数あたり: 1刻みの計算（ms）、見えている数あたりの描く時間
  const steps = run.map(r => r.sim_rate / Math.max(1, r.fps) / DT);   // 1こまに回した刻みの数
  const perStep = run.map((r, i) => r.sim_ms / Math.max(0.1, steps[i]));
  const s = fit(run.map(r => r.orgs / 1000), perStep), d = fit(run.map(r => r.visible / 1000), run.map(r => r.draw_ms));
  console.log(`  計算: 1刻み ${s.a.toFixed(2)} + ${s.b.toFixed(2)}×(生き物/千) ms ・ 描く: ${d.a.toFixed(1)} + ${d.b.toFixed(1)}×(見えている/千) ms`);
  // 部分ごとの内わけ（ログにあれば）: 計算は 1 刻みあたり、描くは 1 こまあたり
  const parts = pre => head.filter(h => h.startsWith(pre)).map(h => [h.slice(2), med(run.map(r => r[h]))]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const sp = parts('s_'), dp = parts('d_');
  if (sp.length) console.log(`  計算の内わけ（1刻み ms）: ${sp.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ・ ')}`);
  if (dp.length) console.log(`  描くの内わけ（1こま ms）: ${dp.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ・ ')}`);
  const simShare = med(run.map(r => r.sim_ms / Math.max(0.1, r.sim_ms + r.draw_ms)));
  console.log(`  重いのは: ${simShare > 0.6 ? '計算（Web Worker・計算の作りを先に）' : simShare < 0.4 ? '描く（WebGL にする価値がある）' : '計算と描くが同じくらい'}（計算の割合 ${(simShare * 100).toFixed(0)}%）`);
}
