/* The ceremonies (register / log in, with passwords and with passkeys) and the experiments built on them. */
'use strict';

/* ---- packet fields (what the inspector shows) ---- */
const F = {
  text:(label, text, note, cls) => ({ type:'text', label, text, note, cls }),
  chal:ch => ({ type:'hex', label:'チャレンジ', bytes:ch, cls:'seg3', note:'サーバーが毎回作る、でたらめな 32 バイト。仕様は 16 バイト以上を勧めている。' }),
  client:cd => ({ type:'json', label:'clientDataJSON（ブラウザが書いた紙）', bytes:cd, note:'種類・チャレンジ・いま開いているページの住所（origin）。ブラウザが書くので、ページはごまかせない。' }),
  hash:(label, h, note) => ({ type:'hex', label, bytes:h, cls:'seg5', note }),
  auth:ad => ({ type:'auth', label:'authenticatorData（スマホが書いた紙）', bytes:ad, note:'どのサイトの鍵か（rpIdHash）・フラグ・回数。登録のときは公開鍵もつく。' }),
  sig:s => ({ type:'hex', label:'署名（ECDSA P-256）', bytes:s, cls:'seg4', note:'authenticatorData と「紙のハッシュ」をつないだものに、秘密鍵で作った署名。r と s の 32 バイトずつ。' }),
  pub:p => ({ type:'pub', label:'公開鍵（P-256 の点）', bytes:p, note:'04 のあとに x と y が 32 バイトずつ。渡しても困らない鍵。' }),
  cred:id => ({ type:'hex', label:'鍵の ID（credential ID）', bytes:id, cls:'seg5', note:'どの鍵かを見分ける番号。スマホが作る 16 バイト。' }),
};

const realOf = h => SITES[h].fake ? SITES[h].imitates : h;
const srvOf = h => SITES[h].fake ? 'thief' : 'server';
function setOrigin(h){ W.origin = h; ST.pageMsg = ''; ST.pwTyped = false; ST.viewHost = realOf(h); W.session = null; renderAll(); }
function hasPk(h = 'donguri-bank.example'){ return !!W.servers[h].users[USER].pk && !!credFor(h); }
const pageBtn = id => () => $(id);

/* ---------- registration ---------- */
async function registerFlow(){
  const host = W.origin, site = SITES[host], srv = srvOf(host);
  ST.checks = null; ST.pageMsg = ''; renderAll();
  narr('<b>パスキーを作る</b>: ブラウザがサイトに頼みます。');
  await fly('browser', srv, { title:'パスキーを作りたい', fields:[F.text('ユーザー名', USER)] });
  const ch = site.fake ? rand(32) : newChallenge(host);
  renderServer();
  await fly(srv, 'browser', { title:'登録のお願い', icon:'🎲', color:COL.chal,
    fields:[F.text('rp.id（サイトの名前）', host), F.text('user（ユーザー名）', USER), F.text('使う方式', 'ES256 = ECDSA P-256 + SHA-256（COSE の番号 −7）'), F.chal(ch)] });
  const cd = clientDataJSON('webauthn.create', ch, host), h = await sha256(cd);
  narr(`ブラウザが確かめる: 頼まれた名前 <span class="mono">${esc(host)}</span> は、いま開いているページと同じ → OK。チャレンジとページの住所を紙（clientDataJSON）に書き、スマホに頼みます。`);
  await fly('browser', 'phone', { title:'鍵を作って', fields:[F.text('rp.id', host), F.client(cd), F.hash('紙のハッシュ SHA-256', h, 'スマホに渡すのは紙そのものではなく、このハッシュ。')] });
  phoneUI('ask', { verb:'パスキーを作りますか？', rpId:host });
  narr('<b>スマホの指紋センサーを長押し</b>して、本人だと確かめてください（指紋はスマホの中だけで照合され、外には出ません）。');
  await touchFinger();
  phoneUI('work', { text:'鍵の組を作っています' });
  const r = await phoneMakeCredential(host, h);
  r.clientDataJSON = cd;
  phoneUI('ok', { text:'秘密鍵を金庫にしまいました' });
  await fly('phone', 'browser', { title:'公開鍵', icon:'🔓', color:COL.pub, fields:[F.cred(r.credId), F.pub(r.pubRaw), F.auth(r.authData)] });
  await fly('browser', srv, { title:'公開鍵＋紙', icon:'🔓', color:COL.pub, fields:[F.cred(r.credId), F.pub(r.pubRaw), F.auth(r.authData), F.client(cd)] });
  phoneUI('idle');
  if (site.fake){ loot('偽サイト用の公開鍵', short(r.pubRaw, 6), 'pub'); return false; }
  const ok = await showChecks('登録の確認（サーバー）', await serverFinishRegistration(host, r), '登録できました', '登録できません');
  renderBrowser();
  if (ok) narr('できました。スマホには<b>秘密鍵</b>（金庫の中）、サイトには<b>公開鍵</b>。サイトは秘密鍵を一度も見ていません。');
  return ok;
}

/* ---------- passkey login ---------- */
async function loginFlow(opt = {}){
  const host = W.origin, site = SITES[host], srv = srvOf(host), real = realOf(host);
  ST.checks = null; ST.pageMsg = ''; renderAll();
  narr('<b>パスキーでログイン</b>: ブラウザがサイトに伝えます。');
  await fly('browser', srv, { title:'ログインしたい', fields:[F.text('ユーザー名', USER)] });
  let ch, rpId = opt.rpId || host;
  if (site.fake && !opt.rpId){
    W.thief.active = true; renderThief();
    narr('偽サイトの裏で、<em>わるもの</em>は本物の銀行に「tanuki です」とログインを始め、本物のチャレンジをもらいます。それをあなたに署名させるつもりです。');
    await fly('thief', 'server', { title:'ログインしたい（あなたのふり）', color:COL.bad, fields:[F.text('ユーザー名', USER)] });
    ch = newChallenge(real); renderServer();
    await fly('server', 'thief', { title:'チャレンジ', icon:'🎲', color:COL.chal, fields:[F.text('rp.id', real), F.chal(ch)] });
    rpId = real;
  } else ch = site.fake ? rand(32) : newChallenge(host);
  renderServer();
  await fly(srv, 'browser', { title:'チャレンジ', icon:'🎲', color:COL.chal, fields:[F.text('rp.id（どのサイトの鍵か）', rpId), F.chal(ch)] });
  if (!rpIdAllowed(host, rpId)){
    ST.pageMsg = 'このページでは、その鍵は使えません';
    renderBrowser();
    narr(`<em>ブラウザが止めました。</em> いま開いているページは <span class="mono">${esc(host)}</span> なのに、<span class="mono">${esc(rpId)}</span> の鍵を頼んでいます。ページは<b>自分の住所の鍵しか頼めない</b>決まりなので、スマホには何も届きません。`);
    return { blocked:true };
  }
  const cd = clientDataJSON('webauthn.get', ch, host);
  await fly('browser', 'phone', { title:'署名して', fields:[F.text('rp.id', rpId), F.client(cd), F.hash('紙のハッシュ SHA-256', await sha256(cd))] });
  if (!credFor(rpId)){
    phoneUI('err', { text:'このサイトのパスキーはありません', site:rpId });
    return { nokey:true };
  }
  phoneUI('ask', { verb:'ログインしますか？', rpId });
  narr(W.phone.holder === 'thief' ? '<b>わるものになって</b>、指紋センサーを長押ししてみてください。'
    : '<b>指紋センサーを長押し</b>してください。スマホは、どのサイトのログインかを画面に出してから署名します。');
  await touchFinger();
  if (W.phone.holder === 'thief'){ phoneUI('err', { text:'指紋が合いません' }); return { denied:true }; }
  phoneUI('work', { text:'秘密鍵で署名しています' });
  const r = await phoneGetAssertion(rpId, cd);
  phoneUI('ok', { text:'署名しました' });
  renderPhone();
  await fly('phone', 'browser', { title:'署名', icon:'✍', color:COL.sig, fields:[F.cred(r.credId), F.auth(r.authData), F.sig(r.signature)] });
  // the copy that travels on (so editing it in the tamper experiment does not change the earlier packets)
  const sent = { user:r.user, credId:r.credId.slice(), authData:r.authData.slice(), clientDataJSON:r.clientDataJSON.slice(), signature:r.signature.slice() };
  const pkt = { title:'署名つきの返事', icon:'✍', color:COL.sig, fields:[F.cred(sent.credId), F.client(sent.clientDataJSON), F.auth(sent.authData), F.sig(sent.signature)] };
  await fly('browser', srv, pkt, { pauseMid: opt.pauseMid });
  phoneUI('idle');
  if (opt.onSent) await opt.onSent(sent);
  if (site.fake) return { resp:sent };
  const res = await serverVerifyAssertion(host, sent);
  const ok = await showChecks('ログインの確認（サーバー）', res.checks, 'ログインできました', 'ログインできません');
  if (ok){ W.session = { host, how:'passkey', by:'you' }; }
  renderAll();
  return { ok, resp:sent, checks:res.checks };
}

/* ---------- password login ---------- */
function typePassword(){ ST.pwTyped = true; ST.pageMsg = ''; renderBrowser(); }
async function pwLoginFlow(opt = {}){
  const host = W.origin, site = SITES[host], srv = srvOf(host), pw = PASSWORDS[W.strength];
  ST.checks = null; ST.pageMsg = ''; renderAll();
  await fly('browser', srv, { title:'名前＋パスワード', icon:'🔤', color:COL.pw,
    fields:[F.text('ユーザー名', USER), F.text('パスワード', pw, 'https の暗号に包まれて届くが、包みを開けるサイトには<b>そのまま</b>届く。', 'pw')] }, { pauseMid: opt.pauseMid });
  if (opt.onSent) await opt.onSent(pw);
  if (site.fake){
    loot('パスワード', pw, 'pw');
    ST.pageMsg = 'パスワードがちがいます。もう一度お試しください'; ST.pwTyped = false; renderBrowser();
    return { stolen:true };
  }
  narr('サーバーは、届いたパスワードに保存しておいたソルトを混ぜて同じ計算（PBKDF2）をし、保存したハッシュとくらべます。');
  const res = await serverCheckPassword(host, USER, pw);
  const ok = await showChecks('ログインの確認（サーバー）', res.checks, 'ログインできました', 'ログインできません');
  ST.pwTyped = false;
  if (ok) W.session = { host, how:'password', by:'you' };
  renderAll();
  return { ok };
}

/* the thief logs in somewhere with a password it has */
async function thiefPwLogin(host, pw){
  ST.viewHost = host; ST.checks = null; renderServer();
  await fly('thief', 'server', { title:'名前＋パスワード', icon:'🔤', color:COL.bad, fields:[F.text('ユーザー名', USER), F.text('パスワード', pw, '', 'pw')] });
  const res = await serverCheckPassword(host, USER, pw);
  return showChecks('ログインの確認（サーバー）', res.checks, 'ログインできました（わるものが）', 'ログインできません');
}

/* ---------- helpers for experiments ---------- */
async function ensurePasskey(){
  if (hasPk()) return;
  setOrigin('donguri-bank.example');
  await want(pageBtn('pgReg'), 'この実験には、まず<b>どんぐり銀行のパスキー</b>が必要です。ブラウザの中のサイトで「パスキーを作る」を押してください。');
  await registerFlow();
  await sleep(900);
}
function setMode(m){ W.mode = m; syncControls(); renderAll(); }
async function needPk(){
  if (W.mode === 'passkey') return true;
  await ask('この実験は<b>パスキーだけ</b>です（パスワードには署名がないので、くらべるものがありません）。', ['パスキーに切りかえる']);
  setMode('passkey');
  return true;
}
function calm(){ W.thief.active = false; W.phone.holder = 'you'; ST.browserOwner = 'you'; renderAll(); }

/* ---------- experiments ---------- */
const EXP = {};

EXP.basic = async () => {
  calm(); setOrigin('donguri-bank.example');
  if (W.mode === 'password'){
    await want(pageBtn('pgPw'), '<b>パスワード</b>の欄を押して入力してください（例のパスワードが入ります）。');
    typePassword();
    await want(pageBtn('pgLogin'), '「ログイン」を押してください。');
    const r = await pwLoginFlow();
    if (r.ok) narr('ログインできました。でも、<b>パスワードそのもの</b>がサーバーまで届いたことに注目。左下の記録の小包を押すと、中身が見えます。');
    return;
  }
  if (!hasPk()){
    await want(pageBtn('pgReg'), 'まず<b>パスキーを作り</b>ます。ブラウザの中のサイトで「パスキーを作る」を押してください。');
    if (!await registerFlow()) return;
    await sleep(1200);
  }
  await want(pageBtn('pgLogin'), 'こんどは「🔑 パスキーでログイン」を押してください。');
  const r = await loginFlow();
  if (r.ok){
    quest('login');
    narr('<strong>ログインできました。</strong> 行き来したのは、チャレンジ・紙・署名・公開鍵だけ。<b>秘密も指紋も、スマホの外に出ていません</b>。記録の小包を押して中身を見てみましょう。');
  }
};

EXP.phish = async () => {
  calm();
  if (W.mode === 'password'){
    setOrigin('donguri-bamk.example'); W.thief.active = true; renderThief();
    await want(pageBtn('pgPw'), 'メールのリンクから、本物そっくりのページに来てしまいました。住所をよく見ると <span class="mono">donguri-ba<em>m</em>k</span>。気づかずに<b>パスワード</b>の欄を押します。');
    typePassword();
    await want(pageBtn('pgLogin'), '「ログイン」を押してください。');
    await pwLoginFlow();
    narr('<em>パスワードを盗まれました。</em> 偽サイトは「ちがいます」と言ってごまかします。わるものはそのパスワードで本物の銀行へ…');
    await sleep(1600);
    const ok = await thiefPwLogin('donguri-bank.example', PASSWORDS[W.strength]);
    if (ok){ quest('phish-pw'); narr('<em>わるものが、あなたとして本物の銀行に入りました。</em> パスワードは「打ちこんだ相手」が本物かどうかを、人が見分けるしかありません。同じことを<b>パスキー</b>でも試してみましょう。'); }
    return;
  }
  await ensurePasskey();
  setOrigin('donguri-bamk.example'); W.thief.active = true; renderThief();
  await want(pageBtn('pgLogin'), 'メールのリンクから、本物そっくりのページに来てしまいました（住所は <span class="mono">donguri-ba<em>m</em>k</span>）。気づかずに「🔑 パスキーでログイン」を押します。');
  const r = await loginFlow();
  if (!r.blocked) return;
  quest('phish-pk');
  const i = await ask('<em>ブラウザが止めました。</em> 偽サイトは本物の銀行の鍵を頼めません。では、わるものが<b>偽サイト自身の名前</b>で頼んだら？', ['ためす', 'ここでやめる']);
  if (i !== 0) return;
  ST.pageMsg = ''; renderBrowser();
  const r2 = await loginFlow({ rpId:'donguri-bamk.example' });
  if (r2.nokey) narr('スマホには <span class="mono">donguri-bamk.example</span> の鍵がないので、何も署名しません。もしここで新しく作っても、それは偽サイト用の別の鍵で、本物の銀行では使えません。しかも署名の紙には偽サイトの住所が書かれます。<strong>人が見分けなくても、しくみで止まります。</strong>');
};

EXP.leak = async () => {
  calm(); setOrigin('donguri-bank.example');
  if (W.mode === 'password'){
    const i = await ask('サーバーのデータベースが盗まれる実験です。あなたのパスワードは？', ['弱い（donguri2024）', '強い（16文字のでたらめ）']);
    const s = i === 0 ? 'weak' : 'strong';
    if (s !== W.strength){ W.strength = s; for (const h of REAL_HOSTS){ const n = await makeServer(h, PASSWORDS[s]); W.servers[h].users[USER].pw = n.users[USER].pw; } renderServer(); }
    W.thief.active = true; renderThief();
    const u = W.servers['donguri-bank.example'].users[USER];
    narr('<em>サーバーが乗っ取られ、データベースがコピーされました。</em>');
    await fly('server', 'thief', { title:'データベースのコピー', icon:'🗄', color:COL.bad, fields:[F.text('ユーザー名', USER), F.hash('ソルト', u.pw.salt), F.hash('パスワードのハッシュ（PBKDF2）', u.pw.hash, 'ここからパスワードを逆算する式はない。でも「ためしに計算してくらべる」ことはできる。')] });
    loot('ハッシュ', short(u.pw.hash, 6), 'pw');
    let found = null; const tried = [];
    for (const g of GUESSES){
      const h = await pbkdf2(g, u.pw.salt, u.pw.iter);
      const hit = same(h, u.pw.hash);
      tried.push(hit ? `<strong>${esc(g)} ✓</strong>` : `${esc(g)} ✕`);
      narr('わるものは、よく使われるパスワードを1つずつ同じ計算にかけて、ハッシュをくらべます（本物の PBKDF2 の計算）: ' + tried.join('、'));
      await sleep(260);
      if (hit){ found = g; break; }
    }
    if (found){
      loot('パスワード', found, 'pw');
      const ok = await thiefPwLogin('donguri-bank.example', found);
      if (ok){ quest('leak-pw'); narr(`<em>当てられました。</em> 「${esc(found)}」は、名前・サイト名・年の組み合わせで、ためす順番の早いほうにあります。わるものはこのパスワードでログインでき、<b>同じパスワードを使っているほかのサイト</b>にも入れます。`); }
    } else narr('よく使われるパスワードでは当たりません。16文字のでたらめを全部ためすのは、事実上むりです。ただし、そのパスワードを<b>偽サイトに打ちこめば</b>（実験2）強さは関係ありません。パスキーでも試してみましょう。');
    return;
  }
  await ensurePasskey();
  setOrigin('donguri-bank.example');
  W.thief.active = true; renderThief();
  const pk = W.servers['donguri-bank.example'].users[USER].pk;
  narr('<em>サーバーが乗っ取られ、データベースがコピーされました。</em>');
  await fly('server', 'thief', { title:'データベースのコピー', icon:'🗄', color:COL.bad, fields:[F.text('ユーザー名', USER), F.cred(pk.credId), F.pub(pk.pubRaw), F.text('回数', String(pk.count))] });
  loot('公開鍵', short(pk.pubRaw, 6), 'pub');
  await ask('わるものが手に入れたのは<b>公開鍵だけ</b>。署名を作るには秘密鍵がいります。わるものが自分で鍵を作って、うその署名を送ってみると？', ['ためす']);
  narr('わるものは本物の銀行にログインを始め、チャレンジをもらいます。');
  await fly('thief', 'server', { title:'ログインしたい（あなたのふり）', color:COL.bad, fields:[F.text('ユーザー名', USER)] });
  const host = 'donguri-bank.example', ch = newChallenge(host); renderServer();
  await fly('server', 'thief', { title:'チャレンジ', icon:'🎲', color:COL.chal, fields:[F.chal(ch)] });
  const kp = await genKeyPair();
  const cd = clientDataJSON('webauthn.get', ch, host);
  const ad = await makeAuthData(host, FLAG.UP | FLAG.UV, pk.count + 1);
  const sig = await sign(kp.privateKey, cat(ad, await sha256(cd)));
  const r = { user:USER, credId:pk.credId, authData:ad, clientDataJSON:cd, signature:sig };
  narr('わるものは、紙もフラグも回数も<b>本物そっくりに</b>書き、盗んだ鍵の ID をつけ、<b>自分の秘密鍵</b>で署名しました。');
  await fly('thief', 'server', { title:'うその署名', icon:'✍', color:COL.bad, fields:[F.cred(pk.credId), F.client(cd), F.auth(ad), F.sig(sig)] });
  const res = await serverVerifyAssertion(host, r);
  const ok = await showChecks('ログインの確認（サーバー）', res.checks, 'ログインできました', 'ログインできません');
  if (!ok){ quest('leak-pk'); narr('<strong>はじかれました。</strong> ほかはすべて本物そっくりでも、<b>署名</b>だけは保存した公開鍵と合いません。公開鍵からは秘密鍵を計算できないので、データベースを盗まれても、パスキーではログインされません。'); }
};

EXP.replay = async () => {
  calm(); setOrigin('donguri-bank.example');
  if (W.mode === 'password'){
    W.thief.active = true; renderThief();
    await want(pageBtn('pgPw'), 'わるものが通信を記録しています（本物は https で暗号化されているので、<b>読めてしまったと仮定</b>します）。パスワードの欄を押して入力してください。');
    typePassword();
    await want(pageBtn('pgLogin'), '「ログイン」を押してください。');
    await pwLoginFlow({ onSent: async pw => { loot('記録したパスワード', pw, 'pw'); } });
    await ask('ログインできました。わるものは、記録したものをそのまま送ってみます。', ['次の日へ']);
    W.session = null; renderBrowser();
    const ok = await thiefPwLogin('donguri-bank.example', PASSWORDS[W.strength]);
    if (ok) narr('<em>入られました。</em> パスワードは毎回同じなので、一度見られたら何度でも使えます。パスキーでも試してみましょう。');
    return;
  }
  await ensurePasskey();
  setOrigin('donguri-bank.example');
  W.thief.active = true; renderThief();
  let rec = null;
  await want(pageBtn('pgLogin'), 'わるものが通信を記録しています（本物は https で読めないので、<b>読めてしまったと仮定</b>）。「🔑 パスキーでログイン」を押してください。');
  const r = await loginFlow({ onSent: async resp => { rec = resp; loot('記録した返事', '署名 ' + short(resp.signature, 6), 'sig'); } });
  if (!r.ok || !rec) return;
  await ask('ログインできました。わるものは、記録した<b>署名つきの返事</b>をそのまま送ってみます。', ['次の日へ']);
  W.session = null; renderBrowser(); ST.checks = null; renderServer();
  await fly('thief', 'server', { title:'ログインしたい（あなたのふり）', color:COL.bad, fields:[F.text('ユーザー名', USER)] });
  const ch = newChallenge('donguri-bank.example'); renderServer();
  await fly('server', 'thief', { title:'チャレンジ（新しい）', icon:'🎲', color:COL.chal, fields:[F.chal(ch)] });
  await fly('thief', 'server', { title:'記録した返事', icon:'✍', color:COL.bad, fields:[F.cred(rec.credId), F.client(rec.clientDataJSON), F.auth(rec.authData), F.sig(rec.signature)] });
  const res = await serverVerifyAssertion('donguri-bank.example', rec);
  const ok = await showChecks('ログインの確認（サーバー）', res.checks, 'ログインできました', 'ログインできません');
  if (!ok){ quest('replay-pk'); narr('<strong>はじかれました。</strong> 署名そのものは正しい（✓）のに、<b>チャレンジ</b>が今日のものとちがい、<b>回数</b>も前と同じ。署名は「その1回のチャレンジ」にしか使えません。'); }
};

EXP.tamper = async () => {
  calm(); await needPk(); await ensurePasskey();
  setOrigin('donguri-bank.example');
  W.thief.active = true; renderThief();
  let changed = 0;
  await want(pageBtn('pgLogin'), 'わるものが、届く途中の小包を<b>書きかえる</b>実験です。「🔑 パスキーでログイン」を押してください。');
  const r = await loginFlow({ pauseMid: pkt => waitable(res => {
    showPacket(pkt, n => { changed = n; });
    narr('<em>小包が途中で止まりました。</em> 下の「中身を見る」で、<b>どれかのバイトを押して書きかえて</b>から送ってください（何もかえずに送ってもかまいません）。', [
      { label:'このまま送る', cls:'go', fn: () => res() },
    ]);
    if (ST.auto){ editByte(pkt, 3, 40); changed = 1; res(); }
  }) });
  if (r.ok === false && changed){ quest('tamper'); narr('<strong>はじかれました。</strong> たった1バイトでも、署名した中身とちがえば、署名の確認で ✕ になります。紙の origin やチャレンジを書きかえた場合は、そちらの確認でも ✕ になります。'); }
  else if (r.ok) narr('何もかえなかったので、ログインできました。もう一度ためして、1バイトだけかえてみましょう。');
};

EXP.lost = async () => {
  calm(); await needPk(); await ensurePasskey();
  setOrigin('donguri-bank.example');
  W.phone.holder = 'thief'; ST.browserOwner = 'thief'; W.thief.active = true;
  phoneUI('idle'); renderAll();
  await want(pageBtn('pgLogin'), 'スマホを落とし、<em>わるもの</em>が拾いました。わるものは自分のパソコンで銀行を開きます。<b>わるものになって</b>「🔑 パスキーでログイン」を押してください。');
  const r = await loginFlow();
  if (!r.denied) return;
  await ask('<em>指紋が合いません。</em> 秘密鍵は、スマホの持ち主が指紋・顔・PIN で確かめたときだけ使えます。PIN を当ててみると？', ['PIN をためす']);
  const tries = ['0000', '1234', '1111', '2580', '0852'];
  const shown = [];
  for (const p of tries){ shown.push(p + ' ✕'); phoneUI('err', { text:'PIN がちがいます' }); narr('わるものは PIN をためします: ' + shown.join('、')); await sleep(380); }
  phoneUI('err', { text:'しばらく使えません' });
  await ask('何回かまちがえると、スマホはしばらく使えなくなり、さらに続けると消せるようにもできます（回数は機種しだい）。では、<b>金庫から秘密鍵を取り出せたら</b>？', ['取り出してみる']);
  let msg;
  try { await crypto.subtle.exportKey('pkcs8', W.phone.creds[0].priv); msg = '取り出せてしまった'; }
  catch (e) { msg = e.name; }
  quest('lost');
  narr(`このアプリでも、秘密鍵は<b>取り出せない設定</b>で作っています。いま本当に取り出そうとしたら、ブラウザが断りました（<span class="mono">${esc(msg)}</span>）。本物のスマホでは、秘密鍵は専用の守られた部品の中にあり、外へ読み出せません。あなたは新しいスマホで、同期されたパスキーを使えます。`);
  await ask('スマホを取りもどします。', ['もどす']);
  calm(); phoneUI('idle'); ST.checks = null; renderAll();
  narr('もとにもどしました。');
};

EXP.second = async () => {
  calm();
  if (W.mode === 'password'){
    setOrigin('neko-shop.example');
    await want(pageBtn('pgPw'), '2つめのサイト「ねこ商店」にも、<b>同じパスワード</b>でログインします。パスワードの欄を押してください。');
    typePassword();
    await want(pageBtn('pgLogin'), '「ログイン」を押してください。');
    const r = await pwLoginFlow();
    if (!r.ok) return;
    await ask('ねこ商店には、あなたのパスワードが<b>そのまま</b>届きました。もし、ねこ商店のサーバーが乗っ取られていたら？', ['ためす']);
    W.thief.active = true; renderThief();
    loot('ねこ商店で見たパスワード', PASSWORDS[W.strength], 'pw');
    const ok = await thiefPwLogin('donguri-bank.example', PASSWORDS[W.strength]);
    if (ok) narr('<em>銀行にも入られました。</em> パスワードは、ログインするたびに相手のサイトに渡すものなので、使い回すと、1つのサイトの事故がほかのサイトに広がります。');
    return;
  }
  await ensurePasskey();
  setOrigin('neko-shop.example');
  if (!hasPk('neko-shop.example')){
    await want(pageBtn('pgReg'), '2つめのサイト「ねこ商店」でも「パスキーを作る」を押してください。');
    if (!await registerFlow()) return;
    await sleep(800);
  }
  showKeysCompare();
  await want(pageBtn('pgLogin'), 'スマホの金庫に<b>サイトごとに別の鍵</b>ができました（下の「中身を見る」でくらべられます）。ねこ商店に「🔑 パスキーでログイン」してください。');
  let got = null;
  const r = await loginFlow({ onSent: async resp => { got = resp; } });
  if (!r.ok || !got) return;
  await ask('もし、ねこ商店が悪い店で、受け取った<b>署名つきの返事を銀行に送ったら</b>？', ['ためす']);
  W.thief.active = true; renderThief(); W.session = null;
  ST.viewHost = 'donguri-bank.example'; ST.checks = null; renderAll();
  await fly('thief', 'server', { title:'ログインしたい（あなたのふり）', color:COL.bad, fields:[F.text('ユーザー名', USER)] });
  const ch = newChallenge('donguri-bank.example'); renderServer();
  await fly('server', 'thief', { title:'チャレンジ', icon:'🎲', color:COL.chal, fields:[F.chal(ch)] });
  await fly('thief', 'server', { title:'ねこ商店の返事', icon:'✍', color:COL.bad, fields:[F.cred(got.credId), F.client(got.clientDataJSON), F.auth(got.authData), F.sig(got.signature)] });
  const res = await serverVerifyAssertion('donguri-bank.example', got);
  const ok = await showChecks('ログインの確認（どんぐり銀行）', res.checks, 'ログインできました', 'ログインできません');
  if (!ok){ quest('second-pk'); narr('<strong>はじかれました。</strong> 鍵の ID も、住所（origin）も、サイトの名前（rpIdHash）も、署名も合いません。サイトごとに鍵がちがうので、<b>1つのサイトの事故はほかに広がらず</b>、サイトどうしで「同じ人だ」と突き合わせることもできません。'); }
};
