"""Review renders of a built Balgath .blend (authoring aid; nothing here ships).

  blender -b balgath.blend --python review.py -- <out_dir> <mode> [args] [--knight k.glb] [+cycles]

  views                      the standard turnaround at Idle (front, 3/4, side, back, face, low)
  sheet  Clip,Clip [N]       N evenly spaced frames per clip (prefix_<Clip>_<i>.png)
  frames Clip:t,Clip:t       stills at times in seconds
  video  Clip [W]            every frame of a clip (for the MP4s)
  closeup                    the face and the eye, lit close
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig as R  # noqa: E402
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out, mode = argv[0], argv[1]
rest = [a for a in argv[2:]]


def opt(name, default=None):
    return rest[rest.index(name) + 1] if name in rest else default


scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.startswith('Balgath'))
for o in scene.objects:
    if '_hi' in o.name:
        o.hide_render = True
cam = stage.setup(knight=opt('--knight'), engine='CYCLES' if '+cycles' in rest else 'EEVEE',
                  res=(int(opt('--w', 1280)), int(opt('--h', 960))), ref_height=float(opt('--refh', 2.6)))
if '+cycles' in rest:
    scene.cycles.samples = int(opt('--samples', 48))


def act_time(name, t):
    act = bpy.data.actions[name]
    R.set_action(arm, act)
    f0, f1 = act.frame_range
    f = f0 + t * R.FPS
    scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))


def cam_default(az=32, el=9, dist=42, focus=(1.5, 0, 6.6), lens=45):
    stage.aim(cam, az, el, dist, focus, lens)


if mode == 'views':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.5)))
    for name, az, el, dist, focus, lens in stage.STANDARD_VIEWS:
        stage.aim(cam, az, el, dist, focus, lens)
        stage.still(os.path.join(out, f'{name}.png'))
elif mode == 'closeup':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.5)))
    head = arm.pose.bones['Head']
    c = arm.matrix_world @ head.head
    for name, az, el, dist, dz, lens in (('face_front', 0, 3, 6.0, 0.6, 50), ('face_threeq', 35, 6, 6.5, 0.5, 50),
                                          ('eye', 8, 2, 3.0, 0.95, 60), ('face_side', 85, 4, 7.0, 0.5, 45)):
        stage.aim(cam, az, el, dist, (c.x, c.y - 1.0, c.z + dz), lens)
        stage.still(os.path.join(out, f'{name}.png'))
elif mode == 'hands':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.5)))
    for side in ('L_', 'R_'):
        pb = arm.pose.bones[side + 'Hand']
        c = arm.matrix_world @ pb.tail
        stage.aim(cam, 35 if side == 'L_' else -35, 8, 9.0, (c.x, c.y, c.z + 0.6), 45)
        stage.still(os.path.join(out, f'hand_{side[0]}.png'))
    pb = arm.pose.bones['L_Foot']
    c = arm.matrix_world @ pb.tail
    stage.aim(cam, 25, 14, 8.0, (c.x, c.y + 0.6, c.z + 0.5), 45)
    stage.still(os.path.join(out, 'foot_L.png'))
elif mode == 'sheet':
    clips = rest[0].split(',')
    n = int(rest[1]) if len(rest) > 1 and rest[1].isdigit() else 4
    prefix = opt('--prefix', 'balgath')
    az = float(opt('--az', 32))
    for c in clips:
        act = bpy.data.actions[c]
        dur = (act.frame_range[1] - act.frame_range[0]) / R.FPS
        for i in range(n):
            t = dur * (i + 0.5) / n if n > 1 else dur / 2
            act_time(c, t)
            cam_default(az=az, dist=float(opt('--dist', 34)), focus=(1.0, 0, 6.2))
            stage.still(os.path.join(out, f'{prefix}_{c}_{i}.png'))
elif mode == 'frames':
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        cam_default(az=float(opt('--az', 32)), dist=float(opt('--dist', 44)))
        stage.still(os.path.join(out, f'{c}_{float(t):.2f}.png'))
elif mode == 'video':
    c = rest[0]
    act = bpy.data.actions[c]
    R.set_action(arm, act)
    f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
    cam_default(az=float(opt('--az', 32)), dist=float(opt('--dist', 44)), focus=(1.0, 0, 6.4))
    for i, f in enumerate(range(f0, f1 + 1)):
        scene.frame_set(f)
        stage.still(os.path.join(out, f'{c}_{i:04d}.png'))
print('REVIEW_DONE', mode)

if mode == 'probe':
    # world positions of the fists, feet and head at chosen times (contract checks)
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        rows = []
        for b in ('L_Hand', 'R_Hand', 'L_Foot', 'R_Foot', 'Head', 'Hips'):
            pb = arm.pose.bones[b]
            p = arm.matrix_world @ (pb.tail if 'Hand' in b else pb.head)
            rows.append(f'{b}=({p.x:.2f},{p.y:.2f},{p.z:.2f})')
        print('PROBE', c, t, ' '.join(rows))

if mode == 'analyze':
    # Objective checks per clip: ground penetration, planted-foot slide, joint pops.
    import numpy as np
    body = next(o for o in scene.objects if o.type == 'MESH' and o.parent == arm)
    names = rest[0].split(',') if rest and not rest[0].startswith('--') else sorted(
        a.name for a in bpy.data.actions if a.get('duration'))
    for c in names:
        act = bpy.data.actions[c]
        R.set_action(arm, act)
        f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
        minz, worst_pop, pop_bone, minz_t, pop_t = 99.0, 0.0, '', 0.0, 0.0
        prevq = {}
        feet = {'L_Foot': [], 'R_Foot': []}
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            if (f - f0) % 3 == 0:
                dg = bpy.context.evaluated_depsgraph_get()
                ev = body.evaluated_get(dg)
                n = len(ev.data.vertices)
                co = np.empty(n * 3)
                ev.data.vertices.foreach_get('co', co)
                mz = float(co.reshape(-1, 3)[:, 2].min())
                if mz < minz:
                    minz, minz_t = mz, (f - f0) / R.FPS
            for pb in arm.pose.bones:
                q = pb.matrix.to_quaternion()
                if pb.name in prevq:
                    ang = math.degrees(prevq[pb.name].rotation_difference(q).angle)
                    ang = min(ang, 360 - ang)
                    if ang > worst_pop and not pb.name.startswith(('Loin', 'Tally', 'R_Chain', 'Belly')):
                        worst_pop, pop_bone, pop_t = ang, pb.name, (f - f0) / R.FPS
                prevq[pb.name] = q
            for fb in feet:
                feet[fb].append(arm.pose.bones[fb].head.copy())
        slide = []
        for fb, pts in feet.items():
            for a, b in zip(pts, pts[1:]):
                if a.z < 1.02 and b.z < 1.02:
                    slide.append((b - a).length * R.FPS)
        sl = (min(slide), max(slide)) if slide else (0, 0)
        print(f'ANALYZE {c:22s} n={f1 - f0 + 1:3d} minz={minz:6.2f}@{minz_t:4.2f} pop={worst_pop:5.1f}@{pop_bone}@{pop_t:4.2f} '
              f'planted_speed=[{sl[0]:.2f},{sl[1]:.2f}]')

if mode == 'lowest':
    import numpy as np
    body = next(o for o in scene.objects if o.type == 'MESH' and o.parent == arm)
    gname = {g.index: g.name for g in body.vertex_groups}
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        dg = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(dg)
        zs = np.empty(len(ev.data.vertices) * 3)
        ev.data.vertices.foreach_get('co', zs)
        zs = zs.reshape(-1, 3)
        order = np.argsort(zs[:, 2])[:400:40]
        out = []
        for i in order:
            v = body.data.vertices[int(i)]
            g = max(v.groups, key=lambda gg: gg.weight) if v.groups else None
            out.append(f'{zs[i, 2]:.2f}:{gname[g.group] if g else "?"}')
        print('LOWEST', c, t, ' '.join(out))

if mode == 'rot':
    # per-frame rotation steps of a bone chain around a time window
    c, t0, t1 = rest[0], float(rest[1]), float(rest[2])
    bones = rest[3].split(',')
    act = bpy.data.actions[c]
    R.set_action(arm, act)
    prev = {}
    f = act.frame_range[0] + t0 * R.FPS
    while f <= act.frame_range[0] + t1 * R.FPS:
        scene.frame_set(int(f))
        row = []
        for b in bones:
            q = arm.pose.bones[b].matrix.to_quaternion()
            if b in prev:
                a = math.degrees(prev[b].rotation_difference(q).angle)
                row.append(f'{b}:{min(a, 360 - a):5.1f}')
            prev[b] = q
        print('ROT', int(f), ' '.join(row))
        f += 1
