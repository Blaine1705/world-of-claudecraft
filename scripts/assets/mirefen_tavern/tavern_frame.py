"""The Mirefen tavern's frame (build_tavern.py calls build(B, parts) with itself as B): the parts
the camera never cuts away. The stone base under every wall, every floor the sim walks (the
hall's boards, the hearth pit and its step, the bar platform, the porch and its steps, the
tower's ground landing, the stone spiral and the landing at its head, the wing's upper floor),
the round hearth and its copper hood and flue, the posts, plates, tie beams and nook beams,
and the bar's stone pillar and counters.

Every walking surface is laid at the height the sim's floor surface gives it
(src/sim/mirefen_tavern_floor.ts): the spiral's treads each stand at the ramp's height at
their middle, the ramped edges of the pit and the platform are drawn as bevelled curbs, the
porch steps stop on the ground."""
import math


def build(B, parts):
    p = parts['TavernFrame']
    trim = parts['TavernTrim']
    plinth(B, p)
    hall_floor(B, p)
    pit_and_hearth(B, p, trim)
    hood(B, p, trim)
    bar_platform(B, p)
    porch(B, p)
    tower_floor_and_stair(B, p, trim)
    upper_floor(B, p)
    posts_and_beams(B, p, trim)
    bar(B, p, trim)


# ---------------------------------------------------------------------------
# Stone base: coursed blue-grey blocks from the ground floor down into the ground
# ---------------------------------------------------------------------------
def plinth_run(B, p, wall, t, seed):
    """The base under one straight outer wall: a backing mass and block faces on the outside,
    each course stopping where it meets the ground."""
    L = wall.length
    samples = [wall.xz(L * k / 12, t / 2) for k in range(13)]
    low = B.ground_min(samples) - 0.5
    if low >= -0.05:
        return
    wall.box(p, 0, L, low, 0.0, -t / 2, t / 2 + 0.05, B.PAL['stone_dark'], B.STONE)
    course = 0.8
    k = 0
    v = 0.0
    while v > low:
        u = -0.9 if k % 2 else 0.0
        j = 0
        while u < L:
            a, b = max(0.0, u), min(L, u + 1.9)
            if b - a > 0.2:
                g = min(B.ground(*wall.xz(a, t / 2)), B.ground(*wall.xz(b, t / 2)))
                if v > g - 0.4:
                    wall.box(p, a + 0.03, b - 0.03, max(v - course + 0.04, g - 0.5), v - 0.03, t / 2,
                             t / 2 + 0.1 + ((j * 7 + k * 3) % 3) * 0.015, B.pick(B.PAL['stone'], j + k * 3 + seed),
                             B.STONE)
            u += 1.9
            j += 1
        v -= course
        k += 1


def plinth(B, p):
    H, W, T = B.HALL, B.WING, B.TOWER
    t = H['wall']
    hx0, hx1, hz0, hz1 = H['x0'], H['x1'], H['z0'], H['z1']
    runs = [
        (B.Wall(hx0, hz1, hx1, hz1, (0, 1)), 1),        # the front
        (B.Wall(hx0, hz0, hx0, hz1, (-1, 0)), 2),       # the left
        (B.Wall(hx1, hz0, hx1, hz1, (1, 0)), 3),        # the right
        (B.Wall(hx0, hz0, -8.3, hz0, (0, -1)), 4),      # the back, west of the tower
        (B.Wall(W['x0'], W['z0'], W['x1'], W['z0'], (0, -1)), 5),   # the wing's back
        (B.Wall(W['x1'], W['z0'], W['x1'], W['z1'], (1, 0)), 6),    # the wing's east side
        (B.Wall(W['x0'], W['z0'], W['x0'], -21.9, (-1, 0)), 7),     # the wing's west side
    ]
    for wall, seed in runs:
        # the base's outer face stands flush under the wall's outer face
        shifted = B.Wall(wall.x0 - wall.nx * t / 2, wall.z0 - wall.nz * t / 2,
                         wall.x0 - wall.nx * t / 2 + wall.dx * wall.length,
                         wall.z0 - wall.nz * t / 2 + wall.dz * wall.length, (wall.nx, wall.nz))
        plinth_run(B, p, shifted, t, seed)
    # the tower's round base
    cx, cz, r1 = T['x'], T['z'], T['rOut']
    n = 28
    for i in range(n):
        a0 = -math.pi + 2 * math.pi * i / n
        a1 = a0 + 2 * math.pi / n
        am = (a0 + a1) / 2
        if abs(am) < math.radians(40):
            continue  # inside the hall
        x0, z0 = cx + math.sin(a0) * (r1 + 0.1), cz + math.cos(a0) * (r1 + 0.1)
        x1, z1 = cx + math.sin(a1) * (r1 + 0.1), cz + math.cos(a1) * (r1 + 0.1)
        g = min(B.ground(x0, z0), B.ground(x1, z1)) - 0.5
        if g >= -0.05:
            continue
        seg = B.Wall(x0, z0, x1, z1, (math.sin(am), math.cos(am)))
        k = 0
        v = 0.0
        while v > g:
            seg.box(p, 0.02, seg.length - 0.02, max(v - 0.58, g), v - 0.03, -0.9, 0.02,
                    B.pick(B.PAL['stone'], i + k), B.STONE)
            v -= 0.62
            k += 1


# ---------------------------------------------------------------------------
# The hall's floor: honey boards, broken round the hearth pit and under the bar
# ---------------------------------------------------------------------------
def hall_floor(B, p):
    H, pit, plat = B.HALL, B.LAYOUT['pit'], B.LAYOUT['platform']
    x0, x1 = H['x0'] + H['wall'], H['x1'] - H['wall']
    z0, z1 = H['z0'] + H['wall'], H['z1'] - H['wall']
    width = 0.95
    n = int(round((x1 - x0) / width))
    step = (x1 - x0) / n
    thick = 0.14
    for i in range(n):
        xa, xb = x0 + step * i + 0.004, x0 + step * (i + 1) - 0.004
        xm = (xa + xb) / 2
        spans = []
        za = z0
        if xm >= plat['x0'] - plat['rim']:
            za = plat['z1'] + plat['rim'] - 0.05
        dx = abs(xm - pit['x'])
        if dx < pit['rim']:
            half = math.sqrt(pit['rim'] ** 2 - dx * dx) - 0.05
            spans.append((za, pit['z'] - half))
            spans.append((pit['z'] + half, z1))
        else:
            spans.append((za, z1))
        for j, (a, b) in enumerate(spans):
            # boards come in lengths: break each run once at a staggered joint
            if b - a < 0.1:
                continue
            cut = a + (b - a) * (0.35 + 0.3 * ((i * 5) % 7) / 7)
            for k, (c, d) in enumerate(((a, cut - 0.004), (cut + 0.004, b))):
                if d - c > 0.05:
                    B.abox(p, xa, xb, -thick, 0.0, c, d, B.pick(B.PAL['board'], i * 3 + j + k), B.WOOD)
    # the thresholds: the front doorway and the stair arch, dressed stone
    door, arch = B.LAYOUT['door'], B.LAYOUT['arch']
    B.abox(p, door['x'] - door['width'] / 2, door['x'] + door['width'] / 2, -0.3, 0.02, z1, H['z1'],
           B.PAL['stone_dark'], B.STONE)
    B.abox(p, arch['x0'], arch['x1'], -0.3, 0.02, H['z0'], z0, B.PAL['stone_dark'], B.STONE)


# ---------------------------------------------------------------------------
# The hearth pit: flagstones one step down, the bevelled curb, the round hearth
# ---------------------------------------------------------------------------
def ring_pt(cx, cz, r, a):
    return (cx + math.sin(a) * r, cz + math.cos(a) * r)


def sector(B, p, cx, cz, r0, r1, a0, a1, y0, y1, color, mat, y1b=None, y1r=None, subdiv=1):
    """An annular sector solid from y0 to its top: flat at y1, or sloped to y1b at a1 (a
    spiral tread), or sloped radially to y1r at r1 (a curb)."""
    for s in range(subdiv):
        aa = a0 + (a1 - a0) * s / subdiv
        ab = a0 + (a1 - a0) * (s + 1) / subdiv
        ta = y1 if y1b is None else y1 + (y1b - y1) * s / subdiv
        tb = y1 if y1b is None else y1 + (y1b - y1) * (s + 1) / subdiv
        tro = y1r if y1r is not None else None
        p0 = ring_pt(cx, cz, r0, aa)
        p1 = ring_pt(cx, cz, r1, aa)
        p2 = ring_pt(cx, cz, r1, ab)
        p3 = ring_pt(cx, cz, r0, ab)
        t1a = ta if tro is None else tro
        t1b = tb if tro is None else tro
        B.hexa(p, [(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p2[0], y0, p2[1]), (p3[0], y0, p3[1]),
                   (p0[0], ta, p0[1]), (p1[0], t1a, p1[1]), (p2[0], t1b, p2[1]), (p3[0], tb, p3[1])],
               color, mat)


def pit_and_hearth(B, p, trim):
    pit = B.LAYOUT['pit']
    cx, cz = pit['x'], pit['z']
    d = -pit['depth']
    hearth = next(q for q in B.LAYOUT['props'] if q['kind'] == 'hearth')
    rh = hearth['r']
    # a mortar bed under the flags (the joints show it, never the ground)
    p.cylinder((cx, d - 0.5, cz), (cx, d - 0.12, cz), pit['rim'], B.PAL['stone_dark'], B.STONE, sides=24)
    # flagstones in three rings
    rings = [(rh - 0.2, 2.9, 12), (2.9, 4.2, 16), (4.2, pit['r'], 20)]
    for ri, (r0, r1, n) in enumerate(rings):
        for i in range(n):
            a0 = 2 * math.pi * i / n + ri * 0.2
            a1 = a0 + 2 * math.pi / n
            sector(B, p, cx, cz, r0 + 0.02, r1 - 0.02, a0 + 0.012, a1 - 0.012, d - 0.2, d,
                   B.pick(B.PAL['flag'], i * 3 + ri), B.STONE, subdiv=1 if n > 12 else 2)
    # the bevelled curb the sim ramps up: from the pit floor at r to the hall floor at rim
    n = 32
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + 2 * math.pi / n
        sector(B, p, cx, cz, pit['r'], pit['rim'] + 0.05, a0, a1, d - 0.25, d, B.pick(B.PAL['stone'], i),
               B.STONE, y1r=0.0)
    # the round hearth: a knee-high ring of blue-grey blocks, a coping, the ash bed inside
    top = d + hearth['height']
    n = 18
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + 2 * math.pi / n
        sector(B, p, cx, cz, rh - 0.5, rh, a0 + 0.01, a1 - 0.01, d, top - 0.12, B.pick(B.PAL['stone'], i + 1),
               B.STONE)
        sector(B, p, cx, cz, rh - 0.6, rh + 0.08, a0, a1, top - 0.12, top, B.PAL['stone_dark'], B.STONE)
    B.abox(p, cx - rh + 0.5, cx + rh - 0.5, d, d + 0.25, cz - 0.9, cz + 0.9, B.PAL['soot'], B.STONE)
    # logs across the fire
    for k, (a, l) in enumerate(((0.3, 1.9), (1.9, 1.7), (-1.1, 1.6))):
        dx, dz = math.sin(a) * l / 2, math.cos(a) * l / 2
        y = d + 0.4 + k * 0.12
        p.cylinder((cx - dx, y, cz - dz), (cx + dx, y, cz + dz), 0.17, B.PAL['beam_dark'], B.WOOD, sides=7)
    # the iron fire grate (trim)
    for k in range(4):
        x = cx - 0.6 + k * 0.4
        B.abox(trim, x - 0.03, x + 0.03, d + 0.25, d + 0.33, cz - 0.7, cz + 0.7, B.PAL['iron'], B.METAL)


def shell_ring(B, p, cx, cz, rings, color_fn, mat, n=16):
    """A closed lathe solid through (r, y) profile points (the hood: out and back in)."""
    bm = p.bm
    vs = []
    for (r, y) in rings:
        vs.append([bm.verts.new(B.P(cx + math.sin(2 * math.pi * i / n) * r, y,
                                    cz + math.cos(2 * math.pi * i / n) * r)) for i in range(n)])
    faces = []
    m = len(vs)
    for k in range(m):
        a, b = vs[k], vs[(k + 1) % m]
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f[p.soft] = 1
            p.paint([f], color_fn(k), mat)
            faces.append(f)
    p.closed.extend(faces)


def hood(B, p, trim):
    pit, h = B.LAYOUT['pit'], B.LAYOUT['hood']
    cx, cz = pit['x'], pit['z']
    cop, dark = B.PAL['copper'], B.PAL['copper_dark']
    # the hood: a copper bell with a rolled rim, closed as a thin shell (out and back in)
    prof = [(h['rimR'], h['rimY']), (h['rimR'] - 0.35, h['rimY'] + 0.55), (h['topR'] + 0.05, h['topY']),
            (h['topR'] - 0.08, h['topY'] - 0.02), (h['rimR'] - 0.47, h['rimY'] + 0.55),
            (h['rimR'] - 0.1, h['rimY'] - 0.02)]
    shell_ring(B, p, cx, cz, prof, lambda k: dark if k in (3, 4, 5) else cop, B.METAL, n=20)
    # the rolled rim and a band half way up
    p.ring((cx, h['rimY'], cz), h['rimR'] + 0.02, 0.14, dark, segments=20, axis=(0, 1, 0), mat=B.METAL, depth=0.1)
    # the flue up through the roof, banded, with a cap over the ridge
    p.cylinder((cx, h['topY'] - 0.1, cz), (cx, h['flueTop'], cz), h['topR'] - 0.05, dark, B.METAL, sides=12,
               r1=h['topR'] - 0.14)
    y = h['topY'] + 2.0
    while y < h['flueTop'] - 0.5:
        p.cylinder((cx, y, cz), (cx, y + 0.18, cz), h['topR'] + 0.02, cop, B.METAL, sides=12)
        y += 2.6
    top = h['flueTop']
    p.cylinder((cx, top + 0.3, cz), (cx, top + 1.0, cz), 1.05, B.PAL['verdigris'], B.METAL, sides=12, r1=0.1)
    for s in (1, -1):
        B.abox(p, cx + s * 0.35 - 0.05, cx + s * 0.35 + 0.05, top - 0.1, top + 0.4, cz - 0.05, cz + 0.05,
               B.PAL['iron'], B.METAL)
    # four iron rods from the rim up to the paired tie beams over the hearth
    for s in (1, -1):
        for zt in (1.0, 3.8):
            rim = (cx + s * h['rimR'] * 0.72, h['rimY'] + 0.1, cz + (zt - cz) * 0.72 / 0.9 * 0.9)
            B.beam(p, rim, (cx + s * 1.6, B.HALL['tie'], zt), 0.07, 0.07, B.PAL['iron'], B.METAL)
    # rivets round the rim (trim)
    for i in range(20):
        a = 2 * math.pi * (i + 0.5) / 20
        x, z = ring_pt(cx, cz, h['rimR'] - 0.18, a)
        trim.box((x, h['rimY'] + 0.3, z), (0.08, 0.08, 0.08), B.PAL['gold'], B.METAL)


# ---------------------------------------------------------------------------
# The bar platform: a raised deck with bevelled front and left edges
# ---------------------------------------------------------------------------
def bar_platform(B, p):
    q = B.LAYOUT['platform']
    lift, rim = q['lift'], q['rim']
    x0, x1, z0, z1 = q['x0'], q['x1'], q['z0'], q['z1']
    n = int((x1 - x0) / 0.85)
    for i in range(n):
        xa = x0 + (x1 - x0) * i / n + 0.004
        xb = x0 + (x1 - x0) * (i + 1) / n - 0.004
        B.abox(p, xa, xb, 0.0, lift, z0, z1, B.pick(B.PAL['board'], i + 2), B.WOOD)
    # the bevelled front edge (the sim ramps half a yard) and the left edge
    B.hexa(p, [(x0, 0, z1), (x1, 0, z1), (x1, 0, z1 + rim), (x0, 0, z1 + rim),
               (x0, lift, z1), (x1, lift, z1), (x1, 0.02, z1 + rim), (x0, 0.02, z1 + rim)],
           B.PAL['beam'], B.WOOD)
    B.hexa(p, [(x0 - rim, 0, z0), (x0, 0, z0), (x0, 0, z1), (x0 - rim, 0, z1),
               (x0 - rim, 0.02, z0), (x0, lift, z0), (x0, lift, z1), (x0 - rim, 0.02, z1)],
           B.PAL['beam'], B.WOOD)
    # the rounded corner, a fan of bevelled wedges
    for k in range(4):
        a0 = math.pi + math.pi / 2 * k / 4
        a1 = math.pi + math.pi / 2 * (k + 1) / 4
        c0 = (x0 + math.sin(a0) * rim, z1 - math.cos(a0) * rim)
        c1 = (x0 + math.sin(a1) * rim, z1 - math.cos(a1) * rim)
        B.hexa(p, [(x0, 0, z1), (x0, 0, z1), (c1[0], 0, c1[1]), (c0[0], 0, c0[1]),
                   (x0, lift, z1), (x0, lift, z1), (c1[0], 0.02, c1[1]), (c0[0], 0.02, c0[1])],
               B.PAL['beam'], B.WOOD)


# ---------------------------------------------------------------------------
# The porch and its steps down toward the road
# ---------------------------------------------------------------------------
def porch(B, p):
    q = B.LAYOUT['porch']
    x0, x1, z0, z1 = q['x0'], q['x1'], q['z0'], q['z1']
    low = B.ground_min([(x0, z1), (x1, z1), (x0, z0), (x1, z0)]) - 0.4
    B.abox(p, x0, x1, low, -0.2, z0, z1, B.PAL['stone_dark'], B.STONE)
    # flagstones
    for i in range(4):
        for j in range(2):
            xa = x0 + (x1 - x0) * i / 4
            za = z0 + (z1 - z0) * j / 2
            B.abox(p, xa + 0.03, xa + (x1 - x0) / 4 - 0.03, -0.2, 0.0, za + 0.03, za + (z1 - z0) / 2 - 0.03,
                   B.pick(B.PAL['flag'], i + j * 2), B.STONE)
    # parapets on both sides, dressed with a coping
    for x in (x0, x1):
        B.abox(p, x - 0.2, x + 0.2, low, q['parapet'] - 0.12, z0, z1 + 0.3, B.pick(B.PAL['stone'], 1), B.STONE)
        B.abox(p, x - 0.28, x + 0.28, q['parapet'] - 0.12, q['parapet'], z0 - 0.05, z1 + 0.38,
               B.PAL['stone_dark'], B.STONE)
    # the steps: each tread at the sim's ramp height at its middle, down until they meet the ground
    hw = q['stepHalfWidth']
    run = 0.8
    k = 0
    while True:
        za = z1 + run * k
        zb = za + run
        y = -q['stepSlope'] * (za - z1 + run / 2)
        g = max(B.ground(0, zb), B.ground(-hw, zb), B.ground(hw, zb))
        if y < g - 0.15 or k > 12:
            break
        bottom = min(B.ground(0, za), B.ground(-hw, za), B.ground(hw, za)) - 0.4
        B.abox(p, -hw, hw, bottom, y - 0.1, za, zb, B.PAL['stone_dark'], B.STONE)
        B.abox(p, -hw - 0.03, hw + 0.03, y - 0.1, y, za - 0.05, zb, B.pick(B.PAL['flag'], k), B.STONE)
        # stepped cheeks
        for s in (-1, 1):
            B.abox(p, s * hw - 0.25 if s > 0 else -hw - 0.25, s * hw + 0.25 if s > 0 else -hw + 0.25,
                   bottom, y + 0.35, za, zb, B.pick(B.PAL['stone'], k + 2), B.STONE)
        k += 1


# ---------------------------------------------------------------------------
# The tower: its ground landing, the stone spiral, the landing at its head, the newel
# ---------------------------------------------------------------------------
def tower_floor_and_stair(B, p, trim):
    T, S = B.TOWER, B.STAIR
    cx, cz = T['x'], T['z']
    G = B.G
    rn, ri = T['newel'], T['rIn']
    # the ground landing (the sector open to the hall), flagged
    a_hi = S['bottom'] - S['landing'] + 2 * math.pi  # the landing's end, +50 degrees
    a_lo = S['bottom']                                # the stair's foot, -48 degrees
    n = 10
    for i in range(n):
        a0 = a_lo + (a_hi - a_lo) * i / n
        a1 = a_lo + (a_hi - a_lo) * (i + 1) / n
        for (r0, r1) in ((rn, 3.9), (3.9, ri + 0.4)):
            sector(B, p, cx, cz, r0 + 0.02, r1 - 0.02, a0 + 0.01, a1 - 0.01, -0.25, 0.0,
                   B.pick(B.PAL['flag'], i + int(r0)), B.STONE, subdiv=2)
    # the flight: 18 treads, each a solid masonry wedge from the ground up to the ramp's height
    # at its middle, a darker nosing on its leading edge
    treads = 18
    du = S['climb'] / treads
    for k in range(treads):
        u0, u1 = k * du, (k + 1) * du
        a0, a1 = S['bottom'] - u0, S['bottom'] - u1
        y = G * (k + 0.5) / treads
        sector(B, p, cx, cz, rn - 0.05, ri + 0.1, a1, a0, 0.0, y - 0.08, B.pick(B.PAL['stone'], k), B.STONE,
               subdiv=2)
        sector(B, p, cx, cz, rn - 0.05, ri + 0.1, a1, a0, y - 0.08, y, B.pick(B.PAL['flag'], k), B.STONE,
               subdiv=2)
        sector(B, p, cx, cz, rn, ri + 0.05, a0 - math.radians(1.2), a0 + 0.001, y - 0.1, y + 0.02,
               B.PAL['stone_dark'], B.STONE, subdiv=2)
    # the landing at the head: level at the upper floor over a solid mass, its drop face toward
    # the ground landing dressed as a wall
    b0 = S['bottom'] - S['climb']
    b1 = S['bottom'] - S['landing']
    sector(B, p, cx, cz, rn - 0.05, ri + 0.4, b1, b0, 0.0, G - 0.12, B.pick(B.PAL['stone'], 3), B.STONE,
           subdiv=4)
    for i in range(3):
        c0 = b1 + (b0 - b1) * i / 3
        c1 = b1 + (b0 - b1) * (i + 1) / 3
        sector(B, p, cx, cz, rn, ri + 0.4, c0 + 0.01, c1 - 0.01, G - 0.12, G, B.pick(B.PAL['flag'], i),
               B.STONE, subdiv=2)
    # the passage through to the wing, flagged at the upper floor
    d = B.LAYOUT['towerDoor']
    B.abox(p, d['x0'] - 0.4, d['x1'] + 0.1, G - 0.25, G, d['z0'], d['z1'], B.pick(B.PAL['flag'], 2), B.STONE)
    # the newel: a stone column banded every storey, a capital under the roof
    top = T['wallTop']
    p.cylinder((cx, 0.0, cz), (cx, top, cz), rn, B.pick(B.PAL['stone'], 2), B.STONE, sides=18)
    for yb in (0.0, 3.0, G + 0.02, 9.0):
        p.cylinder((cx, yb, cz), (cx, yb + 0.25, cz), rn + 0.08, B.PAL['stone_dark'], B.STONE, sides=18)
    p.cylinder((cx, top - 0.4, cz), (cx, top, cz), rn + 0.3, B.PAL['stone_dark'], B.STONE, sides=18)
    # a rope handrail on iron brackets along the outer wall (trim)
    pts = []
    for k in range(treads + 4):
        u = min(S['landing'], k * du)
        a = S['bottom'] - u
        y = min(G, G * u / S['climb']) + 1.25
        pts.append((cx + math.sin(a) * (ri - 0.12), y, cz + math.cos(a) * (ri - 0.12)))
    trim.sweep(pts, 0.06, 0.06, B.PAL['beam'], sides=6, mat=B.WOOD)
    for q in pts[::3]:
        trim.box((q[0], q[1] - 0.12, q[2]), (0.08, 0.3, 0.08), B.PAL['iron'], B.METAL)


# ---------------------------------------------------------------------------
# The wing's upper floor
# ---------------------------------------------------------------------------
def upper_floor(B, p):
    W, G = B.WING, B.G
    x0, x1 = W['x0'] + W['wall'], W['x1'] - W['wall']
    z0, z1 = W['z0'] + W['wall'], W['z1']
    n = int((x1 - x0) / 0.9)
    for i in range(n):
        xa = x0 + (x1 - x0) * i / n + 0.004
        xb = x0 + (x1 - x0) * (i + 1) / n - 0.004
        B.abox(p, xa, xb, G - 0.3, G, z0, z1, B.pick(B.PAL['board'], i + 1), B.WOOD)
    # the gallery's doorway threshold through the hall's back wall
    gd = B.LAYOUT['galleryDoor']
    B.abox(p, gd['x0'], gd['x1'], G - 0.3, G + 0.02, B.HALL['z0'], B.HALL['z0'] + B.HALL['wall'],
           B.PAL['beam_dark'], B.WOOD)


# ---------------------------------------------------------------------------
# Posts, plates, tie beams and the low nook beams
# ---------------------------------------------------------------------------
def posts_and_beams(B, p, trim):
    H, G = B.HALL, B.G
    tie, low = H['tie'], H['aisleBeam']
    ax = H['aisleX']
    zi0, zi1 = H['z0'] + H['wall'], H['z1'] - H['wall']
    col, dark = B.PAL['beam'], B.PAL['beam_dark']
    for q in B.LAYOUT['props']:
        if q['kind'] != 'post':
            continue
        x, z, y0 = q['x'], q['z'], q['base']
        y1 = y0 + q['height']
        w = q['r'] * 1.5
        if y0 == 0:
            B.abox(p, x - w * 0.8, x + w * 0.8, 0.0, 0.3, z - w * 0.8, z + w * 0.8, B.PAL['stone_dark'], B.STONE)
        B.post(p, x, z, y0, y1, w, col)
        B.abox(p, x - w * 0.7, x + w * 0.7, y1 - 0.35, y1, z - w * 0.7, z + w * 0.7, dark, B.WOOD)
        # iron bands (trim)
        for yb in (y0 + 1.2, y0 + 2.6):
            B.abox(trim, x - w / 2 - 0.02, x + w / 2 + 0.02, yb, yb + 0.1, z - w / 2 - 0.02, z + w / 2 + 0.02,
                   B.PAL['iron'], B.METAL)
    # the arcade plates on the posts at the tie line, front wall to back wall
    for s in (1, -1):
        B.abox(p, s * ax - 0.3, s * ax + 0.3, tie, tie + 0.6, zi0, zi1, dark, B.WOOD)
    # the tie beams across the nave (a pair over the hearth frames the flue)
    for z in (-9.6, -3.6, 1.0, 3.8, 9.6):
        B.abox(p, -ax, ax, tie + 0.05, tie + 0.65, z - 0.3, z + 0.3, col, B.WOOD)
        for s in (1, -1):
            B.beam(p, (s * ax, tie - 1.6, z), (s * (ax - 1.6), tie + 0.1, z), 0.26, 0.3, dark)
    # the nook plates and joists at the low beam line, wall to post
    for s, za in ((-1, zi0), (1, -3.8)):
        B.abox(p, s * ax - 0.28, s * ax + 0.28, low, low + 0.5, za, zi1, dark, B.WOOD)
        z = za + 0.9
        fire = next(q for q in B.LAYOUT['props'] if q['kind'] == 'fireplace')
        while z < zi1 - 0.5:
            xw = s * (H['x1'] - H['wall'])
            if s > 0 and fire['z'] - fire['hd'] - 0.3 < z < fire['z'] + fire['hd'] + 0.3:
                xw = fire['x'] - fire['hw'] - 0.05
            a, b = sorted((s * ax, xw))
            B.abox(p, a, b, low + 0.05, low + 0.45, z - 0.17, z + 0.17, col, B.WOOD)
            z += 1.8
    # knee braces from the posts to the nook plates (trim)
    for q in B.LAYOUT['props']:
        if q['kind'] != 'post' or q['base'] != 0:
            continue
        for dz in (1.3, -1.3):
            B.beam(trim, (q['x'], low - 1.3, q['z']), (q['x'], low, q['z'] + dz), 0.2, 0.22, dark)


# ---------------------------------------------------------------------------
# The bar: the stone pillar at the elbow and the two counters
# ---------------------------------------------------------------------------
def bar(B, p, trim):
    tie = B.HALL['tie']
    for q in B.LAYOUT['props']:
        k = q['kind']
        base = q['base']
        if k == 'pillar':
            x, z, r = q['x'], q['z'], q['r']
            p.cylinder((x, base - 0.5, z), (x, base + 0.5, z), r + 0.2, B.PAL['stone_dark'], B.STONE, sides=16)
            p.cylinder((x, base + 0.5, z), (x, tie, z), r, B.pick(B.PAL['stone'], 1), B.STONE, sides=16)
            y = base + 1.8
            j = 0
            while y < tie - 1:
                p.cylinder((x, y, z), (x, y + 0.08, z), r + 0.03, B.pick(B.PAL['stone'], j + 2), B.STONE, sides=16)
                y += 1.4
                j += 1
            p.cylinder((x, tie - 0.5, z), (x, tie + 0.6, z), r + 0.35, B.PAL['stone_dark'], B.STONE, sides=16)
        elif k == 'counter':
            x, z, hw, hd = q['x'], q['z'], q['hw'], q['hd']
            top = base + q['height']
            # the body: dark panels in a honey frame, the top slab overhanging the drinkers' side
            B.abox(p, x - hw + 0.08, x + hw - 0.08, base, top - 0.15, z - hd + 0.1, z + hd - 0.08,
                   B.PAL['beam_dark'], B.WOOD)
            B.abox(p, x - hw - 0.1, x + hw + 0.1, top - 0.15, top, z - hd - 0.05, z + hd + 0.15,
                   B.PAL['honey'][2], B.WOOD)
            B.abox(p, x - hw, x + hw, base, base + 0.18, z - hd, z + hd, B.PAL['beam'], B.WOOD)
            n = max(1, int(hw * 2 / 1.2))
            for i in range(n + 1):
                xp = x - hw + 0.08 + (hw * 2 - 0.16) * i / n
                B.abox(p, xp - 0.07, xp + 0.07, base, top - 0.15, z - hd + 0.02, z + hd + 0.01, B.PAL['honey'][0],
                       B.WOOD)
            # the brass foot rail on the drinkers' side (trim)
            if hw > hd:
                trim.cylinder((x - hw, base + 0.35, z + hd + 0.3), (x + hw, base + 0.35, z + hd + 0.3), 0.05,
                              B.PAL['gold'], B.METAL, sides=6)
                for i in range(4):
                    xp = x - hw + 0.3 + (hw * 2 - 0.6) * i / 3
                    B.abox(trim, xp - 0.03, xp + 0.03, base + 0.3, base + 0.4, z + hd, z + hd + 0.3,
                           B.PAL['gold'], B.METAL)
