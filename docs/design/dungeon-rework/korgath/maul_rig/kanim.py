"""Korgath the Bound: the two-handed maul blows, authored on a control rig.

The maul is the master: every key gives the maul's pose in the world (a point
on the haft, the haft's direction toward the head, the striking face's
direction), and the hands follow it by IK every frame, locked to the haft in a
real grip:

- right hand: 'carry' is the grip the body is modeled with (the head on the
  little-finger side, the fist sliding along the haft by s); 'flip' is the
  same fist turned end for end on the round haft (the head on the thumb side,
  the grip a two-handed blow needs); 'free' lets go.
- left hand: 'grip' closes the new finger bones round the haft (the fist
  solved in fist_solve2.py), thumb toward the head; 'free' is its Idle hand.

Body: hips offset and turn, spine/chest/neck/head/clavicle bends as world-axis
rotations about each joint, layered on Idle's first frame; the legs are
two-bone IK onto planted feet; the arms are two-bone IK with an elbow pole and
half the wrist's roll handed to the forearm. Every frame is baked to plain FK
keys (rotation + location per bone) for export.
"""
import os
import bpy, math, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, '..', '..', '..', '..', '..', 'tmp', 'korgath_aaa')

FPS = 30
LEFT_GRIP = os.path.join(HERE, 'left_grip.json')
FINGER_BONES = [f'{f}.{i}.l' for f in ('index', 'middle', 'ring', 'pinky', 'thumb') for i in (1, 2, 3)]
HEAD_Y = 1.28  # the maul head's centre on the haft (hammer bone units)
POMMEL_Y = -0.2


# ---------------------------------------------------------------- math helpers

def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


EASE = {
    'lin': lambda t: t,
    'io': smooth,
    'in': lambda t: t ** 2.2,                      # accelerate (a strike)
    'in3': lambda t: t ** 3.0,
    'out': lambda t: 1 - (1 - t) ** 2.2,           # decelerate (a rise)
    'out3': lambda t: 1 - (1 - t) ** 3.0,
    'hold': lambda t: 0.0,
}


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def rot_about(piv, R3):
    return Matrix.Translation(piv) @ R3.to_4x4() @ Matrix.Translation(-piv)


def euler_deg(e):
    return Matrix.Rotation(math.radians(e[2]), 3, 'Z') @ Matrix.Rotation(math.radians(e[1]), 3, 'Y') @ Matrix.Rotation(math.radians(e[0]), 3, 'X')


def frame_from(y, x_hint):
    y = y.normalized()
    x = (x_hint - y * x_hint.dot(y)).normalized()
    z = x.cross(y)
    M = Matrix((x, y, z)).transposed()
    return M


def rot_between(a, b):
    return a.normalized().rotation_difference(b.normalized()).to_matrix()


# ------------------------------------------------------------------ the rig

class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.W = arm.matrix_world.copy()
        self.Wi = self.W.inverted()
        self.S = self.W.to_scale()[0]
        self.bones = [b.name for b in arm.data.bones]
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.children = {n: [] for n in self.bones}
        for n, p in self.parent.items():
            if p: self.children[p].append(n)
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        # Idle frame 0 in world space
        act = bpy.data.actions['Idle']
        self.use(act)
        bpy.context.scene.frame_set(0)
        self.P0 = {n: self.W @ arm.pose.bones[n].matrix for n in self.bones}
        self.idle_basis = {n: arm.pose.bones[n].matrix_basis.copy() for n in self.bones}
        hand = self.P0['hand.r']; ham = self.P0['hammer']
        self.G_idle = hand.inverted() @ ham          # the carry grip at Idle (s = 0.42)
        self.rel_rest_hammer = self.rest['hand.r'].inverted() @ self.rest['hammer']
        g = json.load(open(LEFT_GRIP))
        self.lg = g
        C = Vector((0.0, g['haft']['y'], g['haft']['z']))
        # left fist haft frame in hand.l space: haft +Y (toward the head) = +X_l (thumb side)
        self.K_thumb_head = Matrix.Translation(C) @ Matrix.Rotation(math.radians(-90), 4, 'Z')
        self.K_thumb_pommel = Matrix.Translation(C) @ Matrix.Rotation(math.radians(90), 4, 'Z')
        # fingers.r curl axis (the clip's curl direction) for opening the fist
        q = self.idle_basis['fingers.r'].to_quaternion()
        self.fr_axis = q.axis.copy() if q.angle > 1e-3 else Vector((1, 0, 0))
        self.fl_idle = self.idle_basis['fingers.l'].copy()
        self.idle_pole = {}
        for sd, legs in (('r', ('upperarm.r', 'lowerarm.r', 'hand.r')), ('l', ('upperarm.l', 'lowerarm.l', 'hand.l'))):
            S0, E0, T0 = (self.P0[b].translation for b in legs)
            d = (T0 - S0).normalized()
            self.idle_pole[sd] = ((E0 - S0) - d * (E0 - S0).dot(d)).normalized()
        self.idle_knee = {}
        for sd in ('l', 'r'):
            S0, E0, T0 = (self.P0[b + '.' + sd].translation for b in ('upperleg', 'lowerleg', 'foot'))
            d = (T0 - S0).normalized()
            self.idle_knee[sd] = ((E0 - S0) - d * (E0 - S0).dot(d)).normalized()

    def use(self, act):
        ad = self.arm.animation_data or self.arm.animation_data_create()
        ad.action = act
        if act.slots and (ad.action_slot is None or ad.action_slot not in list(act.slots)):
            ad.action_slot = act.slots[0]

    def subtree(self, n):
        out = [n]
        for c in self.children[n]: out += self.subtree(c)
        return out

    def rotate(self, P, bone, R3, piv=None):
        piv = P[bone].translation if piv is None else piv
        M = rot_about(piv, R3)
        for b in self.subtree(bone):
            P[b] = M @ P[b]

    def translate(self, P, bone, d):
        M = Matrix.Translation(d)
        for b in self.subtree(bone):
            P[b] = M @ P[b]

    def set_world(self, P, bone, M):
        D = M @ P[bone].inverted()
        for b in self.subtree(bone):
            P[b] = D @ P[b]

    # -- grips: hammer world <-> hand world
    def G_right(self, kind, s, phi):
        base = self.rel_rest_hammer
        if kind == 'flip':
            base = base @ Matrix.Rotation(math.pi, 4, 'X')
        return base @ Matrix.Rotation(math.radians(phi), 4, 'Y') @ Matrix.Translation((0, -s, 0))

    def hand_l_from_hammer(self, H, s, phi, thumb='head'):
        K = self.K_thumb_head if thumb == 'head' else self.K_thumb_pommel
        return H @ Matrix.Translation((0, s, 0)) @ Matrix.Rotation(math.radians(phi), 4, 'Y') @ K.inverted()

    # -- two-bone IK on joint positions (bone frames are arbitrary here)
    def ik2(self, P, a, b, c, target, pole, end_rot=None, twist_share=0.5):
        S = P[a].translation.copy(); E0 = P[b].translation.copy(); T0 = P[c].translation.copy()
        la, lb = (E0 - S).length, (T0 - E0).length
        d = target - S
        dl = min(d.length, (la + lb) * 0.9995)
        dn = d.normalized()
        # elbow position in the plane of (d, pole)
        px = (pole - dn * pole.dot(dn)).normalized()
        x = (la * la - lb * lb + dl * dl) / (2 * dl)
        h = math.sqrt(max(0.0, la * la - x * x))
        E = S + dn * x + px * h
        T = S + dn * dl
        n0 = (E0 - S).cross(T0 - E0)
        if n0.length < 1e-6:
            n0 = (E0 - S).cross(pole)
        n1 = (E - S).cross(T - E)
        F0 = frame_from(E0 - S, n0)
        F1 = frame_from(E - S, n1)
        self.rotate(P, a, F1 @ F0.transposed(), S)
        Tc = P[c].translation.copy()
        self.rotate(P, b, rot_between(Tc - E, T - E), E)
        err = (P[c].translation - target).length
        if end_rot is not None:
            # hand orientation: target, with part of its roll about the forearm given to the forearm
            fa = (T - E).normalized()
            cur = P[c].to_3x3().normalized()
            want = end_rot.to_3x3().normalized()
            rel = want @ cur.inverted()
            q = rel.to_quaternion()
            # twist of rel about the forearm axis
            pr = Vector((q.x, q.y, q.z)).project(fa)
            tw = Quaternion((q.w, pr.x, pr.y, pr.z))
            if tw.magnitude > 1e-9:
                tw.normalize()
                ang = 2 * math.atan2(Vector((tw.x, tw.y, tw.z)).dot(fa), tw.w)
                if twist_share > 0:
                    self.rotate(P, b, Matrix.Rotation(ang * twist_share, 3, fa), E)
            Mh = Matrix.Translation(P[c].translation) @ (want @ Matrix.Diagonal(P[c].to_scale()).to_3x3()).to_4x4()
            self.set_world(P, c, Mh)
        return err

    # -- world matrices -> basis keys
    def to_basis(self, P):
        M = {n: self.Wi @ P[n] for n in self.bones}
        out = {}
        for n in self.bones:
            p = self.parent[n]
            if p is None:
                out[n] = self.rest[n].inverted() @ M[n]
            else:
                rel = self.rest[p].inverted() @ self.rest[n]
                out[n] = rel.inverted() @ M[p].inverted() @ M[n]
        return out


# ------------------------------------------------------------------ the clip spec

class Track:
    """Keys {frame: value}; values interpolate with per-key eases (the ease of
    the segment that ENDS at a key) and Catmull-Rom for vectors."""
    def __init__(self, keys, ease=None, kind='vec'):
        self.f = sorted(keys)
        self.v = [keys[k] for k in self.f]
        self.ease = ease or {}
        self.kind = kind

    def at(self, fr):
        f, v = self.f, self.v
        if fr <= f[0]: return v[0]
        if fr >= f[-1]: return v[-1]
        i = max(k for k in range(len(f) - 1) if f[k] <= fr)
        t = (fr - f[i]) / (f[i + 1] - f[i])
        t = EASE[self.ease.get(f[i + 1], 'io')](t)
        if self.kind == 'quat':
            return v[i].slerp(v[i + 1], t)
        if self.kind == 'scalar':
            a = [v[max(0, i - 1)], v[i], v[i + 1], v[min(len(v) - 1, i + 2)]]
            return catmull(*a, t) if self.kind == 'scalar' else None
        p0 = v[max(0, i - 1)]; p3 = v[min(len(v) - 1, i + 2)]
        return catmull(p0, v[i], v[i + 1], p3, t)


def maul_frame(rig, P_ref, D, N, yref):
    """Hammer bone world matrix: haft point yref at P_ref (world), haft toward the
    head along D, striking face along N."""
    R = frame_from(D, N)  # columns x(face), y(haft), z
    S = rig.S
    M = Matrix.Translation(P_ref) @ (R @ Matrix.Diagonal((S, S, S))).to_4x4() @ Matrix.Translation((0, -yref, 0))
    return M
