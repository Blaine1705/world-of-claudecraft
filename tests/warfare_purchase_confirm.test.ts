// The Warfare shop's purchase confirmation, pinned as a STRUCTURE rather than a
// comment.
//
// Honor purchases record no buyback, so a mis-tap is unrefundable, and the gear is
// expensive. `Hud.requestWarfarePurchase` therefore fires the buy command ONLY from
// the confirm dialog's accept callback. That invariant was carried by a source
// comment ("the buy command fires ONLY from the confirm callback") and by nothing
// else: moving `this.sim.buyItem(...)` one line up, out of the callback and into the
// method body, would spend a player's honor with no prompt and break no test.
//
// It matters more now that the generic goods row is suppressed at a Warfare vendor
// (quest_dialog_controller): the sectioned shop is the ONLY purchase route at those
// two NPCs, so this one gate carries all of it.
//
// Read as a call walk rather than a grep, using the same helper the HUD cadence
// registry uses. The helper's contract is the assertion: a call inside a callback is
// NOT a direct evaluation of the enclosing method, so `buyItem` appearing in the
// direct-call list is exactly the regression this guards.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEMS, NPCS } from '../src/sim/data';
import { readMethodCallSites } from './helpers/method_call_sites';

const HUD_PATH = new URL('../src/ui/hud.ts', import.meta.url);
const HUD_SRC = readFileSync(HUD_PATH, 'utf8');

function scan(method: string) {
  return readMethodCallSites('src/ui/hud.ts', HUD_SRC, 'Hud', method);
}

describe('Warfare purchases are gated behind the confirm dialog', () => {
  it('routes the buy through confirmDialog and never calls buyItem directly', () => {
    const { sites } = scan('requestWarfarePurchase');
    const calls = sites.map((s) => s.call);

    // The dialog IS evaluated by the method.
    expect(calls, 'requestWarfarePurchase must open the confirm dialog').toContain(
      'this.confirmDialog',
    );

    // The purchase is NOT. It lives in the accept callback, which the walk
    // deliberately does not count as a direct evaluation. If someone hoists it out of
    // the callback, it appears here and this fails.
    expect(
      calls.filter((c) => c.includes('buyItem')),
      'buyItem must fire only from the confirm callback, never directly',
    ).toEqual([]);
  });

  it('still contains the buy call somewhere, so the gate cannot pass by deletion', () => {
    // Guards the guard: an empty method would satisfy the assertion above. The buy has
    // to exist in the source, just not as a direct evaluation.
    const body = HUD_SRC.slice(HUD_SRC.indexOf('private requestWarfarePurchase'));
    const method = body.slice(0, body.indexOf('\n  }\n') + 4);
    expect(method).toContain('buyItem');
    expect(method).toContain('confirmDialog');
  });

  it('holds the same shape for the Heroic Marks shop, the other unrefundable currency', () => {
    // Marks purchases record no buyback either, and the Warfare dialog borrows this
    // one's title and buttons. Pinning both stops a future refactor from unpicking the
    // sibling while this file watches only one of them.
    const calls = scan('requestHeroicVendorPurchase').sites.map((s) => s.call);
    expect(calls).toContain('this.confirmDialog');
    expect(calls.filter((c) => c.includes('buyItem'))).toEqual([]);
  });

  it('leaves no honor-priced stock reachable through the UNCONFIRMED ordinary window', () => {
    // The completeness half, and the reason the goods-row suppression is a
    // safety fix rather than only a tidiness one. The ordinary vendor window
    // renders an honor price for its rows (vendor_view.ts) and its onBuy calls
    // sim.buyItem straight through with NO confirm, so while a WARFARE
    // quartermaster still offered a generic goods row, a player could spend
    // tens of thousands of honor on a set piece in one click, out of the very
    // same stock the sectioned window guards.
    //
    // The window-level guards above say the WARFARE and Marks shops confirm.
    // Only this says nothing ELSE sells honor gear, which is what makes "an
    // expensive purchase always confirms" true rather than merely local. If a
    // future NPC gains honor-priced stock, it must either carry warfareVendor
    // (routing to the sectioned window) or grow its own confirm, and this fails
    // until one of those happens.
    const honorSellers = Object.values(NPCS)
      .filter((npc) => (npc.vendorItems ?? []).some((id) => (ITEMS[id]?.priceHonor ?? 0) > 0))
      .map((npc) => npc.id)
      .sort();

    // Not vacuous: the two shipped quartermasters really do stock honor gear,
    // so an empty sweep would mean the price field moved, not that the rule holds.
    expect(honorSellers).toEqual(['fury', 'warmarshal_draven_kole']);
    for (const id of honorSellers) {
      expect(NPCS[id].warfareVendor, `${id} sells honor gear without the shop flag`).toBe(true);
    }
  });
});
