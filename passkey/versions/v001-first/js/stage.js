/* The stage: phone, browser (with a fake web page), server, thief, flying packets, narration and the log. */
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const short = (b, n = 8) => { const h = hex(b); return h.length > n * 2 + 2 ? h.slice(0, n * 2) + '…' : h; };

const ST = {
  speed:1, auto:false,           // auto: debug mode, every wait resolves at once
  phoneUI:{ kind:'idle' },
  pageMsg:'', pwTyped:false, browserOwner:'you',
  viewHost:'donguri-bank.example',
  checks:null,                   // { title, items:[{label, ok|null, why}], result:null|true|false, text }
  log:[], sel:null,
};
const COL = { chal:'var(--chal)', pub:'var(--pub)', sig:'var(--sig)', pw:'var(--pw)', bad:'var(--bad)', plain:'var(--line2)', priv:'var(--priv)' };

function sleep(ms){ return new Promise(r => setTimeout(r, ST.auto ? 0 : ms * ST.speed)); }

/* waits for the user that can be cancelled (another experiment, "はじめから") */
const PENDING = new Set();
function waitable(exec){
  if (ST.aborting) return Promise.reject(new Error('abort'));
  return new Promise((res, rej) => {
    PENDING.add(rej);
    exec(v => { PENDING.delete(rej); res(v); });
  });
}
function abortWaits(){
  for (const rej of PENDING) rej(new Error('abort'));
  PENDING.clear();
  document.querySelectorAll('.want').forEach(e => e.classList.remove('want'));
  const f = $('finger'); if (f){ f.onpointerdown = f.onclick = null; $('fingerRing').style.setProperty('--p', 0); }
}

/* ---------- phone ---------- */
function renderPhone(){
  const u = ST.phoneUI, s = $('phoneScreen');
  let h = '';
  if (u.kind === 'idle') h = `<div class="big">🔒</div><div>${W.phone.holder === 'thief' ? '<span class="err">わるものの手の中</span>' : 'ロック中'}</div>`;
  else if (u.kind === 'ask') h = `<div>${esc(u.verb)}</div><div class="site">${esc(u.rpId)}</div><div><b>指紋センサーを長押し</b></div>`;
  else if (u.kind === 'work') h = `<div class="big">⚙</div><div>${esc(u.text)}</div>`;
  else if (u.kind === 'ok') h = `<div class="big ok">✓</div><div>${esc(u.text)}</div>`;
  else if (u.kind === 'err') h = `<div class="big err">✕</div><div class="err">${esc(u.text)}</div>${u.site ? `<div class="site">${esc(u.site)}</div>` : ''}`;
  s.innerHTML = h;
  $('finger').classList.toggle('ready', u.kind === 'ask');
  const v = $('vault');
  v.innerHTML = `<div class="ttl">秘密鍵の金庫（スマホの外に出ない）</div>` + (W.phone.creds.length
    ? W.phone.creds.map((c, i) => `<button class="key" data-i="${i}"><span class="k">🔑</span><span>${esc(c.rpId)}<br><span style="color:var(--dim)">回数 ${c.count}</span></span></button>`).join('')
    : `<div class="empty">まだパスキーはありません</div>`);
  v.querySelectorAll('.key').forEach(b => b.onclick = () => showKey(W.phone.creds[+b.dataset.i]));
}
function phoneUI(kind, o = {}){ ST.phoneUI = Object.assign({ kind }, o); renderPhone(); }

/* Hold the fingerprint sensor (~0.7 s). A keyboard click counts at once. */
function touchFinger(){
  if (ST.auto) return Promise.resolve();
  const f = $('finger'), ring = $('fingerRing');
  f.classList.add('want');
  return waitable(res => {
    let t = null, p = 0;
    const done = () => { stop(); f.classList.remove('want'); ring.style.setProperty('--p', 0); f.onpointerdown = f.onclick = null; res(); };
    const stop = () => { clearInterval(t); t = null; };
    f.onpointerdown = e => { e.preventDefault(); stop(); p = 0;
      t = setInterval(() => { p += 0.06; ring.style.setProperty('--p', Math.min(p, 1)); if (p >= 1) done(); }, 40); };
    const cancel = () => { if (t){ stop(); p = 0; ring.style.setProperty('--p', 0); } };
    f.onpointerup = f.onpointerleave = f.onpointercancel = cancel;
    f.onclick = e => { if (e.detail === 0) done(); };
  });
}

/* ---------- browser ---------- */
function hostHTML(h){
  const s = SITES[h];
  return s && s.fake ? h.replace('bamk', '<s>bamk</s>') : esc(h);
}
function renderBrowser(){
  $('addrText').innerHTML = hostHTML(W.origin);
  $('browserWho').textContent = ST.browserOwner === 'thief' ? 'わるもののパソコン' : 'あなたのパソコン';
  $('aBrowser').classList.toggle('thief', ST.browserOwner === 'thief');
  const site = SITES[W.origin], pg = $('page');
  const logged = W.session && W.session.host === W.origin;
  const pk = site.fake ? null : W.servers[W.origin].users[USER].pk;
  let body;
  if (logged){
    body = `<div class="welcome">ようこそ ${USER} さん</div><div>${esc(site.what)}</div>
      <div class="note">${W.session.by === 'thief' ? '<span class="warn">いまログインしているのは、わるものです</span>' : (W.session.how === 'passkey' ? 'パスキーでログインしました' : 'パスワードでログインしました')}</div>
      <button class="pbtn sub" id="pgOut">ログアウト</button>`;
  } else if (W.mode === 'password'){
    body = `<label>ユーザー名</label><div class="field">${USER}</div>
      <label>パスワード</label><button class="field" id="pgPw">${ST.pwTyped ? '•'.repeat(PASSWORDS[W.strength].length) : '<span style="color:#a39a8c">（押すと入力）</span>'}</button>
      <button class="pbtn" id="pgLogin" style="background:${site.color}">ログイン</button>`;
  } else {
    body = `<label>ユーザー名</label><div class="field">${USER}</div>
      <button class="pbtn" id="pgLogin" style="background:${site.color}">🔑 パスキーでログイン</button>
      ${(site.fake || !pk) ? `<button class="pbtn sub" id="pgReg">パスキーを作る</button>` : `<div class="note">このサイトにはパスキーを登録ずみ</div>`}`;
  }
  pg.innerHTML = `<div class="bar" style="background:${site.color}"><span>${site.icon}</span><span>${esc(site.name)}</span></div>
    <div class="body">${ST.pageMsg ? `<div class="warn">${esc(ST.pageMsg)}</div>` : ''}${body}</div>`;
  if (typeof wirePage === 'function') wirePage();
}

/* ---------- server ---------- */
function renderServer(){
  const h = ST.viewHost, s = W.servers[h], u = s.users[USER], site = SITES[h];
  $('serverWho').innerHTML = `${site.icon} ${esc(site.name)}<small class="host">${esc(h)}</small>`;
  let d = `<div class="ttl">しまっているもの（${USER} さん）</div>`;
  if (W.mode === 'password'){
    d += `<div class="row"><span>ソルト</span><code>${short(u.pw.salt, 6)}</code><span>ハッシュ</span><code class="pw">${short(u.pw.hash, 10)}</code></div>
      <p class="cap">パスワードそのものではなく、ソルトを混ぜて ${PW_ITER.toLocaleString()} 回かき混ぜた値（PBKDF2）。</p>`;
  } else if (u.pk){
    d += `<div class="row"><span>鍵の ID</span><code>${short(u.pk.credId, 8)}</code><span>公開鍵</span><code class="pub">${short(u.pk.pubRaw, 10)}</code><span>回数</span><code>${u.pk.count}</code></div>
      <p class="cap">秘密鍵は持っていません。<b>盗まれても困らない</b>ものだけ。</p>`;
  } else d += `<p class="cap">パスキーはまだ登録されていません。</p>`;
  if (s.challenge) d += `<div class="row"><span>チャレンジ</span><code class="chal">${short(s.challenge, 8)}</code></div>`;
  $('db').innerHTML = d;
  const c = ST.checks, ul = $('checks');
  if (!c){ ul.innerHTML = ''; return; }
  ul.innerHTML = `<li class="head">${esc(c.title)}</li>` + c.items.map(it =>
    `<li class="${it.ok === true ? 'ok' : it.ok === false ? 'ng' : ''}"><i>${it.ok === true ? '✓' : it.ok === false ? '✕' : '・'}</i><span>${esc(it.label)}${it.why ? `<small>${esc(it.why)}</small>` : ''}</span></li>`).join('')
    + (c.result == null ? '' : `<li class="res ${c.result ? 'ok' : 'ng'}">${esc(c.text)}</li>`);
}
/* reveal check results one by one */
async function showChecks(title, items, okText, ngText){
  ST.checks = { title, items: items.map(it => Object.assign({}, it, { ok:null })), result:null };
  renderServer();
  for (let i = 0; i < items.length; i++){
    await sleep(170);
    ST.checks.items[i].ok = items[i].ok;
    if (items[i].why) ST.checks.items[i].why = items[i].why;
    renderServer();
  }
  const ok = items.every(it => it.ok);
  await sleep(200);
  ST.checks.result = ok; ST.checks.text = ok ? okText : ngText;
  renderServer();
  return ok;
}

/* ---------- thief ---------- */
function renderThief(){
  const t = W.thief, el = $('loot');
  $('aThief').classList.toggle('on', t.active);
  $('thiefRole').textContent = t.active ? 'ねらっている' : '見ているだけ';
  el.innerHTML = t.loot.length ? t.loot.map(l => `<div class="row"><span>${esc(l.k)}</span><code class="${l.cls || ''}">${esc(l.v)}</code></div>`).join('')
    : `<div class="empty">手に入れたもの: なし</div>`;
  drawWires();
}
function loot(k, v, cls){ W.thief.loot.push({ k, v, cls }); renderThief(); }

/* ---------- wires and packets ---------- */
function anchor(id){
  const w = $('world').getBoundingClientRect(), r = $(id).getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + Math.min(r.height / 2, 70) };
}
function drawWires(){
  const svg = $('wires'); if (!svg) return;
  const p = anchor('aPhone'), b = anchor('aBrowser'), s = anchor('aServer'), t = anchor('aThief');
  const mx = (b.x + s.x) / 2, my = (b.y + s.y) / 2;
  svg.innerHTML = `<line x1="${p.x}" y1="${p.y}" x2="${b.x}" y2="${b.y}"/><line x1="${b.x}" y1="${b.y}" x2="${s.x}" y2="${s.y}"/>
    <line class="tap ${W.thief && W.thief.active ? 'on' : ''}" x1="${t.x}" y1="${t.y}" x2="${mx}" y2="${my}"/>`;
}
const ACTOR = { phone:'aPhone', browser:'aBrowser', server:'aServer', thief:'aThief' };
const NAME = { phone:'スマホ', browser:'ブラウザ', server:'サーバー', thief:'わるもの' };

/* an animation that never stalls the story: if the page is hidden (animations frozen), it ends by a timer */
function move(el, kf, dur, easing){
  const an = el.animate(kf, { duration:dur, easing, fill:'forwards' });
  return Promise.race([an.finished, new Promise(r => setTimeout(r, dur + 400))]).then(() => { try { an.finish(); } catch (e) {} });
}
/* pkt: { title, icon, color, fields:[...] } -> flies, then lands in the log */
async function fly(from, to, pkt, opt = {}){
  pkt.from = from; pkt.to = to; pkt.n = ST.log.length + 1;
  const el = document.createElement('div');
  el.className = 'pkt'; el.style.setProperty('--c', pkt.color || COL.plain);
  el.innerHTML = `<span>${pkt.icon || '✉'}</span><span>${esc(pkt.title)}</span>`;
  el.onclick = () => showPacket(pkt);
  $('packets').appendChild(el);
  const a = anchor(ACTOR[from]), b = anchor(ACTOR[to]);
  const w = el.offsetWidth, h = el.offsetHeight;
  const at = (q, k = 0) => `translate(${q.x - w / 2}px, ${q.y - h / 2 - k}px)`;
  const mid = { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 };
  const dur = ST.auto ? 0 : 1100 * ST.speed;
  ST.log.push(pkt); renderLog();
  if (opt.pauseMid){
    if (dur) await move(el, [{ transform:at(a) }, { transform:at(mid, 26) }], dur / 2, 'ease-in');
    else el.style.transform = at(mid, 26);
    el.classList.add('paused');
    await opt.pauseMid(pkt);
    el.classList.remove('paused');
    if (dur) await move(el, [{ transform:at(mid, 26) }, { transform:at(b) }], dur / 2, 'ease-out');
  } else if (dur){
    await move(el, [{ transform:at(a) }, { transform:at(mid, 26) }, { transform:at(b) }], dur, 'ease-in-out');
  }
  el.remove();
  return pkt;
}
function renderLog(){
  $('log').innerHTML = ST.log.map((p, i) => `<li><button style="--c:${p.color || COL.plain}" data-i="${i}" class="${ST.sel === p ? 'sel' : ''}"><b>${i + 1}</b>${esc(NAME[p.from])}→${esc(NAME[p.to])} ${esc(p.title)}</button></li>`).join('');
  $('log').querySelectorAll('button').forEach(b => b.onclick = () => showPacket(ST.log[+b.dataset.i]));
}

/* ---------- narration and waiting for the user ---------- */
function narr(html, btns = []){
  $('narrText').innerHTML = html;
  const box = $('narrBtns'); box.innerHTML = '';
  for (const b of btns){
    const e = document.createElement('button');
    e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; e.onclick = b.fn;
    box.appendChild(e);
  }
}
function ask(html, labels){
  if (ST.auto) { narr(html); return Promise.resolve(0); }
  return waitable(res => narr(html, labels.map((l, i) => ({ label:l, cls: i === 0 ? 'go' : '', fn: () => res(i) }))));
}
/* highlight an element and wait until it is pressed */
function want(getEl, html){
  if (html) narr(html);
  if (ST.auto) return Promise.resolve();
  return waitable(res => {
    const el = typeof getEl === 'function' ? getEl() : getEl;
    el.classList.add('want');
    ST.wantHook = () => { el.classList.remove('want'); ST.wantHook = null; res(); };
    el.addEventListener('click', ST.wantHook, { once:true });
  });
}

function renderAll(){ renderPhone(); renderBrowser(); renderServer(); renderThief(); renderLog(); }
