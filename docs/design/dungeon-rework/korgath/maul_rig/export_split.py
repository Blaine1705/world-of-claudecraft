"""Write the left hand's weight split (per vertex of the body, in glTF order)."""
import os
import bpy, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib, handrig
OUT = sys.argv[sys.argv.index('--') + 1]
rlib.reset()
arm = rlib.load_body(os.path.join(TMP, 'korgath_tex.glb'))
me = bpy.data.objects['Korgath']
J = handrig.load_joints(); handrig.add_bones(arm, J)
table = {}
handrig.weights(arm, me, J, table)
pos = {i: [round(c, 6) for c in me.data.vertices[i].co] for i in table}
json.dump({'split': table, 'co': pos}, open(OUT, 'w'))
print('SPLIT', len(table))
