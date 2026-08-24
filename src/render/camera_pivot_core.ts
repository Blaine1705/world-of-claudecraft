export interface RigidCameraPivot {
  playerX: number;
  playerY: number;
  playerZ: number;
  eyeY: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
}

export const createRigidCameraPivot = (): RigidCameraPivot => ({
  playerX: 0,
  playerY: 0,
  playerZ: 0,
  eyeY: 0,
  cameraX: 0,
  cameraY: 0,
  cameraZ: 0,
});

export function rigidCameraPivotInto(
  out: RigidCameraPivot,
  playerX: number,
  playerY: number,
  playerZ: number,
  yaw: number,
  pitch: number,
  distance: number,
  cameraYCeiling: number,
): void {
  const eyeY = playerY + 2;
  out.playerX = playerX;
  out.playerY = playerY;
  out.playerZ = playerZ;
  out.eyeY = eyeY;
  out.cameraX = playerX - Math.sin(yaw) * Math.cos(pitch) * distance;
  out.cameraY = Math.min(eyeY + Math.sin(pitch) * distance, cameraYCeiling);
  out.cameraZ = playerZ - Math.cos(yaw) * Math.cos(pitch) * distance;
}
