// @vitest-environment jsdom
import './_setup';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LocationCell from '../../src/admin/components/LocationCell.svelte';
import { t } from '../../src/admin/i18n';

const dungeon = {
  kind: 'dungeon' as const,
  zoneId: 'shadowfen',
  zone: 'Shadowfen',
  instanceId: 'sf-1',
  instance: 'Sunken Crypt',
  instanceSlot: null,
  poiIndex: null,
  poi: null,
  poiDistance: null,
};

describe('LocationCell', () => {
  it('shows the coordinates and describes the full location for assistive tech', () => {
    render(LocationCell, { location: dungeon, x: 12, z: 34, zone: 'shadowfen' });
    expect(screen.getByText('12, 34')).toBeInTheDocument();
    expect(screen.getByLabelText(/Shadowfen/)).toBeInTheDocument();
  });

  it('opens the details on hover with FIXED offsets, so a scroll container cannot clip it', async () => {
    const { container } = render(LocationCell, {
      location: dungeon,
      x: 12,
      z: 34,
      zone: 'shadowfen',
    });
    const cell = container.querySelector('.location-cell');
    if (!cell) throw new Error('location cell not found');
    expect(container.querySelector('.location-tooltip')).toBeNull();

    await fireEvent.pointerEnter(cell);
    const tooltip = container.querySelector('.location-tooltip');
    if (!tooltip) throw new Error('tooltip not rendered on hover');
    expect(tooltip).toHaveTextContent(t('location.instance', { value: 'Sunken Crypt' }));
    // The offsets are viewport offsets, which only work with fixed positioning: an
    // absolutely positioned tooltip is exactly what the horizontal scroll container
    // clipped. jsdom does not apply the scoped <style>, so the rule itself is pinned
    // from the source below.
    expect(tooltip.getAttribute('style')).toMatch(/right: \d+px/);
    expect(tooltip.getAttribute('style')).toMatch(/(top|bottom): \d+px/);

    await fireEvent.pointerLeave(cell);
    expect(container.querySelector('.location-tooltip')).toBeNull();
  });

  it('opens and closes on keyboard focus too', async () => {
    const { container } = render(LocationCell, { location: null, x: 5, z: 6, zone: 'greenhollow' });
    const cell = container.querySelector('.location-cell');
    if (!cell) throw new Error('location cell not found');

    await fireEvent.focusIn(cell);
    expect(container.querySelector('.location-tooltip')).not.toBeNull();
    await fireEvent.focusOut(cell);
    expect(container.querySelector('.location-tooltip')).toBeNull();
  });

  it('positions the tooltip fixed, out of any scroll container it renders inside', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/admin/components/LocationCell.svelte'),
      'utf8',
    );
    expect(source).toMatch(/\.location-tooltip\s*\{[^}]*position:\s*fixed/);
    expect(source).not.toMatch(/\.location-tooltip\s*\{[^}]*position:\s*absolute/);
  });
});
