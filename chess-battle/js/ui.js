// 画面の部品: 隅の小さな盤・駒の点数の帯・スライダーの印・手の一覧
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const $ = id => document.getElementById(id);

// 隅の小さな盤（白が下）。動いたマス・取られたマスを光らせる
export function drawMini(cv, state, p) {
  const css = cv.clientWidth || 90, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(css * dpr)) { cv.width = cv.height = Math.round(css * dpr); }
  const g = cv.getContext('2d'), s = cv.width / 8;
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    g.fillStyle = (f + r) % 2 ? '#c9b48a' : '#8a6f4b';
    g.fillRect(f * s, (7 - r) * s, s, s);
  }
  const hl = (sq, c) => { const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; g.fillStyle = c; g.fillRect(f * s, (7 - r) * s, s, s); };
  if (p) { hl(p.from, 'rgba(255,214,90,.55)'); hl(p.to, p.captured ? 'rgba(255,120,90,.7)' : 'rgba(255,224,138,.75)'); }
  g.font = `${Math.round(s * 0.92)}px "Segoe UI Symbol","Noto Sans Symbols 2",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = Math.max(1, s * 0.06);
  for (const u of state) if (u.sq) {
    const f = u.sq.charCodeAt(0) - 97, r = +u.sq[1] - 1, x = (f + 0.5) * s, y = (7 - r + 0.54) * s, ch = GLYPH[u.type] + '︎';
    g.strokeStyle = u.color === 'w' ? '#222' : '#eee'; g.fillStyle = u.color === 'w' ? '#fff' : '#111';
    g.strokeText(ch, x, y); g.fillText(ch, x, y);
  }
}

export function setMaterial(m) {
  const MAX = 39;   // 初めの点数（8 + 6 + 6 + 10 + 9）
  $('matW').style.width = (m.w / MAX * 100) + '%'; $('matB').style.width = (m.b / MAX * 100) + '%';
  $('matWn').textContent = m.w; $('matBn').textContent = m.b;
}

export function buildSlider(rec, onSeek) {
  const sl = $('slider'), n = rec.plies.length;
  sl.max = n;
  sl.addEventListener('input', () => onSeek(+sl.value));
  const ticks = $('ticks'); ticks.innerHTML = '';
  for (const p of rec.plies) if (p.key || p.sac || p.mate) {
    const t = document.createElement('span');
    t.className = 'tick' + (p.sac ? ' sac' : '');
    t.style.left = `calc(${p.ply / n * 100}% + ${(0.5 - p.ply / n) * 18}px)`;   // つまみの幅のぶんだけ内側へ
    t.title = p.num + ' ' + p.san;
    ticks.appendChild(t);
  }
}

export function buildMoves(rec, onSeek) {
  const ol = $('moves'); ol.innerHTML = '';
  for (let i = 0; i < rec.plies.length; i += 2) {
    const li = document.createElement('li');
    for (const p of rec.plies.slice(i, i + 2)) {
      const b = document.createElement('button');
      b.textContent = (p.color === 'w' ? p.num + ' ' : '') + p.san + (p.sac ? '!' : '');
      b.dataset.ply = p.ply; b.className = p.sac ? 'sac' : '';
      b.addEventListener('click', () => onSeek(p.ply));
      li.appendChild(b);
    }
    ol.appendChild(li);
  }
}

export function markMove(ply) {
  for (const b of document.querySelectorAll('#moves button')) b.classList.toggle('now', +b.dataset.ply === ply);
  $('slider').value = ply;
}
