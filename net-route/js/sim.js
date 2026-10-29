// インターネットの経路 — パケットの動き（出来事の列）と、DNS・TCP・TLS・HTTP の流れ
// 時刻 SIM.T はミリ秒。パケットは「中継で待つ（node）」「線の上を飛ぶ（fly）」をくり返す
'use strict';

const PAGE_BYTES = 60000, MSS = 1460;                   // ページの大きさ（例）・1つの包みに入る中身
const DATA_N = Math.ceil(PAGE_BYTES / MSS);
const SIZE = { ping: 84, pong: 84, dns: 80, dnsans: 120, syn: 60, synack: 60, hello: 600, shello: 1500, get: 400, data: 1500, dack: 60 };
const KIND = {
  ping: 'ping（とどくか聞くだけ）', pong: 'ping の返事',
  dns: '名前の問い合わせ（DNS）', dnsans: '名前の答え（住所）', syn: 'あいさつ SYN', synack: 'あいさつの返事 SYN-ACK',
  hello: 'ACK＋暗号のはじめ', shello: '暗号のかぎ・証明書', get: '暗号OK＋「ページをください」', data: 'ページの中身', dack: '受けとったよ（ACK）',
};
const PHASES = {
  idle: ['まだ何も送っていません', '右のボタンで、スマホが話しかけます。'],
  dns: ['① 名前から住所を調べる（DNS）', 'サイトの住所（IPアドレス）をプロバイダに聞く。'],
  tcp: ['② あいさつ（TCP の握手）', '「話していい？」と送って返事を待つ。1往復。'],
  tls: ['③ 暗号のかぎを決める（TLS）', 'のぞかれないよう、かぎを決める。もう1往復。'],
  get: ['④「ページをください」', 'ここまで、ページはまだ1バイトも来ていません。'],
  data: ['⑤ ページが包みに分かれて届く', '最初は10個。返事が来るたび増やす。'],
  done: ['⑥ ページがそろった', '下の内訳で、時間のかかった所を見よう。'],
  fail: ['× スマホがあきらめた', ''],                   // 2行めは SIM.failWhy
};
const SYN_RETRIES = 6;                 // Linux の tcp_syn_retries の初めの値（約127秒であきらめる）
const DNS_TIMEOUT = 5000, DNS_ATTEMPTS = 2;   // glibc の resolv.conf の初めの値（5秒・2回）

let seed = 1;
function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function expRnd(mean) { return -mean * Math.log(1 - rnd()); }

const SIM = {
  T: 0, msPerSec: 20, running: false, paused: false,
  server: 'dc', packets: [], ghosts: [], nextId: 1,
  phase: 'idle', marks: {}, lost: 0, resent: 0,
  wait: null,            // スマホが待っている返事 { what, deadline, resend }
  srv: null,             // サーバーの送り手の状態
  srtt: null,
  backoff: 1,            // 時間切れのたびに2倍（RFC 6298 の 5.5）
  pings: [], failWhy: null,
};

function resetSim() {
  seed = 1;
  Object.assign(SIM, { T: 0, packets: [], ghosts: [], nextId: 1, phase: 'idle', marks: {}, lost: 0, resent: 0, wait: null, srv: null, srtt: null, backoff: 1, recv: null, running: false, pings: [], pingSent: 0, failWhy: null });
  LINKS.forEach(l => l.busy = {});
}

// 送り直しまでの待ち時間。最初は1秒（RFC 6298）。往復を測ったら、ゆれ（RTTVAR）を往復の半分として「往復の3倍」、
// 下限は RFC の1秒ではなく Linux と同じ 0.2秒（簡単にした）。時間切れのたびに2倍、返事が来たら元に戻す
function rto() { return (SIM.srtt == null ? 1000 : Math.max(200, 3 * SIM.srtt)) * SIM.backoff; }
function sampleRtt(r) { SIM.srtt = SIM.srtt == null ? r : 0.875 * SIM.srtt + 0.125 * r; SIM.backoff = 1; }   // RFC 6298 の重み

function send(kind, src, dst, seq = 0, resend = false) {
  const p = { id: SIM.nextId++, kind, src, dst, seq, size: SIZE[kind], at: src, state: 'node', next: SIM.T, hops: 0, born: SIM.T, path: [src], resend };
  SIM.packets.push(p);
  if (resend) SIM.resent++;
  return p;
}
function fail(why) { SIM.wait = null; SIM.running = false; SIM.failWhy = why; setPhase('fail'); }
function sendPing() { const p = send('ping', 'phone', SIM.server); p.pingT = SIM.T; SIM.pingSent = (SIM.pingSent || 0) + 1; }
function lose(p, why) {
  p.state = 'lost'; SIM.lost++;
  SIM.ghosts.push({ p, why, x: null, y: null, age: 0, link: p.link, frac: null, at: p.at });
}

// 中継で待っていたパケットを、次の線へ送り出す
function forward(p) {
  if (p.at === p.dst) { p.state = 'done'; deliver(p); return; }
  const hop = nextHop(p.at, p.dst);
  if (!hop) { lose(p, '道がない'); return; }
  const l = linkBetween(p.at, hop), dir = p.at + '>' + hop;
  const idle = (l.busy[dir] || 0) <= p.next;
  let start = Math.max(p.next, l.busy[dir] || 0);
  // WiFi の順番待ち（推定）。送っている最中に続く包みは、まとめて送るので待たない（簡単にした）
  if (l.wifi && idle) start += expRnd(NET.wifiWait);
  const tx = p.size * 8 / (l.bw * 1e6);                              // 送り出す時間（ミリ秒）＝ビット数÷速さ
  l.busy[dir] = start + tx;
  Object.assign(p, { state: 'fly', link: l, from: p.at, to: hop, t0: start + tx, t1: start + tx + l.prop, next: start + tx + l.prop, waitFrom: p.next });
}
// 線の向こうに着いた
function arrive(p) {
  if (p.link.loss && rnd() < p.link.loss) { lose(p, '鳩が帰ってこなかった'); SIM.ghosts[SIM.ghosts.length - 1].frac = 0.9; Object.assign(SIM.ghosts[SIM.ghosts.length - 1], { from: p.from, to: p.to }); return; }
  p.at = p.to; p.hops++; p.path.push(p.at); p.link = null;
  let proc = NODE[p.at].kind === 'router' ? NET.hopProc : 0;
  if (NET.jam[p.at]) {
    if (rnd() < NET.jamLoss) { lose(p, '混んでいて捨てられた'); return; }
    proc += expRnd(NET.jamWait);
  }
  p.state = 'node'; p.next = p.t1 + proc; p.waitFrom = p.t1;
}

function setPhase(ph) { SIM.phase = ph; SIM.marks[ph] = SIM.T; }
function waitFor(what, ms, resend) { SIM.wait = { what, deadline: SIM.T + ms, resend, sentAt: SIM.T }; }

// 行き先に着いたパケットの処理（スマホ・名前引き・サーバー）
function deliver(p) {
  const S = SIM.server, c = SIM;
  if (p.kind === 'ping' && p.dst === S) { send('pong', S, 'phone').pingT = p.pingT; return; }
  if (p.kind === 'pong') { if (p.dst === 'phone') c.pings.push(c.T - p.pingT); return; }
  if (p.dst === 'isp' && p.kind === 'dns') { send('dnsans', 'isp', 'phone'); return; }
  if (p.dst === 'phone') {
    const w = c.wait;
    if (p.kind === 'dnsans' && w && w.what === 'dnsans') { c.wait = null; startTcp(); }
    else if (p.kind === 'synack' && w && w.what === 'synack') {
      if (!w.resent) sampleRtt(c.T - w.sentAt);                      // 往復の時間を測る（送り直したものは測らない）
      c.wait = null; setPhase('tls'); sendHello();
    } else if (p.kind === 'shello' && w && w.what === 'shello') {
      w.got.add(p.seq);
      if (w.got.size === 3) { c.wait = null; setPhase('get'); sendGet(); }
    } else if (p.kind === 'data') {
      if (w && w.what === 'data') { c.wait = null; setPhase('data'); c.recv = new Set(); }
      if (!c.recv) return;
      c.recv.add(p.seq); send('dack', 'phone', S, p.seq);
      if (c.recv.size === DATA_N && c.phase !== 'done') { setPhase('done'); c.running = false; }
    }
    return;
  }
  if (p.dst !== S) return;
  const v = c.srv || (c.srv = { started: false, cwnd: 10, ssthresh: Infinity, nextSeq: 0, unacked: new Map(), acked: new Set(), timer: 0, redo: [] });
  if (p.kind === 'syn') send('synack', S, 'phone');
  else if (p.kind === 'hello') for (let i = 0; i < 3; i++) send('shello', S, 'phone', i);
  else if (p.kind === 'get') { if (!v.started) { v.started = true; pump(); } }
  else if (p.kind === 'dack') {
    if (!v.unacked.has(p.seq)) return;
    const u = v.unacked.get(p.seq);
    if (!u.re) sampleRtt(c.T - u.t);
    v.unacked.delete(p.seq); v.acked.add(p.seq); v.timer = c.T; v.redo = v.redo.filter(q => q !== p.seq);        // 返事が来たら時計をかけ直す
    if (v.cwnd < v.ssthresh) v.cwnd += 1; else v.cwnd += 1 / v.cwnd;  // スロースタート → 少しずつ（RFC 5681）
    pump();
  }
}
// 送ってよい数（cwnd）まで、まだ送っていない包みを送る
// 時間切れのあとに送り直す番号（redo）を先に、どちらも送ってよい数の中で
function pump() {
  const v = SIM.srv;
  if (!v.unacked.size) v.timer = SIM.T;
  const flying = () => v.unacked.size - v.redo.length;
  while (flying() < Math.floor(v.cwnd) && (v.redo.length || v.nextSeq < DATA_N)) {
    if (v.redo.length) { const seq = v.redo.shift(); v.unacked.set(seq, { t: SIM.T, re: true }); send('data', SIM.server, 'phone', seq, true); }
    else { const seq = v.nextSeq++; send('data', SIM.server, 'phone', seq); v.unacked.set(seq, { t: SIM.T, re: false }); }
  }
}

function startTcp() {
  setPhase('tcp'); SIM.backoff = 1;                                   // 名前引きの待ちは持ちこさない
  let tries = 0;
  const go = (re) => {
    if (tries++ > SYN_RETRIES) { fail(`あいさつ（SYN）を${SYN_RETRIES}回送り直しても返事がないので、${Math.round((SIM.T - SIM.marks.tcp) / 1000)}秒であきらめた（Linux の初めの決まり）。`); return; }
    send('syn', 'phone', SIM.server, 0, re); waitFor('synack', rto(), () => { go(true); if (SIM.wait) SIM.wait.resent = true; });
  };
  go(false);
}
function sendHello(re = false) { send('hello', 'phone', SIM.server, 0, re); waitFor('shello', rto(), () => sendHello(true)); SIM.wait.got = new Set(); }
function sendGet(re = false) { send('get', 'phone', SIM.server, 0, re); waitFor('data', rto() + 5, () => sendGet(true)); }

function openPage() {
  resetSim(); SIM.running = true; setPhase('dns');
  let tries = 0;
  const go = (re) => {   // 5秒待って、もう1回。それでもだめならあきらめる（glibc の初めの値）
    if (tries++ >= DNS_ATTEMPTS) { fail(`名前の答えが${DNS_ATTEMPTS}回とも${DNS_TIMEOUT / 1000}秒で来ないので、あきらめた（名前引きの初めの決まり）。`); return; }
    send('dns', 'phone', 'isp', 0, re); waitFor('dnsans', DNS_TIMEOUT, () => go(true));
  };
  go(false);
}

// 線が切られたら、その上を飛んでいたものはなくなる
function onCut(l) {
  if (!l.cut) return;
  for (const p of SIM.packets) if (p.state === 'fly' && p.link === l) {
    const frac = Math.min(1, Math.max(0, (SIM.T - p.t0) / (p.t1 - p.t0)));
    lose(p, 'ケーブルが切れた'); SIM.ghosts[SIM.ghosts.length - 1].frac = frac;
    SIM.ghosts[SIM.ghosts.length - 1].from = p.from; SIM.ghosts[SIM.ghosts.length - 1].to = p.to;
  }
}

// 時刻 T まで、早い順に出来事を処理する
function advance(T) {
  for (let guard = 0; guard < 20000; guard++) {
    let best = null;
    for (const p of SIM.packets) if ((p.state === 'node' || p.state === 'fly') && p.next <= T && (!best || p.next < best.next)) best = p;
    let tTimer = Infinity;
    if (SIM.wait && SIM.wait.deadline <= T) tTimer = SIM.wait.deadline;
    let srvT = Infinity;                                              // サーバーの時計は1つだけ
    const v0 = SIM.srv;
    if (v0 && v0.unacked.size > v0.redo.length && v0.timer + rto() <= T) srvT = v0.timer + rto();
    const tP = best ? best.next : Infinity, tMin = Math.min(tP, tTimer, srvT);
    if (tMin === Infinity) break;
    SIM.T = Math.max(SIM.T, tMin);
    if (tMin === tP) { if (best.state === 'node') forward(best); else arrive(best); }
    else if (tMin === tTimer) { const w = SIM.wait; SIM.wait = null; SIM.backoff = Math.min(64, SIM.backoff * 2); w.resend(); }
    else {                                                            // 時間切れ → 送る数を1に、待ち時間を2倍に（RFC 5681・6298）
      const v = SIM.srv;
      v.ssthresh = Math.max(2, (v.unacked.size - v.redo.length) / 2); v.cwnd = 1; SIM.backoff = Math.min(64, SIM.backoff * 2);
      v.redo = [...v.unacked.keys()].sort((a, b) => a - b);            // まだ返事のないものを、古い順に送り直す
      v.timer = SIM.T; pump();
    }
  }
  SIM.T = T;
  SIM.packets = SIM.packets.filter(p => p.state === 'node' || p.state === 'fly');
}

function stepSim(dtReal) {
  if (SIM.paused) { SIM.ghosts.forEach(g => g.age += dtReal); SIM.ghosts = SIM.ghosts.filter(g => g.age < 1.5); return; }
  if (SIM.running || SIM.packets.length) advance(SIM.T + dtReal * SIM.msPerSec);   // そろったあとも、飛んでいる ACK は着くまで動かす
  SIM.ghosts.forEach(g => g.age += dtReal); SIM.ghosts = SIM.ghosts.filter(g => g.age < 1.5);
}

// かかった時間の内訳（ミリ秒）
function breakdown() {
  const m = SIM.marks, order = ['dns', 'tcp', 'tls', 'get', 'data', 'done'], out = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = m[order[i]]; if (a == null) break;
    const b = m[order[i + 1]] != null ? m[order[i + 1]] : SIM.T;
    out.push({ ph: order[i], ms: b - a });
  }
  return out;
}
function lightFloor() {          // 真空をまっすぐ光が往復したら（東京 → サーバー）。宇宙のサーバーは null
  const s = NODE[SIM.server]; return s.lat == null ? null : 2 * greatCircleKm(NODE.ix, s) / C_KM_MS;
}
