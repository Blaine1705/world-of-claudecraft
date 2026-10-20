"""Left hand finger and thumb joint positions, measured on the welded bind mesh.
Writes finger_joints.json (hand.l frame, Blender bone-local units)."""
import os
import bpy, sys, bmesh, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib
from mathutils import Vector

def welded_hand(arm, me, side='l'):
    hb = arm.data.bones['hand.' + side]
    Mh = (arm.matrix_world @ hb.matrix_local).inverted() @ me.matrix_world
    gname = {g.index: g.name for g in me.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(me.data); bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    kill = [v for v in bm.verts if sum(w for gi, w in v[dl].items() if gname[gi] in ('fingers.' + side, 'hand.' + side)) <= 0.05]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
    bm.verts.ensure_lookup_table()
    return bm, Mh

def comps(bm, mask):
    seen = set(); out = []
    for v in bm.verts:
        if not mask[v.index] or v.index in seen: continue
        st = [v]; seen.add(v.index); c = []
        while st:
            x = st.pop(); c.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if mask[o.index] and o.index not in seen:
                    seen.add(o.index); st.append(o)
        out.append(c)
    return sorted(out, key=len, reverse=True)

def centerline(Q, axis, n=6):
    c = Q.mean(0)
    t = (Q - c) @ axis
    pts = []
    for q in np.linspace(t.min(), t.max(), n + 1)[:-1] + (t.max() - t.min()) / n / 2:
        sl = Q[np.abs(t - q) <= (t.max() - t.min()) / n * 0.75]
        if len(sl): pts.append(sl.mean(0))
    return np.array(pts)

def measure(arm, me):
    bm, Mh = welded_hand(arm, me)
    P = np.array([tuple(Mh @ v.co) for v in bm.verts])
    fingers = comps(bm, P[:, 1] > 0.172)[:4]
    res = {'fingers': [], 'thumb': None}
    for c in sorted(fingers, key=lambda c: -P[c][:, 0].mean()):  # index (thumb side, +x) first
        Q = P[c]
        tipi = np.argmax(Q[:, 1]); tip = Q[tipi]
        # finger axis: from the component's base centroid to its tip region centroid
        base = Q[Q[:, 1] < Q[:, 1].min() + 0.015].mean(0)
        tipc = Q[Q[:, 1] > Q[:, 1].max() - 0.015].mean(0)
        ax = (tipc - base); ax /= np.linalg.norm(ax)
        # extend back to the knuckle line (y = 0.135) along the axis
        k = (0.135 - base[1]) / ax[1]
        mcp = base + ax * k
        # the true tip: furthest vertex along the axis
        t = (Q - mcp) @ ax
        L = t.max()
        res['fingers'].append({'mcp': mcp.tolist(), 'axis': ax.tolist(), 'len': float(L),
                               'n': len(c), 'mean': Q.mean(0).tolist()})
    th = comps(bm, (P[:, 0] > 0.15) & (P[:, 1] < 0.16))[0]
    Q = P[th]
    far = Q[np.argmax(np.linalg.norm(Q - np.array([0.08, 0.02, -0.02]), axis=1))]
    tipc = Q[np.linalg.norm(Q - far, axis=1) < 0.02].mean(0)
    basec = Q[np.linalg.norm(Q - far, axis=1) > np.linalg.norm(Q - far, axis=1).max() - 0.015].mean(0)
    res['thumb'] = {'tip': tipc.tolist(), 'basec': basec.tolist(), 'n': len(th),
                    'min': Q.min(0).tolist(), 'max': Q.max(0).tolist()}
    return res

if __name__ == '__main__':
    rlib.reset(); arm = rlib.load_body(os.path.join(TMP, 'korgath_tex.glb'))
    me = bpy.data.objects['Korgath']
    r = measure(arm, me)
    for f in r['fingers']: print('F', np.round(f['mcp'], 3), np.round(f['axis'], 3), round(f['len'], 3), f['n'])
    print('T', {k: (np.round(v, 3) if isinstance(v, list) else v) for k, v in r['thumb'].items()})
    json.dump(r, open(os.path.join(HERE, 'finger_joints.json'), 'w'), indent=1)
