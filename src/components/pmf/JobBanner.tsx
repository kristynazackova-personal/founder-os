"use client";

/**
 * What the founder reads while a generation runs, and after it finishes.
 *
 * The line about closing the page is the important one. It is true - the work
 * is detached and its result is a saved version - and without it the honest
 * assumption is that a spinner has to be watched.
 */
import type { JobState } from "@/app/actions/pmf";
import type { PmfJob } from "@/lib/services/pmfJobs";

export function JobBanner({ state, job }: { state: JobState; job: PmfJob | null }) {
  if (state?.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (!state?.jobId) return null;

  if (!job || job.status === "running") {
    return (
      <p className="text-sm text-[var(--muted)]">
        Working on it, {state.waiting ?? "a few minutes"}. You can close this page or carry on elsewhere - it keeps
        running and the result is saved when it lands.
      </p>
    );
  }
  if (job.status === "error") return <p className="text-sm text-red-700">{job.message ?? "That generation failed."}</p>;
  return <p className="text-sm text-emerald-700">{job.message ?? "Done."}</p>;
}

/** "about 2 minutes", for a button's own label. */
export const waitHint = (state: JobState, fallback: string): string => state?.waiting ?? fallback;
