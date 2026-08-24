// #3561: shared failed-write recovery for the incremental mail partition
// save. Both the periodic autosave (GameServer.saveMail) and the leave-flush
// escrow transaction (GameServer.leave, saveCharacterAndMarketState) drain
// dirty mail partitions (Sim.takeDirtyMailPartitions) before attempting to
// persist them. Unlike the whole-book design this replaces, where every
// cycle re-serialized everything regardless of what changed, a drained
// partition whose write then fails is GONE from the dirty set: nothing else
// re-dirties a mailbox nobody touches again, so a failed write must put the
// drained keys back or they are silently never retried.
export interface MailPartitionRearmSim {
  markMailPartitionsDirty(recipientKeys: readonly string[]): void;
}

export function rearmMailPartitionsOnFailure(
  sim: MailPartitionRearmSim,
  partitions: readonly { recipientKey: string }[],
): void {
  if (partitions.length > 0) sim.markMailPartitionsDirty(partitions.map((p) => p.recipientKey));
}
