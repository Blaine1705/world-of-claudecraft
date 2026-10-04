"""Tideglass Colossus: skeleton and sculpts (rest pose), in yards.

A giant of tideglass, the sea-glass the moon's water hardened: a body of
great faceted crystal columns worn smooth at the edges like glass from the
sea, clear turquoise with currents of light running inside it. Geodes of
violet and moon-white crystal burst from its shoulders, elbows and knees;
nacre plates and pearls are set into its chest and brow; silver bands with
moons ring its wrists and ankles. In its chest, held in a silver crescent,
the prism: a great faceted crystal of silver and violet, the eye that casts
the Reflections. Its head is a small crowned crystal with a slit of light.

Axes: yards, +Z up, faces -Y, its left is +X. Rest is an A-pose. The crown's
tips about 6.2 up.
"""
import math

import numpy as np

import biped as B
import sdf
import sdf_ext as X
from biped import lerp, unit
from sdf import Ellipsoid, Field, Noise, RoundCone, Sphere
from sdf_ext import Prism

NAME = 'TideglassColossus'
PREFIX = 'colossus'

SHOULDER = np.array((1.38, 0.05, 4.72))
ELBOW = np.array((1.95, 0.16, 3.62))
WRIST = np.array((2.2, 0.0, 2.6))
HAND_TIP = np.array((2.3, -0.1, 2.06))
HIP = np.array((0.62, 0.0, 2.3))
KNEE = np.array((0.72, -0.16, 1.26))
ANKLE = np.array((0.74, 0.08, 0.42))
BALL = np.array((0.76, -0.48, 0.15))
TOE = np.array((0.76, -0.8, 0.13))
HAND = B.Hand(WRIST, HAND_TIP, 0.4, {}, thumb=((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.1, 0.1))
FINGERS = ()
FINGER_FAN = {}


def hand_frame(side=1):
    return HAND.frame(side)


def finger_chain(side, name):
    return HAND.chain(side, name)


L = dict(SHOULDER=SHOULDER, ELBOW=ELBOW, WRIST=WRIST, HAND_TIP=HAND_TIP, HIP=HIP, KNEE=KNEE, ANKLE=ANKLE,
         BALL=BALL, TOE=TOE, clav_parent='Spine2', clav_head=np.array((0.36, 0.05, 4.62)))
PRISM_AT = np.array((0.0, -0.86, 4.0))
HEAD_C = np.array((0.0, -0.08, 5.45))
WEAPON_AXIS = (0.0, 0.0, 1.0)
WEAPON_REF = WEAPON_AXIS
GRIP_OFFSET_L = (0.0, 0.0, 0.0)
BAKE_CAGE, BAKE_RAY = 0.03, 0.12


def _bones():
    out = [
        ('Root', None, (0, 0, 0), (0, 0, 0.6)),
        ('Hips', 'Root', (0, 0, 2.3), (0, 0, 2.8)),
        ('Spine1', 'Hips', (0, 0, 2.8), (0, 0, 3.6)),
        ('Spine2', 'Spine1', (0, 0, 3.6), (0, 0.04, 4.8)),
        ('Neck', 'Spine2', (0, 0.04, 4.86), (0, 0.0, 5.18)),
        ('Head', 'Neck', (0, 0.0, 5.18), (0, -0.06, 5.9)),
        ('Prism', 'Spine2', tuple(PRISM_AT), tuple(PRISM_AT + np.array((0, -0.4, 0)))),
        ('Shards', 'Root', (0, -1.6, 0.0), (0, -1.6, 0.5)),
        ('Pool', 'Root', (0, 0, 0), (0, 0, 0.5)),
    ]
    out += B.arm_leg_bones(L, HAND, FINGERS)
    return B.topo(B.expand(out))


BONES = _bones()
REST = {n: (np.array(h, dtype=float), np.array(t, dtype=float)) for n, _, h, t in BONES}
SPINE = (('Spine1', 0.45), ('Spine2', 0.55))
LEFT_ARM = ('L_Clavicle', 'L_UpperArm', 'L_ElbowFix', 'L_Forearm', 'L_Hand')
LIMBS = (('L_UpperArm', 'L_Forearm'), ('R_UpperArm', 'R_Forearm'), ('L_Thigh', 'L_Shin'), ('R_Thigh', 'R_Shin'))
foot_dir = B.foot_dir_fn(REST['L_Foot'][1] - REST['L_Foot'][0])
BALL_OFF = BALL - ANKLE
HEEL_OFF = np.array((0.0, 0.26, -0.3))
SOLE_Z = float(ANKLE[2])
GROUND = 0.04
FREE_END = ('Death',)
COLLIDE_LEGS = {}
CHAINS = []
POP_SKIP = ('Prism', 'Shards', 'Pool')
FEET = ('L_Foot', 'R_Foot')
AIM_LIMITS = {'L_Hand': 75.0, 'R_Hand': 75.0, 'L_Foot': 95.0, 'R_Foot': 95.0}
HIDDEN = {'Shards': 0.0, 'Pool': 0.0}


def mirror(p):
    return B.mirror(p)


def _m(p, s):
    p = np.asarray(p, float)
    return np.array((p[0] * s, p[1], p[2]))


def _side(name, s):
    return ('L_' if s > 0 else 'R_') + name


def _write(obj, vals):
    me = obj.data
    for nm, arr in vals.items():
        at = me.attributes.new(nm, 'FLOAT', 'POINT')
        at.data.foreach_set('value', np.asarray(arr, dtype=np.float32).ravel().tolist())


def _geode(F, base, d, r, n, bone, rng, k=0.04, spread=0.5):
    """A cluster of crystal points bursting from `base` along `d`."""
    d = unit(d)
    for i in range(n):
        q = unit(d + rng.normal(0, spread, 3))
        L = r * rng.uniform(2.2, 3.6)
        rr = r * rng.uniform(0.36, 0.55)
        F.add(Prism(base - q * 0.1, base + q * L, rr, n=6, tip=0.38, tip_a=0.05, rot=rng.uniform(0, 1), bone=bone),
              k)


# ------------------------------------------------------------------ the glass body
def build_body(voxel):
    """Tumbled sea-glass cut in broad facets: massive rounded forms worn smooth
    by the sea, a hunched back, and great sharp crystal spires bursting from
    the shoulders, the spine, the elbows and the knees."""
    F = Field((-3.0, -1.6, 0.2), (3.0, 2.3, 7.4), voxel)
    rng = np.random.default_rng(3)
    F.add(Ellipsoid((0, 0.04, 4.12), (1.3, 0.88, 1.0), bone='Spine2'), 0.2)
    F.add(Ellipsoid((0, 0.0, 3.25), (0.86, 0.64, 0.72), bone='Spine1'), 0.25)
    F.add(Ellipsoid((0, 0.02, 2.48), (0.9, 0.62, 0.45), bone='Hips'), 0.2)
    F.add(Ellipsoid((0, 0.44, 4.6), (0.95, 0.62, 0.66), bone='Spine2'), 0.22)
    for s in (1, -1):
        F.add(Sphere(_m(SHOULDER, s) + np.array((-s * 0.12, 0.02, 0.04)), 0.62, bone=_side('Clavicle', s)), 0.2)
    F.add(RoundCone((0, 0.05, 4.7), (0, -0.02, 5.2), 0.42, 0.34, bone='Neck'), 0.1)
    for s in (1, -1):
        sh, el, wr = _m(SHOULDER, s), _m(ELBOW, s), _m(WRIST, s)
        hp, kn, an = _m(HIP, s), _m(KNEE, s), _m(ANKLE, s)
        F.add(RoundCone(sh, el, 0.46, 0.36, bone=_side('UpperArm', s)), 0.1)
        F.add(Sphere(el, 0.38, bone=_side('ElbowFix', s)), 0.1)
        F.add(RoundCone(el, wr, 0.4, 0.52, bone=_side('Forearm', s)), 0.1)
        F.add(Sphere(hp, 0.52, bone=_side('Thigh', s)), 0.12)
        F.add(RoundCone(hp, kn, 0.54, 0.42, bone=_side('Thigh', s)), 0.1)
        F.add(Sphere(kn + np.array((0, -0.06, 0)), 0.44, bone=_side('KneeFix', s)), 0.1)
        F.add(RoundCone(kn, an, 0.44, 0.36, bone=_side('Shin', s)), 0.1)
    noise = Noise(5)

    def facets(X_, Y_, Z_):
        # broad flats round the vertical and along the height: cut glass
        a = np.arctan2(X_, Y_ + 1e-6)
        tri = np.abs(((a * 7 / math.pi) % 2) - 1) - 0.5
        tz = np.abs(((Z_ * 1.6) % 2) - 1) - 0.5
        return 0.06 * tri + 0.03 * tz + 0.012 * noise.fbm(X_ * 2.5, Y_ * 2.5, Z_ * 2.5, octaves=3)
    F.displace(facets, band=0.1)
    # the crystal spires (after the facets: they stay sharp)
    for s in (1, -1):
        sh, el, kn, wr = _m(SHOULDER, s), _m(ELBOW, s), _m(KNEE, s), _m(WRIST, s)
        _big_spires(F, sh + np.array((s * 0.1, 0.18, 0.4)), (s * 0.4, 0.25, 1.0), _side('Clavicle', s), rng,
                    n=6, length=(1.4, 2.4), radius=(0.2, 0.32))
        _big_spires(F, el + np.array((s * 0.2, 0.25, 0.05)), (s * 0.6, 1.0, 0.2), _side('ElbowFix', s), rng,
                    n=4, length=(0.7, 1.2), radius=(0.12, 0.2))
        _big_spires(F, (el + wr) * 0.5 + np.array((s * 0.35, 0.2, 0.0)), (s * 1.0, 0.4, 0.2), _side('Forearm', s), rng,
                    n=3, length=(0.4, 0.7), radius=(0.09, 0.14))
        _big_spires(F, kn + np.array((s * 0.05, -0.32, 0.05)), (s * 0.3, -1.0, 0.6), _side('KneeFix', s), rng,
                    n=3, length=(0.4, 0.7), radius=(0.1, 0.15))
    for z, n, ln in ((5.0, 6, (1.5, 2.5)), (4.45, 5, (1.2, 2.0)), (3.9, 4, (0.9, 1.4)), (3.4, 3, (0.6, 1.0))):
        _big_spires(F, np.array((0.0, 0.7 + 0.1 * (z - 3.3), z)), (0.0, 1.0, 0.75), 'Spine2' if z > 3.6 else 'Spine1',
                    rng, n=n, length=ln, radius=(0.15, 0.26), spread=0.55)
    return F


def _big_spires(F, base, d, bone, rng, n=5, length=(0.6, 1.2), radius=(0.12, 0.2), spread=0.42):
    d = unit(d)
    for i in range(n):
        q = unit(d + rng.normal(0, spread, 3))
        L = rng.uniform(*length)
        rr = rng.uniform(*radius)
        F.add(Prism(base - q * 0.25, base + q * L, rr, n=6, tip=0.34, tip_a=0.05, rot=rng.uniform(0, 1), bone=bone),
              0.012)


def _plate_ring(F, a, b, r, n, bone, rng, over=0.9, length=1.05, rad=(0.12, 0.19), splay=0.06, sides=6):
    """Crystal plates round a limb segment a-b: each a long shard lying along
    the limb on the core's surface, tips sharp, tilted out a little."""
    ax = unit(b - a)
    ref = np.array((0.0, 0.0, 1.0)) if abs(ax[2]) < 0.9 else np.array((1.0, 0.0, 0.0))
    e1 = unit(np.cross(ax, ref))
    e2 = np.cross(ax, e1)
    Lseg = np.linalg.norm(b - a)
    for i in range(n):
        ang = 2 * math.pi * (i + rng.uniform(-0.2, 0.2)) / n
        out = e1 * math.cos(ang) + e2 * math.sin(ang)
        u0 = rng.uniform(-0.08, 0.12)
        L = Lseg * length * rng.uniform(0.85, 1.15)
        p0 = a + ax * (Lseg * u0) + out * r * over
        p1 = p0 + ax * L + out * L * splay * rng.uniform(0.5, 1.4)
        rr = rng.uniform(*rad)
        F.add(Prism(p0, p1, rr, n=sides, tip=0.16, tip_a=0.12, rot=rng.uniform(0, 1), bone=bone), 0.01)


def build_shards(voxel):
    """The tideglass armour: long faceted shards lying along every limb, broad
    plates over the chest and back, and great crystal spires bursting from the
    shoulders and the spine."""
    F = Field((-3.2, -1.7, 0.2), (3.2, 1.9, 6.9), voxel)
    rng = np.random.default_rng(11)
    for s in (1, -1):
        sh, el, wr = _m(SHOULDER, s), _m(ELBOW, s), _m(WRIST, s)
        hp, kn, an = _m(HIP, s), _m(KNEE, s), _m(ANKLE, s)
        _plate_ring(F, sh, el, 0.34, 11, _side('UpperArm', s), rng)
        _plate_ring(F, el, wr, 0.38, 12, _side('Forearm', s), rng, rad=(0.14, 0.22))
        _plate_ring(F, hp, kn, 0.42, 13, _side('Thigh', s), rng, rad=(0.14, 0.22))
        _plate_ring(F, kn, an, 0.34, 11, _side('Shin', s), rng)
        _geode(F, sh + np.array((s * 0.1, 0.12, 0.38)), (s * 0.35, 0.2, 1.0), 0.48, 7, _side('Clavicle', s), rng,
               k=0.012, spread=0.4)
        _geode(F, el + np.array((s * 0.2, 0.25, 0.0)), (s * 0.5, 1.0, 0.1), 0.3, 4, _side('ElbowFix', s), rng,
               k=0.012)
        _geode(F, kn + np.array((s * 0.05, -0.3, 0.05)), (s * 0.2, -1.0, 0.5), 0.26, 3, _side('KneeFix', s), rng,
               k=0.012)
    # the chest: a barrel of upright crystal columns round the core, a gap in
    # front where the prism sits
    for i in range(22):
        a = 2 * math.pi * (i + 0.5) / 22
        if abs(math.atan2(math.sin(a), -math.cos(a))) < 0.32:
            continue
        x, y = 1.02 * math.sin(a), 0.04 - 0.7 * math.cos(a)
        z0 = 3.25 + rng.uniform(-0.1, 0.15)
        h = rng.uniform(1.35, 1.9) + (0.25 if abs(x) > 0.7 else 0.0)
        tilt = np.array((0.12 * math.sin(a), -0.1 * math.cos(a), 1.0))
        p0 = np.array((x, y, z0))
        F.add(Prism(p0, p0 + unit(tilt) * h, rng.uniform(0.16, 0.24), n=6, tip=0.2, tip_a=0.1, rot=rng.uniform(0, 1),
                    bone='Spine2'), 0.01)
    for i in range(14):
        a = 2 * math.pi * (i + 0.5) / 14
        x, y = 0.74 * math.sin(a), 0.0 - 0.52 * math.cos(a)
        p0 = np.array((x, y, 2.3))
        F.add(Prism(p0, p0 + np.array((0.05 * math.sin(a), -0.05 * math.cos(a), 1.0)) * rng.uniform(0.9, 1.2),
                    rng.uniform(0.13, 0.19), n=6, tip=0.2, tip_a=0.12, rot=rng.uniform(0, 1),
                    bone='Spine1' if i % 2 else 'Hips'), 0.01)
    for z, w in ((5.05, 0.5), (4.5, 0.46), (3.95, 0.38), (3.4, 0.3)):
        _geode(F, np.array((0.0, 0.62 + 0.1 * (z - 3.3), z)), (0.0, 1.0, 0.8), w, 5,
               'Spine2' if z > 3.6 else 'Spine1', rng, k=0.012, spread=0.5)
    return F


def body_paint(obj):
    """RegCurrent (the currents of light inside the glass, flowing up the
    limbs and round the chest), RegGeode (the crystal clusters), RegNacre (the
    nacre plates set in the chest round the prism), RegPearl."""
    from rig import mesh_arrays
    P, _ = mesh_arrays(obj)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = Noise(9)
    flow = n.fbm(x * 1.2, y * 1.2, z * 0.35, octaves=3)
    current = np.clip(1 - np.abs(np.sin(flow * 9 + z * 1.4)) / 0.25, 0, 1)
    geode = np.zeros(len(P))
    for s in (1, -1):
        for c, r in ((_m(SHOULDER, s) + np.array((s * 0.4, 0.3, 1.25)), 0.9),
                     (_m(ELBOW, s) + np.array((s * 0.45, 0.6, 0.15)), 0.5),
                     (_m(KNEE, s) + np.array((s * 0.1, -0.6, 0.3)), 0.4)):
            geode = np.maximum(geode, np.clip(1 - np.linalg.norm(P - c, axis=1) / r, 0, 1))
    spine = np.clip(1 - np.abs(x) / 0.7, 0, 1) * np.clip((y - 0.95) / 0.3, 0, 1) * np.clip((z - 3.3) / 0.3, 0, 1)
    geode = np.maximum(geode, spine)
    d = np.linalg.norm((P - PRISM_AT) / np.array((1.0, 1.0, 1.0)), axis=1)
    nacre = np.clip((0.95 - d) / 0.08, 0, 1) * np.clip((d - 0.42) / 0.06, 0, 1) * (y < -0.55)
    _write(obj, {'RegCurrent': current, 'RegGeode': np.clip(geode * 2.5, 0, 1), 'RegNacre': nacre})


def build_fist(side, voxel):
    """A fist of crystal: a heavy knot of glass bristling with points, the
    knuckles driven out as a crown of shards."""
    w, down, width, palm = hand_frame(side)
    c = w + down * 0.42
    F = Field(c - 1.0, c + 1.0, voxel)
    rng = np.random.default_rng(31 + side)
    F.add(Ellipsoid(c, (0.42, 0.4, 0.48), np.stack([width, palm, down], axis=1)), 0.1)
    F.add(RoundCone(w - down * 0.1, c, 0.36, 0.42), 0.1)
    for i in range(9):
        q = unit(down * 1.0 + width * rng.normal(0, 0.6) + palm * rng.normal(-0.3, 0.6))
        b = c + q * 0.28
        F.add(Prism(b - q * 0.1, b + q * rng.uniform(0.35, 0.6), rng.uniform(0.1, 0.16), n=6, tip=0.4, tip_a=0.1,
                    rot=i), 0.01)
    for i in range(5):
        q = unit(-palm * 0.6 + width * rng.normal(0, 0.7) + down * 0.4)
        b = c + q * 0.3
        F.add(Prism(b - q * 0.1, b + q * rng.uniform(0.3, 0.5), rng.uniform(0.09, 0.14), n=6, tip=0.4, tip_a=0.1,
                    rot=i), 0.01)
    return F


def build_foot(side, voxel):
    an, ba, to = _m(ANKLE, side), _m(BALL, side), _m(TOE, side)
    F = Field(np.minimum(an, to) - 0.7, np.maximum(an, to) + 0.7, voxel)
    F.add(Ellipsoid((an + to) * 0.5 + np.array((0, 0.1, -0.14)), (0.48, 0.66, 0.3)), 0.1)
    F.add(Sphere(an, 0.36), 0.1)
    F.sub(Ellipsoid(np.array((an[0], 0.0, -0.5)), (2.0, 2.0, 0.55)), 0.01)
    noise = Noise(51 + side)
    F.displace(lambda X_, Y_, Z_: 0.01 * noise.fbm(X_ * 3, Y_ * 3, Z_ * 3, octaves=3), band=0.05)
    return F


def build_head(voxel):
    """A small crowned crystal: a faceted dome with a heavy brow over one slit
    of light, a crown of three crystal points."""
    F = Field(HEAD_C - 0.7, HEAD_C + 0.9, voxel)
    F.add(Ellipsoid(HEAD_C, (0.36, 0.36, 0.4)), 0.08)
    rng = np.random.default_rng(71)
    for i in range(9):
        a = math.radians(-150 + 300 * i / 8)
        d = np.array((math.sin(a), -math.cos(a) * 0.9, 0.55))
        b = HEAD_C + d * np.array((0.3, 0.3, 0.2))
        F.add(Prism(b, b + unit(d + np.array((0, 0, 0.6))) * rng.uniform(0.3, 0.5), 0.1, n=5, tip=0.4, tip_a=0.1,
                    rot=i), 0.02)
    F.add(Prism(HEAD_C + np.array((-0.36, -0.28, 0.08)), HEAD_C + np.array((0.36, -0.28, 0.08)), 0.1, n=4, tip=0.2,
                rot=0.78), 0.04)
    for dx, h in ((0.0, 0.62), (0.2, 0.42), (-0.2, 0.42)):
        b = HEAD_C + np.array((dx, 0.05, 0.25))
        F.add(Prism(b, b + np.array((dx * 0.8, 0.08, h)), 0.09, n=5, tip=0.45, rot=0.3), 0.04)
    pts = [HEAD_C + np.array((x, -0.37 + 0.2 * x * x, -0.02)) for x in np.linspace(-0.24, 0.24, 9)]
    F.groove(sdf.Polyline(pts, [0.012] * 9), 0.06, k=0.03)
    return F


def head_paint(obj):
    from rig import mesh_arrays
    P, _ = mesh_arrays(obj)
    d = P - HEAD_C
    slit = np.clip(1 - np.abs(d[:, 2] + 0.02) / 0.04, 0, 1) * np.clip((0.26 - np.abs(d[:, 0])) / 0.04, 0, 1) * \
        (d[:, 1] < -0.24)
    _write(obj, {'RegSlit': slit})


def build_prism(voxel):
    """The prism, the eye: a great cut gem of silver and violet, its crown of
    facets pointing out of the chest."""
    F = Field(PRISM_AT - 0.8, PRISM_AT + 0.8, voxel)
    F.add(Prism(PRISM_AT + np.array((0, 0.35, 0)), PRISM_AT + np.array((0, -0.42, 0)), 0.5, n=8, tip=0.5,
                tip_a=0.08, rot=0.2), 0.01)
    return F


# ------------------------------------------------------------------ the sculpt list
def fields(k=1.0):
    from build_core import Sculpt
    S = [Sculpt('Glass', build_body(0.016 * k), 'glass', 18000, tau=0.08, paint=body_paint)]
    for s, side in ((1, 'L'), (-1, 'R')):
        S.append(Sculpt(f'{side}_Fist', build_fist(s, 0.016 * k), 'glass', 1600, binding='rigid',
                        bone=f'{side}_Hand', paint=body_paint))
        S.append(Sculpt(f'{side}_Sole', build_foot(s, 0.018 * k), 'glass', 1200, binding='rigid',
                        bone=f'{side}_Foot', paint=body_paint))
    S.append(Sculpt('CrystalHead', build_head(0.011 * k), 'head', 2000, binding='rigid', bone='Head',
                    paint=head_paint))
    S.append(Sculpt('PrismEye', build_prism(0.01 * k), 'prism', 600, binding='rigid', bone='Prism'))
    return S


_ = (lerp, RoundCone, X)
