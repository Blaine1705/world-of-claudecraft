"""The Prime Draft's lightning (emissive, not baked), its cables, and its pistons.

  * glow parts: the glass eye's lens, the lightning conduits laid along the plates
    on standoff brackets, and the arcs crackling in the empty socket (on CoreArc,
    scaled to nothing while the hatch is shut);
  * cables: two heavy cables from the plugs in its back to the gantry, skinned to
    their chain bones (moorings group), banded in brass, a plug at the body end and a
    terminal clamp at the gantry end;
  * pistons: a cylinder (iron, with an eye lug and a gland collar) and a rod (steel)
    per ram, sized from the strokes measured over every clip so the rod never leaves
    the cylinder and never pokes out of its base.
"""
import math

import numpy as np

import hs
import mech as M
import mesh_kit as K
import sdf
from hs import Cyl, HSPart

V = np.array


def _tube_on(surface, raw, lift, step=0.08):
    """A smooth path over a surface: resample the raw polyline, project it onto the
    surface and lift it along the normal."""
    pts = hs.polyline_pts(raw, step)
    P, N = hs.project(surface, pts)
    # smooth the path a little (projection can kink at plate edges)
    for _ in range(3):
        P[1:-1] = (P[:-2] + 2 * P[1:-1] + P[2:]) / 4
    P, N = hs.project(surface, P)
    return P + N * lift, P, N


def conduit_routes():
    """(name, bone, surface prim (top of the plate), raw polyline, lift)."""
    out = []
    for side, s in (('L', 1), ('R', -1)):
        pec = hs.offset(sdf.Ellipsoid((0, 0.3, 7.7), (2.06, 1.98, 1.62)), 0.065)
        out.append((f'ConduitPec{side}', 'Chest', pec,
                    [(s * 1.03, -1.72, 8.2), (s * 1.2, -1.7, 8.55), (s * 1.55, -1.5, 8.8), (s * 1.92, -0.92, 8.9)], 0.1))
        ab = hs.offset(sdf.Ellipsoid((0, 0.3, 7.35), (1.99, 1.93, 1.92)), 0.06)
        out.append((f'ConduitAbs{side}', 'Chest', ab,
                    [(s * 1.06, -1.6, 7.25), (s * 1.4, -1.38, 7.1), (s * 1.75, -0.85, 7.0)], 0.1))
    # brass gauntlet: down its outer face, over the layered bands
    EL, WR = M.mirror(M.ELBOW), M.mirror(M.WRIST)
    u2 = (WR - EL) / np.linalg.norm(WR - EL)
    L2 = float(np.linalg.norm(WR - EL))
    o = hs.frame_axes(u2)[:, 0]
    if o[0] > 0:
        o = -o
    o = (o + V((0, -0.35, 0))) / np.linalg.norm(o + V((0, -0.35, 0)))
    g = hs.offset(sdf.RoundCone(EL, WR, 0.6, 0.8), 0.15)
    out.append(('ConduitGauntlet', 'R_Forearm', g, [EL + u2 * L2 * t + o for t in (0.12, 0.4, 0.68, 0.93)], 0.07))
    for side, s in (('L', 1), ('R', -1)):
        HP, KN, AN = (M.side_pt(p, s) for p in (M.HIP, M.KNEE, M.ANKLE))
        u = (KN - HP) / np.linalg.norm(KN - HP)
        L = float(np.linalg.norm(KN - HP))
        fo = V((s * 0.9, -0.6, 0.0))
        t1 = 0.84 if s < 0 else 0.55
        th = hs.offset(sdf.RoundCone(HP, KN, 0.86, 0.72), 0.07)
        out.append((f'ConduitThigh{side}', f'{side}_Thigh', th, [HP + u * L * t + fo for t in (0.22, 0.5, t1)], 0.1))
        u3 = (AN - KN) / np.linalg.norm(AN - KN)
        L3 = float(np.linalg.norm(AN - KN))
        gv = hs.offset(sdf.RoundCone(KN, AN, 0.68, 0.95), 0.07)
        out.append((f'ConduitGreave{side}', f'{side}_Shin', gv,
                    [KN + u3 * L3 * t + V((s * 1.0, -0.4, 0)) for t in (0.36, 0.6, 0.86)], 0.1))
    return out


def glow_parts(bpy):
    """Emissive meshes (mesh_kit Parts) and the iron standoff brackets of the conduits."""
    lows = []
    brackets = []
    E = M.EYE
    eye = K.Part('EyeLens', 'glow', 'EyeGlow')
    eye.sphere(E + V((0, -0.0, 0)), (0.165, 0.075, 0.165), seg=20, rings=12, cut=((0, -1, 0), -0.05))
    eye.sphere(E + V((0, 0.02, 0)), (0.12, 0.12, 0.12), seg=14, rings=8)
    lows.append(eye.to_object())
    for name, bone, surf, raw, lift in conduit_routes():
        P, S, N = _tube_on(surf, raw, lift)
        c = K.Part(name, 'glow', bone)
        c.tube(P[::2] if len(P) % 2 else list(P[::2]) + [P[-1]], 0.042, sides=6)
        lows.append(c.to_object())
        br = HSPart(name + 'Clips', 'iron', bone, tris=60 * max(2, len(P) // 6), voxel=0.014)
        L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        for d in np.arange(0.18, L[-1] - 0.1, 0.42):
            i = int(np.searchsorted(L, d))
            p, s_, n = P[i], S[i], N[i]
            tng = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
            tng /= np.linalg.norm(tng)
            R = np.stack([np.cross(n, tng), tng, n], axis=1)
            h = float(np.dot(p - s_, n))
            br.add(hs.box(s_ + n * (h * 0.5), (0.05, 0.045, h * 0.5 + 0.02), R, r=0.012), 0.005)
            br.add(sdf.Torus(p, tng, 0.05, 0.016), 0.005)
        brackets.append(br)
    lows.append(core_arcs())
    return lows, brackets


def core_arcs(seed=11):
    """Jagged arcs inside the empty socket: from each copper contact to the
    centre and between neighbouring contacts, plus a crawling ring on the cradle."""
    rng = np.random.default_rng(seed)
    p = K.Part('CoreArcs', 'glow', 'CoreArc')
    C = V((0, -0.9, 7.58))
    tips = []
    for k in range(4):
        t = math.pi / 4 + k * math.pi / 2
        d = V((math.cos(t), 0, math.sin(t)))
        tips.append(V((0, -0.82, 7.58)) + d * 0.2)

    def bolt(a, b, n, jag, r):
        pts = [a + (b - a) * (i / n) for i in range(n + 1)]
        for i in range(1, n):
            pts[i] = pts[i] + rng.normal(0, jag, 3) * V((1, 0.5, 1))
        p.tube(pts, [r * (1 - 0.5 * i / n) for i in range(n + 1)], sides=5, cap=True)
        return pts

    for k, tp in enumerate(tips):
        pts = bolt(tp, C + rng.normal(0, 0.02, 3), 7, 0.045, 0.045)
        nb = tips[(k + 1) % 4]
        bolt(tp, nb, 9, 0.06, 0.03)
        mid = pts[3]
        bolt(mid, mid + rng.normal(0, 0.2, 3) + V((0, -0.12, 0)), 4, 0.04, 0.02)
        wall = V((0.66 * (1 if k in (0, 3) else -1), -1.0, 7.58 + (0.5 if k < 2 else -0.5)))
        bolt(tp, wall + rng.normal(0, 0.05, 3), 8, 0.06, 0.028)
    ring = [V((math.cos(a) * 0.42, -0.5, 7.58 + math.sin(a) * 0.42)) for a in np.linspace(0, 2 * math.pi, 40)]
    ring = [q + rng.normal(0, 0.012, 3) for q in ring]
    p.tube(ring, 0.02, sides=4, closed=True)
    return p.to_object()


# ------------------------------------------------------------------ cables
def _spline(pts, per=8):
    P = [V(p, float) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            u = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    out.append(P[-2])
    return np.array(out)


def cable_parts(bpy):
    """Per side: the cable (skinned along its chain), brass bands, the plug and the
    gantry terminal. Returns low objects; each carries 'binding' 'cable' plus the
    per-vertex chain parameter in a custom attribute 'chain_u'."""
    out = []
    for side, s in (('L', 1), ('R', -1)):
        heads = [M.REST[f'Cable{side}{i}'][0] for i in range(M.CABLE_SEGS)] + [M.REST[f'Cable{side}{M.CABLE_SEGS - 1}'][1]]
        per = 6
        P = _spline(heads, per)
        u = np.arange(len(P)) / per          # chain parameter: bone index + fraction
        c = K.Part(f'Cable{side}', 'cable', None, binding='cable')
        c.tube(P, 0.12, sides=8, cap=True)
        o = c.to_object()
        o['chain'] = side
        out.append(o)
        b = K.Part(f'CableBands{side}', 'brass', None, binding='cable')
        L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        for d in np.arange(0.9, L[-1] - 0.5, 0.95):
            i = int(np.searchsorted(L, d))
            tng = P[min(i + 1, len(P) - 1)] - P[i - 1]
            tng /= np.linalg.norm(tng)
            b.tube([P[i] - tng * 0.08, P[i] + tng * 0.08], 0.145, sides=8)
        ob = b.to_object()
        ob['chain'] = side
        out.append(ob)
        # the plug (rides the last cable bone) and the gantry terminal (the first)
        last = f'Cable{side}{M.CABLE_SEGS - 1}'
        pe = M.side_pt(M.PLUG, s)
        tng = (P[-1] - P[-4]) / np.linalg.norm(P[-1] - P[-4])
        pl = HSPart(f'Plug{side}', 'brass', last, tris=500, group='moorings', voxel=0.016)
        pl.add(Cyl(pe - tng * 0.62, pe - tng * 0.05, 0.2, 0.03))
        pl.add(Cyl(pe - tng * 0.12, pe + tng * 0.08, 0.14, 0.02), 0.01)
        pl.add(Cyl(pe - tng * 0.75, pe - tng * 0.55, 0.16, 0.02), 0.02)
        for k in range(4):
            a = k * math.pi / 2
            F = hs.frame_axes(tng)
            d = F[:, 0] * math.cos(a) + F[:, 1] * math.sin(a)
            pl.add(hs.box(pe - tng * 0.35 + d * 0.21, (0.04, 0.04, 0.22), hs.frame_axes(tng), r=0.015), 0.01)
        out.append(pl)
        pc = HSPart(f'PlugCeramic{side}', 'ceramic', last, tris=300, group='moorings', voxel=0.016)
        for k in range(3):
            q = pe - tng * (0.22 + 0.09 * k)
            pc.add(Cyl(q - tng * 0.025, q + tng * 0.025, 0.27 - 0.03 * (k % 2), 0.01), 0.004)
        out.append(pc)
        en = M.side_pt(M.CABLE_END, s)
        t0 = (P[1] - P[0]) / np.linalg.norm(P[1] - P[0])
        tm = HSPart(f'CableTerminal{side}', 'iron', f'Cable{side}0', tris=500, group='moorings', voxel=0.02)
        tm.add(hs.box(en - t0 * 0.1, (0.26, 0.26, 0.3), hs.frame_axes(t0), r=0.06))
        tm.add(Cyl(en - t0 * 0.05, en + t0 * 0.35, 0.2, 0.03), 0.02)
        tm.bolts([en - t0 * 0.1 + hs.frame_axes(t0)[:, 0] * 0.27 * sx + hs.frame_axes(t0)[:, 2] * 0.0
                  + hs.frame_axes(t0)[:, 1] * 0.2 * sy for sx in (1, -1) for sy in (1, -1)], r=0.04,
                 on=hs.box(en - t0 * 0.1, (0.26, 0.26, 0.3), hs.frame_axes(t0), r=0.06), h=0.03)
        out.append(tm)
    return out


def cable_weights(obj, side):
    """Weights along a cable's chain: each vertex belongs to the bone whose segment
    holds it, blended into the neighbour over the last quarter of the segment."""
    import rig as R
    P, _ = R.mesh_arrays(obj)
    heads = np.array([M.REST[f'Cable{side}{i}'][0] for i in range(M.CABLE_SEGS)])
    tails = np.array([M.REST[f'Cable{side}{i}'][1] for i in range(M.CABLE_SEGS)])
    n = M.CABLE_SEGS
    W = np.zeros((len(P), n))
    for vi, p in enumerate(P):
        best, bu, bd = 0, 0.0, 1e9
        for i in range(n):
            ab = tails[i] - heads[i]
            t = float(np.clip(np.dot(p - heads[i], ab) / np.dot(ab, ab), 0, 1))
            d = np.linalg.norm(p - (heads[i] + ab * t))
            if d < bd - 1e-6:
                best, bu, bd = i, t, d
        W[vi, best] = 1.0
        if bu > 0.75 and best + 1 < n:
            k = (bu - 0.75) / 0.25 * 0.5
            W[vi, best] = 1 - k
            W[vi, best + 1] = k
        elif bu < 0.25 and best > 0:
            k = (0.25 - bu) / 0.25 * 0.5
            W[vi, best] = 1 - k
            W[vi, best - 1] = k
    R.write_groups(obj, [f'Cable{side}{i}' for i in range(n)], W)


# ------------------------------------------------------------------ pistons
def piston_parts(strokes):
    """strokes: {name: (dmin, dmax)} over every clip. Returns (parts, report)."""
    out, report = [], {}
    for name, ba, pa, bb, pb, r in M.PISTONS:
        pa, pb = V(pa, float), V(pb, float)
        d0 = float(np.linalg.norm(pb - pa))
        u = (pb - pa) / d0
        dmin, dmax = strokes.get(name, (d0, d0))
        dmin, dmax = min(dmin, d0), max(dmax, d0)
        Lc = max(dmax - dmin + 0.25, 0.55 * dmin)
        Lc = min(Lc, dmin - 0.12)
        Lr = dmin - 0.1
        ok = (dmax - Lr) < Lc - 0.04 and Lc > 0.2
        report[name] = dict(dmin=round(dmin, 3), dmax=round(dmax, 3), rest=round(d0, 3), cyl=round(Lc, 3),
                            rod=round(Lr, 3), ok=bool(ok))
        F = hs.frame_axes(u)
        side = F[:, 0]
        cy = HSPart(f'P_{name}_Cyl', 'iron', f'P_{name}_Cyl', tris=320, voxel=0.016)
        cy.add(Cyl(pa + u * 0.02, pa + u * Lc, r, 0.025))
        cy.add(Cyl(pa + u * (Lc - 0.1), pa + u * Lc, r * 1.22, 0.015), 0.01)
        cy.add(Cyl(pa + u * (Lc * 0.4 - 0.03), pa + u * (Lc * 0.4 + 0.03), r * 1.12, 0.01), 0.005)
        cy.add(sdf.Sphere(pa, r * 0.95), 0.03)
        cy.add(Cyl(pa - side * r * 1.25, pa + side * r * 1.25, r * 0.42, 0.015), 0.01)
        cy.sub(Cyl(pa + u * (Lc - 0.3), pa + u * (Lc + 0.2), r * 0.5, 0.01), 0.005)
        out.append(cy)
        rd = HSPart(f'P_{name}_Rod', 'steel', f'P_{name}_Rod', tris=200, voxel=0.014)
        rd.add(Cyl(pb - u * Lr, pb, r * 0.42, 0.015))
        rd.add(sdf.Sphere(pb, r * 0.72), 0.02)
        rd.add(Cyl(pb - side * r * 1.0, pb + side * r * 1.0, r * 0.32, 0.01), 0.01)
        out.append(rd)
    return out, report
