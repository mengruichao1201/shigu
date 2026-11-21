import bpy, json, math, os, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_source')
OUT = os.path.join(ROOT, '_body')
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
objs = {}
for g in GROUPS:
    parts = []
    for item in mapping[g]:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.wm.obj_import(filepath=os.path.join(SRC, 'obj', item['f']))
        ob = bpy.context.selected_objects[0]
        # OBJ 数据本身 Z-up；导入器附加 +90° X，先烘焙再 -90 抵消得净 identity
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
        parts.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = g
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    objs[g] = ob

scene.cursor.location = (0, 0, 0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

def world_bb():
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for ob in objs.values():
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
for ob in objs.values():
    ob.scale = (s, s, s)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(scale=True)
bpy.context.view_layer.update()
mn, mx = world_bb()
center = [(mn[i] + mx[i]) / 2 for i in range(3)]
for ob in objs.values():
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

for g in GROUPS:
    for o in GROUPS:
        objs[o].hide_render = (o != g)
    scene.render.filepath = os.path.join(OUT, g + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', g)

for o in GROUPS:
    objs[o].hide_render = False
scene.render.film_transparent = False
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = os.path.join(OUT, 'composite.png')
bpy.ops.render.render(write_still=True)
print('composite', W, H, 'dims', [round(d, 3) for d in dims])
json.dump({'width': W, 'height': H, 'dims': dims},
          open(os.path.join(OUT, 'frame.json'), 'w'), indent=1)