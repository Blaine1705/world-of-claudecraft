"""The Colossus's bake surfaces. Opaque, so the glass is faked: clear
turquoise sea-glass, frosted pale on the worn edges and deep in the hollows,
currents of light running inside it, geodes of violet and moon-white crystal,
nacre plates set round the prism.

  glass   the sea-glass body, fists and feet
  head    the same glass, its slit of light
  prism   the eye: faceted silver and violet, lit from inside
  shard   broken tideglass
  silver  moon silver; pearl
No rust, no barnacles, no grey fog."""
from surface import NT, cavity, srgb

KINDS = ('glass', 'core', 'head', 'prism', 'shard', 'silver', 'pearl')
GLOWS = {
    'glow_pool': ((0.3, 0.76, 0.92), 1.4, 'ColossusPool'),
}
EMIT_STRENGTH = 4.0
CYAN = (0.35, 0.95, 1.0)


def uv_boost(obj, c):
    n = obj.name
    if n.startswith('CrystalHead'):
        return 1.5
    if n.startswith('PrismEye'):
        return 1.5
    return 1.0


def _attr(t, name):
    n = t.node('ShaderNodeAttribute')
    n.attribute_name = name
    return n.outputs['Fac']


def _glass(t, current, geode, nacre):
    edge = t.smooth(t.point, 0.52, 0.6)
    hollow = t.smooth(t.point, 0.48, 0.4)
    depth = t.noise(t.scale_vec(1.0, 1.0, 0.5), scale=1.2, detail=4, dist=0.8)
    base = t.ramp(depth, [(0.25, srgb((0.03, 0.26, 0.34))), (0.5, srgb((0.08, 0.44, 0.5))),
                          (0.75, srgb((0.2, 0.62, 0.66)))])
    # cloudy inclusions, lighter, like the bubbles in old glass
    cloud = t.smooth(t.noise(scale=5.0, detail=3), 0.58, 0.72)
    color = t.mix(t.math('MULTIPLY', cloud, 0.35), base, srgb((0.5, 0.8, 0.82)))
    color = t.mix(t.math('MULTIPLY', hollow, 0.7), color, srgb((0.01, 0.12, 0.2)))
    color = t.mix(t.math('MULTIPLY', edge, 0.75), color, srgb((0.78, 0.94, 0.95)))
    # fractures lit from inside: thin glowing cracks
    crack = t.smooth(t.voronoi(t.scale_vec(1.0, 1.0, 0.6), scale=1.3, feature='DISTANCE_TO_EDGE'), 0.018, 0.0)
    color = t.mix(t.math('MULTIPLY', crack, 0.5), color, srgb((0.55, 0.95, 1.0)))
    geo = t.ramp(t.noise(scale=6.0, detail=2), [(0.3, srgb((0.56, 0.42, 0.86))), (0.7, srgb((0.9, 0.9, 1.0)))])
    color = t.mix(geode, color, geo)
    nac = t.ramp(t.noise(t.scale_vec(1.0, 1.0, 3.0), scale=3.0, detail=3, w=1.5, dist=1.2),
                 [(0.2, srgb((1.0, 0.86, 0.94))), (0.5, srgb((1.0, 0.98, 0.98))), (0.8, srgb((0.82, 1.0, 0.97)))])
    color = t.mix(nacre, color, nac)
    emit = t.mix(t.math('MULTIPLY', crack, 0.7), srgb((0.01, 0.07, 0.1)), srgb((0.35, 0.9, 1.0)))
    emit = t.mix(t.math('MULTIPLY', current, 0.3), emit, srgb((0.2, 0.6, 0.7)))
    emit = t.mix(t.math('MULTIPLY', geode, 0.45), emit, srgb((0.6, 0.45, 1.0)))
    rough = t.fmix(edge, 0.1, 0.4)
    h = t.math('ADD', t.math('MULTIPLY', t.noise(scale=18, detail=3), 0.25), t.math('MULTIPLY', crack, -0.4))
    return color, rough, h, emit


def shade(mat, k):
    t = NT(mat)
    if k == 'glass':
        current = t.smooth(_attr(t, 'RegCurrent'), 0.05, 0.8)
        geode = t.smooth(_attr(t, 'RegGeode'), 0.2, 0.9)
        nacre = t.smooth(_attr(t, 'RegNacre'), 0.05, 0.8)
        color, rough, h, emit = _glass(t, current, geode, nacre)
        t.finish(color, rough, 0.0, t.bump(h, 0.25, 0.006), emit=emit)
    elif k == 'core':
        # the deep water inside: dark sea-blue, currents of light running through it
        current = t.smooth(_attr(t, 'RegCurrent'), 0.05, 0.8)
        base = t.ramp(t.noise(scale=2.0, detail=3), [(0.3, srgb((0.02, 0.12, 0.22))), (0.7, srgb((0.05, 0.24, 0.36)))])
        color = t.mix(current, base, srgb((0.5, 0.95, 1.0)))
        emit = t.mix(current, srgb((0.03, 0.2, 0.3)), srgb((0.45, 0.95, 1.0)))
        t.finish(color, 0.2, 0.0, None, emit=emit)
    elif k == 'head':
        slit = t.smooth(_attr(t, 'RegSlit'), 0.05, 0.8)
        color, rough, h, emit = _glass(t, 0.0, 0.0, 0.0)
        color = t.mix(slit, color, srgb((0.86, 1.0, 1.0)))
        emit = t.mix(slit, emit, srgb((0.8, 1.0, 1.0)))
        t.finish(color, rough, 0.0, t.bump(h, 0.25, 0.006), emit=emit)
    elif k == 'prism':
        facet = t.smooth(t.point, 0.5, 0.56)
        base = t.ramp(t.noise(scale=3.0, detail=2), [(0.3, srgb((0.62, 0.5, 0.9))), (0.7, srgb((0.86, 0.86, 1.0)))])
        color = t.mix(t.math('MULTIPLY', facet, 0.6), base, srgb((0.95, 0.95, 1.0)))
        emit = t.mix(t.math('MULTIPLY', facet, 0.5), srgb((0.45, 0.35, 0.85)), srgb((0.9, 0.9, 1.0)))
        t.finish(color, 0.08, 0.3, None, emit=emit)
    elif k == 'shard':
        color, rough, h, emit = _glass(t, 0.0, 0.0, 0.0)
        t.finish(color, rough, 0.0, t.bump(h, 0.25, 0.006), emit=emit)
    elif k == 'silver':
        base = t.ramp(t.noise(scale=6, detail=3), [(0.3, srgb((0.82, 0.86, 0.92))), (0.7, srgb((0.95, 0.96, 1.0)))])
        color = cavity(t, base, dark=0.6, light=1.06)
        t.finish(color, 0.28, 0.5, t.bump(t.noise(scale=80, detail=2), 0.06, 0.001))
    elif k == 'pearl':
        base = t.ramp(t.noise(scale=30, detail=2), [(0.3, srgb((0.94, 0.9, 0.98))), (0.7, srgb((0.88, 0.97, 0.98)))])
        t.finish(base, 0.12, 0.0, None, emit=srgb((0.25, 0.3, 0.35)))
    else:
        raise ValueError(k)
    return mat
