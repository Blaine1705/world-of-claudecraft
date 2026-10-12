"""Ruin craft for the Hollow Crypt world entrance (build_crypt_entrance.py).

hckit's Piece (the pilot kit's primitives) plus what a believable ruin needs:

- stone(): a hand-hewn block, every corner chipped a little, its two faces
  pillowed (a raised centre vertex) so each stone is four facets that catch
  the light differently, with joint-dark corners and a paler face;
- wall(): irregular coursing (every row its own height, every stone its own
  length), proud and recessed stones, missing stones over a dark rubble core,
  a stepped broken top, openings cut by callables, and a deform hook for
  leaning and sagging runs;
- arch(): moulded voussoir rings from an intrados polyline, bevelled;
- ivy(), grass(), litter(), leaf cards on a double-sided material;
- finish(): weathering baked into LINEAR vertex colour: a damp dark base,
  rain streaks, moss on tops and north faces, lichen, soot, and ray-cast
  ambient occlusion against the whole set piece and its terrain.

Colours are authored sRGB and converted once in finish(); the colour layer is
a FLOAT corner attribute, so the glTF exporter writes it unchanged.
Deterministic: every random draw comes from the piece's seeded rng, and no
set of bmesh elements is ever iterated.
"""
import math
import random
import zlib

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import entrance_common as ec
import hckit

B = ec.B
TAU = math.tau

# Material slots.
STONE, LEAF, VOID = 0, 1, 2
# Weathering kinds (per face).
K_STONE, K_WOOD, K_METAL, K_LEAF, K_RAW, K_CLOTH, K_EARTH = 0, 1, 2, 3, 4, 5, 6

# Vale limestone, five tones (sRGB) and what grows on it.
LIME = (0.60, 0.60, 0.57)
LIME_WARM = (0.63, 0.59, 0.51)
LIME_COOL = (0.52, 0.55, 0.57)
LIME_DARK = (0.41, 0.41, 0.41)
LIME_PALE = (0.69, 0.69, 0.65)
LIME_ROSE = (0.56, 0.50, 0.47)
CORE = (0.2, 0.19, 0.18)
MOSS_DEEP = (0.21, 0.31, 0.14)
MOSS_BRIGHT = (0.38, 0.46, 0.19)
LICHEN_PALE = (0.74, 0.76, 0.66)
LICHEN_OCHRE = (0.74, 0.62, 0.22)
DAMP = (0.17, 0.2, 0.15)
IVY = ((0.11, 0.24, 0.10), (0.16, 0.31, 0.12), (0.08, 0.17, 0.08), (0.2, 0.34, 0.13))
IVY_TURN = ((0.36, 0.22, 0.11), (0.45, 0.33, 0.14))
GRASS = ((0.30, 0.46, 0.17), (0.38, 0.52, 0.20), (0.24, 0.38, 0.15))
GRASS_DRY = (0.62, 0.58, 0.30)
STEM = (0.22, 0.17, 0.12)


def srgb_to_linear(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def scale(c, k):
    return tuple(min(1.0, max(0.0, v * k)) for v in c)


def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


fbm = hckit._fbm


def _faces_of(verts):
    seen, out = set(), []
    for v in verts:
        for f in v.link_faces:
            if f not in seen:
                seen.add(f)
                out.append(f)
    return out


def _edges_of(faces):
    seen, out = set(), []
    for f in faces:
        for e in f.edges:
            if e not in seen:
                seen.add(e)
                out.append(e)
    return out


def arch_points(half, rise, steps=6, round_=False):
    """Intrados of an arch springing at (+-half, 0) with its apex at (0, rise),
    left to right: a two-centred pointed arch (rise >= half) or a round one."""
    if round_ or rise < half:
        return [(-math.cos(math.pi * i / (2 * steps)) * half, math.sin(math.pi * i / (2 * steps)) * rise)
                for i in range(2 * steps + 1)]
    R = (half * half + rise * rise) / (2 * half)
    top = math.asin(min(1.0, rise / R))
    right = [(half - R + R * math.cos(top * i / steps), R * math.sin(top * i / steps)) for i in range(steps + 1)]
    return [(-x, z) for (x, z) in right[:-1]] + [(0.0, rise)] + right[-2::-1]


def arch_hole(half, spring, rise, cx=0.0, round_=False):
    """hole(x, y) for an arched opening (x across the wall, y up)."""
    R = (half * half + rise * rise) / (2 * half) if rise >= half and not round_ else None

    def hole(x, y):
        dx = abs(x - cx)
        if dx >= half or y <= -5:
            return False
        if y <= spring:
            return True
        if R is None:
            k = (y - spring) / rise
            return k < 1 and dx < half * math.sqrt(max(0.0, 1 - k * k))
        return math.hypot(dx - (half - R), y - spring) < R and y < spring + rise
    return hole


class Ruin(hckit.Piece):
    def __init__(self, name, seed=0, moss=1.0, damp=1.0):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.gen = self.bm.verts.layers.int.new('gen')
        self.kindL = self.bm.faces.layers.int.new('kind')
        self.stamp = 0
        self.rng = random.Random(zlib.crc32(name.encode()) * 131 + seed)
        self.kind = K_STONE
        self.moss = moss
        self.damp = damp
        self.soot = []
        self.streaks = []
        self.collect = None
        self.weather = 1.0
        self.lichen = 0.0

    # ------------------------------------------------------------ painting
    def _paint(self, faces, color, mat):
        for face in faces:
            face.material_index = mat
            face[self.kindL] = self.kind
            for loop in face.loops:
                loop[self.col] = (color[0], color[1], color[2], 1.0)

    def _new_faces(self, before):
        return [f for f in self.bm.faces if f not in before]

    def as_kind(self, kind):
        piece = self

        class _K:
            def __enter__(self_):
                self_.prev = piece.kind
                piece.kind = kind

            def __exit__(self_, *a):
                piece.kind = self_.prev
        return _K()

    def tone(self, u=0.0, y=0.0):
        """One stone's colour: the wall's drifting base plus the odd warm,
        cool, dark, pale or rose stone."""
        r = self.rng.random()
        drift = fbm(u * 0.21 + 3.1, y * 0.27 - 1.7, 0.5)
        base = mix(LIME, LIME_COOL, max(0.0, drift * 1.6 - 0.5))
        if r < 0.13:
            base = LIME_WARM
        elif r < 0.24:
            base = LIME_COOL
        elif r < 0.33:
            base = LIME_DARK
        elif r < 0.40:
            base = LIME_PALE
        elif r < 0.45:
            base = LIME_ROSE
        return self.vary(base, 0.06)

    # ---------------------------------------------------------- primitives
    def box(self, center, size, color, mat=STONE, bevel=0.0, yaw=0.0, pitch=0.0, roll=0.0, taper=1.0, M=None,
            chip=0.0, bottom=True):
        made = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = made['verts']
        rot = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'X') @ Matrix.Rotation(roll, 4, 'Y')
        m = min(size)
        for v in verts:
            k = taper if v.co.z > 0 else 1.0
            p = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2]))
            if chip:
                q = chip * m
                p = Vector((p.x - math.copysign(q * self.rng.random() ** 2, p.x),
                            p.y - math.copysign(q * self.rng.random() ** 2, p.y),
                            p.z - math.copysign(q * self.rng.random() ** 2, p.z)))
            p = rot @ p + Vector(center)
            v.co = M @ p if M is not None else p
        faces = _faces_of(verts)
        if not bottom:
            low = min(faces, key=lambda f: f.calc_center_median().z)
            bmesh.ops.delete(self.bm, geom=[low], context='FACES_ONLY')
            faces = [f for f in faces if f.is_valid]
        self._paint(faces, color, mat)
        if self.collect is not None:
            self.collect.extend(verts)
        if bevel > 0:
            out = bmesh.ops.bevel(self.bm, geom=_edges_of(faces), offset=bevel, segments=1, affect='EDGES',
                                  clamp_overlap=True)
            self._paint(out['faces'], color, mat)
            if self.collect is not None:
                self.collect.extend(v for v in out['verts'] if v not in verts)
        return faces

    def core(self, center, size, color):
        """The dark rubble core behind a run of stones: its two faces and its
        top only (the ends and the bed are never seen)."""
        cx, cy, cz = center
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        vs = [self.bm.verts.new(Vector((cx + i * hx, cy + j * hy, cz + k * hz)))
              for (i, j, k) in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1),
                                (-1, 1, 1))]
        if self.collect is not None:
            self.collect.extend(vs)
        for quad in ((0, 1, 5, 4), (2, 3, 7, 6), (4, 5, 6, 7)):
            f = self.bm.faces.new([vs[i] for i in quad])
            f.material_index = STONE
            f[self.kindL] = self.kind
            for loop in f.loops:
                loop[self.col] = (color[0], color[1], color[2], 1.0)

    def hewn(self, center, size, color, bevel=None, chip=0.08, **kw):
        """A dressed hero block: chipped corners, then a chamfer that catches light."""
        m = min(size)
        bev = min(0.07, m * 0.13) if bevel is None else bevel
        return self.box(center, size, color, bevel=bev, chip=chip, **kw)

    def stone(self, c, size, color, rot=None, chip=0.05, pillow=0.04, M=None, bottom=False, knock=0.1, ends=True):
        """A rough hewn walling stone (see the module docstring). Local frame:
        X along the wall, Y through it (the pillowed faces), Z up."""
        rng = self.rng
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        m = min(size)
        cs = []
        for (i, j, k) in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                          (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
            q = chip * m
            cs.append(Vector((i * (sx - q * rng.random() ** 2), j * (sy - q * 0.5 * rng.random() ** 2),
                              k * (sz - q * rng.random() ** 2))))
        if rng.random() < knock:
            i = rng.choice((4, 5, 6, 7, 4, 5, 6, 7, 0, 1))
            cs[i] = cs[i] * (0.62 + 0.2 * rng.random())
        mids = []
        for (quad, n) in (((0, 1, 5, 4), Vector((0, -1, 0))), ((2, 3, 7, 6), Vector((0, 1, 0)))):
            ctr = sum((cs[i] for i in quad), Vector()) / 4
            ctr += n * (pillow * m * (0.4 + rng.random())) + Vector(((rng.random() - 0.5) * sx * 0.5, 0,
                                                                      (rng.random() - 0.5) * sz * 0.5))
            mids.append(ctr)
        pts = cs + mids
        c = Vector(c)
        if rot is not None:
            pts = [rot @ p for p in pts]
        pts = [p + c for p in pts]
        if M is not None:
            pts = [M @ p for p in pts]
        vs = [self.bm.verts.new(p) for p in pts]
        if self.collect is not None:
            self.collect.extend(vs)
        edge = scale(color, 0.86 + 0.06 * rng.random())
        face = scale(color, 1.05)
        for (quad, mid) in (((0, 1, 5, 4), 8), ((2, 3, 7, 6), 9)):
            for k in range(4):
                f = self.bm.faces.new((vs[quad[k]], vs[quad[(k + 1) % 4]], vs[mid]))
                f.material_index = STONE
                f[self.kindL] = self.kind
                ls = f.loops
                ls[0][self.col] = (*edge, 1.0)
                ls[1][self.col] = (*edge, 1.0)
                ls[2][self.col] = (*face, 1.0)
        side = scale(color, 0.94)
        quads = ([(1, 2, 6, 5), (3, 0, 4, 7)] if ends else []) + [(4, 5, 6, 7)] + ([(3, 2, 1, 0)] if bottom else [])
        for quad in quads:
            f = self.bm.faces.new([vs[i] for i in quad])
            f.material_index = STONE
            f[self.kindL] = self.kind
            for loop in f.loops:
                loop[self.col] = (*side, 1.0)

    # --------------------------------------------------------------- walls
    def wall(self, a, b, depth, y0, top_fn, holes=(), course=(0.42, 0.72), unit=(1.1, 2.7), deform=None,
             missing=0.025, proud=0.045, chip=0.05, pillow=0.04, core=CORE, ragged=0.3, tone=None):
        """Coursed rubble-and-ashlar from a to b (local game (lx, lz)), bottom
        y0, top top_fn(t), t in [0, 1] from a. holes: callables (u, y) -> open.
        deform(u, n, y) -> (du, dn, dy) bends the finished run (a lean, a sag).
        Returns the top stones as Blender-space (centre, width) pairs."""
        ax, az = a
        bx, bz = b
        L = math.hypot(bx - ax, bz - az)
        M = Matrix.Translation(B(ax, az, 0)) @ Matrix.Rotation(math.atan2(-(bz - az), bx - ax), 4, 'Z')
        rng = self.rng
        tone = tone or self.tone
        prev, self.collect = self.collect, []
        tmax = max(top_fn(k / 60) for k in range(61))
        tops = []
        y, row = y0, 0
        while y < tmax - 0.1 and row < 200:
            h = rng.uniform(*course) * (1.3 if row == 0 else 1.0)
            u = -rng.uniform(0.15, 0.9) * h
            runs_row = []
            while u < L - 1e-3:
                w = h * rng.uniform(*unit)
                u0, u1 = max(0.0, u), min(L, u + w)
                u += w
                if u1 - u0 < 0.2:
                    continue
                top = min(top_fn(u0 / L), top_fn((u0 + u1) / (2 * L)), top_fn(u1 / L))
                hh = min(h, top - y)
                if hh < 0.2:
                    continue
                n = max(2, int((u1 - u0) / 0.1))
                start = None
                for k in range(n + 1):
                    uu = u0 + (u1 - u0) * k / n
                    solid = not any(hole(uu, y + hh * 0.25) or hole(uu, y + hh * 0.75) for hole in holes)
                    if solid and start is None:
                        start = uu
                    if (not solid or k == n) and start is not None:
                        r0, r1, start = start, uu, None
                        if r1 - r0 < 0.2:
                            continue
                        runs_row.append((r0, r1, hh))
                        is_top = top - (y + hh) < 0.2
                        if row > 1 and not is_top and rng.random() < missing:
                            continue
                        bh = hh - 0.016
                        if is_top:
                            bh *= 1 - rng.random() * ragged
                        off = (rng.random() - 0.5) * 2 * proud
                        rot = Matrix.Rotation((rng.random() - 0.5) * 0.03, 3, 'Z') @ \
                            Matrix.Rotation((rng.random() - 0.5) * (0.07 if is_top else 0.02), 3, 'Y')
                        self.stone((((r0 + r1) / 2), off, y + bh / 2), (r1 - r0 - 0.018, depth * (0.96 + rng.random() * 0.1),
                                                                         bh), tone((r0 + r1) / 2 + ax * 0.7, y), rot=rot,
                                   chip=chip, pillow=pillow, knock=0.3 if is_top else 0.0,
                                   ends=is_top or r0 - u0 > 1e-6 or u1 - r1 > 1e-6 or u0 <= 1e-6 or u1 >= L - 1e-6)
                        if is_top:
                            tops.append((Vector(((r0 + r1) / 2, 0, y + bh)), r1 - r0))
            # One dark core per solid run of the row (merged neighbours).
            merged = []
            for (r0, r1, hh) in runs_row:
                if merged and r0 - merged[-1][1] < 0.02 and abs(merged[-1][2] - hh) < 1e-6:
                    merged[-1][1] = r1
                else:
                    merged.append([r0, r1, hh])
            with self.as_kind(K_RAW):
                for (r0, r1, hh) in merged:
                    self.core(((r0 + r1) / 2, 0, y + hh / 2 - 0.02), (r1 - r0, depth * 0.84, hh), core)
            y += h
            row += 1
        out = []
        dfn = deform or (lambda u, n, yy: (0.0, 0.0, 0.0))
        for v in self.collect:
            du, dn, dy = dfn(v.co.x, v.co.y, v.co.z)
            v.co = M @ Vector((v.co.x + du, v.co.y + dn, v.co.z + dy))
        for (p, w) in tops:
            du, dn, dy = dfn(p.x, p.y, p.z)
            out.append((M @ Vector((p.x + du, p.y + dn, p.z + dy)), w))
        self.collect = prev
        return out

    def arch(self, pts, thick, depth, color, M, bevel=0.045, chip=0.04, skip=(), y_off=0.0, tone=0.07,
             depth_jit=0.04, center=None):
        """A ring of voussoirs over an intrados polyline pts [(x, z)] in the
        wall plane (X across, Z up; Y through the wall, centred on y_off)."""
        n = len(pts) - 1
        cx = sum(p[0] for p in pts) / len(pts)
        cz = min(p[1] for p in pts)
        outer = []
        for i, (x, z) in enumerate(pts):
            x0, z0 = pts[max(0, i - 1)]
            x1, z1 = pts[min(n, i + 1)]
            tx, tz = x1 - x0, z1 - z0
            ln = math.hypot(tx, tz) or 1.0
            nx, nz = tz / ln, -tx / ln
            if center is not None:
                ln = math.hypot(x - center[0], z - center[1]) or 1.0
                nx, nz = (x - center[0]) / ln, (z - center[1]) / ln
            elif nx * (x - cx) + nz * (z - cz) < 0:
                nx, nz = -nx, -nz
            outer.append((x + nx * thick, z + nz * thick))
        for i in range(n):
            if i in skip:
                continue
            quad = [pts[i], pts[i + 1], outer[i + 1], outer[i]]
            mx = sum(q[0] for q in quad) / 4
            mz = sum(q[1] for q in quad) / 4
            d = depth * (1 + (self.rng.random() - 0.5) * depth_jit)
            vs = []
            for yy in (-d / 2, d / 2):
                for (x, z) in quad:
                    q = Vector((mx + (x - mx) * 0.975, y_off + yy, mz + (z - mz) * 0.975))
                    q += (Vector((mx, y_off, mz)) - q) * (chip * self.rng.random() ** 2)
                    vs.append(self.bm.verts.new(M @ q))
            faces = []
            for idx in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
                faces.append(self.bm.faces.new([vs[k] for k in idx]))
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
            col = self.vary(color, tone)
            self._paint(faces, col, STONE)
            if bevel > 0:
                out = bmesh.ops.bevel(self.bm, geom=_edges_of(faces), offset=bevel, segments=1, affect='EDGES',
                                      clamp_overlap=True)
                self._paint(out['faces'], col, STONE)
        return outer

    def roll(self, pts, r, color, M, y_off=0.0, sides=5, out=0.0):
        """A roll moulding swept along a polyline in the wall plane."""
        n = len(pts) - 1
        cx = sum(p[0] for p in pts) / len(pts)
        cz = min(p[1] for p in pts)
        path = []
        for i, (x, z) in enumerate(pts):
            x0, z0 = pts[max(0, i - 1)]
            x1, z1 = pts[min(n, i + 1)]
            tx, tz = x1 - x0, z1 - z0
            ln = math.hypot(tx, tz) or 1.0
            nx, nz = tz / ln, -tx / ln
            if nx * (x - cx) + nz * (z - cz) < 0:
                nx, nz = -nx, -nz
            path.append(M @ Vector((x + nx * out, y_off, z + nz * out)))
        return self.sweep(path, r, r, color, sides=sides)

    # ------------------------------------------------------------- foliage
    def leaf(self, pos, normal, size, color, spin=0.0, droop=0.15, n=1):
        """n round leaf cards fanned from one point: a five-point blade each
        (stem end, two shoulders, a blunt double tip), lying near the plane
        whose normal is `normal` and drooping at the tip."""
        nrm = Vector(normal).normalized()
        t = nrm.cross(Vector((0, 0, 1)))
        if t.length < 1e-3:
            t = nrm.cross(Vector((1, 0, 0)))
        t.normalize()
        u = t.cross(nrm).normalized()
        p0 = Vector(pos)
        rng = self.rng
        for k in range(n):
            a = spin + TAU * k / n + (rng.random() - 0.5) * (1.2 if n > 1 else 0.0)
            d = t * math.cos(a) + u * math.sin(a)
            w = t * -math.sin(a) + u * math.cos(a)
            ln = size * (0.8 + 0.4 * rng.random())
            sag = nrm * ln * droop
            pts = (p0 + nrm * 0.015, p0 + d * ln * 0.38 + w * ln * 0.42 - sag * 0.3, p0 + d * ln * 0.9 + w * ln * 0.2 - sag,
                   p0 + d * ln * 0.9 - w * ln * 0.2 - sag, p0 + d * ln * 0.38 - w * ln * 0.42 - sag * 0.3)
            f = self.bm.faces.new([self.bm.verts.new(q) for q in pts])
            f.material_index = LEAF
            f[self.kindL] = K_LEAF
            c = scale(color, 0.84 + 0.3 * rng.random())
            for i, loop in enumerate(f.loops):
                loop[self.col] = (*scale(c, 0.72 if i == 0 else (1.12 if i in (2, 3) else 0.95)), 1.0)

    def ivy(self, base, out, height, width, stems=4, density=7.0, size=0.17, alive=None, lean=0.0, hang=False,
            mass=0):
        """Ivy climbing from `base` (Blender space) up a face whose outward
        normal is `out` (or hanging down it): wandering stems, leaves along
        them, thick low and thinning toward the tips."""
        rng = self.rng
        base = Vector(base)
        out = Vector(out).normalized()
        side = Vector((0, 0, 1)).cross(out)
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        sgn = -1.0 if hang else 1.0
        for s in range(stems):
            p = base + side * (rng.random() - 0.5) * width
            ln = height * (0.45 + 0.55 * rng.random())
            drift = (rng.random() - 0.5) * 0.5 + lean
            steps = max(3, int(ln / 0.28))
            pts = [p + out * 0.04]
            for i in range(steps):
                drift += (rng.random() - 0.5) * 0.35
                drift *= 0.85
                p = p + Vector((0, 0, sgn * ln / steps)) + side * drift * 0.28
                if alive is not None and not alive(p):
                    break
                pts.append(p + out * (0.05 + 0.03 * rng.random()))
            if len(pts) < 3:
                continue
            with self.as_kind(K_WOOD):
                self.sweep(pts[::3] + [pts[-1]] if len(pts) > 6 else pts[::2] + [pts[-1]], 0.035, 0.012, STEM, sides=3,
                           cap=False)
            for i, q in enumerate(pts):
                t = i / (len(pts) - 1)
                # A cluster hugging the stem: leaves alternate off it, pointing down
                # and out (their weight), thick low and thinner toward the tip.
                for j in range(max(1, mass + int(density * 0.5 * (1.3 - 0.75 * t) + rng.random()))):
                    lp = q + side * (rng.random() - 0.5) * 0.3 * (1.15 - 0.4 * t) + \
                        Vector((0, 0, (rng.random() - 0.5) * 0.26)) + out * (0.03 + rng.random() * 0.07)
                    c = IVY[rng.randrange(len(IVY))] if rng.random() > 0.06 else IVY_TURN[rng.randrange(2)]
                    self.leaf(lp, out + Vector(((rng.random() - 0.5) * 0.45, (rng.random() - 0.5) * 0.45,
                                               0.2 + rng.random() * 0.3)),
                              size * (0.8 + 0.45 * rng.random()) * (1.08 - 0.25 * t), self.vary(c, 0.1),
                              spin=-math.pi / 2 + (1 if j % 2 else -1) * (0.5 + rng.random() * 0.7), droop=0.3)

    def grass(self, pos, radius=0.3, blades=7, height=0.45, dry=0.2):
        """A tuft: one tapering triangle per blade, dark at the root."""
        p0 = Vector(pos)
        rng = self.rng
        for k in range(blades):
            a = TAU * k / blades + rng.uniform(-0.5, 0.5)
            r = radius * rng.uniform(0.05, 0.7)
            base = p0 + Vector((math.cos(a) * r, math.sin(a) * r, -0.05))
            h = height * rng.uniform(0.55, 1.3)
            lean = rng.uniform(0.1, 0.65)
            tip = base + Vector((math.cos(a) * h * lean, math.sin(a) * h * lean, h))
            sd = Vector((-math.sin(a), math.cos(a), 0)) * (0.035 + rng.random() * 0.03)
            c = GRASS_DRY if rng.random() < dry else GRASS[rng.randrange(3)]
            c = self.vary(c, 0.1)
            f = self.bm.faces.new([self.bm.verts.new(q) for q in (base - sd, base + sd, tip)])
            f.material_index = LEAF
            f[self.kindL] = K_LEAF
            ls = f.loops
            ls[0][self.col] = (*scale(c, 0.6), 1.0)
            ls[1][self.col] = (*scale(c, 0.6), 1.0)
            ls[2][self.col] = (*scale(c, 1.15), 1.0)

    def litter(self, center, radius, count, yfn, colors):
        """Fallen leaves: small flat cards lying on yfn(x, y) (Blender XY)."""
        rng = self.rng
        cx, cy = center
        for _ in range(count):
            a = rng.random() * TAU
            r = radius * math.sqrt(rng.random())
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            s = 0.1 + rng.random() * 0.1
            n = Vector(((rng.random() - 0.5) * 0.5, (rng.random() - 0.5) * 0.5, 1.0))
            self.leaf(Vector((x, y, yfn(x, y) + 0.03)), n, s * 1.5, self.vary(colors[rng.randrange(len(colors))], 0.12),
                      spin=rng.random() * TAU, droop=0.0)

    # ------------------------------------------------------------- finish
    def geometry(self, offset=0):
        """(verts, polys) of the solid (non-leaf) faces for the AO occluder."""
        self.bm.verts.index_update()
        verts = [v.co.copy() for v in self.bm.verts]
        polys = [[v.index + offset for v in f.verts] for f in self.bm.faces if f[self.kindL] != K_LEAF]
        return verts, polys

    def finish(self, materials, parent, ground=None, bvh=None, ao_dist=1.7):
        bm = self.bm
        bm.normal_update()
        rays = _hemisphere(9)
        gfn = ground or (lambda x, y: 0.0)
        moss_k, damp_k = self.moss, self.damp
        for face in bm.faces:
            kind = face[self.kindL]
            n = face.normal
            ctr = face.calc_center_median()
            ao_face = None
            if bvh is not None and kind != K_RAW:
                t = n.orthogonal().normalized()
                bt = n.cross(t)
                ao_face = [(t * d[0] + bt * d[1] + n * d[2]) for d in rays]
            up = max(0.0, n.z)
            north = max(0.0, -n.y)
            for loop in face.loops:
                p = loop.vert.co
                r, g, b, _ = loop[self.col]
                c = (r, g, b)
                h = p.z - gfn(p.x, p.y)
                if kind == K_STONE:
                    drift = 0.9 + 0.2 * fbm(p.x * 0.33, p.y * 0.33, p.z * 0.33)
                    streak = 0.92 + 0.12 * fbm(p.x * 2.3 + 7.1, p.y * 2.3 - 3.3, p.z * 0.2)
                    c = scale(c, drift * streak)
                    edge = fbm(p.x * 1.3 + 2.0, p.y * 1.3, 4.0) * 0.9
                    dmp = smooth(2.3 + edge, 0.1, h) * damp_k
                    c = mix(scale(c, 1 - 0.42 * dmp), DAMP, 0.42 * dmp)
                    for (q, wid, ln, st) in self.streaks:
                        dz = q.z - p.z
                        if 0.0 < dz < ln:
                            dxy = math.hypot(p.x - q.x, p.y - q.y)
                            wob = wid * (0.7 + 0.6 * fbm(p.x * 3.0, p.y * 3.0, p.z * 0.6))
                            if dxy < wob:
                                c = mix(c, (0.06, 0.06, 0.065), st * smooth(wob, wob * 0.25, dxy) * (1 - dz / ln) ** 0.7)
                    patch = fbm(p.x * 0.7 + 11.0, p.y * 0.7 - 5.0, p.z * 0.7)
                    low = smooth(4.5, 0.0, h)
                    m = (0.8 * up + 0.55 * north + 0.12 + 0.3 * low) * max(0.0, patch * 2.0 - 0.8 + 0.3 * low) * moss_k
                    m = min(0.8, m * (0.5 + 1.0 * low))
                    if m > 0:
                        c = mix(c, mix(MOSS_DEEP, MOSS_BRIGHT, fbm(p.x * 1.9, p.y * 1.9, p.z * 1.9)), m)
                    li = max(0.0, fbm(p.x * 2.1 + 31.0, p.y * 2.1, p.z * 2.1 + 9.0) * 2.4 - 1.55 + 0.75 * up) * (1 - m)
                    if li > 0:
                        c = mix(c, LICHEN_OCHRE if fbm(p.x * 0.4, p.y * 0.4 + 50, p.z * 0.4) > 0.55 else LICHEN_PALE,
                                min(0.6, li))
                    for (q, rad, s) in self.soot:
                        d = math.hypot(p.x - q.x, p.y - q.y, max(0.0, (p.z - q.z)) * 0.45 + max(0.0, q.z - p.z) * 2.0)
                        if d < rad:
                            c = mix(c, (0.07, 0.065, 0.07), s * smooth(rad, rad * 0.15, d))
                elif kind == K_WOOD:
                    c = scale(c, 0.82 + 0.3 * fbm(p.x * 1.3, p.y * 1.3, p.z * 0.5))
                    c = mix(c, DAMP, 0.25 * smooth(0.9, 0.0, h) + 0.35 * up * max(0.0, fbm(p.x, p.y, p.z) * 2 - 0.9))
                elif kind == K_METAL:
                    v = fbm(p.x * 2.6, p.y * 2.6, p.z * 2.6)
                    c = mix(c, (0.30, 0.50, 0.42), max(0.0, v * 2.2 - 0.8) * 0.75)
                    c = scale(c, 0.8 + 0.3 * fbm(p.x * 0.9 + 4, p.y * 0.9, p.z * 0.9))
                elif kind == K_LEAF:
                    c = scale(c, (0.85 + 0.3 * fbm(p.x * 0.8, p.y * 0.8, p.z * 0.8)))
                elif kind == K_CLOTH:
                    c = scale(c, 0.85 + 0.25 * fbm(p.x * 1.6, p.y * 1.6, p.z * 1.6))
                    c = mix(c, DAMP, 0.3 * smooth(0.8, 0.0, h))
                elif kind == K_EARTH:
                    c = scale(c, 0.85 + 0.3 * fbm(p.x * 1.1, p.y * 1.1, 0.0))
                if ao_face is not None:
                    o = p + (ctr - p) * 0.08 + n * 0.03
                    occ = 0.0
                    for d in ao_face:
                        hit = bvh.ray_cast(o, d, ao_dist)
                        if hit[0] is not None:
                            occ += 1.0 - hit[3] / ao_dist
                    ao = 1.0 - occ / len(ao_face)
                    c = scale(c, 1.0 - (0.42 if kind == K_LEAF else 0.78) * (1.0 - ao) ** 0.85)
                lr, lg, lb = srgb_to_linear((max(0.0, min(1.0, c[0])), max(0.0, min(1.0, c[1])),
                                             max(0.0, min(1.0, c[2]))))
                loop[self.col] = (lr, lg, lb, 1.0)
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        for mat in materials:
            mesh.materials.append(mat)
        mesh.color_attributes.active_color = mesh.color_attributes['Col']
        mesh.color_attributes.render_color_index = 0
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        return obj


def _hemisphere(n):
    """n cosine-weighted directions about +Z (a fixed spiral, no random stream)."""
    out = []
    for i in range(n):
        u = (i + 0.5) / n
        a = i * 2.39996323
        r = math.sqrt(u)
        out.append((math.cos(a) * r, math.sin(a) * r, math.sqrt(max(0.0, 1 - u))))
    return out


def occluder(pieces, gr, half=38.0, step=1.0):
    """One BVH over every piece's solid faces plus the sampled terrain."""
    verts, polys = [], []
    for p in pieces:
        v, f = p.geometry(len(verts))
        verts.extend(v)
        polys.extend(f)
    n = int(2 * half / step) + 1
    base = len(verts)
    for j in range(n):
        for i in range(n):
            lx, lz = -half + i * step, -half + j * step
            verts.append(B(lx, lz, gr.h(lx, lz)))
    for j in range(n - 1):
        for i in range(n - 1):
            a = base + j * n + i
            polys.append([a, a + 1, a + n + 1, a + n])
    return BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)


def make_materials():
    stone = ec.vertex_color_material('KitStone', rough=0.9)
    stone.use_backface_culling = True
    leaf = ec.vertex_color_material('KitLeaf', rough=0.8)
    leaf.use_backface_culling = False
    void = ec.emissive_material('KitVoid', (0.0, 0.0, 0.0), strength=0.0)
    return [stone, leaf, void]
