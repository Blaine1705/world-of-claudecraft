"""The Prime Draft's clips, keyed from a whole-body pose language.

`Body(**params)` turns readable numbers into a full pose: the pelvis offset and
tilt, the spine's lean / twist / side bend (spread over Spine and Chest), the look,
the clavicle shrugs, each wrist (hanging under its shoulder plus an offset, or
reaching for an absolute target, blended by a weight), each ankle (two-bone IK with
knee poles) and foot pitch, the claw, the Core Hatch, the eye's flare and the
socket's arcs. Every frame is solved from the interpolated Body (Catmull-Rom between
'auto' keys, eased otherwise) and keyed linear, so contact frames are exact. A
clip may add a per-frame `mod(body, t)` for mechanical tremor, the hatch's rattle
and lightning twitches.

Axes: armature space, yards, +Z up, it faces -Y, its left is +X. Signs: `lean` +
tips forward; `twist` + turns the chest to its LEFT; `side` + bends to its left;
`look` (yaw, pitch): yaw + to its left, pitch + up; `clav` + raises the shoulder;
`hatch` 0 shut .. 1 open (105 degrees); `claw` 0 shut .. 1 open.

Mechanical weight: big masses move on slow ease-in-out curves; strikes accelerate
into the contact ('in'); recoils settle with a small overshoot ('backout'); every
held pose carries a fine piston tremor; lightning twitches are 2 to 4 frame jolts.
"""
import math

import numpy as np
from mathutils import Quaternion, Vector

import mech as A
import rig as R

V = Vector
REST_WRIST_OFF = {1: A.WRIST - A.SHOULDER, -1: A.mirror(A.WRIST) - A.mirror(A.SHOULDER)}
FOOT_DIR = {1: A.TOE - A.ANKLE, -1: A.mirror(A.TOE) - A.mirror(A.ANKLE)}
ANK = {1: A.ANKLE.copy(), -1: A.mirror(A.ANKLE)}
WALK_SPEED = 3.0
WALK_PERIOD = 2.0
MOOR_BONES = [f'{k}{s}{i}' for s in ('L', 'R') for i in range(len(A.CLAMP_BOLTS)) for k in ('Clamp', 'Bolt')]


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def rot_x(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array((v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c))


class Body:
    DEFAULTS = dict(
        pelvis=(0.0, 0.0, 0.0), hip_tilt=0.0, hip_twist=0.0, hip_roll=0.0,
        lean=0.0, twist=0.0, side=0.0, neck=0.0, look=(0.0, 0.0), head_roll=0.0,
        clav_l=0.0, clav_r=0.0,
        hang_l=(0.0, 0.0, 0.0), hang_r=(0.0, 0.0, 0.0),
        reach_l=(3.3, -1.0, 4.0), reach_r=(-3.3, -1.0, 4.0), reach_wl=0.0, reach_wr=0.0,
        pole_l=(0.7, 1.0, -0.25), pole_r=(-0.7, 1.0, -0.25),
        wrist_l=0.0, wrist_r=0.0,
        foot_l=tuple(A.ANKLE), foot_r=tuple(A.mirror(A.ANKLE)),
        fpitch_l=0.0, fpitch_r=0.0,
        knee_l=(0.2, -1.0, 0.0), knee_r=(-0.2, -1.0, 0.0),
        claw=0.0, hatch=0.0, rattle=0.0, eye=1.0, core=0.0, moor=1.0,
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
            if k not in b.p:
                raise KeyError(k)
            b.p[k] = v
        return b

    def add(self, **kw):
        """Add to numeric params (vectors add component-wise)."""
        b = self.but()
        for k, v in kw.items():
            a = b.p[k]
            if isinstance(a, (tuple, list, np.ndarray)):
                b.p[k] = tuple(float(x) + float(y) for x, y in zip(a, v))
            else:
                b.p[k] = a + v
        return b

    def _turns(self):
        p = self.p
        t = {}
        t['Pelvis'] = [('x', p['hip_tilt']), ('z', p['hip_twist']), ('y', p['hip_roll'])]
        lean, tw, sd = p['lean'], p['twist'], p['side']
        t['Spine'] = [('x', lean * 0.4), ('z', tw * 0.4), ('y', sd * 0.4)]
        t['Chest'] = [('x', lean * 0.6), ('z', tw * 0.6), ('y', sd * 0.6)]
        yaw, pitch = p['look']
        t['Neck'] = [('x', p['neck'] - pitch * 0.35), ('z', yaw * 0.4)]
        t['Head'] = [('x', -pitch * 0.65), ('z', yaw * 0.6), ('y', p['head_roll'])]
        t['L_Clavicle'] = [((0, 1, 0), -p['clav_l'])]
        t['R_Clavicle'] = [((0, 1, 0), p['clav_r'])]
        ang = 105.0 * p['hatch'] + p['rattle']
        t['HatchL'] = [('z', ang)]
        t['HatchR'] = [('z', -ang)]
        t['L_Hand'] = [('x', p['wrist_l'])]
        t['R_Hand'] = [('x', p['wrist_r'])]
        c = np.array((3.35, -0.05))
        for b in ('L_ClawA', 'L_ClawB', 'L_ClawT'):
            h = A.REST[b][0]
            o = np.array((h[0] - c[0], h[1] - c[1], 0.0))
            o /= np.linalg.norm(o)
            ax = np.cross((0, 0, -1.0), o)
            t[b] = [(tuple(ax), 38.0 * p['claw'] - 6.0)]
        return t

    def _legs(self):
        p = self.p
        ik, world = {}, {}
        for side, s in (('L_', 1), ('R_', -1)):
            f = p['foot_l'] if s > 0 else p['foot_r']
            kp = p['knee_l'] if s > 0 else p['knee_r']
            ik['leg' + side] = (side + 'Thigh', side + 'Shin', tuple(f), tuple(kp))
            fp = p['fpitch_l'] if s > 0 else p['fpitch_r']
            # the foot keeps its sole level in world space: only its pitch is authored
            world[side + 'Foot'] = Quaternion((1, 0, 0), math.radians(fp))
        return ik, world

    def solve(self, memory=None):
        p = self.p
        turns = self._turns()
        ik, world = self._legs()
        aims = {}
        offs = {'Pelvis': p['pelvis']}
        scale = {'EyeGlow': max(0.0, p['eye']), 'CoreArc': max(0.0, p['core'])}
        for b in MOOR_BONES:
            scale[b] = p['moor']
        pre = self.rig.pose(aims=aims, ik=ik, turns=turns, mirror=False, offsets=offs, scale=scale, world=world)
        for side, s in (('L_', 1), ('R_', -1)):
            sh = np.array(pre.head[side + 'UpperArm'])
            hang = sh + REST_WRIST_OFF[s] + np.array(p['hang_l' if s > 0 else 'hang_r'])
            reach = np.array(p['reach_l' if s > 0 else 'reach_r'])
            w = p['reach_wl' if s > 0 else 'reach_wr']
            tgt = hang * (1 - w) + reach * w
            pole = p['pole_l' if s > 0 else 'pole_r']
            ik['arm' + side] = (side + 'UpperArm', side + 'Forearm', tuple(tgt), tuple(pole))
        return self.rig.pose(aims=aims, ik=ik, turns=turns, mirror=False, memory=memory, offsets=offs, scale=scale,
                             world=world)


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
    'hold': lambda u: 0.0,
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


def keys_of(seq, loop=False, mod=None, end=None):
    end = end if end is not None else seq[-1][0]
    nfr = int(round(end * R.FPS))
    out, memory = [], {}
    if loop:
        for f in range(nfr + 1):
            b = sample(seq, f / R.FPS, loop)
            (mod(b, f / R.FPS) if mod else b).solve(memory)
    for f in range(nfr + 1):
        t = f / R.FPS
        b = sample(seq, t, loop)
        if mod:
            b = mod(b, t)
        out.append((t, b.solve(memory), 'linear'))
    return out


# ------------------------------------------------------------------ texture of motion
def tremor(t, amp=1.0, seed=0.0):
    """A fine mechanical tremor (a few overlapping sines: pistons hunting)."""
    return amp * (0.5 * math.sin(2 * math.pi * 5.3 * t + seed) + 0.3 * math.sin(2 * math.pi * 8.7 * t + 1.7 + seed)
                  + 0.2 * math.sin(2 * math.pi * 13.1 * t + 0.4 + seed))


def jolt(t, t0, dur=0.12):
    """A lightning twitch: a sharp kick at t0 and a fast damped rebound."""
    x = t - t0
    if x < 0 or x > dur * 3:
        return 0.0
    if x < dur * 0.3:
        return x / (dur * 0.3)
    return math.exp(-(x - dur * 0.3) / (dur * 0.5)) * math.cos((x - dur * 0.3) / dur * 2 * math.pi * 0.75)


def flicker(t, t0, t1, seed=3):
    """Eye/arc flicker between t0 and t1 (0 .. 1 multiplier)."""
    if t < t0 or t > t1:
        return 1.0
    v = 0.5 + 0.5 * math.sin(t * 61.0 + seed) * math.sin(t * 23.0 + seed * 2)
    return 0.25 + 0.95 * v


# ------------------------------------------------------------------ the clips
def stance(rig):
    return Body(rig, pelvis=(0.0, 0.12, -0.34), lean=14.0, look=(0.0, 4.0), neck=9.0, hang_l=(0.24, -0.35, 0.2),
                hang_r=(-0.24, -0.35, 0.2), clav_l=4.0, clav_r=4.0, claw=0.1, wrist_r=24.0,
                pole_r=(-0.9, 0.8, -0.1), pole_l=(0.8, 0.9, -0.1))


def idle(rig):
    b = stance(rig)
    seq = [(0.0, b, 'auto'), (1.0, b.add(pelvis=(0, 0, 0.07), lean=-2.0, clav_l=2.5, clav_r=2.5, look=(0, 2.0)), 'auto'),
           (2.0, b.add(pelvis=(0, 0, -0.03), lean=1.0, look=(-6, 0)), 'auto'),
           (3.0, b.add(pelvis=(0, 0, 0.06), lean=-1.5, clav_l=2.0, clav_r=2.0, look=(4, 1.0)), 'auto'),
           (4.0, b, 'auto')]

    def mod(x, t):
        j1 = jolt(t, 1.45, 0.1)
        j2 = jolt(t, 2.9, 0.12)
        x = x.add(look=(9 * j1, 4 * j1), head_roll=6 * j1, clav_l=7 * j2, claw=0.5 * j2, twist=-2.5 * j2,
                  lean=0.25 * tremor(t, 1.0), eye=0.0)
        e = 1.0 + 0.35 * j1 - (0.5 if 1.43 < t < 1.5 else 0.0)
        return x.but(eye=e)
    return keys_of(seq, loop=True, mod=mod)


def slumped(rig):
    return Body(rig, pelvis=(0.0, 0.3, -1.45), lean=36.0, look=(4.0, -38.0), neck=14.0, head_roll=-6.0,
                reach_l=(3.05, -2.2, 1.98), reach_r=(-3.0, -2.25, 2.08), reach_wl=1.0, reach_wr=1.0,
                clav_l=-6.0, clav_r=-6.0, claw=0.05, eye=0.0)


def wake(rig):
    s0 = slumped(rig)
    st = stance(rig)
    half = s0.but(pelvis=(0.0, 0.2, -0.85), lean=24.0, look=(0.0, -14.0), neck=8.0, head_roll=0.0,
                  reach_wl=0.6, reach_wr=0.6, eye=1.0)
    stand = st.but(lean=6.0, look=(0.0, 4.0))
    flex = st.but(pelvis=(0.0, 0.1, -0.5), lean=-6.0, look=(0.0, 14.0), neck=-6.0, clav_l=12.0, clav_r=12.0,
                  hang_l=(1.25, -1.2, 2.3), hang_r=(-1.25, -1.2, 2.3), claw=1.0, wrist_r=-25.0, eye=1.3)
    seq = [(0.0, s0, 'hold'), (0.6, s0, 'linear'), (0.66, s0.add(lean=-5.0, clav_l=6, clav_r=6, look=(0, 8)).but(eye=0.4), 'out'),
           (0.82, s0.but(eye=0.1), 'inout'), (0.95, s0.but(eye=1.5, look=(0.0, -26.0)), 'out'),
           (1.15, s0.but(eye=1.0, look=(0.0, -24.0)), 'inout'),
           (1.75, half, 'linear'), (1.9, half.add(pelvis=(0, 0, -0.05)), 'inout'),
           (2.6, stand, 'inout'), (2.75, stand, 'inout'), (3.1, flex, 'out'), (3.55, flex.add(lean=-1.5), 'inout'),
           (4.6, st, 'backout')]

    def mod(x, t):
        tr = tremor(t, 0.6 if t > 1.0 else 0.15)
        j = jolt(t, 0.62, 0.1) + 0.6 * jolt(t, 1.72, 0.08)
        return x.add(lean=tr * 0.5 - 4 * j, clav_l=3 * j, clav_r=3 * j)
    return keys_of(seq, mod=mod)


def walk_body(rig, t):
    """The heavy walk: a 2.0 s cycle at 3.0 yd/s, left heel strike at 0.0, right
    at 1.0. Each foot plants for 60 percent of the cycle and slides back at the
    walking speed; the pelvis drops on each strike and rolls over the planted foot."""
    st = stance(rig)
    period, stance_frac = WALK_PERIOD, 0.6
    half = WALK_SPEED * stance_frac * period / 2
    kw = {}
    ph0 = (t / period) % 1.0
    for s, key, off in ((1, 'l', 0.0), (-1, 'r', 0.5)):
        ph = (ph0 - off) % 1.0
        rest = ANK[s]
        if ph < stance_frac:
            u = ph / stance_frac
            y = rest[1] - half + 2 * half * u
            pitch = -8.0 * (1 - smooth(u / 0.12)) + 16.0 * smooth((u - 0.8) / 0.2)
            z = rest[2] + (1.38 if pitch > 0 else 0.9) * math.sin(math.radians(abs(pitch)))
        else:
            u = (ph - stance_frac) / (1 - stance_frac)
            e = smooth(u)
            y = rest[1] + half - 2 * half * e
            z = rest[2] + 0.75 * math.sin(math.pi * u) ** 1.3
            pitch = 16.0 * (1 - smooth(u * 1.6)) - 8.0 * smooth((u - 0.5) / 0.5)
            z += (1.38 if pitch > 0 else 0.9) * math.sin(math.radians(abs(pitch)))
        kw['foot_' + key] = (rest[0] * 1.0, y, z)
        kw['fpitch_' + key] = pitch
    w = 2 * math.pi * ph0
    drop = 0.16 * (0.5 + 0.5 * math.cos(2 * w - 0.5))   # lowest just after each strike
    sway = 0.2 * math.cos(w - 0.3)                     # over the planted foot (left at 0)
    b = st.but(**kw)
    b = b.add(pelvis=(sway, 0.0, -0.08 - drop), hip_roll=-5.0 * math.cos(w - 0.3), hip_twist=7.0 * math.sin(w),
              twist=-9.0 * math.sin(w), lean=2.0 + 1.5 * math.cos(2 * w), side=3.0 * math.cos(w - 0.3),
              look=(5.0 * math.sin(w), 0.0), head_roll=2.0 * math.cos(w),
              hang_l=(0.0, -0.95 * math.sin(w), 0.25 * max(0, -math.sin(w))),
              hang_r=(0.0, 0.95 * math.sin(w), 0.25 * max(0, math.sin(w))),
              clav_l=2.0 * math.sin(w), clav_r=-2.0 * math.sin(w))
    return b.but(moor=0.0)


def walk(rig):
    n = int(round(WALK_PERIOD * R.FPS))
    out, memory = [], {}
    for _ in range(2):
        out, mem2 = [], memory
        for f in range(n + 1):
            t = f / R.FPS
            out.append((t, walk_body(rig, t).solve(mem2), 'linear'))
    return out


def slam(rig):
    st = stance(rig)
    wind = st.but(pelvis=(0.15, 0.25, -0.45), lean=-9.0, twist=-16.0, side=4.0, look=(-6.0, 12.0), clav_r=20.0,
                  reach_r=(-2.15, 1.1, 11.4), reach_wr=1.0, pole_r=(-1.0, 0.4, 0.0), hang_l=(0.9, 0.5, 0.9),
                  wrist_r=-10.0, claw=0.6)
    top = wind.but(reach_r=(-2.05, 1.45, 11.7), lean=-11.0, twist=-19.0, clav_r=23.0)
    hit = st.but(pelvis=(-0.2, -0.25, -1.05), lean=36.0, twist=14.0, side=-4.0, look=(-8.0, -26.0), clav_r=-6.0,
                 reach_r=(-2.55, -3.6, 1.78), reach_wr=1.0, pole_r=(-1.0, 0.4, 0.0), hang_l=(0.7, 0.9, 0.7),
                 wrist_r=-30.0, claw=0.8)
    rec = hit.but(reach_r=(-2.55, -3.5, 2.05), pelvis=(-0.2, -0.2, -0.95), lean=33.0)
    st = st.but(pole_r=(-1.0, 0.4, 0.0))
    # the fist swings out and round the shoulder on its way up (a straight path would
    # fold the arm through its own shoulder)
    out1 = st.but(reach_r=(-4.0, -1.7, 5.4), reach_wr=1.0, twist=-6.0, clav_r=8.0, pelvis=(0.05, 0.15, -0.4))
    out2 = wind.but(reach_r=(-5.0, -0.5, 8.7), lean=-4.0, twist=-12.0, clav_r=14.0)
    # the arm stays long through the whole arc (a folded arm flips its elbow as the
    # fist passes over the shoulder)
    wind = wind.but(reach_r=(-3.3, 1.7, 12.5))
    top = top.but(reach_r=(-3.2, 2.1, 12.9))
    over = top.but(lean=-2.0, twist=-10.0, clav_r=18.0, reach_r=(-3.35, -2.1, 12.2), look=(-6.0, 2.0))
    seq = [(0.0, st, 'inout'), (0.4, out1, 'auto'), (0.7, out2, 'auto'), (0.98, wind, 'auto'), (1.55, top, 'linear'), (1.7, top, 'quadin'), (1.81, over, 'linear'),
           (1.88, hit.but(pelvis=(-0.05, 0.0, -0.7), lean=14.0, twist=0.0, look=(-6.0, -8.0), clav_r=10.0,
                          reach_r=(-3.3, -4.7, 8.5)), 'linear'),
           (2.0, hit, 'out'), (2.1, rec, 'inout'), (2.4, hit.but(reach_r=(-2.55, -3.55, 1.85)), 'inout'),
           (3.2, st, 'inout')]

    def mod(x, t):
        tr = tremor(t, 1.0) if 1.0 < t < 1.72 else 0.0
        sh = jolt(t, 2.0, 0.09)
        return x.add(lean=0.4 * tr - 2.0 * sh, clav_r=0.8 * tr, look=(0, 5 * sh), eye=0.0).but(
            eye=1.0 + 0.4 * smooth((t - 0.9) / 0.6) * (1 - smooth((t - 2.1) / 0.5)))
    return keys_of(seq, mod=mod)


def piston_sweep(rig):
    st = stance(rig)
    cock = st.but(pelvis=(0.1, 0.1, -0.45), lean=4.0, twist=36.0, side=-3.0, look=(16.0, -2.0), clav_l=12.0,
                  reach_l=(4.25, 1.6, 6.0), reach_wl=1.0, pole_l=(0.7, 0.8, 0.0), claw=1.0, hang_r=(-0.6, -0.6, 0.6))
    held = cock.but(twist=39.0, reach_l=(4.3, 1.85, 6.2))
    mid = st.but(pelvis=(-0.1, -0.2, -0.6), lean=14.0, twist=-8.0, look=(0.0, -6.0), clav_l=4.0,
                 reach_l=(0.45, -4.1, 4.6), reach_wl=1.0, pole_l=(0.7, 0.8, 0.0), claw=0.85, hang_r=(-0.8, 0.5, 0.5))
    thru = mid.but(pelvis=(-0.25, -0.1, -0.55), twist=-34.0, lean=10.0, look=(-14.0, -4.0),
                   reach_l=(-2.9, -3.0, 4.9), pole_l=(0.7, 0.8, 0.0), claw=0.6)
    st = st.but(pole_l=(0.7, 0.8, 0.0))
    arc = cock.but(pelvis=(0.0, -0.05, -0.55), twist=16.0, lean=10.0, look=(8.0, -4.0), reach_l=(3.7, -2.9, 5.1))
    seq = [(0.0, st, 'inout'), (0.9, cock, 'inout'), (1.22, held, 'quadin'), (1.38, arc, 'linear'), (1.5, mid, 'linear'), (1.72, thru, 'out'),
           (2.05, thru.add(twist=3.0), 'inout'), (2.9, st, 'inout')]

    def mod(x, t):
        tr = tremor(t, 1.0) if 0.85 < t < 1.25 else 0.0
        return x.add(twist=0.6 * tr, clav_l=0.6 * tr)
    return keys_of(seq, mod=mod)


def tremor_step(rig):
    st = stance(rig).but(moor=0.0)
    shift = st.but(pelvis=(-0.38, 0.05, -0.36), hip_roll=-6.0, side=-4.0)
    lift = shift.but(foot_l=(1.75, -0.55, 2.75), fpitch_l=12.0, knee_l=(0.3, -1.0, 0.3), lean=-4.0, look=(0.0, 6.0),
                     hang_l=(0.9, -0.2, 0.8), hang_r=(-0.9, -0.2, 0.8), clav_l=6.0, clav_r=6.0, claw=0.8)
    peak = lift.but(foot_l=(1.75, -0.6, 2.95), lean=-6.0)
    down = st.but(pelvis=(-0.15, -0.05, -0.85), lean=15.0, look=(0.0, -12.0), hang_l=(0.5, -0.5, -0.3),
                  hang_r=(-0.5, -0.5, -0.3), clav_l=-6.0, clav_r=-6.0, claw=0.3)
    seq = [(0.0, st, 'inout'), (0.45, shift, 'inout'), (1.12, lift, 'linear'), (1.3, peak, 'in'),
           (1.5, down, 'out'), (1.62, down.add(pelvis=(0, 0, 0.1), lean=-2.0), 'inout'),
           (1.8, down.add(pelvis=(0, 0, 0.02)), 'inout'), (2.7, st, 'inout')]

    def mod(x, t):
        j = jolt(t, 1.5, 0.08)
        return x.add(head_roll=5 * j, look=(0, -6 * j), clav_l=-4 * j, clav_r=-4 * j)
    return keys_of(seq, mod=mod)


def hatch_open_pose(rig):
    st = stance(rig)
    return st.but(pelvis=(0.0, 0.2, -0.45), lean=-10.0, look=(0.0, 14.0), neck=-6.0, hatch=1.0, core=1.0,
                  hang_l=(1.0, 0.5, 1.1), hang_r=(-1.0, 0.5, 1.1), clav_l=10.0, clav_r=10.0, claw=0.7, eye=1.2)


def hatch_open(rig):
    st = stance(rig)
    op = hatch_open_pose(rig)
    seq = [(0.0, st, 'inout'), (0.95, st.add(lean=2.0, clav_l=2.0, clav_r=2.0), 'in'),
           (1.25, op.but(hatch=0.92), 'backout'), (1.5, op, 'inout'), (2.4, op.add(lean=-1.0), 'inout')]

    def mod(x, t):
        r = 0.0
        if t < 1.0:
            r = 6.0 * smooth(t / 0.4) * math.sin(2 * math.pi * 11.0 * t)
        c = x.p['core'] * flicker(t, 1.1, 2.4, 5)
        return x.add(rattle=r, lean=0.4 * tremor(t, 1.0 if t < 1.0 else 0.4)).but(core=c)
    return keys_of(seq, mod=mod)


def hatch_held(rig):
    op = hatch_open_pose(rig)
    seq = [(0.0, op, 'auto'), (1.0, op.add(lean=-1.5, pelvis=(0, 0, 0.05)), 'auto'), (2.0, op, 'auto')]

    def mod(x, t):
        return x.add(lean=0.3 * tremor(t)).but(core=flicker(t, -1, 9, 7) * 1.0, eye=1.2 + 0.15 * math.sin(t * 9))
    return keys_of(seq, loop=True, mod=mod)


def hatch_close(rig):
    st = stance(rig)
    op = hatch_open_pose(rig)
    seq = [(0.0, op, 'in'), (0.35, op.but(hatch=0.0, rattle=-3.0, core=0.0), 'backout'),
           (0.55, op.but(hatch=0.0, rattle=2.0, core=0.0, lean=-4.0, look=(0.0, 8.0)), 'inout'), (1.3, st, 'inout')]
    return keys_of(seq)


def overload(rig):
    op = hatch_open_pose(rig)
    spasm = op.but(lean=-17.0, twist=6.0, look=(4.0, 26.0), hang_l=(1.6, 0.4, 2.0), hang_r=(-1.6, 0.4, 2.0),
                   claw=1.0, eye=1.9, core=2.2, clav_l=16.0, clav_r=16.0)
    sag = op.but(pelvis=(0.05, 0.35, -1.15), lean=24.0, twist=-4.0, side=5.0, look=(-6.0, -26.0), neck=10.0,
                 head_roll=-8.0, hang_l=(0.35, -0.6, 0.5), hang_r=(-0.35, -0.6, 0.2), clav_l=-8.0, clav_r=-8.0,
                 claw=0.2, eye=0.5, core=1.1)
    seq = [(0.0, op, 'out'), (0.12, spasm, 'linear'), (0.22, spasm.add(lean=12.0, twist=-12.0), 'linear'),
           (0.34, spasm.add(lean=3.0, twist=8.0), 'linear'), (0.48, spasm.add(lean=10.0, twist=-6.0), 'linear'),
           (0.66, spasm.add(lean=6.0, twist=3.0), 'inout'), (1.2, sag.add(pelvis=(0, 0, 0.35), lean=-6.0), 'in'),
           (1.55, sag, 'backout'), (2.4, sag.add(lean=2.0), 'inout'), (3.6, sag.add(lean=3.0), 'inout')]

    def mod(x, t):
        j = jolt(t, 2.2, 0.1) + jolt(t, 3.05, 0.1)
        e = x.p['eye'] * flicker(t, 0.1, 3.6, 9)
        c = x.p['core'] * flicker(t, 0.0, 3.6, 4)
        return x.add(lean=-4 * j + 0.4 * tremor(t), clav_l=5 * j, claw=0.4 * j).but(eye=e, core=c)
    return keys_of(seq, mod=mod)


def unbolt(rig):
    st = stance(rig)
    s1 = st.but(pelvis=(0.12, 0.05, -0.55), lean=14.0, twist=12.0, side=-3.0, look=(8.0, -6.0), clav_l=10.0,
                clav_r=10.0, hang_l=(0.6, -0.8, 1.2), hang_r=(-0.6, -0.8, 1.2), claw=0.0,
                foot_l=tuple(ANK[1] + (0, 0, 0.06)))
    s2 = st.but(pelvis=(-0.12, 0.05, -0.55), lean=14.0, twist=-12.0, side=3.0, look=(-8.0, -6.0), clav_l=10.0,
                clav_r=10.0, hang_l=(0.6, -0.8, 1.2), hang_r=(-0.6, -0.8, 1.2), foot_r=tuple(ANK[-1] + (0, 0, 0.06)))
    roar = st.but(pelvis=(0.0, 0.25, -0.5), lean=-12.0, look=(0.0, 18.0), neck=-8.0, clav_l=16.0, clav_r=16.0,
                  hang_l=(1.5, 0.3, 2.0), hang_r=(-1.5, 0.3, 2.0), claw=1.0, eye=1.5)
    tearl = roar.but(pelvis=(-0.15, -0.1, -0.35), lean=8.0, look=(0.0, 4.0), foot_l=(1.75, -0.35, 1.85),
                     fpitch_l=8.0, knee_l=(0.3, -1.0, 0.3), hang_l=(0.9, -0.5, 0.8), hang_r=(-0.9, -0.5, 0.8))
    lurch = tearl.but(pelvis=(-0.1, -0.45, -0.55), lean=21.0, foot_r=tuple(ANK[-1] + (0, 0, 0.22)), fpitch_r=6.0,
                      look=(0.0, -4.0), eye=1.2)
    seq = [(0.0, st, 'inout'), (0.55, s1, 'inout'), (1.15, s2, 'inout'), (1.8, roar, 'inout'), (2.3, roar.add(lean=-2.0), 'in'),
           (2.45, tearl, 'out'), (2.62, lurch, 'out'), (2.78, lurch.add(pelvis=(0, 0, 0.05)), 'in'),
           (3.0, st.but(pelvis=(0.0, -0.2, -0.7), lean=15.0, look=(0.0, -6.0)), 'backout'), (3.9, st, 'inout')]

    def mod(x, t):
        tr = tremor(t, 1.4) if t < 2.4 else tremor(t, 0.4)
        j = jolt(t, 2.42, 0.08) + jolt(t, 2.52, 0.08) + 1.3 * jolt(t, 2.7, 0.1) + jolt(t, 3.0, 0.08)
        return x.add(lean=0.5 * tr - 3 * j, twist=0.4 * tr, clav_l=4 * j, clav_r=4 * j)
    return keys_of(seq, mod=mod)


def hit(rig):
    st = stance(rig)
    back = st.add(pelvis=(0, 0.12, 0.05), lean=-8.0, twist=5.0, look=(3.0, 10.0), clav_l=5.0, clav_r=5.0,
                  hang_l=(0.3, 0.5, 0.3), hang_r=(-0.3, 0.5, 0.3)).but(eye=1.5)
    fwd = st.add(pelvis=(0, -0.05, -0.08), lean=5.0, twist=-2.0, look=(0, -5.0))
    seq = [(0.0, st, 'out'), (0.08, back, 'out'), (0.3, fwd, 'inout'), (0.8, st, 'inout')]
    return keys_of(seq)


def death(rig):
    st = stance(rig).but(moor=0.0)
    sag = st.but(pelvis=(0.0, 0.1, -0.7), lean=14.0, look=(4.0, -16.0), neck=8.0, hang_l=(0.3, -0.2, -0.1),
                 hang_r=(-0.3, -0.2, -0.1))
    # its legs give way: it drops onto its haunches between its own planted feet,
    # knees splayed forward, and slumps over them
    kneel = sag.but(pelvis=(0.0, 0.6, -2.05), lean=16.0, knee_l=(0.75, -1.0, 0.1), knee_r=(-0.75, -1.0, 0.1),
                    look=(0.0, -10.0), reach_l=(3.55, -1.3, 2.05), reach_r=(-3.55, -1.3, 2.15), reach_wl=1.0,
                    reach_wr=1.0)
    slump = kneel.but(pelvis=(0.0, 0.55, -2.15), lean=38.0, twist=-5.0, side=-4.0, look=(-5.0, -30.0), neck=16.0,
                      head_roll=-10.0, reach_l=(3.2, -2.9, 1.95), reach_r=(-3.2, -2.9, 2.05), reach_wl=1.0,
                      reach_wr=1.0, claw=0.0, clav_l=-8.0, clav_r=-8.0)
    final = slump.but(lean=43.0, look=(-8.0, -42.0), neck=20.0, head_roll=-14.0, hatch=1.0, eye=0.0)
    seq = [(0.0, st, 'inout'), (0.35, st.add(lean=-4.0, look=(0, 8)).but(eye=1.6), 'inout'), (1.0, sag, 'inout'),
           (1.35, sag.add(pelvis=(0, 0, 0.08)).but(reach_l=(3.6, -0.8, 2.6), reach_r=(-3.6, -0.8, 2.6), reach_wl=1.0,
                                                    reach_wr=1.0), 'in'), (2.1, kneel, 'out'),
           (2.22, kneel.add(pelvis=(0, 0, 0.1), lean=-3.0), 'inout'), (2.5, slump.but(eye=0.9), 'out'),
           (2.9, slump.but(eye=0.7, look=(-5.0, -38.0)), 'inout'), (3.05, final.but(hatch=0.0, eye=0.6), 'backout'),
           (3.35, final.but(eye=0.35), 'inout'), (3.7, final, 'inout'), (5.2, final.add(lean=1.0), 'inout')]

    def mod(x, t):
        e = x.p['eye'] * flicker(t, 0.3, 1.0, 2) * flicker(t, 3.1, 3.7, 6)
        j = jolt(t, 0.3, 0.1) + 0.7 * jolt(t, 3.25, 0.1)
        return x.add(clav_l=4 * j, look=(0, 4 * j)).but(eye=e)
    seqk = keys_of(seq, mod=mod)
    # the hatch falls open at 3.05 s: swing with a bounce
    return seqk


CATALOG = [
    # name, fn, loop, moorings
    ('Idle', idle, True, {}),
    ('Wake', wake, False, {}),
    ('Walk', walk, True, {'hidden': True}),
    ('Slam', slam, False, {}),
    ('Piston_Sweep', piston_sweep, False, {}),
    ('Tremor_Step', tremor_step, False, {'hidden': True}),
    ('Hatch_Open', hatch_open, False, {}),
    ('Hatch_Held', hatch_held, True, {}),
    ('Hatch_Close', hatch_close, False, {}),
    ('Overload', overload, False, {}),
    ('Unbolt', unbolt, False, {'cable_tear': 2.7, 'burst': {'L': 2.42, 'R': 2.52}}),
    ('Hit', hit, False, {}),
    ('Death', death, False, {'hidden': True}),
]

# contact frames (seconds) the game should fire effects on
CONTACTS = {
    'Idle': {'twitch_head': 1.45, 'twitch_claw': 2.9},
    'Wake': {'surge': 0.62, 'eye_ignites': 0.95, 'standing': 2.6, 'flex_peak': 3.1},
    'Walk': {'left_foot': 0.0, 'right_foot': 1.0},
    'Slam': {'windup_top': 1.55, 'fist_impact': 2.0},
    'Piston_Sweep': {'release': 1.22, 'cone_center': 1.5, 'follow_through': 1.72},
    'Tremor_Step': {'foot_peak': 1.3, 'stomp': 1.5},
    'Hatch_Open': {'shudder_start': 0.0, 'leaves_open': 1.25, 'fully_open': 1.5},
    'Hatch_Close': {'leaves_shut': 0.35},
    'Overload': {'discharge': 0.12, 'stagger': 1.55},
    'Unbolt': {'left_bolts_shear': 2.42, 'right_bolts_shear': 2.52, 'cables_rip': 2.7, 'foot_stamp': 3.0},
    'Hit': {'impact': 0.08},
    'Death': {'haunches_drop': 2.1, 'fists_hit': 2.5, 'hatch_falls_open': 3.05, 'eye_dies': 3.7},
}


def make_clips(arm, only=None):
    rig = R.Rig(arm)
    made = []
    for name, fn, loop, moor in CATALOG:
        if only and name not in only:
            continue
        keys = fn(rig)
        act = R.make_clip(arm, name, keys, skip=A.SOLVED)
        R.solve_mechanics(arm, act, loop=loop, moor=moor)
        act['duration'] = keys[-1][0]
        act['loop'] = loop
        made.append(name)
    return made
