"""The Lantern Hall Destrier: Lantern Hall's war horse, sold by its quartermaster.

Built over our own valorsteed body, rig and gait clips (public/models/mounts/valorsteed.glb):
the hide is repainted a dark iron grey and the barrel thickened into a heavier war horse, then
dressed in oak-and-iron barding (a steel chanfron with the guild's lit lantern on the brow,
lamellar crinet plates down the neck, an oak peytral across the chest carrying the guild's
crest, an oak crupper over the rump), a blue caparison dagged and trimmed in gold with the crest
on each flank, a high war saddle, a bridle and reins, and two storm lanterns that hang from
crooks behind the saddle on their own swinging bones.

Conforming pieces are wrapped onto the hide by rays and copy their skin weights from the hide
beneath them, so they move exactly as the horse does; hard pieces are bound rigidly to one bone.
Original procedural work for this project (no imported meshes beyond our own horse, no
reference art).

  blender --background --factory-startup --python \
      scripts/assets/lantern_hall_steed/build_steed.py -- <valorsteed.glb> <out.glb> [out.blend]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import steed_kit as K  # noqa: E402
from steed_kit import PAL, L, Part, box, flush, rigid, sphere, torus, tube  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
BLEND = args[2] if len(args) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.name == 'Icosphere':
        bpy.data.objects.remove(o)
ARM = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
BODY = next(o for o in bpy.data.objects if o.type == 'MESH')
BODY.name = 'DestrierHide'
ARM.data.pose_position = 'REST'
K.make_materials()

SPINE1, SPINE2, ROOT = 'spine_01.x_021', 'spine_02.x_022', 'root.x_02'
HEAD, NECK = 'head.x_031', 'neck.x_027'
SUB1, SUB2 = 'c_subneck_1.x_023', 'c_subneck_2.x_024'
CLAV_L, CLAV_R = 'clavicle.l_042', 'clavicle.r_049'
TRUNK = {SPINE1, SPINE2, ROOT, CLAV_L, CLAV_R}


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# 1. The hide. A destrier is a heavier animal than the riding horse it is built
#    from: the barrel, chest and crest of the neck are widened, easing to nothing
#    toward the legs so every joint keeps the skin it was weighted for. Then the
#    coat is repainted by the source palette's families, so every light and shade
#    step the original painter left in the chestnut survives as a step in the grey.
# ---------------------------------------------------------------------------
def bulk_body():
    for v in BODY.data.vertices:
        x, f, u = K.fu(v.co)
        trunk = smoothstep(0.66, 0.9, u) * (1 - smoothstep(0.62, 0.8, f)) * smoothstep(-0.66, -0.5, f)
        neck = smoothstep(0.3, 0.45, f) * (1 - smoothstep(0.6, 0.7, f)) * smoothstep(1.05, 1.2, u)
        k = 1 + 0.16 * trunk + 0.12 * neck
        v.co.x = x * k


def recolour_body():
    me = BODY.data
    col = me.attributes['Color']
    for poly in me.polygons:
        cz = sum((me.vertices[v].co.z for v in poly.vertices)) / len(poly.vertices) - K.Z0
        for li in poly.loop_indices:
            r, g, b, a = col.data[li].color
            if r > 0.3 and g < 0.22 and r > 2.4 * g:  # the chestnut coat
                k = max(0.0, min(1.0, (r - 0.34) / (0.6 - 0.34)))
                belly = max(0.0, min(1.0, (0.95 - cz) / 0.35))
                c = Vector(PAL['coat_dark']).lerp(Vector(PAL['coat']), k)
                c = c.lerp(Vector(PAL['coat_light']), belly * 0.5)
                col.data[li].color = (*c, 1)
            elif r > 0.6 and 0.3 < g < 0.5 and b < 0.3:  # mane and tail
                k = (r - 0.6) / 0.15
                c = Vector(PAL['mane']) * (0.8 + 0.6 * k)
                col.data[li].color = (*c, 1)
            elif 0.7 < r < 0.8 and 0.3 < g < 0.4:  # inner ear
                col.data[li].color = (0.05, 0.035, 0.035, 1)
            elif r > 0.85 and g > 0.75:  # socks and muzzle
                col.data[li].color = (*(PAL['muzzle'] if cz > 1.0 else PAL['sock']), 1)
            elif 0.35 < r < 0.42 and 0.25 < g < 0.32:  # hooves
                col.data[li].color = (*PAL['hoof'], 1)
    me.materials.clear()
    me.materials.append(K.MATS['steed_hide'])


bulk_body()
recolour_body()
S = K.BodySampler(BODY, skip_prefixes=('c_tail_',))


# ---------------------------------------------------------------------------
# The wrap: a sheet laid round an axis line by rays cast in toward it. Each hit
# radius is smoothed across its neighbours (the hide is low-poly; armour should
# read as forged and sewn, not as a shrink-wrap of every facet), then lifted.
# ---------------------------------------------------------------------------
class Wrap:
    def __init__(self, axis_fn, up_fn, ns, nt, s_range, t_range, lift, keep=None, smooth=3,
                 reach=1.2, s_fn=None):
        self.ns, self.nt = ns, nt
        self.pts = {}
        self.nrm = {}
        self.w = {}
        rad = {}
        frames = {}
        for i in range(ns):
            for j in range(nt):
                uu, vv = i / (ns - 1), j / (nt - 1)
                s = s_fn(uu, vv) if s_fn else s_range[0] + (s_range[1] - s_range[0]) * uu
                a = Vector(axis_fn(s))
                a2 = Vector(axis_fn(s + 1e-3))
                fwd = (a2 - a).normalized()
                up = Vector(up_fn(s))
                up = (up - fwd * up.dot(fwd)).normalized()
                side = fwd.cross(up).normalized()
                t = t_range[0] + (t_range[1] - t_range[0]) * vv
                d = up * math.cos(t) + side * math.sin(t)
                frames[i, j] = (a, d)
                hit = S.ray(a + d * reach, -d)
                rad[i, j] = (a - hit[0]).length if hit else None
        # fill misses from neighbours, then smooth
        for _ in range(4):
            for k, r in list(rad.items()):
                if r is None:
                    nb = [rad.get((k[0] + di, k[1] + dj)) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                    nb = [x for x in nb if x is not None]
                    if nb:
                        rad[k] = sum(nb) / len(nb)
        for _ in range(smooth):
            new = {}
            for (i, j), r in rad.items():
                nb = [rad.get((i + di, j + dj)) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                nb = [x for x in nb if x is not None]
                new[i, j] = 0.5 * r + 0.5 * (sum(nb) / len(nb)) if nb else r
            rad = new
        for (i, j), r in rad.items():
            a, d = frames[i, j]
            lv = lift(i / (ns - 1), j / (nt - 1)) if callable(lift) else lift
            self.pts[i, j] = a + d * (r + lv)
            self.nrm[i, j] = d
            self.w[i, j] = S.weights_at(a + d * r, keep)

    def sheet(self, p, thick, colour_fn, mat, cells=None, rim=None, rim_mat=None, smooth=True):
        """Both faces and the edge band of the sheet (optionally only `cells`)."""
        top, bot = {}, {}
        for k, co in self.pts.items():
            top[k] = p.v(co + self.nrm[k] * thick, self.w[k])
            bot[k] = p.v(co, self.w[k])
        have = set()
        for i in range(self.ns - 1):
            for j in range(self.nt - 1):
                if cells and not cells(i, j):
                    continue
                have.add((i, j))
                q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                c = colour_fn(i, j)
                p.f([top[k] for k in q], mat, c, smooth)
                p.f([bot[k] for k in reversed(q)], mat, c, smooth)
        # edge band wherever a kept cell borders a missing one
        for (i, j) in have:
            for (di, dj, a, b) in ((-1, 0, (i, j), (i, j + 1)), (1, 0, (i + 1, j + 1), (i + 1, j)),
                                   (0, -1, (i + 1, j), (i, j)), (0, 1, (i, j + 1), (i + 1, j + 1))):
                if (i + di, j + dj) not in have:
                    p.f([top[b], top[a], bot[a], bot[b]], rim_mat or mat, rim or colour_fn(i, j))
        return top


def stud(p, loc, nrm, w, r=0.011, col=None):
    sphere(p, loc + nrm * (r * 0.3), r, 'steed_gold', col or PAL['gold'], w, seg=8, rings=4,
           scale=(1, 1, 0.7))


def strap(p, pts, nrms, ws, width, thick, mat, col, side_col=None):
    """A flat band through a polyline, lying on the surface whose normals are given."""
    tops, bots = [], []
    for k, (a, n, w) in enumerate(zip(pts, nrms, ws)):
        nxt = pts[min(k + 1, len(pts) - 1)]
        prv = pts[max(k - 1, 0)]
        along = (nxt - prv).normalized()
        side = along.cross(n).normalized() * (width / 2)
        tops.append((p.v(a + n * thick + side, w), p.v(a + n * thick - side, w)))
        bots.append((p.v(a + side, w), p.v(a - side, w)))
    for k in range(len(pts) - 1):
        (a1, a2), (b1, b2) = tops[k], tops[k + 1]
        (c1, c2), (d1, d2) = bots[k], bots[k + 1]
        p.f([a1, b1, b2, a2], mat, col, True)
        p.f([a2, b2, d2, c2], mat, side_col or col)
        p.f([b1, a1, c1, d1], mat, side_col or col)


# ---------------------------------------------------------------------------
# 2. The caparison: blue cloth from the withers to the croup, its hem dagged into
#    deep points, banded in gold over a garnet stripe, the crest on each flank.
# ---------------------------------------------------------------------------
CAP_S = (-0.52, 0.34)
CAP_T = (-1.72, 1.72)


def caparison():
    p = Part('Caparison')
    ns, nt = 24, 25
    w = Wrap(lambda s: L(0, s, 0.93), lambda s: (0, 0, 1), ns, nt, CAP_S, CAP_T, 0.03,
             keep=None, smooth=6)
    # the hem: from each side's lowest row, the cloth falls plumb and is dagged
    hem = {}
    for i in range(ns):
        for j in (0, nt - 1):
            base = w.pts[i, j]
            # dag points: every third column a deep point, between them shallow scallops
            phase = (i % 3) / 2.0
            drop = 0.26 + 0.08 * (1 - abs(phase - 0.5) * 2)
            out = Vector((math.copysign(0.012, base.x), 0, 0))
            hem[i, j] = (base + out + Vector((0, 0, -drop * 0.55)), base + out * 1.4 + Vector((0, 0, -drop)))

    def colour(i, j):
        if j in (0, nt - 2):
            return PAL['gold']
        if j in (1, nt - 3):
            return PAL['garnet']
        if i in (0, ns - 2):
            return PAL['gold']
        # vertical pleats: every other column a shade deeper, the cloth darkening toward the hem
        k = 0.88 if i % 2 else 1.0
        low = min(j, nt - 1 - j) / (nt / 2)
        return tuple(c * k * (0.75 + 0.25 * low) for c in PAL['blue'])

    def keep(i, j):
        # leave a gap for the tail at the croup and the neck at the withers
        t = CAP_T[0] + (CAP_T[1] - CAP_T[0]) * (j + 0.5) / (nt - 1)
        if i == 0 and abs(t) < 0.45:
            return False
        if i >= ns - 3 and abs(t) < 0.5 and i == ns - 2:
            return True
        return True

    top = w.sheet(p, 0.012, colour, 'steed_cloth', cells=keep, rim=PAL['gold_dark'])
    # hem panels, two rows: the plumb drop and the dagged tip
    for j, sgn in ((0, -1), (nt - 1, 1)):
        for i in range(ns - 1):
            a0, b0 = w.pts[i, j], w.pts[i + 1, j]
            (a1, a2), (b1, b2) = hem[i, j], hem[i + 1, j]
            wa, wb = w.w[i, j], w.w[i + 1, j]
            for (p0, p1, q0, q1, c) in ((a0, a1, b0, b1, PAL['blue']), (a1, a2, b1, b2, PAL['gold'])):
                ids = [p.v(p0, wa), p.v(q0, wb), p.v(q1, wb), p.v(p1, wa)]
                if sgn > 0:
                    ids = list(reversed(ids))
                p.f(ids, 'steed_cloth', c, True)
                p.f(list(reversed(ids)), 'steed_cloth', c, True)
    return p, w


CAP_PART, CAP_WRAP = caparison()


def crest(p, centre, normal, up, scale, w, glow=True):
    """Lantern Hall's crest: a lantern over two crossed swords on a blue heater shield, a gilt
    border. Built flat in its own (side, up, out) frame and placed on the surface."""
    n = Vector(normal).normalized()
    upv = (Vector(up) - n * Vector(up).dot(n)).normalized()
    side = upv.cross(n).normalized()
    c = Vector(centre)

    def P(x, y, z=0.0):
        return c + side * (x * scale) + upv * (y * scale) + n * (z * scale)

    # the shield: a heater outline, layered border and field
    outline = []
    for k in range(13):
        t = k / 12
        if t <= 0.5:
            x = -1 + 4 * t * t
            y = 1.0 if t < 0.25 else 1.0 - (t - 0.25) * 0.0
        outline = None
        break
    pts = [(-1.0, 1.0), (1.0, 1.0), (1.0, 0.1), (0.8, -0.55), (0.42, -0.95), (0.0, -1.2), (-0.42, -0.95),
           (-0.8, -0.55), (-1.0, 0.1)]

    def slab(poly, z0, z1, mat, col, inset=1.0):
        top = [p.v(P(x * inset, y * inset, z1), w) for x, y in poly]
        bot = [p.v(P(x * inset, y * inset, z0), w) for x, y in poly]
        p.f(top, mat, col)
        p.f(list(reversed(bot)), mat, col)
        for k in range(len(poly)):
            kk = (k + 1) % len(poly)
            p.f([bot[k], bot[kk], top[kk], top[k]], mat, col)

    slab(pts, 0.0, 0.12, 'steed_gold', PAL['gold'])
    slab(pts, 0.12, 0.2, 'steed_cloth', PAL['blue'], inset=0.84)
    # crossed swords
    for sgn in (1, -1):
        a = Vector((-0.75 * sgn, -0.8))
        b = Vector((0.7 * sgn, 0.78))
        d = (b - a).normalized()
        nn = Vector((-d.y, d.x)) * 0.075
        blade = [a + nn, a - nn, b - nn * 0.2, b + nn * 0.2]
        slab([tuple(v) for v in (blade if sgn > 0 else list(reversed(blade)))], 0.2, 0.27, 'steed_iron',
             PAL['steel'])
        g = a + d * 0.32
        guard = [g + nn * 3.5, g + nn * 3.5 + d * 0.09, g - nn * 3.5 + d * 0.09, g - nn * 3.5]
        slab([tuple(v) for v in (guard if sgn > 0 else list(reversed(guard)))], 0.27, 0.32, 'steed_gold',
             PAL['gold'])
        sphere(p, P(a.x - d.x * 0.08, a.y - d.y * 0.08, 0.27), 0.07 * scale, 'steed_gold', PAL['gold'], w, 6, 4)
    # the lantern over the cross: frame, lit pane, roof and ring
    slab([(-0.36, -0.45), (0.36, -0.45), (0.36, 0.38), (-0.36, 0.38)], 0.27, 0.35, 'steed_gold', PAL['gold'])
    slab([(-0.24, -0.34), (0.24, -0.34), (0.24, 0.28), (-0.24, 0.28)], 0.35, 0.38,
         'lantern_Glow' if glow else 'steed_gold', PAL['glass'])
    slab([(-0.48, 0.38), (0.48, 0.38), (0.0, 0.72)], 0.27, 0.34, 'steed_gold', PAL['gold_dark'])
    torus(p, P(0, 0.84, 0.3), n, 0.1 * scale, 0.03 * scale, 'steed_gold', PAL['gold'], w, seg=10, sides=5)


def flank_crests(p):
    ns, nt = CAP_WRAP.ns, CAP_WRAP.nt
    for j in (5, nt - 6):
        i = int(ns * 0.17)
        loc = CAP_WRAP.pts[i, j]
        nrm = CAP_WRAP.nrm[i, j]
        w = CAP_WRAP.w[i, j]
        crest(p, loc + nrm * 0.014, nrm, (0, 0, 1), 0.085, w)


flank_crests(CAP_PART)
flush(CAP_PART, ARM, BODY)


# ---------------------------------------------------------------------------
# 3. The peytral: an oak breastplate across the chest of vertical boards, domed
#    out over the point of the chest, its lower edge swept up at the shoulders,
#    framed and strapped in iron, studded in gilt, the crest on a boss at its heart.
# ---------------------------------------------------------------------------
def peytral():
    p = Part('Peytral')
    keep = {SPINE2, SPINE1, CLAV_L, CLAV_R, SUB1}
    ns, nt = 11, 19
    S_R, T_R = (0.72, 1.14), (-1.05, 1.05)

    def dome(extra):
        return lambda u, v: extra + 0.03 * math.sin(math.pi * min(1.0, u * 1.3)) * math.cos((v - 0.5) * 2.4)

    def shape(i, j):
        return True

    def s_of(u, v):
        # the lower edge sweeps up toward the shoulders in an arc, the top stays level
        side = abs(v - 0.5) * 2
        bottom = S_R[0] + 0.17 * side * side
        return bottom + (S_R[1] - bottom) * u

    w = Wrap(lambda s: L(0, 0.42, s), lambda s: (0, -1, 0), ns, nt, S_R, T_R, dome(0.028), keep=keep, smooth=3,
             s_fn=s_of)
    rimw = Wrap(lambda s: L(0, 0.42, s), lambda s: (0, -1, 0), ns, nt, S_R, T_R, dome(0.04), keep=keep, smooth=3,
                s_fn=s_of)

    def oak(i, j):
        return (PAL['oak'], PAL['oak_light'], PAL['oak'], PAL['oak_dark'])[j % 4]

    w.sheet(p, 0.026, oak, 'steed_wood', cells=shape, rim=PAL['oak_dark'])

    # the iron frame: every kept cell that borders the outline or the top row
    def edge(i, j):
        if not shape(i, j):
            return False
        nb = [(i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)]
        return i == ns - 2 or any(not (0 <= a < ns - 1 and 0 <= b < nt - 1) or not shape(a, b) for a, b in nb)

    rimw.sheet(p, 0.02, lambda i, j: PAL['iron'], 'steed_iron', cells=edge, rim=PAL['iron_dark'])
    for j in (5, 9, 13):
        rows = [i for i in range(ns) if shape(min(i, ns - 2), j)]
        pts = [rimw.pts[i, j] for i in rows]
        nr = [rimw.nrm[i, j] for i in rows]
        ws = [rimw.w[i, j] for i in rows]
        strap(p, pts, nr, ws, 0.03, 0.012, 'steed_iron', PAL['iron'], PAL['iron_dark'])
        for k in range(0, len(pts), 2):
            stud(p, pts[k] + nr[k] * 0.012, nr[k], ws[k], r=0.011)
    for j in range(1, nt - 1, 2):
        i = ns - 1
        stud(p, rimw.pts[i, j] + rimw.nrm[i, j] * 0.02, rimw.nrm[i, j], rimw.w[i, j], r=0.012)
    # the crest on a gilt boss at the heart of the plate
    ic, jc = ns // 2, (nt - 1) // 2
    loc, nrm, wc = rimw.pts[ic, jc], rimw.nrm[ic, jc], rimw.w[ic, jc]
    tube(p, loc, loc + nrm * 0.025, 0.105, 'steed_gold', PAL['gold_dark'], wc, sides=16)
    torus(p, loc + nrm * 0.025, nrm, 0.105, 0.012, 'steed_gold', PAL['gold'], wc, seg=16, sides=5)
    crest(p, loc + nrm * 0.03, nrm, (0, 0, 1), 0.075, wc)
    return p


flush(peytral(), ARM, BODY)


# ---------------------------------------------------------------------------
# 4. The crupper: oak plates over the croup, the same boards and iron, a gilt
#    rondel on each quarter, over the caparison.
# ---------------------------------------------------------------------------
def crupper():
    p = Part('Crupper')
    keep = {ROOT, SPINE1, 'c_thigh_b.l_07', 'c_thigh_b.r_014', 'c_tail_00.x_03'}
    ns, nt = 8, 15
    s_rng, t_rng = (-0.6, -0.3), (-1.15, 1.15)
    w = Wrap(lambda s: L(0, s, 0.93), lambda s: (0, 0, 1), ns, nt, s_rng, t_rng, 0.05, keep=keep, smooth=2)

    def colour(i, j):
        return (PAL['oak'], PAL['oak_light'], PAL['oak'], PAL['oak_dark'])[i % 4]

    w.sheet(p, 0.022, colour, 'steed_wood', cells=lambda i, j: not (i == 0 and 5 <= j <= 8),
            rim=PAL['iron_dark'], rim_mat='steed_iron')
    for j in (0, 4, nt - 5, nt - 1):
        pts = [w.pts[i, j] for i in range(1, ns)]
        nr = [w.nrm[i, j] for i in range(1, ns)]
        ws = [w.w[i, j] for i in range(1, ns)]
        strap(p, pts, nr, ws, 0.03, 0.03, 'steed_iron', PAL['iron'], PAL['iron_dark'])
    for j in (3, nt - 4):
        i = ns // 2
        loc, nrm = w.pts[i, j], w.nrm[i, j]
        stud(p, loc + nrm * 0.022, nrm, w.w[i, j], r=0.035)
    return p




# ---------------------------------------------------------------------------
# 5. The crinet: overlapping steel lames down the crest of the neck, split for the
#    mane, each lame riding the neck bone beneath it.
# ---------------------------------------------------------------------------
def crinet():
    p = Part('Crinet')
    a0, a1 = L(0, 0.5, 1.16), L(0, 0.57, 1.6)
    axis = lambda s: a0.lerp(a1, s)  # noqa: E731
    keep = {SUB1, SUB2, NECK, SPINE2}
    n_lames = 6
    nt = 15
    t_rng = (-1.55, 1.55)
    for k in range(n_lames):
        s0 = 0.02 + k * 0.15
        w = Wrap(axis, lambda s: (0, 1, 0), 3, nt, (s0, s0 + 0.17), t_rng, 0.016 + 0.004 * (n_lames - k),
                 keep=keep, smooth=2, reach=0.6)

        def cells(i, j):
            t = t_rng[0] + (t_rng[1] - t_rng[0]) * (j + 0.5) / (nt - 1)
            return abs(t) > 0.42  # the slot the mane rises through

        col = PAL['steel'] if k % 2 == 0 else PAL['iron']
        w.sheet(p, 0.012, lambda i, j: col, 'steed_iron', cells=cells, rim=PAL['gold_dark'],
                rim_mat='steed_gold')
        for j in (2, 5, nt - 6, nt - 3):
            stud(p, w.pts[0, j] + w.nrm[0, j] * 0.012, w.nrm[0, j], w.w[0, j], r=0.008)
    return p


flush(crinet(), ARM, BODY)


# ---------------------------------------------------------------------------
# 6. The chanfron: a steel face plate from poll to nose, a raised gilt ridge, flared
#    eye guards, and the guild's lantern lit on the brow.
# ---------------------------------------------------------------------------
GLOW_POINTS = {}


def chanfron():
    p = Part('Chanfron')
    keep = {HEAD}
    a0, a1 = L(0, 0.67, 1.53), L(0, 1.0, 1.32)
    axis = lambda s: a0.lerp(a1, s)  # noqa: E731
    ns, nt = 10, 11
    # a raised medial crest down the face: the plate stands proud along its centre line
    def crest_lift(u, v):
        return 0.012 + 0.016 * max(0.0, 1 - abs(v - 0.5) * 3.2)

    w = Wrap(axis, lambda s: (0, -0.45, 1), ns, nt, (0.0, 0.92), (-1.3, 1.3), crest_lift, keep=keep, smooth=2,
             reach=0.6)

    def cells(i, j):
        # taper toward the nose: drop the outer columns as the plate narrows
        cut = int(i * 0.35)
        return cut <= j < nt - 1 - cut

    w.sheet(p, 0.012, lambda i, j: PAL['steel'], 'steed_iron', cells=cells,
            rim=PAL['gold_dark'], rim_mat='steed_gold')
    jc = nt // 2
    pts = [w.pts[i, jc] for i in range(ns)]
    nr = [w.nrm[i, jc] for i in range(ns)]
    ws = [w.w[i, jc] for i in range(ns)]
    strap(p, pts, nr, ws, 0.028, 0.022, 'steed_gold', PAL['gold'], PAL['gold_dark'])
    # the brow lantern: a gilt cage round a lit pane, on a rondel
    loc, nrm = w.pts[2, jc], w.nrm[2, jc]
    tube(p, loc, loc + nrm * 0.016, 0.046, 'steed_gold', PAL['gold_dark'], rigid(HEAD), sides=12)
    sphere(p, loc + nrm * 0.03, 0.022, 'lantern_Glow', PAL['glass'], rigid(HEAD), seg=10, rings=6)
    GLOW_POINTS[HEAD] = loc + nrm * 0.07
    torus(p, loc + nrm * 0.02, nrm, 0.034, 0.007, 'steed_gold', PAL['gold'], rigid(HEAD), seg=14, sides=5)
    # the little cage over the glass: four gilt bars meeting at a cap
    side = nrm.cross(Vector((1, 0, 0))).normalized()
    up2 = nrm.cross(side).normalized()
    for k in range(4):
        a = math.pi * k / 2
        foot = loc + nrm * 0.018 + (side * math.cos(a) + up2 * math.sin(a)) * 0.026
        tube(p, foot, loc + nrm * 0.056, 0.0035, 'steed_gold', PAL['gold'], rigid(HEAD), sides=4)
    sphere(p, loc + nrm * 0.058, 0.007, 'steed_gold', PAL['gold'], rigid(HEAD), seg=6, rings=4)
    # flared eye guards
    for j in (1, nt - 2):
        i = 4
        loc, nrm = w.pts[i, j], w.nrm[i, j]
        # a flanged eye guard: a steel ring standing off the plate round the eye, gilt-lipped
        torus(p, loc + nrm * 0.02, nrm, 0.038, 0.011, 'steed_iron', PAL['steel'], rigid(HEAD), seg=14, sides=6)
        torus(p, loc + nrm * 0.03, nrm, 0.038, 0.005, 'steed_gold', PAL['gold'], rigid(HEAD), seg=14, sides=4)
    # ear cups
    for sgn in (1, -1):
        base = L(sgn * 0.075, 0.66, 1.67)
        tube(p, base, base + Vector((sgn * 0.02, 0.0, 0.09)), 0.035, 'steed_iron', PAL['steel'],
             rigid(HEAD), sides=8, r2=0.012)
    return p


flush(chanfron(), ARM, BODY)


# ---------------------------------------------------------------------------
# 7. The war saddle: a deep leather seat over the caparison, a high cantle and a
#    pommel bound in gilt, skirts down each flank, stirrups, and an iron crook
#    rising from each rear corner of the cantle for a storm lantern.
# ---------------------------------------------------------------------------
SADDLE_F = 0.04
LANTERN_HOOKS = {}


def saddle():
    p = Part('Saddle')
    R = rigid(SPINE1)
    axis = lambda s: L(0, s, 0.93)  # noqa: E731
    up = lambda s: (0, 0, 1)  # noqa: E731
    seat_s = (SADDLE_F - 0.17, SADDLE_F + 0.17)

    def seat_lift(u, v):
        # the seat dips between pommel and cantle
        return 0.07 + 0.035 * (abs(u - 0.45) * 2) ** 2

    seat = Wrap(axis, up, 9, 11, seat_s, (-0.8, 0.8), seat_lift, smooth=4)
    for k in seat.w:
        seat.w[k] = R
    seat.sheet(p, 0.03, lambda i, j: PAL['leather'] if 1 <= j <= 8 else PAL['leather_dark'], 'steed_leather',
               rim=PAL['gold_dark'], rim_mat='steed_gold')
    # skirts: stiff leather flaps from the seat edge down each flank, gilt-studded
    for t0, t1 in ((-1.45, -0.78), (0.78, 1.45)):
        sk = Wrap(axis, up, 6, 6, (SADDLE_F - 0.15, SADDLE_F + 0.13), (t0, t1), 0.062, smooth=3)
        for k in sk.w:
            sk.w[k] = R
        sk.sheet(p, 0.012, lambda i, j: PAL['leather_dark'], 'steed_leather', rim=PAL['gold'], rim_mat='steed_gold')
        jj = 5 if t0 > 0 else 0
        for i in range(0, 6, 2):
            stud(p, sk.pts[i, jj] + sk.nrm[i, jj] * 0.012, sk.nrm[i, jj], R, r=0.009)
    # the cantle (a high curved back) and the pommel (a lower swell with a gilt knob)
    for (row, h, lean, wide) in ((0, 0.15, -0.35, 0.15), (8, 0.1, 0.3, 0.11)):
        f = K.fu(seat.pts[row, 5])[1]
        ring = []
        for k in range(9):
            t = -1.15 + 2.3 * k / 8
            col = min(10, max(0, int(round((t / 1.15 + 1) / 2 * 10))))
            base_u = K.fu(seat.pts[row, col])[2] + 0.02
            x = math.sin(t) * wide
            ring.append((L(x, f, base_u), L(x, f + lean * h * 0.4, base_u + h * math.cos(t * 0.9))))
        thick = Vector((0, 0.025 if row == 0 else -0.025, 0))
        for k in range(8):
            (b0, t0_), (b1, t1_) = ring[k], ring[k + 1]
            ids = [p.v(b0, R), p.v(b1, R), p.v(t1_, R), p.v(t0_, R)]
            ids2 = [p.v(b0 + thick, R), p.v(b1 + thick, R), p.v(t1_ + thick, R), p.v(t0_ + thick, R)]
            p.f(ids, 'steed_leather', PAL['leather'], True)
            p.f(list(reversed(ids2)), 'steed_leather', PAL['leather'], True)
            p.f([ids[3], ids[2], ids2[2], ids2[3]], 'steed_gold', PAL['gold'])
        if row == 8:
            sphere(p, ring[4][1] + Vector((0, 0, 0.02)), 0.028, 'steed_gold', PAL['gold'], R, seg=10, rings=6)
        else:
            # the crooks: an iron rod up from each rear corner, curling out over the flank
            for sgn, (bb, tt) in ((1, ring[8]), (-1, ring[0])):
                base = tt - Vector((0, 0, 0.02))
                pts = [base, base + Vector((sgn * 0.02, 0, 0.12)), base + Vector((sgn * 0.07, 0, 0.2)),
                       base + Vector((sgn * 0.14, 0, 0.215)), base + Vector((sgn * 0.19, 0, 0.19))]
                for a, b in zip(pts, pts[1:]):
                    tube(p, a, b, 0.009, 'steed_iron', PAL['iron'], R, sides=6)
                    sphere(p, b, 0.0095, 'steed_iron', PAL['iron'], R, seg=6, rings=3)
                sphere(p, pts[2], 0.016, 'steed_gold', PAL['gold'], R, seg=8, rings=4)
                hook = pts[-1] - Vector((0, 0, 0.012))
                torus(p, hook, (0, 1, 0), 0.012, 0.004, 'steed_iron', PAL['iron_dark'], R, seg=8, sides=4)
                LANTERN_HOOKS['lantern_l' if sgn > 0 else 'lantern_r'] = hook - Vector((0, 0, 0.012))
    # stirrups on their leathers
    for sgn in (1, -1):
        top = L(sgn * 0.215, SADDLE_F + 0.02, 1.05)
        bot = L(sgn * 0.235, SADDLE_F + 0.02, 0.74)
        tube(p, top, bot, 0.011, 'steed_leather', PAL['leather_dark'], R, sides=4)
        c = bot + Vector((0, 0, -0.035))
        torus(p, c, (0, 1, 0), 0.035, 0.008, 'steed_iron', PAL['iron'], R, seg=12, sides=5)
        box(p, c - Vector((0, 0, 0.032)), (0.075, 0.03, 0.012), 'steed_iron', PAL['iron'], R)
    return p


flush(saddle(), ARM, BODY)


# ---------------------------------------------------------------------------
# 8. The storm lanterns, each on its own bone hung from a crook so it can swing:
#    a hexagonal gilt-and-iron cage round lit glass, a peaked cap, a ring, a short
#    chain. The bone runs straight DOWN from the hook, so the lamp's offset in the
#    renderer's spec is measured along it (mount_visuals.ts, MountLampSpec.offset).
# ---------------------------------------------------------------------------
LANTERN_LEN = 0.24
# the lanterns are drawn at storm-lantern size against the rider, not trinket size
LS = 1.45


def add_lantern_bones():
    bpy.context.view_layer.objects.active = ARM
    ARM.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ARM.data.edit_bones
    for name, hook in LANTERN_HOOKS.items():
        b = eb.new(name)
        b.head = hook
        b.tail = hook - Vector((0, 0, LANTERN_LEN))
        b.roll = 0
        b.parent = eb[SPINE1]
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')


def lantern(p, name, hook):
    R = rigid(name)
    down = Vector((0, 0, -1))
    for k in range(3):
        c = hook + down * (0.012 * LS + k * 0.016 * LS)
        torus(p, c, (1, 0, 0) if k % 2 else (0, 1, 0), 0.008 * LS, 0.0028 * LS, 'steed_iron', PAL['iron_dark'], R, seg=8,
              sides=4)
    top = hook + down * 0.055 * LS
    torus(p, top, (0, 0, 1), 0.012 * LS, 0.004 * LS, 'steed_gold', PAL['gold'], R, seg=10, sides=4)
    cap_b = top + down * 0.012 * LS
    cap_l = cap_b + down * 0.03 * LS
    tube(p, cap_b, cap_l, 0.008 * LS, 'steed_gold', PAL['gold_dark'], R, sides=6, r2=0.04 * LS)
    g_top = cap_l
    g_bot = g_top + down * 0.075 * LS
    tube(p, g_top, g_top + down * 0.008 * LS, 0.042 * LS, 'steed_gold', PAL['gold'], R, sides=6)
    tube(p, g_bot - down * 0.008 * LS, g_bot + down * 0.004 * LS, 0.044 * LS, 'steed_gold', PAL['gold'], R, sides=6)
    tube(p, g_top + down * 0.006 * LS, g_bot - down * 0.006 * LS, 0.034 * LS, 'lantern_Glow', PAL['glass'], R, sides=6)
    for k in range(6):
        a = 2 * math.pi * k / 6
        off = Vector((math.cos(a) * 0.038 * LS, math.sin(a) * 0.038 * LS, 0))
        tube(p, g_top + off, g_bot + off, 0.0045 * LS, 'steed_iron', PAL['iron_dark'], R, sides=4)
    tube(p, g_bot + down * 0.004 * LS, g_bot + down * 0.02 * LS, 0.036 * LS, 'steed_gold', PAL['gold_dark'], R, sides=6, r2=0.012 * LS)
    sphere(p, g_bot + down * 0.027 * LS, 0.008 * LS, 'steed_gold', PAL['gold'], R, seg=6, rings=4)
    return g_top + down * 0.0375 * LS


def lanterns():
    add_lantern_bones()
    p = Part('Lanterns')
    centres = {name: lantern(p, name, hook) for name, hook in LANTERN_HOOKS.items()}
    flush(p, ARM, BODY)
    GLOW_POINTS.update(centres)


lanterns()


# ---------------------------------------------------------------------------
# 9. Bridle and reins: a crownpiece behind the ears, a noseband with gilt
#    rosettes, bit rings, and reins sagging back to the pommel.
# ---------------------------------------------------------------------------
def ring_strap(p, centre, axis_dir, up, lift, width, col, n=16, rosettes=()):
    axis_dir = Vector(axis_dir).normalized()
    up = (Vector(up) - axis_dir * Vector(up).dot(axis_dir)).normalized()
    side = axis_dir.cross(up)
    pts, nrs = [], []
    for k in range(n + 1):
        t = -math.pi + 2 * math.pi * k / n
        d = up * math.cos(t) + side * math.sin(t)
        hit = S.ray(Vector(centre) + d * 0.5, -d)
        if hit:
            pts.append(hit[0] + d * lift)
            nrs.append(d)
    ws = [rigid(HEAD)] * len(pts)
    strap(p, pts, nrs, ws, width, 0.007, 'steed_leather', col, PAL['leather_dark'])
    for k in rosettes:
        k = min(k, len(pts) - 1)
        torus(p, pts[k] + nrs[k] * 0.008, nrs[k], 0.012, 0.004, 'steed_gold', PAL['gold'], ws[k], seg=10, sides=4)


def bridle():
    p = Part('Bridle')
    head_axis = L(0, 1.0, 1.32) - L(0, 0.67, 1.53)
    ring_strap(p, L(0, 0.9, 1.38), head_axis, (0, -0.45, 1), 0.006, 0.022, PAL['leather'], rosettes=(4, 12))
    ring_strap(p, L(0, 0.645, 1.55), head_axis, (0, -0.45, 1), 0.008, 0.024, PAL['leather'], n=18)
    for sgn in (1, -1):
        bit = L(sgn * 0.062, 0.93, 1.325)
        torus(p, bit, (1, 0, 0), 0.016, 0.004, 'steed_gold', PAL['gold'], rigid(HEAD), seg=10, sides=4)
        pommel = L(sgn * 0.05, SADDLE_F + 0.19, 1.27)
        pts, ws = [], []
        for k in range(9):
            t = k / 8
            q = bit.lerp(pommel, t) + Vector((0, 0, -0.07 * math.sin(math.pi * t)))
            q.x = sgn * (0.062 + 0.06 * math.sin(math.pi * t))
            pts.append(q)
            ws.append({HEAD: 1 - t, SPINE1: t} if 0 < t < 1 else rigid(HEAD if t == 0 else SPINE1))
        for a, b, wa, wb in zip(pts, pts[1:], ws, ws[1:]):
            side = Vector((sgn * 0.006, 0, 0))
            q = [p.v(a + side, wa), p.v(b + side, wb), p.v(b - side, wb), p.v(a - side, wa)]
            p.f(q, 'steed_leather', PAL['leather'])
            p.f(list(reversed(q)), 'steed_leather', PAL['leather'])
    return p


flush(bridle(), ARM, BODY)


# ---------------------------------------------------------------------------
# 10. The lanterns' swing, keyed into every clip the horse already ships. A
#     pendulum lags the body: it rocks fore-and-aft with the stride and side to
#     side with the roll, a whole number of times per clip so every loop closes.
# ---------------------------------------------------------------------------
SWING = {
    # clip: (fore/aft degrees, side degrees, swings per clip, side swings per clip)
    'Idle': (2.5, 1.5, 1, 1),
    'Walk': (7.0, 4.0, 2, 1),
    'Run': (16.0, 6.0, 1, 1),
}


def key_swing():
    ARM.animation_data_create()
    for act in list(bpy.data.actions):
        ARM.animation_data.action = act
        if getattr(act, 'slots', None) and len(act.slots):
            ARM.animation_data.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        steps = max(8, int(round((f1 - f0) * 2)))
        for name in LANTERN_HOOKS:
            pb = ARM.pose.bones[name]
            pb.rotation_mode = 'QUATERNION'
            sgn = 1 if name.endswith('_l') else -1
            for k in range(steps + 1):
                t = k / steps
                fr = f0 + (f1 - f0) * t
                if act.name in SWING:
                    a_deg, s_deg, n1, n2 = SWING[act.name]
                    pitch = math.radians(a_deg) * math.sin(2 * math.pi * n1 * t + 0.7)
                    roll = math.radians(s_deg) * math.sin(2 * math.pi * n2 * t + 1.9) * sgn
                else:
                    # Death: thrown forward as he falls, then swinging down to rest
                    decay = math.exp(-4.0 * t)
                    pitch = math.radians(28) * decay * math.sin(2 * math.pi * 3.0 * t)
                    roll = math.radians(10) * decay * math.sin(2 * math.pi * 2.0 * t + 0.5) * sgn
                q = (Matrix.Rotation(pitch, 3, 'X') @ Matrix.Rotation(roll, 3, 'Z')).to_quaternion()
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=fr, group=name)
    ARM.animation_data.action = None


key_swing()


def consolidate():
    """One skinned mesh in three materials (matte, metal, the lit glass): the colours all live
    in COLOR_0, so the surface response is the only reason to split a draw."""
    matte = bpy.data.materials.new('steed_matte')
    metal = bpy.data.materials.new('steed_metal')
    for m, (met, rough) in ((matte, (0.0, 0.72)), (metal, (0.9, 0.36))):
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        b.inputs['Metallic'].default_value = met
        b.inputs['Roughness'].default_value = rough
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Color'
        nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    target = {'steed_iron': metal, 'steed_gold': metal, 'lantern_Glow': K.MATS['lantern_Glow']}
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o is not BODY]
    for o in bpy.data.objects:
        o.select_set(o in parts or o is BODY)
    bpy.context.view_layer.objects.active = BODY
    bpy.ops.object.join()
    me = BODY.data
    final = [matte, metal, K.MATS['lantern_Glow']]
    remap = [final.index(target.get(m.name, matte)) for m in me.materials]
    per_face = [remap[poly.material_index] for poly in me.polygons]
    me.materials.clear()
    for m in final:
        me.materials.append(m)
    # clearing the slots resets every face to slot 0: put each back on its merged material
    for poly, idx in zip(me.polygons, per_face):
        poly.material_index = idx
    BODY.name = 'LanternHallDestrier'


def export():
    ARM.data.pose_position = 'POSE'
    consolidate()
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        export_apply=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        # the source clips are keyed on fractional frames (Run ends at 9.6); sampling on whole
        # frames would clip every loop short of its seam, so the keys go out as authored
        export_force_sampling=False,
        export_skins=True,
        export_yup=True,
    )


def report_spec_offsets():
    """The renderer's lamp and glow offsets (src/render/mount_visuals.ts) are in each bone's
    LOCAL frame in model units: print them from the rest bones so the spec is measured, not
    eyeballed."""
    for bone, point in GLOW_POINTS.items():
        local = ARM.data.bones[bone].matrix_local.inverted() @ point
        print('SPEC', bone, tuple(round(c, 4) for c in local))


report_spec_offsets()
export()
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print('BUILT', OUT)
