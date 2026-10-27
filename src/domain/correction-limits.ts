/** The seven bounded impact families plus the listing's single derived projection. */
export const correctionGroupLimit = 200;
export const correctionSnapshotLimit = 7 * correctionGroupLimit + 1;
/** Retain missing original items alongside current ones; the derived identity is shared. */
export const correctionImpactLimit = 2 * correctionSnapshotLimit - 1;
export const correctionKeyLimit = 80;
export const correctionKeysJsonLimit = correctionImpactLimit * (correctionKeyLimit + 3) + 2;
