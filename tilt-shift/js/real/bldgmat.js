// ジオラマに見えるわけ — 本物の形の建物（PLATEAU の質感なし LOD2）に、町の場面と同じ作り方の質感をつける
//   頂点の aBld = (用途の種類, 1階の高さ m, 建物ごとの乱数 0〜1, 建物の足もとの高さ)。面の向きは世界の法線から（どんな形の面でも窓が並ぶ）
//   種類: 0 家・1 集合住宅（ベランダの帯）・2 事務所（ガラスと腰壁の帯）・3 商業（1階は店・上は窓・ときどき看板の面）・4 倉庫・工場（波板・窓少し）
'use strict';
const RealBldg = (() => {
  // PLATEAU の属性 → [種類, 1階の高さ, 乱数]
  function kind(bt, b) {
    const u = (bt['bldg:usage'] || [])[b] || '', st = (bt['bldg:storeysAboveGround'] || [])[b], h = (bt['bldg:measuredHeight'] || [])[b];
    const id = String((bt.gml_id || bt['gml:id'] || [])[b] || b); let r = 0; for (let i = 0; i < id.length; i++) r = (r * 31 + id.charCodeAt(i)) % 1000003; r = (r % 1000) / 1000;
    let k = /共同住宅/.test(u) ? 1 : /住宅/.test(u) ? 0 : /業務|官公庁|文教|宿泊|医療/.test(u) ? 2 : /商業/.test(u) ? 3 : /倉庫|工場|供給|農林/.test(u) ? 4 : (h > 12 ? 3 : 0);
    if (k === 0 && h > 13) k = 1;   // 高い「住宅」は集合住宅として描く
    const area = (bt['uro:BuildingDetailAttribute_uro:buildingRoofEdgeArea'] || [])[b] || 0;
    if (area > 2500 && h > 20 && (k === 3 || k === 4)) k = 5;   // 大きな店（デパート・駅ビル）: 窓の少ないパネルの壁
    if (area > 1500 && h > 45 && k !== 1) { k = 2; r = 0.6 + r * 0.4; }   // 大きな高いビル: ガラスのオフィス（下の p > 0.55）
    const fh = st && h ? Math.min(5, Math.max(2.6, h / st)) : [2.9, 2.9, 3.8, 3.6, 5][k];
    return [k, fh, r];
  }
  const V = `attribute vec4 aBld; varying vec4 vBld;`;
  const F = `
    vec3 wn = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
    float K = floor(vBld.x + 0.5), fh = vBld.y, rr = floor(vBld.z * 997.0 + 0.5) / 997.0, y = vWP.y - vBld.w;
    // 壁の色: 種類ごとの色の組から、建物ごとに（白・明るい灰・ベージュ・タイルの茶・れんが）
    float p = fract(rr * 7.13);
    vec3 wall = p < 0.3 ? vec3(0.62, 0.6, 0.56) : p < 0.5 ? vec3(0.55, 0.53, 0.49) : p < 0.65 ? vec3(0.5, 0.45, 0.38) : p < 0.78 ? vec3(0.66, 0.65, 0.62) : p < 0.88 ? vec3(0.42, 0.36, 0.3) : vec3(0.34, 0.24, 0.19);
    if (K > 3.5 && K < 4.5) wall = mix(vec3(0.5, 0.52, 0.52), vec3(0.42, 0.45, 0.47), p);
    if (K > 4.5) wall = mix(vec3(0.6, 0.58, 0.54), vec3(0.48, 0.47, 0.45), p);
    if (K > 1.5 && K < 2.5 && p > 0.55) wall = mix(vec3(0.2, 0.24, 0.28), vec3(0.35, 0.4, 0.44), fract(rr * 3.7));   // ガラスの多い事務所
    wall *= 0.62 + 0.36 * fract(rr * 5.9);   // 明るさは建物ごとに大きくばらつく（白が飛びすぎない・くすみ）
    vec3 c = wall * (0.9 + 0.2 * fract(rr * 13.1));
    float rough = 0.85, metal = 0.0;
    if (abs(wn.y) < 0.45) {
      vec3 tang = normalize(vec3(-wn.z, 0.0, wn.x));
      float along = dot(vWP, tang) + rr * 37.0;
      float fl = fract(y / fh), flo = floor(y / fh);
      // 窓のへこみ（視線から奥を求める）
      vec3 Vv = normalize(cameraPosition - vWP); float vn = max(0.15, dot(Vv, wn)); vec2 vt = vec2(dot(Vv, tang), Vv.y);
      float cw = (K < 0.5 ? 3.6 : K < 1.5 ? 3.1 : K < 2.5 ? 1.8 : K < 3.5 ? 3.0 : 6.0) * (0.8 + 0.45 * fract(rr * 2.3));   // 窓の間隔は建物ごとに
      float ww = fract(rr * 4.7);
      vec4 R = K < 0.5 ? vec4(0.25, 0.7, 0.35, 0.78) : K < 1.5 ? vec4(0.08, 0.92, 0.05, 0.8) : K < 2.5 ? (ww < 0.5 ? vec4(0.06, 0.94, 0.08, 0.7) : vec4(0.0, 1.0, 0.25, 0.72)) : K < 3.5 ? vec4(0.15 + 0.2 * ww, 0.85 - 0.2 * ww, 0.3, 0.8) : vec4(0.4, 0.6, 0.6, 0.8);   // 事務所の半分は横に続く帯の窓
      float dep = K < 1.5 ? 0.15 : 0.25;
      vec2 P = vec2(along, y), base = floor(P / vec2(cw, fh)) * vec2(cw, fh), f = (P - base) / vec2(cw, fh), f2 = (P - vt / vn * dep - base) / vec2(cw, fh);
      float inW = step(R.x, f.x) * step(f.x, R.y) * step(R.z, f.y) * step(f.y, R.w), inW2 = step(R.x, f2.x) * step(f2.x, R.y) * step(R.z, f2.y) * step(f2.y, R.w);
      float id = flo * 37.0 + floor(along / cw), h = kH2(vec2(id, rr * 31.0));
      vec3 glass = vec3(0.05, 0.055, 0.06) * (0.7 + 0.8 * h) + (h > 0.72 ? vec3(0.15, 0.14, 0.12) : vec3(0.0));
      float shop = (K > 0.5 && K < 3.5 && y < 3.6) ? 1.0 : 0.0;
      if (K > 4.5) {   // 大きな店: 大きなパネル・横の細い窓の帯がたまに・上に店の名前の帯
        vec2 pn = vec2(along / 3.0, y / 1.5); c *= 0.95 + 0.07 * kH2(floor(pn)) - 0.06 * (step(0.96, fract(pn.x)) + step(0.94, fract(pn.y)));
        float band = step(fract(y / (fh * 3.0)), 0.12) * step(8.0, y);
        c = mix(c, vec3(0.06, 0.07, 0.08), band * 0.85);
        if (y < 4.0) { float g = step(0.08, fract(along / 6.0)) * step(0.3, y) * step(y, 3.2); c = mix(c, vec3(0.04), g); }
        inW = 0.0;
      }
      if (K < 4.5 && y > 0.3 && shop < 0.5 && (K < 3.5 || y > 1.5)) {
        if (inW > 0.5) {
          if (inW2 > 0.5) { c = glass * (1.0 - 0.4 * smoothstep(R.w - 0.2 * (R.w - R.z), R.w, f2.y)); rough = 0.06; metal = 0.5; }
          else c *= 0.55;   // へこみの内側
        }
        if (K > 0.5 && K < 1.5) {   // ベランダ: 手すりの帯（明るい）と床の陰
          float rail = step(0.0, fl) * step(fl, 0.36);
          c = mix(c, wall * 1.08, rail * 0.92);
          c *= 1.0 - 0.35 * step(0.36, fl) * step(fl, 0.42);
        }
        if (K > 1.5 && K < 2.5) c = mix(c, wall * 0.8, step(0.72, fl) * 0.9);   // 腰壁の帯
        if (K > 2.5 && K < 3.5 && fract(rr * 5.3) > 0.75 && y > fh * 1.5 && y < fh * 4.0 && fract(along / 23.0) < 0.35) {   // 看板の面
          vec3 sc = fract(rr * 9.1) < 0.55 ? vec3(0.66, 0.64, 0.6) : fract(rr * 9.1) < 0.7 ? vec3(0.36, 0.12, 0.1) : vec3(0.1, 0.17, 0.32);
          c = sc * (0.85 + 0.3 * step(0.5, fract(y * 0.9)) * step(0.15, fract(along * 0.31)));
        }
      } else if (shop > 0.5) {   // 1階の店: ガラス・シャッター・ひさしの看板
        float bay = floor(along / 5.5), fb = fract(along / 5.5), hb = kH2(vec2(bay, rr * 91.0));
        float g = step(0.06, fb) * step(fb, 0.94) * step(0.15, y) * step(y, 2.6);
        c = mix(c * 0.8, hb > 0.86 ? vec3(0.4, 0.4, 0.38) : vec3(0.03, 0.035, 0.04) + vec3(0.1, 0.09, 0.07) * kN(vec3(along * 2.0, y * 2.0, rr)), g);
        if (g > 0.5) { rough = 0.08; metal = 0.3; }
        vec3 sg = hb < 0.2 ? vec3(0.5, 0.07, 0.05) : hb < 0.35 ? vec3(0.04, 0.15, 0.4) : hb < 0.48 ? vec3(0.7, 0.5, 0.1) : hb < 0.6 ? vec3(0.07, 0.28, 0.12) : vec3(0.72);
        c = mix(c, sg, step(2.7, y) * step(y, 3.4) * 0.9);
      }
      if (K > 3.5) c *= 0.93 + 0.1 * step(0.5, fract(along / 0.2));   // 波板
      // 雨だれ・下ほど暗い・上のふちは明るい
      float st = kN(vec3(along * 1.4, vWP.y * 0.05, rr * 40.0)) * kN(vec3(along * 0.3, vWP.y * 0.02, rr * 7.0));
      c *= 1.0 - 0.18 * smoothstep(0.3, 0.6, st);
      c *= mix(0.8, 1.0, smoothstep(0.0, 5.0, y));
      c *= 1.0 - 0.12 * smoothstep(0.55, 0.85, kN(vec3(along * 0.25, y * 0.015, rr * 3.0)));   // 上から流れる大きな黒ずみ
      c *= 0.93 + 0.14 * kF(vWP * 0.04 + rr * 5.0);
    } else if (wn.y < 0.97 && wn.y > 0.45) {
      // かたむいた屋根（家・倉庫）: 瓦やスレートの色と段
      float q = fract(rr * 5.7);
      vec3 rc = q < 0.3 ? vec3(0.13, 0.14, 0.15) : q < 0.5 ? vec3(0.2, 0.22, 0.25) : q < 0.65 ? vec3(0.26, 0.2, 0.16) : q < 0.8 ? vec3(0.32, 0.33, 0.34) : vec3(0.18, 0.22, 0.28);
      if (K > 3.5) rc = vec3(0.45, 0.47, 0.47);
      c = rc * (0.85 + 0.25 * step(0.25, fract(vWP.y * 3.2 + dot(vWP.xz, vec2(0.3)))) ) * (0.85 + 0.3 * kF(vWP * 0.3 + rr * 7.0));
      rough = 0.6;
    } else {
      // 平らな屋上: 防水の色（明るい灰が多い・ときどき緑がかった灰）と継ぎ目・しみ
      float q = fract(rr * 7.31);
      vec3 rc = q < 0.55 ? vec3(0.26 + q * 0.22) : q < 0.72 ? vec3(0.26, 0.27, 0.26) : q < 0.86 ? vec3(0.27, 0.25, 0.22) : vec3(0.45, 0.45, 0.43);
      rc *= 1.0 - 0.25 * smoothstep(0.6, 0.8, kF(vWP * 0.4 + rr * 9.0));   // しみ
      rc *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.04, abs(fract(vWP.x + rr * 3.0) - 0.5) - 0.46));
      rc *= 0.9 + 0.18 * kF(vWP * vec3(0.12, 0.0, 0.12) + rr * 13.0);
      c = rc; rough = 0.9;
    }
    diffuseColor.rgb = c; gRough = rough; gMetal = metal;`;
  function material() {
    const m = Kit.mat('plateau-bldg', { roughness: 0.85, envMapIntensity: 0.45 }, F);
    const ob = m.onBeforeCompile;
    m.onBeforeCompile = sh => { ob(sh);
      sh.vertexShader = V + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBld = aBld;');
      sh.fragmentShader = 'varying vec4 vBld;\n' + sh.fragmentShader; };
    m.userData.shared = true;
    return m;
  }
  return { kind, material };
})();
