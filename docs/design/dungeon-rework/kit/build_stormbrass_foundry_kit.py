"""The Stormbrass Foundry kit: every crafted piece of the storm-lit foundry shelf.

Run (background, one scene):
  blender -b --factory-startup --python build_stormbrass_foundry_kit.py -- \
      [--preview out.png] [--closeups DIR] [--pieces A,B] [--save out.blend]

Writes stormbrass_foundry_kit_components.glb next to this file (a full build
only; `--pieces` builds a subset for review renders and writes nothing).

The binding piece contract is CONTRATO.md beside this file: names, origins,
sizes and footprints. Game yards, +Z up, front -Y (the game's +Z after the glTF
export), origin at the base centre where the runtime stands it unless the
contract says otherwise. Edge pieces run along X with their OUTER (drop) side
toward -Y.

Four materials: KitMetal (brass, copper, verdigris, blackened iron, bare steel:
the vertex colour carries which metal and all of its weathering), KitPaint
(painted steel, hazard stripes, stone, brick, timber, rubber, canvas, ceramic,
paper), KitGlow (unlit: molten brass, forge mouths, lamp bulbs, small dim storm
coils) and KitGlass (translucent cells, lamp globes, gauge faces, cab windows).

Weathering is per vertex and per face KIND (FPiece.finish): brass polishes on
convex edges and blooms verdigris in its cavities and on upward faces, copper
runs green streaks, blackened iron takes rust runs and soot, paint chips to
bare steel on its edges, stone and brick take grime and soot; a baked ambient
occlusion term (rays against the piece itself and its floor) grounds every
contact; heat points tint nearby steel blued-straw and blacken paint.
Deterministic: every noise is seeded, nothing reads the clock.
"""
import math
import os
import sys
from contextlib import contextmanager

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hckit  # noqa: E402,F401
from hckit import Piece, _fbm  # noqa: E402

TAU = math.tau
PI = math.pi

# ---- material slots (exactly four) ------------------------------------------------
METAL, PAINT, GLOW, GLASS = 0, 1, 2, 3
MATERIAL_NAMES = ('KitMetal', 'KitPaint', 'KitGlow', 'KitGlass')

# ---- weathering kinds ---------------------------------------------------------------
AUTO, K_BRASS, K_COPPER, K_VERD, K_IRON, K_STEEL, K_PAINT, K_STONE, K_SOFT, K_PLAIN = range(10)

# ---- palette (sRGB, the contract's) ---------------------------------------------
BRASS = (0.82, 0.60, 0.26)
BRASS_DARK = (0.66, 0.47, 0.20)
POLISH = (0.92, 0.78, 0.45)
COPPER = (0.72, 0.42, 0.28)
VERDIGRIS = (0.35, 0.62, 0.52)
VERD_DARK = (0.22, 0.42, 0.36)
IRON = (0.33, 0.345, 0.385)
SOOT_IRON = (0.22, 0.22, 0.245)
STEEL = (0.45, 0.47, 0.50)
STEEL_DARK = (0.39, 0.40, 0.43)
SLATE = (0.27, 0.31, 0.36)
OXBLOOD = (0.42, 0.15, 0.11)
HAZARD = (0.86, 0.68, 0.12)
HAZARD_BLACK = (0.06, 0.06, 0.06)
ENAMEL = (0.85, 0.87, 0.86)
CERAMIC = (0.82, 0.80, 0.72)
TIMBER = (0.46, 0.34, 0.22)
TIMBER_DARK = (0.37, 0.27, 0.18)
STONE = (0.36, 0.37, 0.40)
STONE_LIGHT = (0.46, 0.46, 0.47)
BRICK = (0.45, 0.24, 0.17)
CANVAS = (0.55, 0.49, 0.36)
BLUEPRINT = (0.17, 0.33, 0.58)
PALE_LINE = (0.75, 0.85, 0.95)
RUBBER = (0.09, 0.09, 0.09)
SOOT = (0.07, 0.065, 0.06)
DARK = (0.04, 0.04, 0.045)
RUST = (0.36, 0.19, 0.11)
SLAG = (0.2, 0.16, 0.14)
ORE = (0.3, 0.27, 0.25)
# Light (glow slot: the runtime reads the vertex colour as the light colour).
MOLTEN = (1.0, 0.478, 0.122)       # #FF7A1F
MOLTEN_HOT = (1.0, 0.70, 0.28)     # #FFB347
EMBER = (0.75, 0.28, 0.07)
BULB = (1.0, 0.85, 0.63)           # #FFD9A0
WINDOW = (0.95, 0.66, 0.36)
STORM = (0.45, 0.68, 0.92)         # the cap: never brighter
STORM_DIM = (0.30, 0.46, 0.64)
# Glass tints.
GLASS_C = (0.62, 0.74, 0.78)
GLASS_WARM = (0.95, 0.84, 0.6)
GLASS_STORM = (0.55, 0.72, 0.86)

STEEL_BARE = (0.44, 0.45, 0.47)
BOILER_COPPER = (0.62, 0.37, 0.24)
RUST_DEEP = (0.28, 0.14, 0.08)
HEAT_STRAW = (0.66, 0.52, 0.28)
HEAT_BLUE = (0.2, 0.22, 0.42)
STREAK_PALE = (0.56, 0.74, 0.66)


def T(x, y=None, z=None):
    if y is None:
        return Matrix.Translation(Vector(x))
    return Matrix.Translation(Vector((x, y, z)))


def R(axis, ang):
    return Matrix.Rotation(ang, 4, axis)


def S(x, y, z):
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = x, y, z
    return m


def basis(d, up=None, roll=0.0):
    """A frame whose local Z runs along d and local Y toward `up` (default +Z;
    a vertical d takes the front, -Y, as its up)."""
    z = Vector(d).normalized()
    u = Vector(up).normalized() if up is not None else Vector((0, 0, 1))
    if abs(u.dot(z)) > 0.98:
        u = Vector((0, -1, 0)) if abs(z.y) < 0.98 else Vector((0, 0, 1))
    x = u.cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    if roll:
        m = m @ R('Z', roll)
    return m


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def fillet(pts, rad, steps=4):
    """A polyline with its corners rounded (quadratic arcs), for pipes and rails."""
    pts = [Vector(q) for q in pts]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        la, lc = (a - b).length, (c - b).length
        rr = min(rad, la * 0.49, lc * 0.49)
        p0 = b + (a - b).normalized() * rr
        p2 = b + (c - b).normalized() * rr
        for k in range(steps + 1):
            t = k / steps
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t ** 2 * p2)
    out.append(pts[-1])
    return out


def catenary(a, b, sag, n=8):
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / n) - Vector((0, 0, sag * 4 * (i / n) * (1 - i / n))) for i in range(n + 1)]


def classify(color, mat):
    if mat in (GLOW, GLASS):
        return K_PLAIN
    r, g, b = color[:3]
    mx, mn = max(r, g, b), min(r, g, b)
    if mat == METAL:
        if g > r * 1.02 and g >= b:
            return K_VERD
        if mx - mn < 0.1:
            return K_IRON if mx < 0.42 else K_STEEL
        if r > 0.45 and g / max(r, 1e-3) > 0.68:
            return K_BRASS
        return K_COPPER
    return K_PAINT


# ================================================================== the piece
class FPiece(Piece):
    """hckit's Piece with a transform stack, the machinery primitives, a face
    KIND per face (auto from the colour, or forced with as_kind), and the
    metal weathering plus a baked occlusion term in finish()."""

    def __init__(self, name, seed=0, weather=1.0, verd=0.5, rust=0.5, ao=1.0, ao_dist=1.0,
                 ground=0.0, grime=0.0):
        super().__init__(name, seed=seed, weather=weather, lichen=0.0)
        self.kl = self.bm.faces.layers.int.new('kind')
        self.cur = AUTO
        self.xf = Matrix.Identity(4)
        self.verd = verd
        self.rust = rust
        self.ao = ao
        self.ao_dist = ao_dist
        self.ground = ground      # a floor plane for occlusion (None: hangs free)
        self.grime = grime        # grime gathers up from this height (None: none)
        self.heat = []            # (point, radius): blued-straw steel, blackened paint
        self.soot = []            # (point, radius): soot darkening

    # ------------------------------------------------------------ painting
    def _paint(self, faces, color, mat):
        k = self.cur if self.cur != AUTO else classify(color, mat)
        for face in faces:
            face.material_index = mat
            face[self.kl] = k
            for loop in face.loops:
                loop[self.col] = (*color[:3], 1.0)

    @contextmanager
    def as_kind(self, k):
        prev = self.cur
        self.cur = k
        try:
            yield
        finally:
            self.cur = prev

    @contextmanager
    def at(self, m):
        prev = self.xf
        self.xf = prev @ m
        try:
            yield
        finally:
            self.xf = prev

    def vary(self, color, amount=0.06):
        k = 1 + (self.rng.random() - 0.5) * 2 * amount
        return tuple(max(0.0, min(1.0, c * k)) for c in color[:3])

    # ---------------------------------------------------------- primitives
    def grid(self, rings, color, mat=METAL, smooth=True, cap0=True, cap1=True, closed=False):
        """Quads between rings of local points (each ring closed round), caps at the ends."""
        xf = self.xf
        vs = [[self.bm.verts.new(xf @ Vector(c)) for c in ring] for ring in rings]
        n = len(vs[0])
        faces = []
        pairs = list(zip(vs, vs[1:]))
        if closed:
            pairs.append((vs[-1], vs[0]))
        for a, b in pairs:
            for i in range(n):
                j = (i + 1) % n
                f = self.bm.faces.new((a[i], a[j], b[j], b[i]))
                f.smooth = smooth
                faces.append(f)
        if not closed:
            if cap0:
                faces.append(self.bm.faces.new(list(reversed(vs[0]))))
            if cap1:
                faces.append(self.bm.faces.new(vs[-1]))
        self._paint(faces, color, mat)
        return faces

    def box(self, center, size, color, mat=METAL, bevel=0.0, rot=None, taper=1.0, taper_y=None, shear=None):
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        ty = taper if taper_y is None else taper_y
        m = self.xf @ Matrix.Translation(Vector(center))
        if rot is not None:
            m = m @ (rot if isinstance(rot, Matrix) else Euler(rot).to_matrix().to_4x4())
        vs = []
        for (sx, sy, sz) in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                             (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
            kx = taper if sz > 0 else 1.0
            ky = ty if sz > 0 else 1.0
            co = Vector((sx * hx * kx, sy * hy * ky, sz * hz))
            if shear and sz > 0:
                co.x += shear[0]
                co.y += shear[1]
            vs.append(self.bm.verts.new(m @ co))
        idx = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
        faces = [self.bm.faces.new([vs[i] for i in q]) for q in idx]
        self._paint(faces, color, mat)
        if bevel > 0:
            edges = list({e for f in faces for e in f.edges})
            out = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect='EDGES',
                                  clamp_overlap=True)
            self._paint(out['faces'], color, mat)
        return faces

    def bx(self, lo, hi, color, **kw):
        c = [(lo[i] + hi[i]) / 2 for i in range(3)]
        s = [abs(hi[i] - lo[i]) for i in range(3)]
        return self.box(c, s, color, **kw)

    def turned(self, a, axis, profile, color, sides=12, mat=METAL, smooth=True, cap0=True, cap1=True,
               phase=0.0, squash=1.0, up=None):
        """A turned solid: (radius, t) rings along `axis` from `a`."""
        m = Matrix.Translation(Vector(a)) @ basis(axis, up)
        rings = []
        for (r, t) in profile:
            r = max(r, 1e-4)
            rings.append([m @ Vector((math.cos(phase + TAU * i / sides) * r,
                                      math.sin(phase + TAU * i / sides) * r * squash, t))
                          for i in range(sides)])
        return self.grid(rings, color, mat, smooth, cap0, cap1)

    def cyl(self, a, b, r, color, sides=10, mat=METAL, smooth=True, r1=None, cap0=True, cap1=True,
            phase=0.0):
        a, b = Vector(a), Vector(b)
        d = b - a
        return self.turned(a, d, [(r, 0.0), (r if r1 is None else r1, d.length)], color, sides=sides,
                           mat=mat, smooth=smooth, cap0=cap0, cap1=cap1, phase=phase)

    def tube(self, pts, r, color, sides=8, mat=METAL, smooth=True, cap=True, r1=None, squash=1.0):
        """A swept tube along a path with rotation-minimising frames (no twist)."""
        pts = [Vector(q) for q in pts]
        n = len(pts)
        tans = []
        for i in range(n):
            d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
            tans.append(d.normalized() if d.length > 1e-9 else Vector((0, 0, 1)))
        u = tans[0].cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = tans[0].cross(Vector((1, 0, 0)))
        u.normalize()
        rings = []
        for i, (p, t) in enumerate(zip(pts, tans)):
            if i > 0:
                u2 = u - t * u.dot(t)
                if u2.length > 1e-6:
                    u = u2.normalized()
            v = t.cross(u)
            rr = r if r1 is None else r + (r1 - r) * i / max(1, n - 1)
            rings.append([p + (u * math.cos(TAU * k / sides) + v * math.sin(TAU * k / sides) * squash) * rr
                          for k in range(sides)])
        return self.grid(rings, color, mat, smooth, cap, cap)

    def torus(self, c, axis, R_, r, color, seg=16, sides=6, mat=METAL, smooth=True, arc=None, squash=1.0,
              stretch=1.0, up=None, phase=0.0):
        m = Matrix.Translation(Vector(c)) @ basis(axis, up)
        full = arc is None
        count = seg if full else seg + 1
        rings = []
        for i in range(count):
            a = phase + (TAU if full else arc) * i / seg
            ca, sa = math.cos(a), math.sin(a)
            centre = Vector((ca * R_, sa * R_ * stretch, 0))
            radial = Vector((ca, sa, 0))
            rings.append([m @ (centre + radial * math.cos(TAU * k / sides) * r
                               + Vector((0, 0, 1)) * math.sin(TAU * k / sides) * r * squash)
                          for k in range(sides)])
        return self.grid(rings, color, mat, smooth, cap0=not full, cap1=not full, closed=full)

    def sphere(self, c, r, color, mat=METAL, rings=6, sides=10, squash=1.0, smooth=True):
        prof = []
        for i in range(rings + 1):
            a = -PI / 2 + PI * i / rings
            prof.append((max(1e-3, math.cos(a) * r), (math.sin(a) + 1) * r * squash))
        return self.turned(Vector(c) - Vector((0, 0, r * squash)), (0, 0, 1), prof, color, sides=sides, mat=mat,
                           smooth=smooth)

    def quad_prism(self, corners, n, thick, color, mat=PAINT, sides=True):
        """Extrude a convex polygon (local 3D corners) along n (sides=False: a
        two-faced decal slab, four triangles for a quad)."""
        xf = self.xf
        n = Vector(n)
        a = [self.bm.verts.new(xf @ Vector(c)) for c in corners]
        b = [self.bm.verts.new(xf @ (Vector(c) + n * thick)) for c in corners]
        faces = [self.bm.faces.new(list(reversed(a))), self.bm.faces.new(b)]
        k = len(corners)
        if sides:
            for i in range(k):
                j = (i + 1) % k
                faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        self._paint(faces, color, mat)
        return faces

    def arc_block(self, c, axis, r_in, r_out, half_w, a0, a1, color, seg=8, mat=METAL, up=None, smooth=False,
                  r_out1=None):
        """A partial annulus (rectangular section) about `axis`: arches, counterweights,
        rims, hoods. Angles in the axis frame's XY plane."""
        m = Matrix.Translation(Vector(c)) @ basis(axis, up)
        rings = []
        for i in range(seg + 1):
            t = i / seg
            a = a0 + (a1 - a0) * t
            ro = r_out if r_out1 is None else r_out + (r_out1 - r_out) * t
            ca, sa = math.cos(a), math.sin(a)
            rings.append([m @ Vector((ca * rr, sa * rr, zz)) for (rr, zz) in
                          ((r_in, -half_w), (ro, -half_w), (ro, half_w), (r_in, half_w))])
        return self.grid(rings, color, mat, smooth=smooth)

    def annulus(self, c, axis, r_in, r_out, half_w, color, sides=24, mat=METAL, chamfer=0.02, up=None):
        """A full ring of rectangular section: smooth round faces, flat sides."""
        d = Vector(axis).normalized()
        a = Vector(c) - d * half_w
        w = half_w * 2
        ch = min(chamfer, w * 0.25, (r_out - r_in) * 0.25)
        f = []
        f += self.turned(a, d, [(r_out - ch, 0), (r_out, ch), (r_out, w - ch), (r_out - ch, w)], color, sides=sides,
                         mat=mat, cap0=False, cap1=False, up=up)
        f += self.turned(a, d, [(r_in + ch, w), (r_in, w - ch), (r_in, ch), (r_in + ch, 0)], color, sides=sides,
                         mat=mat, cap0=False, cap1=False, up=up)
        m = Matrix.Translation(a) @ basis(d, up)
        for (z, r0, r1) in ((0.0, r_out - ch, r_in + ch), (w, r_in + ch, r_out - ch)):
            rings = [[m @ Vector((math.cos(TAU * i / sides) * rr, math.sin(TAU * i / sides) * rr, z))
                      for i in range(sides)] for rr in (r0, r1)]
            f += self.grid(rings, color, mat, smooth=False, cap0=False, cap1=False)
        return f

    def rockish(self, c, size, color, jitter=0.2, subdivisions=1, mat=PAINT, flat_bottom=False):
        made = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=0.5)
        m = self.xf @ Matrix.Translation(Vector(c))
        for v in made['verts']:
            k = 1 + (self.rng.random() - 0.5) * 2 * jitter
            co = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2] * k))
            if flat_bottom and co.z < 0:
                co.z *= 0.25
            v.co = m @ co
        faces = list({f for v in made['verts'] for f in v.link_faces})
        self._paint(faces, color, mat)
        return faces

    # ---------------------------------------------------------- fixings
    def rivet(self, pos, n, r=0.05, color=None, sides=4):
        m = self.xf @ Matrix.Translation(Vector(pos)) @ basis(n)
        ph = PI / sides
        base = [self.bm.verts.new(m @ Vector((math.cos(ph + TAU * i / sides) * r, math.sin(ph + TAU * i / sides) * r,
                                              -0.012))) for i in range(sides)]
        mid = [self.bm.verts.new(m @ Vector((math.cos(ph + TAU * i / sides) * r * 0.78,
                                             math.sin(ph + TAU * i / sides) * r * 0.78, r * 0.42)))
               for i in range(sides)]
        apex = self.bm.verts.new(m @ Vector((0, 0, r * 0.66)))
        faces = []
        for i in range(sides):
            j = (i + 1) % sides
            faces.append(self.bm.faces.new((base[i], base[j], mid[j], mid[i])))
            faces.append(self.bm.faces.new((mid[i], mid[j], apex)))
        for f in faces:
            f.smooth = True
        self._paint(faces, color or self.rivet_color, METAL)
        return faces

    rivet_color = BRASS

    def rivets(self, a, b, n, spacing=0.32, r=0.05, color=None, ends=True):
        a, b = Vector(a), Vector(b)
        count = max(2, int(round((b - a).length / spacing)) + 1)
        for i in range(count):
            t = i / (count - 1)
            if not ends and (i == 0 or i == count - 1):
                continue
            self.rivet(a.lerp(b, t), n, r, color)

    def rivet_ring(self, c, axis, R_, count, r=0.05, color=None, phase=0.0, up=None):
        m = basis(axis, up)
        c = Vector(c)
        for i in range(count):
            a = phase + TAU * i / count
            d = (m @ Vector((math.cos(a), math.sin(a), 0, 0))).to_3d()
            self.rivet(c + d * R_, d, r, color)

    def bolt(self, pos, axis, r=0.045, length=0.06, color=STEEL):
        a = Vector(pos)
        d = Vector(axis).normalized()
        return self.cyl(a, a + d * length, r, color, sides=6, smooth=False, cap0=False)

    def flange(self, c, axis, r_out, thick, color=BRASS, bolts=8, bolt_color=STEEL, sides=16, both=True):
        d = Vector(axis).normalized()
        c = Vector(c)
        a = c - d * (thick / 2)
        self.turned(a, d, [(r_out * 0.96, 0), (r_out, 0.018), (r_out, thick - 0.018), (r_out * 0.96, thick)], color,
                    sides=sides)
        m = basis(d)
        rb = r_out * 0.8
        br = max(0.03, r_out * 0.085)
        for i in range(bolts):
            ang = TAU * (i + 0.5) / bolts
            off = (m @ Vector((math.cos(ang) * rb, math.sin(ang) * rb, 0, 0))).to_3d()
            if both:
                self.cyl(c + off - d * (thick / 2 + br * 0.9), c + off + d * (thick / 2 + br * 0.9), br, bolt_color,
                         sides=6, smooth=False)
            else:
                self.cyl(c + off + d * (thick / 2 - 0.01), c + off + d * (thick / 2 + br * 0.9), br, bolt_color,
                         sides=6, smooth=False, cap0=False)

    def band(self, c, axis, r, width, color=BRASS, rivets=0, rivet_r=0.045, sides=16, lip=0.04):
        d = Vector(axis).normalized()
        a = Vector(c) - d * (width / 2)
        self.turned(a, d, [(r, 0), (r + lip, 0.02), (r + lip, width - 0.02), (r, width)], color, sides=sides)
        if rivets:
            self.rivet_ring(c, d, r + lip, rivets, rivet_r, color)

    def handwheel(self, c, axis, R_, color=IRON, rim=OXBLOOD, spokes=4, rim_mat=PAINT):
        d = Vector(axis).normalized()
        c = Vector(c)
        self.torus(c, d, R_, max(0.025, R_ * 0.085), rim, seg=14, sides=5, mat=rim_mat)
        m = basis(d)
        for i in range(spokes):
            ang = TAU * i / spokes + PI / 4
            off = (m @ Vector((math.cos(ang), math.sin(ang), 0, 0))).to_3d()
            self.cyl(c, c + off * R_ * 0.95, max(0.018, R_ * 0.05), color, sides=5)
        self.cyl(c - d * R_ * 0.12, c + d * R_ * 0.16, R_ * 0.16, color, sides=8)
        self.cyl(c + d * R_ * 0.16, c + d * R_ * 0.24, R_ * 0.09, STEEL, sides=6, smooth=False)

    def gauge(self, c, n, r, bezel=BRASS, needle_ang=0.6):
        n = Vector(n).normalized()
        c = Vector(c)
        self.turned(c - n * 0.07, n, [(r * 0.7, 0), (r * 1.12, 0.03), (r * 1.15, 0.07), (r * 1.08, 0.1),
                                      (r * 0.92, 0.1)], bezel, sides=12, cap1=False)
        self.cyl(c + n * 0.06, c + n * 0.075, r * 0.93, ENAMEL, sides=12, mat=PAINT, smooth=False)
        m = basis(n)
        nd = (m @ Vector((math.cos(needle_ang), math.sin(needle_ang), 0, 0))).to_3d()
        tip = c + n * 0.082 + nd * r * 0.75
        base = c + n * 0.082
        side = n.cross(nd).normalized() * r * 0.06
        self.quad_prism([base - side, base + side, tip], n, 0.008, HAZARD_BLACK, mat=PAINT)
        # Red-line arc: a small oxblood tick.
        rl = (m @ Vector((math.cos(-0.7), math.sin(-0.7), 0, 0))).to_3d()
        self.quad_prism([c + n * 0.08 + rl * r * 0.62 - side, c + n * 0.08 + rl * r * 0.62 + side,
                         c + n * 0.08 + rl * r * 0.88 + side, c + n * 0.08 + rl * r * 0.88 - side], n, 0.006, OXBLOOD)
        self.cyl(c + n * 0.09, c + n * 0.1, r * 0.93, GLASS_C, sides=12, mat=GLASS, smooth=False, cap0=False)

    def porthole(self, c, n, r, inner=STORM_DIM, inner_mat=GLOW, bezel=BRASS, bolts=8):
        n = Vector(n).normalized()
        c = Vector(c)
        self.turned(c - n * 0.05, n, [(r * 1.0, 0), (r * 1.32, 0.02), (r * 1.34, 0.09), (r * 1.15, 0.13),
                                      (r * 0.95, 0.12), (r * 0.92, 0.02)], bezel, sides=14, cap0=False, cap1=False)
        self.cyl(c - n * 0.04, c - n * 0.03, r * 0.96, inner, sides=14, mat=inner_mat, smooth=False, cap0=False)
        self.cyl(c + n * 0.03, c + n * 0.04, r * 0.96, GLASS_C, sides=14, mat=GLASS, smooth=False, cap0=False)
        m = basis(n)
        for i in range(bolts):
            ang = TAU * (i + 0.5) / bolts
            off = (m @ Vector((math.cos(ang), math.sin(ang), 0, 0))).to_3d()
            self.rivet(c + n * 0.08 + off * r * 1.18, n, r * 0.09, STEEL)

    def stripes(self, origin, u, v, n, length, width, thick=0.012, pitch=None, slant=0.8, mat=PAINT,
                colors=(HAZARD, HAZARD_BLACK)):
        """A hazard chevron band: alternating slanted stripes along u (length),
        across v (width), standing off the surface along n by `thick`."""
        o, u, v, n = Vector(origin), Vector(u).normalized(), Vector(v).normalized(), Vector(n).normalized()
        pitch = pitch or width * 0.9
        sh = slant * width
        k = 0
        x = -sh
        while x < length:
            x0, x1 = x, x + pitch
            c0 = [max(0.0, min(length, x0)), max(0.0, min(length, x1)),
                  max(0.0, min(length, x1 + sh)), max(0.0, min(length, x0 + sh))]
            if c0[1] - c0[0] > 1e-3 or c0[2] - c0[3] > 1e-3:
                pts = [o + u * c0[0], o + u * c0[1], o + u * c0[2] + v * width, o + u * c0[3] + v * width]
                self.quad_prism(pts, n, thick, self.vary(colors[k % 2], 0.04), mat=mat, sides=False)
            x += pitch
            k += 1

    def lbeam(self, a, b, w, t, color, up=None, roll=0.0, bevel=0.0):
        """An L-section (angle iron) from a to b; its heel on the axis."""
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        with self.at(Matrix.Translation(a) @ basis(b - a, up, roll)):
            self.box((w / 2, t / 2, L / 2), (w, t, L), color, bevel=bevel)
            self.box((t / 2, w / 2 + t / 2, L / 2), (t, w - t, L), color, bevel=bevel)

    def ibeam(self, a, b, h, w, t, color, up=None, roll=0.0, bevel=0.0, web=None):
        """An I-section from a to b, its local up (web) toward `up`."""
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        with self.at(Matrix.Translation(a) @ basis(b - a, up, roll)):
            self.box((0, h / 2 - t / 2, L / 2), (w, t, L), color, bevel=bevel)
            self.box((0, -h / 2 + t / 2, L / 2), (w, t, L), color, bevel=bevel)
            self.box((0, 0, L / 2), (web or t * 0.8, h - 2 * t, L), color)

    def flat(self, a, b, w, t, color, up=None, roll=0.0, bevel=0.0, mat=METAL):
        """A flat bar or plank from a to b: w across, t thick (along up)."""
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        with self.at(Matrix.Translation(a) @ basis(b - a, up, roll)):
            return self.box((0, 0, L / 2), (w, t, L), color, bevel=bevel, mat=mat)

    def link(self, c, t, side, L, w, r, color):
        """One chain link: a stadium ring in the plane of t and side."""
        t = Vector(t).normalized()
        nrm = Vector(side).cross(t).normalized()
        stretch = max(1.0, (L - r) / max(1e-3, (w - r)))
        self.torus(c, nrm, (w - r) / 2 + r * 0.5, r, color, seg=6, sides=3, stretch=stretch, up=t, smooth=True)

    def chain(self, pts, link=0.24, w=0.15, r=0.035, color=IRON):
        pts = [Vector(q) for q in pts]
        seglen = [(b - a).length for a, b in zip(pts, pts[1:])]
        total = sum(seglen)
        step = link * 0.72
        s = step * 0.5
        k = 0
        while s < total:
            acc = 0.0
            for i, Ls in enumerate(seglen):
                if acc + Ls >= s:
                    t = (s - acc) / max(1e-6, Ls)
                    pos = pts[i].lerp(pts[i + 1], t)
                    tan = (pts[i + 1] - pts[i]).normalized()
                    break
                acc += Ls
            side = tan.cross(Vector((0, 0, 1)))
            if side.length < 1e-3:
                side = tan.cross(Vector((1, 0, 0)))
            side.normalize()
            if k % 2:
                side = tan.cross(side).normalized()
            self.link(pos, tan, side, link, w, r, self.vary(color, 0.05))
            s += step
            k += 1

    def pillow(self, c, size, color, yaw=0.0, roll=0.0, mat=PAINT):
        """A sandbag or sack: a soft loft along local X with tied, pinched ends."""
        sx, sy, sz = size
        secs = ((-0.5, 0.25, 0.3), (-0.44, 0.7, 0.72), (-0.25, 0.97, 0.98), (0.25, 1.0, 1.0),
                (0.44, 0.72, 0.7), (0.5, 0.25, 0.28))
        rings = []
        for (x, ky, kz) in secs:
            ring = []
            for i in range(6):
                a = TAU * i / 6 + PI / 6
                ca, sa = math.cos(a), math.sin(a)
                yy = math.copysign(abs(ca) ** 0.7, ca) * sy / 2 * ky
                zz = math.copysign(abs(sa) ** 0.7, sa) * sz / 2 * kz
                if zz < 0:
                    zz *= 0.85
                ring.append(Vector((x * sx, yy, zz)))
            rings.append(ring)
        m = Matrix.Translation(Vector(c)) @ R('Z', yaw) @ R('X', roll)
        rings = [[m @ q for q in ring] for ring in rings]
        with self.as_kind(K_SOFT):
            return self.grid(rings, color, mat, smooth=True)

    def plate(self, c, n, w, h, t, color, mat=METAL, rivet_color=None, spacing=0.34, inset=0.09, rr=0.045,
              bevel=0.02, up=None, rivet_sides=(1, 1, 1, 1)):
        """A riveted plate: local x across (w), local y up (h), its face toward n."""
        n = Vector(n).normalized()
        m = Matrix.Translation(Vector(c)) @ basis(n, up)
        with self.at(m):
            self.box((0, 0, 0), (w, h, t), color, mat=mat, bevel=bevel)
            hw, hh = w / 2 - inset, h / 2 - inset
            z = t / 2
            rc = rivet_color or (BRASS if mat == PAINT else self.rivet_color)
            nz = Vector((0, 0, 1))
            if rivet_sides[0]:
                self.rivets((-hw, hh, z), (hw, hh, z), nz, spacing, rr, rc)
            if rivet_sides[1]:
                self.rivets((-hw, -hh, z), (hw, -hh, z), nz, spacing, rr, rc)
            if rivet_sides[2] and hh > spacing * 0.6:
                self.rivets((-hw, -hh, z), (-hw, hh, z), nz, spacing, rr, rc, ends=False)
            if rivet_sides[3] and hh > spacing * 0.6:
                self.rivets((hw, -hh, z), (hw, hh, z), nz, spacing, rr, rc, ends=False)

    def grille(self, c, n, w, h, bars, color=IRON, back=SOOT, depth=0.08, up=None, horizontal=False):
        n = Vector(n).normalized()
        with self.at(Matrix.Translation(Vector(c)) @ basis(n, up)):
            fw = min(0.07, w * 0.1)
            with self.as_kind(K_PLAIN):
                self.box((0, 0, -depth), (w, h, 0.02), back, mat=PAINT)
            self.box((0, h / 2 - fw / 2, 0), (w, fw, depth * 1.2), color, bevel=0.01)
            self.box((0, -h / 2 + fw / 2, 0), (w, fw, depth * 1.2), color, bevel=0.01)
            self.box((w / 2 - fw / 2, 0, 0), (fw, h - 2 * fw, depth * 1.2), color, bevel=0.01)
            self.box((-w / 2 + fw / 2, 0, 0), (fw, h - 2 * fw, depth * 1.2), color, bevel=0.01)
            for i in range(bars):
                t = (i + 1) / (bars + 1)
                if horizontal:
                    self.box((0, -h / 2 + h * t, -depth * 0.3), (w - fw, fw * 0.55, depth * 0.6), color)
                else:
                    self.box((-w / 2 + w * t, 0, -depth * 0.3), (fw * 0.55, h - fw, depth * 0.6), color)

    def cage_lamp(self, c, r=0.22, h=0.55, cage=BRASS, hood=True, bulb=BULB):
        """A caged work lamp, its bulb centred at c; the hood tops out at c.z + h/2 + 0.21."""
        c = Vector(c)
        z0 = c.z - h * 0.5
        x, y = c.x, c.y
        self.turned((x, y, z0 - 0.06), (0, 0, 1), [(r * 0.5, 0), (r * 0.82, 0.03), (r * 0.82, 0.08), (r * 0.5, 0.1)],
                    cage, sides=10)
        self.turned((x, y, z0), (0, 0, 1), [(r * 0.45, 0), (r * 0.9, h * 0.25), (r, h * 0.5), (r * 0.9, h * 0.78),
                                            (r * 0.5, h)], GLASS_WARM, sides=10, mat=GLASS)
        self.sphere((x, y, c.z), r * 0.42, bulb, mat=GLOW, rings=4, sides=8)
        for k in range(6):
            a = TAU * k / 6
            pts = [(x + math.cos(a) * rr * 1.12, y + math.sin(a) * rr * 1.12, z0 + zz)
                   for (rr, zz) in ((r * 0.5, 0.0), (r * 0.95, h * 0.25), (r * 1.05, h * 0.5), (r * 0.95, h * 0.78),
                                    (r * 0.55, h))]
            self.tube(pts, 0.016, cage, sides=4)
        self.torus((x, y, z0 + h * 0.5), (0, 0, 1), r * 1.14, 0.02, cage, seg=12, sides=4)
        self.turned((x, y, z0 + h - 0.03), (0, 0, 1), [(r * 0.62, 0), (r * 0.64, 0.05), (r * 0.35, 0.09)],
                    cage, sides=10)
        if hood:
            self.turned((x, y, z0 + h + 0.02), (0, 0, 1), [(r * 2.05, -0.03), (r * 2.0, 0.0), (r * 0.45, 0.17),
                                                           (r * 0.3, 0.19)], IRON, sides=12, cap0=False)
            self.turned((x, y, z0 + h + 0.0), (0, 0, 1), [(r * 1.97, -0.005), (r * 0.45, 0.15)], ENAMEL, sides=12,
                        mat=PAINT, cap1=False, cap0=False)

    # ------------------------------------------------------------- finish
    def finish(self, materials, parent):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        bm.verts.index_update()
        nv = len(bm.verts)
        conv = [0.0] * nv
        for v in bm.verts:
            if not v.link_edges:
                continue
            mean = Vector()
            length = 0.0
            for e in v.link_edges:
                mean += e.other_vert(v).co
                length += e.calc_length()
            n = len(v.link_edges)
            mean /= n
            length = max(1e-3, length / n)
            conv[v.index] = max(-1.0, min(1.0, (v.co - mean).dot(v.normal) / length * 1.6))
        occ = self._occlusion()
        for face in bm.faces:
            mat = face.material_index
            kind = face[self.kl]
            if mat in (GLOW, GLASS) or kind == K_PLAIN:
                for loop in face.loops:
                    r, g, b, _ = loop[self.col]
                    if mat == PAINT or mat == METAL:
                        k = occ[loop.vert.index]
                        r, g, b = r * k, g * k, b * k
                    loop[self.col] = (min(1.0, r), min(1.0, g), min(1.0, b), 1.0)
                continue
            fn = face.normal
            for loop in face.loops:
                v = loop.vert
                rgb = self._weather(kind, loop[self.col][:3], v.co, v.normal if face.smooth else fn,
                                    conv[v.index], occ[v.index])
                loop[self.col] = (*[min(1.0, max(0.0, c)) for c in rgb], 1.0)
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        for mat in materials:
            mesh.materials.append(mat)
        mesh.color_attributes.active_color = mesh.color_attributes[0]
        mesh.color_attributes.render_color_index = 0
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        return obj

    def _occlusion(self):
        """Per-vertex ambient occlusion: seven rays over the normal's hemisphere
        against the piece itself and (when it stands) its floor plane."""
        bm = self.bm
        occ = [1.0] * len(bm.verts)
        if self.ao <= 0 or not bm.verts:
            return occ
        tree = BVHTree.FromBMesh(bm)
        dist = self.ao_dist
        cone = math.radians(58)
        cs, sn = math.cos(cone), math.sin(cone)
        for v in bm.verts:
            n = v.normal
            if n.length < 0.5:
                continue
            t1 = n.cross(Vector((0, 0, 1)))
            if t1.length < 0.1:
                t1 = n.cross(Vector((1, 0, 0)))
            t1.normalize()
            t2 = n.cross(t1)
            o = v.co + n * 0.006
            hit = 0.0
            jit = (v.index * 0.618) % 1.0 * TAU
            dirs = [n]
            for k in range(6):
                a = jit + TAU * k / 6
                dirs.append(n * cs + (t1 * math.cos(a) + t2 * math.sin(a)) * sn)
            for d in dirs:
                best = None
                loc, _, _, dd = tree.ray_cast(o, d, dist)
                if loc is not None:
                    best = dd
                if self.ground is not None and d.z < -0.05 and o.z > self.ground - 1e-4:
                    tg = (o.z - self.ground) / -d.z
                    if tg < dist and (best is None or tg < best):
                        best = tg
                if best is not None:
                    hit += (1.0 - best / dist) ** 0.7
            frac = hit / len(dirs)
            occ[v.index] = 1.0 - min(0.7, frac * 0.85 * self.ao)
        return occ

    def _heat(self, p, pts):
        best = 0.0
        for (c, r) in pts:
            d = (p - c).length
            if d < r:
                best = max(best, 1 - d / r)
        return best

    def _weather(self, kind, rgb, p, n, c, ao):
        r, g, b = rgb
        w = self.weather
        tone = 0.9 + 0.2 * _fbm(p.x * 0.6, p.y * 0.6, p.z * 0.6)
        streak = _fbm(p.x * 2.7 + 7.1, p.y * 2.7 - 3.3, p.z * 0.17)
        run = max(0.0, streak * 2.4 - 1.3)
        fine = _fbm(p.x * 4.3 + 3.0, p.y * 4.3 + 9.0, p.z * 4.3 + 1.0)
        patch = _fbm(p.x * 0.85 + 11.0, p.y * 0.85 - 5.0, p.z * 0.85)
        edge = max(0.0, c)
        cav = max(0.0, -c)
        up = max(0.0, n.z)
        col = (r * tone, g * tone, b * tone)
        if kind == K_BRASS or kind == K_COPPER:
            pol = POLISH if kind == K_BRASS else (0.88, 0.58, 0.4)
            col = lerp3(col, pol, min(0.8, edge * 1.3) * w)
            vg = (cav * 0.9 + up ** 1.5 * max(0.0, patch * 2.1 - 0.95) * 0.8 + run * 0.35) * self.verd
            if kind == K_COPPER:
                vg *= 1.35
            else:
                vg *= 0.55
            vc = VERDIGRIS if fine > 0.45 else VERD_DARK
            col = lerp3(col, vc, min(0.85, vg) * w)
            k = 1 - 0.2 * run * w
            col = (col[0] * k, col[1] * k, col[2] * k)
        elif kind == K_VERD:
            col = lerp3(col, (0.7, 0.45, 0.3), min(0.75, edge * 1.4) * w)
            k = 1 - 0.35 * cav
            col = (col[0] * k, col[1] * k, col[2] * k)
            col = lerp3(col, STREAK_PALE, run * 0.45 * w)
            col = lerp3(col, VERD_DARK, max(0.0, 0.5 - patch) * 0.6 * w)
        elif kind == K_IRON:
            rust = (run * 0.8 + cav * 0.35 + up * max(0.0, patch * 2.0 - 1.05) * 0.4) * self.rust * 1.6
            col = lerp3(col, RUST if fine > 0.42 else RUST_DEEP, min(0.7, rust) * w)
            col = lerp3(col, (0.4, 0.41, 0.43), min(0.55, edge * 1.1) * w)
        elif kind == K_STEEL:
            k = 1 - 0.22 * run * w
            col = (col[0] * k, col[1] * k, col[2] * k)
            col = lerp3(col, (0.66, 0.68, 0.7), min(0.5, edge) * w)
            col = lerp3(col, RUST, min(0.4, cav * 0.4 * self.rust) * w)
        elif kind == K_PAINT:
            col = (r * (0.93 + 0.12 * patch), g * (0.93 + 0.12 * patch), b * (0.93 + 0.12 * patch))
            chip = min(1.0, edge * 2.2) * max(0.0, fine * 2.2 - 0.75)
            col = lerp3(col, STEEL_BARE, min(0.85, chip) * w)
            col = lerp3(col, RUST, min(0.45, run * 0.5 * self.rust) * w)
            k = 1 - 0.25 * cav
            col = (col[0] * k, col[1] * k, col[2] * k)
        elif kind == K_STONE:
            k = (0.84 + 0.3 * _fbm(p.x * 0.9 + 4.0, p.y * 0.9, p.z * 0.9)) * (1 - 0.35 * cav) * (1 - 0.22 * run)
            k *= 1 + 0.12 * edge
            col = (r * k, g * k, b * k)
        elif kind == K_SOFT:
            k = 0.9 + 0.18 * _fbm(p.x * 1.4, p.y * 1.4, p.z * 1.4)
            col = (r * k, g * k, b * k)
        if n.z < -0.4:
            col = (col[0] * 0.88, col[1] * 0.88, col[2] * 0.88)
        if self.grime is not None:
            h = p.z - self.grime
            if h < 1.6:
                k = 0.72 + 0.28 * max(0.0, h) / 1.6
                k = 1 - (1 - k) * w
                g2 = 1 - (1 - k) * 1.1
                col = (col[0] * k, col[1] * g2, col[2] * (g2 - (1 - k) * 0.1))
        ht = self._heat(p, self.heat) if self.heat else 0.0
        if ht > 0:
            if kind in (K_IRON, K_STEEL):
                tint = lerp3(HEAT_STRAW, HEAT_BLUE, min(1.0, ht * 1.6))
                col = lerp3(col, tint, 0.5 * min(1.0, ht * 1.8))
            else:
                k = 1 - 0.55 * ht
                col = (col[0] * k, col[1] * k, col[2] * k)
        st = self._heat(p, self.soot) if self.soot else 0.0
        if st > 0:
            col = lerp3(col, SOOT, min(0.85, st * 1.3) * (0.7 + 0.3 * fine))
        return (col[0] * ao, col[1] * ao, col[2] * ao)


def P(name, **kw):
    return FPiece('Kit_' + name, **kw)


Z = (0, 0, 1)
X = (1, 0, 0)
Y = (0, 1, 0)
NY = (0, -1, 0)

BUILDERS = {}
FOOT = {}
KNEE = {}
TILE_X = {}


def piece(name, foot=None, knee=None, tile=None):
    """Register a builder; foot is its head-room footprint spec, knee its max
    height, tile its X half length (it must stay inside it to join seamlessly)."""
    def wrap(fn):
        BUILDERS[name] = fn
        full = 'Kit_' + name
        if foot:
            FOOT[full] = foot
        if knee:
            KNEE[full] = knee
        if tile:
            TILE_X[full] = tile
        return fn
    return wrap


# ====================================================== small machinery and props
def drum_profile(h=0.95, r=0.3):
    k = h / 0.95
    return [(r * 0.93, 0), (r, 0.02 * k), (r, 0.3 * k), (r * 1.05, 0.31 * k), (r * 1.05, 0.33 * k), (r, 0.34 * k),
            (r, 0.61 * k), (r * 1.05, 0.62 * k), (r * 1.05, 0.64 * k), (r, 0.65 * k), (r, 0.92 * k),
            (r * 1.035, 0.94 * k), (r * 1.035, h), (r * 0.9, h)]


def oil_drum(p, c, color, axis=Z, h=0.95, r=0.3, band=True, pump=False, yaw=0.0):
    c = Vector(c)
    d = Vector(axis).normalized()
    with p.as_kind(K_PAINT):
        p.turned(c, d, drum_profile(h, r), p.vary(color, 0.05), sides=14, mat=PAINT, phase=yaw)
        if band:
            p.turned(c + d * (h * 0.72), d, [(r * 1.004, 0), (r * 1.004, 0.06)], HAZARD, sides=14, mat=PAINT,
                     cap0=False, cap1=False, phase=yaw)
    m = basis(d)
    off = (m @ Vector((r * 0.55, 0, 0, 0))).to_3d()
    p.cyl(c + d * h + off, c + d * (h + 0.03) + off, 0.05, BRASS, sides=6, smooth=False)
    p.cyl(c + d * h - off * 0.8, c + d * (h + 0.02) - off * 0.8, 0.035, BRASS, sides=6, smooth=False)
    if pump:
        top = c + d * h + off
        p.cyl(top, top + d * 0.26, 0.03, BRASS, sides=6)
        p.turned(top + d * 0.08, d, [(0.06, 0), (0.06, 0.1), (0.04, 0.12)], BRASS, sides=8)
        p.tube([top + d * 0.2, top + d * 0.24 + Vector((0.12, 0, 0)), top + d * 0.18 + Vector((0.2, 0, 0))], 0.018,
               COPPER, sides=4)
        p.cyl(top + d * 0.26, top + d * 0.27 + Vector((-0.2, 0, 0.04)), 0.015, IRON, sides=4)


def crate_into(p, c, s, yaw=0.0, boards=4, stencil=True):
    """An iron-banded timber crate of edge s, its base centre at c."""
    hw = s / 2
    with p.at(T(c) @ R('Z', yaw)):
        with p.as_kind(K_SOFT):
            p.box((0, 0, hw), (s - 0.1, s - 0.1, s - 0.06), TIMBER_DARK, mat=PAINT)
        bh = (s - 0.12) / boards
        for side in range(4):
            with p.at(R('Z', side * PI / 2)):
                with p.as_kind(K_SOFT):
                    for k in range(boards):
                        z = 0.06 + bh * (k + 0.5)
                        p.box((0, -hw + 0.04, z), (s - 0.24, 0.06, bh - 0.03), p.vary(TIMBER, 0.12), mat=PAINT,
                              bevel=0.012)
                    p.flat((-hw + 0.2, -hw - 0.005, 0.14), (hw - 0.2, -hw - 0.005, s - 0.14), 0.15, 0.05,
                           p.vary(TIMBER, 0.08), up=(0, -1, 0), mat=PAINT)
                # corner irons: one leaf of each corner angle (the next side adds the other)
                p.box((hw - 0.09, -hw + 0.005, hw), (0.18, 0.035, s), IRON)
                p.box((-hw + 0.09, -hw + 0.005, hw), (0.18, 0.035, s), IRON)
                for z in (0.04, s - 0.04):
                    p.box((0, -hw + 0.005, z), (s - 0.36, 0.03, 0.06), IRON)
                for z in (0.18, hw, s - 0.18):
                    p.rivet((hw - 0.09, -hw - 0.012, z), NY, 0.035, STEEL)
                    p.rivet((-hw + 0.09, -hw - 0.012, z), NY, 0.035, STEEL)
        with p.as_kind(K_SOFT):
            for k in range(boards):
                y = -hw + 0.06 + (s - 0.12) * (k + 0.5) / boards
                p.box((0, y, s - 0.025), (s - 0.06, (s - 0.12) / boards - 0.03, 0.05), p.vary(TIMBER, 0.1),
                      mat=PAINT, bevel=0.01)
        if stencil:
            p.quad_prism([(-0.2 * s, -hw - 0.013, 0.5 * s), (0.2 * s, -hw - 0.013, 0.5 * s),
                          (0.2 * s, -hw - 0.013, 0.66 * s), (-0.2 * s, -hw - 0.013, 0.66 * s)], NY, 0.004,
                         OXBLOOD, sides=False)
            p.quad_prism([(-0.14 * s, -hw - 0.018, 0.555 * s), (0.14 * s, -hw - 0.018, 0.555 * s),
                          (0.14 * s, -hw - 0.018, 0.6 * s), (-0.14 * s, -hw - 0.018, 0.6 * s)], NY, 0.004,
                         CANVAS, sides=False)


@piece('WorkLamp', foot=('circle', 0.6))
def work_lamp():
    """A foundry work lamp (collider r 0.6, 4.3 tall): a cast-iron post on a
    bolted cross foot, brass collars, a conduit and a junction box, a coiled
    cable on a hook, and a caged brass lamp under an enamelled reflector; the
    bulb glows at Z 3.75."""
    p = P('WorkLamp', verd=0.45)
    for k in range(4):
        a = PI / 4 + k * PI / 2
        with p.at(R('Z', a)):
            p.box((0.32, 0, 0.05), (0.42, 0.16, 0.1), IRON, bevel=0.02)
            p.quad_prism([(0.1, -0.02, 0.1), (0.48, -0.02, 0.1), (0.1, -0.02, 0.46)], Y, 0.04, IRON, mat=METAL)
            p.bolt((0.45, 0, 0.1), Z, 0.035, 0.05)
    p.turned((0, 0, 0), Z, [(0.24, 0), (0.24, 0.1), (0.2, 0.14), (0.15, 0.3), (0.12, 0.55), (0.1, 0.6),
                            (0.09, 3.1), (0.12, 3.14), (0.12, 3.24), (0.07, 3.3)], IRON, sides=12)
    p.band((0, 0, 0.66), Z, 0.1, 0.1, BRASS, sides=12)
    p.band((0, 0, 1.95), Z, 0.09, 0.08, BRASS, sides=12)
    p.box((0, -0.17, 1.2), (0.22, 0.12, 0.28), SLATE, mat=PAINT, bevel=0.02)
    p.box((0, -0.235, 1.2), (0.16, 0.02, 0.2), SLATE, mat=PAINT, bevel=0.008)
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.rivet((sx * 0.07, -0.25, 1.2 + sz * 0.09), NY, 0.02, BRASS)
    p.tube([(0.0, -0.12, 1.34), (0.0, -0.13, 2.9), (0.0, -0.1, 3.1), (0, -0.05, 3.2)], 0.024, COPPER, sides=5)
    for z in (1.6, 2.4):
        p.box((0, -0.11, z), (0.08, 0.05, 0.05), IRON)
    p.tube([(0.09, 0, 2.55), (0.2, 0, 2.6), (0.24, 0, 2.5)], 0.02, STEEL, sides=4)
    for k in range(3):
        p.torus((0.27, 0, 2.28 + k * 0.035), (0.15, 0.1, 1), 0.17, 0.022, RUBBER, seg=12, sides=4, mat=PAINT)
    p.cage_lamp((0, 0, 3.75), r=0.27, h=0.6)
    p.torus((0, 0, 4.28), Y, 0.035, 0.012, IRON, seg=8, sides=4)
    return p


@piece('SteamVent', foot=('circle', 0.7), knee=1.3)
def steam_vent():
    """A floor steam vent (knee high, r 0.7): a bolted base, a copper standpipe,
    a flanged brass gate valve with a red handwheel toward the front, a gauge
    on a stub, and a slotted brass grille cap; steam leaves at (0, 0, 1.3)."""
    p = P('SteamVent', verd=0.75)
    p.soot.append((Vector((0, 0, 1.32)), 0.4))
    p.turned((0, 0, 0), Z, [(0.55, 0), (0.55, 0.05), (0.5, 0.08)], IRON, sides=8, smooth=False, phase=PI / 8)
    for k in range(8):
        a = TAU * k / 8
        p.bolt((math.cos(a) * 0.43, math.sin(a) * 0.43, 0.08), Z, 0.035, 0.04)
    p.turned((0, 0, 0.08), Z, [(0.24, 0), (0.2, 0.08), (0.16, 0.1)], IRON, sides=12)
    p.cyl((0, 0, 0.1), (0, 0, 0.42), 0.15, COPPER, sides=12)
    p.flange((0, 0, 0.42), Z, 0.27, 0.06, BRASS, bolts=6)
    p.turned((0, 0, 0.45), Z, [(0.17, 0), (0.24, 0.06), (0.26, 0.14), (0.24, 0.22), (0.17, 0.28)], BRASS, sides=12)
    p.cyl((0, -0.15, 0.59), (0, -0.32, 0.59), 0.09, BRASS, sides=8)
    p.cyl((0, -0.32, 0.59), (0, -0.4, 0.59), 0.03, STEEL, sides=6)
    p.handwheel((0, -0.42, 0.59), NY, 0.2)
    p.flange((0, 0, 0.76), Z, 0.27, 0.06, BRASS, bolts=6)
    p.cyl((0, 0, 0.78), (0, 0, 1.02), 0.15, COPPER, sides=12)
    p.tube([(0.12, 0, 0.88), (0.3, 0, 0.88), (0.31, -0.02, 0.95)], 0.025, COPPER, sides=5)
    p.gauge((0.31, -0.08, 1.0), NY, 0.09)
    p.turned((0, 0, 1.0), Z, [(0.17, 0), (0.27, 0.04), (0.27, 0.07)], BRASS, sides=14)
    with p.as_kind(K_PLAIN):
        p.cyl((0, 0, 1.06), (0, 0, 1.24), 0.22, SOOT, mat=PAINT, sides=12)
    for k in range(12):
        a = TAU * k / 12
        p.box((math.cos(a) * 0.255, math.sin(a) * 0.255, 1.15), (0.045, 0.05, 0.16), BRASS, rot=(0, 0, a))
    p.turned((0, 0, 1.22), Z, [(0.21, 0.065), (0.29, 0.0), (0.3, 0.03), (0.28, 0.06)], BRASS, sides=14, cap0=False,
             cap1=False)
    p.box((0, 0, 1.27), (0.42, 0.035, 0.03), IRON)
    p.box((0, 0, 1.27), (0.035, 0.42, 0.03), IRON)
    p.torus((0, 0, 1.27), Z, 0.12, 0.016, IRON, seg=10, sides=4)
    return p


@piece('PipeRun', tile=2.0)
def pipe_run():
    """A tiling copper pipe (X -2..+2, r 0.35 on the X axis): a brass flange at
    each end (bolted on the inside face, so two tiles read as one bolted
    joint), a riveted lap seam along the top and a lagging strap."""
    p = P('PipeRun', verd=0.65, ground=None, grime=None, ao_dist=0.6)
    p.cyl((-1.9, 0, 0), (1.9, 0, 0), 0.35, COPPER, sides=14, cap0=False, cap1=False)
    for s in (-1, 1):
        p.flange((s * 1.95, 0, 0), (-s, 0, 0), 0.5, 0.1, BRASS, bolts=5, sides=12, both=False)
    p.box((0, 0, 0.345), (3.7, 0.12, 0.02), COPPER)
    for k in range(6):
        x = -1.55 + k * 0.62
        p.rivet((x, 0, 0.355), Z, 0.035, COPPER)
    p.band((0.3, 0, 0), X, 0.35, 0.09, IRON, sides=12, lip=0.025)
    p.box((0.3, 0, -0.39), (0.12, 0.08, 0.06), IRON)
    p.bolt((0.3, 0, -0.42), (0, 0, -1), 0.03, 0.04)
    return p


@piece('PipeElbow')
def pipe_elbow():
    """A 90 degree copper elbow: a leg along -X and a leg up +Z (1 yd each from
    the origin where the axes meet), a flange on each leg end, a cast rib on
    the outside of the bend and a drain cock."""
    p = P('PipeElbow', verd=0.65, ground=None, grime=None, ao_dist=0.6)
    rb = 0.6
    pts = [Vector((-0.95, 0, 0))]
    for k in range(9):
        th = (PI / 2) * k / 8
        pts.append(Vector((-rb + rb * math.sin(th), 0, rb - rb * math.cos(th))))
    pts.append(Vector((0, 0, 0.95)))
    p.tube(pts, 0.35, COPPER, sides=14, cap=False)
    p.flange((-0.95, 0, 0), X, 0.5, 0.1, BRASS, bolts=6, sides=12, both=False)
    p.flange((0, 0, 0.95), (0, 0, -1), 0.5, 0.1, BRASS, bolts=6, sides=12, both=False)
    rib = []
    for k in range(9):
        th = (PI / 2) * k / 8
        rib.append(Vector((-rb + (rb + 0.34) * math.sin(th), 0, rb - (rb + 0.34) * math.cos(th))))
    p.tube(rib, 0.06, BRASS, sides=5, squash=1.0)
    o = Vector((-rb + (rb + 0.35) * math.sin(PI / 4), 0, rb - (rb + 0.35) * math.cos(PI / 4)))
    d = Vector((1, 0, -1)).normalized()
    p.cyl(o - d * 0.05, o + d * 0.14, 0.05, BRASS, sides=6)
    p.cyl(o + d * 0.1 + Vector((0, -0.05, 0)), o + d * 0.1 + Vector((0, -0.2, 0)), 0.015, STEEL, sides=4)
    return p


@piece('PipeValve')
def pipe_valve():
    """An inline gate valve (1.2 long along X, origin at its centre): flanged
    copper stubs, a bulged brass body, a bolted bonnet, an iron yoke and a red
    handwheel up (+Z)."""
    p = P('PipeValve', verd=0.5, ground=None, grime=None, ao_dist=0.6)
    for s in (-1, 1):
        p.cyl((s * 0.55, 0, 0), (s * 0.33, 0, 0), 0.35, COPPER, sides=14, cap0=False, cap1=False)
        p.flange((s * 0.55, 0, 0), (-s, 0, 0), 0.5, 0.1, BRASS, bolts=6, sides=12, both=False)
        p.flange((s * 0.32, 0, 0), (s, 0, 0), 0.48, 0.08, BRASS, bolts=6, sides=12, both=False)
    p.turned((-0.3, 0, 0), X, [(0.36, 0), (0.5, 0.12), (0.56, 0.3), (0.5, 0.48), (0.36, 0.6)], BRASS, sides=16)
    p.turned((0, 0, 0.42), Z, [(0.32, 0), (0.32, 0.08), (0.22, 0.1), (0.2, 0.3), (0.24, 0.32), (0.24, 0.38),
                               (0.14, 0.4)], BRASS, sides=12)
    for k in range(6):
        a = TAU * k / 6
        p.bolt((math.cos(a) * 0.27, math.sin(a) * 0.27, 0.5), Z, 0.03, 0.04)
    for s in (-1, 1):
        p.box((s * 0.17, 0, 0.98), (0.06, 0.1, 0.36), IRON, bevel=0.015)
    p.box((0, 0, 1.13), (0.42, 0.12, 0.06), IRON, bevel=0.015)
    p.cyl((0, 0, 0.8), (0, 0, 1.2), 0.04, STEEL, sides=6)
    p.handwheel((0, 0, 1.2), Z, 0.42)
    return p


@piece('PipeRiser', foot=('circle', 0.9))
def pipe_riser():
    """A standing copper riser (Z 0..10, r 0.35): a bolted floor boss, a flanged
    brass globe valve at Z 1.2 with a handwheel to the front, a gauge, wall
    brackets toward +Y at Z 3, 6 and 9, flanged joints, and a brass steam
    whistle on top (steam source at Z 10)."""
    p = P('PipeRiser', verd=0.65)
    p.soot.append((Vector((0, 0, 10.0)), 0.7))
    p.turned((0, 0, 0), Z, [(0.6, 0), (0.6, 0.08), (0.45, 0.14), (0.38, 0.32)], IRON, sides=12)
    for k in range(6):
        a = TAU * k / 6 + 0.3
        p.bolt((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.09), Z, 0.04, 0.05)
    p.cyl((0, 0, 0.3), (0, 0, 0.95), 0.3, COPPER, sides=14)
    p.flange((0, 0, 0.95), Z, 0.48, 0.08, BRASS, bolts=6)
    p.turned((0, 0, 0.98), Z, [(0.36, 0), (0.5, 0.1), (0.53, 0.22), (0.5, 0.36), (0.36, 0.46)], BRASS, sides=16)
    p.flange((0, 0, 1.45), Z, 0.48, 0.08, BRASS, bolts=6)
    p.cyl((0, -0.45, 1.21), (0, -0.66, 1.21), 0.13, BRASS, sides=10)
    p.cyl((0, -0.66, 1.21), (0, -0.76, 1.21), 0.035, STEEL, sides=6)
    p.handwheel((0, -0.78, 1.21), NY, 0.3)
    joints = (1.45, 4.3, 7.1, 9.3)
    for a, b in zip(joints, joints[1:]):
        p.cyl((0, 0, a), (0, 0, b), 0.35, COPPER, sides=14, cap0=False, cap1=False)
    for z in joints[1:]:
        p.flange((0, 0, z), Z, 0.5, 0.09, BRASS, bolts=6)
    p.tube([(0.3, 0, 1.75), (0.55, 0, 1.75), (0.6, -0.02, 1.82)], 0.03, COPPER, sides=5)
    p.gauge((0.6, -0.1, 1.9), NY, 0.12)
    for z in (3.0, 6.0, 8.6):
        p.torus((0, 0, z), Z, 0.39, 0.035, IRON, seg=14, sides=4, smooth=False)
        p.box((0, 0.6, z), (0.1, 0.45, 0.08), IRON, bevel=0.015)
        p.box((0, 0.84, z), (0.36, 0.05, 0.36), IRON, bevel=0.02)
        for sx in (-1, 1):
            for sz in (-1, 1):
                p.bolt((sx * 0.12, 0.86, z + sz * 0.12), Y, 0.025, 0.03)
    p.turned((0, 0, 9.33), Z, [(0.2, 0), (0.2, 0.08), (0.24, 0.1), (0.24, 0.45), (0.17, 0.5), (0.09, 0.6),
                               (0.06, 0.67)], BRASS, sides=12)
    p.torus((0, 0, 9.55), Z, 0.245, 0.018, BRASS, seg=12, sides=4)
    p.cyl((0, 0, 9.33 - 0.02), (0.38, 0, 9.5), 0.02, IRON, sides=4)
    p.cyl((0.38, 0, 9.5), (0.4, 0, 8.4), 0.012, IRON, sides=4)
    p.sphere((0.4, 0, 8.35), 0.045, OXBLOOD, mat=PAINT, rings=3, sides=6)
    return p


@piece('Gear')
def gear():
    """A spinning brass gear (origin at the hub, axis X, r 1.6, 16 teeth, X
    +-0.25): a toothed rim, six ribbed spokes, a bolted hub with a keyed bore."""
    p = P('Gear', verd=0.55, ground=None, grime=None, ao_dist=0.5)
    n, rt, rr, rin, hx = 16, 1.6, 1.34, 1.1, 0.25
    pts = []
    for i in range(n):
        s = TAU / n
        a0 = s * i
        for (r, f) in ((rr, 0.0), (rt, 0.17), (rt, 0.37), (rr, 0.54), (rr * 1.004, 0.77)):
            pts.append((r, a0 + s * f))
    m = len(pts)
    out_f = [p.bm.verts.new(p.xf @ Vector((hx, math.cos(a) * r, math.sin(a) * r))) for (r, a) in pts]
    out_b = [p.bm.verts.new(p.xf @ Vector((-hx, math.cos(a) * r, math.sin(a) * r))) for (r, a) in pts]
    in_f = [p.bm.verts.new(p.xf @ Vector((hx, math.cos(a) * rin, math.sin(a) * rin))) for (r, a) in pts]
    in_b = [p.bm.verts.new(p.xf @ Vector((-hx, math.cos(a) * rin, math.sin(a) * rin))) for (r, a) in pts]
    faces = []
    for i in range(m):
        j = (i + 1) % m
        faces.append(p.bm.faces.new((out_b[i], out_b[j], out_f[j], out_f[i])))
        faces.append(p.bm.faces.new((in_f[i], in_f[j], in_b[j], in_b[i])))
        faces.append(p.bm.faces.new((out_f[i], out_f[j], in_f[j], in_f[i])))
        faces.append(p.bm.faces.new((in_b[i], in_b[j], out_b[j], out_b[i])))
    p._paint(faces, BRASS, METAL)
    for k in range(6):
        a = TAU * k / 6 + PI / 6
        d = Vector((0, math.cos(a), math.sin(a)))
        tvec = Vector((0, -math.sin(a), math.cos(a)))
        with p.at(T(0, 0, 0) @ basis(d, up=tvec)):
            p.box((0, 0, 0.77), (0.13, 0.26, 0.7), BRASS_DARK, bevel=0.02)
            p.box((0, 0, 0.77), (0.3, 0.07, 0.7), BRASS_DARK)
    p.turned((-0.3, 0, 0), X, [(0.38, 0), (0.45, 0.04), (0.45, 0.56), (0.38, 0.6)], BRASS, sides=14)
    with p.as_kind(K_PLAIN):
        for sx in (-1, 1):
            p.cyl((sx * 0.3, 0, 0), (sx * 0.305, 0, 0), 0.16, SOOT, sides=10, mat=PAINT, smooth=False)
    p.box((0.3, 0, 0.17), (0.02, 0.07, 0.06), STEEL)
    for k in range(6):
        a = TAU * k / 6
        p.bolt((0.3, math.cos(a) * 0.3, math.sin(a) * 0.3), X, 0.035, 0.04)
    return p


@piece('Flywheel')
def flywheel():
    """A spinning iron flywheel (origin at the hub, axis X, r 2.4, rim X +-0.3):
    a heavy rim with a riveted brass band, six curved spokes, a bolted hub with
    brass caps, a riveted counterweight, and enamel marks so the spin reads."""
    p = P('Flywheel', verd=0.4, rust=0.6, ground=None, grime=None, ao_dist=0.6)
    p.annulus((0, 0, 0), X, 1.95, 2.3, 0.3, IRON, sides=36, chamfer=0.04)
    p.annulus((0, 0, 0), X, 2.28, 2.4, 0.2, BRASS, sides=36, chamfer=0.02)
    for sx in (-1, 1):
        for k in range(14):
            a = TAU * k / 14
            p.rivet((sx * 0.2, math.cos(a) * 2.34, math.sin(a) * 2.34), (sx, 0, 0), 0.04, BRASS)
    for k in range(6):
        a = TAU * k / 6
        pts = []
        for i in range(6):
            t = i / 5
            rr = 0.48 + (1.98 - 0.48) * t
            aa = a + 0.16 * math.sin(PI * t)
            pts.append((0, math.cos(aa) * rr, math.sin(aa) * rr))
        p.tube(pts, 0.17, IRON, sides=7, r1=0.12, squash=0.7)
    p.turned((-0.42, 0, 0), X, [(0.5, 0), (0.56, 0.06), (0.56, 0.78), (0.5, 0.84)], IRON, sides=16)
    for sx in (-1, 1):
        p.turned((sx * 0.42, 0, 0), (sx, 0, 0), [(0.32, 0), (0.32, 0.04), (0.24, 0.07), (0.12, 0.08)], BRASS, sides=12)
        for k in range(6):
            a = TAU * k / 6 + 0.26
            p.bolt((sx * 0.42, math.cos(a) * 0.42, math.sin(a) * 0.42), (sx, 0, 0), 0.04, 0.04)
    a0, a1 = PI * 0.5 + 0.18, PI * 0.5 + PI / 3 - 0.18
    p.arc_block((0, 0, 0), X, 1.4, 1.96, 0.21, a0 - PI / 6 - 0.0, a1 - PI / 6 + 0.0, IRON, seg=6)
    for k in range(4):
        a = a0 - PI / 6 + (a1 - a0) * (k + 0.5) / 4
        for sx in (-1, 1):
            p.rivet((sx * 0.21, math.cos(a) * 1.68, math.sin(a) * 1.68), (sx, 0, 0), 0.04, STEEL)
    for a in (0.0, PI):
        for sx in (-1, 1):
            c = Vector((sx * 0.305, math.cos(a) * 2.12, math.sin(a) * 2.12))
            t = Vector((0, -math.sin(a), math.cos(a)))
            r = Vector((0, math.cos(a), math.sin(a)))
            p.quad_prism([c - t * 0.08 - r * 0.14, c + t * 0.08 - r * 0.14, c + t * 0.08 + r * 0.14,
                          c - t * 0.08 + r * 0.14], (sx, 0, 0), 0.006, ENAMEL, sides=False)
    return p


@piece('Crate', foot=('box', 0.7, 0.7))
def crate():
    """An iron-banded timber crate (1.4 cube): boards, a diagonal brace per side,
    riveted corner irons, a stencilled oxblood mark."""
    p = P('Crate', rust=0.6)
    crate_into(p, (0, 0, 0), 1.4)
    return p


@piece('CrateStack', foot=('box', 1.6, 1.1))
def crate_stack():
    """Crates stacked three high in a rough pyramid (X +-1.6, Y +-1.1, Z 0..2.8),
    a strap round the top one and a sack thrown against the side."""
    p = P('CrateStack', rust=0.6)
    crate_into(p, (-0.8, 0.05, 0), 1.4, yaw=0.06)
    crate_into(p, (0.82, -0.08, 0), 1.35, yaw=-0.08, stencil=False)
    crate_into(p, (0.05, 0.08, 1.4), 1.3, yaw=0.12)
    with p.at(T(0.05, 0.08, 1.4) @ R('Z', 0.12)):
        for x in (-0.35, 0.35):
            for y in (-0.662, 0.662):
                p.box((x, y, 0.65), (0.1, 0.012, 1.3), CANVAS, mat=PAINT)
            p.box((x, 0, 1.306), (0.1, 1.33, 0.012), CANVAS, mat=PAINT)
    p.pillow((1.2, -0.85, 0.22), (0.9, 0.5, 0.42), CANVAS, yaw=0.3, roll=0.1)
    return p


@piece('DrumCluster', foot=('circle', 1.2), knee=1.3)
def drum_cluster():
    """Oil drums (knee high, within r 1.2): three standing (slate, oxblood,
    enamel, each with a thin hazard code band), one on its side on a timber
    chock, a brass hand pump, an oil stain on the floor."""
    p = P('DrumCluster', rust=0.7)
    with p.as_kind(K_PLAIN):
        p.turned((0.0, -0.05, 0.004), Z, [(0.9, 0), (0.9, 0.004)], (0.06, 0.055, 0.05), sides=12, mat=PAINT,
                 squash=0.7, smooth=False)
    oil_drum(p, (-0.52, -0.32, 0), SLATE, pump=True, yaw=0.3)
    oil_drum(p, (0.22, -0.46, 0), OXBLOOD, yaw=1.1)
    oil_drum(p, (0.66, 0.22, 0), ENAMEL, yaw=2.0)
    oil_drum(p, (-0.62, 0.6, 0.31), SLATE, axis=(1, 0.08, 0), band=False)
    with p.as_kind(K_SOFT):
        for x in (-0.4, 0.15):
            p.box((x, 0.6, 0.06), (0.14, 0.5, 0.12), TIMBER, mat=PAINT, bevel=0.01, taper=0.6)
    return p


@piece('RailingEdge', tile=2.0, knee=1.3)
def railing_edge():
    """The catwalk railing along a lip (tiles along X, outer side -Y): I-section
    stanchions (half posts at both ends, so tiles join into whole posts), a
    brass handrail at 1.25, a flat mid rail, a toe plate with a thin hazard
    band, and a riveted channel fascia under the lip to Z -0.9."""
    p = P('RailingEdge', rust=0.6, ground=0.0, grime=None, ao_dist=0.5)
    p.box((0, -0.13, -0.45), (4.0, 0.04, 0.9), IRON)
    p.box((0, -0.06, -0.88), (4.0, 0.18, 0.04), IRON)
    p.box((0, -0.06, -0.025), (4.0, 0.18, 0.05), IRON)
    for x in (-1.0, 1.0):
        p.box((x, -0.06, -0.45), (0.06, 0.14, 0.82), IRON)
    for k in range(8):
        x = -1.75 + k * 0.5
        p.rivet((x, -0.15, -0.14), NY, 0.035, STEEL)
        p.rivet((x, -0.15, -0.76), NY, 0.035, STEEL)
    p.box((0, -0.1, 0.08), (4.0, 0.03, 0.16), SLATE, mat=PAINT)
    p.stripes((-2.0, -0.1155, 0.035), X, Z, NY, 4.0, 0.09, pitch=0.22, slant=1.2)
    for x0, x1 in ((-2.0, -1.94), (-0.06, 0.06), (1.94, 2.0)):
        p.bx((x0, -0.08, 0), (x1, -0.06, 1.2), IRON)
        p.bx((x0, 0.04, 0), (x1, 0.06, 1.2), IRON)
        if x0 == -2.0:
            wx = (-2.0, -1.988)
        elif x1 == 2.0:
            wx = (1.988, 2.0)
        else:
            wx = (-0.012, 0.012)
        p.bx((wx[0], -0.06, 0), (wx[1], 0.04, 1.2), IRON)
        p.bx((x0, -0.1, 0), (x1, 0.12, 0.03), IRON)
        p.bx((x0, -0.04, 1.15), (x1, 0.02, 1.2), IRON)
    p.bolt((0.0, 0.09, 0.03), Z, 0.025, 0.025)
    p.cyl((-2.0, -0.01, 1.25), (2.0, -0.01, 1.25), 0.05, BRASS, sides=8, cap0=False, cap1=False)
    p.box((0, -0.01, 0.66), (4.0, 0.025, 0.08), IRON)
    return p


# ===================================================== engines, boilers, stacks
@piece('PistonEngine', foot=('box', 1.5, 1.2))
def piston_engine():
    """A vertical steam engine (X +-1.5, Y +-1.2, Z 0..4.5; the cylinder's top at
    Z 3.0 where Kit_PistonRod stands): a cast bedplate with a hazard skirt, a
    brass-lagged cylinder banded in iron, a bolted cover and gland, crosshead
    guides, a valve chest with its rod, a flyball governor, a stop valve on
    the steam inlet, gauges on a bracket, lubricators and drain cocks."""
    p = P('PistonEngine', verd=0.5, rust=0.5)
    p.box((0, 0, 0.12), (3.0, 2.3, 0.24), IRON, bevel=0.04)
    p.box((0, 0, 0.42), (2.6, 1.9, 0.36), IRON, bevel=0.05, taper=0.9)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.bolt((sx * 1.36, sy * 1.0, 0.24), Z, 0.05, 0.06)
    p.stripes((-1.5, -1.151, 0.04), X, Z, NY, 3.0, 0.14, pitch=0.3, slant=1.0)
    p.turned((0, 0, 0.6), Z, [(0.86, 0), (0.86, 0.08), (0.7, 0.12), (0.62, 0.38), (0.8, 0.44), (0.8, 0.52)], IRON,
             sides=20)
    p.turned((0, 0, 1.12), Z, [(0.8, 0), (0.8, 0.06), (0.74, 0.08), (0.74, 1.62), (0.8, 1.64), (0.8, 1.7)], BRASS,
             sides=22)
    for z in (1.6, 2.35):
        p.band((0, 0, z), Z, 0.74, 0.1, IRON, rivets=12, rivet_r=0.035, sides=22, lip=0.025)
    p.turned((0, 0, 2.82), Z, [(0.84, 0), (0.84, 0.07), (0.62, 0.11), (0.32, 0.14), (0.3, 0.18)], IRON, sides=22)
    for k in range(14):
        a = TAU * k / 14
        p.bolt((math.cos(a) * 0.76, math.sin(a) * 0.76, 2.89), Z, 0.035, 0.04)
    for sx in (-1, 1):
        p.bolt((sx * 0.38, 0, 2.93), Z, 0.04, 0.07)
    # Crosshead guides (open at the top so the rod pumps free).
    for sx in (-1, 1):
        p.box((sx * 0.36, 0, 3.72), (0.08, 0.22, 1.5), STEEL_DARK, bevel=0.015)
        p.flat((sx * 0.36, 0.08, 3.15), (sx * 0.7, 0.08, 2.86), 0.12, 0.05, IRON)
    p.box((0, 0.36, 4.42), (0.9, 0.1, 0.14), IRON, bevel=0.02)
    for sx in (-1, 1):
        p.box((sx * 0.36, 0.22, 4.42), (0.08, 0.2, 0.12), IRON)
    # Valve chest (+X).
    p.box((1.05, 0, 1.95), (0.42, 0.84, 1.1), IRON, bevel=0.05)
    p.plate((1.27, 0, 1.95), X, 0.66, 0.94, 0.05, BRASS, spacing=0.22, rr=0.035, inset=0.06)
    p.cyl((1.05, 0, 2.5), (1.05, 0, 3.25), 0.04, STEEL, sides=6)
    p.turned((1.05, 0, 2.5), Z, [(0.12, 0), (0.12, 0.12), (0.07, 0.16)], BRASS, sides=8)
    # Steam inlet and stop valve: up from the chest, back out over the top.
    inlet = fillet([(1.05, 0.3, 2.5), (1.05, 0.3, 3.9), (1.05, 1.2, 3.9)], 0.3)
    p.tube(inlet, 0.13, COPPER, sides=10)
    p.flange((1.05, 0.3, 3.1), Z, 0.22, 0.06, BRASS, bolts=5)
    p.turned((1.05, 0.3, 3.25), Z, [(0.14, 0), (0.22, 0.08), (0.22, 0.22), (0.14, 0.3)], BRASS, sides=10)
    p.cyl((1.05, 0.3, 3.4), (1.05, -0.1, 3.4), 0.05, BRASS, sides=6)
    p.handwheel((1.05, -0.12, 3.4), NY, 0.18)
    # Flyball governor beside the chest.
    gx, gy = 0.98, -0.62
    p.turned((gx, gy, 2.5), Z, [(0.12, 0), (0.12, 0.1), (0.06, 0.14)], BRASS, sides=8)
    p.cyl((gx, gy, 2.55), (gx, gy, 4.3), 0.025, STEEL, sides=6)
    p.turned((gx, gy, 4.18), Z, [(0.07, 0), (0.07, 0.08), (0.03, 0.12)], BRASS, sides=8)
    for s in (-1, 1):
        ball = Vector((gx + s * 0.32, gy, 3.72))
        p.cyl((gx, gy, 4.2), ball, 0.015, STEEL, sides=4)
        p.cyl((gx, gy, 3.3), ball + Vector((-s * 0.1, 0, -0.08)), 0.012, STEEL, sides=4)
        p.sphere(ball - Vector((0, 0, 0.11)), 0.11, BRASS, rings=4, sides=8)
    p.turned((gx, gy, 3.25), Z, [(0.07, 0), (0.07, 0.07)], BRASS, sides=8)
    p.box((gx - 0.25, 0.0, 3.0), (0.06, 0.06, 0.6), IRON, rot=(0.6, 0, 0))
    # Gauges on a bracket (-X), lubricators, drain cocks.
    p.flat((-0.78, 0, 2.2), (-1.18, -0.3, 2.2), 0.08, 0.04, IRON)
    p.box((-1.2, -0.42, 2.2), (0.42, 0.06, 0.8), BRASS, bevel=0.02, rot=(0, 0, -0.5))
    for z in (1.98, 2.42):
        p.gauge((-1.24, -0.48, z), (-0.45, -0.9, 0), 0.13)
    for a in (0.6, 2.4, 4.0):
        x, y = math.cos(a) * 0.76, math.sin(a) * 0.76
        p.tube([(x, y, 2.6), (x * 1.18, y * 1.18, 2.62), (x * 1.18, y * 1.18, 2.72)], 0.025, COPPER, sides=4)
        p.turned((x * 1.18, y * 1.18, 2.72), Z, [(0.06, 0), (0.08, 0.06), (0.08, 0.16), (0.05, 0.18)], BRASS, sides=8)
        p.cyl((x * 1.18, y * 1.18, 2.9), (x * 1.18, y * 1.18, 2.95), 0.02, STEEL, sides=4)
    for sx in (-1, 1):
        p.tube([(sx * 0.45, -0.62, 1.2), (sx * 0.5, -0.85, 1.18), (sx * 0.52, -0.95, 0.66)], 0.025, COPPER, sides=4)
        p.cyl((sx * 0.45, -0.72, 1.19), (sx * 0.45, -0.72, 1.3), 0.015, STEEL, sides=4)
    return p


@piece('PistonRod')
def piston_rod():
    """The pumping piston rod and crosshead (origin at its bottom, where it leaves
    the engine's cylinder gland; r 0.25, Z 0..2.5)."""
    p = P('PistonRod', ground=None, grime=None, ao_dist=0.4, rust=0.3)
    p.turned((0, 0, 0), Z, [(0.13, 0), (0.13, 0.08), (0.1, 0.1)], BRASS, sides=10)
    p.cyl((0, 0, 0.08), (0, 0, 1.88), 0.085, STEEL, sides=10)
    p.cyl((0, 0, 1.82), (0, 0, 1.9), 0.13, STEEL_DARK, sides=6, smooth=False)
    p.box((0, 0, 2.05), (0.4, 0.22, 0.34), STEEL_DARK, bevel=0.03)
    for sx in (-1, 1):
        p.box((sx * 0.205, 0, 2.05), (0.05, 0.2, 0.42), BRASS, bevel=0.01)
        p.cyl((sx * 0.21, -0.1, 2.24), (sx * 0.21, -0.1, 2.3), 0.02, BRASS, sides=4)
    p.cyl((0, -0.14, 2.05), (0, 0.14, 2.05), 0.07, STEEL, sides=8)
    p.turned((0, 0, 2.22), Z, [(0.1, 0), (0.1, 0.1), (0.16, 0.12), (0.16, 0.2), (0.12, 0.26), (0.06, 0.28)], STEEL,
             sides=10)
    return p


@piece('Smokestack', foot=('circle', 1.4))
def smokestack():
    """A riveted iron smokestack (r 1.4 tapering to 1.1, Z 0..24): a bolted
    flared foot, lap-seamed courses with rivet rings, brass bands, a ladder up
    its +X side, guy lugs, a crown cap ring, the top soot-black; smoke leaves
    at Z 24."""
    p = P('Smokestack', rust=0.7, verd=0.4)
    p.soot.append((Vector((0, 0, 25.5)), 6.5))

    def rad(z):
        return 1.4 + (1.1 - 1.4) * max(0.0, min(1.0, (z - 0.35) / 22.8))

    prof = [(1.75, 0), (1.75, 0.12), (1.55, 0.22), (1.44, 0.35)]
    seams = [2.6 + 2.45 * k for k in range(9)]
    for zs in seams:
        r = rad(zs)
        prof += [(r, zs), (r + 0.035, zs + 0.02), (r + 0.035, zs + 0.13), (r, zs + 0.15)]
    prof += [(1.1, 23.1), (1.24, 23.3), (1.3, 23.55), (1.3, 23.78), (1.2, 23.82), (1.17, 24.0), (1.08, 24.0),
             (1.04, 23.8)]
    p.turned((0, 0, 0), Z, prof, IRON, sides=22, cap1=False)
    with p.as_kind(K_PLAIN):
        p.cyl((0, 0, 23.0), (0, 0, 23.02), 1.06, SOOT, sides=12, mat=PAINT, smooth=False)
    for k in range(10):
        a = TAU * k / 10
        p.bolt((math.cos(a) * 1.63, math.sin(a) * 1.63, 0.15), Z, 0.05, 0.07)
    for zs in (seams[1], seams[4], seams[7]):
        p.rivet_ring((0, 0, zs + 0.075), Z, rad(zs) + 0.035, 18, 0.045, IRON)
    for z in (7.5, 15.6, 22.3):
        p.band((0, 0, z), Z, rad(z), 0.32, BRASS, rivets=16, rivet_r=0.045, sides=22, lip=0.05)
    # Ladder up the +X side.
    rails = []
    for sy in (-1, 1):
        pts = [(rad(z) + 0.3, sy * 0.22, z) for z in (0.6, 12.0, 22.0)]
        p.tube(pts, 0.03, IRON, sides=4)
        rails.append(pts)
    z = 0.9
    while z < 21.8:
        x = rad(z) + 0.3
        p.cyl((x, -0.22, z), (x, 0.22, z), 0.02, IRON, sides=4)
        z += 0.45
    for z in (3.0, 9.0, 15.0, 21.0):
        for sy in (-1, 1):
            p.box((rad(z) + 0.15, sy * 0.22, z), (0.32, 0.04, 0.06), IRON)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        d = Vector((math.cos(a), math.sin(a), 0))
        c = d * (rad(16.0) + 0.1) + Vector((0, 0, 16.0))
        p.box(c, (0.2, 0.05, 0.3), IRON, rot=(0, 0, a + PI / 2), bevel=0.01)
        p.torus(c + d * 0.12 + Vector((0, 0, 0.05)), d.cross(Vector((0, 0, 1))), 0.06, 0.02, IRON, seg=8, sides=4)
    return p


@piece('MachineBlock', foot=('box', 3.0, 2.0))
def machine_block():
    """The engine house block (X +-3, Y +-2, Z 0..4.5): a cast gearbox on a stone
    plinth, ribbed flanks, a riveted half-round gear cover, a bearing housing
    on +X for a flywheel at (3.6, 0, 2.6), control levers on a brass quadrant,
    a gauge board, handwheel valves, an inspection hatch, oil cups and pipes."""
    p = P('MachineBlock', verd=0.5, rust=0.55)
    with p.as_kind(K_STONE):
        p.box((0, 0, 0.3), (6.0, 4.0, 0.6), STONE, mat=PAINT, bevel=0.06)
    p.stripes((-3.0, -2.001, 0.42), X, Z, NY, 6.0, 0.12, pitch=0.32, slant=1.0)
    p.box((0, 0.1, 1.75), (5.4, 3.4, 2.3), IRON, bevel=0.12)
    for k in range(7):
        x = -2.4 + k * 0.8
        if abs(x) < 0.5:
            continue
        p.box((x, -1.63, 1.75), (0.12, 0.12, 2.1), IRON, bevel=0.02)
        p.box((x, 1.83, 1.75), (0.12, 0.12, 2.1), IRON, bevel=0.02)
    p.box((0, 0.1, 2.95), (5.5, 3.5, 0.12), IRON, bevel=0.03)
    p.rivets((-2.6, -1.66, 2.95), (2.6, -1.66, 2.95), NY, 0.4, 0.04, BRASS)
    p.arc_block((0, 0.1, 3.0), X, 0.02, 1.42, 2.4, 0.0, PI, BOILER_COPPER, seg=12, smooth=True, up=Z)
    for sx in (-1, 1):
        p.arc_block((sx * 2.42, 0.1, 3.0), X, 1.3, 1.5, 0.05, 0.0, PI, BRASS, seg=12, up=Z)
    for k in range(9):
        a = PI * (k + 0.5) / 9
        for sx in (-1, 1):
            p.rivet((sx * 2.47, 0.1 + math.cos(a) * 1.4, 3.0 + math.sin(a) * 1.4), (sx, 0, 0), 0.04, BRASS)
    p.arc_block((0, 0.1, 3.0), X, 1.38, 1.47, 0.12, 0.0, PI, BRASS, seg=12, up=Z)
    for k in range(3):
        x = -1.0 + k * 1.0
        p.turned((x, 0.1, 4.42), Z, [(0.08, -0.04), (0.08, 0.0), (0.06, 0.06)], BRASS, sides=8)
    # Bearing housing (+X) and the shaft out to the flywheel.
    p.turned((2.7, 0, 2.6), X, [(0.62, 0), (0.62, 0.22), (0.5, 0.28), (0.36, 0.34)], IRON, sides=16)
    p.box((2.85, 0, 3.15), (0.32, 0.9, 0.18), IRON, bevel=0.03)
    for sy in (-1, 1):
        p.bolt((2.85, sy * 0.36, 3.24), Z, 0.04, 0.06)
    p.cyl((2.9, 0, 2.6), (3.97, 0, 2.6), 0.24, STEEL, sides=12)
    p.turned((3.97, 0, 2.6), X, [(0.2, 0), (0.12, 0.05)], STEEL, sides=10)
    # Front: lever quadrant, gauge board, valves, hatch.
    p.arc_block((-1.6, -1.72, 2.2), NY, 0.6, 0.7, 0.03, 0.45, PI - 0.45, BRASS, seg=8, up=Z)
    for k, a in enumerate((1.1, 1.5, 2.0)):
        base = Vector((-1.6, -1.78, 2.2))
        tip = base + Vector((math.cos(a) * 0.95, -0.15, math.sin(a) * 0.95))
        p.cyl(base, tip, 0.03, IRON, sides=5)
        p.sphere(tip, 0.06, OXBLOOD, mat=PAINT, rings=3, sides=6)
    p.cyl((-1.6, -1.65, 2.2), (-1.6, -1.82, 2.2), 0.08, BRASS, sides=8)
    p.box((1.3, -1.69, 2.25), (1.3, 0.05, 0.62), BRASS, bevel=0.02)
    for k in range(3):
        p.gauge((0.88 + k * 0.42, -1.75, 2.27), NY, 0.15)
    for x in (-0.2, 2.2):
        p.cyl((x, -1.6, 1.25), (x, -1.9, 1.25), 0.07, BRASS, sides=8)
        p.handwheel((x, -1.92, 1.25), NY, 0.26)
    p.plate((0.9, -1.66, 1.2), NY, 1.0, 0.7, 0.05, STEEL_DARK, spacing=0.2, rr=0.03, inset=0.06)
    p.box((0.9, -1.72, 1.2), (0.2, 0.05, 0.08), BRASS)
    # Pipes: along the back top edge, down the +Y face.
    back = fillet([(-2.6, 1.95, 2.7), (2.2, 1.95, 2.7), (2.2, 1.95, 0.7)], 0.35)
    p.tube(back, 0.12, COPPER, sides=8)
    for x in (-1.6, 0.4):
        p.flange((x, 1.95, 2.7), X, 0.2, 0.05, BRASS, bolts=4, sides=10)
    p.cyl((-2.6, 1.95, 2.7), (-2.6, 1.95, 4.0), 0.12, COPPER, sides=8)
    p.turned((-2.6, 1.95, 4.0), Z, [(0.16, 0), (0.16, 0.1), (0.1, 0.2), (0.1, 0.42)], BRASS, sides=8)
    return p


@piece('Boiler', foot=('box', 4.0, 1.8))
def boiler():
    """A horizontal riveted boiler (X +-4, Y +-1.8, Z 0..5): brick-founded iron
    saddles, a lap-seamed shell with rivet rings, a firebox at X -4 with a
    glowing door ajar and a grate, a gauge glass and pressure gauge, a brass
    steam dome, a twin spring safety valve (steam at (-1.6, 0, 5.0)), a
    smokebox with a dished door and a short uptake at +X (smoke at
    (3.65, 0, 5.0)), and a feed pipe with a check valve."""
    p = P('Boiler', verd=0.5, rust=0.6)
    p.heat.append((Vector((-4.0, 0, 1.2)), 1.6))
    p.soot.append((Vector((3.65, 0, 5.2)), 1.2))
    p.soot.append((Vector((-4.1, 0, 1.9)), 1.0))
    cz, r = 2.05, 1.5
    for x in (-2.0, 0.4, 2.6):
        with p.as_kind(K_STONE):
            p.box((x, 0, 0.3), (0.7, 2.7, 0.6), BRICK, mat=PAINT, bevel=0.04)
        p.arc_block((x, 0, cz), X, r, r + 0.18, 0.18, PI + 0.35, TAU - 0.35, IRON, seg=6, up=Z)
        p.box((x, 0, 0.7), (0.36, 2.5, 0.2), IRON, bevel=0.02)
        for sy in (-1, 1):
            p.quad_prism([(x - 0.17, sy * 1.25, 0.8), (x - 0.17, sy * 0.6, 0.8), (x - 0.17, sy * 1.3, 1.6)], X, 0.34,
                         IRON, mat=METAL)
            p.bolt((x, sy * 1.1, 0.8), Z, 0.04, 0.05)
    prof = [(r * 0.98, -2.8), (r, -2.75)]
    for xs in (-1.25, 0.3, 1.85):
        prof += [(r, xs), (r + 0.03, xs + 0.02), (r + 0.03, xs + 0.16), (r, xs + 0.18)]
    prof += [(r, 3.35), (r * 0.98, 3.4)]
    p.turned((0, 0, cz), X, [(a, t) for (a, t) in prof], BOILER_COPPER, sides=26, up=Z)
    for xs in (-1.25, 0.3, 1.85):
        p.rivet_ring((xs + 0.09, 0, cz), X, r + 0.03, 24, 0.045, IRON, up=Z)
    p.rivets((-2.6, -0.0, cz + r + 0.01), (3.2, 0, cz + r + 0.01), Z, 0.38, 0.04, IRON)
    # Firebox (X -4 end).
    p.box((-3.4, 0, 1.75), (1.2, 3.2, 3.5), IRON, bevel=0.08)
    for x in (-3.95, -2.85):
        p.box((x, 0, 1.75), (0.1, 3.3, 3.55), IRON, bevel=0.03)
    p.rivets((-3.95, -1.66, 0.3), (-3.95, -1.66, 3.3), NY, 0.34, 0.045, IRON)
    p.rivets((-2.85, -1.66, 0.3), (-2.85, -1.66, 3.3), NY, 0.34, 0.045, IRON)
    p.box((-4.03, 0, 1.25), (0.06, 1.3, 1.0), BRASS, bevel=0.02)
    with p.as_kind(K_PLAIN):
        p.box((-4.0, 0, 1.25), (0.04, 1.0, 0.72), SOOT, mat=PAINT)
    p.box((-4.035, 0.08, 1.2), (0.02, 0.62, 0.42), MOLTEN, mat=GLOW)
    for k in range(4):
        p.box((-4.04, -0.16 + k * 0.12, 1.12), (0.03, 0.035, 0.32), SOOT_IRON)
    with p.at(T(-4.06, -0.5, 1.25) @ R('Z', 0.75)):
        p.box((0, 0.24, 0), (0.06, 0.5, 0.7), IRON, bevel=0.015)
        p.box((-0.04, 0.38, 0), (0.04, 0.12, 0.08), BRASS)
    p.box((-4.03, 0, 0.36), (0.06, 1.0, 0.3), IRON, bevel=0.02)
    p.box((-4.035, 0, 0.36), (0.02, 0.7, 0.12), EMBER, mat=GLOW)
    p.gauge((-4.1, -0.9, 2.9), (-1, 0, 0), 0.18)
    p.gauge((-2.6, -1.66, 3.05), NY, 0.16)
    p.cyl((-4.06, 0.75, 1.9), (-4.06, 0.75, 2.95), 0.05, GLASS_C, sides=8, mat=GLASS)
    for z in (1.85, 3.0):
        p.box((-4.08, 0.75, z), (0.12, 0.14, 0.12), BRASS, bevel=0.015)
        p.cyl((-4.0, 0.75, z), (-3.95, 0.75, z), 0.04, BRASS, sides=6)
    p.cyl((-4.1, 0.75, 1.85), (-4.1, 0.75, 1.62), 0.02, BRASS, sides=4)
    # Smokebox and uptake (+X).
    p.turned((3.35, 0, cz), X, [(1.56, 0), (1.56, 0.6), (1.5, 0.62)], SOOT_IRON, sides=26, up=Z)
    p.turned((3.97, 0, cz), X, [(1.3, 0), (1.15, 0.06), (0.7, 0.1)], SOOT_IRON, sides=20, up=Z)
    p.cyl((4.0, 0, cz), (4.0, 0.7, cz + 0.05), 0.04, STEEL, sides=5)
    p.rivet_ring((3.65, 0, cz), X, 1.56, 22, 0.045, IRON, up=Z)
    p.turned((3.65, 0, 3.4), Z, [(0.55, 0), (0.55, 0.12), (0.4, 0.2), (0.38, 1.3), (0.48, 1.34), (0.48, 1.5),
                                  (0.42, 1.6), (0.36, 1.6)], SOOT_IRON, sides=14, cap1=False)
    with p.as_kind(K_PLAIN):
        p.cyl((3.65, 0, 4.7), (3.65, 0, 4.72), 0.36, SOOT, sides=10, mat=PAINT, smooth=False)
    # Steam dome and safety valve.
    p.turned((0.9, 0, 3.35), Z, [(0.72, 0), (0.72, 0.1), (0.6, 0.14), (0.6, 0.62), (0.5, 0.8), (0.26, 0.9),
                                 (0.04, 0.93)], BRASS, sides=18)
    p.rivet_ring((0.9, 0, 3.4), Z, 0.72, 16, 0.04, BRASS)
    sv = Vector((-1.6, 0, 3.52))
    p.turned(sv, Z, [(0.42, 0), (0.42, 0.08), (0.3, 0.12), (0.26, 0.3)], BRASS, sides=12)
    for sx in (-1, 1):
        c = sv + Vector((sx * 0.14, 0, 0.3))
        p.turned(c, Z, [(0.09, 0), (0.11, 0.1), (0.11, 0.55), (0.08, 0.6), (0.05, 0.72)], BRASS, sides=10)
    pts = [sv + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, 0.45 + a * 0.035)) for a in
           (k * 0.5 for k in range(40))]
    p.tube(pts, 0.022, STEEL, sides=4)
    p.box(sv + Vector((0, 0, 1.15)), (0.62, 0.08, 0.06), IRON, bevel=0.01)
    p.cyl(sv + Vector((0, 0, 1.0)), sv + Vector((0, 0, 1.47)), 0.025, STEEL, sides=5)
    p.turned(sv + Vector((0, 0, 1.25)), Z, [(0.05, 0), (0.08, 0.06), (0.08, 0.18), (0.06, 0.2), (0.03, 0.23)], BRASS,
             sides=8)
    # Feed pipe with a check valve along the front.
    feed = fillet([(-2.85, -1.2, 0.9), (-2.4, -1.62, 0.9), (1.5, -1.62, 0.9), (1.9, -1.45, 1.4)], 0.3)
    p.tube(feed, 0.08, COPPER, sides=7)
    p.turned((-0.6, -1.62, 0.9), X, [(0.1, 0), (0.17, 0.08), (0.17, 0.3), (0.1, 0.38)], BRASS, sides=10)
    p.cyl((-0.41, -1.62, 1.0), (-0.41, -1.62, 1.22), 0.05, BRASS, sides=6)
    for x in (-1.6, 0.8):
        p.box((x, -1.55, 0.72), (0.08, 0.18, 0.4), IRON)
    return p


# ============================================================ walkways and rails
@piece('Catwalk', tile=2.0)
def catwalk():
    """A tiling catwalk (X -2..+2, Y +-1.2, deck top at Z 0): grating bars over
    a dark pan, channel stringers to Z -0.6, a brass-railed fence each side
    to 1.2 with half posts at the tile ends, toe plates, rivets."""
    p = P('Catwalk', rust=0.6, ground=None, grime=None, ao_dist=0.4)
    with p.as_kind(K_PLAIN):
        p.box((0, 0, -0.07), (4.0, 2.2, 0.02), SOOT, mat=PAINT)
    for k in range(14):
        x = -2.0 + (k + 0.5) * (4.0 / 14)
        p.box((x, 0, -0.025), (0.06, 2.24, 0.05), STEEL_DARK)
    for y in (-0.4, 0.4):
        p.box((0, y, -0.035), (4.0, 0.04, 0.05), STEEL_DARK)
    for sy in (-1, 1):
        p.box((0, sy * 1.15, -0.3), (4.0, 0.04, 0.6), IRON)
        p.box((0, sy * 1.08, -0.58), (4.0, 0.14, 0.04), IRON)
        p.box((0, sy * 1.08, -0.02), (4.0, 0.14, 0.04), IRON)
        for x in (-1.5, -0.5, 0.5, 1.5):
            p.rivet((x, sy * 1.175, -0.3), (0, sy, 0), 0.035, STEEL)
        p.box((0, sy * 1.12, 0.07), (4.0, 0.03, 0.14), SLATE, mat=PAINT)
        for x0, x1 in ((-2.0, -1.95), (-0.05, 0.05), (1.95, 2.0)):
            p.bx((x0, sy * 1.06 - 0.04, 0), (x1, sy * 1.06 + 0.04, 1.15), IRON)
        p.cyl((-2.0, sy * 1.06, 1.17), (2.0, sy * 1.06, 1.17), 0.04, BRASS, sides=7, cap0=False, cap1=False)
        p.box((0, sy * 1.06, 0.6), (4.0, 0.03, 0.07), IRON)
    p.box((0, 0, -0.6), (0.12, 2.3, 0.08), IRON)
    return p


@piece('CatwalkTruss', tile=2.0)
def catwalk_truss():
    """The underside of a 10 yd wide catwalk (X -2..+2, Y +-5, Z -3..-0.05): a
    flat riveted soffit plate at Z -0.35, deep edge girders, two stringers,
    and a fish-belly cross truss of angle irons and gussets down to Z -3.
    Nothing above Z -0.05."""
    p = P('CatwalkTruss', rust=0.6, ground=None, grime=None, ao_dist=0.6)
    p.box((0, 0, -0.35), (4.0, 9.8, 0.04), SLATE, mat=PAINT)
    for y in (-4.6, -1.5, 1.5, 4.6):
        p.rivets((-1.8, y, -0.375), (1.8, y, -0.375), (0, 0, -1), 0.6, 0.035, STEEL)
    for sy in (-1, 1):
        p.ibeam((-2.0, sy * 4.65, -0.95), (2.0, sy * 4.65, -0.95), 1.2, 0.3, 0.05, IRON, up=(0, sy, 0), roll=0)
        p.ibeam((-2.0, sy * 1.5, -0.6), (2.0, sy * 1.5, -0.6), 0.5, 0.22, 0.04, IRON, up=Z)
    p.box((0, 0, -0.42), (0.14, 9.0, 0.1), IRON)
    belly = [(-4.6, -1.5), (-2.3, -2.55), (0.0, -2.95), (2.3, -2.55), (4.6, -1.5)]
    for (y0, z0), (y1, z1) in zip(belly, belly[1:]):
        p.flat((0, y0, z0), (0, y1, z1), 0.16, 0.06, IRON, up=(1, 0, 0))
    for (y, z) in belly[1:-1]:
        p.flat((0, y, -0.45), (0, y, z), 0.12, 0.05, IRON, up=(1, 0, 0))
        p.box((0.05, y, z + 0.1), (0.02, 0.4, 0.3), IRON)
        p.rivet((0.07, y, z + 0.1), X, 0.035, STEEL)
    for (y0, z0), (y1, _) in (((-4.6, -0.45), (-2.3, 0)), ((-2.3, -0.45), (0.0, 0)), ((4.6, -0.45), (2.3, 0)),
                              ((2.3, -0.45), (0.0, 0))):
        zz = dict(belly)[y1]
        p.flat((0, y0, z0), (0, y1, zz), 0.1, 0.04, IRON, up=(1, 0, 0))
    return p


@piece('RailTrack', tile=1.0)
def rail_track():
    """A tiling rail track (X -1..+1, rails at Y +-1.1, rail top Z 0.22): timber
    sleepers 3.0 wide on a thin ballast bed, iron tie plates and spikes,
    flat-bottom steel rails with half fishplates at both tile ends."""
    p = P('RailTrack', rust=0.7)
    with p.as_kind(K_STONE):
        p.box((0, 0, -0.025), (2.0, 3.3, 0.05), SLAG, mat=PAINT)
    with p.as_kind(K_SOFT):
        for x in (-0.5, 0.5):
            p.box((x, 0, 0.02), (0.34, 3.0, 0.14), p.vary(TIMBER, 0.12), mat=PAINT, bevel=0.02)
    for sy in (-1, 1):
        y = sy * 1.1
        p.box((0, y, 0.105), (2.0, 0.2, 0.03), STEEL_DARK)
        p.box((0, y, 0.15), (2.0, 0.035, 0.06), STEEL_DARK)
        p.box((0, y, 0.2), (2.0, 0.09, 0.04), STEEL)
        for x in (-0.5, 0.5):
            p.box((x, y, 0.095), (0.26, 0.34, 0.02), IRON)
            for s in (-1, 1):
                p.bolt((x + s * 0.08, y + s * 0.13, 0.105), Z, 0.03, 0.03)
        for x0, x1 in ((-1.0, -0.82), (0.82, 1.0)):
            for s in (-1, 1):
                p.bx((x0, y + s * 0.02, 0.125), (x1, y + s * 0.04, 0.18), IRON)
            p.cyl(((x0 + x1) / 2, y - 0.06, 0.152), ((x0 + x1) / 2, y + 0.06, 0.152), 0.022, STEEL, sides=6)
    return p


@piece('RailBuffer', foot=('box', 0.8, 1.5))
def rail_buffer():
    """A buffer stop (X +-0.8, Y +-1.5, Z 0..1.5) across the rails at Y +-1.1:
    raking I-beam struts, an oxblood timber buffer beam with thin hazard
    stripes, and two sprung brass buffers facing -X (the track approaches
    from -X)."""
    p = P('RailBuffer', rust=0.6)
    for sy in (-1, 1):
        y = sy * 1.1
        p.box((0, y, 0.11), (1.6, 0.2, 0.22), STEEL_DARK)
        p.ibeam((0.75, y, 0.25), (-0.35, y, 1.0), 0.22, 0.16, 0.03, IRON, up=(1, 0, 1))
        p.ibeam((-0.35, y, 0.22), (-0.35, y, 1.0), 0.2, 0.16, 0.03, IRON, up=(1, 0, 0))
        p.box((0.75, y, 0.25), (0.3, 0.3, 0.06), IRON)
    with p.as_kind(K_SOFT):
        p.box((-0.5, 0, 0.95), (0.34, 3.0, 0.5), OXBLOOD, mat=PAINT, bevel=0.03)
    p.stripes((-0.671, -1.5, 0.74), Y, Z, (-1, 0, 0), 3.0, 0.42, pitch=0.42, slant=0.9)
    p.box((-0.5, 0, 1.22), (0.38, 3.04, 0.04), IRON)
    p.box((-0.5, 0, 0.68), (0.38, 3.04, 0.04), IRON)
    for sy in (-1, 1):
        y = sy * 1.1
        p.turned((-0.67, y, 0.95), (-1, 0, 0), [(0.18, 0), (0.18, 0.04), (0.11, 0.06), (0.11, 0.28)], IRON, sides=10)
        p.turned((-0.92, y, 0.95), (-1, 0, 0), [(0.08, 0), (0.08, 0.04)], STEEL, sides=8)
        p.turned((-0.95, y, 0.95), (-1, 0, 0), [(0.08, -0.01), (0.15, 0.0), (0.16, 0.04), (0.14, 0.06),
                                                 (0.05, 0.08)], BRASS, sides=12)
        for k in range(4):
            a = TAU * k / 4 + PI / 4
            p.bolt((-0.68, y + math.cos(a) * 0.13, 0.95 + math.sin(a) * 0.13), (-1, 0, 0), 0.025, 0.03)
    return p


# ================================================================== yard props
@piece('IngotStack', foot=('box', 1.0, 0.7), knee=1.1)
def ingot_stack():
    """Brass ingots in cross-hatched layers on a timber pallet (knee high, X +-1,
    Y +-0.7), two steel bands round the stack."""
    p = P('IngotStack', verd=0.55)
    with p.as_kind(K_SOFT):
        for y in (-0.55, 0.0, 0.55):
            p.box((0, y, 0.06), (1.9, 0.18, 0.12), TIMBER_DARK, mat=PAINT)
        for k in range(7):
            p.box((-0.84 + k * 0.28, 0, 0.15), (0.22, 1.36, 0.05), p.vary(TIMBER, 0.12), mat=PAINT, bevel=0.01)
    z = 0.175
    for layer in range(5):
        along_x = layer % 2 == 0
        n = 5 if along_x else 6
        for k in range(n):
            c = p.vary(BRASS, 0.08)
            if along_x:
                y = -0.52 + k * (1.04 / (n - 1))
                p.box((0, y, z + 0.08), (1.62, 0.2, 0.16), c, taper=0.86)
                p.box((-0.82 + 0.03, y, z + 0.08), (0.04, 0.2, 0.16), c, taper=0.86)
            else:
                x = -0.75 + k * (1.5 / (n - 1))
                p.box((x, 0, z + 0.08), (0.22, 1.2, 0.16), c, taper=0.86)
        z += 0.165
    for x in (-0.45, 0.45):
        p.box((x, -0.62, (0.15 + z) / 2), (0.08, 0.012, z - 0.15), STEEL)
        p.box((x, 0.62, (0.15 + z) / 2), (0.08, 0.012, z - 0.15), STEEL)
        p.box((x, 0, z + 0.006), (0.08, 1.25, 0.012), STEEL)
        p.box((x, -0.63, z - 0.15), (0.12, 0.03, 0.08), STEEL_DARK)
    return p


@piece('Workbench', foot=('box', 1.6, 0.6), knee=1.5)
def workbench():
    """A heavy fitter's bench (knee high, X +-1.6, Y +-0.6): a plank top on iron
    legs with a lower shelf, a vice on the right, a hammer, a spanner, a file,
    gears and bolts, an oilcan, a drawer, and a small arm lamp (warm glow)."""
    p = P('Workbench', rust=0.55, verd=0.5)
    with p.as_kind(K_SOFT):
        for k in range(5):
            p.box((0, -0.48 + k * 0.24, 0.92), (3.2, 0.23, 0.1), p.vary(TIMBER, 0.12), mat=PAINT, bevel=0.012)
        for k in range(3):
            p.box((0, -0.3 + k * 0.3, 0.25), (2.9, 0.28, 0.05), p.vary(TIMBER_DARK, 0.1), mat=PAINT, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.lbeam((sx * 1.48, sy * 0.48, 0), (sx * 1.48, sy * 0.48, 0.87), 0.1, 0.02, IRON,
                    roll=(PI if sx > 0 else 0) + (0 if sy < 0 else 0))
            p.box((sx * 1.48, sy * 0.48, 0.02), (0.16, 0.16, 0.04), IRON)
        p.box((sx * 1.48, 0, 0.22), (0.05, 1.0, 0.06), IRON)
    p.box((0, -0.5, 0.8), (3.0, 0.04, 0.1), IRON)
    p.box((-0.6, -0.48, 0.78), (0.7, 0.08, 0.16), TIMBER_DARK, mat=PAINT, bevel=0.01)
    p.box((-0.6, -0.53, 0.78), (0.12, 0.03, 0.04), BRASS)
    # Vice (+X front).
    p.box((1.15, -0.5, 1.04), (0.34, 0.24, 0.14), SLATE, mat=PAINT, bevel=0.02)
    p.box((1.15, -0.66, 1.06), (0.32, 0.1, 0.18), SLATE, mat=PAINT, bevel=0.02)
    p.box((1.15, -0.6, 1.17), (0.3, 0.05, 0.05), STEEL)
    p.cyl((1.15, -0.72, 1.04), (1.15, -0.95, 1.04), 0.03, STEEL, sides=6)
    p.cyl((1.0, -0.95, 1.04), (1.3, -0.95, 1.04), 0.015, STEEL, sides=4)
    # Tools and parts.
    p.cyl((0.2, -0.2, 0.99), (0.55, -0.32, 0.99), 0.025, TIMBER, sides=5, mat=PAINT)
    p.box((0.58, -0.33, 0.99), (0.08, 0.2, 0.07), STEEL_DARK, rot=(0, 0, -0.33))
    p.box((-0.2, 0.1, 0.98), (0.45, 0.06, 0.02), STEEL, rot=(0, 0, 0.4))
    p.torus((-0.43, 0.0, 0.98), Z, 0.04, 0.015, STEEL, seg=6, sides=3)
    p.box((0.3, 0.25, 0.975), (0.38, 0.04, 0.015), STEEL_DARK, rot=(0, 0, -0.2))
    for (x, y, rr) in ((-1.1, 0.15, 0.16), (-0.8, 0.3, 0.1)):
        p.cyl((x, y, 0.97), (x, y, 1.02), rr, BRASS, sides=10, smooth=False)
        p.cyl((x, y, 1.02), (x, y, 1.03), rr * 0.4, BRASS_DARK, sides=8, smooth=False)
        for k in range(8):
            a = TAU * k / 8
            p.box((x + math.cos(a) * rr, y + math.sin(a) * rr, 0.995), (0.04, 0.035, 0.05), BRASS, rot=(0, 0, a))
    for k in range(4):
        p.cyl((-0.3 + k * 0.07, -0.3, 0.97), (-0.3 + k * 0.07, -0.3, 1.0), 0.02, STEEL, sides=6, smooth=False)
    p.turned((0.75, 0.3, 0.97), Z, [(0.1, 0), (0.1, 0.12), (0.05, 0.18), (0.015, 0.34)], BRASS, sides=8)
    # Arm lamp (back left).
    p.turned((-1.3, 0.4, 0.97), Z, [(0.1, 0), (0.1, 0.03), (0.03, 0.05)], IRON, sides=8)
    p.tube([(-1.3, 0.4, 1.0), (-1.3, 0.42, 1.3), (-1.15, 0.3, 1.4)], 0.018, BRASS, sides=4)
    p.turned((-1.08, 0.24, 1.25), Z, [(0.14, 0.0), (0.13, 0.04), (0.05, 0.16), (0.03, 0.19)], BRASS, sides=10,
             cap0=False)
    p.sphere((-1.08, 0.24, 1.3), 0.05, BULB, mat=GLOW, rings=3, sides=6)
    return p


@piece('Sandbags', tile=1.5, knee=1.1)
def sandbags():
    """A tiling sandbag wall (X -1.5..+1.5, Y +-0.6, knee high): three courses of
    tied canvas bags, the top course bonded over the joints."""
    p = P('Sandbags', ao_dist=0.6)
    for y in (-0.27, 0.27):
        for k, x in enumerate((-1.0, 0.0, 1.0)):
            p.pillow((x, y, 0.17), (1.0, 0.56, 0.34), p.vary(CANVAS, 0.1), yaw=(k - 1) * 0.04 + y * 0.1)
    for k, x in enumerate((-1.0, 0.0, 1.0)):
        p.pillow((x + (0.06 if k == 1 else 0), 0.0, 0.48), (0.99, 0.6, 0.32), p.vary(CANVAS, 0.1), yaw=0.05 - k * 0.04)
    for k, x in enumerate((-0.5, 0.5)):
        p.pillow((x, -0.04, 0.78), (0.98, 0.58, 0.3), p.vary(CANVAS, 0.1), yaw=0.03 * (k * 2 - 1), roll=0.04)
    return p


def mini_gear(p, c, axis, r, teeth, color, thick=0.08, up=None):
    """A cheap toothed gear (scrap, belts, benches)."""
    d = Vector(axis).normalized()
    p.turned(Vector(c) - d * thick / 2, d, [(r * 0.25, 0), (r * 0.82, 0), (r * 0.82, thick), (r * 0.25, thick)], color,
             sides=max(8, teeth), smooth=False, up=up)
    m = basis(d, up)
    for k in range(teeth):
        a = TAU * k / teeth
        rd = (m @ Vector((math.cos(a), math.sin(a), 0, 0))).to_3d()
        tg = d.cross(rd)
        cc = Vector(c) + rd * r * 0.9
        with p.at(Matrix.Translation(cc) @ Matrix((tg, rd, d)).transposed().to_4x4()):
            p.box((0, 0, 0), (r * 0.22, r * 0.22, thick), color, taper=0.7)


@piece('ScrapHeap', foot=('circle', 1.6))
def scrap_heap():
    """A heap of foundry scrap (within r 1.6, Z 0..2.2): a slag and rubble
    mound, broken gears, bent plates, pipe offcuts, a spring, and a broken
    brass automaton hand reaching out of the top."""
    p = P('ScrapHeap', rust=0.9, verd=0.7)
    with p.as_kind(K_STONE):
        p.rockish((0, 0, 0.25), (2.6, 2.3, 0.9), SLAG, jitter=0.25, subdivisions=2, flat_bottom=True)
        p.rockish((0.2, 0.2, 0.6), (1.6, 1.5, 0.9), ORE, jitter=0.25, subdivisions=1, flat_bottom=True)
    mini_gear(p, (-0.6, -0.5, 0.75), (0.3, -0.6, 1), 0.6, 12, BRASS)
    mini_gear(p, (0.7, -0.3, 0.6), (-0.5, -0.2, 1), 0.45, 10, IRON)
    mini_gear(p, (0.1, 0.6, 1.1), (0.2, 0.9, 0.4), 0.5, 11, COPPER)
    p.box((-0.2, -0.9, 0.35), (1.1, 0.06, 0.6), SLATE, mat=PAINT, rot=(0.6, 0.3, 0.2), bevel=0.01)
    p.box((0.8, 0.5, 0.6), (0.9, 0.05, 0.7), IRON, rot=(-0.4, 0.5, 0.9), bevel=0.01)
    p.rivets((0.45, 0.25, 0.85), (1.1, 0.75, 0.45), (0.3, -0.6, 0.5), 0.2, 0.035, IRON)
    p.cyl((-1.1, 0.3, 0.3), (-0.2, 0.9, 0.9), 0.14, COPPER, sides=8)
    p.flange((-1.1, 0.3, 0.3), (0.9, 0.6, 0.6), 0.22, 0.05, BRASS, bolts=4, sides=10)
    p.cyl((0.9, -0.9, 0.2), (1.3, 0.1, 0.35), 0.1, IRON, sides=7)
    pts = [Vector((-0.8 + math.cos(a) * 0.15, -0.1 + math.sin(a) * 0.15, 0.95 + a * 0.03)) for a in
           (k * 0.6 for k in range(24))]
    p.tube(pts, 0.025, STEEL, sides=4)
    # The automaton hand, palm up out of the heap, fingers curled.
    with p.at(T(0.15, 0.05, 1.45) @ R('X', -0.35) @ R('Y', 0.25)):
        p.box((0, 0, 0), (0.42, 0.18, 0.46), BRASS, bevel=0.04)
        p.cyl((0, 0, -0.4), (0, 0, -0.18), 0.13, BRASS, sides=8)
        p.torus((0, 0, -0.2), Z, 0.14, 0.03, IRON, seg=10, sides=4)
        for k in range(4):
            x = -0.15 + k * 0.1
            pts = [Vector((x, 0, 0.22)), Vector((x, -0.02, 0.42 - abs(k - 1.5) * 0.04)),
                   Vector((x, -0.12, 0.58 - abs(k - 1.5) * 0.05)), Vector((x, -0.24, 0.6 - abs(k - 1.5) * 0.05))]
            p.tube(pts, 0.04, BRASS, sides=5)
            for q in pts[1:3]:
                p.sphere(q - Vector((0, 0, 0.045)), 0.045, BRASS_DARK, rings=3, sides=6)
        p.tube([Vector((0.22, 0, 0.0)), Vector((0.3, -0.08, 0.15)), Vector((0.28, -0.18, 0.28))], 0.045, BRASS,
               sides=5)
    return p


@piece('OreSeam', foot=('box', 1.6, 1.0))
def ore_seam():
    """A rock outcrop with brass-ore veins (X +-1.6, Y +-1, Z 0..2.6), front -Y
    where a miner stands: fractured slate rock, raised metal veins, pick
    scars, broken chips at the foot and a dim warm glow in a crack."""
    p = P('OreSeam', verd=0.8)
    with p.as_kind(K_STONE):
        p.rockish((0, 0.15, 0.9), (3.1, 1.8, 2.0), STONE, jitter=0.18, subdivisions=2, flat_bottom=True)
        p.rockish((-0.7, 0.1, 1.9), (1.4, 1.3, 1.4), STONE_LIGHT, jitter=0.2, subdivisions=1)
        p.rockish((0.75, 0.05, 1.55), (1.3, 1.3, 1.6), STONE, jitter=0.2, subdivisions=1)
        p.rockish((0.2, 0.3, 2.15), (1.1, 1.0, 0.9), STONE, jitter=0.22, subdivisions=1)
        for k in range(5):
            a = PI + 0.3 + k * 0.5
            p.rockish((math.cos(a) * 1.25 * 0.9, -0.85 + k * 0.05, 0.08), (0.28, 0.22, 0.16), STONE_LIGHT, jitter=0.3,
                      subdivisions=1)
    for (pts, rr) in (([(-1.35, -0.6, 0.5), (-0.6, -0.78, 1.0), (0.2, -0.78, 1.2), (1.1, -0.6, 1.8)], 0.07),
                      ([(-0.9, -0.62, 1.95), (-0.3, -0.72, 1.6), (0.4, -0.75, 0.7), (0.9, -0.62, 0.45)], 0.055),
                      ([(0.1, -0.7, 2.3), (0.35, -0.74, 1.9), (0.7, -0.72, 1.55)], 0.045)):
        p.tube([Vector(q) for q in pts], rr, BRASS, sides=5, squash=0.6)
        for q in pts[1:-1]:
            p.rockish(q, (0.16, 0.12, 0.14), BRASS, jitter=0.3, subdivisions=1, mat=METAL)
    with p.as_kind(K_PLAIN):
        p.quad_prism([(-0.25, -0.8, 0.55), (-0.08, -0.82, 0.62), (0.05, -0.78, 1.05), (-0.1, -0.78, 1.1)], NY, 0.01,
                     EMBER, mat=GLOW, sides=False)
        for (x, z) in ((-0.9, 1.3), (0.5, 1.1), (0.2, 0.55), (-0.4, 1.75)):
            p.quad_prism([(x - 0.1, -0.84, z), (x + 0.1, -0.84, z + 0.04), (x + 0.08, -0.84, z + 0.09),
                          (x - 0.12, -0.84, z + 0.05)], NY, 0.01, SOOT, mat=PAINT, sides=False)
    return p


@piece('ChainPost', foot=('circle', 0.35))
def chain_post():
    """An iron anchor bollard (r 0.35, 1.5 tall) with a ring at its head and two
    heavy linked chains lying out across the ground to r 2."""
    p = P('ChainPost', rust=0.85)
    p.turned((0, 0, 0), Z, [(0.38, 0), (0.38, 0.08), (0.3, 0.12), (0.26, 0.3), (0.24, 1.15), (0.3, 1.2),
                            (0.32, 1.3), (0.28, 1.42), (0.15, 1.5)], IRON, sides=14)
    p.band((0, 0, 0.7), Z, 0.25, 0.1, BRASS, sides=14)
    for k in range(6):
        a = TAU * k / 6
        p.bolt((math.cos(a) * 0.33, math.sin(a) * 0.33, 0.1), Z, 0.035, 0.04)
    p.torus((0, -0.33, 1.05), Y, 0.13, 0.035, IRON, seg=10, sides=4)
    p.cyl((0, -0.22, 1.05), (0, -0.29, 1.05), 0.06, IRON, sides=6)
    p.chain([(0, -0.38, 0.95), (0.05, -0.55, 0.4), (0.3, -0.85, 0.07), (0.9, -1.2, 0.07), (1.4, -1.0, 0.07),
             (1.75, -0.6, 0.07)], link=0.3, w=0.18, r=0.04, color=IRON)
    p.chain([(0.3, 0.0, 0.07), (0.8, 0.5, 0.07), (0.6, 1.2, 0.07), (-0.2, 1.55, 0.07), (-0.9, 1.4, 0.07)],
            link=0.3, w=0.18, r=0.04, color=IRON)
    return p


@piece('ScrapCart', foot=('box', 0.7, 1.1))
def scrap_cart():
    """A two-wheeled hand cart of scrap (X +-0.7, Y +-1.1, Z 0..1.5): a riveted
    iron tub on a timber frame, spoked wheels, handles toward +Y, a prop leg,
    a load of gears, plates and pipe."""
    p = P('ScrapCart', rust=0.75, verd=0.6)
    for sx in (-1, 1):
        x = sx * 0.6
        p.torus((x, -0.2, 0.42), X, 0.38, 0.04, IRON, seg=16, sides=4)
        p.turned((x - sx * 0.05, -0.2, 0.42), (sx, 0, 0), [(0.08, 0), (0.08, 0.12)], IRON, sides=8)
        for k in range(6):
            a = TAU * k / 6
            p.cyl((x, -0.2, 0.42), (x, -0.2 + math.cos(a) * 0.36, 0.42 + math.sin(a) * 0.36), 0.02, IRON, sides=4)
    p.cyl((-0.62, -0.2, 0.42), (0.62, -0.2, 0.42), 0.035, STEEL, sides=6)
    with p.as_kind(K_SOFT):
        for sx in (-1, 1):
            p.flat((sx * 0.42, -0.9, 0.62), (sx * 0.42, 1.08, 0.86), 0.08, 0.08, TIMBER, up=Z, mat=PAINT)
            p.cyl((sx * 0.42, 0.95, 0.85), (sx * 0.42, 1.1, 0.87), 0.04, TIMBER_DARK, sides=6, mat=PAINT)
    p.flat((0.0, 0.6, 0.0), (0.0, 0.55, 0.7), 0.08, 0.05, IRON, up=(0, -1, 0))
    p.box((0, -0.2, 0.92), (1.0, 1.4, 0.5), IRON, taper=1.1, taper_y=1.08)
    with p.as_kind(K_PLAIN):
        p.box((0, -0.2, 1.17), (1.0, 1.42, 0.02), SOOT, mat=PAINT)
    for sy in (-1, 1):
        p.rivets((-0.48, -0.2 + sy * 0.725, 1.12), (0.48, -0.2 + sy * 0.725, 1.12), (0, sy, 0), 0.2, 0.03, STEEL)
    mini_gear(p, (0.15, -0.4, 1.22), (0.2, 0.3, 1), 0.3, 9, BRASS)
    mini_gear(p, (-0.2, 0.1, 1.25), (0.5, -0.3, 1), 0.24, 8, COPPER)
    p.box((-0.15, -0.6, 1.3), (0.5, 0.04, 0.35), SLATE, mat=PAINT, rot=(0.3, 0.2, 0.4))
    p.cyl((0.3, 0.2, 1.2), (-0.25, -0.75, 1.42), 0.07, COPPER, sides=6)
    return p


# ============================================================ structural helpers
def washer(p, c, axis, r0, r1, thick, color, mat=PAINT, sides=16, up=None):
    """A flat ring (or a disc when r0 is tiny) as a closed thin shell: decals,
    painted target rings, deck plates."""
    m = Matrix.Translation(Vector(c)) @ basis(axis, up)
    rings = [[m @ Vector((math.cos(TAU * i / sides) * rr, math.sin(TAU * i / sides) * rr, zz))
              for i in range(sides)] for (rr, zz) in ((max(r0, 1e-3), 0), (r1, 0), (r1, thick), (max(r0, 1e-3), thick))]
    return p.grid(rings, color, mat, smooth=False, closed=True)


def chevron_ring(p, c, r, z0, z1, n=16, slant=0.6):
    """A thin hazard chevron band round a column."""
    c = Vector(c)
    for k in range(n):
        a0, a1 = TAU * k / n, TAU * (k + 1) / n
        s = slant * TAU / n
        pts = [c + Vector((math.cos(a) * r, math.sin(a) * r, z)) for (a, z) in
               ((a0, z0), (a1, z0), (a1 + s, z1), (a0 + s, z1))]
        am = (a0 + a1 + s) / 2
        p.quad_prism(pts, (math.cos(am), math.sin(am), 0), 0.012, HAZARD if k % 2 == 0 else HAZARD_BLACK,
                     sides=False)


LEG_ROLL = {(1, 1): 0.0, (-1, -1): PI, (1, -1): -PI / 2, (-1, 1): PI / 2}


def lattice_tower(p, cx, cy, z0, z1, hw, bay, color, leg=0.2, brace=0.12, t=0.03, hw1=None, rivets=True,
                  cross=True, hy=None, hy1=None, skip_faces=()):
    """A lattice tower: four angle-iron legs (heels out), a ring of struts at
    every level and diagonal flats in every bay, rivets at the joints."""
    hw1 = hw if hw1 is None else hw1
    hy = hw if hy is None else hy
    hy1 = hy if hy1 is None else hy1
    span = z1 - z0

    def corner(sx, sy, z):
        f = (z - z0) / span
        return Vector((cx + sx * (hw + (hw1 - hw) * f), cy + sy * (hy + (hy1 - hy) * f), z))

    for (sx, sy), roll in LEG_ROLL.items():
        p.lbeam(corner(sx, sy, z0), corner(sx, sy, z1), leg, t, color, roll=roll)
    n = max(1, int(round(span / bay)))
    faces = (((-1, -1), (1, -1), (0, -1, 0)), ((1, -1), (1, 1), (1, 0, 0)),
             ((1, 1), (-1, 1), (0, 1, 0)), ((-1, 1), (-1, -1), (-1, 0, 0)))
    for i in range(n + 1):
        z = z0 + span * i / n
        for fi, (a, b, nrm) in enumerate(faces):
            if fi in skip_faces:
                continue
            pa, pb = corner(*a, z), corner(*b, z)
            off = Vector(nrm) * 0.01
            zz = Vector((0, 0, -brace / 2 if i == n else brace / 2 if i == 0 else 0))
            p.flat(pa + off + zz, pb + off + zz, brace, t, color, up=nrm)
            if rivets:
                d = (pb - pa).normalized()
                p.rivet(pa + d * leg * 0.5 + off + zz + Vector(nrm) * t / 2, nrm, 0.04, STEEL)
                p.rivet(pb - d * leg * 0.5 + off + zz + Vector(nrm) * t / 2, nrm, 0.04, STEEL)
            if i < n:
                z2 = z0 + span * (i + 1) / n
                qa, qb = corner(*a, z2), corner(*b, z2)
                if cross:
                    p.flat(pa + off, qb + off, brace * 0.8, t * 0.8, color, up=nrm)
                    p.flat(pb + off * 2.5, qa + off * 2.5, brace * 0.8, t * 0.8, color, up=nrm)
                elif (i + fi) % 2:
                    p.flat(pa + off, qb + off, brace * 0.85, t, color, up=nrm)
                else:
                    p.flat(pb + off, qa + off, brace * 0.85, t, color, up=nrm)


def ladder(p, a, b, nrm, width=0.5, rung=0.42, color=IRON, r=0.022):
    """A ladder from a to b standing off a surface whose normal is nrm."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector(nrm)).normalized() * (width / 2)
    for s in (-1, 1):
        p.flat(a + side * s, b + side * s, 0.07, 0.025, color, up=side.normalized())
    n = max(1, int((b - a).length / rung))
    for i in range(n):
        q = a + d * ((i + 0.5) * (b - a).length / n)
        p.cyl(q - side, q + side, r, color, sides=4, smooth=False)


def hook(p, top, scale=1.0, color=IRON, latch=True):
    """A forged crane hook hanging from `top` (its shank's top), bowl toward -X."""
    top = Vector(top)
    k = scale
    path = [(0, 0.0), (0, -0.2), (0.12, -0.32), (0.3, -0.47), (0.33, -0.64), (0.2, -0.82), (0, -0.9)]
    path2 = [(0, -0.9), (-0.2, -0.82), (-0.32, -0.64), (-0.3, -0.46), (-0.22, -0.34)]
    p.tube([top + Vector((x * k, 0, z * k)) for (x, z) in path], 0.1 * k, color, sides=7, r1=0.14 * k)
    p.tube([top + Vector((x * k, 0, z * k)) for (x, z) in path2], 0.14 * k, color, sides=7, r1=0.045 * k)
    if latch:
        p.flat(top + Vector((0.02 * k, 0, -0.22 * k)), top + Vector((-0.24 * k, 0, -0.38 * k)), 0.04 * k, 0.015 * k,
               STEEL, up=(0, 1, 0))


# ======================================================================= edges
@piece('MachineLip', tile=2.0, knee=0.35)
def machine_lip():
    """The machine-floor retaining fascia (tiles along X, outer face at Y -0.3,
    Z -8..0.35): a kerb with a thin hazard band, lapped riveted plates, two
    buttress ribs that deepen toward the foot, a copper pipe run at Z -1.5 on
    brackets, a vent grille and a small warm porthole."""
    p = P('MachineLip', rust=0.7, verd=0.6, ground=None, grime=None, ao_dist=0.8)
    p.box((0, 0, 0.025), (4.0, 0.6, 0.65), IRON)
    p.stripes((-2.0, -0.3005, 0.2), X, Z, NY, 4.0, 0.12, pitch=0.36, slant=1.0)
    p.box((0, -0.24, -4.15), (4.0, 0.12, 7.7), IRON)
    for z in (-2.7, -5.4):
        p.box((0, -0.32, z), (4.0, 0.06, 0.34), IRON)
        for k in range(5):
            p.rivet((-1.6 + k * 0.8, -0.35, z), NY, 0.045, BRASS)
    for x in (-1.0, 1.0):
        p.quad_prism([(x - 0.11, -0.3, -0.9), (x - 0.11, -0.55, -1.2), (x - 0.11, -1.45, -8.0),
                      (x - 0.11, -0.3, -8.0)], X, 0.22, IRON, mat=METAL)
    p.cyl((-2.0, -0.62, -1.5), (2.0, -0.62, -1.5), 0.2, COPPER, sides=8, cap0=False, cap1=False)
    p.turned((-0.06, -0.62, -1.5), X, [(0.3, 0), (0.3, 0.12)], BRASS, sides=8)
    for x in (-1.0, 1.0):
        p.box((x, -0.5, -1.74), (0.1, 0.5, 0.08), IRON)
    with p.as_kind(K_PLAIN):
        p.box((0.0, -0.305, -3.9), (1.1, 0.02, 0.8), SOOT, mat=PAINT)
    for k in range(5):
        p.box((0.0, -0.33, -4.22 + k * 0.16), (1.2, 0.06, 0.06), IRON, rot=(0.5, 0, 0))
    p.turned((0.0, -0.3, -6.6), NY, [(0.34, 0), (0.46, 0.02), (0.46, 0.1), (0.36, 0.12)], BRASS, sides=10, cap0=False,
             cap1=False)
    p.cyl((0.0, -0.33, -6.6), (0.0, -0.34, -6.6), 0.35, WINDOW, sides=10, mat=GLOW, smooth=False, cap0=False)
    return p


@piece('PipeEdge', tile=2.0, knee=0.9)
def pipe_edge():
    """A kerb carrying pipes along a lip (tiles along X, Y +-0.5, Z -6..0.9):
    three pipes on bracket stands (a flanged copper main, two smaller lines,
    one valve), rough rock under the kerb and riveted patch plates."""
    p = P('PipeEdge', rust=0.7, verd=0.7, ground=None, grime=None, ao_dist=0.7)
    p.box((0, 0, 0.1), (4.0, 1.0, 0.24), IRON)
    p.cyl((-2.0, -0.12, 0.62), (2.0, -0.12, 0.62), 0.24, COPPER, sides=9, cap0=False, cap1=False)
    p.turned((-0.07, -0.12, 0.62), X, [(0.34, 0), (0.34, 0.14)], BRASS, sides=9)
    p.cyl((-2.0, 0.3, 0.46), (2.0, 0.3, 0.46), 0.13, IRON, sides=7, cap0=False, cap1=False)
    p.cyl((-2.0, -0.4, 0.34), (2.0, -0.4, 0.34), 0.09, COPPER, sides=6, cap0=False, cap1=False)
    for x in (-1.0, 1.0):
        p.box((x, -0.02, 0.3), (0.12, 0.9, 0.12), IRON)
        p.box((x, -0.12, 0.33), (0.16, 0.5, 0.1), IRON)
        p.box((x, 0.3, 0.27), (0.14, 0.28, 0.14), IRON)
    p.cyl((0.6, 0.3, 0.46), (0.6, 0.3, 0.76), 0.035, STEEL, sides=5)
    p.handwheel((0.6, 0.3, 0.78), Z, 0.15)
    # Rough rock under the kerb: a closed slab whose face is noise-displaced,
    # identical at X -2 and +2 so tiles join.
    rows = (0.0, -0.9, -1.9, -3.0, -4.1, -5.1, -6.0)
    rings = []
    for z in rows:
        ring = []
        for k, x in enumerate((-2.0, -1.0, 0.0, 1.0, 2.0)):
            xs = x if abs(x) < 1.99 else 2.0
            bulge = 0.12 + 0.3 * _fbm(xs * 0.9 + 3.0, 1.7, z * 0.7) + (0.0 if z == 0.0 else 0.08 * (k % 2))
            if z == 0.0:
                bulge = 0.0
            ring.append((x, -0.5 + 0.2 - bulge if z != 0.0 else -0.5, z))
        ring += [(2.0, 0.5, z), (-2.0, 0.5, z)]
        rings.append(ring)
    with p.as_kind(K_STONE):
        p.grid(rings, STONE, PAINT, smooth=False)
    for (x, z, w, h) in ((-0.9, -1.6, 1.1, 0.9), (0.8, -3.9, 1.3, 1.0)):
        p.box((x, -0.62, z), (w, 0.06, h), IRON if z < -3 else SLATE, mat=METAL if z < -3 else PAINT,
              rot=(0.06, 0, 0.05))
        for sx in (-1, 1):
            for sz in (-1, 1):
                p.rivet((x + sx * (w / 2 - 0.12), -0.66, z + sz * (h / 2 - 0.12)), NY, 0.045, BRASS)
    return p


@piece('TowerPanel', tile=2.0, knee=0.35)
def tower_panel():
    """The Coil Crown tower's cladding (tiles along X, outer face Y -0.3, Z
    -36..0.35): ribbed iron panels, brass bands with rivets every 8 yd,
    portholes with a small dim storm glow, a cable conduit on clamps."""
    p = P('TowerPanel', rust=0.6, verd=0.6, ground=None, grime=None, ao_dist=1.0)
    p.box((0, 0, 0.025), (4.0, 0.6, 0.65), IRON)
    p.box((0, -0.22, -18.15), (4.0, 0.12, 35.7), IRON)
    for x in (-4 / 3, 0.0, 4 / 3):
        p.box((x, -0.33, -18.2), (0.16, 0.14, 35.6), IRON)
    for k, x in enumerate((-2 / 3, 2 / 3)):
        for j in range(4):
            z = -4.0 - 8.0 * j - (2.0 if k else -2.0)
            p.box((x, -0.295, z), (1.0, 0.05, 3.4), SLATE if (j + k) % 2 else IRON, mat=PAINT if (j + k) % 2 else METAL)
    for j in range(5):
        z = -1.0 - 8.0 * j
        p.box((0, -0.4, z), (4.0, 0.06, 0.4), BRASS)
        for i in range(5):
            p.rivet((-1.6 + i * 0.8, -0.43, z), NY, 0.05, BRASS)
    for (x, z) in ((-2 / 3, -13.0), (2 / 3, -29.0)):
        p.turned((x, -0.32, z), NY, [(0.3, 0), (0.42, 0.02), (0.42, 0.1), (0.32, 0.12)], BRASS, sides=8, cap0=False,
                 cap1=False)
        p.cyl((x, -0.35, z), (x, -0.36, z), 0.31, STORM_DIM, sides=8, mat=GLOW, smooth=False, cap0=False)
    p.cyl((1.72, -0.46, -35.9), (1.72, -0.46, -0.3), 0.07, COPPER, sides=5, cap0=False, cap1=False)
    for z in (-5.0, -15.0, -25.0, -33.0):
        p.box((1.72, -0.42, z), (0.22, 0.14, 0.1), IRON)
    return p


# ================================================================ the pour line
@piece('Ladle')
def ladle():
    """The tipping crucible ladle (origin at the trunnion pivot, it tips about X;
    bucket r 1.3 from Z -3.2 to -0.6): a riveted, banded iron crucible with a
    firebrick lining and a pouring lip toward -Y, molten glow at Z -0.8,
    trunnion straps up to the pins at Z 0, a tipping yoke arching to Z 1.6,
    and a brass worm wheel with a handwheel on the +X trunnion."""
    p = P('Ladle', rust=0.7, verd=0.5, ground=None, grime=None, ao_dist=0.9)
    p.heat.append((Vector((0, 0, -0.7)), 2.2))
    p.soot.append((Vector((0, -1.5, -0.6)), 0.9))
    prof = [(0.5, -3.2), (0.92, -3.2), (1.0, -3.1), (1.08, -2.4), (1.11, -2.38), (1.11, -2.2), (1.1, -2.18),
            (1.2, -1.3), (1.23, -1.28), (1.23, -1.1), (1.22, -1.08), (1.27, -0.75), (1.3, -0.72), (1.3, -0.6),
            (1.16, -0.6), (1.14, -0.8)]
    p.turned((0, 0, 0), Z, prof, IRON, sides=22, cap1=False)
    p.rivet_ring((0, 0, -2.29), Z, 1.11, 18, 0.045, IRON)
    p.rivet_ring((0, 0, -1.19), Z, 1.23, 20, 0.045, IRON)
    with p.as_kind(K_STONE):
        washer(p, (0, 0, -0.62), Z, 1.02, 1.17, 0.03, BRICK, sides=22)
    p.cyl((0, 0, -0.84), (0, 0, -0.8), 1.15, MOLTEN, sides=22, mat=GLOW, smooth=False, cap0=False)
    washer(p, (0, 0, -0.795), Z, 0.0, 0.5, 0.004, MOLTEN_HOT, mat=GLOW, sides=12)
    with p.as_kind(K_STONE):
        for a in (0.7, 2.2, 3.6, 5.2):
            p.rockish((math.cos(a) * 0.95, math.sin(a) * 0.95, -0.78), (0.4, 0.3, 0.08), SLAG, jitter=0.3,
                      subdivisions=1)
    # Pouring lip (-Y).
    p.quad_prism([(-0.36, -1.18, -0.6), (0.36, -1.18, -0.6), (0.16, -1.72, -0.66), (-0.16, -1.72, -0.66)],
                 (0, 0, -1), 0.1, IRON, mat=METAL)
    for s in (-1, 1):
        p.quad_prism([(s * 0.36, -1.15, -0.6), (s * 0.16, -1.72, -0.66), (s * 0.16, -1.72, -0.5),
                      (s * 0.36, -1.15, -0.42)], (s, 0, 0), 0.05, IRON, mat=METAL)
    washer(p, (0, -1.4, -0.59), Z, 0.0, 0.14, 0.004, MOLTEN, mat=GLOW, sides=6)
    # Trunnion band, straps and pins.
    p.band((0, 0, -1.7), Z, 1.16, 0.3, IRON, rivets=16, sides=22, lip=0.06)
    for s in (-1, 1):
        p.box((s * 1.36, 0, -0.85), (0.1, 0.5, 1.95), IRON, bevel=0.02)
        p.rivets((s * 1.42, -0.15, -1.6), (s * 1.42, -0.15, -0.3), (s, 0, 0), 0.32, 0.04, STEEL)
        p.rivets((s * 1.42, 0.15, -1.6), (s * 1.42, 0.15, -0.3), (s, 0, 0), 0.32, 0.04, STEEL)
        p.turned((s * 1.3, 0, 0), (s, 0, 0), [(0.3, 0), (0.3, 0.14), (0.16, 0.16), (0.16, 0.55), (0.2, 0.56),
                                              (0.2, 0.62)], STEEL, sides=12)
    # Tipping yoke (the bail): up the sides and over.
    yoke = fillet([(-1.5, 0, 0.0), (-1.5, 0, 1.35), (1.5, 0, 1.35), (1.5, 0, 0.0)], 0.5, steps=5)
    p.tube(yoke, 0.09, IRON, sides=6, squash=1.6)
    p.torus((0, 0, 1.47), Y, 0.1, 0.035, IRON, seg=10, sides=4)
    for s in (-1, 1):
        p.turned((s * 1.5, 0, 0), (s, 0, 0), [(0.26, -0.07), (0.26, 0.07)], IRON, sides=10)
    # Worm wheel and handwheel on the +X trunnion.
    mini_gear(p, (1.82, 0, 0), X, 0.5, 14, BRASS, thick=0.1, up=Z)
    p.box((1.82, -0.55, -0.3), (0.2, 0.2, 0.5), IRON, bevel=0.03)
    p.cyl((1.82, -0.55, -0.1), (1.82, -1.0, -0.1), 0.035, STEEL, sides=5)
    p.handwheel((1.82, -1.02, -0.1), NY, 0.24)
    return p


@piece('LadleRail', tile=2.0)
def ladle_rail():
    """A tiling overhead monorail beam (X -2..+2, origin at the bottom flange
    centre, Z 0..0.8): a riveted I-beam with web stiffeners."""
    p = P('LadleRail', rust=0.6, ground=None, grime=None, ao_dist=0.5)
    p.box((0, 0, 0.04), (4.0, 0.6, 0.08), IRON)
    p.box((0, 0, 0.76), (4.0, 0.6, 0.08), IRON)
    p.box((0, 0, 0.4), (4.0, 0.07, 0.64), IRON)
    for x in (-1.0, 1.0):
        p.box((x, 0, 0.4), (0.06, 0.52, 0.64), IRON)
    for x in (-1.5, -0.5, 0.5, 1.5):
        for sy in (-1, 1):
            p.rivet((x, sy * 0.2, 0.8), Z, 0.04, STEEL)
            p.rivet((x, sy * 0.04, 0.4), (0, sy, 0), 0.035, STEEL)
    p.box((0, -0.305, 0.04), (4.0, 0.012, 0.06), STEEL)
    p.box((0, 0.305, 0.04), (4.0, 0.012, 0.06), STEEL)
    return p


@piece('LadleTrolley')
def ladle_trolley():
    """The ladle trolley (origin at the rail's bottom flange centre; it moves
    along X): four wheels on the bottom flange between riveted side plates, a
    gear case under the beam with a hand-chain wheel, a spreader beam, and two
    hanger bars down to hook yokes at Z -1.5 to -2.0 (X +-1.72) that carry the
    ladle's trunnion pins at Z -2.0; a safety hook hangs over the bail."""
    p = P('LadleTrolley', rust=0.6, verd=0.5, ground=None, grime=None, ao_dist=0.7)
    for sy in (-1, 1):
        p.box((0, sy * 0.4, 0.05), (1.3, 0.06, 0.9), IRON, bevel=0.02)
        for x in (-0.42, 0.42):
            p.turned((x, sy * 0.36, 0.3), (0, -sy, 0), [(0.22, 0), (0.22, 0.03), (0.18, 0.05), (0.18, 0.2)], STEEL,
                     sides=12)
            p.turned((x, sy * 0.43, 0.3), (0, sy, 0), [(0.09, 0), (0.09, 0.05), (0.05, 0.07)], BRASS, sides=8)
        p.rivets((-0.55, sy * 0.435, -0.3), (0.55, sy * 0.435, -0.3), (0, sy, 0), 0.22, 0.035, STEEL)
    p.box((0, 0, -0.55), (1.1, 0.9, 0.5), IRON, bevel=0.05)
    p.plate((0, -0.46, -0.55), NY, 0.8, 0.34, 0.03, BRASS, spacing=0.2, rr=0.03, inset=0.05)
    p.cyl((0, 0.45, -0.5), (0, 0.62, -0.5), 0.06, STEEL, sides=6)
    p.torus((0, 0.62, -0.5), Y, 0.3, 0.035, IRON, seg=14, sides=4)
    for k in range(5):
        a = TAU * k / 5
        p.cyl((0, 0.62, -0.5), (math.cos(a) * 0.3, 0.62, -0.5 + math.sin(a) * 0.3), 0.018, IRON, sides=4)
    # Spreader and hangers.
    p.ibeam((-1.85, 0, -1.0), (1.85, 0, -1.0), 0.34, 0.3, 0.05, IRON, up=Z)
    p.box((0, 0, -0.85), (0.5, 0.4, 0.2), IRON, bevel=0.03)
    for s in (-1, 1):
        p.box((s * 1.72, 0, -1.45), (0.1, 0.28, 0.75), IRON, bevel=0.02)
        p.rivet((s * 1.78, 0, -1.2), (s, 0, 0), 0.04, STEEL)
        p.arc_block((s * 1.72, 0, -1.98), X, 0.2, 0.34, 0.07, PI * 0.85, PI * 2.15, IRON, seg=6, up=Z)
        p.box((s * 1.72, -0.27, -1.75), (0.14, 0.1, 0.3), IRON)
        p.box((s * 1.72, 0.27, -1.75), (0.14, 0.1, 0.3), IRON)
    hook(p, (0, 0, -0.8), scale=0.42, latch=False)
    return p


@piece('PourFrame', foot=('box', 0.6, 1.0))
def pour_frame():
    """A pour gantry leg (X +-0.6, Y +-1.0, Z 0..9): two raking I-posts tied by
    struts and cross braces on a bolted footing, a hazard band at the foot,
    and a cheeked saddle at Z 9 for the monorail beam (which runs along X)."""
    p = P('PourFrame', rust=0.65)
    p.box((0, 0, 0.12), (1.2, 2.0, 0.24), IRON, bevel=0.04)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.bolt((sx * 0.45, sy * 0.85, 0.24), Z, 0.045, 0.06)
    for sy in (-1, 1):
        a, b = Vector((0, sy * 0.75, 0.24)), Vector((0, sy * 0.3, 8.5))
        p.ibeam(a, b, 0.34, 0.34, 0.045, IRON, up=(1, 0, 0))
        p.stripes((-0.171, sy * 0.75 - 0.17, 0.5) if sy < 0 else (-0.171, sy * 0.75 - 0.2, 0.5), Y, Z, (-1, 0, 0),
                  0.34, 0.5, pitch=0.17, slant=0.5)
    for i, z in enumerate((1.6, 3.4, 5.2, 7.0)):
        w = 0.75 - 0.45 * (z - 0.24) / 8.26
        p.flat((0, -w, z), (0, w, z), 0.14, 0.05, IRON, up=(1, 0, 0))
        if i < 3:
            z2 = z + 1.8
            w2 = 0.75 - 0.45 * (z2 - 0.24) / 8.26
            for sx, (ya, yb) in ((-1, (-w, w2)), (1, (w, -w2))):
                p.flat((sx * 0.1, ya, z), (sx * 0.1, yb, z2), 0.09, 0.03, IRON, up=(sx, 0, 0))
        for sy in (-1, 1):
            p.rivet((0.04, sy * (w - 0.05), z), X, 0.04, STEEL)
    p.box((0, 0, 8.6), (1.0, 1.1, 0.2), IRON, bevel=0.03)
    p.box((0, 0, 8.85), (0.9, 0.7, 0.3), IRON, bevel=0.03)
    for sy in (-1, 1):
        p.box((0, sy * 0.4, 9.0 - 0.1), (0.9, 0.08, 0.2), IRON)
        for sx in (-1, 1):
            p.bolt((sx * 0.3, sy * 0.45, 8.9), (0, sy, 0), 0.04, 0.05)
    return p


@piece('Mould', foot=('box', 2.0, 0.8), knee=0.8)
def mould():
    """A casting mould row (knee high, X +-2, Y +-0.8): three cast-iron ingot
    moulds on a rail skid, each cavity brim-full of molten brass (orange glow)
    with a slag crust, lifting lugs and a clamp bar."""
    p = P('Mould', rust=0.8)
    for k in range(3):
        p.heat.append((Vector((-1.3 + k * 1.3, 0, 0.7)), 0.9))
    for sy in (-1, 1):
        p.box((0, sy * 0.5, 0.07), (4.0, 0.16, 0.14), IRON, bevel=0.02)
    for k in range(3):
        x = -1.3 + k * 1.3
        p.box((x, 0, 0.44), (1.1, 1.4, 0.6), IRON, bevel=0.05, taper=1.12)
        with p.as_kind(K_PLAIN):
            p.box((x, 0, 0.745), (0.86, 1.14, 0.012), SOOT, mat=PAINT)
        p.box((x, 0, 0.755), (0.74, 1.02, 0.012), MOLTEN, mat=GLOW)
        p.box((x - 0.05, 0.1, 0.762), (0.34, 0.5, 0.006), MOLTEN_HOT, mat=GLOW)
        with p.as_kind(K_STONE):
            p.rockish((x + 0.2, -0.3, 0.765), (0.3, 0.22, 0.04), SLAG, jitter=0.3, subdivisions=1)
            p.rockish((x - 0.22, 0.36, 0.765), (0.2, 0.16, 0.035), SLAG, jitter=0.3, subdivisions=1)
        for sy in (-1, 1):
            p.cyl((x, sy * 0.7, 0.52), (x, sy * 0.79, 0.52), 0.07, IRON, sides=6)
        p.rivets((x - 0.4, -0.72, 0.3), (x + 0.4, -0.72, 0.3), NY, 0.27, 0.04, IRON)
    p.box((0, -0.62, 0.2), (3.9, 0.05, 0.08), STEEL_DARK)
    return p


@piece('ChannelSegment', tile=2.0)
def channel_segment():
    """A tile of the molten channel's trough (X -2..+2, inner width Y +-3, walls
    to Y +-3.8 and Z 0.8, bed at Z -1.2; the runtime draws the molten surface
    at Z 0): firebrick bed, stone block walls under riveted iron caps, slag
    crust along the inner walls with a dim orange rim."""
    p = P('ChannelSegment', rust=0.8, ground=None, grime=None, ao_dist=0.9)
    for s in (-1, 1):
        p.heat.append((Vector((0, s * 3.0, 0.0)), 1.3))
    with p.as_kind(K_STONE):
        p.box((0, 0, -1.3), (4.0, 7.6, 0.2), BRICK, mat=PAINT)
        for s in (-1, 1):
            p.box((0, s * 3.4, -0.5), (4.0, 0.8, 1.4), STONE, mat=PAINT)
            for k in range(3):
                x = -2.0 + (k + 0.5) * (4.0 / 3)
                p.box((x, s * 3.4, 0.45), (4.0 / 3 - 0.04, 0.84, 0.5), p.vary(STONE_LIGHT, 0.1), mat=PAINT)
            for k, x in enumerate((-1.2, 0.3, 1.4)):
                p.box((x, s * 2.9, 0.02 + 0.03 * k), (0.9, 0.3, 0.2), SLAG, mat=PAINT, taper=0.6,
                      rot=(0, 0, 0.1 * (k - 1)))
    for s in (-1, 1):
        p.box((0, s * 3.4, 0.74), (4.0, 0.9, 0.08), IRON)
        for x in (-1.5, -0.5, 0.5, 1.5):
            p.rivet((x, s * 3.4, 0.78), Z, 0.05, STEEL)
        p.quad_prism([(-2.0, s * 2.995, 0.02), (2.0, s * 2.995, 0.02), (2.0, s * 2.995, 0.12),
                      (-2.0, s * 2.995, 0.12)], (0, -s, 0), 0.006, EMBER, mat=GLOW, sides=False)
    return p


# =================================================================== the range
@piece('Bunker', foot=('box', 3.5, 1.0))
def bunker():
    """A firing-range bunker (X +-3.5, Y +-1, Z 0..1.6; the runtime stretches it
    along X): leaning riveted armour plates with view slits over a sandbag
    core, raking back stays and a capping channel with a thin hazard stripe."""
    p = P('Bunker', rust=0.7)
    for row, (z, n, y) in enumerate(((0.17, 7, 0.45), (0.5, 7, 0.45), (0.82, 6, 0.42), (0.17, 7, -0.05),
                                     (0.5, 6, -0.02))):
        for k in range(n):
            x = -3.0 + 6.0 * (k + 0.5 * (1 if n == 6 else 0)) / 6 if n == 6 else -3.0 + 6.0 * k / 6
            p.pillow((x, y, z), (0.98, 0.56, 0.34), p.vary(CANVAS, 0.1), yaw=0.04 * ((k + row) % 3 - 1))
    lean = -0.16
    for k in range(5):
        x = -2.8 + k * 1.4
        with p.at(T(x, -0.62, 0) @ R('X', lean)):
            p.box((0, 0, 0.5), (1.34, 0.07, 1.0), IRON, bevel=0.02)
            for sx in (-1, 1):
                p.box((sx * 0.46, 0, 1.11), (0.42, 0.07, 0.22), IRON)
                p.rivet((sx * 0.56, -0.04, 0.2), NY, 0.045, BRASS)
                p.rivet((sx * 0.56, -0.04, 0.85), NY, 0.045, BRASS)
                p.rivet((sx * 0.5, -0.04, 1.3), NY, 0.045, BRASS)
            p.box((0, 0, 1.33), (1.34, 0.07, 0.22), IRON)
            with p.as_kind(K_PLAIN):
                p.box((0, 0.03, 1.11), (0.5, 0.02, 0.22), DARK, mat=PAINT)
            p.box((0, -0.04, 0.5), (0.9, 0.02, 0.5), SLATE if k % 2 else OXBLOOD, mat=PAINT)
        if k < 4:
            with p.at(T(x + 0.7, -0.66, 0) @ R('X', lean)):
                p.box((0, 0, 0.72), (0.14, 0.05, 1.44), IRON)
        p.flat((x, -0.8, 1.38), (x, 0.92, 0.05), 0.08, 0.05, IRON, up=(1, 0, 0))
    p.box((0, -0.84, 1.5), (7.0, 0.3, 0.1), IRON, bevel=0.02)
    p.stripes((-3.5, -0.9905, 1.46), X, Z, NY, 7.0, 0.08, pitch=0.3, slant=1.2)
    return p


@piece('TargetFrame', foot=('box', 1.6, 0.3))
def target_frame():
    """A range target (X +-1.6, Y +-0.3, Z 0..3): an iron goal frame on plate
    feet with gussets, a dented steel plate hung on chains and tethered below,
    painted rings (enamel and oxblood), bullet scars."""
    p = P('TargetFrame', rust=0.75)
    for s in (-1, 1):
        p.box((s * 1.45, 0, 0.04), (0.3, 0.6, 0.08), IRON, bevel=0.02)
        p.ibeam((s * 1.45, 0, 0.08), (s * 1.45, 0, 2.86), 0.16, 0.16, 0.03, IRON, up=(0, -1, 0))
        for sy in (-1, 1):
            p.quad_prism([(s * 1.45 - 0.02, sy * 0.08, 0.08), (s * 1.45 - 0.02, sy * 0.28, 0.08),
                          (s * 1.45 - 0.02, sy * 0.08, 0.5)], X, 0.04, IRON, mat=METAL)
            p.bolt((s * 1.45 + 0.08 * s, sy * 0.2, 0.08), Z, 0.03, 0.03)
    p.ibeam((-1.6, 0, 2.92), (1.6, 0, 2.92), 0.16, 0.2, 0.03, IRON, up=Z)
    cz = 1.6
    p.turned((0, 0.03, cz), NY, [(1.02, 0), (1.05, 0.02), (1.05, 0.05), (1.02, 0.07)], STEEL_DARK, sides=20)
    washer(p, (0, -0.041, cz), NY, 0.8, 0.98, 0.004, ENAMEL, sides=20)
    washer(p, (0, -0.041, cz), NY, 0.46, 0.64, 0.004, OXBLOOD, sides=20)
    washer(p, (0, -0.041, cz), NY, 0.0, 0.22, 0.004, OXBLOOD, sides=12)
    for (x, z, r) in ((0.3, 0.25, 0.07), (-0.42, -0.1, 0.06), (0.05, -0.5, 0.08), (-0.2, 0.62, 0.05),
                      (0.66, -0.3, 0.06), (-0.7, 0.45, 0.07), (0.1, 0.05, 0.05)):
        with p.as_kind(K_PLAIN):
            washer(p, (x, -0.047, cz + z), NY, 0.0, r, 0.003, DARK, sides=6)
        washer(p, (x, -0.044, cz + z), NY, r, r * 1.5, 0.003, STEEL, mat=METAL, sides=6)
    for s in (-1, 1):
        p.chain([(s * 0.7, 0, 2.84), (s * 0.7, 0, cz + 0.75)], link=0.22, w=0.13, r=0.028)
        p.torus((s * 0.7, 0, cz + 0.72), Y, 0.07, 0.025, IRON, seg=8, sides=4)
        p.cyl((s * 0.95, 0, cz - 0.3), (s * 1.38, 0, cz - 0.5), 0.02, STEEL, sides=4)
    return p


@piece('TurretEmplacement', foot=('circle', 2.3))
def turret_emplacement():
    """A mortar emplacement (within r 2.3): a front arc of sandbags and two
    riveted shield plates at most 1.2 tall, a bolted turntable ring, and a
    three-barrel brass mortar battery aimed toward -Y and up 35 degrees, with
    an elevation wheel, a breech block and shells stood ready."""
    p = P('TurretEmplacement', rust=0.6, verd=0.45)
    for course, (z, n, r) in enumerate(((0.17, 8, 1.95), (0.5, 7, 1.93), (0.82, 6, 1.9))):
        for k in range(n):
            a = PI * 1.5 + (k - (n - 1) / 2) * (2.3 / 8) * 1.18
            p.pillow((math.cos(a) * r, math.sin(a) * r, z), (0.9, 0.52, 0.34), p.vary(CANVAS, 0.1), yaw=a + PI / 2)
    for s in (-1, 1):
        a = PI * 1.5 + s * 1.5
        with p.at(T(math.cos(a) * 1.9, math.sin(a) * 1.9, 0) @ R('Z', a + PI / 2) @ R('X', 0.14)):
            p.plate((0, 0, 0.58), NY, 1.3, 1.12, 0.07, IRON, spacing=0.3, rr=0.045, inset=0.1)
            p.stripes((-0.65, -0.04, 1.02), X, Z, NY, 1.3, 0.08, pitch=0.24, slant=1.2)
            p.flat((0, 0.03, 1.0), (0, 0.6, 0.05), 0.08, 0.05, IRON, up=(1, 0, 0))
    p.annulus((0, 0.25, 0.08), Z, 0.85, 1.15, 0.08, IRON, sides=20)
    for k in range(10):
        a = TAU * k / 10
        p.bolt((math.cos(a) * 1.0, 0.25 + math.sin(a) * 1.0, 0.16), Z, 0.045, 0.05)
    p.turned((0, 0.25, 0.1), Z, [(0.8, 0), (0.8, 0.12), (0.6, 0.2), (0.55, 0.3)], IRON, sides=16)
    for s in (-1, 1):
        p.quad_prism([(s * 0.78 - 0.04, -0.2, 0.3), (s * 0.78 - 0.04, 0.85, 0.3), (s * 0.78 - 0.04, 0.6, 1.1),
                      (s * 0.78 - 0.04, 0.2, 1.1)], X, 0.08, IRON, mat=METAL)
        p.turned((s * 0.7, 0.4, 0.95), (s, 0, 0), [(0.16, 0), (0.16, 0.2), (0.1, 0.22)], BRASS, sides=10)
    pivot = Vector((0, 0.4, 0.95))
    aim = Vector((0, -math.cos(math.radians(35)), math.sin(math.radians(35))))
    with p.at(T(pivot) @ basis(aim, up=Z)):
        p.box((0, -0.05, -0.25), (1.36, 0.5, 0.5), IRON, bevel=0.05)
        for k in (-1, 0, 1):
            x = k * 0.45
            p.turned((x, 0, -0.1), Z, [(0.2, 0), (0.24, 0.02), (0.24, 0.3), (0.2, 0.34), (0.2, 0.9), (0.23, 0.92),
                                       (0.23, 1.0), (0.2, 1.02), (0.2, 1.6), (0.26, 1.66), (0.26, 1.8), (0.17, 1.8),
                                       (0.16, 1.5)], BRASS, sides=14, cap1=False)
            with p.as_kind(K_PLAIN):
                p.cyl((x, 0, 1.5), (x, 0, 1.51), 0.16, DARK, sides=10, mat=PAINT, smooth=False)
        p.box((0, 0.0, 0.6), (1.36, 0.12, 0.12), IRON, bevel=0.02)
        p.box((0, 0.0, 1.25), (1.3, 0.1, 0.1), IRON, bevel=0.02)
        p.cyl((0, -0.3, -0.3), (0, -0.3, 0.5), 0.07, STEEL, sides=8)
    p.cyl((0.82, 0.4, 0.95), (1.05, 0.4, 0.95), 0.03, STEEL, sides=5)
    p.handwheel((1.07, 0.4, 0.95), X, 0.22)
    with p.as_kind(K_SOFT):
        p.box((1.25, 1.25, 0.2), (0.7, 0.5, 0.4), TIMBER, mat=PAINT, bevel=0.02, rot=(0, 0, 0.5))
    for k in range(3):
        c = Vector((-1.3 + k * 0.28, 1.15 + 0.1 * (k % 2), 0))
        p.turned(c, Z, [(0.1, 0), (0.1, 0.36), (0.07, 0.48), (0.02, 0.56)], BRASS, sides=8)
        p.band(c + Vector((0, 0, 0.1)), Z, 0.1, 0.05, COPPER, sides=8, lip=0.012)
    return p


# ==================================================== floor belts, bridge, crane bits
@piece('BeltHousing', tile=2.0, knee=0.45)
def belt_housing():
    """The low side frame of a floor conveyor belt (tiles along X, Y +-0.35,
    knee 0.45): a riveted channel-iron curb, roller axle caps every yard on
    its inner (+Y) face, gussets outside, bolt heads and a thin hazard chevron
    band along its top edge."""
    p = P('BeltHousing', rust=0.6, ao_dist=0.4)
    p.box((0, 0.2, 0.2), (4.0, 0.08, 0.4), IRON)
    p.box((0, -0.03, 0.4), (4.0, 0.62, 0.06), STEEL_DARK)
    p.box((0, -0.08, 0.025), (4.0, 0.5, 0.05), IRON)
    p.quad_prism([(-2.0, -0.34, 0.05), (-2.0, -0.2, 0.37), (2.0, -0.2, 0.37), (2.0, -0.34, 0.05)],
                 (0, -0.9, -0.4), 0.03, IRON, mat=METAL, sides=False)
    for x in (-1.5, -0.5, 0.5, 1.5):
        p.turned((x, 0.24, 0.2), Y, [(0.13, 0), (0.13, 0.05), (0.07, 0.08), (0.07, 0.11)], BRASS, sides=8)
        p.rivet((x + 0.5, -0.1, 0.43), Z, 0.04, STEEL)
    for x in (-1.0, 0.0, 1.0):
        p.quad_prism([(x - 0.02, -0.33, 0.05), (x - 0.02, -0.12, 0.05), (x - 0.02, -0.12, 0.37)], X, 0.04, IRON,
                     mat=METAL)
    p.stripes((-2.0, -0.33, 0.431), X, Y, Z, 4.0, 0.14, thick=0.006, pitch=0.3, slant=1.0)
    return p


@piece('BeltDrum', foot=('box', 2.6, 0.8), knee=0.7)
def belt_drum():
    """The roller drum housing at a floor belt's end (X +-2.6, Y +-0.8, knee
    0.7): a big steel roller half sunk in a riveted housing, bearing blocks at
    both ends, a drive chain guard on the +X end, a thin hazard lip."""
    p = P('BeltDrum', rust=0.6, ao_dist=0.5)
    p.box((0, 0, 0.03), (5.2, 1.6, 0.06), IRON)
    p.plate((0, -0.76, 0.24), NY, 5.2, 0.44, 0.07, IRON, spacing=0.5, rr=0.045, inset=0.1,
            rivet_sides=(1, 1, 0, 0))
    p.stripes((-2.6, -0.797, 0.38), X, Z, NY, 5.2, 0.08, pitch=0.3, slant=1.2)
    p.box((0, 0.76, 0.16), (5.2, 0.07, 0.28), IRON)
    p.turned((-2.25, 0, 0.2), X, [(0.44, 0), (0.5, 0.05), (0.5, 4.45), (0.44, 4.5)], STEEL, sides=18, up=Z)
    for x in (-1.5, -0.75, 0.0, 0.75, 1.5):
        p.turned((x - 0.03, 0, 0.2), X, [(0.503, 0), (0.503, 0.06)], STEEL_DARK, sides=18, up=Z, cap0=False,
                 cap1=False)
    for s in (-1, 1):
        p.box((s * 2.42, 0, 0.14), (0.3, 0.9, 0.28), IRON, bevel=0.03)
        p.turned((s * 2.3, 0, 0.2), (s, 0, 0), [(0.2, 0), (0.24, 0.05), (0.24, 0.26), (0.14, 0.3)], IRON, sides=12)
        for sy in (-1, 1):
            p.bolt((s * 2.42, sy * 0.36, 0.28), Z, 0.04, 0.05)
    with p.as_kind(K_PAINT):
        p.arc_block((2.5, 0, 0.2), X, 0.02, 0.48, 0.09, 0.0, PI, SLATE, seg=8, mat=PAINT, up=Z)
        p.box((2.5, 0, 0.1), (0.18, 0.96, 0.2), SLATE, mat=PAINT)
    for k in range(5):
        a = PI * (k + 0.5) / 5
        p.rivet((2.595, math.cos(a) * 0.4, 0.2 + math.sin(a) * 0.4), X, 0.035, BRASS)
    return p


@piece('BridgeSpan', tile=2.0)
def bridge_span():
    """A tiling crane-bridge deck segment (X -2..+2, deck Y +-4.5, walking
    surface at Z 0): steel grating bars over a pan, heavy riveted side box
    girders with brass-capped railings to Z 1.3, four lifting eyes on the
    girder tops at (X +-1.6, Y +-4.6), and a truss under the deck to Z -2.5."""
    p = P('BridgeSpan', rust=0.6, ground=None, grime=None, ao_dist=0.7)
    with p.as_kind(K_PLAIN):
        p.box((0, 0, -0.08), (4.0, 9.0, 0.02), SOOT, mat=PAINT)
    for k in range(10):
        p.box((-1.8 + k * 0.4, 0, -0.03), (0.09, 9.0, 0.06), STEEL_DARK)
    for y in (-3.0, -1.5, 0.0, 1.5, 3.0):
        p.box((0, y, -0.04), (4.0, 0.07, 0.07), STEEL_DARK)
    for s in (-1, 1):
        y = s * 4.72
        p.box((0, y, -0.2), (4.0, 0.44, 1.5), IRON)
        p.box((0, y, 0.57), (4.0, 0.56, 0.06), IRON)
        p.box((0, y, -0.97), (4.0, 0.56, 0.06), IRON)
        for x in (-1.0, 0.0, 1.0):
            p.box((x, y + s * 0.235, -0.2), (0.08, 0.05, 1.44), IRON)
        for x in (-1.5, -0.5, 0.5, 1.5):
            p.rivet((x, y + s * 0.22, 0.4), (0, s, 0), 0.045, STEEL)
            p.rivet((x, y + s * 0.22, -0.8), (0, s, 0), 0.045, STEEL)
        for x0, x1 in ((-2.0, -1.95), (-0.05, 0.05), (1.95, 2.0)):
            p.bx((x0, y - 0.05, 0.6), (x1, y + 0.05, 1.2), IRON)
        p.cyl((-2.0, y, 1.24), (2.0, y, 1.24), 0.06, BRASS, sides=7, cap0=False, cap1=False)
        p.box((0, y, 0.9), (4.0, 0.03, 0.06), IRON)
        for x in (-1.6, 1.6):
            p.box((x, s * 4.6, 0.63), (0.3, 0.2, 0.06), IRON)
            p.torus((x, s * 4.6, 0.78), X, 0.11, 0.04, STEEL, seg=6, sides=3)
    for x in (-1.0, 1.0):
        p.box((x, 0, -0.3), (0.14, 9.0, 0.4), IRON)
    p.flat((0, -3.0, -2.44), (0, 3.0, -2.44), 0.16, 0.1, IRON, up=X)
    for s in (-1, 1):
        p.flat((0, s * 4.5, -0.95), (0, s * 3.0, -2.44), 0.14, 0.06, IRON, up=X)
        p.flat((0, s * 3.0, -2.44), (0, s * 1.5, -0.5), 0.12, 0.05, IRON, up=X)
        p.flat((0, s * 1.5, -0.5), (0, 0, -2.44), 0.12, 0.05, IRON, up=X)
        p.box((0.06, s * 3.0, -2.3), (0.02, 0.5, 0.34), IRON)
    return p


@piece('HookBlock')
def hook_block():
    """A heavy crane hook block (origin at its TOP where the cables meet it; X
    +-0.7, Y +-0.5, down to Z -2.2): four cable falls, two brass sheaves
    between hazard-banded cheek plates, a through pin, a swivel crosshead and
    a forged hook with a latch."""
    p = P('HookBlock', rust=0.6, verd=0.4, ground=None, grime=None, ao_dist=0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl((sx * 0.5, sy * 0.1, 0.0), (sx * 0.5, sy * 0.1, -0.72), 0.03, STEEL_DARK, sides=5, cap0=False)
    for sy in (-1, 1):
        p.turned((0, sy * 0.1 - 0.065, -0.72), Y, [(0.44, 0), (0.52, 0.02), (0.47, 0.065), (0.52, 0.11), (0.44, 0.13)],
                 BRASS, sides=18, up=Z)
        yy = sy * 0.24
        p.turned((0, yy - 0.025, -0.72), Y, [(0.4, 0), (0.42, 0.01), (0.42, 0.04), (0.4, 0.05)], IRON, sides=16, up=Z)
        p.box((0, yy, -1.1), (0.5, 0.05, 0.5), IRON, bevel=0.015)
        p.box((0, yy, -0.3), (0.3, 0.05, 0.4), IRON, bevel=0.015)
        p.stripes((-0.3, yy + sy * 0.027, -0.82), X, Z, (0, sy, 0), 0.6, 0.2, pitch=0.15, slant=0.7)
        p.turned((0, sy * 0.27, -0.72), (0, sy, 0), [(0.12, 0), (0.12, 0.05), (0.07, 0.07), (0.07, 0.12)], STEEL,
                 sides=8)
    p.cyl((0, -0.27, -0.72), (0, 0.27, -0.72), 0.08, STEEL, sides=8)
    p.cyl((0, -0.3, -0.16), (0, 0.3, -0.16), 0.04, STEEL, sides=6)
    p.box((0, 0, -1.3), (0.44, 0.6, 0.16), IRON, bevel=0.03)
    p.turned((0, 0, -1.42), Z, [(0.13, 0), (0.17, 0.02), (0.17, 0.08), (0.13, 0.1)], BRASS, sides=10)
    hook(p, (0, 0, -1.3), scale=0.92)
    return p


@piece('Chain')
def chain_yard():
    """One yard of heavy chain along X from 0 to 1 (about 0.12 thick): five
    alternating links, so the runtime can stretch it to any length."""
    p = P('Chain', rust=0.7, ground=None, grime=None, ao_dist=0.2, ao=0.6)
    for k in range(5):
        side = Y if k % 2 == 0 else Z
        p.link((0.1 + k * 0.2, 0, 0), X, side, 0.3, 0.12, 0.024, p.vary(IRON, 0.06))
    return p


# ============================================================ sim prop pieces
@piece('RailCart', foot=('box', 1.6, 3.0))
def rail_cart():
    """An ore cart (X +-1.6, Y +-3, Z 0..2.6; long along Y, wheels at X +-1.1
    with their bottoms at Z 0.22 on the rail top): a channel chassis with
    axle boxes and leaf springs, buffers and a coupling hook at both ends, a
    riveted V hopper with ribs and a brass plate, heaped with brass ingots
    and ore."""
    p = P('RailCart', rust=0.7, verd=0.5, ground=0.22)
    wz, wr = 0.66, 0.44
    for sy in (-1, 1):
        y = sy * 1.7
        p.cyl((-1.25, y, wz), (1.25, y, wz), 0.07, STEEL, sides=6)
        for sx in (-1, 1):
            p.turned((sx * 1.02, y, wz), (sx, 0, 0), [(0.5, 0), (0.5, 0.04), (wr, 0.06), (wr, 0.2), (0.2, 0.2),
                                                       (0.14, 0.26)], STEEL_DARK, sides=16, up=Z)
            for k in range(5):
                a = TAU * k / 5
                with p.as_kind(K_PLAIN):
                    washer(p, (sx * 1.222, y + math.cos(a) * 0.29, wz + math.sin(a) * 0.29), (sx, 0, 0), 0.0, 0.07,
                           0.003, DARK, sides=6)
            p.box((sx * 1.36, y, wz + 0.02), (0.18, 0.34, 0.34), IRON, bevel=0.03)
            p.turned((sx * 1.45, y, wz), (sx, 0, 0), [(0.1, 0), (0.1, 0.04), (0.05, 0.06)], BRASS, sides=8)
            for k in range(3):
                p.box((sx * 1.36, y, wz + 0.26 + k * 0.045), (0.1, 1.0 - k * 0.22, 0.04), STEEL_DARK)
    for sx in (-1, 1):
        p.ibeam((sx * 1.36, -2.7, 1.12), (sx * 1.36, 2.7, 1.12), 0.3, 0.2, 0.04, IRON, up=Z)
    for y in (-2.7, -1.0, 1.0, 2.7):
        p.box((0, y, 1.12), (2.7, 0.2, 0.26), IRON, bevel=0.02)
    for sy in (-1, 1):
        for sx in (-1, 1):
            p.turned((sx * 0.9, sy * 2.78, 1.12), (0, sy, 0), [(0.1, 0), (0.1, 0.14), (0.17, 0.15), (0.18, 0.2),
                                                                (0.08, 0.22)], STEEL, sides=10)
        hook(p, (0, sy * 2.92, 1.25), scale=0.3, latch=False)
        p.box((0, sy * 2.82, 1.2), (0.16, 0.12, 0.14), IRON)
    # The V hopper.
    with p.at(T(0, 0, 1.25)):
        rings = [[(-0.7, -2.2, 0), (0.7, -2.2, 0), (0.7, 2.2, 0), (-0.7, 2.2, 0)],
                 [(-1.5, -2.45, 1.0), (1.5, -2.45, 1.0), (1.5, 2.45, 1.0), (-1.5, 2.45, 1.0)]]
        p.grid(rings, IRON, METAL, smooth=False, cap1=False)
        with p.as_kind(K_PLAIN):
            p.box((0, 0, 0.9), (2.9, 4.8, 0.02), SOOT, mat=PAINT)
        for sx in (-1, 1):
            p.box((sx * 1.5, 0, 1.0), (0.1, 5.0, 0.1), IRON, bevel=0.02)
            for y in (-1.6, -0.55, 0.55, 1.6):
                p.flat((sx * 0.72, y, 0.0), (sx * 1.53, y, 1.0), 0.1, 0.06, IRON, up=(sx, 0, 0.8))
            p.rivets((sx * 1.555, -2.2, 1.0), (sx * 1.555, 2.2, 1.0), (sx, 0, 0), 0.4, 0.04, STEEL)
            p.stripes((sx * 1.47, -2.45, 0.86) if sx < 0 else (sx * 1.47, -2.45, 0.86), Y, Z,
                      (sx * 0.78, 0, -0.62), 4.9, 0.08, pitch=0.3, slant=1.1)
        for sy in (-1, 1):
            p.box((0, sy * 2.45, 1.0), (3.1, 0.1, 0.1), IRON, bevel=0.02)
            p.turned((0, sy * 2.42, 0.55), (0, sy, 0), [(0.2, 0), (0.2, 0.1), (0.1, 0.14), (0.1, 0.3)], STEEL, sides=10)
        p.box((-1.13, -0.0, 0.52), (0.03, 0.6, 0.3), BRASS, rot=(0, -0.675, 0), bevel=0.01)
    # The load: ore and ingots heaped to 2.6.
    with p.as_kind(K_STONE):
        p.rockish((0, 0, 2.12), (2.7, 4.5, 0.75), ORE, jitter=0.2, subdivisions=2, flat_bottom=True)
        p.rockish((-0.3, 1.0, 2.3), (1.2, 1.3, 0.5), SLAG, jitter=0.25, subdivisions=1)
    for (x, y, z, yaw, rl) in ((0.4, -0.8, 2.38, 0.5, 0.2), (-0.5, -1.4, 2.3, -0.4, -0.15), (0.6, 0.6, 2.36, 1.2, 0.1),
                               (-0.2, -0.2, 2.47, 0.1, 0.0), (0.1, 1.7, 2.28, 0.9, -0.2), (-0.8, 0.4, 2.3, -1.0, 0.25),
                               (0.3, -1.8, 2.26, 0.2, 0.1)):
        p.box((x, y, z), (0.75, 0.22, 0.16), p.vary(BRASS, 0.08), taper=0.84, rot=(rl, 0.1, yaw))
    for (x, y, z) in ((-0.6, -0.7, 2.36), (0.7, -0.1, 2.36), (0.0, 0.9, 2.42), (0.75, 1.5, 2.25)):
        p.rockish((x, y, z), (0.3, 0.28, 0.24), BRASS, jitter=0.3, subdivisions=1, mat=METAL)
    return p


@piece('PlateStack', foot=('box', 2.4, 1.6))
def plate_stack():
    """Brass and iron plate stock on pallets (X +-2.4, Y +-1.6, Z 0..3): lifts
    of plates on timber dunnage, steel strapping, a binder chain over the top
    with a hook, a few plates leaning against the stack."""
    p = P('PlateStack', rust=0.6, verd=0.5)
    with p.as_kind(K_SOFT):
        for x in (-1.6, 0.0, 1.6):
            p.box((x, 0, 0.09), (0.26, 2.9, 0.18), TIMBER_DARK, mat=PAINT, bevel=0.02)
        for k in range(8):
            p.box((0, -1.3 + k * 0.371, 0.21), (4.4, 0.3, 0.06), p.vary(TIMBER, 0.12), mat=PAINT, bevel=0.012)
    z = 0.24
    lifts = ((BRASS, 5, 4.2, 2.6), (IRON, 4, 4.0, 2.5), (BRASS, 4, 3.9, 2.3), (STEEL, 3, 3.6, 2.2))
    for li, (col, n, w, d) in enumerate(lifts):
        for k in range(n):
            ox = (p.rng.random() - 0.5) * 0.12
            oy = (p.rng.random() - 0.5) * 0.1
            p.box((ox, oy - 0.1, z + 0.05), (w, d, 0.09), p.vary(col, 0.07), bevel=0.02,
                  rot=(0, 0, (p.rng.random() - 0.5) * 0.03))
            z += 0.1
        if li < len(lifts) - 1:
            with p.as_kind(K_SOFT):
                for x in (-1.3, 0.0, 1.3):
                    p.box((x, -0.1, z + 0.05), (0.16, d + 0.1, 0.1), TIMBER, mat=PAINT)
            z += 0.1
    top = z
    for x in (-1.2, 1.2):
        p.box((x, -1.47, (0.24 + top) / 2), (0.1, 0.012, top - 0.24), STEEL)
        p.box((x, 1.22, (0.24 + top) / 2), (0.1, 0.012, top - 0.24), STEEL)
        p.box((x, -0.12, top + 0.006), (0.1, 2.7, 0.012), STEEL)
        p.box((x, -1.48, top - 0.3), (0.14, 0.03, 0.1), STEEL_DARK)
    pts = [(0.1, -1.52, 0.4)] + [(0.1, -1.5, top + 0.03)] + [(0.1, 1.24, top + 0.03)] + [(0.1, 1.27, 0.7)]
    p.chain(fillet(pts, 0.12, steps=2), link=0.34, w=0.2, r=0.04)
    hook(p, (0.1, 1.27, 0.72), scale=0.36, latch=False)
    with p.at(T(-0.6, 1.48, 0.0) @ R('X', 0.12)):
        p.box((0, 0, 1.25), (2.6, 0.08, 2.5), BRASS, bevel=0.02)
        p.box((0.3, 0.1, 1.1), (2.3, 0.08, 2.2), IRON, bevel=0.02)
    return p


@piece('WaterTower', foot=('circle', 2.4))
def water_tower():
    """A water tower (legs within r 2.4; tank r 2.9 at Z 8..12.5; roof to 14.5):
    six I-legs on stone pads with ring girders and rod bracing, a riveted
    verdigris copper tank in lapped courses with brass hoops, a seamed
    conical roof with a finial, a gallery and railing round the tank foot, a
    ladder, a level board, and an outflow pipe with a valve."""
    p = P('WaterTower', rust=0.65, verd=0.7)
    legs = []
    for k in range(6):
        a = TAU * k / 6 + PI / 6
        d = Vector((math.cos(a), math.sin(a), 0))
        legs.append((d * 2.15, d * 2.3 + Vector((0, 0, 8.0)), d))
        with p.as_kind(K_STONE):
            p.box(d * 2.15 + Vector((0, 0, 0.2)), (0.7, 0.7, 0.4), STONE, mat=PAINT, bevel=0.05, rot=(0, 0, a))
        p.ibeam(d * 2.15 + Vector((0, 0, 0.4)), d * 2.3 + Vector((0, 0, 8.0)), 0.3, 0.26, 0.04, IRON, up=d)
        p.box(d * 2.15 + Vector((0, 0, 0.43)), (0.5, 0.5, 0.06), IRON, rot=(0, 0, a))
    for z in (4.2, 7.85):
        for k in range(6):
            a0, b0, _ = legs[k]
            a1, b1, _ = legs[(k + 1) % 6]
            f = (z - 0.4) / 7.6
            qa = a0.lerp(b0, f)
            qb = a1.lerp(b1, f)
            qa.z = qb.z = z
            p.flat(qa, qb, 0.2, 0.06, IRON, up=Z)
    for tier, (za, zb) in enumerate(((0.6, 4.1), (4.3, 7.7))):
        for k in range(6):
            a0, b0, _ = legs[k]
            a1, b1, _ = legs[(k + 1) % 6]
            fa, fb = (za - 0.4) / 7.6, (zb - 0.4) / 7.6
            pa = a0.lerp(b0, fa); pa.z = za
            pb = a1.lerp(b1, fb); pb.z = zb
            pc = a1.lerp(b1, fa); pc.z = za
            pd = a0.lerp(b0, fb); pd.z = zb
            p.cyl(pa, pb, 0.03, STEEL_DARK, sides=4, smooth=False)
            p.cyl(pc, pd, 0.03, STEEL_DARK, sides=4, smooth=False)
            mid = (pa + pb) / 2
            p.turned(mid - (pb - pa).normalized() * 0.12, pb - pa, [(0.06, 0), (0.06, 0.24)], BRASS, sides=6,
                     smooth=False)
    # Gallery round the tank foot.
    washer(p, (0, 0, 7.94), Z, 2.2, 3.5, 0.08, IRON, mat=METAL, sides=18)
    for k in range(12):
        a = TAU * k / 12
        c = Vector((math.cos(a) * 3.42, math.sin(a) * 3.42, 8.0))
        p.cyl(c, c + Vector((0, 0, 1.05)), 0.03, IRON, sides=4, smooth=False)
        p.flat(Vector((math.cos(a) * 2.5, math.sin(a) * 2.5, 7.5)), c - Vector((0, 0, 0.06)), 0.08, 0.05, IRON,
               up=(-math.sin(a), math.cos(a), 0))
    p.torus((0, 0, 9.05), Z, 3.42, 0.04, BRASS, seg=18, sides=4)
    p.torus((0, 0, 8.55), Z, 3.42, 0.025, IRON, seg=18, sides=4)
    # Tank.
    prof = [(2.6, 8.0), (2.86, 8.02)]
    for zs in (9.45, 10.95):
        prof += [(2.86, zs), (2.9, zs + 0.02), (2.9, zs + 0.16), (2.86, zs + 0.18)]
    prof += [(2.86, 12.4), (2.9, 12.42), (2.9, 12.5), (2.7, 12.5)]
    p.turned((0, 0, 0), Z, prof, VERDIGRIS, sides=26)
    for zs in (9.54, 11.04):
        p.rivet_ring((0, 0, zs), Z, 2.9, 26, 0.05, COPPER)
    for z in (8.35, 12.15):
        p.band((0, 0, z), Z, 2.86, 0.22, BRASS, rivets=0, sides=26, lip=0.05)
    for k in range(4):
        a = TAU * k / 4 + 0.4
        p.rivets((math.cos(a) * 2.875, math.sin(a) * 2.875, 8.6), (math.cos(a) * 2.875, math.sin(a) * 2.875, 9.3),
                 (math.cos(a), math.sin(a), 0), 0.24, 0.045, COPPER)
    # Roof.
    p.turned((0, 0, 12.5), Z, [(3.1, -0.06), (3.1, 0.0), (1.6, 1.0), (0.35, 1.6), (0.28, 1.62)], VERD_DARK, sides=26)
    for k in range(13):
        a = TAU * k / 13
        d = Vector((math.cos(a), math.sin(a), 0))
        p.flat(d * 3.08 + Vector((0, 0, 12.52)), d * 1.6 + Vector((0, 0, 13.53)), 0.07, 0.07, VERDIGRIS,
               up=(d.x * 0.5, d.y * 0.5, 0.86))
        p.flat(d * 1.6 + Vector((0, 0, 13.53)), d * 0.36 + Vector((0, 0, 14.12)), 0.06, 0.06, VERDIGRIS,
               up=(d.x * 0.4, d.y * 0.4, 0.9))
    p.turned((0, 0, 14.08), Z, [(0.36, 0), (0.3, 0.08), (0.12, 0.14), (0.16, 0.22), (0.1, 0.3), (0.02, 0.42)], BRASS,
             sides=10)
    # Ladder (front, -Y), level board, outflow.
    ladder(p, (0, -2.45, 0.3), (0, -3.5, 7.95), NY, width=0.5, rung=0.42)
    ladder(p, (0, -2.98, 8.1), (0, -2.98, 12.5), NY, width=0.5, rung=0.42)
    p.box((1.3, -2.66, 10.2), (0.36, 0.05, 3.4), ENAMEL, mat=PAINT, bevel=0.01)
    for k in range(7):
        p.box((1.3, -2.69, 8.8 + k * 0.45), (0.22 if k % 2 == 0 else 0.12, 0.01, 0.03), HAZARD_BLACK, mat=PAINT)
    p.quad_prism([(1.05, -2.72, 10.6), (1.5, -2.72, 10.7), (1.5, -2.72, 10.5)], NY, 0.02, OXBLOOD)
    out = fillet([(0.6, 0.6, 8.0), (0.6, 0.6, 6.8), (1.3, 1.2, 5.6), (1.86, 1.08, 4.2), (1.86, 1.08, 0.5)], 0.5)
    p.tube(out, 0.2, COPPER, sides=9)
    p.flange((1.86, 1.08, 2.2), Z, 0.3, 0.07, BRASS, bolts=5, sides=10)
    p.turned((1.86, 1.08, 1.2), Z, [(0.2, 0), (0.3, 0.07), (0.32, 0.2), (0.3, 0.33), (0.2, 0.4)], BRASS, sides=10)
    p.cyl((1.86, 1.08, 1.4), (2.3, 1.34, 1.4), 0.05, STEEL, sides=5)
    p.handwheel((2.32, 1.35, 1.4), (0.86, 0.5, 0), 0.24)
    p.turned((1.86, 1.08, 0.3), Z, [(0.3, 0), (0.3, 0.1), (0.2, 0.2)], IRON, sides=10)
    return p


@piece('ConveyorRun', tile=2.0, foot=('box', 2.0, 1.2), knee=1.4)
def conveyor_run():
    """A tiling raised conveyor (X -2..+2, Y +-1.2, Z 0..1.4): channel side
    frames on braced legs, idler axle caps, a rubber belt with its return run,
    low guard rails with a thin hazard band, and parts riding the belt (a
    gear, plates, ingots)."""
    p = P('ConveyorRun', rust=0.6, verd=0.5, ao_dist=0.6)
    with p.as_kind(K_SOFT):
        p.box((0, 0, 0.98), (4.0, 1.7, 0.05), RUBBER, mat=PAINT)
        p.box((0, 0, 0.66), (4.0, 1.7, 0.03), RUBBER, mat=PAINT)
    for s in (-1, 1):
        p.box((0, s * 0.95, 0.86), (4.0, 0.06, 0.34), IRON)
        p.box((0, s * 1.0, 1.02), (4.0, 0.16, 0.04), IRON)
        p.box((0, s * 1.0, 0.7), (4.0, 0.16, 0.04), IRON)
        p.box((0, s * 0.92, 1.12), (4.0, 0.04, 0.16), SLATE, mat=PAINT)
        for x in (-1.5, -0.5, 0.5, 1.5):
            p.turned((x, s * 0.98, 0.9), (0, s, 0), [(0.1, 0), (0.1, 0.05), (0.05, 0.07)], BRASS, sides=6, smooth=False)
        for x in (-1.0, 1.0):
            p.box((x, s * 1.0, 0.35), (0.1, 0.1, 0.7), IRON)
            p.box((x, s * 1.05, 0.02), (0.3, 0.26, 0.04), IRON)
    p.stripes((-2.0, -0.9405, 1.07), X, Z, NY, 4.0, 0.1, pitch=0.3, slant=1.1)
    for x in (-1.0, 1.0):
        p.flat((x, -0.95, 0.12), (x, 0.95, 0.6), 0.07, 0.03, IRON, up=X)
        p.box((x, 0, 0.3), (0.06, 1.9, 0.06), IRON)
    mini_gear(p, (-1.1, 0.1, 1.05), Z, 0.42, 9, BRASS, thick=0.1)
    p.box((0.1, -0.2, 1.03), (0.8, 0.6, 0.05), STEEL, rot=(0, 0, 0.2))
    p.box((0.14, -0.18, 1.08), (0.8, 0.6, 0.05), BRASS, rot=(0, 0, 0.35))
    for k in range(3):
        p.box((1.25, -0.3 + k * 0.3, 1.07), (0.5, 0.2, 0.13), p.vary(BRASS, 0.08), taper=0.85, rot=(0, 0, 0.1 * k))
    return p


# ================================================================ the press line
@piece('PressPost', foot=('circle', 1.3))
def press_post():
    """A riveted press column (r 1.3, foot flare to r 1.8, Z 0..14): an
    octagonal bolted foot, a thin hazard chevron band at Z 1, a lapped shaft
    with four riveted seam straps, three heavy bands, staple rungs up the
    back, a lubricator with a gauge, and a flared capital under the crown."""
    p = P('PressPost', rust=0.6, verd=0.45)
    p.turned((0, 0, 0), Z, [(1.8, 0), (1.8, 0.25), (1.62, 0.34), (1.36, 0.68), (1.3, 0.74)], IRON, sides=8,
             smooth=False, phase=PI / 8)
    for k in range(8):
        a = TAU * k / 8
        p.bolt((math.cos(a) * 1.6, math.sin(a) * 1.6, 0.27), Z, 0.07, 0.09)
    prof = [(1.14, 0.74), (1.1, 0.8), (1.1, 12.9), (1.2, 13.1), (1.3, 13.4), (1.3, 13.9), (1.24, 14.0)]
    p.turned((0, 0, 0), Z, prof, IRON, sides=18)
    chevron_ring(p, (0, 0, 0), 1.108, 0.86, 1.16, n=18)
    for z in (3.7, 7.1, 10.5):
        p.band((0, 0, z), Z, 1.1, 0.5, BRASS_DARK, rivets=14, rivet_r=0.055, sides=18, lip=0.12)
    p.band((0, 0, 12.6), Z, 1.1, 0.26, BRASS, rivets=14, rivet_r=0.05, sides=18, lip=0.06)
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        for (za, zb) in ((1.4, 3.3), (4.1, 6.7), (7.5, 10.1), (10.9, 12.3)):
            c = d * 1.11
            with p.at(T(c.x, c.y, (za + zb) / 2) @ R('Z', a)):
                p.box((0, 0, 0), (0.05, 0.3, zb - za), IRON)
            p.rivets(c + d * 0.025 + Vector((0, 0, za + 0.15)), c + d * 0.025 + Vector((0, 0, zb - 0.15)), d, 0.6,
                     0.05, IRON)
    z = 1.5
    while z < 12.9:
        if not any(abs(z - b) < 0.4 for b in (3.7, 7.1, 10.5)):
            p.tube([(-0.2, 1.08, z), (-0.2, 1.32, z), (0.2, 1.32, z), (0.2, 1.08, z)], 0.025, STEEL_DARK, sides=4,
                   smooth=False)
        z += 0.5
    p.box((0, -1.2, 2.0), (0.4, 0.26, 0.5), BRASS, bevel=0.03)
    p.gauge((0, -1.34, 2.55), NY, 0.14)
    p.cyl((0, -1.2, 2.25), (0, -1.26, 2.5), 0.025, COPPER, sides=4)
    p.tube([(0.15, -1.15, 1.75), (0.5, -1.02, 1.5), (0.52, -1.0, 0.8)], 0.025, COPPER, sides=4)
    return p


@piece('PressRam')
def press_ram():
    """A press ram (origin at its bottom, r 0.5, Z 0..5): a polished steel rod,
    a bolted foot coupling, a brass collar, and the iron gland it slides in."""
    p = P('PressRam', rust=0.4, verd=0.4, ground=None, grime=None, ao_dist=0.5)
    p.turned((0, 0, 0), Z, [(0.5, 0), (0.5, 0.18), (0.4, 0.24), (0.36, 0.4)], IRON, sides=16)
    for k in range(8):
        a = TAU * k / 8
        p.bolt((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.18), Z, 0.035, 0.05)
    p.cyl((0, 0, 0.3), (0, 0, 4.3), 0.34, STEEL, sides=16)
    p.turned((0, 0, 1.3), Z, [(0.35, 0), (0.42, 0.04), (0.42, 0.3), (0.35, 0.34)], BRASS, sides=16)
    p.turned((0, 0, 4.1), Z, [(0.38, 0), (0.5, 0.06), (0.5, 0.5), (0.44, 0.56), (0.44, 0.84), (0.5, 0.86), (0.5, 0.9)],
             IRON, sides=16)
    for k in range(8):
        a = TAU * k / 8 + 0.2
        p.bolt((math.cos(a) * 0.4, math.sin(a) * 0.4, 4.6), Z, 0.035, 0.07)
    p.tube([(0.5, 0, 4.4), (0.62, 0, 4.4), (0.62, 0, 4.9)], 0.03, COPPER, sides=4)
    return p


@piece('PressHammer')
def press_hammer():
    """The press hammer head (origin at the STRIKE FACE centre; X +-2.4, Y +-2.6,
    Z 0..2.8, rod to Z 7): a steel die face, a chamfered cast head with ribs
    and rivet rows, a thin hazard chevron skirt on all four sides, brass wear
    shoes, lifting eyes, a bolted brass collar and the piston rod."""
    p = P('PressHammer', rust=0.55, verd=0.4, ground=None, grime=None, ao_dist=1.0)
    p.box((0, 0, 0.28), (4.5, 4.9, 0.56), STEEL_DARK, bevel=0.07)
    p.box((0, 0, 1.45), (4.72, 5.12, 1.8), IRON, bevel=0.12)
    for (o, u, n, L) in (((-2.36, -2.561, 0.62), X, NY, 4.72), ((2.36, 2.561, 0.62), (-1, 0, 0), Y, 4.72),
                         ((2.361, -2.56, 0.62), Y, X, 5.12), ((-2.361, 2.56, 0.62), NY, (-1, 0, 0), 5.12)):
        p.stripes(o, u, Z, n, L, 0.3, pitch=0.3, slant=0.8)
    for sy in (-1, 1):
        for k in range(5):
            x = -1.8 + k * 0.9
            p.box((x, sy * 2.6, 1.65), (0.2, 0.1, 1.2), IRON, bevel=0.02)
        p.rivets((-2.1, sy * 2.565, 2.22), (2.1, sy * 2.565, 2.22), (0, sy, 0), 0.42, 0.055, BRASS)
    for sx in (-1, 1):
        p.box((sx * 2.38, 0, 1.6), (0.06, 1.5, 1.2), BRASS, bevel=0.02)
        for sy in (-1, 1):
            p.bolt((sx * 2.4, sy * 0.55, 1.6 + 0.4), (sx, 0, 0), 0.04, 0.03)
            p.bolt((sx * 2.4, sy * 0.55, 1.6 - 0.4), (sx, 0, 0), 0.04, 0.03)
            p.box((sx * 2.0, sy * 2.2, 2.38), (0.3, 0.3, 0.08), IRON)
            p.torus((sx * 2.0, sy * 2.2, 2.52), (sy * 0.7, sx * 0.7, 0), 0.12, 0.04, STEEL, seg=8, sides=4)
    p.box((0, 0, 2.38), (3.4, 3.8, 0.08), IRON, bevel=0.02)
    p.turned((0, 0, 2.3), Z, [(1.25, 0), (1.25, 0.22), (0.95, 0.3), (0.86, 0.5)], BRASS, sides=20)
    for k in range(10):
        a = TAU * k / 10
        p.bolt((math.cos(a) * 1.1, math.sin(a) * 1.1, 2.52), Z, 0.055, 0.07)
    p.cyl((0, 0, 2.7), (0, 0, 7.0), 0.5, STEEL, sides=18)
    return p


@piece('PressCarriage')
def press_carriage():
    """The press carriage (origin at the top contact with an overhead rail that
    runs along Y; body X +-1.6, Y +-2 down to Z -2.2): two wheel bogies
    straddling the 0.6 wide I-beam, riveted hanger plates, a girder frame
    with a deck, gussets, end beams with thin hazard bands, a feed pipe, and
    a bolted cylinder mount ring at the bottom centre."""
    p = P('PressCarriage', rust=0.6, verd=0.45, ground=None, grime=None, ao_dist=0.9)
    for sy in (-1, 1):
        y0 = sy * 1.25
        for sx in (-1, 1):
            p.box((sx * 0.46, y0, 0.0), (0.07, 1.2, 1.1), IRON, bevel=0.02)
            for dy in (-0.32, 0.32):
                p.turned((sx * 0.42, y0 + dy, 0.3), (-sx, 0, 0), [(0.22, 0), (0.22, 0.03), (0.18, 0.05), (0.18, 0.2)],
                         STEEL, sides=12, up=Z)
                p.turned((sx * 0.5, y0 + dy, 0.3), (sx, 0, 0), [(0.1, 0), (0.1, 0.05), (0.05, 0.07)], BRASS, sides=8)
            p.rivets((sx * 0.5, y0 - 0.45, -0.35), (sx * 0.5, y0 + 0.45, -0.35), (sx, 0, 0), 0.3, 0.04, STEEL)
        p.box((0, y0, -0.5), (1.0, 1.2, 0.12), IRON, bevel=0.02)
    for sx in (-1, 1):
        p.ibeam((sx * 1.42, -2.0, -0.95), (sx * 1.42, 2.0, -0.95), 0.8, 0.34, 0.06, IRON, up=Z)
        p.rivets((sx * 1.6, -1.8, -0.62), (sx * 1.6, 1.8, -0.62), (sx, 0, 0), 0.45, 0.045, STEEL)
    p.box((0, 0, -0.6), (3.0, 3.9, 0.08), IRON)
    for sy in (-1, 1):
        p.box((0, sy * 1.9, -0.95), (3.1, 0.2, 0.7), IRON, bevel=0.03)
        p.stripes((-1.55, sy * 2.001, -1.28), X, Z, (0, sy, 0), 3.1, 0.14, pitch=0.3, slant=1.0)
    p.box((0, 0, -1.45), (2.3, 2.3, 0.9), IRON, bevel=0.1)
    for a in (0, PI / 2, PI, PI * 1.5):
        with p.at(R('Z', a)):
            p.quad_prism([(1.15, -0.05, -1.0), (1.42, -0.05, -1.0), (1.15, -0.05, -1.85)], Y, 0.1, IRON, mat=METAL)
            p.plate((0, -1.16, -1.45), NY, 1.5, 0.6, 0.04, IRON, spacing=0.3, rr=0.04, inset=0.08)
    p.turned((0, 0, -2.2), Z, [(0.95, 0), (0.95, 0.14), (0.75, 0.2), (0.75, 0.32)], IRON, sides=18)
    for k in range(10):
        a = TAU * k / 10
        p.bolt((math.cos(a) * 0.85, math.sin(a) * 0.85, -2.06), Z, 0.05, 0.06)
    with p.as_kind(K_PLAIN):
        p.cyl((0, 0, -2.2), (0, 0, -2.201), 0.55, DARK, sides=12, mat=PAINT, smooth=False)
    p.plate((0, -1.18, -1.45), NY, 0.7, 0.3, 0.02, BRASS, spacing=0.3, rr=0.025, inset=0.04)
    pipe = fillet([(1.0, -1.3, -0.56), (1.0, -1.3, -1.0), (1.3, -1.0, -1.5), (1.0, -0.6, -1.95)], 0.2)
    p.tube(pipe, 0.06, COPPER, sides=6)
    return p


@piece('PartsChute', foot=('legs', 23.4, 23.4, 2.4))
def parts_chute():
    """The parts chute over the press line (hopper X +-21, Y +-2.4 at Z 6..9.5,
    tilted toward the front; legs ONLY at X +-23.4; nothing else below Z 5):
    a riveted trough with a high back, ribs under it, two Warren-truss girders
    spanning to braced trestle legs, four discharge spouts with slide-gate
    levers on the low front edge, a thin hazard band along the lip, and loose
    parts (gears, plates, ingots) lying on the slope."""
    p = P('PartsChute', rust=0.65, verd=0.5, ao_dist=1.2)
    section = [(-2.4, 6.95), (-2.4, 6.2), (2.4, 8.3), (2.4, 9.5), (2.3, 9.5), (2.3, 8.42), (-2.3, 6.4), (-2.3, 6.95)]
    n = 14
    rings = [[(-21.0 + 42.0 * i / n, y, z) for (y, z) in section] for i in range(n + 1)]
    p.grid(rings, IRON, METAL, smooth=False)
    slope = math.atan2(8.3 - 6.2, 4.8)
    for i in range(n + 1):
        x = -21.0 + 42.0 * i / n
        p.flat((x, -2.45, 6.1), (x, 2.45, 8.24), 0.14, 0.14, IRON, up=X)
        p.box((x, 2.46, 8.9), (0.14, 0.08, 1.2), IRON)
    p.rivets((-20.6, 2.45, 9.36), (20.6, 2.45, 9.36), Y, 1.4, 0.06, BRASS)
    p.rivets((-20.6, -2.405, 6.82), (20.6, -2.405, 6.82), NY, 1.4, 0.06, BRASS)
    p.stripes((-21.0, -2.4055, 6.5), X, Z, NY, 42.0, 0.16, pitch=0.5, slant=1.2)
    # Girders and trestles.
    for sy in (-1, 1):
        y = sy * 1.9
        ztop = 6.05 if sy < 0 else 7.7
        p.flat((-23.4, y, 5.2), (23.4, y, 5.2), 0.22, 0.2, IRON, up=Z)
        p.flat((-23.4, y, ztop), (23.4, y, ztop), 0.22, 0.2, IRON, up=Z)
        bays = 18
        for i in range(bays):
            x0 = -23.4 + 46.8 * i / bays
            x1 = -23.4 + 46.8 * (i + 1) / bays
            if i % 2 == 0:
                p.flat((x0, y, 5.2), (x1, y, ztop), 0.14, 0.06, IRON, up=(0, sy, 0))
            else:
                p.flat((x0, y, ztop), (x1, y, 5.2), 0.14, 0.06, IRON, up=(0, sy, 0))
            p.rivet((x0, y + sy * 0.11, 5.2 if i % 2 == 0 else ztop), (0, sy, 0), 0.06, STEEL)
        for sx in (-1, 1):
            x = sx * 23.4
            # A V trestle: the feet stand close together on the lip's corner
            # (the shutter beside it and the gulf behind leave no more room).
            p.ibeam((x, sy * 0.7 - 0.1, 0.3), (x, sy * 1.9, ztop + 0.1), 0.4, 0.4, 0.05, IRON, up=(sx, 0, 0))
            with p.as_kind(K_STONE):
                p.box((x, sy * 0.7 - 0.1, 0.15), (0.9, 0.9, 0.3), STONE, mat=PAINT, bevel=0.05)
    for sx in (-1, 1):
        x = sx * 23.4
        for (za, zb, ya, yb) in ((0.5, 2.6, 0.75, 1.1), (2.6, 4.9, 1.15, 1.5)):
            p.flat((x, -ya - 0.1, za), (x, yb, zb), 0.12, 0.05, IRON, up=(sx, 0, 0))
            p.flat((x, ya - 0.1, za), (x, -yb, zb), 0.12, 0.05, IRON, up=(sx, 0, 0))
        for (z, yy) in ((2.6, 1.15), (4.9, 1.55)):
            p.flat((x, -yy, z), (x, yy, z), 0.16, 0.06, IRON, up=(sx, 0, 0))
        p.box((sx * 22.2, 0, 6.6), (2.4, 0.3, 0.3), IRON)
        p.quad_prism([(sx * 21.0, -2.4, 6.2), (sx * 21.0, 2.4, 8.3), (sx * 21.0, 2.4, 9.5), (sx * 21.0, -2.4, 6.95)],
                     (sx, 0, 0), 0.12, IRON, mat=METAL)
    # Discharge spouts and slide-gate levers.
    for x in (-15.0, -5.0, 5.0, 15.0):
        rings = [[(x - 0.7, -2.38, 6.9), (x + 0.7, -2.38, 6.9), (x + 0.7, -2.38, 6.25), (x - 0.7, -2.38, 6.25)],
                 [(x - 0.5, -3.0, 6.3), (x + 0.5, -3.0, 6.3), (x + 0.5, -2.9, 5.6), (x - 0.5, -2.9, 5.6)],
                 [(x - 0.42, -3.1, 5.9), (x + 0.42, -3.1, 5.9), (x + 0.42, -3.05, 5.3), (x - 0.42, -3.05, 5.3)]]
        p.grid(rings, IRON, METAL, smooth=False)
        p.box((x, -2.44, 6.6), (1.7, 0.06, 0.7), BRASS, bevel=0.015)
        for sx in (-1, 1):
            p.rivet((x + sx * 0.75, -2.48, 6.85), NY, 0.05, BRASS)
            p.rivet((x + sx * 0.75, -2.48, 6.35), NY, 0.05, BRASS)
        p.cyl((x + 0.9, -2.5, 6.6), (x + 1.3, -2.9, 7.3), 0.035, STEEL, sides=5)
        p.sphere((x + 1.3, -2.9, 7.3), 0.09, OXBLOOD, mat=PAINT, rings=3, sides=6)
    # Loose parts on the slope.
    for k in range(9):
        x = -18.5 + k * 4.5 + (p.rng.random() - 0.5) * 1.5
        y = -1.2 + p.rng.random() * 2.6
        z = 6.4 + (y + 2.3) * math.tan(slope) + 0.08
        kind = k % 3
        with p.at(T(x, y, z) @ R('X', slope) @ R('Z', p.rng.random() * 3.0)):
            if kind == 0:
                mini_gear(p, (0, 0, 0.02), Z, 0.5 + 0.2 * p.rng.random(), 10, BRASS, thick=0.12)
            elif kind == 1:
                p.box((0, 0, 0.02), (1.3, 0.9, 0.06), STEEL, bevel=0.01)
                p.box((0.15, 0.1, 0.08), (1.2, 0.8, 0.06), BRASS, rot=(0, 0, 0.3))
            else:
                for j in range(3):
                    p.box((j * 0.3 - 0.3, 0.1 * j, 0.07), (0.24, 0.7, 0.14), p.vary(BRASS, 0.08), taper=0.85,
                          rot=(0, 0, 0.15 * j))
    return p


# ====================================================================== cranes
@piece('CraneMast', foot=('circle', 2.0))
def crane_mast():
    """A lattice crane mast (within r 2.0, a stone pad to r 2.4, Z 0..16): four
    angle-iron legs with riveted cross bracing, a ladder up the front with a
    rest landing at Z 8, a machinery deck and a toothed slewing ring at Z 16."""
    p = P('CraneMast', rust=0.65, verd=0.45)
    with p.as_kind(K_STONE):
        p.turned((0, 0, 0), Z, [(2.4, 0), (2.4, 0.3), (2.2, 0.42)], STONE, sides=8, mat=PAINT, smooth=False,
                 phase=PI / 8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((sx * 1.2, sy * 1.2, 0.47), (0.6, 0.6, 0.1), IRON, bevel=0.02)
            for (bx, by) in ((0.2, 0.0), (0.0, 0.2), (-0.15, -0.15)):
                p.bolt((sx * (1.2 + bx), sy * (1.2 + by), 0.52), Z, 0.04, 0.05)
    lattice_tower(p, 0, 0, 0.5, 14.5, 1.2, 2.0, IRON, leg=0.24, brace=0.14, t=0.035, hw1=1.05, cross=True)
    ladder(p, (0, -1.32, 0.6), (0, -1.16, 14.6), NY, width=0.5, rung=0.45)
    p.box((0.0, -1.85, 8.0), (1.8, 1.0, 0.06), STEEL_DARK)
    for sx in (-1, 1):
        p.flat((sx * 0.85, -1.2, 7.3), (sx * 0.85, -2.3, 7.96), 0.08, 0.05, IRON, up=(sx, 0, 0))
        p.cyl((sx * 0.88, -2.32, 8.0), (sx * 0.88, -2.32, 9.0), 0.025, IRON, sides=4)
        p.cyl((sx * 0.88, -1.4, 9.0), (sx * 0.88, -2.32, 9.0), 0.025, BRASS, sides=4)
    p.cyl((-0.88, -2.32, 9.0), (0.88, -2.32, 9.0), 0.025, BRASS, sides=4)
    # Machinery deck and slewing ring.
    p.box((0, 0, 14.62), (2.5, 2.5, 0.24), IRON, bevel=0.04)
    p.turned((0, 0, 14.74), Z, [(1.25, 0), (1.25, 0.5), (1.45, 0.62), (1.5, 0.7)], IRON, sides=20)
    p.annulus((0, 0, 15.72), Z, 1.15, 1.6, 0.14, STEEL_DARK, sides=24)
    for k in range(28):
        a = TAU * k / 28
        p.box((math.cos(a) * 1.63, math.sin(a) * 1.63, 15.72), (0.1, 0.12, 0.24), BRASS, rot=(0, 0, a))
    p.turned((0, 0, 15.86), Z, [(1.1, 0), (1.1, 0.1), (0.5, 0.14)], IRON, sides=20)
    p.rivet_ring((0, 0, 15.0), Z, 1.25, 16, 0.05, STEEL)
    p.box((0.9, -1.3, 14.95), (0.5, 0.3, 0.4), BRASS, bevel=0.03)
    return p


@piece('CraneJib')
def crane_jib():
    """The slewing crane top (origin at the slewing pivot on the mast top): a
    turntable, a brass operator cab with glass, a machinery house, a
    triangular lattice jib along -Y to Y -14, a counter-jib to Y +5 with
    counterweight slabs and a winch drum, an A-frame to a peak at Z +4 with
    tie bars to the jib and the counter-jib, and a trolley at Y -12 whose
    cables drop to a hook block at Z -7."""
    p = P('CraneJib', rust=0.6, verd=0.45, ground=None, grime=None, ao_dist=0.9)
    p.turned((0, 0, 0), Z, [(1.5, 0), (1.62, 0.06), (1.62, 0.24), (1.5, 0.3)], IRON, sides=24)
    p.box((0, 0.6, 0.38), (2.6, 4.4, 0.16), IRON, bevel=0.03)
    # Cab (-X front).
    with p.at(T(-1.25, -1.3, 0.46)):
        p.box((0, 0, 0.45), (1.3, 1.8, 0.9), BRASS, bevel=0.04)
        for (c, s) in (((0, -0.9, 1.3), (1.2, 0.04, 0.8)), ((-0.65, 0, 1.3), (0.04, 1.7, 0.8)),
                       ((0.65, -0.35, 1.3), (0.04, 1.0, 0.8))):
            p.box(c, s, GLASS_C, mat=GLASS)
        for (x, y) in ((-0.62, -0.87), (0.62, -0.87), (-0.62, 0.87), (0.62, 0.87), (0.0, -0.9), (-0.65, 0.0)):
            p.box((x, y, 1.3), (0.08, 0.08, 0.84), BRASS)
        p.box((0, 0.5, 1.3), (1.26, 0.76, 0.8), BRASS, bevel=0.02)
        p.box((0, -0.05, 1.78), (1.5, 2.0, 0.12), IRON, bevel=0.03)
        p.rivets((-0.6, -0.92, 0.75), (0.6, -0.92, 0.75), NY, 0.24, 0.035, BRASS)
        p.rivets((-0.67, -0.8, 0.75), (-0.67, 0.8, 0.75), (-1, 0, 0), 0.24, 0.035, BRASS)
        p.cage_lamp((0.0, -0.95, 1.95), r=0.12, h=0.26, hood=False)
    # Machinery house.
    p.box((0.55, 1.2, 1.36), (1.5, 2.2, 1.8), SLATE, mat=PAINT, bevel=0.05)
    for k in range(4):
        p.box((1.31, 0.6 + k * 0.4, 1.5), (0.04, 0.3, 0.8), IRON)
    p.rivets((-0.15, 0.09, 2.1), (1.25, 0.09, 2.1), NY, 0.28, 0.04, BRASS)
    p.turned((0.9, 1.9, 2.26), Z, [(0.14, 0), (0.14, 0.7), (0.2, 0.74), (0.2, 0.82)], SOOT_IRON, sides=8)
    # Jib: two bottom chords, one top chord, lacing.
    def top(y):
        return 1.9 + (1.05 - 1.9) * (-1.5 - y) / 12.5

    def half(y):
        return 0.6 + (0.3 - 0.6) * (-1.5 - y) / 12.5

    ys = [-1.5 - 12.5 * i / 9 for i in range(10)]
    for s in (-1, 1):
        p.flat((s * half(ys[0]), ys[0], 0.6), (s * half(ys[-1]), ys[-1], 0.6), 0.14, 0.14, IRON, up=Z)
    p.flat((0, ys[0], top(ys[0])), (0, ys[-1], top(ys[-1])), 0.16, 0.16, IRON, up=Z)
    for i, (ya, yb) in enumerate(zip(ys, ys[1:])):
        for s in (-1, 1):
            a = Vector((s * half(ya), ya, 0.6))
            b = Vector((0, yb, top(yb)))
            c = Vector((0, ya, top(ya)))
            p.flat(a, b, 0.09, 0.04, IRON, up=(s, 0, 0.4))
            p.flat(a, c, 0.08, 0.04, IRON, up=(s, 0, 0.4))
        p.flat((-half(ya), ya, 0.6), (half(ya), ya, 0.6), 0.08, 0.05, IRON, up=Z)
        p.flat((-half(ya), ya, 0.6), (half(yb), yb, 0.6), 0.07, 0.04, IRON, up=Z)
    p.box((0, -14.05, 0.8), (0.8, 0.2, 0.7), IRON, bevel=0.03)
    p.stripes((-0.4, -14.151, 0.62), X, Z, NY, 0.8, 0.14, pitch=0.2, slant=0.8)
    p.turned((-0.12, -13.8, 1.05), X, [(0.26, 0), (0.3, 0.03), (0.24, 0.12), (0.3, 0.21), (0.26, 0.24)], BRASS,
             sides=12, up=Z)
    # Counter-jib, counterweights, winch.
    for s in (-1, 1):
        p.ibeam((s * 0.75, 0.0, 0.62), (s * 0.75, 5.0, 0.62), 0.36, 0.22, 0.04, IRON, up=Z)
    for y in (2.9, 5.0):
        p.box((0, y, 0.62), (1.7, 0.14, 0.34), IRON)
    with p.as_kind(K_STONE):
        for k in range(3):
            p.box((0, 4.2, 0.1 + k * 0.52 - 0.52), (2.2, 1.4, 0.5), p.vary(STONE, 0.08), mat=PAINT, bevel=0.04)
    p.stripes((-1.1, 4.901, 0.62 - 1.0), X, Z, Y, 2.2, 0.14, pitch=0.3, slant=1.0)
    for s in (-1, 1):
        p.cyl((s * 0.9, 4.2, -0.7), (s * 0.9, 4.2, 0.9), 0.04, STEEL, sides=5)
    p.turned((-0.6, 3.1, 1.25), X, [(0.5, 0), (0.5, 0.05), (0.34, 0.07), (0.34, 1.13), (0.5, 1.15), (0.5, 1.2)],
             STEEL_DARK, sides=14, up=Z)
    for s in (-1, 1):
        p.box((s * 0.68, 3.1, 1.0), (0.1, 0.5, 0.7), IRON, bevel=0.02)
    # A-frame and ties.
    peak = Vector((0, 0.6, 4.0))
    for s in (-1, 1):
        p.flat((s * 0.9, -0.4, 0.46), peak + Vector((s * 0.08, 0, 0)), 0.16, 0.1, IRON, up=(s, 0, 0))
        p.flat((s * 0.9, 2.3, 0.46), peak + Vector((s * 0.08, 0, 0)), 0.14, 0.1, IRON, up=(s, 0, 0))
        p.cyl(peak + Vector((s * 0.12, 0, 0)), (s * 0.7, 4.95, 0.8), 0.035, STEEL_DARK, sides=5)
    p.turned(peak - Vector((0.2, 0, 0)), X, [(0.22, 0), (0.26, 0.03), (0.2, 0.2), (0.26, 0.37), (0.22, 0.4)], BRASS,
             sides=12, up=Z)
    for (y, z) in ((ys[6], top(ys[6])), (ys[9], top(ys[9]))):
        p.cyl(peak, (0, y, z + 0.06), 0.04, STEEL_DARK, sides=5)
    p.cyl((0, 3.1, 1.6), peak + Vector((0, 0, 0.22)), 0.02, STEEL_DARK, sides=4)
    p.cyl(peak + Vector((0, 0, 0.22)), (0, -13.8, 1.36), 0.02, STEEL_DARK, sides=4)
    # Trolley at Y -12 and the hook block.
    ty = -12.0
    p.box((0, ty, 0.42), (1.0, 0.9, 0.14), IRON, bevel=0.03)
    for s in (-1, 1):
        for dy in (-0.3, 0.3):
            p.turned((s * (half(ty) + 0.02), ty + dy, 0.74), (s, 0, 0), [(0.11, -0.05), (0.11, 0.05)], STEEL, sides=8)
            p.box((s * (half(ty) + 0.12), ty + dy, 0.58), (0.05, 0.1, 0.4), IRON)
    p.turned((-0.15, ty, 0.3), X, [(0.2, 0), (0.24, 0.03), (0.18, 0.15), (0.24, 0.27), (0.2, 0.3)], BRASS, sides=10,
             up=Z)
    for s in (-1, 1):
        p.cyl((s * 0.2, ty, 0.3), (s * 0.2, ty, -5.9), 0.022, STEEL_DARK, sides=4)
    with p.at(T(0, ty, -5.9)):
        for sy in (-1, 1):
            p.turned((0, sy * 0.14 - 0.03, -0.3), Y, [(0.3, 0), (0.32, 0.01), (0.32, 0.05), (0.3, 0.06)], IRON,
                     sides=12, up=Z)
            p.stripes((-0.22, sy * 0.172, -0.38), X, Z, (0, sy, 0), 0.44, 0.16, pitch=0.11, slant=0.7)
        p.turned((0, -0.06, -0.3), Y, [(0.34, 0), (0.37, 0.02), (0.33, 0.06), (0.37, 0.1), (0.34, 0.12)], BRASS,
                 sides=14, up=Z)
        p.box((0, 0, -0.6), (0.3, 0.36, 0.14), IRON, bevel=0.02)
        hook(p, (0, 0, -0.6), scale=0.55)
    return p


# =========================================================== storm and coil props
def insulator_stack(p, c, r, h, n, color=CERAMIC, sides=12, core=0.4):
    """A stack of ceramic insulator sheds from c up h."""
    dz = h / n
    prof = [(r * core, 0)]
    for i in range(n):
        z = i * dz
        prof += [(r * core, z + dz * 0.1), (r, z + dz * 0.42), (r * 0.94, z + dz * 0.6), (r * core, z + dz * 0.9)]
    prof.append((r * core, h))
    with p.as_kind(K_SOFT):
        return p.turned(c, Z, prof, color, sides=sides, mat=PAINT)


def helix(c, R_, z0, z1, turns, seg=10, R1=None):
    c = Vector(c)
    n = int(turns * seg)
    out = []
    for i in range(n + 1):
        t = i / n
        a = TAU * turns * t
        rr = R_ if R1 is None else R_ + (R1 - R_) * t
        out.append(c + Vector((math.cos(a) * rr, math.sin(a) * rr, z0 + (z1 - z0) * t)))
    return out


def storm_cell(p, c, r, h, glow=STORM_DIM):
    """A glass storm cell standing at c: brass caps, tie rods, a copper coil
    round a small glowing core, a terminal on top. Total height h + 0.5."""
    x, y, z = c
    p.turned((x, y, z), Z, [(r * 1.12, 0), (r * 1.12, 0.14), (r * 1.02, 0.2), (r * 0.9, 0.22)], BRASS, sides=14)
    p.turned((x, y, z + 0.2), Z, [(r, 0), (r, h - 0.2)], GLASS_STORM, sides=14, mat=GLASS, cap0=False, cap1=False)
    p.cyl((x, y, z + 0.3), (x, y, z + h - 0.1), r * 0.16, glow, sides=6, mat=GLOW)
    p.tube(helix((x, y, 0), r * 0.42, z + 0.35, z + h - 0.15, 5, seg=8), r * 0.07, COPPER, sides=4)
    p.turned((x, y, z + h), Z, [(r * 0.9, -0.02), (r * 1.02, 0.0), (r * 1.12, 0.06), (r * 1.12, 0.18), (r * 0.6, 0.26),
                                (r * 0.3, 0.28)], BRASS, sides=14)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        dx, dy = math.cos(a) * r * 1.06, math.sin(a) * r * 1.06
        p.cyl((x + dx, y + dy, z + 0.1), (x + dx, y + dy, z + h + 0.1), 0.03, BRASS, sides=4)
    insulator_stack(p, (x, y, z + h + 0.26), r * 0.3, 0.16, 2, sides=8)
    p.turned((x, y, z + h + 0.4), Z, [(0.05, 0), (0.05, 0.06), (0.08, 0.07), (0.08, 0.1)], BRASS, sides=8)


@piece('CoilPylon', foot=('circle', 1.0))
def coil_pylon():
    """A storm coil pylon (r 1.0, Z 0..10.5): a bolted iron pedestal, a ceramic
    insulator stack, a copper winding round an enamelled core between brass
    collars, a second insulator, a corona ring and a small blue glow tip at
    Z 10.4."""
    p = P('CoilPylon', rust=0.55, verd=0.6)
    p.turned((0, 0, 0), Z, [(0.95, 0), (0.95, 0.2), (0.8, 0.3), (0.62, 0.8), (0.7, 0.86), (0.7, 0.96)], IRON, sides=8,
             smooth=False, phase=PI / 8)
    for k in range(8):
        a = TAU * k / 8
        p.bolt((math.cos(a) * 0.82, math.sin(a) * 0.82, 0.22), Z, 0.05, 0.06)
    p.stripes((-0.3, -0.71, 0.4), X, Z, (0, -1, 0.3), 0.6, 0.1, pitch=0.15, slant=0.8)
    insulator_stack(p, (0, 0, 0.96), 0.6, 2.9, 8, sides=14)
    p.turned((0, 0, 3.86), Z, [(0.3, 0), (0.5, 0.06), (0.5, 0.26), (0.36, 0.34)], BRASS, sides=14)
    with p.as_kind(K_PAINT):
        p.cyl((0, 0, 4.1), (0, 0, 8.2), 0.3, ENAMEL, sides=12, mat=PAINT)
    p.tube(helix((0, 0, 0), 0.4, 4.3, 8.05, 12, seg=10), 0.085, COPPER, sides=5)
    p.turned((0, 0, 8.05), Z, [(0.36, 0), (0.5, 0.08), (0.5, 0.26), (0.3, 0.34)], BRASS, sides=14)
    insulator_stack(p, (0, 0, 8.39), 0.42, 1.0, 3, sides=12)
    p.turned((0, 0, 9.39), Z, [(0.2, 0), (0.26, 0.05), (0.26, 0.14), (0.1, 0.2), (0.07, 0.75)], BRASS, sides=10)
    p.torus((0, 0, 9.7), Z, 0.6, 0.07, BRASS, seg=18, sides=6)
    for k in range(3):
        a = TAU * k / 3
        p.cyl((math.cos(a) * 0.1, math.sin(a) * 0.1, 9.6), (math.cos(a) * 0.58, math.sin(a) * 0.58, 9.7), 0.025,
              BRASS, sides=4)
    p.sphere((0, 0, 10.28), 0.16, STORM, mat=GLOW, rings=5, sides=8)
    p.turned((0, 0, 10.38), Z, [(0.05, 0), (0.012, 0.12)], BRASS, sides=5)
    for z in (4.6, 6.2, 7.7):
        p.tube([(0.47, 0, z), (0.6, 0, z - 0.1), (0.62, 0, 3.95)], 0.02, RUBBER, sides=4, mat=PAINT)
    return p


@piece('LightningRod', foot=('circle', 0.8))
def lightning_rod():
    """A lightning rod (r 0.8, Z 0..9.5): a braced tripod foot, a tapering iron
    mast, a ceramic insulator group, a brass ball and spike, and a copper
    down-conductor to a ground plate."""
    p = P('LightningRod', rust=0.7, verd=0.7)
    for k in range(3):
        a = TAU * k / 3 + PI / 2
        d = Vector((math.cos(a), math.sin(a), 0))
        p.flat(d * 0.72 + Vector((0, 0, 0.05)), d * 0.08 + Vector((0, 0, 1.5)), 0.1, 0.06, IRON, up=d)
        p.box(d * 0.68 + Vector((0, 0, 0.03)), (0.3, 0.2, 0.06), IRON, rot=(0, 0, a))
        p.bolt(d * 0.72 + Vector((0, 0, 0.06)), Z, 0.035, 0.04)
    p.turned((0, 0, 0), Z, [(0.14, 0), (0.14, 1.5), (0.18, 1.54), (0.18, 1.66), (0.1, 1.7), (0.08, 5.0)], IRON,
             sides=10)
    insulator_stack(p, (0, 0, 5.0), 0.36, 1.2, 4, sides=12)
    p.turned((0, 0, 6.2), Z, [(0.16, 0), (0.2, 0.05), (0.2, 0.14), (0.07, 0.2), (0.055, 2.0)], BRASS, sides=10)
    p.sphere((0, 0, 8.4), 0.26, BRASS, rings=6, sides=12)
    p.turned((0, 0, 8.62), Z, [(0.07, 0), (0.05, 0.3), (0.012, 0.88)], BRASS, sides=6)
    for k in range(3):
        a = TAU * k / 3
        p.turned((0, 0, 8.5), (math.cos(a), math.sin(a), 1.4), [(0.03, 0.22), (0.008, 0.6)], BRASS, sides=4)
    cond = [(0.2, 0, 6.3), (0.42, 0, 6.0), (0.44, 0, 5.0), (0.2, 0, 4.7)] + \
        [(math.cos(a) * 0.12, math.sin(a) * 0.12, 4.7 - a * 0.6) for a in (k * 0.9 for k in range(1, 8))] + \
        [(0.5, 0.2, 0.06), (0.7, 0.3, 0.04)]
    p.tube(cond, 0.022, COPPER, sides=4)
    p.box((0.74, 0.32, 0.03), (0.3, 0.3, 0.05), COPPER, rot=(0, 0, 0.4))
    return p


@piece('ArcPost', foot=('circle', 0.6))
def arc_post():
    """An arc fence post (r 0.6, Z 0..7.2): a bolted iron pedestal, an iron
    core carrying three groups of ceramic insulators between copper and brass
    rings, a brass cradle, and a storm-blue glow sphere at Z 6.9."""
    p = P('ArcPost', rust=0.55, verd=0.6)
    p.turned((0, 0, 0), Z, [(0.58, 0), (0.58, 0.14), (0.46, 0.22), (0.3, 0.7), (0.36, 0.74), (0.36, 0.84)], IRON,
             sides=8, smooth=False, phase=PI / 8)
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        p.bolt((math.cos(a) * 0.48, math.sin(a) * 0.48, 0.16), Z, 0.04, 0.05)
    p.cyl((0, 0, 0.8), (0, 0, 6.3), 0.12, IRON, sides=8)
    z = 0.84
    for g in range(3):
        insulator_stack(p, (0, 0, z), 0.42, 1.4, 4, sides=12)
        z += 1.4
        p.turned((0, 0, z), Z, [(0.2, 0), (0.34, 0.05), (0.34, 0.2), (0.2, 0.25)], COPPER if g % 2 == 0 else BRASS,
                 sides=12)
        p.torus((0, 0, z + 0.125), Z, 0.4, 0.035, BRASS, seg=14, sides=4)
        z += 0.25
    p.turned((0, 0, z), Z, [(0.16, 0), (0.16, 0.3), (0.3, 0.5), (0.34, 0.62), (0.3, 0.64), (0.14, 0.56)], BRASS,
             sides=12, cap1=False)
    p.sphere((0, 0, 6.9), 0.42, STORM, mat=GLOW, rings=6, sides=12, squash=0.71)
    for k in range(4):
        a = TAU * k / 4
        pts = [(math.cos(a) * rr, math.sin(a) * rr, zz) for (rr, zz) in ((0.33, 6.42), (0.46, 6.7), (0.47, 6.95),
                                                                         (0.36, 7.15))]
        p.tube(pts, 0.022, BRASS, sides=4)
    return p


@piece('CellRackSmall', foot=('box', 2.5, 1.0))
def cell_rack_small():
    """A small storm cell rack (X +-2.5, Y +-1, Z 0..3.5): a riveted slate plinth
    with vents, three glass storm cells with brass caps and small blue cores,
    a copper bus bar on insulators, cables to a junction box with a gauge."""
    p = P('CellRackSmall', rust=0.5, verd=0.5)
    p.box((0, 0, 0.4), (5.0, 2.0, 0.8), SLATE, mat=PAINT, bevel=0.05)
    p.box((0, 0, 0.84), (5.1, 2.1, 0.08), IRON, bevel=0.02)
    p.rivets((-2.3, -1.005, 0.7), (2.3, -1.005, 0.7), NY, 0.4, 0.04, BRASS)
    p.rivets((-2.3, -1.005, 0.1), (2.3, -1.005, 0.1), NY, 0.4, 0.04, BRASS)
    for x in (-1.5, 1.5):
        p.grille((x, -1.0, 0.4), NY, 0.9, 0.34, 4, IRON, horizontal=True)
    p.stripes((-0.5, -1.003, 0.3), X, Z, NY, 1.0, 0.16, pitch=0.2, slant=0.8)
    for k in range(3):
        storm_cell(p, (-1.45 + k * 1.45, 0.1, 0.88), 0.55, 1.9)
    for s in (-1, 1):
        p.lbeam((s * 2.35, 0.85, 0.88), (s * 2.35, 0.85, 3.35), 0.14, 0.03, IRON, roll=0 if s > 0 else PI / 2)
    p.box((0, 0.85, 3.35), (4.9, 0.14, 0.1), IRON)
    p.box((0, 0.1, 3.36), (4.2, 0.12, 0.05), COPPER)
    for k in range(3):
        x = -1.45 + k * 1.45
        p.cyl((x, 0.1, 3.28), (x, 0.1, 3.34), 0.05, BRASS, sides=6)
        p.box((x, 0.5, 3.36), (0.08, 0.75, 0.05), COPPER)
    p.box((2.2, -0.75, 1.3), (0.5, 0.36, 0.8), SLATE, mat=PAINT, bevel=0.03)
    p.gauge((2.2, -0.94, 1.45), NY, 0.14)
    p.cyl((2.2, -0.94, 1.1), (2.2, -1.0, 1.1), 0.05, OXBLOOD, sides=6, mat=PAINT)
    p.tube(catenary((2.1, 0.1, 3.36), (2.3, -0.6, 1.7), 0.25, 6), 0.035, RUBBER, sides=4, mat=PAINT)
    p.tube(catenary((-2.1, 0.1, 3.36), (-2.45, 0.6, 0.9), 0.3, 6), 0.035, RUBBER, sides=4, mat=PAINT)
    return p


@piece('CellRack', foot=('box', 3.0, 1.4))
def cell_rack():
    """The big storm cell rack (X +-3, Y +-1.4, Z 0..5.2): a riveted plinth with
    vents and a hazard plate, four big glass cells, a frame with a canopy and
    twin bus bars, a gauge panel, a knife switch and heavy cables."""
    p = P('CellRack', rust=0.5, verd=0.5)
    p.box((0, 0, 0.5), (6.0, 2.8, 1.0), SLATE, mat=PAINT, bevel=0.06)
    p.box((0, 0, 1.05), (6.1, 2.9, 0.1), IRON, bevel=0.03)
    p.rivets((-2.8, -1.405, 0.88), (2.8, -1.405, 0.88), NY, 0.4, 0.045, BRASS)
    p.rivets((-2.8, -1.405, 0.12), (2.8, -1.405, 0.12), NY, 0.4, 0.045, BRASS)
    for x in (-2.1, 2.1):
        p.grille((x, -1.4, 0.5), NY, 1.0, 0.44, 5, IRON, horizontal=True)
    p.box((0, -1.42, 0.5), (1.3, 0.04, 0.5), IRON, bevel=0.01)
    p.stripes((-0.6, -1.4405, 0.3), X, Z, NY, 1.2, 0.12, pitch=0.2, slant=0.8)
    p.stripes((-0.6, -1.4405, 0.58), X, Z, NY, 1.2, 0.12, pitch=0.2, slant=0.8)
    for k in range(4):
        storm_cell(p, (-2.1 + k * 1.4, 0.15, 1.1), 0.6, 2.9)
    for s in (-1, 1):
        for y in (-1.25, 1.25):
            p.lbeam((s * 2.85, y, 1.1), (s * 2.85, y, 4.9), 0.16, 0.035, IRON,
                    roll=LEG_ROLL[(s, 1 if y > 0 else -1)])
        p.flat((s * 2.85, -1.25, 4.0), (s * 2.85, 1.25, 4.0), 0.12, 0.04, IRON, up=(s, 0, 0))
        p.flat((s * 2.86, -1.2, 1.2), (s * 2.86, 1.2, 3.9), 0.08, 0.03, IRON, up=(s, 0, 0))
    p.box((0, 0, 4.98), (6.1, 2.9, 0.1), IRON, bevel=0.03)
    p.box((0, 0, 5.1), (5.4, 2.2, 0.14), SLATE, mat=PAINT, bevel=0.04)
    for y in (-0.15, 0.45):
        p.box((0, y, 4.72), (5.4, 0.12, 0.06), COPPER)
        for k in range(3):
            x = -2.0 + k * 2.0
            insulator_stack(p, (x, y, 4.75), 0.1, 0.2, 2, sides=6)
    for k in range(4):
        x = -2.1 + k * 1.4
        p.cyl((x, 0.15, 4.5), (x, 0.15 + (0.3 if k % 2 else -0.3), 4.7), 0.03, COPPER, sides=4)
    p.box((2.3, -1.3, 2.3), (0.9, 0.12, 1.5), BRASS, bevel=0.03)
    for k in range(3):
        p.gauge((2.3, -1.38, 2.75 - k * 0.42), NY, 0.16)
    p.box((-2.4, -1.3, 2.2), (0.6, 0.1, 0.9), SLATE, mat=PAINT, bevel=0.02)
    p.cyl((-2.4, -1.36, 2.0), (-2.4, -1.7, 2.5), 0.03, COPPER, sides=4)
    p.sphere((-2.4, -1.7, 2.5), 0.07, OXBLOOD, mat=PAINT, rings=3, sides=6)
    for sx in (-1, 1):
        p.box((-2.4 + sx * 0.16, -1.37, 2.0), (0.06, 0.06, 0.12), COPPER)
    p.tube(catenary((2.6, 0.45, 4.72), (2.95, 1.2, 1.2), 0.5, 6), 0.05, RUBBER, sides=5, mat=PAINT)
    p.tube(catenary((-2.6, -0.15, 4.72), (-2.4, -1.2, 2.7), 0.4, 6), 0.05, RUBBER, sides=5, mat=PAINT)
    return p


@piece('Grinder', foot=('circle', 0.9), knee=1.6)
def grinder():
    """A grinding wheel station (r 0.9, Z 0..1.6): a cast pedestal, a stone wheel
    under an iron guard, bearings, a tool rest, a water trough, and a foot
    treadle with its crank rod."""
    p = P('Grinder', rust=0.6, verd=0.4)
    p.box((0, 0.05, 0.05), (0.9, 1.1, 0.1), IRON, bevel=0.03)
    p.box((0, 0.1, 0.5), (0.5, 0.5, 0.8), IRON, bevel=0.05, taper=0.75)
    p.box((0, 0.1, 0.93), (0.8, 0.5, 0.08), IRON, bevel=0.02)
    with p.as_kind(K_STONE):
        p.turned((-0.1, 0.1, 1.07), X, [(0.44, 0), (0.48, 0.03), (0.48, 0.17), (0.44, 0.2)], STONE_LIGHT, sides=18,
                 mat=PAINT, up=Z)
    p.turned((-0.14, 0.1, 1.07), X, [(0.14, 0), (0.14, 0.28)], BRASS, sides=10)
    p.cyl((-0.42, 0.1, 1.07), (0.48, 0.1, 1.07), 0.035, STEEL, sides=6)
    for s in (-1, 1):
        p.box((s * 0.33, 0.1, 1.0), (0.1, 0.2, 0.2), IRON, bevel=0.02)
    p.arc_block((0, 0.1, 1.07), X, 0.5, 0.53, 0.14, 0.15, PI - 0.5, IRON, seg=7, up=Z)
    for s in (-1, 1):
        p.arc_block((s * 0.13, 0.1, 1.07), X, 0.2, 0.53, 0.012, 0.15, PI - 0.5, IRON, seg=7, up=Z)
    p.box((0, -0.42, 1.02), (0.4, 0.14, 0.03), STEEL_DARK)
    p.flat((0, -0.4, 1.0), (0, -0.16, 0.9), 0.08, 0.04, IRON, up=X)
    p.box((0, 0.1, 0.62), (0.36, 0.9, 0.05), COPPER)
    for sy in (-1, 1):
        p.box((0, 0.1 + sy * 0.45, 0.7), (0.36, 0.03, 0.2), COPPER)
    for s in (-1, 1):
        p.box((s * 0.18, 0.1, 0.7), (0.03, 0.9, 0.2), COPPER)
    p.box((0.3, -0.5, 0.12), (0.2, 0.6, 0.04), STEEL_DARK, rot=(0.2, 0, 0))
    p.cyl((0.3, -0.25, 0.1), (0.46, 0.0, 0.95), 0.02, STEEL, sides=4)
    p.cyl((0.46, 0.1, 1.07), (0.46, 0.0, 0.95), 0.025, STEEL, sides=4)
    return p


# =============================================================== the plan yard
def blueprint(p, c, w, h, yaw, motif=0):
    """A blueprint sheet lying at c: blue paper, pale drawn lines as raised strips."""
    with p.at(T(c) @ R('Z', yaw)):
        with p.as_kind(K_SOFT):
            p.box((0, 0, 0.006), (w, h, 0.012), p.vary(BLUEPRINT, 0.06), mat=PAINT)
        with p.as_kind(K_PLAIN):
            z = 0.014
            for (a, b) in (((-w / 2 + 0.1, -h / 2 + 0.1), (w / 2 - 0.1, -h / 2 + 0.1)),
                           ((-w / 2 + 0.1, h / 2 - 0.1), (w / 2 - 0.1, h / 2 - 0.1)),
                           ((-w / 2 + 0.1, -h / 2 + 0.1), (-w / 2 + 0.1, h / 2 - 0.1)),
                           ((w / 2 - 0.1, -h / 2 + 0.1), (w / 2 - 0.1, h / 2 - 0.1))):
                p.flat((a[0], a[1], z), (b[0], b[1], z), 0.025, 0.004, PALE_LINE, up=Z, mat=PAINT)
            if motif == 0:
                washer(p, (-w * 0.18, 0, z - 0.002), Z, h * 0.26, h * 0.29, 0.004, PALE_LINE, sides=14)
                washer(p, (-w * 0.18, 0, z - 0.002), Z, h * 0.08, h * 0.1, 0.004, PALE_LINE, sides=8)
                for k in range(3):
                    p.flat((w * 0.12, -h * 0.25 + k * h * 0.25, z), (w * 0.4, -h * 0.25 + k * h * 0.25, z), 0.02, 0.004,
                           PALE_LINE, up=Z, mat=PAINT)
            else:
                p.flat((-w * 0.35, -h * 0.2, z), (w * 0.1, -h * 0.2, z), 0.02, 0.004, PALE_LINE, up=Z, mat=PAINT)
                p.flat((-w * 0.35, h * 0.2, z), (w * 0.1, h * 0.2, z), 0.02, 0.004, PALE_LINE, up=Z, mat=PAINT)
                p.flat((-w * 0.35, -h * 0.2, z), (-w * 0.35, h * 0.2, z), 0.02, 0.004, PALE_LINE, up=Z, mat=PAINT)
                p.flat((w * 0.1, -h * 0.2, z), (w * 0.1, h * 0.2, z), 0.02, 0.004, PALE_LINE, up=Z, mat=PAINT)
                p.flat((-w * 0.35, -h * 0.2, z), (w * 0.1, h * 0.2, z), 0.02, 0.004, PALE_LINE, up=Z, mat=PAINT)
                washer(p, (w * 0.28, 0, z - 0.002), Z, h * 0.12, h * 0.15, 0.004, PALE_LINE, sides=10)


@piece('BlueprintTable', foot=('box', 4.0, 2.5), knee=1.6)
def blueprint_table():
    """The drafting table (X +-4, Y +-2.5, Z 0..1.6): a heavy plank top on three
    timber trestles with iron brackets, blueprint sheets with pale drawn
    lines, rolled plans, brass compasses and rules, a T-square, ink pots, a
    gear paperweight and a small lamp (warm glow)."""
    p = P('BlueprintTable', rust=0.5, verd=0.45)
    top = 1.2
    with p.as_kind(K_SOFT):
        for x in (-3.0, 0.0, 3.0):
            for s in (-1, 1):
                p.flat((x, s * 2.2, 0.0), (x, s * 1.3, top - 0.2), 0.2, 0.16, TIMBER_DARK, up=X, mat=PAINT)
            p.box((x, 0, top - 0.14), (0.26, 4.5, 0.16), TIMBER_DARK, mat=PAINT, bevel=0.02)
            p.box((x, 0, 0.42), (0.14, 3.5, 0.12), TIMBER_DARK, mat=PAINT)
        p.box((0, 0, 0.42), (6.2, 0.14, 0.12), TIMBER_DARK, mat=PAINT)
        for k in range(9):
            y = -2.2 + (k + 0.5) * (4.4 / 9)
            p.box((0, y, top - 0.01), (7.6, 4.4 / 9 - 0.02, 0.1), p.vary(TIMBER, 0.1), mat=PAINT, bevel=0.012)
    for x in (-3.0, 0.0, 3.0):
        for s in (-1, 1):
            p.box((x + 0.105, s * 1.42, top - 0.3), (0.03, 0.5, 0.4), IRON)
            p.rivet((x + 0.12, s * 1.3, top - 0.2), X, 0.035, STEEL)
            p.rivet((x + 0.12, s * 1.55, top - 0.42), X, 0.035, STEEL)
    for s in (-1, 1):
        p.box((0, s * 2.21, top - 0.01), (7.64, 0.03, 0.12), IRON)
        p.box((s * 3.81, 0, top - 0.01), (0.03, 4.44, 0.12), IRON)
        p.rivets((-3.5, s * 2.228, top - 0.01), (3.5, s * 2.228, top - 0.01), (0, s, 0), 0.7, 0.03, BRASS)
    zt = top + 0.04
    blueprint(p, (-1.9, -0.5, zt), 2.9, 2.1, 0.08, 0)
    blueprint(p, (0.9, 0.5, zt + 0.012), 2.7, 2.0, -0.12, 1)
    blueprint(p, (-1.0, 1.0, zt + 0.004), 2.2, 1.6, 0.3, 1)
    blueprint(p, (2.4, -1.2, zt), 2.0, 1.5, 0.5, 0)
    with p.as_kind(K_SOFT):
        for k, (x, y, yaw, col) in enumerate(((3.2, 1.3, 0.1, BLUEPRINT), (3.2, 1.6, 0.05, CANVAS),
                                              (3.2, 1.45, 0.08, BLUEPRINT), (-3.2, 1.7, 1.5, CANVAS))):
            z = zt + 0.1 + (0.17 if k == 2 else 0)
            with p.at(T(x, y, z) @ R('Z', yaw)):
                p.cyl((-0.0, -0.9, 0), (0.0, 0.9, 0), 0.1, p.vary(col, 0.05), sides=8, mat=PAINT)
    # T-square, rule, compasses.
    with p.at(T(-0.4, -1.5, zt + 0.02) @ R('Z', 0.1)):
        with p.as_kind(K_SOFT):
            p.box((0, 0, 0), (3.0, 0.12, 0.02), TIMBER, mat=PAINT)
            p.box((-1.5, 0, 0.01), (0.14, 0.7, 0.04), TIMBER_DARK, mat=PAINT)
    p.box((1.2, -0.5, zt + 0.035), (1.4, 0.08, 0.012), BRASS, rot=(0, 0, 0.7))
    with p.at(T(-2.1, -0.5, zt + 0.03) @ R('Z', 0.5)):
        p.cyl((0, 0, 0.02), (0.55, 0.1, 0.02), 0.018, BRASS, sides=4)
        p.cyl((0, 0, 0.02), (0.55, -0.12, 0.02), 0.018, BRASS, sides=4)
        p.turned((0, 0, 0), Z, [(0.05, 0), (0.05, 0.05)], BRASS, sides=6, smooth=False)
        p.cyl((0, 0, 0.02), (-0.14, 0, 0.02), 0.022, BRASS, sides=4)
    mini_gear(p, (0.6, -1.3, zt + 0.06), Z, 0.22, 8, BRASS, thick=0.07)
    for (x, y) in ((1.9, 1.5), (2.15, 1.62)):
        p.turned((x, y, zt), Z, [(0.07, 0), (0.08, 0.1), (0.04, 0.13), (0.04, 0.16)], GLASS_C, sides=8, mat=GLASS)
        with p.as_kind(K_PLAIN):
            p.cyl((x, y, zt + 0.01), (x, y, zt + 0.08), 0.06, DARK, sides=6, mat=PAINT)
    p.turned((-3.3, -1.6, zt), Z, [(0.14, 0), (0.14, 0.03), (0.04, 0.06), (0.03, 0.2)], BRASS, sides=8)
    p.turned((-3.3, -1.6, zt + 0.19), Z, [(0.17, 0.0), (0.15, 0.04), (0.05, 0.14), (0.03, 0.16)], BRASS, sides=10,
             cap0=False)
    p.sphere((-3.3, -1.6, zt + 0.21), 0.05, BULB, mat=GLOW, rings=3, sides=6)
    return p


@piece('ModelFrame', foot=('box', 2.0, 2.0))
def model_frame():
    """The model scaffold (X +-2, Y +-2, Z 0..7): an angle-iron cube with braced
    sides and an open front, a hoist beam and chains, and a half-built brass
    automaton on a jig: a riveted barrel torso with an open chest hatch, a
    domed head with dark glass eyes and a jaw grille, one arm hanging, the
    other shoulder an empty socket trailing cables."""
    p = P('ModelFrame', rust=0.6, verd=0.4)
    with p.as_kind(K_SOFT):
        for k in range(6):
            p.box((0, -1.6 + k * 0.64, 0.08), (3.8, 0.6, 0.1), p.vary(TIMBER, 0.1), mat=PAINT, bevel=0.012)
    lattice_tower(p, 0, 0, 0.13, 6.75, 1.86, 3.3, IRON, leg=0.2, brace=0.13, t=0.03, cross=False, skip_faces=(0,))
    p.flat((-1.86, -1.87, 6.68), (1.86, -1.87, 6.68), 0.13, 0.03, IRON, up=NY)
    p.ibeam((-1.9, 0.1, 6.86), (1.9, 0.1, 6.86), 0.28, 0.24, 0.04, IRON, up=Z)
    # Staging at the back and its ladder.
    with p.as_kind(K_SOFT):
        for k in range(2):
            p.box((0, 1.3 + k * 0.36, 3.5), (3.6, 0.34, 0.07), p.vary(TIMBER, 0.1), mat=PAINT)
    ladder(p, (1.3, 1.92, 0.2), (1.3, 1.92, 3.5), Y, width=0.45, rung=0.4)
    # The jig and the automaton.
    p.box((0, 0.1, 0.35), (1.5, 1.3, 0.4), IRON, bevel=0.05, taper=0.8)
    p.turned((0, 0.1, 0.55), Z, [(0.4, 0), (0.4, 0.5), (0.62, 0.6), (0.62, 0.75)], IRON, sides=12)
    p.turned((0, 0.1, 1.3), Z, [(0.6, 0), (0.78, 0.1), (0.86, 0.5), (0.95, 1.2), (1.05, 1.9), (1.0, 2.25), (0.7, 2.45),
                                (0.42, 2.5)], BRASS, sides=18, squash=0.82)
    for z in (1.75, 2.5, 3.2):
        rr = {1.75: 0.86, 2.5: 0.96, 3.2: 1.05}[z]
        p.torus((0, 0.1, z), Z, rr, 0.045, BRASS_DARK, seg=18, sides=4, stretch=0.82)
        for k in range(12):
            a = TAU * k / 12
            p.rivet((math.cos(a) * (rr + 0.02), 0.1 + math.sin(a) * (rr + 0.02) * 0.82, z + 0.1),
                    (math.cos(a), math.sin(a), 0), 0.04, BRASS)
    with p.as_kind(K_PLAIN):
        p.box((0, -0.7, 2.75), (0.6, 0.06, 0.62), DARK, mat=PAINT)
    mini_gear(p, (0.05, -0.71, 2.72), NY, 0.2, 8, BRASS_DARK, thick=0.05, up=Z)
    with p.at(T(-0.33, -0.76, 2.75) @ R('Z', -1.0)):
        p.box((-0.3, 0, 0), (0.6, 0.04, 0.66), BRASS, bevel=0.015)
        p.rivet((-0.5, -0.03, 0.2), NY, 0.03, BRASS)
        p.rivet((-0.5, -0.03, -0.2), NY, 0.03, BRASS)
    p.turned((0, 0.1, 3.78), Z, [(0.3, 0), (0.34, 0.06), (0.34, 0.22), (0.26, 0.3)], IRON, sides=12)
    # Head.
    with p.at(T(0, 0.05, 4.05)):
        p.turned((0, 0, 0), Z, [(0.42, 0), (0.56, 0.1), (0.6, 0.45), (0.56, 0.8), (0.4, 1.02), (0.16, 1.12),
                                (0.02, 1.14)], BRASS, sides=16, squash=0.92)
        p.torus((0, 0, 0.62), Z, 0.6, 0.04, BRASS_DARK, seg=16, sides=4, stretch=0.92)
        for s in (-1, 1):
            p.turned((s * 0.24, -0.5, 0.46), NY, [(0.14, 0), (0.17, 0.03), (0.17, 0.08), (0.12, 0.1)], BRASS_DARK,
                     sides=10, cap1=False)
            p.cyl((s * 0.24, -0.56, 0.46), (s * 0.24, -0.585, 0.46), 0.12, GLASS_STORM, sides=10, mat=GLASS,
                  smooth=False)
        p.grille((0, -0.53, 0.17), NY, 0.44, 0.2, 4, BRASS_DARK, depth=0.05)
        p.turned((0, 0, 1.1), Z, [(0.05, 0), (0.05, 0.12), (0.09, 0.14), (0.09, 0.2)], BRASS, sides=8)
    # Arm (the automaton's right, at -X) and the empty socket.
    sh = Vector((-1.12, 0.1, 3.42))
    p.sphere(sh, 0.4, BRASS, rings=5, sides=12)
    p.torus(sh + Vector((0.2, 0, 0)), X, 0.36, 0.05, BRASS_DARK, seg=12, sides=4)
    el = sh + Vector((-0.22, -0.1, -1.25))
    p.cyl(sh + Vector((-0.05, 0, -0.3)), el, 0.22, BRASS, sides=10)
    p.sphere(el - Vector((0, 0, 0.0)), 0.25, BRASS_DARK, rings=4, sides=10)
    wr = el + Vector((0.08, -0.35, -1.05))
    p.turned(el, wr - el, [(0.19, 0.1), (0.24, 0.4), (0.2, 0.9), (0.15, 1.05)], BRASS, sides=10)
    p.box(wr + Vector((0, -0.05, -0.2)), (0.3, 0.14, 0.3), BRASS, bevel=0.03)
    for k in range(4):
        q = wr + Vector((-0.12 + k * 0.08, -0.07, -0.34))
        p.tube([q, q + Vector((0, -0.04, -0.16)), q + Vector((0, 0.03, -0.3))], 0.03, BRASS, sides=4)
    so = Vector((1.05, 0.1, 3.42))
    p.turned(so - Vector((0.12, 0, 0)), X, [(0.36, 0), (0.4, 0.05), (0.4, 0.16), (0.3, 0.2)], BRASS_DARK, sides=12,
             cap1=False)
    with p.as_kind(K_PLAIN):
        p.cyl(so + Vector((0.06, 0, 0)), so + Vector((0.07, 0, 0)), 0.3, DARK, sides=10, mat=PAINT, smooth=False)
    for k, (dy, dz, col) in enumerate(((-0.1, 0.1, RUBBER), (0.1, 0.05, COPPER), (0.0, -0.12, RUBBER))):
        a = so + Vector((0.08, dy, dz))
        p.tube([a, a + Vector((0.3, dy, -0.1)), a + Vector((0.42, dy * 2, -0.6 - k * 0.2)),
                a + Vector((0.36, dy * 2.5, -1.0 - k * 0.3))], 0.03, col, sides=4,
               mat=PAINT if col == RUBBER else METAL)
    # Hoist: a chain block on the beam, chains to the shoulder lugs.
    p.box((0, 0.1, 6.6), (0.5, 0.36, 0.3), IRON, bevel=0.04)
    p.turned((-0.1, 0.1, 6.45), X, [(0.16, 0), (0.2, 0.03), (0.2, 0.17), (0.16, 0.2)], BRASS, sides=10, up=Z)
    p.chain([(0.0, 0.1, 6.3), (0.0, 0.1, 5.25)], link=0.24, w=0.14, r=0.03)
    p.torus((0, 0.1, 5.24), Y, 0.09, 0.03, IRON, seg=8, sides=4)
    for s in (-1, 1):
        p.chain([(0.0, 0.1, 5.2), (s * 0.62, 0.1, 3.82)], link=0.24, w=0.14, r=0.03)
        p.torus((s * 0.66, 0.1, 3.74), Y, 0.08, 0.03, STEEL, seg=8, sides=4)
    return p


# ============================================================ the steam shutters
@piece('ShutterFrame')
def shutter_frame():
    """A steam shutter's frame across an 11.2 yd passage (origin at the floor
    centre of the opening; the opening X +-5.6 is clear below Z 8.9): two
    riveted iron pillars at X 5.6..7.0 (Y +-0.9, Z 0..9) with guide channels,
    a thin hazard chevron band near the foot on the -Y face, and the housing
    lintel the shutter rolls into (X +-7.2, Y +-1.1, Z 8.9..12): a girder, a
    riveted drum cover, bearing boxes, a chain drive with a gear and a hand
    chain, and two dark round lamp sockets on the -Y face at X +-3, Z 10.2."""
    p = P('ShutterFrame', rust=0.6, verd=0.45, ao_dist=1.2)
    for s in (-1, 1):
        cx = s * 6.3
        p.box((cx, 0, 0.3), (1.4, 1.8, 0.6), IRON, bevel=0.06)
        p.box((cx, 0, 4.75), (1.2, 1.6, 8.3), IRON, bevel=0.05)
        p.box((s * 5.66, 0, 4.75), (0.12, 0.7, 8.3), STEEL_DARK)
        for sy in (-1, 1):
            p.box((s * 5.68, sy * 0.42, 4.75), (0.16, 0.14, 8.3), IRON)
        for x in (cx - 0.48, cx + 0.48):
            p.rivets((x, -0.805, 1.6), (x, -0.805, 8.5), NY, 0.75, 0.055, BRASS)
        for z in (3.2, 6.0):
            p.box((cx, -0.81, z), (1.24, 0.05, 0.3), IRON)
        p.stripes((cx - 0.6, -0.8055, 0.8), X, Z, NY, 1.2, 0.3, pitch=0.24, slant=0.8)
        p.box((cx, 0, 8.75), (1.4, 1.8, 0.3), IRON, bevel=0.05)
    # Housing lintel.
    p.box((0, 0, 9.3), (14.4, 2.2, 0.8), IRON, bevel=0.06)
    p.rivets((-7.0, -1.105, 9.05), (7.0, -1.105, 9.05), NY, 0.7, 0.055, BRASS)
    p.rivets((-7.0, -1.105, 9.58), (7.0, -1.105, 9.58), NY, 0.7, 0.055, BRASS)
    p.arc_block((0, 0, 10.5), X, 0.05, 1.08, 6.3, -0.25, PI + 0.25, IRON, seg=10, smooth=True, up=Z)
    p.box((0, 0, 10.1), (12.6, 2.1, 0.9), IRON)
    for x in (-4.2, -2.1, 0.0, 2.1, 4.2):
        p.arc_block((x, 0, 10.5), X, 1.06, 1.12, 0.09, -0.2, PI + 0.2, BRASS, seg=10, up=Z)
    for s in (-1, 1):
        p.box((s * 6.75, 0, 10.6), (0.9, 2.2, 2.2), IRON, bevel=0.07)
        p.plate((s * 6.75, -1.1, 10.7), NY, 0.7, 1.4, 0.04, IRON, spacing=0.3, rr=0.045, inset=0.08)
        p.turned((s * 3.0, -1.02, 10.2), NY, [(0.42, 0), (0.46, 0.03), (0.46, 0.08), (0.36, 0.08)], BRASS, sides=14,
                 cap1=False)
        with p.as_kind(K_PLAIN):
            p.cyl((s * 3.0, -1.06, 10.2), (s * 3.0, -1.07, 10.2), 0.36, DARK, sides=12, mat=PAINT, smooth=False)
    p.box((0, 0, 11.7), (13.0, 0.4, 0.3), IRON, bevel=0.03)
    for x in (-4.5, -1.5, 1.5, 4.5):
        p.box((x, 0, 11.62), (0.3, 0.7, 0.2), IRON)
    # Chain drive on the +X end.
    mini_gear(p, (5.6, -1.0, 10.9), NY, 0.62, 14, BRASS, thick=0.1, up=Z)
    mini_gear(p, (6.6, -1.0, 11.4), NY, 0.3, 9, BRASS_DARK, thick=0.1, up=Z)
    p.cyl((5.6, -0.9, 10.9), (5.6, -1.08, 10.9), 0.1, STEEL, sides=8)
    p.turned((6.6, -0.9, 9.9), NY, [(0.26, 0), (0.3, 0.02), (0.22, 0.09), (0.3, 0.16), (0.26, 0.18)], IRON, sides=10)
    for dx in (-0.25, 0.25):
        p.chain([(6.6 + dx, -1.0, 9.9), (6.6 + dx, -1.0, 5.2 + dx)], link=0.36, w=0.2, r=0.04)
    return p


@piece('ShutterPanel')
def shutter_panel():
    """The rolling steam shutter (origin at its BOTTOM centre; X +-5.6, Y +-0.25,
    Z 0..8.5; it rises along Z): riveted brass slats with verdigris in their
    grooves, a heavy bottom rail with a hazard chevron band and lifting lugs,
    steel guide shoes at both ends, a maker's plate."""
    p = P('ShutterPanel', verd=0.75, rust=0.5, ground=None, grime=None, ao_dist=0.5)
    p.box((0, 0, 0.3), (11.0, 0.46, 0.6), IRON, bevel=0.05)
    for sy in (-1, 1):
        p.stripes((-5.4, sy * 0.2305, 0.12) if sy < 0 else (5.4, sy * 0.2305, 0.12), X if sy < 0 else (-1, 0, 0), Z,
                  (0, sy, 0), 10.8, 0.36, pitch=0.36, slant=0.8)
    for x in (-3.5, 3.5):
        p.box((x, 0, 0.66), (0.5, 0.3, 0.12), IRON)
        p.torus((x, -0.2, 0.3), NY, 0.11, 0.035, STEEL, seg=8, sides=4)
    n = 24
    z0, z1 = 0.6, 8.5
    dz = (z1 - z0) / n
    for k in range(n):
        z = z0 + k * dz
        sec = [(-0.05, 0.0), (-0.12, dz * 0.3), (-0.12, dz * 0.68), (-0.05, dz * 0.97), (0.05, dz * 0.97),
               (0.12, dz * 0.68), (0.12, dz * 0.3), (0.05, 0.0)]
        col = p.vary(BRASS, 0.07)
        rings = [[(x, y, z + zz) for (y, zz) in sec] for x in (-5.42, 0.0, 5.42)]
        p.grid(rings, col, METAL, smooth=False)
        if k % 2 == 0:
            for x in (-5.0, -2.5, 0.0, 2.5, 5.0):
                p.rivet((x, -0.125, z + dz * 0.5), NY, 0.04, BRASS)
    for s in (-1, 1):
        p.box((s * 5.5, 0, 4.25), (0.2, 0.4, 8.5), STEEL_DARK)
        for z in (1.2, 4.25, 7.3):
            p.box((s * 5.52, 0, z), (0.18, 0.5, 0.6), BRASS, bevel=0.02)
    p.plate((0, -0.13, 4.6), NY, 1.2, 0.5, 0.03, BRASS_DARK, spacing=0.4, rr=0.03, inset=0.06)
    return p


# =============================================================== the cable lift
def spoked_wheel(p, c, axis, r, w, color=IRON, spokes=8, rim=0.22, sides=24, band=None, up=Z):
    """A big sheave or bull wheel: a grooved rim, round spokes, a hub with caps."""
    c = Vector(c)
    d = Vector(axis).normalized()
    p.annulus(c, d, r - rim, r, w / 2, color, sides=sides, chamfer=0.03, up=up)
    if band:
        p.annulus(c, d, r - 0.02, r + 0.05, w / 2 + 0.03, band, sides=sides, chamfer=0.015, up=up)
        p.annulus(c, d, r - 0.02, r + 0.0, w * 0.2, color, sides=sides, chamfer=0.01, up=up)
    m = basis(d, up)
    for k in range(spokes):
        a = TAU * k / spokes
        rd = (m @ Vector((math.cos(a), math.sin(a), 0, 0))).to_3d()
        p.cyl(c + rd * r * 0.16, c + rd * (r - rim + 0.02), r * 0.045, color, sides=5, r1=r * 0.035)
    p.turned(c - d * (w * 0.8), d, [(r * 0.15, 0), (r * 0.2, w * 0.15), (r * 0.2, w * 1.45), (r * 0.15, w * 1.6)],
             color, sides=12, up=up)
    for s in (-1, 1):
        p.turned(c + d * (s * w * 0.8), d * s, [(r * 0.11, 0), (r * 0.11, 0.05), (r * 0.06, 0.08)], BRASS, sides=8)


@piece('LiftStation', foot=('boxy', 6.0, 1.5, 10.0))
def lift_station():
    """HERO: the cable lift's winch house (X +-6, Y +-1.5 below 4.5, free to
    Y +10 behind): two riveted engine bays with lit arched windows on a stone
    plinth, a girder portal between them with a brass plate and lamps, the
    winch drum over the portal, the brass lift cage behind (gate facing -Y), a
    lattice headframe carrying two great pulley wheels to Z 16, a lightning
    rod to Z 20, and haul cables leaving toward +Y (stubs end at Y +10)."""
    p = P('LiftStation', rust=0.6, verd=0.5, ao_dist=1.2)
    with p.as_kind(K_STONE):
        for s in (-1, 1):
            p.box((s * 4.2, 0, 0.3), (3.6, 3.0, 0.6), STONE, mat=PAINT, bevel=0.06)
        p.box((0, 0, 0.06), (4.8, 3.0, 0.12), STONE_LIGHT, mat=PAINT)
    p.stripes((-2.4, -1.5005, 0.01), X, Z, NY, 4.8, 0.1, pitch=0.3, slant=1.0)
    for s in (-1, 1):
        cx = s * 4.2
        p.box((cx, 0, 2.8), (3.4, 2.8, 4.4), IRON, bevel=0.06)
        for (x, y) in ((cx - 1.68, -1.38), (cx + 1.68, -1.38), (cx - 1.68, 1.38), (cx + 1.68, 1.38)):
            p.box((x, y, 2.85), (0.2, 0.2, 4.5), BRASS, bevel=0.03)
        p.box((cx, -1.42, 0.85), (3.5, 0.08, 0.3), IRON, bevel=0.02)
        p.box((cx, -1.42, 4.85), (3.5, 0.08, 0.3), IRON, bevel=0.02)
        p.rivets((cx - 1.5, -1.465, 0.85), (cx + 1.5, -1.465, 0.85), NY, 0.3, 0.045, BRASS)
        p.rivets((cx - 1.5, -1.465, 4.85), (cx + 1.5, -1.465, 4.85), NY, 0.3, 0.045, BRASS)
        # Arched window: a warm glow pane behind mullions.
        p.box((cx, -1.405, 2.5), (1.5, 0.03, 1.5), WINDOW, mat=GLOW)
        p.arc_block((cx, -1.39, 3.25), NY, 0.01, 0.75, 0.016, 0.0, PI, WINDOW, seg=8, mat=GLOW, up=Z)
        p.arc_block((cx, -1.42, 3.25), NY, 0.75, 0.92, 0.05, 0.0, PI, BRASS, seg=8, up=Z)
        for x in (cx - 0.83, cx + 0.83):
            p.box((x, -1.42, 2.5), (0.16, 0.1, 1.6), BRASS)
        p.box((cx, -1.42, 1.68), (1.9, 0.14, 0.14), BRASS, bevel=0.02)
        for x in (cx - 0.28, cx + 0.28):
            p.box((x, -1.43, 2.75), (0.05, 0.05, 2.1), IRON)
        for z in (2.3, 3.0):
            p.box((cx, -1.43, z), (1.5, 0.05, 0.05), IRON)
        # Side face: louvres and a riveted hatch.
        p.grille((s * 5.9, 0.2, 3.3), (s, 0, 0), 1.4, 1.0, 5, IRON, horizontal=True)
        p.plate((s * 5.91, -0.3, 1.6), (s, 0, 0), 1.3, 1.1, 0.05, IRON, spacing=0.3, rr=0.04, inset=0.08)
        # Roof: pitched, standing seams, a ridge cap.
        rings = [[(cx - 1.9, -1.6, 5.0), (cx + 1.9, -1.6, 5.0), (cx + 1.9, 1.6, 5.0), (cx - 1.9, 1.6, 5.0)],
                 [(cx - 1.9, -0.05, 6.3), (cx + 1.9, -0.05, 6.3), (cx + 1.9, 0.05, 6.3), (cx - 1.9, 0.05, 6.3)]]
        p.grid(rings, VERD_DARK, METAL, smooth=False)
        for k in range(7):
            x = cx - 1.8 + k * 0.6
            for sy in (-1, 1):
                p.flat((x, sy * 1.6, 5.03), (x, sy * 0.05, 6.33), 0.06, 0.06, VERDIGRIS, up=(0, sy * 0.64, 0.77))
        p.cyl((cx - 1.95, 0, 6.33), (cx + 1.95, 0, 6.33), 0.07, BRASS, sides=6)
    # Left bay stack, right bay exhaust and whistle.
    p.turned((-4.9, 0.7, 5.5), Z, [(0.4, 0), (0.4, 0.3), (0.3, 0.4), (0.28, 3.2), (0.36, 3.26), (0.36, 3.42),
                                   (0.3, 3.5)], SOOT_IRON, sides=12)
    p.band((-4.9, 0.7, 7.6), Z, 0.29, 0.14, BRASS, sides=12, lip=0.03)
    p.soot.append((Vector((-4.9, 0.7, 9.2)), 1.3))
    p.tube(fillet([(4.9, 0.6, 5.5), (4.9, 0.6, 7.2), (5.4, 0.6, 7.6)], 0.25), 0.12, COPPER, sides=8)
    p.turned((5.4, 0.6, 7.6), (1, 0, 0.8), [(0.13, 0), (0.18, 0.05), (0.18, 0.3), (0.1, 0.36)], BRASS, sides=8)
    # Portal between the bays.
    for s in (-1, 1):
        p.ibeam((s * 2.25, -1.2, 0.12), (s * 2.25, -1.2, 5.0), 0.36, 0.34, 0.05, IRON, up=NY)
        p.stripes((s * 2.25 - 0.17, -1.385, 0.5), X, Z, NY, 0.34, 0.7, pitch=0.17, slant=0.5)
        p.cage_lamp((s * 2.25, -1.62, 4.0), r=0.14, h=0.32, hood=True)
        p.cyl((s * 2.25, -1.4, 4.42), (s * 2.25, -1.62, 4.42), 0.03, IRON, sides=4)
    p.ibeam((-2.5, -1.2, 5.0), (2.5, -1.2, 5.0), 0.6, 0.4, 0.06, IRON, up=Z)
    p.plate((0, -1.42, 5.0), NY, 2.4, 0.36, 0.04, BRASS, spacing=0.3, rr=0.035, inset=0.06)
    p.rivets((-2.3, -1.405, 5.24), (2.3, -1.405, 5.24), NY, 0.4, 0.04, STEEL)
    # Winch drum over the portal.
    p.turned((-1.9, 0.1, 6.0), X, [(0.9, 0), (0.9, 0.1), (0.62, 0.14), (0.62, 3.66), (0.9, 3.7), (0.9, 3.8)],
             STEEL_DARK, sides=18, up=Z)
    for k in range(9):
        p.torus((-1.5 + k * 0.375, 0.1, 6.0), X, 0.64, 0.05, STEEL, seg=14, sides=4, up=Z)
    for s in (-1, 1):
        p.box((s * 2.15, 0.1, 5.75), (0.3, 1.0, 1.1), IRON, bevel=0.04)
        p.turned((s * 2.3, 0.1, 6.0), (s, 0, 0), [(0.22, 0), (0.22, 0.08), (0.1, 0.12)], BRASS, sides=10)
    p.box((0, 0.1, 5.25), (4.6, 1.6, 0.12), IRON)
    mini_gear(p, (2.02, 0.1, 6.0), X, 0.86, 18, BRASS, thick=0.12, up=Z)
    # The lift cage (behind, gate toward -Y).
    with p.at(T(0, 3.9, 0)):
        with p.as_kind(K_SOFT):
            for k in range(6):
                p.box((-1.75 + k * 0.7, 0, 0.19), (0.66, 4.0, 0.08), p.vary(TIMBER, 0.1), mat=PAINT)
        p.box((0, 0, 0.08), (4.3, 4.2, 0.16), IRON, bevel=0.03)
        for (sx, sy), roll in LEG_ROLL.items():
            p.lbeam((sx * 2.1, sy * 2.05, 0.16), (sx * 2.1, sy * 2.05, 5.2), 0.18, 0.03, BRASS, roll=roll)
        for z in (0.26, 1.3, 5.1):
            for sy in (-1, 1):
                if not (sy < 0 and z == 1.3):
                    p.flat((-2.1, sy * 2.07, z), (2.1, sy * 2.07, z), 0.12, 0.03, BRASS, up=(0, sy, 0))
            for sx in (-1, 1):
                p.flat((sx * 2.12, -2.05, z), (sx * 2.12, 2.05, z), 0.12, 0.03, BRASS, up=(sx, 0, 0))
        # Lattice sides and back.
        for sx in (-1, 1):
            for k in range(4):
                y0, y1 = -2.05 + k * 1.025, -2.05 + (k + 1) * 1.025
                p.flat((sx * 2.11, y0, 1.3), (sx * 2.11, y1, 5.1), 0.06, 0.02, BRASS, up=(sx, 0, 0))
                p.flat((sx * 2.13, y1, 1.3), (sx * 2.13, y0, 5.1), 0.06, 0.02, BRASS, up=(sx, 0, 0))
            p.box((sx * 2.1, 0, 0.78), (0.03, 4.0, 1.0), BRASS_DARK)
        for k in range(4):
            x0, x1 = -2.1 + k * 1.05, -2.1 + (k + 1) * 1.05
            p.flat((x0, 2.06, 1.3), (x1, 2.06, 5.1), 0.06, 0.02, BRASS, up=Y)
            p.flat((x1, 2.08, 1.3), (x0, 2.08, 5.1), 0.06, 0.02, BRASS, up=Y)
        p.box((0, 2.05, 0.78), (4.1, 0.03, 1.0), BRASS_DARK)
        # The collapsible gate (front), drawn half open to the left.
        for k in range(8):
            x = -2.0 + k * 0.3
            p.cyl((x, -2.1, 0.2), (x, -2.1, 5.05), 0.025, BRASS, sides=4, smooth=False)
        for k in range(7):
            x = -2.0 + k * 0.3
            for (za, zb) in ((0.5, 1.6), (1.6, 2.7), (2.7, 3.8), (3.8, 4.9)):
                p.flat((x, -2.13, za if k % 2 == 0 else zb), (x + 0.3, -2.13, zb if k % 2 == 0 else za), 0.03, 0.012,
                       BRASS_DARK, up=NY)
        p.box((0.2, -2.12, 2.6), (0.08, 0.06, 0.5), BRASS, bevel=0.01)
        # Canopy roof and suspension eye.
        p.turned((0, 0, 5.2), Z, [(2.95, -0.04), (2.95, 0.02), (2.2, 0.3), (0.9, 0.52), (0.3, 0.58)], BRASS, sides=4,
                 smooth=False, phase=PI / 4)
        p.turned((0, 0, 5.75), Z, [(0.3, 0), (0.3, 0.1), (0.16, 0.16)], BRASS_DARK, sides=8)
        p.torus((0, 0, 6.02), X, 0.13, 0.04, IRON, seg=10, sides=4, up=Z)
        p.cage_lamp((0, 0, 4.72), r=0.14, h=0.3, hood=False)
        p.cyl((0, 0, 4.9), (0, 0, 5.3), 0.02, IRON, sides=4)
    # Headframe: two lattice legs, a pulley deck, raking struts to the bays.
    for s in (-1, 1):
        lattice_tower(p, s * 3.3, 3.9, 0.0, 12.6, 0.5, 2.52, IRON, leg=0.2, brace=0.12, t=0.03, hy=1.7, hy1=0.9,
                      cross=True, rivets=True)
        p.ibeam((s * 3.3, 3.0, 12.5), (s * 3.3, -0.2, 6.4), 0.3, 0.26, 0.04, IRON, up=(0, 0.9, 0.5))
        p.box((s * 3.3, -0.2, 6.35), (0.5, 0.5, 0.14), IRON)
    for y in (3.0, 4.8):
        p.ibeam((-4.0, y, 12.8), (4.0, y, 12.8), 0.44, 0.3, 0.05, IRON, up=Z)
    p.box((0, 3.9, 13.04), (8.0, 2.4, 0.06), STEEL_DARK)
    for z in (6.6, 9.6):
        p.flat((-3.3, 5.6 - (z - 0.0) * 0.063, z), (3.3, 5.6 - (z - 0.0) * 0.063, z), 0.16, 0.06, IRON, up=Y)
    p.cyl((-3.3, 5.2, 6.6), (3.3, 5.0, 9.6), 0.03, STEEL_DARK, sides=4)
    p.cyl((3.3, 5.2, 6.6), (-3.3, 5.0, 9.6), 0.03, STEEL_DARK, sides=4)
    # The pulley wheels.
    for s in (-1, 1):
        spoked_wheel(p, (s * 0.95, 3.9, 13.8 + 0.02), X, 2.18, 0.3, IRON, spokes=8, band=BRASS)
        for sx in (-1, 1):
            x = s * 0.95 + sx * 0.5
            p.quad_prism([(x - 0.06, 3.2, 13.07), (x - 0.06, 4.6, 13.07), (x - 0.06, 4.12, 13.95),
                          (x - 0.06, 3.68, 13.95)], X, 0.12, IRON, mat=METAL)
    p.cyl((-1.7, 3.9, 13.82), (1.7, 3.9, 13.82), 0.14, STEEL, sides=8)
    # Cables: drum to wheels, wheels out toward +Y, wheels' deck down to the cage.
    for s in (-1, 1):
        x = s * 0.95
        p.cyl((x, 0.1 + 0.62, 6.1), (x, 3.9 - 2.18, 13.7), 0.04, STEEL_DARK, sides=5)
        p.cyl((x, 3.9, 16.0), (x, 10.0, 15.35), 0.04, STEEL_DARK, sides=5)
        p.cyl((s * 0.1, 3.9, 6.05), (s * 0.3, 3.9, 12.6), 0.03, STEEL_DARK, sides=4)
    # Lightning rod over the wheels.
    for s in (-1, 1):
        p.flat((s * 1.9, 3.9, 13.07), (s * 0.25, 3.9, 16.6), 0.14, 0.08, IRON, up=Y)
    p.box((0, 3.9, 16.62), (0.7, 0.3, 0.16), IRON, bevel=0.03)
    insulator_stack(p, (0, 3.9, 16.7), 0.26, 0.7, 3, sides=10)
    p.turned((0, 3.9, 17.4), Z, [(0.1, 0), (0.07, 0.1), (0.05, 1.7)], IRON, sides=8)
    p.sphere((0, 3.9, 19.1), 0.22, BRASS, rings=5, sides=10)
    p.turned((0, 3.9, 19.28), Z, [(0.06, 0), (0.04, 0.2), (0.01, 0.72)], BRASS, sides=6)
    p.tube([(0.1, 3.9, 17.4), (0.5, 3.9, 16.9), (1.95, 4.0, 13.1), (3.0, 4.75, 12.9)], 0.02, COPPER, sides=4)
    return p


# ===================================================================== heroes
def riveted_drum(p, a, axis, r, length, color, seams, sides=24, rivets=16, rivet_color=None, up=Z, ends=True,
                 lip=0.035):
    """A lap-seamed boiler shell along `axis` from a: step rings at the seams
    with a rivet ring on each."""
    prof = [(r * 0.97, 0), (r, 0.06)] if ends else [(r, 0)]
    for s in seams:
        prof += [(r, s), (r + lip, s + 0.02), (r + lip, s + 0.2), (r, s + 0.22)]
    prof += [(r, length - 0.06), (r * 0.97, length)] if ends else [(r, length)]
    p.turned(a, axis, prof, color, sides=sides, up=up)
    d = Vector(axis).normalized()
    for s in seams:
        p.rivet_ring(Vector(a) + d * (s + 0.11), d, r + lip, rivets, 0.05, rivet_color or color, up=up)


def stack(p, c, r0, r1, h, color=SOOT_IRON, sides=14, bands=(), seams=3):
    """A smokestack from c: lapped courses, brass bands, a crown cap, a dark bore."""
    c = Vector(c)
    prof = [(r0 * 1.25, 0), (r0 * 1.25, 0.2), (r0, 0.4)]
    for k in range(seams):
        z = h * (k + 1) / (seams + 1)
        r = r0 + (r1 - r0) * z / h
        prof += [(r, z), (r + 0.04, z + 0.03), (r + 0.04, z + 0.2), (r, z + 0.23)]
    prof += [(r1, h - 0.9), (r1 * 1.14, h - 0.7), (r1 * 1.18, h - 0.4), (r1 * 1.18, h - 0.2), (r1 * 1.08, h - 0.16),
             (r1 * 1.05, h), (r1 * 0.94, h), (r1 * 0.9, h - 0.3)]
    p.turned(c, Z, prof, color, sides=sides, cap1=False)
    with p.as_kind(K_PLAIN):
        p.cyl(c + Vector((0, 0, h - 0.8)), c + Vector((0, 0, h - 0.79)), r1 * 0.95, SOOT, sides=10, mat=PAINT,
              smooth=False)
    for z in bands:
        r = r0 + (r1 - r0) * z / h
        p.band(c + Vector((0, 0, z)), Z, r, 0.3, BRASS, rivets=10, rivet_r=0.05, sides=sides, lip=0.05)
    p.soot.append((c + Vector((0, 0, h + 1.0)), 4.0))


@piece('PressCrown')
def press_crown():
    """HERO: the press crown (origin at the BOTTOM centre, nothing below Z 0;
    base girder X +-23, Y +-2.6): a riveted box girder with stiffeners and
    bearing pads over the five posts (X -20, -10, 0, 10, 20), two horizontal
    boilers with fireboxes at the outer ends, steam domes and safety valves,
    a split central gearbox with a flywheel socket between its halves (a
    Kit_Flywheel centred at (0, 0, 5.2) spins in the slot), a steam header
    and pipe bundles, gauges, and two smokestacks to Z 16."""
    p = P('PressCrown', rust=0.6, verd=0.5, ground=None, grime=None, ao_dist=1.4)
    # Box girder.
    p.box((0, 0, 0.1), (46.0, 5.2, 0.2), IRON, bevel=0.04)
    p.box((0, 0, 2.3), (46.0, 5.2, 0.2), IRON, bevel=0.04)
    for sy in (-1, 1):
        p.box((0, sy * 2.42, 1.2), (45.8, 0.12, 2.0), IRON)
        for k in range(24):
            x = -23.0 + 46.0 * (k + 0.5) / 24
            if min(abs(x - px) for px in (-20, -10, 0, 10, 20)) < 1.5:
                continue
            p.box((x, sy * 2.53, 1.2), (0.16, 0.12, 2.0), IRON)
        sp = 0.92 if sy < 0 else 1.84
        p.rivets((-22.6, sy * 2.485, 2.02), (22.6, sy * 2.485, 2.02), (0, sy, 0), sp, 0.06, BRASS)
        p.rivets((-22.6, sy * 2.485, 0.38), (22.6, sy * 2.485, 0.38), (0, sy, 0), sp, 0.06, BRASS)
        for px in (-20, -10, 0, 10, 20):
            p.box((px, sy * 2.52, 1.2), (2.8, 0.12, 1.9), STEEL_DARK, bevel=0.03)
            p.box((px, sy * 2.6, 1.9), (2.4, 0.06, 0.24), BRASS, bevel=0.02)
            if sy < 0:
                p.stripes((px - 1.3, -2.5855, 0.36), X, Z, NY, 2.6, 0.22, pitch=0.26, slant=0.8)
                for sx in (-1, 1):
                    for z in (0.9, 1.5):
                        p.rivet((px + sx * 1.2, -2.585, z), NY, 0.07, BRASS)
    for s in (-1, 1):
        p.box((s * 22.95, 0, 1.2), (0.12, 5.0, 2.0), IRON)
    # Boilers.
    bz, br = 4.65, 1.7
    for s in (-1, 1):
        x0 = s * 6.2
        with p.at(T(x0, 0, bz)):
            riveted_drum(p, (0, 0, 0), (s, 0, 0), br, 12.6, BRASS_DARK, seams=(2.9, 6.1, 9.3), sides=22, rivets=16)
        for dx in (1.6, 6.3, 11.0):
            x = x0 + s * dx
            p.arc_block((x, 0, bz), X, br, br + 0.2, 0.22, PI + 0.45, TAU - 0.45, IRON, seg=6, up=Z)
            p.box((x, 0, 2.7), (0.5, 3.4, 0.6), IRON, bevel=0.04)
        p.rivets((x0 + s * 0.5, 0, bz + br + 0.01), (x0 + s * 12.0, 0, bz + br + 0.01), Z, 0.75, 0.05, IRON)
        # Firebox at the outer end.
        fx = s * 20.1
        p.box((fx, 0, 4.3), (2.6, 3.9, 3.8), IRON, bevel=0.1)
        p.heat.append((Vector((fx, -2.0, 3.7)), 1.5))
        for xx in (fx - 1.2, fx + 1.2):
            p.rivets((xx, -1.96, 2.7), (xx, -1.96, 5.9), NY, 0.5, 0.055, IRON)
        p.box((fx, -1.98, 3.7), (1.5, 0.08, 1.1), BRASS, bevel=0.02)
        with p.as_kind(K_PLAIN):
            p.box((fx, -1.99, 3.7), (1.2, 0.08, 0.8), SOOT, mat=PAINT)
        p.box((fx + 0.1, -2.035, 3.65), (0.7, 0.02, 0.44), MOLTEN, mat=GLOW)
        for k in range(4):
            p.box((fx - 0.14 + k * 0.16, -2.045, 3.58), (0.04, 0.03, 0.34), SOOT_IRON)
        with p.at(T(fx - 0.58, -2.06, 3.7) @ R('Z', -0.9)):
            p.box((0.3, 0, 0), (0.6, 0.06, 0.8), IRON, bevel=0.015)
        p.box((fx, -1.99, 2.75), (1.1, 0.06, 0.3), IRON)
        p.box((fx, -2.025, 2.75), (0.7, 0.02, 0.1), EMBER, mat=GLOW)
        p.gauge((fx - 0.7, -2.02, 5.5), NY, 0.24)
        p.gauge((fx + 0.1, -2.02, 5.5), NY, 0.2)
        p.cyl((fx + 0.9, -2.03, 4.6), (fx + 0.9, -2.03, 5.7), 0.05, GLASS_C, sides=6, mat=GLASS)
        for z in (4.55, 5.75):
            p.box((fx + 0.9, -2.02, z), (0.14, 0.12, 0.12), BRASS)
        # Smokebox and stack at the inner end.
        sx0 = s * 5.5
        p.turned((s * 6.3, 0, bz), (-s, 0, 0), [(br + 0.06, 0), (br + 0.06, 1.3), (br - 0.2, 1.36), (1.0, 1.5)],
                 SOOT_IRON, sides=22, up=Z)
        p.rivet_ring((s * 5.7, 0, bz), X, br + 0.06, 16, 0.05, IRON, up=Z)
        stack(p, (sx0, 0, bz + br - 0.2), 0.78, 0.62, 16.0 - (bz + br - 0.2), bands=(3.4, 7.0), seams=3)
        # Steam dome and safety valves.
        dx = s * 11.5
        p.turned((dx, 0, bz + br - 0.12), Z, [(0.9, 0), (0.9, 0.12), (0.76, 0.16), (0.76, 0.75), (0.62, 1.0),
                                              (0.3, 1.14), (0.04, 1.18)], BRASS, sides=18)
        p.rivet_ring((dx, 0, bz + br - 0.05), Z, 0.9, 14, 0.045, BRASS)
        vx = s * 15.6
        p.turned((vx, 0, bz + br - 0.06), Z, [(0.46, 0), (0.46, 0.1), (0.3, 0.16), (0.28, 0.34)], BRASS, sides=12)
        for sy in (-1, 1):
            p.turned((vx, sy * 0.17, bz + br + 0.28), Z, [(0.1, 0), (0.12, 0.1), (0.12, 0.6), (0.08, 0.66),
                                                           (0.05, 0.8)], BRASS, sides=8)
        p.box((vx, 0, bz + br + 1.0), (0.08, 0.7, 0.06), IRON)
        p.tube(helix((vx, 0, 0), 0.07, bz + br + 0.3, bz + br + 0.95, 6, seg=6), 0.02, STEEL, sides=4)
        p.turned((vx, 0, bz + br + 1.06), Z, [(0.05, 0), (0.09, 0.06), (0.09, 0.2), (0.03, 0.26)], BRASS, sides=8)
        # Steam header from the dome to the gearbox, and a pipe bundle on the girder.
        hdr = fillet([(dx, 0, bz + br + 0.9), (dx, 0, 8.3), (s * 3.0, 0, 8.3), (s * 3.0, 0, 6.5)], 0.6)
        p.tube(hdr, 0.26, COPPER, sides=10)
        for q in ((s * 8.5, 0, 8.3), (s * 4.2, 0, 8.3)):
            p.flange(q, X, 0.4, 0.1, BRASS, bolts=6, sides=12)
        p.turned((s * 7.0 - 0.3, 0, 8.3), X, [(0.28, 0), (0.44, 0.1), (0.44, 0.5), (0.28, 0.6)], BRASS, sides=12)
        p.cyl((s * 7.0, 0, 8.6), (s * 7.0, 0, 9.1), 0.05, STEEL, sides=5)
        p.handwheel((s * 7.0, 0, 9.12), Z, 0.36)
        for k, (yy, zz, rr, col) in enumerate(((-2.2, 2.75, 0.2, COPPER), (-2.25, 3.2, 0.13, COPPER),
                                               (-1.9, 3.12, 0.1, IRON))):
            p.cyl((s * 4.6, yy, zz), (s * 18.6, yy, zz), rr, col, sides=7)
            for x in (6.5, 11.5, 16.5):
                if k == 0:
                    p.box((s * x, -2.2, 2.9), (0.14, 0.5, 0.8), IRON)
                    p.turned((s * x - 0.4, yy, zz), X, [(rr + 0.1, 0), (rr + 0.1, 0.1)], BRASS, sides=8)
    # Central gearbox in two halves round the flywheel slot.
    for s in (-1, 1):
        cx = s * 2.3
        p.box((cx, 0, 4.2), (3.3, 4.6, 3.6), IRON, bevel=0.14)
        p.arc_block((cx, 0, 6.0), X, 0.05, 1.9, 1.5, 0.0, PI, IRON, seg=10, smooth=True, up=Z)
        for xx in (cx - 1.52, cx + 1.52):
            p.arc_block((xx, 0, 6.0), X, 1.8, 2.0, 0.07, 0.0, PI, BRASS, seg=10, up=Z)
        for k in range(5):
            x = cx - 1.2 + k * 0.6
            p.box((x, -2.34, 4.2), (0.14, 0.12, 3.2), IRON, bevel=0.02)
        p.rivets((cx - 1.4, -2.31, 5.85), (cx + 1.4, -2.31, 5.85), NY, 0.35, 0.05, BRASS)
        p.rivets((cx - 1.4, -2.31, 2.6), (cx + 1.4, -2.31, 2.6), NY, 0.35, 0.05, BRASS)
        p.turned((s * 0.66, 0, 5.2), (-s, 0, 0), [(0.75, 0), (0.75, 0.1), (0.55, 0.16), (0.3, 0.2)], BRASS, sides=14)
        for k in range(6):
            a = TAU * k / 6
            p.bolt((s * 0.56, math.cos(a) * 0.62, 5.2 + math.sin(a) * 0.62), (-s, 0, 0), 0.05, 0.05)
        p.plate((cx + s * 0.3, -2.33, 4.5), NY, 1.3, 1.2, 0.05, STEEL_DARK, spacing=0.26, rr=0.04, inset=0.08)
        p.gauge((cx - s * 0.9, -2.36, 5.2), NY, 0.3)
        p.turned((cx, 0, 7.82), Z, [(0.2, 0), (0.2, 0.2), (0.14, 0.24), (0.14, 0.5), (0.2, 0.54), (0.2, 0.6)], BRASS,
                 sides=8)
    p.box((0, 1.9, 3.3), (1.4, 0.6, 1.6), IRON, bevel=0.05)
    return p


@piece('GreatCoil', foot=('circle', 3.5))
def great_coil():
    """HERO: the great storm coil (30 tall, toroid crown to Z 33; within r 3.5
    below 4.5, plinth to r 5.5 at most 1.4 tall): a stepped stone and iron
    plinth, a core wound with three thick copper helices between brass
    collars, four insulator stacks, an iron cage of eight ribs hooped in
    brass, a spun toroid at Z 28..31 on a spider, and the brass strike
    terminal at the top."""
    p = P('GreatCoil', rust=0.55, verd=0.6, ao_dist=1.5)
    with p.as_kind(K_STONE):
        p.turned((0, 0, 0), Z, [(5.45, 0), (5.45, 0.45), (5.3, 0.5)], STONE, sides=8, mat=PAINT, smooth=False,
                 phase=PI / 8)
        p.turned((0, 0, 0.5), Z, [(4.7, 0), (4.7, 0.42), (4.55, 0.48)], STONE_LIGHT, sides=8, mat=PAINT, smooth=False,
                 phase=PI / 8)
    p.turned((0, 0, 0.98), Z, [(3.95, 0), (3.95, 0.34), (3.8, 0.42)], IRON, sides=16, smooth=False)
    p.rivet_ring((0, 0, 1.15), Z, 3.95, 32, 0.07, BRASS, phase=0.1)
    for k in range(8):
        a = TAU * k / 8 + PI / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        p.quad_prism([d * 3.9 + Vector((0, 0, 1.0)), d * 5.0 + Vector((0, 0, 0.5)), d * 5.0 + Vector((0, 0, 0.95)),
                      d * 3.9 + Vector((0, 0, 1.38))], Vector((-d.y, d.x, 0)), 0.2, IRON, mat=METAL)
        p.bolt(d * 4.8 + Vector((-d.y, d.x, 0)) * 0.1 + Vector((0, 0, 0.9)), Z, 0.08, 0.1)
    # Base drum with a hatch, gauges and a thin hazard band.
    p.turned((0, 0, 1.4), Z, [(2.2, 0), (2.2, 1.1), (2.0, 1.25), (1.5, 1.4)], IRON, sides=20)
    chevron_ring(p, (0, 0, 0), 2.21, 1.5, 1.76, n=24)
    p.rivet_ring((0, 0, 2.4), Z, 2.2, 20, 0.055, BRASS)
    p.plate((0, -2.18, 2.05), NY, 1.0, 0.56, 0.06, BRASS, spacing=0.24, rr=0.04, inset=0.07)
    for s in (-1, 1):
        a = -PI / 2 + s * 0.55
        p.gauge((math.cos(a) * 2.26, math.sin(a) * 2.26, 2.1), (math.cos(a), math.sin(a), 0), 0.2)
    # Core and windings.
    with p.as_kind(K_PAINT):
        p.cyl((0, 0, 2.8), (0, 0, 26.6), 1.3, ENAMEL, sides=18, mat=PAINT, cap0=False)
    for (za, zb) in ((3.3, 9.6), (10.7, 17.0), (18.1, 24.4)):
        p.tube(helix((0, 0, 0), 1.63, za, zb, 9, seg=12), 0.2, COPPER, sides=5)
    for z in (2.85, 10.15, 17.55, 24.95):
        p.turned((0, 0, z - 0.3), Z, [(1.32, 0), (1.95, 0.08), (2.0, 0.2), (2.0, 0.44), (1.95, 0.52), (1.32, 0.6)],
                 BRASS, sides=20)
        p.rivet_ring((0, 0, z), Z, 2.0, 16, 0.055, BRASS)
    # Insulator stacks carrying the first hoop.
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        c = Vector((math.cos(a) * 2.85, math.sin(a) * 2.85, 1.4))
        p.turned(c, Z, [(0.42, 0), (0.42, 0.2), (0.24, 0.3)], IRON, sides=8)
        prof = [(0.2, 0)]
        for i in range(10):
            z = i * 0.84
            prof += [(0.2, z + 0.08), (0.46, z + 0.36), (0.2, z + 0.74)]
        with p.as_kind(K_SOFT):
            p.turned(c + Vector((0, 0, 0.3)), Z, prof, CERAMIC, sides=8, mat=PAINT)
        p.turned(c + Vector((0, 0, 8.7)), Z, [(0.24, 0), (0.3, 0.06), (0.3, 0.2), (0.16, 0.26)], BRASS, sides=8)
    # Cage ribs and brass hoops.
    def rib_r(z):
        if z < 9.0:
            return 3.42 - 0.1 * (z - 1.4) / 7.6
        return 3.32 - (3.32 - 2.2) * ((z - 9.0) / 17.5) ** 1.3

    for k in range(8):
        a = TAU * k / 8
        pts = [(math.cos(a) * rib_r(z), math.sin(a) * rib_r(z), z) for z in (1.4, 5.0, 9.0, 13.0, 17.5, 22.0, 26.5)]
        pts.append((math.cos(a) * 2.0, math.sin(a) * 2.0, 27.6))
        p.tube(pts, 0.11, IRON, sides=4, squash=1.6)
        p.box((math.cos(a) * 3.42, math.sin(a) * 3.42, 1.48), (0.4, 0.5, 0.16), IRON, rot=(0, 0, a))
    for z in (10.15, 17.55, 24.95):
        p.torus((0, 0, z), Z, rib_r(z) + 0.02, 0.1, BRASS, seg=24, sides=5)
        for k in range(4):
            a = TAU * k / 4 + PI / 8
            p.cyl((math.cos(a) * 2.0, math.sin(a) * 2.0, z), (math.cos(a) * rib_r(z), math.sin(a) * rib_r(z), z), 0.05,
                  BRASS, sides=4)
    ladder(p, (0.0, -3.5, 1.5), (0.0, -3.42, 9.0), NY, width=0.5, rung=0.5)
    # Core head, spider, toroid, terminal.
    p.turned((0, 0, 26.6), Z, [(1.32, 0), (1.5, 0.15), (1.5, 0.5), (0.9, 1.1), (0.5, 1.4), (0.42, 4.6), (0.6, 4.7),
                               (0.6, 4.9)], IRON, sides=16)
    for k in range(6):
        a = TAU * k / 6
        d = Vector((math.cos(a), math.sin(a), 0))
        p.tube([d * 0.45 + Vector((0, 0, 28.2)), d * 1.3 + Vector((0, 0, 29.3)), d * 2.15 + Vector((0, 0, 29.5))],
               0.13, BRASS, sides=5)
    p.torus((0, 0, 29.5), Z, 3.55, 1.5, BRASS, seg=28, sides=10)
    for a in (0.5, 0.5 + PI):
        p.torus((math.cos(a) * 3.55, math.sin(a) * 3.55, 29.5), (-math.sin(a), math.cos(a), 0), 1.52, 0.05,
                BRASS_DARK, seg=14, sides=4, up=Z)
    p.torus((0, 0, 30.97), Z, 3.55, 0.07, BRASS_DARK, seg=28, sides=4)
    p.sphere((0, 0, 32.0), 1.0, BRASS, rings=8, sides=16)
    p.torus((0, 0, 31.5), Z, 0.6, 0.06, BRASS_DARK, seg=14, sides=4)
    return p


@piece('GreatCoilGlow')
def great_coil_glow():
    """ONLY the glow of the great coil (same origin as Kit_GreatCoil, inside its
    bounds; the runtime drives its brightness): the core light between the
    windings, the toroid's light rings and the terminal's corona."""
    p = P('GreatCoilGlow', ground=None, grime=None, ao=0.0)
    for (za, zb) in ((3.3, 9.6), (10.7, 17.0), (18.1, 24.4)):
        p.turned((0, 0, 0), Z, [(1.42, za), (1.42, zb)], STORM_DIM, sides=14, mat=GLOW, cap0=False, cap1=False)
    p.torus((0, 0, 29.5), Z, 5.03, 0.07, STORM, seg=28, sides=4, mat=GLOW)
    p.torus((0, 0, 28.02), Z, 3.55, 0.06, STORM_DIM, seg=28, sides=4, mat=GLOW)
    p.torus((0, 0, 32.0), Z, 1.04, 0.05, STORM, seg=16, sides=4, mat=GLOW)
    for k in range(8):
        a = TAU * k / 8
        d = Vector((math.cos(a), math.sin(a), 0.35 if k % 2 else -0.1)).normalized()
        p.turned(Vector((0, 0, 32.0)) + d * 1.0, d, [(0.07, 0), (0.01, 0.55 if k % 2 else 0.4)], STORM, sides=4,
                 mat=GLOW)
    return p


@piece('GantryScaffold', foot=('box', 11.5, 2.0))
def gantry_scaffold():
    """HERO: the Prime Draft's assembly gantry (towers at X +-10, 3 x 3, Z
    0..34; below 4.5 within X +-11.5, Y +-2): two riveted lattice towers,
    truss crossbeams at Z 18 and 33, a hanging work platform, clamp arms,
    hook chains, ladders and a riveted base rail at most 0.8 tall."""
    p = P('GantryScaffold', rust=0.65, verd=0.4, ao_dist=1.3)
    p.box((0, 0, 0.3), (23.0, 0.5, 0.6), IRON, bevel=0.04)
    p.rivets((-8.2, -0.255, 0.45), (8.2, -0.255, 0.45), NY, 0.82, 0.055, BRASS)
    p.stripes((-8.4, -0.2555, 0.08), X, Z, NY, 16.8, 0.2, pitch=0.4, slant=0.9)
    for s in (-1, 1):
        cx = s * 10.0
        with p.as_kind(K_STONE):
            p.box((cx, 0, 0.2), (3.6, 3.6, 0.4), STONE, mat=PAINT, bevel=0.06)
        lattice_tower(p, cx, 0, 0.4, 34.0, 1.5, 3.36, IRON, leg=0.28, brace=0.16, t=0.04, cross=True)
        ladder(p, (cx, -1.62, 0.5), (cx, -1.62, 18.0), NY, width=0.55, rung=0.5)
        p.box((cx, -2.3, 18.0), (2.6, 1.5, 0.08), STEEL_DARK)
        for sx in (-1, 1):
            p.cyl((cx + sx * 1.25, -3.0, 18.04), (cx + sx * 1.25, -3.0, 19.1), 0.03, IRON, sides=4)
            p.flat((cx + sx * 1.25, -1.55, 17.0), (cx + sx * 1.25, -3.0, 17.98), 0.1, 0.05, IRON, up=(sx, 0, 0))
        p.cyl((cx - 1.25, -3.0, 19.1), (cx + 1.25, -3.0, 19.1), 0.035, BRASS, sides=4)
        p.box((cx, 0, 34.0), (3.4, 3.4, 0.2), IRON, bevel=0.04)
        p.cage_lamp((cx, 0, 34.5), r=0.2, h=0.4, hood=False)
        # A clamp arm toward the centre.
        z = 25.0
        p.ibeam((cx - s * 1.5, 0, z), (cx - s * 5.6, 0, z), 0.5, 0.4, 0.06, IRON, up=Z)
        p.flat((cx - s * 1.5, 0, z + 2.6), (cx - s * 4.6, 0, z + 0.3), 0.14, 0.08, IRON, up=Y)
        ac = PI if s > 0 else 0.0
        p.arc_block((cx - s * 6.1, 0, z), Z, 0.7, 0.95, 0.2, ac - 1.9, ac + 1.9, BRASS, seg=8)
        p.box((cx - s * 5.4, 0, z), (0.5, 0.9, 0.7), IRON, bevel=0.05)
    # Crossbeams: twin planar trusses tied together.
    for (z, depth) in ((18.0, 2.2), (33.0, 1.8)):
        for sy in (-1, 1):
            y = sy * 1.3
            p.flat((-8.6, y, z), (8.6, y, z), 0.24, 0.2, IRON, up=Z)
            p.flat((-8.6, y, z - depth), (8.6, y, z - depth), 0.24, 0.2, IRON, up=Z)
            n = 8
            for i in range(n):
                x0 = -8.6 + 17.2 * i / n
                x1 = -8.6 + 17.2 * (i + 1) / n
                if i % 2 == 0:
                    p.flat((x0, y, z - depth), (x1, y, z), 0.14, 0.06, IRON, up=(0, sy, 0))
                else:
                    p.flat((x0, y, z), (x1, y, z - depth), 0.14, 0.06, IRON, up=(0, sy, 0))
                p.flat((x0, y, z - depth), (x0, y, z), 0.12, 0.06, IRON, up=(0, sy, 0))
                p.rivet((x0, y + sy * 0.11, z), (0, sy, 0), 0.06, STEEL)
                p.rivet((x0, y + sy * 0.11, z - depth), (0, sy, 0), 0.06, STEEL)
        for i in range(5):
            x = -8.6 + 17.2 * i / 4
            p.flat((x, -1.3, z), (x, 1.3, z), 0.14, 0.08, IRON, up=Z)
            p.flat((x, -1.3, z - depth), (x, 1.3, z - depth), 0.14, 0.08, IRON, up=Z)
    # Hanging work platform under the lower beam.
    pz = 10.5
    with p.as_kind(K_SOFT):
        for k in range(5):
            p.box((0, -1.2 + k * 0.6, pz), (7.0, 0.56, 0.1), p.vary(TIMBER, 0.1), mat=PAINT, bevel=0.012)
    for sy in (-1, 1):
        p.flat((-3.6, sy * 1.5, pz - 0.08), (3.6, sy * 1.5, pz - 0.08), 0.2, 0.16, IRON, up=Z)
        for x in (-3.5, -1.2, 1.2, 3.5):
            p.cyl((x, sy * 1.5, pz), (x, sy * 1.5, pz + 1.1), 0.03, IRON, sides=4)
        p.cyl((-3.5, sy * 1.5, pz + 1.1), (3.5, sy * 1.5, pz + 1.1), 0.04, BRASS, sides=5)
        for x in (-3.3, 3.3):
            p.cyl((x, sy * 1.5, pz + 0.05), (x, sy * 1.3, 15.8), 0.035, STEEL_DARK, sides=4)
            p.turned((x, sy * 1.42, 12.6), (0, -sy * 0.04, 1), [(0.07, 0), (0.07, 0.5)], BRASS, sides=6, smooth=False)
    for x in (-3.6, 3.6):
        p.flat((x, -1.5, pz - 0.08), (x, 1.5, pz - 0.08), 0.2, 0.16, IRON, up=Z)
    p.box((1.8, 0.6, pz + 0.35), (0.9, 0.7, 0.6), SLATE, mat=PAINT, bevel=0.03)
    # Hook chains from the top beam.
    for (x, drop) in ((-4.2, 5.5), (3.4, 7.5)):
        p.box((x, 0, 33.0 - 1.8 - 0.2), (0.5, 2.8, 0.3), IRON, bevel=0.03)
        p.chain([(x, 0, 31.0), (x, 0, 31.0 - drop)], link=0.52, w=0.3, r=0.06)
        hook(p, (x, 0, 31.0 - drop + 0.05), scale=0.8)
    return p


@piece('FurnaceMouth', foot=('boxy', 5.0, 3.0, 6.0))
def furnace_mouth():
    """HERO: the furnace face (X +-5, Y -3..+6, Z 0..14): a battered firebrick
    body in iron-banded tiers, buckstays and tie rods, an arched glowing mouth
    in voussoirs, a riveted smoke hood over it, a brick-lined spout lip
    toward -Y at Z 1 with molten brass in it, a bustle pipe with tuyeres, and
    a banded brick chimney (smoke at (0, 3.4, 14))."""
    p = P('FurnaceMouth', rust=0.75, verd=0.4, ao_dist=1.5)
    p.heat.append((Vector((0, -1.2, 2.4)), 3.4))
    p.heat.append((Vector((0, -2.6, 1.2)), 1.5))
    p.soot.append((Vector((0, -1.6, 5.4)), 3.0))
    p.soot.append((Vector((0, 3.4, 15.0)), 3.5))
    tiers = ((0.0, 2.4, 4.8), (2.4, 4.8, 4.62), (4.8, 7.0, 4.44), (7.0, 9.0, 4.26))
    with p.as_kind(K_STONE):
        for (z0, z1, hw) in tiers:
            p.bx((-hw, -1.0 + (4.8 - hw), z0), (hw, 5.9, z1), p.vary(BRICK, 0.07), mat=PAINT, bevel=0.06)
        # Brick courses on the face: thin proud string courses.
        for k in range(12):
            z = 0.5 + k * 0.72
            hw = 4.8 - 0.06 * z
            for sx in (-1, 1):
                x0, x1 = (1.95 if z < 4.6 else 0.0), hw - 0.02
                if x1 > x0 + 0.2:
                    p.bx((sx * x0, -1.04 + (4.8 - hw), z), (sx * x1, -0.98 + (4.8 - hw), z + 0.34),
                         p.vary(BRICK, 0.12), mat=PAINT)
    for (z0, z1, hw) in tiers[1:]:
        p.bx((-hw - 0.08, -1.12 + (4.8 - hw), z0 - 0.12), (hw + 0.08, 5.95, z0 + 0.12), IRON)
        p.rivets((-hw + 0.3, -1.125 + (4.8 - hw), z0), (hw - 0.3, -1.125 + (4.8 - hw), z0), NY, 0.62, 0.06, IRON)
    # Buckstays and tie rods.
    for sx in (-1, 1):
        for x in (3.2, 4.45):
            p.ibeam((sx * x, -1.2, 0.0), (sx * x, -0.72, 9.0), 0.34, 0.3, 0.05, IRON, up=NY)
    for z in (5.6, 8.3):
        p.cyl((-4.6, -1.3 + z * 0.05, z), (4.6, -1.3 + z * 0.05, z), 0.05, STEEL_DARK, sides=5)
        for sx in (-1, 1):
            for x in (3.2, 4.45):
                p.bolt((sx * x, -1.3 + z * 0.05, z), NY, 0.09, 0.1)
        p.turned((-0.3, -1.3 + z * 0.05, z), X, [(0.09, 0), (0.09, 0.6)], BRASS, sides=6, smooth=False)
    # The mouth: a dark throat, glow, voussoirs.
    mz = 2.5
    with p.as_kind(K_PLAIN):
        p.box((0, -0.86, 1.7), (3.3, 0.3, 1.9), SOOT, mat=PAINT)
        p.arc_block((0, -0.86, mz), NY, 0.02, 1.65, 0.15, 0.0, PI, SOOT, seg=10, mat=PAINT, up=Z)
    p.box((0, -0.99, 1.75), (2.7, 0.04, 1.5), MOLTEN, mat=GLOW)
    p.arc_block((0, -0.99, mz), NY, 0.02, 1.35, 0.02, 0.0, PI, MOLTEN, seg=10, mat=GLOW, up=Z)
    p.box((0, -1.02, 1.5), (1.7, 0.03, 0.9), MOLTEN_HOT, mat=GLOW)
    with p.as_kind(K_STONE):
        for k in range(11):
            a0, a1 = PI * k / 11 + 0.012, PI * (k + 1) / 11 - 0.012
            p.arc_block((0, -1.0, mz), NY, 1.65, 2.25 if k != 5 else 2.4, 0.22, a0, a1, p.vary(STONE_LIGHT, 0.1),
                        seg=2, mat=PAINT, up=Z)
        for sx in (-1, 1):
            for k in range(3):
                p.box((sx * 1.95, -1.0, 0.75 + k * 0.62 + 0.3), (0.6, 0.44, 0.58), p.vary(STONE_LIGHT, 0.1),
                      mat=PAINT, bevel=0.03)
    p.arc_block((0, -1.1, mz), NY, 1.58, 1.68, 0.3, -0.02, PI + 0.02, IRON, seg=10, up=Z)
    # Smoke hood over the mouth.
    rings = [[(-2.9, -2.9, 5.0), (2.9, -2.9, 5.0), (2.9, -0.95, 5.0), (-2.9, -0.95, 5.0)],
             [(-2.4, -2.2, 6.3), (2.4, -2.2, 6.3), (2.4, -0.9, 6.3), (-2.4, -0.9, 6.3)],
             [(-1.2, -1.3, 8.4), (1.2, -1.3, 8.4), (1.2, -0.8, 8.4), (-1.2, -0.8, 8.4)]]
    p.grid(rings, IRON, METAL, smooth=False, cap0=False)
    p.box((0, -1.93, 4.96), (5.9, 2.0, 0.1), IRON)
    p.rivets((-2.7, -2.95, 5.0), (2.7, -2.95, 5.0), NY, 0.45, 0.06, IRON)
    p.stripes((-2.9, -2.9505, 5.08), X, Z, NY, 5.8, 0.14, pitch=0.3, slant=1.0)
    for sx in (-1, 1):
        p.flat((sx * 2.8, -2.8, 5.0), (sx * 2.8, -1.0, 3.6), 0.12, 0.08, IRON, up=(sx, 0, 0))
        p.chain([(sx * 2.2, -2.8, 4.95), (sx * 2.2, -2.8, 3.9)], link=0.3, w=0.18, r=0.04)
    # Spout lip toward -Y at Z 1.
    p.bx((-0.75, -3.0, 0.72), (0.75, -0.9, 0.9), IRON)
    for sx in (-1, 1):
        p.bx((sx * 0.75 - 0.08, -3.0, 0.72), (sx * 0.75 + 0.08, -0.9, 1.3), IRON)
        with p.as_kind(K_STONE):
            p.bx((sx * 0.6 - 0.1, -2.96, 0.9), (sx * 0.6 + 0.1, -0.9, 1.22), BRICK, mat=PAINT)
        p.rivets((sx * 0.84, -2.8, 1.1), (sx * 0.84, -1.2, 1.1), (sx, 0, 0), 0.4, 0.05, IRON)
    p.bx((-0.5, -2.98, 0.9), (0.5, -0.9, 1.0), MOLTEN, mat=GLOW)
    p.bx((-0.25, -2.4, 1.0), (0.25, -0.95, 1.012), MOLTEN_HOT, mat=GLOW)
    for sx in (-1, 1):
        p.flat((sx * 0.6, -2.7, 0.72), (sx * 0.6, -2.2, 0.0), 0.14, 0.08, IRON, up=(sx, 0, 0))
    # Bustle pipe and tuyeres.
    bust = fillet([(-4.95, 0.2, 3.3), (-4.95, 5.5, 3.3)], 0.1)
    for sx in (-1, 1):
        p.tube([(sx * 5.0, -0.2, 3.3), (sx * 5.0, 5.4, 3.3)], 0.3, COPPER, sides=9)
        for y in (0.8, 2.8, 4.8):
            p.tube(fillet([(sx * 5.0, y, 3.3), (sx * 5.0, y, 1.9), (sx * 4.6, y, 1.5)], 0.35), 0.16, COPPER, sides=7)
            p.turned((sx * 4.9, y, 1.72), (-sx, 0, -0.7), [(0.2, 0), (0.24, 0.05), (0.24, 0.2), (0.14, 0.4)], BRASS,
                     sides=8)
            p.box((sx * 4.86, y, 3.3), (0.3, 0.16, 0.8), IRON)
    p.tube(fillet([(-5.0, 5.4, 3.3), (-5.0, 5.98, 3.3), (5.0, 5.98, 3.3), (5.0, 5.4, 3.3)], 0.5), 0.3, COPPER,
           sides=9)
    del bust
    p.gauge((-3.85, -1.12, 2.3), NY, 0.24)
    p.gauge((3.85, -1.12, 2.3), NY, 0.24)
    # Chimney.
    with p.as_kind(K_STONE):
        chim = ((9.0, 10.8, 1.8), (10.8, 12.4, 1.62), (12.4, 13.6, 1.46))
        for (z0, z1, hw) in chim:
            p.bx((-hw, 3.4 - hw, z0), (hw, 3.4 + hw, z1), p.vary(BRICK, 0.08), mat=PAINT, bevel=0.05)
        p.bx((-1.62, 3.4 - 1.62, 13.6), (1.62, 3.4 + 1.62, 14.0), STONE, mat=PAINT, bevel=0.05)
        p.bx((-4.3, -0.4, 9.0), (4.3, 5.9, 9.3), STONE, mat=PAINT, bevel=0.06)
    with p.as_kind(K_PLAIN):
        p.bx((-1.2, 3.4 - 1.2, 13.99), (1.2, 3.4 + 1.2, 14.0), SOOT, mat=PAINT)
    for (z, hw) in ((10.8, 1.8), (12.4, 1.62)):
        p.bx((-hw - 0.06, 3.4 - hw - 0.06, z - 0.1), (hw + 0.06, 3.4 + hw + 0.06, z + 0.1), IRON)
        p.rivets((-hw + 0.2, 3.4 - hw - 0.065, z), (hw - 0.2, 3.4 - hw - 0.065, z), NY, 0.5, 0.06, IRON)
    return p


@piece('Pier')
def pier():
    """A foundation pier for the skyline in the drop (X +-7, Y +-7, flaring to
    +-9 at the base, Z 0..100, flat top at Z 100): tapered stone courses,
    corner buttress ribs, riveted iron bands, a pipe down one face, a
    corbelled cap. Sparse on purpose: it is big and far."""
    p = P('Pier', rust=0.7, ao_dist=3.0, ao=0.8, grime=None)
    def hw(z):
        if z < 14:
            return 9.0 - (9.0 - 6.9) * (z / 14.0) ** 0.7
        return 6.9 - 0.4 * (z - 14) / 82.0

    levels = [0, 5, 14, 26, 38.5, 51, 63.5, 76, 88.5, 96]
    with p.as_kind(K_STONE):
        for z0, z1 in zip(levels, levels[1:]):
            a, b = hw(z0), hw(z1)
            p.box((0, 0, (z0 + z1) / 2), (a * 2, a * 2, z1 - z0), p.vary(STONE, 0.1), mat=PAINT, taper=b / a,
                  bevel=0.25)
        p.box((0, 0, 97.0), (13.4, 13.4, 2.0), STONE_LIGHT, mat=PAINT, bevel=0.2, taper=1.03)
        p.box((0, 0, 99.0), (14.0, 14.0, 2.0), STONE, mat=PAINT, bevel=0.2)
        for sx in (-1, 1):
            for sy in (-1, 1):
                pts = [(sx * (hw(z) + 0.1), sy * (hw(z) + 0.1), z) for z in (0, 14, 50, 84)]
                for (a, b) in zip(pts, pts[1:]):
                    p.flat(a, b, 2.4 - 0.016 * b[2], 2.4 - 0.016 * b[2], p.vary(STONE_LIGHT, 0.08), up=(sx, 0, 0),
                           mat=PAINT)
            for z0, z1 in ((0, 14), (14, 46)):
                p.flat((sx * (hw(z0) + 0.3), 0, z0), (sx * (hw(z1) + 0.05), 0, z1), 2.0, 1.2, p.vary(STONE, 0.08),
                       up=(sx, 0, 0), mat=PAINT)
                p.flat((0, sx * (hw(z0) + 0.3), z0), (0, sx * (hw(z1) + 0.05), z1), 2.0, 1.2, p.vary(STONE, 0.08),
                       up=(0, sx, 0), mat=PAINT)
    for z in levels[2:]:
        h = hw(z) + 0.12
        for s in (-1, 1):
            p.box((0, s * h, z), (h * 2 + 0.3, 0.3, 0.9), IRON)
            p.box((s * h, 0, z), (0.3, h * 2 + 0.3, 0.9), IRON)
            for k in range(4):
                t = -h * 0.75 + k * h * 0.5
                p.rivet((t, s * (h + 0.15), z), (0, s, 0), 0.22, BRASS)
                p.rivet((s * (h + 0.15), t, z), (s, 0, 0), 0.22, BRASS)
    p.tube([(3.0, -hw(z) - 0.6, z) for z in (2, 14, 50, 95)], 0.45, COPPER, sides=7)
    for z in (20, 44, 70, 92):
        p.box((3.0, -hw(z) - 0.4, z), (1.3, 0.8, 0.4), IRON)
    return p


@piece('BoilerHouse')
def boiler_house():
    """HERO (render only): the engine house on a pier top (X +-9, Y +-7, roof at
    Z 14, two smokestacks to Z 34): a girder platform with a railed catwalk
    round it, brick lower walls and a riveted iron upper storey, lit arched
    windows, open end bays showing boiler fronts with firebox glow, a seamed
    pitched roof with a monitor, pipes down the front, and two stacks (smoke
    at (-4.5, 2.2, 34) and (4.5, 2.2, 34))."""
    p = P('BoilerHouse', rust=0.65, verd=0.5, ground=None, grime=None, ao_dist=2.0)
    p.box((0, 0, 0.3), (18.0, 14.0, 0.6), IRON, bevel=0.06)
    for sy in (-1, 1):
        p.rivets((-8.5, sy * 7.005, 0.3), (8.5, sy * 7.005, 0.3), (0, sy, 0), 1.0, 0.09, BRASS)
    for sx in (-1, 1):
        p.rivets((sx * 9.005, -6.5, 0.3), (sx * 9.005, 6.5, 0.3), (sx, 0, 0), 1.3, 0.09, BRASS)
    # Catwalk railing.
    corners = [(-8.8, -6.8), (8.8, -6.8), (8.8, 6.8), (-8.8, 6.8)]
    for i in range(4):
        a, b = Vector((*corners[i], 0.6)), Vector((*corners[(i + 1) % 4], 0.6))
        n = 6 if i % 2 == 0 else 5
        for k in range(n):
            q = a.lerp(b, k / n)
            p.cyl(q, q + Vector((0, 0, 1.25)), 0.05, IRON, sides=4, smooth=False)
        p.cyl(a + Vector((0, 0, 1.25)), b + Vector((0, 0, 1.25)), 0.07, BRASS, sides=5)
        p.cyl(a + Vector((0, 0, 0.7)), b + Vector((0, 0, 0.7)), 0.04, IRON, sides=4)
    # Walls.
    W, D = 7.4, 5.4
    with p.as_kind(K_STONE):
        p.bx((-W, -D, 0.6), (W, D, 4.2), BRICK, mat=PAINT, bevel=0.08)
        for k in range(4):
            z = 1.0 + k * 0.8
            p.bx((-W - 0.03, -D - 0.03, z), (W + 0.03, D + 0.03, z + 0.38), p.vary(BRICK, 0.1), mat=PAINT)
    p.bx((-W - 0.1, -D - 0.1, 4.1), (W + 0.1, D + 0.1, 4.5), IRON)
    p.bx((-W + 0.1, -D + 0.1, 4.5), (W - 0.1, D - 0.1, 10.0), IRON, bevel=0.06)
    p.bx((-W - 0.1, -D - 0.1, 9.8), (W + 0.1, D + 0.1, 10.2), IRON)
    for sy in (-1, 1):
        p.rivets((-W + 0.3, sy * (D + 0.105), 4.3), (W - 0.3, sy * (D + 0.105), 4.3), (0, sy, 0), 0.9, 0.08, BRASS)
        p.rivets((-W + 0.3, sy * (D + 0.105), 10.0), (W - 0.3, sy * (D + 0.105), 10.0), (0, sy, 0), 0.9, 0.08, BRASS)
        for k in range(6):
            x = -W + 0.1 + (2 * W - 0.2) * k / 5
            p.box((x, sy * (D - 0.02), 7.25), (0.3, 0.3, 5.5), BRASS if k in (0, 5) else IRON)
        # Lit arched windows.
        for k in range(5):
            x = -W + 0.1 + (2 * W - 0.2) * (k + 0.5) / 5
            y = sy * (D - 0.06)
            n = (0, sy, 0)
            p.box((x, y, 6.6), (1.5, 0.06, 2.6), WINDOW, mat=GLOW)
            p.arc_block((x, y, 7.9), n, 0.02, 0.75, 0.03, 0.0, PI, WINDOW, seg=6, mat=GLOW, up=Z)
            p.arc_block((x, y + sy * 0.02, 7.9), n, 0.75, 0.95, 0.08, 0.0, PI, BRASS, seg=6, up=Z)
            p.box((x, y + sy * 0.04, 6.6), (0.08, 0.1, 2.6), IRON)
            for z in (5.9, 6.8, 7.7):
                p.box((x, y + sy * 0.04, z), (1.5, 0.1, 0.08), IRON)
            p.box((x, y + sy * 0.04, 5.25), (1.9, 0.2, 0.14), BRASS)
    # End bays: boiler fronts in dark openings.
    for sx in (-1, 1):
        x = sx * (W + 0.02)
        with p.as_kind(K_PLAIN):
            p.box((x, 0, 2.6), (0.06, 8.6, 3.6), SOOT, mat=PAINT)
        p.box((x + sx * 0.03, 0, 4.5), (0.2, 9.0, 0.3), IRON)
        for y in (-4.4, 0.0, 4.4):
            p.box((x + sx * 0.03, y, 2.6), (0.24, 0.3, 3.7), IRON)
        for y in (-2.2, 2.2):
            p.turned((x - sx * 0.5, y, 2.5), (sx, 0, 0), [(1.6, 0), (1.6, 0.5), (1.45, 0.6), (0.9, 0.7)], IRON,
                     sides=16, up=Z)
            p.rivet_ring((x - sx * 0.2, y, 2.5), X, 1.6, 12, 0.07, BRASS, up=Z)
            p.box((x + sx * 0.14, y, 1.5), (0.1, 1.0, 0.7), BRASS, bevel=0.02)
            p.box((x + sx * 0.2, y, 1.5), (0.03, 0.6, 0.4), MOLTEN, mat=GLOW)
            p.gauge((x + sx * 0.22, y + 0.9, 3.3), (sx, 0, 0), 0.24)
        for k in range(3):
            y = -3.0 + k * 3.0
            p.box((x, y, 7.2), (0.12, 1.6, 2.4), SLATE, mat=PAINT)
            for j in range(5):
                p.box((x + sx * 0.08, y, 6.3 + j * 0.45), (0.1, 1.5, 0.08), IRON, rot=(0, sx * 0.5, 0))
    # Roof and monitor.
    rings = [[(-W - 0.5, -D - 0.5, 10.2), (W + 0.5, -D - 0.5, 10.2), (W + 0.5, D + 0.5, 10.2), (-W - 0.5, D + 0.5, 10.2)],
             [(-W - 0.5, -1.4, 13.0), (W + 0.5, -1.4, 13.0), (W + 0.5, 1.4, 13.0), (-W - 0.5, 1.4, 13.0)]]
    p.grid(rings, VERD_DARK, METAL, smooth=False)
    for k in range(16):
        x = -W - 0.3 + (2 * W + 0.6) * k / 15
        for sy in (-1, 1):
            p.flat((x, sy * (D + 0.5), 10.25), (x, sy * 1.4, 13.05), 0.12, 0.12, VERDIGRIS, up=(0, sy * 0.57, 0.82))
    p.bx((-W + 0.6, -1.3, 12.9), (W - 0.6, 1.3, 13.5), IRON)
    for sy in (-1, 1):
        p.box((0, sy * 1.31, 13.2), (2 * W - 1.6, 0.04, 0.36), WINDOW, mat=GLOW)
        for k in range(9):
            p.box((-W + 1.0 + (2 * W - 2.0) * k / 8, sy * 1.33, 13.2), (0.1, 0.06, 0.5), IRON)
    rings = [[(-W + 0.4, -1.6, 13.5), (W - 0.4, -1.6, 13.5), (W - 0.4, 1.6, 13.5), (-W + 0.4, 1.6, 13.5)],
             [(-W + 0.4, -0.05, 14.0), (W - 0.4, -0.05, 14.0), (W - 0.4, 0.05, 14.0), (-W + 0.4, 0.05, 14.0)]]
    p.grid(rings, VERD_DARK, METAL, smooth=False)
    p.cyl((-W + 0.3, 0, 14.0), (W - 0.3, 0, 14.0), 0.1, BRASS, sides=6)
    # Stacks.
    for sx in (-1, 1):
        c = Vector((sx * 4.5, 2.2, 11.0))
        p.box(c + Vector((0, 0, 0.6)), (2.8, 2.8, 1.6), IRON, bevel=0.1)
        stack(p, c + Vector((0, 0, 1.2)), 1.15, 0.88, 34.0 - 12.2, bands=(6.0, 13.0, 19.0), seams=4, sides=16)
        for k in range(3):
            a = TAU * k / 3 + 0.4
            d = Vector((math.cos(a), math.sin(a), 0))
            p.cyl(c + d * 1.0 + Vector((0, 0, 14.2)), c + d * 3.6 + Vector((0, 0, 1.5 if abs(c.y + d.y * 3.6) < D else 0.4)),
                  0.035, STEEL_DARK, sides=4)
    # Pipes down the front and off the platform edge.
    for (x, r) in ((-2.0, 0.45), (-0.9, 0.3), (5.8, 0.38)):
        p.tube(fillet([(x, -D - 0.1, 8.6), (x, -D - 0.9, 8.6), (x, -D - 0.9, 1.4), (x, -7.5, 1.4), (x, -7.5, 0.0)],
                      0.6), r, COPPER, sides=8)
        p.flange((x, -D - 0.9, 5.0), Z, r + 0.16, 0.12, BRASS, bolts=5, sides=10)
        p.box((x, -D - 0.5, 6.8), (r * 2 + 0.3, 0.9, 0.16), IRON)
    p.turned((-2.0, -D - 0.9, 3.0), Z, [(0.47, 0), (0.7, 0.1), (0.7, 0.5), (0.47, 0.6)], BRASS, sides=10)
    p.cyl((-2.0, -D - 1.5, 3.3), (-2.0, -D - 2.0, 3.3), 0.06, STEEL, sides=5)
    p.handwheel((-2.0, -D - 2.02, 3.3), NY, 0.5)
    return p


# ==================================================================== P2 / P3
@piece('Scaffold', foot=('box', 2.0, 2.0))
def scaffold():
    """A pipe-and-clamp scaffold bay (X +-2, Y +-2, Z 0..4, stackable): four
    standards on base plates, ledgers and transoms with brass clamps, diagonal
    braces, a plank deck with a toe board, a ladder inside."""
    p = P('Scaffold', rust=0.7)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * 1.85, sy * 1.85
            p.cyl((x, y, 0.03), (x, y, 4.0), 0.06, STEEL_DARK, sides=6)
            p.box((x, y, 0.015), (0.3, 0.3, 0.03), IRON)
            p.turned((x, y, 3.85), Z, [(0.075, 0), (0.075, 0.15)], STEEL, sides=6, cap0=False, cap1=False)
    for z in (0.4, 2.0, 3.6):
        for s in (-1, 1):
            p.cyl((-1.95, s * 1.92, z), (1.95, s * 1.92, z), 0.05, STEEL_DARK, sides=5)
            p.cyl((s * 1.92, -1.95, z + 0.1), (s * 1.92, 1.95, z + 0.1), 0.05, STEEL_DARK, sides=5)
            for t in (-1, 1):
                p.box((t * 1.85, s * 1.9, z), (0.16, 0.14, 0.14), BRASS, bevel=0.02)
                p.box((s * 1.9, t * 1.85, z + 0.1), (0.14, 0.16, 0.14), BRASS, bevel=0.02)
    for s in (-1, 1):
        p.cyl((s * 1.96, -1.85, 0.45), (s * 1.96, 1.85, 3.55), 0.04, STEEL_DARK, sides=4)
    p.cyl((-1.85, 1.97, 0.45), (1.85, 1.97, 3.55), 0.04, STEEL_DARK, sides=4)
    with p.as_kind(K_SOFT):
        for k in range(6):
            p.box((0, -1.55 + k * 0.62, 3.76), (3.9, 0.58, 0.08), p.vary(TIMBER, 0.12), mat=PAINT, bevel=0.012)
        p.box((0, -1.9, 3.9), (3.6, 0.05, 0.2), TIMBER_DARK, mat=PAINT)
    ladder(p, (1.2, 1.2, 0.1), (1.2, 0.6, 3.75), (0, 1, 0.2), width=0.45, rung=0.4)
    return p


@piece('Spool', foot=('box', 0.6, 0.8))
def spool():
    """A cable spool on its side (X +-0.6, Y +-0.8, Z 0..1.6): timber flanges
    with iron tyres and bolts, wound steel cable, a loose end, chocks."""
    p = P('Spool', rust=0.7)
    for s in (-1, 1):
        with p.as_kind(K_SOFT):
            p.turned((s * 0.52, 0, 0.8), (s, 0, 0), [(0.78, 0), (0.78, 0.08)], TIMBER, sides=18, mat=PAINT, up=Z,
                     smooth=False)
        p.annulus((s * 0.56, 0, 0.8), X, 0.74, 0.8, 0.045, IRON, sides=18, chamfer=0.01, up=Z)
        for k in range(6):
            a = TAU * k / 6
            p.bolt((s * 0.6, math.cos(a) * 0.5, 0.8 + math.sin(a) * 0.5), (s, 0, 0), 0.035, 0.02)
        p.turned((s * 0.56, 0, 0.8), (s, 0, 0), [(0.14, 0), (0.14, 0.03), (0.08, 0.04)], IRON, sides=8)
    prof = [(0.5, -0.52)] + [(0.5 + 0.02 * (k % 2), -0.5 + k * 0.1) for k in range(11)] + [(0.5, 0.52)]
    p.turned((0, 0, 0.8), X, prof, STEEL_DARK, sides=16, up=Z, cap0=False, cap1=False)
    p.tube([(0.2, -0.5, 0.75), (0.25, -0.62, 0.4), (0.3, -0.7, 0.05), (0.1, -0.78, 0.03)], 0.03, STEEL_DARK, sides=4)
    with p.as_kind(K_SOFT):
        for s in (-1, 1):
            p.box((0, s * 0.62, 0.07), (1.0, 0.24, 0.14), TIMBER_DARK, mat=PAINT, taper=0.6)
    return p


@piece('YardGantry', foot=('legs', 25.5, 28.5, 3.0))
def yard_gantry():
    """A portal gantry crane on rail bogies (legs at X +-27, each X +-1.5, Y +-3
    below 4.5; beam at Z 14..16 spanning X +-28): braced A-legs on wheeled
    bogies, a riveted box-truss beam with a trolley rail, an operator ladder,
    thin hazard bands on the bogies and beam ends."""
    p = P('YardGantry', rust=0.65, verd=0.4, ao_dist=1.4)
    for s in (-1, 1):
        cx = s * 27.0
        for sy in (-1, 1):
            y = sy * 2.4
            p.box((cx, y, 0.75), (2.6, 1.0, 0.7), IRON, bevel=0.06)
            p.stripes((cx - 1.3, y + sy * 0.5005, 0.5) if sy < 0 else (cx + 1.3, y + sy * 0.5005, 0.5),
                      X if sy < 0 else (-1, 0, 0), Z, (0, sy, 0), 2.6, 0.16, pitch=0.3, slant=1.0)
            for dx in (-0.8, 0.8):
                p.turned((cx + dx, y - 0.2, 0.42), Y, [(0.44, 0), (0.4, 0.04), (0.4, 0.36), (0.44, 0.4)], STEEL_DARK,
                         sides=14, up=Z)
                p.turned((cx + dx, y + sy * 0.5, 0.42), (0, sy, 0), [(0.14, 0), (0.14, 0.06), (0.07, 0.09)], BRASS,
                         sides=8)
            p.ibeam((cx, y, 1.1), (cx, sy * 0.8, 14.0), 0.6, 0.5, 0.06, IRON, up=(s, 0, 0))
        for (za, zb) in ((1.6, 5.0), (5.0, 8.5), (8.5, 12.0)):
            ya, yb = 2.4 - 1.6 * (za - 1.1) / 12.9, 2.4 - 1.6 * (zb - 1.1) / 12.9
            p.flat((cx, -ya, za), (cx, yb, zb), 0.16, 0.06, IRON, up=(s, 0, 0))
            p.flat((cx, ya, za), (cx, -yb, zb), 0.16, 0.06, IRON, up=(s, 0, 0))
            p.flat((cx, -yb, zb), (cx, yb, zb), 0.2, 0.08, IRON, up=(s, 0, 0))
        p.box((cx, 0, 13.9), (1.6, 2.6, 0.3), IRON, bevel=0.04)
        ladder(p, (cx - s * 0.5, -2.5, 1.2), (cx - s * 0.5, -0.95, 13.8), NY, width=0.5, rung=0.5)
    for sy in (-1, 1):
        y = sy * 0.9
        p.flat((-28.0, y, 15.9), (28.0, y, 15.9), 0.3, 0.2, IRON, up=Z)
        p.flat((-28.0, y, 14.1), (28.0, y, 14.1), 0.3, 0.2, IRON, up=Z)
        n = 20
        for i in range(n):
            x0, x1 = -28.0 + 56.0 * i / n, -28.0 + 56.0 * (i + 1) / n
            if i % 2 == 0:
                p.flat((x0, y, 14.1), (x1, y, 15.9), 0.16, 0.07, IRON, up=(0, sy, 0))
            else:
                p.flat((x0, y, 15.9), (x1, y, 14.1), 0.16, 0.07, IRON, up=(0, sy, 0))
            p.rivet((x0, y + sy * 0.11, 15.9), (0, sy, 0), 0.07, BRASS)
            p.rivet((x0, y + sy * 0.11, 14.1), (0, sy, 0), 0.07, BRASS)
    for i in range(11):
        x = -28.0 + 56.0 * i / 10
        p.flat((x, -0.9, 14.1), (x, 0.9, 14.1), 0.2, 0.1, IRON, up=Z)
        p.flat((x, -0.9, 15.9), (x, 0.9, 15.9), 0.2, 0.1, IRON, up=Z)
    p.ibeam((-27.6, 0, 14.0 + 0.0), (27.6, 0, 14.0), 0.0 + 0.3, 0.5, 0.06, STEEL_DARK, up=Z)
    for s in (-1, 1):
        p.box((s * 27.9, 0, 15.0), (0.2, 2.2, 2.0), IRON, bevel=0.04)
        p.stripes((s * 28.001, -1.1, 14.2), Y, Z, (s, 0, 0), 2.2, 0.2, pitch=0.3, slant=1.0)
    return p


@piece('YardGantryTrolley')
def yard_gantry_trolley():
    """The yard gantry's trolley (origin on the beam's bottom; it moves along X):
    a wheeled frame on the trolley rail, a winch drum and motor case, and
    cables down to a hook block at Z -6."""
    p = P('YardGantryTrolley', rust=0.6, verd=0.4, ground=None, grime=None, ao_dist=0.7)
    p.box((0, 0, -0.35), (2.2, 1.6, 0.3), IRON, bevel=0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((sx * 0.8, sy * 0.36, 0.0), (0.4, 0.06, 0.7), IRON, bevel=0.02)
            p.turned((sx * 0.8, sy * 0.33, 0.14), (0, -sy, 0), [(0.14, 0), (0.14, 0.12)], STEEL, sides=10, up=Z)
    p.turned((-0.6, 0, -0.85), X, [(0.42, 0), (0.42, 0.05), (0.3, 0.07), (0.3, 1.13), (0.42, 1.15), (0.42, 1.2)],
             STEEL_DARK, sides=14, up=Z)
    for s in (-1, 1):
        p.box((s * 0.72, 0, -0.75), (0.1, 0.5, 0.6), IRON, bevel=0.02)
    p.box((0.0, 0.62, -0.8), (0.9, 0.5, 0.6), SLATE, mat=PAINT, bevel=0.04)
    p.rivets((-0.35, 0.875, -0.6), (0.35, 0.875, -0.6), Y, 0.23, 0.035, BRASS)
    for s in (-1, 1):
        p.cyl((s * 0.22, 0, -1.1), (s * 0.22, 0, -4.9), 0.025, STEEL_DARK, sides=4)
    with p.at(T(0, 0, -4.9)):
        for sy in (-1, 1):
            p.turned((0, sy * 0.15 - 0.03, -0.32), Y, [(0.32, 0), (0.34, 0.01), (0.34, 0.05), (0.32, 0.06)], IRON,
                     sides=12, up=Z)
            p.stripes((-0.24, sy * 0.182, -0.4), X, Z, (0, sy, 0), 0.48, 0.16, pitch=0.12, slant=0.7)
        p.turned((0, -0.06, -0.32), Y, [(0.36, 0), (0.39, 0.02), (0.35, 0.06), (0.39, 0.1), (0.36, 0.12)], BRASS,
                 sides=14, up=Z)
        p.box((0, 0, -0.6), (0.3, 0.38, 0.14), IRON, bevel=0.02)
        hook(p, (0, 0, -0.6), scale=0.55)
    return p


@piece('ObservationPost', foot=('box', 2.0, 2.0))
def observation_post():
    """A raised observation box (X +-2, Y +-2, Z 0..9): braced angle-iron legs,
    a riveted armour cabin with view slits, a pitched roof, a periscope, a
    brass rangefinder on the front sill, a ladder and a lamp."""
    p = P('ObservationPost', rust=0.65, verd=0.45)
    lattice_tower(p, 0, 0, 0.0, 5.2, 1.7, 2.6, IRON, leg=0.2, brace=0.12, t=0.03, hw1=1.45, cross=False)
    p.box((0, 0, 5.3), (3.8, 3.8, 0.2), IRON, bevel=0.04)
    for side in range(4):
        with p.at(T(0, 0, 0) @ R('Z', side * PI / 2)):
            p.box((0, -1.7, 6.0), (3.5, 0.08, 1.2), IRON, bevel=0.02)
            p.box((0, -1.7, 7.35), (3.5, 0.08, 0.5), IRON, bevel=0.02)
            for x in (-1.6, 0.0, 1.6):
                p.box((x, -1.72, 6.6), (0.2, 0.1, 2.0), IRON)
            with p.as_kind(K_PLAIN):
                p.box((0, -1.66, 6.85), (3.4, 0.02, 0.5), DARK, mat=PAINT)
            p.rivets((-1.5, -1.745, 5.6), (1.5, -1.745, 5.6), NY, 0.38, 0.045, BRASS)
            p.rivets((-1.5, -1.745, 7.45), (1.5, -1.745, 7.45), NY, 0.38, 0.045, BRASS)
    p.stripes((-1.75, -1.7455, 6.44), X, Z, NY, 3.5, 0.1, pitch=0.3, slant=1.1)
    p.turned((0, 0, 7.6), Z, [(2.75, 0), (2.75, 0.06), (0.5, 0.9), (0.3, 0.94)], VERD_DARK, sides=4, smooth=False,
             phase=PI / 4)
    p.tube(fillet([(0.8, 0.6, 8.0), (0.8, 0.6, 8.8), (0.8, 0.2, 8.85)], 0.12), 0.09, BRASS, sides=7)
    p.box((0.8, 0.14, 8.85), (0.24, 0.1, 0.2), BRASS, bevel=0.02)
    p.cyl((-0.7, -1.9, 6.75), (0.7, -1.9, 6.75), 0.09, BRASS, sides=8)
    for s in (-1, 1):
        p.turned((s * 0.7, -1.9, 6.75), NY, [(0.11, -0.05), (0.11, 0.12), (0.08, 0.14)], BRASS, sides=8)
    p.cyl((0, -1.9, 6.4), (0, -1.9, 6.7), 0.04, IRON, sides=5)
    p.box((0, -1.85, 6.38), (0.3, 0.3, 0.05), IRON)
    ladder(p, (0, -1.9, 0.1), (0, -1.78, 5.3), NY, width=0.5, rung=0.42)
    p.cage_lamp((-1.5, -1.95, 7.9), r=0.13, h=0.3, hood=False)
    return p


@piece('RangeFlag', foot=('circle', 0.5))
def range_flag():
    """A range pennant (pole r 0.12, Z 0..6.5, a weighted base r 0.5): an iron
    base weight with a lifting ring, a banded pole with a brass finial, an
    oxblood swallow-tail pennant with a thin hazard edge, a halyard."""
    p = P('RangeFlag', rust=0.7)
    p.turned((0, 0, 0), Z, [(0.5, 0), (0.5, 0.12), (0.36, 0.22), (0.16, 0.3), (0.12, 0.5)], IRON, sides=12)
    p.torus((0.3, 0, 0.26), Y, 0.07, 0.022, IRON, seg=8, sides=4)
    p.cyl((0, 0, 0.4), (0, 0, 6.2), 0.07, STEEL_DARK, sides=8)
    for z in (1.0, 1.25):
        chevron_ring(p, (0, 0, 0), 0.074, z, z + 0.2, n=6)
    p.turned((0, 0, 6.2), Z, [(0.09, 0), (0.09, 0.06), (0.05, 0.1), (0.1, 0.18), (0.02, 0.3)], BRASS, sides=8)
    with p.as_kind(K_SOFT):
        rows = []
        for i in range(7):
            t = i / 6
            x = 0.08 + 2.2 * t
            y = 0.18 * math.sin(t * 5.0) * t
            dz = -0.25 * t * t
            top, bot = 6.1 + dz, 5.0 + dz + 0.35 * t
            if i == 6:
                rows.append([(x, y, top), (x - 0.5, y, (top + bot) / 2), (x, y, bot), (x, y + 0.02, bot),
                             (x - 0.5, y + 0.02, (top + bot) / 2), (x, y + 0.02, top)])
            else:
                mid = (top + bot) / 2
                rows.append([(x, y, top), (x, y, mid), (x, y, bot), (x, y + 0.02, bot), (x, y + 0.02, mid),
                             (x, y + 0.02, top)])
        p.grid(rows, OXBLOOD, PAINT, smooth=False)
    p.box((0.1, 0.0, 5.55), (0.06, 0.03, 1.1), HAZARD, mat=PAINT)
    p.cyl((0.09, 0, 6.15), (0.09, 0.02, 1.4), 0.012, CANVAS, sides=4, mat=PAINT)
    p.box((0.09, 0.02, 1.4), (0.08, 0.12, 0.04), BRASS)
    return p


@piece('FloodMast', foot=('circle', 0.5))
def flood_mast():
    """A flood lamp mast (r 0.5, Z 0..10): a bolted foot, a banded iron mast with
    rungs, a cross head with four caged lamp heads (warm glow, glass) under
    enamelled hoods, a conduit and a junction box."""
    p = P('FloodMast', rust=0.65, verd=0.45)
    p.turned((0, 0, 0), Z, [(0.5, 0), (0.5, 0.1), (0.3, 0.2), (0.2, 0.6), (0.16, 0.7), (0.12, 9.0), (0.16, 9.05),
                            (0.16, 9.25), (0.08, 9.3)], IRON, sides=10)
    for k in range(6):
        a = TAU * k / 6
        p.bolt((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.1), Z, 0.04, 0.05)
    for z in (0.8, 4.5):
        p.band((0, 0, z), Z, 0.155 - 0.004 * z, 0.12, BRASS, sides=10, lip=0.03)
    z = 1.6
    while z < 8.6:
        p.cyl((-0.3, 0, z), (0.3, 0, z), 0.02, STEEL_DARK, sides=4)
        z += 0.5
    p.box((0, -0.2, 1.3), (0.24, 0.14, 0.32), SLATE, mat=PAINT, bevel=0.02)
    p.tube([(0, -0.16, 1.46), (0, -0.17, 8.8), (0, -0.1, 9.1)], 0.025, COPPER, sides=4)
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        p.tube([Vector((0, 0, 9.15)), d * 0.3 + Vector((0, 0, 9.5)), d * 0.42 + Vector((0, 0, 9.46))], 0.035, IRON,
               sides=5)
        p.cage_lamp(d * 0.42 + Vector((0, 0, 9.12)), r=0.15, h=0.34, hood=True)
    p.turned((0, 0, 9.3), Z, [(0.1, 0), (0.06, 0.3), (0.012, 0.7)], BRASS, sides=6)
    return p


@piece('StormCoil', foot=('circle', 1.0))
def storm_coil():
    """A small storm coil (r 1.0, Z 0..6.5): a bolted pedestal, three ceramic
    insulator legs, a copper winding on an enamelled core between brass
    collars, a corona ring and a blue glow sphere on top."""
    p = P('StormCoil', rust=0.55, verd=0.6)
    p.turned((0, 0, 0), Z, [(0.95, 0), (0.95, 0.18), (0.8, 0.28), (0.8, 0.4)], IRON, sides=8, smooth=False,
             phase=PI / 8)
    for k in range(8):
        a = TAU * k / 8
        p.bolt((math.cos(a) * 0.84, math.sin(a) * 0.84, 0.19), Z, 0.045, 0.05)
    for k in range(3):
        a = TAU * k / 3 + PI / 2
        insulator_stack(p, (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.4), 0.22, 1.3, 4, sides=8)
    p.turned((0, 0, 1.7), Z, [(0.8, 0), (0.8, 0.1), (0.5, 0.2), (0.46, 0.32)], BRASS, sides=14)
    with p.as_kind(K_PAINT):
        p.cyl((0, 0, 2.0), (0, 0, 5.0), 0.34, ENAMEL, sides=12, mat=PAINT)
    p.tube(helix((0, 0, 0), 0.44, 2.1, 4.9, 10, seg=10), 0.08, COPPER, sides=5)
    p.turned((0, 0, 4.9), Z, [(0.4, 0), (0.54, 0.08), (0.54, 0.24), (0.2, 0.34), (0.1, 0.9)], BRASS, sides=14)
    p.torus((0, 0, 5.5), Z, 0.6, 0.08, BRASS, seg=18, sides=6)
    for k in range(3):
        a = TAU * k / 3
        p.cyl((math.cos(a) * 0.12, math.sin(a) * 0.12, 5.4), (math.cos(a) * 0.58, math.sin(a) * 0.58, 5.5), 0.025,
              BRASS, sides=4)
    p.sphere((0, 0, 6.12), 0.36, STORM, mat=GLOW, rings=6, sides=12)
    return p


@piece('DraftScaffoldTower', foot=('box', 1.5, 1.5))
def draft_scaffold_tower():
    """A lattice tower for the Prime Draft landmark's scaffold (X +-1.5, Y +-1.5,
    Z 0..46): riveted angle-iron bays on a stone pad, hazard-banded braces at
    the foot, a ladder, a clamp-arm stub at Z 30 toward +X, a top lamp."""
    p = P('DraftScaffoldTower', rust=0.65, verd=0.4, ao_dist=1.2)
    with p.as_kind(K_STONE):
        p.box((0, 0, 0.2), (3.0, 3.0, 0.4), STONE, mat=PAINT, bevel=0.06)
    lattice_tower(p, 0, 0, 0.4, 45.4, 1.36, 3.75, IRON, leg=0.26, brace=0.15, t=0.04, hw1=1.1, cross=True)
    for sx in (-1, 1):
        p.stripes((sx * 1.38, -1.3, 0.6) if sx > 0 else (sx * 1.38, 1.3, 0.6), Y if sx > 0 else NY, Z, (sx, 0, 0),
                  2.6, 0.18, pitch=0.3, slant=1.0)
    p.stripes((-1.3, -1.38, 0.6), X, Z, NY, 2.6, 0.18, pitch=0.3, slant=1.0)
    ladder(p, (0, -1.5, 0.5), (0, -1.24, 45.0), NY, width=0.5, rung=0.6)
    p.ibeam((1.1, 0, 30.0), (1.5, 0, 30.0), 0.6, 0.5, 0.07, IRON, up=Z)
    p.box((1.2, 0, 30.0), (0.4, 1.2, 1.0), IRON, bevel=0.05)
    for sy in (-1, 1):
        p.bolt((1.4, sy * 0.4, 30.3), X, 0.07, 0.08)
        p.bolt((1.4, sy * 0.4, 29.7), X, 0.07, 0.08)
    p.box((0, 0, 45.5), (2.5, 2.5, 0.2), IRON, bevel=0.04)
    p.cage_lamp((0, 0, 45.78), r=0.16, h=0.3, hood=False)
    return p


@piece('Cable')
def cable():
    """A thin cable from X 0 to X 1 (r 0.08); the runtime stretches and shears it."""
    p = P('Cable', rust=0.4, ground=None, grime=None, ao=0.0, weather=0.6)
    p.cyl((0, 0, 0), (1, 0, 0), 0.08, STEEL_DARK, sides=6, cap0=False, cap1=False)
    return p


@piece('FloorGrille', foot=('box', 1.0, 0.6))
def floor_grille():
    """A vent grille set in a floor (X +-1, Y +-0.6, Z 0..0.06): a riveted iron
    frame, bars over a dark pit."""
    p = P('FloorGrille', rust=0.7, ao_dist=0.3, grime=None)
    with p.as_kind(K_PLAIN):
        p.box((0, 0, 0.006), (1.8, 1.0, 0.01), DARK, mat=PAINT)
    for s in (-1, 1):
        p.box((0, s * 0.54, 0.03), (2.0, 0.12, 0.06), IRON)
        p.box((s * 0.94, 0, 0.03), (0.12, 0.96, 0.06), IRON)
        for t in (-1, 1):
            p.rivet((s * 0.94, t * 0.54, 0.05), Z, 0.03, STEEL)
    for k in range(9):
        p.box((-0.8 + k * 0.2, 0, 0.035), (0.07, 0.98, 0.04), STEEL_DARK)
    return p


@piece('ChainHang')
def chain_hang():
    """A hanging chain (origin at the top) down to Z -6 with a hook."""
    p = P('ChainHang', rust=0.7, ground=None, grime=None, ao_dist=0.3, ao=0.6)
    p.torus((0, 0, -0.12), Y, 0.1, 0.035, IRON, seg=8, sides=4)
    p.chain([(0, 0, -0.2), (0, 0, -5.1)], link=0.4, w=0.22, r=0.045)
    hook(p, (0, 0, -5.08), scale=1.0)
    return p


# @@END_PIECES@@


# ===================================================================== checks
# Head-room footprints (half extents in yards): everything between 1.6 and 4.5
# above the base must lie inside the footprint plus 0.5.
def _foot_ok(spec, x, y):
    kind = spec[0]
    if kind == 'box':
        return abs(x) <= spec[1] + 0.5 and abs(y) <= spec[2] + 0.5
    if kind == 'circle':
        return math.hypot(x, y) <= spec[1] + 0.5
    if kind == 'boxy':      # a box with a free back: (hx, y_front, y_back)
        return abs(x) <= spec[1] + 0.5 and -spec[2] - 0.5 <= y <= spec[3] + 0.5
    if kind == 'legs':      # only at |x| in [a, b]
        return spec[1] - 0.5 <= abs(x) <= spec[2] + 0.5 and abs(y) <= spec[3] + 0.5
    return True


def audit(obj):
    name = obj.name
    out = []
    vs = [v.co for v in obj.data.vertices]
    if not vs:
        return out
    if name in FOOT:
        bad = [v for v in vs if 1.6 <= v.z <= 4.5 and not _foot_ok(FOOT[name], v.x, v.y)]
        if bad:
            w = max(bad, key=lambda v: max(abs(v.x), abs(v.y)))
            out.append(f'HEADROOM {name} {len(bad)} verts outside, worst ({w.x:.2f}, {w.y:.2f}, {w.z:.2f})')
    if name in KNEE:
        top = max(v.z for v in vs)
        if top > KNEE[name] + 1e-3:
            out.append(f'KNEE {name} top {top:.2f} > {KNEE[name]}')
    if name in TILE_X:
        h = TILE_X[name]
        lo = min(v.x for v in vs)
        hi = max(v.x for v in vs)
        if lo < -h - 0.005 or hi > h + 0.005:
            out.append(f'TILE {name} x {lo:.3f}..{hi:.3f} beyond +-{h}')
    return out


# ===================================================================== build
def build_foundry_kit(root_name, builders):
    """hckit.build_kit with this kit's four materials (metal, paint, glow, glass)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = []
    for name, metal, rough, emission, alpha in (('KitMetal', 0.6, 0.45, 0.0, 1.0),
                                                ('KitPaint', 0.05, 0.8, 0.0, 1.0),
                                                ('KitGlow', 0.0, 0.8, 4.0, 1.0),
                                                ('KitGlass', 0.0, 0.1, 0.0, 0.4)):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        attribute = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Col'
        mat.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
        if emission:
            mat.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = emission
        if alpha < 1.0:
            bsdf.inputs['Alpha'].default_value = alpha
        materials.append(mat)
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []
    total = 0
    for builder in builders:
        try:
            obj = builder().finish(materials, root)
        except Exception:  # one bad piece must not sink the kit: report it and go on
            import traceback
            print('PIECE_FAILED', builder.__name__)
            traceback.print_exc()
            continue
        parts.append(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    problems = []
    for obj in parts:
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)
        total += tris
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        lo = [round(min(v[i] for v in bb), 2) for i in range(3)]
        hi = [round(max(v[i] for v in bb), 2) for i in range(3)]
        print(f'PIECE {obj.name} triangles {tris} min {lo} max {hi}')
        problems += audit(obj)
    for line in problems:
        print(line)
    print('KIT_TRIANGLES', total, 'PROBLEMS', len(problems))
    return parts


def export_foundry_kit(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_animations=False, export_cameras=False, export_lights=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False,
    )
    print('WROTE', path, os.path.getsize(path))


def layout_preview(parts):
    x = 0.0
    row = 0.0
    width = 0.0
    for obj in parts:
        d = obj.dimensions
        if x > 170:
            x = 0.0
            row += width + 10
            width = 0.0
        bb = [Vector(c) for c in obj.bound_box]
        lox = min(v.x for v in bb)
        loy = min(v.y for v in bb)
        obj.location = (x - lox, row - loy, 0)
        x += d.x + 6
        width = max(width, d.y)


def _setup_render(path, res=(1800, 1100)):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.view_settings.view_transform = 'Standard'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_cavity = True
    scene.display.shading.show_shadows = True
    scene.display.shading.shadow_intensity = 0.35
    scene.display.shading.background_type = 'VIEWPORT'
    scene.display.shading.background_color = (0.4, 0.43, 0.48)
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = path
    return scene


def render_preview(path, parts):
    scene = _setup_render(path)
    cam_data = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    lo = Vector((min(o.location.x + min(Vector(c).x for c in o.bound_box) for o in parts),
                 min(o.location.y + min(Vector(c).y for c in o.bound_box) for o in parts), 0))
    hi = Vector((max(o.location.x + max(Vector(c).x for c in o.bound_box) for o in parts),
                 max(o.location.y + max(Vector(c).y for c in o.bound_box) for o in parts), 30))
    centre = (lo + hi) / 2
    span = (hi - lo).length
    cam.location = centre + Vector((0, -0.85, 0.62)).normalized() * span * 0.82
    target = bpy.data.objects.new('ptarget', None)
    scene.collection.objects.link(target)
    target.location = centre
    track = cam.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    cam_data.lens = 30
    cam_data.clip_end = 5000
    scene.camera = cam
    bpy.ops.render.render(write_still=True)


PARTNER = {
    'Kit_GreatCoil': [('Kit_GreatCoilGlow', (0, 0, 0))],
    'Kit_CraneMast': [('Kit_CraneJib', (0, 0, 16))],
    'Kit_PistonEngine': [('Kit_PistonRod', (0, 0, 3.0))],
    'Kit_MachineBlock': [('Kit_Flywheel', (3.6, 0, 2.6))],
    'Kit_LadleTrolley': [('Kit_Ladle', (0, 0, -2.0)), ('Kit_LadleRail', (0, 0, 0))],
    'Kit_PressPost': [('Kit_PressRam', (2.6, 0, 0))],
}


def render_closeups(parts, folder, views=((-0.55, -1.15, 0.42),)):
    """One framed render per piece (front three-quarter view, a 2.6 yd figure
    beside it for scale); partners draw with it at their placed offsets."""
    os.makedirs(folder, exist_ok=True)
    scene = _setup_render('', res=(1100, 1100))
    cam_data = bpy.data.cameras.new('closeup')
    cam_data.lens = 40
    cam_data.clip_end = 3000
    cam = bpy.data.objects.new('closeup', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = bpy.data.objects.new('target', None)
    scene.collection.objects.link(target)
    track = cam.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=2.6, location=(0, 0, 1.3))
    figure = bpy.context.active_object
    figure.name = 'ScaleFigure'
    names = {o.name: o for o in parts}
    for obj in parts:
        for o in parts:
            o.hide_render = True
            o.location = (0, 0, 0)
        obj.hide_render = False
        shown = [obj]
        for (fname, off) in PARTNER.get(obj.name, []):
            friend = names.get(fname)
            if friend:
                friend.hide_render = False
                friend.location = off
                shown.append(friend)
        pts = [o.location + Vector(c) for o in shown for c in o.bound_box]
        lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
        hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
        centre = (lo + hi) / 2
        size = max(3.0, (hi - lo).length)
        figure.location = (hi.x + 1.0, hi.y + 0.6, 1.3)
        target.location = centre
        for vi, view in enumerate(views):
            cam.location = centre + Vector(view).normalized() * size * 1.02
            suffix = '' if vi == 0 else f'_v{vi}'
            scene.render.filepath = os.path.join(folder, obj.name + suffix + '.png')
            bpy.ops.render.render(write_still=True)
    for o in parts:
        o.hide_render = False
        o.location = (0, 0, 0)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

    def arg(flag):
        return argv[argv.index(flag) + 1] if flag in argv else None

    preview = arg('--preview')
    closeups = arg('--closeups')
    save = arg('--save')
    only = arg('--pieces')
    views = ((-0.55, -1.15, 0.42),)
    if '--back' in argv:
        views = ((-0.55, -1.15, 0.42), (0.7, 1.0, 0.5))
    names = list(BUILDERS)
    if only:
        want = only.split(',')
        names = [n for n in names if n in want]
    parts = build_foundry_kit('StormbrassFoundryKit_ROOT', [BUILDERS[n] for n in names])
    if not only:
        export_foundry_kit(os.path.join(HERE, 'stormbrass_foundry_kit_components.glb'))
    if closeups:
        try:
            render_closeups(parts, closeups, views)
        except Exception:
            import traceback
            print('CLOSEUPS_FAILED')
            traceback.print_exc()
    if save or preview:
        layout_preview(parts)
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=save)
    if preview:
        render_preview(preview, parts)


if __name__ == '__main__':
    main()
