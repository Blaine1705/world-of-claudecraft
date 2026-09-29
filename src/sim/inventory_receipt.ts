import type { InventoryGrantOptions } from './inventory_grant';
import { isWorldPvpSkullCopy } from './pvp/world_pvp_spoils';
import type { SimContext } from './sim_context';
import { cloneItemInstancePayload, type ItemInstancePayload } from './types';

/** Shared receipt for both grant hubs. Enhanced copies carry exact tooltip identity,
 * and so does a copy named for someone (the World PvP trophy skull), whose chat link
 * must read "<name>'s Skull". Keep absent optional keys absent: the deterministic
 * event trace preserves them.
 */
export function emitInventoryReceipt(
  ctx: Pick<SimContext, 'emit'>,
  pid: number,
  itemId: string,
  itemName: string,
  count: number,
  opts?: InventoryGrantOptions,
  instance?: ItemInstancePayload,
): void {
  ctx.emit({
    type: 'loot',
    // biome-ignore lint/style/useTemplate: keep this scanner-friendly shape for i18n extraction.
    text: `You receive: ${itemName}${count > 1 ? ' x' + count : ''}.`,
    pid,
    ...(opts?.silent ? { silent: true } : {}),
    ...(opts?.callerLogs ? { callerLogs: true } : {}),
    ...(instance && (instance.lootQuality || isWorldPvpSkullCopy(itemId, instance))
      ? { itemId, instance: cloneItemInstancePayload(instance), count }
      : {}),
  });
}
