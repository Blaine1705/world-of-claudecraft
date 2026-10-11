import { QUEUE_REWARDS, type QueueRewardId } from '../../../sim/content/queue_rewards';
import type { Role } from '../../../sim/content/talents';
import {
  EXPEDITION_PURPOSES,
  type ExpeditionDetails,
  type ExpeditionPurpose,
} from '../../../sim/social/expedition_social';
import { FINDER_PLAYER_APPLICATION_CAP } from '../../../sim/social/finder_applications';
import type { IWorld } from '../../../world_api';
import { dungeonDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import {
  captureFocusKey,
  findFocusKey,
  focusKeyAttr,
  restoreFirstEnabled,
} from '../../focus_restore';
import { captureFormDraft, restoreFormDraft } from '../../form_draft';
import { formatNumber, t } from '../../i18n';
import type { hudChromeStrings } from '../../i18n.catalog/hud_chrome';
import type { PainterHostWriters } from '../../painter_host';
import { svgIcon } from '../../ui_icons';
import type { WindowFocusBridge } from '../../window_focus';
import { expeditionClassEmblem, expeditionHero } from './expedition_art';
import { expeditionShopHtml } from './expedition_shop_html';
import { buildExpeditionView } from './expedition_view';
import { RecruitmentController } from './recruitment_controller';

interface ExpeditionDeps extends WindowFocusBridge {
  world(): IWorld;
  writers: PainterHostWriters;
  openFinder(): void;
  openRecruitment(): void;
  notify?(): void;
  maskPlayerText?(note: string): string;
}

type View = ReturnType<typeof buildExpeditionView>;
const text = (key: keyof typeof hudChromeStrings.expeditions, values?: Record<string, string>) =>
  esc(t(`hudChrome.expeditions.${key}`, values));
const num = (value: number) => formatNumber(value, { maximumFractionDigits: 0 });
const roleText = (role: Role) =>
  t(`hudChrome.finder.${role === 'dps' ? 'roleDps' : role === 'tank' ? 'roleTank' : 'roleHealer'}`);
const button = (action: string, label: string, extra = '', disabled = false) =>
  `<button type="button" class="ui-btn${['accept', 'send', 'open', 'travel'].includes(action) ? ' ui-btn--gold' : ''}" data-action="${action}"${focusKeyAttr(`${action}:${extra}`)} ${extra}${disabled ? ' disabled' : ''}>${label}</button>`;
const purposeKeys = {
  first_time: 'purposeFirstTime',
  relaxed: 'purposeRelaxed',
  clear: 'purposeClear',
  needs_help: 'purposeNeedsHelp',
} as const;
const countdown = (seconds: number) =>
  `${num(Math.floor(seconds / 60))}:${formatNumber(seconds % 60, { minimumIntegerDigits: 2, maximumFractionDigits: 0, useGrouping: false })}`;
const feedbackKeys = {
  accepted: 'outcomeAccepted',
  declined: 'outcomeDeclined',
  expired: 'outcomeExpired',
  cancelled: 'outcomeCancelled',
  closed: 'outcomeClosed',
} as const;

export class ExpeditionController {
  private readonly recruitment: RecruitmentController;
  private static mounted: ExpeditionController | null = null;
  private readonly events = new AbortController();
  private disposed = false;
  private lastWorld: IWorld | null = null;
  private root: HTMLElement | null = null;
  private bell: HTMLButtonElement | null = null;
  private badge: HTMLElement | null = null;
  private recruit: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private notice: HTMLElement | null = null;
  private open = false;
  private lastSig = '';
  private lastCountdownSig = '';
  private dismissedClaim: number | null = null;
  private selectedListing: number | null = null;
  private selectedRole: Role | null = null;
  private submittedListing: number | null = null;
  private submittedFeedbackSeq = 0;
  private opener: HTMLElement | null = null;
  private detailsDraft: ExpeditionDetails | null = null;
  private detailsListingId: number | null = null;
  private shopOpen = false;
  private section: 'alerts' | 'groups' = 'groups';
  private helperRoles: Role[] | null = null;
  private soundedRequests = new Set<number>();
  private soundedHelper = 0;
  private sound = false;
  private readFeedbackSeq = 0;
  private readHelperSeq = 0;
  private pulseAlternate = false;

  constructor(private readonly deps: ExpeditionDeps) {
    this.recruitment = new RecruitmentController({
      world: deps.world,
      maskPlayerText: deps.maskPlayerText,
      repaint: () => {
        this.lastSig = '';
        this.render();
      },
    });
    try {
      this.sound = localStorage.getItem('woc_expedition_sound') === '1';
    } catch {
      /* Storage can be disabled. */
    }
  }

  private mount(): void {
    if (this.root) return;
    ExpeditionController.mounted?.dispose();
    ExpeditionController.mounted = this;
    this.root = document.createElement('section');
    this.root.id = 'expedition-hud';
    this.root.innerHTML = `<div class="expedition-tools"><button type="button" id="expedition-bell" class="ui-icon-btn" aria-controls="expedition-panel" aria-expanded="false">${svgIcon('bell')}<span class="ui-badge ui-badge--corner" data-badge></span></button>${button('finder', text('findGroup'))}${button('recruit', text('recruitPlayers'))}<div data-run-status></div></div><div id="expedition-panel" class="ui-panel-strong" role="dialog" aria-modal="false" tabindex="-1" hidden></div><div data-expedition-notice class="ui-panel-strong" role="status" aria-live="polite" hidden></div>`;
    document.getElementById('ui')?.append(this.root);
    this.bell = this.root.querySelector<HTMLButtonElement>('#expedition-bell');
    this.badge = this.root.querySelector('[data-badge]');
    this.recruit = this.root.querySelector('.expedition-tools [data-action="recruit"]');
    this.panel = this.root.querySelector('#expedition-panel');
    this.status = this.root.querySelector('[data-run-status]');
    this.notice = this.root.querySelector('[data-expedition-notice]');
    this.root.addEventListener('click', (event) => this.click(event));
    this.root.addEventListener('compositionstart', (event) => this.recruitment.composition(event));
    this.root.addEventListener('compositionend', (event) => this.recruitment.composition(event));
    this.root.addEventListener('change', (event) => {
      if (this.recruitment.change(event)) return;
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-role]'))
        this.selectedRole = event.target.value as Role;
      if (
        event.target instanceof HTMLSelectElement &&
        event.target.matches('[data-purpose]') &&
        this.detailsDraft
      )
        this.detailsDraft.purpose = event.target.value as ExpeditionPurpose;
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-helper-role]')) {
        this.helperRoles = [
          ...this.root!.querySelectorAll<HTMLInputElement>('[data-helper-role]:checked'),
        ].map((el) => el.value as Role);
        if (this.deps.world().dungeonFinderInfo?.availability?.enabled)
          this.deps.world().dungeonFinderExpeditionConfigure({
            kind: 'available',
            enabled: this.helperRoles.length > 0,
            roles: this.helperRoles,
          });
        this.render();
      }
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-sound]')) {
        this.sound = event.target.checked;
        try {
          localStorage.setItem('woc_expedition_sound', this.sound ? '1' : '0');
        } catch {
          /* Keep the session choice. */
        }
        this.render();
      }
    });
    this.root.addEventListener('input', (event) => {
      if (this.recruitment.input(event)) return;
      if (
        event.target instanceof HTMLInputElement &&
        event.target.matches('[data-note]') &&
        this.detailsDraft
      )
        this.detailsDraft.note = event.target.value;
    });
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (this.open && event.target instanceof Node && !this.root?.contains(event.target))
          this.close();
      },
      { signal: this.events.signal },
    );
  }

  private dispose(): void {
    this.disposed = true;
    this.open = false;
    this.events.abort();
    this.deps.restoreFocus(null);
    this.root?.remove();
    this.root = null;
  }

  toggle(section: 'alerts' | 'groups' = 'groups'): void {
    if (this.disposed) return;
    this.mount();
    this.recruitment.close();
    if (this.open && this.section === section && !this.shopOpen) {
      this.close();
      return;
    }
    if (this.open && this.section === 'alerts' && section !== 'alerts') this.markAlertsRead();
    const wasOpen = this.open;
    if (!wasOpen) this.opener = this.deps.captureFocus();
    this.open = true;
    this.section = section;
    this.shopOpen = false;
    this.lastSig = '';
    this.render();
    if (!wasOpen) this.deps.focusFirst?.();
  }

  close(): boolean {
    if (!this.open) return false;
    if (this.section === 'alerts') this.markAlertsRead();
    this.open = false;
    this.recruitment.close();
    this.selectedListing = null;
    this.lastSig = '';
    this.render();
    this.deps.restoreFocus(this.opener);
    this.opener = null;
    return true;
  }

  private markAlertsRead(): void {
    this.readFeedbackSeq = this.deps.world().dungeonFinderInfo?.applicationFeedback?.seq ?? 0;
    this.readHelperSeq = this.deps.world().dungeonFinderInfo?.availability?.notice?.seq ?? 0;
  }

  relocalize(): void {
    this.lastSig = '';
    this.render();
  }

  render(): void {
    if (this.disposed) return;
    const world = this.deps.world();
    if (this.lastWorld && this.lastWorld !== world) {
      this.recruitment.reset();
      this.open = false;
      this.dismissedClaim = null;
      this.selectedListing = null;
      this.selectedRole = null;
      this.submittedListing = null;
      this.submittedFeedbackSeq = 0;
      this.detailsDraft = null;
      this.detailsListingId = null;
      this.shopOpen = false;
      this.section = 'groups';
      this.helperRoles = null;
      this.soundedRequests.clear();
      this.soundedHelper = 0;
      this.readFeedbackSeq = 0;
      this.readHelperSeq = 0;
      this.lastSig = '';
      this.deps.restoreFocus(null);
      this.opener = null;
    }
    this.lastWorld = world;
    this.recruitment.sync();
    const view = buildExpeditionView(
      world.dungeonFinderInfo,
      world.dungeonFinderBoard,
      world.playerId,
      world.partyInfo !== null,
      world.player.inCombat,
      this.dismissedClaim,
      world.partyInfo?.members.length ?? 1,
      world.partyInfo,
    );
    if (this.detailsListingId !== (view.myListing?.id ?? null)) this.detailsDraft = null;
    if (view.run?.open) this.dismissedClaim = view.run.exitId;
    const roleChoices = (
      this.helperRoles ??
      view.availability?.roles ??
      view.roles.slice(0, 1)
    ).filter((role) => view.roles.includes(role));
    const helperNotice = view.availability?.notice;
    if (
      this.submittedListing !== null &&
      (view.applications.some((app) => app.listingId === this.submittedListing) ||
        (view.feedback && view.feedback.seq !== this.submittedFeedbackSeq))
    )
      this.submittedListing = null;
    if (!view.inCombat) {
      const freshRequest = view.requests.some((r) => !this.soundedRequests.has(r.pid));
      const freshHelper =
        !!helperNotice?.listingIds.length && helperNotice.seq !== this.soundedHelper;
      if (freshRequest || freshHelper) this.pulseAlternate = !this.pulseAlternate;
      if (this.sound && (freshRequest || freshHelper)) this.deps.notify?.();
      this.soundedRequests = new Set(view.requests.map((r) => r.pid));
      if (helperNotice) this.soundedHelper = helperNotice.seq;
    }
    const sig = `${view.sig}|${this.open}|${this.section}|${this.selectedListing}|${this.selectedRole}|${this.submittedListing}|${this.shopOpen}|${!!this.detailsDraft}|${this.sound}|${roleChoices.join(',')}|${this.readFeedbackSeq}|${this.readHelperSeq}|${this.recruitment.signature()}`;
    const countdownSig = `${view.applications.map((a) => `${a.listingId}:${a.remaining}`).join(',')}|${view.requests.map((r) => `${r.pid}:${r.remaining}`).join(',')}`;
    if (sig === this.lastSig) {
      if (countdownSig !== this.lastCountdownSig) this.updateCountdowns(view);
      this.lastCountdownSig = countdownSig;
      return;
    }
    this.lastCountdownSig = countdownSig;
    this.lastSig = sig;
    this.mount();
    if (!this.panel || !this.bell || !this.badge || !this.status || !this.notice) return;
    const attention =
      view.requests.filter((request) => request.remaining !== 0).length +
      (view.feedback && view.feedback.seq !== this.readFeedbackSeq ? 1 : 0) +
      (helperNotice && helperNotice.seq !== this.readHelperSeq && helperNotice.listingIds.length
        ? 1
        : 0);
    this.deps.writers.setAttr(
      this.bell,
      'aria-label',
      t('hudChrome.expeditions.bell', {
        count: num(attention),
      }),
    );
    this.deps.writers.setText(this.badge, num(attention));
    if (this.recruit)
      this.deps.writers.setStyleProp(this.recruit, 'display', view.canRecruit ? '' : 'none');
    this.deps.writers.setStyleProp(this.badge, 'display', attention ? '' : 'none');
    this.deps.writers.toggleClass(this.bell, 'expedition-bell-alert', attention > 0);
    this.deps.writers.setAttr(this.bell, 'data-finish', view.queueRewards?.equipped ?? 'default');
    this.deps.writers.toggleClass(
      this.bell,
      'expedition-pulse-a',
      !view.inCombat && this.pulseAlternate,
    );
    this.deps.writers.toggleClass(
      this.bell,
      'expedition-pulse-b',
      !view.inCombat && !this.pulseAlternate && attention > 0,
    );
    this.deps.writers.setAttr(this.bell, 'aria-expanded', String(this.open));
    this.panel.hidden = !this.open;
    this.panel.setAttribute('aria-label', t('hudChrome.expeditions.title'));
    const focus = captureFocusKey(this.panel);
    const scroll = this.panel.querySelector('.expedition-cards')?.scrollLeft ?? 0;
    if (this.open && !this.recruitment.isComposing) {
      const draft = captureFormDraft(this.panel);
      const rulesOpen =
        this.panel.querySelector<HTMLDetailsElement>('[data-shop-rules]')?.open ?? false;
      this.panel.innerHTML = this.panelHtml(view);
      if (this.recruitment.isOpen) this.recruitment.restoreControls(this.panel);
      const rules = this.panel.querySelector<HTMLDetailsElement>('[data-shop-rules]');
      if (rules) rules.open = rulesOpen;
      restoreFormDraft(this.panel, draft);
      const purpose = this.panel.querySelector<HTMLSelectElement>('[data-purpose]');
      if (purpose && this.detailsDraft) purpose.value = this.detailsDraft.purpose;
      const role = this.panel.querySelector<HTMLSelectElement>('[data-role]');
      if (role && this.selectedRole) role.value = this.selectedRole;
      const cards = this.panel.querySelector('.expedition-cards');
      if (cards) cards.scrollLeft = scroll;
      if (focus)
        restoreFirstEnabled([
          findFocusKey(this.panel, focus),
          this.panel.querySelector<HTMLElement>(
            '[data-recruit-action="cancel"], .expedition-own button:not(:disabled)',
          ),
          this.bell,
        ]);
    }
    const statusFocus = captureFocusKey(this.status);
    this.status.innerHTML = view.run || view.recruitment ? this.runHtml(view) : '';
    if (statusFocus) restoreFirstEnabled([findFocusKey(this.status, statusFocus), this.bell]);
    const unreadFeedback =
      view.feedback && view.feedback.seq !== this.readFeedbackSeq && !view.inCombat;
    const unreadHelper =
      helperNotice &&
      helperNotice.seq !== this.readHelperSeq &&
      helperNotice.listingIds.length > 0 &&
      !view.inCombat;
    this.notice.hidden =
      this.open || (!view.prompt && !view.alert && !unreadFeedback && !unreadHelper);
    const noticeFocus = captureFocusKey(this.notice);
    this.notice.innerHTML = view.prompt
      ? `<h3>${text('entryTitle')}</h3><p>${text('entryBody')}</p><div class="expedition-actions">${button('solo', text('solo'))}${button('open', text('open'))}</div>`
      : view.alert
        ? this.requestHtml(view.alert)
        : unreadFeedback && view.feedback
          ? `<p>${text(feedbackKeys[view.feedback.outcome], { name: view.feedback.leaderName })}</p>${button('dismiss-feedback', text('dismiss'))}`
          : unreadHelper && helperNotice
            ? `<p>${text('helperFound', { count: num(helperNotice.listingIds.length) })}</p>${button('view-groups', text('viewGroups'))}`
            : '';
    if (noticeFocus) restoreFirstEnabled([findFocusKey(this.notice, noticeFocus), this.bell]);
  }

  private updateCountdowns(view: View): void {
    for (const el of this.root?.querySelectorAll<HTMLElement>('[data-deadline]') ?? []) {
      const seconds = el.dataset.deadline?.startsWith('application:')
        ? view.applications.find((a) => a.listingId === Number(el.dataset.deadline?.split(':')[1]))
            ?.remaining
        : view.requests.find((r) => r.pid === Number(el.dataset.deadline))?.remaining;
      if (seconds !== undefined)
        this.deps.writers.setText(
          el,
          t('hudChrome.expeditions.expires', { time: countdown(seconds) }),
        );
    }
  }

  private runHtml(view: View): string {
    const run = view.run;
    if (!run)
      return view.recruitment
        ? `<div class="expedition-run ui-chip"><span>${esc(dungeonDisplayName(view.recruitment.dungeonId))}</span>${view.myListing ? button('recruit', text('formingGroup')) : `<span>${text('formingGroup')}</span>`}</div>`
        : '';
    return `<div class="expedition-run ui-chip"><span>${esc(dungeonDisplayName(run.dungeonId))}</span>${run.isLeader && run.isInside && (run.open || view.canOpen) ? button(run.open ? 'close-run' : 'open', text(run.open ? 'closeRecruitment' : 'open')) : ''}${!run.isInside ? button('travel', text('travel'), '', !run.canTravel) : ''}</div>`;
  }

  private requestHtml(request: View['requests'][number]): string {
    return `<article class="expedition-request ui-well"><div class="expedition-request-person">${expeditionClassEmblem(request.cls)}<div><p>${text('request', { name: request.name, role: request.roles.map(roleText).join(', ') })}</p><p class="ui-meta">${text('level', { level: num(request.level) })}</p></div></div><div class="expedition-request-bottom">${request.remaining !== undefined ? `<p class="ui-meta" data-deadline="${request.pid}" aria-live="off">${text('expires', { time: countdown(request.remaining) })}</p>` : ''}<div class="expedition-actions">${button('accept', text('acceptPlayer'), `data-pid="${request.pid}"`, request.remaining === 0)}${button('decline', text('declinePlayer'), `data-pid="${request.pid}"`)}</div></div></article>`;
  }

  private nextStepHtml(view: View): string {
    if (view.recruitment)
      return `<div class="expedition-next ui-well"><strong>${text(view.myListing ? 'recruitmentNext' : 'groupGathering')}</strong>${view.myListing ? button('recruit', text('manageRecruitment')) : ''}</div>`;
    if (view.run && !view.run.isInside)
      return `<div class="expedition-next ui-well"><strong>${text('readyToTravel')}</strong>${button('travel', text('travel'), '', !view.run.canTravel)}</div>`;
    if (view.run)
      return `<div class="expedition-next ui-well"><strong>${text(view.run.open ? 'groupRecruiting' : 'groupInProgress')}</strong>${view.run.isLeader && !view.run.open && view.canOpen ? button('open', text('open')) : ''}</div>`;
    if (view.applications.length)
      return `<div class="expedition-next ui-well"><strong>${text('awaitingReply', { count: num(view.applications.length) })}</strong></div>`;
    if (this.submittedListing !== null)
      return `<div class="expedition-next ui-well" role="status"><strong>${text('requestSent')}</strong></div>`;
    if (view.grouped)
      return `<div class="expedition-next ui-well"><strong>${text(view.canRecruit ? 'groupChooseDungeon' : 'waitForLeader')}</strong>${view.canRecruit ? button('recruit', text('recruitPlayers')) : ''}</div>`;
    return `<div class="expedition-next ui-well"><strong>${text('findGroupNext')}</strong><div class="expedition-actions">${button('finder', text('findGroup'))}${button('recruit', text('recruitPlayers'))}</div></div>`;
  }

  private recruitmentHtml(view: View): string {
    const activity = view.recruitment;
    if (!activity) return '';
    const details = view.myListing?.details;
    const context = details
      ? `<div class="expedition-own-context"><span class="ui-chip">${text(purposeKeys[details.purpose])}</span>${details.note ? `<p class="expedition-note">${esc(this.deps.maskPlayerText?.(details.note) ?? details.note)}</p>` : ''}</div>`
      : '';
    const requests =
      view.inCombat && view.requests.length
        ? `<p>${text('requestsCombat')}</p>`
        : view.requests
            .filter((request) => request.remaining !== 0)
            .map((request) => this.requestHtml(request))
            .join('');
    return `${expeditionHero(activity.dungeonId, esc(dungeonDisplayName(activity.dungeonId)), text('formingGroup'))}<div class="expedition-own-body"><div class="expedition-seat-row"><span>${text('members', { current: num(view.groupSize), total: num(view.capacity) })}</span>${this.seatsHtml(view.groupSize, view.capacity)}</div><p class="ui-meta">${text('recruitmentNext')}</p>${context}${view.myListing ? `<div class="expedition-own-requests"><h4>${text('requestsCount', { count: num(view.requests.length) })}</h4>${requests || `<p class="ui-meta">${text('noRequests')}</p>`}</div>${this.detailsDraft ? this.detailsHtml() : ''}<div class="expedition-actions">${!this.detailsDraft ? button('edit-details', text('editDetails')) : ''}${button('recruit', text('manageRecruitment'))}${button('close-run', text('closeRecruitment'))}</div>` : ''}</div>`;
  }

  private alertsHtml(view: View): string {
    const feedback =
      view.feedback && view.feedback.seq !== this.readFeedbackSeq
        ? `<p class="expedition-feedback" role="status">${text(feedbackKeys[view.feedback.outcome], { name: view.feedback.leaderName })}</p>`
        : '';
    const helper =
      view.availability?.notice &&
      view.availability.notice.seq !== this.readHelperSeq &&
      view.availability.notice.listingIds.length
        ? `<p>${text('helperFound', { count: num(view.availability.notice.listingIds.length) })}</p>${button('browse', text('findGroup'))}`
        : '';
    const requests =
      view.inCombat && view.requests.length
        ? `<p>${text('requestsCombat')}</p>`
        : view.requests
            .filter((request) => request.remaining !== 0)
            .map((request) => this.requestHtml(request))
            .join('');
    return `<section class="expedition-alerts" aria-label="${text('alerts')}">${requests}${feedback}${helper}${requests || feedback || helper ? '' : `<p class="ui-meta">${text('noAlerts')}</p>`}</section>`;
  }

  private panelHtml(view: View): string {
    if (this.recruitment.isOpen) return this.recruitment.html();
    const requests = view.inCombat
      ? ''
      : view.requests.map((request) => this.requestHtml(request)).join('');
    const cards = view.otherGroups
      .map((group) => {
        const pending = !!group.application;
        const selected = group.id === this.selectedListing && !pending;
        const needed = group.needed
          ? Object.entries(group.needed)
              .filter(([, count]) => count > 0)
              .map(([role, count]) => `${roleText(role as Role)} ${num(count)}`)
              .join(' · ')
          : '';
        const choose = selected
          ? `<label class="expedition-role">${text('chooseRole')}<select class="ui-input" data-role ${focusKeyAttr(`role:${group.id}`)}>${view.roles.map((role) => `<option value="${role}"${role === this.selectedRole ? ' selected' : ''}>${esc(roleText(role))}</option>`).join('')}</select></label>${button('send', text('confirmRequest'), `data-listing="${group.id}"`)}${button('cancel-selection', text('cancel'))}`
          : pending
            ? `<p>${text('waiting', { name: group.application?.leaderName ?? group.leaderName })}</p>`
            : button(
                'request',
                text('chooseRoleAction'),
                `data-listing="${group.id}"`,
                !group.canApply || this.submittedListing === group.id,
              );
        const progress = group.expedition
          ? `${svgIcon('skull')}${text('progress', { defeated: num(group.expedition.bossesDefeated), total: num(group.expedition.bossesTotal) })}`
          : text('formingGroup');
        return `<article class="expedition-card ui-card-tile">${expeditionHero(group.dungeonId, esc(dungeonDisplayName(group.dungeonId)), esc(t(`hudChrome.finder.${group.difficulty}`)))}<div class="expedition-card-body"><div class="expedition-seat-row"><strong>${text('members', { current: num(group.size), total: num(group.capacity) })}</strong>${this.seatsHtml(group.size, group.capacity)}</div>${needed ? `<p class="expedition-needed">${text('needed', { roles: needed })}</p>` : ''}${group.details ? `<p class="expedition-purpose ui-chip">${text(purposeKeys[group.details.purpose])}</p>${group.details.note ? `<p class="expedition-note">${esc(this.deps.maskPlayerText?.(group.details.note) ?? group.details.note)}</p>` : ''}` : ''}<div class="expedition-card-secondary"><p class="expedition-leader">${svgIcon('crown')}${text('leader', { name: group.leaderName })}</p><p class="ui-meta expedition-card-progress">${progress}</p></div><div class="expedition-actions">${choose}</div></div></article>`;
      })
      .join('');
    const run = view.run;
    const canManage = !!run?.isLeader && run.open;
    const progress = run
      ? text('progress', { defeated: num(run.bossesDefeated), total: num(run.bossesTotal) })
      : '';
    const ownDetails = view.myListing?.details ?? view.currentGroup?.details;
    const ownContext = ownDetails
      ? `<div class="expedition-own-context"><span class="ui-chip">${text(purposeKeys[ownDetails.purpose])}</span>${ownDetails.note ? `<p class="expedition-note">${esc(this.deps.maskPlayerText?.(ownDetails.note) ?? ownDetails.note)}</p>` : ''}</div>`
      : '';
    const ownSummary = run
      ? `${expeditionHero(run.dungeonId, esc(dungeonDisplayName(run.dungeonId)), text(run.open ? 'recruitmentOpen' : 'recruitmentClosed'))}<div class="expedition-own-body"><div class="expedition-seat-row"><span class="ui-meta">${text('members', { current: num(view.groupSize), total: num(view.capacity) })}</span>${this.seatsHtml(view.groupSize, view.capacity)}</div><p class="ui-meta">${progress}</p><progress class="expedition-progress" value="${run.bossesDefeated}" max="${Math.max(1, run.bossesTotal)}" aria-label="${progress}"></progress>${ownContext}${view.partyMembers.length ? `<h4>${text('groupRoster')}</h4><div class="expedition-roster">${view.partyMembers.map((m) => `<span class="ui-chip expedition-member">${expeditionClassEmblem(m.cls)}${svgIcon(m.role === 'tank' ? 'tank' : m.role === 'healer' ? 'healer' : 'character', m.role ? { title: roleText(m.role) } : {})}<span class="expedition-member-name">${esc(m.name)}</span><span class="ui-meta">${text('level', { level: num(m.level) })}</span></span>`).join('')}</div>` : ''}${canManage ? `<div class="expedition-own-requests"><h4>${text('requestsCount', { count: num(view.requests.length) })}</h4>${view.inCombat && view.requests.length ? `<p>${text('requestsCombat')}</p>` : requests ? `<div class="expedition-requests">${requests}</div>` : `<p class="ui-meta">${text('noRequests')}</p>`}</div>` : ''}${canManage && this.detailsDraft ? this.detailsHtml() : ''}<div class="expedition-actions expedition-management">${canManage && !this.detailsDraft ? button('edit-details', text('editDetails')) : ''}${run.isLeader && run.isInside && (run.open || view.canOpen) ? button(run.open ? 'close-run' : 'open', text(run.open ? 'closeRecruitment' : 'open')) : ''}</div>${!run.isInside ? `<div class="expedition-actions">${button('travel', text('travel'), '', !run.canTravel)}</div>` : ''}</div>`
      : view.recruitment
        ? this.recruitmentHtml(view)
        : `<div class="expedition-own-empty">${svgIcon('social')}<p>${text(view.grouped ? 'formingGroup' : 'noCurrentGroup')}</p><p class="ui-meta">${text(view.grouped ? (view.canRecruit ? 'groupChooseDungeon' : 'waitForLeader') : 'noCurrentGroupHint')}</p>${view.canRecruit ? button('recruit', text('recruitPlayers')) : ''}</div>`;
    const ownPanel = `<section class="expedition-own ui-card-tile" aria-labelledby="expedition-own-title"><header class="expedition-zone-head"><img class="expedition-zone-art" src="/ui/chrome/crown.webp" alt="" decoding="async"><div><h3 id="expedition-own-title">${text('yourGroup')}</h3><p class="ui-meta">${text('manageGroup')}</p></div><span class="ui-badge">${num(view.requests.length)}</span></header>${ownSummary}</section>`;
    const pendingApplication = view.applications.length
      ? `<div class="expedition-pending-list"><h4>${text('pendingRequests', { count: num(view.applications.length) })}</h4>${view.applications.map((application) => `<section class="expedition-pending ui-card"><div><p>${text('waiting', { name: application.leaderName ?? '' })}</p>${application.remaining !== undefined ? `<p class="ui-meta" data-deadline="application:${application.listingId}" aria-live="off">${text('expires', { time: countdown(application.remaining) })}</p>` : ''}</div>${button('cancel-application', text('cancel'), `data-listing="${application.listingId}"`)}</section>`).join('')}</div>`
      : '';
    const feedback = view.feedback
      ? `<p class="expedition-feedback" role="status">${text(feedbackKeys[view.feedback.outcome], { name: view.feedback.leaderName })}</p>`
      : '';
    const otherPanel = `<section class="expedition-other ui-card" aria-labelledby="expedition-other-title"><header class="expedition-zone-head"><img class="expedition-zone-art" src="/ui/chrome/social.webp" alt="" decoding="async"><div><h3 id="expedition-other-title">${text('otherGroups')}</h3><p class="ui-meta">${text('browseGroups')}</p></div><span class="ui-chip">${num(view.otherGroups.length)}</span></header>${pendingApplication}${feedback}<p class="ui-meta">${text(view.applications.length >= FINDER_PLAYER_APPLICATION_CAP ? 'multiApplyLimit' : 'multiApplyHint')}</p><div class="expedition-cards">${cards || `<p class="expedition-other-empty">${text('empty')}</p>`}</div>${this.helperHtml(view)}</section>`;
    const tabs = `<nav class="expedition-tabs" aria-label="${text('sections')}">${button('show-alerts', text('alerts'), this.section === 'alerts' && !this.shopOpen ? 'aria-current="page"' : '')}${button('show-groups', text('groups'), this.section === 'groups' && !this.shopOpen ? 'aria-current="page"' : '')}${button('shop', text('rewards'), this.shopOpen ? 'aria-current="page"' : '')}</nav>`;
    const content = this.shopOpen
      ? expeditionShopHtml(view.queueRewards)
      : this.section === 'alerts'
        ? this.alertsHtml(view)
        : `<div class="expedition-counts"><span class="ui-chip">${text('groupsCount', { count: num(view.otherGroups.length) })}</span></div><div class="expedition-zones">${ownPanel}${otherPanel}</div><footer class="expedition-actions">${button('finder', text('finder'))}</footer>`;
    return `<header class="expedition-head"><div class="expedition-title"><img class="ui-win-art" src="/ui/chrome/dfinder.webp" alt="" decoding="async"><div><h2 class="ui-win-title">${text(this.shopOpen ? 'rewards' : this.section === 'alerts' ? 'alerts' : 'title')}</h2></div></div><div class="expedition-actions">${button('close-panel', text('close'))}</div></header>${this.nextStepHtml(view)}${tabs}${content}`;
  }

  private seatsHtml(size: number, capacity: number): string {
    return `<span class="expedition-seats" aria-hidden="true">${Array.from({ length: Math.min(5, Math.max(0, capacity)) }, (_, index) => `<span class="expedition-seat${index < size ? ' is-filled' : ''}">${svgIcon('character')}</span>`).join('')}</span>`;
  }

  private detailsHtml(): string {
    const d = this.detailsDraft!;
    return `<div class="expedition-details"><label>${text('purpose')}<select class="ui-input" data-purpose ${focusKeyAttr('purpose')}>${EXPEDITION_PURPOSES.map((p) => `<option value="${p}"${p === d.purpose ? ' selected' : ''}>${text(purposeKeys[p])}</option>`).join('')}</select></label><label>${text('note')}<input type="text" class="ui-input" id="expedition-note-draft" data-note maxlength="120" value="${esc(d.note)}" ${focusKeyAttr('note')}></label><div class="expedition-actions">${button('save-details', text('saveDetails'))}${button('cancel-details', text('cancel'))}</div></div>`;
  }

  private helperHtml(view: View): string {
    const selected = this.helperRoles ?? view.availability?.roles ?? view.roles.slice(0, 1);
    const enabled = view.availability?.enabled ?? false;
    return `<section class="expedition-helper"><h3>${text('helperRoles')}</h3><div class="expedition-actions">${view.roles.map((role) => `<label class="expedition-check"><input type="checkbox" data-helper-role value="${role}"${selected.includes(role) ? ' checked' : ''} ${focusKeyAttr(`helper:${role}`)}>${esc(roleText(role))}</label>`).join('')}${button('available', text(enabled ? 'stopHelping' : 'available'), '', !enabled && !selected.some((role) => view.roles.includes(role)))}</div>${enabled ? `<p class="ui-meta">${text(view.helperPaused ? 'helperPaused' : 'helperOn')}</p>` : ''}<label class="expedition-check"><input type="checkbox" data-sound${this.sound ? ' checked' : ''} ${focusKeyAttr('sound')}>${text('sound')}</label></section>`;
  }

  private click(event: MouseEvent): void {
    if (this.recruitment.click(event)) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#expedition-bell')) {
      this.toggle('alerts');
      return;
    }
    const target = event.target.closest<HTMLButtonElement>('[data-action]');
    if (!target || target.disabled) return;
    const world = this.deps.world();
    switch (target.dataset.action) {
      case 'dismiss-feedback':
        this.readFeedbackSeq = world.dungeonFinderInfo?.applicationFeedback?.seq ?? 0;
        break;
      case 'view-groups':
        this.toggle('groups');
        return;
      case 'browse':
        this.toggle('groups');
        return;
      case 'show-alerts':
        this.section = 'alerts';
        this.shopOpen = false;
        break;
      case 'show-groups':
        if (this.section === 'alerts') this.markAlertsRead();
        this.section = 'groups';
        this.shopOpen = false;
        break;
      case 'edit-details':
        this.detailsListingId = world.dungeonFinderInfo?.myListing?.id ?? null;
        this.detailsDraft = {
          ...(world.dungeonFinderInfo?.myListing?.details ?? { purpose: 'clear', note: '' }),
        };
        break;
      case 'save-details':
        if (this.detailsDraft)
          world.dungeonFinderExpeditionConfigure({
            kind: 'details',
            details: { ...this.detailsDraft },
          });
        this.detailsDraft = null;
        break;
      case 'cancel-details':
        this.detailsDraft = null;
        break;
      case 'available': {
        const roles = (
          this.helperRoles ??
          world.dungeonFinderInfo?.availability?.roles ??
          world.dungeonFinderInfo?.eligibleRoles.slice(0, 1) ??
          []
        ).filter((role) => world.dungeonFinderInfo?.eligibleRoles.includes(role));
        world.dungeonFinderExpeditionConfigure({
          kind: 'available',
          enabled: !world.dungeonFinderInfo?.availability?.enabled,
          roles,
        });
        break;
      }
      case 'shop':
        if (this.section === 'alerts') this.markAlertsRead();
        this.shopOpen = !this.shopOpen;
        break;
      case 'buy-reward':
      case 'equip-reward':
        world.dungeonFinderExpeditionConfigure({
          kind: 'reward',
          id: target.dataset.reward as QueueRewardId,
          buy: target.dataset.action === 'buy-reward',
        });
        break;
      case 'default-bell':
        world.dungeonFinderExpeditionConfigure({ kind: 'reward', id: null, buy: false });
        break;
      case 'close-panel':
        this.close();
        return;
      case 'finder':
        this.close();
        this.deps.openFinder();
        return;
      case 'recruit':
        if (!this.open) this.opener = this.deps.captureFocus();
        this.open = true;
        this.section = 'groups';
        this.shopOpen = false;
        if (!world.dungeonFinderInfo?.myListing && !world.dungeonFinderInfo?.expedition)
          this.recruitment.open();
        this.lastSig = '';
        this.render();
        this.deps.focusFirst?.();
        return;
      case 'solo':
        this.dismissedClaim = world.dungeonFinderInfo?.expedition?.exitId ?? null;
        break;
      case 'open':
        world.dungeonFinderExpeditionOpen();
        break;
      case 'close-run':
        world.dungeonFinderListingClose();
        break;
      case 'travel':
        world.dungeonFinderExpeditionTravel();
        break;
      case 'accept':
        world.dungeonFinderApplicationRespond(Number(target.dataset.pid), true);
        break;
      case 'decline':
        world.dungeonFinderApplicationRespond(Number(target.dataset.pid), false);
        break;
      case 'cancel-application':
        world.dungeonFinderExpeditionConfigure({
          kind: 'cancel_application',
          listingId: Number(target.dataset.listing),
        });
        break;
      case 'request':
        this.selectedListing = Number(target.dataset.listing);
        this.selectedRole = world.dungeonFinderInfo?.eligibleRoles[0] ?? null;
        break;
      case 'cancel-selection':
        this.selectedListing = null;
        break;
      case 'send': {
        const role = this.panel?.querySelector<HTMLSelectElement>('[data-role]')?.value as Role;
        if (world.dungeonFinderInfo?.eligibleRoles.includes(role)) {
          this.submittedListing = Number(target.dataset.listing);
          this.submittedFeedbackSeq = world.dungeonFinderInfo.applicationFeedback?.seq ?? 0;
          world.dungeonFinderExpeditionApply(this.submittedListing, role);
        }
        this.selectedListing = null;
        break;
      }
    }
    this.render();
    if (target.dataset.action === 'request')
      this.panel?.querySelector<HTMLSelectElement>('[data-role]')?.focus();
  }
}
