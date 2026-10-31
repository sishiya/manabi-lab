# 兵士の glb を作る（Blender 5.2 で: blender -b -P chess-battle/tools/build-soldiers.py）
# 素材はリポジトリの外 ../3d-library/quaternius/（どれも CC0。Quaternius）:
#   体と頭 = Universal Base Characters[Standard]、服 = Modular Character Outfits - Fantasy[Standard]、
#   動き = Universal Animation Library[Standard]（UAL1_Standard.glb。3つとも同じ 65 本の骨）
# 頭は体から（首より下の頂点を消す）、首から下は服。使う動きだけ残して、テクスチャを小さくして1つにまとめる。
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.normpath(os.path.join(HERE, '..', '..', '..', '3d-library', 'quaternius'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
BODY = os.path.join(LIB, 'Universal Base Characters[Standard]', 'Base Characters', 'Godot - UE', 'Superhero_Male_FullBody.gltf')
OUTFITS = os.path.join(LIB, 'Modular Character Outfits - Fantasy[Standard]', 'Exports', 'glTF (Godot-Unreal)', 'Outfits')
ANIM = os.path.join(LIB, 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb')
KEEP = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sword_Idle', 'Sword_Attack', 'Hit_Chest', 'Sitting_Idle_Loop']
HEAD_BONES = {'Head', 'neck_01'}
ATLAS = 1024   # 1枚にまとめた絵の一辺（服・肌・顔が 512、目・眉が 256）
TRIS = 5000   # 1人の三角形の数のめやす

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imported(fn, **kw):
    before = set(bpy.data.objects)
    fn(**kw)
    return [o for o in bpy.data.objects if o not in before]

def head_only(mesh_obj):
    # 頭と首の骨に主に動かされる頂点だけ残す
    vg = {g.index: g.name for g in mesh_obj.vertex_groups}
    me = mesh_obj.data
    drop = []
    for v in me.vertices:
        if not v.groups: drop.append(v.index); continue
        g = max(v.groups, key=lambda g: g.weight)
        if vg.get(g.group) not in HEAD_BONES: drop.append(v.index)
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for i in drop: me.vertices[i].select = True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.delete(type='VERT'); bpy.ops.object.mode_set(mode='OBJECT')

def rebind(mesh_obj, arm):
    for m in mesh_obj.modifiers:
        if m.type == 'ARMATURE': m.object = arm
    mat = mesh_obj.matrix_world.copy()
    mesh_obj.parent = arm; mesh_obj.matrix_world = mat

def base_image(mat):
    # 材質の色の絵（法線・ORM・粗さの絵は使わない。遠目なので色だけ）
    imgs = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    for key in ('BaseColor', 'Dark', 'Eye_Brown'):
        for im in imgs:
            if key in im.name and 'Normal' not in im.name: return im
    return imgs[0] if imgs else None

def atlas(obj):
    # 材質ごとの色の絵を1枚（ATLAS 四方）に並べ、UV をつけかえて材質を1つにする（描く回数を 1/5 に）
    import numpy as np
    A, half, q = ATLAS, ATLAS // 2, ATLAS // 4
    cells, slot_cell, free = {}, {}, [(0, 0, half), (half, 0, half), (0, half, half), (half, half, q), (half + q, half, q), (half, half + q, q), (half + q, half + q, q)]
    mats = [s.material for s in obj.material_slots]
    # 並びを固定: 服（左下＝glTF の uv では u<0.5・v>0.5。ブラウザで服だけ両軍の色に染める）→ 肌 → 顔 → 目 → 眉
    rank = lambda n: 1 if 'Regular' in n else 2 if 'Superhero' in n else 3 if 'Eye' in n else 4 if 'Hair' in n else 0
    order = sorted({base_image(m).name: base_image(m) for m in mats}.values(), key=lambda im: rank(im.name))
    pix = np.zeros((A, A, 4), np.float32); pix[..., 3] = 1
    for im in order:
        x0, y0, s = free.pop(0)
        c = im.copy(); c.scale(s, s)
        p = np.empty(s * s * 4, np.float32); c.pixels.foreach_get(p); p = p.reshape(s, s, 4)
        if 'Hair' not in im.name: p[..., 3] = 1   # 眉だけ透ける
        pix[y0:y0 + s, x0:x0 + s] = p
        cells[im.name] = (x0, y0, s); bpy.data.images.remove(c)
    for i, m in enumerate(mats): slot_cell[i] = cells[base_image(m).name]
    me = obj.data; uv = me.uv_layers.active.data
    for poly in me.polygons:
        x0, y0, s = slot_cell[poly.material_index]
        for li in poly.loop_indices:
            u, v = uv[li].uv
            u = min(1, max(0, u)); v = min(1, max(0, v))
            uv[li].uv = ((x0 + 2 + u * (s - 4)) / A, (y0 + 2 + v * (s - 4)) / A)   # 2px 内側（にじみ止め）
        poly.material_index = 0
    img = bpy.data.images.new('atlas', A, A, alpha=True); img.pixels.foreach_set(pix.ravel())
    mat = bpy.data.materials.new('Soldier'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.8
    if hasattr(mat, 'surface_render_method'): mat.surface_render_method = 'DITHERED'   # glTF では alphaMode=MASK に
    mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
    obj.data.materials.clear(); obj.data.materials.append(mat)

def build(outfit, name):
    clear()
    objs = imported(bpy.ops.import_scene.gltf, filepath=os.path.join(OUTFITS, outfit + '.gltf'))
    arm = next(o for o in objs if o.type == 'ARMATURE'); arm.name = 'Soldier'
    meshes = [o for o in objs if o.type == 'MESH']
    body = imported(bpy.ops.import_scene.gltf, filepath=BODY)
    barm = next(o for o in body if o.type == 'ARMATURE')
    for o in body:
        if o.type != 'MESH': continue
        if 'SuperHero' in o.name or 'Retopology' in o.data.name: head_only(o)
        rebind(o, arm); meshes.append(o)
    bpy.data.objects.remove(barm)
    for o in [m for m in meshes if not m.visible_get()]:   # 骨の形の補助（Icosphere。見えない）は捨てる
        meshes.remove(o); bpy.data.objects.remove(o)
    # 動き: UAL の骨組みを読み、使う動きだけ兵士の骨組みの NLA に積む
    anims = imported(bpy.ops.import_scene.gltf, filepath=ANIM)
    for o in anims: bpy.data.objects.remove(o)
    arm.animation_data_create()
    for a in list(bpy.data.actions):
        if a.name.split('|')[-1] in KEEP or a.name in KEEP:
            a.name = a.name.split('|')[-1]
            tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
            st = tr.strips.new(a.name, 0, a)
            if hasattr(st, 'action_slot') and a.slots: st.action_slot = a.slots[0]
        else:
            bpy.data.actions.remove(a)
    # 1つのメッシュにまとめる（描く回数を減らす）
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    # 三角形を減らす（250人ほど並べるため。遠目で見るので形の細かさより数）
    obj = bpy.context.view_layer.objects.active
    if obj.data.shape_keys: obj.shape_key_clear()   # 顔の表情の形があると、減らす処理をかけられない
    tris0 = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    dec = obj.modifiers.new('dec', 'DECIMATE'); dec.ratio = min(1.0, TRIS / tris0)
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')
    atlas(obj)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animation_mode='NLA_TRACKS',
                              export_image_format='WEBP', export_image_quality=82, export_yup=True, use_selection=False)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print(f'BUILT {name}: {os.path.getsize(path)//1024} KB, tris {tris}, anims {[t.name for t in arm.animation_data.nla_tracks]}')

build('Male_Peasant', 'soldier-peasant')
build('Male_Ranger', 'soldier-ranger')
