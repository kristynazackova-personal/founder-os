/**
 * The kinds of AI generation, and roughly how long each one takes.
 *
 * Pure, and separate from the service that runs them, because the BUTTON has
 * to state the wait before anything starts - and a client component that
 * imported the job service would pull the database driver into the browser
 * bundle with it.
 *
 * The numbers are honest orders of magnitude, not measurements, and they are
 * rendered loosely on purpose: "about two minutes" is useful and survives
 * being wrong by thirty seconds, where "1m 50s" is precise and misleading.
 */
export type PmfJobKind = "doc" | "rewrite" | "prefill" | "table" | "rows" | "segmentations";

export const JOB_SECONDS: Record<PmfJobKind, number> = {
  doc: 120,
  rewrite: 90,
  prefill: 60,
  // Two calls in sequence: columns, then rows against them.
  table: 150,
  rows: 90,
  // Several complete alternatives, each argued for and against.
  segmentations: 180,
};

export const jobWait = (kind: PmfJobKind): string => {
  const s = JOB_SECONDS[kind];
  return s <= 75 ? "about a minute" : `about ${Math.round(s / 60)} minutes`;
};
