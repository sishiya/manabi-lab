// ジオラマに見えるわけ — ぼかしと色（後処理のシェーダー1枚）
// ぼけの円の半径 r（絵の高さを1とする割合）を画素ごとに決め、円の中を黄金角でならべた 64 点で集める（1パス）。
//   帯（写真の加工）: 好きな角度の線からはなれるほど r を大きく（考え方は glfx.js の tiltShift。MIT。コードは自前）
//   奥行き（本物のレンズ）: 薄いレンズのぼけの円 r = Kf·|1/z0 − 1/z|（Held ほか 2010 と同じ形）
// 集めるとき、その点自身のぼけが中心まで届く点だけ足す（ピントの合った物のふちが、うしろのぼけへにじまないように）。
// coc の式は measure.js の Blur.cocBand と同じにしておくこと。
'use strict';
const Blur = (() => {
  const RAMP = 0.35;   // 帯のふちから、ぼけが最大になるまでの長さ（絵の高さの割合）

  // 帯モードのぼけ（CPU 用。シェーダーの coc と同じ式）
  function cocBand(u, v, P) {
    const nx = -Math.sin(P.ang), ny = Math.cos(P.ang);
    const px = (u - 0.5) * P.aspect, py = v - 0.5;
    const dd = Math.abs(px * nx + py * ny - (P.pos - 0.5));
    return P.R * Math.min(1, Math.max(0, (dd - P.halfW) / RAMP));
  }
  function cocDepth(z, P) { return Math.min(P.kf * Math.abs(1 / P.z0 - 1 / z), 0.06); }

  const frag = `
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform float uNear, uFar, uAspect, uR, uPos, uHalfW, uZ0, uKf, uSat, uCon, uH, uExp;
    uniform vec2 uN; uniform int uMode;
    varying vec2 vUv;
    float distAt(vec2 uv) { float d = texture2D(tDepth, uv).x; return (uNear * uFar) / (uFar - (uFar - uNear) * d); }
    float coc(vec2 uv) {
      if (uMode == 1) {
        vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
        float dd = abs(dot(p, uN) - (uPos - 0.5));
        return uR * clamp((dd - uHalfW) / ${RAMP.toFixed(3)}, 0.0, 1.0);
      }
      if (uMode == 2) return min(uKf * abs(1.0 / uZ0 - 1.0 / distAt(uv)), 0.06);
      return 0.0;
    }
    void main() {
      vec3 acc = texture2D(tColor, vUv).rgb; float ws = 1.0;
      float r = coc(vUv);
      if (r * uH > 0.5) {
        for (int i = 0; i < 64; i++) {
          float t = float(i) + 0.5;
          float rr = sqrt(t / 64.0) * r, a = t * 2.3999632;
          vec2 o = vec2(cos(a), sin(a)) * rr;
          vec2 suv = vUv + vec2(o.x / uAspect, o.y);
          float w = clamp((coc(suv) - rr) * uH + 1.0, 0.0, 1.0);
          acc += w * texture2D(tColor, suv).rgb; ws += w;
        }
      }
      vec3 c = acc / ws * uExp;                                   // ここまでは光の量（リニア）でぼかす
      c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);   // トーンマッピング（ACES の近似。Narkowicz 2015）
      c = pow(c, vec3(1.0 / 2.2));                                // 画面の明るさへ
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;

  function create(renderer) {
    const hdr = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');   // 光の量を 1 をこえて持てる
    const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
    rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uNear: { value: 1 }, uFar: { value: 1 }, uAspect: { value: 1 },
        uR: { value: 0 }, uPos: { value: 0.5 }, uHalfW: { value: 0.1 }, uZ0: { value: 500 }, uKf: { value: 0 }, uSat: { value: 1 }, uCon: { value: 1 },
        uH: { value: 4 }, uExp: { value: 1 }, uN: { value: new THREE.Vector2(0, 1) }, uMode: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const pScene = new THREE.Scene(); pScene.add(quad);
    const pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      setSize(w, h) { rt.setSize(w, h); mat.uniforms.uH.value = h; },
      render(scene, camera, P) {
        const u = mat.uniforms;
        u.uNear.value = camera.near; u.uFar.value = camera.far; u.uAspect.value = camera.aspect;
        u.uMode.value = P.mode; u.uR.value = P.R; u.uPos.value = P.pos; u.uHalfW.value = P.halfW;
        u.uN.value.set(-Math.sin(P.ang), Math.cos(P.ang)); u.uZ0.value = P.z0; u.uKf.value = P.kf;
        u.uSat.value = P.sat; u.uExp.value = P.exp || 1; u.uCon.value = 1 + (P.sat - 1) * 0.35;
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null); renderer.render(pScene, pCam);
      },
    };
  }
  return { create, cocBand, cocDepth, RAMP };
})();
