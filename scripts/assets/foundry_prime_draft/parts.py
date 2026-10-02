"""The Prime Draft's hard-surface parts, each one rigid on one bone.

Brass is the finished armour (its right arm, the chest cuirass, the pauldron, the
greaves, the face plate); iron is the frame under it (and the whole of its left
arm, never plated); steel the piston rods and claw tips; copper the socket's
contacts; ceramic the insulators; cable the rubber-and-braid cables; hazard the
yellow-and-black clamp paint; socket the scorched inside of the empty chest.

Every plate is a bevelled shell with a raised rim, an engraved inset panel line and
a rivet row; the detail lives in the high mesh and is baked onto the low.
Glow parts (the eye lens, the lightning conduits, the core's arcs) are plain
emissive meshes on their own material (glow.py), not baked.
"""
import math

import numpy as np

import hs
import mech as M
import sdf
from hs import Cyl, HSPart, Plate, box, half, inter, shell, union

V = np.array


def keep(n, p0):
    """Keep n.(p - p0) >= 0."""
    return half(-np.asarray(n, float), p0)


def slab_along(a, u, t0, t1, L):
    """Two half spaces keeping the slice of a limb between fractions t0 and t1."""
    a = np.asarray(a, float)
    return [keep(u, a + u * L * t0), keep(-u, a + u * L * t1)]


def limb(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    L = float(np.linalg.norm(d))
    return a, b, d / L, L


def ortho(v, u):
    v = np.asarray(v, float) - u * float(np.dot(v, u))
    return v / np.linalg.norm(v)


def plate_part(p, plate, rim=True, groove=True, rivets=True, inset=0.13, spacing=0.24, rivet_r=0.045, rim_h=0.035,
               rim_w=0.075, seed=1, only=None, k_rim=0.0):
    p.add(plate.solid())
    p.detail(True)
    if rim:
        p.add(plate.rim(rim_h, rim_w), k_rim)
    if groove:
        p.sub(plate.inset_groove(inset=inset + 0.1, w=0.024, depth=0.024), 0.006)
    p.detail(False)
    if rivets:
        pts = plate.edge_points(inset=inset, spacing=spacing, seed=seed, only=only)
        if len(pts):
            p.rivets(pts, r=rivet_r, on=plate.surface())
    return p


# ------------------------------------------------------------------ torso
def pelvis_parts():
    out = []
    p = HSPart('PelvisCore', 'iron', 'Pelvis', tris=1300)
    p.add(box((0, 0.25, 4.78), (1.0, 0.82, 0.5), r=0.16))
    p.add(box((0, 0.2, 4.28), (0.56, 0.62, 0.32), r=0.12), 0.1)
    p.groove([(-0.7, -0.575, 4.62), (0.7, -0.575, 4.62)], 0.02, 0.02)
    p.bolts([(-0.82, -0.6, 4.45), (0.82, -0.6, 4.45), (-0.82, -0.6, 5.1), (0.82, -0.6, 5.1)], r=0.06)
    out.append(p)
    for side, s in (('L', 1), ('R', -1)):
        h = M.side_pt(M.HIP, s)
        q = HSPart(f'HipBall{side}', 'iron', 'Pelvis', tris=500)
        q.add(sdf.Sphere(h, 0.62))
        q.add(Cyl(h - (s * 0.2, 0, 0), h - (s * 0.62, 0, 0), 0.5, 0.04), 0.05)
        q.add(sdf.Torus(h - (s * 0.45, 0, 0), (1, 0, 0), 0.5, 0.06), 0.02)
        q.bolts(hs.arc_pts(h - (s * 0.45, 0, 0), (1, 0, 0), 0.5, 0, 2 * math.pi * 7 / 8, 8) + (s * 0.08, 0, 0), r=0.045,
                on=sdf.Torus(h - (s * 0.45, 0, 0), (1, 0, 0), 0.5, 0.06))
        out.append(q)
    f = HSPart('Fauld', 'brass', 'Pelvis', tris=700)
    base = sdf.Ellipsoid((0, 0.3, 4.85), (1.22, 1.02, 0.9))
    pl = Plate(base, 0.11, [keep((0, -1, 0), (0, -0.15, 0)), keep((0, 0, 1), (0, 0, 4.15)), keep((0, 0, -1), (0, 0, 5.22)),
                            keep((-1, 0, -0.28), (0.78, 0, 5.2)), keep((1, 0, -0.28), (-0.78, 0, 5.2))])
    plate_part(f, pl, spacing=0.22, seed=2)
    f.add(inter(shell(base, 0.2, 0.06), hs.Fn(lambda X, Y, Z: np.abs(X) - 0.07, base.lo, base.hi), 0.02))
    out.append(f)
    b = HSPart('Belt', 'brass', 'Pelvis', tris=900)
    base = sdf.Ellipsoid((0, 0.25, 5.1), (1.16, 0.97, 1.7))
    pl = Plate(base, 0.11, [keep((0, 0, 1), (0, 0, 4.98)), keep((0, 0, -1), (0, 0, 5.32))])
    b.add(pl.solid())
    b.add(pl.rim(0.03, 0.06))
    pts = hs.arc_pts((0, 0.25, 5.15), (0, 0, 1), 1.2, 0, 2 * math.pi * 23 / 24, 24)
    pts[:, 1] = 0.25 + (pts[:, 1] - 0.25) * 0.97 / 1.16
    b.rivets(pts, r=0.045, on=pl.surface())
    out.append(b)
    bk = HSPart('PelvisBack', 'brass', 'Pelvis', tris=500)
    base = sdf.Ellipsoid((0, 0.15, 4.85), (1.2, 1.05, 0.9))
    pl = Plate(base, 0.11, [keep((0, 1, 0), (0, 0.75, 0)), keep((0, 0, 1), (0, 0, 4.25)), keep((0, 0, -1), (0, 0, 5.0)),
                            keep((-1, 0, 0), (0.75, 0, 0)), keep((1, 0, 0), (-0.75, 0, 0))])
    plate_part(bk, pl, seed=3)
    out.append(bk)
    return out


def spine_parts():
    out = []
    c = HSPart('SpineColumn', 'iron', 'Spine', tris=1100)
    c.add(Cyl((0, 0.18, 5.05), (0, 0.12, 6.55), 0.36, 0.05))
    for z in (5.38, 5.62, 5.86, 6.1, 6.34):
        c.add(Cyl((0, 0.16, z - 0.065), (0, 0.16, z + 0.065), 0.52, 0.03), 0.015)
        c.bolts(hs.arc_pts((0, 0.16, z + 0.065), (0, 0, 1), 0.43, 0.3, 0.3 + 2 * math.pi * 5 / 6, 6), r=0.035,
                on=Cyl((0, 0.16, z - 0.065), (0, 0.16, z + 0.065), 0.52, 0.03), h=0.03)
    out.append(c)
    g = HSPart('Gimbal', 'brass', 'Spine', tris=500)
    g.add(sdf.Torus((0, 0.16, 5.74), (0, 0, 1), 0.66, 0.07, squash=1.6))
    for a in range(4):
        t = a * math.pi / 2 + math.pi / 4
        p = V((math.cos(t) * 0.66, 0.16 + math.sin(t) * 0.66, 5.74))
        g.add(Cyl(p * (1, 1, 1) - V((math.cos(t), math.sin(t), 0)) * 0.3, p + V((math.cos(t), math.sin(t), 0)) * 0.05,
                  0.06, 0.02))
    out.append(g)
    w = HSPart('WaistCables', 'cable', 'Spine', tris=1100, voxel=0.02)
    for s in (1, -1):
        for dx, r in ((0.32, 0.085), (0.58, 0.075)):
            pts = [(s * dx, -0.32, 5.12), (s * (dx + 0.2), -0.62, 5.5), (s * (dx + 0.22), -0.68, 5.95),
                   (s * dx, -0.46, 6.48)]
            w.add(sdf.Polyline(pts, [r, r * 1.05, r * 1.05, r]), 0.02)
        pts = [(s * 0.45, 0.62, 5.15), (s * 0.68, 0.92, 5.7), (s * 0.6, 0.85, 6.2), (s * 0.45, 0.7, 6.5)]
        w.add(sdf.Polyline(pts, 0.09), 0.02)
    out.append(w)
    return out


def chest_plates():
    """The cuirass: pectorals, abdominal lames, side and back plates, the collar."""
    out = []
    for side, s in (('L', 1), ('R', -1)):
        p = HSPart(f'Pec{side}', 'brass', 'Chest', tris=1100)
        base = sdf.Ellipsoid((0, 0.3, 7.7), (2.06, 1.98, 1.62))
        pl = Plate(base, 0.13, [keep((s, 0, 0), (s * 1.0, 0, 0)), keep((0, 0, 1), (0, 0, 7.36)),
                                keep((0, -1, 0), (0, 0.3, 0)), keep((0, 0, -1), (0, 0, 8.98)),
                                keep((-s, 0, -0.35), (s * 1.98, 0, 8.6))])
        plate_part(p, pl, spacing=0.23, seed=10 + s)
        # a stamped boss and two engraved rays on the plate
        c = pl.surface()
        P, N = hs.project(c, [(s * 1.45, -1.6, 8.2)])
        p.add(inter(sdf.Sphere(P[0] + N[0] * -0.02, 0.2), shell(base, 0.3, 0.12), 0.01), 0.02)
        p.sub(pl.line_groove((0, 0, 1), (0, 0, 7.92), w=0.026, depth=0.02, inset=0.2), 0.005)
        out.append((p, pl))
    a = HSPart('AbsUpper', 'brass', 'Chest', tris=900)
    base = sdf.Ellipsoid((0, 0.3, 7.35), (1.99, 1.93, 1.92))
    pl = Plate(base, 0.12, [keep((0, 0, 1), (0, 0, 6.86)), keep((0, 0, -1), (0, 0, 7.42)), keep((0, -1, 0), (0, 0.5, 0))],
               extra=hs.Fn(lambda X, Y, Z: 1.0 - np.abs(X), base.lo, base.hi))
    plate_part(a, pl, spacing=0.22, seed=12)
    out.append((a, pl))
    b = HSPart('AbsLower', 'brass', 'Chest', tris=800)
    base = sdf.Ellipsoid((0, 0.3, 7.2), (1.93, 1.87, 2.0))
    pl = Plate(base, 0.12, [keep((0, 0, 1), (0, 0, 6.36)), keep((0, 0, -1), (0, 0, 6.9)), keep((0, -1, 0), (0, 0.5, 0))])
    plate_part(b, pl, spacing=0.22, seed=13)
    out.append((b, pl))
    for side, s in (('L', 1), ('R', -1)):
        p = HSPart(f'SidePlate{side}', 'brass', 'Chest', tris=700)
        base = sdf.Ellipsoid((0, 0.2, 7.6), (1.95, 1.76, 1.56))
        pl = Plate(base, 0.12, [keep((s, 0, 0), (s * 1.2, 0, 0)), keep((0, 1, 0), (0, -0.6, 0)),
                                keep((0, -1, 0), (0, 1.25, 0)), keep((0, 0, 1), (0, 0, 6.5)), keep((0, 0, -1), (0, 0, 8.45))])
        plate_part(p, pl, spacing=0.24, seed=14 + s)
        p.sub(pl.line_groove((0, 1, 0), (0, 0.32, 0), w=0.026, depth=0.02, inset=0.2), 0.005)
        out.append((p, pl))
    bk = HSPart('BackPlate', 'brass', 'Chest', tris=1000)
    base = sdf.Ellipsoid((0, 0.1, 7.6), (1.96, 1.72, 1.62))
    pl = Plate(base, 0.13, [keep((0, 1, 0), (0, 0.55, 0)), keep((0, 0, 1), (0, 0, 6.45)), keep((0, 0, -1), (0, 0, 8.9)),
                            keep((-1, 0, 0), (1.55, 0, 0)), keep((1, 0, 0), (-1.55, 0, 0))])
    plate_part(bk, pl, spacing=0.25, seed=16)
    out.append((bk, pl))
    co = HSPart('Collar', 'brass', 'Chest', tris=1300)
    base = sdf.Ellipsoid((0, 0.35, 8.72), (1.32, 1.26, 0.98))
    pl = Plate(base, 0.15, [keep((0, 0, 1), (0, 0, 8.5)), keep((0, 1, 0), (0, -0.5, 0))])
    plate_part(co, pl, spacing=0.22, seed=17, rim_h=0.05, rim_w=0.09)
    for a_ in (-0.9, -0.45, 0.0, 0.45, 0.9):
        n = V((math.cos(math.pi / 2 + a_), math.sin(math.pi / 2 + a_), 0))
        n = V((-n[1], n[0], 0))
        co.sub(pl.line_groove(n, (0, 0.35, 0), w=0.024, depth=0.02, inset=0.22), 0.005)
    out.append((co, pl))
    return out


def chest_core():
    out = []
    c = HSPart('ChestCore', 'iron', 'Chest', tris=2200)
    c.add(sdf.Ellipsoid((0, 0.2, 7.62), (1.88, 1.66, 1.46)))
    c.add(box((0, 0.2, 6.5), (1.25, 1.05, 0.32), r=0.22), 0.25)
    c.add(box((0, 0.2, 8.62), (1.1, 1.0, 0.3), r=0.2), 0.2)
    c.sub(box((0, -1.05, 7.58), (0.74, 0.72, 0.72), r=0.1), 0.03)
    out.append(c)
    # the empty socket: a scorched liner, ribs, the cradle ring with nothing in it
    so = HSPart('SocketLiner', 'socket', 'Chest', tris=1500, voxel=0.018, boost=1.4)
    cav = box((0, -1.05, 7.58), (0.74, 0.72, 0.72), r=0.1)
    so.add(inter(shell(cav, 0.06, -0.03), keep((0, 1, 0), (0, -1.52, 0)), 0.01))
    for x in (-0.5, -0.25, 0.25, 0.5):
        so.add(box((x, -0.36, 7.58), (0.035, 0.05, 0.66), r=0.015), 0.01)
    for z in (7.18, 7.58, 7.98):
        for sx in (1, -1):
            so.add(box((sx * 0.7, -0.95, z), (0.05, 0.52, 0.035), r=0.015), 0.01)
    so.add(sdf.Torus((0, -0.44, 7.58), (0, 1, 0), 0.42, 0.075), 0.02)
    so.add(sdf.Torus((0, -0.47, 7.58), (0, 1, 0), 0.25, 0.04), 0.02)
    so.bolts(hs.arc_pts((0, -0.5, 7.58), (0, 1, 0), 0.42, 0.2, 0.2 + 2 * math.pi * 7 / 8, 8), r=0.035,
             on=sdf.Torus((0, -0.44, 7.58), (0, 1, 0), 0.42, 0.075), h=0.03)
    out.append(so)
    pr = HSPart('SocketContacts', 'copper', 'Chest', tris=700, voxel=0.016, boost=1.4)
    for k in range(4):
        t = math.pi / 4 + k * math.pi / 2
        d = V((math.cos(t), 0, math.sin(t)))
        a = V((0, -0.46, 7.58)) + d * 0.42
        b = V((0, -0.82, 7.58)) + d * 0.2
        pr.add(sdf.RoundCone(a, b, 0.075, 0.04), 0.01)
        pr.add(sdf.Sphere(b, 0.06), 0.01)
    out.append(pr)
    ins = HSPart('SocketInsulators', 'ceramic', 'Chest', tris=600, voxel=0.016)
    for sx in (1, -1):
        for z in (7.25, 7.92):
            for i in range(3):
                x = sx * (0.66 - 0.06 - i * 0.075)
                ins.add(Cyl((x - 0.025, -1.05, z), (x + 0.025, -1.05, z), 0.1 - 0.012 * (i % 2), 0.01), 0.005)
            ins.add(Cyl((sx * 0.68, -1.05, z), (sx * 0.4, -1.05, z), 0.04, 0.01), 0.005)
    out.append(ins)
    cs = HSPart('SocketCables', 'cable', 'Chest', tris=400, voxel=0.016)
    for sx, z0 in ((1, 8.2), (-1, 8.18)):
        cs.add(sdf.Polyline([(sx * 0.3, -0.45, z0), (sx * 0.26, -0.7, 8.05), (sx * 0.2, -0.9, 7.82)], [0.06, 0.06, 0.05]),
               0.02)
    out.append(cs)
    bz = HSPart('HatchBezel', 'brass', 'Chest', tris=1300, boost=1.3)
    outer = box((0, -1.56, 7.58), (0.96, 0.14, 0.9), r=0.07)
    bz.add(outer)
    bz.sub(box((0, -1.56, 7.58), (0.78, 0.4, 0.73), r=0.05), 0.02)
    pts = []
    for x in np.linspace(-0.62, 0.62, 5):
        pts += [(x, -1.72, 8.4), (x, -1.72, 6.76)]
    for z in np.linspace(7.0, 8.2, 4):
        pts += [(0.87, -1.72, z), (-0.87, -1.72, z)]
    bz.bolts(pts, r=0.05, on=outer, h=0.05)
    for sx in (1, -1):
        for z0, z1 in ((6.82, 7.06), (7.46, 7.7), (8.1, 8.34)):
            bz.add(Cyl((sx * M.HATCH_HALF_W, M.HATCH_Y, z0), (sx * M.HATCH_HALF_W, M.HATCH_Y, z1), 0.085, 0.015), 0.01)
        bz.add(box((sx * 0.86, -1.72, 7.58), (0.05, 0.06, 0.78), r=0.02), 0.02)
    out.append(bz)
    hz = HSPart('HatchTrim', 'hazard', 'Chest', tris=500, boost=1.3)
    tr = box((0, -1.58, 7.58), (0.8, 0.14, 0.75), r=0.03)
    hz.add(tr)
    hz.sub(box((0, -1.58, 7.58), (0.74, 0.4, 0.69), r=0.03), 0.01)
    out.append(hz)
    return out


def hatch_leaf(side):
    """One leaf of the Core Hatch: a domed brass plate over half the opening, two
    bolted straps, a raised rim and the stamped half of the foundry's sigil."""
    s = 1 if side == 'L' else -1
    p = HSPart('Hatch' + side, 'brass', 'Hatch' + side, tris=1700, boost=1.6, voxel=0.015)
    base = sdf.Sphere((0, 0.0, 7.58), 1.86)
    pl = Plate(base, 0.17, [keep((s, 0, 0), (s * 0.012, 0, 0)), keep((-s, 0, 0), (s * 0.86, 0, 0)),
                           keep((0, 0, 1), (0, 0, 6.84)), keep((0, 0, -1), (0, 0, 8.32))])
    plate_part(p, pl, spacing=0.2, seed=20 + s, rivet_r=0.04, inset=0.1)
    for z in (7.12, 8.04):
        strap = inter(shell(base, 0.2, 0.06), hs.Fn(lambda X, Y, Z, z=z: np.maximum(np.abs(Z - z) - 0.085,
                                                                                      np.maximum(-X * s + 0.04, X * s - 0.9)),
                                                    base.lo, base.hi), 0.015)
        p.add(strap, 0.01)
        p.bolts([(s * x, -1.95, z) for x in (0.18, 0.45, 0.72)], r=0.045, on=hs.offset(base, 0.16), h=0.04)
    # half a gear (the foundry mark) stamped round the centre seam
    ring = inter(shell(base, 0.16, 0.05), hs.Fn(lambda X, Y, Z: np.abs(np.hypot(X, Z - 7.58) - 0.3) - 0.05, base.lo,
                                                 base.hi), 0.01)
    p.add(inter(ring, keep((s, 0, 0), (0.0, 0, 0)), 0.005), 0.01)
    for k in range(5):
        t = -math.pi / 2 + (k + 0.5) * math.pi / 5
        cx, cz = s * math.cos(t) * 0.38, 7.58 + math.sin(t) * 0.38
        p.add(inter(shell(base, 0.16, 0.05), hs.Fn(lambda X, Y, Z, cx=cx, cz=cz: np.hypot(X - cx, Z - cz) - 0.06, base.lo,
                                                   base.hi), 0.01), 0.01)
    p.add(Cyl((s * 0.06, -1.86, 7.58), (s * 0.06, -1.93, 7.58), 0.12, 0.02), 0.01)
    for z0, z1 in ((7.08, 7.42), (7.74, 8.08)):
        p.add(Cyl((s * M.HATCH_HALF_W, M.HATCH_Y, z0), (s * M.HATCH_HALF_W, M.HATCH_Y, z1), 0.085, 0.015), 0.01)
        p.add(box((s * 0.8, -1.81, (z0 + z1) / 2), (0.08, 0.035, 0.15), r=0.015), 0.01)
    return p


def back_parts():
    out = []
    bo = HSPart('Boiler', 'iron', 'Chest', tris=1300)
    drum = Cyl((-1.18, 1.48, 8.15), (1.18, 1.48, 8.15), 0.6, 0.06)
    bo.add(drum)
    for x in (-0.82, 0.0, 0.82):
        bo.add(Cyl((x - 0.06, 1.48, 8.15), (x + 0.06, 1.48, 8.15), 0.64, 0.02), 0.01)
        for dx in (-0.12, 0.12):
            pts = hs.arc_pts((x + dx, 1.48, 8.15), (1, 0, 0), 0.6, -0.4, math.pi + 0.4, 9, ref=(0, 1, 0))
            bo.rivets(pts, r=0.035, on=drum)
    out.append(bo)
    cp = HSPart('BoilerCaps', 'brass', 'Chest', tris=600)
    for sx in (1, -1):
        cp.add(sdf.Ellipsoid((sx * 1.18, 1.48, 8.15), (0.22, 0.64, 0.64)), 0.03)
        cp.add(Cyl((sx * 1.3, 1.48, 8.15), (sx * 1.46, 1.48, 8.15), 0.2, 0.03), 0.02)
        cp.add(sdf.Torus((sx * 1.18, 1.48, 8.15), (1, 0, 0), 0.6, 0.05), 0.02)
    out.append(cp)
    for side, s in (('L', 1), ('R', -1)):
        st = HSPart(f'Stack{side}', 'brass', 'Chest', tris=900)
        a, b = V((s * 0.6, 1.72, 8.45)), V((s * 0.92, 2.3, 9.9))
        u = (b - a) / np.linalg.norm(b - a)
        st.add(sdf.RoundCone(a, b, 0.33, 0.27))
        st.add(Cyl(b - u * 0.05, b + u * 0.22, 0.42, 0.04), 0.03)
        st.sub(Cyl(b - u * 0.6, b + u * 0.5, 0.22, 0.02), 0.02)
        for t in (0.15, 0.48):
            c = a + (b - a) * t
            st.add(Cyl(c - u * 0.05, c + u * 0.05, 0.345 - 0.05 * t, 0.015), 0.01)
            st.rivets(hs.arc_pts(c + u * 0.11, u, 0.32, 0, 2 * math.pi * 11 / 12, 12), r=0.032,
                      on=sdf.RoundCone(a, b, 0.33, 0.27))
        out.append(st)
        hb = HSPart(f'StackBand{side}', 'hazard', 'Chest', tris=300)
        for t in (0.66, 0.8):
            c = a + (b - a) * t
            hb.add(Cyl(c - u * 0.07, c + u * 0.07, 0.33 - 0.055 * t, 0.015))
        out.append(hb)
        pg = V((s * 0.95, 1.36, 7.0))
        pe = M.side_pt(M.PLUG, s)
        so = HSPart(f'PlugSocket{side}', 'brass', 'Chest', tris=500)
        so.add(Cyl(pg, pe + (0, 0.02, 0), 0.27, 0.03))
        so.add(Cyl(pg + (0, 0.2, 0), pg + (0, 0.3, 0), 0.4, 0.02), 0.02)
        so.sub(Cyl(pe - (0, 0.25, 0), pe + (0, 0.2, 0), 0.15, 0.01), 0.01)
        so.bolts(hs.arc_pts(pg + (0, 0.3, 0), (0, 1, 0), 0.34, 0, 2 * math.pi * 5 / 6, 6), r=0.035,
                 on=Cyl(pg + (0, 0.2, 0), pg + (0, 0.3, 0), 0.4, 0.02), h=0.03)
        out.append(so)
        ins = HSPart(f'PlugInsulator{side}', 'ceramic', 'Chest', tris=400)
        for i, y in enumerate((1.74, 1.83, 1.92)):
            ins.add(Cyl((s * 0.95, y - 0.03, 7.0), (s * 0.95, y + 0.03, 7.0), 0.38 - 0.03 * (i % 2), 0.012), 0.005)
        out.append(ins)
        # the vents either side of the boiler
        vt = HSPart(f'Vent{side}', 'iron', 'Chest', tris=500)
        c = V((s * 1.45, 1.05, 7.15))
        vt.add(box(c, (0.25, 0.3, 0.42), r=0.06))
        for z in np.linspace(-0.3, 0.3, 6):
            vt.sub(box(c + (s * 0.24, 0, z), (0.05, 0.24, 0.022), r=0.01), 0.008)
        out.append(vt)
    return out


def shoulder_mounts():
    out = []
    for side, s in (('L', 1), ('R', -1)):
        sh = M.side_pt(M.SHOULDER, s)
        p = HSPart(f'ShoulderBall{side}', 'iron', side + '_Clavicle', tris=700)
        p.add(sdf.Sphere(sh, 0.68))
        p.add(Cyl(V((s * 1.45, 0.27, 8.58)), sh, 0.34, 0.06), 0.06)
        p.add(sdf.Torus(sh - (s * 0.5, 0, 0), (1, 0, 0), 0.47, 0.06), 0.02)
        p.bolts(hs.arc_pts(sh - (s * 0.5, 0, 0), (1, 0, 0), 0.47, 0, 2 * math.pi * 7 / 8, 8) - (s * 0.06, 0, 0), r=0.04,
                on=sdf.Torus(sh - (s * 0.5, 0, 0), (1, 0, 0), 0.47, 0.06), h=0.035)
        out.append(p)
    return out


# ------------------------------------------------------------------ head
def head_parts():
    out = []
    E = M.EYE
    sk = HSPart('Skull', 'iron', 'Head', tris=1500, boost=1.5)
    sk.add(box((0, -1.0, 9.84), (0.6, 0.6, 0.6), r=0.2))
    sk.add(box((0, -1.1, 9.34), (0.52, 0.5, 0.24), r=0.1), 0.08)
    sk.sub(box((0, -1.62, 9.33), (0.43, 0.12, 0.16), r=0.04), 0.02)
    # the unfinished half: the frame opened up, struts across the void
    sk.sub(box((0.38, -1.62, 9.92), (0.3, 0.3, 0.38), r=0.06), 0.02)
    for a, b, r in (((0.12, -1.5, 9.55), (0.12, -1.5, 10.28), 0.05), ((0.12, -1.48, 10.22), (0.66, -1.48, 9.6), 0.045),
                    ((0.1, -1.47, 9.66), (0.68, -1.47, 9.66), 0.04), ((0.5, -1.47, 10.28), (0.5, -1.47, 9.58), 0.035)):
        sk.add(Cyl(a, b, r, 0.01), 0.01)
    sk.add(sdf.Torus((0.38, -1.42, 9.95), (0, 1, 0), 0.15, 0.03), 0.01)
    for sx in (1, -1):
        sk.add(Cyl((sx * 0.55, -0.85, 9.62), (sx * 0.74, -0.85, 9.62), 0.17, 0.03), 0.03)
        sk.add(Cyl((sx * 0.74, -0.85, 9.62), (sx * 0.8, -0.85, 9.62), 0.1, 0.02), 0.01)
    out.append(sk)
    gr = HSPart('MouthGrille', 'iron', 'Head', tris=500, voxel=0.016, boost=1.4)
    for x in np.linspace(-0.36, 0.36, 7):
        gr.add(Cyl((x, -1.57, 9.17), (x, -1.57, 9.5), 0.032, 0.008), 0.005)
    gr.add(box((0, -1.58, 9.5), (0.46, 0.045, 0.035), r=0.012), 0.01)
    gr.add(box((0, -1.58, 9.16), (0.46, 0.045, 0.035), r=0.012), 0.01)
    out.append(gr)
    fp = HSPart('FacePlate', 'brass', 'Head', tris=1300, voxel=0.016, boost=1.8)
    base = sdf.Ellipsoid((0, -0.95, 9.82), (0.73, 0.77, 0.74))

    def edge(X, Y, Z):
        e = np.where(Z < 9.84, 0.08, np.where(Z < 10.12, 0.2, -0.02))
        return X - e
    pl = Plate(base, 0.09, [keep((0, -1, 0), (0, -1.12, 0)), keep((0, 0, 1), (0, 0, 9.53)), keep((0, 0, -1), (0, 0, 10.4))],
               extra=hs.Fn(edge, base.lo, base.hi))
    fp.add(pl.solid())
    fp.add(pl.rim(0.03, 0.06))
    fp.sub(Cyl((E[0], -2.1, E[2]), (E[0], -1.3, E[2]), 0.2, 0.02), 0.015)
    pts = pl.edge_points(inset=0.08, spacing=0.15, seed=31)
    fp.rivets(pts, r=0.032, on=pl.surface())
    # empty rivet holes along the unfinished edge
    holes, _ = hs.project(pl.surface(), [(0.14, -1.7, 9.6), (0.14, -1.7, 9.74), (0.26, -1.66, 9.92), (0.26, -1.64, 10.05),
                                         (0.02, -1.66, 10.2), (0.02, -1.62, 10.32)])
    for h in holes:
        fp.sub(sdf.Sphere(h, 0.03), 0.004)
    # the brow: a heavy bar angled down to the centre over the eye
    fp.add(box((E[0] - 0.02, -1.7, E[2] + 0.27), (0.3, 0.09, 0.06), sdf.rot_matrix(0, -0.26, 0), r=0.03), 0.03)
    out.append(fp)
    cr = HSPart('Crown', 'brass', 'Head', tris=800, boost=1.3)
    base = sdf.Ellipsoid((0, -0.88, 9.86), (0.72, 0.8, 0.72))
    pl = Plate(base, 0.1, [keep((0, 0, 1), (0, 0, 10.18)), keep((0, -1, 0), (0, -0.25, 0))])
    plate_part(cr, pl, spacing=0.16, seed=32, rivet_r=0.032, inset=0.09)
    cr.add(inter(shell(base, 0.3, 0.12), hs.Fn(lambda X, Y, Z: np.maximum(np.abs(X) - 0.055, np.maximum(10.12 - Z, Y + 0.3)),
                                                base.lo, base.hi), 0.015), 0.02)
    out.append(cr)
    ez = HSPart('EyeBezel', 'brass', 'Head', tris=400, voxel=0.012, boost=2.0)
    ez.add(sdf.Torus(E + (0, 0.02, 0), (0, 1, 0), 0.2, 0.05, squash=1.4))
    ez.bolts([E + (math.cos(t) * 0.2, -0.06, math.sin(t) * 0.2) for t in np.linspace(0.4, 0.4 + 2 * math.pi * 5 / 6, 6)],
             r=0.025, on=sdf.Torus(E + (0, 0.02, 0), (0, 1, 0), 0.2, 0.05, squash=1.4), h=0.02)
    out.append(ez)
    nk = HSPart('NeckColumn', 'iron', 'Neck', tris=700)
    nk.add(sdf.RoundCone((0, -0.22, 8.5), (0, -0.7, 9.45), 0.34, 0.3))
    for t in (0.35, 0.68):
        c = V((0, -0.22, 8.5)) + (V((0, -0.7, 9.45)) - V((0, -0.22, 8.5))) * t
        u = V((0, -0.48, 0.95)) / np.linalg.norm((0, -0.48, 0.95))
        nk.add(Cyl(c - u * 0.06, c + u * 0.06, 0.4, 0.02), 0.01)
    out.append(nk)
    nc = HSPart('NeckCables', 'cable', 'Neck', tris=500)
    for sx in (1, -1):
        nc.add(sdf.Polyline([(sx * 0.3, -0.05, 8.55), (sx * 0.48, -0.45, 8.95), (sx * 0.35, -0.72, 9.35)], 0.07), 0.02)
    nc.add(sdf.Polyline([(0, 0.15, 8.6), (0, -0.2, 9.05), (0, -0.4, 9.4)], 0.075), 0.02)
    out.append(nc)
    return out


# ------------------------------------------------------------------ the brass arm (its right)
def brass_arm():
    s = -1
    out = []
    SH, EL, WR, KN = (M.side_pt(p, s) for p in (M.SHOULDER, M.ELBOW, M.WRIST, M.KNUCK))
    o = V((s, 0, 0))
    pa = HSPart('R_Pauldron', 'brass', 'R_Clavicle', tris=1500, boost=1.1)
    c = SH + (0, 0.05, 0.12)
    base = sdf.Sphere(c, 1.1)
    cuts = [keep((0.3 * s, 0, 1), (s * 2.7, 0, 8.12)), keep(o, (s * 1.8, 0, 0))]
    pl = Plate(base, 0.16, cuts)
    plate_part(pa, pl, spacing=0.22, seed=40, rim_h=0.05, rim_w=0.1, inset=0.16)
    # two lower lames layered under the dome's edge
    for i, (dz, r) in enumerate(((0.0, 1.06), (-0.22, 1.02))):
        b2 = sdf.Sphere(c + (0, 0, dz - 0.05), r)
        l2 = Plate(b2, 0.12, [keep((0.3 * s, 0, 1), (s * 2.7, 0, 7.92 + dz)), keep((-0.3 * s, 0, -1), (s * 2.7, 0, 8.2 + dz)),
                              keep(o, (s * 1.95, 0, 0))])
        plate_part(pa, l2, groove=False, spacing=0.2, seed=41 + i, rim_h=0.03, rim_w=0.06, inset=0.1)
    # the crest ridge front to back
    pa.add(inter(shell(base, 0.4, 0.2), hs.Fn(lambda X, Y, Z: np.abs(X - c[0]) - 0.07, base.lo, base.hi), 0.02), 0.03)
    out.append(pa)
    u = (EL - SH) / np.linalg.norm(EL - SH)
    L = float(np.linalg.norm(EL - SH))
    core = HSPart('R_UpperArmCore', 'iron', 'R_UpperArm', tris=500)
    core.add(sdf.RoundCone(SH, EL, 0.56, 0.46))
    out.append(core)
    lm = HSPart('R_UpperArmLames', 'brass', 'R_UpperArm', tris=1200)
    inward = V((-s, 0, 0))
    for i, (t0, t1, ow) in enumerate(((0.2, 0.48, 0.0), (0.44, 0.74, 0.05))):
        base = sdf.RoundCone(SH, EL, 0.8, 0.66)
        cuts = [keep(u, SH + u * L * t0), keep(-u, SH + u * L * t1), keep(-inward, SH + inward * 0.5)]
        pl = Plate(base, 0.11, cuts, outward=ow)
        plate_part(lm, pl, spacing=0.22, seed=44 + i, inset=0.11)
    out.append(lm)
    el = HSPart('R_Elbow', 'iron', 'R_UpperArm', tris=500)
    el.add(sdf.Sphere(EL, 0.6))
    out.append(el)
    cop = HSPart('R_ElbowCop', 'brass', 'R_UpperArm', tris=600)
    base = sdf.Sphere(EL, 0.72)
    pl = Plate(base, 0.12, [keep((0, 1, 0), (0, EL[1] - 0.05, 0)), keep(o, EL + o * -0.35)])
    plate_part(cop, pl, spacing=0.18, seed=46, inset=0.1)
    out.append(cop)
    a, b = EL, WR
    u2 = (b - a) / np.linalg.norm(b - a)
    L2 = float(np.linalg.norm(b - a))
    gc = HSPart('R_ForearmCore', 'iron', 'R_Forearm', tris=500)
    gc.add(sdf.RoundCone(EL, WR, 0.5, 0.64))
    out.append(gc)
    gp = HSPart('R_Gauntlet', 'brass', 'R_Forearm', tris=1800)
    for i, (t0, t1, ow) in enumerate(((0.12, 0.42, 0.0), (0.38, 0.7, 0.045), (0.66, 0.95, 0.09))):
        base = sdf.RoundCone(EL, WR, 0.6, 0.8)
        pl = Plate(base, 0.12, [keep(u2, EL + u2 * L2 * t0), keep(-u2, EL + u2 * L2 * t1)], outward=ow)
        plate_part(gp, pl, spacing=0.23, seed=47 + i, inset=0.11)
    cuff = Cyl(WR - u2 * 0.32, WR - u2 * 0.12, 0.98, 0.04)
    gp.add(cuff, 0.02)
    gp.bolts(hs.arc_pts(WR - u2 * 0.22, u2, 0.98, 0, 2 * math.pi * 11 / 12, 12) + 0.0, r=0.05, on=cuff, h=0.04)
    out.append(gp)
    # the fist
    f = V((0, -1.0, 0))
    uw = (KN - WR) / np.linalg.norm(KN - WR)
    f = ortho(f, uw)
    i_ = np.cross(uw, f)
    if np.dot(i_, inward) < 0:
        i_ = -i_
    R = np.stack([i_, f, uw], axis=1)
    W = WR
    fi = HSPart('R_Fist', 'brass', 'R_Hand', tris=2600, voxel=0.02, boost=1.3)
    k = 1.45
    fi.add(box(W + uw * 0.5 * k + i_ * 0.02, (0.42 * k, 0.54 * k, 0.48 * k), R, r=0.22 * k))
    for fy in (-0.42, -0.14, 0.14, 0.42):
        k0 = W + (uw * 0.9 + f * fy - i_ * 0.2) * k
        k1 = k0 + (uw * 0.24 + i_ * 0.4) * k
        k2 = k1 + (-uw * 0.34 + i_ * 0.1) * k
        fi.add(sdf.Polyline([k0, k1, k2], [0.18 * k, 0.17 * k, 0.15 * k]), 0.02 * k)
        fi.add(sdf.Ellipsoid(k0 + (uw * 0.16 - i_ * 0.02) * k, (0.17 * k, 0.15 * k, 0.12 * k), R), 0.03)
    t0 = W + (uw * 0.42 + f * -0.58 + i_ * 0.3) * k
    t1 = W + (uw * 0.92 + f * -0.28 + i_ * 0.52) * k
    fi.add(sdf.Polyline([t0, t1, t1 + (f * 0.25 - uw * 0.05) * k], [0.17 * k, 0.16 * k, 0.14 * k]), 0.05 * k)
    kg = box(W + (uw * 1.1 - i_ * 0.2) * k, (0.2 * k, 0.64 * k, 0.1 * k), R, r=0.06 * k)
    fi.add(kg, 0.03)
    fi.rivets([W + (uw * 1.25 + f * fy - i_ * 0.2) * k for fy in (-0.42, -0.14, 0.14, 0.42)], r=0.13, on=kg, flat=0.8)
    bp = box(W + (uw * 0.5 - i_ * 0.46) * k, (0.09 * k, 0.6 * k, 0.5 * k), R, r=0.05 * k)
    fi.add(bp, 0.03)
    fi.rivets([W + (uw * zz - i_ * 0.56 + f * fy) * k for zz in (0.12, 0.88) for fy in (-0.45, 0, 0.45)], r=0.055, on=bp)
    out.append(fi)
    return out


# ------------------------------------------------------------------ the iron arm (its left)
def iron_arm():
    s = 1
    out = []
    SH, EL, WR, KN = M.SHOULDER, M.ELBOW, M.WRIST, M.KNUCK
    rb = HSPart('L_ShoulderRibs', 'iron', 'L_Clavicle', tris=1000)
    c = SH + (0, 0.05, 0.12)
    base = sdf.Sphere(c, 1.05)
    for y in (-0.62, -0.2, 0.22, 0.64):
        rb.add(inter(shell(base, 0.16), hs.Fn(lambda X, Y, Z, y=y: np.maximum(np.abs(Y - c[1] - y) - 0.08,
                                                                               np.maximum(8.05 - Z, 1.85 - X)),
                                              base.lo, base.hi), 0.02), 0.02)
    rb.add(inter(shell(base, 0.18), hs.Fn(lambda X, Y, Z: np.maximum(np.abs(Z - 8.12) - 0.08, 1.85 - X), base.lo, base.hi),
                 0.02), 0.02)
    rb.add(inter(shell(base, 0.18), hs.Fn(lambda X, Y, Z: np.maximum(np.abs(X - 2.75) - 0.08, 8.05 - Z), base.lo, base.hi),
                 0.02), 0.02)
    holes, _ = hs.project(hs.offset(base, 0.08), [c + (0.0, y, 1.0) for y in (-0.62, -0.2, 0.22, 0.64)]
                          + [c + (0.75, y, 0.68) for y in (-0.2, 0.22, 0.64)])
    for hh in holes:
        rb.sub(sdf.Sphere(hh, 0.04), 0.004)
    out.append(rb)
    lame = HSPart('L_ShoulderLame', 'brass', 'L_Clavicle', tris=500)
    pl = Plate(sdf.Sphere(c, 1.13), 0.12, [keep((0, -1, 0), (0, c[1] - 0.1, 0)), keep((0, 1, 0), (0, c[1] - 0.82, 0)),
                                           keep((0, 0, 1), (0, 0, 8.15)), keep((1, 0, 0), (1.95, 0, 0))])
    plate_part(lame, pl, spacing=0.2, seed=70, inset=0.1)
    out.append(lame)
    u = (EL - SH) / np.linalg.norm(EL - SH)
    L = float(np.linalg.norm(EL - SH))
    bend = ortho(V((0, 1, 0)), u)
    h = np.cross(u, bend)
    R = np.stack([h, bend, u], axis=1)
    fr = HSPart('L_UpperArmFrame', 'iron', 'L_UpperArm', tris=2200)
    mid = (SH + EL) / 2
    for sg in (1, -1):
        rc = mid + h * 0.44 * sg
        fr.add(box(rc, (0.07, 0.36, L / 2 + 0.05), R, r=0.025))
        for e in (1, -1):
            fr.add(box(rc + bend * 0.36 * e, (0.13, 0.045, L / 2), R, r=0.02), 0.01)
        for t in (-0.55, 0.0, 0.55):
            fr.sub(Cyl(rc + u * L * t * 0.5 - h * 0.2, rc + u * L * t * 0.5 + h * 0.2, 0.13, 0.02), 0.01)
        fr.bolts([rc + h * 0.08 * sg + u * L * t * 0.5 + bend * 0.24 * e for t in (-0.8, -0.28, 0.28, 0.8) for e in (1, -1)],
                 r=0.035, h=0.03, on=box(rc, (0.07, 0.36, L / 2 + 0.05), R, r=0.025))
    for t, e in ((0.3, 1), (0.52, -1), (0.74, 1)):
        p = SH + u * L * t + bend * 0.2 * e
        fr.add(Cyl(p - h * 0.48, p + h * 0.48, 0.09, 0.02), 0.01)
    fr.add(Cyl(SH - h * 0.5, SH + h * 0.5, 0.42, 0.05), 0.02)
    drum = Cyl(EL - h * 0.54, EL + h * 0.54, 0.46, 0.04)
    fr.add(drum, 0.02)
    for k in range(18):
        t = 2 * math.pi * k / 18
        d = bend * math.cos(t) + u * math.sin(t)
        Rk = np.stack([h, np.cross(d, h), d], axis=1)
        for sg in (1, -1):
            fr.add(box(EL + d * 0.48 + h * 0.36 * sg, (0.12, 0.05, 0.05), Rk, r=0.012), 0.005)
    fr.add(Cyl(EL - h * 0.68, EL + h * 0.68, 0.19, 0.03), 0.01)
    out.append(fr)
    # the shoulder gear: a toothed wheel round the shoulder ball, turning with the arm
    gw = HSPart('L_ShoulderGear', 'iron', 'L_UpperArm', tris=1600)
    gc = SH + h * 0.55
    wheel = Cyl(gc - h * 0.09, gc + h * 0.09, 0.86, 0.03)
    gw.add(wheel)
    for kk in range(6):
        a = kk * math.pi / 3 + 0.3
        d = bend * math.cos(a) + u * math.sin(a)
        gw.sub(Cyl(gc + d * 0.55 - h * 0.3, gc + d * 0.55 + h * 0.3, 0.17, 0.02), 0.015)
    for kk in range(28):
        a = 2 * math.pi * kk / 28
        d = bend * math.cos(a) + u * math.sin(a)
        Rk = np.stack([h, np.cross(d, h), d], axis=1)
        gw.add(box(gc + d * 0.9, (0.07, 0.05, 0.07), Rk, r=0.012), 0.005)
    hub = Cyl(gc - h * 0.12, gc + h * 0.16, 0.3, 0.03)
    gw.add(hub, 0.02)
    gw.bolts([gc + h * 0.16 + (bend * math.cos(a) + u * math.sin(a)) * 0.2 for a in np.linspace(0, 2 * math.pi * 5 / 6, 6)],
             r=0.04, on=hub, h=0.03)
    out.append(gw)
    # forearm
    u2 = (WR - EL) / np.linalg.norm(WR - EL)
    L2 = float(np.linalg.norm(WR - EL))
    b2 = ortho(V((0, 1, 0)), u2)
    h2 = np.cross(u2, b2)
    R2 = np.stack([h2, b2, u2], axis=1)
    fa = HSPart('L_ForearmFrame', 'iron', 'L_Forearm', tris=1900)
    fa.add(Cyl(EL - h2 * 0.32, EL + h2 * 0.32, 0.56, 0.04))
    m2 = (EL + WR) / 2 + u2 * 0.05
    beam = box(m2, (0.27, 0.25, L2 / 2 - 0.15), R2, r=0.05)
    fa.add(beam, 0.04)
    for t in (-0.5, -0.1, 0.3):
        fa.sub(Cyl(m2 + u2 * L2 * t * 0.5 - h2 * 0.4, m2 + u2 * L2 * t * 0.5 + h2 * 0.4, 0.13, 0.02), 0.01)
    for e in (1, -1):
        fa.add(box(m2 + b2 * 0.27 * e, (0.34, 0.045, L2 / 2 - 0.2), R2, r=0.015), 0.01)
    gear = Cyl(WR - u2 * 0.34, WR - u2 * 0.12, 0.6, 0.03)
    fa.add(gear, 0.02)
    for k in range(20):
        t = 2 * math.pi * k / 20
        d = b2 * math.cos(t) + h2 * math.sin(t)
        Rk = np.stack([np.cross(u2, d), u2, d], axis=1)
        fa.add(box(WR - u2 * 0.23 + d * 0.62, (0.05, 0.09, 0.06), Rk, r=0.01), 0.004)
    fa.bolts([WR - u2 * 0.12 + (b2 * math.cos(t) + h2 * math.sin(t)) * 0.36 for t in np.linspace(0, 2 * math.pi * 5 / 6, 6)],
             r=0.04, on=gear, h=0.03)
    out.append(fa)
    # a copper coil wound round the beam (the arm runs on raw lightning)
    co = HSPart('L_ForearmCoil', 'copper', 'L_Forearm', tris=500, voxel=0.016)
    pts = []
    for i in range(260):
        tt = i / 259
        a = tt * 2 * math.pi * 11
        pts.append(m2 + u2 * L2 * (-0.22 + 0.36 * tt) + (b2 * math.cos(a) + h2 * math.sin(a)) * 0.4)
    co.add(Cyl(m2 + u2 * L2 * -0.23, m2 + u2 * L2 * 0.15, 0.405, 0.02))
    co.detail(True)
    co.add(sdf.Polyline(pts, 0.045), 0.01)
    co.detail(False)
    co.add(Cyl(m2 + u2 * L2 * -0.25, m2 + u2 * L2 * -0.23, 0.46, 0.01), 0.01)
    co.add(Cyl(m2 + u2 * L2 * 0.15, m2 + u2 * L2 * 0.17, 0.46, 0.01), 0.01)
    out.append(co)
    # the claw's palm
    uw = (KN - WR) / np.linalg.norm(KN - WR)
    f = ortho(V((0, -1.0, 0)), uw)
    i_ = np.cross(uw, f)
    if np.dot(i_, V((-1, 0, 0))) < 0:
        i_ = -i_
    Rw = np.stack([i_, f, uw], axis=1)
    pm = HSPart('L_ClawPalm', 'iron', 'L_Hand', tris=1000)
    palm = box(WR + uw * 0.5, (0.44, 0.6, 0.48), Rw, r=0.1)
    pm.add(palm)
    pm.sub(Cyl(WR + uw * 0.5 - i_ * 0.5, WR + uw * 0.5 + i_ * 0.5, 0.14, 0.02), 0.01)
    for bone in ('L_ClawA', 'L_ClawB', 'L_ClawT'):
        hd = M.REST[bone][0]
        pm.add(sdf.Sphere(hd, 0.2), 0.06)
    pm.bolts([WR + uw * zz - i_ * 0.37 + f * fy for zz in (0.2, 0.75) for fy in (-0.35, 0.35)], r=0.04, on=palm)
    out.append(pm)
    for bone, inward_tip in (('L_ClawA', (-0.25, 0.4, 0)), ('L_ClawB', (-0.25, -0.38, 0)), ('L_ClawT', (0.45, 0.1, 0))):
        hd, tl = M.REST[bone]
        ii = V(inward_tip) / np.linalg.norm(inward_tip)
        p0 = hd
        p1 = hd + (tl - hd) * 0.5 - ii * 0.05
        p2 = tl + ii * 0.05
        p3 = tl + ii * 0.32 + V((0, 0, -0.08))
        cl = HSPart(bone + 'Finger', 'iron', bone, tris=500)
        cl.add(sdf.Polyline([p0, p1, p2], [0.19, 0.16, 0.13]))
        cl.add(Cyl(p0 - np.cross(ii, (0, 0, 1)) * 0.17, p0 + np.cross(ii, (0, 0, 1)) * 0.17, 0.09, 0.02), 0.01)
        cl.add(Cyl(p1 - np.cross(ii, (0, 0, 1)) * 0.14, p1 + np.cross(ii, (0, 0, 1)) * 0.14, 0.075, 0.02), 0.01)
        out.append(cl)
        tp = HSPart(bone + 'Tip', 'steel', bone, tris=200)
        tp.add(sdf.Polyline([p2 - (p2 - p1) * 0.1, p3], [0.13, 0.03]))
        out.append(tp)
    return out


# ------------------------------------------------------------------ legs
def leg(side, s):
    out = []
    HP, KN, AN, TO = (M.side_pt(p, s) for p in (M.HIP, M.KNEE, M.ANKLE, M.TOE))
    o = V((s, 0, 0))
    u = (KN - HP) / np.linalg.norm(KN - HP)
    L = float(np.linalg.norm(KN - HP))
    th = HSPart(side + '_ThighCore', 'iron', side + '_Thigh', tris=600)
    th.add(sdf.RoundCone(HP, KN, 0.56, 0.48))
    th.add(sdf.Torus(HP + u * 0.6, u, 0.5, 0.07), 0.03)
    th.add(sdf.Sphere(KN, 0.55), 0.04)
    out.append(th)
    fo = V((s * 0.55, -1.0, 0.0))
    fo = ortho(fo / np.linalg.norm(fo), u)
    t1 = 0.86 if s < 0 else 0.56            # the iron side's plate was never finished
    tp = HSPart(side + '_ThighPlate', 'brass', side + '_Thigh', tris=1100)
    base = sdf.RoundCone(HP, KN, 0.86, 0.72)
    pl = Plate(base, 0.14, [keep(u, HP + u * L * 0.18), keep(-u, HP + u * L * t1), keep(fo, HP - fo * 0.36)])
    plate_part(tp, pl, spacing=0.22, seed=60 + s, inset=0.12)
    tp.sub(pl.line_groove(o, HP, w=0.026, depth=0.02, inset=0.2), 0.005)
    if s > 0:
        holes, _ = hs.project(base, [HP + u * L * t + fo * 0.7 + o * 0.0 for t in (0.66, 0.74, 0.82)])
        for hh in holes:
            th.sub(sdf.Sphere(hh, 0.035), 0.004)
    out.append(tp)
    u3 = (AN - KN) / np.linalg.norm(AN - KN)
    L3 = float(np.linalg.norm(AN - KN))
    kc = HSPart(side + '_KneeCop', 'brass', side + '_Shin', tris=800)
    base = sdf.Sphere(KN, 0.78)
    pl = Plate(base, 0.15, [keep((0, -1, 0), (0, KN[1] + 0.15, 0)), keep((0, 0, 1), (0, 0, KN[2] - 0.55)),
                            keep((0, 0, -1), (0, 0, KN[2] + 0.62))])
    plate_part(kc, pl, spacing=0.18, seed=62 + s, inset=0.1)
    kc.add(inter(shell(base, 0.36, 0.16), hs.Fn(lambda X, Y, Z: np.maximum(np.abs(X - KN[0]) - 0.07, Y - KN[1] + 0.2),
                                                base.lo, base.hi), 0.02), 0.03)
    out.append(kc)
    sc = HSPart(side + '_ShinCore', 'iron', side + '_Shin', tris=500)
    sc.add(sdf.RoundCone(KN, AN, 0.48, 0.55))
    sc.add(sdf.Sphere(AN, 0.52), 0.04)
    out.append(sc)
    gv = HSPart(side + '_Greave', 'brass', side + '_Shin', tris=1500)
    base = sdf.RoundCone(KN, AN, 0.68, 0.95)
    pl = Plate(base, 0.14, [keep(u3, KN + u3 * L3 * 0.3), keep(-u3, KN + u3 * (L3 - 0.04)), keep((0, -1, 0), (0, KN[1] + 0.5, 0))])
    plate_part(gv, pl, spacing=0.22, seed=64 + s, inset=0.12)
    gv.add(inter(shell(base, 0.32, 0.12), hs.Fn(lambda X, Y, Z: np.maximum(np.maximum(
        np.abs(X - (KN[0] + (Z - KN[2]) * u3[0] / u3[2])) - 0.06, Y - KN[1] + 0.1),
        np.maximum(KN[2] - 0.32 * L3 - Z, Z - (KN[2] - 0.2))), base.lo, base.hi), 0.02), 0.02)
    gv.sub(pl.line_groove(u3, KN + u3 * L3 * 0.62, w=0.03, depth=0.022, inset=0.12), 0.005)
    out.append(gv)
    ft = HSPart(side + '_FootBody', 'iron', side + '_Foot', tris=1400)
    ft.add(box((AN[0], AN[1] - 0.25, 0.28), (0.72, 1.12, 0.28), r=0.1))
    ft.add(box((AN[0], AN[1] - 0.12, 0.62), (0.56, 0.78, 0.32), r=0.15), 0.12)
    ft.add(inter(shell(sdf.Sphere(AN, 0.62), 0.12), keep((0, 0, -1), (0, 0, AN[2] + 0.12)), 0.02), 0.05)
    ft.add(box((AN[0], AN[1] + 0.82, 0.3), (0.42, 0.26, 0.26), r=0.08), 0.05)
    flange = box((AN[0], AN[1] - 0.25, 0.07), (1.06, 1.3, 0.07), r=0.03)
    ft.add(flange, 0.04)
    for dx, dy in M.CLAMP_BOLTS:
        ft.sub(Cyl((AN[0] + dx * s, AN[1] - 0.25 + dy, -0.1), (AN[0] + dx * s, AN[1] - 0.25 + dy, 0.3), 0.085, 0.01), 0.01)
    ft.rivets([(AN[0] + x, AN[1] - 0.25 + y, 0.14) for x in (-0.98, 0.98) for y in (-1.15, -0.3, 1.05)], r=0.04, on=flange)
    ft.sub(sdf.RoundBox((AN[0], AN[1], -0.6), (3.0, 3.0, 0.59), None, 0.0), 0.0)
    out.append(ft)
    tc = HSPart(side + '_Toes', 'brass', side + '_Foot', tris=1100)
    for k in (-1, 0, 1):
        c = V((AN[0] + 0.45 * k, AN[1] - 1.22, 0.3))
        t = box(c, (0.21, 0.4, 0.29), sdf.rot_matrix(0.22, 0, 0.06 * k), r=0.07)
        tc.add(t, 0.01)
        tc.add(box(c + (0, -0.02, 0.22), (0.05, 0.36, 0.08), sdf.rot_matrix(0.3, 0, 0.06 * k), r=0.03), 0.02)
        tc.rivets([c + (0.12, 0.22, 0.3), c + (-0.12, 0.22, 0.3), c + (0.12, -0.1, 0.36), c + (-0.12, -0.1, 0.36)],
                  r=0.035, on=t)
    ins = Plate(sdf.Ellipsoid((AN[0], AN[1] - 0.1, 0.4), (0.68, 0.95, 0.62)), 0.1,
                [keep((0, -1, 0), (0, AN[1] - 0.15, 0)), keep((0, 0, 1), (0, 0, 0.62))])
    plate_part(tc, ins, spacing=0.2, seed=66 + s, inset=0.1)
    tc.sub(sdf.RoundBox((AN[0], AN[1], -0.6), (3.0, 3.0, 0.59), None, 0.0), 0.0)
    out.append(tc)
    return out


# ------------------------------------------------------------------ moorings (cables are skinned: glow.py)
def clamp_parts():
    out = []
    for side, s in (('L', 1), ('R', -1)):
        AN = M.side_pt(M.ANKLE, s)
        for i, (dx, dy) in enumerate(M.CLAMP_BOLTS):
            p = V((AN[0] + dx * s, AN[1] - 0.25 + dy, 0.0))
            out_dir = V((np.sign(dx) * s, 0, 0))
            c = HSPart(f'Clamp{side}{i}', 'hazard', f'Clamp{side}{i}', tris=260, group='moorings', voxel=0.02)
            c.add(box(p + (0, 0, 0.2), (0.2, 0.26, 0.07), r=0.03))
            c.add(box(p + out_dir * 0.24 + (0, 0, 0.12), (0.08, 0.26, 0.14), r=0.03), 0.02)
            c.add(box(p + out_dir * 0.36 + (0, 0, 0.05), (0.14, 0.34, 0.05), r=0.02), 0.02)
            c.sub(Cyl(p - (0, 0, 0.2), p + (0, 0, 0.5), 0.075, 0.01), 0.01)
            out.append(c)
            b = HSPart(f'Bolt{side}{i}', 'steel', f'Bolt{side}{i}', tris=200, group='moorings', voxel=0.016)
            b.add(Cyl(p + (0, 0, -0.05), p + (0, 0, 0.52), 0.065, 0.015))
            hexa = None
            for k in range(3):
                bx = sdf.RoundBox(p + (0, 0, 0.36), (0.1, 0.058, 0.06), sdf.rot_matrix(0, 0, k * math.pi / 3), 0.01)
                hexa = bx if hexa is None else inter(hexa, bx, 0.0)
            b.add(hexa, 0.005)
            b.add(Cyl(p + (0, 0, 0.27), p + (0, 0, 0.29), 0.13, 0.008), 0.004)
            out.append(b)
    return out


def all_parts():
    parts = []
    parts += pelvis_parts()
    parts += spine_parts()
    parts += [p for p, _ in chest_plates()]
    parts += chest_core()
    parts += [hatch_leaf('L'), hatch_leaf('R')]
    parts += back_parts()
    parts += shoulder_mounts()
    parts += head_parts()
    parts += brass_arm()
    parts += iron_arm()
    parts += leg('L', 1)
    parts += leg('R', -1)
    parts += clamp_parts()
    return parts
