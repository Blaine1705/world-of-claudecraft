"""Review renders and objective checks of a built Voltaic Warden .blend (authoring aid).

  blender -b voltaic.blend --python review.py -- <out_dir> <mode> [args] [--knight k.glb] [+cycles]

  views                      turnaround at Idle (front, threeq, side, back, low) next to the knight
  plates                     both plate faces: copper (Idle), charged (FlipRattle end), split (heroic)
  closeup                    head, coil, fist, foot, crown, shoulder
  sheet  Clip,Clip [N]       N evenly spaced frames per clip (prefix_<Clip>_<i>.png)
  frames Clip:t,Clip:t       stills at times in seconds
  video  Clip                every frame of a clip (for the MP4s)
  analyze [Clip,Clip]        ground penetration, planted-foot speed, joint pops per clip
  probe  Clip:t,...          anchor positions at times
"""
import math
import os
import sys

import bpy
from mathutils import Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import frame as FR  # noqa: E402
import rig as R  # noqa: E402
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out, mode = argv[0], argv[1]
rest = list(argv[2:])


def opt(name, default=None):
    return rest[rest.index(name) + 1] if name in rest else default


scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.startswith('VoltaicWarden'))
body = next(o for o in scene.objects if o.type == 'MESH' and o.parent == arm)
for o in scene.objects:
    if o.name.endswith('_hi') or '_hi.' in o.name:
        o.hide_render = True
KNIGHT_AT = (5.2, -4.6, 0.0)
NEEDS_STAGE = mode in ('views', 'closeup', 'sheet', 'frames', 'video', 'plates')
if NEEDS_STAGE:
    cam = stage.setup(knight=opt('--knight'), engine='CYCLES' if '+cycles' in rest else 'EEVEE',
                      res=(int(opt('--w', 1280)), int(opt('--h', 860))), ref_height=2.6, sky=(0.22, 0.25, 0.3),
                      ref_at=KNIGHT_AT)
    if '+cycles' in rest:
        scene.cycles.samples = int(opt('--samples', 48))
    if '+dark' in rest:
        for o in scene.objects:
            if o.type == 'LIGHT':
                o.data.energy *= 0.45
        scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.2


def act_time(name, t):
    act = bpy.data.actions[name]
    R.set_action(arm, act)
    f0, f1 = act.frame_range
    f = f0 + t * R.FPS
    scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))


def freeze():
    """Keep the evaluated pose and drop the action so bones can be posed by hand."""
    bpy.context.view_layer.update()
    arm.animation_data.action = None


def bone_world(name, tail=False):
    pb = arm.pose.bones[name]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


VIEWS = (
    ('front', 0, 6, 34, (0.0, -1.0, 5.0), 45),
    ('threeq', 38, 10, 36, (0.6, 0.0, 5.0), 45),
    ('side', 90, 5, 36, (0.0, 0.0, 5.0), 45),
    ('back', 160, 10, 35, (0.0, 0.5, 5.2), 45),
    ('low', 24, -3, 20, (0.0, -1.0, 6.0), 28),
    ('top', 30, 48, 34, (0.0, 0.0, 4.6), 45),
)


def cam_default(az=35, el=10, dist=38, focus=(0.0, 0.0, 4.8), lens=45):
    stage.aim(cam, az, el, dist, focus, lens)


if mode == 'views':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.0)))
    only = opt('--only')
    for name, az, el, dist, focus, lens in VIEWS:
        if only and name not in only.split(','):
            continue
        stage.aim(cam, az, el, dist, focus, lens)
        stage.still(os.path.join(out, f'{name}.png'))
elif mode == 'plates':
    for tag, setup in (('copper', 'idle'), ('charged', 'flip'), ('split', 'split')):
        if setup == 'flip':
            act_time('FlipRattle', 3.0)
        else:
            act_time('Idle', 0.0)
        if setup == 'split':
            freeze()
            for p in FR.PLATES:
                if p.group == 'back':
                    arm.pose.bones['Plate_' + p.name].rotation_quaternion = Quaternion((0, 1, 0), math.pi)
            bpy.context.view_layer.update()
        for name, az, el, dist, focus, lens in (('front', 20, 8, 30, (0.0, -0.5, 5.6), 45),
                                                 ('back', 200, 12, 30, (0.0, 0.5, 5.8), 45)):
            stage.aim(cam, az, el, dist, focus, lens)
            stage.still(os.path.join(out, f'plates_{tag}_{name}.png'))
        if setup == 'flip':
            c = bone_world('Plate_ChestL')
            stage.aim(cam, 25, 6, 7.5, (c.x - 0.6, c.y, c.z + 0.3), 50)
            stage.still(os.path.join(out, 'plates_charged_close.png'))
        if setup == 'idle':
            c = bone_world('Plate_ChestL')
            stage.aim(cam, 25, 6, 7.5, (c.x - 0.6, c.y, c.z + 0.3), 50)
            stage.still(os.path.join(out, 'plates_copper_close.png'))
elif mode == 'closeup':
    act_time(opt('--clip', 'Idle'), float(opt('--t', 0.0)))
    h = bone_world('Head')
    shots = [
        ('head_front', 0, 3, 6.5, (h.x, h.y - 0.2, h.z + 0.3), 50),
        ('head_threeq', 38, 8, 6.8, (h.x, h.y - 0.2, h.z + 0.3), 50),
        ('head_side', 88, 4, 7.0, (h.x, h.y, h.z + 0.3), 50),
    ]
    c = FR.COIL_C
    shots.append(('coil', 18, 6, 6.5, (c[0], c[1], c[2]), 50))
    f = bone_world('L_Hand', tail=True)
    shots.append(('fist', 60, 10, 6.0, (f.x, f.y, f.z), 50))
    a = bone_world('L_Foot')
    shots.append(('foot', 30, 12, 7.0, (a.x, a.y - 0.4, a.z - 0.3), 50))
    cr = bone_world('CrownTop')
    shots.append(('crown', 150, 18, 8.0, (cr.x, cr.y, cr.z - 0.2), 50))
    sh = bone_world('L_Pauldron')
    shots.append(('shoulder', 55, 14, 8.0, (sh.x, sh.y, sh.z - 0.4), 50))
    e = bone_world('L_Forearm')
    shots.append(('elbow', 100, 4, 6.5, (e.x, e.y, e.z), 50))
    k = bone_world('L_Shin')
    shots.append(('knee', 70, 4, 7.0, (k.x, k.y, k.z - 0.3), 50))
    only = opt('--only')
    for name, az, el, dist, focus, lens in shots:
        if only and name not in only.split(','):
            continue
        stage.aim(cam, az, el, dist, focus, lens)
        stage.still(os.path.join(out, f'{name}.png'))
elif mode == 'sheet':
    clips = rest[0].split(',')
    n = int(rest[1]) if len(rest) > 1 and rest[1].isdigit() else 8
    prefix = opt('--prefix', 'voltaic')
    for c in clips:
        act = bpy.data.actions[c]
        dur = (act.frame_range[1] - act.frame_range[0]) / R.FPS
        for i in range(n):
            t = dur * i / max(1, n - 1)
            act_time(c, t)
            cam_default(az=float(opt('--az', 35)), dist=float(opt('--dist', 40)))
            stage.still(os.path.join(out, f'{prefix}_{c}_{i}.png'))
elif mode == 'frames':
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        cam_default(az=float(opt('--az', 35)), dist=float(opt('--dist', 38)))
        stage.still(os.path.join(out, f'{c}_{float(t):.2f}.png'))
elif mode == 'video':
    c = rest[0]
    act = bpy.data.actions[c]
    R.set_action(arm, act)
    f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
    cam_default(az=float(opt('--az', 35)), dist=float(opt('--dist', 40)))
    for i, f in enumerate(range(f0, f1 + 1)):
        scene.frame_set(f)
        stage.still(os.path.join(out, f'{c}_{i:04d}.png'))
elif mode == 'probe':
    for spec in rest[0].split(','):
        c, t = spec.split(':')
        act_time(c, float(t))
        rows = []
        for b in ('L_Hand', 'R_Hand', 'L_Foot', 'R_Foot', 'Head', 'CoilCore', 'CrownTop', 'HatchL'):
            p = bone_world(b)
            rows.append(f'{b}=({p.x:.2f},{p.y:.2f},{p.z:.2f})')
        print('PROBE', c, t, ' '.join(rows))
elif mode == 'analyze':
    import numpy as np
    names = rest[0].split(',') if rest and not rest[0].startswith('-') else sorted(
        a.name for a in bpy.data.actions if a.get('duration'))
    SKIP = ('Plate', 'Piston', 'CoilCore', 'CrownTop', 'Hatch', 'Pauldron')
    for c in names:
        act = bpy.data.actions[c]
        R.set_action(arm, act)
        f0, f1 = int(act.frame_range[0]), int(math.ceil(act.frame_range[1]))
        minz, worst_pop, pop_bone, minz_t, pop_t, low_bone = 99.0, 0.0, '', 0.0, 0.0, ''
        prevq = {}
        feet = {b: [] for b in ('L_Foot', 'R_Foot')}
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            if (f - f0) % 2 == 0:
                dg = bpy.context.evaluated_depsgraph_get()
                ev = body.evaluated_get(dg)
                co = np.empty(len(ev.data.vertices) * 3)
                ev.data.vertices.foreach_get('co', co)
                zz = co.reshape(-1, 3)[:, 2]
                mz = float(zz.min())
                if mz < minz:
                    minz, minz_t = mz, (f - f0) / R.FPS
                    vi = int(zz.argmin())
                    gs = body.data.vertices[vi].groups
                    low_bone = body.vertex_groups[max(gs, key=lambda g: g.weight).group].name if gs else '?'
            for pb in arm.pose.bones:
                q = pb.matrix.to_quaternion()
                if pb.name in prevq:
                    ang = math.degrees(prevq[pb.name].rotation_difference(q).angle)
                    ang = min(ang, 360 - ang)
                    if ang > worst_pop and not any(k in pb.name for k in SKIP):
                        worst_pop, pop_bone, pop_t = ang, pb.name, (f - f0) / R.FPS
                prevq[pb.name] = q
            for fb in feet:
                feet[fb].append(arm.pose.bones[fb].head.copy())
        slide = []
        for fb, pts in feet.items():
            for a, b in zip(pts, pts[1:]):
                if a.z < 0.97 and b.z < 0.97:
                    slide.append((b - a).length * R.FPS)
        sl = (min(slide), max(slide)) if slide else (0, 0)
        print(f'ANALYZE {c:12s} n={f1 - f0 + 1:3d} minz={minz:6.2f}@{minz_t:4.2f}({low_bone}) pop={worst_pop:5.1f}@{pop_bone}'
              f'@{pop_t:4.2f} planted_speed=[{sl[0]:.2f},{sl[1]:.2f}]')
print('REVIEW_DONE', mode)
