"""Re-author every clip on an already baked .blend and re-export (no re-sculpt, no re-bake).

  blender -b voltaic_warden.blend --python reclip.py -- <out.glb> [--save]
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build  # noqa: E402
import clips as C  # noqa: E402
import rig as R  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith('VoltaicWarden'))
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm)
if '--fix-visor' in argv and not body.get('visor_fixed'):
    # the visor glow bar was wider than the slot and showed at the cheeks: narrow it in place
    me = body.data
    gi = [i for i, m in enumerate(me.materials) if m.name == 'VoltaicGlow'][0]
    hg = body.vertex_groups['Head'].index
    vs = set()
    for p in me.polygons:
        if p.material_index == gi:
            vs.update(p.vertices)
    n = 0
    for i in vs:
        v = me.vertices[i]
        if any(g.group == hg and g.weight > 0.5 for g in v.groups):
            v.co.x *= 0.74
            v.co.y += 0.06
            n += 1
    body['visor_fixed'] = 1
    print('VISOR_FIXED', n)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
bpy.context.scene.frame_start = 0
names = C.make_clips(arm)
print('RECLIPPED', names)
build.export(out, arm)
if '--save' in argv:
    R.set_action(arm, bpy.data.actions['Idle'])
    bpy.ops.wm.save_mainfile()
print('RECLIP_DONE')
