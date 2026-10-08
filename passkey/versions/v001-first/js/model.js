/* The world (phone, servers, thief) and the protocol steps, without any drawing.
   Follows W3C WebAuthn Level 3: registration (§7.1) and authentication (§7.2) checks. */
'use strict';

const SITES = {
  'donguri-bank.example': { name:'どんぐり銀行', color:'#e0a24a', icon:'🌰', what:'残高 12,345 どんぐり' },
  'neko-shop.example':    { name:'ねこ商店',     color:'#7fc4e8', icon:'🐟', what:'カートに にぼし 3袋' },
  'donguri-bamk.example': { name:'どんぐり銀行', color:'#e0a24a', icon:'🌰', fake:true, imitates:'donguri-bank.example' },
};
const REAL_HOSTS = ['donguri-bank.example', 'neko-shop.example'];
const USER = 'tanuki';
const PASSWORDS = { weak:'donguri2024', strong:'q7#Lm2!vRz9@Tk4w' };
const PW_ITER = 20000;          // PBKDF2 rounds here (real services use more; it is kept small so the page stays quick)
/* A short list of guesses the thief tries first (like the top of a leaked-password list). */
const GUESSES = ['123456','password','qwerty','tanuki','tanuki123','donguri','donguri123','donguri2023','donguri2024','iloveyou','sakura','abc12345'];

const W = {
  mode:'passkey',               // 'passkey' | 'password'
  origin:'donguri-bank.example',// the page open in the browser
  strength:'weak',
  servers:{}, phone:null, thief:null, session:null, busy:false,
};

async function makeServer(host, pw){
  const salt = rand(16);
  return { host, challenge:null, users:{ [USER]: { pw:{ salt, iter:PW_ITER, hash: await pbkdf2(pw, salt, PW_ITER) }, pk:null } } };
}
async function resetWorld(){
  const pw = PASSWORDS[W.strength];
  W.servers = {};
  for (const h of REAL_HOSTS) W.servers[h] = await makeServer(h, pw);   // the same password at both sites (re-use)
  W.phone = { creds:[], holder:'you', pinTries:0, locked:false };
  W.thief = { loot:[], recorded:null, stoleDb:null, phone:false, active:false };
  W.session = null;
}

function originOf(host){ return 'https://' + host; }
/* Browser rule in create()/get(): rp.id must equal the page's domain or be a registrable suffix of it. */
function rpIdAllowed(pageHost, rpId){ return pageHost === rpId || pageHost.endsWith('.' + rpId); }
function clientDataJSON(type, challenge, host){
  return enc.encode(JSON.stringify({ type, challenge: b64url(challenge), origin: originOf(host), crossOrigin:false }));
}

/* COSE_Key for an EC2 P-256 public key, in CBOR: {1:2, 3:-7, -1:1, -2:x, -3:y} */
function coseKey(raw){
  const x = raw.slice(1,33), y = raw.slice(33,65);
  return cat(Uint8Array.of(0xa5, 0x01,0x02, 0x03,0x26, 0x20,0x01, 0x21,0x58,0x20), x, Uint8Array.of(0x22,0x58,0x20), y);
}

/* ---- server side ---- */
function newChallenge(host){ const s = W.servers[host]; s.challenge = rand(32); return s.challenge; }

function readClient(bytes){ try { return JSON.parse(dec.decode(bytes)); } catch (e) { return null; } }

async function serverFinishRegistration(host, r){
  const s = W.servers[host], cd = readClient(r.clientDataJSON), ad = parseAuthData(r.authData);
  const want = await sha256(host);
  const C = [
    { k:'type', label:'種類が「登録（webauthn.create）」', ok: !!cd && cd.type === 'webauthn.create' },
    { k:'challenge', label:'チャレンジが、いま出したものと同じ', ok: !!cd && !!s.challenge && cd.challenge === b64url(s.challenge) },
    { k:'origin', label:'ページの住所（origin）が ' + originOf(host), ok: !!cd && cd.origin === originOf(host), got: cd && cd.origin },
    { k:'rpid', label:'rpIdHash が SHA-256("' + host + '")', ok: same(ad.rpIdHash, want) },
    { k:'up', label:'UP: 人がその場にいた', ok: !!(ad.flags & FLAG.UP) },
    { k:'uv', label:'UV: 指紋・顔・PIN で本人を確かめた', ok: !!(ad.flags & FLAG.UV) },
  ];
  s.challenge = null;
  if (C.every(c => c.ok)){
    s.users[USER].pk = { credId:r.credId, pubRaw:r.pubRaw, pub: await importPub(r.pubRaw), count:ad.count, created:Date.now() };
    C.push({ k:'save', label:'公開鍵とID を保存した', ok:true });
  }
  return C;
}

async function serverVerifyAssertion(host, r){
  const s = W.servers[host], u = s.users[r.user || USER], pk = u && u.pk;
  const cd = readClient(r.clientDataJSON), ad = parseAuthData(r.authData);
  const want = await sha256(host);
  const known = !!pk && same(pk.credId, r.credId);
  const sigOk = known ? await verify(pk.pub, r.signature, cat(r.authData, await sha256(r.clientDataJSON))) : false;
  const C = [
    { k:'cred', label:'知っている鍵（登録された ID）', ok: known },
    { k:'type', label:'種類が「ログイン（webauthn.get）」', ok: !!cd && cd.type === 'webauthn.get' },
    { k:'challenge', label:'チャレンジが、いま出したものと同じ', ok: !!cd && !!s.challenge && cd.challenge === b64url(s.challenge) },
    { k:'origin', label:'ページの住所（origin）が ' + originOf(host), ok: !!cd && cd.origin === originOf(host), got: cd && cd.origin },
    { k:'rpid', label:'rpIdHash が SHA-256("' + host + '")', ok: same(ad.rpIdHash, want) },
    { k:'up', label:'UP: 人がその場にいた', ok: !!(ad.flags & FLAG.UP) },
    { k:'uv', label:'UV: 指紋・顔・PIN で本人を確かめた', ok: !!(ad.flags & FLAG.UV) },
    { k:'sig', label:'署名が、保存した公開鍵で正しい', ok: sigOk },
    { k:'count', label:'カウンターが前より大きい', ok: !!pk && (ad.count > pk.count || (ad.count === 0 && pk.count === 0)), got: ad.count, had: pk ? pk.count : null },
  ];
  if (!cd) C[1].why = C[2].why = C[3].why = 'clientDataJSON が JSON として読めない';
  s.challenge = null;                       // a challenge is used only once
  const ok = C.every(c => c.ok);
  if (ok) pk.count = ad.count;
  return { ok, checks:C };
}

async function serverCheckPassword(host, user, password){
  const u = W.servers[host].users[user];
  const h = u ? await pbkdf2(password, u.pw.salt, u.pw.iter) : null;
  const C = [
    { k:'user', label:'その名前の人がいる', ok: !!u },
    { k:'pw', label:'送られたパスワードから作ったハッシュが、保存したハッシュと同じ', ok: !!u && same(h, u.pw.hash) },
  ];
  return { ok: C.every(c => c.ok), checks:C, hash:h };
}

/* ---- the phone (authenticator) ---- */
function credFor(rpId){ return W.phone.creds.find(c => c.rpId === rpId) || null; }

async function phoneMakeCredential(rpId, cdHash){
  const kp = await genKeyPair();
  const pubRaw = await exportPub(kp.publicKey);
  const credId = rand(16);
  const attested = cat(new Uint8Array(16), Uint8Array.of(0, credId.length), credId, coseKey(pubRaw));   // aaguid 0 (none) | L | credId | COSE key
  const authData = await makeAuthData(rpId, FLAG.UP | FLAG.UV | FLAG.BE | FLAG.BS | FLAG.AT, 0, attested);
  const old = W.phone.creds.findIndex(c => c.rpId === rpId);
  const cred = { rpId, user:USER, credId, priv:kp.privateKey, pubRaw, count:0 };
  if (old >= 0) W.phone.creds[old] = cred; else W.phone.creds.push(cred);
  return { credId, pubRaw, authData, cdHash };
}

async function phoneGetAssertion(rpId, clientData){
  const c = credFor(rpId);
  if (!c) return null;
  c.count += 1;
  const authData = await makeAuthData(rpId, FLAG.UP | FLAG.UV | FLAG.BE | FLAG.BS, c.count);
  const signed = cat(authData, await sha256(clientData));
  const signature = await sign(c.priv, signed);
  return { user:USER, credId:c.credId, authData, clientDataJSON:clientData, signature };
}
