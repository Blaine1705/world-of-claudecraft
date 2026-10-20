import os
import bpy, sys, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib
from finger_joints import welded_hand, comps
from mathutils import Vector, Matrix

def arc_point(poly, f):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    s = f * d[-1]
    i = min(np.searchsorted(d, s) - 1, len(poly) - 2); i = max(i, 0)
    u = (s - d[i]) / max(1e-9, d[i + 1] - d[i])
    return poly[i] * (1 - u) + poly[i + 1] * u

def joints(arm, me):
    bm, Mh = welded_hand(arm, me)
    P = np.array([tuple(Mh @ v.co) for v in bm.verts])
    fing = comps(bm, P[:, 1] > 0.172)[:4]
    out = []
    for c in sorted(fing, key=lambda c: -P[c][:, 0].mean()):
        Q = P[c]
        x0 = Q[Q[:, 1] < Q[:, 1].min() + 0.012][:, 0].mean()
        # knuckle: hand slice at y 0.14..0.155 near this finger's x
        sl = P[(P[:, 1] > 0.138) & (P[:, 1] < 0.156) & (np.abs(P[:, 0] - x0) < 0.02)]
        mcp = np.array([x0, 0.147, (sl[:, 2].max() + sl[:, 2].min()) / 2])
        # slices of the free finger along its local direction
        ax = Q[Q[:, 1] > Q[:, 1].max() - 0.012].mean(0) - Q[Q[:, 1] < Q[:, 1].min() + 0.012].mean(0)
        ax /= np.linalg.norm(ax)
        t = (Q - Q.mean(0)) @ ax
        cents = []
        for q in np.linspace(t.min(), t.max(), 5)[:-1]:
            s = Q[(t >= q) & (t < q + (t.max() - t.min()) / 4 + 1e-9)]
            if len(s): cents.append(s.mean(0))
        tipv = Q[np.argmax(t)]
        poly = np.array([mcp] + cents + [tipv - ax * 0.008])
        pip, dip, tip = arc_point(poly, 0.46), arc_point(poly, 0.74), poly[-1]
        out.append({'mcp': mcp.tolist(), 'pip': pip.tolist(), 'dip': dip.tolist(), 'tip': tip.tolist()})
    th = comps(bm, (P[:, 0] > 0.15) & (P[:, 1] < 0.16))[0]
    Q = P[th]
    far = Q[np.argmax(np.linalg.norm(Q - np.array([0.08, 0.02, -0.02]), axis=1))]
    tip = Q[np.linalg.norm(Q - far, axis=1) < 0.015].mean(0)
    # thumb CMC: inside the thenar, behind the thumb's base
    cmc = np.array([0.115, 0.045, -0.03])
    mcp = Q[np.linalg.norm(Q - far, axis=1) > np.linalg.norm(Q - far, axis=1).max() - 0.02].mean(0)
    mcp = mcp + (tip - mcp) * 0.05
    ip = mcp + (tip - mcp) * 0.55
    return out, {'cmc': cmc.tolist(), 'mcp': mcp.tolist(), 'ip': ip.tolist(), 'tip': tip.tolist()}

if __name__ == '__main__':
    rlib.reset(); arm = rlib.load_body(os.path.join(TMP, 'korgath_tex.glb'))
    me = bpy.data.objects['Korgath']
    F, T = joints(arm, me)
    for f in F: print('F', {k: np.round(v, 3) for k, v in f.items()})
    print('T', {k: np.round(v, 3) for k, v in T.items()})
    json.dump({'fingers': F, 'thumb': T}, open(os.path.join(HERE, 'finger_joints.json'), 'w'), indent=1)
    # debug render: spheres at joints
    Wm = arm.matrix_world @ arm.data.bones['hand.l'].matrix_local
    for f in F + [T]:
        for k, p in f.items():
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=Wm @ Vector(p))
            o = bpy.context.active_object
            m = bpy.data.materials.new('m'); m.diffuse_color = {'mcp': (1,0,0,1), 'pip': (0,1,0,1), 'dip': (0,0,1,1), 'tip': (1,1,0,1), 'cmc': (1,0,1,1), 'ip': (0,1,1,1)}[k]
            o.data.materials.append(m)
    rlib.setup_bench((700, 700)); bpy.context.scene.display.shading.color_type = 'MATERIAL'
    me.show_in_front = False
    mm = bpy.data.materials.new('clay'); mm.diffuse_color = (0.6, 0.6, 0.6, 0.35)
    me.data.materials.clear(); me.data.materials.append(mm)
    bpy.context.scene.display.shading.show_xray = True
    bpy.context.scene.display.shading.xray_alpha = 0.6
    arm.data.pose_position = 'REST'
    bl = arm.data.bones
    c = Wm @ Vector((0.09, 0.15, -0.03))
    for n, d in (('arriba', Vector((0, 0.01, 1))), ('frente', Vector((0, -1, 0.05))), ('abajo', Vector((0, 0.01, -1)))):
        cam = rlib.camera('c', c + d.normalized() * 3.4, c, lens=50)
        rlib.render(cam, os.path.join(TMP, 'fj_%s.png') % n)
