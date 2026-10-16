"""The Highwatch adventurers' guild, Lantern Hall: the walk-in guild hall at the old stable
yard west of Highwatch, the home of the dungeon contracts.

  blender --background --python scripts/assets/highwatch_guild/build_guild.py -- \
      [--save FILE.blend] [--render OUT_DIR] [--only name,name]

Writes guild_source.glb and guild.collision.json beside this file.
`node scripts/assets/highwatch_guild/build.mjs` ships the GLB (validate, fingerprint, meshopt)
to public/models/tidehold/highwatch/guild.glb and merges the collision rows into
data/asset_collision_overrides.json; the town stands it like the painted buildings and the
manor (src/sim/highwatch_layout.ts), so the model frame is theirs: yards, origin on the ground
line, a yard of footing under it, the door on the -z face.

It is built with the manor's kit (scripts/assets/highwatch_manor/: the walls, windows, slates,
porch, furniture, the warm-light and weathering bakes), so the two houses read as one town's.

Hierarchy (the town view draws the whole; G_INT* parts cast no shadow, the rule the painted
buildings follow, render/eastbrook_placed_building.ts):

  HighwatchGuild_ROOT
    GuildShell                      walls, floors, porch, trophy hall, tower, chimneys
    GuildRoof                       the slate, the spire, everything over the plates outside
    GuildTrim                       gold, iron, the crest, the door's ironwork
    GuildYard                       the paved yard: lamps, the signpost, the hitching rail
    GuildGlow                       lit glass, lantern panes, flames and embers
    G_INT_Timber                    the hall's open roof: trusses, purlins, boards
    G_INT_Furnishings               everything that furnishes the rooms, the plaque boards
    G_INT_Trophy_<dungeon>          each dungeon's trophy on its plaque (five)
    G_INT_TrophyGilt_<dungeon>      each plaque's heroic gilding (five)

The runtime shows a trophy only to a player who has cleared its dungeon, and the gilding only
once cleared on Heroic (render/highwatch_guild_trophies.ts). Original procedural work for this
project (shiplib + the manor's kit + these modules); no imported meshes.
"""
import json
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'eastbrook_ferry'))
sys.path.insert(0, os.path.join(HERE, '..', 'highwatch_manor'))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import manor_lib  # noqa: E402
from manor_lib import EMISSIVE, SLATE, encode_for_export, make_materials  # noqa: E402
from manor_weather import bake_weather  # noqa: E402
from shiplib import Piece, empty, triangles  # noqa: E402

import guild_furnish as U  # noqa: E402
import guild_plan as PL  # noqa: E402
import guild_shell as S  # noqa: E402
import guild_yard as Y  # noqa: E402

# the guild's materials: the manor's specs (same slots, same tones) under the guild's names
manor_lib.MATERIAL_SPECS = tuple((name.replace('Manor', 'Guild'), *rest) for (name, *rest) in manor_lib.MATERIAL_SPECS)

TROPHY_PARTS = tuple(f'G_INT_Trophy_{d}' for d in PL.TROPHY_SLOTS)
GILT_PARTS = tuple(f'G_INT_TrophyGilt_{d}' for d in PL.TROPHY_SLOTS)
PARTS = ('GuildShell', 'GuildRoof', 'GuildTrim', 'GuildYard', 'GuildGlow', 'G_INT_Timber',
         'G_INT_Furnishings') + TROPHY_PARTS + GILT_PARTS
SHADING = {name: (0.04, 0.07) for name in PARTS}
SHADING.update({'GuildRoof': (0.05, 0.04), 'GuildGlow': (0.0, 0.0), 'GuildYard': (0.05, 0.08)})
for name in TROPHY_PARTS + GILT_PARTS:
    SHADING[name] = (0.03, 0.04)


# ---------------------------------------------------------------------------
# The warm light baked into the inside (the runtime adds a few point lights; the vertex colours
# carry the rest of the glow, the tavern's and the manor's method)
# ---------------------------------------------------------------------------
def _sources():
    F = PL.FLOOR
    H = PL.HALL
    hz = (PL.HEARTH['z0'] + PL.HEARTH['z1']) / 2
    src = [((H['x0'] + 0.8, F + 1.2, hz), 1.25, 15.0),               # the guildmaster's fire
           ((7.0, F + 10.4, 0.0), 0.55, 13.0), ((-7.0, F + 10.4, 0.0), 0.55, 13.0),   # chandeliers
           ((PL.BOARD['x'] - 1.3, PL.BOARD['y1'] - 0.6, -5.0), 0.45, 6.5),
           ((PL.BOARD['x'] - 1.3, PL.BOARD['y1'] - 0.6, 5.0), 0.45, 6.5),           # the board's lanterns
           ((11.1, F + 1.6, -0.9), 0.3, 4.0),                          # the clerk's candle
           ((9.4, F + 2.8, 8.3), 0.45, 6.0),                           # the recruitment candelabrum
           ((0.0, F + 1.0, PL.TROPHY['z1'] - 0.7), 1.0, 11.0),          # the trophy hall's fire
           ((5.4, F + 2.6, PL.TROPHY['z1'] - 1.8), 0.35, 5.0), ((-5.4, F + 2.6, PL.TROPHY['z1'] - 1.8), 0.35, 5.0),
           ((0.0, F + 6.2, -14.2), 0.45, 7.0)]                          # the porch lantern
    for x in (-10.5, 10.5):
        for sz in (1, -1):
            src.append(((x, F + 4.4, sz * (H['z1'] - 0.8)), 0.3, 5.0))  # the sconces
    for sx in (1, -1):
        src.append(((sx * (PL.TROPHY['x1'] - 0.5), F + 4.8, 15.4), 0.3, 4.5))
    return src


ROOMS = (
    # x0, x1, y0, y1, z0, z1: where the warm bake applies (the inside of every room)
    (PL.HALL['x0'] - 0.1, PL.HALL['x1'] + 0.1, -0.5, PL.HALL['ridge'] + 0.5, PL.HALL['z0'] - 0.1, PL.HALL['z1'] + 0.1),
    (PL.TROPHY['x0'] - 0.1, PL.TROPHY['x1'] + 0.1, -0.5, PL.TROPHY['plate'] + 4.0, PL.HALL['oz1'] - 0.95,
     PL.TROPHY['z1'] + 0.1),
    (PL.PORCH['x0'] - 0.2, PL.PORCH['x1'] + 0.2, -0.5, PL.PORCH['beam'] + 0.9, PL.PORCH['z0'] - 1.0, PL.PORCH['z1']),
)


def _inside(x, y, z):
    return any(x0 <= x <= x1 and y0 <= y <= y1 and z0 <= z <= z1 for (x0, x1, y0, y1, z0, z1) in ROOMS)


def bake_warm_light(parts):
    from shiplib import G as game
    sources = _sources()
    for name, piece in parts.items():
        bm = piece.bm
        bm.normal_update()
        for f in bm.faces:
            if f.material_index in EMISSIVE or f.material_index == SLATE:
                continue
            c = game(f.calc_center_median())
            if not _inside(c.x, c.y, c.z):
                continue
            n = game(f.normal)
            light = 0.0
            for (lx, ly, lz), k, reach in sources:
                dx, dy, dz = lx - c.x, ly - c.y, lz - c.z
                d = math.sqrt(dx * dx + dy * dy + dz * dz)
                if d >= reach:
                    continue
                facing = (dx * n.x + dy * n.y + dz * n.z) / max(d, 1e-4)
                fall = (1 - d / reach) ** 2
                light += k * fall * (0.35 + 0.65 * max(0.0, facing))
            light = min(light, 1.1)
            mult = (0.92 + light * 0.55, 0.86 + light * 0.44, 0.76 + light * 0.3)
            for loop in f.loops:
                r, g, b, a = loop[piece.col]
                loop[piece.col] = (min(1.0, r * mult[0]), min(1.0, g * mult[1]), min(1.0, b * mult[2]), a)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    root = empty('HighwatchGuild_ROOT', None, display='ARROWS', size=2.0)
    parts = {name: Piece(name, wear=w, gradient=g) for name, (w, g) in SHADING.items()}
    S.build(parts)
    U.build(parts)
    Y.build(parts)
    bake_warm_light(parts)
    bake_weather(parts, _inside, roof_name='GuildRoof')
    encode_for_export(parts)
    pieces = {}
    for name in PARTS:
        if not parts[name].bm.faces:
            raise RuntimeError(f'part {name} is empty')
        pieces[name] = parts[name].finish(mats, root)
    root['highwatchGuild'] = {
        'version': 1,
        'floor': PL.FLOOR,
        'door': [round(PL.DOOR['x1'] - PL.DOOR['x0'], 4), round(PL.DOOR['head'] - PL.FLOOR, 4)],
        'hall': {'plate': PL.HALL['plate'], 'ridge': PL.HALL['ridge'], 'truss': PL.HALL['truss']},
        'tower': [PL.TOWER['cx'], PL.TOWER['belfry'] - 1.6, PL.TOWER['cz']],
        'trophies': list(PL.TROPHY_SLOTS),
    }
    return dict(root=root, pieces=pieces, mats=mats)


def bounds(objs):
    """The model's bounds in the model frame (glTF axes: x, y up, z)."""
    from shiplib import G as game
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    bpy.context.view_layer.update()
    for obj in objs['pieces'].values():
        mw = obj.matrix_world
        for v in obj.data.vertices:
            g = game(mw @ v.co)
            for i, c in enumerate((g.x, g.y, g.z)):
                lo[i] = min(lo[i], c)
                hi[i] = max(hi[i], c)
    return lo, hi


def collision_rows(lo, hi):
    """The plan's boxes and decks as placed-asset collision rows: stored in multiples of the
    model's largest dimension over the placed target height (2.2), heights over the model's
    lowest point (sim/town_walk_in.ts, sim/colliders_authored/placement_colliders.ts)."""
    size = max(h - l for h, l in zip(hi, lo))
    k = 2.2 / size
    base = lo[1]
    r4 = lambda v: round(v, 4)  # noqa: E731
    boxes = []
    for (_, x0, x1, y0, y1, z0, z1) in PL.collision_boxes():
        boxes.append({'x': r4((x0 + x1) / 2 * k), 'y': r4(((y0 + y1) / 2 - base) * k), 'z': r4((z0 + z1) / 2 * k),
                      'hx': r4((x1 - x0) / 2 * k), 'hy': r4((y1 - y0) / 2 * k), 'hz': r4((z1 - z0) / 2 * k)})
    ramps = []
    for (_, x0, x1, z0, z1, ya, yb, axis) in PL.decks():
        row = {'x': r4((x0 + x1) / 2 * k), 'z': r4((z0 + z1) / 2 * k), 'y0': r4((ya - base) * k),
               'y1': r4((yb - base) * k)}
        if axis == 'z':
            row.update({'hx': r4((z1 - z0) / 2 * k), 'hz': r4((x1 - x0) / 2 * k), 'ry': r4(-math.pi / 2)})
        else:
            row.update({'hx': r4((x1 - x0) / 2 * k), 'hz': r4((z1 - z0) / 2 * k)})
        ramps.append(row)
    return {'size': size, 'min': lo, 'max': hi, 'rows': {'mode': 'baked', 'boxes': boxes, 'ramps': ramps}}


def report(objs):
    total = 0
    for name, obj in objs['pieces'].items():
        n = triangles(obj)
        total += n
        print(f'PIECE {name} triangles {n}')
    print(f'TRIANGLES total {total}')
    return total


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    root = objs['root']
    root.select_set(True)
    for o in root.children_recursive:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_morph=False,
    )
    print('WROTE', path)


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


if __name__ == '__main__':
    objs = build_scene()
    report(objs)
    lo, hi = bounds(objs)
    print('BOUNDS', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
    export(os.path.join(HERE, 'guild_source.glb'), objs)
    coll = collision_rows(lo, hi)
    with open(os.path.join(HERE, 'guild.collision.json'), 'w', encoding='utf8', newline='\n') as fh:
        json.dump(coll, fh, indent=1)
        fh.write('\n')
    print('COLLISION', len(coll['rows']['boxes']), 'boxes', len(coll['rows']['ramps']), 'decks, size',
          round(coll['size'], 4))
    if arg('--save') or arg('--render'):
        import guild_scene  # noqa: E402
        guild_scene.stage(objs)
        if arg('--save'):
            guild_scene.save(arg('--save'))
        if arg('--render'):
            guild_scene.render_all(arg('--render'), only=arg('--only'))
