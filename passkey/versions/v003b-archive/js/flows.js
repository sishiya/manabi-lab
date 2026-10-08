/* The ceremonies and the experiments, told in one short line per step. The cryptography underneath is real. */
'use strict';

const BANK = 'donguri-bank.example', SHOP = 'neko-shop.example', FAKE = 'donguri-bamk.example';
const realOf = h => SITES[h].fake ? SITES[h].imitates : h;

/* packet fields for the optional byte view */
const F = {
  chal: b => ({ label:'🎲 くじ（毎回ちがう数）', bytes:b }),
  name: h => ({ label:'🏷 宛名', text:h }),
  paper: b => ({ label:'📄 ブラウザが書いた紙（くじ・宛名）', bytes:b, text:dec.decode(b) }),
  auth: b => ({ label:'📄 スマホが書いた紙（宛名の印・本人確認・回数）', bytes:b }),
  sig: b => ({ label:'✍ サイン', bytes:b }),
  pub: b => ({ label:'🔓 公開鍵', bytes:b }),
  id: b => ({ label:'🔑 鍵の番号', bytes:b }),
  pw: t => ({ label:'🗝 合言葉', text:t }),
};

function goTo(h){ W.origin = h; ST.gateStop = null; ST.badges = null; W.thief.active = !!SITES[h].fake; renderAll(); }
function hasPk(h = BANK){ return !!W.servers[h].users[USER].pk && !!credFor(h); }

function pkBadges(C){
  const g = k => { const c = C.find(x => x.k === k); return c ? c.ok : true; };
  return [
    { icon:'🔑', label:'鍵', ok: g('cred') },
    { icon:'🎲', label:'くじ', ok: g('challenge') && g('count') },
    { icon:'🏷', label:'宛名', ok: g('type') && g('origin') && g('rpid') },
    { icon:'👆', label:'本人', ok: g('up') && g('uv') },
    { icon:'✍', label:'サイン', ok: g('sig') },
  ];
}
function regBadges(C){
  const g = k => C.find(x => x.k === k).ok;
  return [{ icon:'🎲', label:'くじ', ok:g('challenge') }, { icon:'🏷', label:'宛名', ok:g('type') && g('origin') && g('rpid') }, { icon:'👆', label:'本人', ok:g('up') && g('uv') }];
}
const pwBadges = C => [{ icon:'👤', label:'名前', ok:C[0].ok }, { icon:'🗝', label:'合言葉', ok:C[1].ok }];

/* ---------- make a passkey ---------- */
async function registerFlow(){
  const host = W.origin, fake = SITES[host].fake;
  ST.badges = null; ST.gateStop = null; renderAll();
  narr('パスキーを<b>作る</b>');
  await fly('gate', host, { icon:'✉', title:'作りたい' });
  const ch = fake ? rand(32) : newChallenge(host);
  await fly(host, 'gate', { icon:'🎲', title:'くじ', color:COL.chal, fields:[F.chal(ch), F.name(host)] });
  const cd = clientDataJSON('webauthn.create', ch, host);
  await fly('gate', 'phone', { icon:'🎲', title:'くじ＋宛名', color:COL.chal, fields:[F.paper(cd)] });
  phoneUI('ask', { text:'作りますか？', rpId:host });
  narr('スマホの <b>👆</b> を押して本人確認');
  await touch();
  phoneUI('work', { text:'鍵を2本つくる' });
  const r = await phoneMakeCredential(host, await sha256(cd));
  r.clientDataJSON = cd;
  phoneUI('ok', { text:'🔑 は金庫へ' });
  narr('鍵が<b>2本</b>。🔑 秘密鍵は金庫に、🔓 公開鍵はサイトへ');
  await fly('phone', 'gate', { icon:'🔓', title:'公開鍵', color:COL.pub, fields:[F.pub(r.pubRaw), F.id(r.credId)] });
  await fly('gate', host, { icon:'🔓', title:'公開鍵', color:COL.pub, fields:[F.pub(r.pubRaw), F.id(r.credId), F.auth(r.authData), F.paper(cd)] });
  phoneUI('idle');
  if (fake){ loot('🔓', { bytes:r.pubRaw }); return false; }
  const ok = await showBadges(host, regBadges(await serverFinishRegistration(host, r)), '登録できた', '登録できない');
  renderAll();
  return ok;
}

/* ---------- log in with a passkey ---------- */
async function loginFlow(opt = {}){
  const host = W.origin, fake = SITES[host].fake, real = realOf(host);
  ST.badges = null; ST.gateStop = null; renderAll();
  narr('パスキーで<b>ログイン</b>');
  await fly('gate', host, { icon:'✉', title:'ログインしたい' });
  let ch, rpId = opt.rpId || host;
  if (fake && !opt.rpId){
    narr('にせものの裏で、<em>わるもの</em>が本物の銀行から<b>くじ</b>をもらう');
    await fly('thief', real, { icon:'✉', title:'ログインしたい', color:COL.bad });
    ch = newChallenge(real);
    await fly(real, 'thief', { icon:'🎲', title:'くじ', color:COL.chal, fields:[F.chal(ch)] });
    rpId = real;
  } else ch = fake ? rand(32) : newChallenge(host);
  await fly(host, 'gate', { icon:'🎲', title:'くじ', color:COL.chal, fields:[F.chal(ch), F.name(rpId)] });
  if (!rpIdAllowed(host, rpId)){
    ST.gateStop = `${tagOf(host)} が ${tagOf(rpId)} の鍵をほしがっている`;
    renderGate();
    narr('<em>ブラウザが止めた！</em> 宛名がちがう');
    return { blocked:true };
  }
  const cd = clientDataJSON('webauthn.get', ch, host);
  await fly('gate', 'phone', { icon:'🎲', title:'くじ＋宛名', color:COL.chal, fields:[F.paper(cd)] });
  if (!credFor(rpId)){ phoneUI('err', { text:'この宛名の鍵はない' }); return { nokey:true }; }
  phoneUI('ask', { text:'ログインしますか？', rpId });
  narr(W.phone.holder === 'thief' ? '<em>わるもの</em>として <b>👆</b> を押してみる' : 'スマホの <b>👆</b> を押して本人確認');
  await touch();
  if (W.phone.holder === 'thief'){ phoneUI('err', { text:'指がちがう' }); return { denied:true }; }
  phoneUI('work', { text:'🔑 でサイン' });
  const r = await phoneGetAssertion(rpId, cd);
  phoneUI('ok', { text:'サインした' }); renderPhone();
  await fly('phone', 'gate', { icon:'✍', title:'サイン', color:COL.sig, fields:[F.sig(r.signature), F.auth(r.authData)] });
  // the copy that travels on (editing it in the tamper experiment leaves earlier packets as they were)
  const sent = { user:r.user, credId:r.credId.slice(), authData:r.authData.slice(), clientDataJSON:r.clientDataJSON.slice(), signature:r.signature.slice() };
  const pkt = { icon:'✍', title:'サイン', color:COL.sig, sent, fields:[F.sig(sent.signature), F.paper(sent.clientDataJSON), F.auth(sent.authData), F.id(sent.credId)] };
  await fly('gate', host, pkt, { pauseMid: opt.pauseMid });
  phoneUI('idle');
  if (opt.onSent) await opt.onSent(sent);
  if (fake) return { resp:sent };
  const res = await serverVerifyAssertion(host, sent);
  const ok = await showBadges(host, pkBadges(res.checks), 'ログインできた', 'はじかれた');
  renderAll();
  return { ok, resp:sent };
}

/* ---------- log in with a password ---------- */
async function pwLoginFlow(opt = {}){
  const host = W.origin, fake = SITES[host].fake, pw = PASSWORDS[W.strength];
  ST.badges = null; ST.gateStop = null; renderAll();
  narr('合言葉を<b>そのまま</b>送る');
  await fly('gate', host, { icon:'🗝', title:pw, color:COL.pw, fields:[F.pw(pw)] });
  if (opt.onSent) await opt.onSent(pw);
  if (fake){ loot('🗝', { text:pw }); return { stolen:true }; }
  const res = await serverCheckPassword(host, USER, pw);
  const ok = await showBadges(host, pwBadges(res.checks), 'ログインできた', 'はじかれた');
  renderAll();
  return { ok };
}
async function thiefPwLogin(host, pw){
  ST.badges = null;
  await fly('thief', host, { icon:'🗝', title:pw, color:COL.bad, fields:[F.pw(pw)] });
  const res = await serverCheckPassword(host, USER, pw);
  return showBadges(host, pwBadges(res.checks), 'わるものが入った', 'はじかれた');
}
/* the thief asks for a new challenge and sends a response (fixed, or made from the challenge) */
async function thiefPkTry(host, r, title){
  ST.badges = null; renderSites();
  await fly('thief', host, { icon:'✉', title:'ログインしたい', color:COL.bad });
  const ch = newChallenge(host);
  await fly(host, 'thief', { icon:'🎲', title:'くじ', color:COL.chal, fields:[F.chal(ch)] });
  const rr = typeof r === 'function' ? await r(ch) : r;
  await fly('thief', host, { icon:'✍', title, color:COL.bad, fields:[F.sig(rr.signature), F.paper(rr.clientDataJSON), F.auth(rr.authData)] });
  const res = await serverVerifyAssertion(host, rr);
  return showBadges(host, pkBadges(res.checks), 'わるものが入った', 'はじかれた');
}

/* ---------- helpers ---------- */
async function ensurePasskey(){
  if (hasPk()) return;
  goTo(BANK);
  await want('gMake', 'まず銀行に<b>パスキーを作る</b>');
  await registerFlow();
  await sleep(700);
}
function calm(){ W.thief.active = false; W.thief.guesses = null; W.phone.holder = 'you'; ST.gateStop = null; ST.badges = null; phoneUI('idle'); renderAll(); }

/* every experiment returns 'safe' or 'hit' (or nothing if it was left half way) */
const EXP = {};

EXP.basic = async () => {
  calm(); goTo(BANK);
  if (W.mode === 'password'){
    await want('gLogin', '<b>ログイン</b>を押す');
    const r = await pwLoginFlow();
    if (r.ok){ narr('入れた。でも<b>合言葉そのもの</b>が相手に届いた'); return 'done'; }
    return;
  }
  if (!hasPk()){ await want('gMake', 'まず<b>🔑 作る</b>を押す'); if (!await registerFlow()) return; await sleep(900); }
  await want('gLogin', 'こんどは<b>ログイン</b>を押す');
  const r = await loginFlow();
  if (r.ok){ narr('<strong>入れた。</strong> 届いたのは<b>サイン</b>だけ。🔑 も指紋もスマホの中'); return 'done'; }
};

EXP.phish = async () => {
  calm();
  if (W.mode === 'password'){
    goTo(FAKE);
    await want('gLogin', 'にせもの銀行に来てしまった。<b>ログイン</b>を押す');
    await pwLoginFlow();
    narr('<em>合言葉を取られた</em>');
    await sleep(900);
    const ok = await thiefPwLogin(BANK, PASSWORDS[W.strength]);
    if (ok){ narr('<em>本物の銀行に入られた</em>'); return 'hit'; }
    return 'safe';
  }
  await ensurePasskey();
  goTo(FAKE);
  await want('gLogin', 'にせもの銀行に来てしまった。<b>ログイン</b>を押す');
  const r = await loginFlow();
  if (!r.blocked) return;
  const i = await ask('<em>ブラウザが止めた！</em> にせものは本物の鍵を頼めない。では自分の宛名で頼んだら？', ['ためす', 'おわる']);
  if (i === 0){
    const r2 = await loginFlow({ rpId:FAKE });
    if (r2.nokey) narr('<strong>スマホに、にせもの宛ての鍵はない。</strong> 見分けなくても守れる');
  } else narr('<strong>守れた。</strong> 見分けなくても、しくみで止まる');
  return 'safe';
};

EXP.leak = async () => {
  calm(); goTo(BANK);
  if (W.mode === 'password'){
    const i = await ask('合言葉の強さは？', ['弱い（donguri2024）', '強い（でたらめ16文字）']);
    const s = i === 0 ? 'weak' : 'strong';
    if (s !== W.strength){ W.strength = s; for (const h of REAL_HOSTS){ const n = await makeServer(h, PASSWORDS[s]); W.servers[h].users[USER].pw = n.users[USER].pw; } renderSites(); }
    W.thief.active = true;
    const u = W.servers[BANK].users[USER];
    narr('<em>台帳が盗まれた</em>');
    await fly(BANK, 'thief', { icon:'🗄', title:'台帳', color:COL.bad, fields:[{ label:'ソルト', bytes:u.pw.salt }, { label:'🗝 合言葉の模様（ハッシュ）', bytes:u.pw.hash }] });
    loot('🗝', { bytes:u.pw.hash });
    narr('よくある合言葉を<b>同じ計算</b>にかけて、模様をくらべる');
    W.thief.guesses = GUESSES.map(w => ({ w, s:'' }));
    renderThief();
    let found = null;
    for (const g of W.thief.guesses){
      const hit = same(await pbkdf2(g.w, u.pw.salt, u.pw.iter), u.pw.hash);
      g.s = hit ? 'hit' : 'x'; renderThief();
      await sleep(220);
      if (hit){ found = g.w; break; }
    }
    if (!found){ narr('<strong>当たらない。</strong> でたらめな合言葉は当てにくい'); return 'safe'; }
    const ok = await thiefPwLogin(BANK, found);
    if (ok){ narr('<em>当てられて、入られた</em>'); return 'hit'; }
    return 'safe';
  }
  await ensurePasskey(); goTo(BANK);
  W.thief.active = true;
  const pk = W.servers[BANK].users[USER].pk;
  narr('<em>台帳が盗まれた</em>');
  await fly(BANK, 'thief', { icon:'🗄', title:'台帳', color:COL.bad, fields:[F.pub(pk.pubRaw), F.id(pk.credId)] });
  loot('🔓', { bytes:pk.pubRaw });
  await ask('取られたのは 🔓 <b>公開鍵だけ</b>。にせのサインを作ってみる？', ['ためす']);
  const ok = await thiefPkTry(BANK, async ch => {
    const kp = await genKeyPair();
    const cd = clientDataJSON('webauthn.get', ch, BANK);
    const ad = await makeAuthData(BANK, FLAG.UP | FLAG.UV, pk.count + 1);
    return { user:USER, credId:pk.credId, authData:ad, clientDataJSON:cd, signature: await sign(kp.privateKey, cat(ad, await sha256(cd))) };
  }, 'にせサイン');
  if (!ok){ narr('<strong>はじかれた。</strong> 🔓 からは 🔑 を作れない'); return 'safe'; }
  return 'hit';
};

EXP.replay = async () => {
  calm(); goTo(BANK);
  W.thief.active = true; renderThief();
  if (W.mode === 'password'){
    await want('gLogin', 'わるものが<b>のぞき見</b>している。<b>ログイン</b>を押す');
    await pwLoginFlow({ onSent: async pw => loot('🗝', { text:pw }) });
    await ask('のぞき見した合言葉を、次の日に使うと？', ['次の日へ']);
    const ok = await thiefPwLogin(BANK, PASSWORDS[W.strength]);
    if (ok){ narr('<em>入られた。</em> 合言葉は毎回同じ'); return 'hit'; }
    return 'safe';
  }
  await ensurePasskey(); goTo(BANK);
  W.thief.active = true; renderThief();
  let rec = null;
  await want('gLogin', 'わるものが<b>のぞき見</b>している。<b>ログイン</b>を押す');
  const r = await loginFlow({ onSent: async s => { rec = s; loot('✍', { bytes:s.signature }); } });
  if (!r.ok || !rec) return;
  await ask('のぞき見したサインを、次の日に使うと？', ['次の日へ']);
  const ok = await thiefPkTry(BANK, rec, '前のサイン');
  if (!ok){ narr('<strong>はじかれた。</strong> くじが毎回ちがうので、前のサインは使えない'); return 'safe'; }
  return 'hit';
};

EXP.tamper = async () => {
  calm(); await ensurePasskey(); goTo(BANK);
  W.thief.active = true; renderThief();
  let changed = false;
  await want('gLogin', 'わるものが途中で<b>書きかえる</b>。<b>ログイン</b>を押す');
  const r = await loginFlow({ pauseMid: async pkt => {
    const i = await ask('<em>止められた！</em> 中身を1文字かえて送る？', ['✏️ 1文字かえる', 'そのまま']);
    if (i === 0){ const p = pkt.sent.clientDataJSON; const k = dec.decode(p).indexOf('"challenge":"') + 13; p[k] ^= 1; changed = true; }
  } });
  if (r.ok === false && changed){ narr('<strong>はじかれた。</strong> 1文字でもかえるとサインが合わない'); return 'safe'; }
  if (r.ok) narr('かえなかったので入れた。もう一度ためそう');
};

EXP.lost = async () => {
  calm(); await ensurePasskey(); goTo(BANK);
  W.phone.holder = 'thief'; W.thief.active = true; phoneUI('idle'); renderAll();
  await want('gLogin', 'スマホを<em>わるものが拾った</em>。わるものとして<b>ログイン</b>を押す');
  const r = await loginFlow();
  if (!r.denied) return;
  await ask('<em>指がちがう。</em> では金庫から 🔑 を取り出せる？', ['こじあける']);
  let ok = false;
  try { await crypto.subtle.exportKey('pkcs8', W.phone.creds[0].priv); ok = true; } catch (e) {}
  phoneUI('err', { text: ok ? '取り出せた' : '取り出せない' });
  narr(ok ? '取り出せてしまった' : '<strong>開かない。</strong> 🔑 は取り出せない作り（このページでも本当にためした）');
  await ask('スマホを取りもどす', ['もどす']);
  calm();
  narr('新しいスマホでは、同期したパスキーが使える');
  return ok ? 'hit' : 'safe';
};

EXP.second = async () => {
  calm();
  if (W.mode === 'password'){
    goTo(SHOP);
    await want('gLogin', 'ねこ商店にも<b>同じ合言葉</b>でログイン');
    const r = await pwLoginFlow();
    if (!r.ok) return;
    await ask('ねこ商店が<em>悪いお店</em>だったら？', ['ためす']);
    W.thief.active = true; loot('🗝', { text:PASSWORDS[W.strength] });
    const ok = await thiefPwLogin(BANK, PASSWORDS[W.strength]);
    if (ok){ narr('<em>銀行にも入られた。</em> 使い回しは広がる'); return 'hit'; }
    return 'safe';
  }
  await ensurePasskey();
  goTo(SHOP);
  if (!hasPk(SHOP)){ await want('gMake', 'ねこ商店にも<b>🔑 作る</b>'); if (!await registerFlow()) return; await sleep(700); }
  await want('gLogin', '金庫に<b>サイトごとの鍵</b>ができた。ねこ商店に<b>ログイン</b>');
  let got = null;
  const r = await loginFlow({ onSent: async s => { got = s; } });
  if (!r.ok || !got) return;
  await ask('ねこ商店が<em>悪いお店</em>で、もらったサインを銀行に出したら？', ['ためす']);
  W.thief.active = true; loot('✍', { bytes:got.signature });
  const ok = await thiefPkTry(BANK, got, 'お店のサイン');
  if (!ok){ narr('<strong>はじかれた。</strong> 鍵も宛名もちがう'); return 'safe'; }
  return 'hit';
};
