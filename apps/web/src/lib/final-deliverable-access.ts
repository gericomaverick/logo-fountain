const CLIENT_FINAL_STATES = new Set(["FINAL_FILES_READY", "DELIVERED"]);

type FinalDeliverableAccessArgs = {
  persistedStatus: string;
  hasApprovedConcept: boolean;
  hasFinalAsset: boolean;
};

export function buildFinalDeliverableSnapshot(args: FinalDeliverableAccessArgs) {
  const available = Boolean(
    args.hasFinalAsset
    && args.hasApprovedConcept
    && CLIENT_FINAL_STATES.has(args.persistedStatus),
  );

  // Signed URLs are deliberately issued only by the guarded finals endpoint.
  return { available, url: null as string | null };
}
