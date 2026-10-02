"""Review renders and objective checks of a built Prime Draft .blend (authoring aid).

  blender -b primedraft.blend --python review.py -- <out_dir> <mode> [args] [--knight k.glb] [+cycles]

  views                      the turnaround at Idle (front, 3/4, side, back, low hero) with the knight
  closeup                    head, hatch shut and open, brass fist, iron arm, foot and clamps, back
  sheet  Clip,Clip [N]       N evenly spaced frames per clip (prefix_<Clip>_<i>.png)
  frames Clip:t,Clip:t       stills at times in seconds
  video  Clip                every frame of a clip (for the MP4s)
  analyze [Clip,Clip]        ground penetration, foot slide, joint pops, piston and cable continuity
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mech as A  # noqa: E402
import rig as R  # noqa: E402
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out, mode = argv[0], argv[1]
rest = list(argv[2:])


def opt(name, default=None):
    return rest[rest.index(name) + 1] if name in rest else default


scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.startswith('PrimeDraft'))
meshes = [o for o in scene.objects if o.type == 'MESH' and o.parent == arm]
body = next(o for o in meshes if o.name == 'PrimeDraft')
for o in scene.objects:
    if o.name.endswith('_hi') or '_hi.' in o.name:
        o.hide_render = True
if '--nomoor' in rest:
    for o in meshes:
        if o.name == 'PrimeDraftMoorings':
            o.hide_render = True
NEEDS_STAGE = mode in ('views', 'closeup', 'sheet', 'frames', 'video')
if NEEDS_STAGE:
    cam = stage.setup(knight=opt('--knight'), engine='CYCLES' if '+cycles' in rest else 'EEVEE',
                      res=(int(opt('--w', 1280)), int(opt('--h', 860))), ref_height=float(opt('--refh', 2.6)),
                      sky=(0.24, 0.27, 0.3), ref_at=(5.2, -4.2, 0.0))
    if '+cycles' in rest:
        scene.cycles.samples = int(opt('--samples', 48))


def act_time(name, t):
    if name not in bpy.data.actions:
        return
    act = bpy.data.actions[name]
    R.set_action(arm, act)
    f0, f1 = act.frame_range
    f = f0 + t * R.FPS
    scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))


def bone_pt(name, tail=False):
    pb = arm.pose.bones[name]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


VIEWS = (
    ('front', 0, 6, 33, (0.0, 0.0, 5.4), 45),
    ('threeq', 35, 9, 34, (0.0, 0.5, 5.4), 45),
    ('side', 90, 5, 34, (0.0, 1.0, 5.4), 45),
    ('back', 165, 9, 36, (0.0, 2.5, 5.6), 45),
    ('hero_low', 28, -3, 21, (0.5, 0.0, 6.6), 26),
)

if mode == 'views':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.0)))
    for name, az, el, dist, focus, lens in VIEWS:
        stage.aim(cam, az, el, dist, focus, lens)
        stage.still(os.path.join(out, f'{name}.png'))
elif mode == 'closeup':
    act_time('Idle', 0.0)
    h = bone_pt('Head')
    shots = [('head_front', 0, 4, 5.2, (h.x, h.y - 0.3, h.z + 0.5), 50),
             ('head_threeq', -38, 8, 5.4, (h.x, h.y - 0.3, h.z + 0.5), 50)]
    c = bone_pt('Anchor_Hatch')
    shots += [('hatch_shut', 15, 4, 7.5, (c.x, c.y, c.z), 50)]
    fr = bone_pt('Anchor_FistR')
    shots += [('brass_arm', -55, 6, 9.5, (fr.x, fr.y, fr.z + 3.2), 45)]
    cl = bone_pt('L_Forearm')
    shots += [('iron_arm', 62, 4, 9.0, (cl.x, cl.y, cl.z - 0.6), 45)]
    fl = bone_pt('L_Foot')
    shots += [('foot_clamps', 30, 22, 6.0, (fl.x - 0.4, fl.y - 0.3, fl.z - 0.3), 45)]
    shots += [('back_cables', 150, 14, 15.0, (0.0, 3.0, 7.0), 45)]
    for name, az, el, dist, focus, lens in shots:
        stage.aim(cam, az, el, dist, focus, lens)
        stage.still(os.path.join(out, f'{name}.png'))
    if 'Hatch_Held' in bpy.data.actions:
        act_time('Hatch_Held', 0.4)
        c = bone_pt('Anchor_Hatch')
        stage.aim(cam, 18, 6, 7.5, (c.x, c.y, c.z), 50)
        stage.still(os.path.join(out, 'hatch_open.png'))
elif mode == 'sheet':
    clips = rest[0].split(',')
    n = int(rest[1]) if len(rest) > 1 and rest[1].isdigit() else 8
    prefix = opt('--prefix', 'draft')
    for c in clips:
        act = bpy.data.actions[c]
        dur = float(act.get('duration', (act.frame_range[1] - act.frame_range[0]) / R.FPS))
        for i in range(n):
            t = dur * i / max(1, n - 1)
            act_time(c, t)
            stage.aim(cam, float(opt('--az', 35)), 8, float(opt('--dist', 36)), (0.0, 0.5, 5.2), 45)
            stage.still(os.path.join(out, f'{prefix}_{c}_{i}.png'))
elif mode == 'frames':
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        stage.aim(cam, float(opt('--az', 35)), float(opt('--el', 8)), float(opt('--dist', 34)),
                  (0.0, float(opt('--fy', 0.5)), float(opt('--fz', 5.2))), float(opt('--lens', 45)))
        stage.still(os.path.join(out, f'{c}_{float(t):.2f}.png'))
elif mode == 'video':
    c = rest[0]
    act = bpy.data.actions[c]
    R.set_action(arm, act)
    f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
    stage.aim(cam, float(opt('--az', 35)), 8, float(opt('--dist', 36)), (0.0, 0.5, 5.2), 45)
    for i, f in enumerate(range(f0, f1 + 1)):
        scene.frame_set(f)
        stage.still(os.path.join(out, f'{c}_{i:04d}.png'))
elif mode == 'analyze':
    import numpy as np
    names = rest[0].split(',') if rest and not rest[0].startswith('-') else sorted(
        a.name for a in bpy.data.actions if a.get('duration') is not None)
    SKIP = ('P_', 'Cable', 'Clamp', 'Bolt', 'Anchor', 'EyeGlow', 'CoreArc', 'Hatch')
    for c in names:
        act = bpy.data.actions[c]
        R.set_action(arm, act)
        f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
        minz, worst_pop, pop_bone, minz_t, pop_t = 99.0, 0.0, '', 0.0, 0.0
        prevq = {}
        feet = {b: [] for b in ('L_Foot', 'R_Foot')}
        gap = 0.0
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            if (f - f0) % 2 == 0:
                dg = bpy.context.evaluated_depsgraph_get()
                ev = body.evaluated_get(dg)
                co = np.empty(len(ev.data.vertices) * 3)
                ev.data.vertices.foreach_get('co', co)
                mz = float(co.reshape(-1, 3)[:, 2].min())
                if mz < minz:
                    minz, minz_t = mz, (f - f0) / R.FPS
            for pb in arm.pose.bones:
                if pb.name.startswith(SKIP):
                    continue
                q = pb.matrix.to_quaternion()
                if pb.name in prevq:
                    ang = math.degrees(prevq[pb.name].rotation_difference(q).angle)
                    ang = min(ang, 360 - ang)
                    if ang > worst_pop:
                        worst_pop, pop_bone, pop_t = ang, pb.name, (f - f0) / R.FPS
                prevq[pb.name] = q
            for fb in feet:
                feet[fb].append(arm.pose.bones[fb].head.copy())
            # piston continuity: the cylinder must point at the rod's eye
            for name, ba, pa, bb, pb_, r in A.PISTONS:
                cyl = arm.pose.bones['P_' + name + '_Cyl']
                rod = arm.pose.bones['P_' + name + '_Rod']
                d = (rod.head - cyl.head)
                ax = (cyl.tail - cyl.head).normalized()
                off = (d - ax * d.dot(ax)).length
                gap = max(gap, off)
        slide = []
        for fb, pts in feet.items():
            for a, b in zip(pts, pts[1:]):
                if a.z < 1.04 and b.z < 1.04:
                    slide.append((b - a).length * R.FPS)
        sl = (min(slide), max(slide)) if slide else (0, 0)
        print(f'ANALYZE {c:13s} n={f1 - f0 + 1:3d} minz={minz:6.2f}@{minz_t:4.2f} pop={worst_pop:5.1f}@{pop_bone}@{pop_t:4.2f} '
              f'planted_speed=[{sl[0]:.2f},{sl[1]:.2f}] piston_offaxis={gap:.4f}')
print('REVIEW_DONE', mode)
