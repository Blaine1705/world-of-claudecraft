# Membership referral armour

A new account registering through a player-card referral link receives the
Friendship armour entitlement if the inviter has verified active membership at
registration. The existing first referral wins. Legacy referrals are not
retroactively eligible; their historical membership state is unknown.

Every character on the referred account can claim the seven soulbound pieces.
Initial admission grants missing pieces automatically, overflowing full bags.
Bank > Account > Claim friendship armour is a manual recovery action for missing
pieces; it does not grant shared-bank access to non-members. The location reuses
the membership claim panel and can move independently of the reward. Claims never
duplicate pieces already in equipment, bags (including overflow), bank or courier
custody.

The set uses the membership armour class/specialization budget, scales with the
wearer's level, and is always Rare with item level equal to character level plus
five. The friend does not
need a membership. Stats remain available when the inviter's membership expires
or the players leave their party. Existing account-deletion cascades still remove
the referral relationship; this grant is not retained after inviter deletion.

Wearing all seven Friendship pieces grants 20% additional experience only while
the specific inviter's account has a character in the same party or raid with
active membership. Any character on that account qualifies. There is no extra
distance or alive-state requirement. The existing linkdead grace period retains
party membership. Leaving the party, removing a piece, or membership expiry stops
the bonus. Membership and Friendship set XP bonuses do not stack.

Tooltips name the inviting character recorded at signup. Renames do not change
the account-based check. Inviter and recipient account IDs are host-only; the
wire carries only the bounded display name. Saved items or forged character
fields cannot establish entitlement.

## Storage and execution

`referral_armour_db.ts` adds two defaulted columns to the existing account-bounded
referral row. First-insert conflict handling preserves attribution, eligibility
and display name. Both registration dispatch paths await best-effort capture
before returning credentials. Failed capture still allows registration under
the existing referral failure policy; no unverified eligibility is granted.

Fresh admission performs one referee-primary-key read before acquiring the
character lease. Resume, XP awards, party changes, saves and ticks add no SQL.
XP checks read seven slots and at most nine other party members, never the realm
roster. The display name uses existing cached identity serialization.

Seven distinct project-generated icons ship at 128px WebP. Exact prompts,
processing, original/master/shipping hashes and visual review evidence live in
`docs/achievements/referral-items-2026-10-07/accepted-art.json`.
