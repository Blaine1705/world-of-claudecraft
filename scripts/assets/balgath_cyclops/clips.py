"""Balgath's clips, keyed from a whole-body pose language.

`Body(**params)` turns a few dozen readable numbers into a full pose: where the
pelvis sits and how it tilts, how the spine bends and twists (spread over Spine1,
Spine2 and the neck), where the head looks, where each wrist and ankle is (two-bone
IK with poles), how the feet and hands are turned, how far the fingers close, the
jaw, the brow, the lids and the eye's flare. Every clip is a list of keys in
SECONDS with the easing of the segment leaving each key (rig.make_clip).

Axes: armature space, yards, +Z up, he faces -Y, his left is +X. A positive `lean`
tips him forward, a positive `twist` turns his chest toward his left, `look`
(yaw, pitch) turns the head (pitch up positive).
"""
import math

import numpy as np
from mathutils import Quaternion, Vector

import anatomy as A
import rig as R

V = Vector


def _n(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# rest landmarks the poses are written against
SH_L = A.SHOULDER
HIP_L = A.HIP
FOOT_L = A.ANKLE            # ankle at rest, foot flat
FOOT_R = A.mirror(A.ANKLE)
WRIST_L = A.WRIST


def finger_turns(side_sign, curl1, curl2, thumb, spread=0.0):
    """Finger curl turns for the LEFT hand (mirrored onto the right by the rig).
    curl in degrees; `spread` fans the fingers apart."""
    w, down, width, palm = A.hand_frame(1)
    out = {}
    axis = tuple(-width)
    for f in ('Index', 'Middle', 'Ring'):
        fan = {'Index': 1, 'Middle': 0, 'Ring': -1}[f] * spread
        out[f'L_{f}1'] = [(axis, curl1), (tuple(palm), fan)]
        out[f'L_{f}2'] = [(axis, curl2)]
    base, mid, tip = A.finger_chain(1, 'Thumb')
    mid_base = A.finger_chain(1, 'Middle')[0]
    d_t = _n(mid - base)
    to = _n(mid_base + down * 0.3 - base)
    ax = _n(np.cross(d_t, to))
    out['L_Thumb1'] = [(tuple(ax), thumb)]
    out['L_Thumb2'] = [(tuple(ax), thumb * 0.9)]
    return out


PRONATE_FOREARM = 0.45
HAND_AXIS = {s: tuple(_n(A.REST[s + 'Hand'][1] - A.REST[s + 'Hand'][0])) for s in ('L_', 'R_')}


class Body:
    """A full-body pose from readable parameters (see the module docstring)."""

    DEFAULTS = dict(
        pelvis=(0.0, 0.0, 0.0),      # Root offset
        yaw=0.0, pitch=0.0, roll=0.0,  # whole-body turn about the feet (degrees)
        hip_tilt=0.0, hip_twist=0.0, hip_roll=0.0,
        lean=0.0, twist=0.0, side=0.0,  # spine (degrees, spread over 3 bones)
        neck=0.0, look=(0.0, 0.0), head_roll=0.0,
        hand_l=None, hand_r=None,    # wrist targets (armature); None = hanging
        pole_l=(0.6, 1.0, -0.2), pole_r=None,
        hand_dir_l=None, hand_dir_r=None,  # hand aims; None = continue the forearm
        hand_roll_l=0.0, hand_roll_r=0.0,
        fist_l=0.35, fist_r=0.35,    # 0 open .. 1 fist
        spread_l=0.0, spread_r=0.0,
        foot_l=None, foot_r=None,    # ankle targets; None = planted at rest
        foot_dir_l=None, foot_dir_r=None,
        toe_l=0.0, toe_r=0.0,        # toe bend (deg, - curls up)
        knee_l=(0.15, -1.0, 0.0), knee_r=None,
        clav_l=0.0, clav_r=0.0,      # shrug (deg, + raises the shoulder)
        jaw=0.0, brow=0.0, lid_up=0.0, lid_lo=0.0, eye=1.0,
    )

    def __init__(self, rig, **kw):
        self.rig = rig
        self.p = dict(self.DEFAULTS)
        for k, v in kw.items():
            if k not in self.p:
                raise KeyError(k)
            self.p[k] = v

    def but(self, **kw):
        b = Body(self.rig)
        b.p = dict(self.p)
        for k, v in kw.items():
            if k not in b.p and not k.startswith('_home_'):
                raise KeyError(k)
            b.p[k] = v
        return b

    def mix(self, other, t):
        """Linear blend of two Bodies' parameters (for in-betweens)."""
        b = Body(self.rig)
        b.p = {}
        for k, a in self.p.items():
            o = other.p[k]
            if a is None or o is None:
                b.p[k] = a if t < 0.5 else o
            elif isinstance(a, (tuple, list, np.ndarray)):
                b.p[k] = tuple(float(x) + (float(y) - float(x)) * t for x, y in zip(a, o))
            else:
                b.p[k] = a + (o - a) * t
        return b

    def pose(self, memory=None, resolve=True):
        """Solve the pose; with `resolve`, first keep the arms out of the body
        (`cleared`). Only the final solve reads and commits the bend memory."""
        b = self.cleared() if resolve else self
        return b._solve(memory)

    def cleared(self):
        """This Body with its wrist targets and poles pushed out of the flesh.

        The pass runs WITHOUT the bend memory, so its answer is a pure function of
        this frame's parameters. Run inside the memory (as it once was), the pass and
        the per-frame bend and roll limits fed each other: last frame's elbow moved
        this frame's push, the push moved the elbow, and a held pose never settled.
        The upper arm flipped between two rolls about 11 degrees apart on alternate
        frames, a 12 Hz tremor in every hold (Idle worst of all)."""
        b = self
        pose = b._solve(None)
        for _ in range(14):
            fix = arm_clearance_fix(b, pose)
            if fix is None:
                break
            b = b.but(**fix)
            pose = b._solve(None)
        return b

    def _solve(self, memory=None):
        p = self.p
        turns = {}
        twist = {}
        aims = {}
        ik = {}
        turns['Root'] = [('z', p['yaw']), ('x', p['pitch']), ('y', p['roll'])]
        turns['Hips'] = [('x', p['hip_tilt']), ('z', p['hip_twist']), ('y', p['hip_roll'])]
        lean, tw, sd = p['lean'], p['twist'], p['side']
        turns['Spine1'] = [('x', lean * 0.4), ('z', tw * 0.4), ('y', -sd * 0.45)]
        turns['Spine2'] = [('x', lean * 0.6), ('z', tw * 0.6), ('y', -sd * 0.55)]
        yaw, pitch = p['look']
        # the neck carries part of the look and its own lift; the head the rest
        turns['Neck'] = [('x', p['neck'] - pitch * 0.35), ('z', yaw * 0.4)]
        turns['Head'] = [('x', -pitch * 0.65), ('z', yaw * 0.6), ('y', p['head_roll'])]
        turns['Jaw'] = [('x', p['jaw'])]
        turns['Brow'] = [('x', p['brow'])]
        turns['LidUp'] = [('x', p['lid_up'])]
        turns['LidLo'] = [('x', -p['lid_lo'])]
        # The shoulder girdle follows the hand, as a scapula does: a hand going over
        # the head lifts the clavicle, a hand reaching across the body draws it
        # forward. Without it the arm alone does the work, and the deltoid and the
        # stone over it grind into the trapezius and the neck.
        lift_l, fwd_l = girdle(p['hand_l'], 1)
        lift_r, fwd_r = girdle(p['hand_r'], -1)
        turns['L_Clavicle'] = [((0, 1, 0), -(p['clav_l'] + lift_l)), ((0, 0, 1), -fwd_l)]
        turns['R_Clavicle'] = [((0, 1, 0), p['clav_r'] + lift_r), ((0, 0, 1), fwd_r)]
        # arms
        for side, s in (('L_', 1), ('R_', -1)):
            key = 'hand_l' if s > 0 else 'hand_r'
            tgt = p[key]
            pole = p['pole_l'] if s > 0 else (p['pole_r'] or (-p['pole_l'][0], p['pole_l'][1], p['pole_l'][2]))
            if tgt is not None:
                ik['arm' + side] = (side + 'UpperArm', side + 'Forearm', tuple(tgt), tuple(pole))
            hd = p['hand_dir_l'] if s > 0 else p['hand_dir_r']
            if hd is not None:
                aims[side + 'Hand'] = V(hd)
            roll = p['hand_roll_l'] if s > 0 else p['hand_roll_r']
            if roll:
                # pronation lives in the forearm (the radius rolls over the ulna), so it
                # is shared between the forearm and the hand: no wrung wrist
                twist[side + 'Forearm'] = PRONATE_FOREARM * roll * s
                twist[side + 'Hand'] = (1 - PRONATE_FOREARM) * roll * s
        # legs
        for side, s in (('L_', 1), ('R_', -1)):
            f = p['foot_l'] if s > 0 else p['foot_r']
            if f is None:
                f = FOOT_L if s > 0 else FOOT_R
            kp = p['knee_l'] if s > 0 else (p['knee_r'] or (-p['knee_l'][0], p['knee_l'][1], p['knee_l'][2]))
            ik['leg' + side] = (side + 'Thigh', side + 'Shin', tuple(f), tuple(kp))
            fd = p['foot_dir_l'] if s > 0 else p['foot_dir_r']
            rest_fd = A.REST[side + 'Foot'][1] - A.REST[side + 'Foot'][0]
            aims[side + 'Foot'] = V(fd if fd is not None else rest_fd)
            toe = p['toe_l'] if s > 0 else p['toe_r']
            rest_td = A.REST[side + 'Toes'][1] - A.REST[side + 'Toes'][0]
            aims[side + 'Toes'] = V(rest_td)
            if toe:
                turns[side + 'Toes'] = [((1, 0, 0), toe)]
        # fingers (each side its own curl; built for the left hand and mirrored)
        fl = finger_turns(1, 74 * p['fist_l'] + 8, 92 * p['fist_l'] + 6, 50 * p['fist_l'] + 5, p['spread_l'])
        fr = finger_turns(1, 74 * p['fist_r'] + 8, 92 * p['fist_r'] + 6, 50 * p['fist_r'] + 5, p['spread_r'])
        for k, v in fl.items():
            turns[k] = v
        for k, v in fr.items():
            turns['R_' + k[2:]] = [R._mirror_turn(a, d) for a, d in v]
        pose = self.rig.pose(aims=aims, ik=ik, turns=turns, root=p['pelvis'], scale={'EyeCore': max(0.02, p['eye'])},
                             mirror=False, memory=memory, twist=twist)
        return pose


    def eye_point(self):
        """Where the eye is in this pose (armature space), hands ignored."""
        b = self.but(hand_l=None, hand_r=None)
        pose = b.pose(resolve=False)
        h = pose.head['Head']
        rel = V(A.EYE) - V(A.REST['Head'][0])
        return np.array(h + pose.delta['Head'] @ rel)

    def head_frame(self):
        b = self.but(hand_l=None, hand_r=None)
        pose = b.pose(resolve=False)
        q = pose.delta['Head']
        return (np.array(q @ V((1, 0, 0))), np.array(q @ V((0, -1, 0))), np.array(q @ V((0, 0, 1))))


def girdle(target, s):
    """(elevation, protraction) of a clavicle in degrees for a wrist target."""
    if target is None:
        return 0.0, 0.0
    sh = np.array(A.SHOULDER) * (1, 1, 1)
    sh[0] *= s
    d = _n(np.asarray(target, float) - sh)
    elev = math.degrees(math.acos(max(-1.0, min(1.0, -d[2]))))    # 0 hanging, 180 straight up
    lift = 26.0 * smoothstep((elev - 75.0) / 95.0)
    across = -d[0] * s                                               # > 0 toward the other side
    fwd = 16.0 * smoothstep((across + 0.1) / 0.7) * smoothstep((-d[1] + 0.2) / 0.8)
    return lift, fwd


def smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ------------------------------------------------------------------ body clearance
# The bones of the flesh an arm must stay out of, and the arm's own girth along its
# length (from the sculpt: anatomy.py's limb cones and muscle bellies).
COLLIDE = ('Hips', 'Spine1', 'Spine2', 'Belly', 'Neck', 'Head', 'Jaw', 'Brow', 'L_Thigh', 'R_Thigh', 'L_KneeFix',
           'R_KneeFix')
# (segment, fraction along it, radius, chain position 0 shoulder .. 1 wrist)
# The upper arm is measured from 62% of its length outward: nearer the joint is the
# deltoid and the armpit, which press on the chest by anatomy.
ARM_SAMPLES = (('UpperArm', 0.66, 1.12, 0.33), ('UpperArm', 0.85, 1.05, 0.42), ('Forearm', 0.0, 0.95, 0.5),
               ('Forearm', 0.25, 1.25, 0.62), ('Forearm', 0.5, 1.15, 0.75), ('Forearm', 0.75, 0.95, 0.87),
               ('Hand', 0.0, 0.8, 1.0), ('Hand', 0.45, 0.72, 1.0), ('Hand', 0.85, 0.62, 1.0))
# The fingers are sampled at their real joints (a fist curls them back toward the
# palm, an open hand reaches far past the hand bone): (bone, fraction, radius).
FINGER_SAMPLES = tuple((f + k, t, r) for f in ('Index', 'Middle', 'Ring', 'Thumb')
                       for k, t, r in (('1', 1.0, 0.36), ('2', 1.0, 0.5)))


def _stone_samples():
    """The barrowhide bracers stand proud of the forearm (dressing.slab_specs): an
    outer bracer on each forearm and a second stone on the front of the right one.
    Rest-space points carried on the forearm, with their own radius."""
    out = []
    for side, s in (('L_', 1), ('R_', -1)):
        el = np.array(A.ELBOW) * (s, 1, 1)
        wr = np.array(A.WRIST) * (s, 1, 1)
        ax = _n(wr - el)
        outw = _n(np.cross(ax, (0, -1.0, 0)) * -s)
        for t in (0.35, 0.55, 0.72):
            out.append((side + 'Forearm', el + (wr - el) * t + outw * 0.95, 0.75))
        if s < 0:
            front = _n(np.array((0, -1.0, 0.15)) + outw * 0.4)
            for t in (0.3, 0.5):
                out.append((side + 'Forearm', el + (wr - el) * t + front * 1.05, 0.7))
    return tuple(out)


STONE_SAMPLES = _stone_samples()
CLEAR_MARGIN = 0.18
RESOLVE_CAP = 1.6
_BODY_PRIMS = None


def body_prims():
    global _BODY_PRIMS
    if _BODY_PRIMS is None:
        F = A.build_body(voxel=0.15, detail=False)
        d = {}
        for prim, _ in F.prims:
            if prim.bone in COLLIDE:
                d.setdefault(prim.bone, []).append(prim)
        _BODY_PRIMS = d
    return _BODY_PRIMS


def body_distance(pose, P):
    """Distance from armature-space points to the posed flesh (the sculpt's own
    primitives carried on their bones)."""
    out = np.full(len(P), 50.0)
    for bone, plist in body_prims().items():
        R = np.array(pose.delta[bone].to_matrix())
        Q = np.array(A.REST[bone][0]) + (P - np.array(pose.head[bone])) @ R
        for prim in plist:
            out = np.minimum(out, prim.dist_pts(Q))
    return out


def arm_points(pose, side):
    pts = []
    for bone, rp, r in STONE_SAMPLES:
        if not bone.startswith(side):
            continue
        h = np.array(pose.head[bone])
        R = pose.delta[bone]
        pts.append((h + np.array(R @ V(rp - A.REST[bone][0])), r, 0.7))
    for seg, t, r in FINGER_SAMPLES:
        bone = side + seg
        h = np.array(pose.head[bone])
        d = np.array(pose.delta[bone] @ (V(A.REST[bone][1]) - V(A.REST[bone][0])))
        pts.append((h + d * t, r, 1.0))
    for seg, t, r, u in ARM_SAMPLES:
        bone = side + seg
        h = np.array(pose.head[bone])
        d = np.array(pose.delta[bone] @ (V(A.REST[bone][1]) - V(A.REST[bone][0])))
        pts.append((h + d * t, r, u))
    return pts


def arm_clearance_fix(b, pose):
    """Push each wrist target and elbow out of the body along the flesh's normal.
    Returns Body overrides, or None when both arms are already clear."""
    fix = {}
    eps = 0.05
    for side, hk, pk in (('L_', 'hand_l', 'pole_l'), ('R_', 'hand_r', 'pole_r')):
        samples = arm_points(pose, side)
        P = np.array([p for p, _, _ in samples])
        d = body_distance(pose, P)
        pen = np.array([r for _, r, _ in samples]) + CLEAR_MARGIN - d
        if pen.max() <= 0.0:
            continue
        grads = np.zeros_like(P)
        for a in range(3):
            e = np.zeros(3)
            e[a] = eps
            grads[:, a] = (body_distance(pose, P + e) - body_distance(pose, P - e)) / (2 * eps)
        grads /= np.maximum(np.linalg.norm(grads, axis=1, keepdims=True), 1e-6)
        wrist_shift = np.zeros(3)
        elbow_push = np.zeros(3)
        for (p, r, u), pe, g in zip(samples, pen, grads):
            if pe <= 0:
                continue
            wrist_shift += g * pe * min(1.0, u / 0.75)
            elbow_push += g * pe * max(0.0, 1.0 - abs(u - 0.5) * 2.5)
        wrist = np.array(pose.head[side + 'Hand'])
        tgt = np.array(b.p[hk]) if b.p[hk] is not None else wrist
        new = tgt + wrist_shift * 1.25
        home = np.array(b.p.get('_home_' + hk, tuple(tgt)))
        off = new - home
        if np.linalg.norm(off) > RESOLVE_CAP:          # a nudge, never a new pose
            new = home + off / np.linalg.norm(off) * RESOLVE_CAP
        fix[hk] = tuple(new)
        fix['_home_' + hk] = tuple(home)
        if np.linalg.norm(elbow_push) > 1e-6:
            pole = b.p[pk] if b.p[pk] is not None else (-b.p['pole_l'][0], b.p['pole_l'][1], b.p['pole_l'][2])
            pv = _n(pole) + _n(elbow_push) * min(1.0, np.linalg.norm(elbow_push))
            fix[pk] = tuple(_n(pv))
    return fix or None


# ------------------------------------------------------------------ clip helpers
EASE_FN = {
    'in': lambda u: u ** 3,
    'quadin': lambda u: u * u,
    'expoin': lambda u: (2 ** (10 * u) - 1) / 1023.0,
    'out': lambda u: 1 - (1 - u) ** 3,
    'inout': lambda u: 0.5 - 0.5 * math.cos(math.pi * u),
    'backout': lambda u: 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2,
    'linear': lambda u: u,
    'hold': lambda u: 0.0,
}
LIMB_ROOT = {'hand_l': 'L_UpperArm', 'hand_r': 'R_UpperArm', 'foot_l': 'L_Thigh', 'foot_r': 'R_Thigh'}
VIA = {'hand_l': _n((0.45, -1.0, 0.0)), 'hand_r': _n((-0.45, -1.0, 0.0)), 'foot_l': _n((0, -1.0, 0.0)),
       'foot_r': _n((0, -1.0, 0.0))}
NUMERIC_SKIP = set(LIMB_ROOT)


def _roots(b):
    pose = b.but(hand_l=None, hand_r=None).pose(resolve=False)
    return {k: np.array(pose.head[bone]) for k, bone in LIMB_ROOT.items()}


def _target(b, key):
    v = b.p[key]
    if v is not None:
        return np.asarray(v, float)
    # a hanging limb: where it actually is in the pose
    pose = b.pose(resolve=False)
    bone = {'hand_l': 'L_Hand', 'hand_r': 'R_Hand', 'foot_l': 'L_Foot', 'foot_r': 'R_Foot'}[key]
    return np.array(pose.head[bone])


def resolved(b):
    """The same Body with every defaulted direction written out, so two keys can be
    blended without a parameter snapping from 'default' to a value halfway."""
    p = b.p
    if all(p[k] is not None for k in ('hand_dir_l', 'hand_dir_r', 'pole_r', 'knee_r', 'foot_dir_l', 'foot_dir_r')):
        return b
    out = b.but()
    q = out.p
    if q['pole_r'] is None:
        q['pole_r'] = (-q['pole_l'][0], q['pole_l'][1], q['pole_l'][2])
    if q['knee_r'] is None:
        q['knee_r'] = (-q['knee_l'][0], q['knee_l'][1], q['knee_l'][2])
    for side, key in (('L_', 'foot_dir_l'), ('R_', 'foot_dir_r')):
        if q[key] is None:
            q[key] = tuple((A.REST[side + 'Foot'][1] - A.REST[side + 'Foot'][0]).tolist())
    if q['hand_dir_l'] is None or q['hand_dir_r'] is None:
        pose = out.pose(resolve=False)
        for side, key in (('L_', 'hand_dir_l'), ('R_', 'hand_dir_r')):
            if q[key] is None:
                rd = V(A.REST[side + 'Hand'][1]) - V(A.REST[side + 'Hand'][0])
                q[key] = tuple(pose.delta[side + 'Hand'] @ rd.normalized())
    return out


def blend(bodies, weights):
    """A weighted combination of Bodies. Numbers and vectors combine linearly; the
    wrist and ankle targets combine RELATIVE to their shoulder and hip, with the
    reach length combined separately, so a fist sweeps an arc round the shoulder
    instead of cutting a straight line through the head."""
    all_none = {k for k in bodies[0].p if all(b.p[k] is None for b in bodies)}
    bodies = [resolved(b) for b in bodies]
    out = Body(bodies[0].rig)
    out.p = {}
    for k in bodies[0].p:
        if k in all_none:
            out.p[k] = None
            continue
        vals = [b.p[k] for b in bodies]
        if k in NUMERIC_SKIP:
            continue
        if any(v is None for v in vals):
            j = int(np.argmax(weights))
            out.p[k] = vals[j]
            continue
        arr = [np.asarray(v, float) for v in vals]
        acc = sum(w * a for w, a in zip(weights, arr))
        out.p[k] = tuple(acc.tolist()) if np.ndim(acc) else float(acc)
    for k in NUMERIC_SKIP:
        out.p[k] = None
    roots_out = _roots(out)
    for k in LIMB_ROOT:
        if all(b.p[k] is None for b in bodies):
            continue
        rels, lens = [], []
        for b in bodies:
            r = _roots(b)[k]
            rel = _target(b, k) - r
            rels.append(rel)
            lens.append(np.linalg.norm(rel))
        units = [r / max(l, 1e-6) for r, l in zip(rels, lens)]
        d = sum(w * u for w, u in zip(weights, units))
        # Two reaches pointing apart (a fist from the hip to over the head) would
        # cancel halfway and flip; route them through the front instead.
        via = VIA[k]
        opp = 0.0
        for i in range(len(units)):
            for j in range(i + 1, len(units)):
                opp += abs(weights[i] * weights[j]) * max(0.0, -float(units[i] @ units[j]))
        d = d + via * opp * 4.0
        ln = sum(w * l for w, l in zip(weights, lens))
        if np.linalg.norm(d) < 1e-6:
            d = rels[int(np.argmax(weights))]
        d = d / np.linalg.norm(d)
        out.p[k] = tuple((roots_out[k] + d * ln).tolist())
    return out


def _cr_weights(u):
    u2, u3 = u * u, u * u * u
    return (0.5 * (-u + 2 * u2 - u3), 0.5 * (2 - 5 * u2 + 3 * u3), 0.5 * (u + 4 * u2 - 3 * u3), 0.5 * (-u2 + u3))


def sample(seq, t, loop=False):
    """The Body at time t of a key list [(t, Body, ease)]."""
    n = len(seq)
    if t <= seq[0][0]:
        return seq[0][1]
    if t >= seq[-1][0]:
        return seq[-1][1]
    i = max(j for j in range(n - 1) if seq[j][0] <= t)
    t0, b0, ease = seq[i]
    t1, b1, _ = seq[i + 1]
    u = (t - t0) / max(1e-9, t1 - t0)
    if ease != 'auto':
        e = EASE_FN[ease](u)
        return blend([b0, b1], [1 - e, e])
    if loop:
        bm = seq[i - 1][1] if i > 0 else seq[-2][1]
        bp = seq[i + 2][1] if i + 2 < n else seq[1][1]
    else:
        bm = seq[i - 1][1] if i > 0 else b0
        bp = seq[i + 2][1] if i + 2 < n else b1
    return blend([bm, b0, b1, bp], _cr_weights(u))


# Frames (sigma) the clearance corrections are smoothed over in a dense clip.
CLEAR_SMOOTH = 3.0
CLEAR_KEYS = (('hand_l', False), ('hand_r', False), ('pole_l', True), ('pole_r', True))


def _explicit(b, key):
    v = b.p[key]
    if v is None and key == 'pole_r':
        v = (-b.p['pole_l'][0], b.p['pole_l'][1], b.p['pole_l'][2])
    return None if v is None else np.asarray(v, float)


def _smooth_rows(rows, sigma, loop):
    """Gaussian-smooth a (frames, 3) series along time; a loop wraps round."""
    n = len(rows)
    r = int(math.ceil(sigma * 3))
    w = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    out = np.zeros_like(rows)
    for i in range(n):
        acc, tot = np.zeros(rows.shape[1]), 0.0
        for k, wk in zip(range(-r, r + 1), w):
            j = i + k
            if loop:
                j %= n
            elif j < 0 or j >= n:
                continue
            acc += rows[j] * wk
            tot += wk
        out[i] = acc / tot
    return out


def _dilate_rows(rows, r, loop):
    """Each frame takes the largest correction within r frames of it, so the smoothed
    push is already whole when the arm reaches the flesh (smoothing alone would ease
    it in late, and the arm would sink in at the onset)."""
    n = len(rows)
    norms = np.linalg.norm(rows, axis=1)
    out = rows.copy()
    for i in range(n):
        best = i
        for k in range(-r, r + 1):
            j = i + k
            if loop:
                j %= n
            elif j < 0 or j >= n:
                continue
            if norms[j] > norms[best] + 1e-9:
                best = j
        out[i] = rows[best]
    return out


def cleared_track(bodies, loop=False):
    """Every frame's Body pushed out of the flesh, with the pushes smoothed in time.

    The clearance pass decides each frame alone: a wrist grazing the gut gets a push
    one frame and none the next, the elbow is shoved round on another, and the arm
    jerks between them (a 15 to 30 deg/frame^2 rattle through the blind stagger, the
    clobber, the swipe). So the frame-by-frame corrections (the wrist offsets and the
    pole changes) are widened to their neighbourhood's largest and then low-passed
    across the clip before the pose is solved: the arm eases clear of the body over a
    few frames before it would touch, instead of being kicked out of it."""
    res = [b.cleared() for b in bodies]
    out = [b.but() for b in bodies]
    for key, is_dir in CLEAR_KEYS:
        orig = [_explicit(b, key) for b in bodies]
        new = [_explicit(r, key) for r in res]
        if any(o is None or q is None for o, q in zip(orig, new)):
            for o, r in zip(out, res):
                o.p[key] = r.p[key]
            continue
        delta = np.array([q - o for o, q in zip(orig, new)])
        if not np.abs(delta).max() > 1e-9:
            continue
        sm = _smooth_rows(_dilate_rows(delta, int(math.ceil(CLEAR_SMOOTH * 2)), loop), CLEAR_SMOOTH, loop)
        for o, base, d in zip(out, orig, sm):
            v = base + d
            if is_dir:
                v = v / max(np.linalg.norm(v), 1e-9)
            o.p[key] = tuple(v.tolist())
    return out


def keys_of(seq, loop=False, dense=True, ease_clear=True):
    """seq: [(t, Body, ease)] -> per-frame [(t, Pose, 'linear')]: every frame is
    solved from the interpolated BODY (arcs, not quaternion blends), out of the
    flesh by a time-smoothed clearance (cleared_track; `ease_clear=False` keeps each
    frame's own push), then steadied (steady_arms)."""
    if not dense:
        return [(t, b.pose(), e) for t, b, e in seq]
    end = seq[-1][0]
    nfr = int(round(end * 24))
    times = [f / 24 for f in range(nfr + 1)]
    bodies = [sample(seq, t, loop) for t in times]
    if abs(nfr / 24 - end) > 1e-6:
        times.append(end)
        bodies.append(seq[-1][1])
    # a loop's last frame IS its first: smooth over the cycle without counting it twice
    cyc = bodies[:-1] if loop and len(bodies) > 2 else bodies
    track = cleared_track(cyc, loop=loop) if ease_clear else [b.cleared() for b in cyc]
    if len(cyc) < len(bodies):
        track = track + [track[0]]
    memory = {}
    if loop:   # settle the bend memory over one pass so the loop seam matches
        for b in track:
            b._solve(memory)
    poses = steady_arms([b._solve(memory) for b in track], bodies[0].rig)
    return [(t, p, 'linear') for t, p in zip(times, poses)]


# The arm chain, parents first (anatomy.BONES), steadied by steady_arms.
ARM_CHAIN = ('Clavicle', 'UpperArm', 'ElbowFix', 'Forearm', 'Hand')
STEADY_LIMIT = 1.0      # deg/frame^2 of zig-zag left in place (jitter.TREMOR_LIMIT gates at 2.5)


def steady_arms(poses, rig, passes=24):
    """Take the frame-to-frame zig-zag out of each arm bone's armature-space turn.

    A fast blow still leaves the solver a frame or two where the bend and roll limits
    (rig.two_bone, Rig._limit_roll) catch up with a target that outran them: the limb
    lurches one way and back on alternate frames. Each arm bone, parents first, is
    scanned for that pattern (jitter.py: an acceleration flipping against both
    neighbours) and only the flagged frames are eased toward their neighbours (a
    1-2-1 slerp), until none is left above STEADY_LIMIT. The easing works on the
    bone's LOCAL turn, so its roll steps never grow past the rig's (review.py's
    roll-step check); only a zig-zag the parent hands down whole is eased in
    armature space. A single hard stop or recoil is one flip, not a zig-zag, so the
    blows keep their snap; the fingers, the chains and everything else ride on the
    steadied bones unchanged."""
    import jitter as J
    n = len(poses)
    if n < 5:
        return poses

    def ease(qs, flagged):
        new = list(qs)
        for i in flagged:
            if 0 < i < n - 1:
                new[i] = qs[i - 1].slerp(qs[i + 1], 0.5).slerp(qs[i], 0.5)
        return new

    def aligned(qs):
        qs = [Quaternion(q) for q in qs]
        for i in range(1, len(qs)):
            if qs[i].dot(qs[i - 1]) < 0:
                qs[i].negate()
        return qs

    for side in ('L_', 'R_'):
        for part in ARM_CHAIN:
            name = side + part
            parent = rig.parent[name]
            rest_m = rig.frames[name]
            local = aligned([(rest_m @ p[name].to_matrix() @ rest_m.inverted()).to_quaternion() for p in poses])

            def world(loc):
                return aligned([p.delta[parent] @ q for p, q in zip(poses, loc)])

            touched = False
            for _ in range(passes):
                flagged = J.zigzag_frames(world(local), STEADY_LIMIT)
                if not flagged:
                    break
                local = ease(local, flagged)
                touched = True
            qs = world(local)
            for _ in range(passes):
                flagged = J.zigzag_frames(qs, STEADY_LIMIT)
                if not flagged:
                    break
                qs = ease(qs, flagged)
                touched = True
            for p, q in zip(poses, qs):
                p.delta[name] = q
                if touched:
                    loc = p.delta[parent].inverted() @ q
                    p[name] = (rest_m.inverted() @ loc.to_matrix() @ rest_m).to_quaternion()
    return poses




# ------------------------------------------------------------------ the stance
def stance(rig):
    """Idle stance: knees bent, gut forward, the great shoulders rolled forward,
    the head thrust out and low, the fists half closed and hanging heavy."""
    return Body(rig,
                pelvis=(0, 0.1, -0.36), hip_tilt=4, lean=12, neck=4, look=(0, 9),
                hand_l=(5.55, -0.95, 5.0), hand_r=(-5.55, -0.95, 5.0), pole_l=(0.8, 1.0, 0.1),
                foot_l=(1.75, 0.3, 0.98), foot_r=(-1.75, 0.45, 0.98),
                foot_dir_l=(0.12, -1.48, -0.64), foot_dir_r=(-0.12, -1.48, -0.64),
                fist_l=0.72, fist_r=0.72, clav_l=-4, clav_r=-4, lid_up=18, lid_lo=7, brow=6)


def make_clips(arm, only=None):
    rig = R.Rig(arm)
    made = []
    import clip_library as L
    for name, fn, loop, wind in L.CATALOG:
        if only and name not in only:
            continue
        keys = fn(rig)
        act = R.make_clip(arm, name, keys)
        R.follow_through(arm, act, loop=loop, wind=wind)
        made.append(name)
    return made
