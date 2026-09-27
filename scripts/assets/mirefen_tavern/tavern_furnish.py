"""The Mirefen tavern's furnishings, lights, trim and clutter (build_tavern.py calls
build(B, parts) with itself as B).

  TavernFurnishings  every piece of furniture the sim collides with, drawn at its collider:
                     the benches round the fire, the tables, chairs and stools, the settle by
                     the wall fire, the gallery bench, the beds and chests upstairs, the kegs on
                     the bar's short counter
  TavernLights       the lanterns on chains over the tables and the bar, the wheel chandelier
                     over the entry, the candles on the bar, the hearth's fire, the sconces on
                     the pillar and the newel, a candle in each room (the landmarks: every tier)
  TavernTrim         medium and up: stretchers, iron bands on the chests, the candle cups
  TavernClutter      high and up: tankards and plates, bread and cheese, dice, cards, the bard's
                     lute and stand, firewood, rugs, books, a broom, a sleeping cat
"""
import math


def build(B, parts):
    furnishings(B, parts['TavernFurnishings'], parts['TavernTrim'])
    lights(B, parts['TavernLights'])
    clutter(B, parts['TavernClutter'])


def rot_xz(x, z, a):
    """A local offset turned by a yaw (three.js rotation.y)."""
    c, s = math.cos(a), math.sin(a)
    return (x * c + z * s, -x * s + z * c)


def piece_at(q, lx, lz):
    dx, dz = rot_xz(lx, lz, q['rot'])
    return q['x'] + dx, q['z'] + dz


def tbox(B, p, q, lx0, lx1, y0, y1, lz0, lz1, color, mat):
    """A box in a prop's own frame (turned by its yaw), y over the ground floor."""
    corners = []
    for (lx, lz) in ((lx0, lz0), (lx1, lz0), (lx1, lz1), (lx0, lz1)):
        corners.append(piece_at(q, lx, lz))
    pts = [(x, y0, z) for (x, z) in corners] + [(x, y1, z) for (x, z) in corners]
    B.hexa(p, pts, color, mat)


def leg(B, p, q, lx, lz, y0, y1, w, color):
    x, z = piece_at(q, lx, lz)
    B.post(p, x, z, y0, y1, w, color)


# ---------------------------------------------------------------------------
# Furniture
# ---------------------------------------------------------------------------
def bench(B, p, trim, q):
    base, top = q['base'], q['base'] + q['height']
    hw, hd = q['hw'], q['hd']
    honey = B.PAL['honey']
    tbox(B, p, q, -hw, hw, top - 0.14, top, -hd, hd, honey[1], B.WOOD)
    for lx in (-hw + 0.2, hw - 0.2):
        tbox(B, p, q, lx - 0.1, lx + 0.1, base, top - 0.14, -hd + 0.05, hd - 0.05, B.PAL['beam'], B.WOOD)
    tbox(B, trim, q, -hw + 0.25, hw - 0.25, base + 0.25, base + 0.37, -0.05, 0.05, B.PAL['beam_dark'], B.WOOD)
    # the fire's benches wear garnet cushions
    if q['base'] < 0:
        tbox(B, p, q, -hw + 0.12, hw - 0.12, top, top + 0.1, -hd + 0.06, hd - 0.06, B.PAL['garnet'], B.PLASTER)


def table(B, p, trim, q):
    base, top = q['base'], q['base'] + q['height']
    hw, hd = q['hw'], q['hd']
    tbox(B, p, q, -hw - 0.08, hw + 0.08, top - 0.14, top, -hd - 0.08, hd + 0.08, B.PAL['honey'][2], B.WOOD)
    tbox(B, p, q, -hw + 0.05, hw - 0.05, top - 0.3, top - 0.14, -hd + 0.05, hd - 0.05, B.PAL['beam'], B.WOOD)
    if hd > hw * 1.5:
        # a trestle table: two splayed trestles and a stretcher
        for lz in (-hd + 0.45, hd - 0.45):
            tbox(B, p, q, -hw + 0.1, hw - 0.1, base, base + 0.18, lz - 0.14, lz + 0.14, B.PAL['beam_dark'], B.WOOD)
            tbox(B, p, q, -0.12, 0.12, base + 0.18, top - 0.3, lz - 0.12, lz + 0.12, B.PAL['beam'], B.WOOD)
        tbox(B, trim, q, -0.08, 0.08, base + 0.6, base + 0.76, -hd + 0.45, hd - 0.45, B.PAL['beam_dark'], B.WOOD)
    else:
        for lx in (-hw + 0.18, hw - 0.18):
            for lz in (-hd + 0.18, hd - 0.18):
                leg(B, p, q, lx, lz, base, top - 0.3, 0.18, B.PAL['beam'])
        tbox(B, trim, q, -hw + 0.2, hw - 0.2, base + 0.3, base + 0.4, -0.05, 0.05, B.PAL['beam_dark'], B.WOOD)


def round_table(B, p, trim, q):
    base, top = q['base'], q['base'] + q['height']
    x, z, r = q['x'], q['z'], q['r']
    p.cylinder((x, top - 0.14, z), (x, top, z), r + 0.05, B.PAL['honey'][2], B.WOOD, sides=16)
    p.cylinder((x, base + 0.3, z), (x, top - 0.14, z), 0.22, B.PAL['beam'], B.WOOD, sides=8)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        B.beam(p, (x, base + 0.3, z), (x + math.sin(a) * r * 0.75, base + 0.05, z + math.cos(a) * r * 0.75), 0.2,
               0.16, B.PAL['beam_dark'])
    # a green baize circle for the dice (trim)
    p.cylinder((x, top, z), (x, top + 0.02, z), r - 0.2, (0.2, 0.36, 0.26), B.PLASTER, sides=16)


def chair(B, p, trim, q):
    base, seat = q['base'], q['base'] + q['height']
    r = q['r']
    tbox(B, p, q, -r, r, seat - 0.12, seat, -r, r, B.PAL['honey'][0], B.WOOD)
    for lx in (-r + 0.1, r - 0.1):
        for lz in (-r + 0.1, r - 0.1):
            leg(B, p, q, lx, lz, base, seat - 0.12, 0.12, B.PAL['beam'])
    # the back on the side away from the table (local -z), with a garnet slat
    for lx in (-r + 0.08, r - 0.08):
        leg(B, p, q, lx, -r + 0.08, seat, seat + 1.4, 0.13, B.PAL['beam'])
    tbox(B, p, q, -r, r, seat + 1.15, seat + 1.4, -r + 0.02, -r + 0.14, B.PAL['beam'], B.WOOD)
    tbox(B, p, q, -r + 0.12, r - 0.12, seat + 0.5, seat + 0.95, -r + 0.04, -r + 0.12, B.PAL['garnet'], B.PLASTER)
    tbox(B, trim, q, -r + 0.1, r - 0.1, base + 0.3, base + 0.38, r - 0.14, r - 0.06, B.PAL['beam_dark'], B.WOOD)


def stool(B, p, trim, q):
    base, seat = q['base'], q['base'] + q['height']
    x, z, r = q['x'], q['z'], q['r']
    p.cylinder((x, seat - 0.12, z), (x, seat, z), r, B.PAL['honey'][3], B.WOOD, sides=10)
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.3
        B.beam(p, (x + math.sin(a) * r * 0.5, seat - 0.12, z + math.cos(a) * r * 0.5),
               (x + math.sin(a) * r * 0.85, base, z + math.cos(a) * r * 0.85), 0.1, 0.1, B.PAL['beam'])
    p.ring((x, base + 0.35, z), r * 0.72, 0.05, B.PAL['beam_dark'], segments=6, axis=(0, 1, 0), mat=B.WOOD)


def settle(B, p, trim, q):
    """The high-backed settle facing the wall fire: a seat, a tall panelled back, arms."""
    base, seat = q['base'], q['base'] + q['height']
    hw, hd = q['hw'], q['hd']
    tbox(B, p, q, -hw, hw, base, seat, -hd, hd, B.PAL['beam'], B.WOOD)
    tbox(B, p, q, -hw + 0.05, hw - 0.05, seat, seat + 0.12, -hd + 0.05, hd - 0.05, B.PAL['garnet'], B.PLASTER)
    tbox(B, p, q, -hw, hw, base, seat + 1.8, -hd - 0.12, -hd + 0.06, B.PAL['honey'][1], B.WOOD)
    for lx in (-hw, hw - 0.12):
        tbox(B, p, q, lx, lx + 0.12, seat, seat + 0.7, -hd, hd, B.PAL['beam_dark'], B.WOOD)
    tbox(B, p, q, -hw - 0.05, hw + 0.05, seat + 1.8, seat + 1.95, -hd - 0.2, -hd + 0.1, B.PAL['beam_dark'], B.WOOD)


def bed(B, p, trim, q):
    base = q['base']
    top = base + q['height']
    hw, hd = q['hw'], q['hd']
    tbox(B, p, q, -hw, hw, base + 0.2, top - 0.35, -hd, hd, B.PAL['beam'], B.WOOD)
    for lx in (-hw + 0.1, hw - 0.1):
        for lz in (-hd + 0.1, hd - 0.1):
            leg(B, p, q, lx, lz, base, base + 0.25, 0.2, B.PAL['beam_dark'])
    tbox(B, p, q, -hw + 0.08, hw - 0.08, top - 0.35, top - 0.1, -hd + 0.08, hd - 0.08, B.PAL['cream'], B.PLASTER)
    tbox(B, p, q, -hw + 0.02, hw - 0.02, top - 0.2, top, -hd + 0.9, hd - 0.02, B.PAL['garnet'], B.PLASTER)
    tbox(B, p, q, -hw + 0.25, hw - 0.25, top - 0.12, top + 0.12, -hd + 0.15, -hd + 0.75, B.PAL['cream'], B.PLASTER)
    # the headboard at the wall end (local -z)
    tbox(B, p, q, -hw - 0.05, hw + 0.05, base, top + 1.0, -hd - 0.15, -hd + 0.02, B.PAL['honey'][0], B.WOOD)
    tbox(B, p, q, -hw - 0.1, hw + 0.1, top + 1.0, top + 1.15, -hd - 0.2, -hd + 0.06, B.PAL['beam_dark'], B.WOOD)
    tbox(B, p, q, -hw - 0.05, hw + 0.05, base, top + 0.1, hd - 0.02, hd + 0.12, B.PAL['honey'][0], B.WOOD)


def chest(B, p, trim, q):
    base, top = q['base'], q['base'] + q['height']
    hw, hd = q['hw'], q['hd']
    tbox(B, p, q, -hw, hw, base, top - 0.2, -hd, hd, B.PAL['honey'][1], B.WOOD)
    tbox(B, p, q, -hw - 0.03, hw + 0.03, top - 0.2, top, -hd - 0.03, hd + 0.03, B.PAL['beam'], B.WOOD)
    for lx in (-hw + 0.2, hw - 0.2):
        tbox(B, trim, q, lx - 0.05, lx + 0.05, base, top + 0.01, -hd - 0.04, hd + 0.04, B.PAL['iron'], B.METAL)
    tbox(B, trim, q, -0.1, 0.1, top - 0.35, top - 0.1, hd + 0.03, hd + 0.07, B.PAL['gold'], B.METAL)


def kegs(B, p, trim, q):
    """Two kegs on a cradle along the short counter behind the pillar."""
    x, z, top = q['x'], q['z'], q['base'] + q['height']
    for dz in (-0.3, 0.35):
        zz = z + dz
        tbox(B, p, dict(q, z=zz), -0.4, 0.4, top, top + 0.18, -0.08, 0.08, B.PAL['beam_dark'], B.WOOD)
        p.cylinder((x - 0.45, top + 0.5, zz), (x + 0.45, top + 0.5, zz), 0.34, B.PAL['honey'][2], B.WOOD, sides=10)
        for xx in (x - 0.3, x + 0.3):
            p.ring((xx, top + 0.5, zz), 0.36, 0.06, B.PAL['iron'], segments=10, axis=(1, 0, 0), mat=B.METAL,
                   depth=0.04)
        p.cylinder((x + 0.45, top + 0.35, zz), (x + 0.62, top + 0.35, zz), 0.05, B.PAL['gold'], B.METAL, sides=6)


FURNITURE = {
    'bench': bench, 'table': table, 'roundTable': round_table, 'chair': chair, 'stool': stool,
    'settle': settle, 'bed': bed, 'chest': chest,
}


def furnishings(B, p, trim):
    for q in B.LAYOUT['props']:
        fn = FURNITURE.get(q['kind'])
        if fn:
            fn(B, p, trim, q)
        elif q['kind'] == 'counter' and q['hd'] > q['hw']:
            kegs(B, p, trim, q)


# ---------------------------------------------------------------------------
# Lights (the landmarks: every tier)
# ---------------------------------------------------------------------------
def candle(B, p, x, y, z, h=0.32, r=0.06):
    p.cylinder((x, y, z), (x, y + h, z), r, B.PAL['cream'], B.PLASTER, sides=6)
    p.box((x, y + h + 0.08, z), (0.07, 0.16, 0.07), B.PAL['candle'], B.GLOW, taper=0.2)


def lights(B, p):
    from tavern_shell import lantern

    H, G = B.HALL, B.G
    iron = B.PAL['iron']
    g = B.LAYOUT['gallery']
    for q in B.LAYOUT['lanterns']:
        x, z, y = q['x'], q['z'], q['y']
        if z < -4:
            # over the bar: hung from an iron arm out of the gallery's edge
            hang = G - 0.25
            B.beam(p, (x, hang, g['z1'] - 0.1), (x, hang, z), 0.09, 0.09, iron, B.METAL)
            B.beam(p, (x, hang - 1.2, g['z1'] + 0.05), (x, hang - 0.05, g['z1'] + 1.5), 0.06, 0.06, iron, B.METAL)
        else:
            hang = H['aisleBeam']
        B.chain(p, (x, hang, z), (x, y + 0.45, z), links=max(3, int((hang - y) / 0.3)))
        lantern(B, p, x, y, z, 0.42)
    # the wheel chandelier on four chains from the tie beam over the entry
    c = B.LAYOUT['chandelier']
    cx, cy, cz, r = c['x'], c['y'], c['z'], c['r']
    p.ring((cx, cy, cz), r, 0.18, B.PAL['beam_dark'], segments=16, axis=(0, 1, 0), mat=B.WOOD, depth=0.22)
    p.ring((cx, cy + 0.05, cz), r + 0.05, 0.06, iron, segments=16, axis=(0, 1, 0), mat=B.METAL, depth=0.26)
    for k in range(6):
        a = k * math.pi / 3
        B.beam(p, (cx, cy, cz), (cx + math.sin(a) * r, cy, cz + math.cos(a) * r), 0.1, 0.1, B.PAL['beam_dark'],
               B.WOOD)
    p.cylinder((cx, cy - 0.3, cz), (cx, cy + 0.2, cz), 0.25, B.PAL['beam_dark'], B.WOOD, sides=8)
    for k in range(10):
        a = (k + 0.5) * 2 * math.pi / 10
        x, z = cx + math.sin(a) * r, cz + math.cos(a) * r
        p.cylinder((x, cy + 0.12, z), (x, cy + 0.2, z), 0.12, iron, B.METAL, sides=6)
        candle(B, p, x, cy + 0.2, z, h=0.36, r=0.07)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        B.chain(p, (cx + math.sin(a) * r * 0.95, cy + 0.15, cz + math.cos(a) * r * 0.95), (cx, H['tie'], cz),
                links=12)
    # the candles along the bar's long counter, in three clusters
    counter = next(q for q in B.LAYOUT['props'] if q['kind'] == 'counter' and q['hw'] > q['hd'])
    top = counter['base'] + counter['height']
    for dx in (-2.6, 0.2, 2.9):
        x, z = counter['x'] + dx, counter['z'] - 0.15
        p.cylinder((x, top, z), (x, top + 0.06, z), 0.22, iron, B.METAL, sides=8)
        for (ox, oz, h) in ((0, 0, 0.42), (0.13, 0.08, 0.3), (-0.12, 0.07, 0.24)):
            candle(B, p, x + ox, top + 0.06, z + oz, h=h)
    # sconces on the pillar and on the newel at the landing
    pillar = next(q for q in B.LAYOUT['props'] if q['kind'] == 'pillar')
    for a in (math.pi * 0.25, -math.pi * 0.35):
        x = pillar['x'] + math.sin(a) * (pillar['r'] + 0.15)
        z = pillar['z'] + math.cos(a) * (pillar['r'] + 0.15)
        y = pillar['base'] + 3.1
        p.box((x, y, z), (0.2, 0.3, 0.2), iron, B.METAL)
        candle(B, p, x + math.sin(a) * 0.15, y + 0.15, z + math.cos(a) * 0.15, h=0.3)
    # the sconces up the stair tower's wall (lit: render/mirefen_tavern.ts lights each at its
    # lantern): a backplate on the stone, a braced arm, the lantern hung from its tip
    T = B.TOWER
    for q in B.LAYOUT['towerSconces']:
        a, y = q['angle'], q['y']
        sa, ca = math.sin(a), math.cos(a)

        def at(r, yy):
            return (T['x'] + sa * r, yy, T['z'] + ca * r)

        wall = T['rIn'] - 0.04
        tip = T['rIn'] - 0.55
        p.box(at(wall - 0.03, y + 0.55), (0.3, 0.62, 0.3), iron, B.METAL, yaw=a)
        B.beam(p, at(wall - 0.05, y + 0.78), at(tip, y + 0.78), 0.07, 0.07, iron, B.METAL)
        B.beam(p, at(wall - 0.05, y + 0.32), at(tip + 0.2, y + 0.72), 0.05, 0.05, iron, B.METAL)
        p.box(at(tip, y + 0.62), (0.05, 0.3, 0.05), iron, B.METAL)
        lantern(B, p, *at(tip, y), 0.38)
    # the hearth's bed of embers under the logs (the live flames over them are the game's
    # campfire flame, render/mirefen_tavern.ts MIREFEN_TAVERN_FLAMES)
    pit = B.LAYOUT['pit']
    d = -pit['depth']
    p.cylinder((pit['x'], d + 0.3, pit['z']), (pit['x'], d + 0.42, pit['z']), 0.95, B.PAL['ember'], B.GLOW,
               sides=10)
    for k in range(5):
        a = k * 1.3
        p.rock_blob((pit['x'] + math.sin(a) * 0.55, d + 0.45, pit['z'] + math.cos(a) * 0.55), (0.3, 0.12, 0.26),
                    B.PAL['fire'], B.GLOW, jitter=0.2)
    # a candle in each room upstairs and a lantern over the wing's landing
    for q in B.LAYOUT['props']:
        if q['kind'] == 'chest' and q['base'] >= G and q['z'] < -20:
            candle(B, p, q['x'] - 0.3, q['base'] + q['height'], q['z'], h=0.35, r=0.08)
    W = B.WING
    B.chain(p, (9.0, W['eave'] - 0.35, -17.4), (9.0, G + 3.7, -17.4), links=6)
    lantern(B, p, 9.0, G + 3.3, -17.4, 0.36)


# ---------------------------------------------------------------------------
# Clutter (high and up): nothing here is solid, so it keeps to tables, walls and corners
# ---------------------------------------------------------------------------
def mug(B, p, x, y, z, a=0.0):
    p.cylinder((x, y, z), (x, y + 0.34, z), 0.13, B.PAL['honey'][1], B.WOOD, sides=8)
    p.ring((x, y + 0.26, z), 0.14, 0.03, B.PAL['iron'], segments=8, axis=(0, 1, 0), mat=B.METAL)
    hx, hz = x + math.sin(a) * 0.18, z + math.cos(a) * 0.18
    p.box((hx, y + 0.17, hz), (0.06, 0.22, 0.06), B.PAL['honey'][2], B.WOOD, yaw=a)
    p.cylinder((x, y + 0.3, z), (x, y + 0.36, z), 0.11, B.PAL['foam'], B.PLASTER, sides=8)


def plate(B, p, x, y, z, food=None):
    p.cylinder((x, y, z), (x, y + 0.04, z), 0.28, B.PAL['cream'], B.PLASTER, sides=10)
    if food == 'bread':
        p.rock_blob((x, y + 0.14, z), (0.36, 0.2, 0.22), (0.72, 0.5, 0.26), B.PLASTER, jitter=0.1)
    elif food == 'cheese':
        p.cylinder((x, y + 0.04, z), (x, y + 0.2, z), 0.2, (0.92, 0.76, 0.34), B.PLASTER, sides=8)


def bottle(B, p, x, y, z, col):
    p.cylinder((x, y, z), (x, y + 0.34, z), 0.1, col, B.METAL, sides=6)
    p.cylinder((x, y + 0.34, z), (x, y + 0.5, z), 0.045, col, B.METAL, sides=6)


def clutter(B, p):
    props = B.LAYOUT['props']
    by = {}
    for q in props:
        by.setdefault(q['kind'], []).append(q)
    # the long table: tankards, plates of bread and cheese, a rug under it
    t = next(q for q in by['table'] if q['hd'] > q['hw'])
    top = t['base'] + t['height']
    for i, dz in enumerate((-1.6, -0.6, 0.5, 1.5)):
        mug(B, p, t['x'] + (0.35 if i % 2 else -0.35), top, t['z'] + dz, a=1.57 if i % 2 else -1.57)
    plate(B, p, t['x'], top, t['z'] - 1.1, 'bread')
    plate(B, p, t['x'], top, t['z'] + 1.0, 'cheese')
    B.abox(p, t['x'] - 2.3, t['x'] + 2.3, 0.0, 0.03, t['z'] - 2.9, t['z'] + 2.9, B.PAL['garnet_dark'], B.PLASTER)
    B.abox(p, t['x'] - 2.1, t['x'] + 2.1, 0.03, 0.04, t['z'] - 2.7, t['z'] + 2.7, B.PAL['garnet'], B.PLASTER)
    # the square table: tankards and a plate
    t = next(q for q in by['table'] if q['hd'] <= q['hw'] * 1.5)
    top = t['base'] + t['height']
    for (dx, dz, a) in ((-0.5, 0.4, 3.1), (0.5, -0.3, 0.2), (0.45, 0.55, 1.2)):
        mug(B, p, t['x'] + dx, top, t['z'] + dz, a)
    plate(B, p, t['x'] - 0.3, top, t['z'] - 0.45, 'bread')
    # the dice table: dice, a cup, a stack of coins, cards
    d = by['roundTable'][0]
    top = d['base'] + d['height'] + 0.02
    for k, (dx, dz) in enumerate(((0.1, 0.2), (-0.25, 0.05), (0.3, -0.25))):
        p.box((d['x'] + dx, top + 0.08, d['z'] + dz), (0.16, 0.16, 0.16), B.PAL['bone'], B.PLASTER, yaw=k * 0.6)
    p.cylinder((d['x'] - 0.55, top, d['z'] - 0.3), (d['x'] - 0.55, top + 0.4, d['z'] - 0.3), 0.16,
               B.PAL['beam_dark'], B.WOOD, sides=8, r1=0.18)
    for k in range(5):
        p.cylinder((d['x'] + 0.55, top + k * 0.04, d['z'] + 0.3), (d['x'] + 0.55, top + k * 0.04 + 0.035,
                   d['z'] + 0.3), 0.09, B.PAL['gold'], B.METAL, sides=8)
    for k in range(3):
        p.box((d['x'] - 0.2 + k * 0.25, top + 0.01, d['z'] + 0.55), (0.2, 0.01, 0.3), B.PAL['cream'], B.PLASTER,
              yaw=k * 0.4 - 0.4)
    mug(B, p, d['x'] + 0.1, top - 0.02, d['z'] - 0.7, 0.0)
    # the bar: tankards along the long counter, bottles and a jug at its end
    c = next(q for q in by['counter'] if q['hw'] > q['hd'])
    top = c['base'] + c['height']
    for dx in (-3.0, -1.3, 1.1, 3.4):
        mug(B, p, c['x'] + dx, top, c['z'] + 0.25, 3.1)
    for k, dx in enumerate((-3.4, -3.2, -3.0)):
        bottle(B, p, c['x'] + dx, top, c['z'] - 0.25, (B.PAL['verdigris'], B.PAL['glass'], B.PAL['garnet_dark'])[k])
    # the bard's corner: a lute leaning on the stool, a music stand
    s = next(q for q in by['stool'] if q['z'] < -8)
    lx, ly, lz = s['x'] - 0.3, s['base'] + 0.9, s['z'] + 0.55
    p.rock_blob((lx, ly - 0.1, lz), (0.55, 0.7, 0.2), B.PAL['honey'][2], B.WOOD, jitter=0.04)
    p.cylinder((lx, ly - 0.1, lz + 0.11), (lx, ly - 0.1, lz + 0.12), 0.12, B.PAL['soot'], B.WOOD, sides=8)
    B.beam(p, (lx, ly + 0.2, lz), (lx + 0.1, ly + 1.2, lz - 0.05), 0.1, 0.06, B.PAL['beam_dark'])
    p.box((lx + 0.12, ly + 1.3, lz - 0.06), (0.14, 0.24, 0.08), B.PAL['beam_dark'], B.WOOD, roll=0.1)
    mx, mz = s['x'] + 1.2, s['z'] + 0.8
    B.post(p, mx, mz, 0.0, 1.9, 0.07, B.PAL['iron'], B.METAL)
    p.box((mx, 2.05, mz), (0.7, 0.5, 0.06), B.PAL['beam'], B.WOOD, pitch=-0.4)
    p.box((mx, 2.08, mz + 0.03), (0.55, 0.38, 0.02), B.PAL['parchment'], B.PLASTER, pitch=-0.4)
    for k in range(3):
        a = k * 2 * math.pi / 3
        B.beam(p, (mx, 0.4, mz), (mx + math.sin(a) * 0.35, 0.0, mz + math.cos(a) * 0.35), 0.05, 0.05, B.PAL['iron'],
               B.METAL)
    # firewood stacked by the wall fire and at the pit's edge
    fire = by['fireplace'][0]
    fx = fire['x'] - fire['hw'] - 0.55
    for row in range(3):
        for k in range(4 - row):
            zz = fire['z'] + fire['hd'] + 0.55
            y = 0.18 + row * 0.3
            xx = fx - 0.15 + (k + row * 0.5) * 0.3 - 0.45
            p.cylinder((xx, y, zz - 0.45), (xx, y, zz + 0.45), 0.14, B.PAL['beam'], B.WOOD, sides=6)
    pit = B.LAYOUT['pit']
    for k in range(3):
        a = math.radians(-140 + k * 12)
        x, z = pit['x'] + math.sin(a) * (pit['r'] - 0.35), pit['z'] + math.cos(a) * (pit['r'] - 0.35)
        p.cylinder((x - 0.4, -pit['depth'] + 0.15, z), (x + 0.4, -pit['depth'] + 0.15, z), 0.14, B.PAL['beam'],
                   B.WOOD, sides=6)
    # a cat asleep on the warm flags by the hearth
    a = math.radians(150)
    cx, cz = pit['x'] + math.sin(a) * 2.35, pit['z'] + math.cos(a) * 2.35
    cy = -pit['depth']
    p.rock_blob((cx, cy + 0.2, cz), (0.75, 0.38, 0.5), (0.86, 0.52, 0.24), B.PLASTER, jitter=0.05)
    p.rock_blob((cx + 0.34, cy + 0.28, cz + 0.12), (0.3, 0.28, 0.3), (0.86, 0.52, 0.24), B.PLASTER, jitter=0.05)
    p.sweep([(cx - 0.35, cy + 0.12, cz), (cx - 0.2, cy + 0.08, cz + 0.4), (cx + 0.15, cy + 0.08, cz + 0.45)], 0.07,
            0.05, (0.8, 0.46, 0.2), sides=5, mat=B.PLASTER)
    # rugs in the rooms and on the landing, a book on each chest
    G = B.G
    for q in by['bed']:
        B.abox(p, q['x'] - 1.6, q['x'] + 1.6, G, G + 0.03, q['z'] + 1.9, q['z'] + 3.9, B.PAL['garnet'], B.PLASTER)
    B.abox(p, 6.0, 10.0, G, G + 0.03, -18.8, -15.8, B.PAL['garnet_dark'], B.PLASTER)
    for q in by['chest']:
        top = q['base'] + q['height']
        p.box((q['x'] + 0.2, top + 0.06, q['z']), (0.4, 0.12, 0.3), B.PAL['garnet_dark'], B.WOOD, yaw=0.3)
    # a broom and a bucket by the door, sacks by the bar's end
    B.beam(p, (-4.4, 0.0, 12.6), (-4.1, 2.4, 12.95), 0.06, 0.06, B.PAL['beam'])
    p.box((-4.45, 0.3, 12.55), (0.4, 0.6, 0.25), (0.72, 0.6, 0.3), B.PLASTER, taper=0.6)
    p.cylinder((-3.6, 0.0, 12.7), (-3.6, 0.5, 12.7), 0.24, B.PAL['beam'], B.WOOD, sides=8, r1=0.28)
    for k, (x, z) in enumerate(((14.4, -3.4), (14.7, -2.7))):
        p.rock_blob((x, 0.45, z), (0.7, 0.9, 0.6), (0.72, 0.62, 0.44), B.PLASTER, jitter=0.08)
    # outside by the porch: barrels and a crate against the stone base, a bench by the door
    for (x, z, r) in ((5.3, 14.7, 0.55), (6.4, 14.6, 0.5), (5.8, 15.6, 0.5)):
        g = B.ground(x, z)
        p.sweep([(x, g, z), (x, g + 0.75, z), (x, g + 1.5, z)], r, r, B.PAL['honey'][1], sides=10,
                radii=[r * 0.86, r, r * 0.86])
        p.cylinder((x, g + 1.48, z), (x, g + 1.52, z), r * 0.84, B.PAL['beam'], B.WOOD, sides=10)
        for yy in (0.25, 1.25):
            p.ring((x, g + yy, z), r * 0.93, 0.07, B.PAL['iron'], segments=10, axis=(0, 1, 0), mat=B.METAL,
                   depth=0.04)
    g = B.ground(-5.8, 14.9)
    p.box((-5.8, g + 0.55, 14.9), (1.1, 1.1, 1.1), B.PAL['honey'][2], B.WOOD, yaw=0.3)
    p.box((-5.6, g + 1.45, 14.8), (0.7, 0.7, 0.7), B.PAL['honey'][0], B.WOOD, yaw=-0.2)
