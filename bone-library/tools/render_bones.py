import bpy, os, sys, math, json, re
from mathutils import Vector

ROOT = r'C:\Users\18085\Documents\Qoder\2026-11-18\df4e5ff9\bone-library'
OBJ = os.path.join(ROOT, '_source', 'obj')

VIEWS = [
    ('front', (0, -10, 0), (90, 0, 0)),
    ('side', (-10, 0, 0), (90, 0, -90)),
    ('back', (0, 10, 0), (90, 0, 180)),
]

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for b in list(block):
            block.remove(b)

def bone_material():
    m = bpy.data.materials.new('Bone')
    m.diffuse_color = (0.86, 0.81, 0.69, 1.0)
    m.roughness = 0.65
    return m

def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.curvature_ridge_factor = 1.3
    sh.curvature_valley_factor = 1.0
    sh.show_shadows = False
    sh.show_specular_highlight = True
    sh.background_type = 'WORLD'
    world = bpy.data.worlds.new('BoneWorld') if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.color = (0.925, 0.906, 0.867)
    scene.view_settings.view_transform = 'Standard'

def load_bone(files):
    objs = []
    for f in files:
        bpy.ops.wm.obj_import(filepath=os.path.join(OBJ, f))
        objs += [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not objs:
        return None
    mat = bone_material()
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # 数据 +Y 朝下：绕 X -90° 使解剖学上方 = +Z，+Y = 后方
    obj.rotation_euler = (math.radians(-90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    return obj

def frame_and_center(obj):
    def world_bb():
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        mn = Vector((min(v[i] for v in bb) for i in range(3)))
        mx = Vector((max(v[i] for v in bb) for i in range(3)))
        return mn, mx
    mn, mx = world_bb()
    dims = mx - mn
    s = 2.0 / max(dims)
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    bpy.context.view_layer.update()
    mn, mx = world_bb()
    obj.location -= (mn + mx) / 2
    bpy.ops.object.transform_apply(location=True)
    bpy.context.view_layer.update()
    return dims

def render_views(obj, out_dir, slug):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.7
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    for tag, loc, rot in VIEWS:
        cam.location = loc
        cam.rotation_euler = tuple(math.radians(a) for a in rot)
        p = os.path.join(out_dir, f'{slug}_{tag}.png')
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths[tag] = p
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cam_data)
    return paths

setup_render()
catalog = json.load(open(os.path.join(ROOT, 'catalog.json'), encoding='utf-8'))
manifest = []
failed = []
for i, bone in enumerate(catalog['bones']):
    slug = re.sub(r'[^a-z0-9]+', '_', bone['en'].split('(')[0].lower()).strip('_')
    out_dir = os.path.join(ROOT, bone['cat'], bone['cn'])
    clear_scene()
    obj = load_bone(bone['files'])
    if obj is None or not len(obj.data.polygons):
        failed.append(bone['cn'])
        print(f'[{i+1}/{len(catalog["bones"])}] FAIL {bone["cn"]}')
        continue
    dims = frame_and_center(obj)
    paths = render_views(obj, out_dir, slug)
    manifest.append({
        'cat': bone['cat'], 'cn': bone['cn'], 'en': bone['en'],
        'fma': bone['fma'], 'files': bone['files'],
        'verts': len(obj.data.vertices),
        'dims_mm': [round(v, 1) for v in dims],
        'views': {k: os.path.relpath(v, ROOT).replace('\\', '/') for k, v in paths.items()},
    })
    print(f'[{i+1}/{len(catalog["bones"])}] OK {bone["cn"]} ({len(obj.data.vertices)} verts)')

with open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump({
        'source': catalog['source'], 'sourceUrl': catalog['sourceUrl'],
        'sidePolicy': catalog['sidePolicy'], 'views': catalog['views'],
        'gaps': catalog.get('gaps', []), 'bones': manifest, 'failed': failed,
    }, f, ensure_ascii=False, indent=2)
print(f'BATCH_DONE rendered={len(manifest)} failed={failed}')