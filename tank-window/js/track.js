// 画面の奥の水槽 — カメラと顔の読み取り（MediaPipe Face Landmarker）。映像は端末の中だけで使い、残さない
import { faceSample } from './eye.js';

// 0.10.21 に固定（1.2.0 系には Google への記録の送信先が入っていると web-parallax が調べている）
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MIN_MS = 30;   // 読みとりの間隔の下限

export class Tracker {
  constructor(video) {
    this.video = video; this.stream = null; this.lm = null;
    this.state = 'off';   // off asking loading on denied nocam error insecure
    this.error = ''; this.face = null; this.faceAt = -1e9; this.points = null;
    this.lastRun = 0; this.lastVideoT = -1; this.lastTs = 0; this.onchange = () => {};
    this.delegate = ''; this.gen = 0; this.opening = false; this.loadP = null;
  }
  set(s, err = '') { this.state = s; this.error = err; this.onchange(s); }
  get running() { return this.state === 'on'; }

  // 開いている途中で stop されたら、gen がずれているので、あとから届いたカメラをすぐ閉じる
  async start() {
    if (this.stream || this.opening) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.set('insecure'); return; }
    const gen = ++this.gen;
    this.opening = true;
    this.set('asking');
    let st;
    try {
      st = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      if (gen !== this.gen) return;
      this.opening = false;
      this.set(e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'nocam' : e && e.name === 'NotAllowedError' ? 'denied' : 'error', String(e && e.message || e));
      return;
    }
    if (gen !== this.gen) { st.getTracks().forEach(t => t.stop()); return; }
    this.stream = st;
    st.getTracks().forEach(t => t.addEventListener('ended', () => { if (this.stream === st) this.stop('nocam'); }));
    this.video.srcObject = st;
    try { await this.video.play(); } catch (e) { /* 自動再生の拒否は次の操作で動く */ }
    try {
      if (!this.lm) { if (gen === this.gen) this.set('loading'); await this.load(); }
    } catch (e) { if (gen === this.gen) this.stop('error', String(e && e.message || e)); return; }
    if (gen === this.gen) { this.opening = false; this.set('on'); }
  }

  load() { return this.loadP || (this.loadP = this.loadNow().catch(e => { this.loadP = null; throw e; })); }

  async loadNow() {
    const V = await import(`${VISION}/vision_bundle.mjs`);
    const fileset = await V.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const opt = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
    try { this.lm = await V.FaceLandmarker.createFromOptions(fileset, opt('GPU')); this.delegate = 'GPU'; }
    catch (e) { this.lm = await V.FaceLandmarker.createFromOptions(fileset, opt('CPU')); this.delegate = 'CPU'; }
  }

  // カメラを閉じる（OS の「使用中」の表示が消える）
  stop(state = 'off', err = '') {
    this.gen++; this.opening = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.video.srcObject = null; this.face = null; this.points = null; this.lastVideoT = -1;
    this.set(state, err);
  }

  // 描くコマごとに呼ぶ。新しい映像があれば読む。読めたら true
  update(now) {
    const v = this.video;
    if (!this.running || !this.lm || v.readyState < 2 || !v.videoWidth) return false;
    if (now - this.lastRun < MIN_MS || v.currentTime === this.lastVideoT) return false;
    this.lastRun = now; this.lastVideoT = v.currentTime;
    this.lastTs = Math.max(this.lastTs + 1, Math.round(now));
    const r = this.lm.detectForVideo(v, this.lastTs);
    const pts = r.faceLandmarks && r.faceLandmarks[0], mat = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0];
    const s = pts ? faceSample(pts, v.videoWidth / v.videoHeight, mat) : null;
    this.points = pts || null;
    this.face = s; if (s) this.faceAt = now;
    return !!s;
  }
}
