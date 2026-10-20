"""Korgath the Bound's two-hand blows, the left arm put back on the haft.

The shipped body (public/models/creatures/woc_sanctum_korgath.glb) swings its
maul with both hands in its two auto attacks, HammerSlam and HammerSweep, but
the left hand never closes on the haft: through the wind-up and the swing it
hangs a yard off the haft and the elbow folds behind his back. This script
re-solves the left arm only, frame by frame: the left hand's tail is held on
the haft (below the right fist, toward the pommel) by an IK chain of three
(upper arm, forearm, hand) whose pole rides his chest, out to his left and in
front, so the elbow never crosses behind the torso. The influence fades in
over the first frames and out before the recovery, so both ends stay exactly on
Idle. Every other bone is the clip's own.

Run (background):
  blender -b --factory-startup --python korgath_two_hand_fix.py -- \
      --src tmp/korgath/korgath_edit.glb --out tmp/korgath [--save x.blend]
"""
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


SRC = arg('--src')
OUT = arg('--out')
SAVE = arg('--save')
# The left hand's grip on the haft, in the hammer bone's frame (the haft runs
# along +Y from the pommel at -0.2 to the head at 1.45; the right fist sits at
# 0.4): a fist's width toward the pommel.
GRIP_L = Vector((0.0, 0.2, 0.0))
# The left elbow's pole in the chest bone's frame: out to his left, in front,
# a little low (bone frame: X his left, Y up the spine, Z his front).
POLE_L = Vector((0.75, -0.1, 0.55))
# Per clip: the frames the IK holds full (fade in before, out after).
CLIPS = {
    'HammerSlam': (5, 34),
    'HammerSweep': (5, 35),
}
FADE = 4
# The body's clips are keyed at 30 fps: imported and baked at 30 so every
# original key is kept (a 24 fps bake drifts the fast frames by degrees).
FPS = 30


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=SRC)
    scene = bpy.context.scene
    scene.render.fps = FPS
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    pb = arm.pose.bones
    W = arm.matrix_world
    target = bpy.data.objects.new('GripL', None)
    pole = bpy.data.objects.new('PoleL', None)
    for e in (target, pole):
        scene.collection.objects.link(e)
    fixed = []
    for name, (h0, h1) in CLIPS.items():
        src = bpy.data.actions[name]
        f0, f1 = int(src.frame_range[0]), int(src.frame_range[1])
        arm.animation_data.action = src
        # sample the clip's own hammer and chest frames first (no IK yet)
        for c in list(pb['hand.l'].constraints):
            pb['hand.l'].constraints.remove(c)
        targets = {}
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            hm = W @ pb['hammer'].matrix
            cm = W @ pb['chest'].matrix
            targets[f] = (hm @ GRIP_L, cm @ POLE_L)
        for e in (target, pole):
            if e.animation_data:
                e.animation_data_clear()
        for f, (t, p) in targets.items():
            target.location = t
            pole.location = p
            target.keyframe_insert('location', frame=f)
            pole.keyframe_insert('location', frame=f)
        ik = pb['hand.l'].constraints.new('IK')
        ik.target = target
        ik.pole_target = pole
        ik.pole_angle = 0.0
        ik.chain_count = 3
        ik.use_tail = True
        for f in range(f0, f1 + 1):
            if f < h0 - FADE or f > h1 + FADE:
                k = 0.0
            elif f < h0:
                k = (f - (h0 - FADE)) / FADE
            elif f > h1:
                k = 1.0 - (f - h1) / FADE
            else:
                k = 1.0
            k = k * k * (3 - 2 * k)
            ik.influence = k
            ik.keyframe_insert('influence', frame=f)
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.pose.select_all(action='SELECT')
        bpy.ops.nla.bake(frame_start=f0, frame_end=f1, step=1, only_selected=True, visual_keying=True,
                         clear_constraints=False, use_current_action=False, bake_types={'POSE'})
        bpy.ops.object.mode_set(mode='OBJECT')
        out = arm.animation_data.action
        out.use_fake_user = True
        pb['hand.l'].constraints.remove(ik)
        src.name = name + '_Original'
        out.name = name
        fixed.append(out)
        print('FIXED', name, f0, f1)
    if OUT:
        export(arm, fixed, os.path.join(OUT, 'korgath_two_hand_clips.glb'))
    if SAVE:
        bpy.ops.wm.save_as_mainfile(filepath=SAVE)


def export(arm, actions, path):
    for o in bpy.data.objects:
        o.select_set(False)
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    ad = arm.animation_data
    ad.action = None
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    tracks = []
    for a in actions:
        tr = ad.nla_tracks.new()
        tr.name = a.name
        tr.strips.new(a.name, int(a.frame_range[0]), a)
        tracks.append(tr)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_frame_step=1, export_cameras=False,
                              export_lights=False)
    for tr in tracks:
        ad.nla_tracks.remove(tr)
    print('WROTE', path, os.path.getsize(path))


if __name__ == '__main__':
    main()
