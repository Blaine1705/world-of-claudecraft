"""The Voltaic Warden's frame: bone layout, landmarks and the reversible plate specs.

Axes: Blender armature space, yards, +Z up, the Warden faces -Y, its left is +X.
Everything is authored at final in-game size (about 9.9 yd to the crown spire,
3.8 times the 2.6-yard KayKit knight).

Bones are (name, parent, head, tail). Left-side landmarks are written once and
mirrored onto the right (x -> -x).
"""
import math

import numpy as np


def mirror(p):
    p = np.asarray(p, float)
    return np.array((-p[0], p[1], p[2]))


def nrm(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ------------------------------------------------------------------ landmarks (left side)
HIP = np.array((1.0, 0.15, 3.95))
KNEE = np.array((1.15, -0.32, 2.3))
ANKLE = np.array((1.25, 0.05, 0.92))
TOE_BASE = np.array((1.28, -0.95, 0.42))
TOE_TIP = np.array((1.3, -1.6, 0.3))
CLAV = np.array((0.55, 0.05, 7.3))
SHOULDER = np.array((2.5, 0.05, 7.12))
ELBOW = np.array((2.95, 0.38, 5.45))
WRIST = np.array((3.15, -0.12, 3.68))
KNUCKLE = np.array((3.2, -0.4, 2.92))
FING_MID = np.array((3.0, -0.48, 2.56))
FING_TIP = np.array((2.8, -0.5, 2.26))
THUMB_BASE = np.array((3.02, -0.66, 3.32))
THUMB_TIP = np.array((2.84, -0.84, 2.98))
HAND_S = 1.32               # the hammer fists: the whole hand is scaled about the wrist
KNUCKLE, FING_MID, FING_TIP, THUMB_BASE, THUMB_TIP = [WRIST + (q - WRIST) * HAND_S for q in
                                                      (KNUCKLE, FING_MID, FING_TIP, THUMB_BASE, THUMB_TIP)]

COIL_C = np.array((0.0, -1.27, 6.42))     # the glass storm coil (vertical axis)
COIL_R = 0.6
COIL_H = 1.42
HEAD_C = np.array((0.0, -1.05, 8.28))
MAST_BASE = np.array((0.0, 1.95, 7.85))
MAST_TOP = np.array((0.0, 1.95, 9.72))
CROWN_C = np.array((0.0, 1.95, 10.0))     # the toroid top-load (the Coil Crown)

BONES = [
    ('Root', None, (0, 0, 0), (0, 0, 0.8)),
    ('Hips', 'Root', (0, 0.15, 3.95), (0, 0.15, 4.65)),
    ('Waist', 'Hips', (0, 0.15, 4.65), (0, 0.15, 5.35)),
    ('Chest', 'Waist', (0, 0.15, 5.35), (0, 0.15, 7.35)),
    ('Neck', 'Chest', (0, -0.45, 7.45), (0, -0.85, 7.92)),
    ('Head', 'Neck', (0, -0.85, 7.92), (0, -0.85, 8.85)),
    ('Jaw', 'Head', (0, -0.78, 8.02), (0, -1.6, 7.72)),
    ('CoilCore', 'Chest', tuple(COIL_C - (0, 0, 0.62)), tuple(COIL_C + (0, 0, 0.62))),
    ('Mast', 'Chest', tuple(MAST_BASE), tuple(MAST_TOP)),
    ('CrownTop', 'Mast', tuple(MAST_TOP), (0, 1.95, 10.82)),
    ('HatchL', 'Chest', (0.5, 2.62, 7.55), (0.5, 2.62, 7.0)),
    ('HatchR', 'Chest', (-0.5, 2.62, 7.55), (-0.5, 2.62, 7.0)),
]
SIDE = [
    ('Clavicle', 'Chest', CLAV, SHOULDER),
    ('Pauldron', 'Clavicle', SHOULDER, SHOULDER + (0.15, 0, 0.85)),
    ('UpperArm', 'Clavicle', SHOULDER, ELBOW),
    ('Forearm', 'UpperArm', ELBOW, WRIST),
    ('Hand', 'Forearm', WRIST, KNUCKLE),
    ('Fingers1', 'Hand', KNUCKLE, FING_MID),
    ('Fingers2', 'Fingers1', FING_MID, FING_TIP),
    ('Thumb', 'Hand', THUMB_BASE, THUMB_TIP),
    ('Thigh', 'Hips', HIP, KNEE),
    ('Shin', 'Thigh', KNEE, ANKLE),
    ('Foot', 'Shin', ANKLE, TOE_BASE),
    ('Toe', 'Foot', TOE_BASE, TOE_TIP),
]

# Hydraulic pistons: (name, bone A, anchor on A, bone B, anchor on B). Two bones each:
# <name>Cyl rides A and aims at B's anchor, <name>Rod rides B and aims back at A's.
PISTONS = [
    ('PistonSh', 'Chest', (1.72, 0.78, 6.05), 'UpperArm', (2.86, 0.58, 6.35)),
    ('PistonEl', 'UpperArm', (2.55, -0.38, 6.55), 'Forearm', (2.92, -0.62, 4.85)),
    ('PistonKn', 'Thigh', (1.08, 0.72, 3.35), 'Shin', (1.2, 0.78, 1.7)),
    ('PistonWa', 'Hips', (0.92, -0.32, 4.45), 'Chest', (1.1, -0.42, 5.55)),
]


PLATE_STANDOFF = 0.16       # pivot height above the armour it rides
PLATE_RAISE = 0.62          # how far the mount pushes a plate out to clear its flip


class PlateSpec:
    """A reversible armor plate. c: rest centre of the plate; n: outward normal (the
    copper face looks along n at rest); a: the flip axis (in the plate's plane);
    hw/hh: half width (across) and half height (along the axis); parent: the body
    bone it rides; group: front or back (heroic Split Plating)."""

    def __init__(self, name, parent, s, n, a, hw, hh, group, thick=0.1):
        self.name, self.parent, self.group = name, parent, group
        self.s = np.asarray(s, float)
        self.n = nrm(n)
        self.c = self.s + self.n * PLATE_STANDOFF
        a = np.asarray(a, float)
        a = a - self.n * (a @ self.n)
        self.a = nrm(a)
        self.u = np.cross(self.a, self.n)   # across the plate
        self.hw, self.hh, self.thick = hw, hh, thick

    def mirrored(self, name, parent):
        return PlateSpec(name, parent, mirror(self.s), mirror(self.n), mirror(self.a), self.hw, self.hh, self.group,
                         self.thick)


_LEFT_PLATES = [
    PlateSpec('ChestL', 'Chest', (1.33, -1.12, 6.5), (0.484, -0.875, 0.0), (0.0, 0.0, 1.0), 0.46, 0.72, 'front',
              0.11),
    PlateSpec('ShoulderFrontL', 'Pauldron', (2.88, -0.75, 8.05), (0.184, -0.63, 0.755), (0.95, 0.0, -0.3), 0.4,
              0.5, 'front'),
    PlateSpec('ShoulderBackL', 'Pauldron', (2.88, 0.85, 8.05), (0.184, 0.63, 0.755), (0.95, 0.0, -0.3), 0.4, 0.5,
              'back'),
    PlateSpec('ForearmL', 'Forearm', (3.56, -0.19, 4.62), (0.84, -0.49, 0.233), (0.108, -0.27, -0.957), 0.38, 0.6,
              'front'),
    PlateSpec('UpperArmL', 'UpperArm', (3.12, 0.35, 6.49), (0.9, 0.318, 0.306), (0.256, 0.1875, -0.949), 0.32, 0.46,
              'back'),
    PlateSpec('BackL', 'Chest', (1.5, 1.125, 6.45), (0.562, 0.827, 0.0), (0.0, 0.0, 1.0), 0.42, 0.7, 'back', 0.11),
]
PLATES = []
for _p in _LEFT_PLATES:
    _p.hw *= 1.1
    _p.hh *= 1.1
    PLATES.append(_p)
    _parent = _p.parent if _p.parent in ('Chest',) else 'R_' + _p.parent
    if _p.parent != 'Chest':
        _p.parent = 'L_' + _p.parent
    PLATES.append(_p.mirrored(_p.name[:-1] + 'R', _parent))


def plate_bones():
    out = []
    for p in PLATES:
        piv = p.c
        out.append(('PlateMount_' + p.name, p.parent, tuple(piv - p.a * 0.25), tuple(piv + p.a * 0.25)))
        out.append(('Plate_' + p.name, 'PlateMount_' + p.name, tuple(piv - p.a * p.hh), tuple(piv + p.a * p.hh)))
    return out


def all_bones():
    bones = list(BONES)
    for nm, par, h, t in SIDE:
        for s, m in (('L_', lambda q: np.asarray(q, float)), ('R_', mirror)):
            bones.append((s + nm, par if par in ('Chest', 'Hips') else s + par, tuple(m(h)), tuple(m(t))))
    for nm, a, pa, b, pb in PISTONS:
        for s, m in (('L_', lambda q: np.asarray(q, float)), ('R_', mirror)):
            A, B = m(pa), m(pb)
            ba = a if a in ('Chest', 'Hips') else s + a
            bb = b if b in ('Chest', 'Hips') else s + b
            d = nrm(B - A)
            L = np.linalg.norm(B - A)
            bones.append((s + nm + 'Cyl', ba, tuple(A), tuple(A + d * L * 0.5)))
            bones.append((s + nm + 'Rod', bb, tuple(B), tuple(B - d * L * 0.5)))
    bones += plate_bones()
    return bones


ALL = all_bones()
REST = {n: (np.array(h, float), np.array(t, float)) for n, _, h, t in ALL}
PARENT = {n: p for n, p, _, _ in ALL}


def piston_pairs():
    out = []
    for nm, a, pa, b, pb in PISTONS:
        for s, m in (('L_', lambda q: np.asarray(q, float)), ('R_', mirror)):
            ba = a if a in ('Chest', 'Hips') else s + a
            bb = b if b in ('Chest', 'Hips') else s + b
            out.append((s + nm, ba, m(pa), bb, m(pb)))
    return out


PISTON_PAIRS = piston_pairs()
