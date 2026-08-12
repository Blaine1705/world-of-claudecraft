// @vitest-environment happy-dom
import './_setup';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import CheaterMarkControls from '../../src/admin/components/CheaterMarkControls.svelte';
import { t } from '../../src/admin/i18n';
import type { PendingAction } from '../../src/admin/moderation_actions';

// The Cheater mark panel: apply-vs-lift branches on the detail's cheaterMark state,
// the form takes hours and the wire takes seconds, and admin targets get no panel
// at all (the daily_rewards_controls.test.ts pattern).

const UNMARKED = { id: 42, isAdmin: false, cheaterMark: null };
const MARKED = {
  id: 42,
  isAdmin: false,
  cheaterMark: {
    secondsRemaining: 7200,
    reason: 'win-trading',
    setAt: '2026-08-10T13:00:00.000Z',
  },
};

describe('CheaterMarkControls', () => {
  it('submits an apply with the hours converted to seconds', async () => {
    const onSubmit = vi.fn(async (_pending: PendingAction) => true);
    render(CheaterMarkControls, { props: { target: UNMARKED, onSubmit } });

    const duration = screen.getByRole('spinbutton', {
      name: new RegExp(`^${t('detail.cheaterMarkDuration')}`),
    });
    await fireEvent.input(duration, { target: { value: '6' } });
    await fireEvent.click(screen.getByRole('button', { name: t('detail.cheaterMarkApply') }));
    expect(screen.getByText(t('detail.lengthHours', { count: 6 }))).toBeInTheDocument();

    const reason = screen.getByPlaceholderText(t('detail.notePlaceholder'));
    await fireEvent.input(reason, { target: { value: 'win-trading the 1v1 arena' } });
    await fireEvent.click(screen.getByRole('button', { name: t('dialog.confirm') }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      endpoint: '/admin/api/moderation/accounts/42/cheater-mark',
      body: { reason: 'win-trading the 1v1 arena', seconds: 21600 },
    });
  });

  it('shows the live mark and submits a lift', async () => {
    const onSubmit = vi.fn(async (_pending: PendingAction) => true);
    render(CheaterMarkControls, { props: { target: MARKED, onSubmit } });

    expect(
      screen.getByText(t('detail.cheaterMarkReason', { value: 'win-trading' }), { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('detail.cheaterMarkApply') }),
    ).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: t('detail.cheaterMarkLift') }));
    const reason = screen.getByPlaceholderText(t('detail.notePlaceholder'));
    await fireEvent.input(reason, { target: { value: 'appeal accepted' } });
    await fireEvent.click(screen.getByRole('button', { name: t('dialog.confirm') }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      endpoint: '/admin/api/moderation/accounts/42/lift-cheater-mark',
      body: { reason: 'appeal accepted' },
    });
  });

  it('rejects an empty duration before anything reaches the wire', async () => {
    const onSubmit = vi.fn(async (_pending: PendingAction) => true);
    const alerts = vi.fn();
    window.alert = alerts;
    render(CheaterMarkControls, { props: { target: UNMARKED, onSubmit } });

    await fireEvent.click(screen.getByRole('button', { name: t('detail.cheaterMarkApply') }));
    const reason = screen.getByPlaceholderText(t('detail.notePlaceholder'));
    await fireEvent.input(reason, { target: { value: 'win-trading' } });
    await fireEvent.click(screen.getByRole('button', { name: t('dialog.confirm') }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(alerts).toHaveBeenCalledWith(t('alert.cheaterMarkDurationInvalid'));
  });

  it('renders nothing for an admin target', () => {
    const { container } = render(CheaterMarkControls, {
      props: {
        target: { id: 1, isAdmin: true, cheaterMark: null },
        onSubmit: vi.fn(async () => true),
      },
    });
    expect(container.querySelector('.cheater-mark-controls')).toBeNull();
  });
});
