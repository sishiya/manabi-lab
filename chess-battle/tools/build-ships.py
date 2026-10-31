# 船の glb を作る（Blender 5.2 で: blender -b -P chess-battle/tools/build-ships.py）
# 素材はリポジトリの外 ../3d-library/polyhaven/（CC0。Poly Haven の 17 世紀のオランダ船 dutch_ship_large_01・02・medium）
#   ship-sail.glb  = 帆船（dutch_ship_medium そのまま）
#   ship-flag.glb  = 旗艦（dutch_ship_large_01 そのまま）
#   ship-steam.glb = 蒸気船（dutch_ship_large_02 の帆と帆綱を外し、煙突と外輪の覆いを足した。※ 形はこのアプリで組んだもの）
# どれも 船首が +Z（three の向き）、水面（喫水線）が原点の高さ、船の真ん中が原点
import bpy, bmesh, os, math, mathutils, json

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.normpath(os.path.join(HERE, '..', '..', '..', '3d-library', 'polyhaven'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
DRAFT = 0.42   # 船体の高さのうち水の下になる割合（喫水。この形の船でおよそ 3〜4 m）

def load(id):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(LIB, id, id + '_1k.gltf'))
    return {o.name.replace(id + '_', ''): o for o in bpy.data.objects if o.type == 'MESH'}

def orient(parts):
    # 長い向きを Blender の Y にそろえ、船首（低い方の端。船尾は高い）を −Y（three の +Z）へ。水面と真ん中を原点に
    hull = parts['hull']
    for o in parts.values(): o.select_set(True)
    bpy.context.view_layer.objects.active = hull
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rot = lambda a: [o.data.transform(mathutils.Matrix.Rotation(a, 4, 'Z')) for o in parts.values()]   # 頂点に直接かける
    vs = [v.co.copy() for v in hull.data.vertices]
    if max(v.x for v in vs) - min(v.x for v in vs) > max(v.y for v in vs) - min(v.y for v in vs):
        rot(math.pi / 2)
        vs = [v.co.copy() for v in hull.data.vertices]
    y0, y1 = min(v.y for v in vs), max(v.y for v in vs); L = y1 - y0
    zmax = lambda a, b: max((v.z for v in vs if a <= v.y <= b), default=0)
    stern_at_max_y = zmax(y1 - L * 0.15, y1) > zmax(y0, y0 + L * 0.15)
    if not stern_at_max_y:   # 船尾が −Y にある → 180° 回す
        rot(math.pi)
        vs = [v.co.copy() for v in hull.data.vertices]
    zb, zt = min(v.z for v in vs), max(v.z for v in vs)
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    wl = zb + (zt - zb) * DRAFT
    for o in parts.values(): o.data.transform(mathutils.Matrix.Translation((-cx, -cy, -wl)))
    return {'length': round(L, 1), 'beam': round(max(v.x for v in vs) - min(v.x for v in vs), 1), 'height': round(zt - wl, 1), 'draft': round(wl - zb, 1)}

def mat(name, color, metal, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    return m

def add_steam(parts, info):
    # 煙突（黒い鉄）と、両わきの外輪の覆い。船の真ん中より少し前
    L, B = info['length'], info['beam']
    iron = mat('iron', (0.04, 0.04, 0.045), 0.6, 0.45); paint = mat('paddlebox', (0.22, 0.14, 0.08), 0.0, 0.8)
    deck = info['height'] * 0.45
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.9, depth=9, location=(0, -L * 0.05, deck + 4.5))
    f = bpy.context.active_object; f.data.materials.append(iron)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.05, depth=0.5, location=(0, -L * 0.05, deck + 8.8))
    f2 = bpy.context.active_object; f2.data.materials.append(iron)
    boxes = []
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=2.6, depth=1.1, location=(s * (B / 2 + 0.55), -L * 0.05, 0.6), rotation=(0, math.pi / 2, 0))
        p = bpy.context.active_object; p.data.materials.append(paint); boxes.append(p)
    for o in [f, f2, *boxes]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = f
    bpy.ops.object.join(); f.name = 'steam_parts'
    parts['steam'] = f

def export(parts, name, info):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts.values(): o.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_image_format='WEBP', export_image_quality=82, export_yup=True)
    tris = sum(len(p.vertices) - 2 for o in parts.values() for p in o.data.polygons)
    print('BUILT', name, os.path.getsize(path) // 1024, 'KB', 'tris', tris, info)
    return info

meta = {}
p = load('dutch_ship_medium'); meta['ship-sail'] = export(p, 'ship-sail', orient(p))
p = load('dutch_ship_large_01'); meta['ship-flag'] = export(p, 'ship-flag', orient(p))
p = load('dutch_ship_large_02')
for k in ('sails', 'rigging'): bpy.data.objects.remove(p.pop(k))
info = orient(p); add_steam(p, info); meta['ship-steam'] = export(p, 'ship-steam', info)
with open(os.path.join(OUT, 'ships.json'), 'w') as f: json.dump(meta, f, indent=1)
