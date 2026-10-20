"""Add the left hand's finger bones and weights to the body and export mesh + rig
(no clips) for the node patch (patch_body_fingers.mjs)."""
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
arm.animation_data.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for o in bpy.data.objects: o.select_set(False)
arm.select_set(True); me.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=False, export_cameras=False, export_lights=False,
                          export_materials='NONE', export_all_influences=False)
print('WROTE', OUT)
