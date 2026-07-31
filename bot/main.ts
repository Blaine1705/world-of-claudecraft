// World of ClaudeCraft Discord bot.
//
// Two-way bridge between the game and the official Discord server:
//  - IN DISCORD: /whoami shows your link status, /link the connect instructions;
//    status-tier roles are synced from in-game reward points (missing roles are
//    auto-provisioned); member joins are recorded without a welcome message.
//  - INTO THE GAME: who is online + in the featured voice room is pushed to the
//    server, which surfaces it in the HUD Discord widget.
//
// Discord state (gateway/REST) lives entirely here; the game server stays the
// authority for rewards. Pure protocol/diff/embed logic is in ./logic (tested);
// this file is the wiring. esbuild-bundled for Node via `npm run bot`.

import { DISCORD_REWARD_GRANTS } from '../src/sim/discord_tier';
import { loadConfig } from './config';
import { DiscordApi, governorFromConfig } from './discord_api';
import { Gateway } from './gateway';
import {
  allTierRoleNames,
  buildActivityMessage,
  buildDailyRewardWinnersMessage,
  buildLevelNick,
  buildLinkContent,
  buildRelayMessage,
  buildWhoamiContent,
  clearDepartedFlair,
  clearedMemberMeta,
  computeRoleSync,
  GUILD_LARGE_THRESHOLD,
  indexSpecialRoleIds,
  isSlashCommand,
  type MemberMetaRecord,
  memberRolesFromPayload,
  type RawVoiceState,
  reconcileMemberRolesFromUpdate,
  rosterComplete,
  SLASH_COMMANDS,
  staleFlairedIds,
  tierRoleColor,
  topSpecialRoleKeyFor,
  voiceMembersForChannel,
} from './logic';
import {
  decideMemberUpdate,
  displayNameOf,
  nickOf,
  pushChangedMemberMeta,
  pushOneMemberMeta,
  writeMemberNickname,
} from './member_writes';
import { LoopScheduler } from './scheduler';
import { ServerClient, type VoiceMemberPush } from './server_client';

async function main(): Promise<void> {
  // Load .env (and optional .env.local) into process.env, matching server/db.ts.
  // Existing ambient env wins; missing file is fine (rely on the ambient env).
  try {
    process.loadEnvFile?.();
  } catch {
    /* no .env */
  }
  try {
    process.loadEnvFile?.('.env.local');
  } catch {
    /* no .env.local */
  }
  const cfg = loadConfig();
  // The knob-to-governor mapping lives in the shell (`governorFromConfig`) so a
  // test can pin it: nothing in this file is reachable from a test, because
  // `main()` is called at module scope. `undefined` keeps the production fetch.
  const governor = governorFromConfig(cfg);
  const discord = new DiscordApi(cfg.token, undefined, governor);
  const server = new ServerClient(cfg.gameServerUrl, cfg.botSecret);
  // Every background loop and the presence debounce run on this one scheduler; the
  // tasks themselves are registered further down, next to the work they drive.
  const scheduler = new LoopScheduler();

  await discord.registerGuildCommands(cfg.clientId, cfg.guildId, [...SLASH_COMMANDS]);

  // Resolve the status-tier role ids by name (WoC Initiate ... WoC Mythic).
  // tierRoleIds maps a 1-based rung index to its role id.
  const tierRoleIds = new Map<number, string>();
  const refreshTierRoles = async (): Promise<void> => {
    const roles = await discord.guildRoles(cfg.guildId);
    const names = allTierRoleNames();
    names.forEach((name, i) => {
      const role = roles.find((r) => r.name === name);
      if (role) tierRoleIds.set(i + 1, role.id);
    });
  };

  // Auto-provision any missing WoC tier roles (needs MANAGE_ROLES). Idempotent:
  // only creates the rungs not already present, then re-resolves the id map. If
  // the bot lacks permission this logs and the missing rungs are simply skipped.
  const ensureTierRoles = async (): Promise<void> => {
    const existing = new Set((await discord.guildRoles(cfg.guildId)).map((r) => r.name));
    const missing = allTierRoleNames()
      .map((name, i) => ({ name, index: i + 1 }))
      .filter((r) => !existing.has(r.name));
    for (const { name, index } of missing) {
      try {
        await discord.createGuildRole(cfg.guildId, name, tierRoleColor(index));
        console.log(`[bot] created status-tier role ${name}`);
      } catch (e) {
        console.error(`[bot] could not create role ${name} (need MANAGE_ROLES):`, e);
      }
    }
    if (missing.length) await refreshTierRoles();
  };

  await ensureTierRoles();
  await refreshTierRoles();

  // Resolve the staff/special roles (every catalog entry, staff and community
  // alike, matched by name or alias so guild-side renames keep matching), so each
  // member's top special role can be pushed to the game (name color + tag). The
  // index maps guild role id -> special-role key: ALL matching ids are kept (both
  // an `Admin` and an `Admins` role map to key `admin`), so a holder of EITHER
  // resolves. Rebuilt on each refresh from the live guild roles.
  let specialRoleIndex = new Map<string, string>();
  const refreshSpecialRoles = async (): Promise<void> => {
    specialRoleIndex = indexSpecialRoleIds(await discord.guildRoles(cfg.guildId));
  };
  await refreshSpecialRoles();

  // The highest-priority special role a member holds, or null.
  const topSpecialRoleKey = (roleIds: readonly string[]): string | null =>
    topSpecialRoleKeyFor(roleIds, specialRoleIndex);

  // ── in-memory guild state (seeded by GUILD_CREATE, kept fresh by events) ─────
  const voiceStates = new Map<string, RawVoiceState>();
  const memberNames = new Map<string, string>();
  const memberRoles = new Map<string, string[]>();
  const memberJoined = new Map<string, number>(); // userId -> guild join epoch ms
  const onlineUsers = new Set<string>();
  // The member's RAW `nick` field, null when they have none. Deliberately not
  // memberNames: displayNameOf collapses nick, global_name and username into one
  // string, so it cannot tell "the nick is exactly X" from "there is no nick and
  // the global name happens to be X". The nickname PATCH's precondition is about
  // the nick field specifically, so the diff needs the field itself (D5).
  const memberNicks = new Map<string, string | null>();
  // The nick this bot last successfully PATCHed, per member. Only used to
  // recognize our own GUILD_MEMBER_UPDATE echo coming back.
  const lastWrittenNick = new Map<string, string>();
  // The members-meta record we last successfully PUSHED, per member. Written only
  // after the server accepted it, so a failed push retries on the next sweep.
  const lastPushedMeta = new Map<string, MemberMetaRecord>();
  // The three caches a nickname write reads and, on success only, updates.
  const nickCaches = { memberNicks, memberNames, lastWrittenNick };
  const metaIo = {
    pushMembersMeta: (records: MemberMetaRecord[]) => server.pushMembersMeta(records),
  };
  let voiceChannelName: string | null = null; // resolved from GUILD_CREATE channels
  let memberTotal = 0; // total guild members (from GUILD_CREATE member_count)
  let announced = false; // guards the one-time startup announcement post
  const nameOf = (userId: string): string => memberNames.get(userId) ?? 'Member';

  // Upsert one member (from a GUILD_CREATE member, a GUILD_MEMBER_ADD, or a
  // GUILD_MEMBERS_CHUNK entry) into the name/role/join caches. Returns the user
  // id, or '' when the payload has no user id.
  const upsertMemberFromPayload = (m: Record<string, unknown>): string => {
    const u = (m.user ?? {}) as Record<string, unknown>;
    const id = String(u.id ?? '');
    if (!id) return '';
    memberNames.set(id, displayNameOf(m, u));
    memberNicks.set(id, nickOf(m));
    memberRoles.set(id, memberRolesFromPayload(m));
    const joined = typeof m.joined_at === 'string' ? Date.parse(m.joined_at) : NaN;
    if (Number.isFinite(joined)) memberJoined.set(id, joined);
    return id;
  };

  // The presence push is debounced on the scheduler (a `debounce` task runs one
  // full window after the first kick and folds every kick in that window into it),
  // so this is now just the kick. The task itself is registered below, beside the
  // poll loops, because that is where every cadence in this file lives.
  const schedulePresencePush = (): void => {
    presenceTask.kick();
  };
  const pushPresence = async (): Promise<void> => {
    const voice: VoiceMemberPush[] = cfg.voiceChannelId
      ? voiceMembersForChannel([...voiceStates.values()], cfg.voiceChannelId, nameOf)
      : [];
    await server.pushPresence({
      onlineCount: onlineUsers.size,
      memberTotal,
      voiceChannelName: cfg.voiceChannelId ? (voiceChannelName ?? 'Voice') : null,
      voice,
    });
  };
  // A `debounce` task, which is the presenceTimer guard this replaces expressed on
  // the scheduler: the first kick opens one window, every kick inside it folds in,
  // and the push runs once at the end. The scheduler adds what the raw timer had
  // no notion of, an overlap guard, so a burst arriving during a slow push can no
  // longer start a second one beside it.
  const presenceTask = scheduler.add({
    name: 'presence-push',
    mode: 'debounce',
    cadence: { activeMs: cfg.presenceDebounceMs },
    run: () => pushPresence(),
  });

  // ── slash command handling ───────────────────────────────────────────────────
  const handleInteraction = async (d: Record<string, unknown>): Promise<void> => {
    // The relay "Respond" button is a link button (opens the game deep link), so it
    // never round-trips here; only APPLICATION_COMMANDs do.
    if (d.type !== 2) return;
    const data = (d.data ?? {}) as Record<string, unknown>;
    const name = String(data.name ?? '');
    if (!isSlashCommand(name)) return;
    const interactionId = String(d.id ?? '');
    const token = String(d.token ?? '');
    const member = (d.member ?? {}) as Record<string, unknown>;
    const user = (member.user ?? {}) as Record<string, unknown>;
    const userId = String(user.id ?? '');

    // /link needs no server round-trip, so reply immediately (ephemeral).
    if (name === 'link') {
      await discord.respondInteraction(interactionId, token, {
        content: buildLinkContent(cfg.gameUrl),
        flags: 64, // ephemeral
      });
      return;
    }
    // /whoami hits the game server, which can be slow, so DEFER first (acks within
    // Discord's 3s deadline) then edit the deferred reply.
    await discord.deferInteraction(interactionId, token, true /* ephemeral */);
    if (name === 'whoami') {
      const roles = (await server.roles(userId)) ?? {
        linked: false,
        statusTier: 0,
        points: 0,
        lifetimePoints: 0,
      };
      await discord.editOriginalResponse(cfg.clientId, token, {
        content: buildWhoamiContent(roles),
      });
    }
  };

  // ── role sync (poll the server for online linked members) ────────────────────
  const syncRolesFor = async (userId: string): Promise<void> => {
    // One flex read drives both the status-tier roles AND the level-on-name nick.
    const flex = await server.flex(userId);
    if (!flex?.linked) return;
    const { toAdd, toRemove } =
      tierRoleIds.size > 0
        ? computeRoleSync({
            tier: flex.statusTier,
            memberRoleIds: memberRoles.get(userId) ?? [],
            tierRoleIds,
          })
        : { toAdd: [] as string[], toRemove: [] as string[] };
    // Only update the cached role set when the Discord API call actually
    // succeeds, so a failed add/remove is retried on the next sync (not masked
    // by a cache that wrongly claims success).
    for (const roleId of toAdd) {
      try {
        await discord.addMemberRole(cfg.guildId, userId, roleId);
        memberRoles.set(userId, [...(memberRoles.get(userId) ?? []), roleId]);
      } catch (e) {
        console.error(e);
      }
    }
    for (const roleId of toRemove) {
      try {
        await discord.removeMemberRole(cfg.guildId, userId, roleId);
        memberRoles.set(
          userId,
          (memberRoles.get(userId) ?? []).filter((r) => r !== roleId),
        );
      } catch (e) {
        console.error(e);
      }
    }
    // Attach the in-game level + class icon to the member's Discord nickname.
    // The base name fallback can be the member's already-suffixed live nick
    // (flex.username is null for older links), so buildLevelNick strips any
    // existing suffix first to stay idempotent across re-syncs.
    if (cfg.syncNicknames && flex.character) {
      const base = flex.username ?? memberNames.get(userId) ?? 'Member';
      const nick = buildLevelNick(base, flex.character.level, flex.character.class);
      // D5: only PATCH when the computed nick actually differs from the nick we
      // last observed. This is the incident's biggest single source of load: the
      // write was unconditional, so every linked online member was PATCHed every
      // sweep forever, and each PATCH made Discord emit a GUILD_MEMBER_UPDATE that
      // the handler below turned into a members-meta POST back into the game.
      await writeMemberNickname(userId, nick, nickCaches, {
        setNickname: (id, value) => discord.setNickname(cfg.guildId, id, value),
        onError: (e) => console.error('[bot] setNickname failed', e),
      });
    }
  };
  const syncAllOnlineRoles = async (): Promise<void> => {
    for (const userId of onlineUsers) await syncRolesFor(userId);
  };

  // ── gateway dispatch ─────────────────────────────────────────────────────────
  const gateway = new Gateway(cfg.token, await discord.gatewayUrl(), {
    onDispatch(type, d) {
      switch (type) {
        case 'GUILD_CREATE': {
          if (String(d.id ?? '') !== cfg.guildId) return;
          seedGuild(d);
          // Guilds larger than large_threshold omit offline members from
          // GUILD_CREATE; backfill the full member list (op 8) so offline holders
          // of a special role (e.g. Admins) are known. Chunks arrive as
          // GUILD_MEMBERS_CHUNK dispatches, which re-push member meta and run the
          // departed-member reconcile when done. A small guild's GUILD_CREATE is
          // already the complete roster, so it reconciles right away.
          if (memberTotal > GUILD_LARGE_THRESHOLD) gateway.requestGuildMembers(cfg.guildId);
          else void reconcileDepartedMembers().catch((e) => console.error(e));
          schedulePresencePush();
          // Sync tier roles for everyone online right away, so a freshly linked
          // member's role matches their points without waiting for the poll, and
          // push member join dates + staff roles so the game shows member-since +
          // role color/tag for linked players.
          //
          // Both are KICKS rather than bare calls now, which is the GUILD_CREATE
          // trap: Discord re-sends GUILD_CREATE on every re-IDENTIFY, so a
          // reconnect storm delivers a burst of them, and a burst of fire-and-
          // forget sweeps is how a blip became a sustained storm. Kicks against an
          // in-flight sweep collapse into exactly one follow-up.
          roleSyncTask.kick();
          memberMetaTask.kick();
          // One-time "bot online" announcement so the integration is visibly live.
          if (cfg.testChannelId && !announced) {
            announced = true;
            void discord
              .createMessage(cfg.testChannelId, {
                content: `:satellite: World of ClaudeCraft bot online and connected. Two-way sync active. Try \`/whoami\` or \`/link\`. Play at ${cfg.gameUrl}`,
              })
              .catch((e) => console.error('[bot] startup announce failed', e));
          }
          break;
        }
        case 'VOICE_STATE_UPDATE': {
          const userId = String(d.user_id ?? '');
          if (!userId) return;
          const channelId = typeof d.channel_id === 'string' ? d.channel_id : null;
          if (channelId === null) voiceStates.delete(userId);
          else {
            voiceStates.set(userId, { userId, channelId, selfMute: d.self_mute === true });
            grantDailyActive(userId); // joining voice counts as daily engagement
          }
          schedulePresencePush();
          break;
        }
        case 'PRESENCE_UPDATE': {
          const u = (d.user ?? {}) as Record<string, unknown>;
          const userId = String(u.id ?? '');
          if (!userId) return;
          if (d.status === 'offline' || d.status === undefined) onlineUsers.delete(userId);
          else onlineUsers.add(userId);
          schedulePresencePush();
          break;
        }
        case 'GUILD_MEMBER_ADD': {
          if (String(d.guild_id ?? '') !== cfg.guildId) return;
          // Cache the joiner's name, roles, and join date so their flair resolves
          // and their meta can be pushed without waiting for a restart/re-seed.
          const userId = upsertMemberFromPayload(d);
          if (!userId) return;
          // Mark membership + grant the member reward (server dedupes). No channel
          // welcome message is posted (intentionally quiet).
          void server.setMember(userId, true);
          void pushMemberMeta(userId).catch((e) => console.error(e));
          break;
        }
        case 'GUILD_MEMBER_UPDATE': {
          // A member's roles changed live (e.g. the Admins role was granted).
          // Replace the cached role set and re-push their meta so the new flair
          // shows in game without a bot restart or the periodic re-seed.
          if (String(d.guild_id ?? '') !== cfg.guildId) return;
          const u = (d.user ?? {}) as Record<string, unknown>;
          const userId = String(u.id ?? '');
          if (!userId) return;
          // Judged BEFORE the caches move, which is why the decision is computed
          // in one place rather than inline: the question is whether this update
          // tells us anything we did not already write ourselves (D5), and that
          // is only answerable against the OLD cached roles.
          const decision = decideMemberUpdate(
            d,
            u,
            { roles: memberRoles.get(userId) ?? [], lastWrittenNick: lastWrittenNick.get(userId) },
            { roles: reconcileMemberRolesFromUpdate, displayName: displayNameOf },
          );
          if (decision.roles) memberRoles.set(userId, decision.roles);
          // The update may also carry a changed nick/global_name.
          memberNames.set(userId, decision.displayName);
          memberNicks.set(userId, decision.nick);
          if (!decision.push) break;
          void pushMemberMeta(userId).catch((e) => console.error(e));
          break;
        }
        case 'GUILD_MEMBER_REMOVE': {
          // A member left (or was removed). Clear their server-side membership flag
          // and stored flair (guildMember: false + a null-role meta record) so
          // their in-game verified/staff tag is dropped promptly, THEN drop them
          // from every in-memory cache.
          if (String(d.guild_id ?? '') !== cfg.guildId) return;
          const u = (d.user ?? {}) as Record<string, unknown>;
          const userId = String(u.id ?? '');
          if (!userId) return;
          void server.setMember(userId, false);
          // A cleared record IS a change, so this push is unconditional: the diff
          // above must never suppress it.
          void server
            .pushMembersMeta([clearedMemberMeta(userId)])
            .catch((e) => console.error('[bot] clear member meta failed', e));
          memberRoles.delete(userId);
          memberNames.delete(userId);
          memberJoined.delete(userId);
          voiceStates.delete(userId);
          onlineUsers.delete(userId);
          // Drop the diff caches too, or a member who leaves and rejoins would be
          // compared against their pre-departure record and never re-pushed.
          memberNicks.delete(userId);
          lastWrittenNick.delete(userId);
          lastPushedMeta.delete(userId);
          break;
        }
        case 'GUILD_MEMBERS_CHUNK': {
          // Backfill response to REQUEST_GUILD_MEMBERS (op 8): each chunk carries a
          // batch of members (incl. offline). Upsert them, apply any presences,
          // then push everyone's meta after the final chunk.
          if (String(d.guild_id ?? '') !== cfg.guildId) return;
          for (const m of asArray(d.members)) upsertMemberFromPayload(m);
          for (const p of asArray(d.presences)) {
            const pu = (p.user ?? {}) as Record<string, unknown>;
            const pid = String(pu.id ?? '');
            if (!pid) continue;
            if (p.status && p.status !== 'offline') onlineUsers.add(pid);
            else onlineUsers.delete(pid);
          }
          const idx = typeof d.chunk_index === 'number' ? d.chunk_index : 0;
          const count = typeof d.chunk_count === 'number' ? d.chunk_count : 1;
          if (idx >= count - 1) {
            // Same coalescing reason as GUILD_CREATE: a reconnect re-runs the whole
            // op 8 backfill, so the final chunk arrives once per reconnect.
            memberMetaTask.kick();
            void reconcileDepartedMembers().catch((e) => console.error(e));
          }
          break;
        }
        case 'MESSAGE_CREATE': {
          // Chatting in the server is daily engagement (ignore bots/webhooks).
          if (String(d.guild_id ?? '') !== cfg.guildId) return;
          const author = (d.author ?? {}) as Record<string, unknown>;
          if (author.bot === true) return;
          grantDailyActive(String(author.id ?? ''));
          break;
        }
        case 'INTERACTION_CREATE':
          void handleInteraction(d).catch((e) => console.error('[bot] interaction error', e));
          break;
        default:
          break;
      }
    },
  });

  function seedGuild(d: Record<string, unknown>): void {
    if (typeof d.member_count === 'number') memberTotal = d.member_count;
    for (const ch of asArray(d.channels)) {
      if (String(ch.id ?? '') === cfg.voiceChannelId && typeof ch.name === 'string') {
        voiceChannelName = ch.name;
      }
    }
    for (const m of asArray(d.members)) upsertMemberFromPayload(m);
    for (const v of asArray(d.voice_states)) {
      const id = String(v.user_id ?? '');
      const channelId = typeof v.channel_id === 'string' ? v.channel_id : null;
      if (id && channelId)
        voiceStates.set(id, { userId: id, channelId, selfMute: v.self_mute === true });
    }
    for (const p of asArray(d.presences)) {
      const u = (p.user ?? {}) as Record<string, unknown>;
      const id = String(u.id ?? '');
      if (id && p.status && p.status !== 'offline') onlineUsers.add(id);
    }
  }

  // One members-meta record: nickname + guild join date + top special role.
  const memberMetaRecord = (id: string) => ({
    discord_user_id: id,
    name: memberNames.get(id) ?? null, // server nickname (nick > global > username)
    joinedAtMs: memberJoined.get(id) ?? null,
    role: topSpecialRoleKey(memberRoles.get(id) ?? []),
  });

  // Push every known member's guild join date + top special role to the game, so
  // linked players show "member since" + a colored role tag/name in world. The
  // server caps each request, so batch the full roster into successive requests
  // (a large-guild backfill streams well past a single cap; capping the total
  // would leave every member past the cutoff without meta).
  const pushAllMemberMeta = async (): Promise<void> => {
    // D5: only members whose record actually moved since the last SUCCESSFUL push.
    // In steady state that is nobody, so a sweep sends no request at all; the
    // byte-batching still applies to whatever is left.
    await pushChangedMemberMeta(
      [...memberRoles.keys()].map(memberMetaRecord),
      lastPushedMeta,
      metaIo,
    );
  };

  // Push a single member's meta (used when a live role change re-resolves their
  // flair), so a role grant/removal reflects in game without waiting for the poll.
  const pushMemberMeta = async (id: string): Promise<void> => {
    if (!id || !memberRoles.has(id)) return;
    await pushOneMemberMeta(memberMetaRecord(id), lastPushedMeta, metaIo);
  };

  // Members who left while the bot was OFFLINE never fire GUILD_MEMBER_REMOVE,
  // so their stored membership flag + role key would stay stale forever. After a
  // COMPLETE roster seed (small-guild GUILD_CREATE, or the final op 8 chunk),
  // diff the server's flagged ids against the live roster and clear exactly the
  // departed ones (clearDepartedFlair owns the ordering, batching, and the
  // re-observed-member skip; it is unit-tested with fake IO). A server fetch
  // failure (null) changes nothing.
  const reconcileDepartedMembers = async (): Promise<void> => {
    if (!rosterComplete(memberRoles.size, memberTotal)) return;
    const flagged = await server.flairedIds();
    if (!flagged) return;
    const stale = staleFlairedIds(flagged, new Set(memberRoles.keys()));
    await clearDepartedFlair(stale, (id) => memberRoles.has(id), {
      // Same rejoin reasoning as GUILD_MEMBER_REMOVE: once a member's stored flair
      // is cleared, their last-pushed record no longer describes server state, so
      // it must not be left behind to suppress a later push.
      pushMembersMeta: async (records) => {
        const pushed = await server.pushMembersMeta(records);
        for (const record of records) lastPushedMeta.delete(record.discord_user_id);
        return pushed;
      },
      setMember: (id, guildMember) => server.setMember(id, guildMember),
    });
  };

  // Daily Discord-engagement reward: the first time a linked member posts a message
  // or joins voice each day, grant the daily-active points. Deduped here (per user
  // per day) AND server-side (the grant dedupe key), so it is exactly-once.
  const dailyActiveSeen = new Set<string>(); // `${userId}:${YYYY-MM-DD}`
  const grantDailyActive = (userId: string): void => {
    if (!userId) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `${userId}:${day}`;
    if (dailyActiveSeen.has(key)) return;
    dailyActiveSeen.add(key);
    const g = DISCORD_REWARD_GRANTS.dailyActive;
    void server
      .grant(userId, g.reason, g.points, `${g.reason}:${userId}:${day}`)
      .catch((e) => console.error('[bot] daily-active grant failed', e));
  };

  // Drain + deliver queued in-game "!" community posts (LFG etc.) to the relay
  // channel as rich embeds with a "respond in game" button.
  const pollRelay = async (): Promise<void> => {
    if (!cfg.relayChannelId) return;
    const items = await server.drainRelay();
    for (const item of items) {
      await discord
        .createMessage(cfg.relayChannelId, buildRelayMessage(item, cfg.gameUrl))
        .catch((e) => console.error('[bot] relay post failed', e));
    }
  };

  // Drain + post the significant-activity feed (level-ups, rare drops, duels, arena).
  const pollActivity = async (): Promise<void> => {
    if (!cfg.activityChannelId) return;
    const items = await server.drainActivity();
    for (const item of items) {
      await discord
        .createMessage(cfg.activityChannelId, buildActivityMessage(item))
        .catch((e) => console.error('[bot] activity post failed', e));
    }
  };

  let dailyRewardsChannelMissingLogged = false;
  const pollDailyRewardWinners = async (): Promise<void> => {
    if (!cfg.dailyRewardsChannelId) {
      if (!dailyRewardsChannelMissingLogged) {
        console.error(
          '[bot] missing DISCORD_DAILY_REWARDS_CHANNEL_ID; skipping daily rewards winner announcements',
        );
        dailyRewardsChannelMissingLogged = true;
      }
      return;
    }
    const days = await server.dailyRewardWinners();
    for (const day of days) {
      try {
        await discord.createMessage(cfg.dailyRewardsChannelId, buildDailyRewardWinnersMessage(day));
        await server.markDailyRewardWinners(day.day);
      } catch (e) {
        console.error('[bot] daily rewards winners post failed', e);
      }
    }
  };

  // ── background loops ─────────────────────────────────────────────────────────
  // Every cadence in this file lives here, on one scheduler. These were six bare
  // repeating timers, which fire on a fixed rhythm whether or not the previous run
  // has finished: once a sweep ran long the next started anyway, the two contended
  // for the same Discord buckets, and a slow minute became a storm that outlived
  // restarts. The scheduler chains each delay after the previous run SETTLES, so
  // overlap is impossible by construction, and jitters them so six loops armed in
  // one boot do not stay phase-locked on the same tick.
  //
  // Which function runs, and what it does, is unchanged. Only the mechanism is
  // new: the intervals are the same values (now D13 env-overridable, defaulting to
  // exactly today's numbers), and the special-roles refresh still runs immediately
  // before the roster push rather than beside it.
  const roleSyncTask = scheduler.add({
    name: 'role-sync',
    cadence: { activeMs: cfg.roleSyncIntervalMs },
    run: () => syncAllOnlineRoles(),
  });
  scheduler.add({
    name: 'tier-roles',
    cadence: { activeMs: cfg.roleSyncIntervalMs },
    run: () => refreshTierRoles(),
  });
  scheduler.add({ name: 'relay', cadence: { activeMs: cfg.relayPollMs }, run: () => pollRelay() });
  scheduler.add({
    name: 'activity',
    cadence: { activeMs: cfg.relayPollMs },
    run: () => pollActivity(),
  });
  scheduler.add({
    name: 'daily-rewards-winners',
    cadence: { activeMs: cfg.relayPollMs },
    run: () => pollDailyRewardWinners(),
  });
  const memberMetaTask = scheduler.add({
    name: 'special-roles-and-meta',
    cadence: { activeMs: cfg.roleSyncIntervalMs },
    // The pairing is the point, and it is ordered: the roster push reads the
    // special-role index the refresh rebuilds, so a push that ran first would
    // publish the PREVIOUS sweep's role flair. An awaited pair also means a failed
    // refresh skips the push entirely, exactly as the chained form it replaces did.
    run: async () => {
      await refreshSpecialRoles();
      await pushAllMemberMeta();
    },
  });

  gateway.connect(false);
  scheduler.startAll();
  console.log('[bot] World of ClaudeCraft Discord bot started');
}

// ── small helpers ──────────────────────────────────────────────────────────────
function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

main().catch((err) => {
  console.error('[bot] fatal', err);
  process.exit(1);
});
