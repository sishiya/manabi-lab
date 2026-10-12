// 変化球のしくみ — 英語の上書き表（I18N.md）。日本語の表と同じ鍵・同じ順に、英語のときだけ上書きする
// 読み込みは ui-env.js のあと（PITCHES・PITCHERS・ENVS・PARTS・TOUR・CAMS がそろってから）
'use strict';

if (LANG === 'en') {
  const PITCH_EN = {
    ff: ['Four-seam', 'The usual “fastball”. Backspin gets an upward force, so it “drops less”'],
    si: ['Two-seam / sinker', 'Spin direction almost the same as the four-seam. The two-seam grip shifts the wake, so it runs toward the throwing-arm side and sinks a little'],
    fc: ['Cutter', 'Nearly fastball speed, moves just a little toward the glove side'],
    sl: ['Slider', 'Lots of spin, but very little of it is useful. Most is gyro spin, which makes no breaking force'],
    st: ['Sweeper', 'A slider that breaks far sideways (the values are an especially rough guide)'],
    cu: ['Curveball', 'Forward spin (topspin) gets a downward force, so it drops faster than gravity alone'],
    ch: ['Changeup', 'Same arm action as the fastball but slower. Less spin, so a smaller upward force'],
    fs: ['Splitter / forkball', 'Very little spin. The upward force is small, so it crosses lower than the fastball'],
    gy: ['Gyroball', 'The spin axis points along the motion (like a bullet). Lots of spin, yet no break'],
    kn: ['Knuckleball', 'Hardly spins. What moves it is not spin but the sideways force on the seams'],
    no: ['No spin', 'Without spin the Magnus force is 0. Only gravity and air resistance'],
  };
  for (const p of PITCHES) if (PITCH_EN[p.id]) [p.name, p.note] = PITCH_EN[p.id];

  const PITCHER_EN = {
    std: ['Average pitcher', 'Pitch values are rough guides to MLB averages'],
    power: ['Power pitcher (overhand)', 'Throws with the arm high. A fast fastball and a curveball that drops straight down'],
    fork: ['Forkball pitcher', 'A forkball with very little spin, dropping well below the fastball'],
    side: ['Sidearm', 'Swings the arm from the side. The spin axis tilts, so many pitches move sideways'],
    sub: ['Submarine', 'Releases close to the ground. Thrown upward from below, so pitches seem to rise'],
    lefty: ['Crafty lefty', 'Gets outs with changeups and changes of speed rather than velocity'],
    splitcurve: ['Righty: fastball, splitter, big curve', 'A fast fastball, a splitter that crosses below it, and a big dropping curve. Beats hitters with height differences'],
    knuckler: ['Knuckleballer', 'Mostly knuckleballs, with an occasional slow fastball and curve'],
  };
  for (const p of PITCHERS) if (PITCHER_EN[p.id]) [p.name, p.note] = PITCHER_EN[p.id];

  const ENV_EN = { std: 'Standard', high: 'High altitude (1600 m)', mex: 'Even higher (2240 m)', hot: 'Midsummer afternoon (35 °C)', cold: 'Cold night (5 °C)', head: 'Headwind 8 m/s', tail: 'Tailwind 8 m/s', cross: 'Crosswind 8 m/s' };
  for (const e of ENVS) if (ENV_EN[e.id]) e.name = ENV_EN[e.id];

  const CAM_EN = { catcher: "Catcher's eye", high: 'Behind home (high)', pitcher: 'Behind pitcher', ball: 'Behind ball', side: 'Side', batter: "Batter's eye", top: 'Top' };
  for (const k in CAM_EN) if (CAMS[k]) CAMS[k].name = CAM_EN[k];

  Object.assign(PARTS, {
    path: 'The computed path. Gravity, air resistance and the spin force (plus the seam force for the knuckleball) are added up every 1 ms to solve the ball\'s motion.',
    noAir: 'The path with no air (gravity only). A parabola — what a pitch would do on the Moon.',
    plain: 'The path with no spin force and no seam force (gravity and air resistance only). The gap from this is the “break”.',
    decide: 'The last point to decide to swing (green ring). Any break after this comes too late for the swing (decision-to-swing time and swing time are set with the sliders below).',
    track: 'Where the eyes can no longer keep up (white ring). Seen from the batter\'s eye the ball moves faster than 70°/s, too fast to follow smoothly (Bahill & LaRitz 1984).',
    mv50: 'Break (from 50 ft): the deviation caused by spin and seam forces from 50 feet (15.2 m) before the plate to the plate. A rough match to the way game-tracking data is often analysed, so it can be compared with MLB averages. About 20% smaller than “from release”.',
    plainMark: 'The reference point (white ring). With “Four-seam”, where a four-seam thrown with the same aiming would cross; with “No spin”, where it would cross without spin and seam forces (switch under ③ Aim). Drag it and the aim changes so the pitch crosses that point.',
    realMark: 'Where the ball actually crossed home plate. The gap from the white ring is the break caused by spin and seams.',
    target: 'The aim point (middle of the zone). “How to aim” changes how the ball is released toward it.',
    zone: 'Strike zone (43 cm wide; the height depends on the batter, so it is a rough guide).',
    ball: 'The ball at the current time. The arrows are the forces acting on it.',
    grav: 'Gravity mg = 1.42 N. Always straight down.',
    drag: 'Air resistance (drag). Opposite to the motion and proportional to speed squared. The ball slows by about 10% before the plate.',
    magnus: 'Force from spin (Magnus force). Only the part of the spin at right angles to the motion makes it. It points the way “the front face (seen by the catcher) moves”.',
    seam: 'Seam force. For the knuckleball, the seam orientation shifts where the air separates on the two sides, making a sideways force (wind-tunnel measurements). For the four-seam, two-seam and changeup, it is the force from the grip\'s seams shifting the wake (seam-shifted wake; size is a guide matched to MLB averages).',
    plate: 'The front edge of home plate. The position and speed are computed where the ball crosses it.',
    rubber: 'The pitcher\'s rubber. The ball leaves the hand about 1.9 m in front of it.',
    many: '10 pitches with the same aim, varying only the seam angle (±20°), the slow spin (0–60 rpm) and the spin-axis direction (the spread is this app\'s assumption). Each path is smooth, yet they end up all over the place.',
    axis: 'Spin axis (right-hand thumb; the ball turns the way the fingers curl).',
    ballDrag: 'The ball as seen by the catcher. <b>Drag</b> it and the spin direction changes so the front face moves the way you rubbed (for the knuckleball, the spin axis).',
  });

  const TOUR_EN = [
    'Three forces act on the ball: <b>gravity</b>, <b>air resistance</b> and the <b>force from spin</b>. The break is not set by the pitch name; the path is solved by computing these forces every 1 ms from the release speed, direction and spin. Try the time slider below. You can drag the 3D view to rotate it.',
    'If there were no air (<span class="k-noair">faint line</span>): gravity only, so a parabola. Even at 151 km/h the ball drops about 80 cm in the 0.4 s to the plate.',
    'With air, <b>drag</b> slows the ball (about 10% slower at the plate). But without spin it doesn\'t curve sideways or upward.',
    '<b>Four-seam</b>: 2300 rpm of backspin. The front face moving up pushes air downward, and the reaction is an <b>upward force (Magnus force)</b>. It crosses about 45 cm above the no-spin path (<span class="k-plain">dotted</span>) — that is why it “seems to rise”.',
    '<b>Aim point</b> (cross): right now the ball is released “in the direction that would reach the middle without spin force”. So <b>the gap from the middle = the break from spin and seams</b>. The fastball goes 46 cm up, above the zone. Set “How to aim” below to “point straight at the middle” and the drop from gravity is included in the gap too.',
    'The <b>airflow cross-section</b>: moving along with the ball, the air flows from left to right. With backspin the top surface moves with the air, so the air <b>separates</b> later only on top, and the flow behind (the wake) bends downward. The reaction to pushing air down pushes the ball up — that is the Magnus force. The 3D view is now “Behind ball”.',
    '<b>Slider</b>: more spin than the four-seam, yet less break. The spin axis is close to the direction of motion (gyro spin), so little of the spin can bend the ball. What happens if you set “Useful spin” below to 100%…?',
    '<b>Curveball</b>: the front face moves down (topspin). The Magnus force points down and adds to gravity, so it drops a lot. It is slow, so it also takes longer to reach the plate (0.47 s).',
    '<b>Knuckleball</b>: it hardly spins, so the Magnus force is nearly 0. Instead, the <b>seam orientation</b> shifts where the air separates on each side, making a sideways force. This is the <b>two-seam</b> grip used by many knuckleballers, with forces from wind-tunnel measurements (Morrissey 2009). With a slow spin, the force changes size and direction during the flight. “Seam grip” can switch it to four seams (Watts &amp; Sawyer 1975).',
    '<b>10 pitches</b> with the same aim, varying only the seam angle, the slow spin and its axis by as much as a pitcher can\'t control. They end up all over the plate, yet each path is <b>smooth</b> — just like game data (Nathan 2012). The knuckleball seems to “dance” because <b>tiny differences change where it goes, and nobody can predict it</b>.',
    '<b>Two-seam</b>: the spin direction is almost the same as the four-seam (MLB data, Nathan 2023), yet it runs far toward the throwing-arm side. With a two-seam grip and a little gyro spin, <b>a seam stays on one side</b>; the air separates differently there and the wake shifts (seam-shifted wake). The <span style="color:#5ce0a0">green arrow</span> is that force.',
    '<b>Arm angle</b>: swinging the arm from the side makes the release point lower and wider, and tilts the spin direction sideways (spin direction is mostly set by arm angle, Nathan 2023). This is a fictional sidearm pitcher. Move the “Arm angle” slider below and the figure and path change together.',
    '<b>Air and wind</b>: at a 1600 m ballpark the air is 18% thinner, so drag and Magnus force are 18% smaller. The four-seam\'s break goes from 46 to 38 cm upward. The <span class="k-std">light-blue line</span> is the same pitch in standard air (20 °C, sea level).',
    '<b>Headwind</b> 8 m/s: the speed relative to the air goes up, so drag and Magnus force grow and the ball breaks more (a tailwind does the opposite). What sets the forces is not speed over the ground but <b>speed relative to the air</b>.',
    '<b>Overlaying pitches</b>: a fictional power pitcher throws four pitch types released in <b>the same direction</b> as the fastball. Slower pitches take longer to reach the plate and drop more under gravity, so the curveball hits the ground. That is why pitchers release each pitch in a different direction (try “each aims the same way” below).',
    '<b>The batter\'s eye</b>: if the swing takes 0.15 s and starting it takes 0.15 s after deciding, the last moment to decide is about 0.1 s after release (<span style="color:#7fd68a">green ring</span>, about 12 m before the plate). By then the fastball is only 4 cm off the no-spin path. Over 90% of the break happens after the decision. Past the <b>white ring</b>, the ball moves too fast (70°/s) to follow smoothly with the eyes.',
    '<b>Pitch types at decision time</b>: four pitches of a fictional power pitcher, each released “in the direction that would reach the middle without spin force”. When the green part of the strip ends (the last moment to decide), the pitches are <b>less than one ball width</b> apart (0.25°) from the batter\'s eye, but up to about <b>80 cm</b> apart at the plate. Set the time slider to the end of the green and compare them from the batter\'s eye.',
    '<b>Getting closer to reality</b>: spin slowly decaying, the buoyancy of air, the air around the ball moving with it (added mass) and Earth\'s rotation (Coriolis force) are all computed too. Each moves the ball at the plate by only 1–2 mm. What changes the answer most is the uncertainty of the air-force coefficients (formulas built from measurements): switching the lift formula to one from another measurement moves it by about 1 cm (“Getting closer to reality” below).',
    'Try it yourself. Choose the throwing hand and pitch below, and change the speed, spin rate, spin direction (drag the ball on the right) and useful spin — it recomputes right away.',
  ];
  TOUR_EN.forEach((t, i) => { if (TOUR[i]) TOUR[i].text = t; });
}
