"""The Wildheart Basin world entrance: the Jaguar Maw.

  blender -b --factory-startup --python build_wildheart_entrance.py -- --out DIR
      [--terrain DIR] [--renders all|quick|none] [--tag NAME] [--no-ao] [--holes]

The Sunken Idol of the Palmreach (door (-237, 1093)) opened: the head of a
roaring jaguar, as big as a temple, raised of fitted megaliths and carved
across their joints, standing on the low rise beside the Sunken Idol's ring of
columns where the road comes up from the south. Only the head is above ground:
its neck plunges into the rise under a carved collar, the knoll has taken its
nape and the ground falls away from its west cheek down a bank to the Sapphire
Lagoon; the whole mass leans west and forward, over whoever walks up to it.
The door is its open maw. The upper jaw hangs four yards out over a causeway
of heaved flagstones that climbs the rise between the Sunbone's two great
tusks and two troll fire bowls; the lower jaw is the threshold, a ramus with
its canine either side of the way in; black water stands in the throat. Two
slanted eyes with jade pupils watch the road from under brows driven down in
fury; one ear stands against the sky and the other lies where it fell; a
strangler fig has rooted in the crown and poured its roots down the temples,
the bank and into the water.

The head's form is a signed distance field (wildheart_idol_sculpt.py, the
primitives of the idol INSIDE the basin, kit/jaguar_head_sculpt.py) and its
surface a skin of megaliths laid out on charts of that field (--holes prints
what the skin leaves open and what leaves the colliders). The simulation's
colliders (src/sim/wildheart_basin_entrance.ts) are older than this head and
are not its to move: below three yards over the ground the stone fills them
and never leaves them (the neck is the head collider's drum, the lower jaw the
two muzzle boxes); everything that makes it a cat's skull overhangs above.

The door's own calm pad (src/sim/terrain_calm_anchors.ts) is what raises the
rise: the terrain within seven yards of a dungeon door is the classic field,
which domes here. So the height grid must be probed with the door ALREADY at
its place in src/sim/content/wildheart.ts.

Run from the repo: --out tmp/asset_src/wildheart_basin_entrance --terrain <dir
of the probe's wildheart_heightgrid.json and wildheart_surroundings.json>
(probe.mts beside this file writes them:
`npx tsx probe.mts wildheart -237 1093 <dir> 40 120`), then
node scripts/assets/wildheart_basin_entrance/build.mjs.

Local game coords via ec.B(lx, lz, y): lx = x + 237 (+ WEST), lz = z - 1093
(+ NORTH), y = y - terrainHeight(-237, 1093). In Blender that is X = lx,
Y = -lz (so SOUTH is +Y), Z = y. Three GLBs share ONE origin, the door at its
terrain height:
  wildheart_basin_entrance.glb         the idol: skull, jaws, eyes, fangs, ears, the fig's trunk and roots
  wildheart_basin_entrance_court.glb   the causeway, the fire bowls, the tusks, fallen stone
  wildheart_basin_entrance_growth.glb  the fig's crown, lianas, fern, taro, reed, moss
Materials: KitStone (lit, vertex colour), KitLeaf (lit, double sided),
KitGlow (the coals in the fire bowls, unlit), KitWet (lit and glossy: the
jade of the eyes).
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'kit'))
import entrance_common as ec  # noqa: E402
import wildheart_idol_sculpt as sc  # noqa: E402
import wildheart_ruin_kit as rk  # noqa: E402
from wildheart_ruin_kit import (COURT, COURT_DARK, COURT_PALE, COURT_WARM, GLOW, K_CLOTH, K_EARTH, K_GLASS,  # noqa: E402
                                K_LEAF, K_METAL, K_PAVE, K_RAW, K_STONE, K_WOOD, LEAF, STONE, TAU, WET, Ruin,
                                fbm, mix, scale, smooth)

B = ec.B
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


OUT = arg('--out', os.path.join(HERE, 'out'))
TERRAIN = arg('--terrain', os.path.join(OUT, 'terreno'))
RENDERS = arg('--renders', 'none')
TAG = arg('--tag', '')

GR = ec.Ground(os.path.join(TERRAIN, 'wildheart_heightgrid.json'))
SURR = json.load(open(os.path.join(TERRAIN, 'wildheart_surroundings.json')))
gh = GR.h
WORLD_WATER = -4.3                       # src/sim/world.ts WATER_LEVEL
WATER_Y = WORLD_WATER - GR.dy            # the lagoon, above the door's ground

VOIDC = (0.014, 0.018, 0.014)
JADE = (0.10, 0.50, 0.30)
JADE_PALE = (0.36, 0.78, 0.52)
IVORY = (0.88, 0.80, 0.60)
IVORY_DARK = (0.52, 0.42, 0.27)
WAR_RED = (0.55, 0.15, 0.10)
WAR_OCHRE = (0.82, 0.62, 0.26)
GUM = (0.42, 0.17, 0.13)
LEATHER = (0.17, 0.15, 0.13)
BARK = (0.43, 0.37, 0.28)
BARK_DARK = (0.27, 0.22, 0.16)
BRONZE = (0.36, 0.27, 0.14)
COAL = (1.0, 0.46, 0.12)
CANOPY = ((0.15, 0.36, 0.14), (0.21, 0.45, 0.17), (0.29, 0.53, 0.19), (0.40, 0.60, 0.22))
FERN = ((0.18, 0.42, 0.14), (0.26, 0.52, 0.17), (0.34, 0.56, 0.18))
BROAD = ((0.15, 0.40, 0.17), (0.22, 0.50, 0.20), (0.30, 0.56, 0.20))
TARO = ((0.13, 0.37, 0.19), (0.18, 0.46, 0.21), (0.25, 0.53, 0.22))

# The simulation's solids for the head (src/sim/wildheart_basin_entrance.ts
# WILDHEART_BASIN_ENTRANCE_COLLIDERS), given: the build fits them, it never
# measures new ones. The court's rows are measured below, as they always were.
COLLIDERS = [
    {'name': 'head', 'type': 'circle', 'lx': 0.0, 'lz': 8.8, 'r': 8.05, 'top': 15.8},
    {'name': 'muzzle_w', 'type': 'obb', 'lx': 3.74, 'lz': 0.968, 'hw': 2.83, 'hd': 1.45, 'rot': -0.4455, 'top': 8.4},
    {'name': 'muzzle_e', 'type': 'obb', 'lx': -3.74, 'lz': 0.968, 'hw': 2.83, 'hd': 1.45, 'rot': -2.6961, 'top': 8.4},
]
FOOTINGS = []
SOCKETS = {'drips': [], 'eyes': [], 'braziers': [], 'tusks': []}

# ---- the plan (door-local, upright; the lean is applied last) -------------------
HEAD_Z = 8.8          # the neck's axis: the head collider's centre
HEAD_R = sc.NECK_R    # the neck, a hand inside the collider's 8.05
HEAD_TOP = 15.4       # the crown, where the fig stands
MUZ_S = -1.6          # the lower jaw's front (the muzzle colliders' south corner)
MOUTH = dict(half=2.5, spring=3.6, rise=2.5)   # the throat's window (the engine's)
LANE = 1.35           # half width of the walk-in lane between the lower teeth
WINDOW_Z = 1.3        # the engine's throat window stands here
LEAN_ROLL = math.radians(2.5)      # the crown toward the WEST (the lagoon)
LEAN_PITCH = math.radians(2.0)     # and SOUTH, over the causeway
LEAN = Matrix.Rotation(LEAN_ROLL, 4, 'Y') @ Matrix.Rotation(-LEAN_PITCH, 4, 'X')
EXIT_DROP = (0.0, -4.0)
BRAZIERS = [(4.4, -3.4), (-4.4, -3.4)]
TUSKS = [(3.7, -11.4), (-6.3, -12.2)]
# The causeway: flagstones from the flat at the rise's foot into the maw. Its
# foot swings a yard and a half east, off the bank's shoulder and toward the
# road (APRON_SWING, apron_c).
APRON = dict(z0=-14.6, z1=1.1, hw_in=2.3, hw_mouth=3.0, hw_far=3.6)
APRON_SWING = -1.6
EAR_HEAP = (-6.5, 2.8, 1.5)
# The Sunken Idol's ring of columns (centre (-256, 1090), radius 8, its
# guardian's camp inside it): nothing of the entrance stands within four yards.
RING = (-256.0 - GR.door['x'], 1090.0 - GR.door['z'])
RING_CLEAR = 12.0
# The ways in, kept clear of every solid and of the taller growth: up the
# causeway, from the road's end at (-256, 1072) and from the ring's west gap.
ROAD_END = (-256.0 - GR.door['x'], 1072.0 - GR.door['z'])
WAYS = [[(APRON_SWING, APRON['z0']), (-1.0, -10.0), (-0.3, -6.5), (0.0, -4.0), (0.0, 1.0)],
        [ROAD_END, (-6.5, -17.0), (APRON_SWING, APRON['z0'])],
        [(RING[0] + 8.0, RING[1]), (-5.6, -7.5), (-0.5, -7.0)]]


def gb(x, y):
    """Ground height at a Blender XY."""
    return gh(x, -y)


def g(v, w):
    return math.exp(-(v / w) ** 2)


def ring_clear(x, z, pad=0.0):
    return math.hypot(x - RING[0], z - RING[1]) >= RING_CLEAR + pad


def way_dist(x, z):
    """Distance from a point to the nearest way in."""
    best = 1e9
    for way in WAYS:
        for (ax, az), (bx, bz) in zip(way, way[1:]):
            ux, uz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)))
            best = min(best, math.hypot(x - ax - ux * t, z - az - uz * t))
    return best


def apron_c(z):
    """The causeway's centre line (lx) at lz."""
    return APRON_SWING * smooth(-4.5, APRON['z0'], z)


def apron_hw(z):
    """The causeway's half width: narrow between the lower teeth, fanning out
    to the tusks at its foot."""
    if z > MUZ_S - 0.2:
        return APRON['hw_in']
    return APRON['hw_mouth'] + (APRON['hw_far'] - APRON['hw_mouth']) * smooth(-3.0, -13.0, z)


def collider_circle(name, cx, cz, r, top):
    COLLIDERS.append({'name': name, 'type': 'circle', 'lx': round(cx, 3), 'lz': round(cz, 3), 'r': round(r, 3),
                      'top': round(top, 2)})


def footing(name, cx, cz, hw, hd, rot, bury, extra=()):
    """Register a footing and return its underside: `bury` under the lowest
    ground anywhere under its box (the sim test samples its centre and four
    corners) and at the `extra` points (a round foot's own rim)."""
    lo = min([GR.footprint_range(cx, cz, hw, hd, rot, 0.25)[0]] + [gh(x, z) for (x, z) in extra])
    FOOTINGS.append((name, cx, cz, hw, hd, rot, lo - bury))
    return lo - bury


def leaned(p):
    """A Blender point after the idol's lean, as door-local (lx, y, lz)."""
    q = LEAN @ Vector(p)
    return [round(q.x, 3), round(q.z, 3), round(-q.y, 3)]


def spline(pts, steps=4):
    """Catmull-Rom through pts."""
    pts = [Vector(q) for q in pts]
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
        for k in range(steps):
            t = k / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def slope_matrix(lx, lz, yaw=0.0, lift=0.0):
    """A frame lying on the terrain at (lx, lz): Z along the ground normal."""
    e = 0.4
    dx = (gh(lx + e, lz) - gh(lx - e, lz)) / (2 * e)
    dz = (gh(lx, lz + e) - gh(lx, lz - e)) / (2 * e)
    n = Vector((-dx, dz, 1.0)).normalized()
    x = Vector((math.cos(yaw), math.sin(yaw), 0))
    x = (x - n * x.dot(n)).normalized()
    y = n.cross(x)
    R = Matrix((x, y, n)).transposed().to_4x4()
    return Matrix.Translation(B(lx, lz, gh(lx, lz)) + n * lift) @ R


class Jungle(Ruin):
    """The ruin kit plus what a jungle idol needs: limbs and roots, a leaf
    crown, lianas, fern, broadleaf."""

    def solid(self, faces):
        bmesh.ops.recalc_face_normals(self.bm, faces=[f for f in faces if f.is_valid])
        return faces

    def limb(self, pts, r0, r1, color, sides=6, kind=K_WOOD, squash=1.0, wobble=0.0, steps=3):
        """A root, a trunk strand or a tusk: a tapering tube along a spline."""
        path = spline(pts, steps)
        if wobble:
            rng = self.rng
            for i in range(1, len(path) - 1):
                path[i] = path[i] + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * wobble
        with self.as_kind(kind):
            faces = self.sweep(path, r0, r1, color, sides=sides, squash=squash)
        self.solid(faces)
        rng = self.rng
        dark, light = scale(color, 0.62), scale(color, 1.16)
        for f in faces:
            f.normal_update()
            k = rng.random()
            for loop in f.loops:
                c = mix(dark, light, 0.35 + 0.65 * k if f.normal.z > -0.2 else 0.15)
                loop[self.col] = (*c, 1.0)
        return path

    def tooth(self, base, tip, r0, color, bend=(0, 0, 0), sides=6):
        """A fang: a curved cone, dark and stained at the root."""
        base, tip, bend = Vector(base), Vector(tip), Vector(bend)
        pts = [base + (tip - base) * t + bend * math.sin(math.pi * t) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        with self.as_kind(K_STONE):
            faces = self.sweep(pts, r0, max(0.025, r0 * 0.07), color, sides=sides)
        self.solid(faces)
        n = (tip - base).length
        for f in faces:
            for loop in f.loops:
                t = (loop.vert.co - base).length / n
                c = mix(IVORY_DARK, color, smooth(0.0, 0.45, t))
                c = scale(c, 0.9 + 0.2 * self.rng.random())
                loop[self.col] = (*c, 1.0)

    def blob(self, center, size, jitter=0.24, sub=2):
        """A mass of the fig's crown: a faceted leaf cloud, dark underneath."""
        center = Vector(center)
        rng = self.rng
        base = CANOPY[rng.randrange(len(CANOPY))]
        made = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=0.5)
        for v in made['verts']:
            k = 1 + (rng.random() - 0.5) * 2 * jitter
            d = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2] * k))
            if d.z < 0:
                d.z *= 0.72
            v.co = center + d
        faces = [f for f in {f for v in made['verts'] for f in v.link_faces}]
        faces.sort(key=lambda f: (round(f.calc_center_median().x, 5), round(f.calc_center_median().y, 5),
                                  round(f.calc_center_median().z, 5)))
        for f in faces:
            f.material_index = LEAF
            f[self.kindL] = K_LEAF
            f.normal_update()
            up = f.normal.z
            patch = fbm(f.calc_center_median().x * 0.5, f.calc_center_median().y * 0.5, f.calc_center_median().z * 0.5)
            c = mix(base, CANOPY[(int(patch * 9)) % len(CANOPY)], 0.5)
            c = scale(c, (0.68 + 0.5 * smooth(-0.7, 0.8, up)) * (0.88 + 0.24 * rng.random()))
            for loop in f.loops:
                loop[self.col] = (*c, 1.0)

    def frond(self, base, heading, length, width, color, rise=0.55, droop=0.7, pinnae=6):
        """One fern frond: a spine that rises and arches over, leaflets in pairs."""
        base = Vector(base)
        d = Vector((math.cos(heading), math.sin(heading), 0))
        side = Vector((-d.y, d.x, 0))
        spine = []
        for i in range(pinnae + 1):
            t = i / pinnae
            spine.append(base + d * (length * t) + Vector((0, 0, length * (rise * t - droop * t * t))))
        for i in range(pinnae):
            t = (i + 0.5) / pinnae
            w = width * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.7 * (1 - 0.35 * t)
            a, b = spine[i], spine[i + 1]
            mid = (a + b) / 2
            for sgn in (-1, 1):
                tip = mid + side * (sgn * w) + (b - a) * 0.55 - Vector((0, 0, w * 0.22))
                f = self.bm.faces.new([self.bm.verts.new(q) for q in (a, b, tip)])
                f.material_index = LEAF
                f[self.kindL] = K_LEAF
                ls = f.loops
                ls[0][self.col] = (*scale(color, 0.55), 1.0)
                ls[1][self.col] = (*scale(color, 0.7), 1.0)
                ls[2][self.col] = (*scale(color, 1.25), 1.0)

    def fern(self, pos, fronds=8, length=1.1, width=0.3):
        rng = self.rng
        p0 = Vector(pos)
        for k in range(fronds):
            a = TAU * k / fronds + rng.uniform(-0.3, 0.3)
            c = self.vary(FERN[rng.randrange(len(FERN))], 0.12)
            ln = length * rng.uniform(0.7, 1.2)
            self.frond(p0 + Vector((0, 0, -0.05)), a, ln, width * rng.uniform(0.8, 1.2), c,
                       rise=rng.uniform(0.75, 1.1), droop=rng.uniform(0.6, 0.95), pinnae=5 if ln < 1.0 else 6)

    def broadleaf(self, pos, leaves=5, length=1.5, width=0.5):
        """A clump of big paddle leaves on arching stalks."""
        rng = self.rng
        p0 = Vector(pos)
        for k in range(leaves):
            a = TAU * k / leaves + rng.uniform(-0.5, 0.5)
            d = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-d.y, d.x, 0))
            ln = length * rng.uniform(0.7, 1.2)
            up = rng.uniform(0.75, 1.25)
            c = self.vary(BROAD[rng.randrange(len(BROAD))], 0.12)
            prev = None
            for i, wk in enumerate((0.05, 0.6, 1.0, 0.72, 0.0)):
                t = i / 4
                q = p0 + d * (ln * (0.2 * t + 0.8 * t * t)) + Vector((0, 0, ln * (up * t - 0.75 * t * t * t)))
                w = width * wk
                dip = Vector((0, 0, w * 0.28))
                cur = (q - side * w + dip, q + side * w + dip, q)
                if prev is not None:
                    for (ka, shade) in ((0, 1.16), (1, 0.84)):
                        pts = [prev[2], prev[ka], cur[ka], cur[2]] if wk > 0 else [prev[2], prev[ka], cur[2]]
                        f = self.bm.faces.new([self.bm.verts.new(v) for v in pts])
                        f.material_index = LEAF
                        f[self.kindL] = K_LEAF
                        for loop in f.loops:
                            loop[self.col] = (*scale(c, shade * (0.66 + 0.5 * t)), 1.0)
                prev = cur

    def liana(self, a, b, sag=0.6, r=0.035, leaves=0.5, color=None):
        """A liana or an aerial root from a to b, hanging in a curve, with a
        few leaf sprays along it."""
        rng = self.rng
        a, b = Vector(a), Vector(b)
        n = max(3, int((b - a).length / 0.9))
        pts = []
        for i in range(n + 1):
            t = i / n
            pts.append(a + (b - a) * t - Vector((0, 0, sag * math.sin(math.pi * t)))
                       + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * (0.06 if 0 < i < n else 0))
        c = color or self.vary(rk.KELP[rng.randrange(len(rk.KELP))], 0.12)
        with self.as_kind(K_WOOD):
            faces = self.sweep(pts, r, r * 0.7, c, sides=3, mat=LEAF, cap=False)
        for f in faces:
            f[self.kindL] = K_LEAF
        for q in pts[1:-1]:
            if rng.random() < leaves:
                self.weed(q, rng.uniform(0.35, 0.8), (rng.uniform(-1, 1), rng.uniform(-1, 1), 0.01), width=0.25, strands=2,
                          leaf=0.2)



class Wild(Jungle):
    """What the v3 idol adds: the megalith skin's tones, a leaf crown in the
    game's own tree language (layered pads of leaf cards, lit as one rounded
    mass), taro."""

    def pad(self, center, radius, index, density=10.5):
        """One mass of the fig's crown: a low dark core and a shell of leaf
        cards laid like shingles, each pointing out and down. Every card
        carries the pad's index so main() can round its normals."""
        rng = self.rng
        c = Vector(center)
        rx, ry, rz = radius * rng.uniform(0.98, 1.12), radius * rng.uniform(0.98, 1.12), radius * rng.uniform(0.33, 0.4)
        tag = self.padL
        base = CANOPY[rng.randrange(1, 3)]
        made = bmesh.ops.create_icosphere(self.bm, subdivisions=2, radius=1.0)
        for v in made['verts']:
            k = 0.62 + 0.08 * rng.random()
            v.co = c + Vector((v.co.x * rx * k, v.co.y * ry * k, v.co.z * rz * k * (0.8 if v.co.z < 0 else 1.0)))
        faces = rk._faces_of(made['verts'])
        for f in faces:
            f.material_index = LEAF
            f[self.kindL] = K_LEAF
            # the core keeps its own flat faces: it is the shade inside the
            # pad, and rounded normals would light its underside like a lamp
            up = (f.calc_center_median().z - c.z) / rz
            col = scale(mix(CANOPY[0], CANOPY[1], 0.4), 0.5 + 0.3 * smooth(-0.6, 0.7, up))
            for loop in f.loops:
                loop[self.col] = (*col, 1.0)
        n = int(density * radius * radius)
        for k in range(n):
            # an even spread over the shell (a spiral), thinner underneath
            z = 1 - 2 * (k + 0.5) / n
            z = z * 0.86 + 0.14
            if z < -0.25 and rng.random() < 0.2:
                continue
            a = k * 2.39996323 + rng.uniform(-0.3, 0.3)
            rr = math.sqrt(max(0.0, 1 - z * z))
            d = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
            pos = c + Vector((d.x * rx, d.y * ry, d.z * rz))
            nrm = Vector((d.x / rx, d.y / ry, d.z / rz)).normalized()
            out = Vector((d.x, d.y, 0))
            if out.length < 0.15:
                out = Vector((math.cos(a), math.sin(a), 0))
            out.normalize()
            rim = 1 - abs(z)
            axis = (out * (0.6 + 0.7 * rim) + Vector((0, 0, -0.18 - 0.75 * rim * rim - (0.5 if z < 0 else 0.0)))
                    + nrm * 0.25).normalized()
            side = axis.cross(nrm)
            if side.length < 1e-3:
                side = axis.cross(Vector((0, 0, 1)))
            side.normalize()
            ln = rng.uniform(0.75, 1.2) * (1.12 if rim > 0.6 else 1.0)
            wd = ln * rng.uniform(0.62, 0.8)
            b = pos - axis * ln * 0.38
            tip = pos + axis * ln * 0.62 - Vector((0, 0, 0.1 * ln))
            lift = nrm * 0.1 + axis * ln * 0.04
            s0, s1 = pos + side * wd / 2 + lift, pos - side * wd / 2 + lift
            tone = mix(base, CANOPY[3 if z > 0.25 else (2 if z > -0.1 else 0)], 0.35 + 0.4 * rng.random())
            tone = scale(tone, (0.7 + 0.42 * smooth(-0.5, 0.8, z)) * rng.uniform(0.9, 1.1))
            for (tri, shade) in (((b, s0, tip), 1.06), ((b, tip, s1), 0.9)):
                f = self.bm.faces.new([self.bm.verts.new(q) for q in tri])
                f.material_index = LEAF
                f[self.kindL] = K_LEAF
                f[tag] = index + 1
                f.smooth = True
                ls = f.loops
                ls[0][self.col] = (*scale(tone, 0.62 * shade), 1.0)
                ls[1][self.col] = (*scale(tone, shade), 1.0)
                ls[2][self.col] = (*scale(tone, 1.22 * shade), 1.0)

    def taro(self, pos, leaves=5, height=1.3, size=0.9):
        """A clump of great heart-shaped leaves, each on its own stalk, the
        blade hung from the stalk's top and creased along its midrib."""
        rng = self.rng
        p0 = Vector(pos)
        for k in range(leaves):
            a = TAU * k / leaves + rng.uniform(-0.5, 0.5)
            d = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-d.y, d.x, 0))
            h = height * rng.uniform(0.6, 1.2)
            reach = h * rng.uniform(0.25, 0.6)
            col = self.vary(TARO[rng.randrange(len(TARO))], 0.1)
            top = p0 + d * reach + Vector((0, 0, h))
            self.blade(p0 + Vector((0, 0, -0.08)), top, 0.035, scale(col, 0.8), bend=d * reach * 0.5, segs=2,
                       tip_col=scale(col, 0.9))
            ln = size * rng.uniform(0.75, 1.25)
            wd = ln * rng.uniform(0.62, 0.8)
            droop = rng.uniform(0.35, 0.9)
            ax = (d + Vector((0, 0, -droop))).normalized()
            nrm = side.cross(ax).normalized()
            if nrm.z < 0:
                nrm = -nrm
            notch = top - ax * ln * 0.06
            lobes = [top - ax * ln * 0.3 + side * s * wd * 0.42 - nrm * 0.05 for s in (1, -1)]
            wide = [top + ax * ln * 0.2 + side * s * wd * 0.5 - nrm * 0.1 for s in (1, -1)]
            mid = top + ax * ln * 0.42 + nrm * 0.04
            tip = top + ax * ln + Vector((0, 0, -0.16 * ln))
            for i in (0, 1):
                tris = ((notch, lobes[i], wide[i]), (notch, wide[i], mid), (mid, wide[i], tip))
                for (tri, shade) in zip(tris, (0.78, 0.98, 1.15)):
                    f = self.bm.faces.new([self.bm.verts.new(q) for q in tri])
                    f.material_index = LEAF
                    f[self.kindL] = K_LEAF
                    sh = shade * (1.08 if i == 0 else 0.86)
                    ls = f.loops
                    ls[0][self.col] = (*scale(col, 1.3 * sh if tri[0] is mid else 1.12 * sh), 1.0)
                    ls[1][self.col] = (*scale(col, 0.72 * sh), 1.0)
                    ls[2][self.col] = (*scale(col, 0.95 * sh), 1.0)


def P(name, **kw):
    kw.setdefault('moss', 1.5)
    p = Wild('Entrance_' + name, tide=WATER_Y + 0.4, **kw)
    p.padL = p.bm.faces.layers.int.new('pad')
    return p


def lean_piece(p):
    for v in p.bm.verts:
        v.co = LEAN @ v.co
    p.mark()
    p.soot = [(LEAN @ q, *rest) for (q, *rest) in p.soot]
    p.paint = [(LEAN @ q, *rest) for (q, *rest) in p.paint]
    p.streaks = [(LEAN @ q, *rest) for (q, *rest) in p.streaks]


# ================================================================ the idol's form
class Idol:
    field = chart = maw = nose = frames = relief = None


IDOL = Idol()


def wrap(a):
    return (a + math.pi) % TAU - math.pi


def under_table():
    """For 72 bearings round the neck: the height below which nothing may
    leave the collider's footprint there (three yards and a hand over the
    highest ground near it), or none where the jaws stand and where the
    ground is as high as the door's."""
    out = []
    for k in range(72):
        th = TAU * k / 72
        if abs(wrap(th)) < 1.05:
            out.append(9.0)
            continue
        hi = max(gh(math.sin(th + da) * r, HEAD_Z - math.cos(th + da) * r)
                 for da in (-0.17, 0.0, 0.17) for r in (7.7, 8.4, 9.1, 9.8, 10.5))
        out.append(hi + 3.2 if hi + 3.2 < 2.2 else 9.0)
    return out


def skin_points(pts, lift=0.0, field=None):
    """Points of the idol's surface at chart places [(bearing, height)],
    `lift` off it. Returns (points, normals) as arrays."""
    f = field or IDOL.field
    U = np.array([q[0] % TAU for q in pts], dtype=np.float64)
    V = np.array([q[1] for q in pts], dtype=np.float64)
    L = np.broadcast_to(np.asarray(lift, dtype=np.float64), U.shape).copy()
    O, D = IDOL.chart.rays(U, V)
    Pn, _hit = sc.march(f, O, D, L, IDOL.chart.tmax)
    return Pn, f.gradient(Pn)


def front_points(pts, lift=0.0):
    """Points of the face met by level rays from the south at [(lx, y)]."""
    O = np.array([(x, 9.0, y) for (x, y) in pts], dtype=np.float64)
    D = np.tile(np.array((0.0, -1.0, 0.0)), (len(pts), 1))
    Pn, _hit = sc.march(IDOL.field, O, D, np.full(len(pts), float(lift)), 17.0)
    return Pn


# the pelt's rosettes (bearing, chart height, radius), mirrored: jowls and
# cheeks, the skull's sides and back, the forehead
ROSETTES = [(1.2, 5.3, 1.15), (1.72, 6.6, 1.3), (2.2, 5.2, 1.15), (2.68, 6.5, 1.25), (1.52, 9.6, 1.2),
            (2.05, 10.2, 1.35), (2.6, 9.8, 1.25), (2.82, 11.9, 1.05), (2.3, 13.0, 1.25), (2.25, 15.6, 1.05),
            (2.75, 14.6, 1.1), (2.6, 17.0, 0.9), (0.55, 15.7, 0.85)]


def sculpt():
    f = sc.build_head(under_table())
    IDOL.field = f
    IDOL.chart = sc.Bullet()
    IDOL.frames = sc.eye_frames(f)
    IDOL.maw = sc.carve_maw(f)
    IDOL.nose = sc.nose_prim()
    sc.carve_sockets(f, IDOL.frames)
    places, sizes = [], []
    for s in (1, -1):
        for i, (th, v, r) in enumerate(ROSETTES):
            places.append((s * th, v))
            sizes.append((r, 0.7 * i + (0.0 if s > 0 else 1.1)))
    Pn, Nn = skin_points(places)
    IDOL.relief = sc.Relief([(Pn[i], Nn[i], sizes[i][0], sizes[i][1]) for i in range(len(places))])
    sc.carve_relief(f, IDOL.relief)


def stone_tone(p, breach=True):
    holes = [(Vector(sc.G(6.4, 16.2, 9.6)), 2.9), (Vector(sc.G(8.8, 13.6, 6.4)), 2.2)]

    def tone(q):
        c = p.tone(q[0] * 0.7 + q[1] * 0.7, q[2])
        if breach:
            for (h, r) in holes:
                if (Vector(q) - h).length < r:
                    return mix(c, rk.CORE, 0.55)
        return c
    return tone


def under_ground(Pn, sink=0.75):
    return np.array([q[2] < gb(q[0], q[1]) - sink for q in Pn])


# ================================================================ the idol's head
def eye_outline(sign, grow=0.0, n=18):
    """The eye's almond as a closed polyline about its own centre (x, y)."""
    e = sc.EYE
    c, s = math.cos(e['slant']), math.sin(e['slant'])
    pts = []
    for i in range(n):
        t = TAU * i / n
        a = math.cos(t) * (e['a'] + grow)
        b = math.copysign(abs(math.sin(t)) ** 1.5, math.sin(t)) * (e['b'] + grow)
        pts.append((sign * (a * c - b * s), a * s + b * c))
    return pts


def eye(p, sign, centre, normal):
    """An eye in its socket, as it was: a carved lid ring, the jade and the
    slit of a cat's pupil. Built flat (X across, Y out of the face, Z up)
    about the socket's centre and turned into place."""
    e = sc.EYE
    yv = Vector(normal).normalized()
    xv = yv.cross(Vector((0, 0, 1))).normalized()
    zv = xv.cross(yv)
    M = Matrix((xv, yv, zv)).transposed().to_4x4()
    M.translation = Vector(centre)
    m = p.mark()
    lid = eye_outline(sign, grow=0.03)
    lid.append(lid[0])
    p.arch(lid, 0.5, 1.15, COURT_PALE, Matrix.Identity(4), bevel=0.06, chip=0.08, tone=0.08, y_off=-0.42, center=(0.0, 0.0))
    with p.as_kind(K_GLASS):
        faces = p.rock((0, -0.78, 0), (e['a'] * 1.9, 0.7, e['b'] * 1.9), JADE, jitter=0.03, subdivisions=2, mat=WET)
        for f in faces:
            for loop in f.loops:
                v = loop.vert.co
                k = smooth(1.0, 0.0, math.hypot(v.x * 0.52, v.z * 0.86))
                loop[p.col] = (*mix(scale(JADE, 0.45), JADE_PALE, k * 0.9), 1.0)
    with p.as_kind(K_RAW):
        for roll in (0.0, math.pi):
            p.box((0, -0.4, 0), (0.38, 0.18, e['b'] * 1.85), (0.015, 0.025, 0.02), taper=0.15, chip=0.1,
                  roll=roll + sign * e['slant'] * 0.5)
    p.turn(m, M)
    p.mark()
    p.soot.append((M @ Vector((0, -0.3, -0.25)), 2.0, 0.5))
    # ochre worn off the socket's rim, a wet run from each corner
    p.paint.append((M @ Vector((0, 0.1, 0)), 3.0, WAR_OCHRE, 0.95))
    for (dx, wid, ln) in ((sign * 1.5, 0.55, 5.0), (-sign * 1.4, 0.4, 2.6)):
        p.streaks.append((M @ Vector((dx, 0.15, -e['b'] * 0.9)), wid, ln, 0.6))
    # the engine's fire stands in the socket, before the jade and under the brow
    SOCKETS['eyes'].append(leaned(M @ Vector((0, 0.4, 0))))


def head():
    p = P('Head', seed=3, moss=2.0)
    rng = p.rng
    f, maw, nose = IDOL.field, IDOL.maw, IDOL.nose
    # the neck's own rim: the ground falls four yards from the maw round to
    # the lagoon side, and the lean lifts the north foot half a yard more
    rim = [(math.sin(TAU * k / 72) * 8.4, HEAD_Z + math.cos(TAU * k / 72) * 8.4) for k in range(72)]
    y0 = footing('head', 0.0, HEAD_Z, 5.6, 5.6, 0.0, 1.0, extra=rim)
    footing('muzzle', 0.0, -0.1, 7.0, 1.9, 0.0, 0.9)
    stats = {}

    # ---- the outside: the neck's megaliths, the collar, the skull
    rows = [y0, y0 + 1.75, y0 + 3.4, y0 + 5.15, 1.82, sc.NECK_TOP - 0.02, 4.55, sc.BULLET_YC]
    while rows[-1] < 17.1:
        rows.append(rows[-1] + rng.uniform(1.35, 1.75))
    rows.append(18.65)

    def width(v):
        return (2.3, 4.4) if v < 1.8 else ((2.5, 3.3) if v < 3.1 else (1.8, 3.7))

    def cell(u, v):
        if v < 1.82:
            return 0.9
        if v < 3.1:
            return 0.33
        return 0.39 if abs(wrap(u)) < 1.3 and v < 16.0 else 0.46

    def flag(Pn):
        return (maw.at(Pn) < 0.1) | (nose.at(Pn) < 0.1) | under_ground(Pn)

    def front(c):
        return (np.abs(c[:, 0]) < 5.25) & (c[:, 1] > -1.25)

    def facing(cen):
        return sc.coarse_normal(f, cen)[:, 2]

    def keep(cen, nrm):
        # what faces down and has nothing under it is drawn from below (the
        # charts that follow), not from the side: under the upper jaw all of
        # it, round the neck only what lies near level
        out = np.ones(len(cen), dtype=bool)
        nz = facing(cen)
        idx = np.nonzero(nz < np.where(front(cen), -0.45, -0.8))[0]
        if len(idx):
            c = cen[idx] + nrm[idx] * 0.15
            stop = np.where(front(c), 2.75, -4.5)
            _q, hit = sc.march(f, c, np.tile(np.array((0.0, 0.0, -1.0)), (len(idx), 1)), np.zeros(len(idx)), c[:, 2] - stop)
            out[idx] = hit
        return out

    blocks = sc.lay_out(f, IDOL.chart, rng, rows, width)
    stats['skull'] = sc.megalith_skin(p, f, IDOL.chart, blocks, rng, stone_tone(p), cell=cell, flag=flag, keep=keep,
                                      shade=IDOL.relief.shade)
    # ---- what overhangs the neck, from below: the jowls, the nape's roll, the corbels
    ann = sc.Annulus(-4.5, (0.78, TAU - 0.78), (7.95, 11.5), 15.0)
    blocks = sc.lay_out(f, ann, rng, [7.95, 9.05, 10.25, 11.5], lambda v: (2.0, 3.6), tall=0.0)
    stats['soffit'] = sc.megalith_skin(p, f, ann, blocks, rng, stone_tone(p, False), cell=0.44, flag=under_ground,
                                       keep=lambda c, n: (facing(c) < -0.7) & ~front(c))

    # ---- the maw: the palate and the flews from below
    dark = stone_tone(p, breach=False)

    def wet(q):
        return mix(dark(q), COURT_DARK, 0.3)

    up = sc.Plane((0, 0, 2.75), (1, 0, 0), (0, 1, 0), (0, 0, 1), (-5.3, 5.3), (-1.3, 6.3), 5.2)
    blocks = sc.lay_out(f, up, rng, [-1.3, 0.3, 1.9, 3.4, 4.9, 6.3], lambda v: (1.6, 3.0), tall=0.0)
    stats['palate'] = sc.megalith_skin(p, f, up, blocks, rng, wet, cell=0.36, gap=0.1, depth=0.2,
                                       keep=lambda c, n: (facing(c) < -0.3) & (np.abs(c[:, 0]) < 5.05))
    # the throat's walls and the jaws' inner faces, from the lane's own axis
    tun = sc.Tunnel(3.3, (-5.7, 1.32), (-0.95, math.pi + 0.95))
    trows = [a * tun.rho0 for a in (-0.95, -0.42, 0.12, 0.72, 1.25, 1.89, 2.42, 3.02, 3.56, 4.09)]
    blocks = sc.lay_out(f, tun, rng, trows, lambda v: (1.4, 2.6), tall=0.0)
    stats['throat'] = sc.megalith_skin(p, f, tun, blocks, rng, wet, cell=0.36, gap=0.1, depth=0.2,
                                       keep=lambda c, n: (np.abs(facing(c)) <= 0.5) & (maw.at(c) < 0.4))
    # the jaws' tops
    down = sc.Plane((0, 0, 3.3), (1, 0, 0), (0, 1, 0), (0, 0, -1), (-7.3, 7.3), (-3.9, 2.0), 2.4)
    blocks = sc.lay_out(f, down, rng, [-3.9, -2.3, -0.8, 0.6, 2.0], lambda v: (1.5, 2.8), tall=0.0)
    stats['jaws'] = sc.megalith_skin(p, f, down, blocks, rng, stone_tone(p, False), cell=0.36, gap=0.1, depth=0.2,
                                     keep=lambda c, n: facing(c) > 0.45)
    # ---- the nose: one dark stone, cut fine
    nz = sc.Plane((0, 7.4, sc.NOSE['y']), (1, 0, 0), (0, 0, 1), (0, -1, 0), (-2.0, 2.0), (-1.3, 1.3), 3.2)
    nblocks = [(-2.0, 0.0, -1.3, 0.0, 2.0), (0.0, 2.0, -1.3, 0.0, 2.0), (-2.0, 0.0, 0.0, 1.3, 2.0), (0.0, 2.0, 0.0, 1.3, 2.0)]
    lea = stone_tone(p, False)

    def leather(Pn):
        return np.where(nose.at(Pn) < 0.1, 0.3, 1.0)
    stats['nose'] = sc.megalith_skin(p, f, nz, nblocks, rng, lambda q: mix(lea(q), COURT_DARK, 0.25), cell=0.135,
                                     gap=0.06, depth=0.12, proud=(0.0, 0.03), chip=0.0, shade=leather,
                                     keep=lambda c, n: nose.at(c) < 0.5)
    p.mark()

    # ---- the ears, over the brows from the road and from behind: the west one whole, the east one's tip gone
    for (sign, broken) in ((1, False), (-1, True)):
        fe, c, R = sc.build_ear(sign, broken)
        face = R @ np.array((0.0, 1.0, 0.0))
        ch = sc.Sphere(c - face * 0.3, R, 3.2, (0.04 * 3.2, 2.5 * 3.2), far=6.4, pole='z')
        erows = [t * 3.2 for t in (0.04, 0.5, 0.95, 1.4, 1.9, 2.5)]
        blocks = sc.lay_out(fe, ch, rng, erows, lambda v: (1.7, 3.0), tall=0.0, samples=200)
        pale = stone_tone(p, False)
        stats['ear_' + ('w' if sign > 0 else 'e')] = sc.megalith_skin(
            p, fe, ch, blocks, rng, lambda q: mix(pale(q), COURT_PALE, 0.35), cell=0.55, gap=0.1, depth=0.2,
            flag=lambda Pn: f.sample(Pn) < -0.3)
        p.paint.append((Vector(c + face * 0.3), 2.8, WAR_OCHRE, 0.7))
        p.soot.append((Vector(c + face * 0.25 - np.array((0, 0, 0.5))), 2.3, 0.55))
    p.mark()

    # ---- the eyes
    for (sign, c, n) in IDOL.frames:
        eye(p, sign, c - n * 1.0, n)
    # ---- worn war paint and the damp
    for s in (1, -1):
        # ochre along the brows, red slashes down the cheeks, red on the lips and the gums
        Pn, _n = skin_points([(s * 0.36, 13.7), (s * 0.62, 13.4), (s * 0.9, 13.1)])
        for q in Pn:
            p.paint.append((Vector(q), 1.5, WAR_OCHRE, 0.8))
        for k in range(3):
            Pn, _n = skin_points([(s * (0.78 + 0.13 * k), 8.6 - 0.25 * k), (s * (0.9 + 0.13 * k), 7.3 - 0.25 * k),
                                  (s * (1.0 + 0.13 * k), 6.0 - 0.3 * k)])
            for q in Pn:
                p.paint.append((Vector(q), 0.75, WAR_RED, 0.95))
        for lz in (-0.9, -2.2, -3.4, -4.4, -5.0):
            w, sp, _r = sc.Maw.section(lz)
            p.paint.append((B(s * (w - 0.1), lz, sp - 0.3), 0.85, GUM, 1.7))
            p.paint.append((B(s * (w + 0.5), max(lz, -1.4) + 0.9, sc.JAW_TOP), 0.8, GUM, 1.5))
        for a in (0.35, 0.8, 1.25):
            p.paint.append((B(s * math.cos(a) * 3.15, -5.2, 4.3 + math.sin(a) * 2.05), 0.85, GUM, 1.7))
        # the whisker pads' pits
        Pn = front_points([(s * x, y) for (x, y) in ((1.5, 6.2), (2.2, 6.6), (3.0, 6.3), (1.9, 5.6), (2.7, 5.6), (3.4, 5.7))])
        for q in Pn:
            p.soot.append((Vector(q) + Vector((0, 0.05, 0)), 0.2, 0.9))
        # algae runs under the brow's end, the cheekbone and the flews
        Pn, _n = skin_points([(s * 0.95, 12.6), (s * 1.45, 8.4), (s * 0.5, 5.6), (s * 2.2, 8.6), (s * 2.75, 8.0)])
        for (q, ln) in zip(Pn, (4.0, 4.5, 3.0, 5.0, 4.5)):
            p.streaks.append((Vector(q), 0.6, ln, 0.6))
    # the throat's dark, and the nostrils'
    p.soot.append((B(0, 0.6, 3.6), 3.6, 0.55))
    for s in (1, -1):
        p.soot.append((B(s * 0.72, sc.NOSE['lz'] + 0.25, sc.NOSE['y'] - 0.22), 0.45, 0.95))
    # ---- the sills: low gum stones along the lane, where the lower jaw was cut through for the causeway
    for s in (1, -1):
        for (lz, ln) in ((-0.75, 0.75), (0.05, 0.8), (0.85, 0.75)):
            w, _sp, _r = sc.Maw.section(lz)
            x0 = max(LANE + 0.12, 1.81 - (lz + 1.56) * 0.477)
            cx = s * (x0 + w + 0.1) / 2
            gy = gh(cx, lz)
            hh = rng.uniform(0.42, 0.56)
            with p.as_kind(K_PAVE):
                p.box(B(cx, lz, gy + hh / 2 - 0.25), (w + 0.1 - x0, ln, hh + 0.5), p.vary(mix(COURT, GUM, 0.25), 0.06),
                      chip=0.14, bevel=0.06, yaw=rng.uniform(-0.05, 0.05), bottom=False)
    # the earth that has gathered on the crown, where the fig stands
    with p.as_kind(K_EARTH):
        p.mound(0.3, HEAD_Z + 1.4, 3.5, 3.5, 1.5, lambda x, z: HEAD_TOP - 0.9, mix(rk.TURF, rk.MOSS_DEEP, 0.4), rings=3,
                segs=9, sink=1.3, jitter=0.25)
    if '--holes' in argv:
        hole_report(p)
    # ---- the core behind the skin
    verts, polys = sc.liner(f, bpy)
    core = scale(COURT_DARK, 0.62)
    made = [p.bm.verts.new(Vector(v)) for v in verts]
    n_core = 0
    with p.as_kind(K_STONE):
        for poly in polys:
            if all(verts[i][2] < gb(verts[i][0], verts[i][1]) - 1.0 for i in poly):
                continue
            try:
                face = p.bm.faces.new([made[i] for i in poly])
            except ValueError:
                continue
            p._paint([face], core, STONE)
            n_core += len(poly) - 2
    for v in made:
        if not v.link_faces:
            p.bm.verts.remove(v)
    stats['core_tris'] = n_core
    lean_piece(p)
    print('SKIN', json.dumps(stats))
    return p


def hole_report(p):
    """A check for the builder, not part of the model: sight lines from
    outside to the carved surface that the skin does not stop (a hole a
    walker could see the sky through). Prints how many and where."""
    from mathutils.bvhtree import BVHTree
    f = IDOL.field
    rng = np.random.default_rng(3)
    bvh = BVHTree.FromBMesh(p.bm, epsilon=0.0)
    places = [(TAU * rng.random(), -1.0 + 19.0 * rng.random()) for _ in range(9000)]
    Pn, Nn = skin_points(places)
    d = Nn + rng.normal(size=Nn.shape) * 0.45
    d[:, 2] = np.minimum(d[:, 2], 0.35)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    O = Pn + d * 14.0
    Q, hit = sc.march(f, O, -d, np.zeros(len(O)), 20.0)
    tf = np.linalg.norm(Q - O, axis=1)
    bad = []
    for i in range(len(O)):
        if not hit[i] or Q[i][2] < gb(Q[i][0], Q[i][1]) - 0.2 or Q[i][2] > 15.2:
            continue
        if abs(Q[i][0]) < 2.7 and Q[i][1] < -1.1 and Q[i][2] < 6.4:
            continue      # the throat behind the engine's window
        loc, _n, _i, dist = bvh.ray_cast(Vector(O[i]), Vector(-d[i]), 40.0)
        if loc is None or dist > tf[i] + 0.6:
            bad.append((round(Q[i][0]), round(-Q[i][1]), round(Q[i][2])))
    cells = {}
    for q in bad:
        cells[q] = cells.get(q, 0) + 1
    worst = sorted(cells.items(), key=lambda kv: -kv[1])[:24]
    print('HOLES', len(bad), 'of', int(hit.sum()), 'worst (lx, lz, y):', worst)
    # and the simulation's contract: under three yards over the ground the
    # stone stays inside the colliders it was fitted to
    out, worst_out = 0, 0.0
    for v in p.bm.verts:
        x, z, y = v.co.x, -v.co.y, v.co.z
        if y > gh(x, z) + 3.0 or y < gh(x, z) - 0.3:
            continue
        over = math.hypot(x, z - HEAD_Z) - 8.05
        for c in COLLIDERS[1:3]:
            cs, sn = math.cos(c['rot']), math.sin(c['rot'])
            dx, dz = x - c['lx'], z - c['lz']
            u, w = dx * cs - dz * sn, dx * sn + dz * cs
            over = min(over, max(abs(u) - c['hw'], abs(w) - c['hd']))
        if over > 0.05:
            out += 1
            worst_out = max(worst_out, over)
    print('FOOTPRINT verts outside the colliders under 3 yd:', out, 'worst by', round(worst_out, 3))


# ================================================================ the fangs
def teeth():
    """The fangs: the upper row hangs from the gum inside the upper lip, the
    lower stands on the rami either side of the lane."""
    p = P('Teeth', seed=5, moss=0.35)
    tips = []
    for s in (1, -1):
        # the great upper canines, out over the causeway
        w, sp, rise = sc.Maw.section(-4.5)
        x = w - 0.55
        tip = B(s * (x - 0.22), -4.95, 2.6)
        p.tooth(B(s * x, -4.5, sp + rise * math.sqrt(1 - (x / w) ** 2) + 0.4), tip, 0.62, IVORY, bend=(s * 0.14, 0.3, 0),
                sides=7)
        tips.append(tip)
        # the incisors between them
        for (x, ln, r) in ((0.45, 1.05, 0.25), (1.15, 1.15, 0.27), (1.85, 1.3, 0.3)):
            w, sp, rise = sc.Maw.section(-5.1)
            top = sp + rise * math.sqrt(max(0.0, 1 - (x / w) ** 2))
            tip = B(s * x * 1.02, -5.28, top - ln)
            p.tooth(B(s * x, -5.05, top + 0.3), tip, r, IVORY, bend=(0, 0.06, 0), sides=5)
            if x < 1.5:
                tips.append(tip)
        # the shearing teeth back along the upper jaw
        for (lz, ln, r) in ((-3.5, 1.3, 0.34), (-2.45, 1.15, 0.33), (-1.4, 1.0, 0.31), (-0.45, 0.8, 0.27)):
            w, sp, _r = sc.Maw.section(lz)
            p.tooth(B(s * (w - 0.1), lz, sp + 0.05), B(s * (w - 0.28), lz - 0.12, sp - ln), r, IVORY, bend=(0, 0.04, 0),
                    sides=5)
        # the lower jaw: the canine at the ramus's front, the molars along its gum
        w, _sp, _r = sc.Maw.section(-0.7)
        p.tooth(B(s * (w + 0.62), -0.3, sc.JAW_TOP - 0.6), B(s * (w + 0.5), -0.75, sc.JAW_TOP + 2.9), 0.56, IVORY,
                bend=(0, 0.16, 0), sides=7)
        for (lz, hh, r) in ((0.1, 0.95, 0.3), (0.75, 0.85, 0.29), (1.3, 0.7, 0.26)):
            w, _sp, _r = sc.Maw.section(lz)
            p.tooth(B(s * (w + 0.5), lz, sc.JAW_TOP - 0.3), B(s * (w + 0.42), lz - 0.06, sc.JAW_TOP + hh), r, IVORY,
                    sides=5)
        # the low teeth left of the cut-through front, along the lane
        for (lz, hh) in ((-1.35, 0.7), (-0.75, 0.6), (-0.15, 0.52), (0.5, 0.46)):
            x = s * (max(LANE + 0.12, 1.81 - (lz + 1.56) * 0.477) + 0.3)
            gy = gh(x, lz)
            p.tooth(B(x, lz, gy - 0.1), B(x + s * 0.05, lz - 0.05, gy + 0.3 + hh), 0.2, IVORY, sides=5)
    for q in tips:
        SOCKETS['drips'].append(leaned(q))
        p.streaks.append((q + Vector((0, 0, 3.4)), 0.45, 2.2, 0.5))
    lean_piece(p)
    return p


# ================================================================ the strangler fig
FIG = dict(x=0.5, z=HEAD_Z + 1.6, y=HEAD_TOP - 0.3)
FORK = 23.2
# the crown's masses (lx, lz, y, radius): one over all, a ring under it, a
# wider ring lower, three outliers on the longest limbs
CROWN = [(0.8, 10.6, 31.4, 4.8), (-4.4, 7.6, 29.3, 4.6), (6.0, 8.4, 29.8, 4.9), (1.0, 15.2, 29.4, 4.6),
         (-7.2, 12.4, 26.6, 4.0), (10.4, 13.0, 26.8, 4.3), (10.0, 5.6, 26.6, 4.1), (-6.8, 5.2, 26.4, 3.6),
         (2.0, 4.4, 27.6, 3.6), (-2.6, 17.6, 26.4, 3.8), (5.6, 17.8, 26.0, 3.6), (13.4, 9.4, 24.4, 3.2),
         (-8.8, 9.0, 24.2, 2.8), (0.6, 19.8, 24.0, 3.0), (3.2, 11.4, 27.6, 3.0), (-1.8, 10.6, 27.0, 2.8)]
ROOTS = [
    # down the west temple and cheek, to the bank
    ([(0.42, 18.2), (0.72, 15.6), (0.93, 13.0), (1.0, 10.6), (1.1, 8.0), (1.04, 5.6), (1.14, 3.4), (1.1, 1.0)], 0.46, 0.18),
    # over the forehead, down the east side of the nose, onto the muzzle
    ([(-0.04, 18.2), (-0.08, 16.0), (-0.1, 13.8), (-0.12, 11.8), (-0.15, 10.2), (-0.2, 8.6), (-0.3, 7.2)], 0.34, 0.14),
    # round the broken east ear and down the east cheek into the rise
    ([(-0.62, 18.2), (-0.95, 15.2), (-1.06, 12.6), (-1.0, 10.0), (-1.12, 7.6), (-1.07, 5.2), (-1.16, 3.2), (-1.1, 1.0)],
     0.38, 0.15),
    ([(-1.95, 17.9), (-2.02, 14.8), (-1.95, 12.0), (-2.06, 9.0), (-2.0, 6.2), (-2.09, 3.4), (-2.02, 0.6)], 0.42, 0.16),
    # down the west flank and round the back, into the bank and the knoll
    ([(1.95, 17.9), (2.06, 14.6), (2.0, 11.6), (2.1, 8.6), (2.04, 5.6), (2.13, 3.2), (2.05, 0.2), (2.1, -2.2)], 0.5, 0.19),
    ([(2.52, 17.8), (2.62, 14.4), (2.55, 11.0), (2.66, 7.6), (2.6, 4.6), (2.68, 2.0), (2.6, -1.0)], 0.36, 0.14),
    ([(-2.6, 17.7), (-2.7, 14.2), (-2.62, 10.6), (-2.73, 7.2), (-2.66, 4.2), (-2.7, 1.6)], 0.38, 0.15),
]


def fig():
    p = P('Fig', seed=21, moss=0.9)
    rng = p.rng
    fx, fz, fy = FIG['x'], FIG['z'], FIG['y']
    base = B(fx, fz, fy)
    fork = B(fx + 0.6, fz + 0.3, FORK)
    # the trunk: strands that have grown together, twisting as they climb
    for k in range(5):
        a = TAU * k / 5 + 0.4
        pts = []
        for i in range(6):
            t = i / 5
            aa = a + t * 1.7
            rr = 1.05 * (1.35 - 0.85 * t)
            pts.append(base + (fork - base) * t + Vector((math.cos(aa) * rr, math.sin(aa) * rr, -0.8 if i == 0 else 0)))
        p.limb(pts, 0.66, 0.42, p.vary(BARK, 0.1), sides=6, wobble=0.06)
    # the limbs out to the crown, each forking under its mass
    for (cx, cz, cy, cr) in CROWN:
        tip = B(cx, cz, cy - cr * 0.12)
        mid = fork + (tip - fork) * 0.5 + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 1.0))
        p.limb([fork - Vector((0, 0, 0.8)), fork + (mid - fork) * 0.5 + Vector((0, 0, 0.5)), mid, tip], 0.46, 0.13,
               p.vary(BARK, 0.1), sides=5, wobble=0.08, steps=3)
        start = mid + (tip - mid) * 0.45
        for k in range(2):
            a = TAU * k / 2 + rng.uniform(-0.8, 0.8)
            end = B(cx, cz, cy) + Vector((math.cos(a) * cr * 0.62, math.sin(a) * cr * 0.62, -cr * 0.05))
            p.limb([start, start + (end - start) * 0.5 + Vector((0, 0, 0.35)), end], 0.15, 0.05, p.vary(BARK_DARK, 0.12),
                   sides=4, wobble=0.04, steps=2)
    # the roots, poured over the crown and down the skull: each a line of
    # chart places, carried on down the neck and into the ground under it
    for i, (line, r0, r1) in enumerate(ROOTS):
        line = list(line)
        if i != 1:
            th, v = line[-1]
            foot = gh(math.sin(th) * 8.6, HEAD_Z - math.cos(th) * 8.6) - 0.9
            k = 0
            while v > foot + 0.2:
                v = max(foot, v - 1.6)
                k += 1
                line.append((th + (0.035 if k % 2 else -0.03), v))
        Pn, _n = skin_points(line, lift=r0 * 0.55)
        pts = ([base + Vector((line[0][0] * 0.3, 0.0, 0.1))] if line[0][1] > 17 else []) + [Vector(q) for q in Pn]
        path = p.limb(pts, r0, r1, p.vary(BARK, 0.1), sides=5 if r0 > 0.4 else 4, wobble=0.03, steps=2)
        for k in ((len(path) // 2, 3 * len(path) // 4) if i % 2 == 0 else (len(path) // 2,)):
            q = path[k]
            d = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.1, 0.1), -1.0))
            p.limb([q, q + d * 0.9, q + d * rng.uniform(1.6, 2.6)], r0 * 0.4, 0.04, p.vary(BARK_DARK, 0.1), sides=4,
                   wobble=0.03)
    lean_piece(p)
    # the roots that reach for the lagoon: out of the west cheek's foot and the
    # nape, down the bank and into the shallows. They lie on the true ground,
    # so they are laid after the lean.
    for (th, tx, tz, r0) in ((1.15, 13.5, 13.8, 0.3), (1.7, 15.8, 17.6, 0.32), (2.15, 9.6, 19.8, 0.26),
                             (2.8, 5.0, 21.6, 0.28)):
        sx, sz = math.sin(th) * (HEAD_R + 0.4), HEAD_Z - math.cos(th) * (HEAD_R + 0.4)
        ln = math.hypot(tx - sx, tz - sz)
        nx, nz = -(tz - sz) / ln, (tx - sx) / ln
        n = max(4, int(ln / 1.3))
        ph = rng.uniform(0.0, TAU)
        pts = []
        for k in range(n + 1):
            t = k / n
            off = 0.7 * math.sin(t * TAU * 1.2 + ph) * math.sin(math.pi * t)
            x, z = sx + (tx - sx) * t + nx * off, sz + (tz - sz) * t + nz * off
            pts.append(B(x, z, gh(x, z) + 0.1 - 0.3 * t * t - (0.5 if k == 0 else 0.0)))
        path = p.limb(pts, r0, 0.06, p.vary(BARK, 0.1), sides=4, wobble=0.04, steps=2)
        q = path[len(path) // 2]
        d = Vector((nx * rng.choice((-1, 1)), -nz * rng.choice((-1, 1)), -0.12))
        p.limb([q, q + d * 0.9, q + d * rng.uniform(1.6, 2.4) + Vector((0, 0, -0.25))], r0 * 0.45, 0.04,
               p.vary(BARK_DARK, 0.1), sides=4, wobble=0.03)
    return p


# ================================================================ the court
BLOCK_FALLS = [(9.3, -0.6, 3), (10.2, 5.6, 3), (11.6, 11.2, 4), (9.2, 16.2, 3), (14.2, 15.8, 3), (3.2, 19.6, 3),
               (-9.4, 14.6, 2)]
GAPS = []
# The Palmreach's own palms standing by the idol (reachPalmSpots, door-local):
# no fallen block lies in a trunk.
PALMS = [(12.4, 6.4), (6.7, 17.1)]


def court():
    p = P('Court', seed=8, moss=1.2)
    rng = p.rng
    # the causeway: heaved flagstones up the rise and into the maw, each lying
    # on its own piece of the slope; a few are gone and fern has the gap
    z = APRON['z0']
    while z < APRON['z1'] - 0.3:
        d = min(rng.uniform(1.05, 1.6), APRON['z1'] - z)
        if APRON['z1'] - (z + d) < 0.5:
            d = APRON['z1'] - z
        zc = z + d / 2
        inside = zc > MUZ_S - 0.2
        hw = apron_hw(zc) + (0.0 if inside else rng.uniform(-0.25, 0.25))
        x = -hw
        while x < hw - 0.35:
            w = min(rng.uniform(1.15, 2.1), hw - x)
            if hw - (x + w) < 0.55:
                w = hw - x
            edge = not inside and abs(x + w / 2) > hw - 1.3
            cx = apron_c(zc) + x + w / 2
            x += w
            if edge and rng.random() < 0.16:
                GAPS.append((cx, zc))
                continue
            hh = rng.uniform(0.36, 0.5)
            heave = rng.random() < (0.5 if edge else 0.22)
            lift = rng.uniform(0.05, 0.12) - hh / 2 + (rng.uniform(0.02, 0.08) if heave else 0.0)
            M = slope_matrix(cx, zc, yaw=rng.uniform(-0.05, 0.05), lift=lift)
            if heave:
                M = M @ Matrix.Rotation(rng.uniform(-0.09, 0.09), 4, 'X') @ \
                    Matrix.Rotation(rng.uniform(-0.08, 0.08), 4, 'Y')
            with p.as_kind(K_PAVE):
                p.box((0, 0, 0), (w - 0.07, d - 0.07, hh), p.tone(cx, zc), chip=0.12, bevel=rng.uniform(0.035, 0.06),
                      M=M, bottom=False)
        z += d
    # its kerbs: long stones half sunk along both edges, some fallen outward
    for sign in (1, -1):
        z = APRON['z0'] + rng.uniform(0.0, 0.6)
        while z < MUZ_S - 1.9:
            ln = rng.uniform(1.3, 2.0)
            zc = z + ln / 2
            cx = apron_c(zc) + sign * (apron_hw(zc) + 0.42)
            z += ln + rng.uniform(0.02, 0.2)
            if rng.random() < 0.18 or min(math.hypot(cx - bx, zc - bz) for (bx, bz) in BRAZIERS + TUSKS) < 1.5:
                continue
            fallen = rng.random() < 0.25
            hh = rng.uniform(0.5, 0.66)
            M = slope_matrix(cx + (sign * 0.25 if fallen else 0.0), zc, yaw=rng.uniform(-0.08, 0.08),
                             lift=rng.uniform(0.16, 0.3) - hh / 2)
            M = M @ Matrix.Rotation(rng.uniform(-0.05, 0.05), 4, 'X') @ \
                Matrix.Rotation(sign * (rng.uniform(0.25, 0.5) if fallen else rng.uniform(-0.05, 0.08)), 4, 'Y')
            with p.as_kind(K_PAVE):
                p.box((0, 0, 0), (0.5, ln, hh), p.vary(COURT_PALE if rng.random() < 0.4 else COURT, 0.07), chip=0.16,
                      bevel=0.06, M=M, bottom=False)
    # the two fire bowls beside the maw: a plinth, a carved drum, a bronze
    # bowl, the coals. The rise falls away to the west, so the west drum
    # stands taller: both bowls burn at one height.
    top = max(gh(bx, bz) for (bx, bz) in BRAZIERS) + 1.9
    for i, (bx, bz) in enumerate(BRAZIERS):
        gy = gh(bx, bz)
        lo = GR.footprint_range(bx, bz, 0.8, 0.8, 0.0, 0.2)[0]
        FOOTINGS.append((f'brazier_{"we"[i]}', bx, bz, 0.8, 0.8, 0.0, lo - 0.5))
        with p.as_kind(K_PAVE):
            p.box(B(bx, bz, (lo - 0.5 + gy + 0.34) / 2), (1.5, 1.5, gy + 0.34 - (lo - 0.5)), p.vary(COURT, 0.06),
                  chip=0.1, bevel=0.07, yaw=0.12 * (1 if i else -1), bottom=False)
        prof = [(0.74, gy + 0.3 - top), (0.74, gy - top + 0.52), (0.6, gy - top + 0.7), (0.52, -0.62), (0.56, -0.5),
                (0.68, -0.4), (0.7, -0.22), (0.56, -0.1), (0.5, 0.0), (0.0, 0.0)]
        faces = p.lathe(B(bx, bz, top), prof, 8, p.vary(COURT, 0.06), phase=0.3 + i, smooth=False)
        p.solid(faces)
        with p.as_kind(K_METAL):
            faces = p.lathe(B(bx, bz, top), [(0.3, -0.02), (0.62, 0.12), (0.8, 0.36), (0.74, 0.4), (0.56, 0.2), (0.0, 0.16)],
                            8, BRONZE, phase=0.1 + i, smooth=False)
            p.solid(faces)
        with p.as_kind(K_GLASS):
            for _ in range(6):
                a, d = rng.random() * TAU, rng.random() * 0.36
                p.rock(B(bx + math.cos(a) * d, bz + math.sin(a) * d, top + 0.26), (0.26, 0.26, 0.2),
                       mix(COAL, (0.2, 0.05, 0.02), rng.random() * 0.7), jitter=0.3, subdivisions=1, mat=GLOW)
        p.paint.append((B(bx, bz, top - 0.3), 0.9, WAR_RED, 0.9))
        p.paint.append((B(bx, bz, (gy + top) / 2), 0.8, WAR_OCHRE, 0.7))
        p.soot.append((B(bx, bz, top - 0.05), 0.8, 0.5))
        SOCKETS['braziers'].append([round(bx, 3), round(top + 0.34, 3), round(bz, 3)])
        collider_circle(f'brazier_{"we"[i]}', bx, bz, 1.0, top + 0.4)
    # the Sunbone's tusks at the causeway's foot, leaning in over the way up,
    # wedged upright with stones, hung with war cloth and the skulls of what
    # the basin has eaten
    for i, (tx, tz) in enumerate(TUSKS):
        sign = 1 if tx > 0 else -1
        gy = gh(tx, tz)
        FOOTINGS.append((f'tusk_{"we"[i]}', tx, tz, 0.45, 0.45, 0.0, gy - 1.3))
        h = 7.6 if i == 0 else 6.8
        pts = [B(tx, tz, gy - 1.3), B(tx + sign * 0.28, tz, gy + h * 0.3), B(tx + sign * 0.12, tz + 0.1, gy + h * 0.62),
               B(tx - sign * 0.85, tz + 0.2, gy + h * 0.88), B(tx - sign * 2.15, tz + 0.3, gy + h)]
        path = p.limb(pts, 0.46, 0.06, IVORY, sides=7, kind=K_STONE, steps=4)
        for k in range(5):
            a = TAU * k / 5 + rng.uniform(-0.3, 0.3)
            sx, sz = tx + math.cos(a) * 0.52, tz + math.sin(a) * 0.52
            s = rng.uniform(0.34, 0.5)
            M = slope_matrix(sx, sz, yaw=-a + rng.uniform(-0.3, 0.3), lift=s * 0.12)
            M = M @ Matrix.Rotation(rng.uniform(-0.3, 0.3), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.35, 0.35), 4, 'Y')
            with p.as_kind(K_PAVE):
                p.box((0, 0, 0), (s * 1.2, s * 0.9, s * 0.8), p.vary(COURT, 0.08), chip=0.22, bevel=0.05, M=M, taper=0.8)
        # the lashing and the cloth
        tie = path[len(path) * 2 // 3]
        with p.as_kind(K_WOOD):
            p.box(tie, (0.46, 0.46, 0.32), rk.TIMBER_DARK, yaw=0.4, chip=0.2)
        for kk in (len(path) // 4, len(path) // 2):
            p.paint.append((path[kk], 0.66, WAR_RED, 1.4))
            p.soot.append((path[kk] + Vector((0, 0, 0.5)), 0.5, 0.35))
        with p.as_kind(K_CLOTH):
            for k in range(4):
                ox = (k - 1.5) * 0.22
                ln = rng.uniform(1.1, 2.5)
                col = scale(WAR_RED if k % 2 == 0 else WAR_OCHRE, rng.uniform(0.62, 0.9))
                sway = rng.uniform(-0.25, 0.25)
                prev = None
                for s_ in range(5):
                    t_ = s_ / 4
                    q = tie + Vector((ox + sway * t_ * t_, 0.16 + 0.12 * math.sin(t_ * 5 + k * 1.7), -0.18 - ln * t_))
                    w = 0.22 * (1 - 0.3 * t_) if s_ < 4 else 0.0
                    cur = (q - Vector((w / 2, 0, 0)), q + Vector((w / 2, 0, 0)))
                    if prev is not None:
                        shade = (0.8 if s_ % 2 else 1.05) * (1.0 - 0.25 * t_)
                        if s_ < 4:
                            p.quad((prev[0], prev[1], cur[1], cur[0]), scale(col, shade), mat=LEAF)
                        else:
                            p.quad((prev[0], prev[1], q), scale(col, shade), mat=LEAF)
                    prev = cur
        p.skull(tie + Vector((-sign * 0.1, 0.36, -0.5)), size=0.46, yaw=0.3 * sign)
        p.skull(B(tx - sign * 0.75, tz - 0.6, gh(tx - sign * 0.75, tz - 0.6) + 0.02), size=0.42, yaw=-0.6 * sign)
        SOCKETS['tusks'].append([round(tx, 3), round(gy + h, 3), round(tz, 3)])
        collider_circle(f'tusk_{"we"[i]}', tx, tz, 0.75, gy + h)
    # the east ear, where it fell: its ring's stones heaped in the corner of
    # the muzzle and the cheek
    ex, ez, er_ = EAR_HEAP
    n = 0
    while n < 7:
        x, z = ex + rng.uniform(-1.2, 1.2), ez + rng.uniform(-1.2, 1.2)
        if math.hypot(x - ex, z - ez) > er_ - 0.3 or not ring_clear(x, z, 0.7):
            continue
        n += 1
        s = rng.uniform(0.7, 1.15)
        M = slope_matrix(x, z, yaw=rng.random() * TAU, lift=s * rng.uniform(0.0, 0.2))
        M = M @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.4, 0.4), 4, 'Y')
        with p.as_kind(K_PAVE):
            p.box((0, 0, 0), (s * 1.5, s * 0.95, s * 0.8), p.vary(COURT_PALE, 0.08), chip=0.22, bevel=0.06, M=M, taper=0.8)
    FOOTINGS.append(('fallen_ear', ex, ez, 0.6, 0.6, 0.0, GR.footprint_range(ex, ez, 0.6, 0.6, 0.0, 0.2)[0] - 0.45))
    collider_circle('fallen_ear', ex, ez, er_, gh(ex, ez) + 1.0)
    # blocks of the breached back wall and the west cheek: sunk in the turf
    # down the bank, lying whole in the lagoon's shallows
    for (x0, z0, n) in BLOCK_FALLS:
        for k in range(n):
            x, z = x0 + rng.uniform(-1.6, 1.6), z0 + rng.uniform(-1.4, 1.4)
            s = rng.uniform(0.7, 1.25)
            wet = gh(x, z) < WATER_Y + 0.3
            M = slope_matrix(x, z, yaw=rng.random() * TAU,
                             lift=s * (rng.uniform(-0.1, 0.25) if wet else rng.uniform(-0.3, -0.12)))
            M = M @ Matrix.Rotation(rng.uniform(-0.5, 0.5) * (1.0 if wet else 0.5), 4, 'X') @ \
                Matrix.Rotation(rng.uniform(-0.4, 0.4) * (1.0 if wet else 0.5), 4, 'Y')
            if min(math.hypot(x - px, z - pz) for (px, pz) in PALMS) < 1.8:
                continue
            with p.as_kind(K_PAVE):
                p.box((0, 0, 0), (s * 1.6, s * 0.9, s * 0.8), p.tone(x, z), chip=0.22, bevel=0.05, M=M, taper=0.85)
    return p



# ================================================================ the growth
PADS = []


def mound_y(x, z):
    k = math.hypot(x - 0.3, z - (HEAD_Z + 1.4)) / 3.5
    return HEAD_TOP - 0.9 + 1.5 * max(0.0, 1 - k * k) ** 1.4 - 1.3 * k ** 3


def growth():
    p = P('Growth', seed=17)
    rng = p.rng
    counts, last = {}, [0]

    def tally(name):
        n = sum(len(f.verts) - 2 for f in p.bm.faces)
        counts[name] = n - last[0]
        last[0] = n

    def L(q):
        return LEAN @ Vector(q)

    def level(n):
        v = Vector((n[0], n[1], 0.0))
        return v.normalized() if v.length > 1e-3 else Vector((0, 1, 0))
    # the fig's crown: layered pads of leaf on the limbs, a thin fringe hanging under each
    for i, (cx, cz, cy, cr) in enumerate(CROWN):
        c = L(B(cx, cz, cy))
        p.pad(c, cr, i)
        PADS.append((c.copy(), cr))
        for k in range(2):
            a = TAU * k / 2 + rng.uniform(-0.9, 0.9)
            d = cr * rng.uniform(0.5, 0.9)
            top = c + Vector((math.cos(a) * d, math.sin(a) * d, -cr * 0.3))
            p.weed(top, rng.uniform(1.2, 2.6), (math.cos(a), math.sin(a), 0), width=1.5, strands=2, leaf=0.36, density=0.45)
    tally('crown')
    # lianas: from the crown down to the brows, the ear, the cheeks, the muzzle and the nape
    ends = [(0.5, 14.4), (-0.55, 14.2), (0.1, 10.4), (-0.2, 9.4), (1.3, 9.2), (-1.35, 9.0), (2.3, 11.0), (-2.4, 10.4),
            (3.0, 9.6), (1.9, 13.4), (-1.9, 12.6), (0.9, 6.6)]
    Pn, _n = skin_points(ends, lift=0.12)
    for q in Pn:
        b = L(q)
        (cx, cz, cy, cr) = min(CROWN[1:], key=lambda c: (L(B(c[0], c[1], c[2])) - b).length)
        a = L(B(cx, cz, cy - cr * 0.3)) + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * cr * 0.5
        p.liana(a, b, sag=rng.uniform(0.2, 0.9), r=0.05, leaves=0.22)
    for k in range(8):
        (cx, cz, cy, cr) = CROWN[k % len(CROWN)]
        a = rng.random() * TAU
        d = cr * rng.uniform(0.2, 0.9)
        top = L(B(cx + math.cos(a) * d, cz + math.sin(a) * d, cy - cr * 0.3))
        p.kelp(top, rng.uniform(3.0, 8.0), (math.cos(a), -math.sin(a), 0), width=0.7, blades=3, blade=0.05)
    tally('lianas')
    # hanging leaf curtains off the brows, the flews, the jowls and the nape's overhang
    hang = [(s * th, v, ln) for s in (1, -1) for (th, v, ln) in ((0.4, 13.2, 1.0), (0.8, 12.8, 1.6), (1.18, 4.75, 2.0),
                                                                  (1.75, 4.6, 2.4), (2.4, 4.5, 2.2), (0.44, 5.0, 1.4))]
    hang += [(3.05, 4.6, 2.0), (-2.9, 4.7, 1.6)]
    Pn, Nn = skin_points([(th, v) for (th, v, _ln) in hang], lift=0.08)
    for (q, n, (_th, _v, ln)) in zip(Pn, Nn, hang):
        p.weed(L(q), ln, level(n), width=1.3, strands=3, leaf=0.26, density=0.85)
    tally('curtains')
    # moss, fern and a trailing vine on every ledge of the skull (the brows,
    # the muzzle, the cheekbones, the crown)
    places = [(TAU * i / 56, 3.4 + 0.8 * j) for j in range(19) for i in range(56)]
    Pn, Nn = skin_points(places)
    for (q, n, (th, v)) in zip(Pn, Nn, places):
        if n[2] < 0.62 or (abs(wrap(th)) < 0.82 and 9.8 < v < 12.0) or rng.random() < 0.93:
            continue
        r = rng.random()
        if r < 0.5:
            p.moss_mat(L(q), rng.uniform(0.4, 0.75), height=0.11)
        elif r < 0.8:
            p.fern(L(q), fronds=6, length=rng.uniform(0.6, 1.1), width=0.24)
        else:
            p.weed(L(q) + Vector((0, 0, 0.02)), rng.uniform(0.8, 2.0), level(n), width=0.7, strands=2, leaf=0.24)
    tally('ledges')
    # the crown's earth: fern and taro round the fig's foot
    for k in range(13):
        a = rng.random() * TAU
        d = rng.uniform(1.5, 3.0)
        x, z = 0.3 + math.cos(a) * d, HEAD_Z + 1.4 + math.sin(a) * d
        v = L(B(x, z, mound_y(x, z) - 0.08))
        if rng.random() < 0.6:
            p.fern(v, fronds=7, length=rng.uniform(1.0, 1.7), width=0.34)
        else:
            p.taro(v, leaves=4, height=rng.uniform(0.9, 1.5), size=0.85)
    # the ground: fern, taro and sedge along the causeway's kerbs, against the
    # neck's foot and up the knoll behind it, round the tusks, the fire bowls
    # and the fallen blocks; reed where the bank meets the lagoon. Nothing in
    # the ways in, nothing near the ring.
    tally('crown_earth')

    def beside(x, z):
        kerb = abs(abs(x - apron_c(z)) - (apron_hw(z) + 1.2)) if APRON['z0'] < z < MUZ_S else 9.0
        return min(kerb, abs(math.hypot(x, z - HEAD_Z) - (HEAD_R + 1.3)),
                   min(math.hypot(x - bx, z - bz) for (bx, bz) in BRAZIERS + TUSKS),
                   min(math.hypot(x - bx, z - bz) - 1.2 for (bx, bz, _n) in BLOCK_FALLS))

    spots = []
    for k in range(150):
        x, z = rng.uniform(-11.8, 19.0), rng.uniform(-17.0, 23.0)
        d = math.hypot(x, z - HEAD_Z)
        if d < HEAD_R + 0.7:
            continue
        if d < HEAD_R + 3.6 and abs(math.atan2(x, HEAD_Z - z)) < 0.8:
            continue
        if abs(x - apron_c(z)) < apron_hw(z) + 0.75 and APRON['z0'] - 0.6 < z < APRON['z1']:
            continue
        if not ring_clear(x, z, 1.0) or way_dist(x, z) < 2.0:
            continue
        if beside(x, z) > 1.8 and rng.random() < 0.8:
            continue
        spots.append((x, z))
    for (x, z) in spots:
        y = gh(x, z)
        v = B(x, z, y)
        if y < WATER_Y + 0.12:
            p.reeds(B(x, z, max(y, WATER_Y - 0.5)), radius=0.5, stems=rng.randrange(6, 11), height=rng.uniform(1.5, 2.5),
                    heads=0.3, dry=0.1)
            continue
        if y < WATER_Y + 0.9:
            p.sedge(v, radius=0.34, blades=11, height=rng.uniform(0.7, 1.2), dry=0.05)
            continue
        r = rng.random()
        if r < 0.42:
            p.fern(v, fronds=rng.randrange(7, 10), length=rng.uniform(0.9, 1.7), width=0.34)
        elif r < 0.8:
            p.taro(v, leaves=rng.randrange(4, 7), height=rng.uniform(0.8, 1.7), size=rng.uniform(0.7, 1.15))
        elif r < 0.9:
            p.broadleaf(v, leaves=rng.randrange(5, 8), length=rng.uniform(1.0, 1.6), width=rng.uniform(0.3, 0.42))
        else:
            p.sedge(v, radius=0.3, blades=10, height=rng.uniform(0.6, 1.0), dry=0.05)
    tally('ground')
    # fern crowding both kerbs of the causeway, parted where the ring's way comes in
    for sign in (1, -1):
        z = APRON['z0'] + 0.4
        while z < MUZ_S - 0.6:
            x = apron_c(z) + sign * (apron_hw(z) + rng.uniform(0.75, 1.25))
            clear = min(math.hypot(x - bx, z - bz) for (bx, bz) in BRAZIERS + TUSKS) > 1.1
            if clear and ring_clear(x, z, 1.0) and way_dist(x, z) > 1.7:
                p.fern(B(x, z, gh(x, z)), fronds=rng.randrange(6, 9), length=rng.uniform(0.8, 1.3), width=0.3)
            z += rng.uniform(1.3, 1.9)
    # great ferns and taro standing over a walker at the tusks and behind the fire bowls
    for (x, z, ln) in ((TUSKS[0][0] + 1.5, TUSKS[0][1] + 0.9, 2.6), (TUSKS[1][0] - 1.5, TUSKS[1][1] + 0.5, 2.8),
                       (TUSKS[1][0] - 0.4, TUSKS[1][1] - 1.9, 2.2), (BRAZIERS[0][0] + 1.9, BRAZIERS[0][1] + 0.4, 2.4),
                       (BRAZIERS[1][0] - 1.7, BRAZIERS[1][1] + 0.9, 2.2)):
        if ring_clear(x, z, 1.5) and way_dist(x, z) > 2.2:
            p.fern(B(x, z, gh(x, z)), fronds=9, length=ln, width=0.52)
            p.taro(B(x + 0.7, z + 0.5, gh(x + 0.7, z + 0.5)), leaves=5, height=ln * 0.8, size=1.3)
    # reed standing in the shallows where the bank meets the lagoon
    reeds = 0
    for k in range(160):
        x, z = rng.uniform(0.0, 19.5), rng.uniform(13.0, 23.4)
        y = gh(x, z)
        if reeds < 6 and WATER_Y - 0.8 < y < WATER_Y + 0.2 and math.hypot(x, z - HEAD_Z) > HEAD_R + 1.5:
            reeds += 1
            p.reeds(B(x, z, max(y, WATER_Y - 0.5)), radius=0.55, stems=rng.randrange(6, 11), height=rng.uniform(1.6, 2.7),
                    heads=0.3, dry=0.1)
    tally('kerbs_reeds')
    # fern in the gaps the lost flagstones left, moss on the causeway
    for (x, z) in GAPS:
        p.fern(B(x, z, gh(x, z)), fronds=7, length=rng.uniform(0.7, 1.1), width=0.28)
    z = APRON['z0'] + 0.3
    while z < APRON['z1'] - 0.4:
        for _ in range(1):
            x = apron_c(z) + rng.uniform(-1.0, 1.0) * (apron_hw(z) - 0.3)
            p.moss_mat(B(x, z, gh(x, z) + 0.15), rng.uniform(0.3, 0.6), height=0.07)
        z += 0.9
    tally('causeway')
    print('GROWTH', json.dumps(counts))
    return p


# ================================================================ main
def new_root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def round_pads(obj):
    """Light each pad of the crown as one rounded mass (the engine does the
    same to its own trees' leaf cards): every corner of a pad's faces takes a
    normal out of the pad's middle, a little up. Everything else keeps its
    flat faces."""
    me = obj.data
    tag = [d.value for d in me.attributes['pad'].data]
    normals = [None] * len(me.loops)
    for poly in me.polygons:
        k = tag[poly.index]
        for li in poly.loop_indices:
            if not k:
                normals[li] = poly.normal.copy()
                continue
            c, r = PADS[k - 1]
            v = me.vertices[me.loops[li].vertex_index].co
            d = (v - (c - Vector((0, 0, 0.6 * r)))).normalized()
            normals[li] = (d * 0.82 + Vector((0, 0, 0.18))).normalized()
    me.normals_split_custom_set(normals)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = rk.make_materials()
    sculpt()
    pieces = {'main': [head(), teeth(), fig()], 'court': [court()]}
    pieces['growth'] = [growth()]
    allp = [p for group in pieces.values() for p in group]
    bvh = None if '--no-ao' in argv else rk.occluder(allp, GR)
    roots = {'main': 'WildheartEntrance_ROOT', 'court': 'WildheartEntranceCourt_ROOT',
             'growth': 'WildheartEntranceGrowth_ROOT'}
    files = {'main': 'wildheart_basin_entrance.glb', 'court': 'wildheart_basin_entrance_court.glb',
             'growth': 'wildheart_basin_entrance_growth.glb'}
    names = {'main': 'Entrance_Idol', 'court': 'Entrance_Court', 'growth': 'Entrance_Growth'}
    raw = os.path.join(OUT, 'glb_raw')
    os.makedirs(raw, exist_ok=True)
    stats = {'tris': {}, 'total_tris': 0}
    for key, group in pieces.items():
        root = new_root(roots[key])
        objs = [p.finish(mats, root, ground=gb, bvh=bvh) for p in group]
        for o in objs:
            n = ec.count_tris([o])
            stats['tris'][o.name] = n
            stats['total_tris'] += n
        if key == 'growth':
            round_pads(objs[0])
        if len(objs) > 1:
            objs = [join(objs, names[key])]
        ec.export_glb([root] + objs, os.path.join(raw, files[key]))
    SOCKETS['window'] = {'half': MOUTH['half'], 'spring': MOUTH['spring'], 'rise': MOUTH['rise'], 'z': WINDOW_Z,
                         'water': round(gh(0, WINDOW_Z - 0.3) - 0.2, 3), 'kerb': round(gh(0, WINDOW_Z - 0.3) + 0.2, 3),
                         'leanRoll': round(LEAN_ROLL, 5), 'leanPitch': round(LEAN_PITCH, 5)}
    stats.update({'sockets': SOCKETS, 'colliders': COLLIDERS, 'footings': ec.gap_report(GR, FOOTINGS), 'door': GR.door,
                  'waterY': round(WATER_Y, 3), 'exitDrop': EXIT_DROP, 'lane': LANE})
    stats['footingsShort'] = [f['name'] for f in stats['footings'] if not f['ok']]
    stats['footingRows'] = [{'name': n, 'cx': round(cx, 3), 'cz': round(cz, 3), 'hw': round(hw, 3), 'hd': round(hd, 3),
                             'rot': round(rot, 4), 'bottom': round(b, 3)} for (n, cx, cz, hw, hd, rot, b) in FOOTINGS]
    json.dump(stats, open(os.path.join(OUT, 'stats.json'), 'w'), indent=1)
    print('STATS', json.dumps({'tris': stats['tris'], 'total': stats['total_tris'], 'short': stats['footingsShort'],
                               'colliders': len(COLLIDERS), 'drips': len(SOCKETS['drips'])}))
    import wildheart_renders
    wildheart_renders.scene(GR, WATER_Y, SOCKETS)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'wildheart_basin_entrance_v3.blend'))
    if RENDERS != 'none':
        wildheart_renders.run(OUT, GR, SURR, COLLIDERS, RENDERS, TAG)


if __name__ == '__main__':
    main()
