/* The panel: the try-and-compare table, sources; the optional byte view; the gate buttons. */
'use strict';

const EXPS = [
  { id:'basic',  ic:'🚪', t:'ふつうにログイン' },
  { id:'phish',  ic:'👹', t:'にせものサイト' },
  { id:'leak',   ic:'🗄', t:'台帳が盗まれた' },
  { id:'replay', ic:'👀', t:'のぞき見して使い回す' },
  { id:'tamper', ic:'✏️', t:'途中で書きかえる', only:'passkey' },
  { id:'lost',   ic:'📱', t:'スマホをなくした', only:'passkey' },
  { id:'second', ic:'🐟', t:'2つめのサイト' },
];
const RES = {};     // 'id:mode' -> 'safe' | 'hit'

function buildScore(){
  const cell = (e, m) => {
    if (e.only && e.only !== m) return `<td class="c"><span class="na">—</span></td>`;
    const r = RES[e.id + ':' + m], cur = ST.cur === e.id + ':' + m;
    const txt = r === 'done' ? '✓ できた' : r === 'safe' ? '◯ 守れた' : r === 'hit' ? '✕ 入られた' : '試す';
    return `<td class="c"><button data-id="${e.id}" data-m="${m}" class="${r === 'done' ? 'safe' : r || ''} ${cur ? 'cur' : ''}">${txt}</button></td>`;
  };
  $('score').innerHTML = `<tr><th></th><th>🗝 合言葉</th><th>🔑 パスキー</th></tr>`
    + EXPS.map(e => `<tr><td class="t"><span>${e.ic}</span>${esc(e.t)}</td>${cell(e, 'password')}${cell(e, 'passkey')}</tr>`).join('');
  $('score').querySelectorAll('button').forEach(b => b.onclick = () => startExp(b.dataset.id, b.dataset.m));
}

const SRC = [
  { t:'W3C (2026) Web Authentication: An API for accessing Public Key Credentials Level 3（W3C 勧告 2026-08-25）— 宛名（rpId）・くじ（challenge、16バイト以上）・サインの中身・秘密鍵は作った認証器から出ない', u:'https://www.w3.org/TR/webauthn-3/' },
  { t:'W3C (2021) Web Authentication Level 2 — §7.2 ログインのときサイトが確かめること', u:'https://www.w3.org/TR/webauthn-2/' },
  { t:'FIDO Alliance「Passkeys」— 同期は端末どうしで暗号化、生体情報は端末から出ない', u:'https://fidoalliance.org/passkeys/' },
  { t:'NIST (2025) SP 800-63B-4 — §3.2.5 フィッシング耐性（相手の名前に結びつける）、§3.1.1.2 パスワードはソルトつきハッシュで保存', u:'https://pages.nist.gov/800-63-4/sp800-63b.html' },
  { t:'NIST (2023) FIPS 186-5 Digital Signature Standard — ECDSA（サイン）', u:'https://csrc.nist.gov/pubs/fips/186-5/final' },
  { t:'NIST (2010) SP 800-132 — PBKDF2（合言葉のハッシュ）', u:'https://csrc.nist.gov/pubs/sp/800/132/final' },
  { t:'IETF RFC 9053 (2022) COSE: Initial Algorithms — ES256', u:'https://www.rfc-editor.org/rfc/rfc9053' },
  { t:'W3C (2017) Web Cryptography API — このページの計算に使っている機能', u:'https://www.w3.org/TR/WebCryptoAPI/' },
];
function buildSources(){
  $('srcList').innerHTML = SRC.map(s => `<li>${esc(s.t)}　<a href="${s.u}" target="_blank" rel="noopener">リンク</a></li>`).join('');
}

/* ---------- optional byte view ---------- */
function fieldHTML(f){
  const b = f.bytes ? u8(f.bytes) : null;
  return `<div class="fld"><div class="fl"><b>${esc(f.label)}</b>${b ? `<span>${pat(b, 5, 5)} <small>${b.length} バイト</small></span>` : ''}</div>`
    + (f.text != null ? `<div class="hex" style="color:var(--ink)">${esc(f.text)}</div>` : '')
    + (b && f.text == null ? `<div class="hex">${hex(b).replace(/(.{8})/g, '$1 ')}</div>` : '') + `</div>`;
}
function showPacket(pkt){
  ST.sel = pkt; renderLog();
  $('more').open = true;
  $('insp').innerHTML = `<div class="ihead"><b>${pkt.icon || ''} ${esc(pkt.title)}</b>　<span class="cap">${esc(NAME(pkt.from))} → ${esc(NAME(pkt.to))}</span></div>`
    + (pkt.fields && pkt.fields.length ? pkt.fields.map(fieldHTML).join('') : `<p class="cap">中身はお願いの言葉だけ。</p>`);
}
async function showKey(c){
  let ok = false;
  try { await crypto.subtle.exportKey('pkcs8', c.priv); ok = true; } catch (e) {}
  ST.sel = null; renderLog();
  $('more').open = true;
  $('insp').innerHTML = `<div class="ihead"><b>🔑 ${esc(c.rpId)} の鍵</b></div>`
    + fieldHTML({ label:'🔑 秘密鍵', text: ok ? '取り出せた' : '取り出せない（このページでも中身を読めない設定）' })
    + fieldHTML({ label:'🔓 公開鍵（サイトにも渡したもの）', bytes:c.pubRaw })
    + fieldHTML({ label:'🔑 鍵の番号', bytes:c.credId });
}

/* ---------- gate buttons outside experiments ---------- */
function wireGate(){
  const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', () => { if (!W.busy) run(fn); }); };
  on('gMake', registerFlow);
  on('gLogin', () => W.mode === 'password' ? pwLoginFlow() : loginFlow());
}

function syncControls(){
  document.querySelectorAll('#segMode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === W.mode));
  document.querySelectorAll('#segSpeed button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === ST.speed));
  buildScore();
}
