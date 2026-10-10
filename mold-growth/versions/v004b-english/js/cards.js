// Discovery cards: when something happens for the first time, a short note pops up and is kept in the list.
// tag: sure = measured / well known, est = estimate, art = drawn for clarity.

const CARDS = {
  land: { t: '胞子が落ちてきた', tag: 'sure', x: '空気にはいつもカビの胞子が浮いていて（梅雨〜夏は1m³に数百〜数千個）、ゆっくり落ちてくる。この箱庭（60cm²）なら1時間に数個。乾いたタイルの上では、何も起きずに水を待つ。「見えないものも見る」で見える。' },
  swell: { t: '胞子が水を吸ってふくらんだ', tag: 'sure', x: '湿り気があると、胞子は水を吸ってふくらむ。実験室では、2〜5時間でふくらみはじめ、6〜10時間で発芽管が出る（コウジカビ）。壁の上では湿り気とえさが足りず、もっとかかる。' },
  germ: { t: '発芽した', tag: 'sure', x: '胞子から細い管（菌糸）が出た。建物の表面では、湿度90%前後なら半日〜2日ほどで発芽することがある。湿り気が少ないほど何日もかかり、約80%より下ではほとんど発芽しない。' },
  branch: { t: '菌糸がのびて枝分かれした', tag: 'sure', x: '菌糸は先だけがのびて、ときどき枝分かれする。実験室の寒天の上なら先は1時間に50〜80µm（アオカビ・コウジカビ）。壁の上ではえさと水が少なく、ずっと遅い（この箱庭ではその1/15ほど）。' },
  eat: { t: 'えさを溶かして食べている', tag: 'sure', x: 'カビは口がない。菌糸の先から酵素を出して、石けんかす・皮脂・あかなどを外で溶かし、しみこませて吸う。汚れ（黄色っぽい所）が少しずつ減っていく。きれいなタイルの上では、えさがなくて育ちにくい。' },
  pause: { t: '乾いて止まった', tag: 'sure', x: '表面が乾くと、菌糸の先はのびるのをやめる。でも死んだわけではない。次に入浴で湿ると、また同じ所からのびはじめる。カビにとっては「ぬれている時間」の合計が大事。' },
  deep: { t: 'ゴムパッキンの奥にもぐった', tag: 'est', x: 'やわらかいシリコンや目地のすき間には、菌糸が中まで入りこむ。表面をこすっても、奥の菌糸は残る。カビ取り剤が効きにくくなる理由。' },
  sporulate: { t: '胞子を作りはじめた', tag: 'sure', x: '菌糸の網がしっかりすると、空に向かって柄を立て、その先に胞子（分生子）を鎖のように作る。黒や緑の色は、胞子と菌糸の色素（メラニンなど）。ホイールや＋で大きくして顕微鏡の見え方にすると、種類で柄の形がちがうのが分かる。' },
  visible: { t: '目に見える点になった', tag: 'sure', x: '色のついた所が1mm²ほどになると、目でも黒い点に見える。でも、そのまわりには見えない菌糸がずっと前から広がっている。「目に見えたとき」は、もう育ちはじめてからかなりたっている。' },
  release: { t: '胞子が空気へ飛んだ', tag: 'est', x: '乾くときや風（換気扇）で、胞子が空気に出ていく。一部は近くに落ちて新しい点になり、残りは浴室の空気に混ざって別の場所へ。カビが増えると、空気中の胞子の数も増える。' },
  regrow: { t: '同じ場所からまた生えてきた', tag: 'est', x: 'カビ取り剤のあと、ゴムや目地の奥で生き残った菌糸が、湿ったときにまた表に出てきた。色が消えても、根が残っていると再発する。乾かす・えさを減らす・防カビ剤で、出てくるのを遅らせられる。' },
  block: { t: '防カビ剤で発芽できない', tag: 'est', x: '防カビ剤が残っている所では、落ちてきた胞子が水を吸っても、うまく発芽・成長できない。水で流れたり日がたったりすると効き目は弱まる。' },
  'tool:chlorine': { t: '塩素系カビ取り剤を使った', tag: 'sure', x: '次亜塩素酸が菌糸と胞子をこわし（殺菌）、黒い色素も酸化してこわす（漂白）ので、色が消える。ただし、ゴムや目地の奥の菌糸には届きにくい。<b>酸性のもの（クエン酸・酢・酸性洗剤）と混ぜると有毒な塩素ガスが出る。</b>換気・手袋・めがね。' },
  'tool:alcohol': { t: 'アルコールでふいた', tag: 'sure', x: 'エタノールはたんぱく質を変性させて菌糸を殺すが、色素はこわさないので<b>黒い色はそのまま</b>残る。すぐ蒸発して何も残らないので、次に来る胞子は止められない。乾いた胞子の一部は生き残る。' },
  'tool:scrub': { t: 'こすって汚れを落とした', tag: 'sure', x: 'えさ（汚れ）が減ると、同じ湿り気でも育つのが遅くなる。表面のカビも少し取れるが、奥の菌糸と色は残りやすい。' },
  'tool:fungicide': { t: '防カビ剤をかけた', tag: 'est', x: '表面に残る成分（製品により銀イオン・第4級アンモニウム塩など）が、来た胞子の発芽と菌糸ののびをおさえる。生えているカビを消すものではない。「見えないものも見る」で、効いている所がオレンジに見える。' },
  'tool:smoke': { t: '防カビくん煙剤（銀イオン）を使った', tag: 'est', x: '煙で銀イオンを浴室じゅうに広げ、壁・天井・パッキンの表面に付ける。銀イオンは菌の酵素などに結びついて働きを止める。効き目は約2か月（製品の表示）で、使う前にカビを取っておくのが前提。' },
  'tool:water': { t: '水をかけた', tag: 'sure', x: '水があると、そこはカビにとって湿度100%と同じ。タイルの水は流れ落ちて、目地やゴムパッキンにたまる。' },
  'tool:dry': { t: '乾かした', tag: 'sure', x: '乾くと菌糸の先は止まる。湿っている時間を短くすることが、いちばん確かな対策。' },
  'tool:dirt': { t: '汚した', tag: 'sure', x: '石けんかす・皮脂・あかはカビのえさ。汚れが多い所ほど速く育つ。' },
  'tool:spore': { t: '胞子をまいた', tag: 'art', x: '実験用。ふつうは空気から1時間に数個ずつ落ちてくる。湿っていてえさがある所にまくと、すぐ発芽がはじまる。' },
};
// 英語（I18N.md）: 同じ鍵に t と x を上書きする。カードを足したら、ここにも足す
if (LANG === 'en') Object.entries({
  land: { t: 'Spores landed', x: 'Mold spores are always floating in the air (hundreds to thousands per m³ in the rainy season and summer), and they slowly settle. On this 60 cm² mold garden, a few land each hour. On dry tile nothing happens; they wait for water. You can see them with “Show hidden things”.' },
  swell: { t: 'Spores soaked up water and swelled', x: 'When it is damp, spores take in water and swell. In the lab, Aspergillus spores start swelling in 2–5 hours and send out a germ tube in 6–10 hours. On a wall there is less moisture and food, so it takes longer.' },
  germ: { t: 'A spore germinated', x: 'A thin tube (a hypha) grew out of the spore. On building surfaces, spores can germinate in half a day to 2 days at around 90% humidity. The drier it is, the more days it takes, and below about 80% they hardly germinate at all.' },
  branch: { t: 'Hyphae grew and branched', x: 'Hyphae grow only at their tips and branch now and then. On lab agar, the tips grow 50–80 µm an hour (Penicillium, Aspergillus). On a wall there is less food and water, so it is much slower (about 1/15 of that in this mold garden).' },
  eat: { t: 'Dissolving food and eating it', x: 'Molds have no mouth. They release enzymes from the tips of their hyphae to dissolve soap scum, skin oil and dead skin outside their bodies, then absorb it. The grime (yellowish areas) slowly shrinks. On clean tile there is no food, so mold grows poorly.' },
  pause: { t: 'Dried out and stopped', x: 'When the surface dries, the hyphal tips stop growing. But they are not dead. The next time a bath makes it damp, they start growing again from the same spot. For mold, what matters is the total time spent wet.' },
  deep: { t: 'Went deep into the rubber seal', x: 'Hyphae can grow right into soft silicone and the gaps in grout. Scrubbing the surface leaves the hyphae deep inside. This is why mold removers have a hard time.' },
  sporulate: { t: 'Started making spores', x: 'Once the web of hyphae is well established, it raises stalks into the air and makes spores (conidia) in chains at their tips. The black and green colors come from pigments (such as melanin) in the spores and hyphae. Zoom in with the wheel or + to the microscope view, and you can see that each kind has a differently shaped stalk.' },
  visible: { t: 'Became a visible spot', x: 'When a colored patch reaches about 1 mm², you can see it as a black dot. But invisible hyphae have been spreading around it for a long time. By the time you can see it, it started growing quite a while ago.' },
  release: { t: 'Spores flew into the air', x: 'As things dry or the fan blows, spores are released into the air. Some land nearby and start new spots, and the rest mix into the bathroom air and travel elsewhere. The more mold there is, the more spores in the air.' },
  regrow: { t: 'Grew back in the same spot', x: 'After using mold remover, hyphae that survived deep in the rubber or grout came back to the surface when it got damp. Even when the color is gone, mold returns if the roots remain. Drying, removing food and anti-mold agents can delay it.' },
  block: { t: 'Anti-mold agent stopped germination', x: 'Where anti-mold agent remains, spores that land cannot germinate or grow well even if they soak up water. Rinsing with water or the passing of days weakens the effect.' },
  'tool:chlorine': { t: 'Used chlorine mold remover', x: 'Hypochlorous acid breaks down hyphae and spores (kills them) and oxidizes the black pigment (bleaches it), so the color disappears. But it has trouble reaching hyphae deep in rubber or grout. <b>Mixing it with anything acidic (citric acid, vinegar, acidic cleaners) releases toxic chlorine gas.</b> Ventilate, and wear gloves and glasses.' },
  'tool:alcohol': { t: 'Wiped with alcohol', x: 'Ethanol kills hyphae by changing their proteins, but it does not break down pigment, so <b>the black color stays</b>. It evaporates quickly and leaves nothing behind, so it cannot stop the next spores. Some dry spores survive.' },
  'tool:scrub': { t: 'Scrubbed off grime', x: 'With less food (grime), mold grows more slowly even at the same dampness. Some surface mold comes off too, but hyphae deep inside and the color tend to remain.' },
  'tool:fungicide': { t: 'Sprayed anti-mold agent', x: 'Ingredients that stay on the surface (silver ions, quaternary ammonium salts and so on, depending on the product) hold back germination and hyphal growth of arriving spores. It does not remove mold that is already growing. With “Show hidden things”, treated areas look orange.' },
  'tool:smoke': { t: 'Used an anti-mold fogger (silver ions)', x: 'The fog spreads silver ions throughout the bathroom and leaves them on the walls, ceiling and seals. Silver ions bind to the fungus’s enzymes and stop them working. The effect lasts about 2 months (product label), and you are supposed to remove mold before using it.' },
  'tool:water': { t: 'Splashed water', x: 'Where there is water, it is the same as 100% humidity for mold. Water on tile runs down and collects in the grout and rubber seal.' },
  'tool:dry': { t: 'Dried it', x: 'When it dries, hyphal tips stop. Shortening the time things stay damp is the most reliable way to fight mold.' },
  'tool:dirt': { t: 'Added grime', x: 'Soap scum, skin oil and dead skin are food for mold. The dirtier a spot, the faster mold grows there.' },
  'tool:spore': { t: 'Sprinkled spores', x: 'For experiments. Normally a few fall from the air each hour. Sprinkled where it is damp and there is food, they start germinating right away.' },
}).forEach(([k, v]) => Object.assign(CARDS[k], v));

const DECK = { seen: {}, list: [], toast: null };

function processEvents(onCard) {
  const evs = W.events; W.events = [];
  for (const e of evs) {
    if (!CARDS[e.k] || DECK.seen[e.k]) continue;
    DECK.seen[e.k] = true; W.stats.firsts[e.k] = true;
    const card = { k: e.k, day: e.t / 24, ...CARDS[e.k] };
    DECK.list.push(card);
    if (onCard) onCard(card);
  }
}
function resetDeck() { DECK.seen = {}; DECK.list = []; }
