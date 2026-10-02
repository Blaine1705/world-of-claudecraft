"""The Prime Draft's frame: landmarks, bones, pistons, cables and moorings.

Axes: Blender armature space in yards, +Z up, the Draft FACES -Y, its LEFT is +X
(glTF: faces +Z, left is +X). Origin on the ground between the feet.

Sides: its RIGHT arm (R_, x < 0) is the finished BRASS arm (the Slam arm); its LEFT
arm (L_, x > 0) is the bare IRON FRAME arm with exposed pistons (the Sweep arm).
The face plate is finished on the right half (the glass eye) and bare iron frame on
the left half: the left side of the colossus is the unfinished side.

Every visible part rides ONE bone rigidly (hard surface): joints are ball or drum
housings centred on the pivots, so a child turns inside its parent's housing and
never opens a gap. Pistons are a cylinder on one bone and a rod on the next, aimed
at each other every frame (rig.solve_mechanics). Cables and floor clamps are the
moorings: they belong to the gantry and are torn away in Unbolt.
"""
import numpy as np

S_IRON = 1     # its left (x > 0)
S_BRASS = -1   # its right (x < 0)


def side_pt(p, s):
    return np.array((p[0] * s, p[1], p[2]), dtype=float)


def mirror(p):
    return np.array((-p[0], p[1], p[2]), dtype=float)


# ------------------------------------------------------------------ landmarks (left side, x > 0)
PELVIS_C = np.array((0.0, 0.2, 4.75))
HIP = np.array((1.3, 0.2, 4.45))
KNEE = np.array((1.55, -0.12, 2.55))
ANKLE = np.array((1.75, 0.08, 1.0))
TOE = np.array((1.85, -1.3, 0.4))
SPINE0 = np.array((0.0, 0.2, 5.25))
CHEST0 = np.array((0.0, 0.1, 6.3))
CHEST_C = np.array((0.0, 0.05, 7.55))
NECK0 = np.array((0.0, -0.35, 8.75))
HEAD0 = np.array((0.0, -0.7, 9.3))
HEAD_C = np.array((0.0, -1.0, 9.78))
CLAV0 = np.array((0.75, 0.25, 8.6))
SHOULDER = np.array((2.7, 0.3, 8.5))
ELBOW = np.array((3.15, 0.55, 5.8))
WRIST = np.array((3.35, 0.1, 3.3))
KNUCK = np.array((3.4, -0.05, 2.25))
EYE = np.array((-0.34, -1.62, 9.86))       # the one glass eye (its right)
HATCH_Y = -1.77                              # the hinge axis plane (in front of the bezel)
HATCH_HALF_W = 0.88                          # hinge axes at x = +-0.88 (opening x in [-0.78, 0.78])
HATCH_Z0, HATCH_Z1 = 6.82, 8.34
SOCKET_C = np.array((0.0, -0.95, 7.58))      # the empty socket's centre
PLUG = np.array((0.95, 2.02, 7.0))          # back cable plug (left; mirrored)
CABLE_END = np.array((1.8, 7.4, 7.4))      # gantry end of the left cable (mirrored): up and back in the scaffold
CABLE_LEN = 8.0
CABLE_SEGS = 7

# ------------------------------------------------------------------ bones
# name, parent, head, tail


def _bones():
    b = [
        ('Root', None, (0, 0, 0), (0, 0, 1.0)),
        ('Pelvis', 'Root', (0, 0.2, 4.5), (0, 0.2, 5.25)),
        ('Spine', 'Pelvis', tuple(SPINE0), tuple(CHEST0)),
        ('Chest', 'Spine', tuple(CHEST0), (0, 0.0, 8.7)),
        ('Neck', 'Chest', tuple(NECK0), tuple(HEAD0)),
        ('Head', 'Neck', tuple(HEAD0), (0, -0.8, 10.4)),
        ('EyeGlow', 'Head', tuple(EYE), tuple(EYE + (0, -0.3, 0))),
        ('HatchL', 'Chest', (HATCH_HALF_W, HATCH_Y, HATCH_Z0), (HATCH_HALF_W, HATCH_Y, HATCH_Z1)),
        ('HatchR', 'Chest', (-HATCH_HALF_W, HATCH_Y, HATCH_Z0), (-HATCH_HALF_W, HATCH_Y, HATCH_Z1)),
        ('CoreArc', 'Chest', tuple(SOCKET_C + (0, 0, -0.5)), tuple(SOCKET_C + (0, 0, 0.5))),
    ]
    for side, s in (('L_', 1), ('R_', -1)):
        P = lambda p: tuple(side_pt(p, s))  # noqa: E731
        b += [
            (side + 'Clavicle', 'Chest', P(CLAV0), P(SHOULDER)),
            (side + 'UpperArm', side + 'Clavicle', P(SHOULDER), P(ELBOW)),
            (side + 'Forearm', side + 'UpperArm', P(ELBOW), P(WRIST)),
            (side + 'Hand', side + 'Forearm', P(WRIST), P(KNUCK)),
            (side + 'Thigh', 'Pelvis', P(HIP), P(KNEE)),
            (side + 'Shin', side + 'Thigh', P(KNEE), P(ANKLE)),
            (side + 'Foot', side + 'Shin', P(ANKLE), P(TOE)),
        ]
    # the iron claw: two fingers and a thumb (its left hand)
    b += [
        ('L_ClawA', 'L_Hand', (3.62, -0.42, 2.45), (3.7, -0.62, 1.55)),
        ('L_ClawB', 'L_Hand', (3.62, 0.3, 2.45), (3.7, 0.42, 1.55)),
        ('L_ClawT', 'L_Hand', (3.0, -0.2, 2.6), (2.85, -0.35, 1.75)),
    ]
    return b


BONES = _bones()

# Pistons: name, bone A (cylinder), anchor A, bone B (rod), anchor B, cylinder radius.
# Anchors are rest-space points; the left side is written and mirrored where `both`.
PISTONS_ONE_SIDE = [
    # iron arm (left): the whole arm is driven by visible rams
    ('L_Bicep', 'L_UpperArm', (2.9, -0.5, 7.95), 'L_Forearm', (3.2, -0.12, 5.3), 0.21),
    ('L_Tricep', 'L_UpperArm', (3.05, 1.05, 7.85), 'L_Forearm', (3.18, 1.18, 5.85), 0.19),
    ('L_Delt', 'Chest', (1.15, -0.7, 9.0), 'L_UpperArm', (2.95, -0.38, 8.12), 0.17),
    ('L_Wrist', 'L_Forearm', (3.72, 0.45, 5.15), 'L_Hand', (3.72, 0.38, 2.85), 0.15),
    # brass arm (right): one ram behind the elbow shows between the plates
    ('R_Tricep', 'R_UpperArm', (-3.0, 1.0, 7.7), 'R_Forearm', (-3.18, 1.2, 5.85), 0.17),
]
PISTONS_BOTH = [
    ('Quad', 'Thigh', (1.3, -0.68, 4.0), 'Shin', (1.62, -0.62, 2.1), 0.15),
    ('Calf', 'Shin', (1.62, 0.66, 2.45), 'Foot', (1.75, 0.5, 0.92), 0.14),
    ('Waist', 'Pelvis', (0.95, 0.45, 5.05), 'Chest', (1.05, 0.5, 6.55), 0.15),
    ('Neck', 'Chest', (0.48, -0.25, 8.55), 'Head', (0.5, -0.7, 9.5), 0.1),
]


def pistons():
    out = list(PISTONS_ONE_SIDE)
    for name, ba, pa, bb, pb, r in PISTONS_BOTH:
        for side, s in (('L_', 1), ('R_', -1)):
            na = ba if ba in ('Pelvis', 'Chest', 'Head', 'Spine') else side + ba
            nb = bb if bb in ('Pelvis', 'Chest', 'Head', 'Spine') else side + bb
            out.append((side + name, na, tuple(side_pt(pa, s)), nb, tuple(side_pt(pb, s)), r))
    return out


PISTONS = pistons()


def piston_bones():
    """Two solved bones per piston: the cylinder on bone A, the rod on bone B, each
    pointing at the other anchor at rest."""
    out = []
    for name, ba, pa, bb, pb, r in PISTONS:
        pa, pb = np.array(pa), np.array(pb)
        d = (pb - pa) / np.linalg.norm(pb - pa)
        out.append(('P_' + name + '_Cyl', ba, tuple(pa), tuple(pa + d * 0.3)))
        out.append(('P_' + name + '_Rod', bb, tuple(pb), tuple(pb - d * 0.3)))
    return out


def rest_catenary(a, b, length, n):
    """n+1 points from a to b hanging as a cable of `length` (parabola, solved for arc length)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    t = np.linspace(0, 1, 201)

    def pts(sag):
        p = a[None] + (b - a)[None] * t[:, None]
        p[:, 2] -= sag * 4 * t * (1 - t)
        return p

    lo, hi = 0.0, 10.0
    for _ in range(60):
        m = (lo + hi) / 2
        L = np.linalg.norm(np.diff(pts(m), axis=0), axis=1).sum()
        if L < length:
            lo = m
        else:
            hi = m
    p = pts((lo + hi) / 2)
    seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    want = np.linspace(0, seg[-1], n + 1)
    return np.stack([np.interp(want, seg, p[:, k]) for k in range(3)], axis=1)


def cable_bones():
    """Each cable is CABLE_SEGS bones, all children of Root, keyed every frame
    (location, rotation and a length stretch) so the chain meets the plug exactly.
    C_<s>0 starts at the gantry end; the last bone's tail is the plug."""
    out = []
    for side, s in (('L', 1), ('R', -1)):
        pts = rest_catenary(side_pt(CABLE_END, s), side_pt(PLUG, s), CABLE_LEN, CABLE_SEGS)
        for i in range(CABLE_SEGS):
            out.append((f'Cable{side}{i}', 'Root', tuple(pts[i]), tuple(pts[i + 1])))
    return out


# floor clamps over each foot's flange, and the bolts through them (moorings)
CLAMP_BOLTS = [(-0.9, -0.75), (0.9, -0.75), (-0.9, 0.5), (0.9, 0.5)]


def mooring_bones():
    """One clamp dog and one bolt per flange hole, all children of the static Root,
    upright at the hole (they burst and fly in Unbolt)."""
    out = []
    for side, s in (('L', 1), ('R', -1)):
        a = side_pt(ANKLE, s)
        for i, (dx, dy) in enumerate(CLAMP_BOLTS):
            p = (a[0] + dx * s, a[1] - 0.25 + dy, 0.0)
            out.append((f'Clamp{side}{i}', 'Root', p, (p[0], p[1], p[2] + 0.4)))
            out.append((f'Bolt{side}{i}', 'Root', p, (p[0], p[1], p[2] + 0.4)))
    return out


def anchor_bones():
    """Zero-weight effect anchors (the game reads their heads)."""
    uw = (KNUCK - WRIST) / np.linalg.norm(KNUCK - WRIST)
    fist = mirror(WRIST) + mirror(uw) * 1.72
    claw = WRIST + uw * 1.55
    out = [
        ('Anchor_Hatch', 'Chest', (0.0, -1.86, 7.58), (0.0, -2.3, 7.58)),
        ('Anchor_Eye', 'Head', tuple(EYE + (0, -0.12, 0)), tuple(EYE + (0, -0.5, 0))),
        ('Anchor_FistR', 'R_Hand', tuple(fist), tuple(fist + mirror(uw) * 0.3)),
        ('Anchor_ClawL', 'L_Hand', tuple(claw), tuple(claw + uw * 0.3)),
        ('Anchor_Core', 'Chest', tuple(SOCKET_C), tuple(SOCKET_C + (0, -0.4, 0))),
    ]
    for side, s in (('L', 1), ('R', -1)):
        p = side_pt(PLUG, s)
        out.append((f'Anchor_Plug{side}', 'Chest', tuple(p), tuple(p + (0, 0.4, 0))))
    return out


ALL_BONES = BONES + piston_bones() + cable_bones() + mooring_bones() + anchor_bones()
REST = {n: (np.array(h, float), np.array(t, float)) for n, _, h, t in ALL_BONES}
SOLVED = {n for n, *_ in piston_bones()} | {n for n, *_ in cable_bones()}
MOORING = {n for n, *_ in cable_bones()} | {n for n, *_ in mooring_bones()}
