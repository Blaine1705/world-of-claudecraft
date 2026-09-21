"""Hoarfrost Warden, playtest fixes on Tripo's own biped rig.

He keeps Tripo's rig (the local KayKit rig does not fit his proportions: huge
shoulders over short legs), and two things are repaired per retargeted clip:

  * Jelly arms. His arms are rigid ice gauntlets, but the auto-rig smeared them
    over the twist chains and the hand. The twist bones and the hand are folded
    into their parent arm bone and the arm weights are sharpened, so each
    gauntlet moves as one solid piece.
  * Forearms held out in front. The presets were authored for a slim A-pose and
    retarget onto his wide stance as a permanent "carrying a tray" pose. Every
    arm rotation is relaxed toward his generated rest pose (arms at his sides),
    which keeps a share of the motion as life.

  --attack replaces the clip with an authored two-fisted overhead slam.

  blender --background --python frost_fix.py -- <in.glb> <out.glb> <relax 0..1> [--attack <fixed idle.glb>]
"""
import math
import sys

import bpy
from mathutils import Matrix, Quaternion

args = sys.argv[sys.argv.index('--') + 1:]
src, dst, relax = args[0], args[1], float(args[2])
attack = '--attack' in args
idle_src = args[args.index('--attack') + 1] if attack else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
meshes = [o for o in scene.objects if o.type == 'MESH' and o.find_armature() is arm]
for o in list(scene.objects):
    if o.type == 'MESH' and o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)

# ---- weights
FOLD = {}
for s in ('L_', 'R_'):
    for twist in ('UpperarmTwist01', 'UpperarmTwist02'):
        FOLD[s + twist] = s + 'Upperarm'
    for twist in ('ForearmTwist01', 'ForearmTwist02', 'Hand'):
        FOLD[s + twist] = s + 'Forearm'
ARM_GROUPS = {s + b for s in ('L_', 'R_') for b in ('Upperarm', 'Forearm')}
for mesh in meshes:
    names = {g.index: g.name for g in mesh.vertex_groups}
    index = {g.name: g for g in mesh.vertex_groups}
    for v in mesh.data.vertices:
        weights = {}
        for g in v.groups:
            name = FOLD.get(names[g.group], names[g.group])
            weights[name] = weights.get(name, 0.0) + g.weight
        if sum(w for n, w in weights.items() if n in ARM_GROUPS) > 0.5:
            weights = {n: w ** 4 for n, w in weights.items()}
        total = sum(weights.values()) or 1.0
        for g in list(v.groups):
            mesh.vertex_groups[g.group].remove([v.index])
        for name, w in weights.items():
            if w / total > 1e-4:
                index[name].add([v.index], w / total, 'REPLACE')

# ---- clip
ARM_BONES = [s + b for s in ('L_', 'R_') for b in (
    'Clavicle', 'Upperarm', 'UpperarmTwist01', 'UpperarmTwist02',
    'Forearm', 'ForearmTwist01', 'ForearmTwist02', 'Hand')]
action = arm.animation_data.action
name = action.name
f0, f1 = action.frame_range


def curves(act):
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


if not attack:
    identity = Quaternion()
    for bone in ARM_BONES:
        path = 'pose.bones["%s"].rotation_quaternion' % bone
        quad = sorted((c for c in curves(action) if c.data_path == path), key=lambda c: c.array_index)
        if len(quad) != 4:
            continue
        for k in range(len(quad[0].keyframe_points)):
            q = Quaternion([quad[i].keyframe_points[k].co[1] for i in range(4)])
            if q.w < 0:
                q.negate()
            q = q.slerp(identity, relax)
            for i in range(4):
                point = quad[i].keyframe_points[k]
                point.co[1] = q[i]
                point.handle_left[1] = q[i]
                point.handle_right[1] = q[i]
        for c in quad:
            c.update()
else:
    arm.animation_data.action = None
    bpy.data.actions.remove(action)
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    mw = arm.matrix_world

    def swing(bone, *turns):
        """Turn a bone from its REST pose about world axes through its head; the
        turns apply in order (the first is innermost)."""
        pb = arm.pose.bones[bone]
        pivot = mw @ pb.head
        rot = Matrix.Identity(4)
        for axis, degrees in turns:
            rot = Matrix.Rotation(math.radians(degrees), 4, axis) @ rot
        world = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot)
        pb.matrix = mw.inverted() @ world @ mw @ pb.matrix
        bpy.context.view_layer.update()

    # The stance every key starts from is the first frame of his (fixed) idle:
    # the presets carry bone offsets of their own, so the rig's bare rest pose
    # is NOT how he stands.
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=idle_src)
    extra = [o for o in scene.objects if o not in before]
    donor = next(o for o in extra if o.type == 'ARMATURE')
    scene.frame_set(1)
    bpy.context.view_layer.update()
    stance = {pb.name: pb.matrix_basis.copy() for pb in donor.pose.bones}
    donor_action = donor.animation_data.action if donor.animation_data else None
    for o in extra:
        bpy.data.objects.remove(o, do_unlink=True)
    if donor_action:
        bpy.data.actions.remove(donor_action)

    # He faces +X: a NEGATIVE turn about +Y lifts a hanging arm forward and up.
    # frame: (arms forward-up, spine lean forward, hips drop)
    KEYS = [(1, 0, 0, 0.0), (5, -150, -12, 0.0), (7, -160, -14, 0.0), (10, -48, 26, -0.035),
            (14, -44, 24, -0.035), (24, 0, 0, 0.0)]
    for frame, lift, lean, drop in KEYS:
        for pb in arm.pose.bones:
            pb.matrix_basis = stance[pb.name]
        bpy.context.view_layer.update()
        swing('Spine01', ('Y', lean))
        for side, inward in (('L_', -1), ('R_', 1)):
            # Fists together: over his head, then down in front of him.
            swing(side + 'Upperarm', ('X', inward * 12 if lift else 0), ('Y', lift))
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('scale', frame=frame)
        hip = arm.pose.bones['Hip']
        # Drop along the armature's up axis, whatever the bone's own axes are.
        hip.matrix = Matrix.Translation((0, 0, drop)) @ hip.matrix
        bpy.context.view_layer.update()
        hip.keyframe_insert('location', frame=frame)
    scene.frame_start, scene.frame_end = 1, 24

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in meshes:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', use_selection=True, export_yup=True,
    export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_optimize_animation_size=False,
)
print('WROTE', dst, 'ACTION', name)
