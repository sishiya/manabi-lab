// ジオラマに見えるわけ — 後処理（3段）
//  1. すき間の暗がり（SSAO）: 深さの絵から、まわりにふさがれている所を暗くする（半分の解像度＋4×4 でならす）
//     考え方は Crytek の SSAO と、three.js の SSAOShader（MIT）の半球の点の取り方。コードは自前
//  2. ぼけと色: ぼけの円の半径 r（絵の高さを1とする割合）を画素ごとに決め、円の中を黄金角でならべた 64 点で集める（1パス）。
//     帯（写真の加工）: 好きな角度の線からはなれるほど r を大きく（考え方は glfx.js の tiltShift。MIT。コードは自前）
//     奥行き（レンズの式）: 薄いレンズのぼけの円 r = Kf·|1/z0 − 1/z|（Held ほか 2010 と同じ形）
//     集め方は帯と奥行きで分ける（main の中の説明）。光の量（リニア）でぼかし、そのあと露出・トーンマッピング・ガンマ・彩度
//  3. 角のギザギザをならす（FXAA。Lottes の方法の簡単な版）＋ごく弱い周辺減光と粒子（写真のレンズとフィルムの感じ）
// coc の式は Blur.cocBand・cocDepth（measure.js が使う）と同じにしておくこと。
'use strict';
const Blur = (() => {
  const RAMP = 0.35;   // 帯のふちから、ぼけが最大になるまでの長さ（絵の高さの割合）

  function cocBand(u, v, P) {
    const nx = -Math.sin(P.ang), ny = Math.cos(P.ang);
    const px = (u - 0.5) * P.aspect, py = v - 0.5;
    const dd = Math.abs(px * nx + py * ny - (P.pos - 0.5));
    return P.R * Math.min(1, Math.max(0, (dd - P.halfW) / RAMP));
  }
  const CMAX = 0.09;   // 描けるぼけの半径の上限（絵の高さの割合。シェーダーの 0.09 と同じ）
  function cocDepth(z, P) { return Math.min(P.kf * Math.abs(1 / P.z0 - 1 / z), CMAX); }

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  // 1a. SSAO（半分の解像度）
  const KN = 12, kernel = [];
  for (let i = 0; i < KN; i++) {   // 半球の中の点。中心に近いほど多く
    const a = i * 2.3999632, z = 0.15 + 0.85 * ((i * 0.618034) % 1), r = Math.sqrt(1 - z * z), s = 0.25 + 0.75 * Math.pow((i + 1) / KN, 2);
    kernel.push(new THREE.Vector3(Math.cos(a) * r * s, Math.sin(a) * r * s, z * s));
  }
  const aoFrag = `
    uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform vec2 uPx; uniform float uRad;
    uniform vec3 uK[${KN}];
    varying vec2 vUv;
    vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
    void main() {
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = vpos(vUv);
      vec3 pr = vpos(vUv + vec2(uPx.x, 0.0)), pl = vpos(vUv - vec2(uPx.x, 0.0)), pu = vpos(vUv + vec2(0.0, uPx.y)), pd = vpos(vUv - vec2(0.0, uPx.y));
      vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;   // 段差の向こう側を使わない
      vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
      vec3 n = normalize(cross(dx, dy));
      float ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;   // 画素ごとに回す
      vec3 rv = vec3(cos(ang), sin(ang), 0.0);
      vec3 t = normalize(rv - n * dot(rv, n)), b = cross(n, t);
      mat3 tbn = mat3(t, b, n);
      float occ = 0.0;
      for (int i = 0; i < ${KN}; i++) {
        vec3 s = p + tbn * uK[i] * uRad;
        vec4 c = uProj * vec4(s, 1.0); vec2 suv = c.xy / c.w * 0.5 + 0.5;
        float sz = vpos(suv).z;
        float range = smoothstep(0.0, 1.0, uRad / max(abs(p.z - sz), 1e-3));
        occ += (sz >= s.z + 0.15 ? 1.0 : 0.0) * range;
      }
      gl_FragColor = vec4(vec3(1.0 - occ / float(${KN})), 1.0);
    }`;
  // 1b. 4×4 でならす（回し方の模様を消す）
  const aoBlurFrag = `
    uniform sampler2D tAO; uniform vec2 uPx; varying vec2 vUv;
    void main() { float s = 0.0; for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) s += texture2D(tAO, vUv + (vec2(x, y) + 0.5) * uPx).r; gl_FragColor = vec4(vec3(s / 16.0), 1.0); }`;

  // 2. ぼけと色
  const frag = `
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO; uniform sampler2D tPhoto; uniform sampler2D tPD;
    uniform float uNear, uFar, uAspect, uR, uPos, uHalfW, uZ0, uKf, uSat, uCon, uH, uExp, uAOk, uAlpha, uBeta;
    uniform vec2 uN; uniform int uMode, uPhoto;
    varying vec2 vUv;
    // 距離の逆数（1/m）。3D は深さの絵から、写真は推定した奥行き D（16bit を R・G に分けたもの）から α·D + β
    float invz(vec2 uv) {
      if (uPhoto == 1) { vec2 rg = texture2D(tPD, uv).rg * 255.0; return uAlpha * (rg.x * 256.0 + rg.y) / 65535.0 + uBeta; }
      float d = texture2D(tDepth, uv).x; return (uFar - (uFar - uNear) * d) / (uNear * uFar);
    }
    float coc(vec2 uv) {
      if (uMode == 1) {
        vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
        float dd = abs(dot(p, uN) - (uPos - 0.5));
        return uR * clamp((dd - uHalfW) / ${RAMP.toFixed(3)}, 0.0, 1.0);
      }
      if (uMode == 2) return min(uKf * abs(1.0 / uZ0 - invz(uv)), ${CMAX.toFixed(3)});
      return 0.0;
    }
    vec3 lit(vec2 uv) {
      if (uPhoto == 1) return pow(texture2D(tPhoto, uv).rgb, vec3(2.2));   // 写真はガンマをはずして光の量に
      return texture2D(tColor, uv).rgb * mix(1.0, texture2D(tAO, uv).r, uAOk);
    }
    void main() {
      vec3 acc = lit(vUv); float ws = 1.0;
      float r = coc(vUv), cz = uMode == 2 ? invz(vUv) : 0.0;
      if (r * uH > 0.5) {
        for (int i = 0; i < 64; i++) {
          float t = float(i) + 0.5;
          float rr = sqrt(t / 64.0) * r, a = t * 2.3999632;
          vec2 o = vec2(cos(a), sin(a)) * rr;
          vec2 suv = vUv + vec2(o.x / uAspect, o.y);
          // 帯（写真の加工）: 円の中を同じ重みで（片がわの点だけ足すと、ぼけが大きくなる向きへ絵がずれて拡大して見える）
          // 奥行き: 前にあって、ぼけが中心まで届かない点だけ外す（ピントの合った前の物が、うしろのぼけへにじまないように）。ほかは同じ重み
          float w = 1.0;
          if (uMode == 2 && invz(suv) > cz) w = clamp((coc(suv) - rr) * uH + 1.0, 0.0, 1.0);
          acc += w * lit(suv); ws += w;
        }
      }
      vec3 c = acc / ws;                                          // ここまでは光の量（リニア）でぼかす
      if (uPhoto == 1) c = pow(c, vec3(1.0 / 2.2));              // 写真は元の明るさにもどすだけ（ぼけなしなら元の写真と同じ）
      else {
        c *= uExp;
        c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);   // トーンマッピング（ACES の近似。Narkowicz 2015）
        c = pow(c, vec3(1.0 / 2.2));                              // 画面の明るさへ
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;

  // 3. FXAA＋周辺減光＋粒子（動かない粒子。ちらつかせない）
  const finFrag = `
    uniform sampler2D tIn; uniform vec2 uPx; uniform float uAspect; uniform int uRaw; varying vec2 vUv;
    float lu(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 nw = texture2D(tIn, vUv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tIn, vUv + vec2(1.0, -1.0) * uPx).rgb;
      vec3 sw = texture2D(tIn, vUv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tIn, vUv + vec2(1.0, 1.0) * uPx).rgb;
      vec3 m = texture2D(tIn, vUv).rgb;
      if (uRaw == 1) { gl_FragColor = vec4(m, 1.0); return; }   // 写真はそのまま（角のならし・周辺減光・粒子をかけない）
      float lnw = lu(nw), lne = lu(ne), lsw = lu(sw), lse = lu(se), lm = lu(m);
      float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
      vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
      float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uPx;
      vec3 a = 0.5 * (texture2D(tIn, vUv - dir / 6.0).rgb + texture2D(tIn, vUv + dir / 6.0).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tIn, vUv - dir * 0.5).rgb + texture2D(tIn, vUv + dir * 0.5).rgb);
      float lb = lu(b);
      vec3 c = (lb < lmin || lb > lmax) ? a : b;
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - 0.10 * smoothstep(0.35, 1.0, length(q) / (0.5 * length(vec2(uAspect, 1.0))));
      c += (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`;

  function create(renderer) {
    const hdr = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');   // 光の量を 1 をこえて持てる
    const LIN = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const rt = new THREE.WebGLRenderTarget(4, 4, Object.assign({ type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType }, LIN));
    rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
    const ao1 = new THREE.WebGLRenderTarget(4, 4, LIN), ao2 = new THREE.WebGLRenderTarget(4, 4, LIN), mid = new THREE.WebGLRenderTarget(4, 4, LIN);
    const pass = (frag, uniforms) => {
      const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
      const sc = new THREE.Scene(); sc.add(q); return { sc, u: uniforms };
    };
    const aoP = pass(aoFrag, { tDepth: { value: rt.depthTexture }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uPx: { value: new THREE.Vector2() }, uRad: { value: 4 }, uK: { value: kernel } });
    const aoB = pass(aoBlurFrag, { tAO: { value: ao1.texture }, uPx: { value: new THREE.Vector2() } });
    const main = pass(frag, {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, tAO: { value: ao2.texture }, uNear: { value: 1 }, uFar: { value: 1 }, uAspect: { value: 1 },
      uR: { value: 0 }, uPos: { value: 0.5 }, uHalfW: { value: 0.1 }, uZ0: { value: 500 }, uKf: { value: 0 }, uSat: { value: 1 }, uCon: { value: 1 },
      uH: { value: 4 }, uExp: { value: 1 }, uAOk: { value: 0.85 }, uN: { value: new THREE.Vector2(0, 1) }, uMode: { value: 0 },
      tPhoto: { value: null }, tPD: { value: null }, uPhoto: { value: 0 }, uAlpha: { value: 1 }, uBeta: { value: 0 },
    });
    const fin = pass(finFrag, { tIn: { value: mid.texture }, uPx: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uRaw: { value: 0 } });
    const pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      setSize(w, h) {
        rt.setSize(w, h); mid.setSize(w, h);
        const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1); ao1.setSize(hw, hh); ao2.setSize(hw, hh);
        aoP.u.uPx.value.set(1 / hw, 1 / hh); aoB.u.uPx.value.set(1 / hw, 1 / hh);
        main.u.uH.value = h; fin.u.uPx.value.set(1 / w, 1 / h);
      },
      // photo: { tex, dtex, alpha, beta }（写真の場面のとき）。null なら 3D の町を描く
      render(scene, camera, P, photo) {
        const u = main.u, ph = !!photo;
        u.uPhoto.value = fin.u.uRaw.value = ph ? 1 : 0;
        if (ph) { u.tPhoto.value = photo.tex; u.tPD.value = photo.dtex; u.uAlpha.value = photo.alpha; u.uBeta.value = photo.beta; }
        u.uNear.value = camera.near; u.uFar.value = camera.far; u.uAspect.value = camera.aspect; fin.u.uAspect.value = camera.aspect;
        u.uMode.value = P.mode; u.uR.value = P.R; u.uPos.value = P.pos; u.uHalfW.value = P.halfW;
        u.uN.value.set(-Math.sin(P.ang), Math.cos(P.ang)); u.uZ0.value = P.z0; u.uKf.value = P.kf;
        u.uSat.value = P.sat; u.uExp.value = P.exp || 1; u.uCon.value = 1 + (P.sat - 1) * 0.35;
        aoP.u.uProj.value.copy(camera.projectionMatrix); aoP.u.uProjInv.value.copy(camera.projectionMatrixInverse);
        if (!ph) {
          renderer.setRenderTarget(rt); renderer.render(scene, camera);
          renderer.setRenderTarget(ao1); renderer.render(aoP.sc, pCam);
          renderer.setRenderTarget(ao2); renderer.render(aoB.sc, pCam);
        }
        renderer.setRenderTarget(mid); renderer.render(main.sc, pCam);
        renderer.setRenderTarget(null); renderer.render(fin.sc, pCam);
      },
    };
  }
  return { create, cocBand, cocDepth, RAMP, CMAX };
})();
