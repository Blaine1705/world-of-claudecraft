"""Probe a built .blend: lowest parts per bone at clip times, and arm reach.

  blender -b primedraft.blend --python probe.py -- Clip:t,Clip:t
"""
import math
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
body = bpy.data.objects['PrimeDraft']
names = [g.name for g in body.vertex_groups]
grp = np.array([v.groups[0].group if v.groups else 0 for v in body.data.vertices])
for spec in argv[0].split(','):
    c, t = spec.split(':')
    if c == 'rest':
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()
    else:
        act = bpy.data.actions[c]
        arm.animation_data.action = act
        if act.slots:
            arm.animation_data.action_slot = act.slots[0]
        f = act.frame_range[0] + float(t) * 24
        scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    co = np.empty(len(ev.data.vertices) * 3)
    ev.data.vertices.foreach_get('co', co)
    z = co.reshape(-1, 3)[:, 2]
    low = {}
    for g in np.unique(grp):
        low[names[g]] = float(z[grp == g].min())
    worst = sorted(low.items(), key=lambda kv: kv[1])[:5]
    print('PROBE', c, t, 'LOW', [(k, round(v, 2)) for k, v in worst], 'TOP', round(float(z.max()), 2))
    for s in ('L', 'R'):
        sh = arm.pose.bones[s + '_UpperArm'].head
        wr = arm.pose.bones[s + '_Hand'].head
        print('   ', s, 'shoulder', tuple(round(x, 2) for x in sh), 'wrist', tuple(round(x, 2) for x in wr), 'dist',
              round((wr - sh).length, 2))
