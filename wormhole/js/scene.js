// 宇宙に置く3Dの天体と太陽（星の絵と同じ作りものだが、距離があるので動くと見え方が変わる）。座標は世界の座標で、単位は のどの半径 ρ。
// kind: 0 輪のあるガス惑星、1 海と雲の星、2 岩の月、3 青い帯のガス惑星、4 太陽（自分で光る）
// 3 つずつ（R = 0 はいないのと同じ）。place.km は のどの半径 ρ の km。
'use strict';

const nrm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

const NO_RING = { axis: [0, 0, 1], inner: 1e6, outer: 1e6 + 1 };
const NOBODY = { c: [0, 0, 1e6], R: 0, kind: 2 };

const R_SUN_KM = 695700;      // 太陽の半径（IAU 2015 の値）
const L_SUN_W = 3.828e26;     // 太陽の光度（IAU 2015 の値）
const SOLAR_CONST = 1361;     // 太陽定数 W/m²
const R_EARTH_KM = 6371;
const SUN_THROAT_KM = 20000;  // 太陽のそばの場面の のどの半径（太陽とくらべて見える大きさにした。仮定）

const PLACES = {
  normal: { km: 1, film: 0.22, A: { sun: nrm3([0.62, 0.52, 0.58]), gain: 0.15, bodies: [
      { c: [-14, 12, -6], R: 4.4, kind: 0 },
      { c: [21, -8, 3], R: 3.2, kind: 1 },
      { c: [-20, -13, 9], R: 1.2, kind: 2 },
    ] },
    B: { sun: nrm3([0.42, -0.72, 0.55]), gain: 0.15, bodies: [
      { c: [24, 11, -4], R: 6.2, kind: 3 },
      { c: [12, -10, 7], R: 1.5, kind: 2 },
      { c: [-16, 12, -10], R: 2.6, kind: 1 },
    ] },
    ring: { axis: nrm3([0.28, 0.32, 0.9]), inner: 6.0, outer: 11.2 } },
  // 太陽の中心は のどから 70ρ = 140 万 km（表面から約 70 万 km 上）。+x の側にカメラがあるので、穴のうしろに太陽が見える
  sun: { km: SUN_THROAT_KM, film: 0.15, sunDistRho: 70, A: { sun: nrm3([-1, 0, 0]), gain: 0, bodies: [
      { c: [-70, 0, 0], R: R_SUN_KM / SUN_THROAT_KM, kind: 4 }, NOBODY, NOBODY,
    ] },
    B: { sun: nrm3([0.42, -0.72, 0.55]), gain: 0.15, bodies: [
      { c: [24, 11, -4], R: 6.2, kind: 3 },
      { c: [12, -10, 7], R: 1.5, kind: 2 },
      { c: [-16, 12, -10], R: 2.6, kind: 1 },
    ] },
    ring: NO_RING },
};
let SCENE = PLACES.normal;

// のどを通りぬける太陽の光（W）と、地球全体が太陽から受ける光の何倍か。のどの断面はどの向きの光にも πρ² なので、P = πρ² ∫I dΩ。
// 一様な円盤（見かけの半径 α）で ∫I dΩ = 2πI(1 − cos α)、L = 4π²R²I より P = L ρ²(1 − cos α)/(2R²)。周辺減光は入れない
function sunThroughThroat(rhoKm, distKm) {
  const sinA = R_SUN_KM / distKm, W = L_SUN_W * (rhoKm * rhoKm) * (1 - Math.sqrt(1 - sinA * sinA)) / (2 * R_SUN_KM * R_SUN_KM);
  const earth = SOLAR_CONST * Math.PI * Math.pow(R_EARTH_KM * 1000, 2);
  return { W, earthTimes: W / earth };
}
