"""The guild hall's furnishings: the contracts board with the clerk's desk (left wall), the
quartermaster's counter, shelves and banners (right wall), the recruitment table with its map
of the five dungeons (back left), the guildmaster's fireside (right gable, behind the counter),
the adventurers' tables, chandeliers, banners and racks; and in the trophy hall the five
plaques with their trophies.

Every trophy and every plaque's gilding is its own part (G_INT_Trophy_<dungeon> and
G_INT_TrophyGilt_<dungeon>), so the runtime shows each one only to a player who has cleared
that dungeon (gilded once cleared on Heroic): render/highwatch_guild_trophies.ts. The plaque
boards themselves are furniture and always hang.

Everything solid a player could walk into stands inside one of the plan's collision boxes
(guild_plan.collision_boxes); the walking lines (door to arch, door to board, to counter, to
table) are kept clear. Original procedural work for this project; no imported meshes.
"""
import math

from manor_furnish import (barrel, bench, candelabrum, candle, chair, chandelier, goblet, plate, rug, sconce,
                           shield, sword, table, weapon_rack)
from manor_furnish import banner as manor_banner
from manor_lib import (GLASS_BLUE, GLOW, GLOW_CANDLE, GLOW_LANTERN, LAYER, METAL, PAL, STONE, WOOD, abox, cbox, cyl,
                       flat_face, hashf, pick, tone)
from manor_shell import _ball, chain

from guild_plan import (BOARD, BOARD_DESK, COUNTER, FLOOR, FRONT_TABLES, HALL, HEARTH, RECRUIT_TABLE, TROPHY,
                        TROPHY_HEARTH, TROPHY_SLOTS)

H = HALL
TROPHY_IDS = tuple(TROPHY_SLOTS)


# ---------------------------------------------------------------------------
# The contracts board and the clerk's desk (left wall, x = +14)
# ---------------------------------------------------------------------------
def contracts_board(p, glow):
    x = BOARD['x'] - 0.42          # the board's back stands clear of the wainscot
    z0, z1, y0, y1 = BOARD['z0'], BOARD['z1'], BOARD['y0'], BOARD['y1']
    # the backing boards, a frame of posts and rails proud of them
    abox(p, x - 0.12, x, y0, y1, z0, z1, PAL['oak'][1], WOOD)
    for k in range(7):
        zz = z0 + (z1 - z0) * k / 6
        abox(p, x - 0.12 - LAYER, x - 0.12, y0 + 0.05, y1 - 0.05, zz - 0.012, zz + 0.012, PAL['walnut'], WOOD)
    for (za, zb) in ((z0 - 0.3, z0), (z1, z1 + 0.3)):
        abox(p, x - 0.3, x + 0.1, FLOOR, y1 + 0.5, za, zb, PAL['oak_dark'], WOOD)
    for (ya, yb) in ((y0 - 0.25, y0), (y1, y1 + 0.25)):
        abox(p, x - 0.26, x + 0.06, ya, yb, z0, z1, PAL['oak_dark'], WOOD)
    # the header: a plank with a gilded lantern carved on it, and a little shingled canopy
    abox(p, x - 0.36, x + 0.08, y1 + 0.25, y1 + 1.15, z0 - 0.4, z1 + 0.4, PAL['oak'][2], WOOD)
    face = x - 0.36 - LAYER
    flat_face(p, [(face, y1 + 0.38, -0.32), (face, y1 + 0.38, 0.32), (face, y1 + 0.98, 0.32), (face, y1 + 0.98, -0.32)],
              PAL['gold'], METAL, (-1, 0, 0))
    flat_face(p, [(face - LAYER, y1 + 0.48, -0.2), (face - LAYER, y1 + 0.48, 0.2), (face - LAYER, y1 + 0.88, 0.2),
                  (face - LAYER, y1 + 0.88, -0.2)], PAL['lantern_lit'], METAL, (-1, 0, 0))
    for sgn in (-1, 1):
        flat_face(p, [(face, y1 + 0.66, sgn * 0.5), (face, y1 + 0.66, sgn * 1.9), (face, y1 + 0.76, sgn * 1.9),
                      (face, y1 + 0.76, sgn * 0.5)], PAL['gold_dark'], METAL, (-1, 0, 0))
    for sgn in (-1, 1):
        p.beam([(x + 0.08, y1 + 1.15, sgn * (z1 + 0.6)), (x - 1.0, y1 + 1.7, sgn * (z1 + 0.6))], 0.1, 0.1,
               PAL['oak_dark'], WOOD)
    p.box((x - 0.45, y1 + 1.55, 0.0), (1.4, 0.1, (z1 - z0) + 1.6), PAL['slate'][2], WOOD, roll=0.35)
    # the notices pinned to it: parchments of every size in a loose grid, each a layer over the
    # boards (and over the one it overlaps), sealed in wax; the top row the five dungeons' writs,
    # their seals in each dungeon's colour
    seals = [(0.36, 0.08, 0.1), (0.12, 0.3, 0.42), (0.2, 0.42, 0.5), (0.2, 0.18, 0.12), (0.3, 0.44, 0.18)]
    fx = x - 0.12
    k = 0
    for row in range(3):
        n = 5 if row == 0 else 6
        for i in range(n):
            zz = z0 + 0.5 + (z1 - z0 - 1.0) * (i + 0.5) / n + (hashf(row, i) - 0.5) * 0.3
            yy = y1 - 0.9 - row * 1.55 + (hashf(i, row, 2) - 0.5) * 0.25
            w = (0.55 if row == 0 else 0.42) + 0.12 * hashf(i, row, 3)
            hh = (0.68 if row == 0 else 0.55) + 0.15 * hashf(i, row, 4)
            # clear of the planks' joint strips (a layer proud), neighbours alternating two
            # layers apart, so one notice's ink never lies in the plane of the paper beside it
            lift = fx - LAYER * (2 + 2 * (k % 2))
            col = tone(PAL['parchment'], row, i, spread=0.2)
            flat_face(p, [(lift, yy - hh, zz - w), (lift, yy - hh, zz + w), (lift, yy + hh, zz + w),
                          (lift, yy + hh, zz - w)], col, WOOD, (-1, 0, 0))
            # lines of ink
            for li in range(4):
                ly = yy + hh * 0.55 - li * hh * 0.32
                flat_face(p, [(lift - LAYER, ly - 0.025, zz - w * 0.75), (lift - LAYER, ly - 0.025, zz + w * (0.75 - 0.3 * (li % 2))),
                              (lift - LAYER, ly + 0.025, zz + w * (0.75 - 0.3 * (li % 2))), (lift - LAYER, ly + 0.025, zz - w * 0.75)],
                          (0.26, 0.2, 0.16), WOOD, (-1, 0, 0))
            if row == 0 or i % 2 == 0:
                sc = seals[i % len(seals)] if row == 0 else PAL['garnet']
                p.prism((lift - LAYER, yy - hh * 0.62, zz), 8, 0.13, 0.11, -0.06, sc, METAL, axis=(1, 0, 0))
            p.prism((lift - LAYER, yy + hh - 0.08, zz), 4, 0.03, 0.03, -0.08, PAL['iron'], METAL, axis=(1, 0, 0))
            k += 1
    # two lanterns on iron brackets either side
    for sgn in (-1, 1):
        zz = sgn * (z1 + 0.75)
        p.beam([(x, y1 - 0.4, zz), (x - 0.9, y1 - 0.2, zz)], 0.07, 0.07, PAL['iron'], METAL)
        lantern_small(p, glow, x - 0.9, y1 - 0.3, zz)


def lantern_small(p, glow, x, y, z, s=0.36):
    """A small lantern hung under a point: a frame, lit panes, a cap and a ring."""
    yb = y - 0.2 - s * 1.3
    abox(p, x - s * 0.6, x + s * 0.6, yb - 0.05, yb, z - s * 0.6, z + s * 0.6, PAL['gold_dark'], METAL)
    abox(glow, x - s * 0.46, x + s * 0.46, yb, yb + s * 1.1, z - s * 0.46, z + s * 0.46, PAL['lantern_lit'], GLOW_LANTERN)
    for sx in (1, -1):
        for sz in (1, -1):
            abox(p, x + sx * s * 0.5 - 0.03, x + sx * s * 0.5 + 0.03, yb, yb + s * 1.1, z + sz * s * 0.5 - 0.03,
                 z + sz * s * 0.5 + 0.03, PAL['gold_dark'], METAL)
    p.prism((x, yb + s * 1.1, z), 4, s * 0.8, 0.04, s * 0.5, PAL['iron'], METAL, axis=(0, 1, 0), phase=math.pi / 4)
    cyl(p, x, yb + s * 1.55, y, z, 0.025, PAL['iron'], METAL, sides=4)


def clerk_desk(p, glow):
    D = BOARD_DESK
    x0, x1, z0, z1 = D['x0'], D['x1'], D['z0'], D['z1']
    # a standing desk: a carcass, a sloped top, a shelf of ledgers under it
    abox(p, x0, x1, FLOOR, FLOOR + 0.95, z0, z1, PAL['oak'][1], WOOD)
    for (za, zb) in ((z0 - 0.05, z0 + 0.1), (z1 - 0.1, z1 + 0.05)):
        abox(p, x0 - 0.05, x1 + 0.05, FLOOR, FLOOR + 1.0, za, zb, PAL['oak_dark'], WOOD)
    p.box(((x0 + x1) / 2, FLOOR + 1.08, (z0 + z1) / 2), (x1 - x0 + 0.2, 0.08, z1 - z0 + 0.2), PAL['oak'][2], WOOD,
          roll=-0.22)
    # the open ledger, the inkpot and the quill, a candle
    p.box(((x0 + x1) / 2 - 0.05, FLOOR + 1.2, 0.0), (0.7, 0.04, 1.1), PAL['cream'], WOOD, roll=-0.22)
    p.box(((x0 + x1) / 2 - 0.05, FLOOR + 1.215, 0.0), (0.72, 0.03, 0.04), PAL['leather'], WOOD, roll=-0.22)
    cyl(p, x1 - 0.15, FLOOR + 1.12, FLOOR + 1.28, z1 - 0.25, 0.07, PAL['iron'], METAL, sides=6)
    p.beam([(x1 - 0.15, FLOOR + 1.26, z1 - 0.25), (x1 - 0.32, FLOOR + 1.7, z1 - 0.45)], 0.03, 0.08, PAL['cream'], WOOD)
    cyl(p, x1 - 0.15, FLOOR + 1.14, FLOOR + 1.22, z0 + 0.25, 0.12, PAL['gold_dark'], METAL, sides=8)
    candle(glow, p, x1 - 0.15, FLOOR + 1.22, z0 + 0.25, h=0.3)
    for k in range(5):
        zz = z0 + 0.3 + k * 0.42
        abox(p, x0 + 0.08, x0 + 0.5, FLOOR + 0.3, FLOOR + 0.62, zz - 0.15, zz + 0.15,
             pick([PAL['garnet'], PAL['blue'], PAL['leather'], PAL['oak_dark']], k), WOOD)


# ---------------------------------------------------------------------------
# The quartermaster (right wall, x = -14): the counter, the shelves of folded cloth, the
# banners of the titles he grants, a tabard on a stand
# ---------------------------------------------------------------------------
def quartermaster(p, glow):
    C = COUNTER
    x0, x1, z0, z1 = C['x0'], C['x1'], C['z0'], C['z1']
    top = FLOOR + 1.25
    abox(p, x0, x1, FLOOR, top - 0.1, z0, z1, PAL['oak'][0], WOOD)
    # panelled front (facing +x), a gilded rail
    n = 5
    for k in range(n):
        za = z0 + (z1 - z0) * k / n + 0.12
        zb = z0 + (z1 - z0) * (k + 1) / n - 0.12
        abox(p, x1, x1 + 0.06, FLOOR + 0.2, top - 0.3, za, zb, PAL['oak'][2], WOOD)
    abox(p, x0 - 0.1, x1 + 0.12, top - 0.1, top, z0 - 0.1, z1 + 0.1, PAL['oak_dark'], WOOD)
    abox(p, x1 + 0.12, x1 + 0.12 + LAYER * 2, top - 0.08, top - 0.02, z0 - 0.1, z1 + 0.1, PAL['gold'], METAL)
    # on the counter: a ledger, scales, a small iron strongbox, a stack of guild seals
    p.box(((x0 + x1) / 2, top + 0.04, z0 + 1.2), (0.6, 0.06, 0.9), PAL['cream'], WOOD)
    p.box(((x0 + x1) / 2, top + 0.075, z0 + 1.2), (0.62, 0.02, 0.04), PAL['leather'], WOOD)
    cyl(p, (x0 + x1) / 2, top, top + 0.7, z0 + 3.0, 0.035, PAL['gold_dark'], METAL, sides=6)
    p.beam([((x0 + x1) / 2, top + 0.7, z0 + 2.55), ((x0 + x1) / 2, top + 0.7, z0 + 3.45)], 0.04, 0.04, PAL['gold_dark'],
           METAL)
    for dz in (-0.45, 0.45):
        cyl(p, (x0 + x1) / 2, top + 0.35, top + 0.4, z0 + 3.0 + dz, 0.18, PAL['gold'], METAL, sides=10)
    abox(p, x0 + 0.1, x1 - 0.1, top, top + 0.42, z1 - 1.5, z1 - 0.7, PAL['iron'], METAL)
    abox(p, x0 + 0.08, x1 - 0.08, top + 0.42, top + 0.5, z1 - 1.52, z1 - 0.68, PAL['iron_hi'], METAL)
    for k in range(4):
        cyl(p, (x0 + x1) / 2 + 0.15, top + k * 0.05, top + (k + 1) * 0.05 - 0.005, z0 + 4.4, 0.16, PAL['garnet'], METAL,
            sides=8)
    # the shelves behind him on the wall: folded tabards and cloaks in the guild's colours
    sx0, sx1 = H['x0'] + 0.05, H['x0'] + 0.8
    for zz in (z0, z1):
        abox(p, sx0, sx1, FLOOR, FLOOR + 4.2, zz - 0.08, zz + 0.08, PAL['walnut'], WOOD)
    for k in range(5):
        yy = FLOOR + 0.2 + k * 0.95
        abox(p, sx0, sx1, yy, yy + 0.08, z0 + 0.08, z1 - 0.08, PAL['walnut'], WOOD)
        if k == 4:
            continue
        zz = z0 + 0.35
        j = 0
        while zz < z1 - 0.6:
            w = 0.6 + 0.2 * hashf(k, j)
            col = pick([PAL['blue'], PAL['garnet'], PAL['cream'], PAL['blue_dark'], (0.26, 0.4, 0.3)], k + j)
            for layer in range(int(2 + 3 * hashf(j, k, 5))):
                abox(p, sx0 + 0.1, sx1 - 0.08, yy + 0.08 + layer * 0.12, yy + 0.19 + layer * 0.12, zz, zz + w,
                     tone(col, layer, j), WOOD)
            zz += w + 0.18
            j += 1
    # the three title banners over the shelves, a blue, a garnet and a gold, each with the guild's
    # lantern, and the border's emblem between them on a round shield
    for zz, field in ((-2.7, PAL['blue']), (0.0, PAL['garnet']), (2.7, PAL['gold_dark'])):
        manor_banner(p, H['x0'] + 0.08, zz, FLOOR + 9.6, (1, 0), width=1.7, length=3.8, field=field, emblem=False)
        lx = H['x0'] + 0.08 + 0.14 + 3 * LAYER
        flat_face(p, [(lx, FLOOR + 7.2, zz - 0.3), (lx, FLOOR + 7.2, zz + 0.3), (lx, FLOOR + 7.95, zz + 0.3),
                      (lx, FLOOR + 7.95, zz - 0.3)], PAL['gold'], METAL, (1, 0, 0))
        flat_face(p, [(lx + LAYER, FLOOR + 7.32, zz - 0.18), (lx + LAYER, FLOOR + 7.32, zz + 0.18),
                      (lx + LAYER, FLOOR + 7.82, zz + 0.18), (lx + LAYER, FLOOR + 7.82, zz - 0.18)], PAL['lantern_lit'],
                  METAL, (1, 0, 0))
    # a tabard on a stand at the counter's front end: the guild's blue with a gilded lantern
    mx, mz = -12.8, -6.2
    abox(p, mx - 0.4, mx + 0.4, FLOOR, FLOOR + 0.12, mz - 0.4, mz + 0.4, PAL['oak_dark'], WOOD)
    cyl(p, mx, FLOOR + 0.12, FLOOR + 2.4, mz, 0.06, PAL['oak_dark'], WOOD, sides=6)
    p.beam([(mx, FLOOR + 2.3, mz - 0.6), (mx, FLOOR + 2.3, mz + 0.6)], 0.08, 0.08, PAL['oak_dark'], WOOD)
    p.box((mx, FLOOR + 1.55, mz), (0.24, 1.5, 1.1), PAL['blue'], WOOD)
    p.box((mx, FLOOR + 1.55, mz), (0.24 + 2 * LAYER, 1.42, 0.12), PAL['gold_dark'], WOOD)
    p.box((mx + 0.14, FLOOR + 1.75, mz), (0.02, 0.42, 0.42), PAL['gold'], METAL)
    p.box((mx + 0.16, FLOOR + 1.75, mz), (0.02, 0.26, 0.26), PAL['lantern_lit'], METAL)
    _ = glow


# ---------------------------------------------------------------------------
# The recruitment table (back left): a map of the five dungeons, pins, chairs
# ---------------------------------------------------------------------------
def recruitment(p, glow):
    R = RECRUIT_TABLE
    x0, x1, z0, z1 = R['x0'], R['x1'], R['z0'], R['z1']
    xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
    table(p, xm, zm, x1 - x0, z1 - z0, h=1.0, col=PAL['oak'][2])
    ty = FLOOR + 1.0
    # the map: a parchment over the top, the five regions painted on it, roads, pins and flags
    mx0, mx1, mz0, mz1 = x0 + 0.35, x1 - 0.35, z0 + 0.3, z1 - 0.3
    flat_face(p, [(mx0, ty + LAYER, mz0), (mx1, ty + LAYER, mz0), (mx1, ty + LAYER, mz1), (mx0, ty + LAYER, mz1)],
              PAL['parchment'], WOOD, (0, 1, 0))
    regions = [((0.15, 0.3), (0.32, 0.38, 0.4)), ((0.35, 0.7), (0.2, 0.36, 0.48)), ((0.55, 0.28), (0.22, 0.44, 0.5)),
               ((0.72, 0.68), (0.34, 0.3, 0.36)), ((0.88, 0.36), (0.3, 0.46, 0.22))]
    for k, ((fu, fv), col) in enumerate(regions):
        cx = mx0 + (mx1 - mx0) * fu
        cz = mz0 + (mz1 - mz0) * fv
        r = 0.45 + 0.1 * hashf(k, 7)
        pts = [(cx + math.cos(math.tau * i / 9) * r * (0.8 + 0.4 * hashf(k, i)), ty + 2 * LAYER,
                cz + math.sin(math.tau * i / 9) * r * 0.7 * (0.8 + 0.4 * hashf(i, k))) for i in range(9)]
        flat_face(p, pts, col, WOOD, (0, 1, 0))
        # a pin with a little flag at each region's heart
        cyl(p, cx, ty + 2 * LAYER, ty + 0.5, cz, 0.02, PAL['iron'], METAL, sides=4)
        flat_face(p, [(cx, ty + 0.5, cz), (cx + 0.26, ty + 0.42, cz), (cx, ty + 0.34, cz)], PAL['garnet'], WOOD, (0, 0, -1))
        flat_face(p, [(cx, ty + 0.5, cz), (cx, ty + 0.34, cz), (cx + 0.26, ty + 0.42, cz)], PAL['garnet'], WOOD, (0, 0, 1))
    for k in range(4):
        a = mx0 + (mx1 - mx0) * (0.15 + 0.2 * k)
        b = mx0 + (mx1 - mx0) * (0.35 + 0.2 * k)
        za = mz0 + (mz1 - mz0) * regions[k][0][1]
        zb = mz0 + (mz1 - mz0) * regions[k + 1][0][1]
        p.beam([(a, ty + 3 * LAYER, za), (b, ty + 3 * LAYER, zb)], 0.05, 0.005, (0.42, 0.26, 0.16), WOOD)
    # weights on the map's corners, a compass, a candelabrum at its end
    for (cx, cz) in ((mx0 + 0.1, mz0 + 0.1), (mx1 - 0.1, mz1 - 0.1)):
        cyl(p, cx, ty + LAYER, ty + 0.18, cz, 0.12, PAL['iron'], METAL, sides=8)
    cyl(p, mx1 - 0.4, ty + LAYER, ty + 0.06, mz0 + 0.35, 0.2, PAL['gold'], METAL, sides=10)
    # chairs along the near side, one at each end (the recruiter stands on the far side)
    for k in range(3):
        chair(p, x0 + 1.0 + k * 2.1, z0 - 0.75, 0.0, high=2.2, col=PAL['oak'][k % 3])
    chair(p, x1 + 0.8, zm, -math.pi / 2, high=2.2)
    chair(p, x0 - 0.8, zm, math.pi / 2, high=2.2)
    candelabrum(p, glow, x1 + 1.6, z1 + 0.9, h=2.4)


# ---------------------------------------------------------------------------
# The guildmaster's fireside (right gable, z 4.4 to 8.8)
# ---------------------------------------------------------------------------
def fireside(p, glow):
    xf = H['x0'] + HEARTH['depth']
    zm = (HEARTH['z0'] + HEARTH['z1']) / 2
    # a bear-skin rug before the fire (a plain hide shape, a layer over the floor)
    hide = [(xf + 0.6, zm - 1.6), (xf + 1.4, zm - 1.9), (xf + 2.4, zm - 1.5), (xf + 3.2, zm - 1.8), (xf + 3.4, zm - 0.6),
            (xf + 3.6, zm + 0.6), (xf + 3.2, zm + 1.8), (xf + 2.4, zm + 1.5), (xf + 1.4, zm + 1.9), (xf + 0.6, zm + 1.6),
            (xf + 0.9, zm)]
    # (two layers up: the hearthstone's top is a layer over the floor and the hide lies on it)
    flat_face(p, [(a, FLOOR + 2 * LAYER, b) for (a, b) in hide], (0.34, 0.24, 0.17), WOOD, (0, 1, 0))
    # two high-backed armchairs facing the fire, a little table with goblets between them
    chair(p, xf + 3.2, zm - 2.2, -math.pi / 2 - 0.5, high=2.8, col=PAL['oak'][2], carved=True, cushion=PAL['garnet'])
    chair(p, xf + 3.2, zm + 2.2, -math.pi / 2 + 0.5, high=2.8, col=PAL['oak'][2], carved=True, cushion=PAL['blue'])
    table(p, xf + 4.2, zm, 0.9, 0.9, h=0.75, col=PAL['walnut'])
    goblet(p, xf + 4.1, FLOOR + 0.75, zm - 0.2)
    goblet(p, xf + 4.3, FLOOR + 0.75, zm + 0.2)
    # the guild's great banner over the hearth, a sword crossed on a shield under it
    # (hung on the breast's dressed face, over the mantel)
    manor_banner(p, xf, zm, FLOOR + 9.3, (1, 0), width=2.4, length=3.8, field=PAL['blue'], emblem=False)
    lx = xf + 0.14 + 3 * LAYER
    flat_face(p, [(lx, FLOOR + 7.2, zm - 0.45), (lx, FLOOR + 7.2, zm + 0.45), (lx, FLOOR + 8.3, zm + 0.45),
                  (lx, FLOOR + 8.3, zm - 0.45)], PAL['gold'], METAL, (1, 0, 0))
    flat_face(p, [(lx + LAYER, FLOOR + 7.35, zm - 0.28), (lx + LAYER, FLOOR + 7.35, zm + 0.28),
                  (lx + LAYER, FLOOR + 8.12, zm + 0.28), (lx + LAYER, FLOOR + 8.12, zm - 0.28)], PAL['lantern_lit'], METAL,
              (1, 0, 0))
    _ = glow


# ---------------------------------------------------------------------------
# The rest of the great hall
# ---------------------------------------------------------------------------
def great_hall(p, glow):
    # the runner from the door to the trophy arch, broken round the lantern inlaid in the floor
    rug(p, -2.0, 2.0, H['z0'] + 0.9, -2.6, field=PAL['blue'], border=PAL['gold_dark'], seed=1)
    rug(p, -2.0, 2.0, 2.6, H['z1'] - 0.4, field=PAL['blue'], border=PAL['gold_dark'], seed=2)
    # the adventurers' tables near the door, benches either side, mugs and plates
    for i, (fx, fz) in enumerate(FRONT_TABLES):
        table(p, fx, fz, 5.2, 1.5, h=1.0, col=PAL['oak'][i])
        for sz in (-1, 1):
            bench(p, fx, fz + sz * 1.2, 4.6, 0.5)
        for k in range(4):
            px = fx - 1.8 + k * 1.2
            pz = fz + (0.35 if k % 2 else -0.35)
            plate(p, px, FLOOR + 1.0, pz)
            p.prism((px + 0.3, FLOOR + 1.0, pz), 8, 0.11, 0.12, 0.26, PAL['pewter'], METAL, axis=(0, 1, 0), cap1=False)
    # weapon racks in the front corners, against the front wall
    for x in (11.0, -11.0):
        weapon_rack(p, x, H['z0'] + 0.5)
    # two wheel chandeliers over the hall, hung from the ridge beam above the camera's air
    for sx in (1, -1):
        chandelier(p, glow, sx * 7.0, 0.0, FLOOR + 10.4, r=1.9, hang_to=H['ridge'] - 0.7, candles=12)
    # banners on the front wall between the windows and on the back wall either side of the arch
    for x in (8.2, -8.2):
        manor_banner(p, x, H['z0'], FLOOR + 9.6, (0, 1), width=1.6, length=3.8, field=PAL['garnet'], emblem=True)
    for x in (7.6, -7.6):
        manor_banner(p, x, H['z1'], FLOOR + 9.6, (0, -1), width=1.6, length=3.8, field=PAL['blue'], emblem=True)
    # shields and crossed swords on the gables over the wainscot
    for (zz, field) in ((-7.4, PAL['blue']), (9.0, PAL['garnet'])):
        shield(p, H['x1'] - 0.02, FLOOR + 5.6, zz, (-1, 0), r=0.8, field=field)
        sword(p, H['x1'] - 0.02, FLOOR + 5.6, zz, 0.7, (-1, 0))
        sword(p, H['x1'] - 0.02, FLOOR + 5.6, zz, -0.7, (-1, 0))
    # sconces on the trusses' pilasters
    for x in (-10.5, 10.5):
        for sz in (1, -1):
            sconce(p, glow, x, FLOOR + 4.2, sz * (H['z1'] - 0.36), (0, -sz))
    # barrels and a chest in the front right corner by the rack
    barrel(p, -13.2, -7.6)
    barrel(p, -12.3, -8.6, h=0.9, r=0.38)


# ---------------------------------------------------------------------------
# The trophy hall: five plaques, and the trophies and gilding (each its own part)
# ---------------------------------------------------------------------------
def _frame(slot):
    """The plaque's frame: pt(u, v, w) with u along the wall (to the visitor's right as they
    face it), v up, w out of the wall into the room."""
    x, y, z, (nx, nz) = slot
    ax, az = -nz, nx

    def pt(u, v, w):
        return (x + ax * u + nx * w, y + v, z + az * u + nz * w)
    return pt, (nx, nz), (ax, az)


def _shield_outline(w, h, n=14):
    """A heater shield's outline (u, v) round its centre, the point down."""
    pts = []
    for i in range(n + 1):
        t = i / n
        v = h / 2 - h * t
        half = w / 2 if t < 0.4 else w / 2 * math.cos((t - 0.4) / 0.6 * math.pi / 2) ** 0.8
        pts.append((half, v))
    left = [(-u, v) for (u, v) in reversed(pts)]
    return pts + left[1:-1]


def plaque(p, slot, big=False):
    """The oak plaque on the wall: a shield-shaped board with a moulded edge, iron brackets, a
    blank brass plate under it."""
    pt, (nx, nz), _ = _frame(slot)
    w, h = (3.4, 2.8) if big else (2.0, 2.5)
    outline = _shield_outline(w, h)
    back = 0.12
    front = back + 0.14
    flat_face(p, [pt(u, v, front) for (u, v) in outline], PAL['oak'][2], WOOD, (nx, 0, nz))
    for i in range(len(outline)):
        (ua, va), (ub, vb) = outline[i], outline[(i + 1) % len(outline)]
        flat_face(p, [pt(ua, va, back), pt(ub, vb, back), pt(ub, vb, front), pt(ua, va, front)], PAL['oak_dark'], WOOD,
                  _outward(pt, ua, va, ub, vb, front))
    # the moulding round the face, a layer proud
    inner = _shield_outline(w - 0.3, h - 0.3)
    for i in range(len(outline)):
        (ua, va), (ub, vb) = outline[i], outline[(i + 1) % len(outline)]
        (uc, vc), (ud, vd) = inner[i], inner[(i + 1) % len(inner)]
        flat_face(p, [pt(ua, va, front + LAYER), pt(ub, vb, front + LAYER), pt(ud, vd, front + LAYER),
                      pt(uc, vc, front + LAYER)], PAL['walnut'], WOOD, (nx, 0, nz))
    # iron brackets top and bottom, the hook a trophy hangs from
    for v in (h / 2 - 0.25, -h / 2 + 0.6):
        a, b = pt(-0.12, v - 0.08, 0.0), pt(0.12, v + 0.08, back)
        abox(p, min(a[0], b[0]), max(a[0], b[0]), v + slot[1] - 0.08, v + slot[1] + 0.08, min(a[2], b[2]),
             max(a[2], b[2]), PAL['iron'], METAL)
    p.ring(pt(0, h / 2 - 0.45, front + 0.06), 0.1, 0.025, PAL['iron'], 8, axis=(nx, 0, nz), mat=METAL)
    # the blank brass nameplate under the board
    pw = 1.2 if not big else 1.8
    flat_face(p, [pt(-pw / 2, -h / 2 - 0.55, back), pt(pw / 2, -h / 2 - 0.55, back), pt(pw / 2, -h / 2 - 0.2, back),
                  pt(-pw / 2, -h / 2 - 0.2, back)], PAL['gold_dark'], METAL, (nx, 0, nz))
    return w, h, front


def _outward(pt, ua, va, ub, vb, w):
    """The outward direction of the plaque's edge from (ua, va) to (ub, vb), in the model frame."""
    du, dv = ub - ua, vb - va
    nu, nv = dv, -du
    if nu * (ua + ub) + nv * (va + vb) < 0:
        nu, nv = -nu, -nv
    a = pt(0, 0, w)
    b = pt(nu, nv, w)
    return (b[0] - a[0], b[1] - a[1], b[2] - a[2])


def gilding(p, slot, w, h, front):
    """The heroic gilding: a gold rim round the plaque and a laurel spray under it."""
    pt, (nx, nz), _ = _frame(slot)
    outer = _shield_outline(w + 0.24, h + 0.24)
    inner = _shield_outline(w + 0.02, h + 0.02)
    for i in range(len(outer)):
        (ua, va), (ub, vb) = outer[i], outer[(i + 1) % len(outer)]
        (uc, vc), (ud, vd) = inner[i], inner[(i + 1) % len(inner)]
        flat_face(p, [pt(ua, va, front - 0.05), pt(ub, vb, front - 0.05), pt(ud, vd, front - 0.05),
                      pt(uc, vc, front - 0.05)], PAL['gold'], METAL, (nx, 0, nz))
    # a laurel spray round the plaque's lower half: leaves along two arcs from the point up the
    # sides, each a gilded lozenge in the plaque's plane (clear of the board, a hand proud of
    # the rim), a ribbon knot at the point, a star over the crown
    # (two layers over the board's moulding, which is a layer over its face)
    wl = front + 3 * LAYER
    for sgn in (1, -1):
        for k in range(9):
            t = k / 8
            ang = -math.pi / 2 + t * 1.25
            r = h * 0.58
            u = sgn * math.cos(ang) * (w * 0.62)
            v = -h * 0.06 + math.sin(ang) * r
            du, dv = -sgn * math.sin(ang) * (w * 0.62), math.cos(ang) * r
            n = math.hypot(du, dv) or 1.0
            du, dv = du / n, dv / n
            tilt = 0.55 if k % 2 else -0.55
            lu = du * math.cos(tilt) - dv * math.sin(tilt)
            lv = du * math.sin(tilt) + dv * math.cos(tilt)
            ll, lw = 0.26, 0.08
            pts = [(u - lu * ll, v - lv * ll), (u - lv * lw, v + lu * lw), (u + lu * ll, v + lv * ll),
                   (u + lv * lw, v - lu * lw)]
            flat_face(p, [pt(a, b, wl) for (a, b) in pts], PAL['gold'] if k % 2 else PAL['gold_dark'], METAL,
                      (nx, 0, nz))
    knot = [(-0.22, -h / 2 - 0.08), (0.22, -h / 2 - 0.08), (0.12, -h / 2 + 0.12), (-0.12, -h / 2 + 0.12)]
    flat_face(p, [pt(a, b, wl + LAYER) for (a, b) in knot], PAL['gold'], METAL, (nx, 0, nz))
    star = [(math.cos(math.tau * i / 8) * (0.26 if i % 2 == 0 else 0.11),
             h / 2 + 0.3 + math.sin(math.tau * i / 8) * (0.26 if i % 2 == 0 else 0.11)) for i in range(8)]
    flat_face(p, [pt(a, b, wl) for (a, b) in star], PAL['gold'], METAL, (nx, 0, nz))


def trophy_crypt(p, slot, front):
    """The Hollow Crypt: Morthen's funeral knell, a bronze bell hung under a bone mask from a
    yoke of black iron."""
    pt, (nx, nz), (ax, az) = _frame(slot)
    w0 = front + 0.05
    bone = (0.86, 0.82, 0.7)
    # the bone mask: a lofted skull face looking out, dark sockets, a cracked brow
    rings = []
    for k in range(7):
        t = k / 6
        rr = 0.42 * math.sin(0.2 + t * 2.5) + 0.12
        v = 0.6 - t * 0.9
        rings.append([pt(math.cos(math.tau * i / 10) * rr, v + 0.02 * math.sin(math.tau * i / 10) * rr,
                         w0 + 0.25 + math.sin(math.tau * i / 10) * rr * 0.6) for i in range(10)])
    p.loft(rings, lambda r, s: tone(bone, r, s, spread=0.1), mat=WOOD)
    for su in (-0.16, 0.16):
        p.prism(pt(su, 0.45, w0 + 0.6), 8, 0.11, 0.09, 0.06, (0.06, 0.05, 0.05), WOOD, axis=(nx, 0, nz))
    p.prism(pt(0, 0.28, w0 + 0.62), 3, 0.06, 0.04, 0.05, (0.08, 0.06, 0.06), WOOD, axis=(nx, 0, nz))
    for k in range(5):
        p.box(pt(-0.16 + k * 0.08, 0.1, w0 + 0.56), (0.05, 0.1, 0.05), bone, WOOD)
    # the yoke and the bell under it
    p.beam([pt(-0.7, -0.35, w0 + 0.2), pt(0.7, -0.35, w0 + 0.2)], 0.12, 0.12, PAL['iron'], METAL, up=(0, 1, 0))
    p.prism(pt(0, -0.42, w0 + 0.2), 14, 0.08, 0.36, -0.5, PAL['copper_dark'], METAL, axis=(0, 1, 0))
    p.prism(pt(0, -0.92, w0 + 0.2), 14, 0.36, 0.46, -0.18, PAL['copper'], METAL, axis=(0, 1, 0))
    p.ring(pt(0, -1.08, w0 + 0.2), 0.46, 0.04, PAL['gold_dark'], 14, axis=(0, 1, 0), mat=METAL)
    p.cylinder(pt(0, -1.0, w0 + 0.2), pt(0, -1.3, w0 + 0.2), 0.07, PAL['iron'], METAL, sides=6)
    _ = ax, az


def trophy_bastion(p, glow_like, slot, front):
    """The Sunken Bastion: the Mistcaller's lantern, its glass still glowing sea-blue, crossed
    over a drowned officer's cutlass, a hank of chain and barnacles."""
    pt, (nx, nz), _ = _frame(slot)
    w0 = front + 0.05
    # the cutlass, diagonal behind
    p.beam([pt(-0.75, -0.85, w0 + 0.05), pt(0.7, 0.85, w0 + 0.05)], 0.16, 0.03, PAL['iron_hi'], METAL, up=(nx, 0, nz))
    p.beam([pt(-0.75, -0.85, w0 + 0.08), pt(-0.95, -1.1, w0 + 0.08)], 0.07, 0.07, PAL['leather'], WOOD)
    p.ring(pt(-0.68, -0.76, w0 + 0.1), 0.18, 0.03, PAL['gold_dark'], 10, axis=(nx, 0, nz), mat=METAL)
    # the lantern: a hooded frame, the glowing glass (sea blue), a ring on top
    lw = 0.34
    c = pt(0.0, -0.1, w0 + 0.45)
    abox(p, c[0] - lw - 0.06, c[0] + lw + 0.06, c[1] - 0.62, c[1] - 0.52, c[2] - lw - 0.06, c[2] + lw + 0.06,
         PAL['copper_dark'], METAL)
    abox(p, c[0] - lw, c[0] + lw, c[1] - 0.52, c[1] + 0.32, c[2] - lw, c[2] + lw, (0.3, 0.62, 0.66), GLASS_BLUE)
    for sx in (1, -1):
        for sz in (1, -1):
            abox(p, c[0] + sx * lw - 0.04, c[0] + sx * lw + 0.04, c[1] - 0.52, c[1] + 0.32, c[2] + sz * lw - 0.04,
                 c[2] + sz * lw + 0.04, PAL['copper_dark'], METAL)
    p.prism((c[0], c[1] + 0.32, c[2]), 6, lw + 0.12, 0.06, 0.34, (0.3, 0.46, 0.4), METAL, axis=(0, 1, 0))
    p.ring((c[0], c[1] + 0.76, c[2]), 0.12, 0.03, PAL['copper_dark'], 8, axis=(ax_of(nx, nz)[0], 0, ax_of(nx, nz)[1]),
           mat=METAL)
    # a hank of chain and barnacles on the board's foot
    chain(p, pt(-0.55, -0.95, w0 + 0.1), pt(0.6, -0.8, w0 + 0.12), links=6)
    for k in range(6):
        q = pt(-0.5 + 0.2 * k, -1.05 + 0.08 * (k % 2), w0 + 0.08)
        p.prism(q, 6, 0.06, 0.02, 0.07, (0.62, 0.6, 0.52), STONE, axis=(nx, 0, nz))
    _ = glow_like


def ax_of(nx, nz):
    return (-nz, nx)


def trophy_temple(p, slot, front):
    """The Drowned Temple: Ysolei's moon diadem, a silver crescent set with a pearl, over a
    coral trident."""
    pt, (nx, nz), _ = _frame(slot)
    w0 = front + 0.05
    coral = (0.86, 0.44, 0.36)
    # the trident, upright behind
    p.cylinder(pt(0, -1.15, w0 + 0.05), pt(0, 0.6, w0 + 0.05), 0.045, coral, WOOD, sides=6)
    p.beam([pt(-0.42, 0.6, w0 + 0.06), pt(0.42, 0.6, w0 + 0.06)], 0.06, 0.06, coral, WOOD, up=(nx, 0, nz))
    for su in (-0.42, 0.0, 0.42):
        p.beam([pt(su, 0.6, w0 + 0.06), pt(su, 1.0 + (0.1 if su == 0 else 0.0), w0 + 0.06)], 0.05, 0.05, coral, WOOD,
               up=(nx, 0, nz))
        p.prism(pt(su, 1.0 + (0.1 if su == 0 else 0.0), w0 + 0.06), 4, 0.07, 0.0, 0.2, coral, WOOD, axis=(0, 1, 0))
    # the crescent diadem in front: a silver arc thick at the middle, tapering to points
    n = 14
    for i in range(n):
        a0, a1 = math.pi * (0.1 + 0.8 * i / n), math.pi * (0.1 + 0.8 * (i + 1) / n)
        t0, t1 = abs(i / n - 0.5), abs((i + 1) / n - 0.5)
        r = 0.55
        th0, th1 = 0.16 * (1 - t0 * 1.6), 0.16 * (1 - t1 * 1.6)
        a, b = pt(math.cos(a0) * r, -0.2 + math.sin(a0) * r * 0.5, w0 + 0.32), pt(math.cos(a1) * r, -0.2 + math.sin(a1) * r * 0.5, w0 + 0.32)
        p.beam([a, b], max(0.03, (th0 + th1)), 0.08, PAL['silver'], METAL, up=(nx, 0, nz))
    # the crescent moon's horns rising at the front and the pearl
    for sgn in (-1, 1):
        p.sweep([pt(sgn * 0.08, 0.06, w0 + 0.4), pt(sgn * 0.26, 0.3, w0 + 0.42), pt(sgn * 0.14, 0.52, w0 + 0.44)],
                0.07, 0.015, PAL['silver'], sides=5, mat=METAL)
    p.rock_blob(pt(0, 0.12, w0 + 0.46), (0.17, 0.17, 0.17), (0.94, 0.92, 0.86), METAL, jitter=0.02)


def trophy_wildheart(p, slot, front):
    """The Wildheart Basin: the High Priest's jaguar mask, beaten gold with jade inlay, black
    rosettes, fangs and a crest of green and scarlet feathers."""
    pt, (nx, nz), _ = _frame(slot)
    w0 = front + 0.05
    gold = PAL['gold']
    jade = (0.22, 0.56, 0.42)
    # the feather crest fanned behind
    for k in range(9):
        a = math.pi * (0.15 + 0.7 * k / 8)
        col = jade if k % 2 else (0.72, 0.16, 0.12)
        p.beam([pt(0, 0.2, w0 + 0.05), pt(math.cos(a) * 1.0, 0.2 + math.sin(a) * 0.95, w0 + 0.05)], 0.16, 0.02, col,
               WOOD, up=(nx, 0, nz))
    # the face: a lofted dome, broad at the brow, a muzzle, two ears
    rings = []
    for k in range(7):
        t = k / 6
        rr = 0.5 - 0.22 * t * t
        v = 0.4 - t * 0.85
        rings.append([pt(math.cos(math.tau * i / 12) * rr, v, w0 + 0.22 + max(0.0, math.sin(math.tau * i / 12)) * rr * 0.55)
                      for i in range(12)])
    p.loft(rings, lambda r, s: tone(gold, r, s, spread=0.12), mat=METAL)
    for sgn in (-1, 1):
        p.prism(pt(sgn * 0.36, 0.5, w0 + 0.3), 3, 0.16, 0.02, 0.24, gold, METAL, axis=(sgn * 0.4, 1, 0))
        # jade eyes and black rosettes
        p.prism(pt(sgn * 0.17, 0.18, w0 + 0.5), 6, 0.09, 0.07, 0.05, jade, METAL, axis=(nx, 0, nz))
        for (u, v) in ((0.3, 0.0), (0.25, -0.25), (0.12, 0.34)):
            p.prism(pt(sgn * u, v, w0 + 0.46), 5, 0.05, 0.04, 0.03, (0.08, 0.07, 0.06), METAL, axis=(nx, 0, nz))
        # fangs
        p.prism(pt(sgn * 0.09, -0.36, w0 + 0.5), 4, 0.04, 0.0, -0.2, (0.95, 0.92, 0.84), WOOD, axis=(0, 1, 0))
    p.prism(pt(0, -0.12, w0 + 0.56), 4, 0.08, 0.05, 0.08, (0.1, 0.08, 0.06), METAL, axis=(nx, 0, nz))


def trophy_gravewyrm(p, slot, front):
    """The Gravewyrm Sanctum: Korzul's skull, long-snouted, crowned with swept horns, its jaw
    hung open over the mantel."""
    pt, (nx, nz), _ = _frame(slot)
    w0 = front + 0.05
    bone = (0.82, 0.78, 0.66)
    dark = (0.12, 0.1, 0.09)
    # the cranium and the long snout reaching out into the room and down: a flat wedge, broad
    # and high at the back, keeled along the top, a flat palate under
    rings = []
    for k in range(10):
        t = k / 9
        rw = 0.82 * (1 - 0.66 * t) + 0.05
        rh = 0.46 * (1 - 0.6 * t) + 0.04
        cv = 0.34 - 0.62 * t * t
        cw = w0 + 0.25 + 2.1 * t
        ring = []
        for i in range(12):
            a_ = math.tau * i / 12
            ca, sa = math.cos(a_), math.sin(a_)
            yy = sa * rh * (1.25 if sa > 0.85 else 1.0) if sa > 0 else sa * rh * 0.55
            ring.append(pt(ca * rw * (1.0 - 0.18 * max(0.0, sa)), cv + yy, cw))
        rings.append(ring)
    p.loft(rings, lambda r, s: tone(bone, r, s, spread=0.14), mat=WOOD)
    # the brow ridges over the sockets, heavy and swept back
    for sgn in (-1, 1):
        p.sweep([pt(sgn * 0.18, 0.62, w0 + 1.05), pt(sgn * 0.55, 0.66, w0 + 0.75), pt(sgn * 0.78, 0.52, w0 + 0.4)],
                0.12, 0.06, tone(bone, sgn, 7), sides=5, mat=WOOD)
    # the lower jaw, hanging open
    jaw = []
    for k in range(8):
        t = k / 7
        rw = 0.66 * (1 - 0.6 * t) + 0.05
        cv = -0.2 - 0.85 * t
        cw = w0 + 0.3 + 1.75 * t
        jaw.append([pt(math.cos(math.tau * i / 8) * rw, cv + math.sin(math.tau * i / 8) * 0.11, cw) for i in range(8)])
    p.loft(jaw, lambda r, s: tone(bone, r, s, 3, spread=0.12), mat=WOOD)
    # teeth along the upper and lower jaws
    for k in range(8):
        t = (k + 0.5) / 8
        for sgn in (-1, 1):
            u = sgn * ((0.82 * (1 - 0.66 * t) + 0.05) * 0.92)
            cv = 0.34 - 0.62 * t * t
            p.prism(pt(u, cv - 0.22, w0 + 0.25 + 2.1 * t), 4, 0.06, 0.0, -0.3, (0.95, 0.92, 0.82), WOOD, axis=(0, 1, 0))
            ju = sgn * ((0.66 * (1 - 0.6 * t) + 0.05) * 0.9)
            p.prism(pt(ju, -0.2 - 0.85 * t + 0.08, w0 + 0.3 + 1.75 * t), 4, 0.05, 0.0, 0.24, (0.95, 0.92, 0.82), WOOD,
                    axis=(0, 1, 0))
    # sockets deep and dark under the brows, nostrils at the snout's tip
    for sgn in (-1, 1):
        p.prism(pt(sgn * 0.5, 0.42, w0 + 0.85), 8, 0.2, 0.14, 0.07, dark, WOOD, axis=(sgn * 0.7, 0.35, 0.6))
        p.prism(pt(sgn * 0.13, -0.36, w0 + 2.3), 6, 0.07, 0.05, 0.05, dark, WOOD, axis=(0, 0.4, 1))
    # the swept horns: two great ones back over the plaque, two short ones at the cheeks
    for sgn in (-1, 1):
        pts = [pt(sgn * (0.5 + 0.9 * t), 0.55 + 1.1 * t - 0.5 * t * t, w0 + 0.45 - 0.35 * t) for t in
               (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        p.sweep(pts, 0.2, 0.03, (0.36, 0.3, 0.24), sides=6, mat=WOOD)
        pts = [pt(sgn * (0.7 + 0.5 * t), -0.1 - 0.2 * t, w0 + 0.5 - 0.1 * t) for t in (0.0, 0.5, 1.0)]
        p.sweep(pts, 0.11, 0.02, (0.4, 0.34, 0.26), sides=5, mat=WOOD)
    # a ridge of crest spines down the skull
    for k in range(5):
        t = k / 5
        p.prism(pt(0, 0.62 - 0.3 * t, w0 + 0.35 + 1.3 * t), 4, 0.07, 0.0, 0.3 - 0.04 * k, (0.36, 0.3, 0.24), WOOD,
                axis=(0, 1, 0.3))


TROPHIES = {
    'hollow_crypt': trophy_crypt,
    'sunken_bastion': lambda p, slot, front: trophy_bastion(p, None, slot, front),
    'drowned_temple': trophy_temple,
    'wildheart_basin': trophy_wildheart,
    'gravewyrm_sanctum': trophy_gravewyrm,
}


def trophy_room(p, glow, trophies, gilt):
    T = TROPHY
    rug(p, -2.4, 2.4, H['oz1'] + 0.8, T['z1'] - TROPHY_HEARTH['depth'] - 1.6, field=PAL['garnet'], border=PAL['gold_dark'],
        seed=5)
    for sx in (1, -1):
        bench(p, sx * 4.4, 15.4, 0.6, 3.2, col=PAL['oak'][2])
    for sx in (1, -1):
        candelabrum(p, glow, sx * 3.4, H['oz1'] + 1.2, h=2.6)
    for dungeon, slot in TROPHY_SLOTS.items():
        big = dungeon == 'gravewyrm_sanctum'
        w, h, front = plaque(p, slot, big=big)
        gilding(gilt[dungeon], slot, w, h, front)
        TROPHIES[dungeon](trophies[dungeon], slot, front)
    # sconces between the plaques
    for sx in (1, -1):
        sconce(p, glow, sx * (T['x1'] - 0.02), FLOOR + 4.6, 15.4, (-sx, 0))


def build(parts):
    f, glow = parts['G_INT_Furnishings'], parts['GuildGlow']
    contracts_board(f, glow)
    clerk_desk(f, glow)
    quartermaster(f, glow)
    recruitment(f, glow)
    fireside(f, glow)
    great_hall(f, glow)
    trophy_room(f, glow, {d: parts[f'G_INT_Trophy_{d}'] for d in TROPHY_IDS},
                {d: parts[f'G_INT_TrophyGilt_{d}'] for d in TROPHY_IDS})
    _ = (GLOW, GLOW_CANDLE, cbox, _ball, STONE)
