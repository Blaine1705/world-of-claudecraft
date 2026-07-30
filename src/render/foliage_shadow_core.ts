export interface ShadowOnlyCountHost {
  count: number;
}

/**
 * A shadow-only clone uses a no-write beauty material but still needs its full
 * instance count in Three's separate shadow traversal. Zero the count only
 * around a main render callback, then restore it for every other traversal.
 */
export function suppressShadowOnlyMainDraw(mesh: ShadowOnlyCountHost): void {
  const callbacks = mesh as ShadowOnlyCountHost & {
    onBeforeRender: () => void;
    onAfterRender: () => void;
  };
  const shadowCount = mesh.count;
  callbacks.onBeforeRender = () => {
    mesh.count = 0;
  };
  callbacks.onAfterRender = () => {
    mesh.count = shadowCount;
  };
}
