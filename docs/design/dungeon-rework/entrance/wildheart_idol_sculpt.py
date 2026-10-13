"""The Jaguar Maw's head as a carved mass, and its megalith skin
(build_wildheart_entrance.py).

The idol inside the Wildheart Basin (kit/jaguar_head_sculpt.py) is one mass
sculpted as a signed distance field. The idol at the door is the same people's
work seen from outside, so it is sculpted the same way, with the same
primitives: a big cat's skull, broad and low, on a neck that plunges into the
rise; heavy brows driven down over slanted sockets; cheekbones and jowls
flaring over the neck; a muzzle whose upper jaw overhangs the way in; a lower
jaw of two rami either side of the walk-in lane; the maw cut right through to
the throat. The carving is IN the field (the collar's stepped fret, rosettes
over the cranium and the cheeks, cartouches down the nape, the snarl's
furrows), so it runs across the joints of the stones.

The field is never meshed. megalith_skin() lays fitted blocks out on a chart
of its surface (rows of uneven height, blocks of uneven width, some two rows
tall), and builds each block as its own patch: a face that follows the carved
surface at the block's own proud or slipped depth, fine enough inside the
block for the weathering to grade across it, and a chamfer down into a deep V
joint. A chart is only a family of rays (rays(U, V) -> origins, directions)
marched through the air to the surface: round the outside, up into the
palate, down onto the jaws, round the throat, round an ear.

Coordinates are Blender's: X west, Y SOUTH (the face looks +Y), Z up, the
origin at the door. G(lx, lz, y) takes door-local game coordinates.
Deterministic: every draw comes from the rng handed in, and every noise is seeded.
"""
import math

import numpy as np

import jaguar_head_sculpt as js
from jaguar_head_sculpt import Ellipsoid, Noise, Polyline, RoundBox, RoundCone, rot

TAU = math.tau
AXIS = (0.0, -8.8)        # the neck's axis (the head collider's centre), Blender XY
NECK_R = 7.85             # inside the collider's 8.05
NECK_TOP = 3.1            # nothing overhangs the footprint below this
BULLET_YC = 6.0           # the outside chart: a cylinder up to here, a dome above
BULLET_R0 = 9.5
JAW_TOP = 2.3
JAW_ROT = 0.4455          # the muzzle colliders' yaw
JAW_C = (3.74, 0.968)     # their centre (lx, lz), mirrored
JAW_HALF = (2.73, 1.35)
MUZZLE_FRONT = -5.3       # lz of the upper jaw's front
EYE = dict(x=4.35, y=10.8, yaw=0.32, slant=0.30, a=1.85, b=1.02)
EAR = dict(x=8.0, lz=4.9, y=16.3, yaw=0.2, back=0.16, rx=2.9, ry=0.95, rz=4.3)
NOSE = dict(lz=-5.78, y=7.55)


def G(lx, lz, y):
    return (lx, -lz, y)


def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ primitives
class VCyl(js.Prim):
    """A plumb drum about (cx, cy) from z0 to z1."""

    def __init__(self, cx, cy, r, z0, z1):
        self.cx, self.cy, self.r, self.z0, self.z1 = cx, cy, r, z0, z1
        self.lo = np.array((cx - r, cy - r, z0))
        self.hi = np.array((cx + r, cy + r, z1))

    def dist(self, X, Y, Z):
        q = np.sqrt((X - self.cx) ** 2 + (Y - self.cy) ** 2) - self.r
        dz = np.maximum(self.z0 - Z, Z - self.z1)
        return np.minimum(np.maximum(q, dz), 0.0) + np.sqrt(np.maximum(q, 0.0) ** 2 + np.maximum(dz, 0.0) ** 2)


class Corbel(js.Prim):
    """Corbelled courses under the jowls and the nape, where the ground has
    fallen away from the neck: each ring starts `rise` over under(theta), the
    height below which nothing may leave the collider's footprint THERE."""

    def __init__(self, steps, under, top):
        self.steps, self.top = steps, top
        self.table = np.asarray(under, dtype=np.float64)
        r = max(s[0] for s in steps)
        self.lo = np.array((AXIS[0] - r, AXIS[1] - r, float(self.table.min())))
        self.hi = np.array((AXIS[0] + r, AXIS[1] + r, top))

    def under(self, theta):
        n = len(self.table)
        f = (theta % TAU) / TAU * n
        i = np.floor(f).astype(int) % n
        t = f - np.floor(f)
        return self.table[i] * (1 - t) + self.table[(i + 1) % n] * t

    def dist(self, X, Y, Z):
        rho = np.sqrt((X - AXIS[0]) ** 2 + (Y - AXIS[1]) ** 2)
        zu = self.under(np.arctan2(X - AXIS[0], Y - AXIS[1]))
        out = None
        for (r, rise) in self.steps:
            d = np.maximum(np.maximum(rho - r, zu + rise - Z), Z - self.top)
            out = d if out is None else np.minimum(out, d)
        return out


class Maw(js.Prim):
    """The maw and the throat behind it: an arched tunnel along the lane that
    narrows from the open jaws to the throat's window (the engine's flooded
    throat is drawn in a window of half 2.5, spring 3.6 at lz 1.3). Its walls
    drop plumb to under the ground: the jaws' inner faces. The palate is
    ribbed across."""
    FRONT, WINDOW, BACK = -5.4, 1.3, 4.6

    def __init__(self):
        self.lo = np.array((-3.8, -self.BACK, -8.0))
        self.hi = np.array((3.8, 9.5, 7.4))

    @classmethod
    def section(cls, lz):
        t = sstep(cls.FRONT, cls.WINDOW, lz)
        w = 3.3 + (2.5 - 3.3) * t
        spring = 4.6 + (3.6 - 4.6) * t
        rise = 2.1 + (2.5 - 2.1) * t
        return w, spring, rise

    def dist(self, X, Y, Z):
        lz = -Y
        w, spring, rise = self.section(lz)
        rise = rise * (1 + 0.045 * np.sin(lz * TAU / 1.25) * sstep(0.6, -0.4, lz))
        ax = np.abs(X)
        k = np.sqrt((ax / w) ** 2 + (np.maximum(Z - spring, 0.0) / rise) ** 2)
        d = np.where(Z > spring, (k - 1.0) * np.minimum(w, rise), ax - w)
        return np.maximum(d, lz - self.BACK)


# ------------------------------------------------------------------ the field
def _fill(field, prim, slab=24):
    """The first mass, evaluated over the WHOLE grid (so the field is a true
    distance everywhere a ray may start)."""
    ax = field.axes
    for i in range(0, field.shape[0], slab):
        X, Y, Z = np.meshgrid(ax[0][i:i + slab], ax[1], ax[2], indexing='ij')
        field.d[i:i + slab] = prim.dist(X, Y, Z).astype(np.float32)


def jaw_boxes():
    """The lower jaw's two rami: the muzzle colliders' own boxes, a hand
    inside them, from under the ground to the gum line."""
    out = []
    for s in (1, -1):
        c = G(s * JAW_C[0], JAW_C[1], (JAW_TOP - 5.2) / 2)
        out.append(RoundBox(c, (JAW_HALF[0], JAW_HALF[1], (JAW_TOP + 5.2) / 2), 0.22, rot(rz=-s * JAW_ROT)))
    return out


def nose_prim():
    """The nose leather: one dark stone let into the muzzle's front."""
    return RoundBox(G(0, NOSE['lz'] + 0.45, NOSE['y']), (1.62, 0.62, 0.92), 0.46, rot(rx=0.3))


def build_head(under, voxel=0.13):
    """The head's mass, before the sockets and the relief. `under` is the
    corbel table: for 72 bearings round the neck (from south, toward west),
    the height below which nothing may overhang there."""
    f = js.Field((-13.0, -20.6, -6.6), (13.0, 8.0, 15.4), voxel)
    _fill(f, Ellipsoid(G(0, 8.6, 8.2), (9.3, 10.0, 7.2)))
    f.add(VCyl(AXIS[0], AXIS[1], NECK_R, -7.0, 4.6), 0.5)
    # where the ground has fallen away, corbelled courses carry the jowls and the nape
    f.add(Corbel([(8.2, 0.0), (8.6, 0.85), (9.0, 1.7)], under, 4.2), 0.2)
    # the jowls: the head's widest, hung over the neck either side; the nape's roll behind
    for s in (1, -1):
        f.add(Ellipsoid(G(s * 6.6, 5.4, 5.25), (4.0, 5.4, 2.15)), 1.0)
        f.add(Ellipsoid(G(s * 7.2, 3.8, 7.0), (3.3, 5.2, 3.4)), 1.2)
        # the cheekbone: a hard crest from under the eye back and up toward the ear
        f.add(Ellipsoid(G(s * 8.1, 2.6, 9.1), (2.5, 4.6, 1.15), rot(rx=-0.24, rz=-s * 0.12)), 0.7)
    f.add(Ellipsoid(G(0, 12.6, 5.6), (8.7, 5.7, 2.5)), 1.0)
    # the occiput, and the crest along the skull's back
    f.add(Ellipsoid(G(0, 14.0, 8.6), (7.6, 4.9, 5.0)), 1.6)
    f.add(RoundCone(G(0, 6.5, 14.0), G(0, 17.0, 9.4), 1.4, 1.25), 1.0)
    # the forehead: a flat slope from the brows back to the crown
    f.add(RoundBox(G(0, 2.0, 12.4), (5.4, 2.4, 1.6), 1.1, rot(rx=0.42)), 1.5)
    # the brows: heavy ridges driven down at the bridge, over the eyes
    for s in (1, -1):
        f.add(RoundCone(G(s * 1.1, -0.1, 12.0), G(s * 8.4, 2.5, 13.5), 1.45, 0.95), 0.7)
        f.add(RoundCone(G(s * 5.6, 1.6, 13.2), G(s * 9.0, 4.4, 12.9), 0.95, 0.7), 0.9)
    # the muzzle: deep under a narrow bridge that falls to the nose (so the
    # eyes see over it down the road), its upper jaw out over the causeway,
    # the whisker pads round either side of the nose
    f.add(RoundBox(G(0, -1.9, 6.1), (3.9, 3.3, 2.0), 1.5), 1.4)
    f.add(RoundCone(G(0, 1.2, 9.9), G(0, -4.6, 7.45), 1.9, 1.2), 1.0)
    for s in (1, -1):
        f.add(Ellipsoid(G(s * 2.3, -4.2, 5.95), (2.2, 1.55, 1.6)), 0.7)
    f.add(nose_prim(), 0.35)
    # the lower jaw, and the hinges that carry it into the jowls
    for (s, box) in zip((1, -1), jaw_boxes()):
        f.add(box, 0.3)
        c, sn = math.cos(JAW_ROT), math.sin(JAW_ROT)
        hx, hz = s * (JAW_C[0] + 1.45 * c - 0.35 * sn), JAW_C[1] + 1.45 * sn + 0.35 * c
        f.add(RoundBox(G(hx, hz, -0.6), (1.15, 0.9, 4.5), 0.3, rot(rz=-s * JAW_ROT)), 0.7)
    return f


def carve_maw(f):
    maw = Maw()
    f.sub(maw, 0.3)
    # the gums: a ridge inside the upper lip, another along each ramus
    w0, s0, _ = Maw.section(-5.0)
    pts = []
    for lz in (-0.9, -2.2, -3.4, -4.4):
        w, sp, _r = Maw.section(lz)
        pts.append(G(w - 0.12, lz, sp - 0.25))
    arc = [G(math.cos(a) * (w0 - 0.15), -5.0 - 0.25 * math.sin(a), s0 - 0.3 + math.sin(a) * 2.05)
           for a in (0.35, 0.8, 1.25)]
    f.add(Polyline(pts + arc, 0.36), 0.25)
    f.add(Polyline([(-x, y, z) for (x, y, z) in pts + arc], 0.36), 0.25)
    for s in (1, -1):
        row = []
        for lz in (-0.5, 0.2, 0.9):
            w, _sp, _r = Maw.section(lz)
            row.append(G(s * (w + 0.5), lz, JAW_TOP - 0.05))
        f.add(Polyline(row, 0.34), 0.25)
    return maw


def eye_frames(f):
    """Where the eyes sit: for each, the socket's floor and its facing, found
    on the uncarved face. Returns [(sign, centre, normal)]."""
    out = []
    for s in (1, -1):
        n = np.array((s * math.sin(EYE['yaw']), math.cos(EYE['yaw']), -0.07))
        n /= np.linalg.norm(n)
        o = np.array((G(s * EYE['x'], 0, EYE['y']))) + n * 6.0
        p, hit = march(f, o[None, :], -n[None, :], np.zeros(1), 9.0)
        out.append((s, p[0], n))
    return out


def carve_sockets(f, frames):
    for (s, c, n) in frames:
        R = rot(ry=-s * EYE['slant'], rz=-s * EYE['yaw'])
        f.sub(Ellipsoid(c - n * 0.25, (EYE['a'] + 0.7, 1.45, EYE['b'] + 0.45), R), 0.45)


class Relief:
    """What the builders cut into the stone, as patterns over space near the
    surface, each in [0, 1]: the collar's stepped fret (raised), the rosettes
    of the pelt (a broken ring sunk round a boss, at points of the surface
    with their normals) and the cartouches down the nape (sunk panels in
    raised frames). carve() cuts them into the field; the skin reads the same
    patterns to darken what is sunk and to light what stands proud."""

    def __init__(self, rosettes):
        self.rosettes = rosettes

    @staticmethod
    def collar(X, Y, Z):
        cx, cy = AXIS
        th = np.arctan2(X - cx, Y - cy)
        rho = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        on = (np.abs(th) > 0.86) & (rho < NECK_R + 0.6) & (Z > 1.7) & (Z < 3.15)
        u = th * NECK_R
        unit = 2.9
        k = np.floor(u / unit)
        a = u - k * unit
        a = np.where(k % 2 == 0, a, unit - a)
        b = Z - 1.86
        bar = 0.3

        def box(a0, a1, b0, b1):
            return sstep(0.07, 0.0, np.maximum(np.maximum(a0 - a, a - a1), np.maximum(b0 - b, b - b1)))
        hook = np.maximum.reduce([box(0.2, 2.55, 0.84, 0.84 + bar), box(2.55 - bar, 2.55, 0.06, 0.84 + bar),
                                  box(1.05, 2.55, 0.06, 0.06 + bar), box(1.05, 1.05 + bar, 0.06, 0.64)])
        return hook * on

    def spots(self, X, Y, Z):
        """(ring, boss): the sunk broken ring and the boss left standing in it."""
        ring = np.zeros_like(X)
        boss = np.zeros_like(X)
        P = np.stack([X, Y, Z], axis=1)
        for (c, n, r, ph) in self.rosettes:
            v = P - c
            near = np.nonzero(np.einsum('ij,ij->i', v, v) < (r + 0.8) ** 2)[0]
            if not len(near):
                continue
            v = v[near]
            t = np.cross(n, (0.0, 0.0, 1.0)) if abs(n[2]) < 0.9 else np.cross(n, (1.0, 0.0, 0.0))
            t /= np.linalg.norm(t)
            b = np.cross(n, t)
            a, bb = v @ t, v @ b
            rho = np.sqrt(a * a + bb * bb)
            ang = (np.arctan2(bb, a) + ph) % (TAU / 3)
            gapped = sstep(0.16, 0.4, np.minimum(ang, TAU / 3 - ang) * r)
            ring[near] = np.maximum(ring[near], sstep(0.52, 0.2, np.abs(rho - r)) * gapped)
            boss[near] = np.maximum(boss[near], sstep(0.5, 0.3, rho))
        return ring, boss

    @staticmethod
    def nape(X, Y, Z):
        """(frame, panel) of the cartouches down the back of the skull."""
        cx, cy = AXIS
        th = np.arctan2(X - cx, Y - cy)
        back = (math.pi - np.abs(th)) * 9.0
        on = (back < 1.7) & (Y < cy - 5.2) & (Z > 3.5) & (Z < 11.6)
        k = np.floor((Z - 3.5) / 2.7)
        b = Z - 3.5 - k * 2.7 - 1.35
        m = np.maximum(back, np.abs(b))
        frame = sstep(0.08, 0.0, np.abs(m - 1.12) - 0.16)
        bars = np.where(k % 2 == 0, sstep(0.07, 0.0, np.abs(back - 0.42) - 0.15) * (np.abs(b) < 0.62),
                        sstep(0.07, 0.0, np.abs(np.abs(b) - 0.36) - 0.14) * (back < 0.62))
        panel = (m < 0.96) * (1.0 - bars)
        return np.maximum(frame, bars * (m < 0.96)) * on, panel * on

    def carve(self, f):
        f.displace(lambda X, Y, Z: -0.16 * self.collar(X, Y, Z), band=0.5)

        def spots(X, Y, Z):
            ring, boss = self.spots(X, Y, Z)
            return 0.3 * ring - 0.06 * boss
        f.displace(spots, band=0.5)

        def nape(X, Y, Z):
            frame, panel = self.nape(X, Y, Z)
            return 0.22 * panel - 0.12 * frame
        f.displace(nape, band=0.5)

    def shade(self, P):
        """How much darker (or lighter) the carving leaves each point."""
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        ring, boss = self.spots(X, Y, Z)
        frame, panel = self.nape(X, Y, Z)
        col = self.collar(X, Y, Z)
        return (1.0 - 0.42 * ring) * (1.0 + 0.1 * boss * (1 - ring)) * (1.0 - 0.34 * panel) * (1.0 + 0.1 * frame) \
            * (1.0 + 0.12 * col)


def carve_relief(f, relief, seed=7):
    """Cut the builders' relief into the field, then the snarl, the cheek
    whorls and the nostrils; then weather, crack and chip it."""
    relief.carve(f)
    # the snarl: furrows across the bridge and up from the nose, the forehead knit
    for k in range(3):
        lz, y = -3.4 + k * 1.2, 8.85 + k * 0.45
        f.groove(Polyline([G(-1.9, lz + 0.45, y - 0.7), G(0, lz, y), G(1.9, lz + 0.45, y - 0.7)], 0.05), 0.3, 0.34)
    for s in (1, -1):
        f.groove(Polyline([G(s * 1.6, -5.0, 7.1), G(s * 2.8, -3.4, 7.8), G(s * 3.9, -1.2, 8.2)], 0.05), 0.3, 0.36)
        f.groove(Polyline([G(s * 0.9, -0.4, 11.9), G(s * 1.3, 1.5, 13.2), G(s * 1.9, 3.6, 14.2)], 0.05), 0.26, 0.32)
        # the shadow line cut under the cheekbone
        f.groove(Polyline([G(s * 5.2, -0.6, 7.9), G(s * 8.8, 1.4, 7.9), G(s * 10.2, 5.0, 8.3)], 0.05), 0.4, 0.45)
        # the whorl of the cheek ruff
        pts = []
        for i in range(22):
            t = i / 21
            a = 0.9 + t * TAU * 1.3
            rr = 2.1 * (1 - 0.74 * t)
            pts.append(G(s * 10.2, 4.4 + math.cos(a) * rr, 5.5 + math.sin(a) * rr * 0.82))
        pts = f.snap(np.array(pts), lift=0.0, steps=5)
        f.groove(Polyline([tuple(p) for p in pts], 0.05), 0.26, 0.3)
    # the nostrils and the split of the lip
    for s in (1, -1):
        f.sub(Ellipsoid(G(s * 0.72, NOSE['lz'] - 0.02, NOSE['y'] - 0.22), (0.5, 0.5, 0.27), rot(ry=s * 0.5)), 0.12)
    f.groove(Polyline([G(0, NOSE['lz'] + 0.1, NOSE['y'] - 0.75), G(0, MUZZLE_FRONT - 0.3, 6.9)], 0.05), 0.24, 0.24)
    # centuries
    n1, n2 = Noise(seed), Noise(seed + 12)
    f.displace(lambda X, Y, Z: 0.11 * n1.fbm(X * 0.23, Y * 0.23, Z * 0.23, 3) + 0.045 * n1.fbm(X * 0.9 + 9, Y * 0.9, Z * 0.9, 2),
               band=0.6)
    f.displace(lambda X, Y, Z: 0.5 * np.maximum(0.0, n2.ridged(X * 0.16, Y * 0.16, Z * 0.12, 3) - 1.12), band=0.6)
    rng = np.random.default_rng(seed)
    for (x, lz, y, r) in ((6.4, 16.2, 9.6, 2.6), (8.8, 13.6, 6.4, 1.9), (-9.7, 3.6, 12.9, 1.0), (-4.6, 0.4, 13.8, 0.9),
                          (4.2, -4.7, 4.6, 0.5), (-6.6, -0.6, 2.2, 0.8), (-8.6, 11.0, 3.6, 1.1), (2.5, 17.8, 5.2, 1.2),
                          (9.9, 5.6, 3.9, 0.9), (-2.6, -5.3, 7.9, 0.4)):
        f.sub(Ellipsoid(G(x, lz, y), (r * rng.uniform(1.0, 1.5), r, r * rng.uniform(0.8, 1.2))), 0.3)


def build_ear(sign, broken, voxel=0.11):
    """One ear: a rounded slab laid a little back and turned outward, a deep
    cup carved in its face. The east one has lost its tip."""
    c = np.array(G(sign * EAR['x'], EAR['lz'], EAR['y']))
    R = rot(rx=EAR['back'], rz=-sign * EAR['yaw'])
    f = js.Field(c - 5.2, c + 5.2, voxel)
    _fill(f, Ellipsoid(c, (EAR['rx'], EAR['ry'], EAR['rz']), R))
    f.add(Ellipsoid(c - np.array((0, 0, EAR['rz'] - 0.8)), (2.15, 1.3, 1.7), R), 0.8)
    face = R @ np.array((0.0, 1.0, 0.0))
    f.sub(Ellipsoid(c + face * 0.66 + np.array((0, 0, 0.15)), (EAR['rx'] - 0.8, 0.66, EAR['rz'] - 0.95), R), 0.3)
    # the fold inside the cup
    f.add(RoundCone(c + face * 0.05 + R @ np.array((-sign * 0.4, 0, -1.7)),
                    c + face * 0.1 + R @ np.array((-sign * 0.15, 0, 1.2)), 0.32, 0.16), 0.25)
    if broken:
        n = np.array((sign * 0.55, 0.1, 1.0))
        n /= np.linalg.norm(n)
        q = c + np.array((0.0, 0.0, 2.4))

        class Half(js.Prim):
            lo, hi = c - 9.0, c + 9.0

            def dist(self, X, Y, Z):
                return -((X - q[0]) * n[0] + (Y - q[1]) * n[1] + (Z - q[2]) * n[2])
        f.sub(Half(), 0.15)
    nz = Noise(31 + (0 if sign > 0 else 5))
    f.displace(lambda X, Y, Z: 0.09 * nz.fbm(X * 0.5, Y * 0.5, Z * 0.5, 3)
               + (0.3 * nz.fbm(X * 1.1, Y * 1.1, Z * 1.1, 2) * (Z > q[2] - 0.5) if broken else 0.0), band=0.6)
    return f, c, R


def coarse_normal(field, P, h=0.45):
    """The surface's facing at P read over a hand's breadth, so the relief,
    the joints and the chips do not tip it: what the charts that share a
    surface agree on."""
    g = np.zeros_like(P)
    for a in range(3):
        e = np.zeros(3)
        e[a] = h
        g[:, a] = field.sample(P + e) - field.sample(P - e)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


def liner(field, bpy, depth=0.36, target_tris=2600):
    """The head's rubble core: the field's own level set a hand under the
    joints' bottoms, meshed whole through OpenVDB at half the field's
    resolution and decimated hard. It is never seen as a surface; it is what
    stands behind every joint, chip and seam of the skin, so that none of
    them is a hole. Returns (vertices, polygons)."""
    class Half:
        d = np.ascontiguousarray(field.d[::2, ::2, ::2]) + np.float32(depth)
        voxel = field.voxel * 2
        lo = field.lo
    return js.mesh_field(Half, bpy, target_tris=target_tris)


# ------------------------------------------------------------------ rays
def march(field, O, D, L, tmax, iters=120, step_max=0.3):
    """March each ray from O along D (unit) through the air to the level set
    L of the field. Returns (points, hit). A ray that starts inside the stone,
    or leaves tmax without meeting it, is a miss."""
    n = len(O)
    t = np.zeros(n)
    tmax = np.broadcast_to(np.asarray(tmax, dtype=np.float64), (n,)).copy()
    L = np.asarray(L, dtype=np.float64)
    hit = np.zeros(n, dtype=bool)
    lo = np.zeros(n)
    alive = np.ones(n, dtype=bool)
    d0 = field.sample(O) - L
    alive &= d0 > 0.0
    crossed = np.zeros(n, dtype=bool)
    for _ in range(iters):
        idx = np.nonzero(alive)[0]
        if not len(idx):
            break
        d = field.sample(O[idx] + D[idx] * t[idx, None]) - L[idx]
        inside = d <= 0.0
        crossed[idx[inside]] = True
        alive[idx[inside]] = False
        go = idx[~inside]
        lo[go] = t[go]
        t[go] += np.clip(d[~inside] * 0.7, 0.012, step_max)
        gone = go[t[go] > tmax[go]]
        alive[gone] = False
    idx = np.nonzero(crossed)[0]
    if len(idx):
        a, b = lo[idx].copy(), t[idx].copy()
        for _ in range(12):
            m = (a + b) / 2
            d = field.sample(O[idx] + D[idx] * m[:, None]) - L[idx]
            a = np.where(d > 0, m, a)
            b = np.where(d > 0, b, m)
        t[idx] = (a + b) / 2
        hit[idx] = True
    return O + D * t[:, None], hit


class Bullet:
    """The outside chart: plumb rings of level rays below BULLET_YC, a dome of
    rays through one centre above it. U is the bearing (0 south, toward
    west), V the height (above the cylinder, R0 times the elevation)."""
    wrap = True
    u0, u1 = 0.0, TAU
    per_u = 8.0

    def __init__(self, far=17.0):
        self.far = far
        self.tmax = far - 0.4

    def rays(self, U, V):
        phi = np.maximum(V - BULLET_YC, 0.0) / BULLET_R0
        cp, sp = np.cos(phi), np.sin(phi)
        out = np.stack([cp * np.sin(U), cp * np.cos(U), sp], axis=1)
        base = np.stack([np.full_like(U, AXIS[0]), np.full_like(U, AXIS[1]), np.minimum(V, BULLET_YC)], axis=1)
        return base + out * self.far, -out


class Plane:
    """A flat chart: rays along `d` from the plane through `o` spanned by eu, ev."""
    wrap = False

    def __init__(self, o, eu, ev, d, u, v, tmax):
        self.o, self.eu, self.ev, self.d = (np.asarray(q, dtype=np.float64) for q in (o, eu, ev, d))
        (self.u0, self.u1), (self.v0, self.v1) = u, v
        self.tmax = tmax

    def rays(self, U, V):
        O = self.o + U[:, None] * self.eu + V[:, None] * self.ev
        return O, np.broadcast_to(self.d, O.shape).copy()


class Annulus:
    """The chart of what overhangs the neck (the jowls, the nape, the corbels):
    plumb rays UP from a ring round the neck's axis, U the bearing, V the radius."""
    wrap = False
    per_u = 9.0

    def __init__(self, z, u, v, tmax):
        self.z, self.tmax = z, tmax
        (self.u0, self.u1), (self.v0, self.v1) = u, v

    def rays(self, U, V):
        O = np.stack([AXIS[0] + V * np.sin(U), AXIS[1] + V * np.cos(U), np.full_like(U, self.z)], axis=1)
        return O, np.tile(np.array((0.0, 0.0, 1.0)), (len(U), 1))


class Tunnel:
    """The throat's chart: rays out from the lane's axis, U along it (lz), V
    the arc round it (rho0 times the angle from the west horizon over the top)."""
    wrap = False
    rho0 = 3.0

    def __init__(self, z, u, a, tmax=5.2):
        self.z = z
        self.u0, self.u1 = u
        self.v0, self.v1 = a[0] * self.rho0, a[1] * self.rho0
        self.tmax = tmax

    def rays(self, U, V):
        a = V / self.rho0
        O = np.stack([np.zeros_like(U), -U, np.full_like(U, self.z)], axis=1)
        return O, np.stack([np.cos(a), np.zeros_like(a), np.sin(a)], axis=1)


class Sphere:
    """A chart round one centre: U the bearing round `axis` (the pole), V the
    polar arc from the pole (r0 times the angle). Marches inward from `far`."""
    wrap = True
    u0, u1 = 0.0, TAU
    per_u = 1.5

    def __init__(self, c, R, r0, v, far=5.6, pole='y'):
        self.c, self.R, self.r0, self.far, self.pole = np.asarray(c), R, r0, far, pole
        self.v0, self.v1 = v
        self.tmax = far - 0.3

    def rays(self, U, V):
        th = V / self.r0
        # the pole is the frame's +Y (the ear's face) or its +Z (its tip)
        if self.pole == 'z':
            loc = np.stack([np.sin(th) * np.cos(U), np.sin(th) * np.sin(U), np.cos(th)], axis=1)
        else:
            loc = np.stack([np.sin(th) * np.cos(U), np.cos(th), np.sin(th) * np.sin(U)], axis=1)
        out = loc @ self.R.T
        return self.c + out * self.far, -out


# ------------------------------------------------------------------ the skin
def _row_arc(field, chart, v, n):
    """The surface's running length along U at height v (n samples)."""
    U = chart.u0 + (chart.u1 - chart.u0) * np.arange(n + 1) / n
    O, D = chart.rays(U, np.full(n + 1, v))
    P, hit = march(field, O, D, np.zeros(n + 1), chart.tmax)
    seg = np.linalg.norm(P[1:] - P[:-1], axis=1)
    miss = getattr(chart, 'per_u', 1.0) * (chart.u1 - chart.u0) / n
    seg = np.where(hit[1:] & hit[:-1], np.minimum(seg, 0.9), miss)
    return U, np.concatenate([[0.0], np.cumsum(seg)])


def _joints(rng, U, S, width, wrap):
    """Joint positions (U) along a row whose running length is S(U)."""
    total = S[-1]
    cuts = []
    s = rng.uniform(0.0, width[1]) if wrap else 0.0
    start = s
    while True:
        cuts.append(s)
        s += rng.uniform(*width)
        if s > start + total - width[0] * 0.65:
            break
    if not wrap:
        cuts.append(total)
    return [float(np.interp(c % total if wrap else c, S, U)) for c in cuts], cuts


def lay_out(field, chart, rng, rows, width, tall=0.16, samples=420):
    """Fitted blocks over a chart: `rows` are the bed joints (V), each row cut
    into blocks of `width(v)` yards; in each pair of rows some blocks stand
    two rows tall. Returns [(ua, ub, va, vb, length)] (ub > ua, past u1 when
    a block of a wrapped chart crosses the seam)."""
    span = chart.u1 - chart.u0
    per_row = []
    for i in range(len(rows) - 1):
        v = (rows[i] + rows[i + 1]) / 2
        U, S = _row_arc(field, chart, v, samples)
        us, _ = _joints(rng, U, S, width(v), chart.wrap)
        us = sorted(us)
        if chart.wrap:
            us = us + [us[0] + span]
        per_row.append((us, U, S))
    blocks = []

    def length(U, S, ua, ub):
        total = S[-1]
        a = float(np.interp((ua - chart.u0) % span + chart.u0, U, S)) if chart.wrap else float(np.interp(ua, U, S))
        b = float(np.interp((ub - chart.u0) % span + chart.u0, U, S)) if chart.wrap else float(np.interp(ub, U, S))
        ln = b - a
        if chart.wrap and (ln <= 0 or ub - ua > span * 0.9):
            ln += total
        return max(ln, 0.05)

    i = 0
    while i < len(per_row):
        us, U, S = per_row[i]
        pair = i + 1 < len(per_row) and tall > 0
        taken = []
        if pair:
            us2, U2, S2 = per_row[i + 1]
            for k in range(len(us) - 1):
                if rng.random() < tall and (not taken or taken[-1][1] <= us[k]):
                    taken.append((us[k], us[k + 1]))
            keep = []
            for (a, b) in zip(us2, us2[1:]):
                keep.append([a, b])
            # the upper row gives way to each tall block: its joints inside the
            # block go, the blocks cut by it are trimmed to its sides
            out = []
            for (a, b) in keep:
                segs = [(a, b)]
                for (ta, tb) in taken:
                    for shift in ((0.0, -span, span) if chart.wrap else (0.0,)):
                        ta2, tb2 = ta + shift, tb + shift
                        nxt = []
                        for (x0, x1) in segs:
                            if tb2 <= x0 or ta2 >= x1:
                                nxt.append((x0, x1))
                                continue
                            if ta2 - x0 > 1e-6:
                                nxt.append((x0, ta2))
                            if x1 - tb2 > 1e-6:
                                nxt.append((tb2, x1))
                        segs = nxt
                out.extend(segs)
            for (a, b) in out:
                blocks.append((a, b, rows[i + 1], rows[i + 2], length(U2, S2, a, b)))
        for k in range(len(us) - 1):
            a, b = us[k], us[k + 1]
            if (a, b) in taken:
                blocks.append((a, b, rows[i], rows[i + 2], length(U, S, a, b)))
            else:
                blocks.append((a, b, rows[i], rows[i + 1], length(U, S, a, b)))
        i += 2 if pair else 1
    return blocks


def megalith_skin(piece, field, chart, blocks, rng, tone, cell=0.4, gap=0.13, depth=0.26, proud=(-0.03, 0.09),
                  keep=None, flag=None, chip=0.3, shade=None, height=None, kind=None, mat=0, jump=1.3):
    """Build the blocks as patches on `piece` (a Ruin): see the module's head.
    tone(P) is a block's colour at its middle; cell(P) or a number the size
    of a facet inside a block; flag(P) marks points no block may use (a cell
    with one is left out); keep(P, N) decides per facet (centres, normals) for
    the charts that share a surface; shade(P) multiplies the vertices' colours;
    height(vb - va, v) is a row's real height where V is not yards."""
    from mathutils import Vector
    specs = []          # per block: (index range, nu, nv, tone)
    Us, Vs, Ls = [], [], []
    for (ua, ub, va, vb, ln) in blocks:
        vm = (va + vb) / 2
        hgt = height(vb - va, vm) if height else vb - va
        c = cell if not callable(cell) else cell((ua + ub) / 2, vm)
        nu = max(1, min(16, int(round(ln / c))))
        nv = max(1, min(12, int(round(hgt / c))))
        g = min(gap, 0.3 * ln, 0.3 * hgt)
        gu = g * (ub - ua) / ln
        gv = g * (vb - va) / hgt
        lvl = rng.uniform(*proud)
        if rng.random() < 0.07:
            lvl = proud[0] - 0.09
        start = len(Us)
        chipped = rng.randrange(4) if rng.random() < chip else -1
        for j in range(nv + 1):
            for i in range(nu + 1):
                u = ua + gu + (ub - ua - 2 * gu) * i / nu
                v = va + gv + (vb - va - 2 * gv) * j / nv
                lv = lvl + 0.03 * math.sin(math.pi * i / nu) * math.sin(math.pi * j / nv)
                corner = (i in (0, nu)) and (j in (0, nv))
                if corner and chipped == (1 if i else 0) + (2 if j else 0):
                    lv -= rng.uniform(0.1, 0.24)
                    u += (0.35 if i == 0 else -0.35) * (ub - ua - 2 * gu) / nu
                    v += (0.35 if j == 0 else -0.35) * (vb - va - 2 * gv) / nv
                Us.append(u)
                Vs.append(v)
                Ls.append(lv)
        # the joint's bottom: the block's own outline, a touch past it, sunk
        ou, ov = 0.25 * gu, 0.25 * gv
        ring = []
        for i in range(nu + 1):
            ring.append((ua - ou + (ub - ua + 2 * ou) * i / nu, va - ov))
        for j in range(1, nv + 1):
            ring.append((ub + ou, va - ov + (vb - va + 2 * ov) * j / nv))
        for i in range(nu - 1, -1, -1):
            ring.append((ua - ou + (ub - ua + 2 * ou) * i / nu, vb + ov))
        for j in range(nv - 1, 0, -1):
            ring.append((ua - ou, va - ov + (vb - va + 2 * ov) * j / nv))
        for (u, v) in ring:
            Us.append(u)
            Vs.append(v)
            Ls.append(-depth)
        specs.append((start, nu, nv, len(ring)))
    U, V, L = np.array(Us), np.array(Vs), np.array(Ls)
    if chart.wrap:
        U = (U - chart.u0) % (chart.u1 - chart.u0) + chart.u0
    O, D = chart.rays(U, V)
    P, hit = march(field, O, D, L, chart.tmax)
    bad = ~hit
    if flag is not None:
        bad |= flag(P)
    K = shade(P) if shade is not None else None
    bm, col = piece.bm, piece.col
    made = 0
    for (start, nu, nv, nring) in specs:
        w = nu + 1
        centre = P[start + (nv // 2) * w + nu // 2]
        base = tone(centre)

        def grid(i, j, start=start, w=w):
            return start + j * w + i
        r0 = start + (nv + 1) * w
        # the face's outline in the ring's order
        edge = [grid(i, 0) for i in range(nu + 1)] + [grid(nu, j) for j in range(1, nv + 1)] + \
            [grid(i, nv) for i in range(nu - 1, -1, -1)] + [grid(0, j) for j in range(nv - 1, 0, -1)]
        quads = [((grid(i, j), grid(i + 1, j), grid(i + 1, j + 1), grid(i, j + 1)), False)
                 for j in range(nv) for i in range(nu)]
        quads += [((edge[k], edge[(k + 1) % nring], r0 + (k + 1) % nring, r0 + k), True) for k in range(nring)]
        cen = np.array([P[list(q)].mean(axis=0) for (q, _s) in quads])
        nrm = np.array([np.cross(P[q[2]] - P[q[0]], P[q[3]] - P[q[1]]) for (q, _s) in quads])
        nl = np.linalg.norm(nrm, axis=1, keepdims=True)
        nrm = nrm / np.maximum(nl, 1e-9)
        flip = np.einsum('ij,ij->i', nrm, D[[q[0] for (q, _s) in quads]]) > 0
        nrm[flip] *= -1
        ok = np.array([not bad[list(q)].any() for (q, _s) in quads]) & (nl[:, 0] > 1e-7)
        # a facet that bridges two surfaces across a gap (its rays met the
        # muzzle on one side and the cheek behind it on the other) is no stone
        qi = np.array([q for (q, _s) in quads])
        long = np.max(np.linalg.norm(P[qi] - P[np.roll(qi, 1, axis=1)], axis=2), axis=1)
        off = np.abs(field.sample(cen) - L[qi].mean(axis=1))
        ok &= ~((long > jump) & (off > 0.2))
        nf = nu * nv
        if keep is not None:
            ok[:nf] &= keep(cen[:nf], nrm[:nf])
        # a joint's chamfer goes with the facet it borders
        adj = [k for k in range(nu)] + [j * nu + nu - 1 for j in range(nv)] + \
            [(nv - 1) * nu + nu - 1 - m for m in range(nu)] + [(nv - 1 - m) * nu for m in range(nv)]
        ok[nf:] &= ok[:nf][adj]
        if not ok.any():
            continue
        verts = {}
        edge_set = set(edge)
        k_tone = 1.0 + 0.05 * (rng.random() - 0.5)
        for qi, (q, skirt) in enumerate(quads):
            if not ok[qi]:
                continue
            order = q[::-1] if flip[qi] else q
            vs = []
            for idx in order:
                if idx not in verts:
                    verts[idx] = bm.verts.new(Vector(P[idx]))
                vs.append(verts[idx])
            try:
                face = bm.faces.new(vs)
            except ValueError:
                continue
            face.material_index = mat
            face[piece.kindL] = piece.kind if kind is None else kind
            jit = k_tone * (0.97 + 0.06 * rng.random())
            for loop, idx in zip(face.loops, order):
                if idx >= r0:
                    k = 0.3
                elif idx in edge_set:
                    k = 1.09 * jit
                else:
                    k = jit
                if K is not None:
                    k *= K[idx]
                loop[col] = (min(1.0, base[0] * k), min(1.0, base[1] * k), min(1.0, base[2] * k), 1.0)
            made += 1
    return made
