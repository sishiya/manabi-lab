/* The stage as a picture: phone (with a key vault), the browser as a gatekeeper, three houses (sites), the thief,
   flying tokens, one-line narration, and the optional byte log. */
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const tagOf = h => h.replace('.example', '');

const ST = {
  speed:1, auto:false, aborting:false,
  phoneUI:{ kind:'idle' }, gateStop:null, badges:null,
  log:[], sel:null, cur:null,
};
const COL = { chal:'var(--chal)', pub:'var(--pub)', sig:'var(--sig)', pw:'var(--pw)', bad:'var(--bad)', plain:'var(--line2)' };

function sleep(ms){ return new Promise(r => setTimeout(r, ST.auto ? 0 : ms * ST.speed)); }

/* a byte string as a small grid of colors: same bytes = same picture */
function pat(bytes, n = 4, s = 5){
  const b = u8(bytes); let r = '';
  for (let i = 0; i < n * n; i++){
    const v = b.length ? b[(i * 7) % b.length] ^ b[(i * 13 + 5) % b.length] : 0;
    r += `<rect x="${(i % n) * s}" y="${Math.floor(i / n) * s}" width="${s}" height="${s}" fill="hsl(${Math.round(v * 1.41)},62%,${46 + (v & 3) * 7}%)"/>`;
  }
  return `<svg class="pat" width="${n * s}" height="${n * s}" viewBox="0 0 ${n * s} ${n * s}" aria-hidden="true">${r}</svg>`;
}

/* ---------- waits that can be cancelled ---------- */
const PENDING = new Set();
function waitable(exec){
  if (ST.aborting) return Promise.reject(new Error('abort'));
  return new Promise((res, rej) => { PENDING.add(rej); exec(v => { PENDING.delete(rej); res(v); }); });
}
function abortWaits(){
  for (const rej of PENDING) rej(new Error('abort'));
  PENDING.clear();
  document.querySelectorAll('.want').forEach(e => e.classList.remove('want'));
  $('touch').onclick = null; $('touch').classList.remove('ready');
}

/* ---------- phone ---------- */
function renderPhone(){
  const u = ST.phoneUI;
  const H = {
    idle: () => `<div class="big">🔒</div>${W.phone.holder === 'thief' ? '<div class="err">わるものが拾った</div>' : ''}`,
    ask:  () => `<div>${esc(u.text)}</div><div>${SITES[u.rpId].icon} <b>${esc(tagOf(u.rpId))}</b></div>`,
    work: () => `<div class="big">⚙</div><div>${esc(u.text)}</div>`,
    ok:   () => `<div class="big ok">✓</div><div>${esc(u.text)}</div>`,
    err:  () => `<div class="big err">✕</div><div class="err">${esc(u.text)}</div>`,
  };
  $('phoneScreen').innerHTML = H[u.kind]();
  $('vault').innerHTML = `<div class="ttl">🔒 金庫（秘密鍵）</div>` + (W.phone.creds.length
    ? W.phone.creds.map((c, i) => `<button class="key" data-i="${i}" title="押すと、くわしく">${SITES[c.rpId].icon} 🔑 <span class="mono" style="font-size:11px">${esc(tagOf(c.rpId))}</span></button>`).join('')
    : `<div class="empty">からっぽ</div>`);
  $('vault').querySelectorAll('.key').forEach(b => b.onclick = () => showKey(W.phone.creds[+b.dataset.i]));
}
function phoneUI(kind, o = {}){ ST.phoneUI = Object.assign({ kind }, o); renderPhone(); }

function touch(){
  if (ST.auto) return Promise.resolve();
  const t = $('touch');
  t.classList.add('ready', 'want');
  return waitable(res => { t.onclick = () => { t.onclick = null; t.classList.remove('ready', 'want'); res(); }; });
}

/* ---------- gate (browser) ---------- */
function renderGate(){
  const h = W.origin, s = SITES[h];
  const stop = ST.gateStop ? `<div class="stop">✋</div><div class="err" style="color:var(--bad);font-size:12.5px">${esc(ST.gateStop)}</div>` : '';
  let btns;
  if (W.mode === 'password') btns = `<button class="btn pw small" id="gLogin">🗝 ログイン</button>`;
  else {
    const has = !s.fake && W.servers[h].users[USER].pk;
    btns = `${has ? '' : `<button class="btn small" id="gMake">🔑 作る</button>`}<button class="btn go small" id="gLogin">ログイン</button>`;
  }
  $('gate').innerHTML = `<div class="dest"><span class="lbl">いまの行き先</span><span class="nm">${s.icon} ${esc(s.name)}</span><span class="tag ${s.fake ? 'bad' : ''}">${esc(tagOf(h))}</span></div>${stop}<div class="gatebtns">${btns}</div>`;
  if (typeof wireGate === 'function') wireGate();
}

/* ---------- houses (servers) ---------- */
function renderSites(){
  $('sites').innerHTML = HOSTS.map((h, i) => {
    const s = SITES[h], on = h === W.origin || (ST.badges && ST.badges.host === h);
    let led;
    if (s.fake) led = `<span>台帳なし</span>`;
    else {
      const u = W.servers[h].users[USER];
      led = W.mode === 'password' ? `🗝 ${pat(u.pw.hash)}<span>合言葉の模様</span>`
        : u.pk ? `🔓 ${pat(u.pk.pubRaw)}<span>公開鍵</span>` : `<span>🔓 まだなし</span>`;
    }
    let bd = '';
    if (ST.badges && ST.badges.host === h){
      bd = `<div class="badges">${ST.badges.items.map(it => `<span class="${it.ok === true ? 'ok' : it.ok === false ? 'ng' : ''}">${it.icon}${esc(it.label)}</span>`).join('')}</div>`
        + (ST.badges.verdict == null ? '' : `<div class="verdict ${ST.badges.verdict ? 'ok' : 'ng'}">${esc(ST.badges.text)}</div>`);
    }
    return `<button class="house ${on ? 'on' : ''}" id="house-${i}" data-h="${h}" style="--hc:${s.color}">
      ${s.fake ? '<span class="oni" title="にせもの">👹</span>' : ''}<div class="roof"></div>
      <div class="wall"><span class="nm">${s.icon} ${esc(s.name)}</span><span class="tag ${s.fake ? 'bad' : ''}">${esc(tagOf(h))}</span><div class="ledger">${led}</div>${bd}</div></button>`;
  }).join('');
  $('sites').querySelectorAll('.house').forEach(b => b.onclick = () => { if (!W.busy) goTo(b.dataset.h); });
}
/* reveal checks one by one */
async function showBadges(host, items, okText, ngText){
  ST.badges = { host, items: items.map(it => Object.assign({}, it, { ok:null })), verdict:null };
  renderSites();
  for (let i = 0; i < items.length; i++){ await sleep(200); ST.badges.items[i].ok = items[i].ok; renderSites(); }
  const ok = items.every(it => it.ok);
  await sleep(200);
  ST.badges.verdict = ok; ST.badges.text = ok ? okText : ngText;
  renderSites();
  return ok;
}

/* ---------- thief ---------- */
function renderThief(){
  const t = W.thief;
  $('aThief').classList.toggle('on', t.active);
  $('loot').innerHTML = (t.loot.length ? t.loot.map(l => `<span class="it">${l.icon} ${l.bytes ? pat(l.bytes) : ''}${l.text ? `<span class="mono">${esc(l.text)}</span>` : ''}</span>`).join('') : `<span class="empty">何も持っていない</span>`)
    + (t.guesses ? `<div style="width:100%;display:flex;flex-wrap:wrap;gap:4px 8px;justify-content:center">${t.guesses.map(g => `<span class="guess ${g.s}">${esc(g.w)}</span>`).join('')}</div>` : '');
  drawWires();
}
function loot(icon, o = {}){ W.thief.loot.push(Object.assign({ icon }, o)); renderThief(); }

/* ---------- wires and tokens ---------- */
function elOf(k){ return k === 'phone' ? 'aPhone' : k === 'gate' ? 'aGate' : k === 'thief' ? 'aThief' : 'house-' + HOSTS.indexOf(k); }
function anchor(k){
  const w = $('world').getBoundingClientRect(), r = $(elOf(k)).getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + Math.min(r.height / 2, 60) };
}
function drawWires(){
  const svg = $('wires'); if (!svg || !$('house-0')) return;
  const p = anchor('phone'), g = anchor('gate'), t = anchor('thief'), o = anchor(W.origin);
  let s = `<line x1="${p.x}" y1="${p.y}" x2="${g.x}" y2="${g.y}"/>`;
  for (const h of HOSTS){ const a = anchor(h); s += `<line x1="${g.x}" y1="${g.y}" x2="${a.x}" y2="${a.y}" style="opacity:${h === W.origin ? 1 : .35}"/>`; }
  s += `<line class="tap ${W.thief && W.thief.active ? 'on' : ''}" x1="${t.x}" y1="${t.y}" x2="${(g.x + o.x) / 2}" y2="${(g.y + o.y) / 2}"/>`;
  svg.innerHTML = s;
}
function move(el, kf, dur, easing){
  const an = el.animate(kf, { duration:dur, easing, fill:'forwards' });
  return Promise.race([an.finished, new Promise(r => setTimeout(r, dur + 400))]).then(() => { try { an.finish(); } catch (e) {} });
}
const NAME = k => k === 'phone' ? 'スマホ' : k === 'gate' ? 'ブラウザ' : k === 'thief' ? 'わるもの' : SITES[k].name + (SITES[k].fake ? '（にせ）' : '');

/* pkt: { icon, title, color, fields:[{label, bytes|text}] } */
async function fly(from, to, pkt, opt = {}){
  pkt.from = from; pkt.to = to;
  const el = document.createElement('div');
  el.className = 'pkt'; el.style.setProperty('--c', pkt.color || COL.plain);
  el.innerHTML = `<span>${pkt.icon || '✉'}</span><span>${esc(pkt.title)}</span>`;
  el.onclick = () => showPacket(pkt);
  $('packets').appendChild(el);
  const a = anchor(from), b = anchor(to);
  const w = el.offsetWidth, h = el.offsetHeight;
  const at = (q, k = 0) => `translate(${q.x - w / 2}px, ${q.y - h / 2 - k}px)`;
  const mid = { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 };
  const dur = ST.auto ? 0 : 1000 * ST.speed;
  ST.log.push(pkt); renderLog();
  if (opt.pauseMid){
    if (dur) await move(el, [{ transform:at(a) }, { transform:at(mid, 24) }], dur / 2, 'ease-in'); else el.style.transform = at(mid, 24);
    el.classList.add('paused');
    await opt.pauseMid(pkt, el);
    el.classList.remove('paused');
    if (dur) await move(el, [{ transform:at(mid, 24) }, { transform:at(b) }], dur / 2, 'ease-out');
  } else if (dur) await move(el, [{ transform:at(a) }, { transform:at(mid, 24) }, { transform:at(b) }], dur, 'ease-in-out');
  el.remove();
  return pkt;
}
function renderLog(){
  $('log').innerHTML = ST.log.map((p, i) => `<li><button style="--c:${p.color || COL.plain}" data-i="${i}" class="${ST.sel === p ? 'sel' : ''}">${i + 1}. ${esc(NAME(p.from))}→${esc(NAME(p.to))} ${p.icon || ''}${esc(p.title)}</button></li>`).join('');
  $('log').querySelectorAll('button').forEach(b => b.onclick = () => showPacket(ST.log[+b.dataset.i]));
}

/* ---------- narration ---------- */
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
  if (ST.auto){ narr(html); return Promise.resolve(0); }
  return waitable(res => narr(html, labels.map((l, i) => ({ label:l, cls: i === 0 ? 'go' : '', fn: () => res(i) }))));
}
/* light up a button and wait for it */
function want(id, html){
  if (html) narr(html);
  if (ST.auto) return Promise.resolve();
  return waitable(res => {
    const el = $(id);
    el.classList.add('want');
    el.addEventListener('click', () => { el.classList.remove('want'); res(); }, { once:true });
  });
}

function renderAll(){ renderPhone(); renderGate(); renderSites(); renderThief(); renderLog(); }
