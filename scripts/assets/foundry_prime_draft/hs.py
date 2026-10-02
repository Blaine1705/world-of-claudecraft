"""Hard-surface kit on top of sdf.py: composite distance shapes (intersections,
shells, capped cylinders, half spaces), rivet rows projected onto a surface, and
`HSPart`, one rigid part: its high mesh (bevels, rivets, engraved panel lines and
weld seams, all in the distance field, meshed through OpenVDB) and its decimated
low mesh. The highs are baked onto the lows (surface.py).

Every part rides ONE bone. Deterministic: nothing reads the clock.
"""
import math

import numpy as np

import mesh_kit as K
import sdf
from sdf import smax, smin

INF = 1e3
TRI_SCALE = 0.6   # global triangle budget dial (the part targets were written generously)


def _v(a):
    return np.asarray(a, dtype=np.float64)


class Fn(sdf.Prim):
    """A distance function with bounds."""

    def __init__(self, f, lo, hi, bone=None):
        self.f, self.lo, self.hi, self.bone = f, _v(lo), _v(hi), bone

    def dist(self, X, Y, Z):
        return self.f(X, Y, Z)


def inter(a, b, k=0.02):
    lo = np.maximum(a.lo, b.lo)
    hi = np.minimum(a.hi, b.hi)
    return Fn(lambda X, Y, Z: smax(a.dist(X, Y, Z), b.dist(X, Y, Z), k), lo, hi)


def cut(a, b, k=0.02):
    return Fn(lambda X, Y, Z: smax(a.dist(X, Y, Z), -b.dist(X, Y, Z), k), a.lo, a.hi)


def union(prims, k=0.0):
    lo = np.min([p.lo for p in prims], axis=0)
    hi = np.max([p.hi for p in prims], axis=0)

    def f(X, Y, Z):
        out = None
        for p in prims:
            d = p.dist(X, Y, Z)
            out = d if out is None else smin(out, d, k)
        return out
    return Fn(f, lo, hi)


def shell(a, t, outward=0.0):
    """A shell of thickness t on the surface of `a` (offset outward by `outward`)."""
    return Fn(lambda X, Y, Z: np.abs(a.dist(X, Y, Z) - outward) - t * 0.5, a.lo - t - outward, a.hi + t + outward)


def offset(a, r):
    return Fn(lambda X, Y, Z: a.dist(X, Y, Z) - r, a.lo - r, a.hi + r)


def half(n, p0):
    """Half space n.(p - p0) <= 0 is inside."""
    n = _v(n) / np.linalg.norm(n)
    p0 = _v(p0)
    return Fn(lambda X, Y, Z: (X - p0[0]) * n[0] + (Y - p0[1]) * n[1] + (Z - p0[2]) * n[2],
              (-INF, -INF, -INF), (INF, INF, INF))


class Cyl(sdf.Prim):
    """A capped cylinder from a to b, radius r, edges rounded by `rr`."""

    def __init__(self, a, b, r, rr=0.03, bone=None):
        a, b = _v(a), _v(b)
        d = b - a
        L = np.linalg.norm(d)
        u = d / L
        rr = min(rr, r * 0.5, L * 0.25)
        self.a, self.b = a + u * rr, b - u * rr
        self.r, self.rr, self.bone = r - rr, rr, bone
        e = r + 0.01
        self.lo = np.minimum(a, b) - e
        self.hi = np.maximum(a, b) + e

    def dist(self, X, Y, Z):
        a, b, r = self.a, self.b, self.r
        ba = b - a
        baba = float(ba @ ba)
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        paba = px * ba[0] + py * ba[1] + pz * ba[2]
        qx = px * baba - ba[0] * paba
        qy = py * baba - ba[1] * paba
        qz = pz * baba - ba[2] * paba
        x = np.sqrt(qx * qx + qy * qy + qz * qz) - r * baba
        y = np.abs(paba - baba * 0.5) - baba * 0.5
        x2 = x * x
        y2 = y * y * baba
        d = np.where(np.maximum(x, y) < 0.0, -np.minimum(x2, y2),
                     np.where(x > 0, x2, 0.0) + np.where(y > 0, y2, 0.0))
        return np.sign(d) * np.sqrt(np.abs(d)) / baba - self.rr


def box(c, half_, rot=None, r=0.04):
    return sdf.RoundBox(c, np.maximum(_v(half_) - r, 1e-3), rot, r)


def frame_axes(u, up=(0, 0, 1)):
    """Rotation whose columns are (x, y, z) with z along u."""
    return sdf.frame_from(u, up)


def project(prim, pts, iters=6, h=0.004):
    """Slide points onto the zero level of `prim` along its gradient."""
    P = _v(pts).copy().reshape(-1, 3)
    for _ in range(iters):
        d = prim.dist_pts(P)
        g = np.zeros_like(P)
        for k in range(3):
            e = np.zeros(3)
            e[k] = h
            g[:, k] = (prim.dist_pts(P + e) - prim.dist_pts(P - e)) / (2 * h)
        n = np.linalg.norm(g, axis=1, keepdims=True)
        g = g / np.maximum(n, 1e-9)
        P = P - g * d[:, None]
    return P, g


def polyline_pts(pts, step):
    """Even samples along a polyline."""
    pts = [_v(p) for p in pts]
    out = []
    for a, b in zip(pts, pts[1:]):
        L = np.linalg.norm(b - a)
        n = max(1, int(round(L / step)))
        for i in range(n):
            out.append(a + (b - a) * i / n)
    out.append(pts[-1])
    return np.array(out)


def arc_pts(c, axis, radius, a0, a1, n, ref=None):
    """Points on a circle about `axis` through c, angles a0..a1 (radians) from `ref`."""
    F = frame_axes(axis, ref if ref is not None else (0, 0, 1))
    c = _v(c)
    out = []
    for i in range(n):
        t = a0 + (a1 - a0) * (i / max(1, n - 1))
        out.append(c + F[:, 0] * math.cos(t) * radius + F[:, 1] * math.sin(t) * radius)
    return np.array(out)


class HSPart:
    """One rigid hard-surface part: a distance field of added and subtracted
    shapes plus surface detail (rivets, grooves, weld beads), meshed high and
    decimated low."""

    def __init__(self, name, mat, bone, voxel=0.022, tris=600, group='body', boost=1.0):
        self.name, self.mat, self.bone, self.voxel, self.tris = name, mat, bone, voxel, tris
        self.group, self.boost = group, boost
        self.ops = []
        self.base = []   # prims whose surface the rivets sit on
        self.fine = set()   # indices of ops that are surface detail (baked, not in the low)
        self._detail = False

    def detail(self, on=True):
        """Ops added while on are surface detail: they shape the HIGH mesh only, and
        reach the low through the normal map (a decimated rim or rivet wobbles)."""
        self._detail = on
        return self

    def _push(self, op):
        if self._detail:
            self.fine.add(len(self.ops))
        self.ops.append(op)

    def add(self, prim, k=0.0):
        self._push(('add', prim, k))
        if not self._detail:
            self.base.append(prim)
        return prim

    def sub(self, prim, k=0.0):
        self._push(('sub', prim, k))
        return prim

    def groove(self, pts, depth=0.025, width=0.018):
        """An engraved panel line along a polyline (on the surface)."""
        self.fine.add(len(self.ops))
        self.ops.append(('groove', sdf.Polyline(pts, 0.004), (depth, width)))

    def ridge(self, pts, height=0.02, width=0.02):
        self.fine.add(len(self.ops))
        self.ops.append(('ridge', sdf.Polyline(pts, 0.004), (height, width)))

    def rivets(self, pts, r=0.05, on=None, flat=0.55, sink=0.25):
        """Domed rivet heads at points (projected onto `on`, else onto this part)."""
        on = on or (union(self.base) if len(self.base) > 1 else self.base[0])
        P, N = project(on, pts)
        for p, n in zip(P, N):
            R = frame_axes(n)
            if r < 0.09:
                self.fine.add(len(self.ops))
            self.ops.append(('add', sdf.Ellipsoid(p + n * r * (flat * 0.5 - sink), (r, r, r * flat), R), r * 0.25))

    def bolts(self, pts, r=0.07, on=None, h=0.05):
        """Hex-ish bolt heads (six-sided round boxes) with a washer."""
        on = on or (union(self.base) if len(self.base) > 1 else self.base[0])
        P, N = project(on, pts)
        for p, n in zip(P, N):
            R = frame_axes(n)
            self.fine.add(len(self.ops))
            self.ops.append(('add', Cyl(p - n * 0.01, p + n * h * 0.45, r * 1.35, 0.008), 0.004))
            hexa = None
            for k in range(3):
                a = k * math.pi / 3
                Rk = R @ sdf.rot_matrix(0, 0, a)
                bx = sdf.RoundBox(p + n * (h * 0.45 + h * 0.5), (r, r * 0.58, h * 0.5), Rk, 0.006)
                hexa = bx if hexa is None else inter(hexa, bx, 0.0)
            self.fine.add(len(self.ops))
            self.ops.append(('add', hexa, 0.0))

    def bounds(self):
        lo = np.min([p.lo for op, p, _ in self.ops if op == 'add'], axis=0) - 0.12
        hi = np.max([p.hi for op, p, _ in self.ops if op == 'add'], axis=0) + 0.12
        return np.maximum(lo, -60), np.minimum(hi, 60)

    def field(self, voxel=None, low=False):
        lo, hi = self.bounds()
        F = sdf.Field(lo, hi, voxel or self.voxel)
        for i, (op, p, k) in enumerate(self.ops):
            if low and i in self.fine:
                continue
            if op == 'add':
                F.add(p, k, weight=False)
            elif op == 'sub':
                F.sub(p, k)
            elif op == 'groove':
                F.groove(p, k[0], k[1])
            elif op == 'ridge':
                F.ridge(p, k[0], k[1])
        return F

    def build(self, bpy, workdir, voxel=None, fast=False):
        vx = voxel or (self.voxel * (1.6 if fast else 1.0))
        F = self.field(vx)
        hi = sdf.to_mesh(F, self.name + '_hi', bpy, workdir=workdir)
        if self.fine:
            lo = sdf.to_mesh(self.field(vx * 1.35, low=True), self.name, bpy, workdir=workdir)
        else:
            lo = K.duplicate(hi, self.name)
        K.decimate(lo, target=self.tris * TRI_SCALE * (0.7 if fast else 1.0))
        for o in (hi, lo):
            o['mat'] = self.mat
            o['bone'] = self.bone
            o['binding'] = 'rigid'
            o['group'] = self.group
            o['boost'] = self.boost
            for poly in o.data.polygons:
                poly.use_smooth = True
        return hi, lo


class Plate:
    """An armour plate: a shell of thickness t over the surface of `base` (lifted
    `outward`), cut to the convex region inside every half space in `cuts`, edges
    bevelled by k. Gives its solid, a raised rim along its edges, an engraved panel
    line inset from its edges, straight engraved lines, and rivet points along its
    edges (sampled on the plate's top surface)."""

    def __init__(self, base, t, cuts, outward=0.0, k=0.025, extra=None):
        self.base, self.t, self.cuts, self.out, self.k = base, t, list(cuts), outward, k
        self.extra = extra   # optional extra region prim (inside where < 0)
        self.top = outward + t * 0.5

    def region(self, X, Y, Z):
        d = None
        for c in self.cuts:
            e = c.dist(X, Y, Z)
            d = e if d is None else np.maximum(d, e)
        if self.extra is not None:
            e = self.extra.dist(X, Y, Z)
            d = e if d is None else np.maximum(d, e)
        return d

    def solid(self):
        sh = shell(self.base, self.t, self.out)
        reg = Fn(self.region, sh.lo, sh.hi)
        return inter(sh, reg, self.k)

    def rim(self, h=0.035, w=0.08):
        sh = shell(self.base, self.t + h, self.out + h * 0.5)

        def band(X, Y, Z):
            r = self.region(X, Y, Z)
            return np.maximum(r, -(r + w))
        return inter(sh, Fn(band, sh.lo, sh.hi), self.k * 0.6)

    def inset_groove(self, inset=0.12, w=0.022, depth=0.022):
        top = self.top

        def f(X, Y, Z):
            r = self.region(X, Y, Z)
            b = self.base.dist(X, Y, Z)
            band = np.maximum(b - (top + 0.08), (top - depth) - b)
            return np.maximum(np.abs(r + inset) - w * 0.5, band)
        return Fn(f, self.base.lo - 0.2, self.base.hi + 0.2)

    def line_groove(self, n, p0, w=0.022, depth=0.022, inset=0.06):
        top = self.top
        hs = half(n, p0)

        def f(X, Y, Z):
            r = self.region(X, Y, Z)
            b = self.base.dist(X, Y, Z)
            band = np.maximum(b - (top + 0.08), (top - depth) - b)
            return np.maximum(np.maximum(np.abs(hs.dist(X, Y, Z)) - w * 0.5, band), r + inset)
        return Fn(f, self.base.lo - 0.2, self.base.hi + 0.2)

    def surface(self):
        top = self.top
        return Fn(lambda X, Y, Z: self.base.dist(X, Y, Z) - top, self.base.lo, self.base.hi)

    def edge_points(self, inset=0.1, spacing=0.22, seed=3, n=24000, tol=0.02, only=None, lo=None, hi=None):
        """Rivet points along the plate's edges, `inset` in from them. `only` limits
        to the cuts with these indices."""
        rng = np.random.default_rng(seed)
        lo = _v(lo) if lo is not None else np.maximum(self.base.lo, -50)
        hi = _v(hi) if hi is not None else np.minimum(self.base.hi, 50)
        P = lo + rng.random((n, 3)) * (hi - lo)
        surf = self.surface()
        P, _ = project(surf, P, iters=5)
        ok = np.abs(surf.dist_pts(P)) < 0.01
        P = P[ok]
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        cut_d = [c.dist(X, Y, Z) for c in self.cuts]
        if self.extra is not None:
            cut_d.append(self.extra.dist(X, Y, Z))
        r = np.max(cut_d, axis=0)
        idx = range(len(cut_d)) if only is None else only
        near = np.zeros(len(P), bool)
        for i in idx:
            near |= np.abs(cut_d[i] + inset) < tol
        sel = P[near & (r < -inset + tol)]
        out = []
        for p in sel[rng.permutation(len(sel))]:
            if all(np.linalg.norm(p - q) >= spacing for q in out):
                out.append(p)
        return np.array(out) if out else np.zeros((0, 3))
