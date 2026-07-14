import { t } from './i18n';

export type PlayerContextActionId =
  | 'whisper'
  | 'invite'
  | 'friend'
  | 'unfriend'
  | 'ginvite'
  | 'ignore'
  | 'report'
  | 'close';

export interface PlayerContextAction<TId extends string = PlayerContextActionId> {
  id: TId;
  label: string;
}

export interface ChatPlayerContextState {
  playerName: string;
  selfName: string;
  online: boolean;
  isFriend: boolean;
  ignored: boolean;
  canGuildInvite: boolean;
  alreadyGuilded: boolean;
  canReport: boolean;
}

export type SelfPlayerContextActionId =
  | 'convert-raid'
  | 'convert-party'
  | 'loot-settings'
  | 'leave-party'
  | 'dungeon-difficulty'
  | 'close';

export interface SelfPlayerContextState {
  inParty: boolean;
  isLeader: boolean;
  isRaid: boolean;
  partySize: number;
  isHeroic: boolean;
}

/** Build the classic player-portrait menu. Party membership owns the Leave Party
 * action here, rather than a permanent button beneath the compact unit frames. */
export function selfPlayerContextActions(
  state: SelfPlayerContextState,
): PlayerContextAction<SelfPlayerContextActionId>[] {
  const actions: PlayerContextAction<SelfPlayerContextActionId>[] = [];
  if (state.inParty && state.isLeader && !state.isRaid && state.partySize >= 5) {
    actions.push({ id: 'convert-raid', label: t('hud.chat.context.convertToRaid') });
  }
  if (state.inParty && state.isLeader && state.isRaid && state.partySize <= 5) {
    actions.push({ id: 'convert-party', label: t('hud.chat.context.convertToParty') });
  }
  if (state.inParty) {
    actions.push({ id: 'loot-settings', label: t('hudChrome.lootSettings.menuItem') });
    actions.push({ id: 'leave-party', label: t('hud.social.leaveParty') });
  }
  if (!state.inParty || state.isLeader) {
    actions.push({
      id: 'dungeon-difficulty',
      label: t(
        state.isHeroic
          ? 'hudChrome.dungeonDifficulty.setNormal'
          : 'hudChrome.dungeonDifficulty.setHeroic',
      ),
    });
  }
  actions.push({ id: 'close', label: t('hud.chat.context.cancel') });
  return actions;
}

export function chatPlayerContextActions(state: ChatPlayerContextState): PlayerContextAction[] {
  const samePlayer = state.playerName.toLowerCase() === state.selfName.toLowerCase();
  const actions: PlayerContextAction[] = [];

  if (!samePlayer) {
    actions.push({ id: 'whisper', label: t('hud.chat.context.whisper') });
    actions.push({ id: 'invite', label: t('hud.chat.context.invite') });
    if (state.online) {
      actions.push({
        id: state.isFriend ? 'unfriend' : 'friend',
        label: state.isFriend
          ? t('hud.chat.context.removeFriend')
          : t('hud.chat.context.addFriend'),
      });
    }
    if (state.canGuildInvite && !state.alreadyGuilded)
      actions.push({ id: 'ginvite', label: t('hud.chat.context.inviteGuild') });
    actions.push({
      id: 'ignore',
      label: state.ignored
        ? state.online
          ? t('hud.chat.context.unignore')
          : t('hud.chat.context.unignoreChat')
        : state.online
          ? t('hud.chat.context.ignore')
          : t('hud.chat.context.ignoreChat'),
    });
    if (state.canReport) actions.push({ id: 'report', label: t('hud.chat.context.report') });
  }

  actions.push({ id: 'close', label: t('hud.chat.context.cancel') });
  return actions;
}
