// 一滴の保存（「つづきから」用）: このブラウザの中（IndexedDB）にだけ置く。どこにも送らない。画面からも計算のコア（Worker）からも使える
const DB = 'drop-evolution', STORE = 'save';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
  return dbp;
}
export async function put(key, val) {
  const d = await db();
  return new Promise((ok, ng) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => ok(); t.onerror = () => ng(t.error); });
}
export async function get(key) {
  const d = await db();
  return new Promise((ok, ng) => { const r = d.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
}
// 一滴を保存する（中身と、タイトルに出す小さな見出し）
export async function saveWorld(data) {
  const meta = { t: data.t, n: data.orgs.length, savedAt: Date.now(), size: data.opt.size };
  await put('last', data); await put('meta', meta);
  return meta;
}
