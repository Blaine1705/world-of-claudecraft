"""Korgath the Bound's maul clips: build from a spec module, bake, check, render, export.

The whole pipeline (Blender 5.2 background, run from the repo root; the
working files go to tmp/korgath_aaa/):

  1. The body as Blender reads it (textures decoded, quantization off), from
     the ORIGINAL body (before the finger bones):
       git show f4c6f0a705:public/models/creatures/woc_sanctum_korgath.glb > tmp/korgath_aaa/body_orig.glb
       node docs/design/dungeon-rework/korgath/maul_rig/decode_tex.mjs tmp/korgath_aaa/body_orig.glb tmp/korgath_aaa/korgath_tex.glb
  2. The left hand's joints and fist (finger_joints2.py writes finger_joints.json,
     fist_solve2.py -- t1 writes left_grip_t1.json, kept as left_grip.json).
  3. The finger bones into the shipped body:
       blender -b --python export_rig.py -- tmp/korgath_aaa/korgath_fingers_export.glb
       blender -b --python export_split.py -- tmp/korgath_aaa/left_hand_split.json
       node docs/design/dungeon-rework/korgath/patch_korgath_fingers.mjs tmp/korgath_aaa/korgath_fingers_export.glb tmp/korgath_aaa/left_hand_split.json --write
  4. The authoring base (body + finger bones + every clip, Blender's own export):
       blender -b --python export_base.py -- tmp/korgath_aaa/korgath_base.glb
  5. The clips (spec_slam.py, spec_sweep.py; spec_both builds both):
       blender -b --python run_clip.py -- spec_both <review dir> --export tmp/korgath_aaa/korgath_aaa_clips.glb [--save x.blend] [--render 0]
       node docs/design/dungeon-rework/korgath/ship_korgath_clip_fixes.mjs tmp/korgath_aaa/korgath_aaa_clips.glb
       node scripts/build_media_manifest.mjs generate


blender -b --python run_clip.py -- <spec_module> <out_dir> [--save x.blend] [--frames 0,4,8] [--views a,b]
"""
import os
import bpy, sys, os, math, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib, kanim, kclip
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SPEC, OUT = argv[0], argv[1]
def opt(k, d=None):
    return argv[argv.index(k) + 1] if k in argv else d
os.makedirs(OUT, exist_ok=True)
rlib.reset()
arm = rlib.load_body(os.path.join(TMP, 'korgath_base.glb'))
rig = kanim.Rig(arm)
mod = importlib.import_module(SPEC)
specs = mod.build(rig)
acts = {}
for name, spec in specs.items():
    kclip.choose_phis(rig, spec)
    frames, rep = kclip.evaluate(rig, spec)
    act = kclip.bake(rig, frames, name)
    acts[name] = (act, frames, spec)
    # check: the baked action reproduces the solved world pose, and the grips hold
    rig.use(act)
    worst = 0; gr = 0; gl = 0
    for f in range(0, spec['length'] + 1):
        bpy.context.scene.frame_set(f)
        P = frames[f][0]
        for n in ('hand.r', 'hand.l', 'foot.l', 'foot.r', 'head', 'hammer'):
            worst = max(worst, (rig.W @ arm.pose.bones[n].matrix).translation.__sub__(P[n].translation).length)
        H = rig.W @ arm.pose.bones['hammer'].matrix
        st = kclip.state_at(spec['right'], f)[2]
        if st[0] in ('carry', 'flip'):
            want = H @ Vector((0, kclip.sval(st[1], f), 0))
            hand = rig.W @ arm.pose.bones['hand.r'].matrix @ rig.rel_rest_hammer.translation
            gr = max(gr, (want - hand).length)
        st = kclip.state_at(spec['left'], f)[2]
        if st[0] == 'grip':
            want = H @ Vector((0, kclip.sval(st[1], f), 0))
            C = rig.K_thumb_head.translation
            hand = rig.W @ arm.pose.bones['hand.l'].matrix @ C
            gl = max(gl, (want - hand).length)
    print('CHECK', name, 'bake vs solve worst %.4f yd' % worst, 'right grip off haft %.3f yd' % gr, 'left grip off haft %.3f yd' % gl)

if opt('--export'):
    # mesh-free clip export: the armature with each authored action on its own NLA track
    ad = arm.animation_data
    ad.action = None
    for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
    for name, (act, frames, spec) in acts.items():
        tr = ad.nla_tracks.new(); tr.name = name
        tr.strips.new(name, 0, act)
    for o in bpy.data.objects: o.select_set(False)
    arm.select_set(True)
    for c in arm.children: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=opt('--export'), export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_frame_step=1, export_cameras=False,
                              export_lights=False, export_materials='NONE', export_all_influences=False)
    for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
    print('EXPORTED', opt('--export'))

if opt('--save'):
    for a in bpy.data.actions:
        a.use_fake_user = True
    first = next(iter(acts.values()))
    rig.use(first[0])
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = first[2]['length']
    bpy.context.scene.render.fps = 30
    bpy.ops.wm.save_as_mainfile(filepath=opt('--save'))

if opt('--render', '1') == '1':
    rlib.setup_bench((520, 520))
    rlib.floor()
    views = opt('--views', 'frente,lado,tres_cuartos_der').split(',')
    for name, (act, frames, spec) in acts.items():
        rig.use(act)
        fl = [int(x) for x in opt('--frames', ','.join(str(x) for x in spec.get('sheet', [0, 5, 9, 12, 14, 17, 22, 30, 38, 45]))).split(',')]
        paths = []
        for v in views:
            for f in fl:
                bpy.context.scene.frame_set(f)
                cam = rlib.view_cam('c', v, Vector((0, -2.0, 5.2)), float(opt('--dist', '21')), lens=35)
                p = os.path.join(OUT, '%s_%s_%02d.png' % (name, v, f))
                rlib.render(cam, p)
                paths.append(p)
        print('SHEET_FILES', name, len(fl), ' '.join(paths))
        if opt('--anim'):
            av = opt('--anim')
            for f in range(0, spec['length'] + 1):
                bpy.context.scene.frame_set(f)
                cam = rlib.view_cam('c', av, Vector((0, -2.0, 5.2)), float(opt('--dist', '21')), lens=35)
                rlib.render(cam, os.path.join(OUT, 'anim_%s_%s_%03d.png' % (name, av, f)))
        me = bpy.data.objects['Korgath']
        grips = [int(x) for x in opt('--grips', '').split(',') if x]
        mask = None
        if grips:
            keep = ('hand.', 'fingers.', 'hammer', 'lowerarm.', 'index.', 'middle.', 'ring.', 'pinky.', 'thumb.', 'chain_', 'Anchor_T', 'Anchor_H')
            g = me.vertex_groups.get('GripMask') or me.vertex_groups.new(name='GripMask')
            gname = {x.index: x.name for x in me.vertex_groups}
            idx = [v.index for v in me.data.vertices if sum(x.weight for x in v.groups if gname[x.group].startswith(keep)) > 0.5]
            g.add(idx, 1.0, 'REPLACE')
            mask = me.modifiers.new('GripMask', 'MASK')
            mask.vertex_group = 'GripMask'
        for f in grips:
            bpy.context.scene.frame_set(f)
            for sd in ('r', 'l'):
                c = (rlib.bone_pos(arm, 'hand.' + sd) + rlib.bone_pos(arm, 'fingers.' + sd)) / 2
                out = (c - rlib.bone_pos(arm, 'chest')).normalized()
                for tag, d in (('a', out + Vector((0, 0, 0.6))), ('b', out + Vector((0, -0.9, 0.1)))):
                    cam = rlib.camera('g', c + d.normalized() * 5.0, c, lens=55)
                    rlib.render(cam, os.path.join(OUT, '%s_grip_%02d_%s_%s.png' % (name, f, sd, tag)))
        if mask:
            me.modifiers.remove(mask)
