// English texts (I18N.md). Loaded after organs.js: when LANG is 'en', overwrite the Japanese texts in place.
// When you add a stage, organ, event, myth or open question in Japanese, add the English here too (same id / same order).
if (LANG === 'en') {
  const set = (obj, over) => Object.entries(over).forEach(([k, v]) => Object.assign(obj[k], v));

  // stages (same ids as STAGES in data.js)
  const ST = {
    larva: { name: 'Final-instar larva (5th)', sub: 'Eats tobacco and other leaves and grows to about 10 g' },
    wander: { name: 'Wandering', sub: 'Stops eating and walks around looking for a place to burrow' },
    prepupa: { name: 'Prepupa', sub: 'Makes a small chamber in the soil and stays still' },
    ecdysis: { name: 'Pupation (molting)', sub: 'Sheds the larval skin in the soil and becomes a pupa' },
    pupa: { name: 'Pupa', sub: '' },
    eclosion: { name: 'Emergence', sub: '' },
    adult: { name: 'Adult moth', sub: '' },
  };
  STAGES.forEach(s => Object.assign(s, ST[s.id]));

  set(CATS, {
    brk: { name: 'Breaks down', sub: 'Larva-only parts. The cells kill themselves and blood cells clean up' },
    keep: { name: 'Stays and is rebuilt', sub: 'The same cells keep working while their shape and connections change' },
    new: { name: 'Newly built', sub: 'Grows from small groups of cells such as imaginal discs' },
    mat: { name: 'Materials and reserves', sub: 'Nutrients stored by the larva and used up during the pupal stage' },
    hem: { name: 'Clean-up crew (blood cells)', sub: 'Move through the body fluid and eat the pieces of broken-down cells' },
  });

  const ON = {
    silk: 'Salivary (silk) glands', prolegs: 'Prolegs', muscle: 'Larval muscles', lining: 'Inner lining of the midgut', pg: 'Prothoracic glands',
    gut: 'Digestive tract', mal: 'Malpighian tubules', cns: 'Brain and nerves', trachea: 'Tracheae (breathing tubes)', heart: 'Dorsal vessel (heart)',
    ism: 'Muscles between abdominal segments', ca: 'Corpora allata', gonad: 'Gonads', skin: 'Epidermis (skin-making cells)', wing: 'Wings',
    leg: 'Legs', antenna: 'Antennae', eye: 'Compound eyes', proboscis: 'Proboscis (drinking straw)', flight: 'Flight muscles',
    genital: 'Genitalia and reproductive ducts', fat: 'Fat body',
  };
  ORGANS.forEach(o => { if (ON[o.id]) o.name = ON[o.id]; });

  set(ORGAN_TEXT, {
    silk: { when: 'Prepupa to pupal day 2 (over 4–5 days)',
      text: 'Tubes that release thread and saliva from the mouth (labial glands). In silkworms the same glands grow large and become the “silk glands” that spin the cocoon. The tobacco hornworm makes no cocoon and pupates in a chamber in the soil. These glands break down over 4–5 days around pupation. The cells digest their own contents (autophagy) and finally die as their nuclei break into pieces (apoptosis).',
      src: 'Research on cell death in the labial glands of the tobacco hornworm (Zakeri et al.).' },
    prolegs: { when: 'Prepupa',
      text: 'The thick legs on the abdomen. Their tips carry rows of tiny hooks that grip leaves and stems. They are “larva-only parts” that the adult doesn’t have. They shrink in the prepupa, and the outer skin is thrown away with the molted skin. Some of the nerve cells that moved the prolegs die, and some are rebuilt into nerves that do other jobs in the adult.',
      src: 'Nerve remodeling: Weeks et al. (1989 and others). The number of days they take to shrink is a rough guide.' },
    muscle: { when: 'Around pupation to about pupal day 2',
      text: 'The muscles a caterpillar uses to wriggle and crawl. When the big prepupal peak of ecdysone falls, most of them break down. But in the back muscles of the thorax, what is left of 1 of the 5 muscle fibers becomes a “scaffold”, and the adult flight muscles grow from it starting around pupal day 3.',
      src: 'Research on the tobacco hornworm (Hegstrom et al. 1998 and others).' },
    lining: { when: 'Prepupa (comes off) to after emergence (expelled)',
      text: 'The layer of cells on the inside of the midgut that digested leaves. Before pupation it comes off in one piece, falls into the gut and forms a yellowish lump (the “yellow body”). Outside it, the remaining stem cells build a new inner layer. The lump collects with other wastes in the rectal sac and is expelled after emergence as “meconium”.',
      src: 'Research on the midgut of silkworms and tobacco hornworms. The day it comes off is a rough guide.' },
    pg: { when: 'Around pupal days 7–11 (rough guide)',
      text: 'Glands that make ecdysone, the hormone that signals molting and metamorphosis. After sending the big signal to build the adult, their job is done and they break down. Adults no longer molt, so they are not needed.',
      src: 'Known to break down partway to adulthood in moths. The days are a rough guide.' },
    gut: { when: 'Pupal days 2–11 (rebuilding), 14–18 (rectal sac swells)',
      text: 'The larval gut is a thick tube for digesting huge amounts of leaves. The adult only sips nectar, so it is rebuilt into a thin tube with a sac to store nectar (the crop). An MRI study of living pupae found the crop starts forming on days 4–6, the midgut moves toward the front of the abdomen on days 5–7, and by days 9–12 it has nearly the adult shape. Before emergence, the rectal sac swells with wastes (about 30% of body weight at emergence).',
      src: 'MRI study of the tobacco hornworm digestive tract (PLOS ONE 2016).' },
    mal: { when: 'Throughout the pupal stage',
      text: 'Tubes that filter wastes out of the body fluid (hemolymph), like human kidneys. In butterflies and moths most of them stay and are rebuilt. Wastes made during the pupal stage are stored and expelled as meconium after emergence.',
      src: 'How much they are rebuilt differs between species. Shape and position are schematic.' },
    cns: { when: 'Around pupal days 2–9 (ganglia merge; rough guide)',
      text: 'Most nerve cells survive without being destroyed; they cut their branches (wiring) and reconnect. The clusters of nerve cells (ganglia) lined up along the abdomen move forward, and in the thorax several merge into one. In the brain, the parts that receive smell and vision grow bigger with new cells. It has been shown in this very insect that things learned as a larva can be remembered by the adult.',
      src: 'Research on the tobacco hornworm nervous system (Truman, Tolbert et al.), memory experiment (Blackiston et al. 2008).' },
    trachea: { when: 'Always (air sacs from pupal days 2–3)',
      text: 'Tubes that take in air through the spiracles on the sides of the body. They stay through the pupal stage and keep breathing while being rebuilt. Sacs that store air (air sacs) appear on pupal days 2–3, and in the adult they send lots of oxygen to the flight muscles.',
      src: 'Timing of the air sacs: MRI study of the tobacco hornworm.' },
    heart: { when: 'Always',
      text: 'The tube-shaped heart along the back (the dorsal vessel). It stays and keeps working. In pupae and adults, the direction it pumps the body fluid sometimes reverses (toward the head → toward the tail → toward the head…). On screen, a wave of swelling (where fluid is pushed out) travels in the direction of flow and pauses a little before switching. In wandering larvae, the dorsal vessel becomes visible through the skin of the back.',
      src: 'Reversal of the heartbeat has been observed in moth pupae and adults. The wave speed, switching interval and size of the swelling are for show.' },
    ism: { when: 'Disappear about 30 hours after emergence',
      text: 'The muscles between the segments of the abdomen. They stay through the pupal stage and are used by the pupa to move its abdomen, and at emergence to break out of the shell and dig through the soil. The night before emergence (day 17), their “preparation to die” is set, and after emergence, when ecdysone has fallen all the way and the eclosion hormone arrives, they die and disappear in about 30 hours.',
      src: 'Research on the tobacco hornworm (Schwartz and Truman 1982 and others).' },
    ca: { when: 'Stop early in the final instar, a little in the prepupa, active again in the adult',
      text: 'Small glands that make juvenile hormone. As long as juvenile hormone is present, a molt keeps the insect “still a larva”. When they almost stop early in the final instar, the next molt goes on to the pupa. The small burst in the prepupa keeps it from skipping the pupa and going straight to the adult. In the adult they work again to make eggs or sperm (the adult timing is a rough guide).',
      src: 'Fain and Riddiford (1975) and others.' },
    gonad: { when: 'Grow during the pupal stage',
      text: 'The beginnings of the testes in males or ovaries in females. They are there from the larval stage and grow during the pupal stage into the adult reproductive glands. The big ecdysone peak is known to be needed for the reproductive organs to grow (in silkworms).',
      src: 'Shape and position are schematic.' },
    skin: { when: 'Makes the adult skin from pupal days 2–3',
      text: 'The layer of cells on the body surface (the epidermis). The same cells make the larval skin, the pupal skin and the adult skin in turn. On pupal days 2–3 they separate from the old skin (apolysis), and the building of the adult body begins here. The dotted line is the outline of the adult body forming inside the pupa.',
      src: 'Apolysis on days 2–3: research on the wings of the tobacco hornworm.' },
    wing: { when: 'Grow from the larval stage; scales and color during the pupal stage; spread after emergence',
      text: 'The wing buds (wing imaginal discs) sit inside the larva’s thorax as small pouches and grow large in the final instar. In the prepupa they turn inside out, and appear as “wing shapes” under the pupal skin. On pupal days 3–4, the cells that make scales grow larger (the DNA in their nuclei multiplies many times) and line up in rows. The color (gray and brown melanin) comes at the end of the pupal stage. After emerging and reaching the surface, the moth pumps body fluid into the wings to spread them, and once they harden it rotates them at the base and folds them over its back (spreading starts about 15 minutes after and ends about 80 minutes after; rough guides).',
      src: 'Scale-making cells: Cho and Nijhout (2013). How the wing skin becomes stretchy after emergence: Reynolds (1977, J Exp Biol). The spreading times and the coloring days are rough guides. The pattern is drawn simplified.' },
    leg: { when: 'Prepupa to emergence',
      text: 'The adult’s long legs are made from imaginal discs (small groups of cells) inside the larva’s short thoracic legs. The larval nerve cells that move the legs survive, regrow their branches and connect to the adult legs. In the pupa, the shapes of the legs can be seen on the surface of the skin, lined up on the belly side.',
      src: 'Remodeling of the leg nerves: research on the tobacco hornworm (Kent and Levine and others).' },
    antenna: { when: 'Prepupa to emergence',
      text: 'Made from imaginal discs in the head. In the pupa, their shape can be seen on the surface, running along the edge of the wings. Hawk moth adults have thick antennae with small hooked tips. They sense smells, and males can sense the scent of females (pheromones) from far away.',
      src: '' },
    eye: { when: 'End of the larva to early pupa (assembly); color in the second half (rough guide)',
      text: 'The larva has only a row of small eyes (stemmata). The adult’s large compound eyes are newly made from discs in the head. From the end of the final instar, a “furrow” moves from back to front across the eye primordium, and behind it small unit eyes (ommatidia) are assembled one by one. When ecdysone rises, the light-sensing cells are finished. The green behind is the new part of the brain that receives visual information (the optic lobe).',
      src: 'Research on the eyes of the tobacco hornworm (Champlin and Truman and others). The days the color comes are a rough guide.' },
    proboscis: { when: 'During the pupal stage (in its case), just after emergence',
      text: 'A long straw for sipping nectar. In the tobacco hornworm pupa, the case of the proboscis stands away from the body under the head in a loop like a “jug handle”. The proboscis is made of two halves, left and right (parts of the mouth), which the moth joins into one tube after emergence.',
      src: 'Jug-handle shape: a feature of tobacco hornworm pupae. Joining the two halves: common to butterflies and moths.' },
    flight: { when: 'Around pupal days 3–14',
      text: 'The muscles that move the wings, filling much of the thorax. Using what is left of a larval muscle (one muscle fiber) as a scaffold, muscle precursor cells (myoblasts) gather and multiply into thick bundles. Their growth follows the big ecdysone peak. Hawk moths fly fast and hover in the air to sip nectar, so these muscles are very large.',
      src: 'Research on the tobacco hornworm (Hegstrom et al. 1998 and others). The end day is a rough guide.' },
    genital: { when: 'Around pupal days 3–12 (rough guide)',
      text: 'Discs at the tip of the abdomen build the organs for mating and the passages for eggs and sperm.',
      src: 'The days are a rough guide. The shape is schematic.' },
    fat: { when: 'Used throughout the pupal stage',
      text: 'A storehouse of nutrients (fats, proteins, sugars) built up by the larva. The pupa eats nothing, so this becomes the material and energy for building the adult. At the end of the larval stage it takes up proteins from the body fluid (storage proteins) and stores them. It is used little by little during the pupal stage and shrinks, and some remains in the adult.',
      src: 'The rate of use is schematic. In flies it breaks up into separate cells, but in moths this is less clear.' },
    hemo: { when: 'When organs are breaking down',
      text: 'Cells that move in the body fluid (blood cells). They eat the pieces of dead cells and clean up. The destruction itself is mainly done by the cells’ own self-destruct program (apoptosis) and by digesting their own contents (autophagy). They are too small to see with the eye, so they are not shown in “Cut open”.',
      src: 'The number and movement of blood cells on screen are for show.' },
  });

  set(REAL_NOTE, {
    soup: { text: 'Cut open early in the pupal stage, the inside looks like a thick goo of body fluid, fat body and half-broken larval tissues. In the second half, shaped things such as adult muscles and wings become visible.' },
    hemolymph: { text: 'The larva’s body fluid is green (a mix of the blue pigment insecticyanin and yellow carotenoids). The colors of pupal and adult body fluid are rough guides.' },
    white: { text: 'Tracheae are silvery white because they are full of air, the brain and nerves are opaque white, and the fat body is cream-colored and grainy.' },
    other: { text: 'The color of the gut (green from the leaves inside in the larva), the developing legs, antennae and proboscis being whitish and getting color before emergence, and how cloudy things are, are rough guides.' },
    look: { text: 'The shine, the grainy texture and the slightly blurred drawing are for show. Blood cells are too small to see, so they are not shown. Tap an organ to see its description.' },
  });

  [
    ['Eat and store', 'The inside of the body is filled with a big gut and fat body (yellow). The buds of wings and legs (imaginal discs, green) are already inside and grow large at this stage. Juvenile hormone almost disappears early in the final instar.'],
    ['No going back to being a larva', 'Once juvenile hormone is gone, a small peak of ecdysone (the commitment peak) comes. This sets the body’s cells to “next comes the pupa”.'],
    ['Wandering (W0)', 'It stops eating, empties its gut and walks around. Its body darkens, and the dorsal vessel (heart) can be seen through the skin of its back. Soon it burrows into the soil and makes a small chamber about 10 cm deep. It becomes a pupa on day 4 after it starts wandering (W4).'],
    ['Prepupa (in the soil)', 'A big peak of ecdysone and a small peak of juvenile hormone come. The salivary glands (vermilion) start to break down, and the inner lining of the midgut comes off. The buds of wings, legs and antennae turn inside out, and the pupal shape forms under the skin.'],
    ['Shedding the larval skin (about 2.5 hours)', 'The skin splits along the back and the pupa comes out. At this point, the shapes of the wings, legs, antennae and proboscis are already on the surface of the pupa. The proboscis case forms a loop like a handle under the head. The pupal skin hardens from green to brown in a few hours (time is a rough guide).'],
    ['Time for breaking down', 'The cells of larva-only parts (vermilion) kill themselves (apoptosis and autophagy), and blood cells (reddish purple) clean up. When the prepupal ecdysone peak falls, the larval muscles break down.'],
    ['Starting to build the adult (days 2–3)', 'The epidermal cells separate from the pupal skin (apolysis) and start making the adult skin underneath (dotted line). Air sacs appear.'],
    ['Assembling the adult (the big ecdysone peak)', 'With no juvenile hormone around, ecdysone rises and peaks on days 7–9. This is the signal to “build the adult”. The imaginal discs (green) multiply and take shape, the flight muscles grow from day 3, and the gut is rebuilt into the adult form on days 4–12.'],
    ['Scale cells line up', 'On days 3–4, some cells on the wings grow larger (the DNA in their nuclei multiplies many times), become scale-making cells and line up in rows (the thin lines on the wings). The timing of scale growth is a rough guide.'],
    ['Ecdysone drops sharply (day 10)', 'On day 10 ecdysone drops sharply, and by about day 14 it is low. This fall signals the preparation for emergence, and the preparation of the muscles that die after emergence.'],
    ['Finishing touches', 'After ecdysone falls, the adult skin (cuticle) becomes thick and hard, and the scales, hairs and the hairs that sense smells and sounds are completed. The fat body’s reserves shrink further (days are rough guides).'],
    ['The eyes get their color', 'The compound eyes get their color (days are rough guides). Researchers tell the days apart by shining a strong light through the pupal skin and looking at the eye color and the legs.'],
    ['Wings and body get their color', 'Gray and brown pigment (melanin) appears in the scales, and the pattern lines form. The color comes at the end of the pupal stage (days are rough guides).'],
    ['Before emergence', 'The rectal sac swells with wastes. On the night of day 17, it is decided that the muscles between abdominal segments will “die after emergence”. From outside, in ordinary light, it looks almost unchanged.'],
    ['Emerging and leaving the soil', 'Moving its abdomen and the bases of its wings, the moth gets out of the pupal shell, then stretches and contracts its abdomen to dig through the soil to the surface. The wings stay small and crumpled and are not spread until it reaches the surface.'],
    ['Spreading the wings', 'Body fluid from the swollen abdomen is pumped into the wing veins to spread the wings (a hormone released after emergence is the signal, and the wing skin becomes stretchy). Once spread, the color also sets, and the wings are rotated at the base and folded over the back. The wings spread from the same place as in the pupa. The start (about 15 minutes after) and end (about 80 minutes after) of spreading are rough guides.'],
    ['Expelling the meconium', 'Wastes stored during the pupal stage and the old gut lining are expelled as a liquid (meconium). It can be about 30% of body weight at emergence (the amount is confirmed; the timing is a rough guide). Around this time the moth also joins the two halves of its proboscis into one.'],
    ['Muscles that finished their job disappear', 'The muscles between the abdominal segments (sky blue), used for emerging, die and disappear in about 30 hours. Juvenile hormone starts again, and the moth gets ready to make eggs or sperm (adult hormones are rough guides).'],
  ].forEach(([title, text], i) => Object.assign(EVENTS[i], { title, text }));

  [
    ['Is the inside of a pupa all soup?', 'Only half right. Larva-only parts (muscles, salivary glands, gut lining and so on) are broken down, and there is a lot of body fluid, so it looks runny when opened. But the nerves, tracheae, heart and gut tube stay and are rebuilt, and the buds of the wings and legs (imaginal discs) are in the larva’s body from the start. It does not take everything apart into single cells and build it again.'],
    ['Are memories from the caterpillar erased?', 'Not always. In this very tobacco hornworm, larvae taught to avoid a smell by pairing it with a mild electric shock still avoided it as adults (Blackiston et al. 2008). But this only worked when they learned it in the final instar; what younger larvae learned did not last. This fits with nerve cells surviving.'],
    ['Do the wings suddenly form inside the pupa?', 'The wing buds sit inside the larva’s thorax as small pouches and grow large in the final instar. They come out in the prepupa, and the moment it becomes a pupa, the wing shapes are already visible on its surface. What is made during the pupal stage is the scales, the color, the connections to the muscles and so on.'],
    ['A pupa stays still, so is it doing nothing?', 'From outside it hardly changes, but inside, big construction work goes on every day. The amount of ecdysone also changes a lot from day to day. Switch to “Outside” and move the time to see.'],
    ['Why the tobacco hornworm?', 'It is one of the moths studied most closely for metamorphosis, with dated records of changes in hormones, muscles, nerves and gut. It is an insect of North and South America, but Japan has close relatives (such as the sweet potato hornworm, a big caterpillar that eats sweet potato leaves).'],
  ].forEach(([q, a], i) => Object.assign(MYTHS[i], { q, a }));

  UNKNOWNS.splice(0, UNKNOWNS.length,
    'How the whole body coordinates which cells die and which survive (the hormones and switch genes are becoming clear, but the fine control is still being studied).',
    'Where each larval cell goes in the adult. This is traced in detail in fruit flies, but much less so in moths and butterflies.',
    'How memories survive the rewiring of nerves.',
    'How complete metamorphosis evolved. A leading idea (Truman and Riddiford) is that the caterpillar is a late-embryo stage of an ancestor that came out of the egg to live, but it is not settled.',
    'In this app too, no clear dated records were found for the days the eyes and wings get their color, the prothoracic glands break down, or the ganglia merge, so these are rough guides.');
}
