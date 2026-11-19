# 手元だけ: Brush の .ply（3D ガウシアン）を、アプリで読む形にまとめる
#   - 空・カメラの近くに浮いたもやを切りとる（地面からの高さ・軸の点からの横の距離・大きさ）
#   - 向きと大きさを「地面が y=0・y が上・単位 m・原点は軸の点の真下」に直す（m_per_unit は塔の高さなどから決めた推定）
#   - <名前>.splat（1点 32 バイト: 位置 3f・大きさ 3f・色 RGBA 4u8・向き 4u8。antimatter15 の形、Spark で読める）
#   - <名前>-pts.bin（距離の絵を作るための、はっきりした点の位置だけ。float32 xyz）
#   - <名前>-view.json（撮ったカメラの1つから決めた、見る位置の基準）
# 使い方: python tilt-shift/tools/splat-pack.py <cams.json> <入力.ply> <出力の頭> <m_per_unit> <基準のコマ番号> [高さの上限] [横の上限] [大きさの上限]
import json, sys, math, numpy as np
cams_path, src, out, M, fi = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), int(sys.argv[5])
HMAX = float(sys.argv[6]) if len(sys.argv) > 6 else 2
RMAX = float(sys.argv[7]) if len(sys.argv) > 7 else 40
SMAX = float(sys.argv[8]) if len(sys.argv) > 8 else 1
info = json.load(open(cams_path))
U = np.array(info['worldUp']); g = info['ground']
c0 = info['cams'][fi]; C0 = np.array(c0['C']); F0 = np.array(c0['fwd']); piv = C0 + F0 * c0['zc']
O = piv - (np.dot(piv, U) - g) * U                     # 軸の点の真下の地面
# 新しい軸: y = U、z = 基準のカメラから軸の点への向きを水平にしたものの逆（カメラは +z 側）、x = y × z
zf = C0 - piv; zf -= np.dot(zf, U) * U; zf /= np.linalg.norm(zf)
X = np.cross(U, zf); R = np.stack([X, U, zf])          # 行が新しい軸（det = +1）
def to_new(p): return ((p - O) @ R.T) * M

b = open(src, 'rb').read(); end = b.index(b'end_header\n') + len(b'end_header\n')
head = b[:end].decode('ascii').split('\n')
props = [l.split()[2] for l in head if l.startswith('property float')]
n = int([l for l in head if l.startswith('element vertex')][0].split()[2])
a = np.frombuffer(b, dtype=np.dtype([(p, '<f4') for p in props]), count=n, offset=end)
P = np.stack([a['x'], a['y'], a['z']], 1)
h = P @ U - g
hz = (P - O) - np.outer((P - O) @ U, U); r = np.linalg.norm(hz, axis=1)
sc = np.stack([a['scale_0'], a['scale_1'], a['scale_2']], 1); smax = np.exp(sc.max(1))
keep = (h < HMAX) & (h > -0.5) & (r < RMAX) & (smax < SMAX)
k = a[keep]; Pn = to_new(P[keep]).astype('<f4')
scale = (np.exp(sc[keep]) * M).astype('<f4')
C0f = 0.28209479177387814
rgb = np.clip((0.5 + C0f * np.stack([k['f_dc_0'], k['f_dc_1'], k['f_dc_2']], 1)) * 255, 0, 255)
op = 1 / (1 + np.exp(-k['opacity'])); rgba = np.concatenate([rgb, (op * 255)[:, None]], 1).round().astype('u1')
# 向き: q_new = q_R * q（R を四元数に）
def mat2q(m):
    t = m.trace()
    if t > 0:
        s = math.sqrt(t + 1) * 2; return np.array([0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s])
    i = int(np.argmax(np.diag(m)))
    if i == 0:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; return np.array([(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s])
    if i == 1:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; return np.array([(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s])
    s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; return np.array([(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s])
qr = mat2q(R)
q = np.stack([k['rot_0'], k['rot_1'], k['rot_2'], k['rot_3']], 1); q /= np.linalg.norm(q, axis=1, keepdims=True)
w1, x1, y1, z1 = qr; w2, x2, y2, z2 = q.T
qn = np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], 1)
qb = np.clip(qn * 128 + 128, 0, 255).round().astype('u1')
# 遠い順に並べなくてよい（Spark が並べる）。不透明なものから先に置く
o = np.argsort(-op)
rec = np.zeros(len(k), dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('q', 'u1', 4)])
rec['p'] = Pn[o]; rec['s'] = scale[o]; rec['c'] = rgba[o]; rec['q'] = qb[o]
rec.tofile(out + '.splat')
# 距離の絵用の点: 不透明で小さいものだけ
pm = (op > 0.6) & (np.exp(sc[keep].max(1)) * M < 6)
Pn[pm].astype('<f4').tofile(out + '-pts.bin')
# 見る位置の基準（新しい軸で）
Cn = to_new(C0[None])[0]; Tn = to_new(piv[None])[0]
d = Cn - Tn; dist = float(np.linalg.norm(d)); el = math.degrees(math.asin(d[1] / dist))
view = {'target': Tn.round(2).tolist(), 'dist': round(dist, 1), 'el': round(el, 1), 'az': 0, 'vfov': round(info['vfov'], 1),
        'camHeight': round(float(Cn[1]), 1), 'm_per_unit': M, 'count': int(len(k))}
json.dump(view, open(out + '-view.json', 'w'), indent=1)
print('splats', n, '->', len(k), 'pts', int(pm.sum()), view)
