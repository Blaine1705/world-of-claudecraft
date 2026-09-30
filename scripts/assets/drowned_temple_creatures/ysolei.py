"""Ysolei, Avatar of the Drowned Moon: a lunar serpent-dragon coiled round the
Moon Altar, the moon's own reflection given teeth.

A long pale serpent body in silver-lavender scales, coiled on the island and
rising in a great S to a horned dragon head crowned with a crescent; moon runes
glowing down her spine, a mane of fins, two slender clawed arms, and two
fin-wings of translucent membrane lit from within. When she rises the water
rises with her.

Clips: Idle (coiled, swaying, the fins breathing), Walk and Run (a heavy
slither), Attack (a striking bite), Attack2 (a raking claw), Hit, Death (she
unwinds and sinks into her coils), Cast and LunarTide (reared up, wings
spread, head back: the tide rings out), Undertow (low and wide, the arms
drawing the water in toward her, the coils clenched), Rear (the roar).
"""
import math

from sea_kit import GLOW, SeaBody, author_clip, expand_bones, loop, merge
from temple_palette import CYAN, MOUTH, NACRE, SILVER, TOOTH, VIOLET

SCALE = (0.8, 0.8, 0.92)
SCALE_D = (0.56, 0.56, 0.74)
BELLY = (0.93, 0.92, 0.96)
FIN = (0.62, 0.7, 0.95)
HORN = (0.95, 0.94, 0.88)
EYE = (0.75, 0.9, 1.0)

CHAIN = [(0, 0.8, 1.2), (0, 0.5, 2.9), (0, 0.0, 4.5), (0, -0.5, 5.9), (0, -0.9, 7.0), (0, -1.3, 7.9)]
RADII = [1.05, 1.0, 0.92, 0.82, 0.72, 0.62]

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.6)),
    ('Coil', 'Root', (0, 0.6, 0.5), (0, 0.6, 1.2)),
    ('B1', 'Coil', CHAIN[0], CHAIN[1]),
    ('B2', 'B1', CHAIN[1], CHAIN[2]),
    ('B3', 'B2', CHAIN[2], CHAIN[3]),
    ('B4', 'B3', CHAIN[3], CHAIN[4]),
    ('B5', 'B4', CHAIN[4], CHAIN[5]),
    ('Head', 'B5', (0, -1.3, 7.9), (0, -3.3, 8.1)),
    ('Jaw', 'Head', (0, -1.7, 7.6), (0, -3.3, 7.25)),
    ('Arm.L', 'B2', (0.85, -0.5, 3.8), (1.7, -1.2, 3.1)),
    ('Fore.L', 'Arm.L', (1.7, -1.2, 3.1), (1.9, -2.2, 3.3)),
    ('Wing.L', 'B3', (0.75, 0.2, 5.3), (3.0, 1.0, 6.6)),
])


def body():
    p = SeaBody('Ysolei', lichen=0.0, weather=0.1)
    # ---- the coils on the altar island ---------------------------------------------
    p.on('Coil')
    pts = []
    for i in range(44):
        t = i / 43
        a = t * math.tau * 1.8 + 1.2
        r = 3.2 - t * 1.2
        pts.append((math.sin(a) * r, 0.6 + math.cos(a) * r, 0.6 + t * 0.6))
    p.tube(pts, [0.5 + 0.55 * (i / 43) for i in range(44)], SCALE_D, sides=14)
    for i in range(0, 44, 3):
        x, y, z = pts[i]
        p.blob((x, y, z + 0.5 + 0.4 * (i / 43)), (0.12, 0.12, 0.08), CYAN, mat=GLOW)
    # ---- the rising body ----------------------------------------------------------------
    for k in range(5):
        p.on(f'B{k + 1}')
        a, b = CHAIN[k], CHAIN[k + 1]
        mid = [(a[j] + b[j]) / 2 for j in range(3)]
        p.tube([a, mid, b], [RADII[k], (RADII[k] + RADII[k + 1]) / 2, RADII[k + 1]], SCALE, sides=16)
        p.tube([(a[0], a[1] - RADII[k] * 0.55, a[2]), (b[0], b[1] - RADII[k + 1] * 0.55, b[2])],
               [RADII[k] * 0.6, RADII[k + 1] * 0.6], BELLY, sides=10)
        # Scale plates down the back and the moon runes between them.
        for j in range(3):
            t = (j + 0.5) / 3
            y = a[1] + (b[1] - a[1]) * t + RADII[k] * 0.85
            z = a[2] + (b[2] - a[2]) * t
            p.blob((0, y, z), (RADII[k] * 0.55, 0.18, 0.28), SCALE_D, pitch=-0.4)
            p.blob((0, y + 0.18, z + 0.05), (0.08, 0.05, 0.18), CYAN if (k + j) % 2 else SILVER, mat=GLOW)
        # A fin mane up the spine.
        p.tube([(0, a[1] + RADII[k] * 1.0, a[2]), (0, b[1] + RADII[k + 1] * 1.0 + 0.4, b[2] - 0.2)], [0.3, 0.2],
               FIN, sides=4, squash=0.15)
    # ---- the head --------------------------------------------------------------------
    p.on('Head')
    p.blob((0, -2.1, 8.1), (0.72, 1.35, 0.6), SCALE, bulge=0.1)
    p.blob((0, -3.2, 7.95), (0.42, 0.5, 0.36), SCALE_D)
    for s in (-1, 1):
        p.eye((s * 0.5, -2.45, 8.35), 0.17, look=(s * 0.7, -0.7, 0.1), color=EYE, glow=True)
        p.blob((s * 0.52, -2.35, 8.55), (0.22, 0.3, 0.08), SCALE_D, roll=s * 0.3)
        # Horns sweeping back.
        p.tube([(s * 0.45, -1.7, 8.55), (s * 0.8, -1.0, 9.1), (s * 0.9, -0.2, 9.4)], [0.16, 0.1, 0.02], HORN,
               sides=6)
        # Fin frills at the jaw.
        p.tube([(s * 0.6, -1.6, 7.9), (s * 1.1, -1.2, 7.9), (s * 1.4, -0.7, 8.1)], [0.25, 0.18, 0.02], FIN, sides=4,
               squash=0.15)
    # The crescent crest.
    crest = []
    for i in range(12):
        t = i / 11
        a = math.pi * (0.1 + 0.8 * t)
        crest.append((math.cos(a) * 1.1, -1.5 + math.sin(a) * 0.2, 8.9 + math.sin(a) * 1.4))
    p.tube(crest, [0.08 + 0.18 * math.sin(i / 11 * math.pi) for i in range(12)], SILVER, sides=6)
    p.blob((0, -1.55, 9.9), (0.2, 0.2, 0.2), SILVER, mat=GLOW)
    for k in range(9):
        t = k / 8
        for s in (-1, 1):
            p.cone((s * (0.35 - t * 0.15), -1.9 - t * 1.5, 7.72), (s * (0.33 - t * 0.15), -1.9 - t * 1.5, 7.45),
                   0.06, TOOTH, sides=4)
    p.on('Jaw')
    p.blob((0, -2.4, 7.45), (0.55, 1.15, 0.25), BELLY)
    p.blob((0, -2.3, 7.58), (0.42, 0.9, 0.08), MOUTH)
    for k in range(8):
        t = k / 7
        for s in (-1, 1):
            p.cone((s * (0.3 - t * 0.12), -2.0 - t * 1.3, 7.5), (s * (0.28 - t * 0.12), -2.0 - t * 1.3, 7.76),
                   0.05, TOOTH, sides=4)

    def limbs(s, t):
        p.on('Arm' + t)
        p.tube([(s * 0.85, -0.5, 3.8), (s * 1.3, -0.9, 3.4), (s * 1.7, -1.2, 3.1)], [0.26, 0.22, 0.2], SCALE,
               sides=8)
        p.on('Fore' + t)
        p.tube([(s * 1.7, -1.2, 3.1), (s * 1.85, -1.8, 3.2), (s * 1.9, -2.2, 3.3)], [0.2, 0.17, 0.15], SCALE,
               sides=8)
        for k in range(3):
            p.cone((s * (1.8 + k * 0.1), -2.25, 3.3), (s * (1.85 + k * 0.12), -2.6, 3.1), 0.06, HORN, sides=4)
        p.on('Wing' + t)
        # A fin-wing: three long rays and a luminous membrane between them.
        rays = [((s * 0.75, 0.2, 5.3), (s * 3.2, 0.9, 7.6)), ((s * 0.75, 0.3, 5.1), (s * 3.9, 1.6, 5.9)),
                ((s * 0.75, 0.4, 4.9), (s * 3.2, 1.9, 4.2))]
        for (a0, a1) in rays:
            p.tube([a0, a1], [0.1, 0.03], HORN, sides=5)
        for i in range(len(rays) - 1):
            (a0, a1), (b0, b1) = rays[i], rays[i + 1]
            for u in range(4):
                f = (u + 0.5) / 4
                pa = [a0[j] + (a1[j] - a0[j]) * f for j in range(3)]
                pb = [b0[j] + (b1[j] - b0[j]) * f for j in range(3)]
                p.tube([pa, pb], [0.12 + 0.2 * f, 0.12 + 0.2 * f], FIN, sides=4, squash=0.12)
        p.blob((s * 2.4, 1.2, 5.7), (0.1, 0.1, 0.1), VIOLET, mat=GLOW)

    limbs(1, '.L')
    limbs(-1, '.R')
    p.blob((0, 0.9, 1.4), (1.3, 1.3, 0.3), NACRE)
    return p


def clips(arm):
    stand = {'B1': [('x', -3)], 'Head': [('x', 5)], 'Arm.L': [('x', -10)], 'Wing.L': [('y', -8)]}

    def sway(ph, amp=1.0):
        return merge(stand, {
            'B1': [('y', 3 * math.sin(ph) * amp)], 'B2': [('y', -4 * math.sin(ph + 0.8) * amp)],
            'B3': [('y', 5 * math.sin(ph + 1.6) * amp)], 'B4': [('y', -4 * math.sin(ph + 2.4) * amp)],
            'B5': [('y', 3 * math.sin(ph + 3.2) * amp), ('x', 2 * math.cos(ph))],
            'Head': [('y', -5 * math.sin(ph + 3.8) * amp)], 'Jaw': [('x', 5 + 4 * math.sin(ph * 2))],
            'Wing.L': [('z', 6 * math.sin(ph))], 'Arm.L': [('x', 6 * math.sin(ph))]})

    author_clip(arm, 'Idle', loop(96, [sway(i / 6 * math.tau) for i in range(6)]))

    def slither(ph, amp=1.0):
        return merge(sway(ph * 2, 1.4 * amp), {'Coil': [('z', 6 * math.sin(ph) * amp)],
                                               'Root': [('loc', (0, 0, 0.06 * abs(math.sin(ph))))]})

    author_clip(arm, 'Walk', loop(40, [slither(i / 4 * math.tau) for i in range(4)]))
    author_clip(arm, 'Run', loop(26, [slither(i / 4 * math.tau, 1.3) for i in range(4)]))
    rear = merge(stand, {'B3': [('x', -12)], 'B4': [('x', -14)], 'B5': [('x', -12)], 'Head': [('x', -16)],
                         'Jaw': [('x', 25)]})
    strike = merge(stand, {'B2': [('x', 12)], 'B3': [('x', 16)], 'B4': [('x', 18)], 'B5': [('x', 14)],
                           'Head': [('x', 10)], 'Jaw': [('x', 36)]})
    author_clip(arm, 'Attack', [(1, stand), (10, rear), (15, strike), (19, merge(strike, {'Jaw': [('x', -30)]})),
                                (32, stand)], loop=False)
    reach = merge(stand, {'Arm.L!': [('x', -80), ('z', 30)], 'B3': [('y', 10)]})
    rake = merge(stand, {'Arm.L!': [('x', -40), ('z', -40)], 'B3': [('y', -12)]})
    author_clip(arm, 'Attack2', [(1, stand), (8, reach), (12, rake), (24, stand)], loop=False)
    hit = merge(stand, {'B3': [('x', -10)], 'B4': [('x', -8)], 'Head': [('x', -20), ('y', 10)], 'Jaw': [('x', 30)]})
    author_clip(arm, 'Hit', [(1, stand), (5, hit), (16, stand)], loop=False)
    sink = merge(stand, {'B1': [('x', 45)], 'B2': [('x', 25)], 'B3': [('x', 20), ('y', 20)], 'B4': [('y', -20)],
                         'Head': [('x', 10), ('y', 25)], 'Jaw': [('x', 35)], 'Wing.L': [('y', 40)],
                         'Root': [('loc', (0, 0, -0.6))]})
    down = merge(sink, {'B1': [('x', 75)], 'Root': [('loc', (0, 0, -1.4))]})
    author_clip(arm, 'Death', [(1, stand), (8, hit), (26, sink), (46, down), (60, down)], loop=False)
    # Lunar Tide: reared high, wings flung wide, head thrown back.
    high = merge(stand, {'B1': [('x', -8)], 'B2': [('x', -6)], 'B3': [('x', -8)], 'B4': [('x', -10)],
                         'Head': [('x', -32)], 'Jaw': [('x', 40)], 'Wing.L': [('y', -35), ('z', 25)],
                         'Arm.L': [('x', -60), ('y', -30)], 'Root': [('loc', (0, 0, 0.5))]})
    high_b = merge(high, {'Wing.L': [('z', -10)], 'Head': [('x', 6)]})
    author_clip(arm, 'Cast', loop(18, [high, high_b]))
    author_clip(arm, 'LunarTide', [(1, stand), (14, high), (26, high_b), (36, high), (48, stand)], loop=False)
    # Undertow: low and wide, the arms sweeping the water in, coils clenched.
    low = merge(stand, {'B1': [('x', 10)], 'B2': [('x', 8)], 'B3': [('x', 10)], 'Head': [('x', 12)],
                        'Jaw': [('x', 30)], 'Arm.L': [('x', -80), ('z', 50)], 'Fore.L': [('z', 30)],
                        'Wing.L': [('y', 30)], 'Coil': [('scale', 0.95)], 'Root': [('loc', (0, 0, -0.3))]})
    draw_in = merge(low, {'Arm.L': [('z', -60)], 'Fore.L': [('z', -40)]})
    author_clip(arm, 'Undertow', loop(24, [low, draw_in]))
    roar = merge(stand, {'B4': [('x', -12)], 'B5': [('x', -10)], 'Head': [('x', -24)], 'Jaw': [('x', 50)],
                         'Wing.L': [('y', -30)]})
    author_clip(arm, 'Rear', [(1, stand), (10, roar), (14, merge(roar, {'Head': [('y', 6)]})),
                              (18, merge(roar, {'Head': [('y', -6)]})), (30, stand)], loop=False)
    return ['Idle', 'Walk', 'Run', 'Attack', 'Attack2', 'Hit', 'Death', 'Cast', 'LunarTide', 'Undertow', 'Rear']


CREATURE = (BONES, body, clips, 4.5, 20.0)
