"""The shared humanoid automaton frame for the Stormbrass Foundry's walking
machines (brass_sentry.py, shieldbearer.py, half_built_frame.py,
steam_bruiser.py): one bone layout fed from a joint table, one pose solver
(arms and legs on two-bone IK, the torso and head aimed, the whole body turned
by `yaw` and `tilt`), and the brass-and-iron limb pieces they share.

Conventions are foundry_kit.py's: yards, +Z up, facing -Y, `.L` mirrored onto
`.R` (the creature's right is -x).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, GLOW, IRON, IRON_D, IRON_HI, METAL, STEEL,
    MachineRig, Matrix, Vector, basis, expand_bones, lerp,
)


def M(v, s):
    v = Vector(v)
    return Vector((s * v.x, v.y, v.z))


def frame_bones(J, extra=()):
    """Bones from a joint table (the .L side of each pair given)."""
    hips = Vector(J['hips'])
    return expand_bones([
        ('Root', None, (0, 0, 0), (0, 0, 0.3)),
        ('Hips', 'Root', tuple(hips), tuple(hips + Vector((0, 0, 0.25)))),
        ('Spine', 'Hips', tuple(hips + Vector((0, 0, 0.12))), J['spine_top']),
        ('Chest', 'Spine', J['spine_top'], J['chest_top']),
        ('Head', 'Chest', J['head'], J['head_top']),
        ('Arm.L', 'Chest', J['shoulder'], J['elbow']),
        ('Fore.L', 'Arm.L', J['elbow'], J['wrist']),
        ('Hand.L', 'Fore.L', J['wrist'], J['hand']),
        ('Thigh.L', 'Hips', J['hip'], J['knee']),
        ('Shin.L', 'Thigh.L', J['knee'], J['ankle']),
        ('Foot.L', 'Shin.L', J['ankle'], J['toe']),
    ] + list(extra))


class Poser:
    """The shared pose: `stance(**kw)` -> a MachineRig pose. Hands and extra IK
    targets are in the body frame (root + yaw + tilt); the feet stay planted."""

    def __init__(self, arm, bones, rest, defaults):
        self.rig = MachineRig(bones).attach(arm)
        self.rest = rest
        self.d = defaults
        self.head_rest = (rest['Head'][1] - rest['Head'][0]).normalized()

    def __call__(self, root=(0, 0, 0), yaw=0.0, tilt=0.0, lean=0.0, side=0.0, twist=0.0, look=(0.0, 0.0),
                 wrist_l=None, wrist_r=None, hand_l=None, hand_r=None, foot_l=None, foot_r=None,
                 aims=None, turns=None, slides=None, scales=None, ik=None, pole_l=None, pole_r=None):
        d = self.d
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'X')
        rootv = Vector(root)

        def R(v):
            return rm @ Vector(v)

        def body(v):
            return tuple(rootv + R(v))

        a = {
            'Spine': tuple(R((side * 0.3, -0.04 - lean * 0.5, 1.0))),
            'Chest': tuple(R((side * 0.5, 0.03 - lean, 1.0))),
            'Head': tuple(R(self.head_rest + Vector((look[0], 0.0, look[1])))),
            'Hand.L': tuple(R(hand_l or d['hand_l'])),
            'Hand.R': tuple(R(hand_r or d['hand_r'])),
            'Foot.L': (0.0, -1.0, -0.25),
            'Foot.R': (0.0, -1.0, -0.25),
        }
        for k, v in (aims or {}).items():
            a[k] = tuple(R(v))
        t = {'Root': [('x', tilt), ('z', yaw)], 'Spine': [('z', twist * 0.4)], 'Chest': [('z', twist * 0.6)]}
        for k, v in (turns or {}).items():
            t.setdefault(k, []).extend(v)
        k_ = {
            'arm.L': ('Arm.L', 'Fore.L', body(wrist_l or d['wrist_l']), tuple(R(pole_l or (1.0, 0.8, -0.3)))),
            'arm.R': ('Arm.R', 'Fore.R', body(wrist_r or d['wrist_r']), tuple(R(pole_r or (-1.0, 0.8, -0.3)))),
            'leg.L': ('Thigh.L', 'Shin.L', foot_l or d['foot_l'], (0.25, -1.0, 0.15)),
            'leg.R': ('Thigh.R', 'Shin.R', foot_r or d['foot_r'], (-0.25, -1.0, 0.15)),
        }
        for k, (u, lo, tgt, pole) in (ik or {}).items():
            k_[k] = (u, lo, body(tgt), tuple(R(pole)))
        return self.rig.pose(aims=a, ik=k_, turns=t, root=root, scales=scales or {}, slides=slides or {})


# ------------------------------------------------------------------ shared pieces
def joint(p, c, r, color=IRON_HI, cap=BRASS, axis=(1, 0, 0)):
    """A ball joint in a riveted collar."""
    c = Vector(c)
    p.blob(tuple(c), (r * 2, r * 2, r * 2), color, segments=14, rings=10, mat=METAL)
    p.ring(c, axis, r * 0.98, r * 0.18, cap, sides=18)


def plated_limb(p, a, b, r0, r1, color=BRASS, core=IRON, s=1, plates=2, rivet=0.02, ribbed=False):
    """A limb segment: an iron core, riveted brass plates over its front and outer
    side, a collar ring at each end."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    L = (b - a).length
    p.cyl(a, b, r0 * 0.72, core, sides=12, r2=r1 * 0.72)
    fr = basis(d, (s * 0.6, -1.0, 0.2))
    for k in range(plates):
        t0 = 0.08 + 0.84 * k / plates
        t1 = 0.08 + 0.84 * (k + 1) / plates - 0.04
        c = a.lerp(b, (t0 + t1) / 2)
        r = r0 + (r1 - r0) * (t0 + t1) / 2
        p.obox(tuple(c), (r * 1.8, r * 1.75, L * (t1 - t0)), fr, color, mat=METAL, bevel=r * 0.18, taper=0.94)
        if rivet:
            for u in (-1, 1):
                for v in (-1, 1):
                    q = c + fr.col[0] * u * r * 0.68 + fr.col[2] * v * L * (t1 - t0) * 0.38 + fr.col[1] * r * 0.88
                    p.rivets([q], rivet, BRASS_D, normal=tuple(fr.col[1]))
    if ribbed:
        for k in range(5):
            p.ring(a.lerp(b, 0.15 + 0.17 * k), d, r0 * 0.78, r0 * 0.06, IRON_D, sides=14)
    p.ring(a.lerp(b, 0.04), d, r0 * 0.92, r0 * 0.12, BRASS_D, sides=16)
    p.ring(a.lerp(b, 0.96), d, r1 * 0.92, r1 * 0.12, BRASS_D, sides=16)


def iron_foot(p, ankle, toe, w, color=IRON, trim=BRASS_D):
    """A heavy wedge foot: a riveted iron sabaton with a brass toe cap and a sole."""
    ankle, toe = Vector(ankle), Vector(toe)
    fwd = Vector((toe.x - ankle.x, toe.y - ankle.y, 0)).normalized()
    heel = Vector((ankle.x, ankle.y, 0)) - fwd * w * 0.45
    tip = Vector((toe.x, toe.y, 0)) + fwd * w * 0.2
    mid = heel.lerp(tip, 0.5)
    fr = basis(fwd, (0, 0, 1))
    L = (tip - heel).length
    p.obox(tuple(mid + Vector((0, 0, w * 0.32))), (w * 1.05, w * 0.62, L), fr, color, mat=METAL, bevel=w * 0.08,
           taper=0.9)
    p.obox(tuple(mid + Vector((0, 0, w * 0.05))), (w * 1.15, w * 0.12, L * 1.04), fr, BLACK, bevel=w * 0.03)
    p.obox(tuple(tip - fwd * w * 0.22 + Vector((0, 0, w * 0.32))), (w * 1.08, w * 0.58, w * 0.42), fr, trim, mat=METAL,
           bevel=w * 0.1)
    p.cyl(Vector((ankle.x, ankle.y, w * 0.55)), ankle + Vector((0, 0, 0.04)), w * 0.4, color, sides=12)
    p.rivet_line(heel + Vector((0, 0, w * 0.55)) + fr.col[0] * w * 0.52, tip + Vector((0, 0, w * 0.5))
                 + fr.col[0] * w * 0.5 - fwd * w * 0.4, 4, w * 0.05, BRASS_D, normal=tuple(fr.col[0]))
    p.rivet_line(heel + Vector((0, 0, w * 0.55)) - fr.col[0] * w * 0.52, tip + Vector((0, 0, w * 0.5))
                 - fr.col[0] * w * 0.5 - fwd * w * 0.4, 4, w * 0.05, BRASS_D, normal=tuple(-fr.col[0]))


def claw_fist(p, wrist, tip, r, s, color=IRON_HI, knuckle=BRASS):
    """A clenched three-finger iron fist with a thumb, brass knuckle caps."""
    wrist, tip = Vector(wrist), Vector(tip)
    d = (tip - wrist).normalized()
    fr = basis(d, (0, -1, 0))
    c = wrist.lerp(tip, 0.45)
    p.obox(tuple(c), (r * 1.7, r * 1.3, r * 1.5), fr, color, mat=METAL, bevel=r * 0.2)
    for k in range(3):
        x = (k - 1) * r * 0.55
        kc = c + d * r * 0.7 + fr.col[0] * x + fr.col[1] * r * 0.35
        p.blob(tuple(kc), (r * 0.55, r * 0.6, r * 0.55), knuckle, segments=10, rings=6, mat=METAL)
        p.obox(tuple(kc - fr.col[1] * r * 0.45 - d * r * 0.1), (r * 0.42, r * 0.5, r * 0.5), fr, IRON, mat=METAL,
               bevel=r * 0.08)
    th = c + fr.col[0] * (-s) * r * 0.85 + fr.col[1] * r * 0.2
    p.blob(tuple(th), (r * 0.45, r * 0.6, r * 0.8), knuckle, segments=10, rings=6, mat=METAL)


def glow_core(p, center, normal, r, bezel=BRASS):
    """A riveted porthole with the storm's light inside it (lightning glass)."""
    c = Vector(center)
    n = Vector(normal).normalized()
    p.disc(tuple(c - n * r * 0.15), tuple(n), r * 1.18, r * 0.3, lerp(bezel, IRON, 0.3), sides=24)
    p.ring(c + n * r * 0.05, n, r * 1.02, r * 0.14, bezel, sides=26)
    p.rivet_circle(c + n * r * 0.08, n, r * 1.04, 10, r * 0.07, BRASS_D)
    p.blob(tuple(c), (r * 1.85, r * 1.85, r * 0.7), ARC, segments=18, rings=10, mat=GLOW,
           rot=n.to_track_quat('Z', 'Y').to_euler())
    p.blob(tuple(c + n * r * 0.18), (r * 0.8, r * 0.8, r * 0.35), ARC_HOT, segments=12, rings=6, mat=GLOW,
           rot=n.to_track_quat('Z', 'Y').to_euler())
    f = basis(n)
    for k in range(4):   # the cage bars over the glass
        a = math.pi * k / 4
        dd = f.col[0] * math.cos(a) + f.col[1] * math.sin(a)
        p.cyl(c + n * r * 0.3 - dd * r, c + n * r * 0.3 + dd * r, r * 0.05, IRON_D, sides=6)


def steam_vent(p, center, normal, r, color=COPPER):
    """A flared steam vent nozzle with a louvre grille."""
    c = Vector(center)
    n = Vector(normal).normalized()
    p.cyl(c - n * r * 0.6, c + n * r * 0.5, r * 0.7, color, sides=14, r2=r)
    p.ring(c + n * r * 0.5, n, r, r * 0.12, BRASS_D, sides=16)
    p.disc(tuple(c + n * r * 0.45), tuple(n), r * 0.85, r * 0.06, BLACK, sides=14)
    f = basis(n)
    for k in range(3):
        o = (k - 1) * r * 0.5
        p.obox(tuple(c + n * r * 0.5 + f.col[1] * o), (r * 1.6, r * 0.08, r * 0.08), f, IRON_D, mat=METAL)


__all__ = [n for n in dir() if not n.startswith('__')]
