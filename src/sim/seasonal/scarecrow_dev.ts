// /dev scarecrow: Old Thatchgrin playtests and captures (ALLOW_DEV_COMMANDS only: reached
// through handleDevChat behind the ctx.devCommands gate, like every /dev branch, so none of
// this exists in production).
//
//   /dev scarecrow            open Gourdlight Eve if it is closed, stand him up now if his
//                             field is empty, and put you twenty yards in front of him
//   /dev scarecrow gourd      he throws a Kindled Gourd now (he must be in a fight)
//   /dev scarecrow call       his next call (crows or strawlings) starts now
//   /dev scarecrow reset      clear him and stand him up fresh at full health
//   /dev scarecrow lockout    forget your daily spoils lockout, so his corpse pays you again
import { GOURDLIGHT_EVE_ID } from '../content/gourdlight_eve';
import { THATCHGRIN_ID } from '../content/gourdlight_eve_scarecrow';
import { displacePlayerForDev } from '../dev/dev_displace';
import type { SimContext } from '../sim_context';
import { worldBossLockoutId } from '../world_boss';
import { clearThatchgrin, spawnThatchgrin } from './scarecrow';
import { resolveScarecrowField } from './scarecrow_field';
import { scarecrowEngaged, startCall, startKindledGourd } from './scarecrow_kit';
import { activeSeasonalEventOf } from './seasonal_state';

const USAGE = '[dev] Usage: /dev scarecrow [gourd|call|reset|lockout].';

export function handleScarecrowDevChat(ctx: SimContext, raw: string, pid: number): boolean {
  const m = /^\/dev\s+scarecrow(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return false;
  const verb = (m[1] ?? '').toLowerCase();
  const log = (text: string) => ctx.emit({ type: 'log', text, pid });
  const st = ctx.seasonal.scarecrow;
  const boss = st.bossId !== null ? ctx.entities.get(st.bossId) : undefined;
  if (verb === '' || verb === 'reset') {
    const field = resolveScarecrowField(ctx.cfg.seed);
    if (!field) {
      ctx.error(pid, '[dev] Old Thatchgrin has no field in this world.');
      return true;
    }
    if (activeSeasonalEventOf(ctx.seasonal) !== GOURDLIGHT_EVE_ID) {
      ctx.seasonal.devOverride = GOURDLIGHT_EVE_ID;
      log('[dev] Gourdlight Eve forced open for the scarecrow.');
    }
    if (verb === 'reset' || (boss && boss.dead)) clearThatchgrin(ctx, st);
    const live = st.bossId !== null ? ctx.entities.get(st.bossId) : undefined;
    const standing = live ?? spawnThatchgrin(ctx, st);
    st.respawnAt = 0;
    const me = ctx.entities.get(pid);
    if (me && standing) {
      // Twenty yards in front of him, so the whole body reads on arrival.
      const x = standing.pos.x + Math.sin(field.facing) * 20;
      const z = standing.pos.z + Math.cos(field.facing) * 20;
      displacePlayerForDev(ctx, me, x, z);
      me.facing = Math.atan2(standing.pos.x - x, standing.pos.z - z);
    }
    log(
      `[dev] Old Thatchgrin stands in his field at ${field.x.toFixed(1)}, ${field.z.toFixed(1)}.`,
    );
    return true;
  }
  if (verb === 'gourd' || verb === 'call') {
    if (
      !boss ||
      boss.dead ||
      boss.templateId !== THATCHGRIN_ID ||
      !scarecrowEngaged(boss) ||
      !st.kit
    ) {
      ctx.error(pid, '[dev] Pull Old Thatchgrin first.');
      return true;
    }
    if (st.kit.gourdWindup > 0 || st.kit.callWindup > 0) {
      ctx.error(pid, '[dev] He is already winding one up.');
      return true;
    }
    const ok = verb === 'gourd' ? startKindledGourd(ctx, boss, st) : startCall(ctx, boss, st);
    log(ok ? `[dev] Old Thatchgrin: ${verb} now.` : '[dev] Nothing to do that with.');
    return true;
  }
  if (verb === 'lockout') {
    const meta = ctx.players.get(pid);
    if (meta) {
      meta.raidLockouts.delete(worldBossLockoutId(THATCHGRIN_ID));
      meta.wireRev++;
    }
    log("[dev] Old Thatchgrin's daily spoils lockout forgotten.");
    return true;
  }
  ctx.error(pid, USAGE);
  return true;
}
