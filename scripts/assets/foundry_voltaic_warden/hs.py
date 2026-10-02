"""Hard-surface signed-distance kit for the Voltaic Warden.

Every armour piece is its own small distance field (sdf.Field) built from bevelled
primitives: convex hulls of planes with a smooth-max bevel (faceted armour with
rolled edges), capped cylinders with rounded rims, gears, tori and the sdf.py
primitives. Detail is cut INTO the field before meshing, so it lands in the HIGH
mesh and the bake carries it to the low: panel lines (plane sections grooved into
the surface), inset panels, raised trims and domed rivets projected onto the
surface. The high is meshed through OpenVDB; the low is a decimated copy.
"""
import math

import numpy as np

import sdf
from sdf import _v, frame_from, smax, smin

K_SCALE = 0.6       # every bevel radius is scaled by this (crisper hard-surface edges)


# ------------------------------------------------------------------ primitives
class Hull(sdf.Prim):
    """Intersection of half-spaces (point, outward normal) with a smooth-max bevel
    of radius k: faceted armour with rolled edges."""

    def __init__(self, planes, k=0.06, bone=None, lo=None, hi=None):
        self.planes = [(_v(p), _v(n) / np.linalg.norm(n)) for p, n in planes]
        self.k = k * K_SCALE
        self.bone = bone
        self.lo, self.hi = _v(lo), _v(hi)

    def dist(self, X, Y, Z):
        out = None
        for p, n in self.planes:
            d = (X - p[0]) * n[0] + (Y - p[1]) * n[1] + (Z - p[2]) * n[2]
            out = d if out is None else smax(out, d, self.k)
        return out


def box_hull(c, half, rot=None, chamfer=0.0, k=0.05, bone=None):
    """A box as a Hull, optionally with its 12 edges chamfered by `chamfer`."""
    c = _v(c)
    R = np.eye(3) if rot is None else _v(rot)
    planes = []
    for i in range(3):
        for s in (1, -1):
            n = R[:, i] * s
            planes.append((c + n * half[i], n))
    if chamfer > 0:
        for i in range(3):
            for j in range(i + 1, 3):
                for si in (1, -1):
                    for sj in (1, -1):
                        n = R[:, i] * si + R[:, j] * sj
                        n /= np.linalg.norm(n)
                        off = (half[i] * si * R[:, i] + half[j] * sj * R[:, j]) @ n - chamfer
                        planes.append((c + n * off, n))
    ext = np.abs(R) @ _v(half) + k + 0.05
    return Hull(planes, k=k, bone=bone, lo=c - ext, hi=c + ext)


class Cyl(sdf.Prim):
    """A capped cylinder from a to b, radius r, rim rounded by `rr`."""

    def __init__(self, a, b, r, rr=0.02, bone=None):
        self.a, self.b, self.r, self.rr, self.bone = _v(a), _v(b), float(r), float(rr), bone
        self.ax = (self.b - self.a) / np.linalg.norm(self.b - self.a)
        self.h = np.linalg.norm(self.b - self.a) * 0.5
        self.c = (self.a + self.b) * 0.5
        e = r + 0.05
        self.lo = np.minimum(self.a, self.b) - e
        self.hi = np.maximum(self.a, self.b) + e

    def dist(self, X, Y, Z):
        px, py, pz = X - self.c[0], Y - self.c[1], Z - self.c[2]
        ax = self.ax
        t = px * ax[0] + py * ax[1] + pz * ax[2]
        qx, qy, qz = px - t * ax[0], py - t * ax[1], pz - t * ax[2]
        rho = np.sqrt(qx * qx + qy * qy)
        rho = np.sqrt(rho * rho + qz * qz)
        dr = rho - (self.r - self.rr)
        dh = np.abs(t) - (self.h - self.rr)
        out = np.sqrt(np.maximum(dr, 0) ** 2 + np.maximum(dh, 0) ** 2) + np.minimum(np.maximum(dr, dh), 0)
        return out - self.rr


class Gear(sdf.Prim):
    """A spur gear: teeth on the rim, a hub, round lightening holes."""

    def __init__(self, c, axis, r_tip, thick, teeth=14, depth=0.09, holes=5, hub=0.3, bone=None):
        self.c, self.F = _v(c), frame_from(axis)
        self.r, self.t, self.n, self.depth = float(r_tip), float(thick), int(teeth), float(depth)
        self.holes, self.hub = holes, hub
        self.bone = bone
        e = r_tip + 0.05
        self.lo, self.hi = self.c - e, self.c + e

    def dist(self, X, Y, Z):
        F = self.F
        px, py, pz = X - self.c[0], Y - self.c[1], Z - self.c[2]
        lx = F[0, 0] * px + F[1, 0] * py + F[2, 0] * pz
        ly = F[0, 1] * px + F[1, 1] * py + F[2, 1] * pz
        lz = F[0, 2] * px + F[1, 2] * py + F[2, 2] * pz
        rho = np.sqrt(lx * lx + ly * ly)
        th = np.arctan2(ly, lx)
        wave = np.clip(np.cos(th * self.n) * 1.8 + 0.2, -1, 1)          # flat-topped teeth
        rr = self.r - self.depth * 0.5 + wave * self.depth * 0.5
        d2 = (rho - rr) * 0.8
        dz = np.abs(lz) - self.t * 0.5
        d = smax(d2, dz, 0.012)
        # dished web between hub and rim
        web = smax(smax(rho - (self.r - self.depth - 0.07), self.hub - rho, 0.02), np.abs(lz) - self.t * 0.22, 0.02)
        d = smax(d, -web, 0.02)
        for i in range(self.holes):
            a = math.tau * i / self.holes + 0.3
            mid = (self.hub + self.r - self.depth) * 0.5
            hx, hy = math.cos(a) * mid, math.sin(a) * mid
            hr = (self.r - self.depth - self.hub) * 0.32
            dh = np.sqrt((lx - hx) ** 2 + (ly - hy) ** 2) - hr
            d = smax(d, -dh, 0.015)
        # boss and axle cap
        boss = smax(rho - self.hub * 0.75, np.abs(lz) - self.t * 0.75, 0.02)
        return smin(d, boss, 0.02)


class Slab(sdf.Prim):
    """Distance to a plane through c with normal n, limited to a box (for panel
    lines: grooving along it cuts a plane section of the surface)."""

    def __init__(self, c, n, lo, hi):
        self.c, self.nv = _v(c), _v(n) / np.linalg.norm(n)
        self.lo, self.hi = _v(lo), _v(hi)
        self.bone = None

    def dist(self, X, Y, Z):
        d = np.abs((X - self.c[0]) * self.nv[0] + (Y - self.c[1]) * self.nv[1] + (Z - self.c[2]) * self.nv[2])
        # fade out at the box edges so a line ends cleanly
        return d


class Bulge(sdf.Prim):
    """An ellipsoid used to round a hull (smooth intersection gives curved armour)."""


# ------------------------------------------------------------------ part field
class PartField(sdf.Field):
    """A Field for one piece, with surface projection and hard-surface detail."""

    def project(self, p, iters=6):
        p = np.atleast_2d(_v(p)).copy()
        for _ in range(iters):
            d = self.sample(p)
            g = self.gradient(p)
            p = p - g * d[:, None]
        return p, self.gradient(p)

    def _defer(self, prim, k):
        if not hasattr(self, 'deferred'):
            self.deferred = []
        self.deferred.append((prim, k))

    def apply_detail(self):
        """Add the deferred rivets and bolts. The LOW is meshed before this, so the small
        heads live only in the HIGH and reach the game through the normal map."""
        got = getattr(self, 'deferred', [])
        for prim, k in got:
            self.add(prim, k=k, weight=False)
        self.deferred = []
        return len(got)

    def rivets(self, pts, r=0.04, sink=0.35, k=0.008):
        P, N = self.project(pts)
        D = np.abs(self.sample(P))
        for p, n, d in zip(P, N, D):
            if d > 0.03:          # the projection never reached a surface: no floating rivet
                continue
            self._defer(sdf.Sphere(p - n * r * sink, r), k)
        return P, N

    def bolts(self, pts, r=0.05, h=0.03, k=0.006):
        """Hex-ish bolt heads (short cylinders) standing on the surface."""
        P, N = self.project(pts)
        D = np.abs(self.sample(P))
        for p, n, d in zip(P, N, D):
            if d > 0.03:
                continue
            self._defer(Cyl(p - n * 0.02, p + n * h, r, rr=0.012), k)
        return P, N

    def line(self, c, n, lo, hi, depth=0.018, width=0.012):
        self.groove(Slab(c, n, lo, hi), depth, k=width)

    def trim(self, c, n, lo, hi, height=0.02, width=0.03):
        self.ridge(Slab(c, n, lo, hi), height, k=width)


def part_field(lo, hi, voxel):
    return PartField(_v(lo), _v(hi), voxel)


def ring_points(c, axis, R, n, phase=0.0):
    F = frame_from(axis)
    out = []
    for i in range(n):
        a = math.tau * i / n + phase
        out.append(_v(c) + F[:, 0] * math.cos(a) * R + F[:, 1] * math.sin(a) * R)
    return np.array(out)


def line_points(a, b, n):
    a, b = _v(a), _v(b)
    return np.array([a + (b - a) * (i / max(1, n - 1)) for i in range(n)])


def outline_points(c, u, v, hw, hh, n, chamfer=0.25):
    """Points round a chamfered rectangle (u across, v up) at centre c."""
    c, u, v = _v(c), _v(u), _v(v)
    ch = chamfer * min(hw, hh)
    corners = [(hw - ch, hh), (-hw + ch, hh), (-hw, hh - ch), (-hw, -hh + ch), (-hw + ch, -hh), (hw - ch, -hh),
               (hw, -hh + ch), (hw, hh - ch)]
    segs = list(zip(corners, corners[1:] + corners[:1]))
    lens = [math.dist(a, b) for a, b in segs]
    tot = sum(lens)
    out = []
    for i in range(n):
        s = tot * i / n
        for (a, b), L in zip(segs, lens):
            if s <= L:
                t = s / L
                x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                out.append(c + u * x + v * y)
                break
            s -= L
    return np.array(out)


class TaperPrism(sdf.Prim):
    """A faceted tapering limb shell from a to b: `sides` flat facets whose inscribed
    radius runs r0 -> r1, capped, edges rolled by k. `phase` turns the facets."""

    def __init__(self, a, b, r0, r1, sides=8, k=0.05, phase=0.0, up=(0, 0, 1), cap_k=0.06, bone=None):
        self.a, self.b = _v(a), _v(b)
        self.L = np.linalg.norm(self.b - self.a)
        self.ax = (self.b - self.a) / self.L
        self.F = frame_from(self.ax, up)
        self.r0, self.r1, self.sides, self.k, self.phase = r0, r1, sides, k * K_SCALE, phase
        self.cap_k = cap_k * K_SCALE
        self.bone = bone
        e = max(r0, r1) * 1.2 + 0.05
        self.lo = np.minimum(self.a, self.b) - e
        self.hi = np.maximum(self.a, self.b) + e

    def dist(self, X, Y, Z):
        F = self.F
        px, py, pz = X - self.a[0], Y - self.a[1], Z - self.a[2]
        lx = F[0, 0] * px + F[1, 0] * py + F[2, 0] * pz
        ly = F[0, 1] * px + F[1, 1] * py + F[2, 1] * pz
        t = F[0, 2] * px + F[1, 2] * py + F[2, 2] * pz
        u = np.clip(t / self.L, 0, 1)
        r = self.r0 + (self.r1 - self.r0) * u
        d = None
        for i in range(self.sides):
            th = math.tau * i / self.sides + self.phase
            di = lx * math.cos(th) + ly * math.sin(th) - r
            d = di if d is None else smax(d, di, self.k)
        cap = np.maximum(-t, t - self.L)
        return smax(d, cap, self.cap_k)


class Band(sdf.Prim):
    """An elliptical band (a belt, a collar): |z - zc| <= h, inside the ellipse rx, ry."""

    def __init__(self, c, rx, ry, h, rr=0.03, bone=None):
        self.c, self.rx, self.ry, self.h, self.rr, self.bone = _v(c), rx, ry, h, rr, bone
        self.lo = self.c - (rx + 0.1, ry + 0.1, h + 0.1)
        self.hi = self.c + (rx + 0.1, ry + 0.1, h + 0.1)

    def dist(self, X, Y, Z):
        ex = (X - self.c[0]) / self.rx
        ey = (Y - self.c[1]) / self.ry
        de = (np.sqrt(ex * ex + ey * ey) - 1.0) * min(self.rx, self.ry)
        dz = np.abs(Z - self.c[2]) - self.h
        return smax(de, dz, self.rr)


class Inter(sdf.Prim):
    """Smooth intersection of prims (the first prim's bounds)."""

    def __init__(self, prims, k=0.04, bone=None):
        self.prims, self.k, self.bone = prims, k * K_SCALE, bone
        self.lo, self.hi = prims[0].lo, prims[0].hi

    def dist(self, X, Y, Z):
        d = self.prims[0].dist(X, Y, Z)
        for p in self.prims[1:]:
            d = smax(d, p.dist(X, Y, Z), self.k)
        return d


class Plane(sdf.Prim):
    def __init__(self, p, n):
        self.p, self.nv = _v(p), _v(n) / np.linalg.norm(n)
        self.lo, self.hi = self.p - 50, self.p + 50
        self.bone = None

    def dist(self, X, Y, Z):
        return (X - self.p[0]) * self.nv[0] + (Y - self.p[1]) * self.nv[1] + (Z - self.p[2]) * self.nv[2]
