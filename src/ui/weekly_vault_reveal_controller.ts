// Requests a host opening; only a durably revealed host item can animate or display.
import type { ItemDef } from '../sim/types';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { captureFocusKey, FOCUS_KEY_ATTR } from './focus_restore';
import { t } from './i18n';
import type { PainterHostPresentation } from './painter_host';

export const WEEKLY_REVEAL_DURATION_MS = 2300;
export function attachWeeklyVaultReveal(
  stage: HTMLElement,
  item: ItemDef | undefined,
  title: string,
  index: number,
  revealed: boolean,
  presentation: PainterHostPresentation,
  canOpen: () => boolean,
  onReveal: () => void,
  onSelect?: () => void,
  requestOpen?: () => void,
  saving = false,
): { dispose(): void; animate(): void } {
  const itemName = item ? itemDisplayName(item) : '';
  const original = stage.querySelector<HTMLImageElement>('img')!;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'vault-reveal-trigger';
  trigger.setAttribute('aria-label', t('hudChrome.weeklyRewards.openVault', { name: title }));
  trigger.setAttribute('aria-expanded', 'false');
  const resultId = `weekly-reveal-result-${index}`;
  trigger.setAttribute('aria-controls', resultId);
  trigger.innerHTML = '<span class="vault-reveal-interior" aria-hidden="true"></span>';
  const loot = document.createElement('button');
  loot.type = 'button';
  loot.className = `vault-reveal-loot${item ? ` quality-${item.quality}` : ''}`;
  loot.disabled = true;
  loot.hidden = !item;
  if (item) {
    loot.setAttribute(
      'aria-label',
      t(onSelect ? 'hudChrome.weeklyRewards.selectItem' : 'hudChrome.weeklyRewards.inspectItem', {
        name: itemName,
      }),
    );
    loot.innerHTML = `${presentation.itemIcon(item)}<strong>${esc(itemName)}</strong><small>${esc(t('hudChrome.weeklyRewards.revealed'))}</small>`;
    presentation.attachTooltip(loot, () => presentation.itemTooltip(item));
  }
  const frame = original.cloneNode(true) as HTMLImageElement;
  frame.className = 'vault-reveal-frame';
  const door = document.createElement('span');
  door.className = 'vault-reveal-door';
  door.setAttribute('aria-hidden', 'true');
  const front = original.cloneNode(true) as HTMLImageElement;
  front.className = 'vault-door-front';
  const latch = original.cloneNode(true) as HTMLImageElement;
  latch.className = 'vault-door-latch';
  const back = original.cloneNode(true) as HTMLImageElement;
  back.className = 'vault-door-back';
  const edge = document.createElement('span');
  edge.className = 'vault-door-edge';
  const topEdge = document.createElement('span');
  topEdge.className = 'vault-door-top';
  const bottomEdge = document.createElement('span');
  bottomEdge.className = 'vault-door-bottom';
  const shade = document.createElement('span');
  shade.className = 'vault-door-shading';
  door.append(back, edge, topEdge, bottomEdge, front, shade, latch);
  const spill = document.createElement('span');
  spill.className = 'vault-light-spill';
  spill.setAttribute('aria-hidden', 'true');
  // Light escapes the three free edges; the hinged left side stays occluded.
  for (const [x, y, angle, length, width] of [
    [43, 26, -110, 64, 3],
    [53, 24, -96, 72, 10],
    [65, 24, -80, 70, 4],
    [75, 27, -60, 78, 12],
    [76, 37, -27, 85, 3],
    [77, 46, -8, 90, 12],
    [77, 55, 10, 86, 3],
    [75, 65, 28, 80, 9],
    [75, 73, 60, 78, 12],
    [65, 76, 80, 70, 4],
    [53, 76, 96, 72, 10],
    [43, 74, 110, 64, 3],
    [39, 28, -118, 60, 4],
    [48, 25, -103, 76, 5],
    [59, 24, -88, 66, 3],
    [70, 25, -70, 74, 5],
    [75, 32, -42, 78, 4],
    [77, 41, -18, 83, 5],
    [77, 50, 1, 94, 4],
    [76, 60, 20, 84, 5],
    [70, 75, 70, 74, 5],
    [59, 76, 88, 66, 3],
    [48, 75, 103, 76, 5],
    [39, 72, 118, 60, 4],
  ]) {
    const ray = document.createElement('i');
    ray.style.setProperty('--ray-x', `${x}%`);
    ray.style.setProperty('--ray-y', `${y}%`);
    ray.style.setProperty('--ray-angle', `${angle}deg`);
    ray.style.setProperty('--ray-length', `${length}%`);
    ray.style.setProperty('--ray-width', `${width}%`);
    ray.style.setProperty('--ray-delay', `${(spill.childElementCount % 5) * 30}ms`);
    spill.append(ray);
  }
  const shadow = document.createElement('span');
  shadow.className = 'vault-door-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('span');
  flash.className = 'vault-opening-flash';
  flash.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('span');
  ring.className = 'vault-opening-ring';
  ring.setAttribute('aria-hidden', 'true');
  trigger.append(shadow, flash, spill, ring);
  const sparks = document.createElement('span');
  sparks.className = 'vault-unlock-sparks';
  sparks.setAttribute('aria-hidden', 'true');
  for (const [x, y] of [
    [-78, -60],
    [-28, -108],
    [42, -118],
    [126, -25],
    [110, 54],
    [24, 98],
    [-48, 72],
    [-88, 18],
    [74, -89],
    [112, 12],
    [58, 76],
    [-12, -92],
    [88, -48],
    [34, 112],
  ]) {
    const spark = document.createElement('i');
    const vertical = Math.abs(y) > Math.abs(x);
    spark.style.left = vertical ? '60%' : '77%';
    spark.style.top = vertical ? (y < 0 ? '26%' : '74%') : '50%';
    spark.style.setProperty('--spark-x', `${x}px`);
    spark.style.setProperty('--spark-y', `${y}px`);
    spark.style.setProperty('--spark-angle', `${(Math.atan2(y, x) * 180) / Math.PI}deg`);
    spark.style.setProperty('--spark-delay', `${(sparks.childElementCount % 4) * 45}ms`);
    sparks.append(spark);
  }
  trigger.append(sparks);
  trigger.append(frame, door);
  const announcement = document.createElement('span');
  announcement.id = resultId;
  announcement.className = 'vault-reveal-announcement';
  announcement.setAttribute('role', 'status');
  stage.replaceChildren(trigger, loot, announcement);
  trigger.setAttribute(FOCUS_KEY_ATTR, `weekly-open:${index}`);
  loot.setAttribute(FOCUS_KEY_ATTR, `weekly-inspect:${index}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let opening = false;
  if (saving) {
    // Keep the pending control focusable across authoritative snapshot repaints.
    trigger.setAttribute('aria-disabled', 'true');
    trigger.setAttribute('aria-busy', 'true');
    announcement.textContent = t('hudChrome.weeklyRewards.openingSavedReward');
  }
  loot.addEventListener('click', () => {
    if (!disposed && !loot.disabled && canOpen()) onSelect?.();
  });
  const finish = () => {
    if (disposed || !item || !canOpen()) return;
    const hadFocus = captureFocusKey(stage) === `weekly-open:${index}`;
    stage.classList.add('vault-is-revealed');
    trigger.disabled = true;
    loot.disabled = false;
    if (hadFocus) loot.focus();
    announcement.textContent = t('hudChrome.weeklyRewards.revealedItem', { name: itemName });
    onReveal();
  };
  if (revealed && item) {
    stage.classList.add('vault-is-open', 'vault-is-revealed');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.disabled = true;
    loot.disabled = false;
  }
  const animate = () => {
    if (disposed || opening || revealed || !item || !canOpen()) return;
    opening = true;
    stage.classList.add('vault-is-open');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-disabled', 'true');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else timer = setTimeout(finish, WEEKLY_REVEAL_DURATION_MS);
  };
  trigger.addEventListener('click', () => {
    if (disposed || opening || saving || !canOpen()) return;
    if (item) animate();
    else requestOpen?.();
  });
  return {
    animate,
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
