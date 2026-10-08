/* Real cryptography through the browser's Web Crypto API.
   ECDSA P-256 + SHA-256 (= COSE ES256, the usual passkey algorithm) and PBKDF2 for the password side. */
'use strict';

const enc = new TextEncoder();
const dec = new TextDecoder();

function u8(x){ return x instanceof Uint8Array ? x : new Uint8Array(x); }
function rand(n){ const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
function hex(b){ return Array.from(u8(b), v => v.toString(16).padStart(2,'0')).join(''); }
function cat(...parts){
  const n = parts.reduce((s,p) => s + p.length, 0), out = new Uint8Array(n);
  let o = 0; for (const p of parts){ out.set(p, o); o += p.length; }
  return out;
}
function b64url(b){
  let s = ''; for (const v of u8(b)) s += String.fromCharCode(v);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function same(a, b){ a = u8(a); b = u8(b); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

async function sha256(b){ return u8(await crypto.subtle.digest('SHA-256', typeof b === 'string' ? enc.encode(b) : b)); }

/* The private key is created non-extractable: not even this page's own JavaScript can read it out. */
async function genKeyPair(){
  return crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, false, ['sign','verify']);
}
async function exportPub(pub){ return u8(await crypto.subtle.exportKey('raw', pub)); }   // 65 bytes: 04 | x | y
async function importPub(raw){ return crypto.subtle.importKey('raw', raw, { name:'ECDSA', namedCurve:'P-256' }, true, ['verify']); }
/* Web Crypto returns r | s (64 bytes). Real WebAuthn ES256 signatures are DER-encoded; the content is the same. */
async function sign(priv, data){ return u8(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, priv, data)); }
async function verify(pub, sig, data){
  try { return await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, pub, sig, data); }
  catch (e) { return false; }
}
async function pbkdf2(password, salt, iterations){
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return u8(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations }, k, 256));
}

/* authenticator data (WebAuthn §6.1): rpIdHash 32 | flags 1 | signCount 4 (big endian) | [attested credential data] */
const FLAG = { UP:0x01, UV:0x04, BE:0x08, BS:0x10, AT:0x40, ED:0x80 };
async function makeAuthData(rpId, flags, count, attested){
  const h = await sha256(rpId);
  const c = new Uint8Array(4); new DataView(c.buffer).setUint32(0, count >>> 0);
  return attested ? cat(h, Uint8Array.of(flags), c, attested) : cat(h, Uint8Array.of(flags), c);
}
function parseAuthData(a){
  a = u8(a);
  return { rpIdHash: a.slice(0,32), flags: a[32], count: new DataView(a.buffer, a.byteOffset + 33, 4).getUint32(0) };
}
