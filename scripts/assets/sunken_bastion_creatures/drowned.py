"""The Bastion's drowned garrison: sailors and marines the storm tide took.

One chunky KayKit-proportioned humanoid rig (a big head, stubby strong limbs)
worn five ways. Bloated sea-green skin, sunken sockets with a pinpoint of sea
light, a slack jaw, weed for hair, barnacles on the shoulders, a faded navy
coat over a striped shirt, and each variant's own rusted gear and gestures:

  revenant   Bastion Revenant: a drowned marine, morion helm, cutlass and buckler.
  watchman   Drowned Watchman: kettle hat, long coat, a rusted halberd; its
             HalberdSweep cast draws the pole back and sweeps it across the front.
  arbalest   Fogbound Arbalest: a rotted hood, a crossbow and a quiver; its Aim
             cast shoulders the crossbow and holds the lane, Shoot looses a bolt.
  sergeant   Drowned Sergeant: a barrel-chested bosun in a bicorne, cutlass high;
             its Rally cast is the roar that quickens the pack.
  prisoner   Shackled Prisoner: a starved drowned convict in rags, iron cuffs, a
             dragging ball and chain; it flails with its chained fists.

Clips on all: Idle, Walk (a lurching drowned shamble), Run, Attack, Attack2,
Hit, Death (to its knees, then face down), Cast, plus the variant's own cast.
"""
import math

from sea_kit import (
    BARNACLE, GLOW, IRON, KELP, KELP_D, MOUTH, RUST, RUST_D, TOOTH, SeaBody, author_clip, expand_bones, loop,
    merge, over,
)

SKIN = (0.62, 0.74, 0.66)
SKIN_D = (0.44, 0.56, 0.5)
SOCKET = (0.07, 0.1, 0.1)
SEA_LIGHT = (0.45, 1.0, 0.85)
COAT = (0.2, 0.27, 0.4)
COAT_HI = (0.33, 0.41, 0.55)
SHIRT = (0.86, 0.85, 0.78)
STRIPE = (0.24, 0.33, 0.5)
TROUSER = (0.36, 0.31, 0.25)
LEATHER = (0.3, 0.2, 0.14)
BRASS = (0.72, 0.6, 0.32)
WOOD = (0.42, 0.3, 0.2)
RAG = (0.6, 0.56, 0.46)

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Hips', 'Root', (0, 0, 1.05), (0, 0, 1.35)),
    ('Spine', 'Hips', (0, 0, 1.35), (0, 0, 1.75)),
    ('Chest', 'Spine', (0, 0, 1.75), (0, 0, 2.15)),
    ('Head', 'Chest', (0, 0, 2.15), (0, 0, 2.95)),
    ('Jaw', 'Head', (0, -0.18, 2.34), (0, -0.46, 2.26)),
    ('Arm.L', 'Chest', (0.52, 0, 2.02), (0.64, 0, 1.56)),
    ('Fore.L', 'Arm.L', (0.64, 0, 1.56), (0.68, -0.04, 1.12)),
    ('Hand.L', 'Fore.L', (0.68, -0.04, 1.12), (0.68, -0.08, 0.86)),
    ('Thigh.L', 'Hips', (0.22, 0, 1.02), (0.24, 0, 0.58)),
    ('Shin.L', 'Thigh.L', (0.24, 0, 0.58), (0.24, 0.03, 0.16)),
    ('Foot.L', 'Shin.L', (0.24, 0.03, 0.16), (0.24, -0.3, 0.05)),
])


def sides(fn):
    for s, tag in ((1, '.L'), (-1, '.R')):
        fn(s, tag)


def base_body(name, v):
    """The drowned body every variant shares. `v` is the variant name."""
    starved = v == 'prisoner'
    burly = v == 'sergeant'
    girth = 0.78 if starved else 1.18 if burly else 1.0
    p = SeaBody(name, lichen=0.0, weather=0.25)
    coat = RAG if starved else COAT
    # ---- legs and feet ----------------------------------------------------------
    def leg(s, t):
        p.on('Thigh' + t)
        p.tube([(s * 0.22, 0, 1.08), (s * 0.24, 0, 0.58)], [0.21 * girth, 0.17 * girth], TROUSER, sides=10)
        p.on('Shin' + t)
        p.tube([(s * 0.24, 0, 0.6), (s * 0.24, 0.02, 0.3)], [0.17 * girth, 0.15 * girth], TROUSER, sides=10)
        if starved:
            p.tube([(s * 0.24, 0.02, 0.32), (s * 0.24, 0.03, 0.14)], [0.1, 0.1], SKIN_D, sides=8)
            # The iron cuff round the left ankle.
            if s > 0:
                p.tube([(s * 0.24, 0.02, 0.26), (s * 0.24, 0.02, 0.18)], [0.15, 0.15], IRON, sides=10)
        else:
            p.tube([(s * 0.24, 0.02, 0.4), (s * 0.24, 0.03, 0.14)], [0.17, 0.16], LEATHER, sides=10)
        p.on('Foot' + t)
        if starved:
            p.blob((s * 0.24, -0.1, 0.08), (0.14, 0.24, 0.09), SKIN_D, flat_bottom=True)
            if s > 0:
                # The ball and chain dragged behind the left foot.
                for k in range(4):
                    link = [(s * 0.24 + 0.08 * math.cos(a) * (k % 2), 0.2 + k * 0.16, 0.12 + 0.08 * math.sin(a))
                            for a in [i / 8 * math.tau for i in range(9)]]
                    link = [(s * 0.24, 0.2 + k * 0.16 + 0.08 * math.cos(a), 0.14 + 0.07 * math.sin(a))
                            if k % 2 == 0 else (s * 0.24 + 0.08 * math.cos(a), 0.2 + k * 0.16, 0.14 + 0.07 * math.sin(a))
                            for a in [i / 8 * math.tau for i in range(9)]]
                    p.tube(link, [0.03] * len(link), IRON, sides=4, cap=False)
                p.blob((s * 0.28, 0.95, 0.24), (0.24, 0.24, 0.24), IRON)
        else:
            p.blob((s * 0.24, -0.1, 0.1), (0.17, 0.3, 0.12), LEATHER, flat_bottom=True)

    sides(leg)
    # ---- hips, belly, chest -------------------------------------------------------
    p.on('Hips')
    p.blob((0, 0, 1.12), (0.42 * girth, 0.3 * girth, 0.24), TROUSER)
    p.tube([(math.cos(a) * 0.44 * girth, math.sin(a) * 0.33 * girth, 1.27) for a in [i / 20 * math.tau for i in range(21)]],
           [0.06] * 21, LEATHER, sides=6, cap=False)
    p.blob((0, -0.33 * girth, 1.27), (0.1, 0.05, 0.08), BRASS)
    if not starved:
        # Coat tails, torn into weed-like tatters behind.
        for k in range(6):
            x = -0.38 + k * 0.15
            p.tube([(x * girth, 0.28 * girth, 1.28), (x * girth * 1.1, 0.36 * girth, 0.9),
                    (x * girth * 1.15, 0.4 * girth, 0.62 - (k % 3) * 0.08)], [0.08, 0.07, 0.03], coat, sides=4,
                   squash=0.35)
    p.on('Spine')
    p.blob((0, -0.02, 1.52), (0.44 * girth, 0.36 * girth, 0.32), SHIRT if not starved else RAG)
    if not starved:
        for k in range(3):
            z = 1.38 + k * 0.12
            r = math.sqrt(max(0.0, 1 - ((z - 1.52) / 0.32) ** 2))
            p.tube([(math.cos(a) * 0.45 * girth * r, -0.02 + math.sin(a) * 0.37 * girth * r, z)
                    for a in [i / 20 * math.tau for i in range(21)]], [0.03] * 21, STRIPE, sides=4, cap=False)
    else:
        # Ribs pressing through the rags.
        for k in range(3):
            p.tube([(-0.25, -0.3, 1.45 + k * 0.1), (0, -0.36, 1.43 + k * 0.1), (0.25, -0.3, 1.45 + k * 0.1)],
                   [0.03, 0.035, 0.03], SKIN_D, sides=4)
    p.on('Chest')
    p.blob((0, 0, 1.92), (0.52 * girth, 0.38 * girth, 0.34), coat)
    if not starved:
        # The open coat front: lapels, the shirt showing, brass buttons.
        p.blob((0, -0.3 * girth, 1.88), (0.2, 0.1, 0.26), SHIRT)
        for k in range(3):
            p.blob((0, -0.36 * girth, 1.76 + k * 0.1), (0.02, 0.02, 0.02), STRIPE)
        for sx in (-1, 1):
            p.blob((sx * 0.2, -0.32 * girth, 1.9), (0.11, 0.06, 0.26), COAT_HI, roll=sx * 0.25)
            for k in range(3):
                p.blob((sx * 0.3, -0.33 * girth, 1.72 + k * 0.12), (0.035, 0.03, 0.035), BRASS)
    # Weed draped over the shoulders, barnacles crusting the left shoulder.
    for sx in (-1, 1):
        p.kelp((sx * 0.4, 0.05, 2.12), 0.5, (sx * 0.1, 0.15), 0.07, KELP)
    for k in range(7):
        a = k / 7 * math.pi
        p.barnacle((0.46 * girth + 0.08 * math.cos(a), -0.1 + 0.2 * math.sin(a), 2.08), (0.5, 0, 1), 0.07,
                   p.vary(BARNACLE, 0.08))
    # ---- arms and hands -------------------------------------------------------------
    def arm(s, t):
        p.on('Arm' + t)
        p.blob((s * 0.5, 0, 2.02), (0.2 * girth, 0.2 * girth, 0.18), coat)
        p.tube([(s * 0.52, 0, 2.02), (s * 0.64, 0, 1.56)], [0.16 * girth, 0.14 * girth], coat, sides=10)
        p.on('Fore' + t)
        if starved:
            p.tube([(s * 0.64, 0, 1.56), (s * 0.68, -0.04, 1.14)], [0.1, 0.09], SKIN_D, sides=8)
            p.tube([(s * 0.68, -0.04, 1.26), (s * 0.68, -0.04, 1.14)], [0.14, 0.14], IRON, sides=10)
        else:
            p.tube([(s * 0.64, 0, 1.56), (s * 0.68, -0.04, 1.2)], [0.14 * girth, 0.13 * girth], coat, sides=10)
            p.tube([(s * 0.68, -0.04, 1.24), (s * 0.68, -0.04, 1.16)], [0.15 * girth, 0.15 * girth], COAT_HI, sides=10)
            p.tube([(s * 0.68, -0.04, 1.18), (s * 0.68, -0.05, 1.08)], [0.1, 0.1], SKIN, sides=8)
        p.on('Hand' + t)
        p.blob((s * 0.68, -0.07, 0.98), (0.13, 0.12, 0.14), SKIN)
        for k in range(3):
            p.tube([(s * (0.62 + k * 0.05), -0.14, 0.94), (s * (0.62 + k * 0.05), -0.18, 0.84)], [0.04, 0.03],
                   SKIN_D, sides=5)

    sides(arm)
    # ---- the head: bloated, slack-jawed, sea light in the sockets ------------------
    p.on('Head')
    p.blob((0, -0.02, 2.52), (0.44, 0.41, 0.42), SKIN, bulge=0.05)
    p.blob((0, -0.05, 2.34), (0.36, 0.36, 0.2), SKIN_D)
    for sx in (-1, 1):
        p.blob((sx * 0.16, -0.34, 2.58), (0.12, 0.08, 0.1), SOCKET)
        p.blob((sx * 0.16, -0.4, 2.58), (0.045, 0.03, 0.045), SEA_LIGHT, mat=GLOW)
        # A heavy swollen brow over each socket.
        p.blob((sx * 0.17, -0.36, 2.7), (0.14, 0.08, 0.06), SKIN_D, roll=sx * 0.2)
        p.blob((sx * 0.43, -0.02, 2.5), (0.06, 0.09, 0.1), SKIN_D)
    p.blob((0, -0.42, 2.47), (0.07, 0.09, 0.08), SKIN_D)
    p.blob((0, -0.3, 2.34), (0.2, 0.1, 0.07), MOUTH)
    for k in range(5):
        x = -0.12 + k * 0.06
        p.cone((x, -0.36, 2.39), (x, -0.37, 2.33), 0.025, TOOTH, sides=4)
    # Barnacles on the right cheek and the crown.
    for k in range(5):
        a = k / 5 * math.tau
        p.barnacle((-0.33 + 0.05 * math.cos(a), -0.2 + 0.05 * math.sin(a), 2.44 + 0.06 * math.sin(a)),
                   (-1, -0.6, 0.2), 0.05, p.vary(BARNACLE, 0.08))
    # Weed for hair: strands down the back and sides of the head.
    if v != 'arbalest':
        for k in range(9):
            a = math.pi * 0.1 + k / 8 * math.pi * 0.8
            p.kelp((math.cos(a) * 0.38, 0.1 + math.sin(a) * 0.3, 2.8), 0.55 + 0.1 * (k % 3),
                   (math.cos(a) * 0.12, 0.15), 0.07, KELP if k % 2 else KELP_D)
    p.on('Jaw')
    p.blob((0, -0.24, 2.24), (0.27, 0.22, 0.1), SKIN)
    for k in range(4):
        x = -0.09 + k * 0.06
        p.cone((x, -0.4, 2.27), (x, -0.41, 2.33), 0.022, TOOTH, sides=4)
    return p


# ---- the variants' gear -----------------------------------------------------------------

def morion(p):
    p.on('Head')
    p.blob((0, -0.02, 2.82), (0.42, 0.42, 0.24), RUST, bulge=0.2)
    p.tube([(0, 0.4, 2.72), (0, 0, 3.12), (0, -0.4, 2.72)], [0.04, 0.07, 0.04], RUST_D, sides=6)
    p.tube([(math.cos(a) * 0.56, math.sin(a) * 0.5, 2.72 + 0.1 * abs(math.cos(a))) for a in
            [i / 24 * math.tau for i in range(25)]], [0.05] * 25, RUST_D, sides=5, cap=False, squash=0.5)


def kettle_hat(p):
    p.on('Head')
    p.blob((0, -0.02, 2.84), (0.4, 0.4, 0.22), RUST, bulge=0.1)
    p.blob((0, -0.02, 2.76), (0.62, 0.62, 0.05), RUST_D)


def hood(p):
    p.on('Head')
    cloth = (0.4, 0.46, 0.4)
    p.blob((0, 0.06, 2.6), (0.5, 0.46, 0.5), cloth)
    p.cone((0, 0.25, 2.95), (0, 0.6, 3.2), 0.2, cloth, sides=8, smooth=True)
    p.blob((0, -0.26, 2.6), (0.36, 0.14, 0.36), SOCKET)
    for sx in (-1, 1):
        p.blob((sx * 0.14, -0.42, 2.56), (0.045, 0.03, 0.045), SEA_LIGHT, mat=GLOW)
    for k in range(5):
        x = -0.36 + k * 0.18
        p.kelp((x, -0.25, 2.3), 0.3, (0, -0.05), 0.06, cloth)


def bicorne(p):
    p.on('Head')
    p.blob((0, 0.0, 2.9), (0.62, 0.26, 0.2), (0.14, 0.14, 0.18), bulge=0.4)
    p.tube([(-0.62, 0.0, 2.92), (0, -0.05, 3.1), (0.62, 0.0, 2.92)], [0.03, 0.035, 0.03], BRASS, sides=5)
    p.blob((0.15, -0.2, 2.95), (0.07, 0.03, 0.07), BRASS)


def cutlass(p, bone='Hand.R'):
    p.on(bone)
    # Grip in the fist, basket guard, the curved rusted blade forward.
    p.tube([(-0.68, -0.07, 1.06), (-0.68, -0.08, 0.9)], [0.04, 0.04], LEATHER, sides=6)
    p.blob((-0.68, -0.15, 0.95), (0.1, 0.06, 0.12), BRASS)
    p.tube(p.bezier((-0.68, -0.2, 0.96), (-0.68, -0.8, 1.02), (-0.68, -1.25, 1.2), 6), [0.07, 0.03],
           RUST, sides=4, squash=0.25)


def buckler(p):
    p.on('Fore.L')
    p.blob((0.8, -0.08, 1.3), (0.06, 0.34, 0.34), WOOD, roll=0.0)
    p.tube([(0.84, -0.08 + 0.34 * math.cos(a), 1.3 + 0.34 * math.sin(a)) for a in [i / 20 * math.tau for i in range(21)]],
           [0.04] * 21, RUST_D, sides=5, cap=False)
    p.blob((0.87, -0.08, 1.3), (0.06, 0.1, 0.1), RUST)


def halberd(p):
    # Modelled level along the fist's forward axis: the guard stance raises the
    # forearm and stands the pole upright, the sweep lowers it level again.
    p.on('Hand.R')
    p.tube([(-0.68, 0.65, 0.98), (-0.68, -2.45, 0.98)], [0.05, 0.045], WOOD, sides=6)
    # The axe blade (on the striking side), the back spike and the spear point.
    p.blob((-0.68, -2.2, 0.72), (0.04, 0.26, 0.3), RUST)
    p.cone((-0.68, -2.2, 1.02), (-0.68, -2.15, 1.3), 0.06, RUST_D, sides=4)
    p.cone((-0.68, -2.43, 0.98), (-0.68, -2.9, 0.98), 0.07, RUST_D, sides=4)
    p.tube([(-0.68, -1.98, 0.98), (-0.68, -2.04, 0.98)], [0.08, 0.08], IRON, sides=6)
    p.kelp((-0.68, -1.95, 0.95), 0.4, (0.05, 0.05), 0.05, KELP)


def crossbow(p):
    p.on('Hand.R')
    # Stock along the forward axis from the fist, a bow across the front.
    p.tube([(-0.68, 0.1, 1.0), (-0.68, -0.85, 1.02)], [0.07, 0.06], WOOD, sides=6)
    p.tube(p.bezier((-1.2, -0.72, 1.02), (-0.68, -0.95, 1.05), (-0.16, -0.72, 1.02), 8), [0.04, 0.04], RUST_D,
           sides=5)
    p.tube([(-1.2, -0.72, 1.03), (-0.68, -0.4, 1.06), (-0.16, -0.72, 1.03)], [0.012, 0.012, 0.012], RAG, sides=4)
    p.tube([(-0.68, -0.45, 1.08), (-0.68, -1.0, 1.08)], [0.02, 0.015], IRON, sides=4)
    p.on('Chest')
    # The quiver across the back, bolts poking out.
    p.tube([(0.2, 0.36, 1.6), (-0.15, 0.4, 2.2)], [0.13, 0.12], LEATHER, sides=8)
    for k in range(4):
        p.tube([(-0.12 + k * 0.03, 0.4, 2.15), (-0.2 + k * 0.03, 0.42, 2.45)], [0.015, 0.015], WOOD, sides=4)


def bosun(p):
    # A barnacled brass pauldron and the bosun's pipe on its chain.
    p.on('Arm.L')
    p.blob((0.58, 0, 2.08), (0.3, 0.3, 0.2), BRASS, bulge=0.3)
    for k in range(5):
        a = k / 5 * math.tau
        p.barnacle((0.58 + 0.15 * math.cos(a), 0.15 * math.sin(a), 2.26), (0, 0, 1), 0.06)
    p.on('Chest')
    p.tube([(0.25, -0.38, 2.1), (0.05, -0.44, 1.8), (-0.2, -0.4, 2.05)], [0.012] * 3, BRASS, sides=4)
    p.tube([(0.02, -0.46, 1.8), (0.1, -0.5, 1.7)], [0.03, 0.02], BRASS, sides=5)


def shackles(p):
    # A length of chain swinging off the right cuff.
    p.on('Fore.R')
    for k in range(4):
        z = 1.08 - k * 0.14
        link = [(-0.68 + (0.06 * math.cos(a) if k % 2 else 0), -0.04 + (0 if k % 2 else 0.06 * math.cos(a)),
                 z + 0.08 * math.sin(a)) for a in [i / 8 * math.tau for i in range(9)]]
        p.tube(link, [0.025] * len(link), IRON, sides=4, cap=False)


GEAR = {
    'revenant': lambda p: (morion(p), cutlass(p), buckler(p)),
    'watchman': lambda p: (kettle_hat(p), halberd(p)),
    'arbalest': lambda p: (hood(p), crossbow(p)),
    'sergeant': lambda p: (bicorne(p), cutlass(p), bosun(p)),
    'prisoner': lambda p: shackles(p),
}


def body_for(v):
    def build():
        p = base_body('Drowned' + v.capitalize(), v)
        GEAR[v](p)
        return p
    return build


# ---- clips ---------------------------------------------------------------------------------

def stance_for(v):
    if v == 'watchman':
        # The pole stood upright in the right fist, the left hand on it.
        return {'Arm.R': [('x', -25), ('y', 8)], 'Fore.R': [('x', -45)], 'Arm.L': [('x', -35), ('y', 20)],
                'Fore.L': [('x', -45)], 'Head': [('x', 6)]}
    if v == 'arbalest':
        # The crossbow carried level at the hip, the left hand under the stock.
        return {'Arm.R': [('x', -22)], 'Fore.R': [('x', 22)], 'Arm.L': [('x', -30), ('y', 20)],
                'Fore.L': [('x', -35)], 'Head': [('x', 6)]}
    if v == 'prisoner':
        return {'Spine': [('x', 10)], 'Chest': [('x', 8)], 'Head': [('x', 12), ('y', 8)], 'Arm.R': [('x', -8)],
                'Arm.L': [('x', -6)], 'Jaw': [('x', 10)]}
    if v == 'sergeant':
        return {'Arm.R': [('x', -24), ('y', -8)], 'Fore.R': [('x', -30)], 'Chest': [('x', -4)],
                'Arm.L': [('y', -12)], 'Head': [('x', -4)]}
    return {'Arm.R': [('x', -20)], 'Fore.R': [('x', -30)], 'Arm.L': [('x', -18), ('y', -8)],
            'Fore.L': [('x', -40)], 'Head': [('x', 4)]}


def clips(arm, v):
    stand = stance_for(v)
    sway = merge(stand, {'Spine': [('y', 3)], 'Chest': [('z', 4)], 'Head': [('y', -8), ('z', 6)],
                         'Jaw': [('x', 14)], 'Hips': [('loc', (0, 0, -0.03))]})
    sway_b = merge(stand, {'Spine': [('y', -3)], 'Chest': [('z', -3)], 'Head': [('y', 6), ('x', 6)],
                           'Jaw': [('x', 6)]})
    author_clip(arm, 'Idle', loop(72, [stand, sway, stand, sway_b]))

    def shamble(ph, amp=1.0, run=False):
        a = math.sin(ph)
        # The drowned drag the left leg a little: a lurch in every other step.
        lurch = max(0.0, math.sin(ph)) * (6 if not run else 3)
        pose = {
            'Hips': [('loc', (0, 0, -0.06 * abs(math.cos(ph)) * amp)), ('y', 4 * a + lurch * 0.5), ('z', -6 * a)],
            'Spine': [('x', 6 + (8 if run else 0)), ('z', 4 * a)], 'Chest': [('z', 5 * a)],
            'Head': [('y', -6 * a), ('x', 6)], 'Jaw': [('x', 10 + 6 * abs(a))],
            'Thigh.L': [('x', -28 * a * amp)], 'Thigh.R': [('x', 28 * a * amp)],
            'Shin.L': [('x', 34 * max(0.0, a) * amp)], 'Shin.R': [('x', 34 * max(0.0, -a) * amp)],
            'Foot.L': [('x', -10 * a)], 'Foot.R': [('x', 10 * a)],
        }
        swing = {'Arm.L': [('x', 20 * a * amp)], 'Arm.R': [('x', -20 * a * amp)]}
        if v in ('watchman', 'arbalest'):
            swing = {}
        return merge(stand, pose, swing)

    author_clip(arm, 'Walk', loop(28, [shamble(i / 4 * math.tau) for i in range(4)]))
    author_clip(arm, 'Run', loop(18, [shamble(i / 4 * math.tau, 1.4, True) for i in range(4)]))
    hit = merge(stand, {'Spine': [('x', -12)], 'Chest': [('x', -8)], 'Head': [('x', -20), ('y', 12)],
                        'Jaw': [('x', 25)], 'Arm.L': [('y', -25)], 'Arm.R': [('y', -20)]})
    author_clip(arm, 'Hit', [(1, stand), (4, hit), (14, stand)], loop=False)
    knees = merge(stand, {'Root': [('loc', (0, 0, -0.45))], 'Thigh.L': [('x', -80)], 'Thigh.R': [('x', -80)],
                          'Shin.L': [('x', 95)], 'Shin.R': [('x', 95)], 'Spine': [('x', 10)],
                          'Head': [('x', 25)], 'Jaw': [('x', 30)], 'Arm.L': [('x', 10)], 'Arm.R': [('x', 10)]})
    flat = merge(stand, {'Root': [('x', -88), ('loc', (0, -0.3, -0.85))], 'Thigh.L': [('x', -10)],
                         'Thigh.R': [('x', 6)], 'Arm.L': [('x', -150), ('y', -10)], 'Arm.R': [('x', -120), ('y', -30)],
                         'Head': [('y', 25)], 'Jaw': [('x', 30)]})
    author_clip(arm, 'Death', [(1, stand), (10, knees), (18, knees), (30, flat), (40, flat)], loop=False)
    names = ['Idle', 'Walk', 'Run', 'Hit', 'Death']

    # ---- the variant's strikes and its own cast ---------------------------------------
    if v in ('revenant', 'sergeant'):
        cock = over(stand, {'Arm.R': [('x', -95), ('y', -60)], 'Fore.R': [('x', -40)], 'Chest': [('z', 25)],
                             'Spine': [('z', 10)], 'Arm.L': [('x', -30), ('y', 10)]})
        slash = over(stand, {'Arm.R': [('x', -70), ('y', 30)], 'Fore.R': [('x', -10)], 'Chest': [('z', -30)],
                              'Spine': [('z', -12), ('x', 8)], 'Hips': [('z', -6)]})
        author_clip(arm, 'Attack', [(1, stand), (9, cock), (13, slash), (26, stand)], loop=False)
        if v == 'revenant':
            back = over(stand, {'Arm.R': [('x', -30), ('y', -15)], 'Fore.R': [('x', -80)], 'Chest': [('z', 15)]})
            thrust = over(stand, {'Arm.R': [('x', -85)], 'Fore.R': [('x', -5)], 'Chest': [('z', -15), ('x', 10)],
                                   'Thigh.R': [('x', -30)], 'Shin.R': [('x', 25)], 'Hips': [('loc', (0, -0.2, -0.08))]})
            author_clip(arm, 'Attack2', [(1, stand), (8, back), (12, thrust), (24, stand)], loop=False)
            names += ['Attack', 'Attack2']
            author_clip(arm, 'Cast', loop(24, [cock, merge(cock, {'Head': [('x', -15)], 'Jaw': [('x', 30)]})]))
            names.append('Cast')
        else:
            overhead = over(stand, {'Arm.R': [('x', -170), ('y', -10)], 'Fore.R': [('x', -20)], 'Spine': [('x', -12)],
                                 'Head': [('x', -10)]})
            chop = over(stand, {'Arm.R': [('x', -60)], 'Fore.R': [('x', -5)], 'Spine': [('x', 18)],
                                 'Chest': [('x', 10)], 'Hips': [('loc', (0, 0, -0.1))]})
            author_clip(arm, 'Attack2', [(1, stand), (10, overhead), (14, chop), (28, stand)], loop=False)
            # Rally the Watch: cutlass thrust high, chest out, the roar.
            roar = over(stand, {'Arm.R': [('x', -175), ('y', -20)], 'Fore.R': [('x', -5)], 'Arm.L': [('y', -55)],
                                 'Fore.L': [('x', -60)], 'Chest': [('x', -14)], 'Spine': [('x', -8)],
                                 'Head': [('x', -28)], 'Jaw': [('x', 45)]})
            author_clip(arm, 'Rally', [(1, stand), (8, roar), (12, merge(roar, {'Head': [('x', -6)]})),
                                       (20, roar), (28, stand)], loop=False)
            author_clip(arm, 'Cast', loop(24, [roar, merge(roar, {'Jaw': [('x', 30)]})]))
            names += ['Attack', 'Attack2', 'Rally', 'Cast']
    elif v == 'watchman':
        back = over(stand, {'Arm.R': [('x', -30)], 'Fore.R': [('x', 20)], 'Chest': [('z', -15)],
                             'Arm.L': [('x', -40)]})
        jab = over(stand, {'Arm.R': [('x', -62)], 'Fore.R': [('x', 52)], 'Chest': [('z', 10), ('x', 10)],
                            'Arm.L': [('x', -60)], 'Thigh.R': [('x', -30)], 'Shin.R': [('x', 25)],
                            'Hips': [('loc', (0, -0.15, -0.06))]})
        author_clip(arm, 'Attack', [(1, stand), (8, back), (12, jab), (24, stand)], loop=False)
        raise_ = over(stand, {'Arm.R': [('x', -150)], 'Fore.R': [('x', -10)], 'Arm.L': [('x', -140)],
                               'Spine': [('x', -10)], 'Head': [('x', -8)]})
        chop = over(stand, {'Arm.R': [('x', -45)], 'Fore.R': [('x', 60)], 'Arm.L': [('x', -50)], 'Spine': [('x', 20)],
                             'Chest': [('x', 8)], 'Hips': [('loc', (0, 0, -0.1))]})
        author_clip(arm, 'Attack2', [(1, stand), (10, raise_), (14, chop), (28, stand)], loop=False)
        # Halberd Sweep: the pole lowered level and drawn far back to the right,
        # held while the bar runs, then swept in a flat arc across the front.
        drawn = over(stand, {'Arm.R': [('x', -50), ('y', 25)], 'Fore.R': [('x', 40)], 'Arm.L': [('x', -55)],
                              'Fore.L': [('x', -20)], 'Chest': [('z', -50)], 'Spine': [('z', -22)],
                              'Hips': [('z', -10)], 'Thigh.R': [('x', 20)], 'Thigh.L': [('x', -25)],
                              'Shin.L': [('x', 20)], 'Head': [('z', 30)]})
        drawn_b = merge(drawn, {'Chest': [('z', -5)], 'Jaw': [('x', 20)]})
        swept = over(stand, {'Arm.R': [('x', -55), ('y', -20)], 'Fore.R': [('x', 45)], 'Arm.L': [('x', -45)],
                              'Chest': [('z', 60)], 'Spine': [('z', 25)], 'Hips': [('z', 12)],
                              'Thigh.L': [('x', 20)], 'Thigh.R': [('x', -25)], 'Shin.R': [('x', 20)],
                              'Head': [('z', -20)]})
        author_clip(arm, 'HalberdSweep', [(1, stand), (10, drawn), (30, drawn_b), (38, swept), (48, swept)],
                    loop=False)
        author_clip(arm, 'Cast', loop(24, [drawn, drawn_b]))
        names += ['Attack', 'Attack2', 'HalberdSweep', 'Cast']
    elif v == 'arbalest':
        bash = over(stand, {'Arm.R': [('x', -70), ('y', 10)], 'Fore.R': [('x', 10)], 'Chest': [('z', -20)],
                             'Arm.L': [('x', -60)]})
        author_clip(arm, 'Attack', [(1, stand), (7, merge(stand, {'Chest': [('z', 20)]})), (11, bash), (22, stand)],
                    loop=False)
        author_clip(arm, 'Attack2', [(1, stand), (6, merge(stand, {'Head': [('x', -10)]})),
                                     (10, merge(bash, {'Spine': [('x', 12)]})), (22, stand)], loop=False)
        # Aim: the crossbow shouldered, the head down along the stock, held.
        aim = over(stand, {'Arm.R': [('x', -82), ('y', 12)], 'Fore.R': [('x', 76)], 'Arm.L': [('x', -80), ('y', 30)],
                            'Fore.L': [('x', -10)], 'Head': [('x', 12), ('z', -8)], 'Chest': [('z', 8)],
                            'Thigh.R': [('x', 15)], 'Thigh.L': [('x', -15)]})
        author_clip(arm, 'Aim', [(1, stand), (8, aim), (30, merge(aim, {'Chest': [('z', 10)]})), (40, aim)], loop=False)
        author_clip(arm, 'Cast', loop(24, [aim, merge(aim, {'Head': [('x', 14)]})]))
        # Shoot (the Rusted Bolt): a snap to the shoulder, the loose, the kick.
        kick = merge(aim, {'Arm.R': [('x', 14)], 'Chest': [('x', -8)], 'Head': [('x', -10)]})
        author_clip(arm, 'Shoot', [(1, stand), (7, aim), (10, aim), (12, kick), (22, stand)], loop=False)
        names += ['Attack', 'Attack2', 'Aim', 'Cast', 'Shoot']
    else:  # prisoner
        wind = over(stand, {'Arm.R': [('x', -40), ('y', -80)], 'Fore.R': [('x', -30)], 'Chest': [('z', 30)]})
        flail = over(stand, {'Arm.R': [('x', -80), ('y', 40)], 'Fore.R': [('x', -10)], 'Chest': [('z', -30)],
                              'Jaw': [('x', 30)]})
        author_clip(arm, 'Attack', [(1, stand), (8, wind), (12, flail), (24, stand)], loop=False)
        grab = over(stand, {'Arm.L': [('x', -90)], 'Arm.R': [('x', -90)], 'Fore.L': [('x', -20)],
                             'Fore.R': [('x', -20)], 'Spine': [('x', 20)], 'Jaw': [('x', 40)]})
        author_clip(arm, 'Attack2', [(1, stand), (8, merge(stand, {'Spine': [('x', -10)], 'Arm.L': [('x', -130)],
                                                                    'Arm.R': [('x', -130)]})),
                                     (12, grab), (26, stand)], loop=False)
        author_clip(arm, 'Cast', loop(24, [stand, grab]))
        names += ['Attack', 'Attack2', 'Cast']
    return names


def creature(v):
    return (BONES, body_for(v), lambda arm: clips(arm, v), 1.6, 8.0)


VARIANTS = {v: creature(v) for v in ('revenant', 'watchman', 'arbalest', 'sergeant', 'prisoner')}
