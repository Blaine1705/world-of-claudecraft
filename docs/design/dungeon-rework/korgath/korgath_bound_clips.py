"""Korgath the Bound's chained clips: kneeling at his seal, the maul on the
ground beside him, and the rise to his feet on the pull.

The shipped body (public/models/creatures/woc_sanctum_korgath.glb, 16 clips)
is left as it is; this script authors new clips on its own rig and the merge
(merge_korgath_clips.mjs) appends them to the shipped GLB:

  BoundKneel   loop, 6 s: down on his right knee, the left foot planted, the
               seal chains hauling his arms out to the pillars; he sags, gathers,
               heaves against the chains with his head thrown back in a roar,
               and is dragged back down. The maul lies on the terrace at his
               right hand (the `hammer` bone held on the ground).
  BoundRise    2.4 s, ends exactly on Idle's first frame: he reaches down, closes
               his fist on the maul's haft, and stands with it.

Run (background):
  blender -b --factory-startup --python korgath_bound_clips.py -- \
      --src tmp/korgath/korgath_edit.glb --out tmp/korgath [--renders DIR] [--save x.blend]

`korgath_edit.glb` is the shipped GLB decoded (meshopt off, textures dropped:
merge_korgath_clips.mjs --decode). Blender frame: Z up, his front -Y, his left
+X; 24 fps. Deterministic: every pose is a table below.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


SRC = arg('--src')
OUT = arg('--out')
RENDERS = arg('--renders')
SAVE = arg('--save')
FPS = 24

# ---------------------------------------------------------------- the poses
# World (Blender) targets. Hips drop from Idle's 5.24 to the kneel.
# Each kneel state: hips (dx, dy, dz) from Idle, spine/chest/neck/head pitch
# (degrees, + bends forward) and yaw, hand IK targets, elbow poles.
FOOT_L = (1.12, -2.35, 0.62)     # the planted left foot (ankle)
FOOT_R = (-1.0, 2.55, 0.62)      # the right shin laid back, the ankle behind
KNEE_POLE_L = (1.2, -8.0, 3.0)
KNEE_POLE_R = (-1.2, -6.0, 0.0)
STATES = {
    # sagging between heaves: bowed, the chains holding his arms out and back
    'sag': dict(hips=(0.0, 0.25, -2.42), spine=(14, 0), chest=(10, 0), neck=(12, 0), head=(18, 0),
                hand_r=(-4.15, 0.9, 4.05), hand_l=(4.15, 0.9, 4.05), elbow_r=(-6.0, 3.0, 5.5),
                elbow_l=(6.0, 3.0, 5.5)),
    # gathering: shoulders roll forward, fists drawn in against the chains
    'gather': dict(hips=(0.0, 0.05, -2.3), spine=(20, 4), chest=(14, 3), neck=(6, 0), head=(6, -4),
                   hand_r=(-3.4, -0.9, 4.9), hand_l=(3.45, -0.7, 4.85), elbow_r=(-6.0, 1.0, 4.0),
                   elbow_l=(6.0, 1.0, 4.0)),
    # the heave: torso arched back, arms wrenched forward, head thrown back
    'heave': dict(hips=(0.0, 0.0, -2.08), spine=(-6, -3), chest=(-12, -2), neck=(-16, 0), head=(-28, 6),
                  hand_r=(-3.0, -2.2, 5.9), hand_l=(3.05, -2.0, 5.85), elbow_r=(-6.0, -0.5, 5.0),
                  elbow_l=(6.0, -0.5, 5.0)),
    # dragged back down: the chains win, he lurches
    'recoil': dict(hips=(0.0, 0.32, -2.5), spine=(22, -3), chest=(14, -2), neck=(14, 0), head=(26, 0),
                   hand_r=(-4.5, 1.4, 3.75), hand_l=(4.4, 1.3, 3.8), elbow_r=(-6.0, 3.5, 5.0),
                   elbow_l=(6.0, 3.5, 5.0)),
}
KNEEL_KEYS = [(0, 'sag'), (30, 'sag'), (54, 'gather'), (78, 'heave'), (96, 'heave'), (112, 'recoil'),
              (144, 'sag')]
KNEEL_END = 144
# Where the maul lies (its `hammer` bone's world translation is moved here
# from the Death clip's last frame, where it lies flat on the floor).
MAUL_AT = (-4.6, -3.1)
RISE_END = 58                     # 2.4 s
RISE_REACH = 20                   # the hand on the haft
RISE_GRIP = (24, 30)              # the maul passes from the ground to the fist


def euler_q(pitch, yaw):
    return Euler((math.radians(pitch), math.radians(yaw), 0.0), 'XYZ').to_quaternion()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    scene = bpy.context.scene
    scene.render.fps = FPS
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    pb = arm.pose.bones
    idle = bpy.data.actions['Idle']
    death = bpy.data.actions['Death']
    arm.animation_data.action = death
    scene.frame_set(int(death.frame_range[1]))
    bpy.context.view_layer.update()
    maul_world = (arm.matrix_world @ pb['hammer'].matrix).copy()
    arm.animation_data.action = idle
    scene.frame_set(0)
    bpy.context.view_layer.update()
    idle_basis = {b.name: (b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy()) for b in pb}
    idle_hammer_local = (arm.matrix_world @ pb['hand.r'].matrix).inverted() @ (arm.matrix_world @ pb['hammer'].matrix)
    grip_world_idle = arm.matrix_world @ pb['hand.r'].head
    grip_in_hammer = (arm.matrix_world @ pb['hammer'].matrix).inverted() @ grip_world_idle
    hips_idle = arm.matrix_world @ pb['hips'].head
    t = maul_world.translation
    maul_world.translation = Vector((MAUL_AT[0], MAUL_AT[1], t.z))
    grip_ground = maul_world @ grip_in_hammer
    print('MAUL', tuple(round(v, 2) for v in maul_world.translation), 'GRIP', tuple(round(v, 2) for v in grip_ground))

    def empty(name, loc):
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.4
        scene.collection.objects.link(e)
        e.location = Vector(loc)
        return e

    tgt = {k: empty('IK_' + k, (0, 0, 0)) for k in ('hand_r', 'hand_l', 'elbow_r', 'elbow_l')}
    foot_l = empty('IK_foot_l', FOOT_L)
    foot_r = empty('IK_foot_r', FOOT_R)
    pole_l = empty('POLE_knee_l', KNEE_POLE_L)
    pole_r = empty('POLE_knee_r', KNEE_POLE_R)
    maul = empty('MaulGround', (0, 0, 0))
    maul.matrix_world = maul_world

    def ik(bone, target, pole, count=2, pole_angle=0.0):
        c = pb[bone].constraints.new('IK')
        c.target = target
        c.pole_target = pole
        c.pole_angle = pole_angle
        c.chain_count = count
        c.use_tail = True
        return c

    c_leg_l = ik('lowerleg.l', foot_l, pole_l, pole_angle=math.radians(-90))
    c_leg_r = ik('lowerleg.r', foot_r, pole_r, pole_angle=math.radians(-90))
    c_arm_r = ik('lowerarm.r', tgt['hand_r'], tgt['elbow_r'], pole_angle=math.radians(180))
    c_arm_l = ik('lowerarm.l', tgt['hand_l'], tgt['elbow_l'], pole_angle=math.radians(0))
    c_maul = pb['hammer'].constraints.new('COPY_TRANSFORMS')
    c_maul.target = maul
    iks = [c_leg_l, c_leg_r, c_arm_r, c_arm_l]

    act = bpy.data.actions.new('BoundKneelSrc')
    arm.animation_data.action = act

    def key_state(frame, st, ik_on=1.0, maul_on=1.0):
        scene.frame_set(frame)
        for b in pb:
            loc, q, s = idle_basis[b.name]
            b.location, b.rotation_quaternion, b.scale = loc.copy(), q.copy(), s.copy()
        dx, dy, dz = st['hips']
        pb['hips'].location = idle_basis['hips'][0] + Vector((dx, dz, -dy)) / arm.matrix_world.to_scale()[0]
        for bone in ('spine', 'chest', 'neck', 'head'):
            pitch, yaw = st[bone]
            pb[bone].rotation_quaternion = idle_basis[bone][1] @ euler_q(pitch, yaw)
        for b in pb:
            b.keyframe_insert('location', frame=frame)
            b.keyframe_insert('rotation_quaternion', frame=frame)
            b.keyframe_insert('scale', frame=frame)
        for k in ('hand_r', 'hand_l', 'elbow_r', 'elbow_l'):
            tgt[k].location = Vector(st[k])
            tgt[k].keyframe_insert('location', frame=frame)
        for c in iks:
            c.influence = ik_on
            c.keyframe_insert('influence', frame=frame)
        c_maul.influence = maul_on
        c_maul.keyframe_insert('influence', frame=frame)

    for frame, name in KNEEL_KEYS:
        key_state(frame, STATES[name])
    for fc in (act.fcurves if hasattr(act, 'fcurves') else []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    kneel = bake(arm, 'BoundKneel', 0, KNEEL_END)

    # ---- the rise: from the sag to Idle's first frame, the maul taken up
    act2 = bpy.data.actions.new('BoundRiseSrc')
    arm.animation_data.action = act2
    for o in tgt.values():
        if o.animation_data:
            o.animation_data_clear()
    for b in pb:
        for c in b.constraints:
            pass
    sag = STATES['sag']
    key_state(0, sag)
    reach = dict(sag, hips=(0.0, -0.1, -2.6), spine=(42, -14), chest=(22, -8), neck=(4, 0), head=(-6, 0),
                 hand_r=tuple(grip_ground), elbow_r=(-6.0, 1.0, 6.0))
    key_state(RISE_REACH, reach)
    key_state(RISE_GRIP[0], reach, maul_on=1.0)
    lift = dict(reach, hips=(0.0, 0.0, -1.6), spine=(26, -6), chest=(12, -4), head=(4, 0),
                hand_r=(-2.6, -0.8, 4.6), hand_l=(3.4, -0.4, 4.8))
    key_state(RISE_GRIP[1], lift, maul_on=1.0)
    # standing: the IK lets go, the FK base is Idle's first frame exactly
    scene.frame_set(RISE_END)
    for b in pb:
        loc, q, s = idle_basis[b.name]
        b.location, b.rotation_quaternion, b.scale = loc.copy(), q.copy(), s.copy()
        b.keyframe_insert('location', frame=RISE_END)
        b.keyframe_insert('rotation_quaternion', frame=RISE_END)
        b.keyframe_insert('scale', frame=RISE_END)
    for c in iks:
        c.influence = 0.0
        c.keyframe_insert('influence', frame=RISE_END)
        c.influence = 1.0
        c.keyframe_insert('influence', frame=40)
    c_maul.influence = 0.0
    c_maul.keyframe_insert('influence', frame=RISE_END)
    for k in ('hand_r', 'hand_l', 'elbow_r', 'elbow_l'):
        tgt[k].keyframe_insert('location', frame=RISE_END)
    # the maul glued to the fist from the grip: it turns about the hand from
    # lying flat to the carry, then the constraint lets go on the carry
    g0, g1 = RISE_GRIP
    hold = g1 + 1
    c_maul.influence = 0.0
    c_maul.keyframe_insert('influence', frame=hold)
    for fc in _fcurves(arm):
        if 'influence' in fc.data_path:
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT' if 'hammer' in fc.data_path else kp.interpolation
    scene.frame_set(hold)
    bpy.context.view_layer.update()
    held = (arm.matrix_world @ pb['hammer'].matrix).copy()
    maul.rotation_mode = 'QUATERNION'
    qg = maul_world.to_quaternion()
    qh = held.to_quaternion()
    sc = maul_world.to_scale()
    maul.matrix_world = maul_world
    maul.keyframe_insert('location', frame=0)
    maul.keyframe_insert('rotation_quaternion', frame=0)
    maul.keyframe_insert('location', frame=g0)
    maul.keyframe_insert('rotation_quaternion', frame=g0)
    for f in range(g0 + 1, hold + 1):
        u = (f - g0) / (hold - g0)
        u = u * u * (3 - 2 * u)
        scene.frame_set(f)
        bpy.context.view_layer.update()
        wrist = arm.matrix_world @ pb['hand.r'].head
        q = qg.slerp(qh, u)
        rs = Matrix.LocRotScale(Vector((0, 0, 0)), q, sc)
        off = rs @ grip_in_hammer
        maul.matrix_world = Matrix.LocRotScale(wrist - off, q, sc)
        maul.keyframe_insert('location', frame=f)
        maul.keyframe_insert('rotation_quaternion', frame=f)
    rise = bake(arm, 'BoundRise', 0, RISE_END)
    print('CLIPS', kneel.name, kneel.frame_range[:], rise.name, rise.frame_range[:])
    print('HIPS_IDLE', tuple(round(v, 2) for v in hips_idle))
    # the source actions and the constraints never ship
    for b in pb:
        for c in list(b.constraints):
            b.constraints.remove(c)
    for a in (act, act2):
        bpy.data.actions.remove(a)
    if OUT:
        export(arm, [kneel, rise], os.path.join(OUT, 'korgath_bound_clips.glb'))
    if RENDERS:
        review(arm, [kneel, rise], RENDERS)
    if SAVE:
        bpy.ops.wm.save_as_mainfile(filepath=SAVE)


def _fcurves(arm):
    a = arm.animation_data.action
    if hasattr(a, 'fcurves'):
        return list(a.fcurves)
    out = []
    for layer in getattr(a, 'layers', []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


def bake(arm, name, f0, f1):
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, step=1, only_selected=True, visual_keying=True,
                     clear_constraints=False, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    a = arm.animation_data.action
    a.name = name
    a.use_fake_user = True
    return a


def export(arm, actions, path):
    """Only the armature, every new clip as its own glTF animation."""
    for o in bpy.data.objects:
        o.select_set(False)
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    ad = arm.animation_data
    ad.action = None
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for a in actions:
        tr = ad.nla_tracks.new()
        tr.name = a.name
        st = tr.strips.new(a.name, int(a.frame_range[0]), a)
        st.name = a.name
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_frame_step=1, export_cameras=False,
                              export_lights=False)
    print('WROTE', path, os.path.getsize(path))


def review(arm, actions, out_dir):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'entrance'))
    import entrance_common as ec
    os.makedirs(out_dir, exist_ok=True)
    ec.setup_eevee(res=(1200, 900), samples=24)
    ec.setup_world('dusk', strength=1.0, sun_dir=(0.4, -0.7, 0.6), sun_strength=3.0)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    floor = bpy.context.active_object
    fm = bpy.data.materials.new('ReviewFloor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.1, 0.13, 1)
    floor.data.materials.append(fm)
    clay = bpy.data.materials.new('ReviewClay')
    clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.27, 0.24, 1)
    clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
    for o in arm.children:
        if o.type == 'MESH':
            o.data.materials.clear()
            o.data.materials.append(clay)
    gr = type('GR', (), {'walk': staticmethod(lambda x, z: 0.0)})()
    ec.import_knight(gr, 6.5, 1.0, yaw_deg=200, name='Knight_Scale')
    ad = arm.animation_data
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    cams = {'frente': ((6.0, -17.0, 5.0), (-1.0, 0.0, 3.4)), 'lado': ((-18.0, -3.0, 4.0), (0.0, 0.0, 3.2))}
    for a in actions:
        ad.action = a
        f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
        frames = [0, 36, 72, 108] if a.name == 'BoundKneel' else [0, 14, 22, 27, 31, 43, 58]
        for f in frames:
            bpy.context.scene.frame_set(f)
            for tag, (loc, tg) in cams.items():
                cam = ec.add_camera('Cam_%s_%s_%d' % (a.name, tag, f), Vector(loc), Vector(tg), lens=35)
                ec.render(cam, os.path.join(out_dir, '%s_%03d_%s.png' % (a.name, f, tag)))


if __name__ == '__main__':
    main()
