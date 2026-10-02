"""Re-author the clips on a built Prime Draft .blend (no rebuild, no rebake) and
re-export the raw GLB.

  blender -b primedraft.blend --python reclip.py -- <out.glb> [--clips A,B]

Only safe when the body motion's piston strokes stay inside what the rams were
sized for (stats.json `pistons`); the script reports any ram that would now leave
its cylinder.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
import clips as C  # noqa: E402
import rig as R  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
only = argv[argv.index('--clips') + 1].split(',') if '--clips' in argv else None
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE' and o.name.startswith('PrimeDraft'))
for o in bpy.context.scene.objects:
    o.hide_viewport = False if not (o.name.endswith('_hi') or o.name.startswith('High_')) else o.hide_viewport
arm.animation_data.action = None
for a in list(bpy.data.actions):
    if only is None or a.name in only:
        bpy.data.actions.remove(a)
names = C.make_clips(arm, only)
print('RECLIP', names)
strokes = B.measure_strokes(arm, [a.name for a in bpy.data.actions if a.get('duration') is not None])
print('STROKES', {k: (round(a, 3), round(b, 3)) for k, (a, b) in strokes.items()})
R.set_action(arm, bpy.data.actions['Idle'])
bpy.ops.wm.save_mainfile()
B.export(out, arm)
print('RECLIP_DONE')
