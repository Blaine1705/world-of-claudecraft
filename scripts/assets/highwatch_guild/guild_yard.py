"""The guild's yard: the old stable yard where the road ends, paved in flags round the porch,
two lamps, the guild's signpost with its hanging board, the old hitching rail and trough kept
from the stables, crates and barrels by the tower. Part: GuildYard (and GuildGlow for the
lamps' panes)."""
import math

from manor_furnish import barrel
from manor_grounds import PAVE, lamp
from manor_lib import LAYER, METAL, PAL, STONE, WOOD, abox, cyl, flat_face, hashf, pick, tone

from guild_plan import CRATES, HITCH, PORCH, SIGNPOST, STEPS, TOWER, TROUGH, YARD, YARD_LAMPS


def _paving(p, x0, x1, z0, z1, seed=0):
    """Flags on a mortar bed at the paving height, staggered rows."""
    flat_face(p, [(x0, PAVE - LAYER, z0), (x1, PAVE - LAYER, z0), (x1, PAVE - LAYER, z1), (x0, PAVE - LAYER, z1)],
              PAL['mortar'], STONE, (0, 1, 0))
    z = z0
    row = 0
    while z < z1 - 0.05:
        zb = min(z1, z + 1.0 + 0.4 * hashf(row, seed))
        x = x0 - (0.7 if row % 2 else 0.0)
        while x < x1 - 0.05:
            xb = min(x1, x + 1.2 + 0.5 * hashf(x, row, seed))
            xa = max(x0, x)
            if xb - xa > 0.15:
                flat_face(p, [(xa + 0.035, PAVE, z + 0.035), (xb - 0.035, PAVE, z + 0.035), (xb - 0.035, PAVE, zb - 0.035),
                              (xa + 0.035, PAVE, zb - 0.035)],
                          tone(pick(PAL['flag'], int(hashf(xa, row, seed) * 4)), xa, row, spread=0.18), STONE, (0, 1, 0))
            x = xb
        z = zb
        row += 1


def paving(p):
    Y = YARD
    # round the porch and the steps: the strips either side of them, then the yard in front
    _paving(p, Y['x0'], PORCH['x0'] - 0.05, STEPS['z0'], Y['z1'], seed=1)
    _paving(p, PORCH['x1'] + 0.05, Y['x1'], STEPS['z0'], Y['z1'], seed=2)
    _paving(p, Y['x0'], Y['x1'], Y['z0'], STEPS['z0'] - 0.05, seed=3)
    # a kerb round the yard's open edges
    for (a, b, c, d) in ((Y['x0'] - 0.25, Y['x1'] + 0.25, Y['z0'] - 0.25, Y['z0']),
                         (Y['x0'] - 0.25, Y['x0'], Y['z0'], Y['z1']),
                         (Y['x1'], Y['x1'] + 0.25, Y['z0'], TOWER['z0'])):
        abox(p, a, b, -0.15, PAVE + 0.1, c, d, PAL['ashlar_hi'], STONE)


def signpost(p, glow):
    """The guild's sign: a tall oak post on a stone foot, an arm, the painted board on two
    chains (the guild's lantern over crossed swords, both faces), a little lantern under the
    arm."""
    x, z = SIGNPOST['x'], SIGNPOST['z']
    abox(p, x - 0.45, x + 0.45, -0.2, 0.5, z - 0.45, z + 0.45, PAL['ashlar_hi'], STONE)
    abox(p, x - 0.16, x + 0.16, 0.5, 5.4, z - 0.16, z + 0.16, PAL['oak_dark'], WOOD)
    p.prism((x, 5.4, z), 4, 0.24, 0.02, 0.4, PAL['iron'], METAL, axis=(0, 1, 0), phase=math.pi / 4)
    # the arm out toward the road (-x) and its brace
    abox(p, x - 2.6, x + 0.16, 4.8, 5.05, z - 0.1, z + 0.1, PAL['oak_dark'], WOOD)
    p.beam([(x - 0.05, 3.8, z), (x - 1.2, 4.85, z)], 0.12, 0.12, PAL['oak_dark'], WOOD)
    bx0, bx1, by0, by1 = x - 2.45, x - 0.45, 2.8, 4.3
    for bx in (bx0 + 0.15, bx1 - 0.15):
        p.cylinder((bx, by1, z), (bx, 4.8, z), 0.025, PAL['iron'], METAL, sides=4)
    abox(p, bx0, bx1, by0, by1, z - 0.07, z + 0.07, PAL['blue'], WOOD)
    abox(p, bx0 - 0.06, bx1 + 0.06, by1, by1 + 0.08, z - 0.09, z + 0.09, PAL['gold_dark'], METAL)
    abox(p, bx0 - 0.06, bx1 + 0.06, by0 - 0.08, by0, z - 0.09, z + 0.09, PAL['gold_dark'], METAL)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    for sz in (1, -1):
        w = z + sz * (0.07 + LAYER)
        for k, sgn in enumerate((1, -1)):
            ww = w + sz * k * LAYER
            a, b = (cx - sgn * 0.7, cy - 0.55), (cx + sgn * 0.65, cy + 0.5)
            dx, dy = b[0] - a[0], b[1] - a[1]
            n = math.hypot(dx, dy)
            px, py = -dy / n * 0.06, dx / n * 0.06
            flat_face(p, [(a[0] + px, a[1] + py, ww), (a[0] - px, a[1] - py, ww), (b[0], b[1], ww)], PAL['silver'], METAL,
                      (0, 0, sz))
        ww = w + sz * 3 * LAYER
        flat_face(p, [(cx - 0.26, cy - 0.3, ww), (cx + 0.26, cy - 0.3, ww), (cx + 0.26, cy + 0.28, ww),
                      (cx - 0.26, cy + 0.28, ww)], PAL['gold'], METAL, (0, 0, sz))
        flat_face(p, [(cx - 0.16, cy - 0.2, ww + sz * LAYER), (cx + 0.16, cy - 0.2, ww + sz * LAYER),
                      (cx + 0.16, cy + 0.18, ww + sz * LAYER), (cx - 0.16, cy + 0.18, ww + sz * LAYER)],
                  PAL['lantern_lit'], METAL, (0, 0, sz))
        flat_face(p, [(cx - 0.34, cy + 0.28, ww), (cx + 0.34, cy + 0.28, ww), (cx, cy + 0.52, ww)], PAL['gold_dark'],
                  METAL, (0, 0, sz))
    _ = glow


def hitching_rail(p):
    """The old stable yard's hitching rail, a water trough beside it."""
    x, z0, z1 = HITCH['x'], HITCH['z0'], HITCH['z1']
    for zz in (z0 + 0.2, (z0 + z1) / 2, z1 - 0.2):
        abox(p, x - 0.13, x + 0.13, -0.3, 1.25, zz - 0.13, zz + 0.13, PAL['oak_dark'], WOOD)
        p.prism((x, 1.25, zz), 4, 0.18, 0.04, 0.12, PAL['oak_dark'], WOOD, axis=(0, 1, 0), phase=math.pi / 4)
    abox(p, x - 0.1, x + 0.1, 1.0, 1.16, z0, z1, PAL['oak'][1], WOOD)
    for zz in (z0 + 1.4, z1 - 1.6):
        p.ring((x + 0.12, 0.9, zz), 0.1, 0.025, PAL['iron'], 8, axis=(1, 0, 0), mat=METAL)
    T = TROUGH
    tx0, tx1 = T['x'] - T['lx'] / 2, T['x'] + T['lx'] / 2
    tz0, tz1 = T['z'] - T['lz'] / 2, T['z'] + T['lz'] / 2
    for (a, b, c, d) in ((tx0, tx1, tz0, tz0 + 0.18), (tx0, tx1, tz1 - 0.18, tz1), (tx0, tx0 + 0.18, tz0, tz1),
                         (tx1 - 0.18, tx1, tz0, tz1)):
        abox(p, a, b, -0.2, 0.85, c, d, tone(PAL['ashlar'][2], a, c), STONE)
    flat_face(p, [(tx0 + 0.18, 0.7, tz0 + 0.18), (tx1 - 0.18, 0.7, tz0 + 0.18), (tx1 - 0.18, 0.7, tz1 - 0.18),
                  (tx0 + 0.18, 0.7, tz1 - 0.18)], PAL['water'], STONE, (0, 1, 0))


def crates(p):
    x, z = CRATES['x'], CRATES['z']
    for (dx, dz, s, h) in ((-0.7, -0.5, 1.1, 1.0), (0.6, -0.6, 1.0, 0.9), (-0.1, 0.6, 1.2, 1.1)):
        x0, x1, z0, z1 = x + dx - s / 2, x + dx + s / 2, z + dz - s / 2, z + dz + s / 2
        abox(p, x0, x1, PAVE, PAVE + h, z0, z1, tone(PAL['oak'][1], dx, dz), WOOD)
        for (a, b) in ((x0 - 0.03, x0 + 0.1), (x1 - 0.1, x1 + 0.03)):
            abox(p, a, b, PAVE, PAVE + h + 0.02, z0 - 0.03, z1 + 0.03, PAL['oak_dark'], WOOD)
    abox(p, x - 0.6, x + 0.2, PAVE + 1.1, PAVE + 1.7, z + 0.2, z + 0.9, tone(PAL['oak'][2], 3), WOOD)
    barrel(p, x + 0.9, z + 0.9, y=PAVE, h=1.0, r=0.4)


def build(parts):
    y, glow = parts['GuildYard'], parts['GuildGlow']
    paving(y)
    for (lx, lz) in YARD_LAMPS:
        lamp(y, glow, lx, lz)
    signpost(y, glow)
    hitching_rail(y)
    crates(y)
    _ = cyl
