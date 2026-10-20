"""Left fist, second solver: find where the haft must sit so the curled fingers
wrap it (the circle the middle finger's arc encloses, against the palm), then
curl every finger as deep as it can around that haft."""
import os
import bpy, sys, math, json, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib, handrig
from mathutils import Vector, Matrix, Quaternion
TAG = sys.argv[sys.argv.index('--') + 1]
PROF = (60, 95, 70)
RF = 0.012
R = handrig.HAFT_R
SRC = os.path.join(TMP, 'korgath_tex.glb')
rlib.reset(); arm = rlib.load_body(SRC)
me = bpy.data.objects['Korgath']
J = handrig.load_joints(); handrig.add_bones(arm, J); handrig.weights(arm, me, J)
arm.animation_data.action = None
for pb in arm.pose.bones: pb.matrix_basis = Matrix()
B = arm.data.bones
Mh = arm.matrix_world @ B['hand.l'].matrix_local; Mhi = Mh.inverted()
def rl(n): return B['hand.l'].matrix_local.inverted() @ B[n].matrix_local
def fk(names, rots):
    Ws = []
    for i, (n, Rm) in enumerate(zip(names, rots)):
        W = (rl(n) if i == 0 else Ws[-1] @ (rl(names[i - 1]).inverted() @ rl(n))) @ Rm
        Ws.append(W)
    return Ws
def pts(names, Ws, start=0.4):
    out = []
    for i, (n, W) in enumerate(zip(names, Ws)):
        L = B[n].length
        for s in np.linspace(start if i == 0 else 0.0, 1.0, 6):
            out.append(tuple(W @ Vector((0, L * s, 0))))
    return np.array(out)
def finger_pts(f, g):
    names = ['%s.%d.l' % (f, i) for i in (1, 2, 3)]
    return pts(names, fk(names, [Matrix.Rotation(math.radians(g * a), 4, 'X') for a in PROF]))
# palm vertices (rest), only those that do not move with the fingers
gname = {g.index: g.name for g in me.vertex_groups}
palm = []
for v in me.data.vertices:
    w = {gname[g.group]: g.weight for g in v.groups}
    fing = sum(val for k, val in w.items() if k.split('.')[0] in handrig.FINGERS or k == 'fingers.l' or k.startswith('thumb'))
    if w.get('hand.l', 0) > 0.5 and fing < 0.2:
        palm.append(tuple(Mhi @ (me.matrix_world @ v.co)))
palm = np.array(palm)
palm = palm[(palm[:, 0] > 0.0) & (palm[:, 0] < 0.15)]
print('palm pts', len(palm))
best = None
for g in np.arange(0.4, 1.31, 0.05):
    FP = np.vstack([finger_pts('middle', g), finger_pts('ring', g)])
    for y in np.arange(0.05, 0.22, 0.004):
        for z in np.arange(-0.18, -0.02, 0.004):
            dF = np.sqrt((FP[:, 1] - y) ** 2 + (FP[:, 2] - z) ** 2)
            if dF.min() < R + RF - 0.002: continue
            dP = np.sqrt((palm[:, 1] - y) ** 2 + (palm[:, 2] - z) ** 2)
            if dP.min() < R - 0.004: continue
            contact = (dF < R + RF + 0.010).sum() + 2 * (dP < R + 0.008).sum() ** 0.5
            key = (contact, g)
            if best is None or key > best[0]: best = (key, g, y, z)
print('BEST contact %.1f g %.2f y %.3f z %.3f' % (best[0][0], best[1], best[2], best[3]))
g0, HY, HZ = best[1], best[2], best[3]
C = np.array([0.0, HY, HZ]); A = np.array([1.0, 0, 0])
def dax(P):
    d = P - C
    return np.linalg.norm(d - np.outer(d @ A, A), axis=1)
curls = {}
for f in handrig.FINGERS:
    gb = 0
    for g in np.arange(0, 1.41, 0.025):
        if dax(finger_pts(f, g)).min() < R + RF - 0.002: break
        gb = g
    curls[f] = tuple(math.radians(gb * a) for a in PROF)
    print('FINGER', f, round(gb, 3))
tn = ['thumb.1.l', 'thumb.2.l', 'thumb.3.l']
bt = None
for ab in range(-70, 41, 10):
    for f1 in range(-30, 71, 10):
        for f2 in range(0, 81, 10):
            for f3 in range(0, 81, 10):
                R1 = (Quaternion((0, 0, 1), math.radians(ab)) @ Quaternion((1, 0, 0), math.radians(f1))).to_matrix().to_4x4()
                P = pts(tn, fk(tn, [R1, Matrix.Rotation(math.radians(f2), 4, 'X'), Matrix.Rotation(math.radians(f3), 4, 'X')]), 0.3)
                d = dax(P[6:])
                if d.min() < R + 0.013 - 0.002: continue
                tip = P[-1]
                score = -np.abs(d[-6:] - (R + 0.014)).mean() * 400 + (tip[2] - C[2]) * 200
                if bt is None or score > bt[0]: bt = (score, (ab, f1, f2, f3))
ab, f1, f2, f3 = bt[1]
thumb = (math.radians(f1), math.radians(ab), math.radians(f2), math.radians(f3))
print('THUMB', bt[1])
handrig.set_curl(arm, curls, thumb)
json.dump({'haft': {'y': float(HY), 'z': float(HZ)}, 'curls': {k: list(v) for k, v in curls.items()}, 'thumb': list(thumb)},
          open(os.path.join(HERE, 'left_grip_%s.json' % TAG), 'w'), indent=1)
bpy.ops.mesh.primitive_cylinder_add(radius=R, depth=0.6, vertices=24)
cyl = bpy.context.active_object
cyl.matrix_world = Mh @ Matrix.Translation(Vector(C)) @ Matrix.Rotation(math.radians(90), 4, 'Y')
m = bpy.data.materials.new('haft'); m.diffuse_color = (0.45, 0.25, 0.12, 1); cyl.data.materials.append(m)
rlib.setup_bench((600, 600))
c = Mh @ Vector((0.08, 0.13, -0.05))
OUT = os.path.join(TMP, 'fist')
for nm, d in (('arriba', Vector((0, 0.01, 1))), ('frente', Vector((0, -1, 0.05))), ('abajo', Vector((0, 0.01, -1))), ('punta', Vector((1, -0.3, -0.2))), ('detras', Vector((0, 1, -0.1)))):
    cam = rlib.camera('c', c + d.normalized() * 3.0, c, lens=50)
    rlib.render(cam, os.path.join(OUT, '%s_%s.png' % (TAG, nm)))
