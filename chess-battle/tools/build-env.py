# 空の絵を作る（木のインポスターの作り方 tree() も残してある）（Blender 5.2 で: blender -b -P chess-battle/tools/build-env.py）
# 素材はリポジトリの外 ../3d-library/polyhaven/（どれも CC0。Poly Haven）:
#   空 = kloofendal_48d_partly_cloudy_puresky（2k の HDRI → 見たままの明るさの JPG。空の背景と光の両方に使う）
#   木 = island_tree_01・island_tree_02（1本 170万〜370万三角形あるので、8方向から撮って1枚の絵にする＝インポスター）
import bpy, os, math, json

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.normpath(os.path.join(HERE, '..', '..', '..', '3d-library', 'polyhaven'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
VIEWS, CELL = 8, 512   # 木を撮る向きの数・1枚の大きさ（並べると 4×2 で 2048×1024）

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def sky():
    clear()
    img = bpy.data.images.load(os.path.join(LIB, 'hdri', 'kloofendal_2k.hdr'))
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = -0.3
    out = os.path.join(OUT, 'sky.jpg')
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 82
    img.save_render(out, scene=sc)
    print('BUILT sky', os.path.getsize(out) // 1024, 'KB', img.size[:])

def tree(name):
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(LIB, name, name + '_1k.gltf'))
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    # 大きさ（足もとを原点に）
    import mathutils
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    h, w = mx.z - mn.z, max(mx.x - mn.x, mx.y - mn.y)
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = CELL
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    # 光: 空の HDRI と、上からの日の光（ブラウザの日の向きとだいたい同じ）
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    env = world.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(LIB, 'hdri', 'kloofendal_1k.hdr'))
    world.node_tree.links.new(env.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(40), 0, math.radians(-30)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; side = max(h, w) * 1.04; cam.data.ortho_scale = side
    tiles = []
    for i in range(VIEWS):
        a = 2 * math.pi * i / VIEWS
        cam.location = (cx + math.sin(a) * 100, cy - math.cos(a) * 100, mn.z + side / 2)
        cam.rotation_euler = (math.radians(90), 0, a)
        p = os.path.join(OUT, f'_tmp_{name}_{i}.png'); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); tiles.append(p)
    # 4×2 に並べて1枚に
    import numpy as np
    atlas = np.zeros((CELL * 2, CELL * 4, 4), np.float32)
    for i, p in enumerate(tiles):
        im = bpy.data.images.load(p); a = np.empty(CELL * CELL * 4, np.float32); im.pixels.foreach_get(a)
        a = a.reshape(CELL, CELL, 4); r, c = 1 - i // 4, i % 4   # Blender の絵は下から上
        atlas[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = a
        bpy.data.images.remove(im); os.remove(p)
    img = bpy.data.images.new(name, CELL * 4, CELL * 2, alpha=True); img.pixels.foreach_set(atlas.ravel())
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 80; sc.render.image_settings.color_mode = 'RGBA'
    out = os.path.join(OUT, name.replace('island_', '') + '.webp'); img.save_render(out, scene=sc)
    info = {'height': round(h, 2), 'width': round(w, 2), 'side': round(side, 2), 'views': VIEWS}
    print('BUILT', name, os.path.getsize(out) // 1024, 'KB', info)
    return info

os.makedirs(OUT, exist_ok=True)
sky()
# 木のインポスター（tree()）は人の兵の戦場で使っていた。海戦では使わないので作らない（2026-10-31）
