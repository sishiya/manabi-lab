# 手元だけ: 写真から奥行き（距離の逆数の相対値）を推定して、アプリで使う形に書き出す
# モデル: Depth Anything V2 Small（Apache-2.0）。重みは %USERPROFILE%\tools\depth-anything-v2\hf、Python は TripoSG の .venv を借りる
# 使い方:
#   set HF_HOME=%USERPROFILE%\tools\depth-anything-v2\hf
#   %USERPROFILE%\tools\TripoSG\.venv\Scripts\python.exe -I tilt-shift\tools\depth.py <元の写真> <出力の名前（拡張子なし）> [長い辺の画素=1600]
#   [たての切り取りの位置 0〜1=0.5]（3:2 に切り取るとき、上下のどこを残すか）
# 出力: <名前>.jpg（3:2 に切り取った写真、撮影情報なし）と <名前>-d.png（奥行き 16bit を R=上位・G=下位に。明るいほど近い＝距離の逆数が大きい。
#       0〜65535 に引きのばした値。写真の半分の大きさ）、<名前>-d.json（引きのばしの元の値の範囲）、<名前>-t.jpg（場面ボタンの見本 240×160）
import json, sys
import numpy as np, cv2, torch
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

src, name = sys.argv[1], sys.argv[2]
LONG = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
VPOS = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
img = cv2.imread(src, cv2.IMREAD_COLOR)
H0, W0 = img.shape[:2]
if W0 / H0 > 1.5:   # 横長: 左右を切る
    cw = round(H0 * 1.5); x0 = (W0 - cw) // 2; img = img[:, x0:x0 + cw]
else:              # たて長め: 上下を切る
    ch = round(W0 / 1.5); y0 = round((H0 - ch) * VPOS); img = img[y0:y0 + ch, :]
h, w = img.shape[:2]; k = LONG / max(w, h)
img = cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
cv2.imwrite(name + '.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 86])   # OpenCV で書きなおすので撮影情報（EXIF）は残らない

M = 'depth-anything/Depth-Anything-V2-Small-hf'
proc = AutoImageProcessor.from_pretrained(M); model = AutoModelForDepthEstimation.from_pretrained(M).eval()
dev = 'cuda' if torch.cuda.is_available() else 'cpu'; model.to(dev)
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
# 細かさのため、長い辺 1022（14 の倍数）でも推定して、ふつうの 518 と合わせる
outs = []
for size in (518, 1022):
    inp = proc(images=rgb, return_tensors='pt', size={'height': size, 'width': size}, keep_aspect_ratio=True, ensure_multiple_of=14, do_resize=True)
    with torch.no_grad():
        pd = model(**{k2: v.to(dev) for k2, v in inp.items()}).predicted_depth
    pd = torch.nn.functional.interpolate(pd[:, None], size=rgb.shape[:2], mode='bicubic', align_corners=False)[0, 0].cpu().numpy()
    outs.append(pd)
a, b = outs
# 大きい方の値の幅を小さい方にそろえてから平均（相対値なので、ずれと倍率だけ合わせる）
A = np.vstack([b.ravel(), np.ones(b.size)]).T; s, t = np.linalg.lstsq(A, a.ravel(), rcond=None)[0]
disp = 0.5 * a + 0.5 * (s * b + t)
lo, hi = np.percentile(disp, 0.5), np.percentile(disp, 99.5)
dsm = cv2.resize(disp, (img.shape[1] // 2, img.shape[0] // 2), interpolation=cv2.INTER_AREA)   # 奥行きは半分の大きさで（軽くするため。ぼけの大きさを決めるだけなので足りる）
d16 = np.clip((dsm - lo) / (hi - lo) * 65535, 0, 65535).astype(np.uint32)
png = np.zeros(d16.shape + (3,), np.uint8); png[..., 2] = d16 >> 8; png[..., 1] = d16 & 255   # OpenCV は BGR なので [2] が R
cv2.imwrite(name + '-d.png', png)
json.dump({'model': M, 'lo': float(lo), 'hi': float(hi), 'w': img.shape[1], 'h': img.shape[0]}, open(name + '-d.json', 'w'))
cv2.imwrite(name + '-t.jpg', cv2.resize(img, (240, 160), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 80])   # 場面ボタンの見本
print('ok', name, img.shape[1], img.shape[0])
