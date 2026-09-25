"""Wickharbor's wooden harbor: the shore boardwalk, the two north piers, the two bluff stairs and
the Old Beacon's dock and stair, rebuilt as one harbor in the ferry wharf's wood.

  npx tsx scripts/assets/wickharbor_harbor/layout.ts        (refresh layout.json from the sim)
  blender --background --python scripts/assets/wickharbor_harbor/build_wickharbor_harbor.py -- \
      [--save FILE.blend --context TERRAIN.json [--render OUT_DIR]]

Writes wickharbor_harbor_source.glb beside this file. `node scripts/assets/wickharbor_harbor/build.mjs`
ships it (validate, fingerprint, meshopt) to public/models/props/wickharbor_harbor.glb, and
src/render/wickharbor_harbor.ts places it on the waterline at the harbor frame's centre.

Every walkable plank, rail and solid here stands where the sim says it does: the decks, rails and
props come from src/sim/content/wickharbor_harbor.ts through layout.json (model frame: yards,
origin on the waterline at WICKHARBOR_HARBOR_FRAME, +x east, +y up, +z the world's +z), each
deck's footprint a convex polygon with its cuts applied, and every pile, post and footing runs
down into the terrain under it (the layout's height grids), so nothing floats. Each level deck is
ONE plank field at one height, its boards clipped to its footprint, so where two decks meet (a
pier on the boardwalk's edge, the Beacon dock at its stair's foot) the boards of each stop at the
shared edge and nothing is doubled. The south stair's first tread rests on the boardwalk a step
above its planks; the wharf's flight (drawn by the wharf's own model) stands on its south end.

The recipe, the palette and the materials are the Wyrmwatch cliff harbor's and the Wickharbor
ferry wharf's (scripts/assets/wyrmwatch_harbor/build_wyrmwatch_harbor.py, imported here as W, and
scripts/assets/wickharbor_wharf/build_wickharbor_wharf.py, whose deck, frame, flight, rail and
cargo recipes this generalises to any deck), on the Eastbrook ferry's shared builder library
(scripts/assets/eastbrook_ferry/shiplib.py), so the whole waterfront is one wood.

Hierarchy (the runtime keeps or sheds these by graphics tier; the sim collides with what the low
tier keeps, so every solid is in a low-tier part):

  WickharborHarbor_ROOT  root, placed on the waterline at the harbor frame's centre
    HarborDecks          the plank fields: the boardwalk, the two piers, the Beacon dock
    HarborFrame          fascia, joists, pile bents to the seabed, bracing, the stone footings
    HarborStairs         the three stairs: treads, risers, stringers, posts, the stone plinths
    HarborRails          every rail, its posts and newels
    HarborLanterns       the lantern posts and the newel lanterns (the landmarks)
    HarborCargo          crate stacks and barrels (all collide)
    HarborTrim           medium tier and up: fender piles, mooring rings, cleats, bolts, iron
    HarborClutter        high tier and up: rope coils, crab pots, sacks, nets, oars, a bucket

Everything is original procedural work for this project.
"""
import json
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'eastbrook_ferry'))
sys.path.insert(0, os.path.join(HERE, '..', 'wyrmwatch_harbor'))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from shiplib import IRON, P, ROPE, WOOD, Piece, empty, triangles  # noqa: E402

import build_wyrmwatch_harbor as W  # noqa: E402

STONE = W.STONE
PAL = W.PAL

with open(os.path.join(HERE, 'layout.json'), encoding='utf8') as fh:
    LAYOUT = json.load(fh)

RAIL_H = LAYOUT['railHeight']
BW_TOP = LAYOUT['boardwalkTop']
PLANK_T = 0.16
BURY = 0.8          # piles and posts run this far into the ground under them
DECKS = {d['id']: d for d in LAYOUT['decks']}
PROPS = LAYOUT['props']
LEVEL_DECKS = ('boardwalk', 'pierNorth', 'pierMiddle', 'beaconPier')
STAIRS = ('stairSouth', 'stairNorth', 'beaconStair')


def pick(seq, i):
    return seq[i % len(seq)]


# ---------------------------------------------------------------------------
# Terrain (model frame): the layout's grids, the first that holds the point
# ---------------------------------------------------------------------------
def ground(x, z):
    """Bilinear terrain height (above the waterline) from the layout grids."""
    for T in LAYOUT['terrain']:
        fx = (x - T['x0']) / T['step']
        fz = (z - T['z0']) / T['step']
        if fx < 0 or fz < 0 or fx > T['nx'] - 1 or fz > T['nz'] - 1:
            continue
        fx = min(fx, T['nx'] - 1.0001)
        fz = min(fz, T['nz'] - 1.0001)
        i, j = int(fx), int(fz)
        tx, tz = fx - i, fz - j
        h, n = T['h'], T['nx']
        a, b = h[j * n + i], h[j * n + i + 1]
        c, d = h[(j + 1) * n + i], h[(j + 1) * n + i + 1]
        return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
    return -1.3  # the bay's bed off the grids


def foot(x, z):
    return ground(x, z) - BURY


# ---------------------------------------------------------------------------
# Deck frames and footprints
# ---------------------------------------------------------------------------
def at(d, a, c):
    """A deck-frame point (along, across) in the model frame (x, z)."""
    sa, ca = math.sin(d['rot']), math.cos(d['rot'])
    return (d['x'] + sa * a + ca * c, d['z'] + ca * a - sa * c)


def surf(d, a):
    t = min(1.0, max(0.0, (a + d['hl']) / (2 * d['hl'])))
    return d['near'] + (d['far'] - d['near']) * t


def xyz(d, a, c, y):
    x, z = at(d, a, c)
    return (x, y, z)


def clip(poly, a0, a1, c0, c1):
    """A convex (along, across) polygon clipped to the rectangle a0..a1 x c0..c1."""
    def cut(pts, inside, meet):
        out = []
        for i in range(len(pts)):
            p, q = pts[i], pts[(i + 1) % len(pts)]
            ip, iq = inside(p), inside(q)
            if ip:
                out.append(p)
            if ip != iq:
                out.append(meet(p, q))
        return out

    def on_a(v):
        return lambda p, q: (v, p[1] + (q[1] - p[1]) * (v - p[0]) / (q[0] - p[0]))

    def on_c(v):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (v - p[1]) / (q[1] - p[1]), v)

    pts = [tuple(p) for p in poly]
    for inside, meet in ((lambda p: p[0] >= a0, on_a(a0)), (lambda p: p[0] <= a1, on_a(a1)),
                         (lambda p: p[1] >= c0, on_c(c0)), (lambda p: p[1] <= c1, on_c(c1))):
        if not pts:
            break
        pts = cut(pts, inside, meet)
    return pts


def span_at(poly, a):
    """The across interval of a convex polygon at along `a` (None off it)."""
    xs = []
    for i in range(len(poly)):
        (a0, c0), (a1, c1) = poly[i], poly[(i + 1) % len(poly)]
        if (a0 - a) * (a1 - a) <= 0 and a0 != a1:
            xs.append(c0 + (c1 - c0) * (a - a0) / (a1 - a0))
        elif a0 == a1 == a:
            xs.extend((c0, c1))
    if len(xs) < 2:
        return None
    return min(xs), max(xs)


def along_span(poly, c):
    """The along interval of a convex polygon at across `c`."""
    flipped = [(q, p) for p, q in poly]
    return span_at(flipped, c)


def hslab(p, d, poly, top, thick, color, mat=WOOD):
    """A horizontal slab over a deck-frame polygon, its top at `top`."""
    if len(poly) < 3:
        return
    bm = p.bm
    tops = [bm.verts.new(P(*xyz(d, a, c, top))) for a, c in poly]
    bots = [bm.verts.new(P(*xyz(d, a, c, top - thick))) for a, c in poly]
    faces = [bm.faces.new(tops), bm.faces.new(list(reversed(bots)))]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((bots[i], bots[j], tops[j], tops[i])))
    p.paint(faces, color, mat)
    p.closed.extend(faces)


def rows(a0, a1, spacing):
    n = max(1, int(math.ceil((a1 - a0) / spacing)))
    return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def poly_bounds(poly):
    return (min(q[0] for q in poly), max(q[0] for q in poly), min(q[1] for q in poly), max(q[1] for q in poly))


# ---------------------------------------------------------------------------
# The plank fields: one height each, courses across the heading, clipped to the footprint
# ---------------------------------------------------------------------------
BOARD_LEN = 3.3      # boards butt-jointed along each course, staggered course to course
COURSE = 0.55        # course pitch (a board's width), fitted to each deck


def build_decks():
    p = Piece('HarborDecks', wear=0.08, gradient=0.12)
    course = 0
    for name in LEVEL_DECKS:
        d = DECKS[name]
        poly = d['polygon']
        a_lo, a_hi, c_lo, c_hi = poly_bounds(poly)
        top = d['near']
        n = max(1, int(round((a_hi - a_lo) / COURSE)))
        step = (a_hi - a_lo) / n
        for i in range(n):
            s0 = a_lo + step * i + 0.025
            s1 = a_lo + step * (i + 1) - 0.025
            offset = (course % 3) * BOARD_LEN / 3
            cuts = [c_lo]
            c = c_lo + BOARD_LEN - offset
            while c < c_hi - 0.6:
                if c - cuts[-1] > 0.6:
                    cuts.append(c)
                c += BOARD_LEN
            cuts.append(c_hi)
            for j in range(len(cuts) - 1):
                lo = cuts[j] + (0.015 if j > 0 else 0.0)
                hi = cuts[j + 1] - (0.015 if j + 2 < len(cuts) else 0.0)
                board = clip(poly, s0, s1, lo, hi)
                if len(board) < 3:
                    continue
                lift = (p.rng.random() - 0.5) * 0.012
                hslab(p, d, board, top + lift, PLANK_T, pick(PAL['deck'], course * 3 + j))
            course += 1
    return p


# ---------------------------------------------------------------------------
# The frame: fascia, joists, pile bents, bracing, the stone footings
# ---------------------------------------------------------------------------
def outline(poly):
    """The polygon's edges, each with its inward unit normal (deck frame)."""
    out = []
    n = len(poly)
    # the polygon is counter-clockwise in (along, across); its inside is on the left
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sign = 1 if area > 0 else -1
    for i in range(n):
        (a0, c0), (a1, c1) = poly[i], poly[(i + 1) % n]
        length = math.hypot(a1 - a0, c1 - c0)
        if length < 1e-6:
            continue
        na, nc = -(c1 - c0) / length * sign, (a1 - a0) / length * sign
        out.append((a0, c0, a1, c1, na, nc))
    return out


def brace_line(p, d, pts, hi, idx0=0):
    for i in range(len(pts) - 1):
        (aa, ca), (ab, cb) = pts[i], pts[i + 1]
        xa, za = at(d, aa, ca)
        xb, zb = at(d, ab, cb)
        ga, gb = max(ground(xa, za), -1.2) + 0.25, max(ground(xb, zb), -1.2) + 0.25
        if hi - max(ga, gb) < 1.0:
            continue
        if (i + idx0) % 2 == 0:
            W.beam(p, (xa, hi, za), (xb, gb, zb), 0.2, 0.22, PAL['post_dark'])
        else:
            W.beam(p, (xa, ga, za), (xb, hi, zb), 0.2, 0.22, PAL['post_dark'])


def stone_line(p, x0, z0, x1, z1, top, thick, seed=0):
    """A coursed stone wall from the ground up to `top` along a straight model-frame line,
    each course stopping at the ground (the wharf's root wall)."""
    length = math.hypot(x1 - x0, z1 - z0)
    if length < 0.2:
        return
    ux, uz = (x1 - x0) / length, (z1 - z0) / length
    yaw = math.atan2(ux, uz)
    course_h = 0.55
    low = min(ground(x0 + ux * length * k / 10, z0 + uz * length * k / 10) for k in range(11)) - 0.3
    if top - low < 0.2:
        return
    k = 0
    y = top - course_h
    while y + course_h > low:
        t = -0.55 if k % 2 else 0.0
        j = 0
        while t < length:
            ta, tb = max(0.0, t), min(length, t + 1.1)
            if tb - ta > 0.15:
                tm = (ta + tb) / 2
                g = min(ground(x0 + ux * ta, z0 + uz * ta), ground(x0 + ux * tb, z0 + uz * tb))
                if y + course_h > g - 0.35:
                    bulge = 0.04 + p.rng.random() * 0.05
                    p.box((x0 + ux * tm, y + course_h / 2, z0 + uz * tm),
                          (thick + bulge, course_h - 0.05, (tb - ta) - 0.05), pick(PAL['stone'], j + k * 3 + seed),
                          STONE, yaw=yaw)
            t += 1.1
            j += 1
        y -= course_h
        k += 1
    p.box(((x0 + x1) / 2, top + 0.06, (z0 + z1) / 2), (thick + 0.14, 0.12, length), PAL['stone_dark'], STONE, yaw=yaw)


def build_frame():
    p = Piece('HarborFrame', wear=0.07, gradient=0.14)
    for name in LEVEL_DECKS:
        d = DECKS[name]
        poly = d['polygon']
        under = d['near'] - PLANK_T
        a_lo, a_hi, c_lo, c_hi = poly_bounds(poly)
        # heavy fascia beams dressing the plank ends round the whole footprint
        for a0, c0, a1, c1, na, nc in outline(poly):
            k = 0.14
            W.beam(p, xyz(d, a0 + na * k, c0 + nc * k, under - 0.18), xyz(d, a1 + na * k, c1 + nc * k, under - 0.18),
                   0.28, 0.38, PAL['post'])
        # joists along the heading under the courses
        width = c_hi - c_lo
        n_joists = max(2, int(round(width / 1.3)))
        for i in range(n_joists):
            c = c_lo + 0.45 + (width - 0.9) * i / (n_joists - 1)
            span = along_span(poly, c)
            if span is None or span[1] - span[0] < 0.6:
                continue
            W.beam(p, xyz(d, span[0] + 0.2, c, under - 0.13), xyz(d, span[1] - 0.2, c, under - 0.13), 0.2, 0.24,
                   PAL['post_dark'])
        # pile bents across the deck every ~2.3 yd: piles at the edges and the middle, a cap
        bents = rows(a_lo + 0.45, a_hi - 0.4, 2.3)
        cap = under - 0.3
        lines = {'lo': [], 'hi': []}
        for a in bents:
            span = span_at(poly, a)
            if span is None or span[1] - span[0] < 1.0:
                continue
            lo, hi = span[0] + 0.3, span[1] - 0.3
            cols = (lo, (lo + hi) / 2, hi) if hi - lo > 2.4 else (lo, hi)
            for c in cols:
                x, z = at(d, a, c)
                W.post(p, x, z, under - 0.1, foot(x, z), 0.42, PAL['pile'])
            W.beam(p, xyz(d, a, span[0] + 0.1, cap), xyz(d, a, span[1] - 0.1, cap), 0.3, 0.3, PAL['post_dark'])
            lines['lo'].append((a, lo))
            lines['hi'].append((a, hi))
        for idx, key in enumerate(('lo', 'hi')):
            brace_line(p, d, lines[key], under - 0.55, idx)
    # the boardwalk's landward footing: a coursed stone wall under its bluff edge, where the
    # beach and the bluff's foot come up to the planks
    bw = DECKS['boardwalk']
    x0, z0 = at(bw, -bw['hl'] + 0.1, -bw['hw'] - 0.1)
    x1, z1 = at(bw, bw['hl'] - 0.1, -bw['hw'] - 0.1)
    stone_line(p, x0, z0, x1, z1, bw['near'] - PLANK_T - 0.12, 0.6, seed=1)
    return p


# ---------------------------------------------------------------------------
# The stairs: treads that follow the walked ramp, stringers, posts, stone plinths
# ---------------------------------------------------------------------------
RISE = 0.42          # the tread rise the stairs are divided into (the ramp is walked)


def build_stair(p, d, first_on=None):
    """One stair along its deck: tread k at the bottom's height plus k risers, each covering
    the ramp heights within half a riser of its top (the sim walks the ramp). `first_on` is
    the height of the floor the bottom tread stands on, if it stands on one."""
    hl, hw = d['hl'], d['hw']
    bottom_near = d['near'] <= d['far']
    y_bot, y_top = (d['near'], d['far']) if bottom_near else (d['far'], d['near'])
    risers = max(3, int(round((y_top - y_bot) / RISE)))
    rise = (y_top - y_bot) / risers
    length = 2 * hl
    sgn = 1 if bottom_near else -1       # along runs this way from the bottom up

    def al(t):
        """along at distance t from the bottom end."""
        return sgn * (t - hl)

    def y_at(t):
        return y_bot + (y_top - y_bot) * min(1.0, max(0.0, t / length))

    inner = hw * 2 - 0.62
    for k in range(risers + 1):
        t0 = max(0.0, (k - 0.5) * length / risers)
        t1 = min(length, (k + 0.5) * length / risers)
        if t1 - t0 < 0.05:
            continue
        ytop = y_bot + k * rise
        x, z = at(d, al((t0 + t1) / 2), 0)
        p.box((x, ytop - 0.07, z), (inner, 0.14, (t1 - t0) + 0.05), pick(PAL['plank'], k), WOOD, yaw=d['rot'])
        # the nosing on the tread's downhill edge and the riser board under it
        xn, zn = at(d, al(t0 + 0.05), 0)
        p.box((xn, ytop - 0.05, zn), (inner, 0.1, 0.12), PAL['trim_dark'], WOOD, yaw=d['rot'])
        if k == 0:
            below = first_on if first_on is not None else ytop - 0.3
        else:
            below = ytop - rise
        xr, zr = at(d, al(t0), 0)
        if ytop - 0.1 - below > 0.03:
            p.box((xr, (ytop - 0.1 + below) / 2, zr), (inner - 0.02, ytop - 0.1 - below, 0.06), PAL['seam'], WOOD,
                  yaw=d['rot'])
    if first_on is not None:
        # a sill under the first tread, bedded on the floor it stands on
        xs, zs = at(d, al(0.3), 0)
        p.box((xs, first_on + 0.06, zs), (hw * 2 - 0.1, 0.12, 0.55), PAL['post_dark'], WOOD, yaw=d['rot'])
    # the two stringers, a hand under the ramp line from the bottom to the top
    s0 = 0.35 if first_on is not None else 0.0
    for s in (1, -1):
        c = s * (hw - 0.16)
        xa, za = at(d, al(s0), c)
        xb, zb = at(d, al(length), c)
        W.beam(p, (xa, y_at(s0) - 0.2, za), (xb, y_at(length) - 0.2, zb), 0.3, 0.5, PAL['post'])
    # posts under the stringers down into the ground, a cross beam on each pair
    for t in rows(0.9, length - 0.5, 2.1):
        y = y_at(t) - 0.45
        pair = []
        for s in (1, -1):
            x, z = at(d, al(t), s * (hw - 0.16))
            if y - ground(x, z) > 0.25:
                W.post(p, x, z, y, foot(x, z), 0.34, PAL['pile'])
                pair.append(True)
        if len(pair) == 2 and y - 0.2 - max(ground(*at(d, al(t), 0)), -1.2) > 0.3:
            xa, za = at(d, al(t), -hw + 0.2)
            xb, zb = at(d, al(t), hw - 0.2)
            W.beam(p, (xa, y - 0.2, za), (xb, y - 0.2, zb), 0.24, 0.24, PAL['post_dark'])
    return y_top, al(length)


def build_stairs():
    p = Piece('HarborStairs', wear=0.07, gradient=0.14)
    # the south stair's first tread stands on the boardwalk; the north stair starts from its
    # edge; the Beacon stair comes down onto its dock
    build_stair(p, DECKS['stairSouth'], first_on=BW_TOP)
    build_stair(p, DECKS['stairNorth'])
    build_stair(p, DECKS['beaconStair'])
    # stone plinths under the bluff stairs' heads, from the ground up under the top tread
    for name in ('stairSouth', 'stairNorth'):
        d = DECKS[name]
        top = d['far']
        a = d['hl'] - 0.45
        x0, z0 = at(d, a, -d['hw'] - 0.05)
        x1, z1 = at(d, a, d['hw'] + 0.05)
        stone_line(p, x0, z0, x1, z1, top - 0.2, 0.8, seed=5)
    return p


# ---------------------------------------------------------------------------
# Railings (the wharf's recipe on this harbor's rails)
# ---------------------------------------------------------------------------
NEWEL_TOP = 0.2
# rail corners that carry a newel lantern: (rail index, corner index). The seaward line (0):
# the boardwalk's north end, the north pier's head (its other corner has a lantern post), the
# two pier mouths either side of the boardwalk, the middle pier's head (ditto), and the wharf
# flight's foot; the stairs' heads (1 to 4); the Beacon stair's head and foot (5).
NEWEL_LANTERNS = {(0, 0), (0, 3), (0, 5), (0, 6), (0, 8), (0, 9), (0, 10), (1, 0), (2, 0), (3, 0), (4, 0),
                  (5, 0), (5, 1), (5, 6), (5, 7)}


def build_rails():
    p = Piece('HarborRails', wear=0.06, gradient=0.12)
    lanterns = []
    for ri, rail in enumerate(LAYOUT['rails']):
        for ci, c in enumerate(rail['corners']):
            top = c['y'] + RAIL_H + NEWEL_TOP
            W.post(p, c['x'], c['z'], top, c['y'] - 0.05, 0.28, PAL['post_dark'])
            p.box((c['x'], top + 0.06, c['z']), (0.36, 0.12, 0.36), PAL['trim_dark'], WOOD)
            if (ri, ci) in NEWEL_LANTERNS:
                lanterns.append((c['x'], top + 0.12, c['z']))
            else:
                p.box((c['x'], top + 0.2, c['z']), (0.22, 0.16, 0.22), PAL['post'], WOOD, taper=0.3)
        for leg in rail['legs']:
            pts = [(s['x'], s['y'], s['z']) for s in leg]
            length = math.hypot(pts[-1][0] - pts[0][0], pts[-1][2] - pts[0][2])
            if length < 0.2:
                continue
            n = max(1, int(math.ceil(length / 1.35)))
            for k in range(1, n):
                idx = k / n * (len(pts) - 1)
                i0 = min(int(idx), len(pts) - 2)
                f = idx - i0
                x = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f
                y = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f
                z = pts[i0][2] + (pts[i0 + 1][2] - pts[i0][2]) * f
                W.post(p, x, z, y + RAIL_H - 0.05, y - 0.05, 0.15, PAL['post'])
            line = W.simplify(pts)
            for lift, w, h, col in ((RAIL_H - 0.02, 0.17, 0.11, PAL['trim_dark']), (0.62, 0.1, 0.09, PAL['post'])):
                p.beam([(x, y + lift, z) for x, y, z in line], w, h, col, WOOD, up=(0, 1, 0))
    return p, lanterns


# ---------------------------------------------------------------------------
# Lanterns, cargo (the solids), trim and clutter
# ---------------------------------------------------------------------------
def build_lanterns(newel_tops):
    p = Piece('HarborLanterns', wear=0.04, gradient=0.08)
    iron = PAL['iron']
    for q in PROPS:
        if q['kind'] != 'lanternPost':
            continue
        x, z, base = q['x'], q['z'], q['base']
        top = base + q['height'] - 0.3
        W.post(p, x, z, base + 0.3, base - 0.05, 0.5, PAL['post_dark'], WOOD)
        W.post(p, x, z, top, base + 0.28, 0.3, PAL['post_dark'], WOOD, bevel=0.025)
        p.box((x, top + 0.08, z), (0.4, 0.16, 0.4), PAL['trim_dark'], WOOD)
        ca, sa = math.cos(q['rot']), -math.sin(q['rot'])
        ax, az = x + ca * 0.95, z + sa * 0.95
        W.beam(p, (x + ca * 0.15, top - 0.12, z + sa * 0.15), (ax + ca * 0.05, top - 0.12, az + sa * 0.05), 0.08,
               0.08, iron, IRON)
        W.beam(p, (x + ca * 0.15, top - 0.62, z + sa * 0.15), (x + ca * 0.62, top - 0.14, z + sa * 0.62), 0.06,
               0.06, iron, IRON)
        p.box((ax, top - 0.3, az), (0.04, 0.3, 0.04), iron, IRON)
        W.lantern(p, ax, top - 0.7, az, 0.36)
    for x, y, z in newel_tops:
        W.lantern(p, x, y + 0.26, z, 0.3)
    return p


def build_cargo():
    p = Piece('HarborCargo', wear=0.08, gradient=0.12)
    for q in PROPS:
        k, x, z, base = q['kind'], q['x'], q['z'], q['base']
        if k == 'crateStack':
            hw, hd = q['hw'], q['hd']
            s = min(hw * 2, hd) * 0.96
            # two crates side by side along the stack's local z, a third on top
            lz = (math.sin(q['rot']), math.cos(q['rot']))
            for sgn, col, yaw in ((-1, 1, 0.05), (1, 2, -0.08)):
                cx, cz = x + lz[0] * sgn * hd / 2, z + lz[1] * sgn * hd / 2
                W.crate(p, cx, base, cz, s, q['rot'] + yaw, pick(PAL['plank'], col))
            W.crate(p, x, base + s, z, s * 0.85, q['rot'] + 0.3, pick(PAL['plank'], 3))
        elif k == 'barrel':
            r, h = q['r'] * 0.95, q['height']
            p.sweep([(x, base, z), (x, base + h * 0.5, z), (x, base + h, z)], r, r, pick(PAL['plank'], int(abs(z) * 10)),
                    sides=10, radii=[r * 0.84, r, r * 0.84])
            p.cylinder((x, base + h - 0.01, z), (x, base + h + 0.02, z), r * 0.8, PAL['trim_dark'], WOOD, sides=10)
    return p


# where boats lie against the harbor: (deck, along from, along to, side) for the fender piles
FENDERS = (('pierNorth', 3.0, 11.6, 1), ('pierMiddle', -8.0, 11.6, 1), ('pierMiddle', -8.0, 11.6, -1),
           ('beaconPier', -9.0, 12.6, 1), ('beaconPier', -9.0, 12.6, -1))


def build_trim():
    p = Piece('HarborTrim', wear=0.05, gradient=0.06)
    iron, hi = PAL['iron'], PAL['iron_hi']
    # fender piles down the piers' sides where boats lie, a mooring ring between each pair,
    # and an iron cleat on the fascia beside every other ring
    for name, a0, a1, side in FENDERS:
        d = DECKS[name]
        top = d['near'] - PLANK_T - 0.1
        n = max(1, int((a1 - a0) / 2.4))
        step = (a1 - a0) / n
        for i in range(n + 1):
            a = a0 + step * i
            x, z = at(d, a, side * (d['hw'] + 0.12))
            bed = max(ground(x, z), -1.4)
            p.box((x, (top + bed) / 2, z), (0.22, top - bed, 0.22), PAL['pile'], WOOD, yaw=d['rot'])
            if i < n:
                xr, zr = at(d, a + step / 2, side * (d['hw'] + 0.05))
                sa, ca = math.sin(d['rot']), math.cos(d['rot'])
                p.ring((xr, top - 0.3, zr), 0.14, 0.035, iron, segments=10, axis=(ca * side, 0, -sa * side), mat=IRON,
                       depth=0.035)
                if i % 2 == 0:
                    xc, zc = at(d, a + step / 2 + 0.5, side * (d['hw'] + 0.06))
                    p.box((xc, top + 0.02, zc), (0.1, 0.1, 0.42), iron, IRON, yaw=d['rot'], bevel=0.015)
    # bolt heads along the fascia of every plank field
    for name in LEVEL_DECKS:
        d = DECKS[name]
        under = d['near'] - PLANK_T
        for a0, c0, a1, c1, na, nc in outline(d['polygon']):
            length = math.hypot(a1 - a0, c1 - c0)
            m = max(1, int(length / 1.6))
            for i in range(m + 1):
                t = (0.2 + (length - 0.4) * i / m) / length if length > 0.4 else 0.5
                x, z = at(d, a0 + (a1 - a0) * t - na * 0.01, c0 + (c1 - c0) * t - nc * 0.01)
                p.box((x, under - 0.18, z), (0.09, 0.09, 0.09), hi, IRON, yaw=d['rot'])
    # iron straps on the stairs' stringers
    for name in STAIRS:
        d = DECKS[name]
        for t in rows(-d['hl'] + 0.6, d['hl'] - 0.6, 1.8):
            y = surf(d, t) - 0.2
            for s in (1, -1):
                x, z = at(d, t, s * (d['hw'] - 0.01))
                p.box((x, y, z), (0.04, 0.42, 0.12), iron, IRON, yaw=d['rot'])
    # iron on the cargo: barrel bands, crate battens
    for q in PROPS:
        k, x, z, base = q['kind'], q['x'], q['z'], q['base']
        if k == 'barrel':
            r = q['r'] * 0.95
            for yy in (0.2, q['height'] - 0.2):
                p.ring((x, base + yy, z), r * 0.9 + 0.01, 0.06, iron, segments=10, axis=(0, 1, 0), mat=IRON, depth=0.03)
    return p


def crab_pot(p, x, y, z, yaw):
    """A slatted crab pot: a frame of battens round an open box, a rope on its lid."""
    s = 0.62
    for dy in (0.04, s - 0.04):
        p.box((x, y + dy, z), (s, 0.06, s * 1.3), PAL['post'], WOOD, yaw=yaw)
    for sx in (-1, 1):
        for sz in (-1, 1):
            ox = math.cos(yaw) * sx * (s / 2 - 0.03) + math.sin(yaw) * sz * (s * 0.65 - 0.03)
            oz = -math.sin(yaw) * sx * (s / 2 - 0.03) + math.cos(yaw) * sz * (s * 0.65 - 0.03)
            p.box((x + ox, y + s / 2, z + oz), (0.06, s, 0.06), PAL['post_dark'], WOOD)
    p.box((x, y + s * 0.5, z), (s - 0.1, s - 0.12, s * 1.3 - 0.1), PAL['net'], ROPE, yaw=yaw)


def build_clutter():
    p = Piece('HarborClutter', wear=0.06, gradient=0.08)
    for q in PROPS:
        k, x, z, base = q['kind'], q['x'], q['z'], q['base']
        if k == 'barrel':
            # a coiled line beside every barrel, on the walk side of it
            dx, dz = -x, -z
            ln = math.hypot(dx, dz) or 1.0
            W.coil(p, x + dx / ln * 0.2 + 0.55 * math.cos(q['rot']), base,
                   z + dz / ln * 0.2 - 0.55 * math.sin(q['rot']), 0.28)
        elif k == 'crateStack':
            # a small crate on top of each stack
            p.box((x, base + q['height'] + 0.2, z), (0.42, 0.4, 0.42), PAL['plank'][0], WOOD, bevel=0.02, yaw=0.5)
    # crab pots stacked by the boardwalk's landward rail, between the stairs
    bw = DECKS['boardwalk']
    for i, (a, c, lift) in enumerate(((-1.6, -1.12, 0.0), (-0.95, -1.12, 0.0), (-1.3, -1.12, 0.62))):
        x, z = at(bw, a, c)
        crab_pot(p, x, bw['near'] + lift, z, bw['rot'] + 0.1 * i)
    # a net heaped on the middle pier's head, by its crates, and sacks on the Beacon dock
    pm = DECKS['pierMiddle']
    nx, nz = at(pm, 10.9, -0.55)
    p.rock_blob((nx, pm['near'] + 0.1, nz), (0.9, 0.26, 0.7), PAL['net'], ROPE, jitter=0.2)
    bp = DECKS['beaconPier']
    for i, (a, c) in enumerate(((9.2, -1.45), (8.7, -1.5))):
        sx, sz = at(bp, a, c)
        p.rock_blob((sx, bp['near'] + 0.26, sz), (0.55, 0.5, 0.45), PAL['rope_dark'], ROPE, jitter=0.12)
    # two oars leaning on the north pier's south rail, and a bucket by them
    pn = DECKS['pierNorth']
    for da in (0.0, 0.35):
        x0, z0 = at(pn, 6.0 + da, -1.35)
        x1, z1 = at(pn, 6.2 + da, -1.62)
        W.beam(p, (x0, pn['near'] + 0.05, z0), (x1, pn['near'] + 2.1, z1), 0.08, 0.08, PAL['post'])
    bx, bz = at(pn, 7.2, -1.2)
    p.cylinder((bx, pn['near'], bz), (bx, pn['near'] + 0.38, bz), 0.2, PAL['post'], WOOD, sides=8, r1=0.24)
    return p


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------
CRITICAL = ('HarborDecks', 'HarborFrame', 'HarborStairs', 'HarborRails', 'HarborLanterns', 'HarborCargo')
TRIM = ('HarborTrim',)
OPTIONAL = ('HarborClutter',)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = W.make_materials()
    root = empty('WickharborHarbor_ROOT', None, display='ARROWS', size=2.0)
    pieces = {}
    rails, newel_tops = build_rails()
    for piece in (build_decks(), build_frame(), build_stairs(), rails, build_lanterns(newel_tops), build_cargo(),
                  build_trim(), build_clutter()):
        pieces[piece.name] = piece.finish(mats, root)
    root['wickharborHarbor'] = {
        'origin': [LAYOUT['origin']['x'], LAYOUT['origin']['z']],
        'layoutVersion': LAYOUT['version'],
        'tiers': {'low': list(CRITICAL), 'medium': list(TRIM), 'high': list(OPTIONAL)},
        'boardwalkTop': BW_TOP,
        'decks': {d['id']: [d['near'], d['far']] for d in LAYOUT['decks']},
        'railHeight': RAIL_H,
    }
    return dict(root=root, pieces=pieces, mats=mats)


def report(objs):
    total = 0
    for name, obj in objs['pieces'].items():
        n = triangles(obj)
        total += n
        print(f'PIECE {name} triangles {n}')
    print(f'TRIANGLES total {total}')
    print(f"TRIANGLES low tier {sum(triangles(objs['pieces'][n]) for n in CRITICAL)}")
    return total


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


if __name__ == '__main__':
    objs = build_scene()
    report(objs)
    W.export(os.path.join(HERE, 'wickharbor_harbor_source.glb'), objs)
    if arg('--save'):
        import harbor_review  # noqa: E402

        harbor_review.stage(objs, arg('--context'))
        harbor_review.save(arg('--save'))
