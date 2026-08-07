// The helmet-visibility preference's client-side persistence: the sim/server
// treat `set_helm` as session state (like the Z-key sheathe), so the choice
// survives relog by being stored here and re-asserted through
// IWorld.setHelmHidden on every world entry. UI-side on purpose: it is the
// paperdoll eye toggle's memory, not sim state.

const HELM_HIDDEN_KEY = 'woc.helmHidden';

export function storedHelmHidden(): boolean {
  try {
    return localStorage.getItem(HELM_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeHelmHidden(hidden: boolean): void {
  try {
    // Written only while hidden so a shown helm (the default) leaves no key.
    if (hidden) localStorage.setItem(HELM_HIDDEN_KEY, '1');
    else localStorage.removeItem(HELM_HIDDEN_KEY);
  } catch {
    /* storage unavailable: the choice still applies for this session */
  }
}
