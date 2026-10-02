"""The Voltaic Warden's clips, keyed from a whole-body biped pose language.

`Body(**params)` turns readable numbers into a full pose: the Root offset and turn,
the hips, the waist and chest (lean, twist, side), the head's look and the grille
jaw, both wrists (two-bone IK with an elbow pole) and hands (aim, fist), both
ankles (IK with a knee pole) and feet, the shoulder shrug, and the machine's own
parts: the reversible plates (flip angle, push-out, rattle), the coil core's
spin, the drone hatches and the crown's telescope. Every clip is a list of keys
in SECONDS with the easing of the segment leaving each key; every frame is solved
from the interpolated Body, then `finalize` aims the pistons, lets the pauldrons
follow half the arm swing and keys the plates.

Axes: armature space, yards, +Z up, it faces -Y, its left is +X.
Signs: `lean` + tips forward; `twist` + turns the chest to its left; `look`
(yaw +left, pitch +up); `jaw` + opens; `clav_*` + raises that shoulder.

CONTRACT lines name the frames the game should read.
"""
import math

import numpy as np
from mathutils import Quaternion, Vector

import frame as A
import rig as R

V = Vector
WR_L = A.WRIST.copy()
WR_R = A.mirror(A.WRIST)
AN_L = A.ANKLE.copy()
AN_R = A.mirror(A.ANKLE)
FOOT_DIR = A.TOE_BASE - A.ANKLE
HAND_DIR = A.KNUCKLE - A.WRIST
PLATE_NAMES = [p.name for p in A.PLATES]
PLATE_SPEC = {p.name: p for p in A.PLATES}


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def mir(p):
    return (-p[0], p[1], p[2])


class Body:
    DEFAULTS = dict(
        pelvis=(0.0, 0.0, 0.0), yaw=0.0, pitch=0.0, roll=0.0,
        hip_tilt=0.0, hip_twist=0.0, hip_roll=0.0,
        lean=0.0, twist=0.0, side=0.0,
        look=(0.0, 0.0), head_roll=0.0, jaw=0.0,
        hand_l=tuple(WR_L), hand_r=tuple(WR_R), pole_l=(0.6, 1.0, -0.2), pole_r=(-0.6, 1.0, -0.2),
        hdir_l=tuple(HAND_DIR), hdir_r=tuple(A.mirror(HAND_DIR)), fist_l=0.5, fist_r=0.5,
        foot_l=tuple(AN_L), foot_r=tuple(AN_R), fdir_l=tuple(FOOT_DIR), fdir_r=tuple(A.mirror(FOOT_DIR)),
        toe_l=0.0, toe_r=0.0, knee_l=(0.15, -1.0, 0.0), knee_r=(-0.15, -1.0, 0.0),
        clav_l=0.0, clav_r=0.0, clav_fwd_l=0.0, clav_fwd_r=0.0,
        flip=0.0, lift=0.0, rattle=0.0, hatch=0.0, crown=0.0, crown_spin=0.0, coil=0.0, coil_pulse=0.0,
        plate_sag=0.0, wrist_l=0.0, wrist_r=0.0,
    )

    def __init__(self, **kw):
        self.p = dict(self.DEFAULTS)
        for k, v in kw.items():
            if k not in self.p:
                raise KeyError(k)
            self.p[k] = v

    def but(self, **kw):
        b = Body()
        b.p = dict(self.p)
        for k, v in kw.items():
            if k not in b.p:
                raise KeyError(k)
            b.p[k] = v
        return b

    def solve(self, rig, memory=None):
        p = self.p
        turns, aims, ik = {}, {}, {}
        turns['Root'] = [('z', p['yaw']), ('x', p['pitch']), ('y', p['roll'])]
        turns['Hips'] = [('x', p['hip_tilt']), ('z', p['hip_twist']), ('y', p['hip_roll'])]
        turns['Waist'] = [('x', p['lean'] * 0.4), ('z', p['twist'] * 0.4), ('y', -p['side'] * 0.45)]
        turns['Chest'] = [('x', p['lean'] * 0.6), ('z', p['twist'] * 0.6), ('y', -p['side'] * 0.55)]
        yaw, pitch = p['look']
        turns['Neck'] = [('x', -pitch * 0.35), ('z', yaw * 0.4)]
        turns['Head'] = [('x', -pitch * 0.65), ('z', yaw * 0.6), ('y', p['head_roll'])]
        turns['Jaw'] = [('x', p['jaw'])]
        turns['L_Clavicle'] = [((0, 1, 0), -p['clav_l']), ((0, 0, 1), -p['clav_fwd_l'])]
        turns['R_Clavicle'] = [((0, 1, 0), p['clav_r']), ((0, 0, 1), p['clav_fwd_r'])]
        turns['HatchL'] = [('x', 105.0 * p['hatch'])]
        turns['HatchR'] = [('x', 105.0 * p['hatch'])]
        for s, side in ((1, 'L_'), (-1, 'R_')):
            k = 'l' if s > 0 else 'r'
            ik['arm' + k] = (side + 'UpperArm', side + 'Forearm', tuple(p['hand_' + k]), tuple(p['pole_' + k]))
            ik['leg' + k] = (side + 'Thigh', side + 'Shin', tuple(p['foot_' + k]), tuple(p['knee_' + k]))
            turns[side + 'Hand'] = [((0, s, 0), p['wrist_' + k])]
            fist = p['fist_' + k]
            curl = (0, s, 0)
            turns[side + 'Fingers1'] = [(curl, 70 * fist - 20)]
            turns[side + 'Fingers2'] = [(curl, 80 * fist - 15)]
            turns[side + 'Thumb'] = [((0, 0, s), 30 * fist - 5)]
            if p['toe_' + k]:
                turns[side + 'Toe'] = [((1, 0, 0), p['toe_' + k])]
        pose = rig.pose(aims=aims, ik=ik, turns=turns, root=tuple(p['pelvis']), mirror=False, memory=memory)
        return pose


# ------------------------------------------------------------------ finalize
def _local(rig, name, q_arm):
    rm = rig.frames[name]
    return (rm.inverted() @ q_arm.to_matrix() @ rm).to_quaternion()


def jitter(seed, t, f=23.0):
    return (math.sin(t * f + seed * 1.7) * 0.6 + math.sin(t * f * 1.93 + seed * 4.1) * 0.4)


def finalize(rig, pose, body, t, plate_fn=None):
    p = body.p
    head, delta = pose.head, pose.delta
    # pistons: the cylinder aims at the rod's anchor and the rod back at the cylinder's
    for nm, ba, pa, bb, pb in A.PISTON_PAIRS:
        Aw = head[ba] + delta[ba] @ (V(pa) - rig.rest[ba][0])
        Bw = head[bb] + delta[bb] @ (V(pb) - rig.rest[bb][0])
        for bone, par, frm, to in ((nm + 'Cyl', ba, Aw, Bw), (nm + 'Rod', bb, Bw, Aw)):
            rh, rt = rig.rest[bone]
            r0 = (rt - rh).normalized()
            want = delta[par].inverted() @ (to - frm).normalized()
            pose[bone] = _local(rig, bone, r0.rotation_difference(want))
    # pauldrons follow half the upper arm's swing (about the shoulder joint)
    for side in ('L_', 'R_'):
        ua = side + 'UpperArm'
        rm = rig.frames[ua]
        q_ua = (rm @ pose[ua].to_matrix() @ rm.inverted()).to_quaternion()
        d0 = (rig.rest[ua][1] - rig.rest[ua][0]).normalized()
        sw = d0.rotation_difference(q_ua @ d0)
        ang = min(sw.angle * 0.42, math.radians(48.0))
        q_p = Quaternion(sw.axis, ang) if sw.angle > 1e-5 else Quaternion()
        pose[side + 'Pauldron'] = _local(rig, side + 'Pauldron', q_p)
    # feet: aimed in armature space (swing from rest only), so a splayed knee never rolls the sole
    for side, k in (('L_', 'l'), ('R_', 'r')):
        ft = side + 'Foot'
        rh, rt = rig.rest[ft]
        qa = (rt - rh).normalized().rotation_difference(V(p['fdir_' + k]).normalized())
        pose[ft] = _local(rig, ft, delta[side + 'Shin'].inverted() @ qa)
    # reversible plates
    lloc = {}
    for i, nm in enumerate(PLATE_NAMES):
        spec = PLATE_SPEC[nm]
        ang, lift = p['flip'], p['lift']
        if plate_fn is not None:
            ang, lift = plate_fn(nm, i, t, ang, lift)
        ang += p['rattle'] * jitter(i, t) + p['plate_sag'] * (0.5 + 0.5 * math.sin(i * 2.3))
        mount = 'PlateMount_' + nm
        m3 = rig.frames[mount]
        n_local = m3.inverted() @ V(spec.n)
        lloc[mount] = tuple(n_local * (A.PLATE_RAISE * lift + 0.012 * p['rattle'] * jitter(i + 7, t, 31.0)))
        pose['Plate_' + nm] = Quaternion((0, 1, 0), math.radians(ang))
    # the coil core spins and its arcs flicker; the crown telescopes and turns
    pose['CoilCore'] = Quaternion((0, 1, 0), math.radians(p['coil']))
    flick = 1.0 + 0.06 * jitter(3, t, 41.0) + 0.25 * p['coil_pulse']
    pose.scale['CoilCore'] = flick
    pose['CrownTop'] = Quaternion((0, 1, 0), math.radians(p['crown_spin']))
    lloc['CrownTop'] = (0.0, 0.42 * p['crown'], 0.0)
    pose.lloc = lloc
    return pose


# ------------------------------------------------------------------ interpolation
def lerp_body(b0, b1, u):
    out = b0.but()
    for k, a in b0.p.items():
        o = b1.p[k]
        if isinstance(a, (tuple, list, np.ndarray)):
            out.p[k] = tuple(float(x) + (float(y) - float(x)) * u for x, y in zip(a, o))
        else:
            out.p[k] = a + (o - a) * u
    return out


def cr_body(bs, u):
    u2, u3 = u * u, u * u * u
    w = (0.5 * (-u + 2 * u2 - u3), 0.5 * (2 - 5 * u2 + 3 * u3), 0.5 * (u + 4 * u2 - 3 * u3), 0.5 * (-u2 + u3))
    out = bs[1].but()
    for k in bs[1].p:
        vals = [b.p[k] for b in bs]
        if isinstance(vals[0], (tuple, list, np.ndarray)):
            acc = sum(wi * np.asarray(v, float) for wi, v in zip(w, vals))
            out.p[k] = tuple(acc.tolist())
        else:
            out.p[k] = float(sum(wi * v for wi, v in zip(w, vals)))
    return out


EASE_FN = {
    'in': lambda u: u ** 3,
    'quadin': lambda u: u * u,
    'out': lambda u: 1 - (1 - u) ** 3,
    'inout': lambda u: 0.5 - 0.5 * math.cos(math.pi * u),
    'backout': lambda u: 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2,
    'linear': lambda u: u,
}


def sample(seq, t, loop=False):
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
        return lerp_body(b0, b1, EASE_FN[ease](u))
    if loop:
        bm = seq[i - 1][1] if i > 0 else seq[-2][1]
        bp = seq[i + 2][1] if i + 2 < n else seq[1][1]
    else:
        bm = seq[i - 1][1] if i > 0 else b0
        bp = seq[i + 2][1] if i + 2 < n else b1
    return cr_body([bm, b0, b1, bp], u)


def keys_of(rig, seq, loop=False, post=None, plate_fn=None, fn=None):
    """[(t, Body, ease)] -> per-frame [(t, Pose, 'linear')]. `fn(t, body) -> body`
    may add procedural motion (gait, spin) on top of the sampled Body."""
    end = seq[-1][0]
    nfr = int(round(end * R.FPS))
    out, memory = [], {}
    frames = list(range(nfr + 1))
    if loop:
        for f in frames:
            b = sample(seq, f / R.FPS, loop)
            if fn:
                b = fn(f / R.FPS, b)
            b.solve(rig, memory)
    for f in frames:
        t = f / R.FPS
        b = sample(seq, t, loop)
        if fn:
            b = fn(t, b)
        pose = b.solve(rig, memory)
        finalize(rig, pose, b, t, plate_fn)
        out.append((t, pose, 'linear'))
    return out


def spin(rate_turns, dur, loop=True):
    """Coil spin degrees at t: whole turns over a loop so it closes seamlessly."""
    turns = max(1, round(rate_turns * dur)) if loop else rate_turns * dur
    return lambda t: 360.0 * turns * t / dur


# ------------------------------------------------------------------ stance
def stance():
    return Body(pelvis=(0, 0.1, -0.2), lean=9.0, look=(0.0, -12.0), fist_l=0.85, fist_r=0.85,
                hand_l=(3.12, -0.3, 3.7), hand_r=(-3.12, -0.3, 3.7), clav_l=-2.0, clav_r=-2.0)


def with_spin(rate, dur, loop=True, extra=None):
    sp = spin(rate, dur, loop)

    def fn(t, b):
        b = b.but(coil=sp(t))
        return extra(t, b) if extra else b
    return fn


# ------------------------------------------------------------------ locomotion
def gait_foot(phase, stance_frac, half, lift, rest):
    rest = np.asarray(rest, float)
    # pitch + turns the toe down (heel off), - lifts the toe (heel strike); the ankle rises so
    # neither the toe tip nor the heel ever goes under the ground
    if phase < stance_frac:
        u = phase / stance_frac
        y = rest[1] - half + 2 * half * u
        pitch = -8 * (1 - smooth(u / 0.18)) + 20 * smooth((u - 0.72) / 0.28)
        z = rest[2]
    else:
        u = (phase - stance_frac) / (1 - stance_frac)
        e = smooth(u)
        y = rest[1] + half - 2 * half * e
        z = rest[2] + lift * math.sin(math.pi * u) ** 1.1
        pitch = 20 * (1 - smooth(u / 0.45)) - 8 * smooth((u - 0.6) / 0.4)
    rad = math.radians(pitch)
    z = max(z, rest[2] + 1.62 * math.sin(max(rad, 0.0)) + 0.62 * math.sin(max(-rad, 0.0)))
    c, s = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    d = FOOT_DIR
    fd = (d[0], d[1] * c - d[2] * s, d[1] * s + d[2] * c)
    return (rest[0], y, z), fd


def locomotion(rig, name, T, stance_frac, half, lift, bob, sway, lean, arm_swing, twist, run=False):
    base = stance().but(lean=lean)

    def fn(t, b):
        ph = (t / T) % 1.0
        fl, dl = gait_foot(ph, stance_frac, half, lift, AN_L)
        fr, dr = gait_foot((ph + 0.5) % 1.0, stance_frac, half, lift, AN_R)
        w = math.tau * ph
        z = -0.12 - bob * (0.5 + 0.5 * math.cos(2 * w)) - (0.15 if run else 0.0)
        x = sway * math.sin(w)
        arm = arm_swing * math.sin(w)
        b = b.but(pelvis=(x, 0.0, z), foot_l=fl, foot_r=fr, fdir_l=dl, fdir_r=(-dr[0], dr[1], dr[2]),
                  hip_twist=6 * math.sin(w), twist=-twist * math.sin(w), side=2.5 * math.sin(w),
                  hip_roll=-3 * math.sin(w),
                  hand_l=(3.12 + 0.05 * arm, -0.3 - arm, 3.75 + 0.18 * abs(arm)),
                  hand_r=(-3.12 - 0.05 * arm, -0.3 + arm, 3.75 + 0.18 * abs(arm)),
                  look=(-2.5 * math.sin(w), -6.0 + 2 * math.cos(2 * w)), clav_l=-2 + 3 * math.sin(w),
                  clav_r=-2 - 3 * math.sin(w), rattle=1.2 if run else 0.5)
        return b
    sp = spin(1.0, T)
    keys = keys_of(rig, [(0.0, base, 'linear'), (T, base, 'linear')], loop=True,
                   fn=lambda t, b: fn(t, b).but(coil=sp(t)))
    return keys


# ------------------------------------------------------------------ clips
def clip_idle(rig):
    D = 4.0
    s = stance()
    k = [
        (0.0, s, 'auto'),
        (1.0, s.but(lean=2.5, pelvis=(0, 0, -0.08), look=(8.0, -4.0), fist_l=0.7, clav_l=-1.0, clav_r=-1.0), 'auto'),
        (2.0, s.but(lean=5.0, pelvis=(0.04, 0, -0.16), look=(-6.0, -8.0), fist_r=0.75), 'auto'),
        (2.55, s.but(lean=5.0, pelvis=(0.04, 0, -0.16), look=(-6.0, -8.0), fist_r=0.75), 'linear'),
        (2.65, s.but(lean=7.0, pelvis=(0.04, 0, -0.2), look=(-9.0, -11.0), head_roll=4.0, clav_l=3.0, clav_r=3.0,
                     fist_l=0.9, fist_r=0.95, rattle=6.0, coil_pulse=1.0), 'out'),
        (3.1, s.but(lean=4.5, pelvis=(0.0, 0, -0.14), look=(-3.0, -7.0), rattle=0.0), 'auto'),
        (D, s, 'auto'),
    ]
    return keys_of(rig, k, loop=True, fn=with_spin(0.5, D))


def clip_walk(rig):
    # CONTRACT Walk 1.708 loop (41 frames), walkRef 2.0 yd/s. Footfalls: left 0.00, right 0.854.
    return locomotion(rig, 'Walk', 41 / 24, 0.6, 1.025, 0.55, 0.1, 0.12, 6.0, 0.45, 7.0)


def clip_run(rig):
    # CONTRACT Run 1.00 loop, runRef 5.0 yd/s. Footfalls: left 0.00, right 0.50.
    return locomotion(rig, 'Run', 1.0, 0.42, 1.05, 0.95, 0.2, 0.16, 14.0, 0.9, 11.0, run=True)


def clip_backhand(rig):
    # CONTRACT Backhand 1.60: windup to 0.50, the right fist sweeps across, lands 0.72.
    s = stance()
    wind = s.but(twist=32.0, lean=8.0, hip_twist=10.0, pelvis=(0.15, 0.1, -0.3), look=(10.0, -6.0),
                 hand_r=(1.2, -2.0, 5.6), pole_r=(-0.4, 0.4, 1.0), fist_r=1.0, hdir_r=(1.0, -0.3, 0.3),
                 clav_r=6.0, clav_fwd_r=14.0, hand_l=(3.0, 0.4, 4.0), foot_r=(-1.35, -0.5, 0.92))
    hit = s.but(twist=-34.0, lean=10.0, hip_twist=-12.0, pelvis=(-0.2, -0.3, -0.38), look=(-12.0, -8.0),
                hand_r=(-3.4, -2.9, 5.0), pole_r=(-0.3, 0.6, 1.0), fist_r=1.0, hdir_r=(-1.0, -0.6, -0.1),
                clav_r=10.0, clav_fwd_r=8.0, hand_l=(3.2, 0.6, 4.2), foot_r=(-1.35, -0.5, 0.92), rattle=5.0,
                coil_pulse=0.6)
    follow = hit.but(twist=-44.0, hand_r=(-4.3, -1.3, 4.6), rattle=2.0, coil_pulse=0.0)
    k = [(0.0, s, 'inout'), (0.5, wind, 'quadin'), (0.72, hit, 'out'), (0.95, follow, 'inout'), (1.6, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.5, 1.6, loop=False))


def clip_hammerfists(rig):
    # CONTRACT HammerFists 2.00: fists overhead by 0.80, slam lands 1.05 (both fists, in front at about 3.4 yd).
    s = stance()
    up = s.but(lean=-10.0, pelvis=(0, 0.15, 0.1), look=(0.0, 16.0), hand_l=(0.55, -0.6, 9.9),
               hand_r=(-0.55, -0.6, 9.9), pole_l=(1.0, 0.2, -0.4), pole_r=(-1.0, 0.2, -0.4), fist_l=1.0, fist_r=1.0,
               hdir_l=(-0.5, 0.0, 1.0), hdir_r=(0.5, 0.0, 1.0), clav_l=14.0, clav_r=14.0, jaw=6.0,
               foot_l=(1.3, -0.6, 0.92), coil_pulse=0.4)
    slam = s.but(lean=42.0, pelvis=(0, -0.55, -1.15), look=(0.0, -4.0), hand_l=(0.62, -3.4, 2.45),
                 hand_r=(-0.62, -3.4, 2.45), pole_l=(1.0, 0.6, 0.2), pole_r=(-1.0, 0.6, 0.2), fist_l=1.0, fist_r=1.0,
                 hdir_l=(-0.3, -0.5, -1.0), hdir_r=(0.3, -0.5, -1.0), clav_l=-6.0, clav_r=-6.0, clav_fwd_l=22.0,
                 clav_fwd_r=22.0, foot_l=(1.3, -0.6, 0.92), jaw=10.0, rattle=8.0, coil_pulse=1.0)
    settle = slam.but(lean=36.0, pelvis=(0, -0.45, -1.0), rattle=2.0, coil_pulse=0.2, jaw=3.0)
    lift = s.but(lean=2.0, hand_l=(2.5, -3.0, 6.2), hand_r=(-2.5, -3.0, 6.2), pole_l=(1.0, 0.4, -0.3),
                 pole_r=(-1.0, 0.4, -0.3), fist_l=1.0, fist_r=1.0, clav_l=6.0, clav_r=6.0, look=(0.0, 4.0))
    up = up.but(pole_l=(1.0, 0.4, -0.3), pole_r=(-1.0, 0.4, -0.3))
    k = [(0.0, s, 'inout'), (0.42, lift, 'auto'), (0.8, up, 'auto'), (0.88, up.but(lean=-12.0, hand_l=(0.5, -0.4, 10.1),
                                                           hand_r=(-0.5, -0.4, 10.1)), 'quadin'),
         (1.05, slam, 'out'), (1.35, settle, 'inout'), (2.0, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.5, 2.0, loop=False))


def clip_staticlash(rig):
    # CONTRACT StaticLash 1.80: the 1.0 s bar winds the right arm back with the palm open and
    # crackling; the whip cracks forward and the lash LEAVES the right palm at 1.00 (R_Hand anchor),
    # leaping to the tank, then chaining (the chain hop is the game's).
    s = stance()
    wind = s.but(twist=-28.0, lean=-4.0, pelvis=(-0.1, 0.25, -0.2), look=(4.0, 4.0), hand_r=(-3.6, 2.2, 7.6),
                 pole_r=(-0.8, 0.5, -0.4), fist_r=0.0, hdir_r=(-0.4, 0.6, 0.8), clav_r=12.0, hand_l=(2.6, -1.7, 5.0),
                 fist_l=0.9, foot_l=(1.3, -0.8, 0.92), coil_pulse=0.5)
    wind2 = wind.but(twist=-34.0, hand_r=(-3.4, 2.6, 8.0), rattle=3.0, coil_pulse=0.9)
    crack = s.but(twist=26.0, lean=14.0, pelvis=(0.1, -0.45, -0.36), look=(-6.0, -2.0), hand_r=(-1.6, -3.4, 5.6),
                  pole_r=(-0.8, 0.5, -0.4), fist_r=0.0, hdir_r=(0.1, -1.0, 0.0), clav_r=8.0, clav_fwd_r=18.0,
                  hand_l=(3.0, 0.5, 4.4), foot_l=(1.3, -0.8, 0.92), jaw=8.0, rattle=4.0, coil_pulse=1.0)
    k = [(0.0, s, 'inout'), (0.56, wind, 'auto'), (0.78, wind2, 'quadin'),
         (0.9, crack.but(twist=0.0, lean=4.0, hand_r=(-3.0, -1.2, 9.7), hdir_r=(0.0, -0.4, 1.0)), 'linear'),
         (1.0, crack, 'out'),
         (1.25, crack.but(hand_r=(-1.9, -3.2, 5.0), rattle=1.0, coil_pulse=0.0, jaw=2.0), 'inout'),
         (1.8, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.6, 1.8, loop=False))


def flip_plate_fn(t0=1.9, t_out=2.22, t_turn=2.72, t_in=2.9, stagger=0.06):
    """FlipRattle's plate motion: each plate pushes out, turns 180 and seats again,
    staggered by a few frames plate to plate."""
    order = [0, 6, 1, 7, 10, 4, 11, 5, 2, 8, 3, 9]

    def fn(nm, i, t, ang, lift):
        d = (order.index(i) - 5.5) / 5.5 * stagger
        a0, a1, a2, a3 = t0 + d, t_out + d, t_turn + d, t_in + d
        if t < a0:
            lf, an = 0.0, 0.0
        elif t < a1:
            u = smooth((t - a0) / (a1 - a0))
            lf, an = u, 18.0 * u
        elif t < a2:
            u = (t - a1) / (a2 - a1)
            lf, an = 1.0, 18.0 + 162.0 * (u * u * (3 - 2 * u))
        elif t < a3:
            u = (t - a2) / (a3 - a2)
            lf, an = 1.0 - u ** 2, 180.0
        else:
            lf, an = 0.0, 180.0
        return ang + an, lift + lf
    return fn


def clip_fliprattle(rig):
    # CONTRACT FlipRattle 3.00 (the 3 s plating_flip bar): rattle builds 0 to 1.9, every plate
    # pushes out 1.9 to 2.22 (staggered +-0.06 s), turns 180 degrees to 2.72, slams back in and
    # seats at 2.90 (the flip-spark frame, all plates seated by 2.96). The clip ends with every
    # plate turned 180: switch the plating state at its end (see NOTAS, "flip method").
    s = stance()
    brace = s.but(lean=8.0, pelvis=(0, 0, -0.35), hand_l=(3.5, -0.6, 4.3), hand_r=(-3.5, -0.6, 4.3), fist_l=1.0,
                  fist_r=1.0, clav_l=6.0, clav_r=6.0, look=(0.0, -10.0), rattle=3.0, coil_pulse=0.3)
    shake = brace.but(lean=10.0, pelvis=(0, 0, -0.42), clav_l=9.0, clav_r=9.0, rattle=9.0, coil_pulse=0.7, jaw=5.0)
    open_ = s.but(lean=-4.0, pelvis=(0, 0.1, -0.25), hand_l=(3.9, -0.4, 4.6), hand_r=(-3.9, -0.4, 4.6), fist_l=0.2,
                  fist_r=0.2, clav_l=10.0, clav_r=10.0, look=(0.0, 8.0), jaw=10.0, rattle=4.0, coil_pulse=1.0)
    seat = s.but(lean=10.0, pelvis=(0, -0.05, -0.45), hand_l=(3.4, -0.6, 4.0), hand_r=(-3.4, -0.6, 4.0), fist_l=1.0,
                 fist_r=1.0, clav_l=-4.0, clav_r=-4.0, look=(0.0, -12.0), rattle=6.0, coil_pulse=0.6)
    k = [(0.0, s, 'inout'), (0.5, brace, 'auto'), (1.2, brace.but(rattle=5.0, pelvis=(0, 0, -0.38)), 'auto'),
         (1.85, shake, 'auto'), (2.4, open_, 'auto'), (2.9, seat, 'out'), (3.0, seat.but(rattle=2.0), 'linear')]
    return keys_of(rig, k, fn=with_spin(1.2, 3.0, loop=False), plate_fn=flip_plate_fn())


def clip_callstorm(rig):
    # CONTRACT CallStorm 2.60: both arms rise, the crown telescopes up and turns; the strike is
    # CALLED at 1.50 (Crown anchor flash; the bolt into the marked spot is the game's).
    s = stance()
    rise = s.but(lean=-8.0, pelvis=(0, 0.1, -0.05), look=(0.0, 22.0), hand_l=(2.6, -0.6, 9.4),
                 hand_r=(-2.6, -0.6, 9.4), pole_l=(1.0, 0.4, -0.3), pole_r=(-1.0, 0.4, -0.3), fist_l=0.1, fist_r=0.1,
                 hdir_l=(0.2, -0.2, 1.0), hdir_r=(-0.2, -0.2, 1.0), clav_l=16.0, clav_r=16.0, crown=0.6,
                 crown_spin=40.0, coil_pulse=0.5, jaw=6.0)
    peak = rise.but(lean=-12.0, hand_l=(2.9, -0.2, 10.0), hand_r=(-2.9, -0.2, 10.0), look=(0.0, 28.0), crown=1.0,
                    crown_spin=120.0, coil_pulse=1.0, rattle=5.0, jaw=12.0)
    front = dict(hand_l=(3.0, -2.9, 6.3), hand_r=(-3.0, -2.9, 6.3), pole_l=(1.0, 0.4, -0.3),
                 pole_r=(-1.0, 0.4, -0.3), fist_l=0.3, fist_r=0.3, clav_l=6.0, clav_r=6.0)
    k = [(0.0, s, 'inout'), (0.5, s.but(lean=-2.0, look=(0.0, 8.0), crown=0.2, crown_spin=10.0, **front), 'auto'),
         (1.0, rise, 'in'), (1.5, peak, 'out'), (1.9, peak.but(rattle=1.0, crown_spin=150.0), 'inout'),
         (2.25, s.but(lean=-2.0, look=(0.0, 6.0), crown=0.3, crown_spin=168.0, **front), 'inout'),
         (2.6, s.but(crown_spin=180.0), 'linear')]
    return keys_of(rig, k, fn=with_spin(0.8, 2.6, loop=False))


def clip_discharge(rig):
    # CONTRACT Discharge 2.40: gathers 0 to 0.90 (arms crossed over the coil, hunched), the RELEASE
    # at 1.05 (arms flung wide, chest out: the white-blue nova leaves the coil, Coil anchor),
    # shudders to 1.6, recovers by 2.4.
    s = stance()
    gather = s.but(lean=18.0, pelvis=(0, 0.1, -0.55), look=(0.0, -16.0), hand_l=(-0.4, -2.0, 6.0),
                   hand_r=(0.4, -2.1, 5.7), pole_l=(0.7, 0.7, -0.5), pole_r=(-0.7, 0.7, -0.5), fist_l=1.0, fist_r=1.0,
                   clav_l=4.0, clav_r=4.0, clav_fwd_l=20.0, clav_fwd_r=20.0, rattle=4.0, coil_pulse=0.6)
    gather2 = gather.but(lean=22.0, pelvis=(0, 0.15, -0.65), rattle=8.0, coil_pulse=1.0, fist_l=0.85, fist_r=0.85)
    release = s.but(lean=-14.0, pelvis=(0, 0.25, -0.3), look=(0.0, 18.0), hand_l=(5.4, -0.6, 7.4),
                    hand_r=(-5.4, -0.6, 7.4), pole_l=(0.7, 0.7, -0.5), pole_r=(-0.7, 0.7, -0.5), fist_l=0.0,
                    fist_r=0.0, hdir_l=(1.0, -0.2, 0.2), hdir_r=(-1.0, -0.2, 0.2), clav_l=12.0, clav_r=12.0,
                    clav_fwd_l=-12.0, clav_fwd_r=-12.0, jaw=16.0, rattle=10.0, coil_pulse=1.0, lift=0.18)
    k = [(0.0, s, 'inout'), (0.6, gather, 'auto'), (0.86, gather2, 'quadin'),
         (0.96, release.but(lean=4.0, hand_l=(3.4, -3.1, 6.6), hand_r=(-3.4, -3.1, 6.6), lift=0.1, fist_l=0.55,
                             fist_r=0.55), 'linear'),
         (1.05, release, 'out'),
         (1.6, release.but(lean=-10.0, rattle=3.0, coil_pulse=0.3, jaw=8.0, lift=0.0), 'inout'), (2.4, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(1.5, 2.4, loop=False))


def clip_launchdrones(rig):
    # CONTRACT LaunchDrones 2.20: the back hatches open 0.25 to 0.70, the launch jolt at 0.95 (two
    # drones leave the bay, HatchL/HatchR anchors, up and back), hatches shut 1.45 to 1.85.
    s = stance()
    open_ = s.but(lean=12.0, pelvis=(0, 0, -0.3), hatch=1.0, look=(0.0, -4.0), hand_r=(-2.6, -2.6, 6.2),
                  pole_r=(-0.8, 0.5, -0.2), fist_r=0.15, hdir_r=(0.0, -1.0, 0.1), clav_r=6.0, clav_l=4.0,
                  hand_l=(3.3, 0.1, 4.0))
    jolt = open_.but(lean=20.0, pelvis=(0, -0.2, -0.45), clav_l=-6.0, clav_r=0.0, rattle=6.0, coil_pulse=0.8,
                     hand_r=(-2.2, -3.4, 6.4), jaw=6.0)
    k = [(0.0, s, 'inout'), (0.25, s.but(lean=6.0), 'inout'), (0.7, open_, 'auto'), (0.95, jolt, 'out'),
         (1.45, open_.but(rattle=1.0), 'inout'), (1.85, s.but(hatch=0.0, lean=5.0), 'inout'), (2.2, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.6, 2.2, loop=False))


def clip_cast(rig):
    # CONTRACT Cast 1.60: the left hand rises palm out, crackling; release at 0.95 (L_Hand anchor).
    s = stance()
    raise_ = s.but(lean=4.0, twist=-10.0, look=(6.0, 2.0), hand_l=(2.1, -2.6, 6.6), pole_l=(0.9, 0.6, -0.4),
                   fist_l=0.0, hdir_l=(-0.1, -1.0, 0.2), clav_l=8.0, clav_fwd_l=10.0, coil_pulse=0.6, rattle=2.0)
    rel = raise_.but(lean=8.0, twist=-14.0, hand_l=(1.9, -3.1, 6.8), coil_pulse=1.0, rattle=4.0, jaw=6.0)
    k = [(0.0, s, 'inout'), (0.75, raise_, 'in'), (0.95, rel, 'out'), (1.15, rel.but(rattle=1.0, coil_pulse=0.2),
                                                                    'inout'), (1.6, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.6, 1.6, loop=False))


def clip_hit(rig):
    # CONTRACT Hit 0.60: the jolt peaks at 0.12.
    s = stance()
    jolt = s.but(lean=-9.0, pelvis=(0, 0.3, -0.22), look=(-8.0, 8.0), head_roll=-6.0, clav_l=6.0, clav_r=8.0,
                 hand_l=(3.3, 0.2, 4.0), hand_r=(-3.4, 0.3, 4.1), rattle=9.0, coil_pulse=0.7)
    k = [(0.0, s, 'out'), (0.12, jolt, 'inout'), (0.6, s, 'linear')]
    return keys_of(rig, k, fn=with_spin(0.5, 0.6, loop=False))


def clip_death(rig):
    # CONTRACT Death 4.00: power fails 0 to 0.6 (shudder, the coil surges and dies), the legs
    # buckle into a deep crouch by 1.35, it pitches forward and both fists hit the ground at 2.05,
    # slumps and settles, at rest from 3.0 (a powered-down crouch on its knuckles; plates hang
    # half-turned). Dim the coil, visor and plate glow over 0.4 to 2.4.
    s = stance()
    shud = s.but(lean=-4.0, look=(10.0, 12.0), rattle=12.0, coil_pulse=1.0, clav_l=8.0, clav_r=8.0, jaw=12.0)
    buckle = s.but(lean=16.0, pelvis=(0, 0.2, -1.15), knee_l=(0.5, -1.0, 0.0), knee_r=(-0.5, -1.0, 0.0),
                   look=(4.0, -6.0), hand_l=(3.4, -0.9, 2.9), hand_r=(-3.4, -0.9, 2.9), fist_l=0.3, fist_r=0.3,
                   rattle=6.0, jaw=8.0, plate_sag=15.0)
    fall = buckle.but(lean=46.0, pelvis=(0, 0.05, -1.5), hand_l=(2.5, -3.0, 1.66), hand_r=(-2.5, -3.0, 1.66),
                      pole_l=(1.0, 0.5, 0.3), pole_r=(-1.0, 0.5, 0.3), hdir_l=(0.0, -0.45, -1.0),
                      hdir_r=(0.0, -0.45, -1.0), look=(0.0, -20.0), rattle=8.0, plate_sag=30.0, fist_l=0.9,
                      fist_r=0.9)
    rest = fall.but(lean=54.0, pelvis=(0, 0.05, -1.62), hand_l=(2.6, -3.1, 1.62), hand_r=(-2.6, -3.1, 1.62),
                    look=(-8.0, -30.0), head_roll=8.0, rattle=0.0, plate_sag=38.0, jaw=14.0, clav_l=-8.0,
                    clav_r=-6.0)
    k = [(0.0, s, 'auto'), (0.45, shud, 'auto'), (0.75, shud.but(rattle=6.0, lean=2.0), 'in'),
         (1.35, buckle, 'out'), (1.65, buckle.but(lean=24.0), 'in'), (2.05, fall, 'out'), (3.0, rest, 'inout'),
         (4.0, rest, 'linear')]

    def sp(t):
        t = min(t, 2.9)
        return 360.0 * (0.7 * t - 0.12 * t * t)
    return keys_of(rig, k, fn=lambda t, b: b.but(coil=sp(t)))


CLIPS = {
    'Idle': clip_idle, 'Walk': clip_walk, 'Run': clip_run, 'Backhand': clip_backhand, 'HammerFists': clip_hammerfists,
    'StaticLash': clip_staticlash, 'FlipRattle': clip_fliprattle, 'CallStorm': clip_callstorm,
    'Discharge': clip_discharge, 'LaunchDrones': clip_launchdrones, 'Cast': clip_cast, 'Hit': clip_hit,
    'Death': clip_death,
}


def make_clips(arm, only=None):
    rig = R.Rig(arm)
    names = []
    for nm, fn in CLIPS.items():
        if only and nm not in only:
            continue
        keys = fn(rig)
        R.make_clip(arm, nm, keys)
        names.append(nm)
        print('CLIP', nm, len(keys), flush=True)
    return names
