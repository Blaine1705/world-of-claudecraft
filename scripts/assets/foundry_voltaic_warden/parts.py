"""Every piece of the Voltaic Warden: hard-surface SDF shells (high) and their
decimated lows, plus the bmesh-built glass and glow pieces (no high: not baked).

A piece is built for the LEFT side (or the centre) and left pieces are mirrored onto
the right (bone L_ -> R_). Tags on every object: mat (bake kind), bone, binding
(rigid | cable), bones (cable chain), group.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

import frame as FR
import hs
import mesh_kit as K
import sdf
from sdf import Capsule, Ellipsoid, Polyline, RoundBox, RoundCone, Sphere, Torus, frame_from, rot_matrix, smax, smin

VOX = {'fine': 0.012, 'mid': 0.017, 'coarse': 0.022}
FAST = False
WORK = None
LOG = print


def vox(kind):
    v = VOX[kind]
    return v * 1.8 if FAST else v


def tag(objs, mat, bone, binding='rigid', group='body', bones=''):
    for o in objs:
        if o is None:
            continue
        o['mat'] = mat
        o['bone'] = bone
        o['binding'] = binding
        o['bones'] = bones
        o['group'] = group


TRI_SCALE = 0.5


def mesh_field(G, name, target):
    target = int(target * TRI_SCALE)
    lo = sdf.to_mesh(G, name, bpy, workdir=WORK)
    if G.apply_detail():
        hi = sdf.to_mesh(G, name + '_hi', bpy, workdir=WORK)
    else:
        hi = K.duplicate(lo, name + '_hi')
    for p in hi.data.polygons:
        p.use_smooth = True
    K.decimate(lo, target=target)
    for p in lo.data.polygons:
        p.use_smooth = True
    return hi, lo


def mirror_obj(obj, name):
    if obj is None:
        return None
    o2 = K.duplicate(obj, name)
    bm = bmesh.new()
    bm.from_mesh(o2.data)
    bm.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o2.data)
    bm.free()
    for k in obj.keys():
        o2[k] = obj[k]
    b = obj.get('bone', '')
    if b.startswith('L_'):
        o2['bone'] = 'R_' + b[2:]
    elif b.endswith('L') and b[:-1] + 'R' in FR.REST:
        o2['bone'] = b[:-1] + 'R'
    bl = obj.get('bones', '')
    if bl:
        o2['bones'] = ','.join(('R_' + x[2:]) if x.startswith('L_') else x for x in bl.split(','))
    return o2


def with_mirror(pairs, side=True):
    out = list(pairs)
    if side:
        for hi, lo in pairs:
            nm = lo.name
            nm2 = nm.replace('_L', '_R') if '_L' in nm else nm + '_R'
            out.append((mirror_obj(hi, nm2 + '_hi'), mirror_obj(lo, nm2)))
    return out


def piece(name, mat, bone, lo, hi, voxel, fill, target, group='body'):
    G = hs.part_field(lo, hi, voxel)
    fill(G)
    h, l = mesh_field(G, name, target)
    tag((h, l), mat, bone, group=group)
    LOG('piece', name, len(h.data.polygons), '->', K.triangles(l))
    return h, l


HEAD_PIVOT = np.array((0.0, -0.85, 7.92))
HEAD_SCALE = 1.15


def scale_obj(obj, pivot, s):
    me = obj.data
    P = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    P = (P.reshape(-1, 3) - pivot) * s + pivot
    me.vertices.foreach_set('co', P.ravel())
    me.update()


def bbox(c, r):
    c = np.asarray(c, float)
    r = np.asarray(r, float) if np.ndim(r) else np.array((r, r, r))
    return c - r, c + r


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ================================================================== torso
def build_pelvis():
    def core(G):
        G.add(hs.box_hull((0, 0.15, 4.2), (1.05, 0.78, 0.42), chamfer=0.2, k=0.05), k=0.0)
        for s in (1, -1):
            G.add(hs.Cyl((0.62 * s, 0.15, 3.95), (1.02 * s, 0.15, 3.95), 0.5, rr=0.05), k=0.04)
            G.line((0.8 * s, 0.15, 3.95), (1, 0, 0), (0.7 * s - 0.2, -0.5, 3.4), (0.9 * s + 0.2, 0.8, 4.5))
        G.line((0, 0.15, 4.25), (0, 0, 1), (-1.2, -0.7, 4.0), (1.2, 1.0, 4.5))
        G.bolts(hs.line_points((-0.8, -0.9, 4.0), (0.8, -0.9, 4.0), 5), r=0.045)

    def belt(G):
        G.add(hs.Band((0, 0.12, 4.6), 1.3, 0.98, 0.14, rr=0.03), k=0.0)
        G.add(hs.Band((0, 0.12, 4.6), 1.33, 1.01, 0.035, rr=0.015), k=0.01)
        for s in (1, -1):
            G.add(hs.box_hull((0.42 * s, -1.0, 4.6), (0.2, 0.08, 0.17), chamfer=0.05, k=0.02), k=0.02)
        pts = []
        for a in np.linspace(0, math.tau, 26, endpoint=False):
            pts.append((math.cos(a) * 1.4, 0.12 + math.sin(a) * 1.08, 4.6))
        G.rivets(pts, r=0.035)

    def fauld(G):
        ctr = np.array((0, -0.98, 3.95))
        R = rot_matrix(math.radians(-14), 0, 0)
        hull = hs.Hull([(ctr + R @ np.array(p), R @ np.array(n)) for p, n in (
            ((0, -0.08, 0), (0, -1, 0)), ((0, 0.08, 0), (0, 1, 0)), ((0, 0, 0.42), (0, 0, 1)),
            ((0.34, 0, 0), (1, 0, -0.18)), ((-0.34, 0, 0), (-1, 0, -0.18)),
            ((0, 0, -0.42), (0, 0, -1)), ((0.2, 0, -0.4), (0.7, 0, -0.7)), ((-0.2, 0, -0.4), (-0.7, 0, -0.7)))],
            k=0.035, lo=ctr - 0.7, hi=ctr + 0.7)
        G.add(hs.Inter([hull, Ellipsoid(ctr + (0, 0.5, 0), (0.6, 0.62, 0.9))], k=0.03), k=0.0)
        G.trim(ctr, R @ np.array((1, 0, 0)), ctr - 0.6, ctr + 0.6, height=0.025, width=0.03)
        G.rivets([ctr + R @ np.array((x, -0.1, z)) for x, z in ((-0.24, 0.3), (0.24, 0.3), (-0.2, -0.1), (0.2, -0.1))],
                 r=0.035)

    pairs = [piece('PelvisCore', 'iron', 'Hips', *bbox((0, 0.15, 4.1), (1.3, 1.0, 0.75)), vox('coarse'), core, 1600),
             piece('Belt', 'brass', 'Hips', *bbox((0, 0.12, 4.6), (1.5, 1.25, 0.4)), vox('mid'), belt, 1800)]
    return pairs


def build_waist():
    def col(G):
        G.add(hs.Cyl((0, 0.15, 4.55), (0, 0.15, 5.6), 0.48, rr=0.04), k=0.0)
        for z in (4.86, 5.08, 5.3):
            G.add(hs.Cyl((0, 0.15, z - 0.05), (0, 0.15, z + 0.05), 0.66, rr=0.025), k=0.02)
        G.line((0, 0.15, 4.97), (0, 0, 1), (-1, -1, 4.9), (1, 1, 5.05), depth=0.03, width=0.02)

    def gear(G):
        G.add(hs.Gear((0, 0.15, 4.75), (0, 0, 1), 0.82, 0.14, teeth=26, depth=0.08, holes=6, hub=0.5), k=0.0)
        G.add(hs.Gear((0, 0.15, 5.42), (0, 0, 1), 0.74, 0.12, teeth=22, depth=0.07, holes=6, hub=0.48), k=0.0)

    def lames(G):
        for i, z in enumerate((5.05, 5.32)):
            c = np.array((0, 0.05, z))
            band = hs.Band(c, 1.08 + 0.08 * i, 0.95 + 0.06 * i, 0.13, rr=0.03)
            G.add(hs.Inter([band, hs.Plane((0, -0.25, 0), (0, 1, 0))], k=0.05), k=0.0)
            G.rivets([(x, -0.95 - 0.06 * i, z + 0.04) for x in (-0.6, -0.2, 0.2, 0.6)], r=0.03)
        G.sub(hs.Cyl((0, 0.15, 4.5), (0, 0.15, 5.7), 0.62, rr=0.02), k=0.02)

    return [piece('WaistColumn', 'iron', 'Waist', *bbox((0, 0.15, 5.05), (0.9, 0.9, 0.7)), vox('mid'), col, 1400),
            piece('WaistGears', 'gear', 'Waist', *bbox((0, 0.15, 5.1), (0.95, 0.95, 0.55)), vox('fine'), gear, 2600),
            piece('WaistLames', 'brass', 'Waist', *bbox((0, -0.3, 5.18), (1.35, 0.9, 0.4)), vox('mid'), lames, 1200)]


CH_C = np.array((0, 0.05, 6.5))
CH_R = (2.15, 1.5, 1.35)


def chest_shell():
    hull = hs.Hull([((0, 0, 7.48), (0, 0, 1)), ((0, 0, 5.4), (0, 0, -1)), ((0, -1.42, 0), (0, -1, 0)),
                    ((0, 1.32, 0), (0, 1, 0)), ((0, -1.1, 7.25), (0, -0.55, 0.83)), ((0, 1.0, 7.3), (0, 0.5, 0.86)),
                    ((1.45, 0, 7.3), (0.62, 0, 0.78)), ((-1.45, 0, 7.3), (-0.62, 0, 0.78)),
                    ((0, -1.05, 5.6), (0, -0.6, -0.8))], k=0.09, lo=CH_C - 2.4, hi=CH_C + 2.4)
    return hs.Inter([Ellipsoid(CH_C, CH_R), hull], k=0.09)


def build_chest():
    def shell(G):
        G.add(chest_shell(), k=0.0)
        # the coil bay: a vertical cut in the breast where the glass storm coil sits
        G.sub(hs.Cyl(FR.COIL_C - (0, 0, 0.82), FR.COIL_C + (0, 0, 0.82), 0.78, rr=0.04), k=0.05)
        G.sub(hs.box_hull(FR.COIL_C + (0, -0.6, 0), (0.62, 0.6, 0.82), k=0.04), k=0.05)
        # the neck well
        G.sub(Ellipsoid((0, -0.5, 7.62), (0.8, 0.75, 0.3)), k=0.08)
        # panel seams, trims and rivets
        for s in (1, -1):
            G.line((0.92 * s, 0, 6.5), (1, 0.15 * s, 0), (0.6 * s - 0.4, -1.6, 5.4), (0.9 * s + 0.4, -0.2, 7.5))
            G.line((0, 0, 6.0), (0, 0, 1), (1.4 * s - 0.8, -1.2, 5.9), (2.3 * s + 0.0 * s, 1.4, 6.1))
            G.line((1.92 * s, 0, 6.5), (1, 0, 0), (1.85 * s - 0.2, -1.0, 5.4), (1.95 * s + 0.2, 1.1, 7.5))
            G.trim((1.02 * s, 0, 6.5), (1, 0.12 * s, 0), (0.7 * s - 0.4, -1.6, 5.5), (1.1 * s + 0.4, -0.3, 7.4),
                   height=0.022, width=0.035)
            pts = [(1.06 * s, -1.6, z) for z in np.linspace(5.65, 7.2, 7)]
            pts += [(x * s, -1.0, 7.38) for x in np.linspace(0.95, 1.85, 5)]
            pts += [(x * s, 1.2, 7.36) for x in np.linspace(0.3, 1.8, 6)]
            pts += [(2.15 * s, y, 6.5) for y in np.linspace(-0.7, 0.9, 6)]
            G.rivets(pts, r=0.04)
        # engraved storm sigil on the upper back (a bolt inside a ring)
        G.line((0, 1.4, 6.0), (0, 1, 0.0), (-0.1, 1.2, 5.5), (0.1, 1.6, 6.5), depth=0.0)

    def coil_frame(G):
        c = FR.COIL_C
        for z, h in ((-0.82, 0.24), (0.82, 0.24)):
            G.add(hs.Cyl(c + (0, 0, z - h / 2), c + (0, 0, z + h / 2), 0.86, rr=0.06), k=0.0)
            G.add(hs.Cyl(c + (0, 0, z - 0.2 * np.sign(z)), c + (0, 0, z + 0.05 * np.sign(z)), 0.68, rr=0.03), k=0.0)
            G.add(Torus(c + (0, 0, z), (0, 0, 1), 0.86, 0.05), k=0.015)
        for a in (-0.7, 0.7, math.pi - 0.0):
            p = c + np.array((math.sin(a) * 0.72, -math.cos(a) * 0.72, 0))
            G.add(Capsule(p - (0, 0, 0.75), p + (0, 0, 0.75), 0.05), k=0.02)
        top = [c + (math.sin(a) * 0.8, -math.cos(a) * 0.8, 0.96) for a in np.linspace(-2.2, 2.2, 9)]
        bot = [c + (math.sin(a) * 0.8, -math.cos(a) * 0.8, -0.96) for a in np.linspace(-2.2, 2.2, 9)]
        G.bolts(top + bot, r=0.045, h=0.035)

    def collar(G):
        outer = hs.Inter([Ellipsoid((0, -0.45, 7.45), (1.28, 1.2, 0.95)),
                          hs.Plane((0, -0.45, 7.75), (0, -0.55, 0.84)), hs.Plane((0, 0, 7.3), (0, 0, -1))], k=0.04)
        G.add(outer, k=0.0)
        G.sub(Ellipsoid((0, -0.62, 7.62), (0.98, 0.98, 1.0)), k=0.03)
        for s in (1, -1):
            G.add(hs.box_hull((0.62 * s, 0.32, 8.0), (0.38, 0.12, 0.08), rot=rot_matrix(math.radians(30), 0,
                              math.radians(-35 * s)), chamfer=0.03, k=0.02), k=0.02)
        G.trim((0, -0.45, 7.75), (0, -0.55, 0.84), (-1.3, -1.7, 7.3), (1.3, 0.8, 8.4), height=0.03, width=0.04)
        pts = [(math.sin(a) * 1.18, -0.45 + math.cos(a) * 1.1, 7.5 + 0.55 * (1 + math.cos(a)) / 2)
               for a in np.linspace(-2.2, 2.2, 13)]
        G.rivets(pts, r=0.038)

    def housing(G):
        c = np.array((0, 1.82, 6.68))
        G.add(hs.box_hull(c, (1.02, 0.6, 1.05), chamfer=0.2, k=0.05), k=0.0)
        G.add(hs.box_hull(c + (0, 0.0, 1.0), (0.8, 0.5, 0.12), chamfer=0.08, k=0.03), k=0.03)
        # the drone bay behind the hatches
        G.sub(hs.box_hull((0, 2.45, 7.08), (0.88, 0.22, 0.46), k=0.03), k=0.02)
        G.add(hs.box_hull((0, 2.36, 7.08), (0.04, 0.12, 0.46), k=0.02), k=0.01)
        for s in (1, -1):
            for z in np.linspace(6.0, 7.2, 7):            # side louvres
                G.line((1.0 * s, 1.82, z), (0, 0, 1), (0.9 * s - 0.3, 1.4, z - 0.05), (1.1 * s + 0.3, 2.25, z + 0.05),
                       depth=0.035, width=0.014)
            G.bolts([(0.96 * s, 2.42, z) for z in (5.75, 6.25, 7.62)], r=0.05)
        G.line((0, 2.42, 6.35), (0, 0, 1), (-1.1, 2.2, 6.3), (1.1, 2.6, 6.4))

    def pipes(G):
        for s in (1, -1):
            G.add(Polyline([(0.9 * s, 1.55, 6.05), (1.5 * s, 1.15, 5.95), (1.95 * s, 0.55, 5.85), (2.0 * s, -0.1, 5.75),
                            (1.85 * s, -0.55, 5.7)], 0.085), k=0.0)
            G.add(Polyline([(0.95 * s, 1.6, 6.35), (1.55 * s, 1.22, 6.3), (2.02 * s, 0.6, 6.22)], 0.07), k=0.0)
            for p in ((1.5 * s, 1.15, 5.95), (2.0 * s, -0.1, 5.75), (1.55 * s, 1.22, 6.3)):
                G.add(Sphere(p, 0.12), k=0.01)
            for p, q in (((1.85 * s, -0.55, 5.7), (1.7 * s, -0.75, 5.66)), ((0.9 * s, 1.55, 6.05), (0.7 * s, 1.7, 6.1))):
                G.add(hs.Cyl(p, q, 0.13, rr=0.02), k=0.01)

    def gauges(G):
        for s in (1, -1):
            p = np.array((0.95 * s, -1.28, 7.18))
            n = unit((0.35 * s, -0.8, 0.5))
            G.add(hs.Cyl(p - n * 0.1, p + n * 0.06, 0.17, rr=0.025), k=0.0)
            G.sub(hs.Cyl(p + n * 0.03, p + n * 0.2, 0.13, rr=0.01), k=0.008)

    pairs = [
        piece('ChestShell', 'brass', 'Chest', *bbox(CH_C, (2.35, 1.75, 1.3)), vox('coarse'), shell, 7000),
        piece('CoilFrame', 'brass', 'Chest', *bbox(FR.COIL_C, (1.0, 1.0, 1.2)), vox('mid'), coil_frame, 2600),
        piece('Collar', 'brass', 'Chest', *bbox((0, -0.45, 7.8), (1.45, 1.45, 0.7)), vox('mid'), collar, 2000),
        piece('Housing', 'iron', 'Chest', *bbox((0, 1.85, 6.85), (1.35, 0.85, 1.4)), vox('mid'), housing, 2600),
        piece('ChestPipes', 'copper', 'Chest', *bbox((0, 0.45, 6.05), (2.25, 1.35, 0.5)), vox('mid'), pipes, 2200),
        piece('Gauges', 'iron', 'Chest', *bbox((0, -1.3, 7.2), (1.25, 0.35, 0.35)), vox('fine'), gauges, 500),
    ]
    return pairs


def build_hatches():
    def hatch(s):
        def f(G):
            c = np.array((0.46 * s, 2.5, 7.08))
            G.add(hs.box_hull(c, (0.42, 0.06, 0.45), chamfer=0.04, k=0.025), k=0.0)
            G.add(hs.Cyl((0.06 * s, 2.58, 7.5), (0.86 * s, 2.58, 7.5), 0.07, rr=0.02), k=0.02)   # hinge barrel
            for z in (6.82, 7.08, 7.32):
                G.trim((0, 0, z), (0, 0, 1), c - (0.45, 0.2, 0.3), c + (0.45, 0.2, 0.3), height=0.02, width=0.025)
            G.rivets(hs.outline_points(c + (0, 0.07, 0), (1, 0, 0), (0, 0, 1), 0.36, 0.39, 14), r=0.028)
        return f
    return [piece('HatchL', 'brass', 'HatchL', *bbox((0.46, 2.52, 7.1), (0.6, 0.3, 0.6)), vox('mid'), hatch(1), 700),
            piece('HatchR', 'brass', 'HatchR', *bbox((-0.46, 2.52, 7.1), (0.6, 0.3, 0.6)), vox('mid'), hatch(-1),
                  700)]


def build_mast():
    top = FR.MAST_TOP[2]

    def mast(G):
        b = FR.MAST_BASE
        G.add(hs.Cyl(b - (0, 0, 0.25), b + (0, 0, 0.12), 0.46, rr=0.04), k=0.0)
        G.add(hs.Cyl(b + (0, 0, 0.1), b + (0, 0, 0.24), 0.34, rr=0.03), k=0.01)
        G.add(hs.Cyl(b, FR.MAST_TOP + (0, 0, 0.1), 0.15, rr=0.03), k=0.02)
        G.add(hs.Cyl((0, 1.95, 8.74), (0, 1.95, 9.36), 0.25, rr=0.03), k=0.02)       # the secondary's former
        for z in (8.72, 9.38):
            G.add(hs.Cyl((0, 1.95, z - 0.04), (0, 1.95, z + 0.04), 0.33, rr=0.02), k=0.01)
        G.bolts(hs.ring_points(b + (0, 0, 0.12), (0, 0, 1), 0.39, 8), r=0.035)

    def winding(G):
        for z in np.linspace(8.8, 9.3, 11):
            G.add(Torus((0, 1.95, z), (0, 0, 1), 0.265, 0.03), k=0.0)
        for s in (1, -1):                                 # the feed conductors up from the housing
            G.add(Polyline([(0.7 * s, 2.0, 7.72), (0.62 * s, 2.02, 8.3), (0.36 * s, 1.98, 8.62), (0.26 * s, 1.95, 8.8)],
                           0.05), k=0.0)
            G.add(hs.Cyl((0.7 * s, 2.0, 7.66), (0.7 * s, 2.0, 7.8), 0.1, rr=0.02), k=0.01)

    def discs(G):
        for i, z in enumerate((8.16, 8.36, 8.56, 9.5, 9.64)):
            r = (0.56, 0.52, 0.48, 0.42, 0.38)[i]
            G.add(hs.Cyl((0, 1.95, z - 0.035), (0, 1.95, z + 0.035), r, rr=0.03), k=0.0)
            G.add(RoundCone((0, 1.95, z - 0.03), (0, 1.95, z + 0.1), r * 0.55, 0.16), k=0.04)

    def crown(G):
        c = FR.CROWN_C
        G.add(Torus(c, (0, 0, 1), 0.74, 0.33), k=0.0)                 # the rounded top-load
        G.add(hs.Cyl(c - (0, 0, 0.3), c + (0, 0, 0.2), 0.26, rr=0.05), k=0.0)
        for a in np.linspace(0, math.tau, 6, endpoint=False):
            q = c + (math.cos(a) * 0.5, math.sin(a) * 0.5, -0.05)
            G.add(Capsule(c - (0, 0, 0.05), q, 0.05), k=0.02)
        G.line(c, (0, 0, 1), c - (1.2, 1.2, 0.05), c + (1.2, 1.2, 0.05), depth=0.02, width=0.015)   # the spun seam
        G.add(RoundCone(c + (0, 0, 0.15), c + (0, 0, 0.74), 0.1, 0.04), k=0.03)       # the discharge spire
        G.add(Torus(c + (0, 0, 0.42), (0, 0, 1), 0.2, 0.05), k=0.015)                 # its corona ring
        G.add(hs.Cyl(c + (0, 0, 0.18), c + (0, 0, 0.26), 0.16, rr=0.02), k=0.01)

    return [piece('Mast', 'brass', 'Mast', *bbox((0, 1.95, 8.65), (0.7, 0.7, 1.3)), vox('mid'), mast, 1300),
            piece('MastCoil', 'copper', 'Mast', *bbox((0, 1.98, 8.5), (0.95, 0.5, 1.0)), vox('fine'), winding, 2200),
            piece('MastDiscs', 'porcelain', 'Mast', *bbox((0, 1.95, 8.9), (0.7, 0.7, 0.95)), vox('fine'), discs, 3800),
            piece('Crown', 'copper', 'CrownTop', *bbox(FR.CROWN_C + (0, 0, 0.2), (1.2, 1.2, 0.72)), vox('mid'), crown,
                  3200)]


# ================================================================== head
def build_head():
    hc = np.array((0, -0.98, 8.32))

    def helm(G):
        hull = hs.Hull([((0, -1.74, 8.3), (0, -0.96, 0.28)), ((0, 0, 8.95), (0, 0, 1)), ((0, 0, 7.84), (0, 0, -1)),
                        ((0.7, 0, 0), (1, 0, 0)), ((-0.7, 0, 0), (-1, 0, 0)),
                        ((0.46, -1.7, 0), (0.8, -0.6, 0)), ((-0.46, -1.7, 0), (-0.8, -0.6, 0)),
                        ((0, -1.5, 8.86), (0, -0.6, 0.8)), ((0, -0.3, 8.8), (0, 0.6, 0.8)),
                        ((0.62, 0, 8.75), (0.7, 0, 0.7)), ((-0.62, 0, 8.75), (-0.7, 0, 0.7)),
                        ((0.6, -1.5, 7.95), (0.6, -0.5, -0.62)), ((-0.6, -1.5, 7.95), (-0.6, -0.5, -0.62))],
                       k=0.05, lo=hc - 1.0, hi=hc + 1.0)
        G.add(hs.Inter([Ellipsoid(hc, (0.8, 0.9, 0.74)), hull], k=0.04), k=0.0)
        # the heavy V brow over the visor (one piece, lower in the middle)
        for s in (1, -1):
            R = rot_matrix(math.radians(-12), math.radians(-10 * s), 0)
            G.add(hs.box_hull((0.27 * s, -1.74, 8.5), (0.36, 0.17, 0.095), rot=R, chamfer=0.05, k=0.03), k=0.03)
        # the visor: a deep V slot under the brow
        for s in (1, -1):
            R = rot_matrix(0, math.radians(-10 * s), 0)
            G.sub(hs.box_hull((0.27 * s, -1.86, 8.3), (0.34, 0.4, 0.075), rot=R, k=0.02), k=0.015)
        # the nasal ridge down the face and the crest ridge over the top
        G.trim((0, -1.0, 8.4), (1, 0, 0), (-0.1, -1.95, 8.55), (0.1, -0.1, 9.1), height=0.045, width=0.05)
        G.trim((0, -1.0, 8.4), (1, 0, 0), (-0.1, -2.0, 7.9), (0.1, -1.6, 8.22), height=0.05, width=0.05)
        # small side terminals
        for s in (1, -1):
            G.add(hs.Cyl((0.66 * s, -0.86, 8.42), (0.8 * s, -0.86, 8.42), 0.13, rr=0.03), k=0.02)
            G.add(hs.Cyl((0.78 * s, -0.86, 8.42), (0.86 * s, -0.86, 8.42), 0.075, rr=0.02), k=0.01)
            G.line((0.7 * s, -1.0, 8.3), (1, 0.0, 0.0), (0.6 * s - 0.15, -1.8, 7.8), (0.75 * s + 0.15, -0.2, 9.0))
        G.line((0, -0.6, 8.3), (0, 1, 0.15), (-0.8, -0.8, 7.8), (0.8, -0.4, 9.0))
        pts = [(x, -1.9, 8.62) for x in (-0.5, -0.34, 0.34, 0.5)]
        pts += [(0.7 * s, y, 8.62) for s in (1, -1) for y in np.linspace(-1.45, -0.55, 4)]
        pts += [(0.7 * s, y, 8.05) for s in (1, -1) for y in np.linspace(-1.35, -0.55, 3)]
        pts += [(x, -0.5, 8.75) for x in np.linspace(-0.45, 0.45, 5)]
        G.rivets(pts, r=0.036)

    def crest(G):
        G.add(hs.box_hull((0, -0.92, 8.86), (0.07, 0.52, 0.12), chamfer=0.03, k=0.02), k=0.0)
        G.add(hs.Cyl((0, -1.5, 9.02), (0, -0.32, 9.02), 0.05, rr=0.015), k=0.02)
        G.add(hs.Cyl((0, -1.52, 8.9), (0, -1.48, 9.06), 0.07, rr=0.02), k=0.02)
        G.add(hs.Cyl((0, -0.34, 8.9), (0, -0.3, 9.06), 0.07, rr=0.02), k=0.02)

    def crest_discs(G):
        for y in np.linspace(-1.32, -0.5, 4):
            G.add(hs.Cyl((0, y - 0.03, 9.02), (0, y + 0.03, 9.02), 0.19, rr=0.025), k=0.0)
            G.add(RoundCone((0, y - 0.02, 9.02), (0, y + 0.1, 9.02), 0.11, 0.07), k=0.03)

    def neck(G):
        a, b = np.array((0, -0.4, 7.35)), np.array((0, -0.88, 7.98))
        G.add(hs.Cyl(a, b, 0.34, rr=0.04), k=0.0)
        for t in (0.25, 0.5, 0.75):
            p = a + (b - a) * t
            d = unit(b - a)
            G.add(hs.Cyl(p - d * 0.04, p + d * 0.04, 0.44, rr=0.02), k=0.02)

    pairs = [piece('Helm', 'brass', 'Head', *bbox(hc + (0, -0.2, 0.05), (1.05, 1.0, 0.85)), vox('fine'), helm, 5200),
             piece('Crest', 'iron', 'Head', *bbox((0, -0.92, 8.95), (0.3, 0.75, 0.3)), vox('fine'), crest, 600),
             piece('CrestDiscs', 'porcelain', 'Head', *bbox((0, -0.92, 9.02), (0.3, 0.6, 0.3)), vox('fine'),
                   crest_discs, 1700),
             piece('Neck', 'iron', 'Neck', *bbox((0, -0.64, 7.66), (0.65, 0.7, 0.65)), vox('mid'), neck, 900)]

    def jaw(G):
        c = np.array((0, -1.42, 7.86))
        G.add(hs.box_hull(c, (0.46, 0.3, 0.2), chamfer=0.08, k=0.03), k=0.0)
        G.add(hs.box_hull((0, -1.0, 7.95), (0.4, 0.25, 0.12), chamfer=0.05, k=0.03), k=0.05)
        G.sub(hs.box_hull(c + (0, -0.26, 0.0), (0.36, 0.12, 0.13), k=0.02), k=0.015)
        for x in np.linspace(-0.3, 0.3, 7):
            G.add(hs.Cyl((x, -1.66, 7.7), (x, -1.66, 8.02), 0.03, rr=0.01), k=0.01)
        G.add(hs.box_hull((0, -1.7, 7.66), (0.42, 0.05, 0.04), chamfer=0.01, k=0.01), k=0.01)
        G.rivets([(x, -1.73, 7.95) for x in (-0.4, 0.4)] + [(x, -1.74, 7.73) for x in (-0.4, 0.4)], r=0.03)

    pairs.append(piece('Jaw', 'iron', 'Jaw', *bbox((0, -1.3, 7.85), (0.65, 0.65, 0.4)), vox('fine'), jaw, 1600))
    for h, l in pairs:
        if not h.name.startswith('Neck'):
            scale_obj(h, HEAD_PIVOT, HEAD_SCALE)
            scale_obj(l, HEAD_PIVOT, HEAD_SCALE)
    return pairs


# ================================================================== arms (left; mirrored)
def build_arm():
    S, E, W = FR.SHOULDER, FR.ELBOW, FR.WRIST
    ua = unit(E - S)
    fa = unit(W - E)

    def clav(G):
        G.add(hs.box_hull((1.95, 0.05, 7.12), (0.5, 0.4, 0.36), chamfer=0.12, k=0.04), k=0.0)
        G.add(hs.Cyl((1.5, 0.05, 7.12), (2.3, 0.05, 7.12), 0.3, rr=0.04), k=0.03)

    def pauldron(G):
        c = np.array((2.6, 0.05, 7.0))
        pf, pb = FR.PLATES[2], FR.PLATES[4]
        cap = hs.Inter([Ellipsoid(c, (1.28, 1.3, 1.18)), hs.Plane((3.0, 0, 7.02), (-0.36, 0, -1)),
                        hs.Plane((1.72, 0, 0), (-1, 0, 0)), hs.Plane((0, 0, 8.12), (0, 0, 1)),
                        hs.Plane(pf.s - pf.n * 0.005, pf.n), hs.Plane(pb.s - pb.n * 0.005, pb.n),
                        hs.Plane((3.58, 0.05, 7.6), (0.86, 0, 0.5))], k=0.03)
        G.add(cap, k=0.0)
        G.add(hs.box_hull((2.82, 0.05, 8.14), (0.72, 0.075, 0.1), chamfer=0.035, k=0.02), k=0.02)
        for i, (z0, grow) in enumerate(((6.98, 0.06), (6.62, 0.12))):
            cc = c + (0.06 * (i + 1), 0, -0.2 * (i + 1))
            lame = hs.Inter([Ellipsoid(cc, (1.28 + grow, 1.3 + grow * 0.6, 1.18)),
                             hs.Plane((0, 0, z0 + 0.06), (0, 0, 1)),
                             hs.Plane((3.0, 0, z0 - 0.3), (-0.36, 0, -1)),
                             hs.Plane((2.15 + 0.22 * i, 0, 0), (-1, 0, 0))], k=0.03)
            G.add(lame, k=0.012)
        rim = []
        for a in np.linspace(-2.4, 2.4, 13):
            rim.append(c + (1.22 * math.cos(a) * 0.95, 1.25 * math.sin(a), 0.1 + 0.3 * math.cos(a) * -0.3))
        G.rivets(rim, r=0.042)
        G.rivets([np.array((2.82, y, 8.24)) for y in (-0.05, 0.15)], r=0.04)

    def rod(G):
        b = np.array((2.42, 0.08, 8.12))
        G.add(hs.Cyl(b - (0, 0, 0.3), b + (0, 0, 0.1), 0.17, rr=0.03), k=0.0)
        G.add(hs.Cyl(b, b + (0, 0, 0.92), 0.065, rr=0.02), k=0.02)
        G.add(Sphere(b + (0, 0, 0.98), 0.12), k=0.02)
        G.add(RoundCone(b + (0, 0, 0.98), b + (0, 0, 1.2), 0.05, 0.015), k=0.02)

    def rod_discs(G):
        b = np.array((2.42, 0.08, 8.12))
        for i, z in enumerate((0.3, 0.52, 0.74)):
            r = 0.24 - 0.025 * i
            G.add(hs.Cyl(b + (0, 0, z - 0.03), b + (0, 0, z + 0.03), r, rr=0.025), k=0.0)
            G.add(RoundCone(b + (0, 0, z - 0.02), b + (0, 0, z + 0.08), r * 0.55, 0.08), k=0.03)

    def upper(G):
        G.add(Sphere(S, 0.52), k=0.0)
        G.add(hs.TaperPrism(S - ua * 0.1, E + ua * 0.05, 0.34, 0.3, sides=8, k=0.04), k=0.05)
        for t in (0.3, 0.55):
            p = S + (E - S) * t
            G.add(hs.Cyl(p - ua * 0.04, p + ua * 0.04, 0.4, rr=0.02), k=0.02)

    def bicep(G):
        a, b = S + ua * 0.45, E - ua * 0.3
        sh = hs.Inter([hs.TaperPrism(a, b, 0.47, 0.43, sides=8, k=0.05, phase=0.2),
                       hs.Plane(S + (0.08, 0, 0), (-1, -0.15, 0))], k=0.04)
        G.add(sh, k=0.0)
        G.trim((a + b) / 2, ua, (a + b) / 2 - 0.7, (a + b) / 2 + 0.7, height=0.025, width=0.035)
        G.rivets([a + (b - a) * t + unit((1, 0.3, 0.3)) * 0.47 for t in (0.08, 0.92)], r=0.04)

    def elbow(G):
        hinge = unit(np.cross(ua, fa))
        if hinge[0] < 0:
            hinge = -hinge
        G.add(hs.Cyl(E - hinge * 0.4, E + hinge * 0.4, 0.3, rr=0.04), k=0.0)

    def elbow_gear(G):
        hinge = unit(np.cross(ua, fa))
        if hinge[0] < 0:
            hinge = -hinge
        G.add(hs.Gear(E + hinge * 0.42, hinge, 0.44, 0.12, teeth=16, depth=0.09, holes=5, hub=0.15), k=0.0)
        G.add(hs.Gear(E - hinge * 0.4, hinge, 0.36, 0.1, teeth=14, depth=0.08, holes=4, hub=0.13), k=0.0)

    def gauntlet(G):
        a, b = E + fa * 0.32, W - fa * 0.02
        G.add(hs.TaperPrism(a, b, 0.5, 0.7, sides=8, k=0.05, phase=math.pi / 8), k=0.0)
        G.add(hs.Cyl(b - fa * 0.12, b + fa * 0.06, 0.74, rr=0.04), k=0.02)
        G.add(hs.Cyl(a - fa * 0.04, a + fa * 0.08, 0.55, rr=0.03), k=0.02)
        mid = a + (b - a) * 0.35
        G.line(mid, fa, mid - 1.0, mid + 1.0, depth=0.025, width=0.016)
        for i in range(8):
            th = math.tau * i / 8 + math.pi / 8 + math.pi / 8
            Fm = frame_from(fa)
            d = Fm[:, 0] * math.cos(th) + Fm[:, 1] * math.sin(th)
            G.rivets([a + (b - a) * t + d * (0.53 + 0.17 * t) for t in (0.08, 0.6)], r=0.035)
        G.bolts(hs.ring_points(b - fa * 0.03, fa, 0.75, 10), r=0.04, h=0.03)

    def coils(G):
        a, b = E + fa * 0.32, W - fa * 0.02
        for t in np.linspace(0.68, 0.86, 5):
            p = a + (b - a) * t
            G.add(Torus(p, fa, (0.5 + 0.2 * t) * 1.05 + 0.03, 0.042), k=0.0)

    HS = FR.HAND_S

    def hand(G):
        h = unit(FR.KNUCKLE - W)
        palm_n = np.array((-1.0, 0, 0))
        wv = unit(np.cross(h, palm_n))
        R = np.stack([unit(np.cross(wv, h)), wv, h], axis=1)
        c = (W + FR.KNUCKLE) / 2
        G.add(hs.box_hull(c, (0.36 * HS, 0.5 * HS, 0.46 * HS), rot=R, chamfer=0.14, k=0.04), k=0.0)
        G.add(Sphere(W, 0.44), k=0.06)
        G.add(hs.Cyl(W - h * 0.05, W + h * 0.2, 0.52, rr=0.04), k=0.03)         # the wrist collar

    def knuckles(G):
        h = unit(FR.KNUCKLE - W)
        palm_n = np.array((-1.0, 0, 0))
        wv = unit(np.cross(h, palm_n))
        back = -palm_n
        R = np.stack([back, wv, h], axis=1)
        c = (W + FR.KNUCKLE) / 2 + back * 0.33 * HS
        G.add(hs.box_hull(c, (0.1 * HS, 0.5 * HS, 0.44 * HS), rot=R, chamfer=0.06, k=0.03), k=0.0)
        G.add(hs.box_hull(FR.KNUCKLE + back * 0.2 * HS, (0.2 * HS, 0.52 * HS, 0.13 * HS), rot=R, chamfer=0.06, k=0.03),
              k=0.03)                                                          # the striking bar over the knuckles
        for o in np.linspace(-0.34, 0.34, 4) * HS:
            G.add(Sphere(FR.KNUCKLE + back * 0.3 * HS + wv * o + h * 0.04, 0.12 * HS), k=0.03)
        G.trim(c, wv, c - 1.0, c + 1.0, height=0.025, width=0.035)
        G.rivets([c + back * 0.1 * HS + wv * o + h * z for o in (-0.36 * HS, 0.36 * HS) for z in (-0.3, 0.1)], r=0.04)

    def fingers(seg):
        def f(G):
            h0 = FR.KNUCKLE if seg == 1 else FR.FING_MID
            h1 = FR.FING_MID if seg == 1 else FR.FING_TIP
            d = unit(h1 - h0)
            wv = unit(np.cross(unit(FR.KNUCKLE - W), np.array((-1.0, 0, 0))))
            for o in np.linspace(-0.37, 0.37, 4) * HS:
                a = h0 + wv * o
                b = h1 + wv * o + (d * 0.05 if seg == 2 else 0)
                R = np.stack([unit(np.cross(wv, d)), wv, d], axis=1)
                L = np.linalg.norm(b - a)
                G.add(hs.box_hull((a + b) / 2, (0.17 * HS, 0.118 * HS, L / 2 + 0.08), rot=R, chamfer=0.05, k=0.025),
                      k=0.0)
                if seg == 1:
                    G.add(Sphere(a, 0.16 * HS), k=0.02)
        return f

    def thumb(G):
        a, b = FR.THUMB_BASE, FR.THUMB_TIP
        d = unit(b - a)
        G.add(Sphere(a, 0.16 * HS), k=0.0)
        R = np.stack([unit(np.cross((0, 0, 1), d)), unit(np.cross(d, np.cross((0, 0, 1), d))), d], axis=1)
        G.add(hs.box_hull((a + b) / 2, (0.13 * HS, 0.13 * HS, np.linalg.norm(b - a) / 2 + 0.06), rot=R, chamfer=0.05,
                          k=0.025), k=0.03)

    pairs = [
        piece('Clavicle_L', 'iron', 'L_Clavicle', *bbox((1.9, 0.05, 7.12), (0.75, 0.6, 0.55)), vox('mid'), clav, 600),
        piece('Pauldron_L', 'brass', 'L_Pauldron', *bbox((2.75, 0.05, 7.4), (1.5, 1.55, 1.05)), vox('mid'),
              pauldron, 4200),
        piece('UpperArm_L', 'iron', 'L_UpperArm', *bbox((S + E) / 2, (0.75, 0.75, 1.25)), vox('mid'), upper, 1800),
        piece('Bicep_L', 'brass', 'L_UpperArm', *bbox((S + E) / 2, (0.75, 0.75, 1.1)), vox('mid'), bicep, 1500),
        piece('Elbow_L', 'iron', 'L_Forearm', *bbox(E, 0.6), vox('mid'), elbow, 500),
        piece('ElbowGear_L', 'gear', 'L_Forearm', *bbox(E, 0.75), vox('fine'), elbow_gear, 2400),
        piece('Gauntlet_L', 'brass', 'L_Forearm', *bbox((E + W) / 2, (0.95, 1.05, 1.15)), vox('mid'), gauntlet, 3800),
        piece('ArmCoil_L', 'copper', 'L_Forearm', *bbox(E + (W - E) * 0.8, (0.95, 0.95, 0.65)), vox('fine'), coils,
              2000),
        piece('Hand_L', 'iron', 'L_Hand', *bbox((W + FR.KNUCKLE) / 2, 1.05), vox('mid'), hand, 1100),
        piece('Knuckles_L', 'brass', 'L_Hand', *bbox((W + FR.KNUCKLE) / 2 + (0.3, 0, 0), 1.05), vox('mid'),
              knuckles, 1400),
        piece('Fingers1_L', 'iron', 'L_Fingers1', *bbox((FR.KNUCKLE + FR.FING_MID) / 2, 0.95), vox('mid'),
              fingers(1), 1200),
        piece('Fingers2_L', 'brass', 'L_Fingers2', *bbox((FR.FING_MID + FR.FING_TIP) / 2, 0.92), vox('mid'),
              fingers(2), 1000),
        piece('Thumb_L', 'brass', 'L_Thumb', *bbox((FR.THUMB_BASE + FR.THUMB_TIP) / 2, 0.6), vox('fine'), thumb,
              400),
    ]
    return with_mirror(pairs)


# ================================================================== legs (left; mirrored)
def build_leg():
    H, Kn, A = FR.HIP, FR.KNEE, FR.ANKLE
    td = unit(Kn - H)
    sd = unit(A - Kn)

    def thigh(G):
        G.add(Sphere(H, 0.5), k=0.0)
        G.add(hs.TaperPrism(H, Kn + td * 0.05, 0.38, 0.33, sides=8, k=0.04), k=0.05)

    def cuisse(G):
        a, b = H + td * 0.25, Kn - td * 0.3
        G.add(hs.Inter([hs.TaperPrism(a, b, 0.55, 0.47, sides=8, k=0.05, phase=math.pi / 8),
                        hs.Plane(H + (0, 0.12, 0), (0, 1, 0.1))], k=0.04), k=0.0)
        G.trim((a + b) / 2, (1, 0, 0), (a + b) / 2 - 0.8, (a + b) / 2 + 0.8, height=0.025, width=0.035)
        G.rivets([a + (b - a) * t + unit((0.2, -1, 0.3)) * 0.55 for t in (0.1, 0.5, 0.9)], r=0.038)

    def tasset(G):
        c = np.array((1.62, -0.05, 3.75))
        R = rot_matrix(0, math.radians(18), 0)
        G.add(hs.box_hull(c, (0.09, 0.5, 0.42), rot=R, chamfer=0.06, k=0.03), k=0.0)
        G.add(hs.box_hull(c + (0.06, 0, -0.38), (0.09, 0.46, 0.2), rot=R, chamfer=0.05, k=0.03), k=0.02)
        G.rivets([c + R @ np.array((0.1, y, 0.32)) for y in (-0.35, 0, 0.35)], r=0.035)

    def front_tasset(G):
        c = np.array((0.82, -0.88, 3.88))
        R = rot_matrix(math.radians(-16), 0, math.radians(14))
        G.add(hs.box_hull(c, (0.36, 0.08, 0.42), rot=R, chamfer=0.07, k=0.03), k=0.0)
        G.add(hs.box_hull(c + R @ np.array((0, -0.02, -0.4)), (0.32, 0.08, 0.16), rot=R, chamfer=0.05, k=0.03),
              k=0.02)
        G.trim(c, R @ np.array((1, 0, 0)), c - 0.6, c + 0.6, height=0.025, width=0.03)
        G.rivets([c + R @ np.array((x, -0.1, 0.3)) for x in (-0.25, 0.25)], r=0.035)

    def knee(G):
        G.add(hs.Cyl(Kn - (0.42, 0, 0), Kn + (0.42, 0, 0), 0.33, rr=0.04), k=0.0)
        G.add(hs.Inter([Ellipsoid(Kn + (0, -0.25, 0.02), (0.48, 0.36, 0.5)), hs.Plane(Kn + (0, -0.1, 0), (0, 1, 0))],
                       k=0.04), k=0.03)
        G.trim(Kn, (1, 0, 0), Kn - 0.7, Kn + 0.7, height=0.03, width=0.04)
        G.rivets([Kn + (x, -0.6, z) for x, z in ((-0.3, 0.2), (0.3, 0.2), (-0.3, -0.25), (0.3, -0.25))], r=0.035)

    def knee_gear(G):
        G.add(hs.Gear(Kn + (0.46, 0, 0), (1, 0, 0), 0.38, 0.11, teeth=14, depth=0.08, holes=5, hub=0.13), k=0.0)
        G.add(hs.Gear(Kn - (0.44, 0, 0), (1, 0, 0), 0.32, 0.1, teeth=12, depth=0.07, holes=4, hub=0.12), k=0.0)

    def greave(G):
        a, b = Kn + sd * 0.22, A - sd * 0.05
        G.add(hs.TaperPrism(a, b, 0.48, 0.62, sides=8, k=0.05, phase=math.pi / 8, up=(0, -1, 0)), k=0.0)
        G.add(hs.Cyl(b - sd * 0.1, b + sd * 0.05, 0.66, rr=0.04), k=0.02)
        G.trim((a + b) / 2, (1, 0, 0), (a + b) / 2 - 0.9, (a + b) / 2 + 0.9, height=0.035, width=0.04)
        mid = a + (b - a) * 0.45
        G.line(mid, sd, mid - 1, mid + 1)
        G.rivets([a + (b - a) * t + unit((0.25, -1, 0.25)) * (0.49 + 0.14 * t) + (x, 0, 0) for t in (0.15, 0.85)
                  for x in (-0.22, 0.22)], r=0.038)

    def foot(G):
        c = np.array((1.27, -0.35, 0.4))
        G.add(hs.box_hull(c, (0.6, 0.92, 0.32), chamfer=0.18, k=0.05), k=0.0)
        G.add(hs.box_hull(c + (0, 0.1, 0.25), (0.48, 0.6, 0.2), chamfer=0.12, k=0.04), k=0.04)
        G.add(Sphere(A, 0.42), k=0.04)
        G.trim(c, (0, 1, 0.2), c - 1, c + 1, height=0.025, width=0.035)
        G.rivets([c + (x, y, 0.33) for x in (-0.45, 0.45) for y in (-0.6, 0.0, 0.6)], r=0.035)

    def sole(G):
        c = np.array((1.27, -0.35, 0.07))
        G.add(hs.box_hull(c, (0.64, 0.96, 0.07), chamfer=0.05, k=0.02), k=0.0)
        G.add(hs.box_hull(c + (0, 0.72, 0.12), (0.5, 0.26, 0.14), chamfer=0.06, k=0.02), k=0.02)

    def toes(G):
        for dx in (-0.4, 0.0, 0.4):
            c = np.array((1.28 + dx, -1.4, 0.27))
            G.add(hs.box_hull(c, (0.17, 0.32, 0.22), chamfer=0.08, k=0.03), k=0.0)
            G.add(hs.box_hull(c + (0, -0.22, -0.08), (0.15, 0.16, 0.14), rot=rot_matrix(math.radians(-25), 0, 0),
                              chamfer=0.06, k=0.03), k=0.03)
            G.rivets([c + (0, -0.12, 0.22)], r=0.035)

    pairs = [
        piece('Thigh_L', 'iron', 'L_Thigh', *bbox((H + Kn) / 2, (0.75, 0.75, 1.15)), vox('mid'), thigh, 1400),
        piece('Cuisse_L', 'brass', 'L_Thigh', *bbox((H + Kn) / 2, (0.8, 0.8, 1.0)), vox('mid'), cuisse, 2000),
        piece('Tasset_L', 'brass', 'L_Thigh', *bbox((1.62, -0.05, 3.6), (0.5, 0.75, 0.8)), vox('mid'), tasset, 700),
        piece('FrontTasset_L', 'brass', 'L_Thigh', *bbox((0.82, -0.85, 3.85), (0.55, 0.45, 0.65)), vox('mid'),
              front_tasset, 600),
        piece('Knee_L', 'brass', 'L_Shin', *bbox(Kn, 0.75), vox('mid'), knee, 1600),
        piece('KneeGear_L', 'gear', 'L_Shin', *bbox(Kn, 0.7), vox('fine'), knee_gear, 2000),
        piece('Greave_L', 'brass', 'L_Shin', *bbox((Kn + A) / 2, (0.95, 0.95, 0.95)), vox('mid'), greave, 3000),
        piece('Foot_L', 'brass', 'L_Foot', *bbox((1.27, -0.3, 0.55), (0.9, 1.25, 0.65)), vox('mid'), foot, 2400),
        piece('Sole_L', 'iron', 'L_Foot', *bbox((1.27, -0.3, 0.12), (0.85, 1.2, 0.3)), vox('mid'), sole, 500),
        piece('Toes_L', 'brass', 'L_Toe', *bbox((1.28, -1.45, 0.27), (0.75, 0.6, 0.4)), vox('mid'), toes, 1400),
    ]
    return with_mirror(pairs)


# ================================================================== pistons (left; mirrored)
def build_pistons():
    pairs = []
    for nm, ba, A, bb, B in FR.PISTON_PAIRS:
        if not nm.startswith('L_'):
            continue
        d = unit(B - A)
        L = np.linalg.norm(B - A)

        def cyl(G, A=A, d=d, L=L):
            G.add(hs.Cyl(A + d * 0.08, A + d * L * 0.58, 0.13, rr=0.03), k=0.0)
            G.add(hs.Cyl(A + d * L * 0.52, A + d * L * 0.6, 0.155, rr=0.02), k=0.01)
            G.add(hs.Cyl(A + d * 0.06, A + d * 0.14, 0.155, rr=0.02), k=0.01)
            G.add(Sphere(A, 0.13), k=0.03)

        def rod(G, B=B, d=d, L=L):
            G.add(hs.Cyl(B - d * 0.05, B - d * L * 0.62, 0.065, rr=0.015), k=0.0)
            G.add(Sphere(B, 0.12), k=0.03)
            G.add(hs.Cyl(B - d * 0.1, B - d * 0.2, 0.1, rr=0.02), k=0.01)

        base = nm[2:]
        pairs.append(piece(f'{base}Cyl_L', 'iron', nm + 'Cyl', *bbox(A + d * L * 0.3, L * 0.45 + 0.3), vox('fine'), cyl,
                           500))
        pairs.append(piece(f'{base}Rod_L', 'steel', nm + 'Rod', *bbox(B - d * L * 0.3, L * 0.45 + 0.3), vox('fine'), rod,
                           300))
    return with_mirror(pairs)


# ================================================================== reversible plates
def plate_local(spec, P):
    rel = P - spec.c
    return rel @ spec.u, rel @ spec.a, rel @ spec.n


def seg_dist2(px, py, pts):
    out = None
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.sqrt((px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2)
        out = d if out is None else np.minimum(out, d)
    return out


BOLT = [(0.18, 0.78), (-0.2, 0.06), (0.16, 0.1), (-0.14, -0.78)]          # the lightning glyph (un, vn)
GROUND = [((0.0, 0.62), (0.0, 0.12)), ((-0.42, 0.12), (0.42, 0.12)), ((-0.28, -0.12), (0.28, -0.12)),
          ((-0.14, -0.36), (0.14, -0.36))]                               # the earth-ground emblem


def plate_masks(spec, lu, lv):
    """Per-point pattern masks in the plate's own coordinates (soft, 0..1)."""
    un, vn = lu / spec.hw, lv / spec.hh
    ch = 0.3
    edge = np.maximum(np.maximum(np.abs(un), np.abs(vn)), (np.abs(un) + np.abs(vn)) / (2 - ch))
    rim = np.clip((edge - 0.905) / 0.025, 0, 1)
    sx = spec.hw
    bolt = seg_dist2(lu, lv, [(x * sx, y * spec.hh) for x, y in BOLT])
    bolt_m = np.clip((0.085 - bolt) / 0.015, 0, 1)
    g = None
    for (a, b) in GROUND:
        d = seg_dist2(lu, lv, [(a[0] * sx, a[1] * spec.hh * 0.75), (b[0] * sx, b[1] * spec.hh * 0.75)])
        g = d if g is None else np.minimum(g, d)
    ground_m = np.clip((0.06 - g) / 0.012, 0, 1)
    return un, vn, edge, rim, bolt_m, ground_m


class PlateShape(sdf.Prim):
    def __init__(self, spec, detail=True):
        self.s = spec
        self.detail = detail
        e = max(spec.hw, spec.hh) + 0.2
        self.lo, self.hi = spec.c - e, spec.c + e
        self.bone = None

    def dist(self, X, Y, Z):
        s = self.s
        P = np.stack([X, Y, Z], axis=-1)
        lu, lv, lw = plate_local(s, P)
        un, vn, edge, rim, bolt_m, ground_m = plate_masks(s, lu, lv)
        d2 = (edge - 1.0) * min(s.hw, s.hh)
        r2 = np.clip(un * un + vn * vn, 0, 2)
        t = s.thick * (1.0 - 0.38 * r2)
        t = t + 0.024 * rim
        # copper face: hammered field, raised ground emblem, rivets on the rim
        tc = t + 0.016 * ground_m
        # charged face: recessed glass field, raised bolt, corner studs
        inner = np.clip((0.86 - edge) / 0.03, 0, 1)
        tb = t - 0.022 * inner + 0.03 * bolt_m * inner
        for cx, cy in ((0.68, 0.74), (-0.68, 0.74), (0.68, -0.74), (-0.68, -0.74)) if self.detail else ():
            dd = np.sqrt((un - cx) ** 2 * s.hw ** 2 + (vn - cy) ** 2 * s.hh ** 2)
            tb = tb + 0.035 * np.clip(1 - (dd / 0.055) ** 2, 0, 1) ** 0.5
        for i in range(12 if self.detail else 0):
            a = math.tau * i / 12 + 0.26
            cx, cy = 0.9 * math.cos(a), 0.9 * math.sin(a)
            m = max(abs(cx), abs(cy), (abs(cx) + abs(cy)) / 1.7)
            cx, cy = cx / m * 0.8, cy / m * 0.8
            dd = np.sqrt((un - cx) ** 2 * s.hw ** 2 + (vn - cy) ** 2 * s.hh ** 2)
            tc = tc + 0.03 * np.clip(1 - (dd / 0.032) ** 2, 0, 1) ** 0.5
        dw = np.where(lw > 0, lw - tc, -lw - tb)
        return smax(d2, dw, 0.018)


def build_plates():
    pairs = []
    for spec in FR.PLATES:
        if spec.name.endswith('R'):
            continue
        e = max(spec.hw, spec.hh) + 0.25
        G = hs.part_field(spec.c - e, spec.c + e, vox('fine') * 0.9)
        G.add(PlateShape(spec, detail=False), k=0.0)
        _, lo = mesh_field(G, 'Plate' + spec.name, 1300)
        bpy.data.objects.remove(_, do_unlink=True)
        G = hs.part_field(spec.c - e, spec.c + e, vox('fine') * 0.9)
        G.add(PlateShape(spec), k=0.0)
        hi = sdf.to_mesh(G, 'Plate' + spec.name + '_hi', bpy, workdir=WORK)
        for pl in hi.data.polygons:
            pl.use_smooth = True
        add_plate_attr(hi, spec)
        tag((hi, lo), 'plate', 'Plate_' + spec.name)

        def yoke(G, s=spec):
            for sg in (1, -1):
                cap = s.c + s.a * sg * (s.hh + 0.07)
                G.add(hs.Cyl(cap - s.a * 0.09 * sg, cap + s.a * 0.06 * sg, 0.085, rr=0.02), k=0.0)
                G.add(hs.box_hull(cap - s.n * 0.42 + s.a * sg * 0.01, (0.06, 0.06, 0.45),
                                  rot=np.stack([s.u, s.a, s.n], axis=1), chamfer=0.02, k=0.015), k=0.02)
        e2 = max(spec.hw, spec.hh) + 0.4
        G2 = hs.part_field(spec.c - spec.n * 0.45 - e2, spec.c - spec.n * 0.45 + e2, vox('fine'))
        yoke(G2)
        yh, yl = mesh_field(G2, 'Yoke' + spec.name, 400)
        tag((yh, yl), 'iron', 'PlateMount_' + spec.name)
        pairs += [(hi, lo), (yh, yl)]
        LOG('plate', spec.name, len(hi.data.polygons))
    out = list(pairs)
    for hi, lo in pairs:
        nm = lo.name[:-1] + 'R'
        h2, l2 = mirror_obj(hi, nm + '_hi'), mirror_obj(lo, nm)
        b = hi['bone']
        h2['bone'] = l2['bone'] = b[:-1] + 'R'
        out.append((h2, l2))
    return out


def add_plate_attr(obj, spec):
    me = obj.data
    P = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    P = P.reshape(-1, 3)
    lu, lv, lw = plate_local(spec, P)
    un, vn, edge, rim, bolt_m, ground_m = plate_masks(spec, lu, lv)
    side = np.clip(lw / 0.03, -1, 1) * 0.5 + 0.5
    inner = np.clip((0.86 - edge) / 0.03, 0, 1)
    a = me.color_attributes.new('PL', 'FLOAT_COLOR', 'POINT')
    b = me.color_attributes.new('PM', 'FLOAT_COLOR', 'POINT')
    A = np.stack([un, vn, side, np.ones_like(un)], axis=1).astype(np.float32)
    B = np.stack([bolt_m, ground_m, rim, inner], axis=1).astype(np.float32)
    a.data.foreach_set('color', A.ravel())
    b.data.foreach_set('color', B.ravel())


# ================================================================== cables (skinned)
def build_cables():
    pairs = []

    def arm_cable(G):
        pts = [(0.98, 1.95, 6.15), (1.55, 1.75, 6.5), (2.2, 1.25, 6.75), (2.85, 0.95, 6.55), (3.2, 0.95, 5.95),
               (3.3, 0.85, 5.35), (3.32, 0.62, 4.95)]
        G.add(Polyline(pts, 0.13), k=0.0)
        for a, b in zip(pts, pts[1:]):
            a, b = np.asarray(a, float), np.asarray(b, float)
            for t in np.linspace(0.15, 0.85, 4):
                q = a + (b - a) * t
                d = unit(b - a)
                G.add(hs.Cyl(q - d * 0.035, q + d * 0.035, 0.155, rr=0.015), k=0.01)
    h, l = piece('ArmCable_L', 'rubber', 'Chest', *bbox((2.15, 1.3, 5.9), (1.5, 1.05, 1.3)), vox('mid'), arm_cable,
                 1400)
    tag((h, l), 'rubber', 'Chest', binding='cable', bones='Chest,L_UpperArm,L_Forearm')
    pairs.append((h, l))

    def neck_cable(G):
        for s in (1, -1):
            G.add(Polyline([(0.42 * s, -0.05, 7.42), (0.48 * s, -0.25, 7.85), (0.36 * s, -0.5, 8.12)], 0.065), k=0.0)
    h, l = piece('NeckCables', 'rubber', 'Chest', *bbox((0, -0.3, 7.8), (0.75, 0.6, 0.6)), vox('mid'), neck_cable, 600)
    tag((h, l), 'rubber', 'Chest', binding='cable', bones='Chest,Neck,Head')
    pairs.append((h, l))
    out = list(pairs)
    hi, lo = pairs[0]
    out.append((mirror_obj(hi, 'ArmCable_R_hi'), mirror_obj(lo, 'ArmCable_R')))
    return out


# ================================================================== coil internals
def build_coil():
    c = FR.COIL_C

    def winding(G):
        pts = []
        n = 7 * 24
        for i in range(n + 1):
            t = i / n
            a = t * 7 * math.tau
            pts.append(c + (math.cos(a) * 0.38, math.sin(a) * 0.38, -0.6 + 1.2 * t))
        G.add(Polyline(pts, 0.045), k=0.0)
        for z in (-0.64, 0.64):
            G.add(Torus(c + (0, 0, z), (0, 0, 1), 0.38, 0.06), k=0.01)

    def electrode(G):
        G.add(hs.Cyl(c - (0, 0, 0.72), c + (0, 0, 0.72), 0.1, rr=0.02), k=0.0)
        for z in (-0.52, 0.52):
            G.add(hs.Cyl(c + (0, 0, z - 0.04), c + (0, 0, z + 0.04), 0.2, rr=0.02), k=0.01)

    return [piece('CoilWinding', 'copper', 'Chest', *bbox(c, (0.55, 0.55, 0.8)), vox('fine'), winding, 3000),
            piece('CoilElectrode', 'porcelain', 'CoilCore', *bbox(c, (0.35, 0.35, 0.82)), vox('fine'), electrode,
                  500)]


# ================================================================== glass + glow (not baked)
def glass_and_glow(seed=11):
    rng = np.random.default_rng(seed)
    out = []
    c = FR.COIL_C
    g = K.Part('CoilGlass', 'glass', 'Chest')
    pts = [c - (0, 0, 0.74), c + (0, 0, 0.74)]
    g.tube(pts, [0.63, 0.63], sides=40, cap=True)
    out.append(g.to_object())
    # lightning arcs inside the coil (ride CoilCore, which spins)
    arcs = K.Part('CoilArcs', 'glow', 'CoilCore')
    for k in range(7):
        a0 = rng.uniform(0, math.tau)
        z0 = rng.uniform(-0.5, 0.5)
        n = 7
        pts, rad = [], []
        for i in range(n + 1):
            t = i / n
            r = 0.11 + 0.24 * t
            a = a0 + t * rng.uniform(-0.6, 0.6)
            z = z0 + rng.uniform(-0.08, 0.08) + t * rng.uniform(-0.15, 0.15)
            j = 0.0 if i in (0, n) else 0.05
            pts.append(c + (math.cos(a) * r + rng.uniform(-j, j), math.sin(a) * r + rng.uniform(-j, j), z))
            rad.append(0.016 * (1.2 - 0.6 * t))
        arcs.tube(pts, rad, sides=5)
    zs = np.linspace(-0.62, 0.62, 14)
    pts = [c + (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), z) for z in zs]
    arcs.tube(pts, [0.02] * len(pts), sides=5)
    out.append(arcs.to_object())
    core = K.Part('CoilCoreGlow', 'glow', 'CoilCore')
    core.tube([c - (0, 0, 0.45), c + (0, 0, 0.45)], [0.115, 0.115], sides=14)
    out.append(core.to_object())
    # the visor slit (a V of light deep in the visor)
    vis = K.Part('VisorGlow', 'glow', 'Head')
    for s in (1, -1):
        R = rot_matrix(0, math.radians(-11 * s), 0)
        vis.box((0.2 * s, -1.65, 8.3), (0.222, 0.03, 0.03), rot=R, bevel=0.01)
    vo = vis.to_object()
    scale_obj(vo, HEAD_PIVOT, HEAD_SCALE)
    out.append(vo)
    # the crown spire's spark node and the palm emitters
    sp = K.Part('CrownGlow', 'glow', 'CrownTop')
    sp.sphere(FR.CROWN_C + (0, 0, 0.8), (0.1, 0.1, 0.1), seg=12, rings=8)
    out.append(sp.to_object())
    for s, b in ((1, 'L_Hand'), (-1, 'R_Hand')):
        pm = K.Part(f'PalmGlow_{b[0]}', 'glow', b)
        h = (FR.KNUCKLE + FR.WRIST) / 2
        p = np.array((h[0] * s, h[1], h[2])) + np.array((-0.36 * FR.HAND_S * s, 0, 0))
        pm.sphere(p, (0.03, 0.17, 0.17), seg=14, rings=8)
        out.append(pm.to_object())
    for o in out:
        o['group'] = 'body'
        o['bones'] = ''
    return out


def build_all(fast=False, workdir=None, log=print):
    global FAST, WORK, LOG
    FAST, WORK, LOG = fast, workdir, log
    pairs = []
    for fn in (build_pelvis, build_waist, build_chest, build_hatches, build_mast, build_head, build_arm, build_leg,
               build_pistons, build_plates, build_cables, build_coil):
        got = fn()
        pairs += got
        log(fn.__name__, len(got))
    extra = glass_and_glow()
    return pairs, extra
