"""The authoring base: the body (textures, every clip) with the left hand's
finger bones and weights, exported by Blender (float positions, Blender's own
binds), so a Blender session imports it exactly."""
import os
import bpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib, handrig
OUT = sys.argv[sys.argv.index('--') + 1]
rlib.reset()
arm = rlib.load_body(os.path.join(TMP, 'korgath_tex.glb'))
me = bpy.data.objects['Korgath']
J = handrig.load_joints(); handrig.add_bones(arm, J)
print('reweighted', handrig.weights(arm, me, J))
ad = arm.animation_data
ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
for a in bpy.data.actions:
    tr = ad.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, int(a.frame_range[0]), a)
for o in bpy.data.objects: o.select_set(False)
arm.select_set(True)
for c in arm.children: c.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_cameras=False,
                          export_lights=False, export_all_influences=False)
print('WROTE', OUT)
