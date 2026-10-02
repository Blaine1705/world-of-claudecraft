import os, sys
import bpy
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build
import rig as R
argv = sys.argv[sys.argv.index('--') + 1:]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm)
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
        v.co.y -= 0.16
        n += 1
print('VISOR_MOVED', n, min(me.vertices[i].co.y for i in vs))
build.export(argv[0], arm)
R.set_action(arm, bpy.data.actions['Idle'])
bpy.ops.wm.save_mainfile()
print('FIX_DONE')
