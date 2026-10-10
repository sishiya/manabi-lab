// text-en.js — English texts for data.js (I18N.md). Loaded right after data.js; only used when LANG === 'en'.
// Same keys as data.js: facts are in the same order (the s / e / a tags stay in data.js), pois by index.
'use strict';

if (LANG === 'en') {
  TIMES.day.name = 'Day'; TIMES.dusk.name = 'Dusk'; TIMES.night.name = 'Night';

  const EN = {
    human: {
      name:'Human', title:'Human senses',
      lead:'The baseline for comparing. Three kinds of color sensors (cones) see light from violet to red (about 400–700 nm).',
      facts:[
        'The eye has three kinds of cones for color (most sensitive around blue, green and red).',
        'Ultraviolet (light shorter than 400 nm) is almost all absorbed by the cornea and lens. It never reaches the retina, so we cannot see it.',
        'In the dark, rods take over. Rods cannot tell colors apart, so colors fade and things look blurry.',
        'Heat (infrared with a wavelength around 10 µm) is invisible to the eye. We only feel its warmth on our skin.',
        'In bright light, flicker faster than about 60 times a second can no longer be seen (it depends on conditions).',
        'The night view imagines how things look after the eyes adjust to the dark (brightness raised, colors faded).',
      ],
      pois:['Flower bed', 'Window', 'Porch lamp', 'Garbage spot'],
    },
    low: {
      name:'Low vision', title:'Low vision', sub:'',
      types:[['Blurry', 'Acuity'], ['Center is hard to see', 'Hard-to-see area'], ['Narrow field', 'Visible area'], ['Cataract (hazy)', 'Clouding']],
      lead:'Trouble seeing even with glasses. How it looks varies a lot from person to person. Switch between a few typical examples.',
      facts:[
        'In medicine, “amblyopia” means vision that did not develop in childhood (because of a squint, strong farsightedness or astigmatism, or a big difference between the eyes) and stays poor even with glasses. Found and treated early (glasses, an eye patch), it often gets better.',
        'In welfare and education, “low vision” broadly means trouble seeing in daily life because of illness or injury, even with glasses. It is different from total blindness: people use the part they can see.',
        'In Japan, about 1.45 million people had low vision as of 2007 (estimate by the Japan Ophthalmologists Association, 2009; counting people whose better eye had acuity of at least 0.1 but under 0.5).',
        'Trouble seeing comes in many forms (blurry, hard to see in the center, narrow field, glare, poor sight in the dark) and they often combine. It can change with light and tiredness, even for the same person.',
        'Center is hard to see (central scotoma): caused by age-related macular degeneration and more. Letters and faces are hard to see, but the edges still work, so walking may be possible. The blind spot is not a black hole: it looks blurry or warped, or the brain fills it in so it is hard to notice.',
        'Narrow field (tunnel vision): caused by retinitis pigmentosa and more. The middle is sharp, but it is easy to bump into things at your feet or to the side. Seeing in the dark is often hard (night blindness). With glaucoma, the field is lost slowly in patches, not always as a tunnel, and is hard to notice until it gets worse.',
        'The lost part is not seen as black; it is just “not seen” (like how the back of your head does not look black). That is why people often do not notice the gap.',
        'Cataract: the lens of the eye becomes cloudy, so things look hazy, glaring and yellowish. It can often be fixed with surgery.',
        'Things that help: yellow tactile paving (high contrast, easy to find), magnifiers and video magnifiers, glare-cutting glasses, white canes and more.',
        'In the narrow-field view, the part not seen is replaced with “shapeless gray” (it does not really look like this). The screen center stands for where you are looking. In real life, the blind spot and the visible area move along with the eyes. Screen resolution is limited, so the blur is a rough guide.',
      ],
      pois:['Face of the person in the garden', 'Your feet (stone path)', 'Porch lamp', 'Flower bed'],
    },
    refr: {
      name:'Myopia, hyperopia', sub:'astigmatism, presbyopia',
      types:[['Myopia', 'Power'], ['Hyperopia', 'Power'], ['Astigmatism', 'Power'], ['Presbyopia', 'Age']],
      lead:'If the power of the eye’s lens does not match the length of the eye, the focus is off and things blur. What blurs depends on how far away it is. Compare the book in your hand (35 cm) with far things.',
      facts:[
        'Myopia (nearsightedness): light comes into focus in front of the back of the eye. Near things are clear but far things blur. With −3 D (diopters) of myopia, things are sharp only up to about 33 cm.',
        'Hyperopia (farsightedness): light comes into focus behind the back of the eye. Young people can make up for it by focusing (accommodation), so they may see fine but their eyes tire easily. If focusing power is not enough, near things blur first.',
        'Astigmatism: the surface of the eye (cornea) and more is shaped a little like a rugby ball, so the focus is off in some directions. Lines in one direction look sharp and in another look blurry. It happens at any distance.',
        'Presbyopia: with age the lens gets stiffer and the eye focuses less well. From the mid-40s, small print up close gets hard to read. It happens to everyone.',
        'In the dark the pupil opens wide, so blur from being out of focus gets bigger (harder to see at night).',
        'Age and focusing power (accommodation) follow a common rule of thumb (Hofstetter’s minimum accommodation: 15 − 0.25 × age).',
        'Blur size is computed as “pupil size × focus error” (3 mm by day, 6.5 mm at night). Screen resolution is limited, so small differences in power are hard to see. Glasses make things sharp.',
      ],
      pois:['Far house', 'Table', 'Cat', 'Turn around to the house'],
    },
    crow: {
      name:'Crow', title:'Crow senses',
      lead:'Birds have four kinds of color sensors, one more than humans, reaching close to ultraviolet. That “4th color” is shown here as purple laid on top.',
      facts:[
        'A bird’s retina has four kinds of color cones (tetrachromatic vision). Birds can tell apart color differences that three human colors cannot make.',
        'In crows, the shortest-wavelength cone is a “VS type” with its peak in violet, thought to sense close to ultraviolet. It is less UV-shifted than in many songbirds (UVS type).',
        'Cones contain colored oil drops (oil droplets) that narrow the range of colors each cone senses. This is thought to make colors easier to tell apart.',
        'Sunflower and rudbeckia petals show a “bullseye” pattern in ultraviolet: dark at the base and bright at the tips. Many flowers that look white to us are dark in ultraviolet.',
        'The white powder (bloom) on blueberries and other fruit reflects ultraviolet well. Studies suggest birds use it to find fruit.',
        'Makers say yellow crow-proof garbage bags use pigments that block ultraviolet and more, so crows cannot see what is inside. Some reports say the effect varies.',
        'Crows are active in the daytime and see worse than humans in the dark.',
        'The 4th color cannot be shown to human eyes, so ultraviolet brightness is replaced with “purple”. “UV only” gives a black-and-white image like an ultraviolet camera.',
      ],
      pois:['Sunflower', 'White flower', 'Blueberries', 'Garbage bags'],
    },
    snake: {
      name:'Mamushi', title:'Mamushi pit viper senses',
      lead:'Pit vipers like the Japanese mamushi and rattlesnakes sense heat (infrared) with “pit organs” between the eyes and nostrils. They can find a warm mouse even in total darkness.',
      facts:[
        'The mamushi, habu, rattlesnakes and other pit vipers (subfamily Crotalinae) have a hollow called the “pit organ” between the eye and nostril that senses heat infrared. Rat snakes do not have one. Pythons and boas have heat pits of a different build on their lips.',
        'A thin membrane sits deep in the pit. When it warms up, a sensor called TRPA1 switches on (a 2010 study).',
        'One estimate says it responds when the membrane warms by only a few thousandths of a °C (about 0.003 °C in a 1956 experiment, close to what the instruments could measure). The numbers vary between studies.',
        'The pit is built like a “pinhole camera” with no lens, so the heat image is quite blurry. The brain (optic tectum) lays the eye image and the heat image on top of each other.',
        'Window glass blocks almost all heat infrared (wavelength around 10 µm). A person behind a window cannot be seen by heat (only the glass temperature shows).',
        'Many snakes have two kinds of cones and are thought to tell apart fewer colors than humans (shown here with two colors, yellow and blue).',
        'The heat colors (dark red → yellow → white) are a stand-in so people can see how much warmer something is than its surroundings. The blur is an estimate and can be changed with the slider.',
      ],
      pois:['Mouse', 'Cat', 'Person in the window', 'Pond and frog', 'Stone'],
    },
    fly: {
      name:'Fly', title:'Fly senses',
      clocks:['Human speed', 'Fly speed (about 1/4)'],
      lead:'A compound eye made of thousands of tiny eyes sees almost all the way around at once. It cannot see fine detail, but it is good with fast movement and flicker.',
      facts:[
        'A compound eye is a group of tiny eyes (ommatidia). A housefly has about 3000 in each eye. Each ommatidium is roughly one dot (pixel) of the picture.',
        'Neighboring ommatidia point a few degrees apart, so the fly sees detail tens of times less sharply than a human. One hexagon = one ommatidium (change its size with the slider).',
        'The two compound eyes see almost all the way around at once, except a little right behind. The screen spreads about 330° side to side and 170° up and down into one picture.',
        'Humans can see flicker up to about 60 times a second; measurements for flies are about 200–300 times (a rough guide that varies by species and method).',
        'Old fluorescent lights (on 50 Hz power in eastern Japan) brighten and dim 100 times a second. Humans cannot tell, but to a fly it may look like flickering.',
        '“Fly speed” turns being able to see fast changes into “the world moves slowly” (porch lamp flicker, moth wingbeats, the fly swatter). We do not know if flies really feel time slowly. Flashing screens can make some people unwell, so the lamp flicker only shows when you choose it, and it is made much weaker than in reality.',
        'The fly swatter comes down in about 0.1 seconds. At human speed you cannot escape in time, but at fly speed you might (escape with W / arrow keys or “Up”).',
      ],
      pois:['Table', 'Porch lamp', 'Above the flower bed'],
    },
    bat: {
      name:'Bat', title:'Bat senses',
      clocks:['Real speed', '1/10', '1/50'],
      lead:'Bats send out ultrasound and use the “echoes” that bounce back to learn what is around them and where insects are (echolocation). Only the places that sent back an echo appear.',
      facts:[
        'Bats such as the Japanese house bat, often seen flying over towns at dusk, call at tens of thousands of hertz (ultrasound), above the top of human hearing (about 20,000 hertz), and use the echoes to find insects and obstacles.',
        'Sound travels about 340 m per second. The echo from something 5 m away comes back in about 0.03 seconds. The time it takes tells the distance; the difference between the two ears tells the direction.',
        'While searching for insects, bats call about 10 times a second. Closer in, they call faster, and just before the catch it becomes a “feeding buzz” of 100–200 calls a second (here too, calls speed up near a moth).',
        'Bats do have eyes and are not blind. But small bats rely on echoes in the dark.',
        'Researchers play bat calls 10 times slower so humans can hear them (time expansion). “Hear the echoes” uses this method.',
        'Some moths hear the bat’s ultrasound and suddenly drop to escape, or make sounds that jam it.',
        'The screen slows time down to show the call’s sound wave hitting things (blue line) and places lighting up in the order their echoes return. Echo strength is estimated from the angle and distance of surfaces; moths are made stronger so they are easier to find.',
        'Get close to a moth to catch it (a game element).',
      ],
      pois:['Moths at the porch lamp', 'Above the garden', 'Around the tree'],
    },
    bee: {
      name:'Honeybee', title:'Honeybee senses',
      lead:'Three kinds of color sensors: ultraviolet, blue and green. Bees cannot see red but can see ultraviolet. They find directions from the “polarization” pattern of the sky.',
      facts:[
        'Honeybees have three kinds of color sensors: ultraviolet, blue and green. With no red sensor, red things look dark (blackish).',
        'The display uses the “shifted colors” common in research: green → red, blue → green, ultraviolet → blue. So blue on screen means “strong ultraviolet”, and blackish means “reflects only red”.',
        'Ultraviolet patterns on petals (nectar guides) look to bees like signs pointing to the nectar.',
        'Sky light is strongly polarized 90 degrees away from the sun. Bees sense this pattern with the upper rim of their compound eyes (dorsal rim area) and use it to find directions even when the sun is behind clouds.',
        'A worker bee has a little over 5000 ommatidia in each eye. Its sharpness is about the same as a fly or a bit better (rough guide).',
        'The sky polarization (day, dusk) is a stand-in drawn as greenish brightness for its strength, with rings around the sun.',
      ],
      pois:['Sunflower', 'White flower', 'Ball', 'Look up at the sky'],
    },
    shrimp: {
      name:'Mantis shrimp', title:'Mantis shrimp senses',
      lead:'It has 12 or more kinds of light sensors, but is bad at telling similar colors apart. It sees color only with a band across the middle of the eye, and moves the eye up and down to scan the view. It can also see polarization.',
      facts:[
        'Peacock mantis shrimp and their relatives have about 12 kinds of color-sensing cells (including ultraviolet). Humans have 3.',
        'Yet experiments show they are worse than humans at telling similar colors apart (2014).',
        'Instead of comparing colors finely with many sensors, they may quickly decide “which color group” something belongs to.',
        'The color sensors are only in a band across the middle of the eye (the midband, 6 rows). They swing the eye up and down to sweep across the view (scanning).',
        'They can tell apart not only linear but also circular polarization (a 2008 study). Light reflected from water or glass is polarized.',
        'The two eyes move independently. Even one eye alone can judge distance.',
        'Mantis shrimp live in the sea; putting one in a garden is just for comparing. Only inside the band between the yellow lines are colors shown, sorted into 12 rough groups, and the band moves up and down. Strongly polarized light shows as green stripes.',
      ],
      pois:['Pond surface', 'Window glass', 'Flower bed', 'Ball'],
    },
    dog: {
      name:'Dog', title:'Dog senses',
      lead:'Two kinds of color cones (blue and yellow-green). Red and green are hard to tell apart, and fine details are blurry. In return, dogs are good in the dark and with moving things.',
      facts:[
        'Dogs have two kinds of color cones (around blue and around yellow-green). Red and green are hard to tell apart.',
        'A red ball blends into green grass and is hard to find. Blue and yellow toys are easy to spot.',
        'Their sharpness of sight (acuity) is said to be a fraction of a human’s (about 0.2–0.3; one estimate is about 20/75 on an eye chart).',
        'Behind the retina is a reflector called the tapetum, so they see better than humans in the dark.',
        'Colors use a common formula for computing two-color vision (Viénot et al., 1999). The amount of blur is a rough guide.',
      ],
      pois:['Ball', 'Flower bed', 'Cat'],
    },
    cat: {
      name:'Cat', title:'Cat senses',
      lead:'Cats sense light in the dark many times better than humans and see well in a garden at night. They do not tell colors apart much and do not see sharply.',
      facts:[
        'In an experiment comparing cats and humans the same way, cats could see light about 5 times dimmer than humans (2009). Most of the difference comes from the eye’s build, such as the wide-opening pupil and the tapetum; the retina itself works about as well as a human’s.',
        'They have mainly two kinds of color cones and are thought to be poor at telling colors apart.',
        'Their acuity is a fraction to about a tenth of a human’s. Things right in front of the face (closer than about 25 cm) are hard to focus on (both rough guides).',
        'Eyes shine in the dark because the tapetum reflects light back (easy to see with a near-infrared camera).',
        'Night brightness, blur and the glow from the tapetum are rough guides. Try comparing with “Human” at night.',
      ],
      pois:['Mouse', 'Front door', 'Pond'],
    },
    thermo: {
      name:'Thermal', sub:'camera',
      lead:'A tool. A camera (thermography) that measures the heat infrared that things give off (wavelength 8–14 µm) and shows temperature as color. It is the same light as the snake’s pit organ, but a lens makes it sharp.',
      facts:[
        'Everything gives off infrared depending on its temperature. Things at about body temperature give off the most infrared at a wavelength of about 10 µm.',
        'Glass and water do not let heat infrared through. You cannot see through a window; the camera shows the temperature of the glass itself.',
        'On clear nights, lawns and roofs lose heat to the sky (radiative cooling) and get colder than the air. Stones and concrete warmed by the sun stay warm for a while at night.',
        'Shiny metal gives off little infrared and reflects its surroundings like a mirror, so it shows the wrong temperature (left out here).',
        'Temperatures are rough values. Colors run from 5 ℃ (black) to 40 ℃ (white). Compare day and night.',
      ],
      pois:['Person in the garden', 'Window', 'Stone', 'Cat'],
    },
    nir: {
      name:'Near-infrared', sub:'camera',
      lead:'A tool. A camera that uses invisible light just beyond red (near-infrared, 0.7–1 µm). At night, like a security camera, it lights things with the infrared light beside the camera.',
      facts:[
        'Near-infrared is invisible to the eye, but camera sensors can sense it (normal cameras block it with a filter). It is a different light from heat infrared.',
        'Plant leaves reflect near-infrared strongly, so they glow white. Satellites use this to check on plants.',
        'Water absorbs near-infrared, so the pond looks black. Blue sky is also dark in near-infrared.',
        'At night an infrared light shines on things. A cat’s eyes glow white because the tapetum reflects the light straight back.',
        'Dyes look different. The indigo of jeans lets near-infrared through, so jeans look whitish.',
        'Shown in black and white.',
      ],
      pois:['Tree and lawn', 'Pond', 'Person in the garden', 'Cat (at night)'],
    },
    cvd: {
      name:'Color vision', sub:'diversity',
      types:[['Type 1 (protan)', 'Strength'], ['Type 2 (deutan)', 'Strength'], ['Type 3 (tritan)', 'Strength'], ['Achromatopsia', '']],
      lead:'Some of the color-sensing cones work differently from other people’s, or are missing. Color vision differs between people, and each is “normal for that person”.',
      facts:[
        'Human cones come in three kinds: L (toward red), M (toward green) and S (toward blue). In type 1 (protan) the L cone, in type 2 (deutan) the M cone, and in type 3 (tritan) the S cone is missing or senses differently.',
        'In Japan, about 5% of men (1 in 20) and about 0.2% of women (1 in 500) have type 1 or 2. The L and M genes are on the X chromosome, so it is more common in men. Type 3 is very rare.',
        'With type 1 or 2, red and green, brown and green, or pink and gray can look alike. With type 1, red looks darker.',
        '“Achromatopsia”, where no cones work or almost none do, is very rare. People cannot see colors, and often are sensitive to glare and have low acuity too.',
        'Avoiding hard-to-tell color pairs, and making things distinguishable by shape or text and not only color, is called “color universal design”.',
        'Colors use a common formula for computing color vision (Machado et al., 2009). Lowering “Strength” gives a rough guide to cones that sense differently (anomalous trichromacy). Achromatopsia is shown in black and white using how rods sense brightness, with blur and glare added.',
      ],
      pois:['Ball', 'Flower bed', 'Blueberries', 'Watermelon on the table'],
    },
  };
  for (const [k, e] of Object.entries(EN)) {
    const a = ANIMALS[k];
    for (const f of ['name', 'title', 'sub', 'lead', 'types']) if (e[f] != null) a[f] = e[f];
    if (a.sub === '') delete a.sub;
    e.facts.forEach((t, i) => { a.facts[i][1] = t; });
    a.pois.forEach((p, i) => { p.name = e.pois[i]; });
    if (e.clocks) e.clocks.forEach((t, i) => { a.clocks[i][0] = t; });
  }

  Object.assign(NIGHTS.lit,   { name:'Lights on',  note:'Porch light and room lights (+ full moon)' });
  Object.assign(NIGHTS.moon,  { name:'Full moon',  note:'A full-moon night with the lights off (about 0.05–0.3 lux)' });
  Object.assign(NIGHTS.stars, { name:'Starlight',  note:'A clear night with no moon and no lights (roughly 0.001 lux)' });
  Object.assign(NIGHTS.dark,  { name:'Pitch dark', note:'A cloudy night with no moon and no lights (roughly 0.0001 lux)' });

  const GROUPS = ['For comparison', 'Animals', 'Insects', 'Tools', 'Ways humans see'];
  ANIMAL_GROUPS.forEach((g, i) => { g[0] = GROUPS[i]; });
}
