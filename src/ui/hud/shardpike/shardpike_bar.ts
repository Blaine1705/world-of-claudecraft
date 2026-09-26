// The Shardpike bar's composition seam: one factory the HUD holds and paints.
//
// Mirrors createDoomMeter: the coordinator should know that a bar exists and when to
// paint it, and nothing else. Element lookup, the verb dispatch, and turning world state
// into the bar's state all live here, so the trial's whole input surface is one directory.

import { keyLabel } from '../../../game/keybinds';
import { lanceLeanIntent } from '../../../game/lance_lean_intent';
import type { IWorld } from '../../../world_api';
import type { PainterHostWriters } from '../../painter_host';
import { type ShardpikeBarDeps, ShardpikeBarPainter } from './shardpike_bar_painter';
import { shardpikeBarState } from './shardpike_bar_view';
import { shardpikeLeanKeys } from './shardpike_lean_view';
import { ShardpikePromptPainter } from './shardpike_prompt_painter';
import { shardpikePromptState } from './shardpike_prompt_view';

export interface ShardpikeBar {
  /** Paint one frame. `dead` comes from the caller's already-resolved self entity. */
  paint(dead: boolean): void;
  hide(): void;
}

/**
 * Build the bar over an existing `#shardpike-bar` element.
 *
 * Returns a no-op bar when the element is absent rather than throwing: `index.html` and
 * `play.html` both carry it, but the HUD is also constructed in test and editor hosts that
 * mount a narrower document, and a missing quest-tool bar must never take the HUD down.
 */
export function createShardpikeBar(
  doc: Document,
  writers: PainterHostWriters,
  /**
   * Resolved per call, not captured: the HUD builds its painters as field initializers,
   * which run before its own `sim` field is assigned, so taking the world eagerly here is
   * a use-before-initialization error rather than a style preference.
   */
  world: () => IWorld,
  /** The HUD capabilities the buttons need; see ShardpikeBarDeps. */
  deps: ShardpikeBarDeps = {},
): ShardpikeBar {
  const root = doc.getElementById('shardpike-bar');
  if (!root) return { paint: () => {}, hide: () => {} };
  // The prompt is a SEPARATE element because it belongs somewhere else on screen: the bar
  // sits with the action bars where the hands are, and the instruction sits up near the
  // middle where the eyes already are during a fight. A missing element is a no-op painter
  // for the same reason the bar's is: narrower test and editor documents must not break.
  const promptRoot = doc.getElementById('shardpike-prompt');
  const prompt = promptRoot ? new ShardpikePromptPainter(writers, promptRoot) : null;
  const painter = new ShardpikeBarPainter(
    writers,
    root,
    (action) => {
      const w = world();
      if (action === 'brace') w.lanceBrace();
      else if (action === 'thrust') w.lanceThrust();
      else w.lanceRelease();
    },
    deps,
    // The keycaps above the beam hold the lean the same way the keys do: into the client's
    // movement intent, which folds it into the streamed strafe bits (lance_lean_intent.ts).
    (hold) => {
      lanceLeanIntent.hold = hold;
    },
  );
  return {
    paint(dead: boolean): void {
      const w = world();
      const mainhandItemId = w.equipment.mainhand;
      const trial = w.lanceTrial;
      const restRemaining = w.lanceRestRemaining;
      const leanKeys = shardpikeLeanKeys(deps.keybinds?.(), keyLabel);
      const bar = shardpikeBarState({ mainhandItemId, trial, restRemaining, dead, leanKeys });
      // Every frame the bar paints, the movement intent learns whether a pike is couched:
      // that is the one switch that turns the left/right keys into the balance stick.
      lanceLeanIntent.braced = bar.bracing && !dead;
      painter.paint(bar);
      prompt?.paint(
        shardpikePromptState({
          mainhandItemId,
          trial,
          guidance: w.lanceGuidance,
          restRemaining,
          dead,
          leanKeys,
        }),
      );
    },
    hide(): void {
      lanceLeanIntent.braced = false;
      painter.hide();
      prompt?.hide();
    },
  };
}
