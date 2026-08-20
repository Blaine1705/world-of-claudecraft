# 20 mutation log: every marketplace real-SQL pin, red-on-strip

One row per distinct mutant (the LAST run is the verdict; earlier rounds that
a later pin superseded are listed in the history column). Harness protocol per
mutant: lane worktree clean, literal replace asserted to its occurrence count,
git diff proves the patch applied, vitest run on the owning suites with
TEST_DATABASE_URL, the Tests summary line proves assertions RAN, revert by
git checkout over the committed tree, byte-identical verification after.

Replacement policy (so a red is never a parameter-arity artifact): a stripped
qual that binds a parameter is replaced by a TYPED always-true over the same
parameter (`realm = $n` becomes `$n::text = $n::text`), never deleted; a
stripped TypeScript guard becomes `if (false)`; a dropped SET value keeps its
bind via NULLIF($n, $n); DDL mutants drop or loosen the named constraint.
SURVIVED entries are the judged defense-in-depth singles, each paired with a
listed double-strip mutant that BIT, or the deliberate no-op control.

Lane isolation rule (the collision class this round hit once, in a gate run):
every pg rig hard-codes its verify database name, so the SAME suite must
never run in two processes at once; a collision reds the victim without
running assertions, which a careless reader could score as a BIT. Run pg
suites one lane at a time per suite (the three scratch lanes partitioned by
suite, or strictly serialized), and treat a mid-run "database ... does not
exist" as the collision signature, never as a verdict.

| mutant | verdict | suites | history |
|---|---|---|---|
| SMOKE_claimCustodyRef_onconflict | BIT | woc_market_delivery_pg_integration | smoke |
| SMOKE_comment_only_control | SURVIVED | woc_market_delivery_pg_integration | smoke |
| abandonBid_account | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core > round4 |
| abandonBid_signed_immovable | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core |
| abandonBid_status | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core > round4 |
| abandon_exempt_buyer | BIT | woc_market_bond_pg_integration | batch3 > round4 > round5 |
| abandon_exempt_reason_set | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| abandon_exempt_signature | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| abandon_exempt_window | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| abandon_on_conflict | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| acceptedUnstamped_maxage_guard | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core |
| acceptedUnstamped_young_guard | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core |
| activate_listing_board_skip | BIT | woc_market_bond_pg_integration | round6 |
| activate_listing_closed_or_ended | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| activate_not_pending | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| activate_outbid_prior_active_only | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| activate_prelock_desc_flip | BIT | woc_market_directed_sql | round6 |
| activate_prelock_open_set | BIT | woc_market_directed_sql | batch3 > round4 > round5 |
| activate_supersede_refund_due | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| activate_superseded | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| activate_superseded_boundary | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| bid_cancel_pending | BIT | woc_market_bond_pg_integration | round2 |
| bid_directed_not_found | BIT | woc_market_bond_pg_integration | round2 |
| bid_ends_at_boundary | BIT | woc_market_bond_pg_integration | round2 |
| bid_ends_at_lapsed | BIT | woc_market_bond_pg_integration | round2 |
| bid_own_account | BIT | woc_market_bond_pg_integration | round2 |
| bid_pending_account_qual | BIT | woc_market_bond_pg_integration | round2 |
| bid_pending_listing_qual | BIT | woc_market_bond_pg_integration | round2 |
| bid_pending_status_qual | BIT | woc_market_bond_pg_integration | round2 |
| bid_status_active | BIT | woc_market_bond_pg_integration | round2 |
| bid_too_low | BIT | woc_market_bond_pg_integration | round2 |
| bid_too_low_boundary | BIT | woc_market_bond_pg_integration | round2 |
| bid_wallet_twin | BIT | woc_market_bond_pg_integration | round2 |
| bondSig_anchor_first_recording | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| bondSig_different_refuses | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| bondSig_reused_typed | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| bondSig_status_pending | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| bond_signature_value_dropped | BIT | woc_market_bond_pg_integration | round6 |
| bondsDue_states | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| browse_status_liveness | BIT | woc_market_realm_scope_pg_integration | round5 |
| cancelPending_lock_expired | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core > round4 |
| cancel_failed_expiry_state_guard | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cancel_has_bids | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cancel_intent_coalesce_first_stamp | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cancel_not_active | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cancel_not_yours | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cancel_open_settlement_live | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| cancel_paid_window_settlement_live | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| cap_account_qual | BIT | woc_market_bond_pg_integration | round5 |
| claimDeliverable_confirmed_only | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core |
| claimDue_ends_at | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core > round4 |
| claimDue_status_active | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core > round4 |
| claim_advisory_directed_gate | BIT | woc_market_bond_pg_integration | round5 |
| claim_cooldown_advisory_gate | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_cooldown_shortcut_lock_null | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_cooldown_tx_directed_exempt | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| claim_cooldown_tx_gate | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_diag_cancel_pending | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_diag_lock_held | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_diag_no_buy_now | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| claim_diag_not_active | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| claim_diag_own_account | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| claim_open_settlement_advisory | BIT | woc_market_directed_sql | batch3 > round4 > round6 |
| claim_open_settlement_double | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | round4 |
| claim_open_settlement_tx | SURVIVED | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| claim_record_abandon_directed_exempt | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_record_abandon_gate | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| claim_wallet_twin_double_strip | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 |
| claim_wallet_twin_locked_check | SURVIVED | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| claim_wallet_twin_not_exists | SURVIVED | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| claim_zero_rows_double | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | round4 |
| claim_zero_rows_own_listing | SURVIVED | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| clearBuyNowLock_holder_guard | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| clearStrikes_account | BIT | woc_market_directed_pg_integration | round5 |
| closeCancel_bids_skip | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| closeCancel_failed_expiry_state_guard | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| closeCancel_lock_unexpired_skip | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| closeCancel_open_skip | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| closeIfNoOpen_closed_check | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| closeIfNoOpen_open_check | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| closeListing_not_closed | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| confirmingBonds_signed_only | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core > round4 |
| confirmingOverdue_age | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core |
| cooldown_cap_offset | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| cooldown_cap_window | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| cooldown_latest_listing_scope | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| cooldown_latest_window | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| custody_booked_flip_onceway | BIT | woc_market_delivery_pg_integration | core > round4 |
| custody_grant_intent_unbooked_only | BIT | woc_market_delivery_pg_integration | core > round4 |
| custody_mail_intent_unbooked_only | BIT | woc_market_delivery_pg_integration | core > round4 |
| custody_mail_intent_withdraws_grant | BIT | woc_market_delivery_pg_integration | core > round4 |
| ddl_abandons_once_columns | BIT | woc_market_bond_pg_integration | batch3 > round4 |
| ddl_bid_bond_state_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_bond_reference_unique | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| ddl_custody_ref_pk | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| ddl_listing_format_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_listing_item_object_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_listing_status_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_offer_itemref_check_drop | BIT | woc_market_settlement_pg_integration | round6 |
| ddl_offer_status_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_open2_predicate | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| ddl_pair_index_predicate | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 |
| ddl_sales_item_check_drop | BIT | woc_market_settlement_pg_integration | round6 |
| ddl_sales_once_columns | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| ddl_settlement_state_check | BIT | woc_market_settlement_pg_integration | round5 |
| ddl_tx_signature_unique | BIT | woc_market_settlement_pg_integration | batch3 > round4 |
| deliveredPage_delivered_only | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core |
| deliveryTarget_fallback_account | BIT | woc_market_realm_scope_pg_integration | core > round4 |
| deliveryTarget_preferred_account | BIT | woc_market_realm_scope_pg_integration | core > round4 |
| dispose_resolution_sold | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core > round4 |
| dispose_sale_exists | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core |
| dispose_sale_not_excluded | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core > round4 |
| escrow_cap_boundary | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core |
| escrow_cap_not_closed | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| escrow_lease_fence | BIT | woc_market_delivery_pg_integration | core |
| escrow_stamp_listing_null | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| escrow_stamp_status_accepted | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| escrow_stamp_zero_rows_abort | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| expireDue_outer_status | BIT | woc_market_directed_sql | core > round4 > round5 |
| expireIfUnstamped_listing_null | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| fake_cap_clamp_strip | BIT | fake_woc_market_db | round5 |
| fake_offer_clone_strip | BIT | fake_woc_market_db | round5 |
| fake_sig_order_revert | BIT | fake_woc_market_db | round5 |
| fake_twin_guard_strip | BIT | fake_woc_market_db | round5 |
| finalize_close_cas | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| finalize_delivered_cas | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 > round4 |
| finalize_prelock_winner | BIT | woc_market_directed_sql | batch3 > round4 > round5 |
| finalize_resolution_keep | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 > round4 |
| finalize_sale_once_conflict | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| finalize_stale_zero | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 > round4 |
| finalize_teardown_carveout | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| finalize_winner_bond_held_only | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 > round4 |
| insertSettlement_23505_typed | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| insertSettlement_closed_double_strip | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| insertSettlement_lock_status_closed | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| insertSettlement_select_not_closed | SURVIVED | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| insertSettlement_winner_cas | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| insertSettlement_winner_gone | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| lapseBid_held_immovable | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| lapseBid_status | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| lapsePending_signed_immovable | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | core |
| lapse_placed_at_gate | BIT | woc_market_realm_scope_pg_integration | round5 |
| markBidStatus_from_set | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| markBondHeld_from_pending | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| markSettling_from_set | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| nextCascade_min_boundary | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| nextCascade_outbid_only | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| nextCascade_prior_winner_excluded | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| outbidQueue_active_only | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| outbidQueue_held_refund | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| overdue_deadline | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core |
| overdue_state_set | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core > round4 |
| quote_expired_boundary | BIT | woc_market_service | round6 > round6 |
| realm_1343_escrowInsertListing.capCount | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1401_escrowInsertListing.stamp | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1423_listingById | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1440_browseListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1505_opsListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1554_opsP2pTrades | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1600_listingsBySeller | BIT | woc_market_realm_scope_pg_integration | realm > round6 |
| realm_1624_countActiveBySeller | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1685_directedOfferById | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1724_consumeStepUpChallenge | BIT | woc_market_stepup_pg_integration | realm |
| realm_1744_pruneStepUpChallenges | BIT | woc_market_stepup_pg_integration | realm |
| realm_1779_directedOffersForAccount | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1828_resolveDirectedOffer | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1843_characterByName | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1873_acceptDirectedOfferSide | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1905_reopenDirectedOffer.outer | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1908_reopenDirectedOffer.notExists | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1939_expireDueDirectedOffers | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1968_acceptedUnstampedOffers | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_1985_expireDirectedOfferIfUnstamped | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2009_directedOffersForBuyer | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2052_cancelListingIfUnbid | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2184_suspendListingIfSafe | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2279_claimDueListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2380_undisposedClosedListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2397_strandedListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2595_stuck.claims | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2605_stuck.delivering | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2615_stuck.undisposed | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2629_stuck.review | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2646_stuck.bonds | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2832_claimBuyNowLock.capProbe | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_2869_2914_combined | BIT | woc_market_realm_scope_pg_integration | round2 |
| realm_2869_claimBuyNowLock.peek | BIT | woc_market_realm_scope_pg_integration | realm > round2 |
| realm_2914_claimBuyNowLock.locked | SURVIVED | woc_market_realm_scope_pg_integration | realm > round2 |
| realm_3065_cancelPendingListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3103_closeCancelPendingListing | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3202_insertPendingBid | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3304_extendAuctionForBondProgress | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3383_confirmingBonds | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3473_abandonPendingBid | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3602_lapsePendingBids | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3632_bidsByAccount | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3707_bondsDue | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3846_settlementsByAccount | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3933_confirmingSettlements | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3946_claimDeliverableSettlements | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3964_deliveringSettlements | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_3998_deliveredUnclosedSettlementsPage | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_4045_disposeSoldResidueListings | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_4248_overdueSettlements | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_4269_confirmingOverdueSettlements | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_4307_salesForItem | BIT | woc_market_realm_scope_pg_integration | realm > round2 |
| realm_4393_deliveryTarget.preferred | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_4401_deliveryTarget.fallback | BIT | woc_market_realm_scope_pg_integration | realm |
| realm_754_ddl.pairRepair.realmJoin | BIT | woc_market_directed_pg_integration, woc_market_realm_scope_pg_integration | realm > round2 |
| realm_770_ddl.pairIndex.realmColumn | BIT | woc_market_realm_scope_pg_integration, woc_market_directed_pg_integration | realm |
| reopenListing_failed_arm | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| reopenListing_from_states | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| reopenListing_not_exists | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| reopen_listing_id_null | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| reopen_not_exists_pair | SURVIVED | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| reopen_notexists_plus_catch | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | round4 |
| reopen_status_accepted | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | core > round4 |
| salesForItem_excluded | BIT | woc_market_realm_scope_pg_integration | round5 |
| saveDelivered_booked_null | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| saveDelivered_claim_missing | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| saveDelivered_lease_fence | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | batch3 |
| setBidBondQuote_signed_immovable | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| setBidBondQuote_status | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 > round4 |
| setBondState_from_set | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| setSaleExcluded_conflict_typed | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| settle_quote_offered_only | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core |
| settle_signature_offered_only | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core > round4 |
| settle_signature_reused_typed | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core > batch3 > round4 |
| settle_signature_value_dropped | BIT | woc_market_settlement_pg_integration | round6 |
| settle_transition_23505_false | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core |
| settle_transition_cas | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | core |
| stepup_consume_account | BIT | woc_market_stepup_pg_integration | core |
| stepup_prune_expiry | BIT | woc_market_stepup_pg_integration | core |
| stranded_age_bound | BIT | woc_market_realm_scope_pg_integration | round5 |
| strikes_greatest | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| strikes_increment | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| stuck_review_state | BIT | woc_market_realm_scope_pg_integration | round5 |
| suspend_buy_now_pending | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| suspend_closed_not_active | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| suspend_expired_won_teardown_only | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| suspend_held_refund_due | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| suspend_open_settlement_live | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 > round4 |
| suspend_prelock_won | BIT | woc_market_directed_sql | batch3 > round4 > round5 |
| suspend_quoted_offered_refuses | BIT | woc_market_settlement_pg_integration, woc_market_delivery_pg_integration | batch3 |
| suspend_teardown_carveout | BIT | woc_market_bond_pg_integration, woc_market_directed_pg_integration | batch3 |
| terms_first_acceptance_durable | BIT | woc_market_directed_pg_integration, woc_market_bond_pg_integration | batch3 > round4 |
| undisposed_item_disposed_false | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core > round4 |
| undisposed_not_sold | BIT | woc_market_delivery_pg_integration, woc_market_settlement_pg_integration | core > round4 |

Totals: 248 distinct mutants, 240 BIT, 8 SURVIVED (1 no-op control + 7 judged twins, each double-strip proven).

## 20 QA round appendix (independent mutants, run by the QA session)

Same harness protocol and replacement policy as above; run in the scratch
lanes wocc-marketplace-mut1/2/3 over the committed QA-round tips (7b8083abe9,
then c270f43dda and d9293f61f3 for the rows their fixes enabled), partitioned
so no two lanes ran the same suite concurrently. The QA session first
independently re-verified five existing rows with its own strips (bid_own_account,
SMOKE_claimCustodyRef_onconflict via an ON CONFLICT DO UPDATE shape,
settle_transition_cas, realm_1600_listingsBySeller, quote_expired_boundary;
all five BIT), then ran the rows below for the predicates the audit lanes
found unlogged or unpinned. Two rows needed an in-round fix before their
mutant bit, and the green control needed the same fix wave before reaching
its expected green; each says so in the history column. qa20_cap_bump_control is a
deliberate GREEN control: it raises WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR to 4
and expects the bond suite to stay green, proving the at-cap fixtures derive
from the constant (its FIRST run failed three fixtures that hard-coded the
cap; they now derive, and the re-run is green).

| mutant | verdict | suites | history |
|---|---|---|---|
| qa20_offersForAccount_participant | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_bidsByAccount_account | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_settlementsByAccount_buyer | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_offersForBuyer_addressee | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_offersForBuyer_not_closed | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_expireDue_inner_due_bound | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_expireDue_inner_status | SURVIVED | woc_market_realm_scope_pg_integration | qa20; masked by the floor-pinned outer status qual, judged single |
| qa20_expireDue_status_double_strip | BIT | woc_market_realm_scope_pg_integration | qa20; the double-strip proof for the row above |
| qa20_undisposed_status_closed | BIT | woc_market_realm_scope_pg_integration | qa20 |
| qa20_lapse_inner_status | BIT | woc_market_realm_scope_pg_integration, woc_market_bond_pg_integration | qa20; survived until d9293f61f3 seeded the aged resolved bid |
| qa20_confirmingBonds_status | BIT | woc_market_bond_pg_integration | qa20 |
| qa20_extend_status_guard | BIT | woc_market_bond_pg_integration | qa20 |
| qa20_twin_steal_record_order | BIT | woc_market_bond_pg_integration | qa20 |
| qa20_anti_enum_directed_rerun | BIT | woc_market_bond_pg_integration | qa20; the directed-arm strip now also reds the verdict-order arm |
| qa20_cap_bump_control | GREEN CONTROL | woc_market_bond_pg_integration | qa20; red on three hard-coded fixtures first, green after c270f43dda derives them |
| qa20_cap_bump_plus_account_strip | BIT | woc_market_bond_pg_integration | qa20; the raised-cap account-qual strip still reds |
| qa20_ddl_stepup_nonce_pk | BIT | woc_market_stepup_pg_integration | qa20 |
| qa20_ddl_stepup_operation_check | BIT | woc_market_stepup_pg_integration | qa20 |
| qa20_ddl_stepup_fk_cascade | BIT | woc_market_stepup_pg_integration | qa20 |
| qa20_ddl_bond_signature_unique_drop | BIT | woc_market_bond_pg_integration | qa20 |
| qa20_dispose_already_disposed | BIT | woc_market_delivery_pg_integration | qa20 |
| qa20_ddl_listing_resolution_check | BIT | woc_market_settlement_pg_integration | qa20 |
| qa20_ddl_bid_status_check | BIT | woc_market_settlement_pg_integration | qa20 |
| qa20_liveSettlement_states | BIT | woc_market_settlement_pg_integration | qa20 |
| qa20_insertOffer_23505_belt | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_resolveOffer_status_cas | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_acceptOffer_status_cas | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_everSettled_listing_qual | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_reopen_seller_reset_dropped | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_reopen_itemref_reset_dropped | BIT | woc_market_directed_pg_integration | qa20 |
| qa20_svcquote_not_yours | BIT | woc_market_service | qa20 |
| qa20_quote_revival_order | BIT | woc_market_service | qa20 |
| qa20_suspend_prelock_desc | BIT | woc_market_directed_sql | qa20 |
| qa20_readout_clamp_strip | BIT | woc_market_directed_sql | qa20 |
| qa20_sweep_lock_realm | BIT | woc_market_sweep | qa20 |
| qa20_prune_closed_pair_strip | BIT | woc_market_directed_sql | qa20 |
| qa20_prune_booked_flag_strip | BIT | woc_market_directed_sql | qa20 |
| qa20_prune_abandons_age_strip | BIT | woc_market_directed_sql | qa20; survived until c270f43dda pinned the cutoff text |
| qa20_prune_resolved_status_strip | BIT | woc_market_directed_sql | qa20 |
| qa20_fake_stuckbonds_order_revert | BIT | fake_woc_market_db | qa20 |
| qa20_fake_accept_clone_strip | BIT | fake_woc_market_db | qa20 |
| qa20_fake_account_clone_strip | BIT | fake_woc_market_db | qa20 |
| qa20_fake_twin_record_order | BIT | fake_woc_market_db | qa20 |
| qa20_fake_escrow_hook_order | BIT | fake_woc_market_db | qa20 |
| qa20_rules_list_second_member | BIT | woc_market_rules | qa20 |

Appendix totals: 45 distinct mutants, 43 BIT, 1 judged defense-in-depth
single (double-strip proven), 1 deliberate green control; plus 5 independent
re-verifications of existing rows, all BIT. Whole log after this round: 293
distinct mutants.

## Escrow write-path rider section (run by the rider implement session)

Same protocol as the header: every strip occurrence-asserted (region-scoped
where a literal repeats), git-diff-proven, run-proven by the Tests summary
line, reverted by git checkout over the committed tree with a clean-status
verify after. One serial lane in the rider worktree (no concurrent pg runs;
the two pg mutants ran alone with TEST_DATABASE_URL). Replacement policy per
the header; suites named per row are the OWNING suites the verdict was
scored against.

| mutant | verdict | suites | history |
|---|---|---|---|
| rider_gate_cap_check | BIT | woc_market_escrow_gate | rider |
| rider_gate_release_shift | BIT | woc_market_escrow_gate, woc_market_escrow_queue | rider |
| rider_gate_reclaim_strip | BIT | woc_market_escrow_gate | rider |
| rider_custody_realm_gate_strip | BIT | woc_market_escrow_queue | rider |
| rider_custody_settled_emit_strip | BIT | woc_market_escrow_queue | rider |
| rider_grant_busy_emit_strip | BIT | woc_market_escrow_queue | rider |
| rider_grant_account_guard_strip | BIT | woc_market_escrow_queue | rider |
| rider_grant_nonce_guard_strip | BIT | woc_market_escrow_queue | rider |
| rider_grant_started_truth_strip | BIT | woc_market_escrow_queue | rider |
| rider_busy_budget_strip | BIT | woc_market_service | rider |
| rider_busy_verdict_strip | BIT | woc_market_service | rider |
| rider_park_cap_strip | BIT | woc_market_local_ledgers | rider |
| rider_stamp_total_strip | BIT | woc_market_delivery | rider |
| rider_drain_rung_strip | BIT | woc_market_service | rider |
| rider_saturated_rung_strip | BIT | woc_market_service | rider |
| rider_recorder_contended_strip | BIT | woc_market_directed_sql | rider |
| rider_clear_retry_strip | BIT | woc_market_directed_sql | rider |
| rider_merged_set_strip | BIT | woc_market_directed_sql | rider |
| rider_widening_strip_cancel | BIT | woc_market_directed_sql | rider |
| rider_routing_revert_touch | BIT | woc_market_directed_sql | rider |
| rider_narrowing_revert_bid | BIT | woc_market_directed_sql | rider |
| rider_deadlock_count_strip | BIT | woc_market_directed_sql | rider |
| rider_checkout_count_strip | BIT | woc_market_directed_sql | rider |
| rider_serialize_total_strip | BIT | woc_market_escrow_queue | rider |
| rider_highwater_count_strip | BIT | woc_market_delivery | rider |
| rider_comment_only_control | SURVIVED | woc_market_directed_sql | rider; deliberate no-op control |
| rider_pg_narrowing_negative_escrow | BIT | woc_market_delivery_pg_integration, woc_market_directed_sql | rider; SURVIVED its first scoring against the bond suite alone (that suite's freed-insert proof holds its own raw-client lock, so it cannot see the source's mode), upgraded by the KEY-SHARE-holder behavioral pin in b54a6e5b45 and re-scored against the owning suites |
| rider_pg_plain_bound_strip | BIT | woc_market_bond_pg_integration | rider |

Fix-round re-verifications (the stale-verdict rule: any mutant whose source
or pinning test was edited after its verdict re-runs before the log is
trusted), plus the two mutants the fix round's own code earned:

| mutant | verdict | suites | history |
|---|---|---|---|
| rider_park_cap_strip | BIT | woc_market_local_ledgers | rider; RE-RUN after the counted-refusal edit to the pinning test |
| rider_gate_cap_check | BIT | woc_market_escrow_gate | rider; RE-RUN after the probe rewrite |
| rider_gate_release_shift | BIT | woc_market_escrow_gate, woc_market_escrow_queue | rider; RE-RUN after the probe rewrite |
| rider_gate_reclaim_strip | BIT | woc_market_escrow_gate | rider; RE-RUN after the probe rewrite |
| rider_gate_probe_reclaim_strip | BIT | woc_market_escrow_gate | rider fix round; the saturated() probe's own reclaim (a bare stats read makes a full wedge permanent) |
| rider_accept_rungs_strip | BIT | woc_market_service | rider fix round; the directed acceptance's pre-burn saturation rung |

The qa-checklist round rewrote the gate onto identity-tokened holds and
added the pre-check refusal counting, superseding the five gate-region
mutants above (their regions no longer exist in that form) and earning two
new arms; all re-run against the rewritten source per the stale-verdict
rule:

| mutant | verdict | suites | history |
|---|---|---|---|
| rider_gate_cap_check_v2 | BIT | woc_market_escrow_gate | qa-checklist round; supersedes rider_gate_cap_check |
| rider_gate_release_delete_v2 | BIT | woc_market_escrow_gate, woc_market_escrow_queue | qa-checklist round; supersedes rider_gate_release_shift |
| rider_gate_reclaim_strip_v2 | BIT | woc_market_escrow_gate | qa-checklist round; supersedes rider_gate_reclaim_strip |
| rider_gate_probe_count_strip | BIT | woc_market_escrow_gate | qa-checklist round; the probe's refused counting (S2's gate half) |
| rider_gate_probe_reclaim_strip_v2 | BIT | woc_market_escrow_gate | qa-checklist round; supersedes rider_gate_probe_reclaim_strip |
| rider_custody_gatehold_strip_v2 | BIT | woc_market_escrow_queue | qa-checklist round; supersedes rider_custody_realm_gate_strip (the hold-handle form) |
| rider_wiring_emit_strip | BIT | woc_market_hot_reads | qa-checklist round; the pre-check's realm_refused emission (S2's wiring half) |

Rider totals: 32 distinct LIVE mutants (the five superseded gate rows
retire with their regions), 30 BIT, 1 deliberate green control, 1
first-scoring survivor upgraded to BIT in-round; every stale verdict
re-run after its source or pin moved. Whole log after this section: 325
distinct mutants.

## Escrow write-path rider QA section (run by the rider QA session)

Same protocol as the header, with two additions this round: every strip ran
in a THROWAWAY `git worktree` at the audited tip (so no mutation could touch
the tree the reviewer agents were reading, and no uncommitted work was ever
at risk from the `git checkout` revert), and no pg suite was involved, so
nothing could collide on the fixed database names.

INDEPENDENT SPOT-CHECKS of the rider's EXISTING pins, with the QA's own strip
designs rather than the logged ones (the 20 independent-spot-check protocol).
Where a logged row picked one site, this round deliberately picked a
different one, so a pin that only covers the logged site would surface.

| mutant | verdict | suites | history |
|---|---|---|---|
| qa_narrowing_revert_accounts | BIT | woc_market_directed_sql | rider QA; the escrow ACCOUNTS clause, where the logged row used a bid clause |
| qa_routing_revert_clearlock | BIT | woc_market_directed_sql | rider QA; clearBuyNowLock leaves the bounded seam |
| qa_gate_cap_offbyone | BIT | woc_market_escrow_gate | rider QA; tryAcquire ONLY (the literal repeats in saturated(), caught by the occurrence assert and region-scoped) |
| qa_grant_account_guard_strip | BIT | woc_market_escrow_queue | rider QA; the ACCOUNT guard re-validated under the FIFO slot |
| qa_park_cap_offbyone | BIT | woc_market_local_ledgers | rider QA |
| qa_busy_budget_widen | BIT | woc_market_service | rider QA; the locked segment's bound widened to 99 |

PINS THIS ROUND ADDED, each given the strip it exists to catch (a new pin
that cannot fail is theatre):

| mutant | verdict | suites | history |
|---|---|---|---|
| qa_help_string_drop_kind | BIT | game_metrics | rider QA; the HELP line loses a kind while the vocabulary pin stays green |
| qa_gate_gauge_frozen_sample | BIT | game_metrics | rider QA; the gate gauge sampled once instead of read live |
| qa_routing_hoisted_sql_writer | BIT | woc_market_directed_sql | rider QA; a `this.pool.query(IDENTIFIER)` writer, invisible to the leading-verb classifier before the totality assert |
| qa_grant_stamp_unarmed | BIT | woc_market_delivery | rider QA; the pendingGrants stamp stops arming the high-water watcher |
| qa_park_stat_leaves_guard | BIT | woc_market_delivery | rider QA; the standing-park stat moves out of its refusal guard |
| qa_gate_before_depth_cap | BIT | woc_market_escrow_queue | rider QA; the order swap that leaks a realm slot until the reclaim |
| qa_sibling_lock_unscanned_file | BIT | woc_market_directed_sql | rider QA; a lock clause planted in woc_market_stepup.ts, a sibling the OLD hand-kept five-file list never scanned |
| qa_hold_ceiling_widened | BIT | tunables | rider QA; 300_000 to 400_000, caught by the new upper bound |
| qa_accept_drain_rung_strip | BIT | woc_market_service | rider QA; the directed acceptance's OUTER drain rung, which had no coverage at all before this round |
| qa_create_drain_rung_sunk | BIT | woc_market_service | rider QA; createListing's drain rung sunk below the pooled health reads (region-scoped: the flat literal appears at BOTH entries, and the occurrence assert correctly refused the unscoped form) |

Rider QA totals: 16 distinct mutants, 16 BIT, 0 survivors, 0 controls. Whole
log after this section: 341 distinct mutants.
