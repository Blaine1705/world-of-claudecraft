"""Korgath's left hand: finger and thumb bones on the shipped body, their
weights, and the closed grip on the haft.

The shipped body's left hand is modeled open (spread fingers) on a single
fingers.l bone, so it cannot close on the maul's haft. This adds a three-joint
chain per finger (children of fingers.l) and per thumb (child of hand.l) and
splits the old weights over them without changing any old deformation: every
vertex keeps its old total on fingers.l (fingers) or hand.l (thumb), so at rest
the new bones change nothing and every old clip looks exactly the same.
"""
import os
import bpy, json, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

FINGERS = ('index', 'middle', 'ring', 'pinky')
JOINTS_JSON = os.path.join(HERE, 'finger_joints.json')
# The haft in the left hand's frame (hand.l bone-local, bind): the right fist
# holds it 0.09 off the bone axis on the palm side at 0.11 along the hand;
# the left palm faces -Z, the knuckle line runs along X.
HAFT_R = 0.031


def bone_names():
    out = []
    for f in FINGERS:
        out += ['%s.%d.l' % (f, i) for i in (1, 2, 3)]
    out += ['thumb.%d.l' % i for i in (1, 2, 3)]
    return out


def load_joints():
    return json.load(open(JOINTS_JSON))


def add_bones(arm, J):
    hb = arm.data.bones['hand.l']
    Mh = hb.matrix_local.copy()
    palm = (Mh.to_3x3() @ Vector((0, 0, -1))).normalized()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    def mk(name, parent, a, b, zdir):
        e = eb.new(name)
        e.head = Mh @ Vector(a)
        e.tail = Mh @ Vector(b)
        e.parent = eb[parent]
        e.use_connect = False
        e.use_deform = True
        e.align_roll(zdir)
        return e
    for f, d in zip(FINGERS, J['fingers']):
        pts = [d['mcp'], d['pip'], d['dip'], d['tip']]
        par = 'fingers.l'
        for i in range(3):
            n = '%s.%d.l' % (f, i + 1)
            mk(n, par, pts[i], pts[i + 1], palm)
            par = n
    t = J['thumb']
    pts = [t['cmc'], t['mcp'], t['ip'], t['tip']]
    par = 'hand.l'
    for i in range(3):
        n = 'thumb.%d.l' % (i + 1)
        mk(n, par, pts[i], pts[i + 1], palm)
        par = n
    bpy.ops.object.mode_set(mode='OBJECT')


def _seg_param(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    q = a + np.outer(t, ab) if p.ndim == 2 else a + t * ab
    return t, np.linalg.norm(p - q, axis=-1)


def _smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def weights(arm, me, J, table=None):
    """Split fingers.l over the finger chains and hand.l over the thumb chain.
    table (dict) receives {vertex: {bone: weight}} for the hand family only."""
    hb = arm.data.bones['hand.l']
    Mh = (arm.matrix_world @ hb.matrix_local).inverted() @ me.matrix_world
    vg = {g.name: g for g in me.vertex_groups}
    for n in bone_names():
        if n not in vg:
            vg[n] = me.vertex_groups.new(name=n)
    gi_f, gi_h = vg['fingers.l'].index, vg['hand.l'].index
    chains = []
    for f, d in zip(FINGERS, J['fingers']):
        chains.append((f, [np.array(d[k]) for k in ('mcp', 'pip', 'dip', 'tip')]))
    t = J['thumb']
    thumb = [np.array(t[k]) for k in ('cmc', 'mcp', 'ip', 'tip')]
    changed = 0
    for v in me.data.vertices:
        w = {g.group: g.weight for g in v.groups}
        wf, wh = w.get(gi_f, 0.0), w.get(gi_h, 0.0)
        if wf <= 1e-4 and wh <= 1e-4:
            continue
        p = np.array(tuple(Mh @ v.co))
        new = {}
        if wf > 1e-4:
            # nearest finger chains, soft membership
            ds, segw = [], []
            for f, pts in chains:
                best = None
                for i in range(3):
                    tt, dd = _seg_param(p, pts[i], pts[i + 1])
                    if best is None or dd < best[1]:
                        best = (i, dd, tt)
                ds.append(best[1])
                i, dd, tt = best
                # along-chain coordinate s in segments: 0..3
                s = i + tt
                # before the knuckle: projection onto the first segment, unclamped
                ab = pts[1] - pts[0]
                s0 = ((p - pts[0]) @ ab) / (ab @ ab)
                if i == 0:
                    s = s0
                sw = np.zeros(4)  # [fingers.l, seg1, seg2, seg3]
                k = _smooth((s + 0.12) / 0.3)  # knuckle blend
                sw[0] = 1 - k
                b12 = _smooth((s - 0.82) / 0.36)  # blend around PIP (s=1)
                b23 = _smooth((s - 1.85) / 0.3)   # blend around DIP (s=2)
                sw[1] = k * (1 - b12)
                sw[2] = k * b12 * (1 - b23)
                sw[3] = k * b12 * b23
                segw.append(sw)
            ds = np.array(ds)
            m = np.exp(-((ds - ds.min()) / 0.008) ** 2)
            m /= m.sum()
            acc = np.zeros(4)
            for (f, _), mk, sw in zip(chains, m, segw):
                acc[0] += mk * sw[0]
                for i in range(3):
                    if mk * sw[i + 1] > 1e-4:
                        n = '%s.%d.l' % (f, i + 1)
                        new[n] = new.get(n, 0) + wf * mk * sw[i + 1]
            new['fingers.l'] = wf * acc[0]
        if wh > 1e-4:
            best = None
            for i in range(3):
                tt, dd = _seg_param(p, thumb[i], thumb[i + 1])
                if best is None or dd < best[1]:
                    best = (i, dd, tt)
            i, dd, tt = best
            s = i + tt
            # thumb region: near the chain and past the thenar root
            near = 1 - _smooth((dd - 0.022) / 0.012)
            root = _smooth((s - 0.25) / 0.45)
            mt = near * root
            if p[0] < 0.125:
                mt *= _smooth((p[0] - 0.095) / 0.03)
            b12 = _smooth((s - 0.85) / 0.3)
            b23 = _smooth((s - 1.85) / 0.3)
            sw = [(1 - b12), b12 * (1 - b23), b12 * b23]
            for k in range(3):
                if mt * sw[k] > 1e-4:
                    n = 'thumb.%d.l' % (k + 1)
                    new[n] = new.get(n, 0) + wh * mt * sw[k]
            new['hand.l'] = wh * (1 - mt)
        # glTF keeps four influences: never let the split push a vertex past
        # four, or the exporter drops a real one (the wrist, the forearm).
        # Under every old clip a finger chain moves exactly as fingers.l and
        # the thumb chain as hand.l, so folding within a family is exact.
        others = [gi for gi in w if gi not in (gi_f, gi_h) and w[gi] > 1e-4]
        new = {k: val for k, val in new.items() if val > 1e-4}
        while len(others) + len(new) > 4:
            fam = lambda k: 'f' if (k == 'fingers.l' or k.split('.')[0] in FINGERS) else 't'
            ks = sorted(new, key=lambda k: new[k])
            small = ks[0]
            host = max((k for k in new if k != small and fam(k) == fam(small)), key=lambda k: new[k], default=None)
            if host is None:
                break
            new[host] += new.pop(small)
            vg[small].remove([v.index])
        if table is not None:
            table[v.index] = {'wf': wf, 'wh': wh, 'new': dict(new)}
        for n, val in new.items():
            g = vg[n]
            if val > 1e-5:
                g.add([v.index], float(val), 'REPLACE')
            else:
                g.remove([v.index])
        changed += 1
    return changed


# ---- the grip -------------------------------------------------------------

def _rot_x(a):
    return Quaternion((1, 0, 0), a)


def set_curl(arm, curls, thumb):
    """curls: {finger: (a1, a2, a3) radians}; thumb: (flex1, abd1, flex2, flex3)."""
    pb = arm.pose.bones
    for f, (a1, a2, a3) in curls.items():
        for i, a in enumerate((a1, a2, a3)):
            b = pb['%s.%d.l' % (f, i + 1)]
            b.rotation_mode = 'QUATERNION'
            b.rotation_quaternion = _rot_x(a)
    f1, ab1, f2, f3 = thumb
    for i, q in enumerate((Quaternion((0, 0, 1), ab1) @ _rot_x(f1), _rot_x(f2), _rot_x(f3))):
        b = pb['thumb.%d.l' % (i + 1)]
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = q
