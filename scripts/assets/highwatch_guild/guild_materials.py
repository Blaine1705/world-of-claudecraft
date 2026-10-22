"""Lantern Hall's materials: vertex colour over plain shaders, the way the Highwatch manor was
built before it took the painted maps (the manor's kit moved its materials into
highwatch_manor/manor_texture.py). The guild keeps its own copy so its look does not move with
the manor's paint, and a plain painter that hands the manor's weathering the builders' material
untouched, so bake_weather weathers the guild's palette exactly as it did before.
"""
import bpy

# A glTF material's emission cannot read the vertex colours, so each glowing material carries
# its own emission colour: the warm amber of lamplight behind glass and of candle flames, and
# a faint warm light through the coloured glass (whose colours are its vertex colours, lit by
# the room). The runtime lifts a weak emission to its bloom floor
# (render/eastbrook_placed_building.ts), so the colours here set the hue and the balance.
# The guild's names over the kit's slots and tones; the order is the kit's material indices
# (manor_lib: WOOD, METAL, STONE, PLASTER, GLOW, SLATE, GLASS, ...).
MATERIAL_SPECS = (
    # name, roughness, metallic, emission strength, emission colour
    ('GuildWood', 0.82, 0.0, 0.0, None),
    ('GuildMetal', 0.42, 0.6, 0.0, None),
    ('GuildStone', 0.92, 0.0, 0.0, None),
    ('GuildPlaster', 0.95, 0.0, 0.0, None),
    ('GuildGlow', 0.5, 0.0, 1.0, (0.62, 0.34, 0.1)),
    ('GuildSlate', 0.7, 0.05, 0.0, None),
    ('GuildGlass', 0.3, 0.0, 1.0, (0.2, 0.15, 0.09)),
    # the stained glass's colours, lit from the room behind them at night
    ('GuildGlassBlue', 0.3, 0.0, 1.0, (0.08, 0.14, 0.42)),
    ('GuildGlassRed', 0.3, 0.0, 1.0, (0.42, 0.06, 0.07)),
    ('GuildGlassGold', 0.3, 0.0, 1.0, (0.6, 0.4, 0.1)),
    # honey lamplight (alternate windows), the brighter lanterns, the soft candle flames
    ('GuildGlowSoft', 0.5, 0.0, 1.0, (0.66, 0.46, 0.18)),
    ('GuildGlowLantern', 0.5, 0.0, 1.0, (0.86, 0.5, 0.14)),
    ('GuildGlowCandle', 0.5, 0.0, 1.0, (0.78, 0.6, 0.24)),
)


def make_materials():
    mats = []
    for name, rough, metal, emission, glow in MATERIAL_SPECS:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
        if emission:
            bsdf.inputs['Emission Color'].default_value = (*glow, 1.0)
            bsdf.inputs['Emission Strength'].default_value = emission
        mat.use_backface_culling = True
        mats.append(mat)
    return mats


class PlainPainter:
    """The painter manor_weather.bake_weather asks of every face: on an unpainted model a face's
    material is the builders' own and its colour terms are the palette's."""

    @staticmethod
    def source_material(piece, face):
        return face.material_index

    @staticmethod
    def to_paint(piece, face, target):
        return target

    @staticmethod
    def store(face, col):
        return (min(1.0, col[0]), min(1.0, col[1]), min(1.0, col[2]))
