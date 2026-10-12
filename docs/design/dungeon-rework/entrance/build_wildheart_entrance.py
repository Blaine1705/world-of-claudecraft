"""The Wildheart Basin world entrance: the Jaguar Maw.

  blender -b --factory-startup --python build_wildheart_entrance.py -- --out DIR
      [--terrain DIR] [--renders all|quick|none] [--tag NAME] [--no-ao]

The Sunken Idol of the Palmreach (door (-232, 1112)) opened: a temple front of
cyclopean limestone carved as a roaring jaguar's face, sunk where the knoll
drops into the Sapphire Lagoon. The hill has swallowed its east shoulder and
the lagoon laps its west cheek; the whole mass leans west and forward, over
whoever comes down to it. The door is its open maw: a ruined stair of heaved
blocks runs down the knoll between two troll fire bowls and under the upper
fangs, to black water standing in the throat. Two slanted eyes with jade
pupils watch over the crest of the knoll; a strangler fig has rooted in the
crown and poured its roots down the temples and into the water; the Sunbone
have raised a pair of great tusks hung with war cloth at the stair head.

Run from the repo: --out tmp/asset_src/wildheart_basin_entrance --terrain <dir
of the probe's wildheart_heightgrid.json and wildheart_surroundings.json>
(probe.mts beside this file writes them:
`npx tsx probe.mts wildheart -232 1112 <dir> 40 120`), then
node scripts/assets/wildheart_basin_entrance/build.mjs.

Local game coords via ec.B(lx, lz, y): lx = x + 232 (+ WEST), lz = z - 1112
(+ NORTH), y = y - terrainHeight(-232, 1112). In Blender that is X = lx,
Y = -lz (so SOUTH is +Y), Z = y. Three GLBs share ONE origin, the door at its
terrain height:
  wildheart_basin_entrance.glb         the idol: body, face, fangs, the fig's trunk and roots
  wildheart_basin_entrance_court.glb   the stair, the fire bowls, the tusks, fallen stone
  wildheart_basin_entrance_growth.glb  the fig's crown, lianas, fern, broadleaf, reed, moss
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
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'kit'))
import entrance_common as ec  # noqa: E402
import wildheart_ruin_kit as rk  # noqa: E402
from wildheart_ruin_kit import (COURT, COURT_DARK, COURT_PALE, COURT_WARM, GLOW, K_CLOTH, K_EARTH, K_GLASS,  # noqa: E402
                                K_LEAF, K_METAL, K_PAVE, K_RAW, K_STONE, K_WOOD, LEAF, STONE, TAU, WET, Ruin,
                                arch_points, fbm, mix, scale, smooth)

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
BARK = (0.43, 0.37, 0.28)
BARK_DARK = (0.27, 0.22, 0.16)
BRONZE = (0.36, 0.27, 0.14)
COAL = (1.0, 0.46, 0.12)
CANOPY = ((0.20, 0.42, 0.17), (0.27, 0.52, 0.21), (0.35, 0.58, 0.22), (0.44, 0.62, 0.24))
FERN = ((0.18, 0.42, 0.14), (0.26, 0.52, 0.17), (0.34, 0.56, 0.18))
BROAD = ((0.15, 0.40, 0.17), (0.22, 0.50, 0.20), (0.30, 0.56, 0.20))

COLLIDERS = []
FOOTINGS = []
SOCKETS = {'drips': [], 'eyes': [], 'braziers': [], 'tusks': []}
TOPS = []

# ---- the plan (door-local, upright; the lean is applied last) -------------------
# The head is a round battered drum; the face is authored FLAT, on the plane
# tangent to the drum at the maw (x across it, s out of it, y up), and wrapped
# onto the drum by warp() once it is carved.
FACE_Z = 1.0          # the tangent plane (the face at the maw's middle)
R_FACE = 7.8          # the drum's radius up to the cheeks
HEAD_Z = FACE_Z + R_FACE
HEAD_TOP = 13.4
MUZ_HW = 5.6
MUZ_S = -1.6          # the muzzle's south face at its foot
MOUTH = dict(half=2.6, spring=3.6, rise=2.6)
LIP = 0.72            # the lip ring's thickness
LANE = 1.35           # half width of the walk-in lane between the lower teeth
WINDOW_Z = 1.3        # the engine's throat window stands here
EYE = dict(x=3.9, y=10.5, a=1.45, b=0.82, slant=0.30)
EAR = dict(x=5.7, y=13.0, half=1.6, rise=2.8)
LEAN_ROLL = math.radians(2.5)      # the crown toward the WEST (the lagoon)
LEAN_PITCH = math.radians(2.0)     # and SOUTH, over the stair
LEAN = Matrix.Rotation(LEAN_ROLL, 4, 'Y') @ Matrix.Rotation(-LEAN_PITCH, 4, 'X')
EXIT_DROP = (0.0, -4.0)
BRAZIERS = [(3.6, -3.6), (-3.6, -3.6)]
TUSKS = [(5.4, -6.9), (-5.2, -7.5)]
STAIR = dict(z0=-9.4, z1=1.1, hw_out=2.5, hw_in=2.3)


def gb(x, y):
    """Ground height at a Blender XY."""
    return gh(x, -y)


def g(v, w):
    return math.exp(-(v / w) ** 2)


def head_radius(y):
    """The drum's face radius: a flared foot, plumb to the cheeks, drawn in
    toward the crown."""
    return R_FACE + 0.45 * smooth(1.0, -2.0, y) - 1.05 * smooth(7.6, 13.6, y)


def f_face(x, y):
    """The face's relief (yards OUT of the drum): heavy brows, cheeks, a
    swelling forehead."""
    brow = 0.6 * g(abs(x) - 4.0, 2.3) * g(y - (EYE['y'] + 1.5), 0.95)
    cheek = 0.45 * g(abs(x) - 6.6, 1.7) * g(y - 7.2, 2.1)
    head = 0.25 * g(x, 2.6) * g(y - 12.4, 1.2)
    return (brow + cheek + head) * smooth(11.5, 9.0, abs(x))


def f_muzzle(x, y):
    """The muzzle's relief: the upper jaw pushed out over the stair, and the
    two whisker pads."""
    jaw = 0.95 * g(x, 3.8) * smooth(3.0, 6.8, y) * (1 - 0.4 * smooth(7.2, 8.4, y)) * (1 - smooth(8.2, 9.2, y))
    pads = 0.34 * g(abs(x) - 2.9, 1.0) * g(y - 6.8, 0.85)
    return jaw + pads


def relief(v):
    """The whole face's relief at a FLAT point (how far a carved piece is
    pushed out): the muzzle's fades out at the face's own plane."""
    return f_face(v.x, v.z) + f_muzzle(v.x, v.z) * smooth(-FACE_Z, -FACE_Z + 0.9, v.y)


def warp(v):
    """A FLAT point (x across the face, Y out of its plane, Z up) wrapped onto
    the head's drum: x is the arc at the face radius."""
    th = v.x / R_FACE
    r = head_radius(v.z) + (v.y + FACE_Z)
    return Vector((r * math.sin(th), -HEAD_Z + r * math.cos(th), v.z))


def flat(x, s, y, muzzle=False):
    """A point of the face (or of the muzzle's front): x across, s out of the
    carved surface, y up, wrapped onto the drum."""
    if muzzle:
        return warp(Vector((x, -MUZ_S + f_muzzle(x, y) + f_face(x, y) + s, y)))
    return warp(Vector((x, -FACE_Z + f_face(x, y) + s, y)))


def collider_obb(name, cx, cz, hw, hd, rot, top):
    COLLIDERS.append({'name': name, 'type': 'obb', 'lx': round(cx, 3), 'lz': round(cz, 3), 'hw': round(hw, 3),
                      'hd': round(hd, 3), 'rot': round(rot, 4), 'top': round(top, 2)})


def collider_circle(name, cx, cz, r, top):
    COLLIDERS.append({'name': name, 'type': 'circle', 'lx': round(cx, 3), 'lz': round(cz, 3), 'r': round(r, 3),
                      'top': round(top, 2)})


def footing(name, cx, cz, hw, hd, rot, bury):
    """Register a footing and return its underside: `bury` under the lowest
    ground at its centre and four corners (the points the sim test samples)."""
    c, s = math.cos(rot), math.sin(rot)
    lo = min(gh(cx + u * c + v * s, cz - u * s + v * c)
             for (u, v) in ((0, 0), (-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)))
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


def P(name, **kw):
    kw.setdefault('moss', 1.5)
    return Jungle('Entrance_' + name, tide=WATER_Y + 0.4, **kw)


def lean_piece(p, mark=0):
    for v in p.bm.verts:
        if mark == 0 or v[p.gen] == 0 or v[p.gen] > mark:
            v.co = LEAN @ v.co
    p.mark()
    if mark == 0:
        p.soot = [(LEAN @ q, *rest) for (q, *rest) in p.soot]
        p.paint = [(LEAN @ q, *rest) for (q, *rest) in p.paint]
        p.streaks = [(LEAN @ q, *rest) for (q, *rest) in p.streaks]


def carve(p, mark):
    """Seat what was built FLAT since `mark` on the face's relief and wrap it
    onto the head."""
    for v in p.bm.verts:
        if v[p.gen] == 0 or v[p.gen] > mark:
            v.co.y += relief(v.co)
            v.co = warp(v.co)
    return p.mark()


# ================================================================ the idol's head
def face_x(theta):
    """The face's arc coordinate of a drum angle (the drum's own theta runs
    from +X; the maw looks SOUTH, +Y in Blender)."""
    d = (math.pi / 2 - theta + math.pi) % TAU - math.pi
    return d * R_FACE


def eye_in(x, y):
    sign = 1 if x > 0 else -1
    c, s = math.cos(EYE['slant']), math.sin(EYE['slant'])
    dx = (x - sign * EYE['x']) * sign
    dy = y - EYE['y']
    a = dx * c + dy * s
    b = -dx * s + dy * c
    if abs(a) >= EYE['a']:
        return False
    return abs(b) < EYE['b'] * (1 - (a / EYE['a']) ** 2) ** 0.75


def eye_outline(sign, grow=0.0, n=18):
    """The eye's almond as a closed polyline in the face plane (x, y)."""
    c, s = math.cos(EYE['slant']), math.sin(EYE['slant'])
    pts = []
    for i in range(n):
        t = TAU * i / n
        a = math.cos(t) * (EYE['a'] + grow)
        b = math.copysign(abs(math.sin(t)) ** 1.5, math.sin(t)) * (EYE['b'] + grow)
        dx, dy = a * c - b * s, a * s + b * c
        pts.append((sign * (EYE['x'] + dx), EYE['y'] + dy))
    return pts


def mouth_in(x, y, grow=0.0):
    dx = abs(x)
    half, rise = MOUTH['half'] + grow, MOUTH['rise'] + grow
    if dx >= half:
        return False
    if y <= MOUTH['spring']:
        return True
    k = (y - MOUTH['spring']) / rise
    return k < 1 and dx < half * math.sqrt(max(0.0, 1 - k * k))


def ear_bump(x, sign):
    d = (x * sign - EAR['x']) / EAR['half']
    return EAR['rise'] * math.sqrt(1 - d * d) if abs(d) < 1 else 0.0


def slab(p, outline, s0, s1, color, bevel=0.06):
    """A carved stone cut to an outline in the face plane [(x, y)], standing
    from s0 to s1 out of it (FLAT space)."""
    lo = [p.bm.verts.new(Vector((x, -FACE_Z + s0, y))) for (x, y) in outline]
    hi = [p.bm.verts.new(Vector((x * 0.94, -FACE_Z + s1, y))) for (x, y) in outline]
    n = len(outline)
    faces = [p.bm.faces.new(hi), p.bm.faces.new(list(reversed(lo)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append(p.bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
    bmesh.ops.recalc_face_normals(p.bm, faces=faces)
    p._paint(faces, color, STONE)
    if bevel:
        out = bmesh.ops.bevel(p.bm, geom=rk._edges_of(faces), offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        p._paint(out['faces'], scale(color, 1.12), STONE)


def head():
    p = P('Head', seed=3, moss=2.0)
    Mh = Matrix.Translation(B(0, HEAD_Z, 0))
    y0 = footing('head', 0.0, HEAD_Z, R_FACE, R_FACE, 0.0, 0.8)

    def top(theta):
        x = face_x(theta)
        # whole over the face; breached at the back toward the lagoon
        back = g(abs(x) - 24.5, 4.5) * 4.6 + g(x - 14.5, 2.2) * 2.2
        return HEAD_TOP - back + 0.5 * (fbm(x * 0.5, 3.0, 0.0) - 0.5) * smooth(7.0, 10.0, abs(x))

    def holes(theta, y):
        x = face_x(theta)
        return abs(x) < 6.0 and (mouth_in(x, y, 0.2) or eye_in(x, y))

    tops = p.drum(head_radius, y0, top, M=Mh, course=(0.62, 0.92), unit=(1.3, 2.6), depth=0.8, rim=1.25,
                  holes=[holes], bands=[(12.5, 0.55, 0.26, COURT_PALE)], missing=0.01, proud=0.06, slip=0.03,
                  shift=lambda th, y: (f_face(face_x(th), y), 0.0, 0.0), ragged=0.2, core_sides=28, ground=gb, lining=1.3)
    TOPS.extend(tops)
    m = p.mark()
    # the ears: a carved ring on the drum's shoulder, filled with coursed stone
    Mplane = Matrix.Translation((0, -FACE_Z, 0))
    for sign in (1, -1):
        whole = sign > 0
        ex = sign * EAR['x']

        def ear_top(t, sign=sign, whole=whole, ex=ex):
            x = ex - EAR['half'] + 2 * EAR['half'] * t
            e = ear_bump(x, sign) - 0.25
            return EAR['y'] - 0.6 + (e if whole else min(e, 0.7 + 0.6 * fbm(x * 1.3, 2.0, 0.0)))
        p.wall((ex - EAR['half'] + 0.1, FACE_Z + 0.35), (ex + EAR['half'] - 0.1, FACE_Z + 0.35), 0.9, EAR['y'] - 0.6,
               ear_top, course=(0.5, 0.75), unit=(1.1, 2.2), missing=0.0, proud=0.04, ragged=0.1 if whole else 0.5,
               pillow=0.012)
        ring = [(ex + x, EAR['y'] - 0.6 + z) for (x, z) in arch_points(EAR['half'], EAR['rise'], steps=5)]
        if whole:
            p.arch(ring, 0.55, 1.35, COURT_PALE, Mplane, bevel=0.06, chip=0.1, tone=0.1, y_off=-0.3)
            fold = [(ex + x, EAR['y'] - 0.45 + z) for (x, z) in arch_points(EAR['half'] * 0.55, EAR['rise'] * 0.55, steps=3)]
            p.arch(fold, 0.24, 0.5, COURT_DARK, Mplane, bevel=0.04, chip=0.1, y_off=0.22)
        else:
            # of the east ear only the two springers still stand
            p.arch(ring, 0.55, 1.35, COURT_PALE, Mplane, bevel=0.06, chip=0.14, tone=0.1, y_off=-0.3,
                   skip=set(range(2, 9)), drop={1: (-0.12, -0.1, 0.12)})
    # the eyes: a carved lid ring, the jade and the slit of a cat's pupil
    for sign in (1, -1):
        ex, ey = sign * EYE['x'], EYE['y']
        lid = eye_outline(sign, grow=0.02)
        lid.append(lid[0])
        p.arch(lid, 0.4, 0.95, COURT_PALE, Mplane, bevel=0.05, chip=0.08, tone=0.08, y_off=0.05, center=(ex, ey))
        with p.as_kind(K_GLASS):
            faces = p.rock((ex, -(FACE_Z + 0.34), ey), (2.3, 0.6, 1.5), JADE, jitter=0.03, subdivisions=2, mat=WET)
            for f in faces:
                for loop in f.loops:
                    v = loop.vert.co
                    k = smooth(1.0, 0.0, math.hypot((v.x - ex) * 0.8, (v.z - ey) * 1.1))
                    loop[p.col] = (*mix(scale(JADE, 0.45), JADE_PALE, k * 0.9), 1.0)
        with p.as_kind(K_RAW):
            for roll in (0.0, math.pi):
                p.box((ex, -(FACE_Z + 0.02), ey), (0.3, 0.16, 1.5), (0.015, 0.025, 0.02), taper=0.15, chip=0.1,
                      roll=roll + sign * EYE['slant'] * 0.5)
        p.soot.append((warp(Vector((ex, -FACE_Z + 0.2, ey - 0.2))), 1.6, 0.45))
        SOCKETS['eyes'].append(leaned(flat(ex, 0.25, ey)))
    # the brows: two heavy carved ridges from the nose's bridge to the temples
    ey = EYE['y']
    for sign in (1, -1):
        brow = [(sign * x, ey + y) for (x, y) in ((0.8, -0.8), (1.65, 0.25), (2.75, 0.9), (4.0, 1.28), (5.4, 1.55),
                                                   (6.7, 1.8), (7.9, 2.15))]
        p.arch(brow, 0.95, 1.35, COURT, Mplane, bevel=0.07, chip=0.1, tone=0.08, y_off=0.42,
               center=(sign * 4.1, ey - 5.5))
        lower = [(sign * x, ey + y) for (x, y) in ((1.9, -1.3), (3.2, -1.3), (4.6, -0.82), (5.9, -0.1))]
        p.arch(lower, 0.44, 0.9, COURT, Mplane, bevel=0.05, chip=0.1, tone=0.08, y_off=0.22,
               center=(sign * 3.9, ey + 4.5))
        p.streaks.append((warp(Vector((sign * 5.1, -FACE_Z + 0.5, ey - 1.2))), 0.55, 4.2, 0.6))
        p.streaks.append((warp(Vector((sign * 2.5, -FACE_Z + 0.5, ey - 1.5))), 0.4, 2.2, 0.5))
    # the nose's bridge: three stones climbing from the muzzle's brow to between the eyes
    for (y, w, d, h) in ((8.75, 2.2, 1.5, 0.95), (9.65, 1.85, 1.2, 0.9), (10.5, 1.5, 0.95, 0.85)):
        p.hewn((0, -FACE_Z + d / 2 - 0.1, y), (w, d, h), p.vary(COURT_PALE, 0.07), chip=0.1, taper=0.9)
    # worn war paint: ochre over the brows, red under the eyes
    for sign in (1, -1):
        for (x, y) in ((2.3, 1.1), (4.0, 1.7), (5.7, 2.0)):
            p.paint.append((warp(Vector((sign * x, -FACE_Z + 1.3, ey + y))), 1.35, WAR_OCHRE, 0.8))
        for (x, y) in ((3.1, -1.7), (4.8, -1.3)):
            p.paint.append((warp(Vector((sign * x, -FACE_Z + 0.7, ey + y))), 1.15, WAR_RED, 0.85))
    carve(p, m)
    # the earth that has gathered in the broken crown, where the fig stands
    with p.as_kind(K_EARTH):
        p.mound(0.0, HEAD_Z, head_radius(HEAD_TOP) - 0.5, head_radius(HEAD_TOP) - 0.5, 2.7,
                lambda x, z: HEAD_TOP - 1.0, mix(rk.TURF, rk.MOSS_DEEP, 0.4), rings=3, segs=9, sink=1.4, jitter=0.25)
    lean_piece(p)
    collider_circle('head', 0.0, HEAD_Z, R_FACE + 0.25, EAR['y'] + EAR['rise'])
    return p


# ================================================================ the muzzle and the maw
def muzzle_top(x):
    return 7.3 + 1.1 * (1 - (x / MUZ_HW) ** 2)


def mouth_line(x):
    """The mouth's opening over x (the lip ring's intrados)."""
    k = min(1.0, abs(x) / MOUTH['half'])
    return MOUTH['spring'] + MOUTH['rise'] * math.sqrt(1 - k * k)


def muzzle():
    p = P('Muzzle', seed=11, moss=1.7)
    zc = (MUZ_S + FACE_Z) / 2 + 0.2
    depth = FACE_Z - MUZ_S + 0.4          # it runs a little into the drum
    y0 = footing('muzzle', 0.0, zc, MUZ_HW, depth / 2, 0.0, 0.6)

    def hole(u, y):
        return mouth_in(u - MUZ_HW, y, LIP)

    def bend(u, n, y):
        return (0.0, f_muzzle(u - MUZ_HW, y) * smooth(-FACE_Z, -FACE_Z + 0.9, -zc + n) + f_face(u - MUZ_HW, y), 0.0)

    m = p.mark()
    tops = p.wall((-MUZ_HW, zc), (MUZ_HW, zc), depth, y0, lambda t: muzzle_top(-MUZ_HW + 2 * MUZ_HW * t), holes=[hole],
                  course=(0.6, 0.9), unit=(1.2, 2.4), deform=bend, missing=0.0, proud=0.06, slip=0.02, ragged=0.14,
                  ground=gb, pillow=0.012)
    for (q, w) in tops:
        TOPS.append((warp(q), w))
    m2 = p.mark()
    # the lips: one ring of carved stones round the maw, right through the wall
    jamb = [(-MOUTH['half'], y) for y in (-1.8, -0.4, 1.0, 2.3)]
    lip = jamb + [(x, MOUTH['spring'] + z) for (x, z) in arch_points(MOUTH['half'], MOUTH['rise'], steps=7)] + \
        [(-x, y) for (x, y) in reversed(jamb)]
    back = FACE_Z + 0.75
    Mlip = Matrix.Translation((0, -(MUZ_S + back) / 2, 0))
    p.arch(lip, LIP, back - MUZ_S, COURT_WARM, Mlip, bevel=0.07, chip=0.09, tone=0.1, depth_jit=0.03)
    # the nose: a dark carved leather, wide above and narrow at the lip, its
    # two slanted nostrils, the split of the lip under it
    s0 = FACE_Z - MUZ_S
    nose = mix(COURT_DARK, COURT, 0.25)
    slab(p, [(-0.5, 8.5), (0.5, 8.5), (0.62, 6.82), (-0.62, 6.82)], s0 - 0.1, s0 + 1.0, p.vary(nose, 0.06), bevel=0.08)
    for sign in (1, -1):
        wing = [(0.56, 8.5), (1.5, 8.5), (1.72, 7.95), (1.3, 7.3), (0.66, 6.86)]
        slab(p, [(sign * x, y) for (x, y) in (wing if sign > 0 else list(reversed(wing)))], s0 - 0.1, s0 + 0.78,
             p.vary(nose, 0.06), bevel=0.08)
        with p.as_kind(K_RAW):
            p.box((sign * 1.0, -FACE_Z + s0 + 0.76, 7.62), (0.62, 0.2, 0.3), VOIDC, roll=-sign * 0.62, chip=0.15)
            p.box((sign * 1.28, -FACE_Z + s0 + 0.76, 7.88), (0.34, 0.2, 0.26), VOIDC, roll=-sign * 1.2, chip=0.15)
        p.soot.append((warp(Vector((sign * 1.0, -FACE_Z + s0 + 1.7, 7.4))), 0.7, 0.4))
    with p.as_kind(K_RAW):
        p.box((0, -FACE_Z + s0 + 0.2, 6.55), (0.2, 0.2, 0.62), VOIDC, chip=0.2)
    # the whisker pads' pits, and red paint worn off the lips
    for sign in (1, -1):
        for (x, y) in ((1.9, 6.75), (2.75, 7.1), (3.6, 6.85), (2.3, 6.2), (3.2, 6.3)):
            p.soot.append((warp(Vector((sign * x, -MUZ_S + f_muzzle(sign * x, y) + 0.1, y))), 0.22, 0.85))
        for (x, y) in ((1.3, 5.9), (2.9, 5.0), (3.6, 3.2), (3.4, 1.4)):
            p.paint.append((warp(Vector((sign * x, -MUZ_S + f_muzzle(sign * x, y) + 0.3, y))), 1.2, WAR_RED, 0.85))
    for v in p.bm.verts:
        if v[p.gen] == 0 or v[p.gen] > m2:
            v.co.y += relief(v.co)
    for v in p.bm.verts:
        v.co = warp(v.co)
    p.mark()
    lean_piece(p)
    # the muzzle's two halves either side of the lane: a box along each chord
    for sign in (1, -1):
        a = warp(Vector((sign * LANE, -MUZ_S, 0)))
        b = warp(Vector((sign * MUZ_HW, -MUZ_S, 0)))
        ax, az, bx, bz = a.x, -a.y, b.x, -b.y
        ln = math.hypot(bx - ax, bz - az)
        ux, uz = (bx - ax) / ln, (bz - az) / ln
        nx, nz = (-uz, ux) if (-uz * (0 - ax) + ux * (HEAD_Z - az)) > 0 else (uz, -ux)
        hd = 1.45
        collider_obb('muzzle_w' if sign > 0 else 'muzzle_e', (ax + bx) / 2 + nx * hd, (az + bz) / 2 + nz * hd, ln / 2, hd,
                     math.atan2(-uz, ux), 8.4)
    return p


def teeth():
    """The fangs: the upper row hangs from the lip, the lower stands on the
    jaw either side of the lane."""
    p = P('Teeth', seed=5, moss=0.35)
    m = p.mark()
    yb = -MUZ_S - 0.8
    tips = []
    for sign in (1, -1):
        x = sign * 2.05
        tip = Vector((sign * 1.88, yb - 0.2, 2.25))
        p.tooth((x, yb, mouth_line(x) + 0.3), tip, 0.52, IVORY, bend=(sign * 0.12, 0.25, 0))
        tips.append(tip)
        for (xx, ln, r) in ((0.42, 1.25, 0.25), (1.12, 1.35, 0.27)):
            xs = sign * xx
            tip = Vector((xs * 1.02, yb, mouth_line(xs) - ln))
            p.tooth((xs, yb + 0.12, mouth_line(xs) + 0.2), tip, r, IVORY, bend=(0, 0.06, 0), sides=5)
            tips.append(tip)
    for q in tips:
        q = q.copy()
        q.y += relief(q)
        SOCKETS['drips'].append(leaned(warp(q)))
    carve(p, m)
    lean_piece(p)
    # the lower jaw: the two canines and the low teeth along the lane
    for sign in (1, -1):
        x = sign * 2.15
        z = MUZ_S + 0.3
        gy = gh(x, z)
        p.tooth(B(x, z, gy - 0.5), B(x + sign * 0.3, z - 0.55, gy + 2.0), 0.42, IVORY, bend=(0, -0.1, 0))
        for (zz, hh) in ((MUZ_S + 0.85, 0.66), (MUZ_S + 1.5, 0.52), (MUZ_S + 2.1, 0.46)):
            xx = sign * (LANE + 0.26)
            gy = gh(xx, zz)
            p.tooth(B(xx, zz, gy - 0.3), B(xx + sign * 0.06, zz - 0.05, gy + hh), 0.21, IVORY, sides=5)
    return p


# ================================================================ the strangler fig
FIG = dict(x=0.8, z=HEAD_Z - 0.4, y=HEAD_TOP + 0.9)
FORK = 19.2
CROWN = [(-4.2, 4.8, 23.0, 4.4), (5.2, 6.0, 24.6, 4.8), (0.6, 12.4, 25.6, 4.6), (8.4, 11.6, 22.2, 4.0),
         (-6.6, 11.2, 21.8, 4.0), (1.2, 3.0, 21.6, 3.5), (10.6, 6.2, 21.0, 3.4), (-0.6, 8.6, 28.2, 4.2),
         (-2.8, 15.0, 22.4, 3.4)]


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
            rr = 0.95 * (1.3 - 0.85 * t)
            pts.append(base + (fork - base) * t + Vector((math.cos(aa) * rr, math.sin(aa) * rr, -0.8 if i == 0 else 0)))
        p.limb(pts, 0.62, 0.4, p.vary(BARK, 0.1), sides=6, wobble=0.06)
    # the limbs out to the crown
    for (cx, cz, cy, cr) in CROWN:
        tip = B(cx, cz, cy - cr * 0.15)
        mid = fork + (tip - fork) * 0.5 + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 1.0))
        p.limb([fork - Vector((0, 0, 0.8)), fork + (mid - fork) * 0.5 + Vector((0, 0, 0.5)), mid, tip], 0.46, 0.13,
               p.vary(BARK, 0.1), sides=5, wobble=0.08)
    # the roots, poured over the crown and down the head: each a line of
    # (x round the head, y, out of the stone), 0 at the maw, +-24.5 at the back
    top = HEAD_TOP + 0.35
    roots = [
        # down the west temple and cheek into the lagoon
        ([(4.0, top, 0.2), (6.9, 12.9, 0.42), (7.6, 11.2, 0.3), (7.9, 8.6, 0.3), (8.5, 5.2, 0.3), (8.0, 2.0, 0.3),
          (9.0, -1.6, 0.5)], 0.44, 0.17),
        # over the forehead, down the east side of the nose, onto the muzzle
        ([(-0.6, top, 0.3), (-1.3, 12.9, 0.45), (-1.35, 11.6, 1.0), (-1.7, 10.1, 0.75)], 0.34, 0.2),
        # round the broken east ear and down the east cheek into the knoll
        ([(-4.6, top, 0.2), (-7.6, 12.8, 0.4), (-8.3, 10.6, 0.3), (-8.0, 7.8, 0.3), (-8.9, 5.0, 0.3)], 0.36, 0.14),
        ([(-9.5, top, 0.2), (-11.6, 12.2, 0.4), (-11.2, 9.0, 0.3), (-12.0, 5.6, 0.3), (-11.5, 3.0, 0.3)], 0.42, 0.16),
        # down the west flank and round the back, into the water
        ([(10.0, top, 0.2), (12.4, 12.0, 0.4), (12.0, 8.6, 0.3), (12.9, 5.0, 0.3), (12.3, 1.6, 0.3), (13.2, -1.6, 0.6)],
         0.48, 0.19),
        ([(15.0, top - 1.6, 0.2), (16.8, 9.4, 0.4), (16.2, 5.8, 0.3), (17.2, 2.0, 0.3), (16.8, -1.6, 0.6)], 0.34, 0.13),
        ([(20.5, top - 3.6, 0.2), (21.4, 7.2, 0.4), (20.8, 3.6, 0.3), (21.8, -1.6, 0.6)], 0.44, 0.17),
        ([(-22.5, top - 3.4, 0.2), (-21.2, 7.6, 0.4), (-22.0, 4.0, 0.3), (-21.0, -1.6, 0.6)], 0.36, 0.14),
        ([(-16.0, top, 0.2), (-17.4, 11.0, 0.4), (-16.6, 7.0, 0.3), (-17.6, 2.6, 0.3), (-17.0, -1.2, 0.5)], 0.3, 0.12),
    ]
    for (line, r0, r1) in roots:
        pts = [base + Vector((line[0][0] * 0.03, 0.0, 0.1))] + [flat(x, s, y) for (x, y, s) in line]
        path = p.limb(pts, r0, r1, p.vary(BARK, 0.1), sides=5, wobble=0.03)
        for k in (len(path) // 2, 3 * len(path) // 4):
            q = path[k]
            d = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.1, 0.1), -1.0))
            p.limb([q, q + d * 0.9, q + d * rng.uniform(1.6, 2.6)], r0 * 0.4, 0.04, p.vary(BARK_DARK, 0.1), sides=4,
                   wobble=0.03)
    # the root that came down the nose runs on over the muzzle's brow and its east face
    p.limb([flat(-1.7, 0.75, 10.1), flat(-2.3, 0.6, 9.0), flat(-3.2, -0.5, muzzle_top(-3.2) + 0.15, muzzle=True),
            flat(-4.0, 0.25, 7.2, muzzle=True), flat(-4.5, 0.22, 5.0, muzzle=True), flat(-4.9, 0.2, 2.6, muzzle=True)],
           0.2, 0.09, p.vary(BARK, 0.1), sides=5, wobble=0.03)
    lean_piece(p)
    return p


# ================================================================ the court
def court():
    p = P('Court', seed=8, moss=1.2)
    rng = p.rng
    # the stair: heaved blocks down the knoll and into the maw, each level on
    # its own piece of the slope
    z = STAIR['z0']
    row = 0
    while z < STAIR['z1']:
        hw = STAIR['hw_in'] if z > MUZ_S - 0.2 else STAIR['hw_out'] + 0.5 * smooth(-4.0, -9.0, z)
        x = -hw + rng.uniform(-0.2, 0.2)
        while x < hw - 0.3:
            w = min(rng.uniform(0.85, 1.5), hw - x + 0.2)
            cx = x + w / 2
            d = rng.uniform(0.78, 0.98)
            top = max(gh(cx, z), gh(cx - w * 0.3, z), gh(cx + w * 0.3, z), gh(cx, z - d * 0.3)) + rng.uniform(0.07, 0.17)
            hh = rng.uniform(0.75, 1.0)
            with p.as_kind(K_PAVE):
                p.box(B(cx, z, top - hh / 2), (w - 0.05, d, hh), p.tone(cx, z), chip=0.16,
                      bevel=rng.uniform(0.04, 0.075), yaw=rng.uniform(-0.07, 0.07),
                      pitch=rng.uniform(-0.05, 0.05), roll=rng.uniform(-0.05, 0.05), bottom=False)
            x += w
        z += 0.84
        row += 1
    # the two fire bowls: a carved drum, a bronze bowl, the coals
    for i, (bx, bz) in enumerate(BRAZIERS):
        gy = gh(bx, bz)
        lo = min(gh(bx + dx, bz + dz) for dx in (-0.6, 0.6) for dz in (-0.6, 0.6))
        FOOTINGS.append((f'brazier_{"we"[i]}', bx, bz, 0.6, 0.6, 0.0, lo - 0.5))
        top = gy + 1.55
        m = p.mark()
        prof = [(0.74, lo - 0.5 - top), (0.74, gy - top + 0.25), (0.6, gy - top + 0.42), (0.52, -0.62), (0.56, -0.5),
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
        p.soot.append((B(bx, bz, top - 0.05), 0.8, 0.5))
        SOCKETS['braziers'].append([round(bx, 3), round(top + 0.34, 3), round(bz, 3)])
        collider_circle(f'brazier_{"we"[i]}', bx, bz, 0.78, top + 0.4)
    # the Sunbone's tusks at the stair head, leaning in over the way down, hung
    # with war cloth and the skulls of what the basin has eaten
    for i, (tx, tz) in enumerate(TUSKS):
        sign = 1 if tx > 0 else -1
        gy = gh(tx, tz)
        FOOTINGS.append((f'tusk_{"we"[i]}', tx, tz, 0.45, 0.45, 0.0, gy - 1.3))
        h = 6.4 if i == 0 else 5.6
        pts = [B(tx, tz, gy - 1.3), B(tx + sign * 0.25, tz, gy + h * 0.3), B(tx + sign * 0.1, tz + 0.1, gy + h * 0.62),
               B(tx - sign * 0.75, tz + 0.2, gy + h * 0.88), B(tx - sign * 1.9, tz + 0.3, gy + h)]
        path = p.limb(pts, 0.4, 0.06, IVORY, sides=7, kind=K_STONE, steps=4)
        # the lashing and the cloth
        tie = path[len(path) * 2 // 3]
        with p.as_kind(K_WOOD):
            p.box(tie, (0.42, 0.42, 0.3), rk.TIMBER_DARK, yaw=0.4, chip=0.2)
        for kk in (len(path) // 4, len(path) // 2):
            p.paint.append((path[kk], 0.62, WAR_RED, 1.4))
            p.soot.append((path[kk] + Vector((0, 0, 0.5)), 0.5, 0.35))
        with p.as_kind(K_CLOTH):
            for k in range(4):
                ox = (k - 1.5) * 0.2
                ln = rng.uniform(0.9, 2.1)
                col = scale(WAR_RED if k % 2 == 0 else WAR_OCHRE, rng.uniform(0.62, 0.9))
                sway = rng.uniform(-0.25, 0.25)
                prev = None
                for s_ in range(5):
                    t_ = s_ / 4
                    q = tie + Vector((ox + sway * t_ * t_, 0.16 + 0.12 * math.sin(t_ * 5 + k * 1.7), -0.18 - ln * t_))
                    w = 0.2 * (1 - 0.3 * t_) if s_ < 4 else 0.0
                    cur = (q - Vector((w / 2, 0, 0)), q + Vector((w / 2, 0, 0)))
                    if prev is not None:
                        shade = (0.8 if s_ % 2 else 1.05) * (1.0 - 0.25 * t_)
                        if s_ < 4:
                            p.quad((prev[0], prev[1], cur[1], cur[0]), scale(col, shade), mat=LEAF)
                        else:
                            p.quad((prev[0], prev[1], q), scale(col, shade), mat=LEAF)
                    prev = cur
        p.skull(tie + Vector((-sign * 0.1, 0.34, -0.5)), size=0.42, yaw=0.3 * sign)
        p.skull(B(tx - sign * 0.5, tz - 0.5, gh(tx - sign * 0.5, tz - 0.5) + 0.02), size=0.4, yaw=-0.6 * sign)
        SOCKETS['tusks'].append([round(tx, 3), round(gy + h, 3), round(tz, 3)])
        collider_circle(f'tusk_{"we"[i]}', tx, tz, 0.55, gy + h)
    # the east ear, where it fell on the knoll: its ring's stones in a heap
    ex, ez = -7.6, -3.6
    for k in range(7):
        x, z = ex + rng.uniform(-1.5, 1.5), ez + rng.uniform(-1.3, 1.3)
        s = rng.uniform(0.7, 1.15)
        M = slope_matrix(x, z, yaw=rng.random() * TAU, lift=s * rng.uniform(0.0, 0.2))
        M = M @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.4, 0.4), 4, 'Y')
        with p.as_kind(K_PAVE):
            p.box((0, 0, 0), (s * 1.5, s * 0.95, s * 0.8), p.vary(COURT_PALE, 0.08), chip=0.22, bevel=0.06, M=M, taper=0.8)
    FOOTINGS.append(('fallen_ear', ex, ez, 0.6, 0.6, 0.0, gh(ex, ez) - 0.45))
    collider_circle('fallen_ear', ex, ez, 1.7, gh(ex, ez) + 0.9)
    # blocks of the breached back wall and the west cheek, lying in the shallows
    for (x0, z0, n) in ((9.8, 0.2, 4), (1.0, 18.4, 6), (10.6, 12.4, 4)):
        for k in range(n):
            x, z = x0 + rng.uniform(-1.6, 1.6), z0 + rng.uniform(-1.4, 1.4)
            s = rng.uniform(0.7, 1.25)
            M = slope_matrix(x, z, yaw=rng.random() * TAU, lift=s * rng.uniform(-0.1, 0.25))
            M = M @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.4, 0.4), 4, 'Y')
            with p.as_kind(K_PAVE):
                p.box((0, 0, 0), (s * 1.6, s * 0.9, s * 0.8), p.tone(x, z), chip=0.22, bevel=0.05, M=M, taper=0.85)
    return p


# ================================================================ the growth
def mound_y(x, z):
    k = math.hypot(x, z - HEAD_Z) / (head_radius(HEAD_TOP) - 0.5)
    return HEAD_TOP - 1.0 + 2.7 * max(0.0, 1 - k * k) ** 1.4 - 1.4 * k ** 3


def growth():
    p = P('Growth', seed=17)
    rng = p.rng

    def L(q):
        return LEAN @ Vector(q)

    def out_at(x):
        th = x / R_FACE
        return (math.sin(th), math.cos(th), 0)
    # the fig's crown: leaf masses on the limbs, a hanging fringe under each
    for (cx, cz, cy, cr) in CROWN:
        c = L(B(cx, cz, cy))
        p.blob(c, (cr * 2.0, cr * 2.0, cr * 1.75))
        for k in range(4):
            a = TAU * k / 4 + rng.uniform(-0.6, 0.6)
            d = cr * rng.uniform(0.6, 1.0)
            p.blob(c + Vector((math.cos(a) * d, math.sin(a) * d, rng.uniform(-0.6, 1.3))),
                   (cr * 1.25, cr * 1.25, cr * 1.05), sub=1)
        for k in range(6):
            a = TAU * k / 6 + rng.uniform(-0.3, 0.3)
            d = cr * rng.uniform(0.6, 1.0)
            top = c + Vector((math.cos(a) * d, math.sin(a) * d, -cr * 0.22))
            p.weed(top, rng.uniform(1.2, 2.8), (math.cos(a), math.sin(a), 0), width=1.7, strands=4, leaf=0.36, density=0.7)
    # lianas: from the crown down to the brows, the ears, the muzzle and the flanks
    ends = [(-5.6, 0.7, 13.5, False), (0.6, 1.3, 12.9, False), (6.2, 0.6, 15.4, False), (8.6, 0.6, 11.4, False),
            (-8.8, 0.6, 11.0, False), (12.6, 0.5, 10.2, False), (-13.0, 0.5, 9.6, False), (18.0, 0.5, 8.8, False),
            (-19.0, 0.5, 8.2, False), (2.8, -1.2, muzzle_top(2.8) + 0.1, True), (-2.4, -1.4, muzzle_top(2.4) + 0.1, True),
            (23.0, 0.5, 8.0, False)]
    for (x, s, y, on_muz) in ends:
        b = L(flat(x, s, y, muzzle=on_muz))
        (cx, cz, cy, cr) = min(CROWN, key=lambda c: (B(c[0], c[1], c[2]) - b).length)
        a = L(B(cx, cz, cy - cr * 0.35)) + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * cr * 0.5
        p.liana(a, b, sag=rng.uniform(0.2, 0.9), r=0.05, leaves=0.6)
    for k in range(18):
        (cx, cz, cy, cr) = CROWN[k % len(CROWN)]
        a = rng.random() * TAU
        d = cr * rng.uniform(0.2, 0.9)
        top = L(B(cx + math.cos(a) * d, cz + math.sin(a) * d, cy - cr * 0.3))
        p.kelp(top, rng.uniform(3.0, 8.0), (math.cos(a), -math.sin(a), 0), width=0.7, blades=3, blade=0.05)
    # hanging leaf curtains off the brows, the lip and the muzzle's brow
    ey = EYE['y']
    for sign in (1, -1):
        for (x, y, ln) in ((2.5, 0.75, 1.0), (4.8, 1.4, 1.5), (7.0, 1.8, 2.3), (8.2, 0.4, 2.2)):
            p.weed(L(flat(sign * x, 1.3, ey + y)), ln, out_at(sign * x), width=1.1, strands=4, leaf=0.26, density=0.9)
        for (x, y, ln) in ((4.6, 7.2, 1.6), (5.2, 6.0, 1.4)):
            p.weed(L(flat(sign * x, 0.15, y, muzzle=True)), ln, out_at(sign * x), width=0.9, strands=4, leaf=0.24,
                   density=0.9)
    # fern and moss lodged on the brows, the nose's bridge, the ears and the lids
    for sign in (1, -1):
        for (x, s, y) in ((2.2, 1.0, ey + 1.75), (4.4, 1.0, ey + 2.4), (6.3, 0.9, ey + 2.85), (4.9, 0.7, ey - 0.35),
                          (0.6, 0.6, 11.0)):
            v = L(flat(sign * x, s, y))
            if rng.random() < 0.6:
                p.fern(v, fronds=6, length=rng.uniform(0.7, 1.1), width=0.24)
            p.moss_mat(v, rng.uniform(0.4, 0.7), height=0.1)
    # the walls' broken tops: moss, fern, a trailing vine
    for (q, w) in TOPS:
        v = L(q)
        r = rng.random()
        if r < 0.32:
            p.moss_mat(v, min(0.6, w * 0.45), height=0.1)
        elif r < 0.46:
            p.fern(v, fronds=6, length=rng.uniform(0.6, 1.0), width=0.22)
        elif r < 0.56:
            p.weed(v + Vector((0, 0, 0.02)), rng.uniform(0.8, 2.4), (rng.uniform(-1, 1), rng.uniform(-1, 1), 0.01), width=0.7,
                   strands=3, leaf=0.24)
    # the crown's earth: fern and broadleaf round the fig's foot
    for k in range(26):
        a = rng.random() * TAU
        d = rng.uniform(1.8, 5.6)
        x, z = math.cos(a) * d, HEAD_Z + math.sin(a) * d
        v = L(B(x, z, mound_y(x, z) - 0.08))
        if rng.random() < 0.6:
            p.fern(v, fronds=8, length=rng.uniform(1.0, 1.8), width=0.34)
        else:
            p.broadleaf(v, leaves=5, length=rng.uniform(1.4, 2.2), width=0.52)
    # the muzzle's brow: fern, broadleaf and moss
    for (x, s) in ((-3.8, 1.2), (3.4, 0.8), (-2.2, 0.5), (4.3, 1.9), (-4.6, 2.0), (2.2, 0.5), (0.0, 0.7)):
        v = L(warp(Vector((x, -FACE_Z + s, muzzle_top(x) + 0.03))))
        (p.fern if rng.random() < 0.7 else p.broadleaf)(v, 6, rng.uniform(0.8, 1.3), 0.28)
        p.moss_mat(v + Vector((0.5, 0.2, 0.0)), 0.55, height=0.1)
    # the ground: fern and broadleaf beside the stair, against the head on the
    # knoll, round the tusks and the fire bowls; reed in the shallows
    spots = []
    for k in range(260):
        x, z = rng.uniform(-14.5, 14.5), rng.uniform(-12.0, 19.0)
        d = math.hypot(x, z - HEAD_Z)
        if d < R_FACE + 0.7:
            continue
        if d < R_FACE + 3.4 and abs(math.atan2(x, HEAD_Z - z)) < MUZ_HW / R_FACE + 0.06:
            continue
        if abs(x) < STAIR['hw_out'] + 0.5 and STAIR['z0'] - 0.5 < z < STAIR['z1']:
            continue
        if math.hypot(x - EXIT_DROP[0], z - EXIT_DROP[1]) < 1.6:
            continue
        near = min(abs(abs(x) - (STAIR['hw_out'] + 1.0)) if STAIR['z0'] < z < MUZ_S else 9, abs(d - (R_FACE + 1.3)),
                   min(math.hypot(x - bx, z - bz) for (bx, bz) in BRAZIERS + TUSKS))
        if near > 1.8 and rng.random() < 0.74:
            continue
        spots.append((x, z))
    for (x, z) in spots:
        y = gh(x, z)
        v = B(x, z, y)
        if y < WATER_Y + 0.12:
            p.reeds(B(x, z, max(y, WATER_Y - 0.5)), radius=0.5, stems=rng.randrange(6, 11), height=rng.uniform(1.5, 2.5),
                    heads=0.3, dry=0.1)
            continue
        r = rng.random()
        if r < 0.5:
            p.fern(v, fronds=rng.randrange(7, 10), length=rng.uniform(0.9, 1.7), width=0.34)
        elif r < 0.82:
            p.broadleaf(v, leaves=rng.randrange(5, 8), length=rng.uniform(1.0, 1.8), width=rng.uniform(0.3, 0.46))
        else:
            p.sedge(v, radius=0.3, blades=10, height=rng.uniform(0.6, 1.0), dry=0.05)
    # moss on the stair's blocks and between them
    z = STAIR['z0'] + 0.3
    while z < STAIR['z1'] - 0.4:
        for _ in range(2):
            x = rng.uniform(-2.3, 2.3)
            p.moss_mat(B(x, z, gh(x, z) + 0.16), rng.uniform(0.3, 0.6), height=0.07)
        z += 0.9
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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = rk.make_materials()
    pieces = {'main': [head(), muzzle(), teeth(), fig()], 'court': [court()]}
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
        if len(objs) > 1:
            objs = [join(objs, names[key])]
        ec.export_glb([root] + objs, os.path.join(raw, files[key]))
    SOCKETS['window'] = {'half': MOUTH['half'], 'spring': MOUTH['spring'], 'rise': MOUTH['rise'], 'z': WINDOW_Z,
                         'water': round(WATER_Y + 0.22, 3), 'kerb': round(gh(0, WINDOW_Z - 0.3) + 0.2, 3),
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
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'wildheart_basin_entrance_v2.blend'))
    if RENDERS != 'none':
        wildheart_renders.run(OUT, GR, SURR, COLLIDERS, RENDERS, TAG)


if __name__ == '__main__':
    main()
