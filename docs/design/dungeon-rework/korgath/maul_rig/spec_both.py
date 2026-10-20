import spec_slam, spec_sweep


def build(rig):
    out = {}
    out.update(spec_slam.build(rig))
    out.update(spec_sweep.build(rig))
    return out
