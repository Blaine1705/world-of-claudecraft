"""Rebake the albedo of a built Voltaic Warden .blend through an EMISSION pass and re-export.

Cycles' diffuse-colour bake pass is black on fully metallic surfaces (brass, copper, steel), so
the base colour is routed into an emission shader on every bake material and baked as EMIT from
the highs onto the joined low, then multiplied by the baked occlusion as build.py does.

  blender -b voltaic_warden.blend --python rebake_albedo.py -- <out.glb> <tex_dir> [--size 2048] [--samples 5]
"""
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build  # noqa: E402
import rig as R  # noqa: E402
from stage import use_gpu  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out, tex = argv[0], argv[1]
size = int(build.opt(argv, '--size', 2048))
samples = int(build.opt(argv, '--samples', 5))
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
low = next(o for o in scene.objects if o.type == 'MESH' and o.parent == arm)
highs = [o for o in scene.objects if o.type == 'MESH' and o.name.endswith('_hi')]
print('HIGHS', len(highs), flush=True)
arm.data.pose_position = 'REST'
for h in highs:
    h.hide_render = False
    h.hide_viewport = False
    h.hide_set(False)
saved = []
for m in bpy.data.materials:
    if not m.name.startswith('Bake_'):
        continue
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    inp = bsdf.inputs['Base Color']
    if inp.links:
        nt.links.new(inp.links[0].from_socket, em.inputs['Color'])
    else:
        em.inputs['Color'].default_value = inp.default_value
    prev = outn.inputs['Surface'].links[0].from_socket
    nt.links.new(em.outputs[0], outn.inputs['Surface'])
    saved.append((nt, prev, outn))
scene.render.engine = 'CYCLES'
print('DEVICE', use_gpu(scene), flush=True)
scene.cycles.samples = samples
bk = scene.render.bake
bk.use_selected_to_active = True
bk.cage_extrusion = 0.03
bk.max_ray_distance = 0.1
bk.margin = 8
bk.use_clear = True
img = bpy.data.images.new('Voltaic_albedo_emit', size, size, alpha=False)
img.colorspace_settings.name = 'sRGB'
nodes = []
for m in low.data.materials:
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image = img
    m.node_tree.nodes.active = n
    nodes.append((m, n))
vis = ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter',
       'visible_shadow')
for a in vis:
    setattr(low, a, False)
for o in bpy.context.selected_objects:
    o.select_set(False)
for h in highs:
    h.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type='EMIT')
alb = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
print('BAKED albedo', alb[..., :3].mean(axis=(0, 1)), flush=True)
img.filepath_raw = os.path.join(tex, 'voltaic_albedo_raw.png')
img.file_format = 'PNG'
img.save()
ao_img = bpy.data.images.load(os.path.join(tex, 'voltaic_ao_raw.png'))
ao = np.array(ao_img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :1]
alb[..., :3] *= (1.0 - 0.45 * (1.0 - ao))
final = bpy.data.images['VoltaicAlbedo']
final.pixels[:] = alb.ravel()
final.pack()
final.filepath_raw = os.path.join(tex, f'voltaic_albedo_{size}.png')
final.file_format = 'PNG'
final.save()
for m, n in nodes:
    m.node_tree.nodes.remove(n)
for nt, prev, outn in saved:
    nt.links.new(prev, outn.inputs['Surface'])
for a in vis:
    setattr(low, a, True)
for h in highs:
    h.hide_render = True
    h.hide_viewport = True
arm.data.pose_position = 'POSE'
build.export(out, arm)
R.set_action(arm, bpy.data.actions['Idle'])
bpy.ops.wm.save_mainfile()
print('REBAKE_DONE', flush=True)
