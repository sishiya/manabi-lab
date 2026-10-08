/* The panel: experiment list, the packet inspector (with byte editing), quests and sources. */
'use strict';

const EXPS = [
  { id:'basic',  t:'ふつうにログイン', pk:'パスキーを作って、ログインする。何が行き来する？', pw:'パスワードでログインする。何が行き来する？' },
  { id:'phish',  t:'偽サイトに来てしまった', pk:'そっくりのページで「パスキーでログイン」を押すと？', pw:'そっくりのページでパスワードを打ちこむと？' },
  { id:'leak',   t:'サーバーのデータが盗まれた', pk:'盗まれたのは公開鍵。うその署名は通る？', pw:'盗まれたのはハッシュ。パスワードを当てられる？' },
  { id:'replay', t:'記録して、あとで使い回す', pk:'記録した署名つきの返事を、次の日に送ると？', pw:'記録したパスワードを、次の日に送ると？' },
  { id:'tamper', t:'届く途中で書きかえる', pk:'小包のバイトを1つ書きかえて送ると？', pw:'（パスキーだけの実験）', only:'passkey' },
  { id:'lost',   t:'スマホを落とした', pk:'拾った人はログインできる？秘密鍵は取り出せる？', pw:'（パスキーだけの実験）', only:'passkey' },
  { id:'second', t:'2つめのサイト', pk:'サイトごとに別の鍵。悪い店が返事を銀行に送ると？', pw:'同じパスワードを使い回すと？' },
];
const TRIED = new Set();     // 'id:mode' tried in this visit

const QUESTS = [
  { id:'login',     t:'パスキーでログインして、行き来した小包の中身を見た' },
  { id:'phish-pw',  t:'偽サイトで、パスワードが盗まれて使われた' },
  { id:'phish-pk',  t:'偽サイトで、パスキーはブラウザに止められた' },
  { id:'leak-pw',   t:'盗まれたハッシュから、弱いパスワードが当てられた' },
  { id:'leak-pk',   t:'公開鍵を盗んでも、うその署名ははじかれた' },
  { id:'replay-pk', t:'記録した署名の使い回しが、チャレンジではじかれた' },
  { id:'tamper',    t:'1バイト書きかえたら、署名が合わなくなった' },
  { id:'lost',      t:'秘密鍵は、このページからも取り出せなかった' },
  { id:'second-pk', t:'ねこ商店の返事は、銀行では使えなかった' },
];
let DONE = new Set();
function loadDone(){ try { DONE = new Set(JSON.parse(localStorage.getItem('pk.done') || '[]')); } catch (e) { DONE = new Set(); } }
function quest(id){ if (DONE.has(id)) return; DONE.add(id); try { localStorage.setItem('pk.done', JSON.stringify([...DONE])); } catch (e) {} buildQuests(); }
function buildQuests(){ $('quests').innerHTML = QUESTS.map(q => `<li class="${DONE.has(q.id) ? 'done' : ''}">${esc(q.t)}</li>`).join(''); }

const SRC = [
  { t:'W3C (2026) Web Authentication: An API for accessing Public Key Credentials Level 3. W3C 勧告 2026年8月25日 — authenticator data の並びとフラグ、署名の中身、clientDataJSON、チャレンジは16バイト以上、秘密鍵は作った認証器から出ない', u:'https://www.w3.org/TR/webauthn-3/' },
  { t:'W3C (2021) Web Authentication Level 2 — §7.2 ログインのときサーバーが確かめること', u:'https://www.w3.org/TR/webauthn-2/' },
  { t:'FIDO Alliance「Passkeys」— 同期は端末どうしで暗号化、生体情報は端末から出ない、QR コードでほかの端末から', u:'https://fidoalliance.org/passkeys/' },
  { t:'NIST (2025) SP 800-63B-4 Digital Identity Guidelines: Authentication and Authenticator Management — §3.2.5 フィッシング耐性（検証者の名前に結びつける）、§3.1.1.2 パスワードはソルトつきでハッシュにして保存', u:'https://pages.nist.gov/800-63-4/sp800-63b.html' },
  { t:'IETF RFC 9053 (2022) CBOR Object Signing and Encryption (COSE): Initial Algorithms — ES256 = −7', u:'https://www.rfc-editor.org/rfc/rfc9053' },
  { t:'NIST (2023) FIPS 186-5 Digital Signature Standard — ECDSA', u:'https://csrc.nist.gov/pubs/fips/186-5/final' },
  { t:'NIST (2010) SP 800-132 Recommendation for Password-Based Key Derivation — PBKDF2', u:'https://csrc.nist.gov/pubs/sp/800/132/final' },
  { t:'W3C (2017) Web Cryptography API — このアプリの計算に使っている、ブラウザの暗号の機能', u:'https://www.w3.org/TR/WebCryptoAPI/' },
  { t:'IETF RFC 2606 (1999) Reserved Top Level DNS Names — 例のための名前 .example', u:'https://www.rfc-editor.org/rfc/rfc2606' },
];
function buildSources(){
  $('srcList').innerHTML = SRC.map(s => `<li>${esc(s.t)}　<a href="${s.u}" target="_blank" rel="noopener">リンク</a></li>`).join('');
}

/* ---------- experiments list ---------- */
function buildExps(){
  const m = W.mode;
  $('exps').innerHTML = EXPS.map((e, i) => {
    const d = m === 'password' ? e.pw : e.pk;
    const st = [TRIED.has(e.id + ':password') ? '<span class="st pw">✓パスワード</span>' : '', TRIED.has(e.id + ':passkey') ? '<span class="st pk">✓パスキー</span>' : ''].join(' ');
    return `<li><button data-id="${e.id}" class="${e.only && e.only !== m ? 'off' : ''} ${ST.cur === e.id ? 'cur' : ''}"><span class="n">${i + 1}</span><span class="t">${esc(e.t)}</span><span>${st}</span><span class="d">${esc(d)}</span></button></li>`;
  }).join('');
  $('exps').querySelectorAll('button').forEach(b => b.onclick = () => startExp(b.dataset.id));
}

/* ---------- inspector ---------- */
const FLAGNAMES = ['UP','—','UV','BE','BS','—','AT','ED'];
const FLAGTIPS = { UP:'人がその場にいた', UV:'指紋・顔・PIN で確かめた', BE:'同期できる鍵', BS:'同期されている', AT:'公開鍵つき', ED:'拡張つき' };

function hexSpans(bytes, segOf, edit, orig){
  let h = '';
  for (let i = 0; i < bytes.length; i++){
    const chg = orig && orig[i] !== bytes[i];
    h += `<span class="by ${segOf(i)} ${chg ? 'chg' : ''}" data-i="${i}">${bytes[i].toString(16).padStart(2,'0')}</span>`;
    if (i % 4 === 3) h += ' ';
  }
  return `<div class="hex ${edit ? 'edit' : ''}">${h}</div>`;
}
function jsonSpans(bytes, edit, orig){
  let h = '';
  for (let i = 0; i < bytes.length; i++){
    const chg = orig && orig[i] !== bytes[i];
    h += `<span class="by ${chg ? 'chg' : ''}" data-i="${i}">${esc(String.fromCharCode(bytes[i]))}</span>`;
  }
  return `<div class="txt hex ${edit ? 'edit' : ''}" style="white-space:normal">${h}</div>`;
}
function fieldHTML(f, edit){
  const o = f.orig;
  let body = '', size = '';
  if (f.type === 'text'){ body = `<div class="txt"><code class="${f.cls || ''}">${esc(f.text)}</code></div>`; }
  else if (f.type === 'hex'){ size = f.bytes.length + ' バイト'; body = hexSpans(f.bytes, () => f.cls || '', edit, o); }
  else if (f.type === 'pub'){ size = f.bytes.length + ' バイト'; body = hexSpans(f.bytes, i => i === 0 ? 'seg5' : i < 33 ? 'seg1' : 'seg4', edit, o) + `<div class="legend"><i class="hex"><span class="seg5">04</span></i><i class="hex"><span class="seg1">x</span></i><i class="hex"><span class="seg4">y</span></i></div>`; }
  else if (f.type === 'json'){ size = f.bytes.length + ' バイト'; body = jsonSpans(f.bytes, edit, o); }
  else if (f.type === 'auth'){
    const a = parseAuthData(f.bytes);
    size = f.bytes.length + ' バイト';
    body = hexSpans(f.bytes, i => i < 32 ? 'seg1' : i === 32 ? 'seg2' : i < 37 ? 'seg3' : 'seg5', edit, o)
      + `<div class="legend"><i class="hex"><span class="seg1">rpIdHash 32</span></i><i class="hex"><span class="seg2">フラグ 1</span></i><i class="hex"><span class="seg3">回数 4 = ${a.count}</span></i>${f.bytes.length > 37 ? '<i class="hex"><span class="seg5">鍵の ID と公開鍵（COSE）</span></i>' : ''}</div>`
      + `<div class="flags">${FLAGNAMES.map((n, b) => `<span class="${a.flags & (1 << b) ? 'on' : ''}" title="${esc(FLAGTIPS[n] || '未使用')}">${n}</span>`).join('')}</div>`
      + `<p>フラグは右から bit0。UP＝人がいた、UV＝本人を確かめた、BE・BS＝同期できる・同期済み、AT＝公開鍵つき。</p>`;
  }
  return `<div class="fld"><div class="fl"><b>${esc(f.label)}</b><small>${size}</small></div>${body}${f.note ? `<p>${f.note}</p>` : ''}</div>`;
}
let INSP = null;   // { pkt, onChange }
function showPacket(pkt, onChange){
  INSP = { pkt, onChange };
  ST.sel = pkt; renderLog();
  const edit = !!onChange;
  if (edit) for (const f of pkt.fields) if (f.bytes && !f.orig) f.orig = f.bytes.slice();
  const el = $('insp');
  el.innerHTML = `<div class="ihead"><b>${pkt.n}. ${esc(pkt.title)}</b><span>${esc(NAME[pkt.from])} → ${esc(NAME[pkt.to])}</span></div>`
    + (edit ? `<p class="cap" style="color:var(--bad)">書きかえモード: バイト（文字）を押すと 1 ビット変わります。もう一度押すともどります。</p>` : '')
    + pkt.fields.map(f => fieldHTML(f, edit)).join('');
  if (edit){
    el.querySelectorAll('.fld').forEach((fe, fi) => {
      fe.querySelectorAll('.by').forEach(s => s.onclick = () => editByte(pkt, fi, +s.dataset.i));
    });
  }
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function editByte(pkt, fi, i){
  const f = pkt.fields[fi];
  if (!f.bytes) return;
  if (!f.orig) f.orig = f.bytes.slice();
  f.bytes[i] ^= 1;
  const n = pkt.fields.reduce((s, g) => s + (g.orig ? g.bytes.reduce((t, v, k) => t + (v !== g.orig[k] ? 1 : 0), 0) : 0), 0);
  const cb = INSP && INSP.pkt === pkt ? INSP.onChange : null;
  if (cb) cb(n);
  showPacket(pkt, cb || undefined);
}

async function showKey(c){
  let msg;
  try { await crypto.subtle.exportKey('pkcs8', c.priv); msg = '取り出せてしまった'; } catch (e) { msg = '取り出せません（' + e.name + '）'; }
  ST.sel = null; renderLog();
  $('insp').innerHTML = `<div class="ihead"><b>スマホの金庫の鍵</b><span>${esc(c.rpId)}</span></div>`
    + fieldHTML(F.text('どのサイトの鍵か（rpId）', c.rpId), false)
    + fieldHTML(F.cred(c.credId), false)
    + fieldHTML(F.pub(c.pubRaw), false)
    + fieldHTML(F.text('秘密鍵', msg, 'このアプリでも「取り出せない」設定で作っています。ブラウザに取り出しを頼むと、いまこのとおり断られました。', 'priv'), false)
    + fieldHTML(F.text('使った回数', String(c.count)), false);
}
function showKeysCompare(){
  ST.sel = null; renderLog();
  $('insp').innerHTML = `<div class="ihead"><b>サイトごとの鍵</b><span>${W.phone.creds.length} 組</span></div>`
    + W.phone.creds.map(c => `<div class="fld"><div class="fl"><b>${esc(c.rpId)}</b></div><div class="row"><span>鍵の ID</span><code>${short(c.credId, 8)}</code><span>公開鍵</span><code class="pub">${short(c.pubRaw, 12)}</code></div></div>`).join('')
    + `<p class="cap">鍵の ID も公開鍵も、サイトごとにまったくちがいます。サイトどうしで突き合わせても、同じ人だとはわかりません。</p>`;
}

/* ---------- page buttons when no experiment is running ---------- */
function wirePage(){
  const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', () => { if (!W.busy) fn(); }); };
  on('pgReg', () => run(registerFlow));
  on('pgLogin', () => {
    if (W.mode === 'password' && !ST.pwTyped){ ST.pageMsg = 'パスワードを入れてください'; renderBrowser(); return; }
    run(W.mode === 'password' ? pwLoginFlow : loginFlow);
  });
  on('pgPw', typePassword);
  on('pgOut', () => { W.session = null; ST.checks = null; renderAll(); });
}

function syncControls(){
  document.querySelectorAll('#segMode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === W.mode));
  document.querySelectorAll('#segSpeed button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === ST.speed));
  buildExps();
}
