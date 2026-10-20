// ビッグバンから惑星まで — 5つの場面をつなぐ帯（宇宙の歴史のどこか）。<nav id="scenes" data-here="④"> に描く
export const SCENES = [
  { id: '①', name: '宇宙の網', when: '38万年〜今', href: 'web.html' },
  { id: '②', name: '銀河の円盤', when: '約100億年前〜', href: 'galaxy.html' },
  { id: '③', name: '星のゆりかご', when: '46億年前', href: 'cloud.html' },
  { id: '④', name: 'ちりから惑星へ', when: '46億年前から1億年', href: 'index.html' },
  { id: '⑤', name: '大きな衝突（月）', when: '約45億年前', href: 'impact.html' },
];
export function drawNav(el, ready = SCENES.map(s => s.id)) {
  const here = el.dataset.here;
  el.innerHTML = SCENES.map(s => {
    const on = s.id === here, ok = ready.includes(s.id);
    const inner = `<b>${s.id}</b> ${s.name}<small>${s.when}</small>`;
    return on ? `<span class="sc on" aria-current="page">${inner}</span>` : ok ? `<a class="sc" href="${s.href}">${inner}</a>` : `<span class="sc off" title="これから作ります">${inner}</span>`;
  }).join('<i>›</i>');
}
