import bpy, json, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_source')
OUT = os.path.join(ROOT, '_body', 'masks')
os.makedirs(OUT, exist_ok=True)
GROUPS = ['skull', 'trunk', 'upper', 'lower']

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'BOTH'
scene.display.shading.cavity_ridge_factor = 1.3
scene.display.shading.cavity_valley_factor = 1.0
scene.display.shading.show_shadows = False
scene.display.shading.background_type = 'WORLD'
if scene.world is None:
    scene.world = bpy.data.worlds.new('world')
scene.world.color = (0.925, 0.906, 0.867)
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

mat = bpy.data.materials.new('bone')
mat.diffuse_color = (0.86, 0.81, 0.69, 1.0)
mat.roughness = 0.65

mapping = json.load(open(os.path.join(SRC, 'full_body_map.json'), encoding='utf-8'))
masks = json.load(open(os.path.join(SRC, 'mask_map.json'), encoding='utf-8'))

# 与 render_body 完全相同的全局取景：逐网格导入（不 join），统一缩放/居中/正交相机
objs = []  # (group, entry, object)
for g in GROUPS:
    for item in mapping[g]:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.wm.obj_import(filepath=os.path.join(SRC, 'obj', item['f']))
        ob = bpy.context.selected_objects[0]
        bpy.ops.object.transform_apply(rotation=True)
        ob.rotation_euler = (math.radians(-90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        if item['mirror']:
            ob.scale = (-1, 1, 1)
            bpy.ops.object.transform_apply(scale=True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.normals_make_consistent(inside=False)
            bpy.ops.object.mode_set(mode='OBJECT')
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        objs.append((g, item, ob))

scene.cursor.location = (0, 0, 0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

def world_bb():
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for _, _, ob in objs:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx

bpy.context.view_layer.update()
mn, mx = world_bb()
dims = [mx[i] - mn[i] for i in range(3)]
s = 2.0 / max(dims)
for _, _, ob in objs:
    ob.scale = (s, s, s)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(scale=True)
bpy.context.view_layer.update()
mn, mx = world_bb()
center = [(mn[i] + mx[i]) / 2 for i in range(3)]
for _, _, ob in objs:
    ob.location = (-center[0], -center[1], -center[2])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True)
bpy.context.view_layer.update()
mn, mx = world_bb()
dims = [mx[i] - mn[i] for i in range(3)]

W = 800
H = int(round(W * dims[2] / dims[0]))
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.resolution_percentage = 100

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = dims[2] * 1.03
cam_data.clip_start = 0.01
cam_data.clip_end = 100
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -10, 0)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam

for t, spec in masks.items():
    want = {(spec['group'], e['f'], e['mirror']) for e in spec['entries']}
    for g, item, ob in objs:
        ob.hide_render = (g, item['f'], item['mirror']) not in want
    scene.render.filepath = os.path.join(OUT, t + '.png')
    bpy.ops.render.render(write_still=True)
    print('mask', t, len(want))
print('masks done', W, H, 'dims', [round(d, 3) for d in dims])