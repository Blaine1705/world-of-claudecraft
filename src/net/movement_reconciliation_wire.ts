export class ReconWireState {
  reconAuthoritativeX: number | null = null;
  reconAuthoritativeY: number | null = null;
  reconAuthoritativeZ: number | null = null;
  reconAuthoritativeFacing: number | null = null;
  reconAckClientTick = -1;
  reconOverrideEpoch = 0;
  reconOverrideActive = false;
  reconMoveSpeedMult = 1;
}

interface MovementReconciliationSelfWire {
  px?: unknown;
  py?: unknown;
  pz?: unknown;
  pf?: unknown;
  ackCt?: unknown;
  ovE?: unknown;
  ovA?: unknown;
  msm?: unknown;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function applyReconSelfWire(
  target: ReconWireState,
  self: MovementReconciliationSelfWire,
  movementWireVersion: 1 | 2,
): void {
  if (
    movementWireVersion !== 2 ||
    !finiteNumber(self.px) ||
    !finiteNumber(self.py) ||
    !finiteNumber(self.pz) ||
    !finiteNumber(self.pf) ||
    !Number.isSafeInteger(self.ackCt) ||
    (self.ackCt as number) < -1 ||
    !Number.isSafeInteger(self.ovE) ||
    (self.ovE as number) < 0 ||
    (self.msm !== undefined && (!finiteNumber(self.msm) || self.msm < 0))
  ) {
    return;
  }
  target.reconAuthoritativeX = self.px;
  target.reconAuthoritativeY = self.py;
  target.reconAuthoritativeZ = self.pz;
  target.reconAuthoritativeFacing = self.pf;
  target.reconAckClientTick = self.ackCt as number;
  target.reconOverrideEpoch = self.ovE as number;
  target.reconOverrideActive = self.ovA === 1;
  target.reconMoveSpeedMult = self.msm === undefined ? 1 : self.msm;
}
